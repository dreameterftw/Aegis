#!/usr/bin/env node
/**
 * test_push.js — Send a test FCM push to all subscribed devices.
 *
 * Uses the FCM HTTP v1 API directly (no firebase-admin needed).
 * Reads FCM subscriptions from Firestore REST API using the service account.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node test/test_push.js "test-domain.in"
 *
 * Or with explicit key file:
 *   node test/test_push.js "test-domain.in" ./serviceAccountKey.json
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const testDomain = process.argv[2] || 'test-domain.in';
const keyFile = process.argv[3] || process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(resolve(keyFile), 'utf8'));
} catch {
  console.error(`ERROR: Could not read service account key from ${keyFile}`);
  console.error('Usage: node test/test_push.js <domain> <path-to-service-account.json>');
  process.exit(1);
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_BASE = 'https://fcm.googleapis.com/v1/projects';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';

// ── JWT helpers ───────────────────────────────────────────────────────────────

function base64url(obj) {
  return btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: scopes,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  return data.access_token;
}

// ── Fetch FCM subscriptions from Firestore ────────────────────────────────────

async function getSubscriptions(firestoreToken) {
  const projectId = serviceAccount.project_id;
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/fcm_subscriptions`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${firestoreToken}` } });
  if (!res.ok) {
    console.warn(`Firestore read failed ${res.status}: ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  const docs = data.documents || [];
  return docs
    .map(d => d.fields?.token?.stringValue)
    .filter(Boolean);
}

// ── Send FCM message ──────────────────────────────────────────────────────────

async function sendPush(tokens, fcmToken, domain) {
  if (tokens.length === 0) {
    console.log('No subscribed devices found in fcm_subscriptions. Subscribe a device first.');
    return;
  }

  const projectId = serviceAccount.project_id;
  let sent = 0;
  let failed = 0;

  for (const token of tokens) {
    const res = await fetch(`${FCM_BASE}/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fcmToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: '⚠️ Aegis Security Alert',
            body: `New threat propagated: ${domain} — ${sent + 1} of ${tokens.length} devices warned`,
          },
          data: {
            domain,
            type: 'community_propagated',
            clickAction: 'OPEN_LINKSENTRY',
          },
        },
      }),
    });

    if (res.ok) {
      sent++;
    } else {
      const err = await res.json().catch(() => ({}));
      console.warn(`  ✗ Token ${token.slice(0, 20)}…: ${err?.error?.message || res.status}`);
      failed++;
    }
  }

  console.log(`\nPush results: ${sent} sent, ${failed} failed out of ${tokens.length} subscriptions`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nSending test push for domain: ${testDomain}`);
console.log('Getting access tokens...');

const [firestoreToken, fcmToken] = await Promise.all([
  getAccessToken('https://www.googleapis.com/auth/datastore'),
  getAccessToken('https://www.googleapis.com/auth/firebase.messaging'),
]);

console.log('Fetching FCM subscriptions from Firestore...');
const tokens = await getSubscriptions(firestoreToken);
console.log(`Found ${tokens.length} subscribed device(s)`);

await sendPush(tokens, fcmToken, testDomain);
console.log('\nCheck your subscribed device for the notification.');
