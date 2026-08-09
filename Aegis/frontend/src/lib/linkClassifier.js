/**
 * linkClassifier.js — Client-side ONNX phishing classifier
 *
 * Feature vector is 64-dimensional to match url-features.js and the
 * training pipeline in docs/training/train_classifier.py.
 *
 * WASM binaries are loaded from CDN — not bundled — to stay under
 * Cloudflare Pages' 25 MiB per-file limit.
 */

import * as ort from 'onnxruntime-web';

// Load wasm from CDN at runtime
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

const MODEL_PATH = '/models/phishing_classifier.onnx';
const FEATURE_DIM = 64;

const SUSPICIOUS_TOKENS = [
  'login', 'signin', 'verify', 'secure', 'account', 'update',
  'confirm', 'banking', 'paypal', 'amazon', 'google', 'apple',
  'microsoft', 'netflix', 'sbi', 'hdfc',
];

const SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq'];

/**
 * Extract a 64-dimensional Float32Array feature vector from a URL.
 * Must match the Python extract_features() in train_classifier.py exactly.
 * @param {string} url
 * @returns {Float32Array|null} null if URL is unparseable
 */
export function extractFeatures(url) {
  let parsed;
  try {
    parsed = new URL(url.includes('://') ? url : `https://${url}`);
  } catch {
    return null;
  }

  const features = new Float32Array(FEATURE_DIM);
  const lower = url.toLowerCase();
  const host = parsed.hostname;

  features[0] = Math.min(url.length / 200, 1);
  features[1] = Math.min(host.length / 50, 1);
  features[2] = Math.min(parsed.pathname.length / 100, 1);
  features[3] = Math.min((host.match(/\./g) || []).length / 5, 1);
  features[4] = Math.min((host.match(/-/g) || []).length / 5, 1);
  features[5] = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? 1 : 0;
  features[6] = parsed.protocol === 'https:' ? 1 : 0;
  features[7] = url.includes('@') ? 1 : 0;
  features[8] = (url.match(/\/\//g) || []).length > 1 ? 1 : 0;
  features[9] = Math.min(parsed.search.length / 100, 1);

  // features 10–25: suspicious token presence
  SUSPICIOUS_TOKENS.forEach((token, i) => {
    features[10 + i] = lower.includes(token) ? 1 : 0;
  });

  // features 26–30: suspicious TLD
  SUSPICIOUS_TLDS.forEach((tld, i) => {
    features[26 + i] = host.endsWith(tld) ? 1 : 0;
  });

  // feature 31: subdomain depth
  features[31] = Math.min((host.split('.').length - 2) / 3, 1);

  // feature 32: path depth
  features[32] = Math.min(parsed.pathname.split('/').filter(Boolean).length / 5, 1);

  // feature 33: has non-standard port
  features[33] = parsed.port ? 1 : 0;

  // feature 34: query param count
  features[34] = Math.min([...parsed.searchParams].length / 10, 1);

  // feature 35: has fragment
  features[35] = parsed.hash ? 1 : 0;

  // features 36–63: reserved zeros (future features)

  return features;
}

let _session = null;

/**
 * Classify a URL using the on-device ONNX model.
 * Falls back to a rule-based heuristic if the model file isn't loaded.
 *
 * @param {string} url
 * @returns {Promise<{ isPhishing: boolean, score: number, latencyMs: number, source: 'onnx'|'heuristic' }>}
 */
export async function classifyURL(url) {
  const t0 = performance.now();

  const features = extractFeatures(url);
  if (!features) {
    return { isPhishing: false, score: 0, latencyMs: 0, source: 'heuristic' };
  }

  // Try ONNX model first
  try {
    if (!_session) {
      _session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    }

    const tensor = new ort.Tensor('float32', features, [1, FEATURE_DIM]);
    const output = await _session.run({ input: tensor });

    // Model outputs: 'output' = class label (0/1), 'probabilities' = [p_safe, p_phishing]
    const label = output.output?.data?.[0] ?? 0;
    const score = output.probabilities?.data?.[1] ?? (label === 1 ? 0.9 : 0.1);
    const latencyMs = Math.round(performance.now() - t0);

    return { isPhishing: label === 1, score, latencyMs, source: 'onnx' };
  } catch (err) {
    console.warn('ONNX inference failed, falling back to heuristic:', err.message);
    _session = null; // reset so next call retries
  }

  // ── Heuristic fallback (no model file needed) ─────────────────────────────
  const score = heuristicScore(features);
  return {
    isPhishing: score > 0.5,
    score,
    latencyMs: Math.round(performance.now() - t0),
    source: 'heuristic',
  };
}

/**
 * Simple weighted heuristic over the feature vector.
 * Used when the ONNX model isn't available (before training is done).
 */
function heuristicScore(features) {
  let s = 0;
  s += features[5] * 0.4;          // raw IP as hostname — very suspicious
  s += (1 - features[6]) * 0.15;   // no HTTPS
  s += features[7] * 0.3;          // @ in URL
  s += features[8] * 0.2;          // double-slash redirect
  s += features[4] * 0.1;          // many hyphens

  // Suspicious tokens (features 10–25)
  for (let i = 10; i <= 25; i++) s += features[i] * 0.05;

  // Suspicious TLDs (features 26–30)
  for (let i = 26; i <= 30; i++) s += features[i] * 0.15;

  return Math.min(1, s);
}
