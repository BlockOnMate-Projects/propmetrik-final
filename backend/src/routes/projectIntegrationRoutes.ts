/**
 * Project Integration Routes
 * Deal linking, buyer assignment, handover, export, and portfolio integration.
 */

import { Router, Request, Response, NextFunction } from 'express';
import projectIntegrationService from '../services/project-management/projectIntegrationService';
import {
  registerPMParamValidation,
  registerProjectAccessParams,
  getAuthUserId,
  requirePMWrite,
} from '../middleware/pmAuth';

const router = Router();

registerPMParamValidation(router);
registerProjectAccessParams(router, ['projectId', 'unitId', 'linkId']);

const getUserId = (req: Request): string => getAuthUserId(req);

router.post('/units/:unitId/link-deal', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { dealId, linkType } = req.body;

    const link = await projectIntegrationService.linkUnitToDeal(
      req.params.unitId,
      dealId,
      linkType,
      userId,
    );

    res.status(201).json(link);
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId/deals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deals = await projectIntegrationService.getProjectDeals(req.params.projectId);
    res.json(deals);
  } catch (error) {
    next(error);
  }
});

router.delete('/deal-links/:linkId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await projectIntegrationService.unlinkDeal(req.params.linkId);

    if (!success) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId/buyers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyers = await projectIntegrationService.getProjectBuyers(req.params.projectId);
    res.json(buyers);
  } catch (error) {
    next(error);
  }
});

router.post('/units/:unitId/assign-buyer', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contactId, salePrice, status } = req.body;

    await projectIntegrationService.assignBuyerToUnit(req.params.unitId, contactId, salePrice, status);

    res.json({ message: 'Buyer assigned successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/units/:unitId/handover', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { handoverDate, notes } = req.body;

    await projectIntegrationService.recordHandover(
      req.params.unitId,
      handoverDate ? new Date(handoverDate) : undefined,
      notes,
    );

    res.json({ message: 'Handover recorded successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await projectIntegrationService.exportProject(req.params.projectId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId/report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await projectIntegrationService.getProjectReport(req.params.projectId);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.post('/:projectId/add-to-portfolio', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { portfolioId, includeUnits, asStatus } = req.body;

    const count = await projectIntegrationService.addProjectToPortfolio({
      project_id: req.params.projectId,
      portfolio_id: portfolioId,
      include_units: includeUnits !== false,
      as_status: asStatus || 'active',
      created_by: userId,
    });

    res.json({ message: `${count} properties added to portfolio` });
  } catch (error) {
    next(error);
  }
});

export default router;
