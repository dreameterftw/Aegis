import { getDb } from './firestore.js';
import { checkCache } from './cache.js';
import { handleApk } from './handlers/apkHandler.js';
import { handleLink } from './handlers/linkHandler.js';
import { handleBreach } from './handlers/breachHandler.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    const db = getDb(env);

    let body;
    try {
      // /analyze uses multipart FormData (APK upload), everything else is JSON
      if (path === '/analyze') {
        body = await request.formData();
      } else {
        body = await request.json();
      }
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid request body' }), 400);
    }

    let result;

    switch (path) {
      case '/analyze':
        result = await handleApk(body, db, env);
        break;

      case '/check-link': {
        const cached = await checkCache(db, 'domain_blocklist', body.url);
        if (cached) return corsResponse(JSON.stringify(cached));
        result = await handleLink(body, db, env);
        break;
      }

      case '/breach-lookup': {
        const cached = await checkCache(db, 'breach_cache', body.hashPrefix);
        if (cached) return corsResponse(JSON.stringify(cached));
        result = await handleBreach(body, db, env);
        break;
      }

      case '/report-signal':
        // Phase 5 — community signal reporting
        result = { propagated: false, message: 'Signal recorded (Phase 5 pending)' };
        break;

      case '/subscribe-alerts':
        // Phase 6 — FCM token registration
        result = { ok: true, message: 'Subscription recorded (Phase 6 pending)' };
        break;

      default:
        return corsResponse(JSON.stringify({ error: `Unknown route: ${path}` }), 404);
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
