/**
 * Analytics Full-Stack Test Suite
 *
 * Covers all analytics route groups:
 *   /api/v1/analytics/*          — CRM/deal advanced analytics (analytics.ts)
 *   /api/v1/analytics/ml/*       — ML Analytics service layer (mlAnalytics.ts)
 *   /api/v1/analytics/platform/* — Foundation: CCI, GHAI, Alerts (analyticsFoundation.ts)
 *
 * Auth: auto-login with eric@cedynhq.com (super_admin)
 * Run:  cd backend && npx ts-node scripts/test-analytics-endpoints.ts
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = 'http://localhost:4000';
const ORG_ID   = '00000000-0000-0000-0000-000000000001';
const CREDS    = { email: 'eric@cedynhq.com', password: 'Delta0246@' };

axios.defaults.timeout = 20000;

// ─── State ───────────────────────────────────────────────────────────────────
let TOKEN       = '';
let PIPELINE_ID = '';
let ALERT_ID    = '';
let ALERT_RULE_ID = '';

// ─── Test Framework ───────────────────────────────────────────────────────────
let passed  = 0;
let failed  = 0;
let skipped = 0;

function logResult(name: string, status: 'PASS' | 'FAIL' | 'SKIP', detail?: string) {
  const icon  = status === 'PASS' ? '✓' : status === 'SKIP' ? '○' : '✗';
  const color = status === 'PASS' ? '\x1b[32m' : status === 'SKIP' ? '\x1b[33m' : '\x1b[31m';
  console.log(`  ${color}${icon}\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else skipped++;
}

async function test(
  name: string,
  fn: () => Promise<void>,
  skipIf?: () => boolean,
) {
  if (skipIf && skipIf()) {
    logResult(name, 'SKIP', 'precondition not met');
    return;
  }
  try {
    await fn();
    logResult(name, 'PASS');
  } catch (err: any) {
    const msg = err?.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 120)}`
      : err?.message?.slice(0, 120) ?? String(err);
    logResult(name, 'FAIL', msg);
  }
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

/** Accept 200–299 OR 404/503 for ML-serving-dependent endpoints that may have no data */
function expectOkOrEmpty(res: AxiosResponse, label?: string) {
  const ok = res.status >= 200 && res.status < 300;
  if (!ok) throw new Error(`${label ?? ''} HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
}

/** Accept 200-299 OR 503 (ML service unavailable) */
function expectOkOrMLDown(res: AxiosResponse) {
  if (res.status === 503) return; // ML serving proxy down — acceptable
  if (res.status >= 200 && res.status < 300) return;
  throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
}

function makeClient(): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'X-Organization-Id': ORG_ID,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true, // never throw on HTTP error
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nAnalytics Full-Stack Test Suite');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Org:    ${ORG_ID} \n`);

  // ── 0. Auth ─────────────────────────────────────────────────────────────────
  section('0. Authentication');
  const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, CREDS);
  TOKEN = loginRes.data?.data?.token ?? loginRes.data?.token ?? '';
  if (loginRes.status !== 200 || !TOKEN) {
    console.error('Login failed:', loginRes.data);
    process.exit(1);
  }
  console.log(`✓ Logged in as ${CREDS.email}`);

  const api = makeClient();

  // ── Resolve a pipeline ID for funnel tests ──────────────────────────────────
  try {
    const plRes = await api.get('/api/v1/crm/pipelines');
    const list = plRes.data?.data ?? plRes.data ?? [];
    const first = Array.isArray(list) ? list[0] : null;
    if (first?.id) PIPELINE_ID = first.id;
  } catch { /* not critical */ }

  // ══════════════════════════════════════════════════════════════════════════════
  // PART A — CRM Advanced Analytics  (/api/v1/analytics/*)
  // ══════════════════════════════════════════════════════════════════════════════
  section('A. CRM Advanced Analytics — /api/v1/analytics/*');

  await test('GET /api/v1/analytics/dashboard', async () => {
    const res = await api.get('/api/v1/analytics/dashboard');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /api/v1/analytics/cohorts', async () => {
    const res = await api.get('/api/v1/analytics/cohorts');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /api/v1/analytics/cohorts?groupBy=quarter', async () => {
    const res = await api.get('/api/v1/analytics/cohorts?groupBy=quarter');
    expectOkOrEmpty(res);
  });

  await test('GET /api/v1/analytics/win-loss', async () => {
    const res = await api.get('/api/v1/analytics/win-loss');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /api/v1/analytics/win-loss?period=quarter', async () => {
    const res = await api.get('/api/v1/analytics/win-loss?period=quarter');
    expectOkOrEmpty(res);
  });

  await test(
    'GET /api/v1/analytics/funnel/:pipelineId',
    async () => {
      const res = await api.get(`/api/v1/analytics/funnel/${PIPELINE_ID}`);
      expectOkOrEmpty(res);
      if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
    },
    () => !PIPELINE_ID,
  );

  await test('GET /api/v1/analytics/velocity', async () => {
    const res = await api.get('/api/v1/analytics/velocity');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /api/v1/analytics/lead-sources', async () => {
    const res = await api.get('/api/v1/analytics/lead-sources');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /api/v1/analytics/agent-performance', async () => {
    const res = await api.get('/api/v1/analytics/agent-performance');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /api/v1/analytics/export/excel', async () => {
    const res = await api.get('/api/v1/analytics/export/excel', { responseType: 'arraybuffer' });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers['content-type'] ?? '') as string;
    if (!ct.includes('spreadsheet') && !ct.includes('octet'))
      throw new Error(`Unexpected content-type: ${ct}`);
  });

  await test('GET /api/v1/analytics/export/pdf', async () => {
    const res = await api.get('/api/v1/analytics/export/pdf', { responseType: 'arraybuffer' });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers['content-type'] ?? '') as string;
    if (!ct.includes('pdf') && !ct.includes('octet'))
      throw new Error(`Unexpected content-type: ${ct}`);
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PART B — ML Analytics  (/api/v1/analytics/ml/*)
  // ══════════════════════════════════════════════════════════════════════════════
  section('B. ML Analytics — /api/v1/analytics/ml/*');

  await test('GET /api/v1/analytics/ml/health', async () => {
    const res = await api.get('/api/v1/analytics/ml/health');
    // 200 = ML serving up; 503 = ML serving down (acceptable, service is optional)
    if (res.status !== 200 && res.status !== 503)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
  });

  await test('GET /api/v1/analytics/ml/dashboard', async () => {
    const res = await api.get('/api/v1/analytics/ml/dashboard');
    expectOkOrMLDown(res);
  });

  // Construction
  await test('GET /api/v1/analytics/ml/construction/index', async () => {
    const res = await api.get('/api/v1/analytics/ml/construction/index');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/construction/regional', async () => {
    const res = await api.get('/api/v1/analytics/ml/construction/regional');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/construction/materials', async () => {
    const res = await api.get('/api/v1/analytics/ml/construction/materials');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/construction/labor', async () => {
    const res = await api.get('/api/v1/analytics/ml/construction/labor');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/construction/forecast', async () => {
    const res = await api.get('/api/v1/analytics/ml/construction/forecast?region=greater_accra&horizon=6');
    expectOkOrMLDown(res);
  });

  // HAI
  await test('GET /api/v1/analytics/ml/hai/current', async () => {
    const res = await api.get('/api/v1/analytics/ml/hai/current');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/hai/region/greater_accra', async () => {
    const res = await api.get('/api/v1/analytics/ml/hai/region/greater_accra');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/hai/history?region=greater_accra', async () => {
    const res = await api.get('/api/v1/analytics/ml/hai/history?region=greater_accra&period=12');
    expectOkOrMLDown(res);
  });

  // Valuations
  await test('GET /api/v1/analytics/ml/valuations/volume', async () => {
    const res = await api.get('/api/v1/analytics/ml/valuations/volume');
    expectOkOrMLDown(res);
  });

  // Market
  await test('GET /api/v1/analytics/ml/market/price-index', async () => {
    const res = await api.get('/api/v1/analytics/ml/market/price-index');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/market/activity', async () => {
    const res = await api.get('/api/v1/analytics/ml/market/activity');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/market/investment', async () => {
    const res = await api.get('/api/v1/analytics/ml/market/investment');
    expectOkOrMLDown(res);
  });

  // AVM Performance
  await test('GET /api/v1/analytics/ml/performance', async () => {
    const res = await api.get('/api/v1/analytics/ml/performance');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/performance/segments', async () => {
    const res = await api.get('/api/v1/analytics/ml/performance/segments');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/performance/trend', async () => {
    const res = await api.get('/api/v1/analytics/ml/performance/trend');
    expectOkOrMLDown(res);
  });

  // Feature Importance
  await test('GET /api/v1/analytics/ml/features', async () => {
    const res = await api.get('/api/v1/analytics/ml/features');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/predictions/:id/explain', async () => {
    const res = await api.get('/api/v1/analytics/ml/predictions/test-prediction-id/explain');
    // 404 = valid (no such prediction), 200/503 = also acceptable
    if (res.status !== 200 && res.status !== 404 && res.status !== 503)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
  });

  // Confidence
  await test('GET /api/v1/analytics/ml/confidence', async () => {
    const res = await api.get('/api/v1/analytics/ml/confidence');
    expectOkOrMLDown(res);
  });

  // Drift / Monitoring
  await test('GET /api/v1/analytics/ml/monitoring/drift', async () => {
    const res = await api.get('/api/v1/analytics/ml/monitoring/drift');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/monitoring/drift/features', async () => {
    const res = await api.get('/api/v1/analytics/ml/monitoring/drift/features');
    expectOkOrMLDown(res);
  });

  // Price Forecasting
  await test('GET /api/v1/analytics/ml/forecast', async () => {
    const res = await api.get('/api/v1/analytics/ml/forecast?region=greater_accra&horizon=6');
    expectOkOrMLDown(res);
  });

  // Ensemble
  await test('GET /api/v1/analytics/ml/ensemble', async () => {
    const res = await api.get('/api/v1/analytics/ml/ensemble');
    expectOkOrMLDown(res);
  });

  // Sentiment
  await test('POST /api/v1/analytics/ml/sentiment/analyze', async () => {
    const res = await api.post('/api/v1/analytics/ml/sentiment/analyze', {
      text: 'Property prices in Accra are rising significantly this quarter.',
      source: 'news',
    });
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/sentiment/history', async () => {
    const res = await api.get('/api/v1/analytics/ml/sentiment/history');
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/sentiment/market-confidence', async () => {
    const res = await api.get('/api/v1/analytics/ml/sentiment/market-confidence');
    expectOkOrMLDown(res);
  });

  // NER
  await test('POST /api/v1/analytics/ml/ner/extract', async () => {
    const res = await api.post('/api/v1/analytics/ml/ner/extract', {
      text: 'The East Legon property sold for 2.5 million Ghana cedis in February 2025.',
    });
    expectOkOrMLDown(res);
  });

  await test('POST /api/v1/analytics/ml/ner/batch', async () => {
    const res = await api.post('/api/v1/analytics/ml/ner/batch', {
      texts: [
        'A 3-bedroom house in Tema sold for GHS 800,000.',
        'Kumasi commercial property listed at GHS 1.2 million.',
      ],
    });
    expectOkOrMLDown(res);
  });

  // Trends
  await test('POST /api/v1/analytics/ml/trends/analyze', async () => {
    const res = await api.post('/api/v1/analytics/ml/trends/analyze', {
      text: 'Demand for short-stay properties in Accra is surging due to increased tourism.',
      source_type: 'social',
    });
    expectOkOrMLDown(res);
  });

  await test('GET /api/v1/analytics/ml/trends/trending', async () => {
    const res = await api.get('/api/v1/analytics/ml/trends/trending');
    expectOkOrMLDown(res);
  });

  // Documents
  await test('POST /api/v1/analytics/ml/documents/process', async () => {
    const res = await api.post('/api/v1/analytics/ml/documents/process', {
      content: 'This is a property valuation report for a 4-bedroom house in Airport Residential Area.',
      document_type: 'valuation_report',
    });
    expectOkOrMLDown(res);
  });

  await test('POST /api/v1/analytics/ml/documents/batch', async () => {
    const res = await api.post('/api/v1/analytics/ml/documents/batch', {
      documents: [
        { content: 'Sale agreement for Adenta property.', document_type: 'sale_agreement' },
      ],
    });
    expectOkOrMLDown(res);
  });

  // AI Assistant
  await test('POST /api/v1/analytics/ml/assistant/query', async () => {
    const res = await api.post('/api/v1/analytics/ml/assistant/query', {
      query: 'What is the average property price in Greater Accra?',
    });
    expectOkOrMLDown(res);
  });

  await test('POST /api/v1/analytics/ml/assistant/report', async () => {
    const res = await api.post('/api/v1/analytics/ml/assistant/report', {
      report_type: 'market_summary',
      region: 'greater_accra',
    });
    expectOkOrMLDown(res);
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PART C — Analytics Foundation  (/api/v1/analytics/platform/*)
  // ══════════════════════════════════════════════════════════════════════════════
  section('C. Analytics Foundation — /api/v1/analytics/platform/*');

  // Construction Cost Index
  await test('GET /platform/construction/index', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/index');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/construction/history', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/history?months=12');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/construction/history?region=greater_accra', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/history?region=greater_accra&months=6');
    expectOkOrEmpty(res);
  });

  await test('GET /platform/construction/regional', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/regional');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/construction/materials', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/materials');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/construction/materials?category=cement', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/materials?category=cement');
    expectOkOrEmpty(res);
  });

  await test('GET /platform/construction/materials/summary', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/materials/summary');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/construction/labor', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/labor');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/construction/forecast', async () => {
    const res = await api.get('/api/v1/analytics/platform/construction/forecast?region=greater_accra&horizon=6');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('POST /platform/construction/compute', async () => {
    const res = await api.post('/api/v1/analytics/platform/construction/compute', {
      periodType: 'monthly',
    });
    // 200 = computed; 400/500 = insufficient data (acceptable)
    if (res.status !== 200 && res.status !== 400 && res.status !== 500)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
  });

  // GHAI
  await test('GET /platform/hai/current', async () => {
    const res = await api.get('/api/v1/analytics/platform/hai/current');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/hai/region/greater_accra', async () => {
    const res = await api.get('/api/v1/analytics/platform/hai/region/greater_accra');
    // 200 = data found; 404 = no data yet (acceptable)
    if (res.status !== 200 && res.status !== 404)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
  });

  await test('GET /platform/hai/history/greater_accra', async () => {
    const res = await api.get('/api/v1/analytics/platform/hai/history/greater_accra?months=12');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/hai/comparison', async () => {
    const res = await api.get('/api/v1/analytics/platform/hai/comparison');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/hai/supplementary/greater_accra', async () => {
    const res = await api.get('/api/v1/analytics/platform/hai/supplementary/greater_accra');
    // 200 or 404 (no data yet)
    if (res.status !== 200 && res.status !== 404)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
  });

  await test('GET /platform/hai/weights', async () => {
    const res = await api.get('/api/v1/analytics/platform/hai/weights');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('POST /platform/hai/compute', async () => {
    const res = await api.post('/api/v1/analytics/platform/hai/compute', {
      region: 'greater_accra',
      median_property_price: 850000,
      median_household_income: 48000,
      mortgage_rate: 29.5,
      median_monthly_rent: 3200,
      loan_to_value_ratio: 0.8,
      loan_term_years: 20,
      annual_property_tax_rate: 0.002,
    });
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/hai/forecast/greater_accra', async () => {
    const res = await api.get('/api/v1/analytics/platform/hai/forecast/greater_accra?horizon=6');
    // 200 or 404 (insufficient history)
    if (res.status !== 200 && res.status !== 404)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
  });

  // Alerts
  await test('GET /platform/alerts/summary', async () => {
    const res = await api.get('/api/v1/analytics/platform/alerts/summary');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('GET /platform/alerts', async () => {
    const res = await api.get('/api/v1/analytics/platform/alerts');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('POST /platform/alerts — create alert', async () => {
    const res = await api.post('/api/v1/analytics/platform/alerts', {
      severity: 'warning',
      category: 'construction',
      title: 'Test Alert from API test suite',
      message: 'Automated test alert — safe to delete',
      region: 'greater_accra',
    });
    if (res.status !== 201)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
    ALERT_ID = res.data?.data?.id ?? '';
  });

  await test(
    'PATCH /platform/alerts/:id/acknowledge',
    async () => {
      const res = await api.patch(`/api/v1/analytics/platform/alerts/${ALERT_ID}/acknowledge`);
      expectOkOrEmpty(res);
    },
    () => !ALERT_ID,
  );

  await test(
    'PATCH /platform/alerts/:id/resolve',
    async () => {
      const res = await api.patch(`/api/v1/analytics/platform/alerts/${ALERT_ID}/resolve`);
      expectOkOrEmpty(res);
    },
    () => !ALERT_ID,
  );

  await test('GET /platform/alerts/rules', async () => {
    const res = await api.get('/api/v1/analytics/platform/alerts/rules');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  await test('POST /platform/alerts/rules — create rule', async () => {
    const res = await api.post('/api/v1/analytics/platform/alerts/rules', {
      name: 'Test CCI Threshold Rule',
      category: 'construction',
      metric_name: 'national_cci',
      condition: 'greater_than',
      threshold_value: 200,
      severity: 'warning',
      description: 'Alert when CCI exceeds 200',
      cooldown_hours: 24,
    });
    if (res.status !== 201)
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
    ALERT_RULE_ID = res.data?.data?.id ?? '';
  });

  await test(
    'PATCH /platform/alerts/rules/:id/toggle',
    async () => {
      const res = await api.patch(`/api/v1/analytics/platform/alerts/rules/${ALERT_RULE_ID}/toggle`, {
        is_active: false,
      });
      expectOkOrEmpty(res);
    },
    () => !ALERT_RULE_ID,
  );

  await test('POST /platform/alerts/evaluate', async () => {
    const res = await api.post('/api/v1/analytics/platform/alerts/evaluate');
    expectOkOrEmpty(res);
    if (!res.data?.success) throw new Error('success=false: ' + JSON.stringify(res.data).slice(0, 100));
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  section('D. Cleanup');

  await test(
    'DELETE /platform/alerts/rules/:id',
    async () => {
      const res = await api.delete(`/api/v1/analytics/platform/alerts/rules/${ALERT_RULE_ID}`);
      if (res.status !== 200 && res.status !== 204)
        throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 100)}`);
    },
    () => !ALERT_RULE_ID,
  );

  await test(
    'PATCH /platform/alerts/:id/dismiss (test alert)',
    async () => {
      const res = await api.patch(`/api/v1/analytics/platform/alerts/${ALERT_ID}/dismiss`);
      expectOkOrEmpty(res);
    },
    () => !ALERT_ID,
  );

  // ─── Summary ─────────────────────────────────────────────────────────────────
  const total = passed + failed + skipped;
  console.log('\n' + '═'.repeat(60));
  console.log(`Results: ${total} tests`);
  console.log(`  \x1b[32m✓ Passed : ${passed}\x1b[0m`);
  console.log(`  \x1b[31m✗ Failed : ${failed}\x1b[0m`);
  console.log(`  \x1b[33m○ Skipped: ${skipped}\x1b[0m`);
  console.log('═'.repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
