/**
 * Identity Verification (KYC) — Marketplace Trust & Anti-Fraud, Phase 2 (Gate B).
 *
 * Provider-agnostic service with a Didit adapter. Didit verifies the Ghana Card
 * (PIN parsed) / e-Passport (NFC) / DL / Voter ID via document-authenticity +
 * PAD-L2 liveness + face-match. We create a hosted session, redirect the user to
 * Didit's `url`, and receive the outcome on a signed webhook.
 *
 * CREDENTIAL-GATED: inert until DIDIT_API_KEY + DIDIT_WEBHOOK_SECRET +
 * DIDIT_WORKFLOW_ID are set. When unconfigured, isConfigured() is false and the
 * gate that depends on it is skipped (build ships safely; activate by setting env).
 *
 * PII minimisation (Ghana Data Protection Act 2012): we store verification
 * results/refs + minimal extracted fields, never raw ID images.
 */
import crypto from 'crypto';
import db from '../../database';
import { logger } from '../../utils/logger';
import { notify } from '../../../shared-services/notifications/notify';

const BASE_URL = process.env.DIDIT_BASE_URL || 'https://verification.didit.me';

export type IvPurpose = 'kyb_principal' | 'lister' | 'owner_mandate';
export type IvStatus = 'pending' | 'in_progress' | 'verified' | 'declined' | 'expired' | 'abandoned' | 'error';

export class IdentityVerificationNotConfiguredError extends Error {
  code = 'KYC_NOT_CONFIGURED';
  constructor(msg = 'Identity verification (Didit) is not configured. Set DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET and DIDIT_WORKFLOW_ID.') {
    super(msg);
    this.name = 'IdentityVerificationNotConfiguredError';
  }
}

/** Provider is usable only when API key, webhook secret and workflow id are all present. */
export function isConfigured(): boolean {
  return !!(process.env.DIDIT_API_KEY && process.env.DIDIT_WEBHOOK_SECRET && process.env.DIDIT_WORKFLOW_ID);
}

/** Map Didit's session status → our normalized status. */
function mapDiditStatus(s: string | undefined): IvStatus {
  switch ((s || '').toLowerCase().replace(/\s+/g, '_')) {
    case 'approved': return 'verified';
    case 'declined': return 'declined';
    case 'in_review':
    case 'in_progress': return 'in_progress';
    case 'abandoned': return 'abandoned';
    case 'kyc_expired':
    case 'expired': return 'expired';
    case 'not_started': return 'pending';
    default: return 'in_progress';
  }
}

/** Pull the minimal fields we retain out of a Didit decision object (defensive). */
function extractFields(decision: any): { document_type?: string; verified_name?: string; document_number?: string; date_of_birth?: string } {
  const idv = decision?.id_verification || decision?.kyc || decision || {};
  const name = idv.full_name
    || [idv.first_name, idv.last_name].filter(Boolean).join(' ')
    || decision?.full_name
    || undefined;
  const dob = idv.date_of_birth || idv.dob || undefined;
  return {
    document_type: (idv.document_type || decision?.document_type || undefined) as string | undefined,
    verified_name: name ? String(name).trim() : undefined,
    document_number: (idv.document_number || idv.personal_number || idv.id_number || undefined) as string | undefined,
    date_of_birth: dob ? String(dob).slice(0, 10) : undefined,
  };
}

/**
 * Create a hosted Didit verification session for a person and return the URL they
 * must visit. Inserts a pending identity_verifications row keyed by session_id.
 */
export async function createSession(opts: {
  subjectUserId: string;
  organizationId: string;
  purpose?: IvPurpose;
  callbackUrl?: string;
}): Promise<{ verification_id: string; verification_url: string; session_id: string }> {
  if (!isConfigured()) throw new IdentityVerificationNotConfiguredError();

  const purpose = opts.purpose || 'lister';
  const ins = await db.query(
    `INSERT INTO identity_verifications (subject_user_id, subject_type, subject_id, organization_id, purpose, provider, status)
     VALUES ($1,'user',$1,$2,$3,'didit','pending') RETURNING id`,
    [opts.subjectUserId, opts.organizationId, purpose]
  );
  const verificationId: string = ins.rows[0].id;

  try {
    const res = await fetch(`${BASE_URL}/v3/session/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.DIDIT_API_KEY as string },
      body: JSON.stringify({
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        vendor_data: verificationId, // maps the webhook back to this row
        callback: opts.callbackUrl,
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url || !data?.session_id) {
      const msg = data?.message || data?.error || data?.detail || `Didit session create failed (${res.status})`;
      await db.query(`UPDATE identity_verifications SET status='error', updated_at=NOW() WHERE id=$1`, [verificationId]);
      throw new Error(msg);
    }
    await db.query(
      `UPDATE identity_verifications SET provider_session_id=$2, verification_url=$3, status='in_progress', updated_at=NOW() WHERE id=$1`,
      [verificationId, String(data.session_id), String(data.url)]
    );
    return { verification_id: verificationId, verification_url: String(data.url), session_id: String(data.session_id) };
  } catch (err: any) {
    await db.query(`UPDATE identity_verifications SET status='error', updated_at=NOW() WHERE id=$1`, [verificationId]).catch(() => {});
    logger.error('Didit createSession failed', { verificationId, error: err?.message });
    throw err;
  }
}

/**
 * Verify a Didit webhook: HMAC-SHA256 of the RAW body against DIDIT_WEBHOOK_SECRET
 * (x-signature) + replay window on x-timestamp.
 */
export function verifySignature(rawBody: string, signature: string | undefined, timestamp: string | undefined): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret || !signature || !timestamp) return false;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Best-effort fetch of a session decision to extract the retained fields. */
async function fetchDecision(sessionId: string): Promise<any | null> {
  try {
    const res = await fetch(`${BASE_URL}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
      headers: { 'X-API-Key': process.env.DIDIT_API_KEY as string },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/**
 * Process a verified Didit webhook (signature already verified by the caller).
 * Updates the matching identity_verifications row by session_id (vendor_data fallback).
 */
export async function handleWebhook(payload: any): Promise<void> {
  const sessionId = payload?.session_id ? String(payload.session_id) : null;
  const vendorData = payload?.vendor_data ? String(payload.vendor_data) : null; // our row id
  const status = mapDiditStatus(payload?.status);

  // Locate the row.
  let rowId: string | null = null;
  if (sessionId) {
    const r = await db.query(`SELECT id FROM identity_verifications WHERE provider='didit' AND provider_session_id=$1 LIMIT 1`, [sessionId]);
    rowId = r.rows[0]?.id || null;
  }
  if (!rowId && vendorData) {
    const r = await db.query(`SELECT id FROM identity_verifications WHERE id=$1 LIMIT 1`, [vendorData]);
    rowId = r.rows[0]?.id || null;
  }
  if (!rowId) {
    logger.warn('Didit webhook: no matching verification row', { sessionId, vendorData, status });
    return;
  }

  let fields: ReturnType<typeof extractFields> = {};
  let decisionSummary: any = { status: payload?.status };
  if (status === 'verified') {
    const decision = payload?.decision || (sessionId ? await fetchDecision(sessionId) : null);
    if (decision) {
      fields = extractFields(decision);
      decisionSummary = { status: payload?.status, warnings: decision?.warnings ?? decision?.reviews ?? null };
    }
  }

  await db.query(
    `UPDATE identity_verifications SET
       status=$2,
       document_type=COALESCE($3, document_type),
       verified_name=COALESCE($4, verified_name),
       document_number=COALESCE($5, document_number),
       date_of_birth=COALESCE($6, date_of_birth),
       decision=$7::jsonb,
       verified_at=CASE WHEN $2='verified' THEN NOW() ELSE verified_at END,
       updated_at=NOW()
     WHERE id=$1`,
    [rowId, status, fields.document_type ?? null, fields.verified_name ?? null,
     fields.document_number ?? null, fields.date_of_birth ?? null, JSON.stringify(decisionSummary)]
  );
}

/** Latest verification for a user (optionally scoped to an org). */
export async function getUserStatus(userId: string, orgId?: string): Promise<any | null> {
  const r = await db.query(
    `SELECT id, purpose, provider, status, document_type, verified_name, verified_at, verification_url, created_at
       FROM identity_verifications
      WHERE subject_user_id = $1 ${orgId ? 'AND organization_id = $2' : ''}
      ORDER BY created_at DESC LIMIT 1`,
    orgId ? [userId, orgId] : [userId]
  );
  return r.rows[0] || null;
}

/** Gate B: is this user identity-verified? */
export async function isUserIdentityVerified(userId: string): Promise<boolean> {
  if (!userId) return false;
  const r = await db.query(
    `SELECT 1 FROM identity_verifications WHERE subject_user_id=$1 AND status='verified' LIMIT 1`,
    [userId]
  );
  return (r.rowCount ?? 0) > 0;
}

export type IvSubjectType = 'user' | 'tenant' | 'contact' | 'applicant';

/**
 * Create a Didit session for a NON-user subject (tenant / CRM contact) and EMAIL them the
 * secure link to complete Ghana-Card + liveness on their own device. Returns once the link
 * is sent; the webhook records the outcome.
 */
export async function createSessionForSubject(opts: {
  subjectType: IvSubjectType;
  subjectId: string;
  organizationId: string;
  email: string;
  name?: string | null;
  purpose?: string;
  category?: 'property' | 'crm' | 'system';
  callbackUrl?: string;
}): Promise<{ verification_id: string; sent_to: string }> {
  if (!isConfigured()) throw new IdentityVerificationNotConfiguredError();

  const ins = await db.query(
    `INSERT INTO identity_verifications (subject_type, subject_id, organization_id, purpose, provider, status)
     VALUES ($1,$2,$3,$4,'didit','pending') RETURNING id`,
    [opts.subjectType, opts.subjectId, opts.organizationId, opts.purpose || opts.subjectType]
  );
  const verificationId: string = ins.rows[0].id;

  try {
    const res = await fetch(`${BASE_URL}/v3/session/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.DIDIT_API_KEY as string },
      body: JSON.stringify({ workflow_id: process.env.DIDIT_WORKFLOW_ID, vendor_data: verificationId, callback: opts.callbackUrl }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url || !data?.session_id) {
      await db.query(`UPDATE identity_verifications SET status='error', updated_at=NOW() WHERE id=$1`, [verificationId]);
      throw new Error(data?.message || data?.error || data?.detail || `Didit session create failed (${res.status})`);
    }
    await db.query(
      `UPDATE identity_verifications SET provider_session_id=$2, verification_url=$3, status='in_progress', updated_at=NOW() WHERE id=$1`,
      [verificationId, String(data.session_id), String(data.url)]
    );

    const url = String(data.url);
    await notify({
      recipients: [{ audience: 'tenant', userId: '', email: opts.email, name: opts.name || undefined }],
      category: opts.category || 'system',
      type: 'identity.verify_request',
      title: 'Verify your identity',
      body: 'Please complete a quick identity check (Ghana Card + a selfie) to continue.',
      priority: 'high',
      channels: { email: true },
      sourceUrl: url,
      email: {
        subject: 'Identity verification required',
        html: `<p>Hello${opts.name ? ' ' + opts.name : ''},</p>
               <p>Please complete a quick, secure identity check (Ghana Card + a selfie) to continue.</p>
               <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify my identity</a></p>
               <p>Or open this link:<br>${url}</p>`,
      },
    }).catch((e: any) => logger.warn('Identity verify link send failed', { verificationId, error: e?.message }));

    return { verification_id: verificationId, sent_to: opts.email };
  } catch (err: any) {
    await db.query(`UPDATE identity_verifications SET status='error', updated_at=NOW() WHERE id=$1`, [verificationId]).catch(() => {});
    logger.error('createSessionForSubject failed', { subjectType: opts.subjectType, subjectId: opts.subjectId, error: err?.message });
    throw err;
  }
}

/** Latest verification for any subject (user/tenant/contact). */
export async function getSubjectStatus(subjectType: IvSubjectType, subjectId: string): Promise<any | null> {
  const r = await db.query(
    `SELECT id, purpose, status, document_type, verified_name, verified_at, created_at
       FROM identity_verifications WHERE subject_type=$1 AND subject_id=$2 ORDER BY created_at DESC LIMIT 1`,
    [subjectType, subjectId]
  );
  return r.rows[0] || null;
}

/** Is this subject (tenant/contact/user) identity-verified? */
export async function isSubjectVerified(subjectType: IvSubjectType, subjectId: string): Promise<boolean> {
  if (!subjectId) return false;
  const r = await db.query(
    `SELECT 1 FROM identity_verifications WHERE subject_type=$1 AND subject_id=$2 AND status='verified' LIMIT 1`,
    [subjectType, subjectId]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Gate B (KYB): does this org have a verified principal/lister identity? */
export async function isOrgPrincipalVerified(orgId: string): Promise<boolean> {
  if (!orgId) return false;
  const r = await db.query(
    `SELECT 1 FROM identity_verifications
      WHERE organization_id=$1 AND status='verified' AND purpose IN ('kyb_principal','lister') LIMIT 1`,
    [orgId]
  );
  return (r.rowCount ?? 0) > 0;
}
