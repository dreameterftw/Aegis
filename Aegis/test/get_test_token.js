#!/usr/bin/env node
/**
 * get_test_token.js — Generate a real Firebase Anonymous Auth ID token
 * using the Firebase REST API (no firebase-admin dependency needed).
 *
 * Usage: node test/get_test_token.js
 * Output: prints the ID token to stdout
 *
 * Requires VITE_FIREBASE_API_KEY in environment or a .env file.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from frontend directory
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../frontend/.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();
const API_KEY = process.env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;

if (!API_KEY || API_KEY.startsWith('YOUR_')) {
  console.error('ERROR: Set FIREBASE_API_KEY env var or ensure frontend/.env has VITE_FIREBASE_API_KEY');
  process.exit(1);
}

// Sign in anonymously via Firebase Auth REST API
const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  }
);

if (!res.ok) {
  const err = await res.json();
  console.error('Firebase auth failed:', JSON.stringify(err));
  process.exit(1);
}

const data = await res.json();
// Print only the token so shell scripts can capture it cleanly
process.stdout.write(data.idToken);
