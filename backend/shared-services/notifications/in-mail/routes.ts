/**
 * In-Mail Notification REST API Routes
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../../src/middleware/auth';
import notificationService, { 
  NotificationCategory, 
  NotificationFilters 
} from './notificationService';
import { logger } from '../../../src/utils/logger';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Serialize a service-layer Notification (camelCase) to the snake_case shape
 * the frontend API contract expects (see frontend/src/lib/notification-api.ts).
 * Without this the client reads `created_at`/`is_read`/`source_url` as undefined,
 * which renders "Invalid Date" and makes rows appear permanently unread / unclickable.
 */
function serializeNotification(n: any) {
  return {
    id: n.id,
    user_id: n.userId,
    organization_id: n.organizationId,
    title: n.title,
    body: n.body,
    summary: n.summary,
    category: n.category,
    priority: n.priority,
    source_type: n.sourceType,
    source_id: n.sourceId,
    source_url: n.sourceUrl,
    actions: n.actions || [],
    is_read: n.isRead,
    read_at: n.readAt,
    is_archived: n.isArchived,
    archived_at: n.archivedAt,
    metadata: n.metadata || {},
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    expires_at: n.expiresAt,
  };
}

/**
 * GET /notifications
 * Get notifications for the current user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filters: NotificationFilters = {
      category: req.query.category as NotificationCategory | undefined,
      isRead: req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined,
      isArchived: req.query.isArchived === 'true' ? true : req.query.isArchived === 'false' ? false : undefined,
      priority: req.query.priority as any,
      fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
      toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
    };

    const pagination = {
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    };

    const result = await notificationService.getNotifications(userId, filters, pagination);

    res.json({
      notifications: result.notifications.map(serializeNotification),
      total: result.total,
      limit: pagination.limit,
      offset: pagination.offset,
    });
  } catch (error) {
    logger.error('Failed to get notifications', { error });
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * GET /notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const category = req.query.category as NotificationCategory | undefined;
    const count = await notificationService.getUnreadCount(userId, category);

    res.json({ unread: count });
  } catch (error) {
    logger.error('Failed to get unread count', { error });
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * GET /notifications/unread-counts-by-category
 * Get unread counts grouped by category
 */
router.get('/unread-counts-by-category', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const counts = await notificationService.getUnreadCountsByCategory(userId);

    res.json({ counts });
  } catch (error) {
    logger.error('Failed to get unread counts by category', { error });
    res.status(500).json({ error: 'Failed to get unread counts' });
  }
});

/**
 * POST /notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const success = await notificationService.markAsRead(id, userId);

    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error });
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * POST /notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/mark-all-read', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const category = req.body.category as NotificationCategory | undefined;
    const count = await notificationService.markAllAsRead(userId, category);

    res.json({ success: true, markedCount: count });
  } catch (error) {
    logger.error('Failed to mark all as read', { error });
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * POST /notifications/:id/archive
 * Archive a notification
 */
router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const success = await notificationService.archiveNotification(id, userId);

    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to archive notification', { error });
    res.status(500).json({ error: 'Failed to archive' });
  }
});

/**
 * DELETE /notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const success = await notificationService.deleteNotification(id, userId);

    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete notification', { error });
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
