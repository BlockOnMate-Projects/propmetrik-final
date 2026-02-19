import { pool } from '../../database';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════
//  Org Settings Service
// ═══════════════════════════════════════════════════════════════════

export interface OrgSettings {
  id: string;
  name: string;
  logo_url?: string;
  banner_url?: string;
  description?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  report_header_html?: string;
  report_footer_html?: string;
  email_signature_html?: string;
  terms_and_conditions?: string;
  default_currency: string;
  tax_id?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country: string;
  phone?: string;
  website?: string;
  professional_body?: string;
  license_number?: string;
  license_expiry?: string;
  settings?: Record<string, any>;
}

export async function getOrgSettings(orgId: string): Promise<OrgSettings | null> {
  const { rows } = await pool.query(
    `SELECT id, name, logo_url, banner_url, description,
            primary_color, secondary_color, accent_color, font_family,
            report_header_html, report_footer_html, email_signature_html,
            terms_and_conditions, default_currency, tax_id,
            address_line1, address_line2, city, region, postal_code, country,
            phone, website, professional_body, license_number, license_expiry,
            settings
     FROM organizations WHERE id = $1`,
    [orgId]
  );
  return rows[0] || null;
}

export async function updateOrgSettings(
  orgId: string,
  updates: Partial<OrgSettings>
): Promise<OrgSettings | null> {
  // Whitelist of allowed columns
  const allowed = [
    'name', 'description', 'primary_color', 'secondary_color', 'accent_color',
    'font_family', 'report_header_html', 'report_footer_html', 'email_signature_html',
    'terms_and_conditions', 'default_currency', 'tax_id',
    'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country',
    'phone', 'website', 'professional_body', 'license_number', 'license_expiry',
    'logo_url', 'banner_url', 'settings'
  ];

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(key === 'settings' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return getOrgSettings(orgId);

  setClauses.push(`updated_at = NOW()`);
  values.push(orgId);

  const { rows } = await pool.query(
    `UPDATE organizations SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function getOrgBranding(orgId: string) {
  const { rows } = await pool.query(
    `SELECT logo_url, banner_url, primary_color, secondary_color, accent_color,
            font_family, name, description
     FROM organizations WHERE id = $1`,
    [orgId]
  );
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════════
//  Approval Chain Service
// ═══════════════════════════════════════════════════════════════════

export interface ApprovalChain {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  entity_type: string;
  is_active: boolean;
  steps?: ApprovalStep[];
}

export interface ApprovalStep {
  id: string;
  chain_id: string;
  step_order: number;
  name: string;
  required_role: string;
  min_approvers: number;
  auto_escalate_hours?: number;
  escalate_to_role?: string;
  instructions?: string;
}

export async function listApprovalChains(orgId: string): Promise<ApprovalChain[]> {
  const { rows: chains } = await pool.query(
    `SELECT * FROM approval_chains WHERE org_id = $1 ORDER BY name`,
    [orgId]
  );

  for (const chain of chains) {
    const { rows: steps } = await pool.query(
      `SELECT * FROM approval_chain_steps WHERE chain_id = $1 ORDER BY step_order`,
      [chain.id]
    );
    chain.steps = steps;
  }
  return chains;
}

export async function getApprovalChain(chainId: string, orgId: string): Promise<ApprovalChain | null> {
  const { rows } = await pool.query(
    `SELECT * FROM approval_chains WHERE id = $1 AND org_id = $2`,
    [chainId, orgId]
  );
  if (!rows[0]) return null;

  const { rows: steps } = await pool.query(
    `SELECT * FROM approval_chain_steps WHERE chain_id = $1 ORDER BY step_order`,
    [chainId]
  );
  rows[0].steps = steps;
  return rows[0];
}

export async function createApprovalChain(
  orgId: string,
  data: { name: string; description?: string; entity_type?: string; steps: Omit<ApprovalStep, 'id' | 'chain_id'>[] },
  userId: string
): Promise<ApprovalChain> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [chain] } = await client.query(
      `INSERT INTO approval_chains (org_id, name, description, entity_type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orgId, data.name, data.description || null, data.entity_type || 'valuation_report', userId]
    );

    const steps: ApprovalStep[] = [];
    for (const step of data.steps) {
      const { rows: [s] } = await client.query(
        `INSERT INTO approval_chain_steps (chain_id, step_order, name, required_role, min_approvers, auto_escalate_hours, escalate_to_role, instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [chain.id, step.step_order, step.name, step.required_role, step.min_approvers || 1,
         step.auto_escalate_hours || null, step.escalate_to_role || null, step.instructions || null]
      );
      steps.push(s);
    }

    await client.query('COMMIT');
    chain.steps = steps;
    return chain;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateApprovalChain(
  chainId: string,
  orgId: string,
  data: { name?: string; description?: string; is_active?: boolean; steps?: Omit<ApprovalStep, 'id' | 'chain_id'>[] }
): Promise<ApprovalChain | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update chain metadata
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); values.push(data.name); }
    if (data.description !== undefined) { setClauses.push(`description = $${paramIndex++}`); values.push(data.description); }
    if (data.is_active !== undefined) { setClauses.push(`is_active = $${paramIndex++}`); values.push(data.is_active); }

    values.push(chainId, orgId);
    const { rows } = await client.query(
      `UPDATE approval_chains SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND org_id = $${paramIndex} RETURNING *`,
      values
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }

    // Replace steps if provided
    if (data.steps) {
      await client.query(`DELETE FROM approval_chain_steps WHERE chain_id = $1`, [chainId]);
      const steps: ApprovalStep[] = [];
      for (const step of data.steps) {
        const { rows: [s] } = await client.query(
          `INSERT INTO approval_chain_steps (chain_id, step_order, name, required_role, min_approvers, auto_escalate_hours, escalate_to_role, instructions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [chainId, step.step_order, step.name, step.required_role, step.min_approvers || 1,
           step.auto_escalate_hours || null, step.escalate_to_role || null, step.instructions || null]
        );
        steps.push(s);
      }
      rows[0].steps = steps;
    }

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteApprovalChain(chainId: string, orgId: string): Promise<boolean> {
  // Check for active requests first
  const { rows: active } = await pool.query(
    `SELECT COUNT(*) as cnt FROM approval_requests WHERE chain_id = $1 AND status IN ('pending', 'in_review')`,
    [chainId]
  );
  if (parseInt(active[0]?.cnt) > 0) {
    throw new Error('Cannot delete chain with active approval requests');
  }

  const { rowCount } = await pool.query(
    `DELETE FROM approval_chains WHERE id = $1 AND org_id = $2`,
    [chainId, orgId]
  );
  return (rowCount ?? 0) > 0;
}

// Approval request lifecycle
export async function submitForApproval(
  chainId: string,
  entityType: string,
  entityId: string,
  orgId: string,
  requestedBy: string
) {
  const { rows: [request] } = await pool.query(
    `INSERT INTO approval_requests (chain_id, entity_type, entity_id, org_id, requested_by, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [chainId, entityType, entityId, orgId, requestedBy]
  );
  return request;
}

export async function recordDecision(
  requestId: string,
  stepId: string,
  decision: 'approved' | 'rejected' | 'escalated' | 'deferred',
  decidedBy: string,
  comments?: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get request + step info
    const { rows: [request] } = await client.query(
      `SELECT ar.*, acs.step_order FROM approval_requests ar
       JOIN approval_chain_steps acs ON acs.id = $2 AND acs.chain_id = ar.chain_id
       WHERE ar.id = $1`,
      [requestId, stepId]
    );
    if (!request) throw new Error('Request or step not found');

    // Record the decision
    await client.query(
      `INSERT INTO approval_decisions (request_id, step_id, step_order, decision, decided_by, comments)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestId, stepId, request.step_order, decision, decidedBy, comments || null]
    );

    if (decision === 'rejected') {
      await client.query(
        `UPDATE approval_requests SET status = 'rejected', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [requestId]
      );
    } else if (decision === 'approved') {
      // Check if there's a next step
      const { rows: nextSteps } = await client.query(
        `SELECT * FROM approval_chain_steps WHERE chain_id = $1 AND step_order > $2 ORDER BY step_order LIMIT 1`,
        [request.chain_id, request.step_order]
      );

      if (nextSteps.length > 0) {
        await client.query(
          `UPDATE approval_requests SET current_step = $1, status = 'in_review', updated_at = NOW() WHERE id = $2`,
          [nextSteps[0].step_order, requestId]
        );
      } else {
        // Final step — mark completed
        await client.query(
          `UPDATE approval_requests SET status = 'approved', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [requestId]
        );
      }
    } else if (decision === 'escalated') {
      await client.query(
        `UPDATE approval_requests SET status = 'escalated', updated_at = NOW() WHERE id = $1`,
        [requestId]
      );
    }

    await client.query('COMMIT');

    return { requestId, decision, step_order: request.step_order };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getApprovalRequest(requestId: string) {
  const { rows: [request] } = await pool.query(
    `SELECT ar.*, ac.name as chain_name
     FROM approval_requests ar
     JOIN approval_chains ac ON ac.id = ar.chain_id
     WHERE ar.id = $1`,
    [requestId]
  );
  if (!request) return null;

  const { rows: decisions } = await pool.query(
    `SELECT ad.*, acs.name as step_name
     FROM approval_decisions ad
     JOIN approval_chain_steps acs ON acs.id = ad.step_id
     WHERE ad.request_id = $1 ORDER BY ad.step_order, ad.decided_at`,
    [requestId]
  );
  request.decisions = decisions;

  const { rows: steps } = await pool.query(
    `SELECT * FROM approval_chain_steps WHERE chain_id = $1 ORDER BY step_order`,
    [request.chain_id]
  );
  request.steps = steps;

  return request;
}

export async function listApprovalRequests(orgId: string, filters?: { status?: string; entity_type?: string }) {
  const conditions = ['ar.org_id = $1'];
  const params: any[] = [orgId];
  let idx = 2;

  if (filters?.status) { conditions.push(`ar.status = $${idx++}`); params.push(filters.status); }
  if (filters?.entity_type) { conditions.push(`ar.entity_type = $${idx++}`); params.push(filters.entity_type); }

  const { rows } = await pool.query(
    `SELECT ar.*, ac.name as chain_name
     FROM approval_requests ar
     JOIN approval_chains ac ON ac.id = ar.chain_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ar.requested_at DESC`,
    params
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════════════
//  API Key Service
// ═══════════════════════════════════════════════════════════════════

const API_KEY_PREFIX = 'pmk_';

function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const fullKey = `${API_KEY_PREFIX}${randomBytes}`;
  const prefix = fullKey.substring(0, 12);
  const hash = crypto.createHash('sha256').update(fullKey).digest('hex');
  return { fullKey, prefix, hash };
}

export async function createApiKey(
  orgId: string,
  name: string,
  createdBy: string,
  opts?: { scopes?: string[]; rate_limit_per_minute?: number; rate_limit_per_day?: number; allowed_ips?: string[]; expires_at?: string }
) {
  const { fullKey, prefix, hash } = generateApiKey();

  const { rows: [key] } = await pool.query(
    `INSERT INTO org_api_keys (org_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute, rate_limit_per_day, allowed_ips, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, org_id, name, key_prefix, scopes, rate_limit_per_minute, rate_limit_per_day, allowed_ips, is_active, expires_at, created_at`,
    [orgId, name, prefix, hash, opts?.scopes || ['read'], opts?.rate_limit_per_minute || 60,
     opts?.rate_limit_per_day || 10000, opts?.allowed_ips || null, opts?.expires_at || null, createdBy]
  );

  // Return full key only on creation (never stored in plaintext)
  return { ...key, key: fullKey };
}

export async function listApiKeys(orgId: string) {
  const { rows } = await pool.query(
    `SELECT id, name, key_prefix, scopes, rate_limit_per_minute, rate_limit_per_day,
            allowed_ips, is_active, last_used_at, last_used_ip, usage_count, expires_at,
            created_at, revoked_at
     FROM org_api_keys WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return rows;
}

export async function revokeApiKey(keyId: string, orgId: string, revokedBy: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE org_api_keys SET is_active = false, revoked_at = NOW(), revoked_by = $3
     WHERE id = $1 AND org_id = $2 AND is_active = true`,
    [keyId, orgId, revokedBy]
  );
  return (rowCount ?? 0) > 0;
}

export async function rotateApiKey(keyId: string, orgId: string, userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get existing key info
    const { rows: [existing] } = await client.query(
      `SELECT * FROM org_api_keys WHERE id = $1 AND org_id = $2 AND is_active = true`,
      [keyId, orgId]
    );
    if (!existing) throw new Error('API key not found or already revoked');

    // Revoke old key
    await client.query(
      `UPDATE org_api_keys SET is_active = false, revoked_at = NOW(), revoked_by = $2 WHERE id = $1`,
      [keyId, userId]
    );

    // Create new key with same config
    const { fullKey, prefix, hash } = generateApiKey();
    const { rows: [newKey] } = await client.query(
      `INSERT INTO org_api_keys (org_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute, rate_limit_per_day, allowed_ips, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, org_id, name, key_prefix, scopes, rate_limit_per_minute, rate_limit_per_day, allowed_ips, is_active, expires_at, created_at`,
      [orgId, existing.name, prefix, hash, existing.scopes, existing.rate_limit_per_minute,
       existing.rate_limit_per_day, existing.allowed_ips, existing.expires_at, userId]
    );

    await client.query('COMMIT');
    return { ...newKey, key: fullKey };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function validateApiKey(fullKey: string): Promise<{ valid: boolean; keyId?: string; orgId?: string; scopes?: string[] }> {
  const hash = crypto.createHash('sha256').update(fullKey).digest('hex');
  const prefix = fullKey.substring(0, 12);

  const { rows } = await pool.query(
    `SELECT id, org_id, scopes, expires_at, is_active, rate_limit_per_minute, rate_limit_per_day, allowed_ips
     FROM org_api_keys WHERE key_prefix = $1 AND key_hash = $2`,
    [prefix, hash]
  );

  if (!rows[0]) return { valid: false };

  const key = rows[0];
  if (!key.is_active) return { valid: false };
  if (key.expires_at && new Date(key.expires_at) < new Date()) return { valid: false };

  // Update usage stats
  await pool.query(
    `UPDATE org_api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1`,
    [key.id]
  );

  // Upsert daily usage
  await pool.query(
    `INSERT INTO api_key_usage_daily (key_id, date, request_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (key_id, date) DO UPDATE SET request_count = api_key_usage_daily.request_count + 1`,
    [key.id]
  );

  return { valid: true, keyId: key.id, orgId: key.org_id, scopes: key.scopes };
}

// ═══════════════════════════════════════════════════════════════════
//  Firm Analytics Service
// ═══════════════════════════════════════════════════════════════════

export async function getFirmAnalytics(orgId: string, period: string = '30d') {
  const interval = period === '7d' ? '7 days' : period === '90d' ? '90 days' : period === '1y' ? '365 days' : '30 days';

  // Revenue metrics
  const { rows: [revenue] } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN vi.status = 'paid' THEN vi.total_amount ELSE 0 END), 0) as total_revenue,
       COALESCE(SUM(CASE WHEN vi.status = 'sent' THEN vi.total_amount ELSE 0 END), 0) as outstanding,
       COALESCE(SUM(CASE WHEN vi.status = 'overdue' THEN vi.total_amount ELSE 0 END), 0) as overdue,
       COUNT(CASE WHEN vi.status = 'paid' THEN 1 END) as paid_count,
       COUNT(CASE WHEN vi.status = 'sent' THEN 1 END) as pending_count,
       COUNT(CASE WHEN vi.status = 'overdue' THEN 1 END) as overdue_count
     FROM valuation_invoices vi
     WHERE vi.organization_id = $1 AND vi.created_at >= NOW() - $2::interval`,
    [orgId, interval]
  );

  // Valuation throughput
  const { rows: [throughput] } = await pool.query(
    `SELECT
       COUNT(*) as total_valuations,
       COUNT(CASE WHEN v.status = 'completed' OR v.status = 'approved' THEN 1 END) as completed,
       COUNT(CASE WHEN v.status = 'in_progress' THEN 1 END) as in_progress,
       COUNT(CASE WHEN v.status = 'draft' THEN 1 END) as draft,
       ROUND(AVG(CASE WHEN v.approved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (v.approved_at - v.created_at))/86400 END)::numeric, 1) as avg_turnaround_days
     FROM valuations v
     WHERE v.valuer_organization_id = $1 AND v.created_at >= NOW() - $2::interval`,
    [orgId, interval]
  );

  // Valuer productivity
  const { rows: valuerStats } = await pool.query(
    `SELECT
       u.id, u.full_name, u.role,
       COUNT(v.id) as valuation_count,
       COUNT(CASE WHEN v.status IN ('completed','approved') THEN 1 END) as completed_count,
       ROUND(AVG(CASE WHEN v.approved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (v.approved_at - v.created_at))/86400 END)::numeric, 1) as avg_turnaround_days
     FROM users u
     LEFT JOIN valuations v ON v.valuer_id = u.id AND v.created_at >= NOW() - $2::interval
     WHERE u.organization_id = $1 AND u.role IN ('senior_valuer', 'valuer', 'probationer', 'inspector')
     GROUP BY u.id, u.full_name, u.role
     ORDER BY completed_count DESC`,
    [orgId, interval]
  );

  // Client metrics
  const { rows: [clientMetrics] } = await pool.query(
    `SELECT
       COUNT(DISTINCT vc.id) as total_clients,
       COUNT(DISTINCT CASE WHEN v.created_at >= NOW() - $2::interval THEN vc.id END) as active_clients,
       COUNT(DISTINCT CASE WHEN vc.created_at >= NOW() - $2::interval THEN vc.id END) as new_clients
     FROM valuation_clients vc
     LEFT JOIN valuations v ON v.client_id = vc.id
     WHERE vc.organization_id = $1`,
    [orgId, interval]
  );

  // Monthly trend (last 6 months)
  const { rows: monthlyTrend } = await pool.query(
    `SELECT
       DATE_TRUNC('month', v.created_at) as month,
       COUNT(*) as valuations,
       COUNT(CASE WHEN v.status IN ('completed','approved') THEN 1 END) as completed,
       COALESCE(SUM(vi.total_amount), 0) as revenue
     FROM valuations v
     LEFT JOIN valuation_invoices vi ON vi.valuation_id = v.id AND vi.status = 'paid'
     WHERE v.valuer_organization_id = $1 AND v.created_at >= NOW() - INTERVAL '6 months'
     GROUP BY DATE_TRUNC('month', v.created_at)
     ORDER BY month DESC`,
    [orgId]
  );

  // Valuation type distribution (based on valuation_type column)
  const { rows: valTypes } = await pool.query(
    `SELECT
       COALESCE(v.valuation_type::text, 'Unknown') as vtype, COUNT(*) as count
     FROM valuations v
     WHERE v.valuer_organization_id = $1 AND v.created_at >= NOW() - $2::interval
     GROUP BY v.valuation_type
     ORDER BY count DESC
     LIMIT 10`,
    [orgId, interval]
  );

  return {
    period,
    revenue: {
      total: parseFloat(revenue.total_revenue),
      outstanding: parseFloat(revenue.outstanding),
      overdue: parseFloat(revenue.overdue),
      paid_count: parseInt(revenue.paid_count),
      pending_count: parseInt(revenue.pending_count),
      overdue_count: parseInt(revenue.overdue_count),
    },
    throughput: {
      total: parseInt(throughput.total_valuations),
      completed: parseInt(throughput.completed),
      in_progress: parseInt(throughput.in_progress),
      draft: parseInt(throughput.draft),
      avg_turnaround_days: parseFloat(throughput.avg_turnaround_days) || 0,
    },
    valuers: valuerStats.map(v => ({
      id: v.id,
      name: v.full_name,
      role: v.role,
      valuations: parseInt(v.valuation_count),
      completed: parseInt(v.completed_count),
      avg_turnaround_days: parseFloat(v.avg_turnaround_days) || 0,
    })),
    clients: {
      total: parseInt(clientMetrics.total_clients),
      active: parseInt(clientMetrics.active_clients),
      new: parseInt(clientMetrics.new_clients),
    },
    monthly_trend: monthlyTrend.map(m => ({
      month: m.month,
      valuations: parseInt(m.valuations),
      completed: parseInt(m.completed),
      revenue: parseFloat(m.revenue),
    })),
    property_types: valTypes.map(p => ({
      type: p.vtype,
      count: parseInt(p.count),
    })),
  };
}
