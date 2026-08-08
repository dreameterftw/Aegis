import { getDb } from './firestore.js';
import { checkCache } from './cache.js';
import { handleApk } from './handlers/apkHandler.js';
import { handleLink, ingestBlocklists } from './handlers/linkHandler.js';
import { handleBreach } from './handlers/breachHandler.js';

const COLLECTION_MAP = {
  apk: 'apk_cache',
  link: 'domain_blocklist',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
    }

    const { type, id } = body; // id = apk hash, domain, or phone-hash-prefix
    if (!type || !id) {
      return Response.json({ error: 'Missing type or id' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb(env);

    // Central cache-check for apk/link — breach lookups have their own shape (Phase 4)
    if (COLLECTION_MAP[type]) {
      const cached = await checkCache(db, COLLECTION_MAP[type], id);
      if (cached) return Response.json(cached, { headers: CORS_HEADERS });
    }

    // Cache miss → dispatch to the right handler
    let response;
    switch (type) {
      case 'apk':
        response = await handleApk(body, db, env);
        break;
      case 'link':
        response = await handleLink(body, db, env);
        break;
      case 'breach':
        response = await handleBreach(body, db, env);
        break;
      default:
        response = Response.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    // Attach CORS headers to every response
    const newHeaders = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(response.body, { status: response.status, headers: newHeaders });
  },

  async scheduled(event, env, ctx) {
    // Phase 3 daily blocklist ingestion fires here
    ctx.waitUntil(ingestBlocklists(getDb(env), env));
  }
};
