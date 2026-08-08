/**
 * config.js — Central configuration
 * Public identifiers only — no secrets here.
 * Secrets live in Wrangler on the Worker side.
 */

export const WORKER_URL =
  import.meta.env.VITE_WORKER_URL || "https://aegis-router.workers.dev";

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_FIREBASE_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
};

export const VAPID_KEY =
  import.meta.env.VITE_VAPID_KEY || "YOUR_VAPID_PUBLIC_KEY";

export const ONNX_MODEL_PATH = "/models/phishing_classifier.onnx";
export const ONNX_FEATURE_DIM = 64;
