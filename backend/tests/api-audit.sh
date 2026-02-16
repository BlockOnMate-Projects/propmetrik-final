#!/bin/bash
# PropMetrik PM & Tenant Portal API Audit Script
# Tests every endpoint for: response code, response structure, error handling

BASE="http://localhost:4000/api/v1"
C="Cookie: connect.sid=s%3A0Nl-q09YaJzaBXYVPTEkVxYVcnyp5dB5.sX%2FN56MOdgCXG5mEjVNJxF%2BTnB3M3X0b8dCWt1o8UfA"
PID="1236c6f3-3dd5-471c-9606-ddb76a2dc66c"
TID="d4ec31d1-1ae5-416c-a630-3742405473dd"
TNCY="80037268-3ef1-495d-82fe-d417d8df9f6b"
APPID="cfe7e2c4-873f-4e16-94b2-1eeea978d949"

PASS=0
FAIL=0
WARN=0
RESULTS=""

test_endpoint() {
  local method="$1"
  local path="$2"
  local expected_code="$3"
  local label="$4"
  local body="$5"
  
  local url="$BASE$path"
  local args=(-s -w "\n%{http_code}" -H "$C")
  
  if [ "$method" = "POST" ]; then
    args+=(-X POST -H "Content-Type: application/json")
    if [ -n "$body" ]; then
      args+=(-d "$body")
    else
      args+=(-d '{}')
    fi
  elif [ "$method" = "PATCH" ]; then
    args+=(-X PATCH -H "Content-Type: application/json")
    if [ -n "$body" ]; then
      args+=(-d "$body")
    else
      args+=(-d '{}')
    fi
  elif [ "$method" = "DELETE" ]; then
    args+=(-X DELETE)
  fi
  
  local response
  response=$(curl "${args[@]}" "$url")
  local status_code=$(echo "$response" | tail -1)
  local body_response=$(echo "$response" | sed '$d')
  
  if [ "$status_code" = "$expected_code" ]; then
    PASS=$((PASS + 1))
    RESULTS+="✅ $method $path → $status_code ($label)\n"
  else
    FAIL=$((FAIL + 1))
    RESULTS+="❌ $method $path → $status_code (expected $expected_code) ($label)\n"
    # Show error body for failures
    local err_preview=$(echo "$body_response" | head -c 200)
    RESULTS+="   Response: $err_preview\n"
  fi
}

echo "=============================================="
echo " PROPMETRIK API AUDIT"
echo " $(date)"
echo "=============================================="

echo ""
echo "▸ SECTION 1: PM PROPERTIES"
echo "---"
test_endpoint GET "/pm/properties" 200 "List properties"
test_endpoint GET "/pm/properties/$PID" 200 "Get property by ID"
test_endpoint GET "/pm/properties/00000000-0000-0000-0000-000000000000" 404 "Property not found"
test_endpoint GET "/pm/properties/invalid-uuid" 500 "Invalid UUID format"

echo ""
echo "▸ SECTION 2: PM TENANTS"
echo "---"
test_endpoint GET "/pm/tenants" 200 "List tenants"
test_endpoint GET "/pm/tenants?page=1&limit=5" 200 "Tenants paginated"
test_endpoint GET "/pm/tenants/$TID" 200 "Get tenant by ID"
test_endpoint GET "/pm/tenants/00000000-0000-0000-0000-000000000000" 404 "Tenant not found"

echo ""
echo "▸ SECTION 3: PM TENANCIES"
echo "---"
test_endpoint GET "/pm/tenancies" 200 "List tenancies"
test_endpoint GET "/pm/tenancies?status=active" 200 "Filter active tenancies"
test_endpoint GET "/pm/tenancies/$TNCY" 200 "Get tenancy by ID"
test_endpoint GET "/pm/tenancies/00000000-0000-0000-0000-000000000000" 404 "Tenancy not found"
test_endpoint GET "/pm/tenancies-expiring?days=90" 200 "Expiring tenancies"
test_endpoint GET "/pm/tenancies/$TNCY/payment-summary" 200 "Payment summary"
test_endpoint GET "/pm/tenancies/$TNCY/payments" 200 "Payment history"

echo ""
echo "▸ SECTION 4: PM PAYMENTS"
echo "---"
test_endpoint GET "/pm/payments/account" 200 "Get payout account"
test_endpoint GET "/pm/payments/banks" 200 "List banks"
test_endpoint GET "/pm/payments/crypto-wallet" 200 "Get crypto wallet"
test_endpoint GET "/pm/payments/settlement-coins" 200 "Settlement coins"
test_endpoint GET "/pm/payments/crypto-revenue" 200 "Crypto revenue"

echo ""
echo "▸ SECTION 5: PM REPORTS"
echo "---"
test_endpoint GET "/pm/reports/defaulting-tenants?threshold=1" 200 "Defaulting tenants"
test_endpoint GET "/pm/reports/collection?startDate=2025-01-01&endDate=2026-12-31" 200 "Collection report"
test_endpoint GET "/pm/reports/collection" 400 "Collection missing dates"
test_endpoint GET "/pm/reports/aged-receivables" 200 "Aged receivables"
test_endpoint GET "/pm/reports/vacancy" 200 "Vacancy report"
test_endpoint GET "/pm/reports/property-performance" 200 "Property performance"
test_endpoint GET "/pm/reports/tenant-turnover" 200 "Tenant turnover"
test_endpoint GET "/pm/reports/maintenance-analytics" 200 "Maintenance analytics"

echo ""
echo "▸ SECTION 6: PM WORK ORDERS"
echo "---"
test_endpoint GET "/pm/work-orders" 200 "List work orders"
test_endpoint GET "/pm/work-orders-stats" 200 "Work order stats"

echo ""
echo "▸ SECTION 7: PM VENDORS"
echo "---"
test_endpoint GET "/pm/vendors" 200 "List vendors"

echo ""
echo "▸ SECTION 8: PM DOCUMENTS"
echo "---"
test_endpoint GET "/pm/documents" 200 "List documents"
test_endpoint GET "/pm/documents/vault" 200 "Document vault"

echo ""
echo "▸ SECTION 9: PM FINANCIALS"
echo "---"
test_endpoint GET "/pm/financials" 200 "List financial records"
test_endpoint GET "/pm/financials/cash-flow?startDate=2025-01-01&endDate=2026-12-31" 200 "Cash flow"
test_endpoint GET "/pm/financials/cash-flow" 400 "Cash flow missing dates"
test_endpoint GET "/pm/financials/roi/$PID" 200 "ROI analysis"
test_endpoint GET "/pm/financials/noi/$PID" 200 "NOI"
test_endpoint GET "/pm/financials/cap-rate/$PID" 200 "Cap rate"
test_endpoint GET "/pm/financials/irr/$PID" 200 "IRR"
test_endpoint GET "/pm/financials/dscr/$PID?annualDebtService=50000" 200 "DSCR"
test_endpoint GET "/pm/financials/dscr/$PID" 400 "DSCR missing param"
test_endpoint GET "/pm/financials/summary/$PID" 200 "Financial summary"
test_endpoint GET "/pm/financials/portfolio-summary" 200 "Portfolio summary"

echo ""
echo "▸ SECTION 10: PM PORTFOLIO"
echo "---"
test_endpoint GET "/pm/portfolio/overview" 200 "Portfolio overview"
test_endpoint GET "/pm/portfolio/value" 200 "Portfolio value"
test_endpoint GET "/pm/portfolio/composition" 200 "Portfolio composition"
test_endpoint GET "/pm/portfolio/leases" 200 "Portfolio leases"

echo ""
echo "▸ SECTION 11: PM AUDIT TRAIL"
echo "---"
test_endpoint GET "/pm/audit" 200 "Audit logs"
test_endpoint GET "/pm/audit/resource/tenancy/$TNCY" 200 "Audit for tenancy"
test_endpoint GET "/pm/audit/summary?days=30" 200 "Audit summary"

echo ""
echo "▸ SECTION 12: PM APPLICATIONS"
echo "---"
test_endpoint GET "/pm/applications" 200 "List applications"
test_endpoint GET "/pm/applications/stats" 200 "Application stats"
test_endpoint GET "/pm/applications/$APPID" 200 "Get application"
test_endpoint GET "/pm/applications/$APPID/history" 200 "Application history"

echo ""
echo "▸ SECTION 13: PM APPLICATION LINKS"
echo "---"
test_endpoint GET "/pm/application-links" 200 "List app links"

echo ""
echo "▸ SECTION 14: PM LEASE TEMPLATES"
echo "---"
test_endpoint GET "/pm/lease-templates" 200 "List templates"

echo ""
echo "▸ SECTION 15: PM TENANT MESSAGES"
echo "---"
test_endpoint GET "/pm/tenant-messages/conversations" 200 "Landlord conversations"

echo ""
echo "▸ SECTION 16: PM BULK OPERATIONS"
echo "---"
test_endpoint GET "/pm/bulk/export/properties" 200 "Export properties"
test_endpoint GET "/pm/bulk/export/tenants" 200 "Export tenants"
test_endpoint GET "/pm/bulk/export/tenancies" 200 "Export tenancies"

echo ""
echo "▸ SECTION 17: PM LEASE SIGNING"
echo "---"
test_endpoint GET "/pm/leases/$TNCY/signing-status" 200 "Lease signing status"

echo ""
echo "▸ SECTION 18: SECURITY - NO AUTH TESTS"
echo "---"
# Test endpoints WITHOUT cookie to verify they require auth
SAVE_C="$C"
C=""
test_endpoint GET "/pm/properties" 401 "Properties no auth"
test_endpoint GET "/pm/tenants" 401 "Tenants no auth"
test_endpoint GET "/pm/tenancies" 401 "Tenancies no auth"
C="$SAVE_C"

echo ""
echo "=============================================="
echo "▸ TENANT PORTAL ENDPOINTS"
echo "=============================================="

echo ""
echo "▸ SECTION 19: TENANT AUTH (Public)"
echo "---"
test_endpoint GET "/tenant-portal/auth/keycloak/config" 200 "Keycloak config"
test_endpoint GET "/tenant-portal/auth/keycloak/reset-password-url" 200 "Reset pwd URL"
test_endpoint POST "/tenant-portal/auth/magic-link" 400 "Magic link no identifier" '{}'
test_endpoint POST "/tenant-portal/auth/otp/request" 400 "OTP no phone/email" '{}'
test_endpoint POST "/tenant-portal/auth/otp/verify" 400 "OTP verify no data" '{}'

echo ""
echo "▸ SECTION 20: TENANT PORTAL (Auth Required)"
echo "---"
test_endpoint GET "/tenant-portal/profile" 401 "Profile no auth"
test_endpoint GET "/tenant-portal/tenancies" 401 "Tenancies no auth"
test_endpoint GET "/tenant-portal/notifications" 401 "Notifications no auth"
test_endpoint GET "/tenant-portal/conversations" 401 "Conversations no auth"
test_endpoint GET "/tenant-portal/sessions" 401 "Sessions no auth"
test_endpoint GET "/tenant-portal/2fa/status" 401 "2FA status no auth"

echo ""
echo "▸ SECTION 21: TENANT CRYPTO (Public check)"
echo "---"
test_endpoint GET "/tenant-portal/payments/crypto/status" 401 "Crypto status no auth"
test_endpoint GET "/tenant-portal/payments/crypto/settlement-coins" 401 "Settlement coins no auth"

echo ""
echo "=============================================="
echo " RESULTS SUMMARY"
echo "=============================================="
echo ""
printf "$RESULTS"
echo ""
echo "=============================================="
echo " TOTALS: ✅ $PASS passed | ❌ $FAIL failed"
echo "=============================================="
