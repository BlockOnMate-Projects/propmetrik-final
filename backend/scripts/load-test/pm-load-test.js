/**
 * Property Management API Load Testing
 * 
 * k6 load test script for critical PM endpoints.
 * 
 * Installation:
 *   brew install k6  (macOS)
 *   choco install k6 (Windows)
 * 
 * Usage:
 *   k6 run backend/scripts/load-test/pm-load-test.js
 *   k6 run --vus 50 --duration 5m backend/scripts/load-test/pm-load-test.js
 *   k6 run --env BASE_URL=https://api.propmetrik.com backend/scripts/load-test/pm-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const successRate = new Rate('success');
const propertyListLatency = new Trend('property_list_latency');
const tenantSearchLatency = new Trend('tenant_search_latency');
const paymentCreateLatency = new Trend('payment_create_latency');
const maintenanceCreateLatency = new Trend('maintenance_create_latency');
const financialReportLatency = new Trend('financial_report_latency');
const requestCounter = new Counter('total_requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const API_TOKEN = __ENV.API_TOKEN || 'test-token';
const ORG_ID = __ENV.ORG_ID || '00000000-0000-0000-0000-000000000001';

// Test data
const TEST_PROPERTY_ID = __ENV.TEST_PROPERTY_ID || '00000000-0000-0000-0000-000000000001';
const TEST_TENANT_ID = __ENV.TEST_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const TEST_UNIT_ID = __ENV.TEST_UNIT_ID || '00000000-0000-0000-0000-000000000001';

// Test options
export const options = {
  scenarios: {
    // Smoke test - baseline performance
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      startTime: '0s',
      gracefulStop: '5s',
    },
    // Load test - normal traffic
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },   // Ramp up to 20 users
        { duration: '3m', target: 20 },   // Hold at 20 users
        { duration: '1m', target: 50 },   // Ramp up to 50 users
        { duration: '3m', target: 50 },   // Hold at 50 users
        { duration: '1m', target: 0 },    // Ramp down
      ],
      startTime: '35s',
      gracefulStop: '30s',
    },
    // Stress test - find breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },  // Ramp to 100 users
        { duration: '5m', target: 100 },  // Hold at 100 users
        { duration: '2m', target: 200 },  // Ramp to 200 users
        { duration: '3m', target: 200 },  // Hold at 200 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
      startTime: '10m',
      gracefulStop: '60s',
    },
  },
  thresholds: {
    // Response time thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{endpoint:properties}': ['p(95)<300'],
    'http_req_duration{endpoint:payments}': ['p(95)<1000'],
    'http_req_duration{endpoint:financials}': ['p(95)<2000'],
    
    // Error rate thresholds
    errors: ['rate<0.01'],      // Less than 1% errors
    success: ['rate>0.95'],     // More than 95% success
    
    // Custom latency thresholds
    property_list_latency: ['p(95)<300'],
    tenant_search_latency: ['p(95)<400'],
    payment_create_latency: ['p(95)<1000'],
    financial_report_latency: ['p(95)<2000'],
  },
};

// Common headers
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_TOKEN}`,
    'X-Organization-Id': ORG_ID,
  };
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

export default function () {
  // Property Management API load test flow
  
  group('Property Operations', () => {
    testListProperties();
    testGetProperty();
    testListUnits();
  });

  group('Tenant Operations', () => {
    testListTenants();
    testSearchTenants();
    testGetTenant();
  });

  group('Payment Operations', () => {
    testListPayments();
    testGetPaymentSummary();
    // testCreatePayment(); // Only enable with proper test data
  });

  group('Maintenance Operations', () => {
    testListMaintenanceRequests();
    // testCreateMaintenanceRequest(); // Only enable with proper test data
  });

  group('Financial Reports', () => {
    testNOICalculation();
    testCapRateCalculation();
    testPortfolioSummary();
  });

  // Simulate user think time between operations
  sleep(Math.random() * 2 + 1);
}

// ============================================================================
// PROPERTY TESTS
// ============================================================================

function testListProperties() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/v1/pm/properties?page=1&limit=20`, {
    headers: getHeaders(),
    tags: { endpoint: 'properties' },
  });
  
  propertyListLatency.add(Date.now() - start);
  requestCounter.add(1);
  
  const success = check(res, {
    'properties list: status 200': (r) => r.status === 200,
    'properties list: has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testGetProperty() {
  const res = http.get(`${BASE_URL}/api/v1/pm/properties/${TEST_PROPERTY_ID}`, {
    headers: getHeaders(),
    tags: { endpoint: 'properties' },
  });
  
  requestCounter.add(1);
  
  const success = check(res, {
    'property get: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testListUnits() {
  const res = http.get(`${BASE_URL}/api/v1/pm/properties/${TEST_PROPERTY_ID}/units`, {
    headers: getHeaders(),
    tags: { endpoint: 'units' },
  });
  
  requestCounter.add(1);
  
  const success = check(res, {
    'units list: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

// ============================================================================
// TENANT TESTS
// ============================================================================

function testListTenants() {
  const res = http.get(`${BASE_URL}/api/v1/pm/tenants?page=1&limit=20`, {
    headers: getHeaders(),
    tags: { endpoint: 'tenants' },
  });
  
  requestCounter.add(1);
  
  const success = check(res, {
    'tenants list: status 200': (r) => r.status === 200,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testSearchTenants() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/v1/pm/tenants?search=john&page=1&limit=10`, {
    headers: getHeaders(),
    tags: { endpoint: 'tenants' },
  });
  
  tenantSearchLatency.add(Date.now() - start);
  requestCounter.add(1);
  
  const success = check(res, {
    'tenant search: status 200': (r) => r.status === 200,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testGetTenant() {
  const res = http.get(`${BASE_URL}/api/v1/pm/tenants/${TEST_TENANT_ID}`, {
    headers: getHeaders(),
    tags: { endpoint: 'tenants' },
  });
  
  requestCounter.add(1);
  
  const success = check(res, {
    'tenant get: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

// ============================================================================
// PAYMENT TESTS
// ============================================================================

function testListPayments() {
  const res = http.get(`${BASE_URL}/api/v1/pm/payments?page=1&limit=20`, {
    headers: getHeaders(),
    tags: { endpoint: 'payments' },
  });
  
  requestCounter.add(1);
  
  const success = check(res, {
    'payments list: status 200': (r) => r.status === 200,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testGetPaymentSummary() {
  const res = http.get(`${BASE_URL}/api/v1/pm/payments/summary?year=2024`, {
    headers: getHeaders(),
    tags: { endpoint: 'payments' },
  });
  
  requestCounter.add(1);
  
  const success = check(res, {
    'payment summary: status 200': (r) => r.status === 200,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testCreatePayment() {
  const start = Date.now();
  const payload = JSON.stringify({
    tenancyId: __ENV.TEST_TENANCY_ID,
    amount: 1500,
    paymentMethod: 'bank_transfer',
    paymentDate: new Date().toISOString().split('T')[0],
    reference: `TEST-${Date.now()}`,
  });
  
  const res = http.post(`${BASE_URL}/api/v1/pm/payments`, payload, {
    headers: getHeaders(),
    tags: { endpoint: 'payments' },
  });
  
  paymentCreateLatency.add(Date.now() - start);
  requestCounter.add(1);
  
  const success = check(res, {
    'payment create: status 201': (r) => r.status === 201,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

// ============================================================================
// MAINTENANCE TESTS
// ============================================================================

function testListMaintenanceRequests() {
  const res = http.get(`${BASE_URL}/api/v1/pm/maintenance/requests?status=open&page=1&limit=20`, {
    headers: getHeaders(),
    tags: { endpoint: 'maintenance' },
  });
  
  requestCounter.add(1);
  
  const success = check(res, {
    'maintenance list: status 200': (r) => r.status === 200,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testCreateMaintenanceRequest() {
  const start = Date.now();
  const payload = JSON.stringify({
    unitId: TEST_UNIT_ID,
    category: 'plumbing',
    priority: 'normal',
    description: 'Load test maintenance request',
    preferredTimeSlot: 'morning',
  });
  
  const res = http.post(`${BASE_URL}/api/v1/pm/maintenance/requests`, payload, {
    headers: getHeaders(),
    tags: { endpoint: 'maintenance' },
  });
  
  maintenanceCreateLatency.add(Date.now() - start);
  requestCounter.add(1);
  
  const success = check(res, {
    'maintenance create: status 201': (r) => r.status === 201,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

// ============================================================================
// FINANCIAL REPORTS TESTS
// ============================================================================

function testNOICalculation() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/v1/pm/financials/noi/${TEST_PROPERTY_ID}?year=2024`, {
    headers: getHeaders(),
    tags: { endpoint: 'financials' },
  });
  
  financialReportLatency.add(Date.now() - start);
  requestCounter.add(1);
  
  const success = check(res, {
    'NOI calc: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testCapRateCalculation() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/v1/pm/financials/cap-rate/${TEST_PROPERTY_ID}`, {
    headers: getHeaders(),
    tags: { endpoint: 'financials' },
  });
  
  financialReportLatency.add(Date.now() - start);
  requestCounter.add(1);
  
  const success = check(res, {
    'Cap rate calc: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

function testPortfolioSummary() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/v1/pm/financials/portfolio-summary`, {
    headers: getHeaders(),
    tags: { endpoint: 'financials' },
  });
  
  financialReportLatency.add(Date.now() - start);
  requestCounter.add(1);
  
  const success = check(res, {
    'Portfolio summary: status 200': (r) => r.status === 200,
  });
  
  errorRate.add(!success);
  successRate.add(success);
}

// ============================================================================
// CLEANUP & REPORTING
// ============================================================================

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalRequests: data.metrics.total_requests?.values?.count || 0,
    successRate: (data.metrics.success?.values?.rate || 0) * 100,
    errorRate: (data.metrics.errors?.values?.rate || 0) * 100,
    avgLatency: data.metrics.http_req_duration?.values?.avg || 0,
    p95Latency: data.metrics.http_req_duration?.values['p(95)'] || 0,
    p99Latency: data.metrics.http_req_duration?.values['p(99)'] || 0,
    
    // Custom metric summaries
    propertyListP95: data.metrics.property_list_latency?.values['p(95)'] || 0,
    tenantSearchP95: data.metrics.tenant_search_latency?.values['p(95)'] || 0,
    financialReportP95: data.metrics.financial_report_latency?.values['p(95)'] || 0,
    
    // Threshold results
    thresholdsPassed: Object.values(data.root_group?.checks || {})
      .filter(c => c.passes > 0).length,
    thresholdsFailed: Object.values(data.root_group?.checks || {})
      .filter(c => c.fails > 0).length,
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'backend/scripts/load-test/results/pm-load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
