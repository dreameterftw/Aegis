/**
 * trustscore.js — APK TrustScore computation
 *
 * Score: 0 (highly dangerous) → 100 (safe)
 * Starts at 100 and deducts points for each risk signal.
 */

const DEDUCTIONS = {
  otp_stealer_pattern: 60,       // SMS + accessibility + receive_sms combo
  accessibility_service: 20,     // BIND_ACCESSIBILITY_SERVICE alone
  device_admin: 25,              // BIND_DEVICE_ADMIN
  install_packages: 15,          // REQUEST_INSTALL_PACKAGES
  read_contacts: 5,
  read_call_log: 10,
  camera_and_mic: 10,            // both CAMERA + RECORD_AUDIO
  vtDetections: (n) => Math.min(n * 8, 60), // up to 60 pts for VT hits
};

/**
 * @param {{ flags: object, vtResult: object|null }} param0
 * @returns {number} score 0–100
 */
export function computeTrustScore({ flags = {}, vtResult = null }) {
  let score = 100;

  if (flags.otp_stealer_pattern) score -= DEDUCTIONS.otp_stealer_pattern;
  if (flags.accessibility_service && !flags.otp_stealer_pattern)
    score -= DEDUCTIONS.accessibility_service;
  if (flags.device_admin) score -= DEDUCTIONS.device_admin;
  if (flags.install_packages) score -= DEDUCTIONS.install_packages;
  if (flags.read_contacts) score -= DEDUCTIONS.read_contacts;
  if (flags.read_call_log) score -= DEDUCTIONS.read_call_log;
  if (flags.camera_and_mic) score -= DEDUCTIONS.camera_and_mic;

  if (vtResult && vtResult.positives > 0) {
    score -= DEDUCTIONS.vtDetections(vtResult.positives);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
