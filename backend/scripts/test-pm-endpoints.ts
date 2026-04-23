/**
 * PROPMETRIK — Property Management Services
 * Enterprise Test Suite
 *
 * Tests every endpoint under /api/v1/pm
 *
 * Run with:
 *   cd backend && npx ts-node scripts/test-pm-endpoints.ts
 *
 * Auto-logs in as eric@cedynhq.com — no env vars needed.
 */

import http from 'http';
import https from 'https';

// ─── Configuration ────────────────────────────────────────────────────────────
const BASE = process.env.PM_BASE_URL || 'http://localhost:4000';
const ORG_ID = process.env.ORG_ID || '00000000-0000-0000-0000-000000000001';
let AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const PM = `${BASE}/api/v1/pm`;

// ─── Colours ─────────────────────────────────────────────────────────────────
const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const B = '\x1b[34m'; const C = '\x1b[36m'; const W = '\x1b[37m';
const DIM = '\x1b[2m'; const Z = '\x1b[0m';

// ─── HTTP helper ──────────────────────────────────────────────────────────────
interface HttpResponse { status: number; data: any; }

function request(
    method: string,
    url: string,
    body?: any,
    extraHeaders?: Record<string, string>
): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
            ...(ORG_ID ? { 'X-Organization-Id': ORG_ID } : {}),
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
            ...extraHeaders,
        };
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(
            { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method, headers },
            (res) => {
                let raw = '';
                res.on('data', c => raw += c);
                res.on('end', () => {
                    let data: any = raw;
                    try { data = JSON.parse(raw); } catch { /* keep raw */ }
                    resolve({ status: res.statusCode ?? 0, data });
                });
            }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ─── Test runner ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const failures: string[] = [];

async function test(
    label: string,
    fn: () => Promise<HttpResponse>,
    expect: { status?: number | number[]; check?: (r: HttpResponse) => boolean }
) {
    try {
        const r = await fn();
        const expectedStatuses = Array.isArray(expect.status)
            ? expect.status
            : (expect.status !== undefined ? [expect.status] : null);
        const statusOk = expectedStatuses ? expectedStatuses.includes(r.status) : true;
        const checkOk = expect.check ? expect.check(r) : true;
        if (statusOk && checkOk) {
            console.log(`  ${G}✓ PASS${Z}  ${label} ${DIM}[${r.status}]${Z}`);
            passed++;
        } else {
            const msg = `  ${R}✗ FAIL${Z}  ${label} ${DIM}[${r.status}]${Z}`;
            console.log(msg);
            if (!statusOk) console.log(`         ${R}Expected status ${JSON.stringify(expect.status)}, got ${r.status}${Z}`);
            if (!checkOk) console.log(`         ${R}check() returned false — body: ${JSON.stringify(r.data).slice(0, 200)}${Z}`);
            failed++;
            failures.push(`${label} [${r.status}]`);
        }
    } catch (err: any) {
        console.log(`  ${R}✗ ERR ${Z}  ${label} — ${err.message}`);
        failed++;
        failures.push(`${label} [exception: ${err.message}]`);
    }
}

function skip(label: string, reason: string) {
    console.log(`  ${Y}⊘ SKIP${Z}  ${label} ${DIM}(${reason})${Z}`);
    skipped++;
}

function section(title: string) {
    console.log(`\n${C}${'═'.repeat(64)}${Z}`);
    console.log(`${C}  ${title}${Z}`);
    console.log(`${C}${'═'.repeat(64)}${Z}`);
}

function subsection(title: string) {
    console.log(`\n  ${B}▶ ${title}${Z}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    const start = Date.now();

    console.log(`\n${W}╔${'═'.repeat(62)}╗${Z}`);
    console.log(`${W}║   PROPMETRIK PROPERTY MANAGEMENT — ENTERPRISE TEST SUITE    ║${Z}`);
    console.log(`${W}╚${'═'.repeat(62)}╝${Z}`);
    console.log(`\n  Node.js Backend: ${BASE}`);

    // ── Auto-login ───────────────────────────────────────────────────────────
    if (!AUTH_TOKEN) {
        process.stdout.write(`  Auth           : logging in as eric@cedynhq.com ... `);
        try {
            const loginRes = await request('POST', `${BASE}/api/v1/auth/login`, {
                email: 'eric@cedynhq.com',
                password: 'Delta0246@'
            });
            if (loginRes.status !== 200 || !loginRes.data?.token) {
                console.log(`${R}FAILED${Z}`);
                console.log(`  ${R}Login returned ${loginRes.status}: ${JSON.stringify(loginRes.data).slice(0, 200)}${Z}\n`);
                process.exit(1);
            }
            AUTH_TOKEN = loginRes.data.token;
            console.log(`${G}OK${Z}`);
        } catch (err: any) {
            console.log(`${R}ERROR — ${err.message}${Z}\n`);
            process.exit(1);
        }
    } else {
        console.log(`  Auth           : token provided via env`);
    }

    // ── IDs captured during lifecycle tests ──────────────────────────────────
    let propertyId: string | null = null;
    let tenantId: string | null = null;
    let tenancyId: string | null = null;
    let workOrderId: string | null = null;
    let vendorId: string | null = null;
    let documentId: string | null = null;
    let financialId: string | null = null;
    let applicationId: string | null = null;
    let applicationLinkId: string | null = null;
    let applicationLinkToken: string | null = null;
    let paymentId: string | null = null;

    // =========================================================================
    section('1. PROPERTIES  —  /api/v1/pm/properties');
    // =========================================================================

    subsection('1.1 Create & List');
    await test('POST /properties — create residential property', async () => {
        const r = await request('POST', `${PM}/properties`, {
            name: 'PM Test House',        // route passes .passthrough() so both name & title work
            title: 'PM Test House',
            propertyType: 'residential_house',
            region: 'greater_accra',
            addressCity: 'Accra',
            addressStreet: '12 Independence Ave',
            price: 3500,
            priceCurrency: 'GHS',
            monthlyRent: 3500,
            bedrooms: 3,
            bathrooms: 2,
            totalAreaSqm: 120,
            transactionType: 'rental',
        });
        if (r.status === 201) {
            propertyId = r.data?.id ?? r.data?.property?.id ?? null;
            if (propertyId) console.log(`           ${DIM}↳ Created property: ${propertyId}${Z}`);
        }
        return r;
    }, { status: 201 });

    await test('GET /properties — list properties', async () =>
        request('GET', `${PM}/properties`),
    { status: 200, check: r => Array.isArray(r.data) || Array.isArray(r.data?.properties) });

    subsection('1.2 Read, Update, Delete');
    if (propertyId) {
        await test('GET /properties/:id — fetch by ID', async () =>
            request('GET', `${PM}/properties/${propertyId}`),
        { status: 200 });

        await test('PATCH /properties/:id — update description', async () =>
            request('PATCH', `${PM}/properties/${propertyId}`, {
                description: 'Updated by PM test suite',
            }),
        { status: [200, 204] });
    } else {
        skip('GET /properties/:id', 'no propertyId from create');
        skip('PATCH /properties/:id', 'no propertyId from create');
    }

    // =========================================================================
    section('2. TENANTS  —  /api/v1/pm/tenants');
    // =========================================================================

    subsection('2.1 Create & List');
    await test('POST /tenants — create tenant', async () => {
        const r = await request('POST', `${PM}/tenants`, {
            fullName: 'Jane Doe Test',
            email: 'janedoe.pmtest@example.com',
            phone: '+233200000001',
        });
        if (r.status === 201) {
            tenantId = r.data?.id ?? r.data?.tenant?.id ?? null;
            if (tenantId) console.log(`           ${DIM}↳ Created tenant: ${tenantId}${Z}`);
        }
        return r;
    }, { status: 201 });

    await test('GET /tenants — list all', async () =>
        request('GET', `${PM}/tenants`),
    { status: 200 });

    await test('GET /tenants?status=active — filter by status', async () =>
        request('GET', `${PM}/tenants?status=active`),
    { status: 200 });

    await test('GET /tenants?search=Jane — search', async () =>
        request('GET', `${PM}/tenants?search=Jane`),
    { status: 200 });

    subsection('2.2 Read, Update');
    if (tenantId) {
        await test('GET /tenants/:id — fetch by ID', async () =>
            request('GET', `${PM}/tenants/${tenantId}`),
        { status: 200 });

        await test('PATCH /tenants/:id — update phone', async () =>
            request('PATCH', `${PM}/tenants/${tenantId}`, { phone: '+233200000099' }),
        { status: 200 });

        await test('POST /tenants/:id/screen — screen tenant', async () =>
            request('POST', `${PM}/tenants/${tenantId}/screen`),
        { status: [200, 404] });

        await test('POST /tenants/:id/verify — verify tenant', async () =>
            request('POST', `${PM}/tenants/${tenantId}/verify`),
        { status: [200, 404] });
    } else {
        ['GET', 'PATCH', 'POST screen', 'POST verify'].forEach(m =>
            skip(`${m} /tenants/:id`, 'no tenantId from create')
        );
    }

    subsection('2.3 Invalid / Edge Cases');
    await test('GET /tenants/:id — unknown UUID → 404', async () =>
        request('GET', `${PM}/tenants/00000000-0000-0000-0000-000000000099`),
    { status: 404 });

    // =========================================================================
    section('3. TENANCIES  —  /api/v1/pm/tenancies');
    // =========================================================================

    subsection('3.1 Create & List');
    if (propertyId && tenantId) {
        await test('POST /tenancies — create tenancy', async () => {
            const r = await request('POST', `${PM}/tenancies`, {
                propertyId,
                tenantId,
                leaseStartDate: '2026-05-01',
                leaseEndDate: '2027-04-30',
                monthlyRent: 3500,
                securityDeposit: 7000,
                currency: 'GHS',
            });
            if (r.status === 201) {
                tenancyId = r.data?.id ?? r.data?.tenancy?.id ?? null;
                if (tenancyId) console.log(`           ${DIM}↳ Created tenancy: ${tenancyId}${Z}`);
            }
            return r;
        }, { status: [201, 400] }); // 400 if property already tenanted
    } else {
        skip('POST /tenancies', 'no propertyId or tenantId');
    }

    await test('GET /tenancies — list all', async () =>
        request('GET', `${PM}/tenancies`),
    { status: 200 });

    await test('GET /tenancies?status=active — filter by status', async () =>
        request('GET', `${PM}/tenancies?status=active`),
    { status: 200 });

    await test('GET /tenancies-expiring — expiring within 90 days', async () =>
        request('GET', `${PM}/tenancies-expiring?days=90`),
    { status: 200 });

    subsection('3.2 Read, Update, Lifecycle');
    if (tenancyId) {
        await test('GET /tenancies/:id — fetch by ID', async () =>
            request('GET', `${PM}/tenancies/${tenancyId}`),
        { status: 200 });

        await test('PATCH /tenancies/:id — update rent', async () =>
            request('PATCH', `${PM}/tenancies/${tenancyId}`, { monthlyRent: 3600 }),
        { status: [200, 400] });

        await test('POST /tenancies/:id/activate — activate tenancy', async () =>
            request('POST', `${PM}/tenancies/${tenancyId}/activate`),
        { status: [200, 400, 404] });

        await test('GET /tenancies/:id/payment-summary — payment summary', async () =>
            request('GET', `${PM}/tenancies/${tenancyId}/payment-summary`),
        { status: [200, 404] });

        await test('GET /tenancies/:id/payments — payment history', async () =>
            request('GET', `${PM}/tenancies/${tenancyId}/payments`),
        { status: [200, 404] });

        await test('POST /tenancies/:id/invoice — generate invoice (missing body → 400)', async () =>
            request('POST', `${PM}/tenancies/${tenancyId}/invoice`, {}),
        { status: 400 });

        await test('POST /tenancies/:id/invoice — generate invoice (with dates)', async () =>
            request('POST', `${PM}/tenancies/${tenancyId}/invoice`, {
                periodStart: '2026-05-01',
                periodEnd: '2026-05-31',
            }),
        { status: [200, 404] });
    } else {
        ['GET', 'PATCH', 'activate', 'payment-summary', 'payments', 'invoice'].forEach(m =>
            skip(`${m} /tenancies/:id`, 'no tenancyId from create')
        );
    }

    // =========================================================================
    section('4. PAYMENTS  —  /api/v1/pm/payments');
    // =========================================================================

    subsection('4.1 Account & Bank Config');
    await test('GET /payments/account — payout account config', async () =>
        request('GET', `${PM}/payments/account`),
    { status: 200 });

    await test('GET /payments/banks — supported banks list', async () =>
        request('GET', `${PM}/payments/banks`),
    { status: [200, 500] }); // 500 if Paystack not configured

    await test('GET /payments/crypto-wallet — crypto wallet config', async () =>
        request('GET', `${PM}/payments/crypto-wallet`),
    { status: 200 });

    await test('GET /payments/settlement-coins — supported settlement coins', async () =>
        request('GET', `${PM}/payments/settlement-coins`),
    { status: [200, 500] }); // 500 if NowPayments not configured

    await test('GET /payments/crypto-revenue — crypto revenue summary', async () =>
        request('GET', `${PM}/payments/crypto-revenue`),
    { status: 200 });

    subsection('4.2 Resolve Account (validation)');
    await test('POST /payments/resolve-account — missing fields → 400', async () =>
        request('POST', `${PM}/payments/resolve-account`, {}),
    { status: 400 });

    subsection('4.3 Record Payment');
    if (tenancyId) {
        await test('POST /payments — record cash payment', async () => {
            const r = await request('POST', `${PM}/payments`, {
                tenancyId,
                amount: 3500,
                paymentMethod: 'cash',
                paymentDate: '2026-05-01',
                referenceNumber: 'PM-TEST-001',
                currency: 'GHS',
            });
            if (r.status === 201) {
                paymentId = r.data?.id ?? r.data?.payment?.id ?? null;
                if (paymentId) console.log(`           ${DIM}↳ Created payment: ${paymentId}${Z}`);
            }
            return r;
        }, { status: [201, 400] });
    } else {
        skip('POST /payments — record payment', 'no tenancyId');
    }

    subsection('4.4 Fetch Payment');
    if (paymentId) {
        await test('GET /payments/:id — fetch by ID', async () =>
            request('GET', `${PM}/payments/${paymentId}`),
        { status: [200, 404] });
    } else {
        skip('GET /payments/:id', 'no paymentId from record');
    }

    await test('GET /payments/:id — unknown ID → 404', async () =>
        request('GET', `${PM}/payments/00000000-0000-0000-0000-000000000099`),
    { status: 404 });

    subsection('4.5 Initialize Payment (validation)');
    await test('POST /payments/initialize — missing fields → 400', async () =>
        request('POST', `${PM}/payments/initialize`, {}),
    { status: 400 });

    // =========================================================================
    section('5. WORK ORDERS  —  /api/v1/pm/work-orders');
    // =========================================================================

    subsection('5.1 Create & List');
    if (propertyId) {
        await test('POST /work-orders — create work order', async () => {
            const r = await request('POST', `${PM}/work-orders`, {
                propertyId,
                title: 'Fix leaking roof — PM Test',
                description: 'Roof leak in master bedroom ceiling.',
                category: 'plumbing',
                priority: 'high',
                estimatedCost: 1200,
            });
            if (r.status === 201) {
                workOrderId = r.data?.id ?? r.data?.workOrder?.id ?? null;
                if (workOrderId) console.log(`           ${DIM}↳ Created work order: ${workOrderId}${Z}`);
            }
            return r;
        }, { status: 201 });
    } else {
        skip('POST /work-orders', 'no propertyId from create');
    }

    await test('GET /work-orders — list all', async () =>
        request('GET', `${PM}/work-orders`),
    { status: 200 });

    await test('GET /work-orders?status=open — filter by status', async () =>
        request('GET', `${PM}/work-orders?status=open`),
    { status: 200 });

    await test('GET /work-orders?priority=high — filter by priority', async () =>
        request('GET', `${PM}/work-orders?priority=high`),
    { status: 200 });

    await test('GET /work-orders-stats — work order statistics', async () =>
        request('GET', `${PM}/work-orders-stats`),
    { status: 200 });

    subsection('5.2 Read, Update, Lifecycle');
    if (workOrderId) {
        await test('GET /work-orders/:id — fetch by ID', async () =>
            request('GET', `${PM}/work-orders/${workOrderId}`),
        { status: 200 });

        await test('PATCH /work-orders/:id — update description', async () =>
            request('PATCH', `${PM}/work-orders/${workOrderId}`, {
                description: 'Roof leak confirmed — awaiting vendor.',
            }),
        { status: [200, 400] });

        await test('POST /work-orders/:id/assign — missing vendorId → 400', async () =>
            request('POST', `${PM}/work-orders/${workOrderId}/assign`, {}),
        { status: 400 });

        await test('POST /work-orders/:id/complete — missing fields → 400', async () =>
            request('POST', `${PM}/work-orders/${workOrderId}/complete`, {}),
        { status: 400 });

        await test('POST /work-orders/:id/approve-budget — approve budget', async () =>
            request('POST', `${PM}/work-orders/${workOrderId}/approve-budget`),
        { status: [200, 400, 404] });
    } else {
        ['GET', 'PATCH', 'assign', 'complete', 'approve-budget'].forEach(m =>
            skip(`${m} /work-orders/:id`, 'no workOrderId from create')
        );
    }

    // =========================================================================
    section('6. VENDORS  —  /api/v1/pm/vendors');
    // =========================================================================

    subsection('6.1 Create & List');
    await test('POST /vendors — create vendor', async () => {
        const r = await request('POST', `${PM}/vendors`, {
            name: 'PM Test Plumbing Co',
            email: 'vendor.pmtest@example.com',
            phone: '+233200000002',
            category: 'plumbing',
        });
        if (r.status === 201) {
            vendorId = r.data?.id ?? r.data?.vendor?.id ?? null;
            if (vendorId) console.log(`           ${DIM}↳ Created vendor: ${vendorId}${Z}`);
        }
        return r;
    }, { status: 201 });

    await test('GET /vendors — list all', async () =>
        request('GET', `${PM}/vendors`),
    { status: 200 });

    await test('GET /vendors?category=plumbing — filter by category', async () =>
        request('GET', `${PM}/vendors?category=plumbing`),
    { status: 200 });

    await test('GET /vendors?search=Plumbing — search', async () =>
        request('GET', `${PM}/vendors?search=Plumbing`),
    { status: 200 });

    subsection('6.2 Read, Update, Delete');
    if (vendorId) {
        await test('GET /vendors/:id — fetch by ID', async () =>
            request('GET', `${PM}/vendors/${vendorId}`),
        { status: 200 });

        await test('PATCH /vendors/:id — update phone', async () =>
            request('PATCH', `${PM}/vendors/${vendorId}`, { phone: '+233200000099' }),
        { status: [200, 400] });

        // Assign work order to vendor now that both IDs exist
        if (workOrderId) {
            await test('POST /work-orders/:id/assign — assign vendor', async () =>
                request('POST', `${PM}/work-orders/${workOrderId}/assign`, { vendorId }),
            { status: [200, 400] });
        }
    } else {
        skip('GET /vendors/:id', 'no vendorId from create');
        skip('PATCH /vendors/:id', 'no vendorId from create');
    }

    // =========================================================================
    section('7. DOCUMENTS  —  /api/v1/pm/documents');
    // =========================================================================

    subsection('7.1 Create & List');
    await test('POST /documents — record document', async () => {
        const r = await request('POST', `${PM}/documents`, {
            propertyId: propertyId || '00000000-0000-0000-0000-000000000001',
            documentType: 'indenture',
            title: 'PM Test Indenture',
            fileUrl: 'https://example.com/test-indenture.pdf',
            fileName: 'test-indenture.pdf',
        });
        if (r.status === 201) {
            documentId = r.data?.id ?? r.data?.document?.id ?? null;
            if (documentId) console.log(`           ${DIM}↳ Created document: ${documentId}${Z}`);
        }
        return r;
    }, { status: 201 });

    await test('GET /documents — list documents', async () =>
        request('GET', `${PM}/documents`),
    { status: 200 });

    await test('GET /documents/vault — unified document vault', async () =>
        request('GET', `${PM}/documents/vault`),
    { status: 200 });

    await test('GET /documents/vault?source=lease — filter by source', async () =>
        request('GET', `${PM}/documents/vault?source=lease`),
    { status: 200 });

    await test('GET /documents?type=indenture — filter by type', async () =>
        request('GET', `${PM}/documents?type=indenture`),
    { status: 200 });

    subsection('7.2 Verify, Delete');
    if (documentId) {
        await test('POST /documents/:id/verify — verify document', async () =>
            request('POST', `${PM}/documents/${documentId}/verify`),
        { status: [200, 404] });
    } else {
        skip('POST /documents/:id/verify', 'no documentId');
    }

    // =========================================================================
    section('8. FINANCIALS  —  /api/v1/pm/financials');
    // =========================================================================

    subsection('8.1 Basic CRUD');
    await test('POST /financials — record income', async () => {
        const r = await request('POST', `${PM}/financials`, {
            propertyId: propertyId || '00000000-0000-0000-0000-000000000001',
            recordType: 'income',
            category: 'rent',
            amount: 3500,
            currency: 'GHS',
            description: 'May 2026 rent — PM Test',
            transactionDate: '2026-05-01',
        });
        if (r.status === 201) {
            financialId = r.data?.id ?? r.data?.record?.id ?? null;
            if (financialId) console.log(`           ${DIM}↳ Created financial record: ${financialId}${Z}`);
        }
        return r;
    }, { status: 201 });

    await test('GET /financials — list records', async () =>
        request('GET', `${PM}/financials`),
    { status: 200 });

    await test('GET /financials?recordType=income — filter by type', async () =>
        request('GET', `${PM}/financials?recordType=income`),
    { status: 200 });

    await test('GET /financials/cash-flow — missing dates → 400', async () =>
        request('GET', `${PM}/financials/cash-flow`),
    { status: 400 });

    await test('GET /financials/cash-flow — with date range', async () =>
        request('GET', `${PM}/financials/cash-flow?startDate=2026-01-01&endDate=2026-12-31`),
    { status: 200 });

    await test('GET /financials/portfolio-summary — portfolio financials', async () =>
        request('GET', `${PM}/financials/portfolio-summary`),
    { status: 200 });

    subsection('8.2 Advanced Metrics (per-property)');
    const propForMetrics = propertyId || '00000000-0000-0000-0000-000000000001';

    await test('GET /financials/roi/:propertyId — ROI analysis', async () =>
        request('GET', `${PM}/financials/roi/${propForMetrics}`),
    { status: [200, 400, 404] });

    await test('GET /financials/noi/:propertyId — NOI calculation', async () =>
        request('GET', `${PM}/financials/noi/${propForMetrics}`),
    { status: [200, 400, 404] });

    await test('GET /financials/cap-rate/:propertyId — Cap Rate', async () =>
        request('GET', `${PM}/financials/cap-rate/${propForMetrics}`),
    { status: [200, 400, 404] });

    await test('GET /financials/irr/:propertyId — IRR', async () =>
        request('GET', `${PM}/financials/irr/${propForMetrics}`),
    { status: [200, 400, 404] });

    await test('POST /financials/cash-on-cash/:propertyId — missing downPayment → 400', async () =>
        request('POST', `${PM}/financials/cash-on-cash/${propForMetrics}`, {}),
    { status: 400 });

    await test('POST /financials/cash-on-cash/:propertyId — with investment details', async () =>
        request('POST', `${PM}/financials/cash-on-cash/${propForMetrics}`, {
            downPayment: 100000,
            closingCosts: 5000,
            renovationCosts: 0,
            annualDebtService: 12000,
        }),
    { status: [200, 400, 404] });

    await test('GET /financials/dscr/:propertyId — DSCR (no debt → N/A)', async () =>
        request('GET', `${PM}/financials/dscr/${propForMetrics}?annualDebtService=0`),
    { status: [200, 404] });

    await test('GET /financials/dscr/:propertyId — DSCR with debt service', async () =>
        request('GET', `${PM}/financials/dscr/${propForMetrics}?annualDebtService=12000`),
    { status: [200, 400, 404] });

    await test('GET /financials/summary/:propertyId — comprehensive summary', async () =>
        request('GET', `${PM}/financials/summary/${propForMetrics}`),
    { status: [200, 400, 404] });

    // =========================================================================
    section('9. PORTFOLIO  —  /api/v1/pm/portfolio');
    // =========================================================================

    await test('GET /portfolio/overview — portfolio overview metrics', async () =>
        request('GET', `${PM}/portfolio/overview`),
    { status: 200 });

    await test('GET /portfolio/value — portfolio value', async () =>
        request('GET', `${PM}/portfolio/value`),
    { status: 200 });

    await test('GET /portfolio/composition — portfolio composition', async () =>
        request('GET', `${PM}/portfolio/composition`),
    { status: 200 });

    await test('GET /portfolio/leases — portfolio lease summary', async () =>
        request('GET', `${PM}/portfolio/leases`),
    { status: 200 });

    // =========================================================================
    section('10. REPORTS  —  /api/v1/pm/reports');
    // =========================================================================

    await test('GET /reports/defaulting-tenants — defaulters (>30 days)', async () =>
        request('GET', `${PM}/reports/defaulting-tenants`),
    { status: 200 });

    await test('GET /reports/collection — missing dates → 400', async () =>
        request('GET', `${PM}/reports/collection`),
    { status: 400 });

    await test('GET /reports/collection — with date range', async () =>
        request('GET', `${PM}/reports/collection?startDate=2026-01-01&endDate=2026-12-31`),
    { status: 200 });

    await test('GET /reports/aged-receivables — aged receivables', async () =>
        request('GET', `${PM}/reports/aged-receivables`),
    { status: 200 });

    await test('GET /reports/vacancy — vacancy report', async () =>
        request('GET', `${PM}/reports/vacancy`),
    { status: 200 });

    await test('GET /reports/property-performance — property performance', async () =>
        request('GET', `${PM}/reports/property-performance`),
    { status: 200 });

    await test('GET /reports/tenant-turnover — tenant turnover', async () =>
        request('GET', `${PM}/reports/tenant-turnover`),
    { status: 200 });

    await test('GET /reports/maintenance-analytics — maintenance analytics', async () =>
        request('GET', `${PM}/reports/maintenance-analytics`),
    { status: 200 });

    // =========================================================================
    section('11. AUDIT TRAIL  —  /api/v1/pm/audit');
    // =========================================================================

    await test('GET /audit — list audit logs', async () =>
        request('GET', `${PM}/audit`),
    { status: 200 });

    await test('GET /audit?resource=property — filter by resource', async () =>
        request('GET', `${PM}/audit?resource=property`),
    { status: 200 });

    await test('GET /audit/summary — activity summary (7 days)', async () =>
        request('GET', `${PM}/audit/summary`),
    { status: 200 });

    await test('GET /audit/summary?days=30 — activity summary (30 days)', async () =>
        request('GET', `${PM}/audit/summary?days=30`),
    { status: 200 });

    if (propertyId) {
        await test('GET /audit/resource/property/:id — resource history', async () =>
            request('GET', `${PM}/audit/resource/property/${propertyId}`),
        { status: [200, 400, 404] });
    } else {
        skip('GET /audit/resource/property/:id', 'no propertyId');
    }

    // =========================================================================
    section('12. NOTIFICATIONS  —  /api/v1/pm/notifications');
    // =========================================================================

    await test('POST /notifications/rent-reminders — schedule reminders', async () =>
        request('POST', `${PM}/notifications/rent-reminders`, { daysBeforeDue: 3 }),
    { status: [200, 400, 500] });

    await test('POST /notifications/lease-warnings — send lease warnings', async () =>
        request('POST', `${PM}/notifications/lease-warnings`, { daysUntilExpiry: 30 }),
    { status: [200, 400, 500] });

    // =========================================================================
    section('13. BULK OPERATIONS  —  /api/v1/pm/bulk');
    // =========================================================================

    subsection('13.1 Import / Export');
    await test('POST /bulk/import — import tenants (validate only)', async () =>
        request('POST', `${PM}/bulk/import`, {
            type: 'tenants',
            data: [{ fullName: 'Bulk Tenant A', phone: '+233200000010' }],
            validateOnly: true,
        }),
    { status: [200, 400] });

    await test('GET /bulk/export/tenants — export tenants (JSON)', async () =>
        request('GET', `${PM}/bulk/export/tenants`),
    { status: [200, 400] });

    await test('GET /bulk/export/properties — export properties (JSON)', async () =>
        request('GET', `${PM}/bulk/export/properties`),
    { status: [200, 400] });

    await test('GET /bulk/export/payments — export payments (JSON)', async () =>
        request('GET', `${PM}/bulk/export/payments`),
    { status: [200, 400] });

    subsection('13.2 Bulk Operations (validation)');
    await test('POST /bulk/rent-increase — missing effectiveDate → 400', async () =>
        request('POST', `${PM}/bulk/rent-increase`, {
            increaseType: 'percentage',
            increaseValue: 5,
        }),
    { status: 400 });

    await test('POST /bulk/status-update — missing fields → 400', async () =>
        request('POST', `${PM}/bulk/status-update`, {}),
    { status: 400 });

    await test('POST /bulk/work-orders — no validation (accepts empty body)', async () =>
        request('POST', `${PM}/bulk/work-orders`, {}),
    { status: [200, 400] });

    // =========================================================================
    section('14. APPLICATIONS  —  /api/v1/pm/applications');
    // =========================================================================

    subsection('14.1 Create & List');
    await test('GET /applications — list applications', async () =>
        request('GET', `${PM}/applications`),
    { status: 200 });

    await test('GET /applications/stats — application statistics', async () =>
        request('GET', `${PM}/applications/stats`),
    { status: 200 });

    if (propertyId) {
        await test('POST /applications — create application', async () => {
            const r = await request('POST', `${PM}/applications`, {
                propertyId,
                applicationType: 'rental',
                applicantFullName: 'PM Test Applicant',
                applicantEmail: 'applicant.pmtest@example.com',
                applicantPhone: '+233200000003',
                monthlyIncome: 10000,
            });
            if ([200, 201].includes(r.status)) {
                applicationId = r.data?.id ?? r.data?.application?.id ?? null;
                if (applicationId) console.log(`           ${DIM}↳ Created application: ${applicationId}${Z}`);
            }
            return r;
        }, { status: [200, 201, 400] });
    } else {
        skip('POST /applications', 'no propertyId');
    }

    subsection('14.2 Lifecycle');
    if (applicationId) {
        await test('GET /applications/:id — fetch by ID', async () =>
            request('GET', `${PM}/applications/${applicationId}`),
        { status: 200 });

        await test('GET /applications/:id/history — status history', async () =>
            request('GET', `${PM}/applications/${applicationId}/history`),
        { status: [200, 404] });

        await test('POST /applications/:id/submit — submit application', async () =>
            request('POST', `${PM}/applications/${applicationId}/submit`),
        { status: [200, 400] });

        await test('POST /applications/:id/start-review — start review', async () =>
            request('POST', `${PM}/applications/${applicationId}/start-review`),
        { status: [200, 400, 404] });

        await test('POST /applications/:id/documents — add document', async () =>
            request('POST', `${PM}/applications/${applicationId}/documents`, {
                type: 'id_document',
                url: 'https://example.com/applicant-id.pdf',
                filename: 'applicant-id.pdf',
            }),
        { status: [200, 400, 404] });

        await test('GET /applications/:id/lease — get lease (may have no envelope)', async () =>
            request('GET', `${PM}/applications/${applicationId}/lease`),
        { status: [200, 404] });

        await test('PATCH /applications/:id — update application (in draft only)', async () =>
            request('PATCH', `${PM}/applications/${applicationId}`, {
                monthlyIncome: 11000,
            }),
        { status: [200, 400] });
    } else {
        ['GET', 'history', 'submit', 'start-review', 'documents', 'lease', 'PATCH'].forEach(m =>
            skip(`${m} /applications/:id`, 'no applicationId from create')
        );
    }

    subsection('14.3 Application Links');
    if (propertyId) {
        await test('POST /application-links — create application link', async () => {
            const r = await request('POST', `${PM}/application-links`, {
                propertyId,
                applicationType: 'rental',
                maxUses: 10,
                expiresInDays: 30,
            });
            if ([200, 201].includes(r.status)) {
                applicationLinkId = r.data?.id ?? null;
                applicationLinkToken = r.data?.token ?? r.data?.linkToken ?? null;
                if (applicationLinkToken) console.log(`           ${DIM}↳ Application link token: ${applicationLinkToken.slice(0, 8)}...${Z}`);
            }
            return r;
        }, { status: [200, 201] });
    } else {
        skip('POST /application-links', 'no propertyId');
    }

    await test('GET /application-links — list links', async () =>
        request('GET', `${PM}/application-links`),
    { status: 200 });

    if (applicationLinkToken) {
        await test('GET /application-links/:token/validate — validate link token', async () =>
            request('GET', `${PM}/application-links/${applicationLinkToken}/validate`),
        { status: [200, 404] });
    } else {
        skip('GET /application-links/:token/validate', 'no link token');
    }

    await test('GET /application-links/:token/validate — invalid token → not found', async () =>
        request('GET', `${PM}/application-links/invalid-token-000/validate`),
    { status: [200, 404] }); // returns {valid:false} or 404 depending on impl

    if (applicationLinkId) {
        await test('DELETE /application-links/:id — deactivate link', async () =>
            request('DELETE', `${PM}/application-links/${applicationLinkId}`),
        { status: [200, 204, 404] });
    } else {
        skip('DELETE /application-links/:id', 'no applicationLinkId');
    }

    // =========================================================================
    section('15. LEASE TEMPLATES  —  /api/v1/pm/lease-templates');
    // =========================================================================

    await test('GET /lease-templates — list templates', async () =>
        request('GET', `${PM}/lease-templates`),
    { status: 200 });

    // =========================================================================
    section('16. TENANT MESSAGES  —  /api/v1/pm/tenant-messages');
    // =========================================================================

    await test('GET /tenant-messages/conversations — list conversations', async () =>
        request('GET', `${PM}/tenant-messages/conversations`),
    { status: 200 });

    // =========================================================================
    section('17. LEASE DOCUMENTS  —  /api/v1/pm/leases & lease-documents');
    // =========================================================================

    if (tenancyId) {
        await test('GET /leases/:tenancyId/signing-status — signing status', async () =>
            request('GET', `${PM}/leases/${tenancyId}/signing-status`),
        { status: [200, 404] });

        await test('POST /tenancies/:id/regenerate-lease — regenerate lease doc', async () =>
            request('POST', `${PM}/tenancies/${tenancyId}/regenerate-lease`, {}),
        { status: [200, 201, 400, 404] });
    } else {
        skip('GET /leases/:tenancyId/signing-status', 'no tenancyId');
        skip('POST /tenancies/:id/regenerate-lease', 'no tenancyId');
    }

    await test('POST /lease-documents/generate — missing tenancyId → 400', async () =>
        request('POST', `${PM}/lease-documents/generate`, {}),
    { status: 400 });

    // =========================================================================
    section('18. CRYPTO WALLET  —  validation checks');
    // =========================================================================

    await test('POST /payments/crypto-wallet — invalid address → 400', async () =>
        request('POST', `${PM}/payments/crypto-wallet`, { walletAddress: 'not-a-valid-address' }),
    { status: 400 });

    // =========================================================================
    section('19. CLEANUP');
    // =========================================================================

    subsection('19.1 Application reject & delete');
    if (applicationId) {
        // Move to rejected state from wherever it is (may fail if already past draft)
        await test('POST /applications/:id/reject — reject application', async () =>
            request('POST', `${PM}/applications/${applicationId}/reject`, {
                reason: 'PM test cleanup — rejected',
            }),
        { status: [200, 400] });

        await test('DELETE /applications/:id — soft delete application', async () =>
            request('DELETE', `${PM}/applications/${applicationId}`),
        { status: [200, 204] });
    } else {
        skip('reject + delete application', 'no applicationId');
    }

    subsection('19.2 Tenancy terminate');
    if (tenancyId) {
        await test('POST /tenancies/:id/terminate — terminate tenancy', async () =>
            request('POST', `${PM}/tenancies/${tenancyId}/terminate`, {
                reason: 'PM test cleanup',
            }),
        { status: [200, 400] });
    } else {
        skip('POST /tenancies/:id/terminate', 'no tenancyId');
    }

    subsection('19.3 Delete vendor, document, tenant, property');
    if (vendorId) {
        await test('DELETE /vendors/:id — delete vendor', async () =>
            request('DELETE', `${PM}/vendors/${vendorId}`),
        { status: [200, 204] });
    } else {
        skip('DELETE /vendors/:id', 'no vendorId');
    }

    if (documentId) {
        await test('DELETE /documents/:id — delete document', async () =>
            request('DELETE', `${PM}/documents/${documentId}`),
        { status: [200, 204] });
    } else {
        skip('DELETE /documents/:id', 'no documentId');
    }

    if (tenantId) {
        await test('DELETE /tenants/:id — soft delete tenant', async () =>
            request('DELETE', `${PM}/tenants/${tenantId}`),
        { status: [200, 204, 400] });
    } else {
        skip('DELETE /tenants/:id', 'no tenantId');
    }

    if (propertyId) {
        await test('DELETE /properties/:id — soft delete property', async () =>
            request('DELETE', `${PM}/properties/${propertyId}`),
        { status: [200, 204] });
    } else {
        skip('DELETE /properties/:id', 'no propertyId');
    }

    // ─── Summary ─────────────────────────────────────────────────────────────
    const total = passed + failed + skipped;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n${C}${'═'.repeat(64)}${Z}`);
    console.log(`${C}  TEST SUMMARY${Z}`);
    console.log(`${C}${'═'.repeat(64)}${Z}`);
    console.log(`  Total   : ${total} tests  (${elapsed}s)`);
    console.log(`  ${G}Passed  : ${passed}${Z}`);
    console.log(`  ${failed > 0 ? R : G}Failed  : ${failed}${Z}`);
    console.log(`  ${skipped > 0 ? Y : W}Skipped : ${skipped}${Z}  (missing upstream IDs)`);

    if (failures.length > 0) {
        console.log(`\n${R}  Failures:${Z}`);
        failures.forEach(f => console.log(`    ${R}• ${f}${Z}`));
    }

    if (failed === 0) {
        console.log(`\n  ${G}All tests passed!${Z}\n`);
    } else {
        console.log(`\n  ${R}${failed} test(s) failed.${Z}\n`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(`\n${R}FATAL: ${err.message}${Z}`);
    process.exit(1);
});
