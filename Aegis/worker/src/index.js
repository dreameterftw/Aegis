import { getDb } from './firestore.js';
import { checkCache } from './cache.js';
import { handleApk } from './handlers/apkHandler.js';
import { handleLink, ingestBlocklists } from './handlers/linkHandler.js';
import { handleBreach } from './handlers/breachHandler.js';

const COLLECTION_MAP = {
  apk: 'apk_cache',
  link: 'domain_blocklist',
};

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { type, id } = body; // id = apk hash, domain, or phone-hash-prefix
    if (!type || !id) {
      return Response.json({ error: 'Missing type or id' }, { status: 400 });
    }

    const db = getDb(env);

    // Central cache-check for apk/link — breach lookups have their own shape (Phase 4)
    if (COLLECTION_MAP[type]) {
      const cached = await checkCache(db, COLLECTION_MAP[type], id);
      if (cached) return Response.json(cached);
    }

    // Cache miss → dispatch to the right handler
    switch (type) {
      case 'apk':
        return handleApk(body, db, env);
      case 'link':
        return handleLink(body, db, env);
      case 'breach':
        return handleBreach(body, db, env);
      default:
        return Response.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  },

  async scheduled(event, env, ctx) {
    // Phase 3 daily blocklist ingestion fires here
    ctx.waitUntil(ingestBlocklists(getDb(env), env));
  }
};
