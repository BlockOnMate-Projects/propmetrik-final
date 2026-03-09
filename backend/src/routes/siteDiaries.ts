/**
 * Site Diaries Routes
 * Daily site logs, inspections, labor tracking
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { SiteDiaryService } from '../services/project-management/siteDiaryService';
import { registerPMParamValidation, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { createSiteDiarySchema, updateSiteDiarySchema } from '../middleware/pmProjectValidation';

const router = Router();
const service = new SiteDiaryService(pool);

// Register UUID parameter validation
registerPMParamValidation(router);

// Get all site diaries
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      organizationId: req.query.organizationId as string,
      projectId: req.query.projectId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      createdBy: req.query.createdBy as string,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined
    };

    const result = await service.getSiteDiaries(filters);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get single site diary
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const diary = await service.getSiteDiaryById(req.params.id);
    if (!diary) {
      return res.status(404).json({ success: false, error: 'Site diary not found' });
    }
    res.json({ success: true, data: diary });
  } catch (error) {
    next(error);
  }
});

// Create site diary
router.post('/', requirePMWrite, validate(createSiteDiarySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submittedBy = req.body.submittedBy || (req as any).user?.id || (req as any).user?.sub;
    const diary = await service.createSiteDiary({
      ...req.body,
      submittedBy
    });
    res.status(201).json({ success: true, data: diary });
  } catch (error) {
    next(error);
  }
});

// Update site diary
router.put('/:id', requirePMWrite, validate(updateSiteDiarySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const diary = await service.updateSiteDiary(req.params.id, req.body);
    if (!diary) {
      return res.status(404).json({ success: false, error: 'Site diary not found' });
    }
    res.json({ success: true, data: diary });
  } catch (error) {
    next(error);
  }
});

// Delete site diary
router.delete('/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await service.deleteSiteDiary(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Site diary not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get project stats
router.get('/stats/project/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await service.getProjectStats(req.params.projectId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// Get all projects stats
router.get('/stats/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.query.organizationId as string;
    const stats = await service.getAllProjectsStats(organizationId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

export default router;
