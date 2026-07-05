/**
 * Organization Verification (KYB) — org-facing routes.
 * Marketplace Trust & Anti-Fraud, Phase 1 (Gate A).
 *
 *   GET  /org-verification            → this org's verification status + latest submission
 *   POST /org-verification            → submit / update KYB (org admin only)
 *   POST /org-verification/documents  → upload a KYB proof document (org admin only)
 *
 * Mounted authenticated in index.ts. Admin review lives in routes/admin.ts.
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getAuthOrgId, getAuthUserId, isOrgAdmin } from '../middleware/pmAuth';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../database/minio';
import { logger } from '../utils/logger';
import * as kyb from '../services/organization/kybService';

const router = Router();

function asyncH(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | any>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** GET / — current org verification status. */
router.get('/', asyncH(async (req: Request, res: Response) => {
  const orgId = getAuthOrgId(req);
  const data = await kyb.getVerificationStatus(orgId);
  res.json({ data });
}));

/** POST / — submit or update the pending KYB application (org admin only). */
router.post('/', asyncH(async (req: Request, res: Response) => {
  if (!isOrgAdmin(req)) {
    res.status(403).json({ error: 'Only an organization admin can submit verification.' });
    return;
  }
  const orgId = getAuthOrgId(req);
  const userId = getAuthUserId(req);
  const submission = await kyb.submitKyb(orgId, userId, req.body || {});
  res.json({ data: submission });
}));

/** POST /documents — upload a KYB proof document; returns a storable ref + short-lived preview URL. */
router.post('/documents', upload.single('file'), asyncH(async (req: Request, res: Response) => {
  if (!isOrgAdmin(req)) {
    res.status(403).json({ error: 'Only an organization admin can upload verification documents.' });
    return;
  }
  const orgId = getAuthOrgId(req);
  const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const type = (req.body?.type as string) || 'other';
  const bucket = buckets.documents || 'propmetrik-documents';
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `kyb/${orgId}/${Date.now()}_${safeName}`;
  await uploadFile(bucket, key, file.buffer, file.mimetype);

  let previewUrl: string | null = null;
  try {
    previewUrl = await getPresignedDownloadUrl(bucket, key, 3600);
  } catch (err: any) {
    logger.warn('KYB doc presign failed', { key, error: err?.message });
  }

  res.json({
    data: {
      type,
      key,
      filename: file.originalname,
      uploaded_at: new Date().toISOString(),
      url: previewUrl,
    },
  });
}));

export default router;
