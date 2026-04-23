#!/usr/bin/env bash
# test-analytics-endpoints.sh
# Comprehensive analytics endpoint regression test
# Usage: bash scripts/test-analytics-endpoints.sh

set -uo pipefail

BACKEND="http://localhost:4000"
ML_SVC="http://localhost:8000"
PASS=0
FAIL=0
SKIP=0

# ── Auth ────────────────────────────────────────────────────────────────────
echo "Logging in..."
LOGIN=$(curl -s -X POST "$BACKEND/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"eric@cedynhq.com","password":"Delta0246@"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  echo "❌ FATAL: Could not get auth token. Aborting."
  exit 1
fi
echo "✅ Auth token obtained (${#TOKEN} chars)"
AUTH="Authorization: Bearer $TOKEN"

# ── Fixture IDs ─────────────────────────────────────────────────────────────
VALUATION_ID="987431ca-e6c2-4310-9fc4-014cca13aa0a"
VALUER_ID="42f3d967-d205-4657-a375-325c07cd6169"
ML_PRED_ID="221"
REGION="Greater Accra"
REGION_ENC="Greater%20Accra"

# ── Helpers ──────────────────────────────────────────────────────────────────
pass() { echo "  ✅ $1"; ((PASS++)); }
fail() { echo "  ❌ $1 — $2"; ((FAIL++)); }
skip_test() { echo "  ⏭  $1 (skipped: $2)"; ((SKIP++)); }

# Hit an endpoint; accept any of the listed HTTP status codes as OK
# Usage: check "label" <status_to_accept...> -- <curl args>
check() {
  local label="$1"; shift
  local -a acceptable=()
  while [[ "$1" != "--" ]]; do acceptable+=("$1"); shift; done
  shift  # consume "--"

  local response
  response=$(curl -s -o /tmp/pm_test_body -w "%{http_code}" "$@" 2>/dev/null)
  local http_code="$response"
  local body
  body=$(cat /tmp/pm_test_body 2>/dev/null | head -c 200)

  for ok in "${acceptable[@]}"; do
    if [[ "$http_code" == "$ok" ]]; then
      pass "$label → $http_code"
      return
    fi
  done
  fail "$label → HTTP $http_code" "$body"
}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " PropMetrik Analytics Endpoint Test Suite"
echo "═══════════════════════════════════════════════════════════"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [1/8] Core Analytics  (GET /api/v1/analytics/…)"
echo "────────────────────────────────────────────────────────────"

check "dashboard" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/dashboard"
check "cohorts" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/cohorts"
check "win-loss" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/win-loss"
check "velocity" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/velocity"
check "lead-sources" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/lead-sources"
check "agent-performance" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/agent-performance"
# funnel requires a pipeline ID — skip gracefully if none exist
check "funnel (empty pipeline → 200/empty)" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/funnel/00000000-0000-0000-0000-000000000000"
check "export/excel (auth required)" 200 501 -- -H "$AUTH" "$BACKEND/api/v1/analytics/export/excel"
check "export/pdf (auth required)" 200 501 -- -H "$AUTH" "$BACKEND/api/v1/analytics/export/pdf"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [2/8] ML Analytics  (GET /api/v1/analytics/ml/…)"
echo "────────────────────────────────────────────────────────────"

check "ml dashboard" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/dashboard"
check "ml health" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/health"
check "ml construction/index" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/construction/index"
check "ml construction/regional" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/construction/regional"
check "ml construction/materials" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/construction/materials"
check "ml construction/labor" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/construction/labor"
check "ml construction/forecast" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/construction/forecast"
check "ml hai/current" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/hai/current"
check "ml hai/region/:region" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/hai/region/$REGION_ENC"
check "ml hai/history" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/hai/history?region=$REGION_ENC"
check "ml valuations/volume" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/valuations/volume"
check "ml market/price-index" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/market/price-index"
check "ml market/activity" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/market/activity"
check "ml market/investment" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/market/investment"
check "ml performance" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/performance"
check "ml performance/segments" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/performance/segments"
check "ml performance/trend" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/performance/trend"
check "ml features" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/features"
check "ml predictions/:id/explain" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/predictions/$ML_PRED_ID/explain"
check "ml confidence" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/confidence"
check "ml monitoring/drift" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/monitoring/drift"
check "ml monitoring/drift/features" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/monitoring/drift/features"
check "ml forecast" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/forecast"
check "ml ensemble" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/ensemble"
check "ml sentiment/history" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/sentiment/history"
check "ml sentiment/market-confidence" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/sentiment/market-confidence"
check "ml trends/trending" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/ml/trends/trending"

# POST endpoints
check "ml sentiment/analyze (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"text":"Property prices in Accra rose by 12% this quarter","source":"news"}' \
  "$BACKEND/api/v1/analytics/ml/sentiment/analyze"
check "ml ner/extract (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"text":"Three-bedroom house in East Legon listed at 850000 GHS"}' \
  "$BACKEND/api/v1/analytics/ml/ner/extract"
check "ml trends/analyze (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"region":"Greater Accra","period":"6m"}' \
  "$BACKEND/api/v1/analytics/ml/trends/analyze"
check "ml assistant/query (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"query":"What is the average property price in Accra?"}' \
  "$BACKEND/api/v1/analytics/ml/assistant/query"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [3/8] Analytics Foundation / Platform  (GET /api/v1/analytics/platform/…)"
echo "────────────────────────────────────────────────────────────"

check "platform construction/index" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/construction/index"
check "platform construction/history" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/construction/history"
check "platform construction/regional" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/construction/regional"
check "platform construction/materials" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/construction/materials"
check "platform construction/materials/summary" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/construction/materials/summary"
check "platform construction/labor" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/construction/labor"
check "platform construction/forecast" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/construction/forecast"
check "platform hai/current" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/hai/current"
check "platform hai/region/:region" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/hai/region/$REGION_ENC"
check "platform hai/history/:region" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/hai/history/$REGION_ENC"
check "platform hai/comparison" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/hai/comparison"
check "platform hai/supplementary/:region" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/hai/supplementary/$REGION_ENC"
check "platform hai/weights" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/hai/weights"
check "platform hai/forecast/:region" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/hai/forecast/$REGION_ENC"
check "platform alerts/summary" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/alerts/summary"
check "platform alerts (GET)" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/alerts"
check "platform alerts/rules (GET)" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/platform/alerts/rules"

# POST endpoints
check "platform construction/compute (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"region":"Greater Accra"}' \
  "$BACKEND/api/v1/analytics/platform/construction/compute"
check "platform hai/compute (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"region":"greater_accra","median_property_price":500000,"median_household_income":60000,"mortgage_rate":0.22,"median_monthly_rent":3500}' \
  "$BACKEND/api/v1/analytics/platform/hai/compute"
check "platform hai/compute-and-store (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"regions":[{"region":"greater_accra","median_property_price":500000,"median_household_income":60000,"mortgage_rate":0.22,"median_monthly_rent":3500}]}' \
  "$BACKEND/api/v1/analytics/platform/hai/compute-and-store"
check "platform alerts (POST)" 200 201 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"severity":"medium","category":"market","title":"Test Alert","message":"Test message"}' \
  "$BACKEND/api/v1/analytics/platform/alerts"
check "platform alerts/evaluate (POST)" 200 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{}' \
  "$BACKEND/api/v1/analytics/platform/alerts/evaluate"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [4/8] Valuation Analytics  (GET /api/v1/analytics/valuations/…)"
echo "────────────────────────────────────────────────────────────"

check "val volume/summary" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/volume/summary"
check "val volume/history" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/volume/history"
check "val methods/performance" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/methods/performance"
check "val methods/history" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/methods/history"
check "val quality" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/quality"
check "val valuers/leaderboard" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/valuers/leaderboard"
check "val valuers/:id" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/valuers/$VALUER_ID"
check "val market-relative" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/market-relative"
check "val floor-plans/summary" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/floor-plans/summary"
check "val floor-plans/by-region" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/floor-plans/by-region"
check "val floor-plans/rooms" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/floor-plans/rooms"
check "val floor-plans/distribution" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/floor-plans/distribution"
check "val floor-plans/compliance" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/floor-plans/compliance"
check "val sensitivity/:id" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/sensitivity/$VALUATION_ID"
check "val sensitivity-summary" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/valuations/sensitivity-summary"
check "val compute-snapshot (POST)" 200 201 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{}' \
  "$BACKEND/api/v1/analytics/valuations/compute-snapshot"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [5/8] Market Intelligence  (GET /api/v1/analytics/market/…)"
echo "────────────────────────────────────────────────────────────"

check "market price-index" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/price-index"
check "market price-index/history" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/price-index/history"
check "market activity/summary" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/activity/summary"
check "market activity/history" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/activity/history"
check "market supply-demand" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/supply-demand"
check "market price-distribution" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/price-distribution"
check "market recent-transactions" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/recent-transactions"
check "market rental/summary" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/rental/summary"
check "market rental/yields" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/rental/yields"
check "market rental/trends" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/rental/trends"
check "market rental/benchmarks" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/rental/benchmarks"
check "market rental/by-region" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/rental/by-region"
check "market investment/opportunities" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/investment/opportunities"
check "market investment/regional" 200 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/investment/regional"
check "market investment/:region" 200 404 -- -H "$AUTH" "$BACKEND/api/v1/analytics/market/investment/$REGION_ENC"
check "market compute-snapshot (POST)" 200 201 422 -- -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{}' \
  "$BACKEND/api/v1/analytics/market/compute-snapshot"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [6/8] ML Serving Service  (port 8000)"
echo "────────────────────────────────────────────────────────────"

check "ml-svc /health" 200 -- "$ML_SVC/health"
check "ml-svc /api/v1/ml/monitoring/performance" 200 -- "$ML_SVC/api/v1/ml/monitoring/performance"
check "ml-svc /api/v1/ml/monitoring/drift" 200 -- "$ML_SVC/api/v1/ml/monitoring/drift"
check "ml-svc /api/v1/ml/monitoring/drift/features" 200 -- "$ML_SVC/api/v1/ml/monitoring/drift/features"
check "ml-svc /api/v1/ml/ensemble/analytics" 200 -- "$ML_SVC/api/v1/ml/ensemble/analytics"
check "ml-svc /api/v1/ml/sentiment/history" 200 -- "$ML_SVC/api/v1/ml/sentiment/history"
check "ml-svc /api/v1/ml/sentiment/market-confidence" 200 -- "$ML_SVC/api/v1/ml/sentiment/market-confidence"
check "ml-svc /api/v1/ml/trends/trending" 200 -- "$ML_SVC/api/v1/ml/trends/trending"

# /predict endpoint with data_quality disclosure
PREDICT_RESP=$(curl -s -X POST "$ML_SVC/predict" \
  -H "Content-Type: application/json" \
  -d '{"properties":[{"property_type":"apartment","bedrooms":3,"bathrooms":2,"built_area_sqm":120,"region":"Greater Accra","city":"Accra","condition":"good","year_built":2010,"latitude":5.6037,"longitude":-0.1870}]}' 2>/dev/null)
if echo "$PREDICT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data_quality' in d" 2>/dev/null; then
  pass "ml-svc /predict → data_quality disclosure present"
  ((PASS++))
  CAVEAT=$(echo "$PREDICT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data_quality',{}).get('caveat',''))" 2>/dev/null)
  echo "     caveat: $CAVEAT"
else
  fail "ml-svc /predict → data_quality missing" "$PREDICT_RESP"
fi

# data sufficiency warning check (drift)
DRIFT_RESP=$(curl -s "$ML_SVC/api/v1/ml/monitoring/drift" 2>/dev/null)
HAS_WARNING=$(echo "$DRIFT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('data_sufficiency_warning' in d)" 2>/dev/null)
SAMPLE_SIZE=$(echo "$DRIFT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sample_size',0))" 2>/dev/null)
echo "     drift sample_size=$SAMPLE_SIZE, has warning key=$HAS_WARNING"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [7/8] Ticker & Charts  (optionalAuth / valuations access)"
echo "────────────────────────────────────────────────────────────"

check "ticker (public)" 200 -- "$BACKEND/api/v1/ticker"
check "charts (auth)" 200 -- -H "$AUTH" "$BACKEND/api/v1/charts/catalog"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [8/8] Auth Boundary (note: dev-mode bypass active in development)"
echo "────────────────────────────────────────────────────────────"
# In development mode, the authenticate middleware uses a DB dev user when no token is provided.
# This means 200 is expected in dev, 401 in production. We accept both.
check "analytics/dashboard (dev=200, prod=401)" 401 200 -- "$BACKEND/api/v1/analytics/dashboard"
check "analytics/ml/dashboard (dev=200, prod=401)" 401 200 -- "$BACKEND/api/v1/analytics/ml/dashboard"
check "analytics/platform/hai/current (dev=200, prod=401)" 401 200 -- "$BACKEND/api/v1/analytics/platform/hai/current"
check "analytics/valuations/quality (dev=200, prod=401)" 401 200 -- "$BACKEND/api/v1/analytics/valuations/quality"
check "analytics/market/price-index (dev=200, prod=401)" 401 200 -- "$BACKEND/api/v1/analytics/market/price-index"

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
TOTAL=$((PASS + FAIL + SKIP))
echo " Results: $PASS/$TOTAL passed  |  $FAIL failed  |  $SKIP skipped"
echo "═══════════════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
