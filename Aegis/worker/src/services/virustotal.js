/**
 * virustotal.js — VirusTotal API helpers
 *
 * Uses VirusTotal Public API v3 (free tier).
 * Free tier: 500 lookups/day, 4 req/min.
 */

const VT_BASE = "https://www.virustotal.com/api/v3";

/**
 * Look up a file hash (SHA-256) on VirusTotal.
 * Signature matches what apkHandler expects: checkVirusTotal(sha256, env)
 * @param {string} sha256
 * @param {object} env  — Cloudflare Worker env bindings
 * @returns {Promise<{known: boolean, malicious: number, suspicious: number, permalink: string|null}>}
 */
export async function checkVirusTotal(sha256, env) {
  try {
    const res = await fetch(`${VT_BASE}/files/${sha256}`, {
      headers: { "x-apikey": env.VIRUSTOTAL_API_KEY },
    });

    if (res.status === 404) return { known: false, malicious: 0, suspicious: 0, permalink: null };
    if (!res.ok) {
      console.error(`VT file lookup error ${res.status}`);
      return { known: false, error: true, malicious: 0, suspicious: 0, permalink: null };
    }

    const data = await res.json();
    const stats = data?.data?.attributes?.last_analysis_stats ?? {};
    const malicious = stats.malicious ?? 0;
    const suspicious = stats.suspicious ?? 0;
    const permalink = data?.data?.links?.self ?? null;

    return { known: true, malicious, suspicious, permalink };
  } catch (err) {
    console.error("VT file lookup exception:", err);
    return { known: false, error: true, malicious: 0, suspicious: 0, permalink: null };
  }
}

/**
 * Submit a URL for scanning and return the analysis result.
 * Two-step: POST to submit, GET to retrieve result.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<{positives: number, total: number}|null>}
 */
export async function checkVirusTotalURL(url, apiKey) {
  try {
    // Step 1 — Submit URL
    const submitRes = await fetch(`${VT_BASE}/urls`, {
      method: "POST",
      headers: {
        "x-apikey": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ url }),
    });

    if (!submitRes.ok) {
      console.error(`VT URL submit error ${submitRes.status}`);
      return null;
    }

    const submitData = await submitRes.json();
    const analysisId = submitData?.data?.id;
    if (!analysisId) return null;

    // Step 2 — Poll once (Workers have limited execution time)
    // In production, store the analysisId and poll via a separate request.
    await new Promise((r) => setTimeout(r, 3000)); // wait 3 s

    const resultRes = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });

    if (!resultRes.ok) return null;

    const resultData = await resultRes.json();
    const stats = resultData?.data?.attributes?.stats ?? {};
    const positives = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    return { positives, total };
  } catch (err) {
    console.error("VT URL lookup exception:", err);
    return null;
  }
}
