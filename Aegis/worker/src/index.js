import { getDb } from './firestore.js';
import { checkCache, incrementReportCount } from './cache.js';
import { verifyRequestAuth } from './auth.js';
import { handleApk } from './handlers/apkHandler.js';
import { handleLink } from './handlers/linkHandler.js';
import { handleBreach } from './handlers/breachHandler.js';
import { getHeatmapData } from './handlers/heatmap.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const db = getDb(env);

    // ── GET routes (no auth required — read-only public data) ─────────────────
    if (request.method === 'GET') {
      if (path === '/heatmap') {
        try {
          const data = await getHeatmapData(db);
          return corsResponse(JSON.stringify(data));
        } catch (err) {
          console.error('Heatmap error:', err);
          return corsResponse(JSON.stringify({ error: err.message }), 500);
        }
      }
      return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    }

    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body;
    try {
      if (path === '/analyze') {
        body = await request.formData();
      } else {
        body = await request.json();
      }
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid request body' }), 400);
    }

    // ── Auth verification for signal-writing routes ───────────────────────────
    // Routes that write to threat_signals require a verified Firebase UID.
    // Read-only and analysis routes don't — no friction for basic scanning.
    const AUTH_REQUIRED_PATHS = ['/report-signal', '/subscribe-alerts'];
    // Signal-generating routes (scan + report) also verify auth when present
    const SIGNAL_PATHS = ['/analyze', '/check-link'];

    let verifiedUid = null;

    if (AUTH_REQUIRED_PATHS.includes(path)) {
      verifiedUid = await verifyRequestAuth(request, env);
      if (!verifiedUid) {
        return corsResponse(JSON.stringify({ error: 'auth_required' }), 401);
      }
    } else if (SIGNAL_PATHS.includes(path)) {
      // Best-effort — don't block scans if auth fails, but use uid if available
      verifiedUid = await verifyRequestAuth(request, env).catch(() => null);
    }

    let result;

    try {
      switch (path) {
        case '/analyze': {
          // Inject verified uid and pincode into FormData for handler
          if (verifiedUid) body.set('verifiedUid', verifiedUid);
          result = await handleApk(body, db, env);
          break;
        }

        case '/check-link': {
          const hostname = (() => {
            try {
              const u = body.url || '';
              return new URL(u.includes('://') ? u : `https://${u}`).hostname;
            } catch { return null; }
          })();
          if (hostname) {
            const cached = await checkCache(db, 'domain_blocklist', hostname);
            if (cached) return corsResponse(JSON.stringify(cached));
          }
          // Pass verified uid to handler for signal deduplication
          body.verifiedUid = verifiedUid;
          result = await handleLink(body, db, env);
          break;
        }

        case '/breach-lookup':
          result = await handleBreach(body, db, env);
          break;

        case '/report-signal': {
          // Manual community report — auth already verified above
          const { hashOrDomain, type, pincode } = body;
          if (!hashOrDomain || !type) {
            return corsResponse(JSON.stringify({ error: 'Missing hashOrDomain or type' }), 400);
          }
          try {
            const propagation = await incrementReportCount(
              db, hashOrDomain, type, verifiedUid, pincode || null
            );
            result = {
              reported: !propagation.duplicate,
              duplicate: propagation.duplicate,
              reportCount: propagation.count,
              propagated: propagation.justPropagated,
            };
          } catch (err) {
            console.error('Report signal error:', err);
            result = { reported: false, error: err.message };
          }
          break;
        }

        case '/subscribe-alerts': {
          // Phase 6 — FCM token registration
          const { token } = body;
          if (!token) {
            return corsResponse(JSON.stringify({ error: 'Missing FCM token' }), 400);
          }
          try {
            await db.collection('fcm_subscriptions').doc(verifiedUid).set(
              { token, subscribedAt: Date.now() },
              { merge: true }
            );
            result = { ok: true, uid: verifiedUid };
          } catch (err) {
            console.error('FCM subscription error:', err);
            result = { ok: false, error: err.message };
          }
          break;
        }

        default:
          return corsResponse(JSON.stringify({ error: `Unknown route: ${path}` }), 404);
      }
    } catch (err) {
      console.error(`Worker error on ${path}:`, err);
      return corsResponse(JSON.stringify({ error: err.message }), 500);
    }

    // If handler returned a Response object, attach CORS headers and return
    if (result instanceof Response) {
      const newHeaders = new Headers(result.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(result.body, { status: result.status, headers: newHeaders });
    }

    return corsResponse(JSON.stringify(result));
  },

  async scheduled(event, env, ctx) {
    const { ingestBlocklists } = await import('./handlers/linkHandler.js');
    ctx.waitUntil(ingestBlocklists(getDb(env), env));
  }
};
