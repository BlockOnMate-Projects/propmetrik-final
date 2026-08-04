/**
 * Payment Plans Routes (Ghana-specific)
 * Extracted from projects.ts — unit payment plans, schedules, and collections.
 */

import { Router, Request, Response, NextFunction } from 'express';
import paymentPlanService from '../services/project-management/paymentPlanService';
import {
  registerPMParamValidation,
  registerProjectAccessParams,
  getAuthUserId,
  getAuthOrgId,
  requirePMWrite,
} from '../middleware/pmAuth';

const router = Router();

registerPMParamValidation(router);
registerProjectAccessParams(router, ['unitId', 'planId']);

const getOrgId = (req: Request): string => getAuthOrgId(req);
const getUserId = (req: Request): string => getAuthUserId(req);

router.get('/payment-plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { isActive, isDefaulted, buyerId, projectId, page, limit } = req.query;

    const result = await paymentPlanService.getAll(
      orgId,
      {
        is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        is_defaulted: isDefaulted === 'true',
        buyer_contact_id: buyerId as string,
        project_id: projectId as string,
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || 20,
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/payment-plans/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const summary = await paymentPlanService.getSummary(orgId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/payment-plans/:planId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await paymentPlanService.getById(req.params.planId);

    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found' });
    }

    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.get('/units/:unitId/payment-plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await paymentPlanService.getByUnit(req.params.unitId);

    if (!plan) {
      return res.status(404).json({ error: 'No active payment plan for this unit' });
    }

    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.post('/units/:unitId/payment-plan', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const plan = await paymentPlanService.create({
      ...req.body,
      unit_id: req.params.unitId,
      organization_id: orgId,
      created_by: userId,
    });

    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

router.get('/payment-plans/:planId/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await paymentPlanService.getSchedule(req.params.planId);
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

router.post('/payment-plans/:planId/payments', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const plan = await paymentPlanService.recordPayment(req.params.planId, {
      ...req.body,
      recorded_by: userId,
    });

    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found or inactive' });
    }

    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.get('/payment-plans/:planId/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = await paymentPlanService.getPayments(req.params.planId);
    res.json(payments);
  } catch (error) {
    next(error);
  }
});

router.post('/payment-plans/:planId/default', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const plan = await paymentPlanService.markDefaulted(req.params.planId, reason);

    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found' });
    }

    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.post('/payment-plans/:planId/cancel', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const success = await paymentPlanService.cancel(req.params.planId, reason);

    if (!success) {
      return res.status(404).json({ error: 'Payment plan not found' });
    }

    res.json({ message: 'Payment plan cancelled' });
  } catch (error) {
    next(error);
  }
});

export default router;
