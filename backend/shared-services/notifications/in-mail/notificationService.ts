/**
 * In-Mail Notification Service
 * 
 * Provides a unified notification inbox for all PROPMETRIK users.
 * Aggregates notifications from all services: E-Sign, Property Management, Valuation, CRM, Projects
 */

import { pool, query } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import realtimeEmitter from '../../realtime/realtimeService';

// =============================================================================
// TYPES
// =============================================================================

export type NotificationCategory = 
  | 'esign' 
  | 'property' 
  | 'valuation' 
  | 'crm' 
  | 'project' 
  | 'finance' 
  | 'system' 
  | 'alert';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationAction {
  label: string;
  url: string;
  type: 'primary' | 'secondary';
}

export interface CreateNotificationInput {
  userId: string;
  organizationId?: string;
  title: string;
  body: string;
  summary?: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
  actions?: NotificationAction[];
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface Notification {
  id: string;
  userId: string;
  organizationId?: string;
  title: string;
  body: string;
  summary?: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
  actions: NotificationAction[];
  isRead: boolean;
  readAt?: Date;
  isArchived: boolean;
  archivedAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface NotificationFilters {
  category?: NotificationCategory;
  isRead?: boolean;
  isArchived?: boolean;
  priority?: NotificationPriority;
  fromDate?: Date;
  toDate?: Date;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// =============================================================================
// NOTIFICATION CRUD
// =============================================================================

/**
 * Create a new notification
 */
export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const {
    userId,
    organizationId,
    title,
    body,
    summary,
    category,
    priority = 'normal',
    sourceType,
    sourceId,
    sourceUrl,
    actions = [],
    metadata = {},
    expiresAt,
  } = input;

  const result = await query(
    `INSERT INTO user_notifications (
      user_id, organization_id, title, body, summary, category, priority,
      source_type, source_id, source_url, actions, metadata, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      userId,
      organizationId,
      title,
      body,
      summary,
      category,
      priority,
      sourceType,
      sourceId,
      sourceUrl,
      JSON.stringify(actions),
      JSON.stringify(metadata),
      expiresAt,
    ]
  );

  const notification = mapRowToNotification(result.rows[0]);

  // Publish real-time event via SSE
  try {
    realtimeEmitter.sendToUser(userId, {
      type: 'notification:new',
      payload: notification as unknown as Record<string, unknown>,
      organizationId: organizationId || '',
    });
  } catch (error) {
    logger.warn('Failed to publish SSE notification', { userId, error });
  }

  logger.info('Created notification', { 
    notificationId: notification.id, 
    userId, 
    category, 
    sourceType 
  });

  return notification;
}

/**
 * Create notification from template
 */
export async function createNotificationFromTemplate(
  templateCode: string,
  userId: string,
  variables: Record<string, string>,
  options: Partial<CreateNotificationInput> = {}
): Promise<Notification | null> {
  // Fetch template
  const templateResult = await query(
    `SELECT * FROM notification_templates WHERE code = $1 AND is_active = TRUE`,
    [templateCode]
  );

  if (templateResult.rows.length === 0) {
    logger.warn('Notification template not found', { templateCode });
    return null;
  }

  const template = templateResult.rows[0];

  // Replace variables in template
  const replaceVariables = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
  };

  const title = replaceVariables(template.title_template);
  const body = replaceVariables(template.body_template);
  const summary = template.summary_template ? replaceVariables(template.summary_template) : undefined;

  // Replace variables in action URLs
  const actions = (template.default_actions || []).map((action: NotificationAction) => ({
    ...action,
    url: replaceVariables(action.url),
  }));

  return createNotification({
    userId,
    title,
    body,
    summary,
    category: template.category,
    priority: options.priority || template.default_priority || 'normal',
    sourceType: options.sourceType || templateCode.split('.')[0],
    sourceId: options.sourceId,
    sourceUrl: options.sourceUrl,
    actions: options.actions || actions,
    metadata: options.metadata,
    organizationId: options.organizationId,
    expiresAt: options.expiresAt,
  });
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  filters: NotificationFilters = {},
  pagination: PaginationParams = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const { limit = 50, offset = 0 } = pagination;
  const conditions: string[] = ['user_id = $1', 'deleted_at IS NULL'];
  const params: any[] = [userId];
  let paramIndex = 2;

  if (filters.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(filters.category);
  }

  if (filters.isRead !== undefined) {
    conditions.push(`is_read = $${paramIndex++}`);
    params.push(filters.isRead);
  }

  if (filters.isArchived !== undefined) {
    conditions.push(`is_archived = $${paramIndex++}`);
    params.push(filters.isArchived);
  }

  if (filters.priority) {
    conditions.push(`priority = $${paramIndex++}`);
    params.push(filters.priority);
  }

  if (filters.fromDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.fromDate);
  }

  if (filters.toDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.toDate);
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM user_notifications WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  // Get notifications
  const result = await query(
    `SELECT * FROM user_notifications 
     WHERE ${whereClause}
     ORDER BY 
       CASE priority 
         WHEN 'urgent' THEN 1 
         WHEN 'high' THEN 2 
         WHEN 'normal' THEN 3 
         ELSE 4 
       END,
       created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    notifications: result.rows.map(mapRowToNotification),
    total,
  };
}

/**
 * Get unread count for a user
 */
export async function getUnreadCount(userId: string, category?: NotificationCategory): Promise<number> {
  let sql = `SELECT COUNT(*) as count FROM user_notifications 
             WHERE user_id = $1 AND is_read = FALSE AND deleted_at IS NULL`;
  const params: any[] = [userId];

  if (category) {
    sql += ` AND category = $2`;
    params.push(category);
  }

  const result = await query(sql, params);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Get unread counts by category
 */
export async function getUnreadCountsByCategory(userId: string): Promise<Record<NotificationCategory, number>> {
  const result = await query(
    `SELECT category, COUNT(*) as count 
     FROM user_notifications 
     WHERE user_id = $1 AND is_read = FALSE AND deleted_at IS NULL
     GROUP BY category`,
    [userId]
  );

  const counts: Record<string, number> = {
    esign: 0,
    property: 0,
    valuation: 0,
    crm: 0,
    project: 0,
    finance: 0,
    system: 0,
    alert: 0,
  };

  result.rows.forEach(row => {
    counts[row.category] = parseInt(row.count, 10);
  });

  return counts as Record<NotificationCategory, number>;
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE user_notifications 
     SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [notificationId, userId]
  );

  if (result.rows.length > 0) {
    // Publish unread count update
    const unreadCount = await getUnreadCount(userId);
    realtimeEmitter.sendToUser(userId, {
      type: 'notification:count',
      payload: { unread: unreadCount },
      organizationId: '',
    });
  }

  return result.rows.length > 0;
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string, category?: NotificationCategory): Promise<number> {
  let sql = `UPDATE user_notifications 
             SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
             WHERE user_id = $1 AND is_read = FALSE AND deleted_at IS NULL`;
  const params: any[] = [userId];

  if (category) {
    sql += ` AND category = $2`;
    params.push(category);
  }

  sql += ` RETURNING id`;

  const result = await query(sql, params);

  if (result.rows.length > 0) {
    realtimeEmitter.sendToUser(userId, {
      type: 'notification:count',
      payload: { unread: 0 },
      organizationId: '',
    });
  }

  return result.rows.length;
}

/**
 * Archive notification
 */
export async function archiveNotification(notificationId: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE user_notifications 
     SET is_archived = TRUE, archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [notificationId, userId]
  );

  return result.rows.length > 0;
}

/**
 * Delete notification (soft delete)
 */
export async function deleteNotification(notificationId: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE user_notifications 
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [notificationId, userId]
  );

  return result.rows.length > 0;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function mapRowToNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    title: row.title,
    body: row.body,
    summary: row.summary,
    category: row.category,
    priority: row.priority,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    actions: row.actions || [],
    isRead: row.is_read,
    readAt: row.read_at,
    isArchived: row.is_archived,
    archivedAt: row.archived_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

// =============================================================================
// CONVENIENCE FUNCTIONS FOR SERVICES
// =============================================================================

/**
 * Send e-sign notification
 */
export async function notifyEsignDocumentReady(
  userId: string,
  documentTitle: string,
  senderName: string,
  signingUrl: string,
  documentId?: string
): Promise<Notification | null> {
  return createNotificationFromTemplate('esign.document_ready', userId, {
    document_title: documentTitle,
    sender_name: senderName,
    signing_url: signingUrl,
  }, {
    sourceType: 'esign_envelope',
    sourceId: documentId,
    sourceUrl: signingUrl,
  });
}

/**
 * Send e-sign document completed notification
 */
export async function notifyEsignDocumentCompleted(
  userId: string,
  documentTitle: string,
  downloadUrl: string,
  documentId?: string
): Promise<Notification | null> {
  return createNotificationFromTemplate('esign.document_completed', userId, {
    document_title: documentTitle,
    download_url: downloadUrl,
  }, {
    sourceType: 'esign_envelope',
    sourceId: documentId,
    sourceUrl: downloadUrl,
  });
}

/**
 * Send valuation report ready notification
 */
export async function notifyValuationReportReady(
  userId: string,
  propertyAddress: string,
  reportUrl: string,
  reportId?: string
): Promise<Notification | null> {
  return createNotificationFromTemplate('valuation.report_ready', userId, {
    property_address: propertyAddress,
    report_url: reportUrl,
  }, {
    sourceType: 'valuation_report',
    sourceId: reportId,
    sourceUrl: reportUrl,
  });
}

/**
 * Send payment due notification
 */
export async function notifyPaymentDue(
  userId: string,
  amount: string,
  dueDate: string,
  propertyAddress: string,
  paymentUrl: string,
  leaseId?: string
): Promise<Notification | null> {
  return createNotificationFromTemplate('lease.payment_due', userId, {
    amount,
    due_date: dueDate,
    property_address: propertyAddress,
    payment_url: paymentUrl,
  }, {
    sourceType: 'lease',
    sourceId: leaseId,
    sourceUrl: paymentUrl,
  });
}

/**
 * Send task assigned notification
 */
export async function notifyTaskAssigned(
  userId: string,
  taskName: string,
  projectName: string,
  taskUrl: string,
  taskId?: string
): Promise<Notification | null> {
  return createNotificationFromTemplate('project.task_assigned', userId, {
    task_name: taskName,
    project_name: projectName,
    task_url: taskUrl,
  }, {
    sourceType: 'project_task',
    sourceId: taskId,
    sourceUrl: taskUrl,
  });
}

export default {
  createNotification,
  createNotificationFromTemplate,
  getNotifications,
  getUnreadCount,
  getUnreadCountsByCategory,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  deleteNotification,
  notifyEsignDocumentReady,
  notifyEsignDocumentCompleted,
  notifyValuationReportReady,
  notifyPaymentDue,
  notifyTaskAssigned,
};
