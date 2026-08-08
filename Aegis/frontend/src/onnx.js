/**
 * onnx.js — Client-side ONNX phishing classifier (Phase 3)
 *
 * The ONNX model runs entirely on the user's device — zero API cost,
 * sub-50ms inference. It is loaded lazily on first use.
 *
 * Place your trained model at frontend/public/models/phishing_classifier.onnx
 * See docs/training/README.md for the feature extraction pipeline used during training.
 */

import * as ort from "onnxruntime-web";
import { vectorizeURL } from "./utils/url-features.js";
import { ONNX_MODEL_PATH, ONNX_FEATURE_DIM } from "./config.js";

let _session = null;

/**
 * Load and cache the ONNX inference session.
 * @returns {Promise<ort.InferenceSession>}
 */
async function getSession() {
  if (_session) return _session;
  _session = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return _session;
}

/**
 * Classify a URL as phishing or safe using the on-device ONNX model.
 * @param {string} url
 * @returns {Promise<{ score: number, label: 'phishing'|'safe', latencyMs: number }>}
 */
export async function classifyURL(url) {
  const t0 = performance.now();

  const session = await getSession();

  const features = vectorizeURL(url); // Float32Array[ONNX_FEATURE_DIM]
  const inputTensor = new ort.Tensor("float32", features, [1, ONNX_FEATURE_DIM]);

  const results = await session.run({ input: inputTensor });

  // Model output: single float32 confidence score (1 = phishing)
  const score = results.output.data[0];
  const latencyMs = Math.round(performance.now() - t0);

  return {
    score,
    label: score > 0.5 ? "phishing" : "safe",
    latencyMs,
  };
}
