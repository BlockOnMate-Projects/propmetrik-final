/**
 * WhatsApp PM Bot Service
 * 
 * @deprecated This service has been split into focused services in Phase 3.2:
 * 
 * - WhatsAppTemplates: Message template generation
 * - WhatsAppCommandHandler: Text command processing
 * - WhatsAppNotificationService: Notification dispatch
 * - WhatsAppBotFacade: Unified facade for backward compatibility
 * 
 * Import from './messaging' instead:
 * ```
 * import { 
 *   whatsAppTemplates,
 *   whatsAppCommandHandler,
 *   whatsAppNotificationService,
 *   whatsAppBotFacade,
 *   PMNotificationType 
 * } from './messaging';
 * ```
 * 
 * This file will be removed in a future release.
 * 
 * Original description:
 * Phase 3A Week 3: Project Management WhatsApp Bot Integration
 * 
 * Extends the existing WhatsApp service to provide PM-specific:
 * - Project update notifications
 * - RFI/Submittal approvals via reply
 * - Daily log reminders
 * - Delivery confirmations
 * - Interactive command handling
 * 
 * @module services/project-management/whatsappBotService
 */

import { logger } from '../../utils/logger';
import db from '../../database';
import { whatsappService } from '../../../shared-services/notifications/whatsapp/whatsapp.service';

// ============================================================================
// Types & Interfaces
// ============================================================================

export enum PMNotificationType {
  // Project Updates
  PROJECT_STARTED = 'project_started',
  PROJECT_MILESTONE = 'project_milestone',
  PROJECT_DELAYED = 'project_delayed',
  PROJECT_COMPLETED = 'project_completed',
  
  // RFI Notifications
  RFI_CREATED = 'rfi_created',
  RFI_ASSIGNED = 'rfi_assigned',
  RFI_RESPONSE_NEEDED = 'rfi_response_needed',
  RFI_ANSWERED = 'rfi_answered',
  
  // Submittal Notifications
  SUBMITTAL_SUBMITTED = 'submittal_submitted',
  SUBMITTAL_ASSIGNED = 'submittal_assigned',
  SUBMITTAL_APPROVED = 'submittal_approved',
  SUBMITTAL_REJECTED = 'submittal_rejected',
  SUBMITTAL_REVISION_NEEDED = 'submittal_revision_needed',
  
  // Change Order Notifications
  CHANGE_ORDER_CREATED = 'change_order_created',
  CHANGE_ORDER_APPROVED = 'change_order_approved',
  CHANGE_ORDER_REJECTED = 'change_order_rejected',
  
  // Daily Operations
  DAILY_LOG_REMINDER = 'daily_log_reminder',
  DAILY_LOG_SUBMITTED = 'daily_log_submitted',
  
  // Delivery & Materials
  DELIVERY_SCHEDULED = 'delivery_scheduled',
  DELIVERY_ARRIVED = 'delivery_arrived',
  DELIVERY_CONFIRMATION_NEEDED = 'delivery_confirmation_needed',
  
  // Safety & Inspections
  SAFETY_INCIDENT = 'safety_incident',
  INSPECTION_SCHEDULED = 'inspection_scheduled',
  INSPECTION_PASSED = 'inspection_passed',
  INSPECTION_FAILED = 'inspection_failed',
  
  // Budget & Payments
  BUDGET_THRESHOLD_WARNING = 'budget_threshold_warning',
  PAYMENT_DUE = 'payment_due',
  PAYMENT_RECEIVED = 'payment_received',
  
  // General
  TASK_ASSIGNED = 'task_assigned',
  TASK_DUE_SOON = 'task_due_soon',
  PHOTO_UPLOADED = 'photo_uploaded',
  PUNCH_LIST_ITEM = 'punch_list_item'
}

export interface PMWhatsAppNotification {
  recipientPhone: string;
  recipientName: string;
  notificationType: PMNotificationType;
  projectId: string;
  projectName: string;
  data: Record<string, any>;
  requiresResponse?: boolean;
  responseOptions?: ResponseOption[];
}

export interface ResponseOption {
  key: string;
  label: string;
  action: string;
}

export interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string };
        messages?: Array<WhatsAppIncomingMessage>;
        statuses?: Array<any>;
      };
    }>;
  }>;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'interactive' | 'button' | 'image' | 'document' | 'location';
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  button?: { text: string; payload: string };
  image?: { id: string; mime_type: string; sha256: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface ConversationSession {
  phone: string;
  userId?: string;
  projectId?: string;
  currentFlow?: string;
  flowStep?: number;
  data: Record<string, any>;
  expiresAt: Date;
}

// ============================================================================
// Message Templates
// ============================================================================

const PM_MESSAGE_TEMPLATES: Record<PMNotificationType, (data: any) => string> = {
  [PMNotificationType.PROJECT_STARTED]: (d) => 
    `🚀 *Project Started*\n\n` +
    `Project: ${d.projectName}\n` +
    `Start Date: ${d.startDate}\n` +
    `Target Completion: ${d.targetDate}\n\n` +
    `Project Manager: ${d.projectManager}`,

  [PMNotificationType.PROJECT_MILESTONE]: (d) =>
    `🎯 *Milestone Reached*\n\n` +
    `Project: ${d.projectName}\n` +
    `Milestone: ${d.milestoneName}\n` +
    `Completed: ${d.completedDate}\n\n` +
    `Progress: ${d.progressPercent}% complete`,

  [PMNotificationType.PROJECT_DELAYED]: (d) =>
    `⚠️ *Project Delay Alert*\n\n` +
    `Project: ${d.projectName}\n` +
    `Original Date: ${d.originalDate}\n` +
    `New Date: ${d.newDate}\n` +
    `Delay: ${d.delayDays} days\n\n` +
    `Reason: ${d.reason}`,

  [PMNotificationType.PROJECT_COMPLETED]: (d) =>
    `🎉 *Project Completed*\n\n` +
    `Project: ${d.projectName}\n` +
    `Completed: ${d.completedDate}\n` +
    `Duration: ${d.totalDays} days\n\n` +
    `Congratulations to the team!`,

  [PMNotificationType.RFI_CREATED]: (d) =>
    `📋 *New RFI Created*\n\n` +
    `RFI #: ${d.rfiNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Subject: ${d.subject}\n` +
    `Priority: ${d.priority}\n` +
    `Due: ${d.dueDate}\n\n` +
    `From: ${d.createdBy}`,

  [PMNotificationType.RFI_ASSIGNED]: (d) =>
    `📝 *RFI Assigned to You*\n\n` +
    `RFI #: ${d.rfiNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Subject: ${d.subject}\n` +
    `Due: ${d.dueDate}\n\n` +
    `Reply with:\n` +
    `1️⃣ Accept\n` +
    `2️⃣ View Details\n` +
    `3️⃣ Request Extension`,

  [PMNotificationType.RFI_RESPONSE_NEEDED]: (d) =>
    `🔔 *RFI Response Overdue*\n\n` +
    `RFI #: ${d.rfiNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Subject: ${d.subject}\n` +
    `Days Overdue: ${d.daysOverdue}\n\n` +
    `Please respond urgently.`,

  [PMNotificationType.RFI_ANSWERED]: (d) =>
    `✅ *RFI Answered*\n\n` +
    `RFI #: ${d.rfiNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Subject: ${d.subject}\n\n` +
    `Answered by: ${d.answeredBy}\n` +
    `Response: ${d.response?.substring(0, 200)}...`,

  [PMNotificationType.SUBMITTAL_SUBMITTED]: (d) =>
    `📦 *Submittal Received*\n\n` +
    `Submittal #: ${d.submittalNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Type: ${d.submittalType}\n` +
    `Title: ${d.title}\n\n` +
    `From: ${d.submittedBy}`,

  [PMNotificationType.SUBMITTAL_ASSIGNED]: (d) =>
    `📋 *Submittal Assigned for Review*\n\n` +
    `Submittal #: ${d.submittalNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Title: ${d.title}\n` +
    `Due: ${d.dueDate}\n\n` +
    `Reply with:\n` +
    `1️⃣ Approve\n` +
    `2️⃣ Approve w/ Comments\n` +
    `3️⃣ Revise & Resubmit\n` +
    `4️⃣ Reject`,

  [PMNotificationType.SUBMITTAL_APPROVED]: (d) =>
    `✅ *Submittal Approved*\n\n` +
    `Submittal #: ${d.submittalNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Title: ${d.title}\n\n` +
    `Approved by: ${d.approvedBy}\n` +
    `${d.comments ? `Comments: ${d.comments}` : ''}`,

  [PMNotificationType.SUBMITTAL_REJECTED]: (d) =>
    `❌ *Submittal Rejected*\n\n` +
    `Submittal #: ${d.submittalNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Title: ${d.title}\n\n` +
    `Rejected by: ${d.rejectedBy}\n` +
    `Reason: ${d.reason}`,

  [PMNotificationType.SUBMITTAL_REVISION_NEEDED]: (d) =>
    `🔄 *Submittal Needs Revision*\n\n` +
    `Submittal #: ${d.submittalNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Title: ${d.title}\n\n` +
    `Comments: ${d.comments}\n` +
    `Please revise and resubmit.`,

  [PMNotificationType.CHANGE_ORDER_CREATED]: (d) =>
    `📝 *New Change Order*\n\n` +
    `CO #: ${d.coNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Description: ${d.description}\n` +
    `Amount: ${d.currency} ${d.amount?.toLocaleString()}\n` +
    `Impact: ${d.scheduleImpact || 'None'}\n\n` +
    `Requested by: ${d.requestedBy}`,

  [PMNotificationType.CHANGE_ORDER_APPROVED]: (d) =>
    `✅ *Change Order Approved*\n\n` +
    `CO #: ${d.coNumber}\n` +
    `Project: ${d.projectName}\n` +
    `Amount: ${d.currency} ${d.amount?.toLocaleString()}\n\n` +
    `Approved by: ${d.approvedBy}`,

  [PMNotificationType.CHANGE_ORDER_REJECTED]: (d) =>
    `❌ *Change Order Rejected*\n\n` +
    `CO #: ${d.coNumber}\n` +
    `Project: ${d.projectName}\n\n` +
    `Rejected by: ${d.rejectedBy}\n` +
    `Reason: ${d.reason}`,

  [PMNotificationType.DAILY_LOG_REMINDER]: (d) =>
    `📓 *Daily Log Reminder*\n\n` +
    `Project: ${d.projectName}\n` +
    `Date: ${d.date}\n\n` +
    `Please submit your daily log by end of day.\n\n` +
    `Reply:\n` +
    `1️⃣ Submit Now\n` +
    `2️⃣ Remind Later`,

  [PMNotificationType.DAILY_LOG_SUBMITTED]: (d) =>
    `✅ *Daily Log Submitted*\n\n` +
    `Project: ${d.projectName}\n` +
    `Date: ${d.date}\n` +
    `Submitted by: ${d.submittedBy}\n\n` +
    `Workers: ${d.workerCount}\n` +
    `Weather: ${d.weather}`,

  [PMNotificationType.DELIVERY_SCHEDULED]: (d) =>
    `🚚 *Delivery Scheduled*\n\n` +
    `Project: ${d.projectName}\n` +
    `Date: ${d.deliveryDate}\n` +
    `Time: ${d.deliveryTime}\n\n` +
    `Items:\n${d.items?.map((i: any) => `• ${i.name} (${i.quantity})`).join('\n')}\n\n` +
    `Vendor: ${d.vendor}`,

  [PMNotificationType.DELIVERY_ARRIVED]: (d) =>
    `📦 *Delivery Arrived*\n\n` +
    `Project: ${d.projectName}\n` +
    `Delivery: ${d.deliveryId}\n\n` +
    `Please confirm receipt.\n\n` +
    `Reply:\n` +
    `1️⃣ Confirm Complete\n` +
    `2️⃣ Report Issue\n` +
    `3️⃣ Partial Delivery`,

  [PMNotificationType.DELIVERY_CONFIRMATION_NEEDED]: (d) =>
    `⚠️ *Pending Delivery Confirmation*\n\n` +
    `Project: ${d.projectName}\n` +
    `Delivery: ${d.deliveryId}\n` +
    `Arrived: ${d.arrivedAt}\n\n` +
    `Reply 1 to confirm delivery.`,

  [PMNotificationType.SAFETY_INCIDENT]: (d) =>
    `🚨 *SAFETY INCIDENT REPORTED*\n\n` +
    `Project: ${d.projectName}\n` +
    `Type: ${d.incidentType}\n` +
    `Severity: ${d.severity}\n` +
    `Location: ${d.location}\n\n` +
    `Description: ${d.description}\n\n` +
    `Reported by: ${d.reportedBy}`,

  [PMNotificationType.INSPECTION_SCHEDULED]: (d) =>
    `🔍 *Inspection Scheduled*\n\n` +
    `Project: ${d.projectName}\n` +
    `Type: ${d.inspectionType}\n` +
    `Date: ${d.date}\n` +
    `Time: ${d.time}\n\n` +
    `Inspector: ${d.inspector}`,

  [PMNotificationType.INSPECTION_PASSED]: (d) =>
    `✅ *Inspection Passed*\n\n` +
    `Project: ${d.projectName}\n` +
    `Type: ${d.inspectionType}\n` +
    `Date: ${d.date}\n\n` +
    `Inspector: ${d.inspector}\n` +
    `${d.notes ? `Notes: ${d.notes}` : ''}`,

  [PMNotificationType.INSPECTION_FAILED]: (d) =>
    `❌ *Inspection Failed*\n\n` +
    `Project: ${d.projectName}\n` +
    `Type: ${d.inspectionType}\n` +
    `Date: ${d.date}\n\n` +
    `Issues:\n${d.issues?.map((i: any) => `• ${i}`).join('\n')}\n\n` +
    `Re-inspection required.`,

  [PMNotificationType.BUDGET_THRESHOLD_WARNING]: (d) =>
    `💰 *Budget Alert*\n\n` +
    `Project: ${d.projectName}\n` +
    `Category: ${d.category}\n` +
    `Spent: ${d.currency} ${d.spent?.toLocaleString()}\n` +
    `Budget: ${d.currency} ${d.budget?.toLocaleString()}\n` +
    `Usage: ${d.percentUsed}%\n\n` +
    `⚠️ Approaching budget limit!`,

  [PMNotificationType.PAYMENT_DUE]: (d) =>
    `💳 *Payment Due*\n\n` +
    `Project: ${d.projectName}\n` +
    `Vendor: ${d.vendor}\n` +
    `Amount: ${d.currency} ${d.amount?.toLocaleString()}\n` +
    `Due: ${d.dueDate}\n\n` +
    `Invoice: ${d.invoiceNumber}`,

  [PMNotificationType.PAYMENT_RECEIVED]: (d) =>
    `✅ *Payment Received*\n\n` +
    `Project: ${d.projectName}\n` +
    `From: ${d.from}\n` +
    `Amount: ${d.currency} ${d.amount?.toLocaleString()}\n` +
    `Reference: ${d.reference}`,

  [PMNotificationType.TASK_ASSIGNED]: (d) =>
    `📌 *Task Assigned*\n\n` +
    `Project: ${d.projectName}\n` +
    `Task: ${d.taskName}\n` +
    `Priority: ${d.priority}\n` +
    `Due: ${d.dueDate}\n\n` +
    `Assigned by: ${d.assignedBy}`,

  [PMNotificationType.TASK_DUE_SOON]: (d) =>
    `⏰ *Task Due Soon*\n\n` +
    `Project: ${d.projectName}\n` +
    `Task: ${d.taskName}\n` +
    `Due: ${d.dueDate}\n` +
    `Time Left: ${d.timeLeft}`,

  [PMNotificationType.PHOTO_UPLOADED]: (d) =>
    `📷 *New Site Photo*\n\n` +
    `Project: ${d.projectName}\n` +
    `Category: ${d.category}\n` +
    `By: ${d.uploadedBy}\n\n` +
    `${d.description || ''}`,

  [PMNotificationType.PUNCH_LIST_ITEM]: (d) =>
    `🔧 *Punch List Item Assigned*\n\n` +
    `Project: ${d.projectName}\n` +
    `Item: ${d.description}\n` +
    `Location: ${d.location}\n` +
    `Priority: ${d.priority}\n` +
    `Due: ${d.dueDate}\n\n` +
    `Assigned by: ${d.assignedBy}`
};

// ============================================================================
// WhatsApp PM Bot Service
// ============================================================================

class WhatsAppPMBotService {
  private sessions: Map<string, ConversationSession> = new Map();
  private readonly SESSION_TIMEOUT_MINUTES = 30;

  // -------------------------------------------------------------------------
  // Notification Sending
  // -------------------------------------------------------------------------

  /**
   * Send a PM notification via WhatsApp
   */
  async sendNotification(notification: PMWhatsAppNotification): Promise<boolean> {
    try {
      const { recipientPhone, notificationType, data } = notification;
      
      // Get the template function
      const templateFn = PM_MESSAGE_TEMPLATES[notificationType];
      if (!templateFn) {
        logger.error('Unknown notification type', { notificationType });
        return false;
      }

      // Build the message
      const message = templateFn({
        ...data,
        projectName: notification.projectName
      });

      // Log the notification
      await this.logNotification(notification, message);

      // Send via existing WhatsApp service
      const success = await whatsappService.sendMessage(recipientPhone, message);
      
      if (success) {
        logger.info('PM WhatsApp notification sent', {
          type: notificationType,
          recipient: recipientPhone,
          projectId: notification.projectId
        });
      }

      return success;
    } catch (error) {
      logger.error('Failed to send PM WhatsApp notification', { error, notification });
      return false;
    }
  }

  /**
   * Send notifications to multiple recipients
   */
  async sendBulkNotification(
    recipients: Array<{ phone: string; name: string; userId?: string }>,
    notificationType: PMNotificationType,
    projectId: string,
    projectName: string,
    data: Record<string, any>
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const success = await this.sendNotification({
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        notificationType,
        projectId,
        projectName,
        data: { ...data, recipientName: recipient.name }
      });

      if (success) sent++;
      else failed++;
    }

    return { sent, failed };
  }

  // -------------------------------------------------------------------------
  // Webhook Handling (Incoming Messages)
  // -------------------------------------------------------------------------

  /**
   * Process incoming WhatsApp webhook
   */
  async processWebhook(payload: WebhookPayload): Promise<void> {
    try {
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value.messages) {
            for (const message of change.value.messages) {
              await this.handleIncomingMessage(message);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error processing WhatsApp webhook', { error, payload });
    }
  }

  /**
   * Handle incoming message from user
   */
  private async handleIncomingMessage(message: WhatsAppIncomingMessage): Promise<void> {
    const { from: phone, type } = message;

    try {
      // Get or create session
      const session = this.getOrCreateSession(phone);

      // Route based on message type
      switch (type) {
        case 'text':
          await this.handleTextMessage(phone, message.text?.body || '', session);
          break;
        case 'interactive':
          await this.handleInteractiveMessage(phone, message.interactive!, session);
          break;
        case 'button':
          await this.handleButtonMessage(phone, message.button!, session);
          break;
        case 'image':
          await this.handleImageMessage(phone, message.image!, session);
          break;
        case 'location':
          await this.handleLocationMessage(phone, message.location!, session);
          break;
        default:
          await this.sendHelpMessage(phone);
      }
    } catch (error) {
      logger.error('Error handling incoming message', { error, phone, type });
      await whatsappService.sendMessage(phone, 
        'Sorry, we encountered an error processing your message. Please try again or contact support.');
    }
  }

  /**
   * Handle text message
   */
  private async handleTextMessage(
    phone: string, 
    text: string, 
    session: ConversationSession
  ): Promise<void> {
    const normalizedText = text.trim().toLowerCase();

    // Check for quick reply numbers (1, 2, 3, etc.)
    if (/^[1-9]$/.test(normalizedText)) {
      await this.handleQuickReply(phone, parseInt(normalizedText), session);
      return;
    }

    // Check for commands
    if (normalizedText.startsWith('/') || normalizedText.startsWith('!')) {
      await this.handleCommand(phone, normalizedText.substring(1), session);
      return;
    }

    // Check for keywords
    const command = this.detectCommand(normalizedText);
    if (command) {
      await this.handleCommand(phone, command, session);
      return;
    }

    // If in a flow, continue the flow
    if (session.currentFlow) {
      await this.continueFlow(phone, text, session);
      return;
    }

    // Default: send help
    await this.sendHelpMessage(phone);
  }

  /**
   * Detect command from natural language
   */
  private detectCommand(text: string): string | null {
    const commandPatterns: Array<{ patterns: string[]; command: string }> = [
      { patterns: ['help', 'menu', 'start', 'options'], command: 'help' },
      { patterns: ['projects', 'my projects', 'list projects'], command: 'projects' },
      { patterns: ['status', 'project status'], command: 'status' },
      { patterns: ['rfi', 'rfis', 'rfi list'], command: 'rfis' },
      { patterns: ['submittal', 'submittals'], command: 'submittals' },
      { patterns: ['daily', 'log', 'daily log'], command: 'dailylog' },
      { patterns: ['weather', 'today weather'], command: 'weather' },
      { patterns: ['budget', 'costs', 'expenses'], command: 'budget' },
      { patterns: ['team', 'workers', 'crew'], command: 'team' },
      { patterns: ['photo', 'photos', 'upload photo'], command: 'photo' },
      { patterns: ['delivery', 'deliveries'], command: 'deliveries' },
      { patterns: ['confirm', 'yes', 'approve'], command: 'confirm' },
      { patterns: ['reject', 'no', 'decline'], command: 'reject' }
    ];

    for (const { patterns, command } of commandPatterns) {
      if (patterns.some(p => text.includes(p))) {
        return command;
      }
    }

    return null;
  }

  /**
   * Handle quick reply (1, 2, 3, etc.)
   */
  private async handleQuickReply(
    phone: string, 
    option: number, 
    session: ConversationSession
  ): Promise<void> {
    // Check if there's a pending action
    const pendingAction = session.data.pendingAction;
    
    if (!pendingAction) {
      await whatsappService.sendMessage(phone,
        'No pending action found. Type "menu" to see available options.');
      return;
    }

    const { type, entityId, options } = pendingAction;

    if (option < 1 || option > (options?.length || 4)) {
      await whatsappService.sendMessage(phone,
        `Invalid option. Please reply with a number between 1 and ${options?.length || 4}.`);
      return;
    }

    // Handle based on action type
    switch (type) {
      case 'rfi_response':
        await this.handleRFIResponse(phone, entityId, option, session);
        break;
      case 'submittal_review':
        await this.handleSubmittalReview(phone, entityId, option, session);
        break;
      case 'delivery_confirmation':
        await this.handleDeliveryConfirmation(phone, entityId, option, session);
        break;
      case 'daily_log_reminder':
        await this.handleDailyLogResponse(phone, option, session);
        break;
      default:
        await whatsappService.sendMessage(phone, 'Action not supported.');
    }

    // Clear pending action
    delete session.data.pendingAction;
  }

  /**
   * Handle RFI response
   */
  private async handleRFIResponse(
    phone: string,
    rfiId: string,
    option: number,
    session: ConversationSession
  ): Promise<void> {
    switch (option) {
      case 1: // Accept
        await this.acceptRFI(rfiId, session.userId!);
        await whatsappService.sendMessage(phone, '✅ RFI accepted. You will receive further details shortly.');
        break;
      case 2: // View Details
        const details = await this.getRFIDetails(rfiId);
        await whatsappService.sendMessage(phone, details);
        break;
      case 3: // Request Extension
        session.currentFlow = 'rfi_extension';
        session.data.rfiId = rfiId;
        await whatsappService.sendMessage(phone, 
          'Please enter the number of additional days needed for this RFI:');
        break;
    }
  }

  /**
   * Handle Submittal review
   */
  private async handleSubmittalReview(
    phone: string,
    submittalId: string,
    option: number,
    session: ConversationSession
  ): Promise<void> {
    const statusMap: Record<number, string> = {
      1: 'approved',
      2: 'approved_as_noted',
      3: 'revise_and_resubmit',
      4: 'rejected'
    };

    const status = statusMap[option];
    if (!status) {
      await whatsappService.sendMessage(phone, 'Invalid option.');
      return;
    }

    if (option === 2 || option === 3 || option === 4) {
      // Need comments
      session.currentFlow = 'submittal_review_comments';
      session.data.submittalId = submittalId;
      session.data.reviewStatus = status;
      await whatsappService.sendMessage(phone,
        'Please provide your comments for this review:');
    } else {
      // Direct approval
      await this.reviewSubmittal(submittalId, status, null, session.userId!);
      await whatsappService.sendMessage(phone, '✅ Submittal approved successfully.');
    }
  }

  /**
   * Handle delivery confirmation
   */
  private async handleDeliveryConfirmation(
    phone: string,
    deliveryId: string,
    option: number,
    session: ConversationSession
  ): Promise<void> {
    switch (option) {
      case 1: // Confirm Complete
        await this.confirmDelivery(deliveryId, 'complete', session.userId!);
        await whatsappService.sendMessage(phone, '✅ Delivery confirmed as complete.');
        break;
      case 2: // Report Issue
        session.currentFlow = 'delivery_issue';
        session.data.deliveryId = deliveryId;
        await whatsappService.sendMessage(phone,
          'Please describe the issue with this delivery:');
        break;
      case 3: // Partial Delivery
        session.currentFlow = 'delivery_partial';
        session.data.deliveryId = deliveryId;
        await whatsappService.sendMessage(phone,
          'Please list the items that were NOT received (one per line):');
        break;
    }
  }

  /**
   * Handle daily log response
   */
  private async handleDailyLogResponse(
    phone: string,
    option: number,
    session: ConversationSession
  ): Promise<void> {
    switch (option) {
      case 1: // Submit Now
        session.currentFlow = 'daily_log';
        session.flowStep = 1;
        await whatsappService.sendMessage(phone,
          '📓 *Starting Daily Log*\n\n' +
          'How many workers were on site today?');
        break;
      case 2: // Remind Later
        // Schedule reminder for later
        await whatsappService.sendMessage(phone,
          '⏰ I\'ll remind you again in 2 hours.');
        break;
    }
  }

  /**
   * Handle command
   */
  private async handleCommand(
    phone: string,
    command: string,
    session: ConversationSession
  ): Promise<void> {
    switch (command) {
      case 'help':
        await this.sendHelpMessage(phone);
        break;

      case 'projects':
        const projects = await this.getUserProjects(session.userId);
        await whatsappService.sendMessage(phone, this.formatProjectList(projects));
        break;

      case 'status':
        if (session.projectId) {
          const status = await this.getProjectStatus(session.projectId);
          await whatsappService.sendMessage(phone, status);
        } else {
          await whatsappService.sendMessage(phone,
            'Please select a project first. Type "projects" to see your projects.');
        }
        break;

      case 'rfis':
        const rfis = await this.getPendingRFIs(session.userId, session.projectId);
        await whatsappService.sendMessage(phone, this.formatRFIList(rfis));
        break;

      case 'submittals':
        const submittals = await this.getPendingSubmittals(session.userId, session.projectId);
        await whatsappService.sendMessage(phone, this.formatSubmittalList(submittals));
        break;

      case 'dailylog':
        session.currentFlow = 'daily_log';
        session.flowStep = 1;
        await whatsappService.sendMessage(phone,
          '📓 *Starting Daily Log*\n\n' +
          'How many workers were on site today?');
        break;

      case 'weather':
        const weather = await this.getWeatherForProject(session.projectId);
        await whatsappService.sendMessage(phone, weather);
        break;

      case 'budget':
        const budget = await this.getProjectBudgetSummary(session.projectId);
        await whatsappService.sendMessage(phone, budget);
        break;

      case 'photo':
        await whatsappService.sendMessage(phone,
          '📷 *Photo Upload*\n\n' +
          'Please send a photo and I\'ll upload it to the project.\n\n' +
          'You can also send a location for geo-tagging.');
        session.currentFlow = 'photo_upload';
        break;

      case 'deliveries':
        const deliveries = await this.getPendingDeliveries(session.projectId);
        await whatsappService.sendMessage(phone, this.formatDeliveryList(deliveries));
        break;

      default:
        await whatsappService.sendMessage(phone,
          `Unknown command: ${command}\n\nType "help" for available commands.`);
    }
  }

  /**
   * Continue a conversation flow
   */
  private async continueFlow(
    phone: string,
    input: string,
    session: ConversationSession
  ): Promise<void> {
    const { currentFlow, flowStep } = session;

    switch (currentFlow) {
      case 'daily_log':
        await this.continueDailyLogFlow(phone, input, session);
        break;

      case 'rfi_extension':
        const days = parseInt(input);
        if (isNaN(days) || days < 1 || days > 30) {
          await whatsappService.sendMessage(phone, 'Please enter a valid number of days (1-30):');
          return;
        }
        await this.requestRFIExtension(session.data.rfiId, days, session.userId!);
        await whatsappService.sendMessage(phone, `✅ Extension request for ${days} days submitted.`);
        session.currentFlow = undefined;
        break;

      case 'submittal_review_comments':
        await this.reviewSubmittal(
          session.data.submittalId,
          session.data.reviewStatus,
          input,
          session.userId!
        );
        await whatsappService.sendMessage(phone, '✅ Submittal review submitted with comments.');
        session.currentFlow = undefined;
        break;

      case 'delivery_issue':
        await this.reportDeliveryIssue(session.data.deliveryId, input, session.userId!);
        await whatsappService.sendMessage(phone, '✅ Delivery issue reported.');
        session.currentFlow = undefined;
        break;

      case 'delivery_partial':
        await this.confirmDelivery(session.data.deliveryId, 'partial', session.userId!, input);
        await whatsappService.sendMessage(phone, '✅ Partial delivery confirmed.');
        session.currentFlow = undefined;
        break;

      case 'photo_upload':
        await whatsappService.sendMessage(phone,
          '📷 Please send a photo (image) directly, not text.');
        break;
    }
  }

  /**
   * Continue daily log flow
   */
  private async continueDailyLogFlow(
    phone: string,
    input: string,
    session: ConversationSession
  ): Promise<void> {
    const step = session.flowStep || 1;

    switch (step) {
      case 1: // Worker count
        const workers = parseInt(input);
        if (isNaN(workers) || workers < 0) {
          await whatsappService.sendMessage(phone, 'Please enter a valid number of workers:');
          return;
        }
        session.data.dailyLog = { workerCount: workers };
        session.flowStep = 2;
        await whatsappService.sendMessage(phone,
          '☀️ What\'s the weather today?\n\n' +
          '1️⃣ Sunny\n' +
          '2️⃣ Cloudy\n' +
          '3️⃣ Rainy\n' +
          '4️⃣ Hot');
        break;

      case 2: // Weather
        const weatherMap: Record<string, string> = {
          '1': 'sunny', '2': 'cloudy', '3': 'rainy', '4': 'hot'
        };
        const weather = weatherMap[input.trim()] || input;
        session.data.dailyLog.weather = weather;
        session.flowStep = 3;
        await whatsappService.sendMessage(phone,
          '📝 Briefly describe the work completed today:');
        break;

      case 3: // Work description
        session.data.dailyLog.workDescription = input;
        session.flowStep = 4;
        await whatsappService.sendMessage(phone,
          '⚠️ Any issues or delays? (Type "none" if no issues):');
        break;

      case 4: // Issues
        session.data.dailyLog.issues = input.toLowerCase() === 'none' ? null : input;
        
        // Submit the daily log
        await this.submitDailyLog(session.projectId!, session.data.dailyLog, session.userId!);
        
        await whatsappService.sendMessage(phone,
          '✅ *Daily Log Submitted*\n\n' +
          `Workers: ${session.data.dailyLog.workerCount}\n` +
          `Weather: ${session.data.dailyLog.weather}\n` +
          `Work: ${session.data.dailyLog.workDescription}\n` +
          `Issues: ${session.data.dailyLog.issues || 'None'}`);
        
        // Clear flow
        session.currentFlow = undefined;
        session.flowStep = undefined;
        delete session.data.dailyLog;
        break;
    }
  }

  /**
   * Handle image message (for photo uploads)
   */
  private async handleImageMessage(
    phone: string,
    image: { id: string; mime_type: string; sha256: string },
    session: ConversationSession
  ): Promise<void> {
    if (session.currentFlow === 'photo_upload') {
      // Download and save the image
      await this.saveUploadedPhoto(image, session);
      await whatsappService.sendMessage(phone,
        '✅ Photo uploaded successfully!\n\n' +
        'Would you like to:\n' +
        '1️⃣ Add a description\n' +
        '2️⃣ Upload another photo\n' +
        '3️⃣ Done');
      
      session.data.pendingAction = {
        type: 'photo_options',
        entityId: image.id,
        options: ['Add description', 'Upload another', 'Done']
      };
    } else {
      await whatsappService.sendMessage(phone,
        '📷 Photo received! Type "photo" to start a photo upload session.');
    }
  }

  /**
   * Handle location message (for geo-tagging)
   */
  private async handleLocationMessage(
    phone: string,
    location: { latitude: number; longitude: number; name?: string; address?: string },
    session: ConversationSession
  ): Promise<void> {
    session.data.lastLocation = location;
    await whatsappService.sendMessage(phone,
      `📍 Location received!\n\n` +
      `Lat: ${location.latitude}\n` +
      `Lng: ${location.longitude}\n` +
      `${location.name ? `Name: ${location.name}` : ''}\n\n` +
      'This will be used for geo-tagging your next photo upload.');
  }

  /**
   * Handle interactive message (buttons, lists)
   */
  private async handleInteractiveMessage(
    phone: string,
    interactive: any,
    session: ConversationSession
  ): Promise<void> {
    const id = interactive.button_reply?.id || interactive.list_reply?.id;
    if (id) {
      await this.handleCommand(phone, id, session);
    }
  }

  /**
   * Handle button message
   */
  private async handleButtonMessage(
    phone: string,
    button: { text: string; payload: string },
    session: ConversationSession
  ): Promise<void> {
    await this.handleCommand(phone, button.payload, session);
  }

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  private getOrCreateSession(phone: string): ConversationSession {
    let session = this.sessions.get(phone);
    
    if (!session || session.expiresAt < new Date()) {
      session = {
        phone,
        data: {},
        expiresAt: new Date(Date.now() + this.SESSION_TIMEOUT_MINUTES * 60 * 1000)
      };
      
      // Try to find user by phone
      this.findUserByPhone(phone).then(user => {
        if (user) {
          session!.userId = user.id;
          session!.data.userName = user.full_name;
        }
      });
      
      this.sessions.set(phone, session);
    }

    // Extend session
    session.expiresAt = new Date(Date.now() + this.SESSION_TIMEOUT_MINUTES * 60 * 1000);
    
    return session;
  }

  // -------------------------------------------------------------------------
  // Help & Formatting
  // -------------------------------------------------------------------------

  private async sendHelpMessage(phone: string): Promise<void> {
    const message = 
      `🏗️ *PROPMETRIK PM Bot*\n\n` +
      `Available Commands:\n\n` +
      `📋 *projects* - View your projects\n` +
      `📊 *status* - Current project status\n` +
      `❓ *rfis* - Pending RFIs\n` +
      `📦 *submittals* - Pending submittals\n` +
      `📓 *dailylog* - Submit daily log\n` +
      `🚚 *deliveries* - Pending deliveries\n` +
      `💰 *budget* - Budget summary\n` +
      `📷 *photo* - Upload site photo\n` +
      `🌤️ *weather* - Today's weather\n` +
      `👥 *team* - Team on site\n\n` +
      `Or reply with 1-9 when prompted!`;

    await whatsappService.sendMessage(phone, message);
  }

  private formatProjectList(projects: any[]): string {
    if (!projects.length) {
      return '📋 No projects found.';
    }

    let message = '📋 *Your Projects*\n\n';
    projects.forEach((p, i) => {
      message += `${i + 1}️⃣ *${p.name}*\n`;
      message += `   Status: ${p.status}\n`;
      message += `   Progress: ${p.progress_percent || 0}%\n\n`;
    });

    return message;
  }

  private formatRFIList(rfis: any[]): string {
    if (!rfis.length) {
      return '✅ No pending RFIs!';
    }

    let message = '📋 *Pending RFIs*\n\n';
    rfis.forEach((rfi, i) => {
      message += `${i + 1}️⃣ *${rfi.rfi_number}*\n`;
      message += `   ${rfi.subject}\n`;
      message += `   Due: ${rfi.due_date}\n`;
      message += `   Priority: ${rfi.priority}\n\n`;
    });

    return message;
  }

  private formatSubmittalList(submittals: any[]): string {
    if (!submittals.length) {
      return '✅ No pending submittals!';
    }

    let message = '📦 *Pending Submittals*\n\n';
    submittals.forEach((s, i) => {
      message += `${i + 1}️⃣ *${s.submittal_number}*\n`;
      message += `   ${s.title}\n`;
      message += `   Type: ${s.submittal_type}\n`;
      message += `   Due: ${s.due_date}\n\n`;
    });

    return message;
  }

  private formatDeliveryList(deliveries: any[]): string {
    if (!deliveries.length) {
      return '✅ No pending deliveries!';
    }

    let message = '🚚 *Pending Deliveries*\n\n';
    deliveries.forEach((d, i) => {
      message += `${i + 1}️⃣ *${d.vendor_name}*\n`;
      message += `   Date: ${d.scheduled_date}\n`;
      message += `   Items: ${d.item_count}\n\n`;
    });

    return message;
  }

  // -------------------------------------------------------------------------
  // Database Operations
  // -------------------------------------------------------------------------

  private async logNotification(
    notification: PMWhatsAppNotification,
    message: string
  ): Promise<void> {
    try {
      await db.query(`
        INSERT INTO notification_logs (
          recipient_phone, recipient_name, notification_type,
          project_id, message, channel, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'whatsapp', 'sent', NOW())
        ON CONFLICT DO NOTHING
      `, [
        notification.recipientPhone,
        notification.recipientName,
        notification.notificationType,
        notification.projectId,
        message
      ]);
    } catch (error) {
      // Non-critical, just log
      logger.warn('Failed to log notification', { error });
    }
  }

  private async findUserByPhone(phone: string): Promise<any> {
    try {
      const result = await db.query(`
        SELECT id, full_name, email FROM users WHERE phone = $1 LIMIT 1
      `, [phone]);
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  private async getUserProjects(userId?: string): Promise<any[]> {
    if (!userId) return [];
    
    try {
      const result = await db.query(`
        SELECT p.id, p.name, p.status, p.progress_percent
        FROM projects p
        JOIN project_team_members ptm ON p.id = ptm.project_id
        WHERE ptm.user_id = $1 AND p.status != 'archived'
        ORDER BY p.updated_at DESC
        LIMIT 10
      `, [userId]);
      return result.rows;
    } catch {
      return [];
    }
  }

  private async getProjectStatus(projectId: string): Promise<string> {
    try {
      const result = await db.query(`
        SELECT 
          p.name, p.status, p.progress_percent,
          p.start_date, p.target_completion_date,
          (SELECT COUNT(*) FROM rfis WHERE project_id = p.id AND status = 'open') as open_rfis,
          (SELECT COUNT(*) FROM submittals WHERE project_id = p.id AND status = 'pending_review') as pending_submittals,
          (SELECT COUNT(*) FROM change_orders WHERE project_id = p.id AND status = 'pending') as pending_cos
        FROM projects p
        WHERE p.id = $1
      `, [projectId]);

      const p = result.rows[0];
      if (!p) return 'Project not found.';

      return (
        `📊 *${p.name}*\n\n` +
        `Status: ${p.status}\n` +
        `Progress: ${p.progress_percent || 0}%\n` +
        `Start: ${p.start_date}\n` +
        `Target: ${p.target_completion_date}\n\n` +
        `📋 Open RFIs: ${p.open_rfis}\n` +
        `📦 Pending Submittals: ${p.pending_submittals}\n` +
        `📝 Pending COs: ${p.pending_cos}`
      );
    } catch {
      return 'Unable to fetch project status.';
    }
  }

  private async getPendingRFIs(userId?: string, projectId?: string): Promise<any[]> {
    try {
      let query = `
        SELECT rfi_number, subject, due_date, priority
        FROM rfis
        WHERE status IN ('open', 'in_progress')
      `;
      const params: any[] = [];
      
      if (projectId) {
        query += ` AND project_id = $${params.length + 1}`;
        params.push(projectId);
      }
      
      if (userId) {
        query += ` AND assigned_to = $${params.length + 1}`;
        params.push(userId);
      }
      
      query += ` ORDER BY due_date ASC LIMIT 10`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch {
      return [];
    }
  }

  private async getPendingSubmittals(userId?: string, projectId?: string): Promise<any[]> {
    try {
      let query = `
        SELECT submittal_number, title, submittal_type, required_date as due_date
        FROM submittals
        WHERE status IN ('pending_review', 'in_review')
      `;
      const params: any[] = [];
      
      if (projectId) {
        query += ` AND project_id = $${params.length + 1}`;
        params.push(projectId);
      }
      
      if (userId) {
        query += ` AND current_reviewer_id = $${params.length + 1}`;
        params.push(userId);
      }
      
      query += ` ORDER BY required_date ASC LIMIT 10`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch {
      return [];
    }
  }

  private async getPendingDeliveries(projectId?: string): Promise<any[]> {
    // Placeholder - would query deliveries/purchase_orders
    return [];
  }

  private async getWeatherForProject(projectId?: string): Promise<string> {
    // Placeholder - would integrate with weather API
    return '🌤️ Weather: Sunny, 28°C\nHumidity: 65%\nWind: 12 km/h';
  }

  private async getProjectBudgetSummary(projectId?: string): Promise<string> {
    if (!projectId) return 'Please select a project first.';
    
    try {
      const result = await db.query(`
        SELECT 
          total_budget, currency,
          COALESCE(SUM(pc.amount), 0) as total_spent
        FROM projects p
        LEFT JOIN project_costs pc ON p.id = pc.project_id
        WHERE p.id = $1
        GROUP BY p.id, p.total_budget, p.currency
      `, [projectId]);

      const b = result.rows[0];
      if (!b) return 'Budget information not available.';

      const percentUsed = b.total_budget > 0 
        ? Math.round((b.total_spent / b.total_budget) * 100) 
        : 0;

      return (
        `💰 *Budget Summary*\n\n` +
        `Budget: ${b.currency} ${b.total_budget?.toLocaleString()}\n` +
        `Spent: ${b.currency} ${b.total_spent?.toLocaleString()}\n` +
        `Remaining: ${b.currency} ${(b.total_budget - b.total_spent)?.toLocaleString()}\n` +
        `Usage: ${percentUsed}%`
      );
    } catch {
      return 'Unable to fetch budget information.';
    }
  }

  private async getRFIDetails(rfiId: string): Promise<string> {
    try {
      const result = await db.query(`
        SELECT r.*, u.full_name as created_by_name
        FROM rfis r
        LEFT JOIN users u ON r.created_by = u.id
        WHERE r.id = $1
      `, [rfiId]);

      const rfi = result.rows[0];
      if (!rfi) return 'RFI not found.';

      return (
        `📋 *RFI Details*\n\n` +
        `Number: ${rfi.rfi_number}\n` +
        `Subject: ${rfi.subject}\n` +
        `Priority: ${rfi.priority}\n` +
        `Due: ${rfi.due_date}\n` +
        `Created by: ${rfi.created_by_name}\n\n` +
        `Question:\n${rfi.question}`
      );
    } catch {
      return 'Unable to fetch RFI details.';
    }
  }

  private async acceptRFI(rfiId: string, userId: string): Promise<void> {
    await db.query(`
      UPDATE rfis SET 
        status = 'in_progress',
        updated_at = NOW()
      WHERE id = $1
    `, [rfiId]);
  }

  private async requestRFIExtension(rfiId: string, days: number, userId: string): Promise<void> {
    await db.query(`
      UPDATE rfis SET 
        due_date = due_date + INTERVAL '${days} days',
        updated_at = NOW()
      WHERE id = $1
    `, [rfiId]);

    // Log the extension request
    await db.query(`
      INSERT INTO rfi_history (rfi_id, action, details, performed_by, performed_at)
      VALUES ($1, 'extension_requested', $2, $3, NOW())
    `, [rfiId, JSON.stringify({ days }), userId]);
  }

  private async reviewSubmittal(
    submittalId: string,
    status: string,
    comments: string | null,
    userId: string
  ): Promise<void> {
    await db.query(`
      UPDATE submittals SET 
        status = $2,
        reviewed_by = $3,
        reviewed_at = NOW(),
        review_comments = $4,
        updated_at = NOW()
      WHERE id = $1
    `, [submittalId, status, userId, comments]);

    // Log the review
    await db.query(`
      INSERT INTO submittal_reviews (submittal_id, reviewer_id, status, comments, reviewed_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [submittalId, userId, status, comments]);
  }

  private async confirmDelivery(
    deliveryId: string,
    status: 'complete' | 'partial',
    userId: string,
    notes?: string
  ): Promise<void> {
    // Placeholder - would update delivery/purchase order
    logger.info('Delivery confirmed', { deliveryId, status, userId, notes });
  }

  private async reportDeliveryIssue(
    deliveryId: string,
    issue: string,
    userId: string
  ): Promise<void> {
    // Placeholder - would create issue record
    logger.info('Delivery issue reported', { deliveryId, issue, userId });
  }

  private async submitDailyLog(
    projectId: string,
    logData: {
      workerCount: number;
      weather: string;
      workDescription: string;
      issues: string | null;
    },
    userId: string
  ): Promise<void> {
    await db.query(`
      INSERT INTO daily_logs (
        project_id, log_date, weather_conditions, 
        work_completed, issues_delays, 
        created_by, created_at
      ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, NOW())
    `, [
      projectId,
      logData.weather,
      logData.workDescription,
      logData.issues,
      userId
    ]);

    // Also update workforce
    await db.query(`
      INSERT INTO daily_log_workforce (
        daily_log_id, trade, headcount, hours_worked
      ) 
      SELECT 
        (SELECT id FROM daily_logs WHERE project_id = $1 AND log_date = CURRENT_DATE LIMIT 1),
        'General',
        $2,
        8
    `, [projectId, logData.workerCount]);
  }

  private async saveUploadedPhoto(
    image: { id: string; mime_type: string; sha256: string },
    session: ConversationSession
  ): Promise<void> {
    // Placeholder - would download from WhatsApp API and save to storage
    logger.info('Photo upload saved', { 
      imageId: image.id, 
      projectId: session.projectId,
      userId: session.userId,
      location: session.data.lastLocation
    });
  }

  // -------------------------------------------------------------------------
  // Scheduled Notifications (Cron Jobs)
  // -------------------------------------------------------------------------

  /**
   * Send daily log reminders to all active project teams
   */
  async sendDailyLogReminders(): Promise<void> {
    try {
      // Get all active projects with team members who haven't submitted today
      const result = await db.query(`
        SELECT DISTINCT
          p.id as project_id,
          p.name as project_name,
          u.id as user_id,
          u.phone,
          u.full_name
        FROM projects p
        JOIN project_team_members ptm ON p.id = ptm.project_id
        JOIN users u ON ptm.user_id = u.id
        WHERE p.status = 'active'
          AND ptm.role IN ('project_manager', 'site_supervisor', 'foreman')
          AND u.phone IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM daily_logs dl
            WHERE dl.project_id = p.id
              AND dl.log_date = CURRENT_DATE
          )
      `);

      for (const row of result.rows) {
        await this.sendNotification({
          recipientPhone: row.phone,
          recipientName: row.full_name,
          notificationType: PMNotificationType.DAILY_LOG_REMINDER,
          projectId: row.project_id,
          projectName: row.project_name,
          data: {
            date: new Date().toLocaleDateString()
          },
          requiresResponse: true
        });

        // Store pending action for quick reply
        const session = this.getOrCreateSession(row.phone);
        session.projectId = row.project_id;
        session.userId = row.user_id;
        session.data.pendingAction = {
          type: 'daily_log_reminder',
          entityId: row.project_id,
          options: ['Submit Now', 'Remind Later']
        };
      }

      logger.info('Daily log reminders sent', { count: result.rows.length });
    } catch (error) {
      logger.error('Failed to send daily log reminders', { error });
    }
  }

  /**
   * Send overdue RFI reminders
   */
  async sendOverdueRFIReminders(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT 
          r.id as rfi_id,
          r.rfi_number,
          r.subject,
          r.due_date,
          CURRENT_DATE - r.due_date::date as days_overdue,
          p.id as project_id,
          p.name as project_name,
          u.phone,
          u.full_name
        FROM rfis r
        JOIN projects p ON r.project_id = p.id
        JOIN users u ON r.assigned_to = u.id
        WHERE r.status IN ('open', 'in_progress')
          AND r.due_date < CURRENT_DATE
          AND u.phone IS NOT NULL
      `);

      for (const row of result.rows) {
        await this.sendNotification({
          recipientPhone: row.phone,
          recipientName: row.full_name,
          notificationType: PMNotificationType.RFI_RESPONSE_NEEDED,
          projectId: row.project_id,
          projectName: row.project_name,
          data: {
            rfiNumber: row.rfi_number,
            subject: row.subject,
            daysOverdue: row.days_overdue
          }
        });
      }

      logger.info('Overdue RFI reminders sent', { count: result.rows.length });
    } catch (error) {
      logger.error('Failed to send overdue RFI reminders', { error });
    }
  }

  /**
   * Send upcoming delivery notifications
   */
  async sendDeliveryNotifications(): Promise<void> {
    // Implementation for delivery notifications
    logger.info('Delivery notifications check complete');
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const whatsappPMBotService = new WhatsAppPMBotService();
