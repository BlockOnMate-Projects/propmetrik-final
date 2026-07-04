/**
 * CRM Deal Inspection Routes
 *
 * The CRM/sales-side surface over the SHARED inspection engine (property-management
 * inspectionService + property_inspections). A deal can own buyer due-diligence
 * inspections without needing PM service access. Same table/service as PM; different
 * doorway + auth (CRM RBAC dispatcher, mapped to crm_deal in index.ts).
 *
 * Base: /api/v1/crm
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { inspectionService } from '../../services/property-management/inspections/inspectionService';
import db from '../../database';

const router = Router();

// List a deal's inspections.
router.get('/deals/:dealId/inspections', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    res.json(await inspectionService.list(orgId, { dealId: req.params.dealId }));
}));

// Create an inspection linked to a deal (auto-fills property + primary contact from the deal).
router.post('/deals/:dealId/inspections', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });

    const deal = await db.query(
        `SELECT property_ids, primary_contact_id FROM deals WHERE id = $1 AND organization_id = $2`,
        [req.params.dealId, orgId]
    );
    if (!deal.rows[0]) return res.status(404).json({ error: 'Deal not found' });
    const propertyId = req.body.propertyId
        || (Array.isArray(deal.rows[0].property_ids) ? deal.rows[0].property_ids[0] : null);

    const created = await inspectionService.create(orgId, {
        dealId: req.params.dealId,
        contactId: deal.rows[0].primary_contact_id || null,
        propertyId,
        inspectionType: req.body.inspectionType || 'due_diligence',
        scheduledFor: req.body.scheduledFor,
        summary: req.body.summary,
    }, userId);
    res.status(201).json(created);
}));

// ── Shared lifecycle (CRM-accessible; thin handlers over the shared service) ──
router.get('/inspections/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const insp = await inspectionService.getById(req.params.id, orgId);
    if (!insp) return res.status(404).json({ error: 'Inspection not found' });
    res.json(insp);
}));

router.post('/inspections/:id/items', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.body?.area || !req.body?.item) return res.status(400).json({ error: 'area and item are required' });
    const item = await inspectionService.addItem(req.params.id, orgId, req.body);
    if (!item) return res.status(404).json({ error: 'Inspection not found' });
    res.status(201).json(item);
}));

router.delete('/inspections/items/:itemId', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const ok = await inspectionService.deleteItem(req.params.itemId, orgId);
    if (!ok) return res.status(404).json({ error: 'Item not found' });
    res.status(204).send();
}));

router.post('/inspections/:id/complete', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const done = await inspectionService.complete(req.params.id, orgId, {
        overallCondition: req.body?.overallCondition, summary: req.body?.summary,
    });
    if (!done) return res.status(404).json({ error: 'Inspection not found' });
    res.json(done);
}));

router.delete('/inspections/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const ok = await inspectionService.remove(req.params.id, orgId);
    if (!ok) return res.status(404).json({ error: 'Inspection not found' });
    res.status(204).send();
}));

export default router;
