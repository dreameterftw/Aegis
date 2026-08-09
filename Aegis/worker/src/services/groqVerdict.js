/**
 * groqVerdict.js — APK-specific Groq verdict generator
 *
 * Wraps the shared groq.js getGroqVerdict() for the APK pipeline.
 * Keeps apkHandler imports clean and makes the APK context shape explicit.
 */

import { getGroqVerdict } from "./groq.js";

/**
 * Generate verdicts in 6 languages for an APK analysis result.
 *
 * @param {object} analysis       Response from Render /analyze
 * @param {object} vtResult       Response from checkVirusTotal()
 * @param {object} env            Cloudflare Worker env bindings
 * @returns {Promise<{ severity: string, verdicts: Record<string, string> }>}
 */
export async function generateVerdicts(analysis, vtResult, env) {
  const topPattern = analysis.matched_patterns?.[0];
  const severity = analysis.overall_severity ?? "safe";

  const context = {
    package: analysis.package,
    app_name: analysis.app_name,
    overall_severity: severity,
    cert_mismatch: analysis.cert_mismatch,
    matched_patterns: (analysis.matched_patterns ?? []).map((p) => ({
      pattern: p.pattern,
      severity: p.severity,
      description: p.description,
      aggravating_confirmed: p.aggravating_confirmed,
    })),
    virustotal: {
      known: vtResult.known,
      malicious: vtResult.malicious,
      suspicious: vtResult.suspicious,
    },
    dangerous_permission_count: analysis.dangerous_permissions?.length ?? 0,
  };

  const verdicts = await getGroqVerdict("apk", context, env);
  return { severity, verdicts };
}
