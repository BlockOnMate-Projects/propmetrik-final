/**
 * QuickBooks Online Integration Service.
 *
 * Pushes approved project costs to a connected QuickBooks company as vendor Bills (the QBO
 * analogue of a Xero ACCPAY invoice). Tokens + the company `realmId` are stored by the shared
 * integration connector (`integrationConnectorService`) in the `integrations` row for
 * (organization_id, integration_type='quickbooks'); this service reads a fresh access token via
 * `getValidOAuthToken` (which auto-refreshes) and the realmId from that row's config.
 *
 * Mirrors the Xero cost-sync contract (`xeroService`) so both accounting integrations behave the
 * same from the UI: connect → test → sync approved costs.
 */

import { pool } from '../../database';
import { integrationConnectorService } from './integrationConnectorService';

// Intuit uses distinct hosts for sandbox vs production companies.
const QB_ENV = (process.env.QUICKBOOKS_ENVIRONMENT || 'production').toLowerCase();
const QB_API_BASE =
  QB_ENV === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
const MINOR_VERSION = '70';

interface QBConnection { accessToken: string; realmId: string; integrationId: string }

async function getConnection(orgId: string): Promise<QBConnection> {
  const { accessToken, config, integrationId } = await integrationConnectorService.getValidOAuthToken(orgId, 'quickbooks');
  const realmId = config?.realmId;
  if (!realmId) throw new Error('QuickBooks company (realmId) not captured — reconnect QuickBooks');
  return { accessToken, realmId, integrationId };
}

// ─── REST helpers ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function qbGet(conn: QBConnection, path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${QB_API_BASE}/v3/company/${conn.realmId}${path}${sep}minorversion=${MINOR_VERSION}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`QuickBooks GET ${path} failed: ${res.status} — ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return res.json() as Promise<any>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function qbPost(conn: QBConnection, resource: string, body: any): Promise<any> {
  const res = await fetch(`${QB_API_BASE}/v3/company/${conn.realmId}/${resource}?minorversion=${MINOR_VERSION}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`QuickBooks POST ${resource} failed: ${res.status} — ${(await res.text().catch(() => '')).slice(0, 400)}`);
  return res.json() as Promise<any>;
}

/** Query helper — QBO uses a SQL-like query API. */
async function qbQuery(conn: QBConnection, query: string): Promise<any> {
  return qbGet(conn, `/query?query=${encodeURIComponent(query)}`);
}

// ─── Connection test ──────────────────────────────────────────────────────────
export async function getCompanyInfo(orgId: string): Promise<{ companyName: string; realmId: string }> {
  const conn = await getConnection(orgId);
  const data = await qbGet(conn, `/companyinfo/${conn.realmId}`);
  const info = data.CompanyInfo || {};
  return { companyName: info.CompanyName || 'Unknown', realmId: conn.realmId };
}

// ─── Vendor + account lookups ───────────────────────────────────────────────────
async function getOrCreateVendor(conn: QBConnection, vendorName: string): Promise<string> {
  const safe = vendorName.replace(/'/g, "\\'");
  try {
    const data = await qbQuery(conn, `select Id from Vendor where DisplayName = '${safe}'`);
    const found = data?.QueryResponse?.Vendor?.[0];
    if (found?.Id) return found.Id;
  } catch {
    // fall through to create
  }
  const created = await qbPost(conn, 'vendor', { DisplayName: vendorName });
  return created.Vendor.Id;
}

/** First active Expense account — used as the AccountRef on the bill line. */
async function getDefaultExpenseAccountId(conn: QBConnection): Promise<string> {
  const data = await qbQuery(conn, `select Id from Account where AccountType = 'Expense' and Active = true`);
  const acct = data?.QueryResponse?.Account?.[0];
  if (!acct?.Id) throw new Error('No Expense account found in QuickBooks — create one first');
  return acct.Id;
}

// ─── Cost sync ────────────────────────────────────────────────────────────────
export interface QBCostRecord {
  id: string;
  description: string;
  category: string;
  original_budget: number;
  actual_cost: number | null;
  vendor_name: string | null;
  invoice_number: string | null;
  quickbooks_vendor_id: string | null;
}

export async function syncCostToQuickBooks(orgId: string, cost: QBCostRecord): Promise<{ billId: string }> {
  const conn = await getConnection(orgId);
  const amount = cost.actual_cost ?? cost.original_budget;
  const vendorName = cost.vendor_name || 'Unknown Vendor';

  let vendorId = cost.quickbooks_vendor_id;
  if (!vendorId) {
    vendorId = await getOrCreateVendor(conn, vendorName);
    await pool.query(`UPDATE project_costs SET quickbooks_vendor_id = $1 WHERE id = $2`, [vendorId, cost.id]);
  }
  const accountId = await getDefaultExpenseAccountId(conn);

  const billPayload = {
    VendorRef: { value: vendorId },
    // CurrencyRef is intentionally omitted → QBO uses the company home currency (avoids a
    // multi-currency rejection when the company isn't multi-currency enabled).
    Line: [
      {
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: Number(amount),
        Description: `${cost.category} — ${cost.description}`.slice(0, 4000),
        AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
      },
    ],
    DocNumber: (cost.invoice_number || cost.id).slice(0, 21),
    PrivateNote: `PropMetrik cost ${cost.id}`,
  };

  const data = await qbPost(conn, 'bill', billPayload);
  const billId: string = data.Bill.Id;

  await pool.query(`UPDATE integrations SET last_sync_at = NOW() WHERE id = $1`, [conn.integrationId]);
  await pool.query(
    `INSERT INTO integration_logs (integration_id, organization_id, direction, event_type, status, request_payload, response_payload)
     VALUES ($1, $2, 'outbound', 'cost_sync', 'success', $3, $4)`,
    [conn.integrationId, orgId, JSON.stringify({ cost_id: cost.id }), JSON.stringify({ billId })]
  );

  return { billId };
}

export async function syncAllApprovedCosts(orgId: string): Promise<{ synced: number; errors: string[] }> {
  // Real project_costs schema: amount = actual_costs (fallback revised/original budget); vendor
  // name comes from the linked vendors row (contractor_id).
  const costs = await pool.query(
    `SELECT pc.id, pc.description, pc.category, pc.original_budget,
            COALESCE(pc.actual_costs, pc.revised_budget, pc.original_budget) as actual_cost,
            COALESCE(v.business_name, 'Unknown Vendor') as vendor_name,
            pc.invoice_number, pc.quickbooks_vendor_id
     FROM project_costs pc
     LEFT JOIN vendors v ON v.id = pc.contractor_id
     WHERE pc.organization_id = $1 AND pc.status = 'approved' AND pc.quickbooks_synced_at IS NULL
     ORDER BY pc.created_at ASC
     LIMIT 50`,
    [orgId]
  );

  let synced = 0;
  const errors: string[] = [];
  for (const cost of costs.rows) {
    try {
      await syncCostToQuickBooks(orgId, cost);
      await pool.query(`UPDATE project_costs SET quickbooks_synced_at = NOW() WHERE id = $1`, [cost.id]);
      synced++;
    } catch (err: any) {
      errors.push(`Cost ${cost.id}: ${err.message}`);
    }
  }
  return { synced, errors };
}
