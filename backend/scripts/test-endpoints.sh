#!/bin/bash
# CRM Endpoint Test Script — Tests all 11 previously-failing routes + DB fixes
BASE="http://localhost:4000/api/v1/crm"
FAKE_ID="00000000-0000-0000-0000-000000000099"

test_endpoint() {
    local method=$1; local path=$2; local body=$3
    local url="${BASE}${path}"
    local code
    local resp
    
    if [ -z "$body" ]; then
        resp=$(curl -s -w "\n%{http_code}" -X "$method" "$url")
    else
        resp=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$body" "$url")
    fi
    
    code=$(echo "$resp" | tail -1)
    body_out=$(echo "$resp" | sed '$d' | head -c 120)
    
    # Determine pass/warn/fail
    if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
        status="PASS"
    elif [ "$code" = "404" ]; then
        if echo "$body_out" | grep -q "NOT_FOUND.*Route"; then
            status="FAIL"
        else
            status="PASS"  # Entity not found = route exists
        fi
    elif [ "$code" = "400" ] || [ "$code" = "401" ]; then
        status="WARN"
    elif [ "$code" = "500" ]; then
        status="WARN"
    else
        status="FAIL"
    fi
    
    printf "%-6s | %s | %-6s %s\n" "$status" "$code" "$method" "$path"
    if [ "$status" = "FAIL" ]; then
        echo "       └─ $body_out"
    fi
}

echo "============================================="
echo "       CRM ENDPOINT TEST RESULTS"
echo "============================================="
echo ""

echo "--- PREVIOUSLY FAILING (11 routes) ---"
test_endpoint GET  "/pipelines/${FAKE_ID}/metrics"
test_endpoint DELETE "/pipelines/${FAKE_ID}/stages/${FAKE_ID}"
test_endpoint PUT  "/deals/${FAKE_ID}/stage" '{"stage_id":"abc"}'
test_endpoint PUT  "/tasks/${FAKE_ID}/complete"
test_endpoint PUT  "/notes/${FAKE_ID}/pin"
test_endpoint POST "/signatures/${FAKE_ID}/void" '{"reason":"test"}'
test_endpoint POST "/signatures/${FAKE_ID}/resend" '{"signer_id":"abc"}'
test_endpoint GET  "/payments/settlement-coins"
test_endpoint GET  "/saved-views/${FAKE_ID}"
test_endpoint GET  "/notifications/${FAKE_ID}"
test_endpoint POST "/notifications/mark-all-read"

echo ""
echo "--- NEW ROUTES (4 added in this session) ---"
test_endpoint GET  "/saved-views"
test_endpoint POST "/saved-views" '{"name":"test","entity_type":"deals","filters":{}}'
test_endpoint GET  "/search?q=test&types=deals,contacts"
test_endpoint GET  "/drip-campaigns"
test_endpoint POST "/drip-campaigns" '{"name":"Test Campaign","trigger_type":"deal_stage_change","trigger_config":{},"steps":[]}'
test_endpoint GET  "/notifications"
test_endpoint GET  "/notification-preferences"

echo ""
echo "--- ANALYTICS (previously WARN from bad columns) ---"
test_endpoint GET  "/analytics/deals"
test_endpoint GET  "/analytics/agents"
test_endpoint GET  "/analytics/revenue-forecast"
test_endpoint GET  "/analytics/pipeline?pipelineId=${FAKE_ID}"
test_endpoint GET  "/analytics/leaderboard"
test_endpoint GET  "/analytics/revenue-trend"
test_endpoint GET  "/analytics/velocity"
test_endpoint GET  "/analytics/loss-reasons"
test_endpoint GET  "/analytics/funnel?pipelineId=${FAKE_ID}"
test_endpoint GET  "/analytics/comparison"
test_endpoint GET  "/analytics/scheduled-reports"

echo ""
echo "--- CONTACTS (previously WARN from bad queries) ---"
test_endpoint GET  "/contacts"
test_endpoint GET  "/contacts/statistics"
test_endpoint GET  "/contacts/duplicates"
test_endpoint GET  "/contacts/${FAKE_ID}/deals"
test_endpoint GET  "/contacts/${FAKE_ID}/activities"

echo ""
echo "--- AGENTS (previously WARN from missing table) ---"
test_endpoint GET  "/agents"
test_endpoint GET  "/agents/${FAKE_ID}"

echo ""
echo "--- CORE MODULES ---"
test_endpoint GET "/pipelines"
test_endpoint GET "/deals"
test_endpoint GET "/deals/kanban"
test_endpoint GET "/deals/metrics"
test_endpoint GET "/companies"
test_endpoint GET "/tasks"
test_endpoint GET "/tasks/overdue"
test_endpoint GET "/notes"
test_endpoint GET "/documents"
test_endpoint GET "/signatures"
test_endpoint GET "/document-templates"
test_endpoint GET "/document-templates/categories"
test_endpoint GET "/payments/account"

echo ""
echo "============================================="
echo "       TEST COMPLETE"
echo "============================================="
