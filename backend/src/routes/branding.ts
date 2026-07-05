/**
 * Company Branding Routes (per-service)
 *
 * Each service (valuation, property_management, crm, project_management) owns its
 * own company branding. These endpoints let a subscriber of that service view,
 * edit, and upload a logo for THAT service's brand — independent of the others.
 *
 *   GET  /api/v1/branding/:service              → resolve current branding (authed)
 *   PUT  /api/v1/branding/:service              → save branding fields   (authed)
 *   POST /api/v1/branding/:service/logo         → upload logo (multipart) (authed)
 *   GET  /api/v1/branding/logo/:orgId/:service  → stream the logo (PUBLIC — appears on docs/emails)
 *
 * @module routes/branding
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { getAuthOrgId, isOrgAdmin } from '../middleware/pmAuth';
import { uploadFile, getFile, buckets } from '../database/minio';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  getServiceBranding,
  updateServiceBranding,
  setServiceLogo,
  isServiceType,
  ServiceType,
} from '../services/branding/serviceBrandingService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — logos are small
});

function asyncH(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: any) => Promise.resolve(fn(req, res)).catch(next);
}

// ── PUBLIC: stream a service's logo (safe — logos are public brand assets that
//    appear on client-facing documents and emails). Mounted BEFORE the auth catch-alls.
export const brandingPublicRouter = Router();
brandingPublicRouter.get('/branding/logo/:orgId/:service', asyncH(async (req, res) => {
  const { orgId, service } = req.params;
  if (!isServiceType(service)) return res.status(400).json({ error: 'Invalid service' });
  const branding = await getServiceBranding(orgId, service);
  if (!branding?.logo_key) return res.status(404).json({ error: 'No logo' });
  try {
    const obj = await getFile(buckets.media, branding.logo_key);
    if (!obj.body?.length) return res.status(404).json({ error: 'No logo' });
    res.setHeader('Content-Type', obj.contentType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    // The logo is embedded cross-origin (app domain ← api domain) in <img> tags and
    // documents, so override helmet's global Cross-Origin-Resource-Policy: same-origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.send(Buffer.from(obj.body));
  } catch (err: any) {
    logger.warn('Branding logo serve failed', { orgId, service, error: err?.message });
    return res.status(404).json({ error: 'No logo' });
  }
}));

// ── AUTHENTICATED: view / edit / upload branding for the caller's own org.
const router = Router();
router.use(authenticate);

/** Writes (save/upload) require an org admin/owner; reads are open to any org member. */
function requireOrgAdmin(req: Request, res: Response, next: any) {
  if (isOrgAdmin(req)) return next();
  return res.status(403).json({ error: 'Only an organization admin can change company branding.' });
}

/** GET /api/v1/branding/:service */
router.get('/:service', asyncH(async (req, res) => {
  const service = req.params.service;
  if (!isServiceType(service)) return res.status(400).json({ error: 'Invalid service' });
  const orgId = getAuthOrgId(req);
  const branding = await getServiceBranding(orgId, service as ServiceType);
  res.json({ branding });
}));

/** PUT /api/v1/branding/:service — save whitelisted branding fields */
router.put('/:service', requireOrgAdmin, asyncH(async (req, res) => {
  const service = req.params.service;
  if (!isServiceType(service)) return res.status(400).json({ error: 'Invalid service' });
  const orgId = getAuthOrgId(req);
  const branding = await updateServiceBranding(orgId, service as ServiceType, req.body || {});
  res.json({ success: true, branding });
}));

/** POST /api/v1/branding/:service/logo — multipart logo upload (field: "logo") */
router.post('/:service/logo', requireOrgAdmin, upload.single('logo'), asyncH(async (req, res) => {
  const service = req.params.service;
  if (!isServiceType(service)) return res.status(400).json({ error: 'Invalid service' });
  const orgId = getAuthOrgId(req);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'No file uploaded (field name: logo)' });
  if (!/^image\/(png|jpe?g)$/i.test(file.mimetype)) {
    return res.status(400).json({ error: 'Logo must be a PNG or JPEG image' });
  }

  // Deterministic key per (org, service) — re-upload overwrites the previous logo.
  const key = `organizations/${orgId}/branding/${service}/logo`;
  await uploadFile(buckets.media, key, file.buffer, file.mimetype);

  // Stable, cache-busted serve URL (the resolver reads bytes via logo_key directly).
  const logoUrl = `${config.app.url}/api/v1/branding/logo/${orgId}/${service}?v=${Date.now()}`;
  const branding = await setServiceLogo(orgId, service as ServiceType, logoUrl, key);
  res.json({ success: true, logo_url: logoUrl, branding });
}));

export default router;
