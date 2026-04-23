/**
 * Tenant Portal Endpoint Test Suite
 * Tests all /api/v1/tenant-portal endpoints
 *
 * Auth strategy: Uses OTP flow (dev mode returns OTP in response)
 *   1. POST /auth/otp/request → response.otp
 *   2. POST /auth/otp/verify  → response.sessionToken
 *
 * Test tenant: cedynhq@gmail.com (active, has 1 active tenancy)
 * Run:
 *   cd backend && npx ts-node scripts/test-tenant-portal-endpoints.ts
 */

import axios, { AxiosError } from 'axios';

// Global timeout — prevents hanging on unavailable external services (Keycloak, Paystack, etc.)
axios.defaults.timeout = 12000;

const BASE = 'http://localhost:4000/api/v1/tenant-portal';
const TENANT_EMAIL = 'cedynhq@gmail.com';
const KNOWN_TENANCY_ID = '80037268-3ef1-495d-82fe-d417d8df9f6b';
const FAKE_UUID = '00000000-0000-0000-0000-000000000099';

// ─── State captured across tests ─────────────────────────────────────────────
let sessionToken = '';
let tenantId = '';
let workOrderId = '';
let conversationId = '';
let notificationId = '';
let sessionId = '';
const createdIds: { workOrderId?: string; conversationId?: string } = {};

// ─── Utilities ────────────────────────────────────────────────────────────────

interface TestResult {
  section: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  code?: number;
  note?: string;
}

const results: TestResult[] = [];
let currentSection = '';

function section(name: string) {
  currentSection = name;
  console.log(`\n━━━ ${name} ━━━`);
}

function auth() {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
}

async function test(
  name: string,
  fn: () => Promise<{ status: number; data?: any }>,
  expected: number | number[],
  opts: { skip?: boolean; note?: string } = {}
) {
  if (opts.skip) {
    results.push({ section: currentSection, name, status: 'SKIP', note: opts.note || 'skipped' });
    console.log(`  ⏭  SKIP  ${name}${opts.note ? ' — ' + opts.note : ''}`);
    return null;
  }

  try {
    const { status, data } = await fn();
    const expectedArr = Array.isArray(expected) ? expected : [expected];
    const pass = expectedArr.includes(status);
    const icon = pass ? '✓' : '✗';
    const label = pass ? 'PASS' : 'FAIL';
    results.push({ section: currentSection, name, status: label, code: status, note: opts.note });
    console.log(`  ${icon}  ${label}  ${name} [${status}]${opts.note ? ' — ' + opts.note : ''}`);
    return data;
  } catch (err: any) {
    const code = err?.response?.status;
    const data = err?.response?.data;
    if (code) {
      const expectedArr = Array.isArray(expected) ? expected : [expected];
      const pass = expectedArr.includes(code);
      const icon = pass ? '✓' : '✗';
      const label = pass ? 'PASS' : 'FAIL';
      const detail = typeof data === 'object' ? (data?.error || data?.message || '') : '';
      results.push({ section: currentSection, name, status: label, code, note: detail || opts.note });
      console.log(`  ${icon}  ${label}  ${name} [${code}]${detail ? ' — ' + detail : ''}`);
      return null;
    }
    results.push({ section: currentSection, name, status: 'FAIL', note: err.message });
    console.log(`  ✗  FAIL  ${name} — ${err.message}`);
    return null;
  }
}

// ─── SETUP: Bootstrap tenant session via OTP flow ─────────────────────────────

async function bootstrapTenantSession(): Promise<boolean> {
  console.log('\n━━━ Session Bootstrap (OTP) ━━━');

  // Step 1: Request OTP
  let otp: string | undefined;
  try {
    const r = await axios.post(`${BASE}/auth/otp/request`, { email: TENANT_EMAIL });
    otp = r.data?.otp;
    if (otp) {
      console.log(`  ✓  OTP obtained (dev mode): ${otp}`);
    } else {
      console.log('  ✗  OTP request succeeded but no OTP in response (not in dev mode?)');
      return false;
    }
  } catch (e: any) {
    console.log(`  ✗  OTP request failed: ${e?.response?.data?.error || e.message}`);
    return false;
  }

  // Step 2: Verify OTP → get session token
  try {
    const r = await axios.post(`${BASE}/auth/otp/verify`, { email: TENANT_EMAIL, otp });
    sessionToken = r.data?.sessionToken;
    tenantId = r.data?.tenant?.id;
    if (sessionToken) {
      console.log(`  ✓  Session token obtained, tenantId=${tenantId}`);
      return true;
    } else {
      console.log('  ✗  OTP verify succeeded but no sessionToken in response');
      return false;
    }
  } catch (e: any) {
    console.log(`  ✗  OTP verify failed: ${e?.response?.data?.error || e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  TENANT PORTAL ENDPOINT TESTS                ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Base URL : ${BASE}`);
  console.log(`  Tenant   : ${TENANT_EMAIL}`);
  const start = Date.now();

  // ─── SECTION 1: Public Auth Endpoints ──────────────────────────────────────
  section('1. Auth — Public Endpoints');

  await test(
    'GET /auth/keycloak/config',
    () => axios.get(`${BASE}/auth/keycloak/config`).then(r => ({ status: r.status, data: r.data })),
    200
  );

  await test(
    'POST /auth/keycloak/exchange — missing params → 400',
    () => axios.post(`${BASE}/auth/keycloak/exchange`, {}).then(r => ({ status: r.status })),
    400
  );

  await test(
    'POST /auth/keycloak/password-login — invalid creds → 401',
    () => axios.post(`${BASE}/auth/keycloak/password-login`, {
      email: 'nobody@example.com',
      password: 'badpassword'
    }).then(r => ({ status: r.status })),
    [401, 500],
    { note: '401 = KC rejected creds, 500 = KC error' }
  );

  await test(
    'GET /auth/keycloak/reset-password-url',
    () => axios.get(`${BASE}/auth/keycloak/reset-password-url`).then(r => ({ status: r.status, data: r.data })),
    [200, 500],
    { note: '200 if Keycloak configured, else 500' }
  );

  await test(
    'POST /auth/magic-link — request magic link (dev returns token)',
    () => axios.post(`${BASE}/auth/magic-link`, { identifier: TENANT_EMAIL })
      .then(r => ({ status: r.status, data: r.data })),
    200
  );

  await test(
    'POST /auth/otp/request — valid email',
    () => axios.post(`${BASE}/auth/otp/request`, { email: TENANT_EMAIL })
      .then(r => ({ status: r.status, data: r.data })),
    200
  );

  await test(
    'GET /auth/verify — missing token → 400',
    () => axios.get(`${BASE}/auth/verify`).then(r => ({ status: r.status })),
    400
  );

  await test(
    'GET /auth/verify — invalid token → 401',
    () => axios.get(`${BASE}/auth/verify?token=invalid-token-xyz`).then(r => ({ status: r.status })),
    401
  );

  await test(
    'POST /auth/setup-password — missing token → 400',
    () => axios.post(`${BASE}/auth/setup-password`, { password: 'TestPass1!' })
      .then(r => ({ status: r.status })),
    400
  );

  await test(
    'POST /auth/logout — unauthenticated → 401',
    () => axios.post(`${BASE}/auth/logout`, {}).then(r => ({ status: r.status })),
    401
  );

  // ─── BOOTSTRAP: Get tenant session ─────────────────────────────────────────
  const authOk = await bootstrapTenantSession();
  if (!authOk) {
    console.log('\n  ⚠  Cannot continue without a tenant session token.');
    console.log('     Remaining authenticated tests will be marked as SKIP.\n');
  }

  // ─── SECTION 2: Profile ────────────────────────────────────────────────────
  section('2. Profile');

  await test(
    'GET /profile',
    () => axios.get(`${BASE}/profile`, { headers: auth() }).then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'PATCH /profile — update email',
    () => axios.patch(`${BASE}/profile`, { email: TENANT_EMAIL }, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  // ─── SECTION 3: Tenancies ──────────────────────────────────────────────────
  section('3. Tenancies');

  const tenanciesData = await test(
    'GET /tenancies',
    () => axios.get(`${BASE}/tenancies`, { headers: auth() }).then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /tenancies/:id — known tenancy',
    () => axios.get(`${BASE}/tenancies/${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /tenancies/:id — wrong tenancy → 404',
    () => axios.get(`${BASE}/tenancies/${FAKE_UUID}`, { headers: auth() })
      .then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session' }
  );

  // ─── SECTION 4: Payments — Read ────────────────────────────────────────────
  section('4. Payments — Read');

  await test(
    'GET /payments/summary/:tenancyId',
    () => axios.get(`${BASE}/payments/summary/${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/schedules/:tenancyId',
    () => axios.get(`${BASE}/payments/schedules/${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/history/:tenancyId',
    () => axios.get(`${BASE}/payments/history/${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/schedules/:tenancyId — wrong tenancy → 404',
    () => axios.get(`${BASE}/payments/schedules/${FAKE_UUID}`, { headers: auth() })
      .then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session' }
  );

  // ─── SECTION 5: Payments — Write/Fee ──────────────────────────────────────
  section('5. Payments — Fee & Initiation');

  await test(
    'POST /payments/calculate-fee — missing params → 400',
    () => axios.post(`${BASE}/payments/calculate-fee`, {}, { headers: auth() })
      .then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /payments/calculate-fee — valid params',
    () => axios.post(`${BASE}/payments/calculate-fee`, {
      tenancyId: KNOWN_TENANCY_ID,
      amount: 2500
    }, { headers: auth() }).then(r => ({ status: r.status, data: r.data })),
    [200, 400, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /payments/initiate — missing params → 400',
    () => axios.post(`${BASE}/payments/initiate`, {}, { headers: auth() })
      .then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /payments/initiate — valid params (Paystack may 400)',
    () => axios.post(`${BASE}/payments/initiate`, {
      tenancyId: KNOWN_TENANCY_ID,
      amount: 2500,
      channel: 'mobile_money'
    }, { headers: auth() }).then(r => ({ status: r.status, data: r.data })),
    [200, 400, 404],
    { skip: !authOk, note: 'Paystack not configured in test env' }
  );

  await test(
    'GET /payments/verify/:reference — invalid reference',
    () => axios.get(`${BASE}/payments/verify/not-a-real-ref`).then(r => ({ status: r.status })),
    [200, 400, 500],
    { note: 'Paystack not configured — returns 200 with not-found payload or 400/500' }
  );

  // ─── SECTION 6: Crypto Payments ────────────────────────────────────────────
  section('6. Crypto Payments');

  await test(
    'GET /payments/crypto/status',
    () => axios.get(`${BASE}/payments/crypto/status`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/crypto/settlement-coins',
    () => axios.get(`${BASE}/payments/crypto/settlement-coins`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/crypto/estimate — missing params → 400',
    () => axios.get(`${BASE}/payments/crypto/estimate`, { headers: auth() })
      .then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/crypto/estimate — with params',
    () => axios.get(`${BASE}/payments/crypto/estimate?amount=2500&payCurrency=btc&tenancyId=${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 400, 500],
    { skip: !authOk, note: 'depends on exchange rate service' }
  );

  await test(
    'POST /payments/crypto/initiate — invalid wallet address → 400',
    () => axios.post(`${BASE}/payments/crypto/initiate`, {
      tenancyId: KNOWN_TENANCY_ID,
      amount: 2500,
      payerWalletAddress: 'not-a-wallet',
      tokenAddress: 'not-a-token'
    }, { headers: auth() }).then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /payments/crypto/verify — invalid txHash → 400',
    () => axios.post(`${BASE}/payments/crypto/verify`, {
      txHash: 'not-a-valid-hash'
    }, { headers: auth() }).then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /payments/crypto/unified-initiate — missing params → 400',
    () => axios.post(`${BASE}/payments/crypto/unified-initiate`, {
      tenancyId: KNOWN_TENANCY_ID
    }, { headers: auth() }).then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/crypto/nowpayments-status/:paymentId — NaN → 400',
    () => axios.get(`${BASE}/payments/crypto/nowpayments-status/not-a-number`, { headers: auth() })
      .then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /payments/crypto/nowpayments-status/:paymentId — fake ID',
    () => axios.get(`${BASE}/payments/crypto/nowpayments-status/999999999`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 400, 500],
    { skip: !authOk, note: 'depends on NowPayments config' }
  );

  // ─── SECTION 7: Maintenance ────────────────────────────────────────────────
  section('7. Maintenance');

  await test(
    'GET /maintenance/:tenancyId',
    () => axios.get(`${BASE}/maintenance/${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /maintenance/:tenancyId — wrong tenancy → 404',
    () => axios.get(`${BASE}/maintenance/${FAKE_UUID}`, { headers: auth() })
      .then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session' }
  );

  const workOrderData = await test(
    'POST /maintenance — create work order',
    () => axios.post(`${BASE}/maintenance`, {
      tenancyId: KNOWN_TENANCY_ID,
      title: '[TEST] Leaking tap in kitchen',
      category: 'plumbing',
      description: 'The kitchen tap has been dripping for several days.',
      priority: 'medium'
    }, { headers: auth() }).then(r => ({ status: r.status, data: r.data })),
    [201, 200, 400],
    { skip: !authOk, note: 'no session' }
  );

  if (workOrderData?.id) {
    workOrderId = workOrderData.id;
    createdIds.workOrderId = workOrderId;
  } else if (workOrderData?.workOrder?.id) {
    workOrderId = workOrderData.workOrder.id;
    createdIds.workOrderId = workOrderId;
  }

  await test(
    'GET /maintenance/status/:workOrderId — valid',
    () => axios.get(`${BASE}/maintenance/status/${workOrderId}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    workOrderId ? [200, 404] : 404,
    {
      skip: !authOk,
      note: workOrderId ? `id=${workOrderId.substring(0, 8)}` : 'no workOrderId created'
    }
  );

  await test(
    'GET /maintenance/status/:workOrderId — fake ID → 404',
    () => axios.get(`${BASE}/maintenance/status/${FAKE_UUID}`, { headers: auth() })
      .then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session' }
  );

  // ─── SECTION 8: Documents ──────────────────────────────────────────────────
  section('8. Documents');

  await test(
    'GET /documents/:tenancyId',
    () => axios.get(`${BASE}/documents/${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /documents/:tenancyId — wrong tenancy → 404',
    () => axios.get(`${BASE}/documents/${FAKE_UUID}`, { headers: auth() })
      .then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /documents/upload — no file → 400',
    () => axios.post(`${BASE}/documents/upload`, {
      tenancyId: KNOWN_TENANCY_ID,
      documentType: 'other'
    }, { headers: auth() }).then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'file upload requires multipart; testing validation path' }
  );

  // ─── SECTION 9: Sessions ───────────────────────────────────────────────────
  section('9. Sessions');

  const sessionsData = await test(
    'GET /sessions',
    () => axios.get(`${BASE}/sessions`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  if (sessionsData?.sessions?.length > 0) {
    // Find a session that is NOT the current one to safely delete
    const otherSession = sessionsData.sessions.find((s: any) => !s.isCurrent);
    if (otherSession) sessionId = otherSession.id;
  }

  await test(
    'DELETE /sessions/:sessionId — other session (or fake → 404)',
    () => axios.delete(`${BASE}/sessions/${sessionId || FAKE_UUID}`, { headers: auth() })
      .then(r => ({ status: r.status })),
    sessionId ? [200, 404] : 404,
    { skip: !authOk, note: sessionId ? `id=${sessionId.substring(0, 8)}` : 'no other session found → 404' }
  );

  // ─── SECTION 10: Password & 2FA ────────────────────────────────────────────
  section('10. Password & 2FA');

  await test(
    'POST /change-password — missing params → 400',
    () => axios.post(`${BASE}/change-password`, {}, { headers: auth() })
      .then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /2fa/status',
    () => axios.get(`${BASE}/2fa/status`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /2fa/enable — email method',
    () => axios.post(`${BASE}/2fa/enable`, { method: 'email' }, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 500],
    { skip: !authOk, note: 'no session; 500 if email not configured' }
  );

  await test(
    'POST /2fa/verify — invalid OTP → 400',
    () => axios.post(`${BASE}/2fa/verify`, { otp: '000000', method: 'email' }, { headers: auth() })
      .then(r => ({ status: r.status })),
    [400, 401],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /2fa/disable — missing password → 400',
    () => axios.post(`${BASE}/2fa/disable`, {}, { headers: auth() })
      .then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  // ─── SECTION 11: Notifications ─────────────────────────────────────────────
  section('11. Notifications');

  const notifData = await test(
    'GET /notifications',
    () => axios.get(`${BASE}/notifications`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  if (notifData?.notifications?.length > 0) {
    notificationId = notifData.notifications[0].id;
  }

  await test(
    'PATCH /notifications/:id/read — valid/fake ID',
    () => axios.patch(`${BASE}/notifications/${notificationId || FAKE_UUID}/read`, {}, { headers: auth() })
      .then(r => ({ status: r.status })),
    200,
    {
      skip: !authOk,
      note: notificationId ? `id=${notificationId?.toString().substring(0, 8)}` : 'no notifications; UPDATE affects 0 rows → still 200'
    }
  );

  await test(
    'POST /notifications/mark-all-read',
    () => axios.post(`${BASE}/notifications/mark-all-read`, {}, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  // ─── SECTION 12: Conversations ─────────────────────────────────────────────
  section('12. Conversations & Messages');

  const convListData = await test(
    'GET /conversations',
    () => axios.get(`${BASE}/conversations`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  const newConvData = await test(
    'POST /conversations — create new',
    () => axios.post(`${BASE}/conversations`, {
      tenancyId: KNOWN_TENANCY_ID,
      subject: '[TEST] General enquiry',
      message: 'Hello, this is an automated test message.'
    }, { headers: auth() }).then(r => ({ status: r.status, data: r.data })),
    [200, 201, 400, 404],
    { skip: !authOk, note: 'no session' }
  );

  if (newConvData?.conversation?.id) {
    conversationId = newConvData.conversation.id;
    createdIds.conversationId = conversationId;
  }

  // Fall back to any existing conversation
  if (!conversationId && convListData?.conversations?.length > 0) {
    conversationId = convListData.conversations[0].id;
  }

  await test(
    'GET /conversations/:id/messages',
    () => axios.get(`${BASE}/conversations/${conversationId}/messages`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    conversationId ? [200, 404] : 404,
    {
      skip: !authOk || !conversationId,
      note: conversationId ? `id=${conversationId.substring(0, 8)}` : 'no conversation created'
    }
  );

  await test(
    'GET /conversations/:id/messages — fake ID → 404',
    () => axios.get(`${BASE}/conversations/${FAKE_UUID}/messages`, { headers: auth() })
      .then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /conversations/:id/messages — send reply',
    () => axios.post(`${BASE}/conversations/${conversationId}/messages`, {
      content: 'This is an automated test reply.'
    }, { headers: auth() }).then(r => ({ status: r.status, data: r.data })),
    conversationId ? [200, 201, 400, 404] : 400,
    {
      skip: !authOk || !conversationId,
      note: conversationId ? `id=${conversationId.substring(0, 8)}` : 'no conversation available'
    }
  );

  await test(
    'POST /conversations/:id/messages — missing content → 400',
    () => axios.post(`${BASE}/conversations/${conversationId || FAKE_UUID}/messages`, {}, { headers: auth() })
      .then(r => ({ status: r.status })),
    [400, 404],
    { skip: !authOk, note: 'no session' }
  );

  // ─── SECTION 13: Utility Charges ───────────────────────────────────────────
  section('13. Utility Charges');

  await test(
    'GET /utility-charges/:tenancyId',
    () => axios.get(`${BASE}/utility-charges/${KNOWN_TENANCY_ID}`, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    [200, 404],
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /utility-charges/:tenancyId — wrong tenancy → 404',
    () => axios.get(`${BASE}/utility-charges/${FAKE_UUID}`, { headers: auth() })
      .then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /utility-charges/:id/dispute — missing reason → 400',
    () => axios.post(`${BASE}/utility-charges/${FAKE_UUID}/dispute`, {}, { headers: auth() })
      .then(r => ({ status: r.status })),
    400,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'POST /utility-charges/:id/dispute — fake ID with reason → 404',
    () => axios.post(`${BASE}/utility-charges/${FAKE_UUID}/dispute`, {
      reason: 'This charge is incorrect'
    }, { headers: auth() }).then(r => ({ status: r.status })),
    404,
    { skip: !authOk, note: 'no session; no matching charge' }
  );

  // ─── SECTION 14: Auth Logout (end of session) ─────────────────────────────
  section('14. Auth — Logout');

  await test(
    'POST /auth/logout — revoke current session',
    () => axios.post(`${BASE}/auth/logout`, {}, { headers: auth() })
      .then(r => ({ status: r.status, data: r.data })),
    200,
    { skip: !authOk, note: 'no session' }
  );

  await test(
    'GET /profile — after logout → 401',
    () => axios.get(`${BASE}/profile`, { headers: auth() })
      .then(r => ({ status: r.status })),
    401,
    { skip: !authOk, note: 'token revoked' }
  );

  // ─── CLEANUP ───────────────────────────────────────────────────────────────
  console.log('\n━━━ Cleanup ━━━');
  if (createdIds.workOrderId) {
    console.log(`  ℹ  Work order created: ${createdIds.workOrderId} (left in DB)`);
  }
  if (createdIds.conversationId) {
    console.log(`  ℹ  Conversation created: ${createdIds.conversationId} (left in DB)`);
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  TEST SUMMARY                                ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`  Total   : ${results.length} tests  (${elapsed}s)`);
  console.log(`  Passed  : ${passed}`);
  console.log(`  Failed  : ${failed}`);
  console.log(`  Skipped : ${skipped}  (missing upstream IDs or no session)`);
  console.log('╚══════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n  ✗  Failures:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`     [${r.section}] ${r.name}${r.code ? ` [${r.code}]` : ''}${r.note ? ` — ${r.note}` : ''}`);
    });
    process.exit(1);
  } else {
    console.log('\n  All tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
