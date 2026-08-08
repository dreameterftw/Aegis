/**
 * url.js — URL normalisation helpers
 */

/**
 * Extract and normalise the hostname from a URL string.
 * Strips www. prefix and lowercases the result.
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeHostname(rawUrl) {
  // Add scheme if missing so URL() can parse it
  const withScheme = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const parsed = new URL(withScheme);
  return parsed.hostname.replace(/^www\./, "").toLowerCase();
}

/**
 * Extract features for the ONNX vectoriser from a URL string.
 * Mirrors the Python feature extraction used when training the model.
 * @param {string} url
 * @returns {Float32Array}
 */
export function vectorizeURL(url) {
  const FEATURE_DIM = 64; // must match training config
  const features = new Float32Array(FEATURE_DIM);

  try {
    const withScheme = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(withScheme);

    // Feature 0: URL length (normalised)
    features[0] = Math.min(url.length / 200, 1);
    // Feature 1: hostname length
    features[1] = Math.min(parsed.hostname.length / 50, 1);
    // Feature 2: path length
    features[2] = Math.min(parsed.pathname.length / 100, 1);
    // Feature 3: number of dots in hostname
    features[3] = Math.min((parsed.hostname.match(/\./g) || []).length / 5, 1);
    // Feature 4: number of hyphens
    features[4] = Math.min((parsed.hostname.match(/-/g) || []).length / 5, 1);
    // Feature 5: has IP address
    features[5] = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) ? 1 : 0;
    // Feature 6: uses HTTPS
    features[6] = parsed.protocol === "https:" ? 1 : 0;
    // Feature 7: has @ symbol (credential stuffing indicator)
    features[7] = url.includes("@") ? 1 : 0;
    // Feature 8: has redirect (//  after path)
    features[8] = (url.match(/\/\//g) || []).length > 1 ? 1 : 0;
    // Feature 9: query string length
    features[9] = Math.min(parsed.search.length / 100, 1);
    // Feature 10-25: character-level n-gram presence (simplified)
    const suspiciousTokens = [
      "login", "signin", "verify", "secure", "account", "update",
      "confirm", "banking", "paypal", "amazon", "google", "apple",
      "microsoft", "netflix", "sbi", "hdfc",
    ];
    suspiciousTokens.forEach((token, i) => {
      features[10 + i] = url.toLowerCase().includes(token) ? 1 : 0;
    });
    // Feature 26-30: TLD checks
    const suspiciousTlds = [".tk", ".ml", ".ga", ".cf", ".gq"];
    suspiciousTlds.forEach((tld, i) => {
      features[26 + i] = parsed.hostname.endsWith(tld) ? 1 : 0;
    });
    // Remaining features left as 0 (padding for model compatibility)
  } catch {
    // Return zero-vector on parse failure
  }

  return features;
}
