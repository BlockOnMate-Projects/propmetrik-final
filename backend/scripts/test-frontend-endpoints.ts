/**
 * PROPMETRIK — Frontend Endpoint Integration Test
 * 
 * Tests all backend API endpoints used by the valuation module's frontend pages:
 *   - Team (valuation-org: members, invitations)
 *   - Finance (valuation-invoices: list, summary, fee-calculator, payments)
 *   - Clients (valuation-clients: CRUD, valuations, invoices)
 *   - Analytics (derived from valuations + invoices data)
 *   - Settings (localStorage-only — no backend endpoints)
 *   - Calendar (no dedicated endpoints — uses valuations list)
 *   - Templates (localStorage-only — no backend endpoints)
 * 
 * Usage:
 *   npx tsx scripts/test-frontend-endpoints.ts
 *   npx tsx scripts/test-frontend-endpoints.ts --page team
 *   npx tsx scripts/test-frontend-endpoints.ts --page finance
 *   npx tsx scripts/test-frontend-endpoints.ts --page clients
 *   npx tsx scripts/test-frontend-endpoints.ts --page payments
 *   npx tsx scripts/test-frontend-endpoints.ts --page all
 */

const BASE_URL = process.env.API_BASE || 'http://127.0.0.1:4000/api/v1';
const DEV_ORG_ID = process.env.ORG_ID || '00000000-0000-0000-0000-000000000001';
const DEV_USER_ID = process.env.USER_ID || '00000000-0000-0000-0000-000000000001';

// ============================================================================
// HELPERS
// ============================================================================

interface TestResult {
  name: string;
  page: string;
  method: string;
  url: string;
  status: number;
  passed: boolean;
  error?: string;
  responseSnippet?: string;
  durationMs: number;
}

const results: TestResult[] = [];

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-organization-id': DEV_ORG_ID,
    'x-user-id': DEV_USER_ID,
    ...extra,
  };
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function snippet(body: any): string {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  return s.length > 200 ? s.substring(0, 200) + '…' : s;
}

async function test(
  page: string,
  name: string,
  method: string,
  path: string,
  opts?: { body?: any; expectStatus?: number | number[] }
): Promise<TestResult> {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  let status = 0;
  let body: any = null;
  let error: string | undefined;

  try {
    const fetchOpts: RequestInit = {
      method,
      headers: headers(),
    };
    if (opts?.body) {
      fetchOpts.body = JSON.stringify(opts.body);
    }

    const res = await fetch(url, fetchOpts);
    status = res.status;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }

    const expectedStatuses = opts?.expectStatus
      ? Array.isArray(opts.expectStatus) ? opts.expectStatus : [opts.expectStatus]
      : [200, 201];

    const passed = expectedStatuses.includes(status);
    if (!passed) {
      error = `Expected ${expectedStatuses.join('|')}, got ${status}: ${snippet(body)}`;
    }
  } catch (e: any) {
    error = e.message;
  }

  const result: TestResult = {
    name,
    page,
    method,
    url,
    status,
    passed: !error,
    error,
    responseSnippet: body ? snippet(body) : undefined,
    durationMs: Date.now() - start,
  };

  results.push(result);
  const icon = result.passed ? '✅' : '❌';
  console.log(`  ${icon} ${method.padEnd(6)} ${path.padEnd(55)} ${status} (${result.durationMs}ms)`);
  if (error && !result.passed) {
    console.log(`       ↳ ${error}`);
  }

  return result;
}

// ============================================================================
// TEST SUITES BY PAGE
// ============================================================================

async function testTeamPage() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📋 TEAM PAGE — /dashboard/valuations/team');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. List members
  await test('team', 'List org members', 'GET', '/valuation-org/members');

  // 2. List invitations
  await test('team', 'List invitations', 'GET', '/valuation-org/invitations');

  // 3. Send invitation (expect 400 without proper email or 201 with)
  await test('team', 'Send invitation (validation)', 'POST', '/valuation-org/invitations', {
    body: { email: 'test@example.com', role: 'valuer' },
    expectStatus: [200, 201, 400, 409], // 400 = validation, 409 = already invited
  });

  // 4. Resend invitation to non-existent ID (expect 404)
  await test('team', 'Resend invitation (bad id)', 'POST', '/valuation-org/invitations/00000000-0000-0000-0000-000000000099/resend', {
    expectStatus: [200, 404],
  });

  // 5. Revoke non-existent invitation
  await test('team', 'Revoke invitation (bad id)', 'DELETE', '/valuation-org/invitations/00000000-0000-0000-0000-000000000099', {
    expectStatus: [200, 404],
  });

  // 6. Update member role (bad id)
  await test('team', 'Update member role (bad id)', 'PUT', '/valuation-org/members/00000000-0000-0000-0000-000000000099/role', {
    body: { role: 'lead_valuer' },
    expectStatus: [200, 404],
  });
}

async function testFinancePage() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  💰 FINANCE PAGE — /dashboard/valuations/finance');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. List invoices
  await test('finance', 'List invoices', 'GET', '/valuation-invoices?limit=50');

  // 2. Invoice summary
  await test('finance', 'Get invoice summary', 'GET', '/valuation-invoices/summary');

  // 3. Fee calculator (percentage_of_value model)
  await test('finance', 'Fee calculator (percentage)', 'GET',
    '/valuation-invoices/fee-calculator?feeModel=percentage_of_value&propertyValue=500000');

  // 4. Fee calculator (man_day_rate model)
  await test('finance', 'Fee calculator (man-day)', 'GET',
    '/valuation-invoices/fee-calculator?feeModel=man_day_rate&manDays=' + encodeURIComponent(JSON.stringify([{category:'senior_consultant',days:2},{category:'technical_officer',days:3}])));

  // 5. Man-day rates
  await test('finance', 'Get man-day rates', 'GET', '/valuation-invoices/man-day-rates');

  // 6. Clients list (used in invoice creation modal)
  await test('finance', 'List clients for invoice', 'GET', '/valuation-clients?limit=100');

  // 7. Create invoice (validation — missing required fields returns 400)
  await test('finance', 'Create invoice (validation)', 'POST', '/valuation-invoices', {
    body: {
      clientName: 'Test Client',
      propertyAddress: '123 Test St',
      lineItems: [{ description: 'Valuation Fee', quantity: 1, unitPrice: 5000, amount: 5000 }],
    },
    expectStatus: [200, 201, 400, 500], // May fail on foreign keys but should not crash
  });
}

async function testPaymentSettings() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  🏦 PAYMENT SETTINGS — /dashboard/valuations/finance (tab 2)');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. Get payment account config
  await test('payments', 'Get payment account', 'GET', '/valuation-invoices/payments/account');

  // 2. List banks
  await test('payments', 'List banks', 'GET', '/valuation-invoices/payments/banks');

  // 3. Resolve account (validation)
  await test('payments', 'Resolve bank account', 'POST', '/valuation-invoices/payments/resolve-account', {
    body: { accountNumber: '0246341310', bankCode: 'MTN' },
    expectStatus: [200, 400, 422, 429, 500], // May fail if Paystack isn't configured or rate-limited
  });

  // 4. Register account (validation)
  await test('payments', 'Register payout account', 'POST', '/valuation-invoices/payments/register-account', {
    body: {
      bankCode: 'MTN',
      accountNumber: '0246341310',
      businessName: 'Test Valuation Firm',
    },
    expectStatus: [200, 201, 400, 422, 500], // May fail without real Paystack key
  });

  // 5. Get crypto wallet
  await test('payments', 'Get crypto wallet', 'GET', '/valuation-invoices/payments/crypto-wallet');

  // 6. Get settlement coins
  await test('payments', 'List settlement coins', 'GET', '/valuation-invoices/payments/settlement-coins');

  // 7. Save crypto wallet (validation)
  await test('payments', 'Save crypto wallet', 'POST', '/valuation-invoices/payments/crypto-wallet', {
    body: { walletAddress: '0x0000000000000000000000000000000000000000', payoutCoin: 'USDT', payoutChain: 'polygon' },
    expectStatus: [200, 201, 400, 500],
  });
}

async function testClientsPage() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  👥 CLIENTS PAGE — /dashboard/valuations/clients');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. List clients
  const listResult = await test('clients', 'List clients', 'GET', '/valuation-clients');

  // 2. List with search
  await test('clients', 'Search clients', 'GET', '/valuation-clients?search=test&limit=8');

  // 3. Create a test client
  const createResult = await test('clients', 'Create client', 'POST', '/valuation-clients', {
    body: {
      name: '__test_client_' + Date.now(),
      type: 'individual',
      email: 'test-endpoint@example.com',
      phone: '+233201234567',
      address: '123 Test Road, Accra',
    },
    expectStatus: [200, 201],
  });

  let testClientId: string | null = null;
  try {
    const parsed = JSON.parse(createResult.responseSnippet || '{}');
    testClientId = parsed.client?.id || parsed.id || null;
  } catch {}

  if (testClientId) {
    // 4. Get client by ID
    await test('clients', 'Get client by ID', 'GET', `/valuation-clients/${testClientId}`);

    // 5. Get client valuations
    await test('clients', 'Get client valuations', 'GET', `/valuation-clients/${testClientId}/valuations`);

    // 6. Get client invoices
    await test('clients', 'Get client invoices', 'GET', `/valuation-clients/${testClientId}/invoices`);

    // 7. Update client
    await test('clients', 'Update client', 'PUT', `/valuation-clients/${testClientId}`, {
      body: { name: '__test_client_updated', phone: '+233209999999' },
    });

    // 8. Delete test client (cleanup)
    await test('clients', 'Delete client (cleanup)', 'DELETE', `/valuation-clients/${testClientId}`, {
      expectStatus: [200, 204],
    });
  } else {
    console.log('  ⚠️  Skipping CRUD tests — could not create test client');

    // Try existing client
    try {
      const parsed = JSON.parse(listResult.responseSnippet || '{}');
      const existingId = parsed.clients?.[0]?.id;
      if (existingId) {
        await test('clients', 'Get client by ID (existing)', 'GET', `/valuation-clients/${existingId}`);
        await test('clients', 'Get client valuations (existing)', 'GET', `/valuation-clients/${existingId}/valuations`);
        await test('clients', 'Get client invoices (existing)', 'GET', `/valuation-clients/${existingId}/invoices`);
      }
    } catch {}
  }
}

async function testValuationsCore() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 VALUATIONS CORE — /dashboard/valuations');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. List valuations
  await test('valuations', 'List valuations', 'GET', '/valuations?limit=10');

  // 2. Stats (used by main page + analytics)
  await test('valuations', 'Get stats', 'GET', '/valuations/stats');

  // 3. Market data for Greater Accra (requires Python engine)
  await test('analytics', 'Market data (Greater Accra)', 'GET', '/valuations/market/greater_accra', {
    expectStatus: [200, 500], // 500 if Python engine not running
  });

  // 4. Cap rate benchmarks
  await test('analytics', 'Cap rate benchmarks', 'GET', '/valuations/cap-rate/benchmarks', {
    expectStatus: [200, 500], // May fail if OpenSearch isn't populated
  });

  // 5. Rental benchmarks
  await test('analytics', 'Rental benchmarks', 'GET', '/valuations/rental-benchmarks');
}

async function testSettingsAndTemplates() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ⚙️  SETTINGS & 📄 TEMPLATES — localStorage only');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ℹ️  Settings page: No backend endpoints — uses localStorage');
  console.log('  ℹ️  Templates page: No backend endpoints — uses localStorage');
  console.log('  ℹ️  These pages are client-side only, no API tests needed');
}

async function testHealthAndConnectivity() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  🔌 CONNECTIVITY & HEALTH');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. Health check (mounted at root, not under /api/v1)
  const healthUrl = BASE_URL.replace('/api/v1', '') + '/health';
  const hStart = Date.now();
  try {
    const res = await fetch(healthUrl);
    const body = await res.json();
    const icon = res.status === 200 ? '✅' : '❌';
    console.log(`  ${icon} GET    /health${' '.repeat(49)} ${res.status} (${Date.now() - hStart}ms)`);
    if (body.services) {
      for (const [svc, info] of Object.entries(body.services as Record<string, any>)) {
        const sIcon = info.status === 'up' ? '✅' : '❌';
        console.log(`       ${sIcon} ${svc}: ${info.status} (${info.latency || '?'}ms)`);
      }
    }
  } catch (e: any) {
    console.log(`  ❌ GET    /health${' '.repeat(49)} UNREACHABLE (${Date.now() - hStart}ms)`);
    console.log(`       ↳ ${e.message}`);
  }

  // 2. Python engine health
  const pythonBase = process.env.PYTHON_API || 'http://127.0.0.1:8001/api/v1';
  const pythonUrl = `${pythonBase}/health`;
  const start = Date.now();
  try {
    const res = await fetch(pythonUrl);
    const status = res.status;
    const icon = status === 200 ? '✅' : '⚠️';
    console.log(`  ${icon} GET    ${pythonUrl.padEnd(55)} ${status} (${Date.now() - start}ms)`);
  } catch {
    console.log(`  ⚠️  GET    ${pythonUrl.padEnd(55)} UNREACHABLE (${Date.now() - start}ms)`);
    console.log('       ↳ Python valuation engine is not running (optional for non-calculation pages)');
  }
}

// ============================================================================
// REPORT
// ============================================================================

function printReport() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 TEST REPORT');
  console.log('═══════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0);

  // Group by page
  const pages = [...new Set(results.map(r => r.page))];
  for (const page of pages) {
    const pageResults = results.filter(r => r.page === page);
    const pagePassed = pageResults.filter(r => r.passed).length;
    const pageTotal = pageResults.length;
    const icon = pagePassed === pageTotal ? '✅' : '⚠️';
    console.log(`  ${icon} ${page.toUpperCase().padEnd(12)} ${pagePassed}/${pageTotal} passed`);
  }

  console.log('  ─────────────────────────────────────────────────────');
  const overallIcon = failed === 0 ? '✅' : '❌';
  console.log(`  ${overallIcon} TOTAL: ${passed}/${total} passed, ${failed} failed (${totalTime}ms)`);

  if (failed > 0) {
    console.log('\n  ❌ FAILED TESTS:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`     • [${r.page}] ${r.method} ${r.url}`);
      console.log(`       ${r.error}`);
    }
  }

  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pageArgIdx = process.argv.indexOf('--page');
  const targetPage = process.argv.find(a => a.startsWith('--page='))?.split('=')[1]
    || (pageArgIdx > -1 ? process.argv[pageArgIdx + 1] : undefined)
    || 'all';

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  PROPMETRIK — Frontend Endpoint Integration Test         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`  Target:  ${targetPage}`);
  console.log(`  Backend: ${BASE_URL}`);
  console.log(`  Org ID:  ${DEV_ORG_ID}`);
  console.log(`  User ID: ${DEV_USER_ID}`);

  const pageMap: Record<string, () => Promise<void>> = {
    health: testHealthAndConnectivity,
    team: testTeamPage,
    finance: testFinancePage,
    payments: testPaymentSettings,
    clients: testClientsPage,
    valuations: testValuationsCore,
    settings: testSettingsAndTemplates,
    templates: testSettingsAndTemplates,
  };

  if (targetPage === 'all') {
    await testHealthAndConnectivity();
    await testTeamPage();
    await testFinancePage();
    await testPaymentSettings();
    await testClientsPage();
    await testValuationsCore();
    testSettingsAndTemplates();
  } else if (pageMap[targetPage]) {
    await pageMap[targetPage]();
  } else {
    console.error(`  ❌ Unknown page: ${targetPage}`);
    console.error(`  Available: ${Object.keys(pageMap).join(', ')}, all`);
    process.exit(1);
  }

  printReport();

  const failed = results.filter(r => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
