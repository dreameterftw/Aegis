/**
 * auth.js — Firebase ID token verification for Cloudflare Workers
 *
 * Verifies Firebase Anonymous Auth ID tokens using the Firebase Auth REST API.
 * Does NOT use firebase-admin (Node.js only) — uses the public JWKS endpoint instead.
 *
 * Verification steps:
 *  1. Fetch Google's public signing keys (cached for 1h)
 *  2. Decode the JWT header to find the key ID (kid)
 *  3. Verify the RS256 signature using WebCrypto
 *  4. Validate standard claims (iss, aud, exp, iat)
 */

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let _certsCache = null;
let _certsCacheExpiry = 0;

/**
 * Fetch and cache Google's Firebase signing certificates.
 */
async function getSigningCerts() {
  const now = Date.now();
  if (_certsCache && now < _certsCacheExpiry) return _certsCache;

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error('Failed to fetch Firebase signing certs');

  // Cache-Control header tells us how long to cache
  const cc = res.headers.get('cache-control') || '';
  const maxAgeMatch = cc.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

  _certsCache = await res.json();
  _certsCacheExpiry = now + maxAge * 1000;
  return _certsCache;
}

/**
 * Base64url decode to Uint8Array.
 */
function base64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Import an X.509 PEM certificate's public key for RS256 verification.
 */
async function importPublicKeyFromCert(pem) {
  // Extract DER bytes from PEM (strip header/footer/whitespace)
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'spki',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * Verify a Firebase ID token and return the decoded payload, or null if invalid.
 *
 * @param {string} idToken
 * @param {string} projectId  Firebase project ID (from service account)
 * @returns {Promise<object|null>}
 */
export async function verifyFirebaseToken(idToken, projectId) {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // Validate standard claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.iat > now + 60) return null; // clock skew tolerance
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (payload.aud !== projectId) return null;
    if (!payload.sub) return null;

    // Verify signature
    const certs = await getSigningCerts();
    const certPem = certs[header.kid];
    if (!certPem) return null;

    const publicKey = await importPublicKeyFromCert(certPem);
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = base64urlDecode(parts[2]);

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      new TextEncoder().encode(signingInput)
    );

    return valid ? payload : null;
  } catch (err) {
    console.warn('Token verification error:', err.message);
    return null;
  }
}

/**
 * Extract and verify the Bearer token from an Authorization header.
 * Returns the verified UID or null.
 *
 * @param {Request} request
 * @param {object} env   Cloudflare Worker env (needs FIREBASE_SERVICE_ACCOUNT_JSON for project_id)
 * @returns {Promise<string|null>}
 */
export async function verifyRequestAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice(7);
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id;

  const payload = await verifyFirebaseToken(idToken, projectId);
  return payload?.uid ?? null;
}
