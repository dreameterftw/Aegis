#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# e2e_test.sh — Full end-to-end integration test for Aegis (Phases 0–6)
#
# Prerequisites:
#   - Node.js 20+
#   - jq  (brew install jq / apt install jq)
#   - Worker deployed and reachable
#   - frontend/.env contains VITE_FIREBASE_API_KEY
#
# Usage:
#   bash test/e2e_test.sh
#
# Optional env vars:
#   WORKER_URL  override the worker URL
#   SA_KEY      path to service account key (for push test)
# ─────────────────────────────────────────────────────────────────────────────

set -e

WORKER_URL="${WORKER_URL:-https://aegis-router.dr3amtoosadr07.workers.dev}"
SA_KEY="${SA_KEY:-./serviceAccountKey.json}"
PASS=0
FAIL=0
SKIP=0

# ── Helpers ───────────────────────────────────────────────────────────────────

green()  { echo -e "\033[0;32m✓ $1\033[0m"; }
red()    { echo -e "\033[0;31m✗ $1\033[0m"; }
yellow() { echo -e "\033[0;33m~ $1\033[0m"; }

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" == "$expected" ]; then
    green "$label (got: $actual)"
    PASS=$((PASS+1))
  else
    red "$label — expected '$expected', got '$actual'"
    FAIL=$((FAIL+1))
  fi
}

assert_http() {
  local label="$1" actual="$2" expected="$3"
  assert_eq "$label (HTTP $expected)" "$actual" "$expected"
}

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         AEGIS  End-to-End Integration Test               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  Worker: $WORKER_URL"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 0 — Smoke test: worker is up
# ─────────────────────────────────────────────────────────────────────────────
echo "── Step 0/8: Worker health check ───────────────────────────"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$WORKER_URL/check-link")
assert_http "CORS preflight responds 204" "$HTTP" "204"

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Generate 3 distinct anonymous Firebase auth tokens
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 1/8: Generate 3 Firebase auth tokens (3 distinct devices) ──"
echo "   (Each call creates a fresh anonymous UID — no reuse)"

TOKEN_1=$(node test/get_test_token.js 2>/dev/null)
TOKEN_2=$(node test/get_test_token.js 2>/dev/null)
TOKEN_3=$(node test/get_test_token.js 2>/dev/null)

if [ -z "$TOKEN_1" ] || [ -z "$TOKEN_2" ] || [ -z "$TOKEN_3" ]; then
  red "Failed to generate test tokens — check VITE_FIREBASE_API_KEY in frontend/.env"
  exit 1
fi
green "3 distinct auth tokens generated"

# Use a timestamped domain so tests don't collide across runs
TEST_DOMAIN="e2e-$(date +%s)-phish.in"
echo "   Test domain: $TEST_DOMAIN"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — First report (count should be 1, no propagation)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 2/8: Device 1 reports the phishing link ────────────"
RESP2=$(curl -s -X POST "$WORKER_URL/check-link" \
  -H "Authorization: Bearer $TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://$TEST_DOMAIN\",\"onnxScore\":0.93,\"pincode\":\"400001\"}")

echo "   Response: $RESP2" | head -c 200
COUNT_1=$(echo "$RESP2" | jq -r '.communityReportCount // 0')
PROP_1=$(echo "$RESP2" | jq -r '.communityPropagated // false')
assert_eq "reportCount after device 1" "$COUNT_1" "1"
assert_eq "not yet propagated" "$PROP_1" "false"

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Same UID tries to report again (duplicate, should not increment)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 3/8: Device 1 duplicate report (abuse-resistance check) ──"
RESP3=$(curl -s -X POST "$WORKER_URL/report-signal" \
  -H "Authorization: Bearer $TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"hashOrDomain\":\"$TEST_DOMAIN\",\"type\":\"link\",\"pincode\":\"400002\"}")

echo "   Response: $RESP3" | head -c 200
DUPLICATE=$(echo "$RESP3" | jq -r '.duplicate // false')
COUNT_AFTER_DUP=$(echo "$RESP3" | jq -r '.reportCount // 0')
assert_eq "duplicate flag set" "$DUPLICATE" "true"
assert_eq "count not incremented by duplicate" "$COUNT_AFTER_DUP" "1"

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Unauthenticated report must be rejected (401)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 4/8: Unauthenticated report must be rejected ───────"
HTTP_UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/report-signal" \
  -H "Content-Type: application/json" \
  -d "{\"hashOrDomain\":\"$TEST_DOMAIN\",\"type\":\"link\"}")
assert_http "unauthenticated report rejected" "$HTTP_UNAUTH" "401"

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Device 2 reports (count → 2, still no propagation)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 5/8: Device 2 reports same link ────────────────────"
RESP5=$(curl -s -X POST "$WORKER_URL/report-signal" \
  -H "Authorization: Bearer $TOKEN_2" \
  -H "Content-Type: application/json" \
  -d "{\"hashOrDomain\":\"$TEST_DOMAIN\",\"type\":\"link\",\"pincode\":\"110001\"}")

echo "   Response: $RESP5" | head -c 200
COUNT_2=$(echo "$RESP5" | jq -r '.reportCount // 0')
PROP_2=$(echo "$RESP5" | jq -r '.propagated // false')
assert_eq "reportCount after device 2" "$COUNT_2" "2"
assert_eq "not yet propagated at 2" "$PROP_2" "false"

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Device 3 reports (count → 3, triggers auto-propagation)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 6/8: Device 3 reports — triggers auto-propagation ──"
RESP6=$(curl -s -X POST "$WORKER_URL/report-signal" \
  -H "Authorization: Bearer $TOKEN_3" \
  -H "Content-Type: application/json" \
  -d "{\"hashOrDomain\":\"$TEST_DOMAIN\",\"type\":\"link\",\"pincode\":\"560001\"}")

echo "   Response: $RESP6" | head -c 200
COUNT_3=$(echo "$RESP6" | jq -r '.reportCount // 0')
PROP_3=$(echo "$RESP6" | jq -r '.propagated // false')
assert_eq "reportCount after device 3" "$COUNT_3" "3"
assert_eq "propagated at 3 reports" "$PROP_3" "true"

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Device 4 (no auth) checks the domain — should be a cache hit
# This proves the "Waze model": 4th device benefits from 3 strangers' reports
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 7/8: Device 4 (unauthenticated) checks same domain ─"
echo "   (Proves community protection works for non-reporters)"

# Give Firestore a moment to write (eventual consistency)
sleep 2

RESP7=$(curl -s -X POST "$WORKER_URL/check-link" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://$TEST_DOMAIN\",\"onnxScore\":0.1}")

echo "   Response: $RESP7" | head -c 200
SOURCE_7=$(echo "$RESP7" | jq -r '.source // "unknown"')
assert_eq "domain now served from cache (blocklist hit)" "$SOURCE_7" "cache"

# ─────────────────────────────────────────────────────────────────────────────
# Step 8 — Heatmap contains the 3 reporting pincodes
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Step 8/8: Heatmap contains reporting pincodes ───────────"
HEATMAP=$(curl -s "$WORKER_URL/heatmap")
MATCHES=$(echo "$HEATMAP" | jq '[.[] | select(.pincode == "400001" or .pincode == "110001" or .pincode == "560001")] | length' 2>/dev/null || echo "0")
assert_eq "heatmap contains at least 1 test pincode" "$([ "$MATCHES" -ge 1 ] && echo 'true' || echo 'false')" "true"

# ─────────────────────────────────────────────────────────────────────────────
# Optional: Push notification test (requires service account key)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Push test (optional — requires serviceAccountKey.json) ──"
if [ -f "$SA_KEY" ]; then
  echo "   Sending test push to all subscribed devices..."
  node test/test_push.js "$TEST_DOMAIN" "$SA_KEY" && green "Push script completed — check subscribed device" || yellow "Push script failed (non-fatal)"
  SKIP=$((SKIP+1))
else
  yellow "Skipped — $SA_KEY not found. Run manually: node test/test_push.js <domain> <sa-key.json>"
  SKIP=$((SKIP+1))
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
printf  "║  Results:  %-10s %-10s %-10s         ║\n" "${PASS} passed" "${FAIL} failed" "${SKIP} skipped"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed. Review output above."
  exit 1
else
  echo "All checks passed. Backend is demo-ready."
  exit 0
fi
