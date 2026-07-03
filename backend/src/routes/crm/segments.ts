/**
 * CRM Campaign Segment Routes
 *
 * Saved audience filters + preview + bulk-enroll into a drip campaign.
 * Authorized by the CRM RBAC dispatcher (mapped to `crm_campaign` in index.ts).
 *
 * Base: /api/v1/crm/segments
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { segmentService } from '../../services/crm-deal-management/segmentService';

const router = Router();

router.get('/segments', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    res.json(await segmentService.list(orgId));
}));

router.get('/segments/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const segment = await segmentService.getById(req.params.id, orgId);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });
    res.json(segment);
}));

router.post('/segments', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.body?.name) return res.status(400).json({ error: 'name is required' });
    res.status(201).json(await segmentService.create(orgId, req.body, userId));
}));

router.put('/segments/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const updated = await segmentService.update(req.params.id, orgId, req.body);
    if (!updated) return res.status(404).json({ error: 'Segment not found' });
    res.json(updated);
}));

router.delete('/segments/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const ok = await segmentService.remove(req.params.id, orgId);
    if (!ok) return res.status(404).json({ error: 'Segment not found' });
    res.status(204).send();
}));

// Preview how many contacts a filter matches (+ a small sample). Body: { filter } or by :id.
router.post('/segments/preview', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const filter = req.body?.filter || {};
    const [count, sample] = await Promise.all([
        segmentService.count(orgId, filter),
        segmentService.resolveContacts(orgId, filter, 10),
    ]);
    res.json({ count, sample });
}));

// Enroll a segment's contacts into a drip campaign. Body: { campaignId }.
router.post('/segments/:id/enroll', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const { campaignId } = req.body;
    if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });
    try {
        const result = await segmentService.enrollIntoCampaign(orgId, req.params.id, campaignId);
        res.json(result);
    } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Enrollment failed' });
    }
}));

export default router;
