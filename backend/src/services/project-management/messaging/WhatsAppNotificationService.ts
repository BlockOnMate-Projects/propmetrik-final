/**
 * WhatsApp Notification Service
 * 
 * Phase 3.2: Split whatsappBotService
 * 
 * Handles sending notifications via WhatsApp.
 * Focused on notification dispatch, logging, and bulk operations.
 * 
 * @module services/project-management/messaging/WhatsAppNotificationService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { PMWhatsAppNotification, PMNotificationType } from './types';
import { whatsAppTemplates } from './WhatsAppTemplates';
import { eventBus } from '../events/EventBus';

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BulkNotificationResult {
  total: number;
  successful: number;
  failed: number;
  results: {
    phone: string;
    success: boolean;
    error?: string;
  }[];
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class WhatsAppNotificationServiceImpl extends BaseService {
  constructor() {
    super('WhatsAppNotificationService');
  }

  /**
   * Send a PM notification via WhatsApp.
   */
  async sendNotification(notification: PMWhatsAppNotification): Promise<NotificationResult> {
    try {
      const { message, responseOptions } = whatsAppTemplates.buildMessage(
        notification.notificationType,
        {
          recipientName: notification.recipientName,
          projectName: notification.projectName,
          projectId: notification.projectId,
          ...notification.data,
        }
      );

      // Send via WhatsApp API (would integrate with actual service)
      const result = await this.sendWhatsAppMessage(
        notification.recipientPhone,
        message,
        responseOptions
      );

      // Log the notification
      await this.logNotification({
        recipientPhone: notification.recipientPhone,
        notificationType: notification.notificationType,
        projectId: notification.projectId,
        messageId: result.messageId,
        status: 'sent',
      });

      // Emit event
      eventBus.emit('notification.whatsapp.sent', {
        recipientPhone: notification.recipientPhone,
        notificationType: notification.notificationType,
        projectId: notification.projectId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error: any) {
      this.logger?.error('Failed to send WhatsApp notification:', error);

      // Log failed attempt
      await this.logNotification({
        recipientPhone: notification.recipientPhone,
        notificationType: notification.notificationType,
        projectId: notification.projectId,
        status: 'failed',
        errorMessage: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk notifications (same message to multiple recipients).
   */
  async sendBulkNotification(
    notifications: PMWhatsAppNotification[]
  ): Promise<BulkNotificationResult> {
    const results: BulkNotificationResult['results'] = [];
    let successful = 0;
    let failed = 0;

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (notification) => {
          const result = await this.sendNotification(notification);
          
          results.push({
            phone: notification.recipientPhone,
            success: result.success,
            error: result.error,
          });

          if (result.success) {
            successful++;
          } else {
            failed++;
          }
        })
      );

      // Rate limit delay between batches
      if (i + batchSize < notifications.length) {
        await this.delay(1000);
      }
    }

    return {
      total: notifications.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Send daily log reminders to site managers.
   */
  async sendDailyLogReminders(): Promise<BulkNotificationResult> {
    const result = await this.query(
      `SELECT DISTINCT
         u.id as user_id,
         u.phone,
         u.name as user_name,
         p.id as project_id,
         p.name as project_name
       FROM development_projects p
       JOIN project_team_members ptm ON ptm.project_id = p.id
       JOIN users u ON u.id = ptm.user_id
       WHERE p.status = 'under_construction'
         AND ptm.role IN ('site_manager', 'project_manager')
         AND u.phone IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM pm_daily_logs dl 
           WHERE dl.project_id = p.id 
             AND dl.log_date = CURRENT_DATE
         )`
    );

    if (!result.rows.length) {
      return { total: 0, successful: 0, failed: 0, results: [] };
    }

    const notifications: PMWhatsAppNotification[] = result.rows.map(row => ({
      recipientPhone: row.phone,
      recipientName: row.user_name,
      notificationType: PMNotificationType.DAILY_LOG_REMINDER,
      projectId: row.project_id,
      projectName: row.project_name,
      data: {},
      requiresResponse: true,
    }));

    return this.sendBulkNotification(notifications);
  }

  /**
   * Send overdue RFI reminders.
   */
  async sendOverdueRFIReminders(): Promise<BulkNotificationResult> {
    const result = await this.query(
      `SELECT 
         r.id as rfi_id,
         r.rfi_number,
         r.subject,
         r.due_date,
         u.id as user_id,
         u.phone,
         u.name as user_name,
         p.id as project_id,
         p.name as project_name
       FROM rfis r
       JOIN users u ON u.id = r.assigned_to
       JOIN development_projects p ON p.id = r.project_id
       WHERE r.status IN ('open', 'in_review')
         AND r.due_date <= CURRENT_DATE + INTERVAL '2 days'
         AND u.phone IS NOT NULL`
    );

    if (!result.rows.length) {
      return { total: 0, successful: 0, failed: 0, results: [] };
    }

    const notifications: PMWhatsAppNotification[] = result.rows.map(row => ({
      recipientPhone: row.phone,
      recipientName: row.user_name,
      notificationType: PMNotificationType.RFI_RESPONSE_NEEDED,
      projectId: row.project_id,
      projectName: row.project_name,
      data: {
        rfiNumber: row.rfi_number,
        rfiSubject: row.subject,
        dueDate: new Date(row.due_date).toLocaleDateString('en-GB'),
        daysRemaining: Math.ceil(
          (new Date(row.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
      },
      requiresResponse: true,
    }));

    return this.sendBulkNotification(notifications);
  }

  /**
   * Send delivery notifications for today's scheduled deliveries.
   */
  async sendDeliveryNotifications(): Promise<BulkNotificationResult> {
    const result = await this.query(
      `SELECT 
         d.id as delivery_id,
         d.description as item_description,
         d.scheduled_date,
         d.scheduled_time,
         d.supplier_name,
         u.phone,
         u.name as user_name,
         p.id as project_id,
         p.name as project_name
       FROM material_deliveries d
       JOIN development_projects p ON p.id = d.project_id
       JOIN project_team_members ptm ON ptm.project_id = p.id
       JOIN users u ON u.id = ptm.user_id
       WHERE d.scheduled_date = CURRENT_DATE
         AND d.status = 'scheduled'
         AND ptm.role IN ('site_manager', 'project_manager')
         AND u.phone IS NOT NULL`
    );

    if (!result.rows.length) {
      return { total: 0, successful: 0, failed: 0, results: [] };
    }

    const notifications: PMWhatsAppNotification[] = result.rows.map(row => ({
      recipientPhone: row.phone,
      recipientName: row.user_name,
      notificationType: PMNotificationType.DELIVERY_SCHEDULED,
      projectId: row.project_id,
      projectName: row.project_name,
      data: {
        itemDescription: row.item_description,
        deliveryDate: new Date(row.scheduled_date).toLocaleDateString('en-GB'),
        deliveryTime: row.scheduled_time,
        supplierName: row.supplier_name,
      },
    }));

    return this.sendBulkNotification(notifications);
  }

  /**
   * Send project milestone notification.
   */
  async sendMilestoneNotification(
    projectId: string,
    milestoneName: string,
    progress: number
  ): Promise<BulkNotificationResult> {
    const result = await this.query(
      `SELECT 
         u.phone,
         u.name as user_name,
         p.name as project_name
       FROM development_projects p
       JOIN project_team_members ptm ON ptm.project_id = p.id
       JOIN users u ON u.id = ptm.user_id
       WHERE p.id = $1 AND u.phone IS NOT NULL`,
      [projectId]
    );

    if (!result.rows.length) {
      return { total: 0, successful: 0, failed: 0, results: [] };
    }

    const notifications: PMWhatsAppNotification[] = result.rows.map(row => ({
      recipientPhone: row.phone,
      recipientName: row.user_name,
      notificationType: PMNotificationType.PROJECT_MILESTONE,
      projectId,
      projectName: row.project_name,
      data: {
        milestoneName,
        progress,
      },
    }));

    return this.sendBulkNotification(notifications);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Send message via WhatsApp API.
   * This would integrate with the actual WhatsApp service.
   */
  private async sendWhatsAppMessage(
    phone: string,
    message: string,
    responseOptions?: any[]
  ): Promise<{ messageId: string }> {
    // Would call actual WhatsApp API
    // For now, simulating success
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger?.info('WhatsApp message sent', { phone, messageId });
    
    return { messageId };
  }

  /**
   * Log notification to database.
   */
  private async logNotification(data: {
    recipientPhone: string;
    notificationType: PMNotificationType;
    projectId: string;
    messageId?: string;
    status: 'sent' | 'failed' | 'delivered' | 'read';
    errorMessage?: string;
  }): Promise<void> {
    await this.query(
      `INSERT INTO pm_notification_logs (
         recipient_phone, notification_type, project_id, 
         message_id, status, error_message
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.recipientPhone,
        data.notificationType,
        data.projectId,
        data.messageId,
        data.status,
        data.errorMessage,
      ]
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const whatsAppNotificationService = new WhatsAppNotificationServiceImpl();
