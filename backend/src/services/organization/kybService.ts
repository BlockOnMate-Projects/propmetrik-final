/**
 * KYB (Know-Your-Business) service — Marketplace Trust & Anti-Fraud, Phase 1 (Gate A).
 *
 * An organization submits its business identity (RGD registration, GRA TIN, Real
 * Estate Agency Act 2020 licence, principal's Ghana Card + proof docs). A platform
 * admin reviews and approves → organizations.is_verified = TRUE, which unlocks the
 * public marketplace for that org (enforced by listingGuardService).
 *
 * Reuses existing organizations columns (registration_number, tin_number,
 * license_number, license_expiry, is_verified, verified_at, is_active).
 */
import db from '../../database';
import { logger } from '../../utils/logger';
import * as iv from '../identity/identityVerificationService';

/** Thrown when KYB approval is attempted before the org's principal has passed KYC (Gate B). */
export class KybPrincipalNotVerifiedError extends Error {
  code = 'PRINCIPAL_KYC_REQUIRED';
  constructor(msg = 'The organization principal must complete identity verification (Ghana Card) before the company can be verified.') {
    super(msg);
    this.name = 'KybPrincipalNotVerifiedError';
  }
}

export type KybStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended';

export interface KybDocument {
  type: string;        // certificate_of_incorporation | tin_certificate | agency_license | principal_ghana_card | other
  url: string;
  key: string;
  filename?: string;
  uploaded_at?: string;
}

export interface KybInput {
  legal_name?: string | null;
  business_registration_number?: string | null;
  tin_number?: string | null;
  agency_license_number?: string | null;
  license_expiry?: string | null;
  registered_address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  principal_name?: string | null;
  principal_ghana_card?: string | null;
  documents?: KybDocument[];
}

async function writeAudit(action: string, orgId: string, userId: string, metadata: Record<string, any>): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, user_id, organization_id, metadata)
       VALUES ($1, 'organization', $2, $3, $2, $4)`,
      [action, orgId, userId, JSON.stringify(metadata || {})]
    );
  } catch (err: any) {
    logger.warn('KYB audit write failed', { action, orgId, error: err?.message });
  }
}

/** Derive the display verification status for an org. */
export async function getVerificationStatus(orgId: string): Promise<{
  organization: any;
  latest_submission: any | null;
  status: KybStatus;
  kyc_configured: boolean;
  principal_identity_verified: boolean;
}> {
  const orgRes = await db.query(
    `SELECT id, name, is_verified, verified_at, is_active, is_platform_org,
            registration_number, tin_number, license_number, license_expiry
       FROM organizations WHERE id = $1`,
    [orgId]
  );
  const subRes = await db.query(
    `SELECT * FROM kyb_submissions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
  const o = orgRes.rows[0];
  const latest = subRes.rows[0] || null;

  let status: KybStatus;
  if (!o) status = 'unverified';
  else if (o.is_platform_org || o.is_verified) status = 'verified';
  else if (o.is_active === false) status = 'suspended';
  else if (latest?.status === 'pending') status = 'pending';
  else if (latest?.status === 'rejected') status = 'rejected';
  else status = 'unverified';

  return {
    organization: o || null,
    latest_submission: latest,
    status,
    kyc_configured: iv.isConfigured(),
    principal_identity_verified: await iv.isOrgPrincipalVerified(orgId),
  };
}

/**
 * Submit (or update the pending) KYB application for an org. Mirrors the core
 * identifiers onto the organizations row for convenience; the full record + docs
 * live on kyb_submissions for the review trail.
 */
export async function submitKyb(orgId: string, userId: string, input: KybInput): Promise<any> {
  const documents = Array.isArray(input.documents) ? input.documents : [];
  const cols = {
    legal_name: input.legal_name ?? null,
    business_registration_number: input.business_registration_number ?? null,
    tin_number: input.tin_number ?? null,
    agency_license_number: input.agency_license_number ?? null,
    license_expiry: input.license_expiry || null,
    registered_address: input.registered_address ?? null,
    contact_email: input.contact_email ?? null,
    contact_phone: input.contact_phone ?? null,
    principal_name: input.principal_name ?? null,
    principal_ghana_card: input.principal_ghana_card ?? null,
  };

  const existing = await db.query(
    `SELECT id FROM kyb_submissions WHERE organization_id = $1 AND status = 'pending' LIMIT 1`,
    [orgId]
  );

  let submission;
  if (existing.rows[0]) {
    const r = await db.query(
      `UPDATE kyb_submissions SET
         legal_name=$2, business_registration_number=$3, tin_number=$4, agency_license_number=$5,
         license_expiry=$6, registered_address=$7, contact_email=$8, contact_phone=$9,
         principal_name=$10, principal_ghana_card=$11, documents=$12::jsonb,
         submitted_by=$13, submitted_at=NOW(), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [existing.rows[0].id, cols.legal_name, cols.business_registration_number, cols.tin_number,
       cols.agency_license_number, cols.license_expiry, cols.registered_address, cols.contact_email,
       cols.contact_phone, cols.principal_name, cols.principal_ghana_card, JSON.stringify(documents), userId]
    );
    submission = r.rows[0];
  } else {
    const r = await db.query(
      `INSERT INTO kyb_submissions
         (organization_id, status, legal_name, business_registration_number, tin_number,
          agency_license_number, license_expiry, registered_address, contact_email, contact_phone,
          principal_name, principal_ghana_card, documents, submitted_by, submitted_at)
       VALUES ($1,'pending',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,NOW()) RETURNING *`,
      [orgId, cols.legal_name, cols.business_registration_number, cols.tin_number,
       cols.agency_license_number, cols.license_expiry, cols.registered_address, cols.contact_email,
       cols.contact_phone, cols.principal_name, cols.principal_ghana_card, JSON.stringify(documents), userId]
    );
    submission = r.rows[0];
  }

  // Mirror core identifiers onto the org (do not wipe existing values with blanks).
  await db.query(
    `UPDATE organizations SET
       registration_number = COALESCE($2, registration_number),
       tin_number          = COALESCE($3, tin_number),
       license_number      = COALESCE($4, license_number),
       license_expiry      = COALESCE($5, license_expiry),
       updated_at = NOW()
     WHERE id = $1`,
    [orgId, cols.business_registration_number, cols.tin_number, cols.agency_license_number, cols.license_expiry]
  );

  await writeAudit('org.kyb.submitted', orgId, userId, { submission_id: submission.id, docs: documents.length });
  return submission;
}

/** Admin: list pending KYB submissions (review queue). */
export async function listPendingKyb(): Promise<any[]> {
  const r = await db.query(
    `SELECT k.*, o.name AS organization_name, o.slug, o.is_verified, o.is_active,
            (SELECT COUNT(*)::int FROM users u WHERE u.organization_id = o.id) AS user_count,
            EXISTS (SELECT 1 FROM identity_verifications iv
                     WHERE iv.organization_id = o.id AND iv.status = 'verified'
                       AND iv.purpose IN ('kyb_principal','lister')) AS principal_identity_verified
       FROM kyb_submissions k
       JOIN organizations o ON o.id = k.organization_id
      WHERE k.status = 'pending'
      ORDER BY k.submitted_at ASC NULLS LAST`
  );
  return r.rows;
}

/**
 * Admin: approve an org's KYB → verified. Unlocks the marketplace for its listings.
 * Gate B: when KYC (Didit) is configured, the org principal must be identity-verified
 * first — unless `force` (admin override, e.g. legacy orgs onboarded pre-KYC).
 */
export async function approveOrg(orgId: string, reviewerId: string, notes?: string, force = false): Promise<void> {
  if (iv.isConfigured() && !force && !(await iv.isOrgPrincipalVerified(orgId))) {
    throw new KybPrincipalNotVerifiedError();
  }
  await db.query(
    `UPDATE organizations SET is_verified = TRUE, verified_at = NOW(), is_active = TRUE, updated_at = NOW() WHERE id = $1`,
    [orgId]
  );
  await db.query(
    `UPDATE kyb_submissions SET status='approved', reviewed_by=$2, reviewed_at=NOW(), review_notes=$3, updated_at=NOW()
       WHERE organization_id=$1 AND status='pending'`,
    [orgId, reviewerId, notes ?? null]
  );
  await writeAudit('org.kyb.approved', orgId, reviewerId, { notes: notes ?? null });
}

/** Admin: reject an org's KYB. */
export async function rejectOrg(orgId: string, reviewerId: string, notes?: string): Promise<void> {
  await db.query(
    `UPDATE organizations SET is_verified = FALSE, verified_at = NULL, updated_at = NOW() WHERE id = $1`,
    [orgId]
  );
  await db.query(
    `UPDATE kyb_submissions SET status='rejected', reviewed_by=$2, reviewed_at=NOW(), review_notes=$3, updated_at=NOW()
       WHERE organization_id=$1 AND status='pending'`,
    [orgId, reviewerId, notes ?? null]
  );
  await writeAudit('org.kyb.rejected', orgId, reviewerId, { notes: notes ?? null });
}

/** Admin: suspend an org (removes its listings from the marketplace via is_active). */
export async function suspendOrg(orgId: string, reviewerId: string, notes?: string): Promise<void> {
  await db.query(`UPDATE organizations SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [orgId]);
  await writeAudit('org.suspended', orgId, reviewerId, { notes: notes ?? null });
}

/** Admin: reinstate a suspended org. */
export async function unsuspendOrg(orgId: string, reviewerId: string): Promise<void> {
  await db.query(`UPDATE organizations SET is_active = TRUE, updated_at = NOW() WHERE id = $1`, [orgId]);
  await writeAudit('org.unsuspended', orgId, reviewerId, {});
}
