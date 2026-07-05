/**
 * Listing Mandate (right-to-list) — agent-facing routes. Phase 3 (Gate C).
 *
 *   GET  /listing-mandate/status?source=&property_id=  → current mandate status
 *   POST /listing-mandate/request                       → send owner an e-sign mandate
 *   POST /listing-mandate/self-attest                   → owner-operator asserts ownership
 *
 * The owner signs via the existing e-sign magic link (/sign/{token}); no new page needed.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { getAuthOrgId, getAuthUserId } from '../middleware/pmAuth';
import * as mandate from '../services/marketplace/listingMandateService';
import * as registry from '../services/marketplace/propertyRegistryService';

const router = Router();
function asyncH(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | any>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}
function parseSource(v: any): mandate.PropertySource {
  return v === 'crm' ? 'crm' : 'pm';
}
function handleErr(res: Response, e: any): boolean {
  if (e?.name === 'MandateError') { res.status(e.status || 400).json({ error: e.message }); return true; }
  return false;
}

router.get('/status', asyncH(async (req: Request, res: Response) => {
  const orgId = getAuthOrgId(req);
  const source = parseSource(req.query.source);
  const propertyId = req.query.property_id as string;
  if (!propertyId) { res.status(400).json({ error: 'property_id is required' }); return; }
  const data = await mandate.getMandateStatus(orgId, source, propertyId);
  res.json({ data });
}));

router.post('/request', asyncH(async (req: Request, res: Response) => {
  const orgId = getAuthOrgId(req);
  const userId = getAuthUserId(req);
  const { source, property_id, owner_name, owner_email, owner_phone, txn_type, price_ceiling, expires_in_days, land_title_number, parcel_id } = req.body || {};
  if (!property_id) { res.status(400).json({ error: 'property_id is required' }); return; }
  try {
    const data = await mandate.createOwnerMandate(orgId, userId, parseSource(source), property_id, {
      owner_name, owner_email, owner_phone, txn_type,
      price_ceiling: price_ceiling != null ? Number(price_ceiling) : null,
      expires_in_days: expires_in_days != null ? Number(expires_in_days) : undefined,
      land_title_number: land_title_number || null, parcel_id: parcel_id || null,
    });
    res.json({ data });
  } catch (e: any) { if (!handleErr(res, e)) throw e; }
}));

router.post('/self-attest', asyncH(async (req: Request, res: Response) => {
  const orgId = getAuthOrgId(req);
  const userId = getAuthUserId(req);
  const { source, property_id, land_title_number, parcel_id } = req.body || {};
  if (!property_id) { res.status(400).json({ error: 'property_id is required' }); return; }
  try {
    const data = await mandate.selfAttestOwnership(orgId, userId, parseSource(source), property_id, {
      land_title_number: land_title_number || null, parcel_id: parcel_id || null,
    });
    res.json({ data });
  } catch (e: any) { if (!handleErr(res, e)) throw e; }
}));

/** POST /mark-sold — record that a property's identity is sold (Gate D blocks re-listing). */
router.post('/mark-sold', asyncH(async (req: Request, res: Response) => {
  const orgId = getAuthOrgId(req);
  const { source, property_id } = req.body || {};
  if (!property_id) { res.status(400).json({ error: 'property_id is required' }); return; }
  const data = await registry.markSold(parseSource(source), property_id, orgId);
  res.json({ data });
}));

export default router;
