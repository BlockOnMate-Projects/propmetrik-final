/**
 * Daily Logs Routes
 * Extracted from projects.ts — project daily site logs, photos, activities, approvals.
 */

import { Router, Request, Response, NextFunction } from 'express';
import dailyLogService from '../services/project-management/dailyLogService';
import {
  registerPMParamValidation,
  registerProjectAccessParams,
  getAuthUserId,
  getAuthOrgId,
  requirePMWrite,
} from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { createDailyLogSchema } from '../middleware/pmProjectValidation';

const router = Router();

registerPMParamValidation(router);
registerProjectAccessParams(router, ['projectId']);

const getOrgId = (req: Request): string => getAuthOrgId(req);
const getUserId = (req: Request): string => getAuthUserId(req);

router.get('/:projectId/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, createdBy, isApproved, weather, page, limit } = req.query;

    const result = await dailyLogService.getAll(
      req.params.projectId,
      {
        start_date: startDate ? new Date(startDate as string) : undefined,
        end_date: endDate ? new Date(endDate as string) : undefined,
        created_by: createdBy as string,
        is_approved: isApproved === 'true',
        weather_condition: weather as any,
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || 20,
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId/logs/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    const summary = await dailyLogService.getSummary(
      req.params.projectId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
    );

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId/logs/date/:date', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.getByDate(req.params.projectId, new Date(req.params.date));

    if (!log) {
      return res.status(200).json({ data: null, message: 'No daily log found for this date' });
    }

    res.json(log);
  } catch (error) {
    next(error);
  }
});

router.get('/logs/:logId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.getById(req.params.logId);

    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }

    res.json(log);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:projectId/logs',
  requirePMWrite,
  validate(createDailyLogSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const userId = getUserId(req);

      const log = await dailyLogService.create({
        ...req.body,
        project_id: req.params.projectId,
        organization_id: orgId,
        created_by: userId,
      });

      res.status(201).json(log);
    } catch (error) {
      next(error);
    }
  },
);

router.put('/logs/:logId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.update(req.params.logId, req.body);

    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }

    res.json(log);
  } catch (error) {
    next(error);
  }
});

router.delete('/logs/:logId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await dailyLogService.delete(req.params.logId);

    if (!success) {
      return res.status(404).json({ error: 'Daily log not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/logs/:logId/photos', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { photoUrl, caption } = req.body;

    const log = await dailyLogService.addPhoto(req.params.logId, photoUrl, caption, userId);

    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }

    res.json(log);
  } catch (error) {
    next(error);
  }
});

router.delete(
  '/logs/:logId/photos/:photoId',
  requirePMWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const success = await dailyLogService.removePhoto(req.params.logId, req.params.photoId);

      if (!success) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

router.post('/logs/:logId/activities', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.addActivity(req.params.logId, req.body);

    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }

    res.json(log);
  } catch (error) {
    next(error);
  }
});

router.post('/logs/:logId/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const log = await dailyLogService.approve(req.params.logId, userId);

    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }

    res.json(log);
  } catch (error) {
    next(error);
  }
});

router.post('/logs/:logId/revoke', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.revokeApproval(req.params.logId);

    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }

    res.json(log);
  } catch (error) {
    next(error);
  }
});

export default router;
