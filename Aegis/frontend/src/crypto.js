/**
 * crypto.js — Client-side hashing utilities (Phase 4)
 *
 * The raw phone number NEVER leaves the device.
 * Only the first 5 hex characters of the SHA-256 hash are sent to the Worker
 * (k-anonymity-style prefix lookup, similar to HaveIBeenPwned).
 */

/**
 * Hash a phone number with SHA-256 and return the full hex string.
 * @param {string} phone  Raw digits only, e.g. "9876543210"
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function hashPhone(phone) {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone.replace(/\D/g, "")); // digits only
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Return the k-anonymity prefix (first 5 hex chars) for a phone number.
 * This is what gets sent to the Worker.
 */
export async function getPhoneHashPrefix(phone) {
  const full = await hashPhone(phone);
  return full.slice(0, 5);
}
