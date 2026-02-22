/**
 * CRM Task Routes
 * 
 * Handles all task-related operations including CRUD,
 * overdue task queries, and task completion.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { taskService } from '../../services/crm-deal-management';
import { TaskPriority, TaskStatus } from '../../services/crm-deal-management/types';
import { validate } from '../../middleware/validation';
import { createTaskBody } from '../../middleware/schemas/crm.schemas';

const router = Router();

// ──────────────────────────────────────────────
// Task CRUD & Listing
// ──────────────────────────────────────────────

router.get('/tasks', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        status: req.query.status as TaskStatus | undefined,
        priority: req.query.priority as TaskPriority | undefined,
        assigned_to: req.query.assignedTo as string | undefined,
        deal_id: req.query.dealId as string | undefined,
        contact_id: req.query.contactId as string | undefined,
        property_id: req.query.propertyId as string | undefined,
        due_before: req.query.dueBefore ? new Date(req.query.dueBefore as string) : undefined,
        due_after: req.query.dueAfter ? new Date(req.query.dueAfter as string) : undefined,
        search: req.query.search as string | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'due_date',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'asc'
    };

    const result = await taskService.listTasks(organizationId, filters);
    res.json(result);
}));

router.get('/tasks/overdue', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = req.query.userId as string | undefined;
    const result = await taskService.getOverdueTasks(organizationId, userId);
    res.json(result);
}));

router.post('/tasks', validate(createTaskBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const task = await taskService.createTask(organizationId, req.body, userId);
    res.status(201).json(task);
}));

router.get('/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const task = await taskService.getTaskById(req.params.id, organizationId);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
}));

router.put('/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const task = await taskService.updateTask(req.params.id, organizationId, req.body, userId);
    res.json(task);
}));

router.delete('/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await taskService.deleteTask(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Task not found' });
        }
        throw error;
    }
}));

router.post('/tasks/:id/complete', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const task = await taskService.completeTask(req.params.id, organizationId, userId);
    res.json(task);
}));

// PUT alias for frontend compatibility
router.put('/tasks/:id/complete', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const task = await taskService.completeTask(req.params.id, organizationId, userId);
    res.json(task);
}));

export default router;
