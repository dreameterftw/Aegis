/**
 * firestore.js — Firestore REST API client for Cloudflare Workers
 *
 * Replaces firebase-admin (Node.js only) with direct REST calls.
 * Auth uses a service account JWT signed with the RS256 private key.
 */

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

// ── JWT / OAuth helpers ───────────────────────────────────────────────────────

/**
 * Sign a JWT using RS256 via the WebCrypto API (available in Workers).
 */
async function signJwt(header, payload, privateKeyPem) {
  const encode = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Strip PEM armor and decode
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${sigB64}`;
}

/**
 * Exchange a service-account JWT for a short-lived OAuth2 access token.
 * Tokens are cached per request context (module-level cache lasts for the Worker instance lifetime).
 */
let _tokenCache = null;

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);

  if (_tokenCache && _tokenCache.expiresAt > now + 60) {
    return _tokenCache.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const jwt = await signJwt(header, payload, serviceAccount.private_key);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get access token: ${await res.text()}`);
  }

  const data = await res.json();
  _tokenCache = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

// ── Firestore value converters ────────────────────────────────────────────────

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') return { mapValue: { fields: toFirestoreFields(val) } };
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFirestoreValue(v)]));
}

function fromFirestoreValue(val) {
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in val) return fromFirestoreFields(val.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFirestoreValue(v)]));
}

// ── Public db interface ───────────────────────────────────────────────────────

/**
 * Returns a db object that mirrors the firebase-admin Firestore interface
 * used across cache.js (collection/doc/get/set/runTransaction).
 */
export function getDb(env) {
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id;
  const base = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents`;

  async function authHeader() {
    const token = await getAccessToken(serviceAccount);
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  function docRef(collectionPath, docId) {
    const path = `${base}/${collectionPath}/${encodeURIComponent(docId)}`;

    return {
      path,
      async get() {
        const res = await fetch(path, { headers: await authHeader() });
        if (res.status === 404) return { exists: false, data: () => null };
        if (!res.ok) throw new Error(`Firestore GET error ${res.status}: ${await res.text()}`);
        const doc = await res.json();
        return {
          exists: true,
          data: () => fromFirestoreFields(doc.fields || {}),
        };
      },
      async set(data, options = {}) {
        const fields = toFirestoreFields(data);
        const url = options.merge
          ? `${path}?updateMask.fieldPaths=${Object.keys(fields).join('&updateMask.fieldPaths=')}`
          : path;
        const method = options.merge ? 'PATCH' : 'PATCH';
        const res = await fetch(url, {
          method,
          headers: await authHeader(),
          body: JSON.stringify({ fields }),
        });
        if (!res.ok) throw new Error(`Firestore SET error ${res.status}: ${await res.text()}`);
      },
    };
  }

  return {
    collection(name) {
      return {
        doc(id) {
          return docRef(name, id);
        },
      };
    },

    /**
     * Simple transaction — for the increment pattern in cache.js.
     * REST doesn't have native transactions but we implement optimistic
     * read-then-write which is sufficient for the report-count use case.
     */
    async runTransaction(fn) {
      // Provide a transaction object that wraps get/set
      const ops = [];
      const t = {
        get: (ref) => ref.get(),
        set: (ref, data, options) => {
          ops.push({ ref, data, options });
        },
      };
      const result = await fn(t);
      for (const op of ops) {
        await op.ref.set(op.data, op.options);
      }
      return result;
    },
  };
}
