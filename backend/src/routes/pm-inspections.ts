/**
 * PM Property Condition Inspection Routes
 *
 * Mounted under /api/v1/pm (authenticate + requireServiceAccess('property_management')).
 * Base paths: /pm/inspections
 *
 * @module routes/pm-inspections
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getAuthOrgId, getAuthUserId } from '../middleware/pmAuth';
import { inspectionService } from '../services/property-management/inspections/inspectionService';

const router = Router();
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/inspections', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    res.json(await inspectionService.list(orgId, {
        propertyId: req.query.property_id as string | undefined,
        status: req.query.status as string | undefined,
        type: req.query.type as string | undefined,
    }));
}));

router.post('/inspections', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const b = req.body || {};
    const created = await inspectionService.create(orgId, {
        propertyId: b.propertyId, unitId: b.unitId, tenancyId: b.tenancyId,
        inspectionType: b.inspectionType, scheduledFor: b.scheduledFor, inspectorId: b.inspectorId, summary: b.summary,
    }, userId);
    res.status(201).json(created);
}));

router.get('/inspections/:id', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    const insp = await inspectionService.getById(req.params.id, orgId);
    if (!insp) return res.status(404).json({ error: 'Inspection not found' });
    res.json(insp);
}));

router.put('/inspections/:id', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    const updated = await inspectionService.update(req.params.id, orgId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Inspection not found' });
    res.json(updated);
}));

router.post('/inspections/:id/complete', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    const done = await inspectionService.complete(req.params.id, orgId, {
        overallCondition: req.body?.overallCondition, summary: req.body?.summary,
    });
    if (!done) return res.status(404).json({ error: 'Inspection not found' });
    res.json(done);
}));

router.delete('/inspections/:id', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    const ok = await inspectionService.remove(req.params.id, orgId);
    if (!ok) return res.status(404).json({ error: 'Inspection not found' });
    res.status(204).send();
}));

// ── Items ──────────────────────────────────────────
router.post('/inspections/:id/items', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    if (!req.body?.area || !req.body?.item) return res.status(400).json({ error: 'area and item are required' });
    const item = await inspectionService.addItem(req.params.id, orgId, req.body);
    if (!item) return res.status(404).json({ error: 'Inspection not found' });
    res.status(201).json(item);
}));

router.put('/inspections/items/:itemId', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    const item = await inspectionService.updateItem(req.params.itemId, orgId, req.body || {});
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
}));

router.delete('/inspections/items/:itemId', asyncHandler(async (req, res) => {
    const orgId = getAuthOrgId(req);
    const ok = await inspectionService.deleteItem(req.params.itemId, orgId);
    if (!ok) return res.status(404).json({ error: 'Item not found' });
    res.status(204).send();
}));

export default router;
