/**
 * Listing Moderation — Marketplace Trust & Anti-Fraud, Phase 5 (Gate E).
 *
 * Community abuse reporting: anyone can report a public listing. After a threshold of
 * distinct reports the listing is AUTO-SUSPENDED (hidden from the marketplace, Gate E)
 * and queued for admin review. Admins uphold/dismiss reports and suspend/reinstate.
 */
import db from '../../database';
import { logger } from '../../utils/logger';

export type PropertySource = 'pm' | 'crm';

/** Distinct reports before a listing is auto-suspended pending review. */
export const AUTO_SUSPEND_THRESHOLD = 3;

export const REPORT_REASONS = [
  'scam', 'wrong_info', 'duplicate', 'already_sold_rented', 'not_owner', 'offensive', 'other',
] as const;

export class ModerationError extends Error {
  constructor(msg: string, public status = 400) { super(msg); this.name = 'ModerationError'; }
}

/** Resolve a public permanent-link token → its property (regardless of current visibility). */
async function resolveToken(token: string): Promise<{ source: PropertySource; property_id: string; organization_id: string } | null> {
  const r = await db.query(
    `SELECT id, organization_id, 'pm'::text AS source FROM properties WHERE permanent_link_token = $1
     UNION ALL
     SELECT id, organization_id, 'crm'::text AS source FROM crm_properties WHERE permanent_link_token = $1
     LIMIT 1`,
    [token]
  );
  const row = r.rows[0];
  return row ? { source: row.source, property_id: row.id, organization_id: row.organization_id } : null;
}

async function suspendIfOverThreshold(source: PropertySource, propertyId: string): Promise<boolean> {
  const cnt = await db.query(
    `SELECT COUNT(*)::int AS n FROM listing_reports WHERE property_source=$1 AND property_id=$2 AND status='open'`,
    [source, propertyId]
  );
  const n = cnt.rows[0].n as number;
  if (n >= AUTO_SUSPEND_THRESHOLD) {
    await db.query(
      `INSERT INTO listing_moderation (property_source, property_id, status, reason, report_count, suspended_at)
       VALUES ($1,$2,'suspended',$3,$4,NOW())
       ON CONFLICT (property_source, property_id) DO UPDATE
         SET status='suspended', reason=EXCLUDED.reason, report_count=EXCLUDED.report_count,
             suspended_at=COALESCE(listing_moderation.suspended_at, NOW()), updated_at=NOW()`,
      [source, propertyId, `Auto-suspended: ${n} community reports`, n]
    );
    return true;
  }
  return false;
}

/** Public: file an abuse report against a listing (by token). Idempotent per reporter IP. */
export async function submitReport(
  token: string, input: { reason: string; details?: string; reporter_email?: string; reporter_ip?: string }
): Promise<{ ok: true; suspended: boolean }> {
  const reason = (REPORT_REASONS as readonly string[]).includes(input.reason) ? input.reason : 'other';
  const target = await resolveToken(token);
  if (!target) throw new ModerationError('Listing not found', 404);

  await db.query(
    `INSERT INTO listing_reports
       (property_source, property_id, permanent_link_token, organization_id, reason, details, reporter_email, reporter_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (property_source, property_id, reporter_ip) WHERE (status='open' AND reporter_ip IS NOT NULL) DO NOTHING`,
    [target.source, target.property_id, token, target.organization_id, reason,
     input.details || null, input.reporter_email || null, input.reporter_ip || null]
  );

  const suspended = await suspendIfOverThreshold(target.source, target.property_id);
  logger.info('Listing reported', { source: target.source, propertyId: target.property_id, reason, suspended });
  return { ok: true, suspended };
}

/** Admin: moderation queue — listings with open reports or currently suspended. */
export async function listModerationQueue(): Promise<any[]> {
  const r = await db.query(
    `SELECT r.property_source, r.property_id, r.organization_id,
            COUNT(*) FILTER (WHERE r.status='open')::int AS open_reports,
            ARRAY_AGG(DISTINCT r.reason) FILTER (WHERE r.status='open') AS reasons,
            MAX(r.created_at) AS last_reported,
            o.name AS organization_name,
            COALESCE(pp.title, cp.title) AS title,
            COALESCE(pp.permanent_link_token, cp.permanent_link_token) AS token,
            COALESCE(m.status, 'active') AS moderation_status,
            m.reason AS moderation_reason
       FROM listing_reports r
       LEFT JOIN organizations o ON o.id = r.organization_id
       LEFT JOIN listing_moderation m ON m.property_source = r.property_source AND m.property_id = r.property_id
       LEFT JOIN properties pp ON r.property_source = 'pm' AND pp.id = r.property_id
       LEFT JOIN crm_properties cp ON r.property_source = 'crm' AND cp.id = r.property_id
      GROUP BY r.property_source, r.property_id, r.organization_id, o.name, pp.title, cp.title,
               pp.permanent_link_token, cp.permanent_link_token, m.status, m.reason
     HAVING COUNT(*) FILTER (WHERE r.status='open') > 0 OR COALESCE(m.status,'active') = 'suspended'
      ORDER BY open_reports DESC, last_reported DESC
      LIMIT 200`
  );
  return r.rows;
}

/** Admin: individual reports for a listing. */
export async function listReportsForListing(source: PropertySource, propertyId: string): Promise<any[]> {
  const r = await db.query(
    `SELECT id, reason, details, reporter_email, status, created_at
       FROM listing_reports WHERE property_source=$1 AND property_id=$2 ORDER BY created_at DESC`,
    [source, propertyId]
  );
  return r.rows;
}

/** Admin: suspend a listing (hides it from the marketplace). */
export async function suspendListing(source: PropertySource, propertyId: string, reviewerId: string, reason?: string): Promise<void> {
  await db.query(
    `INSERT INTO listing_moderation (property_source, property_id, status, reason, suspended_at, updated_by)
     VALUES ($1,$2,'suspended',$3,NOW(),$4)
     ON CONFLICT (property_source, property_id) DO UPDATE
       SET status='suspended', reason=EXCLUDED.reason, suspended_at=COALESCE(listing_moderation.suspended_at, NOW()),
           updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
    [source, propertyId, reason || 'Suspended by admin', reviewerId]
  );
  // Uphold the open reports that triggered this.
  await db.query(`UPDATE listing_reports SET status='upheld', reviewed_by=$3, reviewed_at=NOW() WHERE property_source=$1 AND property_id=$2 AND status='open'`, [source, propertyId, reviewerId]);
}

/** Admin: reinstate a suspended listing + dismiss its open reports. */
export async function reinstateListing(source: PropertySource, propertyId: string, reviewerId: string): Promise<void> {
  await db.query(
    `INSERT INTO listing_moderation (property_source, property_id, status, updated_by)
     VALUES ($1,$2,'active',$3)
     ON CONFLICT (property_source, property_id) DO UPDATE SET status='active', suspended_at=NULL, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
    [source, propertyId, reviewerId]
  );
  await db.query(`UPDATE listing_reports SET status='dismissed', reviewed_by=$3, reviewed_at=NOW() WHERE property_source=$1 AND property_id=$2 AND status='open'`, [source, propertyId, reviewerId]);
}

/** Gate E read-filter: hide any suspended listing. propIdColumn must be table-qualified. */
export function moderationGateSql(source: PropertySource, propIdColumn: string): string {
  const src = source === 'pm' ? 'pm' : 'crm';
  return `NOT EXISTS (
    SELECT 1 FROM listing_moderation _m
    WHERE _m.property_source = '${src}' AND _m.property_id = ${propIdColumn} AND _m.status = 'suspended'
  )`;
}
