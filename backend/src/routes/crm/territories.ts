/**
 * CRM Agent Territory Routes
 *
 * CRUD for PostGIS agent territories + point-in-polygon routing.
 * Authorized by the CRM RBAC dispatcher (mapped to the `crm_agent` resource in index.ts):
 * reads allowed org-scoped, writes require agent-management permission.
 *
 * Base: /api/v1/crm/territories
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { territoryService } from '../../services/crm-deal-management/territoryService';

const router = Router();

// ── List territories ───────────────────────────────
router.get('/territories', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    res.json(await territoryService.list(orgId));
}));

// ── Get one ────────────────────────────────────────
router.get('/territories/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const territory = await territoryService.getById(req.params.id, orgId);
    if (!territory) return res.status(404).json({ error: 'Territory not found' });
    res.json(territory);
}));

// ── Create ─────────────────────────────────────────
router.post('/territories', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });

    const { agentId, name, boundary, isExclusive, allowOverlap } = req.body;
    if (!agentId || !name || !boundary) {
        return res.status(400).json({ error: 'agentId, name, and boundary (GeoJSON Polygon/MultiPolygon) are required' });
    }

    try {
        // Exclusive territories can't overlap another exclusive one unless explicitly allowed.
        if (isExclusive !== false && !allowOverlap) {
            const overlaps = await territoryService.detectOverlaps(orgId, boundary);
            if (overlaps.length > 0) {
                return res.status(409).json({ error: 'Territory overlaps existing exclusive territories', overlaps });
            }
        }
        const { territory, overlaps } = await territoryService.create(orgId, req.body, userId);
        res.status(201).json({ ...territory, overlaps });
    } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Failed to create territory' });
    }
}));

// ── Update ─────────────────────────────────────────
router.put('/territories/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        if (req.body.boundary && req.body.isExclusive !== false && !req.body.allowOverlap) {
            const overlaps = await territoryService.detectOverlaps(orgId, req.body.boundary, req.params.id);
            if (overlaps.length > 0) {
                return res.status(409).json({ error: 'Territory overlaps existing exclusive territories', overlaps });
            }
        }
        const result = await territoryService.update(req.params.id, orgId, req.body);
        if (!result) return res.status(404).json({ error: 'Territory not found' });
        res.json({ ...result.territory, overlaps: result.overlaps });
    } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Failed to update territory' });
    }
}));

// ── Delete (soft) ──────────────────────────────────
router.delete('/territories/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    const ok = await territoryService.remove(req.params.id, orgId);
    if (!ok) return res.status(404).json({ error: 'Territory not found' });
    res.status(204).send();
}));

// ── Resolve owning agent for a point, or auto-assign a contact ─────────────
router.post('/territories/resolve', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });

    const { lng, lat, contactId } = req.body;
    if (contactId) {
        const assigned = await territoryService.resolveAndAssignContact(orgId, contactId);
        return res.json({ assigned });
    }
    if (typeof lng === 'number' && typeof lat === 'number') {
        const owner = await territoryService.findAgentForPoint(orgId, lng, lat);
        return res.json({ owner });
    }
    return res.status(400).json({ error: 'Provide { lng, lat } or { contactId }' });
}));

export default router;
