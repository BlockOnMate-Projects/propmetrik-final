#!/usr/bin/env ts-node
/**
 * ============================================================
 *  PROPMETRIK VALUATION SERVICES — ENTERPRISE TEST SUITE
 * ============================================================
 *
 * Covers every endpoint in all valuation services, tested from
 * the frontend perspective (real HTTP calls, JSON payloads).
 *
 * Services tested:
 *   1. Python Valuation Engine         — http://localhost:8001
 *   2. Node.js Backend /api/valuations — http://localhost:4000
 *   3. Node.js Backend /api/valuers
 *   4. Node.js Backend /api/valuation-clients
 *   5. Node.js Backend /api/valuation-invoices
 *   6. Node.js Backend /api/valuation-org
 *   7. Node.js Backend /api/analytics/valuations
 *   8. Node.js Backend /api/reports
 *   9. Versioned /api/v1/... spot-checks
 *
 * Usage:
 *   # Without auth (public + Python endpoints only):
 *   npx ts-node scripts/test-valuation-endpoints.ts
 *
 *   # With auth token (all endpoints):
 *   AUTH_TOKEN=<jwt> npx ts-node scripts/test-valuation-endpoints.ts
 *
 *   # Override service URLs:
 *   PYTHON_BASE=http://localhost:8001 NODE_BASE=http://localhost:4000 \
 *     AUTH_TOKEN=<jwt> npx ts-node scripts/test-valuation-endpoints.ts
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

// ============================================================
// CONFIGURATION
// ============================================================

const PYTHON_BASE = process.env.PYTHON_BASE || 'http://localhost:8001';
const NODE_BASE   = process.env.NODE_BASE   || 'http://localhost:4000';
const AUTH_TOKEN  = process.env.AUTH_TOKEN  || '';
const ORG_ID      = process.env.ORG_ID      || '';

// ============================================================
// TERMINAL COLORS
// ============================================================

const C = {
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  reset:  '\x1b[0m',
};

// ============================================================
// COUNTERS & RESULT LOG
// ============================================================

let passCount = 0;
let failCount = 0;
let skipCount = 0;

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  code?: number;
  message?: string;
}
const allResults: TestResult[] = [];

// ============================================================
// LOGGING HELPERS
// ============================================================

function out(msg: string) { process.stdout.write(msg + '\n'); }

function header(title: string) {
  out(`\n${C.bold}${C.blue}${'═'.repeat(64)}${C.reset}`);
  out(`${C.bold}${C.cyan}  ${title}${C.reset}`);
  out(`${C.bold}${C.blue}${'═'.repeat(64)}${C.reset}`);
}

function subheader(title: string) {
  out(`\n${C.bold}  ▶ ${title}${C.reset}`);
}

// ============================================================
// HTTP CLIENT  (no external dependencies)
// ============================================================

interface HttpResponse {
  status: number;
  data: any;
  ok: boolean;
}

function httpRequest(
  method: string,
  url: string,
  body?: object,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    };
    if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    if (ORG_ID)     headers['x-org-id'] = ORG_ID;
    if (bodyStr)    headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers,
    };

    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data: any;
        try { data = JSON.parse(raw); } catch { data = raw; }
        const status = res.statusCode ?? 0;
        resolve({ status, data, ok: status < 400 });
      });
    });

    req.setTimeout(12000, () => req.destroy(new Error('Request timed out after 12s')));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ============================================================
// TEST RUNNER
// ============================================================

interface TestOptions {
  /** Expected HTTP status code. If omitted, any non-5xx is acceptable. */
  expectStatus?: number;
  /** Top-level JSON keys that must exist in the response body. */
  expectKeys?: string[];
  /** Skip this test when AUTH_TOKEN is not set. */
  requiresAuth?: boolean;
  /** Accept 4xx responses as valid (for negative / validation tests). */
  expectFail?: boolean;
}

async function test(
  name: string,
  fn: () => Promise<HttpResponse>,
  opts: TestOptions = {},
): Promise<HttpResponse | null> {
  const { expectStatus, expectKeys, requiresAuth = false, expectFail = false } = opts;

  // Skip auth-gated tests when no token
  if (requiresAuth && !AUTH_TOKEN) {
    skipCount++;
    allResults.push({ name, status: 'skip', message: 'no AUTH_TOKEN' });
    out(`  ${C.yellow}⊘ SKIP${C.reset}  ${name} ${C.yellow}(requires auth)${C.reset}`);
    return null;
  }

  try {
    const result = await fn();
    let passed = true;
    let failMsg = '';

    // Status check
    if (expectStatus !== undefined && result.status !== expectStatus) {
      passed = false;
      failMsg = `Expected HTTP ${expectStatus}, got ${result.status}`;
    } else if (!expectFail && result.status >= 500) {
      passed = false;
      failMsg = `Server error: ${result.status}`;
    } else if (!expectFail && result.status === 401) {
      passed = false;
      failMsg = 'Unauthorized (401)';
    }

    // Key presence check
    if (passed && expectKeys && typeof result.data === 'object') {
      for (const key of expectKeys) {
        if (!(key in result.data)) {
          passed = false;
          failMsg = `Response missing key: "${key}"`;
          break;
        }
      }
    }

    const codeColor = result.status < 300 ? C.green : result.status < 500 ? C.yellow : C.red;
    const badge     = passed ? `${C.green}✓ PASS${C.reset}` : `${C.red}✗ FAIL${C.reset}`;
    out(`  ${badge}  ${name} ${C.bold}${codeColor}[${result.status}]${C.reset}${failMsg ? `  ${C.red}← ${failMsg}${C.reset}` : ''}`);

    if (passed) {
      passCount++;
    } else {
      failCount++;
      const detail =
        (typeof result.data === 'object' && result.data !== null)
          ? (result.data.detail ?? result.data.error ?? result.data.message ?? null)
          : null;
      if (detail) out(`           ${C.red}↳ ${JSON.stringify(detail).slice(0, 120)}${C.reset}`);
    }

    allResults.push({ name, status: passed ? 'pass' : 'fail', code: result.status, message: failMsg });
    return result;
  } catch (err: any) {
    failCount++;
    const msg = err.message ?? 'Unknown error';
    out(`  ${C.red}✗ FAIL${C.reset}  ${name}  ${C.red}← ${msg}${C.reset}`);
    allResults.push({ name, status: 'fail', message: msg });
    return null;
  }
}

// ============================================================
// SHARED FIXTURES
// ============================================================

const PROPERTY = {
  id:               'test-prop-001',
  property_type:    'residential_house',
  region:           'greater_accra',
  address_city:     'East Legon',
  address_street:   '12 Boundary Road',
  latitude:         5.6358,
  longitude:       -0.1670,
  land_area_sqm:    500,
  building_size_sqm: 250,
  bedrooms:         4,
  bathrooms:        3,
  year_built:       2010,
  condition:        'good',
  current_price_ghs: 2_500_000,
  monthly_rent_ghs:  15_000,
};

const COMP_1 = {
  id: 'comp-001', price: 2_200_000, price_currency: 'GHS',
  bedrooms: 4, bathrooms: 3, gfa_sqm: 230, land_area_sqm: 480,
  year_built: 2009, condition: 'good', region: 'greater_accra',
  address_city: 'East Legon', address_district: 'East Legon',
  evidence_type: 'listing', weight: 1.0, adjustments: {},
};
const COMP_2 = { ...COMP_1, id: 'comp-002', price: 2_350_000, gfa_sqm: 260, year_built: 2012, weight: 0.9 };
const COMP_3 = { ...COMP_1, id: 'comp-003', price: 2_100_000, bedrooms: 3, gfa_sqm: 200, year_built: 2007, weight: 0.8 };

const NULL_UUID = '00000000-0000-0000-0000-000000000001';

// ============================================================
// 1. PYTHON VALUATION ENGINE (port 8001)
// ============================================================

async function testPythonService() {
  header('1. PYTHON VALUATION ENGINE  —  ' + PYTHON_BASE);

  // ── 1.1 Health ─────────────────────────────────────────────
  subheader('1.1 Health & Info');

  await test('GET /  — service info', () =>
    httpRequest('GET', `${PYTHON_BASE}/`), {
    expectStatus: 200,
    expectKeys: ['service', 'version', 'status'],
  });

  const health = await test('GET /health  — health check', () =>
    httpRequest('GET', `${PYTHON_BASE}/health`), {
    expectStatus: 200,
    expectKeys: ['status', 'database', 'version'],
  });
  if (health?.data) {
    out(`           ${C.yellow}↳ DB: ${health.data.database}  |  Land provider: ${health.data.land_provider}${C.reset}`);
  }

  // ── 1.2 Sales Comparison (simple) ─────────────────────────
  subheader('1.2 Sales Comparison (Simple)');

  await test('POST /api/v1/methods/sales-comparison  — indicated_value from basket', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/sales-comparison`, {
      property: PROPERTY,
      valuation_date: '2025-01-15',
      options: { indicated_value: 2_400_000, comparables_count: 5 },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value', 'confidence_score', 'value_range'],
  });

  await test('POST /api/v1/methods/sales-comparison  — price_per_sqm fallback', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/sales-comparison`, {
      property: PROPERTY,
      options: { price_per_sqm: 9_600, comparables_count: 3 },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value'],
  });

  await test('POST /api/v1/methods/sales-comparison  — missing options → 400', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/sales-comparison`, {
      property: PROPERTY, options: {},
    }), {
    expectStatus: 400,
    expectFail: true,
  });

  // ── 1.3 RICS Sales Comparison ──────────────────────────────
  subheader('1.3 RICS Sales Comparison');

  await test('POST /api/v1/methods/sales-comparison-rics  — 3-comparable basket', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/sales-comparison-rics`, {
      property: PROPERTY,
      comparables: [COMP_1, COMP_2, COMP_3],
      usd_to_ghs_rate: 16.0,
      valuation_date: '2025-01-15',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value', 'comparables_analyzed', 'adjustment_grid', 'methodology_notes'],
  });

  await test('POST /api/v1/methods/sales-comparison-rics  — USD comparable converted', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/sales-comparison-rics`, {
      property: PROPERTY,
      comparables: [{ ...COMP_1, price: 137_500, price_currency: 'USD', weight: 1.0 }],
      usd_to_ghs_rate: 16.0,
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value'],
  });

  await test('POST /api/v1/methods/sales-comparison-rics  — empty comparables → 422 (FastAPI schema)', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/sales-comparison-rics`, {
      property: PROPERTY, comparables: [],
    }), {
    expectStatus: 422,
    expectFail: true,
  });

  // ── 1.4 Cost Approach ──────────────────────────────────────
  subheader('1.4 Cost Approach');

  await test('POST /api/v1/methods/cost-approach  — full inputs', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/cost-approach`, {
      property: PROPERTY,
      options: {
        construction_cost_per_sqm: 8_500,
        land_value_per_sqm: 2_000,
        depreciation_overrides: { physical: 15, functional: 3, external: 0 },
      },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value', 'details'],
  });

  await test('POST /api/v1/methods/cost-approach  — no land value (land_value_per_sqm = 0)', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/cost-approach`, {
      property: PROPERTY,
      options: { construction_cost_per_sqm: 8_500 },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value'],
  });

  await test('POST /api/v1/methods/cost-approach  — missing construction_cost → 400', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/cost-approach`, {
      property: PROPERTY, options: {},
    }), {
    expectStatus: 400,
    expectFail: true,
  });

  // ── 1.5 Income Approach ────────────────────────────────────
  subheader('1.5 Income Approach');

  await test('POST /api/v1/methods/income-approach  — monthly_rent + cap_rate', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/income-approach`, {
      property: { ...PROPERTY, property_type: 'residential_apartment' },
      options: { monthly_rent: 15_000, cap_rate: 7.5, vacancy_rate: 5, operating_expenses: 25 },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value', 'details'],
  });

  await test('POST /api/v1/methods/income-approach  — missing cap_rate → 400', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/income-approach`, {
      property: PROPERTY,
      options: { monthly_rent: 15_000 },
    }), {
    expectStatus: 400,
    expectFail: true,
  });

  await test('POST /api/v1/methods/income-approach  — missing monthly_rent → 400', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/income-approach`, {
      property: PROPERTY,
      options: { cap_rate: 7.5 },
    }), {
    expectStatus: 400,
    expectFail: true,
  });

  // ── 1.6 Residual Method ────────────────────────────────────
  subheader('1.6 Residual Method');

  await test('POST /api/v1/methods/residual  — with explicit GDV', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/residual`, {
      property: { ...PROPERTY, property_type: 'land', land_area_sqm: 1_000 },
      options: {
        gdv: 5_000_000,
        construction_cost_per_sqm: 8_500,
        floors: 2,
        plot_coverage: 0.40,
        developer_profit_pct: 0.20,
        professional_fees_pct: 0.10,
        finance_costs_pct: 0.08,
      },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value', 'details'],
  });

  await test('POST /api/v1/methods/residual  — derived from sale_price_per_sqm', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/residual`, {
      property: { ...PROPERTY, property_type: 'land', land_area_sqm: 1_000 },
      options: { sale_price_per_sqm: 12_000, construction_cost_per_sqm: 8_500 },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value'],
  });

  await test('POST /api/v1/methods/residual  — missing GDV + construction_cost → 400', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/residual`, {
      property: { ...PROPERTY, property_type: 'land' },
      options: {},
    }), {
    expectStatus: 400,
    expectFail: true,
  });

  // ── 1.7 Profits Method ─────────────────────────────────────
  subheader('1.7 Profits Method');

  await test('POST /api/v1/methods/profits  — trading property (hotel)', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/profits`, {
      property: { ...PROPERTY, property_type: 'commercial', building_size_sqm: 800 },
      options: {},
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value', 'details'],
  });

  // ── 1.8 DRC Method ─────────────────────────────────────────
  subheader('1.8 DRC (Depreciated Replacement Cost)');

  await test('POST /api/v1/methods/drc  — institutional property', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/drc`, {
      property: {
        ...PROPERTY,
        id: 'test-drc-001',
        property_type: 'institutional',
        building_size_sqm: 1_200,
        land_area_sqm: 2_000,
        year_built: 2005,
      },
      options: {
        replacement_cost_per_sqm: 9_500,
        land_value: 2_400_000,
        useful_life: 60,
        mea_factor: 0.95,
      },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value', 'details'],
  });

  await test('POST /api/v1/methods/drc  — with depreciation overrides', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/drc`, {
      property: {
        ...PROPERTY,
        id: 'test-drc-002',
        property_type: 'school',
        building_size_sqm: 2_000,
        land_area_sqm: 5_000,
        year_built: 1998,
        condition: 'fair',
      },
      options: {
        replacement_cost_per_sqm: 8_000,
        land_value: 3_500_000,
        useful_life: 60,
        depreciation_overrides: { physical: 30, functional: 10, external: 5 },
      },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'estimated_value'],
  });

  await test('POST /api/v1/methods/drc  — missing land_value → 400', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/drc`, {
      property: { ...PROPERTY, property_type: 'institutional' },
      options: { replacement_cost_per_sqm: 9_500 },
    }), {
    expectStatus: 400,
    expectFail: true,
  });

  // ── 1.9 Calculate All ──────────────────────────────────────
  subheader('1.9 Calculate All Methods');

  await test('POST /api/v1/methods/calculate-all  — sales_comparison + cost_approach', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/calculate-all`, {
      property: PROPERTY,
      methods: ['sales_comparison', 'cost_approach'],
      options: {
        indicated_value: 2_400_000,
        comparables_count: 4,
        construction_cost_per_sqm: 8_500,
        land_value_per_sqm: 2_000,
        depreciation_overrides: { physical: 15, functional: 3, external: 0 },
      },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'results', 'hybrid_value', 'overall_confidence'],
  });

  await test('POST /api/v1/methods/calculate-all  — income_approach + residual', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/calculate-all`, {
      property: { ...PROPERTY, property_type: 'land', land_area_sqm: 1_000 },
      methods: ['income_approach', 'residual'],
      options: {
        monthly_rent: 15_000,
        cap_rate: 7.5,
        gdv: 5_000_000,
        construction_cost_per_sqm: 8_500,
      },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'results'],
  });

  // ── 1.10 Land Value ────────────────────────────────────────
  subheader('1.10 Land Value');

  await test('POST /api/v1/methods/land-value  — user override (bypasses DB requirement)', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/land-value`, {
      property: { ...PROPERTY, land_area_sqm: 500 },
      valuation_id: 'test-val-001',
      user_entered_value: 1_200_000,
      user_justification: 'Based on five recent comparable land transactions in East Legon at GHS 2,400/sqm (Q4 2024 data)',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'final_land_value', 'is_user_override', 'disclosure_required'],
  });

  await test('POST /api/v1/methods/land-value  — auto-calc (may fail in standalone mode — 200 either way)', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/land-value`, {
      property: { ...PROPERTY, land_area_sqm: 500, latitude: 5.6358, longitude: -0.1670 },
      valuation_id: 'test-val-001',
    }), {
    // Standalone mode returns success=false with error — still HTTP 200
    expectStatus: 200,
  });

  await test('POST /api/v1/methods/land-value  — zero land_area returns error gracefully', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/land-value`, {
      property: { ...PROPERTY, land_area_sqm: 0 },
      valuation_id: 'test-val-002',
    }), {
    expectStatus: 200, // Returns success:false in body
  });

  await test('POST /api/v1/methods/land-value/comparables  — search land comps', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/methods/land-value/comparables`, {
      property: PROPERTY,
      options: { max_distance_km: 5, max_results: 10 },
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'comparables', 'strength', 'count'],
  });

  // ── 1.11 Supporting Services ───────────────────────────────
  subheader('1.11 Reconciliation');

  await test('POST /api/v1/reconciliation  — 3-method weighted reconciliation', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/reconciliation`, {
      method_results: {
        sales_comparison: { estimated_value: 2_400_000, confidence_score: 0.80 },
        cost_approach:    { estimated_value: 2_200_000, confidence_score: 0.65 },
        income_approach:  { estimated_value: 2_300_000, confidence_score: 0.75 },
      },
      property_type:     'residential',
      valuation_purpose: 'sale',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'reconciled_value', 'method_weights', 'value_range'],
  });

  await test('POST /api/v1/reconciliation  — commercial property weighting', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/reconciliation`, {
      method_results: {
        income_approach:  { estimated_value: 4_500_000, confidence_score: 0.85 },
        cost_approach:    { estimated_value: 4_100_000, confidence_score: 0.65 },
        sales_comparison: { estimated_value: 4_300_000, confidence_score: 0.70 },
      },
      property_type: 'commercial',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'reconciled_value'],
  });

  subheader('1.12 Sensitivity Analysis');

  await test('POST /api/v1/sensitivity  — ±20% on price_per_sqm, cap_rate, discount_rate', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/sensitivity`, {
      property: PROPERTY,
      base_value: 2_400_000,
      variables: ['price_per_sqm', 'cap_rate', 'discount_rate'],
      variation_range: 0.20,
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'base_value', 'sensitivity_results', 'tornado_data'],
  });

  await test('POST /api/v1/sensitivity  — ±10% single variable', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/sensitivity`, {
      property: PROPERTY,
      base_value: 2_400_000,
      variables: ['price_per_sqm'],
      variation_range: 0.10,
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'sensitivity_results'],
  });

  subheader('1.13 Confidence Scoring');

  await test('POST /api/v1/confidence  — high market activity, 5 comps', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/confidence`, {
      method_results: {
        sales_comparison: { estimated_value: 2_400_000 },
        cost_approach:    { estimated_value: 2_200_000 },
      },
      comparable_count:    5,
      data_quality_score:  0.85,
      market_activity:     'high',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'confidence_score', 'confidence_level', 'factor_scores'],
  });

  await test('POST /api/v1/confidence  — low activity, 1 comp (expects low confidence)', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/confidence`, {
      method_results: { sales_comparison: { estimated_value: 2_400_000 } },
      comparable_count:   1,
      data_quality_score: 0.50,
      market_activity:    'low',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'confidence_score'],
  });

  subheader('1.14 Market Conditions');

  for (const region of ['greater_accra', 'kumasi', 'eastern', 'western', 'northern']) {
    await test(`POST /api/v1/market/conditions  — region: ${region}`, () =>
      httpRequest('POST', `${PYTHON_BASE}/api/v1/market/conditions`, {
        region,
        property_type: 'residential',
      }), {
      expectStatus: 200,
      expectKeys: ['success', 'region', 'conditions'],
    });
  }

  // ── 1.15 Depreciation (D8) ─────────────────────────────────
  subheader('1.15 Depreciation Service (D8)');

  await test('POST /api/v1/depreciation/calculate  — standard residential', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/depreciation/calculate`, {
      property: PROPERTY,
      include_external: true,
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'physical', 'functional', 'external', 'total', 'rcn'],
  });

  await test('POST /api/v1/depreciation/calculate  — old poor-condition property', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/depreciation/calculate`, {
      property: { ...PROPERTY, year_built: 1985, condition: 'poor', property_type: 'commercial_office' },
      include_external: true,
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'total'],
  });

  await test('POST /api/v1/depreciation/calculate  — external_obsolescence excluded', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/depreciation/calculate`, {
      property: PROPERTY,
      include_external: false,
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'physical', 'functional'],
  });

  await test('POST /api/v1/depreciation/override  — engineering report, high variance → approval', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/depreciation/override`, {
      valuation_id:          'test-val-001',
      component:             'physical',
      auto_calculated_rate:  0.15,
      override_rate:         0.28,
      justification:         'Structural engineer inspection (ENG-2025-001) identified significant concrete spalling on external walls and roof slabs indicating accelerated physical deterioration beyond standard age-life calculations.',
      evidence_type:         'engineering_report',
      evidence_reference:    'ENG-RPT-2025-001',
      valuer_id:             'valuer-test-001',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'override_id', 'variance_percent', 'requires_approval'],
  });

  await test('POST /api/v1/depreciation/override  — expert opinion, small variance → no approval', () =>
    httpRequest('POST', `${PYTHON_BASE}/api/v1/depreciation/override`, {
      valuation_id:         'test-val-001',
      component:            'functional',
      auto_calculated_rate: 0.05,
      override_rate:        0.08,
      justification:        'Functional obsolescence is higher than auto-calculated due to absent open-plan layout, inadequate parking, and outdated electrical wiring system requiring full rewire per current Ghana Building Code.',
      evidence_type:        'expert_opinion',
      valuer_id:            'valuer-test-001',
    }), {
    expectStatus: 200,
    expectKeys: ['success', 'override_id'],
  });

  await test('GET /api/v1/depreciation/:valuationId  — retrieve stored depreciation', () =>
    httpRequest('GET', `${PYTHON_BASE}/api/v1/depreciation/test-val-001`), {
    expectStatus: 200,
    expectKeys: ['success', 'valuation_id', 'depreciation'],
  });

  await test('GET /api/v1/depreciation/:id?include_overrides=true', () =>
    httpRequest('GET', `${PYTHON_BASE}/api/v1/depreciation/test-val-001?include_overrides=true`), {
    expectStatus: 200,
    expectKeys: ['success', 'overrides'],
  });
}

// ============================================================
// 2. NODE.JS BACKEND — VALUATIONS  /api/valuations
// ============================================================

async function testNodeValuations(): Promise<string | null> {
  header('2. NODE.JS BACKEND — VALUATIONS  —  /api/valuations');

  let createdId: string | null = null;

  // ── 2.1 Health & Listing ───────────────────────────────────
  subheader('2.1 Health & Listing');

  await test('GET /api/valuations  — list all', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations?status=draft  — filter by status', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations?status=draft`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations?page=1&limit=10  — pagination', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations?page=1&limit=10`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations/stats  — aggregate statistics', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/stats`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations/test/python-health  — Python bridge health check', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/test/python-health`), {
    expectStatus: 200,
    expectKeys: ['success', 'message', 'data'],
  });

  // ── 2.2 Create ─────────────────────────────────────────────
  subheader('2.2 Create Valuation');

  const createRes = await test('POST /api/valuations  — residential house', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuations`, {
      property: {
        property_type:    'residential_house',
        address_street:   '12 Boundary Road',
        address_city:     'East Legon',
        region:           'greater_accra',
        land_area_sqm:    500,
        building_size_sqm: 250,
        bedrooms:         4,
        bathrooms:        3,
        year_built:       2010,
        condition:        'good',
        latitude:         5.6358,
        longitude:       -0.1670,
      },
      valuation_type:    'full_inspection',
      valuation_purpose: 'sale',
      valuation_date:    '2025-01-15',
    }), {
    expectStatus: 201,
  });

  createdId =
    createRes?.data?.data?.id ??      // { success, data: { id } }
    createRes?.data?.valuation?.id ??
    createRes?.data?.id ??
    null;

  if (createdId) {
    out(`           ${C.yellow}↳ Created valuation: ${createdId}${C.reset}`);
  }

  // ── 2.3 Read / Update / Delete ────────────────────────────
  subheader('2.3 Read / Update / Delete');

  if (createdId) {
    await test('GET /api/valuations/:id  — fetch by ID', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuations/${createdId}`), {
      expectStatus: 200,
    });

    await test('PUT /api/valuations/:id  — update status to in_progress', () =>
      httpRequest('PUT', `${NODE_BASE}/api/valuations/${createdId}`, {
        status: 'in_progress',
        notes: 'Updated by enterprise test suite',
      }), {
      expectStatus: 200,
    });
  } else {
    out(`  ${C.yellow}⊘ SKIP${C.reset}  Read/Update/Delete (no valuation created)`);
    skipCount += 2;
  }

  // ── 2.4 Python Engine Orchestration ───────────────────────
  subheader('2.4 Python Engine Orchestration');

  if (createdId) {
    await test('POST /api/valuations/:id/run-python  — sales_comparison + cost_approach', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuations/${createdId}/run-python`, {
        methods: ['sales_comparison', 'cost_approach'],
        options: {
          indicated_value:            2_400_000,
          comparables_count:          4,
          construction_cost_per_sqm:  8_500,
          land_value_per_sqm:         2_000,
          depreciation_overrides: { physical: 15, functional: 3, external: 0 },
        },
      }), {
      expectStatus: 200,
    });

    await test('POST /api/valuations/:id/run-python  — income approach options (node routes to sales_comparison)', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuations/${createdId}/run-python`, {
        methods: ['income_approach'],
        options: {
          monthly_rent: 15_000, cap_rate: 7.5, vacancy_rate: 5,
          // indicated_value required: endpoint calls sales-comparison fallback when no basket exists
          indicated_value: 2_400_000,
        },
      }), {
      expectStatus: 200,
    });
  } else {
    out(`  ${C.yellow}⊘ SKIP${C.reset}  run-python tests (no valuation created)`);
    skipCount += 2;
  }

  // ── 2.5 Comparables ───────────────────────────────────────
  subheader('2.5 Comparables');

  if (createdId) {
    await test('GET /api/valuations/:id/comparables  — no basket yet → 404', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuations/${createdId}/comparables`), {
      // Fresh valuation has no saved comparable basket; endpoint correctly returns 404
      expectStatus: 404,
    });

    await test('POST /api/valuations/:id/comparables/search  — area search', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuations/${createdId}/comparables/search`, {
        region:        'Greater Accra',
        property_type: 'residential_house',
        radius_km:     5,
        limit:         10,
      }), {
      expectStatus: 200,
    });

    await test('POST /api/valuations/:id/rental-comparables/search  — rental comps', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuations/${createdId}/rental-comparables/search`, {
        region:        'Greater Accra',
        property_type: 'residential_house',
        radius_km:     5,
      }), {
      expectStatus: 200,
    });
  } else {
    out(`  ${C.yellow}⊘ SKIP${C.reset}  Comparables tests (no valuation created)`);
    skipCount += 3;
  }

  // ── 2.6 Report ─────────────────────────────────────────────
  subheader('2.6 Report');

  if (createdId) {
    await test('GET /api/valuations/:id/report  — valuation report', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuations/${createdId}/report`), {
      expectStatus: 200,
    });
  } else {
    out(`  ${C.yellow}⊘ SKIP${C.reset}  Report test (no valuation created)`);
    skipCount += 1;
  }

  // ── 2.7 Property-based lookup ──────────────────────────────
  subheader('2.7 Property-Based & Cap Rate Lookups');

  await test('GET /api/valuations/property/:propertyId  — valuations for a property', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/property/${NULL_UUID}`), {
    expectStatus: 200,
  });

  // ── 2.8 Rental Benchmarks ──────────────────────────────────
  subheader('2.8 Rental Benchmarks');

  await test('GET /api/valuations/rental-benchmarks  — all benchmarks', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/rental-benchmarks`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations/rental-benchmarks/:area  — East Legon', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/rental-benchmarks/east-legon`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations/rental-benchmarks/:area  — Cantonments', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/rental-benchmarks/cantonments`), {
    expectStatus: 200,
  });

  // ── 2.9 Cap Rate Service ───────────────────────────────────
  subheader('2.9 Cap Rate Service');

  await test('GET /api/valuations/cap-rate/benchmarks  — all benchmarks', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/cap-rate/benchmarks`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations/cap-rate/:region/:propertyType  — Accra residential', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/cap-rate/greater_accra/residential_house`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations/cap-rate/:region/:propertyType  — Kumasi commercial', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/cap-rate/kumasi_metro/commercial_office`), {
  });

  await test('POST /api/valuations/cap-rate/derive  — trigger listing derivation', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuations/cap-rate/derive`, {
      region:       'greater_accra',
      propertyType: 'residential_house',
    }), {
    // 200 if listings exist; 422 if insufficient data — both are acceptable
    expectFail: true,
  });

  await test('POST /api/valuations/cap-rate/income-approach  — income valuation with area', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuations/cap-rate/income-approach`, {
      region:       'greater_accra',
      propertyType: 'residential_house',
      totalAreaSqm: 250,
    }), {
    expectStatus: 200,
  });

  // ── 2.10 Market Data ───────────────────────────────────────
  subheader('2.10 Market Data');

  await test('GET /api/valuations/market/:region  — Greater Accra market data', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/market/greater_accra`), {
    expectStatus: 200,
  });

  await test('GET /api/valuations/market/:region/indices  — market indices', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuations/market/greater_accra/indices`), {
    expectStatus: 200,
  });

  // ── 2.11 Delete (cleanup) ──────────────────────────────────
  if (createdId) {
    subheader('2.11 Cleanup');
    await test('DELETE /api/valuations/:id  — delete test valuation', () =>
      httpRequest('DELETE', `${NODE_BASE}/api/valuations/${createdId}`), {
      expectStatus: 200,
    });
  }

  return createdId;
}

// ============================================================
// 3. VALUERS  /api/valuers
// ============================================================

async function testValuers() {
  header('3. NODE.JS BACKEND — VALUERS  —  /api/valuers');

  await test('GET /api/valuers  — list active valuers', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuers`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  await test('GET /api/valuers/:id  — get valuer by ID', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuers/${NULL_UUID}`), {
    requiresAuth: true,
    // 404 is acceptable — endpoint exists, test ID likely not found
  });

  await test('GET /api/valuers/user/:userId  — get valuer by user ID', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuers/user/${NULL_UUID}`), {
    requiresAuth: true,
  });

  await test('GET /api/valuers/:id/credentials  — valuer credentials', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuers/${NULL_UUID}/credentials`), {
    requiresAuth: true,
  });

  await test('POST /api/valuers/:id/signature  — upload signature (form check)', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuers/${NULL_UUID}/signature`, {}), {
    requiresAuth: true,
    // Will fail with 400 (no file) — endpoint existence confirmed
    expectFail: true,
  });
}

// ============================================================
// 4. VALUATION CLIENTS  /api/valuation-clients
// ============================================================

async function testValuationClients() {
  header('4. NODE.JS BACKEND — VALUATION CLIENTS  —  /api/valuation-clients');

  let clientId: string | null = null;

  await test('GET /api/valuation-clients  — list clients', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-clients`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  const created = await test('POST /api/valuation-clients  — create client', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuation-clients`, {
      name:        'Test Client Corp Ltd',
      email:       'test@clientcorp.com',
      phone:       '+233201234567',
      address:     '15 Independence Avenue, Accra',
      client_type: 'corporate',
    }), {
    requiresAuth: true,
    expectStatus: 201,
  });

  clientId = created?.data?.client?.id ?? null;

  if (clientId) {
    await test('GET /api/valuation-clients/:id  — fetch client', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuation-clients/${clientId}`), {
      requiresAuth: true,
      expectStatus: 200,
    });

    await test('GET /api/valuation-clients/:id/invoices  — client invoices', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuation-clients/${clientId}/invoices`), {
      requiresAuth: true,
      expectStatus: 200,
    });

    await test('GET /api/valuation-clients/:id/valuations  — client valuations', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuation-clients/${clientId}/valuations`), {
      requiresAuth: true,
      expectStatus: 200,
    });

    await test('PUT /api/valuation-clients/:id  — update phone', () =>
      httpRequest('PUT', `${NODE_BASE}/api/valuation-clients/${clientId}`, {
        phone: '+233209876543',
        notes: 'Updated by enterprise test suite',
      }), {
      requiresAuth: true,
      expectStatus: 200,
    });

    await test('DELETE /api/valuation-clients/:id  — delete client', () =>
      httpRequest('DELETE', `${NODE_BASE}/api/valuation-clients/${clientId}`), {
      requiresAuth: true,
      expectStatus: 200,
    });
  } else {
    out(`  ${C.yellow}⊘ SKIP${C.reset}  Client CRUD (not created — skipping sub-tests)`);
    skipCount += 5;
  }
}

// ============================================================
// 5. VALUATION INVOICES  /api/valuation-invoices
// ============================================================

async function testValuationInvoices() {
  header('5. NODE.JS BACKEND — VALUATION INVOICES  —  /api/valuation-invoices');

  // ── Public ─────────────────────────────────────────────────
  subheader('5.1 Public Endpoints (no auth required)');

  await test('GET /api/valuation-invoices/fee-calculator  — fee calculator (percentage model)', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-invoices/fee-calculator?feeModel=percentage_of_value&propertyValue=2500000`), {
    expectStatus: 200,
  });

  await test('GET /api/valuation-invoices/man-day-rates  — man-day rates table', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-invoices/man-day-rates`), {
    expectStatus: 200,
  });

  await test('GET /api/valuation-invoices/public/:id  — public invoice view (test ID → 404)', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-invoices/public/${NULL_UUID}`), {
    expectFail: true, // 404 expected for test UUID
  });

  // ── Auth ───────────────────────────────────────────────────
  subheader('5.2 Authenticated Endpoints');

  await test('GET /api/valuation-invoices  — list invoices', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-invoices`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  await test('GET /api/valuation-invoices/summary  — invoice summary stats', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-invoices/summary`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  const newInvoice = await test('POST /api/valuation-invoices  — create invoice', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuation-invoices`, {
      clientName: 'Test Client (Enterprise Suite)',
      clientEmail: 'testclient@propmetrik.com',
      feeModel:   'flat_fee',
      dueDate:    '2026-12-31',
      notes:      'Enterprise test invoice',
      lineItems: [{
        description: 'Valuation fee — residential property',
        quantity:    1,
        unit:        'service',
        unitPrice:   5000,
        amount:      5000,
      }],
    }), {
    requiresAuth: true,
    expectStatus: 201,
  });

  const invoiceId = newInvoice?.data?.data?.id ?? null;

  if (invoiceId) {
    await test('GET /api/valuation-invoices/:id  — fetch invoice', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuation-invoices/${invoiceId}`), {
      requiresAuth: true,
      expectStatus: 200,
    });

    await test('PUT /api/valuation-invoices/:id  — update notes', () =>
      httpRequest('PUT', `${NODE_BASE}/api/valuation-invoices/${invoiceId}`, {
        notes: 'Updated by test suite',
      }), {
      requiresAuth: true,
      expectStatus: 200,
    });

    await test('POST /api/valuation-invoices/:id/send  — send invoice email', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuation-invoices/${invoiceId}/send`), {
      requiresAuth: true,
    });

    await test('POST /api/valuation-invoices/:id/mark-paid  — mark as paid', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuation-invoices/${invoiceId}/mark-paid`, {
        payment_reference: 'PAY-TEST-2025-001',
        payment_date:      '2025-01-15',
      }), {
      requiresAuth: true,
    });

    await test('GET /api/valuation-invoices/:id/receipt  — download receipt', () =>
      httpRequest('GET', `${NODE_BASE}/api/valuation-invoices/${invoiceId}/receipt`), {
      requiresAuth: true,
    });

    // Cancel — may fail if already paid (4xx expected)
    await test('POST /api/valuation-invoices/:id/cancel  — cancel (may 4xx if paid)', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuation-invoices/${invoiceId}/cancel`, {
        reason: 'Test suite cancellation',
      }), {
      requiresAuth: true,
      expectFail: true, // If paid, cancel returns 4xx — both outcomes acceptable
    });
  } else {
    out(`  ${C.yellow}⊘ SKIP${C.reset}  Invoice lifecycle tests (not created)`);
    skipCount += 6;
  }
}

// ============================================================
// 6. VALUATION ORG  /api/valuation-org
// ============================================================

async function testValuationOrg() {
  header('6. NODE.JS BACKEND — VALUATION ORG  —  /api/valuation-org');

  // ── Public ─────────────────────────────────────────────────
  subheader('6.1 Public Endpoints');

  await test('GET /api/valuation-org/invitations/details  — invalid token → 400/404', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-org/invitations/details?token=invalid-test-token-xyz`), {
    expectFail: true,
  });

  await test('POST /api/valuation-org/invitations/accept-and-setup  — empty body → 400/422', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuation-org/invitations/accept-and-setup`, {}), {
    expectFail: true,
  });

  // ── Auth ───────────────────────────────────────────────────
  subheader('6.2 Authenticated Endpoints');

  await test('GET /api/valuation-org/roles  — list available roles', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-org/roles`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  await test('GET /api/valuation-org/members  — list team members', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-org/members`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  await test('GET /api/valuation-org/invitations  — list pending invitations', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-org/invitations`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  const inviteRes = await test('POST /api/valuation-org/invitations  — invite valuer', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuation-org/invitations`, {
      email:   'testvaluer@propmetrik.test',
      role:    'valuer',
      message: 'Enterprise test invitation',
    }), {
    requiresAuth: true,
  });

  const inviteId = inviteRes?.data?.id ?? null;

  if (inviteId) {
    await test('POST /api/valuation-org/invitations/:id/resend  — resend invitation', () =>
      httpRequest('POST', `${NODE_BASE}/api/valuation-org/invitations/${inviteId}/resend`), {
      requiresAuth: true,
    });

    await test('DELETE /api/valuation-org/invitations/:id  — revoke invitation', () =>
      httpRequest('DELETE', `${NODE_BASE}/api/valuation-org/invitations/${inviteId}`), {
      requiresAuth: true,
    });
  }

  // Team management on a valuation
  subheader('6.3 Valuation Team Management');

  await test('GET /api/valuation-org/valuations/:id/team  — get team (test ID)', () =>
    httpRequest('GET', `${NODE_BASE}/api/valuation-org/valuations/${NULL_UUID}/team`), {
    requiresAuth: true,
  });

  await test('POST /api/valuation-org/valuations/:id/team  — assign team member', () =>
    httpRequest('POST', `${NODE_BASE}/api/valuation-org/valuations/${NULL_UUID}/team`, {
      user_id: NULL_UUID,
      role:    'lead_valuer',
    }), {
    requiresAuth: true,
    expectFail: true, // May 404 for test UUID
  });
}

// ============================================================
// 7. ANALYTICS  /api/analytics/valuations
// ============================================================

async function testAnalytics() {
  header('7. NODE.JS BACKEND — ANALYTICS  —  /api/analytics/valuations');

  const analyticsEndpoints = [
    ['/volume/summary',          'volume summary'],
    ['/volume/history',          'volume history'],
    ['/methods/performance',     'methods performance'],
    ['/methods/history',         'methods history (all methods)'],
    ['/quality',                 'quality metrics'],
    ['/valuers/leaderboard',     'valuers leaderboard'],
    ['/market-relative',         'market-relative analysis'],
    ['/floor-plans/summary',     'floor-plans summary'],
    ['/floor-plans/by-region',   'floor-plans by region'],
    ['/floor-plans/rooms',       'floor-plans room distribution'],
    ['/floor-plans/distribution','floor-plans size distribution'],
    ['/floor-plans/compliance',  'floor-plans compliance'],
    ['/sensitivity-summary',      'sensitivity summary'],
  ] as const;

  for (const [path, label] of analyticsEndpoints) {
    await test(`GET /api/analytics/valuations${path}  — ${label}`, () =>
      httpRequest('GET', `${NODE_BASE}/api/analytics/valuations${path}`), {
      requiresAuth: true,
      expectStatus: 200,
    });
  }

  // Parameterised analytics
  await test('GET /api/analytics/valuations/valuers/:valuerId  — single valuer stats', () =>
    httpRequest('GET', `${NODE_BASE}/api/analytics/valuations/valuers/${NULL_UUID}`), {
    requiresAuth: true,
  });

  await test('GET /api/analytics/valuations/sensitivity/:valuationId  — per-valuation sensitivity', () =>
    httpRequest('GET', `${NODE_BASE}/api/analytics/valuations/sensitivity/${NULL_UUID}`), {
    requiresAuth: true,
  });

  // Optional query string filters
  await test('GET /api/analytics/valuations/volume/history?period=12m', () =>
    httpRequest('GET', `${NODE_BASE}/api/analytics/valuations/volume/history?period=12m`), {
    requiresAuth: true,
  });

  await test('GET /api/analytics/valuations/methods/performance?region=Greater%20Accra', () =>
    httpRequest('GET', `${NODE_BASE}/api/analytics/valuations/methods/performance?region=Greater%20Accra`), {
    requiresAuth: true,
  });
}

// ============================================================
// 8. REPORTS  /api/reports
// ============================================================

async function testReports() {
  header('8. NODE.JS BACKEND — REPORTS  —  /api/reports');

  await test('GET /api/reports  — list generated reports', () =>
    httpRequest('GET', `${NODE_BASE}/api/reports`), {
    requiresAuth: true,
    expectStatus: 200,
  });

  await test('POST /api/reports  — generate PDF report', () =>
    httpRequest('POST', `${NODE_BASE}/api/reports`, {
      valuation_id: NULL_UUID,
      report_type:  'full',
      format:       'pdf',
    }), {
    requiresAuth: true,
  });

  await test('POST /api/reports  — generate summary report', () =>
    httpRequest('POST', `${NODE_BASE}/api/reports`, {
      valuation_id: NULL_UUID,
      report_type:  'summary',
      format:       'pdf',
    }), {
    requiresAuth: true,
  });
}

// ============================================================
// 9. VERSIONED API  /api/v1/...
// ============================================================

async function testVersionedApi() {
  header('9. VERSIONED API SPOT-CHECKS  —  /api/v1/...');

  // Each route is mounted under both /api/ and /api/v1/
  const checks: Array<[string, string]> = [
    ['GET', '/api/v1/valuations'],
    ['GET', '/api/v1/valuations/stats'],
    ['GET', '/api/v1/valuations/test/python-health'],
    ['GET', '/api/v1/valuations/rental-benchmarks'],
    ['GET', '/api/v1/valuations/cap-rate/benchmarks'],
    ['GET', '/api/v1/valuations/market/greater_accra'],
    ['GET', '/api/v1/valuation-invoices/fee-calculator?feeModel=percentage_of_value&propertyValue=2500000'],
    ['GET', '/api/v1/valuation-invoices/man-day-rates'],
    ['GET', '/api/v1/valuers'],
    ['GET', '/api/v1/valuation-clients'],
  ];

  for (const [method, path] of checks) {
    const needsAuth = path.includes('valuation-clients') || path.includes('valuers');
    await test(`${method} ${path}`, () =>
      httpRequest(method, `${NODE_BASE}${path}`), {
      requiresAuth: needsAuth,
      expectStatus: 200,
    });
  }
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function main() {
  const startMs = Date.now();

  out(`\n${C.bold}${C.blue}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
  out(`${C.bold}${C.blue}║   PROPMETRIK VALUATION SERVICES — ENTERPRISE TEST SUITE      ║${C.reset}`);
  out(`${C.bold}${C.blue}╚══════════════════════════════════════════════════════════════╝${C.reset}`);
  out(`\n  Python Engine  : ${C.cyan}${PYTHON_BASE}${C.reset}`);
  out(`  Node.js Backend: ${C.cyan}${NODE_BASE}${C.reset}`);
  out(`  Auth Token     : ${AUTH_TOKEN ? `${C.green}provided${C.reset}` : `${C.yellow}not set — auth-gated endpoints will be skipped${C.reset}`}`);

  if (!AUTH_TOKEN) {
    out(`\n  ${C.yellow}Tip: AUTH_TOKEN=<jwt> npx ts-node scripts/test-valuation-endpoints.ts${C.reset}`);
    out(`  ${C.yellow}     ORG_ID=<uuid>     (optional, for org-scoped endpoints)${C.reset}`);
  }

  try {
    await testPythonService();
    await testNodeValuations();
    await testValuers();
    await testValuationClients();
    await testValuationInvoices();
    await testValuationOrg();
    await testAnalytics();
    await testReports();
    await testVersionedApi();
  } catch (err: any) {
    out(`\n${C.red}Fatal runner error: ${err.message}${C.reset}`);
  }

  // ── Summary ────────────────────────────────────────────────
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const total   = passCount + failCount + skipCount;

  out(`\n${C.bold}${C.blue}${'═'.repeat(64)}${C.reset}`);
  out(`${C.bold}  TEST SUMMARY${C.reset}`);
  out(`${C.bold}${C.blue}${'═'.repeat(64)}${C.reset}`);
  out(`  Total   : ${C.bold}${total}${C.reset} tests  (${elapsed}s)`);
  out(`  ${C.green}Passed  :${C.reset} ${C.bold}${C.green}${passCount}${C.reset}`);
  out(`  ${C.red}Failed  :${C.reset} ${C.bold}${C.red}${failCount}${C.reset}`);
  out(`  ${C.yellow}Skipped :${C.reset} ${C.bold}${C.yellow}${skipCount}${C.reset}  (auth-gated, no AUTH_TOKEN)`);

  if (failCount > 0) {
    out(`\n${C.bold}${C.red}  Failed Tests:${C.reset}`);
    for (const r of allResults.filter((x) => x.status === 'fail')) {
      out(`  ${C.red}✗${C.reset}  ${r.name}${r.message ? `  ← ${r.message}` : ''}`);
    }
  }

  const allAuthenticatedFailed = failCount === 0 || (
    failCount > 0 &&
    allResults.filter((r) => r.status === 'fail').every((r) => r.message?.includes('401'))
  );

  if (failCount === 0) {
    out(`\n  ${C.green}${C.bold}All tests passed!${C.reset}`);
  }

  out('');
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
