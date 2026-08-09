/**
 * linkHandler.js — Phase 3 LinkSentry
 *
 * Handles:
 *  - handleLink()       → per-request URL verdict (called on cache miss)
 *  - ingestBlocklists() → daily cron that fills domain_blocklist from OpenPhish + URLhaus
 */

import { writeCache, incrementReportCount } from '../cache.js';
import { getGroqVerdict } from '../services/groq.js';
import { checkVirusTotalURL } from '../services/virustotal.js';

// ── Request handler ───────────────────────────────────────────────────────────

export async function handleLink(body, db, env) {
  const { url, onnxScore, uid } = body;

  if (!url) {
    return Response.json({ error: 'Missing url' }, { status: 400 });
  }

  let hostname;
  try {
    hostname = new URL(url.includes('://') ? url : `https://${url}`).hostname;
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // ── Client ONNX score → boolean ───────────────────────────────────────────
  // onnxScore is a 0–1 float from the browser classifier (may be null if model not loaded)
  const clientFlagged = typeof onnxScore === 'number' && onnxScore > 0.5;
  const highConfidence = typeof onnxScore === 'number' && onnxScore > 0.85;

  // ── VirusTotal URL check (only on high-confidence hits to save quota) ──────
  let vtResult = null;
  if (highConfidence && env.VIRUSTOTAL_API_KEY) {
    try {
      vtResult = await checkVirusTotalURL(url, env);
    } catch (err) {
      console.warn('VT URL check failed:', err.message);
    }
  }

  const vtPositives = vtResult?.positives ?? 0;
  const dangerous = clientFlagged || vtPositives >= 2;

  // ── Groq verdict in 6 languages ───────────────────────────────────────────
  let verdicts = null;
  if (dangerous) {
    try {
      verdicts = await getGroqVerdict('link', {
        hostname,
        onnxScore,
        vtPositives,
        isDangerous: dangerous,
      }, env);
    } catch (err) {
      console.warn('Groq verdict failed:', err.message);
    }
  }

  // ── Record signal (non-fatal) ─────────────────────────────────────────────
  if (clientFlagged) {
    try {
      await incrementReportCount(db, hostname, 'link');
    } catch (err) {
      console.warn('Signal record failed:', err.message);
    }
  }

  // ── Cache dangerous results so repeat lookups are instant ─────────────────
  const result = {
    hostname,
    url,
    dangerous,
    onnxScore: onnxScore ?? null,
    vtDetections: vtResult ? vtPositives : null,
    verdicts,
    source: 'fresh',
  };

  if (dangerous) {
    try {
      await writeCache(db, 'domain_blocklist', hostname, {
        ...result,
        source: undefined, // don't store source field
        addedAt: Date.now(),
      });
    } catch (err) {
      console.warn('Cache write failed:', err.message);
    }
  }

  return Response.json(result);
}

// ── Daily cron ingestion ──────────────────────────────────────────────────────

/**
 * Ingest OpenPhish + URLhaus blocklists into Firestore domain_blocklist.
 * Called by the scheduled() handler in index.js.
 * Runs at 03:00 UTC daily (8:30 AM IST).
 *
 * Note: our Firestore REST client doesn't support batch writes, so we
 * write entries sequentially with Promise.allSettled for fault tolerance.
 * Capped at 200 entries per source per run to stay within free-tier write limits.
 */
export async function ingestBlocklists(db, env) {
  const results = { openphish: 0, urlhaus: 0, errors: [] };
  const MAX_PER_SOURCE = 200;

  // ── OpenPhish (plain text, no key required) ───────────────────────────────
  try {
    const res = await fetch('https://openphish.com/feed.txt', {
      headers: { 'User-Agent': 'Aegis-Security/1.0' },
    });

    if (res.ok) {
      const text = await res.text();
      const urls = text.split('\n').filter(Boolean).slice(0, MAX_PER_SOURCE);

      const writes = urls.map(async (rawUrl) => {
        try {
          const host = new URL(rawUrl).hostname;
          await db.collection('domain_blocklist').doc(host).set(
            { source: 'openphish', firstSeen: Date.now(), verified: true },
            { merge: true }
          );
          results.openphish++;
        } catch {
          // skip malformed URLs
        }
      });

      await Promise.allSettled(writes);
    }
  } catch (e) {
    results.errors.push(`openphish: ${e.message}`);
  }

  // ── URLhaus (JSON, no key required) ──────────────────────────────────────
  try {
    const res = await fetch(
      'https://urlhaus-api.abuse.ch/v1/urls/recent/limit/200/',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (res.ok) {
      const data = await res.json();
      const entries = (data.urls || []).slice(0, MAX_PER_SOURCE);

      const writes = entries.map(async (entry) => {
        try {
          const host = new URL(entry.url).hostname;
          await db.collection('domain_blocklist').doc(host).set(
            {
              source: 'urlhaus',
              firstSeen: Date.now(),
              verified: entry.url_status === 'online',
              threat: entry.threat || null,
            },
            { merge: true }
          );
          results.urlhaus++;
        } catch {
          // skip malformed
        }
      });

      await Promise.allSettled(writes);
    }
  } catch (e) {
    results.errors.push(`urlhaus: ${e.message}`);
  }

  console.log('Blocklist ingestion complete:', results);
  return results;
}
