/**
 * Identity Verification (KYC) — user-facing routes. Phase 2 (Gate B).
 *
 *   GET  /identity/status  → current user's identity-verification status
 *   POST /identity/start   → begin a Didit hosted session; returns the URL to visit
 *
 * Mounted authenticated in index.ts. The provider callback is the public
 * /webhooks/didit endpoint.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { getAuthOrgId, getAuthUserId } from '../middleware/pmAuth';
import * as iv from '../services/identity/identityVerificationService';
import db from '../database';

const router = Router();

function asyncH(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | any>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** GET /identity/status — current user's latest verification + whether KYC is configured. */
router.get('/status', asyncH(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const orgId = getAuthOrgId(req);
  const verification = await iv.getUserStatus(userId, orgId);
  res.json({
    data: {
      configured: iv.isConfigured(),
      status: (verification?.status as string) || 'unverified',
      verification,
    },
  });
}));

/** POST /identity/start — create a Didit session; returns { verification_url }. */
router.post('/start', asyncH(async (req: Request, res: Response) => {
  if (!iv.isConfigured()) {
    res.status(503).json({ error: 'Identity verification is not configured yet.', configured: false });
    return;
  }
  const userId = getAuthUserId(req);
  const orgId = getAuthOrgId(req);
  const purpose = (req.body?.purpose as iv.IvPurpose) || 'lister';
  const callbackUrl = (req.body?.redirect_url as string) || undefined;
  const session = await iv.createSession({ subjectUserId: userId, organizationId: orgId, purpose, callbackUrl });
  res.json({ data: session });
}));

/** Resolve a tenant/contact's contact info (org-scoped). */
async function resolveSubject(subjectType: string, subjectId: string, orgId: string): Promise<{ name: string | null; email: string | null } | null> {
  if (subjectType === 'tenant') {
    const r = await db.query(`SELECT full_name AS name, email FROM tenants WHERE id=$1 AND organization_id=$2`, [subjectId, orgId]);
    return (r.rows[0] as { name: string | null; email: string | null }) || null;
  }
  if (subjectType === 'contact') {
    const r = await db.query(
      `SELECT NULLIF(TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))),'') AS name, email FROM contacts WHERE id=$1 AND organization_id=$2`,
      [subjectId, orgId]
    );
    return (r.rows[0] as { name: string | null; email: string | null }) || null;
  }
  if (subjectType === 'applicant') {
    // A tenant application's applicant (no tenant record exists until lease generation).
    const r = await db.query(`SELECT NULL::text AS name, applicant_email AS email FROM applications WHERE id=$1 AND organization_id=$2`, [subjectId, orgId]);
    return (r.rows[0] as { name: string | null; email: string | null }) || null;
  }
  return null;
}

/** GET /identity/subject-status?subject_type=&subject_id= — a tenant/contact's verification status. */
router.get('/subject-status', asyncH(async (req: Request, res: Response) => {
  const subjectType = req.query.subject_type as string;
  const subjectId = req.query.subject_id as string;
  if (!['tenant','contact','applicant'].includes(subjectType) || !subjectId) { res.status(400).json({ error: 'subject_type and subject_id are required' }); return; }
  const verification = await iv.getSubjectStatus(subjectType as any, subjectId);
  res.json({ data: { configured: iv.isConfigured(), status: (verification?.status as string) || 'unverified', verification } });
}));

/** POST /identity/verify/subject — send a tenant/contact a secure Didit link (email). */
router.post('/verify/subject', asyncH(async (req: Request, res: Response) => {
  const orgId = getAuthOrgId(req);
  const { subject_type, subject_id, redirect_url } = req.body || {};
  if (!['tenant','contact','applicant'].includes(subject_type) || !subject_id) { res.status(400).json({ error: 'subject_type (tenant|contact) and subject_id are required' }); return; }
  if (!iv.isConfigured()) { res.status(503).json({ error: 'Identity verification is not configured yet.', configured: false }); return; }

  const subject = await resolveSubject(subject_type, subject_id, orgId);
  if (!subject) { res.status(404).json({ error: 'Subject not found for this organization' }); return; }
  if (!subject.email) { res.status(400).json({ error: 'This person has no email on file — add one to send the verification link.' }); return; }

  const result = await iv.createSessionForSubject({
    subjectType: subject_type as iv.IvSubjectType, subjectId: subject_id, organizationId: orgId,
    email: subject.email, name: subject.name,
    category: subject_type === 'contact' ? 'crm' : 'property',
    callbackUrl: (redirect_url as string) || undefined,
  });
  res.json({ data: result });
}));

export default router;
