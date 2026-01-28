/**
 * WhatsApp PM Bot Routes
 * Phase 3A Week 3: WhatsApp Bot Webhook & API Endpoints
 * 
 * Handles:
 * - Webhook verification (GET)
 * - Webhook payload processing (POST)
 * - Manual notification triggers
 * - Bot status and testing
 * 
 * @module routes/whatsapp
 */

import express, { Request, Response } from 'express';
import { whatsappPMBotService, PMNotificationType } from '../services/project-management/whatsappBotService';
import { logger } from '../utils/logger';
import { config } from '../config';

const router = express.Router();

// ============================================================================
// Webhook Endpoints (Public - for WhatsApp)
// ============================================================================

/**
 * GET /webhook
 * WhatsApp webhook verification
 * Meta sends a GET request to verify the webhook URL
 */
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = config.whatsapp?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'propmetrik-pm-bot';

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed', { mode, token });
    res.sendStatus(403);
  }
});

/**
 * POST /webhook
 * WhatsApp webhook payload handler
 * Receives messages, status updates, and other events from WhatsApp
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // Always respond 200 quickly to avoid webhook retries
    res.sendStatus(200);

    // Process asynchronously
    if (payload.object === 'whatsapp_business_account') {
      await whatsappPMBotService.processWebhook(payload);
    } else {
      logger.warn('Unknown webhook object type', { object: payload.object });
    }
  } catch (error) {
    logger.error('Error processing WhatsApp webhook', { error });
    // Still return 200 to prevent retries
    if (!res.headersSent) {
      res.sendStatus(200);
    }
  }
});

// ============================================================================
// Notification Endpoints (Protected - Authenticated)
// ============================================================================

/**
 * POST /send
 * Send a notification to a specific phone number
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const {
      recipientPhone,
      recipientName,
      notificationType,
      projectId,
      projectName,
      data
    } = req.body;

    // Validate required fields
    if (!recipientPhone || !notificationType || !projectId || !projectName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipientPhone, notificationType, projectId, projectName'
      });
    }

    // Validate notification type
    if (!Object.values(PMNotificationType).includes(notificationType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification type',
        validTypes: Object.values(PMNotificationType)
      });
    }

    const success = await whatsappPMBotService.sendNotification({
      recipientPhone,
      recipientName: recipientName || 'Team Member',
      notificationType,
      projectId,
      projectName,
      data: data || {}
    });

    res.json({
      success,
      message: success ? 'Notification sent' : 'Failed to send notification'
    });
  } catch (error: any) {
    logger.error('Failed to send WhatsApp notification', { error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /send-bulk
 * Send notifications to multiple recipients
 */
router.post('/send-bulk', async (req: Request, res: Response) => {
  try {
    const {
      recipients,
      notificationType,
      projectId,
      projectName,
      data
    } = req.body;

    // Validate
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'recipients must be a non-empty array'
      });
    }

    if (!notificationType || !projectId || !projectName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: notificationType, projectId, projectName'
      });
    }

    const result = await whatsappPMBotService.sendBulkNotification(
      recipients,
      notificationType,
      projectId,
      projectName,
      data || {}
    );

    res.json({
      success: true,
      ...result,
      total: recipients.length
    });
  } catch (error: any) {
    logger.error('Failed to send bulk WhatsApp notifications', { error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Project-Specific Notification Triggers
// ============================================================================

/**
 * POST /notify/rfi
 * Send RFI-related notifications
 */
router.post('/notify/rfi', async (req: Request, res: Response) => {
  try {
    const { rfiId, notificationType, additionalRecipients } = req.body;

    if (!rfiId || !notificationType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: rfiId, notificationType'
      });
    }

    // Get RFI details and assigned user
    const { getPool } = await import('../database');
    const db = getPool();
    
    const rfiResult = await db.query(`
      SELECT 
        r.*,
        p.name as project_name,
        assigned.phone as assigned_phone,
        assigned.full_name as assigned_name,
        creator.phone as creator_phone,
        creator.full_name as creator_name
      FROM rfis r
      JOIN projects p ON r.project_id = p.id
      LEFT JOIN users assigned ON r.assigned_to = assigned.id
      LEFT JOIN users creator ON r.created_by = creator.id
      WHERE r.id = $1
    `, [rfiId]);

    if (rfiResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'RFI not found' });
    }

    const rfi = rfiResult.rows[0];
    const recipients: Array<{ phone: string; name: string }> = [];

    // Determine recipient based on notification type
    if (notificationType === PMNotificationType.RFI_ASSIGNED && rfi.assigned_phone) {
      recipients.push({ phone: rfi.assigned_phone, name: rfi.assigned_name });
    } else if (notificationType === PMNotificationType.RFI_ANSWERED && rfi.creator_phone) {
      recipients.push({ phone: rfi.creator_phone, name: rfi.creator_name });
    }

    // Add additional recipients if provided
    if (additionalRecipients) {
      recipients.push(...additionalRecipients.filter((r: any) => r.phone));
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const success = await whatsappPMBotService.sendNotification({
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        notificationType,
        projectId: rfi.project_id,
        projectName: rfi.project_name,
        data: {
          rfiNumber: rfi.rfi_number,
          subject: rfi.subject,
          priority: rfi.priority,
          dueDate: rfi.due_date,
          question: rfi.question
        },
        requiresResponse: notificationType === PMNotificationType.RFI_ASSIGNED
      });

      if (success) sent++;
      else failed++;
    }

    res.json({ success: true, sent, failed });
  } catch (error: any) {
    logger.error('Failed to send RFI notification', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /notify/submittal
 * Send submittal-related notifications
 */
router.post('/notify/submittal', async (req: Request, res: Response) => {
  try {
    const { submittalId, notificationType, additionalRecipients } = req.body;

    if (!submittalId || !notificationType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: submittalId, notificationType'
      });
    }

    const { getPool } = await import('../database');
    const db = getPool();
    
    const submittalResult = await db.query(`
      SELECT 
        s.*,
        p.name as project_name,
        reviewer.phone as reviewer_phone,
        reviewer.full_name as reviewer_name,
        submitter.phone as submitter_phone,
        submitter.full_name as submitter_name
      FROM submittals s
      JOIN projects p ON s.project_id = p.id
      LEFT JOIN users reviewer ON s.current_reviewer_id = reviewer.id
      LEFT JOIN users submitter ON s.submitted_by = submitter.id
      WHERE s.id = $1
    `, [submittalId]);

    if (submittalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Submittal not found' });
    }

    const submittal = submittalResult.rows[0];
    const recipients: Array<{ phone: string; name: string }> = [];

    // Determine recipient based on notification type
    if (notificationType === PMNotificationType.SUBMITTAL_ASSIGNED && submittal.reviewer_phone) {
      recipients.push({ phone: submittal.reviewer_phone, name: submittal.reviewer_name });
    } else if (
      [PMNotificationType.SUBMITTAL_APPROVED, PMNotificationType.SUBMITTAL_REJECTED, PMNotificationType.SUBMITTAL_REVISION_NEEDED].includes(notificationType) 
      && submittal.submitter_phone
    ) {
      recipients.push({ phone: submittal.submitter_phone, name: submittal.submitter_name });
    }

    if (additionalRecipients) {
      recipients.push(...additionalRecipients.filter((r: any) => r.phone));
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const success = await whatsappPMBotService.sendNotification({
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        notificationType,
        projectId: submittal.project_id,
        projectName: submittal.project_name,
        data: {
          submittalNumber: submittal.submittal_number,
          title: submittal.title,
          submittalType: submittal.submittal_type,
          dueDate: submittal.required_date,
          submittedBy: submittal.submitter_name
        },
        requiresResponse: notificationType === PMNotificationType.SUBMITTAL_ASSIGNED
      });

      if (success) sent++;
      else failed++;
    }

    res.json({ success: true, sent, failed });
  } catch (error: any) {
    logger.error('Failed to send submittal notification', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /notify/change-order
 * Send change order notifications
 */
router.post('/notify/change-order', async (req: Request, res: Response) => {
  try {
    const { changeOrderId, notificationType, additionalRecipients } = req.body;

    if (!changeOrderId || !notificationType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: changeOrderId, notificationType'
      });
    }

    const { getPool } = await import('../database');
    const db = getPool();
    
    const coResult = await db.query(`
      SELECT 
        co.*,
        p.name as project_name,
        p.currency,
        requester.full_name as requested_by_name,
        requester.phone as requester_phone
      FROM change_orders co
      JOIN projects p ON co.project_id = p.id
      LEFT JOIN users requester ON co.requested_by = requester.id
      WHERE co.id = $1
    `, [changeOrderId]);

    if (coResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Change order not found' });
    }

    const co = coResult.rows[0];

    // Get project managers
    const pmResult = await db.query(`
      SELECT u.phone, u.full_name
      FROM project_team_members ptm
      JOIN users u ON ptm.user_id = u.id
      WHERE ptm.project_id = $1 
        AND ptm.role IN ('project_manager', 'owner')
        AND u.phone IS NOT NULL
    `, [co.project_id]);

    const recipients = pmResult.rows;
    if (additionalRecipients) {
      recipients.push(...additionalRecipients.filter((r: any) => r.phone));
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const success = await whatsappPMBotService.sendNotification({
        recipientPhone: recipient.phone,
        recipientName: recipient.full_name,
        notificationType,
        projectId: co.project_id,
        projectName: co.project_name,
        data: {
          coNumber: co.co_number,
          description: co.description,
          amount: co.cost_impact,
          currency: co.currency,
          scheduleImpact: co.schedule_impact_days ? `${co.schedule_impact_days} days` : 'None',
          requestedBy: co.requested_by_name
        }
      });

      if (success) sent++;
      else failed++;
    }

    res.json({ success: true, sent, failed });
  } catch (error: any) {
    logger.error('Failed to send change order notification', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /notify/delivery
 * Send delivery-related notifications
 */
router.post('/notify/delivery', async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      projectName,
      deliveryId,
      notificationType,
      deliveryDate,
      deliveryTime,
      vendor,
      items,
      recipients
    } = req.body;

    if (!projectId || !notificationType || !recipients || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (!recipient.phone) continue;

      const success = await whatsappPMBotService.sendNotification({
        recipientPhone: recipient.phone,
        recipientName: recipient.name || 'Team Member',
        notificationType,
        projectId,
        projectName: projectName || 'Project',
        data: {
          deliveryId,
          deliveryDate,
          deliveryTime,
          vendor,
          items
        },
        requiresResponse: notificationType === PMNotificationType.DELIVERY_ARRIVED
      });

      if (success) sent++;
      else failed++;
    }

    res.json({ success: true, sent, failed });
  } catch (error: any) {
    logger.error('Failed to send delivery notification', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Scheduled Task Triggers (for cron jobs)
// ============================================================================

/**
 * POST /triggers/daily-log-reminders
 * Trigger daily log reminders (called by cron at 4 PM)
 */
router.post('/triggers/daily-log-reminders', async (req: Request, res: Response) => {
  try {
    // Verify cron secret if configured
    const cronSecret = config.cronSecret || process.env.CRON_SECRET;
    if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await whatsappPMBotService.sendDailyLogReminders();

    res.json({ success: true, message: 'Daily log reminders sent' });
  } catch (error: any) {
    logger.error('Failed to send daily log reminders', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /triggers/overdue-rfi-reminders
 * Trigger overdue RFI reminders (called by cron daily)
 */
router.post('/triggers/overdue-rfi-reminders', async (req: Request, res: Response) => {
  try {
    const cronSecret = config.cronSecret || process.env.CRON_SECRET;
    if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await whatsappPMBotService.sendOverdueRFIReminders();

    res.json({ success: true, message: 'Overdue RFI reminders sent' });
  } catch (error: any) {
    logger.error('Failed to send overdue RFI reminders', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /triggers/delivery-notifications
 * Trigger delivery notifications (called by cron)
 */
router.post('/triggers/delivery-notifications', async (req: Request, res: Response) => {
  try {
    const cronSecret = config.cronSecret || process.env.CRON_SECRET;
    if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await whatsappPMBotService.sendDeliveryNotifications();

    res.json({ success: true, message: 'Delivery notifications sent' });
  } catch (error: any) {
    logger.error('Failed to send delivery notifications', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Utility Endpoints
// ============================================================================

/**
 * GET /status
 * Get bot status and configuration (for debugging)
 */
router.get('/status', (req: Request, res: Response) => {
  res.json({
    status: 'active',
    version: '1.0.0',
    features: {
      projectNotifications: true,
      rfiWorkflow: true,
      submittalWorkflow: true,
      dailyLogReminders: true,
      deliveryConfirmation: true,
      interactiveCommands: true
    },
    notificationTypes: Object.values(PMNotificationType),
    webhookConfigured: !!(config.whatsapp?.apiToken && config.whatsapp?.phoneNumberId)
  });
});

/**
 * GET /notification-types
 * Get all available notification types
 */
router.get('/notification-types', (req: Request, res: Response) => {
  const types = Object.values(PMNotificationType).map(type => ({
    type,
    category: type.split('_')[0],
    description: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));

  res.json({
    success: true,
    count: types.length,
    types
  });
});

/**
 * POST /test
 * Send a test message (development only)
 */
router.post('/test', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoint not available in production'
    });
  }

  try {
    const { phone, message } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number required'
      });
    }

    const { whatsappService } = await import('../../shared-services/notifications/whatsapp/whatsapp.service');
    const success = await whatsappService.sendMessage(
      phone,
      message || '🧪 Test message from PropMetrik PM Bot'
    );

    res.json({ success, message: success ? 'Test message sent' : 'Failed to send' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Tenant Notification Endpoints (Property Management)
// ============================================================================

/**
 * POST /tenant/rent-reminder
 * Send rent reminder to a specific tenant
 */
router.post('/tenant/rent-reminder', async (req: Request, res: Response) => {
  try {
    const { tenantId, rentAmount, currency, dueDate, paymentLink } = req.body;

    if (!tenantId || !rentAmount || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, rentAmount, dueDate'
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const tenant = await tenantWhatsAppService.getTenantContact(tenantId);

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    if (!tenant.phoneNumber) {
      return res.status(400).json({ success: false, error: 'Tenant has no phone number' });
    }

    const result = await tenantWhatsAppService.sendRentReminder({
      tenant,
      rentAmount,
      currency: currency || 'GHS',
      dueDate: new Date(dueDate),
      paymentLink
    });

    res.json({
      success: !!result,
      messageId: result?.messages?.[0]?.id,
      message: result ? 'Rent reminder sent' : 'WhatsApp not configured'
    });
  } catch (error: any) {
    logger.error('Failed to send tenant rent reminder', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /tenant/overdue-notice
 * Send overdue rent notice
 */
router.post('/tenant/overdue-notice', async (req: Request, res: Response) => {
  try {
    const { tenantId, rentAmount, currency, dueDate, daysPastDue, paymentLink } = req.body;

    if (!tenantId || !rentAmount || !dueDate || !daysPastDue) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, rentAmount, dueDate, daysPastDue'
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const tenant = await tenantWhatsAppService.getTenantContact(tenantId);

    if (!tenant || !tenant.phoneNumber) {
      return res.status(404).json({ success: false, error: 'Tenant not found or no phone number' });
    }

    const result = await tenantWhatsAppService.sendOverdueNotice({
      tenant,
      rentAmount,
      currency: currency || 'GHS',
      dueDate: new Date(dueDate),
      daysPastDue,
      paymentLink
    });

    res.json({
      success: !!result,
      messageId: result?.messages?.[0]?.id
    });
  } catch (error: any) {
    logger.error('Failed to send overdue notice', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /tenant/payment-confirmation
 * Send payment confirmation
 */
router.post('/tenant/payment-confirmation', async (req: Request, res: Response) => {
  try {
    const { tenantId, amount, currency, paymentDate, receiptNumber, paymentMethod, balance } = req.body;

    if (!tenantId || !amount || !receiptNumber || !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, amount, receiptNumber, paymentMethod'
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const tenant = await tenantWhatsAppService.getTenantContact(tenantId);

    if (!tenant || !tenant.phoneNumber) {
      return res.status(404).json({ success: false, error: 'Tenant not found or no phone number' });
    }

    const result = await tenantWhatsAppService.sendPaymentConfirmation({
      tenant,
      amount,
      currency: currency || 'GHS',
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      receiptNumber,
      paymentMethod,
      balance
    });

    res.json({
      success: !!result,
      messageId: result?.messages?.[0]?.id
    });
  } catch (error: any) {
    logger.error('Failed to send payment confirmation', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /tenant/maintenance-update
 * Send maintenance request status update
 */
router.post('/tenant/maintenance-update', async (req: Request, res: Response) => {
  try {
    const { tenantId, requestId, issueType, status, scheduledDate, vendorName, completionNotes } = req.body;

    if (!tenantId || !requestId || !issueType || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, requestId, issueType, status'
      });
    }

    const validStatuses = ['received', 'assigned', 'scheduled', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const tenant = await tenantWhatsAppService.getTenantContact(tenantId);

    if (!tenant || !tenant.phoneNumber) {
      return res.status(404).json({ success: false, error: 'Tenant not found or no phone number' });
    }

    let result;
    const data = {
      tenant,
      requestId,
      issueType,
      status,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      vendorName,
      completionNotes
    };

    switch (status) {
      case 'received':
        result = await tenantWhatsAppService.sendMaintenanceAcknowledgment(data);
        break;
      case 'scheduled':
        result = await tenantWhatsAppService.sendMaintenanceScheduled(data);
        break;
      case 'in_progress':
        result = await tenantWhatsAppService.sendMaintenanceInProgress(data);
        break;
      case 'completed':
        result = await tenantWhatsAppService.sendMaintenanceCompleted(data);
        break;
      default:
        // For 'assigned', we don't send a notification yet
        result = null;
    }

    res.json({
      success: !!result,
      messageId: result?.messages?.[0]?.id
    });
  } catch (error: any) {
    logger.error('Failed to send maintenance update', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /tenant/lease-renewal
 * Send lease renewal reminder
 */
router.post('/tenant/lease-renewal', async (req: Request, res: Response) => {
  try {
    const { tenantId, leaseEndDate, daysRemaining, renewalOffer } = req.body;

    if (!tenantId || !leaseEndDate || !daysRemaining) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, leaseEndDate, daysRemaining'
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const tenant = await tenantWhatsAppService.getTenantContact(tenantId);

    if (!tenant || !tenant.phoneNumber) {
      return res.status(404).json({ success: false, error: 'Tenant not found or no phone number' });
    }

    const result = await tenantWhatsAppService.sendLeaseRenewalReminder({
      tenant,
      leaseEndDate: new Date(leaseEndDate),
      daysRemaining,
      renewalOffer
    });

    res.json({
      success: !!result,
      messageId: result?.messages?.[0]?.id
    });
  } catch (error: any) {
    logger.error('Failed to send lease renewal reminder', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /tenant/emergency-alert
 * Send emergency alert to a tenant
 */
router.post('/tenant/emergency-alert', async (req: Request, res: Response) => {
  try {
    const { tenantId, alertType, message, instructions, contactNumber } = req.body;

    if (!tenantId || !alertType || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, alertType, message'
      });
    }

    const validAlertTypes = ['fire', 'water_leak', 'security', 'power_outage', 'general'];
    if (!validAlertTypes.includes(alertType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid alertType. Must be one of: ${validAlertTypes.join(', ')}`
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const tenant = await tenantWhatsAppService.getTenantContact(tenantId);

    if (!tenant || !tenant.phoneNumber) {
      return res.status(404).json({ success: false, error: 'Tenant not found or no phone number' });
    }

    const result = await tenantWhatsAppService.sendEmergencyAlert({
      tenant,
      alertType,
      message,
      instructions,
      contactNumber
    });

    res.json({
      success: !!result,
      messageId: result?.messages?.[0]?.id
    });
  } catch (error: any) {
    logger.error('Failed to send emergency alert', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /tenant/bulk-rent-reminders
 * Send rent reminders to all tenants in an organization
 */
router.post('/tenant/bulk-rent-reminders', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    const { dueDate } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-organization-id header'
      });
    }

    if (!dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: dueDate'
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const result = await tenantWhatsAppService.sendBulkRentReminders(organizationId, new Date(dueDate));

    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error('Failed to send bulk rent reminders', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /tenant/bulk-emergency-alert
 * Send emergency alert to all tenants in a property
 */
router.post('/tenant/bulk-emergency-alert', async (req: Request, res: Response) => {
  try {
    const { propertyId, alertType, message, instructions, contactNumber } = req.body;

    if (!propertyId || !alertType || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: propertyId, alertType, message'
      });
    }

    const { tenantWhatsAppService } = await import('../services/property-management/notifications/tenantWhatsAppService');
    const result = await tenantWhatsAppService.sendBulkEmergencyAlert(propertyId, {
      alertType,
      message,
      instructions,
      contactNumber
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error('Failed to send bulk emergency alert', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
