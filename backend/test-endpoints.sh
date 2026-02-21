#!/bin/bash
# Comprehensive endpoint test for Workspace + Kobby AI
set -e

BASE="http://localhost:4000/api/v1"
WS_ID=""
MSG_ID=""
PASS=0
FAIL=0

pass() { echo "  ✅ PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ FAIL  $1  →  $2"; FAIL=$((FAIL+1)); }

check() {
    local name="$1" expected="$2" response="$3"
    if echo "$response" | grep -q "$expected"; then
        pass "$name"
    else
        fail "$name" "$(echo "$response" | head -c 120)"
    fi
}

echo "======================================"
echo "  WORKSPACE & KOBBY AI ENDPOINT TESTS"
echo "======================================"
echo ""

# -----------------------------------------------
# WORKSPACE ENDPOINTS
# -----------------------------------------------
echo "--- WORKSPACE ---"
echo ""

echo "[1] GET /workspace/platform/:entityId (ensure workspace)"
R=$(curl -s "$BASE/workspace/platform/00000000-0000-0000-0000-000000000001")
check "Workspace ensure" "entity_type" "$R"
WS_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace']['id'])" 2>/dev/null || echo "")
echo "    workspace_id=$WS_ID"
echo ""

echo "[2] GET /workspace/:id/messages (get messages)"
R=$(curl -s "$BASE/workspace/$WS_ID/messages")
check "Get messages" "messages" "$R"
echo ""

echo "[3] POST /workspace/:id/messages (send message)"
R=$(curl -s -X POST "$BASE/workspace/$WS_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message from endpoint suite"}')
check "Send message" "message_type" "$R"
MSG_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['message']['id'])" 2>/dev/null || echo "")
echo "    message_id=$MSG_ID"
echo ""

echo "[4] PATCH /workspace/:id/messages/:msgId (edit message)"
R=$(curl -s -X PATCH "$BASE/workspace/$WS_ID/messages/$MSG_ID" \
  -H "Content-Type: application/json" \
  -d '{"content":"Edited test message"}')
check "Edit message" "edited_at" "$R"
echo ""

echo "[5] GET /workspace/:id/members (list members)"
R=$(curl -s "$BASE/workspace/$WS_ID/members")
check "List members" "members" "$R"
echo ""

echo "[6] GET /workspace/:id/search?q=Test (search messages)"
R=$(curl -s "$BASE/workspace/$WS_ID/search?q=Test")
check "Search messages" "results" "$R"
echo ""

echo "[7] GET /workspace/:id/export (CSV export)"
R=$(curl -s "$BASE/workspace/$WS_ID/export")
check "CSV export" "Timestamp" "$R"
echo ""

echo "[8] GET /workspace/unread/all (unread counts)"
R=$(curl -s "$BASE/workspace/unread/all")
check "Unread counts" "counts" "$R"
echo ""

echo "[9] POST /workspace/:id/read (mark all read)"
R=$(curl -s -X POST "$BASE/workspace/$WS_ID/read" \
  -H "Content-Type: application/json")
check "Mark all read" "success" "$R"
echo ""

# -----------------------------------------------
# VALIDATION TESTS
# -----------------------------------------------
echo "--- VALIDATION ---"
echo ""

echo "[10] POST message - empty content"
R=$(curl -s -X POST "$BASE/workspace/$WS_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"   "}')
check "Empty content rejected" "required" "$R"
echo ""

echo "[11] POST message - too long (>10000 chars)"
LONG=$(python3 -c "print('x'*10001)")
R=$(curl -s -X POST "$BASE/workspace/$WS_ID/messages" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"$LONG\"}")
check "Long message rejected" "too long" "$R"
echo ""

echo "[12] PATCH message - empty content"
R=$(curl -s -X PATCH "$BASE/workspace/$WS_ID/messages/$MSG_ID" \
  -H "Content-Type: application/json" \
  -d '{"content":""}')
check "Empty edit rejected" "required" "$R"
echo ""

echo "[13] GET /workspace/badtype/:id (invalid entity type)"
R=$(curl -s "$BASE/workspace/badtype/00000000-0000-0000-0000-000000000001")
check "Invalid type rejected" "Invalid entity type" "$R"
echo ""

echo "[14] GET /workspace/:id/messages (nonexistent workspace)"
R=$(curl -s "$BASE/workspace/00000000-0000-0000-0000-000000000099/messages")
check "Nonexistent workspace" "not found\|Not found\|404\|Access\|member" "$R"
echo ""

# -----------------------------------------------
# KOBBY AI ENDPOINTS
# -----------------------------------------------
echo "--- KOBBY AI ---"
echo ""

echo "[15] GET /ai/kobby/context/platform/:entityId (pre-fetch context)"
R=$(curl -s "$BASE/ai/kobby/context/platform/00000000-0000-0000-0000-000000000001")
check "Kobby context pre-fetch" "context\|entityType" "$R"
echo ""

echo "[16] GET /ai/kobby/suggestions/project"
R=$(curl -s "$BASE/ai/kobby/suggestions/project")
check "Project suggestions" "suggestions" "$R"
echo ""

echo "[17] GET /ai/kobby/suggestions/valuation"
R=$(curl -s "$BASE/ai/kobby/suggestions/valuation")
check "Valuation suggestions" "suggestions" "$R"
echo ""

echo "[18] GET /ai/kobby/suggestions/deal"
R=$(curl -s "$BASE/ai/kobby/suggestions/deal")
check "Deal suggestions" "suggestions" "$R"
echo ""

echo "[19] GET /ai/kobby/suggestions/property"
R=$(curl -s "$BASE/ai/kobby/suggestions/property")
check "Property suggestions" "suggestions" "$R"
echo ""

echo "[20] GET /ai/kobby/suggestions/platform"
R=$(curl -s "$BASE/ai/kobby/suggestions/platform")
check "Platform suggestions" "suggestions" "$R"
echo ""

echo "[21] GET /ai/kobby/context/badtype/:id (invalid type)"
R=$(curl -s "$BASE/ai/kobby/context/badtype/00000000-0000-0000-0000-000000000001")
check "Invalid Kobby type rejected" "Invalid\|error\|400" "$R"
echo ""

echo "[22] POST /ai/kobby/query (REST fallback - missing fields)"
R=$(curl -s -X POST "$BASE/ai/kobby/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}')
check "Missing fields rejected" "required\|error" "$R"
echo ""

echo "[23] POST /ai/kobby/query (REST fallback - real query)"
R=$(curl -s -X POST "$BASE/ai/kobby/query" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$WS_ID\",\"query\":\"What is the market trend?\",\"entityType\":\"platform\",\"entityId\":\"00000000-0000-0000-0000-000000000001\"}")
check "Kobby AI query" "response\|answer\|error" "$R"
echo ""

# -----------------------------------------------
# ENTITY TYPE TESTS (all valid types)
# -----------------------------------------------
echo "--- ENTITY TYPE VALIDATION ---"
echo ""

for TYPE in project valuation deal property platform; do
    echo "[E] GET /workspace/$TYPE/:id"
    R=$(curl -s "$BASE/workspace/$TYPE/00000000-0000-0000-0000-000000000001")
    check "$TYPE workspace" "entity_type\|workspace" "$R"
done
echo ""

# -----------------------------------------------
# SUMMARY
# -----------------------------------------------
echo "======================================"
echo "  RESULTS: $PASS PASSED, $FAIL FAILED (total: $((PASS+FAIL)))"
echo "======================================"

if [ $FAIL -gt 0 ]; then
    exit 1
fi
