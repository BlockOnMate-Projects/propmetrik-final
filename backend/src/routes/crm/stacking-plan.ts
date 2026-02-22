/**
 * Stacking Plan Routes
 *
 * CRUD for building floors/units + full stacking plan retrieval.
 * Base path: /api/v1/crm/properties/:propertyId/stacking-plan
 *
 * @module routes/crm/stacking-plan
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, asyncHandler } from './helpers';
import { stackingPlanService } from '../../services/crm-deal-management/stackingPlanService';

const router = Router();

/** GET /properties/:propertyId/stacking-plan — Full plan with summary */
router.get('/properties/:propertyId/stacking-plan', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization required' });
    const plan = await stackingPlanService.getStackingPlan(req.params.propertyId, organizationId);
    res.json(plan);
}));

/** POST /properties/:propertyId/stacking-plan/floors — Add/update a floor */
router.post('/properties/:propertyId/stacking-plan/floors', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization required' });
    const { floor_number, floor_name, gross_area_sqm, net_leasable_sqm } = req.body;
    if (floor_number === undefined) return res.status(400).json({ error: 'floor_number is required' });
    const floor = await stackingPlanService.upsertFloor(req.params.propertyId, organizationId, {
        floor_number, floor_name, gross_area_sqm, net_leasable_sqm,
    });
    res.status(201).json(floor);
}));

/** DELETE /properties/:propertyId/stacking-plan/floors/:floorId */
router.delete('/properties/:propertyId/stacking-plan/floors/:floorId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization required' });
    await stackingPlanService.deleteFloor(req.params.floorId, organizationId);
    res.status(204).send();
}));

/** POST /properties/:propertyId/stacking-plan/units — Add/update a unit */
router.post('/properties/:propertyId/stacking-plan/units', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization required' });
    const { floor_id, unit_number } = req.body;
    if (!floor_id || !unit_number) return res.status(400).json({ error: 'floor_id and unit_number are required' });
    const unit = await stackingPlanService.upsertUnit(req.params.propertyId, organizationId, req.body);
    res.status(201).json(unit);
}));

/** DELETE /properties/:propertyId/stacking-plan/units/:unitId */
router.delete('/properties/:propertyId/stacking-plan/units/:unitId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization required' });
    await stackingPlanService.deleteUnit(req.params.unitId, organizationId);
    res.status(204).send();
}));

export default router;
