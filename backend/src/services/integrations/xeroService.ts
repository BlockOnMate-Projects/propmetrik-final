/**
 * Xero Integration Service
 * Handles OAuth2 token management and Xero API calls for cost sync.
 */

import { pool } from '../../database';

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

export interface XeroTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
  tenant_id?: string;
  tenant_name?: string;
  obtained_at?: number; // unix ms
}

export interface XeroIntegration {
  id: string;
  organization_id: string;
  status: string;
  config: XeroTokens;
  last_sync_at: string | null;
}

// ─── Token Storage ────────────────────────────────────────────────────────────

export async function getXeroIntegration(orgId: string): Promise<XeroIntegration | null> {
  const result = await pool.query(
    `SELECT id, organization_id, status, config, last_sync_at
     FROM integrations
     WHERE organization_id = $1 AND integration_type = 'xero' AND status != 'inactive'
     ORDER BY created_at DESC LIMIT 1`,
    [orgId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { ...row, config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config };
}

export async function upsertXeroIntegration(
  orgId: string,
  userId: string,
  tokens: XeroTokens,
): Promise<string> {
  // Check if one already exists
  const existing = await pool.query(
    `SELECT id FROM integrations WHERE organization_id = $1 AND integration_type = 'xero' ORDER BY created_at DESC LIMIT 1`,
    [orgId],
  );

  if (existing.rows.length > 0) {
    const id = existing.rows[0].id;
    await pool.query(
      `UPDATE integrations SET config = $1, status = 'active', updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(tokens), id],
    );
    return id;
  }

  const result = await pool.query(
    `INSERT INTO integrations (organization_id, integration_type, name, description, status, auth_type, config, created_by)
     VALUES ($1, 'xero', 'Xero', 'Cloud accounting platform', 'active', 'oauth2', $2, $3)
     RETURNING id`,
    [orgId, JSON.stringify(tokens), userId],
  );
  return result.rows[0].id;
}

export async function deactivateXeroIntegration(orgId: string): Promise<void> {
  await pool.query(
    `UPDATE integrations SET status = 'inactive', config = '{}', updated_at = NOW()
     WHERE organization_id = $1 AND integration_type = 'xero'`,
    [orgId],
  );
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

export async function refreshXeroToken(
  orgId: string,
  integration: XeroIntegration,
): Promise<XeroTokens> {
  const clientId = process.env.XERO_CLIENT_ID!;
  const clientSecret = process.env.XERO_CLIENT_SECRET!;

  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.config.refresh_token,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Xero token refresh failed: ${err}`);
  }

  const newTokens = (await response.json()) as XeroTokens;
  newTokens.obtained_at = Date.now();
  newTokens.tenant_id = integration.config.tenant_id;
  newTokens.tenant_name = integration.config.tenant_name;

  await pool.query(
    `UPDATE integrations SET config = $1, updated_at = NOW() WHERE organization_id = $2 AND integration_type = 'xero'`,
    [JSON.stringify(newTokens), orgId],
  );

  return newTokens;
}

/**
 * Get a valid access token, refreshing if close to expiry (< 5 min).
 */
export async function getValidToken(orgId: string): Promise<{ token: string; tenantId: string }> {
  const integration = await getXeroIntegration(orgId);
  if (!integration) throw new Error('Xero not connected');

  let tokens = integration.config;
  const expiresAt = (tokens.obtained_at || 0) + tokens.expires_in * 1000;
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000;

  if (needsRefresh) {
    tokens = await refreshXeroToken(orgId, integration);
  }

  if (!tokens.tenant_id) throw new Error('Xero tenant not selected');
  return { token: tokens.access_token, tenantId: tokens.tenant_id };
}

// ─── Xero API Helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function xeroGet(path: string, token: string, tenantId: string): Promise<any> {
  const res = await fetch(`${XERO_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Xero GET ${path} failed: ${res.status}`);
  return res.json() as Promise<any>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function xeroPost(path: string, token: string, tenantId: string, body: any): Promise<any> {
  const res = await fetch(`${XERO_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xero POST ${path} failed: ${res.status} — ${err}`);
  }
  return res.json() as Promise<any>;
}

// ─── Contact Management ───────────────────────────────────────────────────────

export async function getOrCreateXeroContact(
  vendorName: string,
  token: string,
  tenantId: string,
): Promise<string> {
  // Search by name
  const encoded = encodeURIComponent(vendorName);
  try {
    const data = await xeroGet(`/Contacts?where=Name%3D%22${encoded}%22`, token, tenantId);
    if (data.Contacts && data.Contacts.length > 0) {
      return data.Contacts[0].ContactID;
    }
  } catch {
    // Ignore search errors, fall through to create
  }

  // Create new contact
  const data = await xeroPost('/Contacts', token, tenantId, {
    Contacts: [{ Name: vendorName }],
  });
  return data.Contacts[0].ContactID;
}

// ─── Connection Test ────────────────────────────────────────────────────────────

/** Live connection test — refreshes the token if needed and reads the Xero organisation name. */
export async function testXeroConnection(orgId: string): Promise<{ organisationName: string }> {
  const { token, tenantId } = await getValidToken(orgId);
  const data = await xeroGet('/Organisation', token, tenantId);
  const org = data?.Organisations?.[0];
  return { organisationName: org?.Name || 'Connected' };
}

// ─── Cost Sync ────────────────────────────────────────────────────────────────

export interface CostRecord {
  id: string;
  description: string;
  category: string;
  original_budget: number;
  actual_cost: number | null;
  vendor_name: string | null;
  invoice_number: string | null;
  currency: string;
  xero_contact_id: string | null;
}

export async function syncCostToXero(
  orgId: string,
  cost: CostRecord,
): Promise<{ xeroInvoiceId: string }> {
  const { token, tenantId } = await getValidToken(orgId);
  const amount = cost.actual_cost ?? cost.original_budget;
  const contactName = cost.vendor_name || 'Unknown Vendor';

  // Get or create Xero contact
  let contactId = cost.xero_contact_id;
  if (!contactId) {
    contactId = await getOrCreateXeroContact(contactName, token, tenantId);
    // Persist contact ID for idempotent future syncs
    await pool.query(
      `UPDATE project_costs SET xero_contact_id = $1 WHERE id = $2`,
      [contactId, cost.id],
    );
  }

  const lineItemDesc = `${cost.category} — ${cost.description}`;
  const invoicePayload = {
    Invoices: [
      {
        Type: 'ACCPAY',
        Contact: { ContactID: contactId },
        LineItems: [
          {
            Description: lineItemDesc,
            Quantity: 1,
            UnitAmount: amount,
            AccountCode: '200', // Default COGS account; can be made configurable
          },
        ],
        Status: 'DRAFT',
        Reference: cost.invoice_number || cost.id,
        CurrencyCode: cost.currency || 'GHS',
      },
    ],
  };

  const data = await xeroPost('/Invoices', token, tenantId, invoicePayload);
  const xeroInvoiceId: string = data.Invoices[0].InvoiceID;

  // Log the sync
  const integration = await getXeroIntegration(orgId);
  if (integration) {
    await pool.query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE id = $1`,
      [integration.id],
    );
    await pool.query(
      `INSERT INTO integration_logs (integration_id, event_type, status, request_payload, response_payload)
       VALUES ($1, 'cost_sync', 'success', $2, $3)`,
      [integration.id, JSON.stringify({ cost_id: cost.id }), JSON.stringify({ xeroInvoiceId })],
    );
  }

  return { xeroInvoiceId };
}

// ─── Bulk Sync ─────────────────────────────────────────────────────────────────

export async function syncAllApprovedCosts(orgId: string): Promise<{ synced: number; errors: string[] }> {
  // Real project_costs schema: amount = actual_costs (fallback revised/original budget); vendor
  // name comes from the linked vendors row (contractor_id); there is no currency column → GHS.
  const costs = await pool.query(
    `SELECT pc.id, pc.description, pc.category, pc.original_budget,
            COALESCE(pc.actual_costs, pc.revised_budget, pc.original_budget) as actual_cost,
            COALESCE(v.business_name, 'Unknown Vendor') as vendor_name,
            pc.invoice_number, 'GHS' as currency, pc.xero_contact_id
     FROM project_costs pc
     LEFT JOIN vendors v ON v.id = pc.contractor_id
     WHERE pc.organization_id = $1 AND pc.status = 'approved' AND pc.xero_synced_at IS NULL
     ORDER BY pc.created_at ASC
     LIMIT 50`,
    [orgId],
  );

  let synced = 0;
  const errors: string[] = [];

  for (const cost of costs.rows) {
    try {
      await syncCostToXero(orgId, cost);
      await pool.query(
        `UPDATE project_costs SET xero_synced_at = NOW() WHERE id = $1`,
        [cost.id],
      );
      synced++;
    } catch (err: any) {
      errors.push(`Cost ${cost.id}: ${err.message}`);
    }
  }

  return { synced, errors };
}
