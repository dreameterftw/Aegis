# Aegis — Setup Guide

Complete this guide in order. Each section maps to a Phase in the build plan.

---

## Phase 0 — Accounts & Credentials

### 1. Firebase (Spark plan — no billing)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Enable **Firestore Database** → Native mode → region `asia-south1` (Mumbai)
3. Enable **Authentication** → Sign-in method → **Anonymous** → Enable
4. Enable **Cloud Messaging** (for push alerts)
5. Project Settings → Service Accounts → **Generate new private key**
   → save the JSON file locally (keep secret, never commit)
6. Project Settings → General → **Your apps** → Add web app
   → copy the `firebaseConfig` object into `frontend/.env.local`

### 2. Cloudflare

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create application
2. Workers → Create Worker → name: `aegis-router`
3. Install project dependencies: `npm install`
   - If npm reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, run it as:
     - PowerShell: `$env:NODE_OPTIONS="--use-system-ca"; npm install`
     - Bash: `NODE_OPTIONS=--use-system-ca npm install`
4. Create a Cloudflare API token with Workers edit permissions
5. Set it in your shell before running Worker commands:
   - PowerShell: `$env:CLOUDFLARE_API_TOKEN="your-token"`
   - Bash: `export CLOUDFLARE_API_TOKEN="your-token"`
6. Push secrets: `bash scripts/put-secrets.sh`

Worker commands run through `scripts/run-wrangler.mjs`, which sets `NODE_OPTIONS=--use-system-ca` and fails fast when `CLOUDFLARE_API_TOKEN` is missing. This avoids Wrangler falling back to OAuth on certificate-intercepting networks.

### 3. Render (free Python web service)

1. [render.com](https://render.com) → New → Web Service
2. Connect GitHub repo `dreameterftw/Aegis`
3. Root directory: `Aegis/render-apk-service`
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`
6. Copy the service URL → add as `RENDER_APK_SERVICE_URL` Worker secret (Phase 2)

### 4. API Keys

| Service | Where to get | Wrangler secret name |
|---------|-------------|---------------------|
| Groq | [console.groq.com](https://console.groq.com) → API Keys | `GROQ_API_KEY` |
| VirusTotal | [virustotal.com](https://www.virustotal.com) → Profile → API Key | `VIRUSTOTAL_API_KEY` |
| OpenPhish | Free feed — no key needed | — |
| URLhaus | Free feed — no key needed | — |

### 5. cron-job.org (keep Render alive)

1. [cron-job.org](https://cron-job.org) → Create cronjob
2. URL: `https://your-render-service.onrender.com/health`
3. Schedule: every 14 minutes (Render free tier sleeps after 15 min inactivity)

---

## Phase 1 — Local Development

```bash
cd Aegis/worker
npm install
npm run dev
```

Milestone tests:
```bash
# Cache miss → stub
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"type":"apk","id":"testhash123"}'
# → {"status":"not_implemented","module":"apk"}

# Bad request
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"error":"Missing type or id"}
```

Seed a doc in Firestore Console: collection `domain_blocklist`, doc ID `example.com`, fields `{"source":"test","dangerous":true}`, then:
```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"type":"link","id":"example.com"}'
# → {"source":"cache","dangerous":true,...}
```

---

## Phase 2 — APK TrustScore Milestone

1. Deploy Render service (push to GitHub → Render auto-deploys)
2. Add `RENDER_APK_SERVICE_URL` secret to Worker
3. Upload a test APK via the Scanner tab
4. Expected: `trustScore`, `flags`, verdict in all 6 languages
5. Upload same APK again → `source: "cache"`, instant response

---

## Phase 3 — LinkSentry Milestone

1. Add the trained ONNX model to `frontend/public/models/phishing_classifier.onnx`
2. Test with a known phishing URL → ONNX score > 0.5
3. Wait until 03:00 UTC → check Firestore `domain_blocklist` for new OpenPhish/URLhaus entries

---

## Phase 4 — BreachRadar Milestone

1. Seed test data: create `scripts/breaches.json`, run `node scripts/seed-breach-index.js`
2. Hash `+91<test-number>`, send first 5 chars as `hashPrefix`, verify response
3. Groq action plan returns in all 6 languages

---

## Phase 5 — Propagation Milestone

POST to `/report-signal` 3 times with the same `hashOrDomain`:
- After 3rd call: `propagated: true`
- 4th call: `propagated: false`, count increments to 4 (no double-propagation)

---

## Phase 6 — Push Notifications Milestone

1. Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
2. Add public key to `frontend/.env.local` as `VITE_VAPID_KEY`
3. Open BreachRadar → click "Alert me" → grant permission
4. Send a test FCM message from Firebase Console → notification appears

---

## Firestore Security Rules

```bash
firebase deploy --only firestore:rules
```

Rules file is at `firestore.rules` in the repo root.
All privileged reads/writes go through the Worker (Admin SDK) — client SDK is only used for Anonymous Auth and FCM token registration.
