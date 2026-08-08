/**
 * url-features.js — URL feature extraction for ONNX inference
 *
 * Must match the Python feature extraction used during model training exactly.
 * Feature vector length: 64 (ONNX_FEATURE_DIM)
 */

import { ONNX_FEATURE_DIM } from "../config.js";

const SUSPICIOUS_TOKENS = [
  "login", "signin", "verify", "secure", "account", "update",
  "confirm", "banking", "paypal", "amazon", "google", "apple",
  "microsoft", "netflix", "sbi", "hdfc",
];

const SUSPICIOUS_TLDS = [".tk", ".ml", ".ga", ".cf", ".gq"];

/**
 * @param {string} url
 * @returns {Float32Array}
 */
export function vectorizeURL(url) {
  const features = new Float32Array(ONNX_FEATURE_DIM);

  try {
    const withScheme = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(withScheme);
    const lower = url.toLowerCase();

    features[0] = Math.min(url.length / 200, 1);
    features[1] = Math.min(parsed.hostname.length / 50, 1);
    features[2] = Math.min(parsed.pathname.length / 100, 1);
    features[3] = Math.min((parsed.hostname.match(/\./g) || []).length / 5, 1);
    features[4] = Math.min((parsed.hostname.match(/-/g) || []).length / 5, 1);
    features[5] = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) ? 1 : 0;
    features[6] = parsed.protocol === "https:" ? 1 : 0;
    features[7] = url.includes("@") ? 1 : 0;
    features[8] = (url.match(/\/\//g) || []).length > 1 ? 1 : 0;
    features[9] = Math.min(parsed.search.length / 100, 1);

    SUSPICIOUS_TOKENS.forEach((token, i) => {
      features[10 + i] = lower.includes(token) ? 1 : 0;
    });

    SUSPICIOUS_TLDS.forEach((tld, i) => {
      features[26 + i] = parsed.hostname.endsWith(tld) ? 1 : 0;
    });

    // Feature 31: subdomain count
    const parts = parsed.hostname.split(".");
    features[31] = Math.min((parts.length - 2) / 3, 1);

    // Feature 32: path depth
    const depth = parsed.pathname.split("/").filter(Boolean).length;
    features[32] = Math.min(depth / 5, 1);

    // Feature 33: has port
    features[33] = parsed.port ? 1 : 0;

    // Feature 34: query param count
    const paramCount = [...parsed.searchParams].length;
    features[34] = Math.min(paramCount / 10, 1);

    // Feature 35: fragment present
    features[35] = parsed.hash ? 1 : 0;

    // Features 36-63: reserved (padding zeros for future features)
  } catch {
    // Return zero-vector on parse failure
  }

  return features;
}
