#!/usr/bin/env bash
# put-secrets.sh — Push all required Worker secrets to Cloudflare
# Run once after `wrangler login`. Values are pasted interactively — nothing is stored in this file.

set -e

echo "=== aegis-router Worker Secrets Setup ==="
echo "You will be prompted to paste each secret value."
echo ""

cd "$(dirname "$0")/../worker"

echo "1/3  Firebase Service Account JSON"
echo "     Paste the full JSON key as one line, then press Enter"
wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON

echo "2/3  Groq API Key"
wrangler secret put GROQ_API_KEY

echo "3/3  VirusTotal API Key"
wrangler secret put VIRUSTOTAL_API_KEY

echo ""
echo "All secrets stored. Run 'wrangler dev' to test locally."
echo ""
echo "Note: PhishTank dropped (closed to new users). Ingestion uses OpenPhish + URLhaus instead — no keys needed."
