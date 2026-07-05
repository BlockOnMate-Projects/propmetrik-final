/**
 * Listing Guard — the single chokepoint that decides whether an organization's
 * listings may appear on the public marketplace (Marketplace Trust & Anti-Fraud).
 *
 * Phase 1 = Gate A (KYB): an org is "listable" only when it is verified
 * (organizations.is_verified) OR it is the platform org (is_platform_org, which
 * owns demo/seed listings and is implicitly trusted). Later phases (B: lister
 * KYC, C: owner mandate, D: property clearance) extend assertListable().
 */
import db from '../../database';

export class ListingNotAllowedError extends Error {
  code = 'VERIFICATION_REQUIRED';
  constructor(message = 'Your organization must be verified before its listings appear on the marketplace.') {
    super(message);
    this.name = 'ListingNotAllowedError';
  }
}

/** True when the org is verified (KYB) or is the platform org. */
export async function isOrgListable(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  const r = await db.query(
    `SELECT (is_active = TRUE AND (is_verified = TRUE OR is_platform_org = TRUE)) AS listable
       FROM organizations WHERE id = $1`,
    [orgId]
  );
  return !!r.rows[0]?.listable;
}

/**
 * SQL fragment for correlated filtering inside marketplace read queries.
 * Pass the column expression that holds the listing's organization id
 * (e.g. "organization_id" or "p.organization_id").
 */
export function listableOrgExistsSql(orgIdColumn: string): string {
  return `EXISTS (SELECT 1 FROM organizations _lo WHERE _lo.id = ${orgIdColumn} AND _lo.is_active = TRUE AND (_lo.is_verified = TRUE OR _lo.is_platform_org = TRUE))`;
}

/** Throws ListingNotAllowedError when the org is not yet listable. */
export async function assertListable(orgId: string): Promise<void> {
  if (!(await isOrgListable(orgId))) {
    throw new ListingNotAllowedError();
  }
}
