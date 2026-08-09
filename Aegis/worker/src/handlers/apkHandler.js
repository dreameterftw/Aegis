/**
 * apkHandler.js — Phase 2 APK TrustScore pipeline
 *
 * Flow:
 *  1. Frontend sends the APK as base64 + its SHA-256
 *  2. Worker forwards the file to Render for static analysis (androguard)
 *  3. Worker cross-checks the SHA-256 on VirusTotal
 *  4. Worker calls Groq to generate verdicts in 6 languages
 *  5. Result is written to apk_cache keyed by SHA-256
 *  6. Subsequent scans of the same APK are served instantly from cache
 */

import { writeCache } from "../cache.js";
import { checkVirusTotal } from "../services/virustotal.js";
import { generateVerdicts } from "../services/groqVerdict.js";

/**
 * Compute a TrustScore (0–100) from analysis signals.
 * Lower = more dangerous.
 */
function computeTrustScore(analysis, vtResult) {
  let score = 100;

  // Pattern-based deductions
  for (const p of analysis.matched_patterns ?? []) {
    if (p.severity === "critical") score -= p.aggravating_confirmed ? 60 : 45;
    else if (p.severity === "high") score -= p.aggravating_confirmed ? 35 : 25;
    else if (p.severity === "medium") score -= 15;
  }

  // Certificate mismatch — impersonating a known app
  if (analysis.cert_mismatch) score -= 40;

  // VirusTotal signals
  if (vtResult.known) {
    if (vtResult.malicious >= 5) score -= 30;
    else if (vtResult.malicious >= 2) score -= 20;
    else if (vtResult.malicious >= 1) score -= 10;
    if (vtResult.suspicious >= 3) score -= 10;
  }

  // Large dangerous permission surface with no matched pattern — still suspicious
  const dangerousCount = analysis.dangerous_permissions?.length ?? 0;
  if (dangerousCount >= 5) score -= 10;
  else if (dangerousCount >= 3) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export async function handleApk(formData, db, env) {
  // ── 1. Extract file and hash from FormData ────────────────────────────────
  const file = formData.get("file");
  const sha256 = formData.get("sha256");

  if (!file || !sha256) {
    return Response.json({ error: "Missing file or sha256" }, { status: 400 });
  }

  // ── 2. Forward to Render for static analysis ──────────────────────────────
  const renderUrl = env.RENDER_APK_SERVICE_URL;
  if (!renderUrl) {
    return Response.json({ error: "RENDER_APK_SERVICE_URL not configured" }, { status: 503 });
  }

  let analysis;
  try {
    const renderForm = new FormData();
    renderForm.append("file", file);

    const renderRes = await fetch(`${renderUrl}/analyze`, {
      method: "POST",
      body: renderForm,
    });

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error(`Render analysis failed ${renderRes.status}:`, errText);
      return Response.json({ error: "analysis_failed", detail: errText }, { status: 502 });
    }

    analysis = await renderRes.json();
  } catch (err) {
    console.error("Render fetch error:", err);
    return Response.json({ error: "render_unreachable", detail: err.message }, { status: 502 });
  }

  // ── 3. VirusTotal cross-check ─────────────────────────────────────────────
  // Use the hash from the analysis response (computed by Render from the actual
  // file bytes) rather than the client-supplied hash, to prevent hash spoofing.
  const hashToCheck = analysis.apk_sha256 || sha256;
  const vtResult = await checkVirusTotal(hashToCheck, env);

  // ── 4. Groq verdicts in 6 languages ──────────────────────────────────────
  const { severity, verdicts } = await generateVerdicts(analysis, vtResult, env);

  // ── 5. Compute TrustScore ─────────────────────────────────────────────────
  const trustScore = computeTrustScore(analysis, vtResult);

  const result = {
    package: analysis.package,
    app_name: analysis.app_name,
    version_name: analysis.version_name,
    apk_sha256: hashToCheck,
    matched_patterns: analysis.matched_patterns,
    dangerous_permissions: analysis.dangerous_permissions,
    cert_mismatch: analysis.cert_mismatch,
    cert_issuer: analysis.cert_issuer,
    virustotal: vtResult,
    overall_severity: severity,
    trustScore,
    verdicts,
  };

  // ── 6. Cache result keyed by SHA-256 ──────────────────────────────────────
  try {
    await writeCache(db, "apk_cache", hashToCheck, result);
  } catch (err) {
    // Non-fatal — still return result even if cache write fails
    console.error("Cache write failed:", err);
  }

  return Response.json({ source: "fresh", ...result });
}
