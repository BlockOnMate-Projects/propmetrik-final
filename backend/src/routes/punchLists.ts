/**
 * Punch Lists Routes
 * Extracted from projects.ts — punch list items, handover readiness, and workflow.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import punchListService, { PunchListService } from '../services/project-management/punchListService';
import {
  registerPMParamValidation,
  registerProjectAccessParams,
  getAuthUserId,
  getAuthOrgId,
  requirePMWrite,
} from '../middleware/pmAuth';

const router = Router();

registerPMParamValidation(router);
registerProjectAccessParams(router, ['id', 'unitId', 'itemId']);

const getOrgId = (req: Request): string => getAuthOrgId(req);
const getUserId = (req: Request): string => getAuthUserId(req);

router.get('/:id/punch-items/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN pli.status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN pli.status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN pli.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN pli.status = 'verified' THEN 1 END) as verified_count,
        COUNT(CASE WHEN pli.due_date < NOW() AND pli.status NOT IN ('completed', 'verified', 'deferred') THEN 1 END) as overdue_count
      FROM punch_list_items pli
      WHERE pli.organization_id = $1
        AND pli.project_id = $2
    `,
      [orgId, projectId],
    );

    const row = result.rows[0] || {};

    res.json({
      total: parseInt(row.total) || 0,
      by_status: {
        open: parseInt(row.open_count) || 0,
        in_progress: parseInt(row.in_progress_count) || 0,
        completed: parseInt(row.completed_count) || 0,
        closed: parseInt(row.verified_count) || 0,
        ready_for_inspection: 0,
      },
      overdue: parseInt(row.overdue_count) || 0,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/punch-lists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { unitId, projectId, status, priority, category, contractorId, isOverdue, page, limit, pageSize } = req.query;

    const result = await punchListService.getAll(
      orgId,
      {
        unit_id: unitId as string,
        project_id: projectId as string,
        status: status as any,
        priority: priority as any,
        category: category as any,
        assigned_to: contractorId as string,
        is_overdue: isOverdue === 'true',
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || parseInt(pageSize as string) || 50,
    );

    res.json({
      success: true,
      data: result.data.map((item) => PunchListService.toCamelCase(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/punch-lists/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, unitId } = req.query;

    const summary = await punchListService.getSummary(orgId, projectId as string, unitId as string);

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/units/:unitId/punch-list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await punchListService.getByUnit(req.params.unitId);
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/units/:unitId/handover-ready', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await punchListService.isUnitReadyForHandover(req.params.unitId);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/punch-lists/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await punchListService.getById(req.params.itemId);

    if (!item) {
      return res.status(404).json({ success: false, error: 'Punch list item not found' });
    }

    res.json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

router.post('/punch-lists', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const {
      projectId,
      title,
      description,
      priority,
      category,
      location,
      dueDate,
      unitId,
      assignedTo,
      assignedContractorName,
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const item = await punchListService.create({
      project_id: projectId,
      unit_id: unitId,
      organization_id: orgId,
      title,
      description,
      priority: priority || 'medium',
      category: category || 'other',
      location,
      due_date: dueDate,
      assigned_to: assignedTo,
      assigned_contractor_name: assignedContractorName,
      created_by: userId,
    });

    res.status(201).json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

router.post('/units/:unitId/punch-list', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const item = await punchListService.create({
      ...req.body,
      unit_id: req.params.unitId,
      organization_id: orgId,
      created_by: userId,
    });

    res.status(201).json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

router.post('/units/:unitId/punch-list/bulk', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { items } = req.body;

    const created = await punchListService.createBulk(
      items.map((item: any) => ({
        ...item,
        unit_id: req.params.unitId,
        organization_id: orgId,
        created_by: userId,
      })),
    );

    res.status(201).json({ success: true, data: created.map((i) => PunchListService.toCamelCase(i)) });
  } catch (error) {
    next(error);
  }
});

router.put('/punch-lists/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await punchListService.update(req.params.itemId, req.body);

    if (!item) {
      return res.status(404).json({ success: false, error: 'Punch list item not found' });
    }

    res.json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

router.delete('/punch-lists/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await punchListService.delete(req.params.itemId);

    if (!success) {
      return res.status(404).json({ success: false, error: 'Punch list item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/punch-lists/:itemId/assign', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractorId, dueDate } = req.body;
    const item = await punchListService.assign(
      req.params.itemId,
      contractorId,
      dueDate ? new Date(dueDate) : undefined,
    );

    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/punch-lists/:itemId/start', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await punchListService.startWork(req.params.itemId);

    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/punch-lists/:itemId/complete', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { notes } = req.body;

    const item = await punchListService.complete(req.params.itemId, userId, notes);

    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/punch-lists/:itemId/verify', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const item = await punchListService.verify(req.params.itemId, userId);

    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/punch-lists/:itemId/reject', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const item = await punchListService.rejectVerification(req.params.itemId, reason);

    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/punch-lists/:itemId/defer', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const item = await punchListService.defer(req.params.itemId, reason);

    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/units/:unitId/punch-list/complete-all', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const count = await punchListService.completeAllForUnit(req.params.unitId, userId);
    res.json({ message: `${count} items completed` });
  } catch (error) {
    next(error);
  }
});

export default router;
