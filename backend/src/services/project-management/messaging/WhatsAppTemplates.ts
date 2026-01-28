/**
 * WhatsApp Message Templates Service
 * 
 * Phase 3.2: Split whatsappBotService
 * 
 * Generates WhatsApp message templates for various PM notifications.
 * Separated from bot logic for easier testing and maintenance.
 * 
 * @module services/project-management/messaging/WhatsAppTemplates
 */

import { PMNotificationType, NotificationTemplateContext, ResponseOption } from './types';

// =============================================================================
// TEMPLATE CONFIGURATIONS
// =============================================================================

interface TemplateConfig {
  emoji: string;
  subject: string;
  buildMessage: (context: NotificationTemplateContext) => string;
  responseOptions?: ResponseOption[];
}

const TEMPLATE_CONFIG: Record<PMNotificationType, TemplateConfig> = {
  // Project Updates
  [PMNotificationType.PROJECT_STARTED]: {
    emoji: '🚀',
    subject: 'Project Started',
    buildMessage: (ctx) => 
      `🚀 *Project Started!*\n\n` +
      `Project *${ctx.projectName}* has officially started.\n\n` +
      `📍 Location: ${ctx.location || 'TBD'}\n` +
      `👷 Site Manager: ${ctx.siteManager || 'TBD'}\n` +
      `📅 Target Completion: ${ctx.targetDate || 'TBD'}`,
  },
  
  [PMNotificationType.PROJECT_MILESTONE]: {
    emoji: '🎯',
    subject: 'Milestone Reached',
    buildMessage: (ctx) => 
      `🎯 *Milestone Reached!*\n\n` +
      `Project *${ctx.projectName}*\n\n` +
      `✅ Milestone: ${ctx.milestoneName}\n` +
      `📊 Progress: ${ctx.progress}%`,
  },
  
  [PMNotificationType.PROJECT_DELAYED]: {
    emoji: '⚠️',
    subject: 'Project Delay Alert',
    buildMessage: (ctx) => 
      `⚠️ *Project Delay Alert*\n\n` +
      `Project *${ctx.projectName}* is experiencing delays.\n\n` +
      `📅 Original Date: ${ctx.originalDate}\n` +
      `📅 New Date: ${ctx.newDate}\n` +
      `📝 Reason: ${ctx.reason || 'Not specified'}`,
  },
  
  [PMNotificationType.PROJECT_COMPLETED]: {
    emoji: '🎉',
    subject: 'Project Completed',
    buildMessage: (ctx) => 
      `🎉 *Project Completed!*\n\n` +
      `Project *${ctx.projectName}* has been completed!\n\n` +
      `📊 Final Progress: 100%\n` +
      `📅 Completion Date: ${ctx.completionDate}`,
  },

  // RFI Notifications
  [PMNotificationType.RFI_CREATED]: {
    emoji: '❓',
    subject: 'New RFI Created',
    buildMessage: (ctx) => 
      `❓ *New RFI Created*\n\n` +
      `Project: ${ctx.projectName}\n` +
      `RFI #${ctx.rfiNumber}: ${ctx.rfiSubject}\n\n` +
      `Created by: ${ctx.createdBy}\n` +
      `Due: ${ctx.dueDate}`,
  },
  
  [PMNotificationType.RFI_ASSIGNED]: {
    emoji: '📋',
    subject: 'RFI Assigned to You',
    buildMessage: (ctx) => 
      `📋 *RFI Assigned to You*\n\n` +
      `Hi ${ctx.recipientName},\n\n` +
      `You've been assigned RFI #${ctx.rfiNumber}:\n` +
      `"${ctx.rfiSubject}"\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Due: ${ctx.dueDate}\n\n` +
      `Reply *ACCEPT* to acknowledge or *EXTEND* if you need more time.`,
    responseOptions: [
      { key: 'accept', label: 'Accept', action: 'rfi_accept' },
      { key: 'extend', label: 'Request Extension', action: 'rfi_extend' },
      { key: 'view', label: 'View Details', action: 'rfi_view' },
    ],
  },
  
  [PMNotificationType.RFI_RESPONSE_NEEDED]: {
    emoji: '🔔',
    subject: 'RFI Response Needed',
    buildMessage: (ctx) => 
      `🔔 *RFI Response Needed*\n\n` +
      `RFI #${ctx.rfiNumber} is awaiting your response.\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Subject: ${ctx.rfiSubject}\n` +
      `Due: ${ctx.dueDate}\n` +
      `Days remaining: ${ctx.daysRemaining}`,
    responseOptions: [
      { key: 'respond', label: 'Respond Now', action: 'rfi_respond' },
      { key: 'view', label: 'View Details', action: 'rfi_view' },
    ],
  },
  
  [PMNotificationType.RFI_ANSWERED]: {
    emoji: '✅',
    subject: 'RFI Answered',
    buildMessage: (ctx) => 
      `✅ *RFI Answered*\n\n` +
      `RFI #${ctx.rfiNumber} has been answered.\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Answered by: ${ctx.answeredBy}\n\n` +
      `Response: ${ctx.response}`,
  },

  // Submittal Notifications
  [PMNotificationType.SUBMITTAL_SUBMITTED]: {
    emoji: '📄',
    subject: 'Submittal Received',
    buildMessage: (ctx) => 
      `📄 *New Submittal Received*\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Submittal #${ctx.submittalNumber}: ${ctx.submittalTitle}\n\n` +
      `Submitted by: ${ctx.submittedBy}\n` +
      `Review due: ${ctx.reviewDue}`,
  },
  
  [PMNotificationType.SUBMITTAL_ASSIGNED]: {
    emoji: '👁️',
    subject: 'Submittal Review Assigned',
    buildMessage: (ctx) => 
      `👁️ *Submittal Review Assigned*\n\n` +
      `Hi ${ctx.recipientName},\n\n` +
      `Please review Submittal #${ctx.submittalNumber}:\n` +
      `"${ctx.submittalTitle}"\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Review due: ${ctx.reviewDue}`,
    responseOptions: [
      { key: 'approve', label: '✅ Approve', action: 'submittal_approve' },
      { key: 'revise', label: '🔄 Revise & Resubmit', action: 'submittal_revise' },
      { key: 'reject', label: '❌ Reject', action: 'submittal_reject' },
    ],
  },
  
  [PMNotificationType.SUBMITTAL_APPROVED]: {
    emoji: '✅',
    subject: 'Submittal Approved',
    buildMessage: (ctx) => 
      `✅ *Submittal Approved*\n\n` +
      `Submittal #${ctx.submittalNumber} has been approved!\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Approved by: ${ctx.approvedBy}`,
  },
  
  [PMNotificationType.SUBMITTAL_REJECTED]: {
    emoji: '❌',
    subject: 'Submittal Rejected',
    buildMessage: (ctx) => 
      `❌ *Submittal Rejected*\n\n` +
      `Submittal #${ctx.submittalNumber} has been rejected.\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Reason: ${ctx.reason}`,
  },
  
  [PMNotificationType.SUBMITTAL_REVISION_NEEDED]: {
    emoji: '🔄',
    subject: 'Submittal Revision Needed',
    buildMessage: (ctx) => 
      `🔄 *Revision Needed*\n\n` +
      `Submittal #${ctx.submittalNumber} needs revision.\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Comments: ${ctx.comments}`,
  },

  // Change Order Notifications
  [PMNotificationType.CHANGE_ORDER_CREATED]: {
    emoji: '📝',
    subject: 'Change Order Created',
    buildMessage: (ctx) => 
      `📝 *New Change Order*\n\n` +
      `Project: ${ctx.projectName}\n` +
      `CO #${ctx.changeOrderNumber}\n\n` +
      `Description: ${ctx.description}\n` +
      `Amount: ${ctx.currency || 'GHS'} ${ctx.amount}`,
  },
  
  [PMNotificationType.CHANGE_ORDER_APPROVED]: {
    emoji: '✅',
    subject: 'Change Order Approved',
    buildMessage: (ctx) => 
      `✅ *Change Order Approved*\n\n` +
      `CO #${ctx.changeOrderNumber} approved.\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Amount: ${ctx.currency || 'GHS'} ${ctx.amount}`,
  },
  
  [PMNotificationType.CHANGE_ORDER_REJECTED]: {
    emoji: '❌',
    subject: 'Change Order Rejected',
    buildMessage: (ctx) => 
      `❌ *Change Order Rejected*\n\n` +
      `CO #${ctx.changeOrderNumber} rejected.\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Reason: ${ctx.reason}`,
  },

  // Daily Operations
  [PMNotificationType.DAILY_LOG_REMINDER]: {
    emoji: '📝',
    subject: 'Daily Log Reminder',
    buildMessage: (ctx) => 
      `📝 *Daily Log Reminder*\n\n` +
      `Hi ${ctx.recipientName},\n\n` +
      `Don't forget to submit your daily log for:\n` +
      `*${ctx.projectName}*\n\n` +
      `Reply *LOG* to start your daily log.`,
    responseOptions: [
      { key: 'log', label: '📝 Start Log', action: 'daily_log_start' },
      { key: 'skip', label: '⏭️ Skip Today', action: 'daily_log_skip' },
    ],
  },
  
  [PMNotificationType.DAILY_LOG_SUBMITTED]: {
    emoji: '✅',
    subject: 'Daily Log Submitted',
    buildMessage: (ctx) => 
      `✅ *Daily Log Submitted*\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Date: ${ctx.logDate}\n` +
      `Submitted by: ${ctx.submittedBy}`,
  },

  // Delivery & Materials
  [PMNotificationType.DELIVERY_SCHEDULED]: {
    emoji: '🚚',
    subject: 'Delivery Scheduled',
    buildMessage: (ctx) => 
      `🚚 *Delivery Scheduled*\n\n` +
      `Project: ${ctx.projectName}\n\n` +
      `📦 ${ctx.itemDescription}\n` +
      `📅 Date: ${ctx.deliveryDate}\n` +
      `🕐 Time: ${ctx.deliveryTime}\n` +
      `🚛 Supplier: ${ctx.supplierName}`,
  },
  
  [PMNotificationType.DELIVERY_ARRIVED]: {
    emoji: '📦',
    subject: 'Delivery Arrived',
    buildMessage: (ctx) => 
      `📦 *Delivery Arrived*\n\n` +
      `${ctx.itemDescription} has arrived at:\n` +
      `*${ctx.projectName}*\n\n` +
      `Please inspect and confirm receipt.`,
    responseOptions: [
      { key: 'confirm', label: '✅ Confirm', action: 'delivery_confirm' },
      { key: 'issue', label: '⚠️ Report Issue', action: 'delivery_issue' },
    ],
  },
  
  [PMNotificationType.DELIVERY_CONFIRMATION_NEEDED]: {
    emoji: '⏳',
    subject: 'Delivery Confirmation Needed',
    buildMessage: (ctx) => 
      `⏳ *Delivery Confirmation Needed*\n\n` +
      `Please confirm receipt of:\n` +
      `📦 ${ctx.itemDescription}\n\n` +
      `Project: ${ctx.projectName}`,
    responseOptions: [
      { key: 'confirm', label: '✅ Confirm', action: 'delivery_confirm' },
      { key: 'issue', label: '⚠️ Issue', action: 'delivery_issue' },
    ],
  },

  // Safety & Inspections
  [PMNotificationType.SAFETY_INCIDENT]: {
    emoji: '🚨',
    subject: 'Safety Incident',
    buildMessage: (ctx) => 
      `🚨 *SAFETY INCIDENT*\n\n` +
      `Project: ${ctx.projectName}\n\n` +
      `Type: ${ctx.incidentType}\n` +
      `Severity: ${ctx.severity}\n` +
      `Description: ${ctx.description}\n\n` +
      `Reported by: ${ctx.reportedBy}`,
  },
  
  [PMNotificationType.INSPECTION_SCHEDULED]: {
    emoji: '🔍',
    subject: 'Inspection Scheduled',
    buildMessage: (ctx) => 
      `🔍 *Inspection Scheduled*\n\n` +
      `Project: ${ctx.projectName}\n\n` +
      `Type: ${ctx.inspectionType}\n` +
      `Date: ${ctx.inspectionDate}\n` +
      `Inspector: ${ctx.inspector}`,
  },
  
  [PMNotificationType.INSPECTION_PASSED]: {
    emoji: '✅',
    subject: 'Inspection Passed',
    buildMessage: (ctx) => 
      `✅ *Inspection Passed*\n\n` +
      `${ctx.inspectionType} inspection passed!\n\n` +
      `Project: ${ctx.projectName}`,
  },
  
  [PMNotificationType.INSPECTION_FAILED]: {
    emoji: '❌',
    subject: 'Inspection Failed',
    buildMessage: (ctx) => 
      `❌ *Inspection Failed*\n\n` +
      `${ctx.inspectionType} inspection failed.\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Issues: ${ctx.issues}`,
  },

  // Budget & Payments
  [PMNotificationType.BUDGET_THRESHOLD_WARNING]: {
    emoji: '💰',
    subject: 'Budget Warning',
    buildMessage: (ctx) => 
      `💰 *Budget Warning*\n\n` +
      `Project: ${ctx.projectName}\n\n` +
      `⚠️ ${ctx.budgetCategory} is at ${ctx.percentUsed}% of budget.\n` +
      `Remaining: ${ctx.currency || 'GHS'} ${ctx.remaining}`,
  },
  
  [PMNotificationType.PAYMENT_DUE]: {
    emoji: '💵',
    subject: 'Payment Due',
    buildMessage: (ctx) => 
      `💵 *Payment Due*\n\n` +
      `Project: ${ctx.projectName}\n\n` +
      `Amount: ${ctx.currency || 'GHS'} ${ctx.amount}\n` +
      `Due: ${ctx.dueDate}\n` +
      `To: ${ctx.payeeName}`,
  },
  
  [PMNotificationType.PAYMENT_RECEIVED]: {
    emoji: '✅',
    subject: 'Payment Received',
    buildMessage: (ctx) => 
      `✅ *Payment Received*\n\n` +
      `Project: ${ctx.projectName}\n\n` +
      `Amount: ${ctx.currency || 'GHS'} ${ctx.amount}\n` +
      `From: ${ctx.payerName}`,
  },

  // General
  [PMNotificationType.TASK_ASSIGNED]: {
    emoji: '📋',
    subject: 'Task Assigned',
    buildMessage: (ctx) => 
      `📋 *Task Assigned*\n\n` +
      `Hi ${ctx.recipientName},\n\n` +
      `New task: ${ctx.taskName}\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Due: ${ctx.dueDate}`,
  },
  
  [PMNotificationType.TASK_DUE_SOON]: {
    emoji: '⏰',
    subject: 'Task Due Soon',
    buildMessage: (ctx) => 
      `⏰ *Task Due Soon*\n\n` +
      `Task "${ctx.taskName}" is due in ${ctx.daysRemaining} day(s).\n\n` +
      `Project: ${ctx.projectName}`,
  },
  
  [PMNotificationType.PHOTO_UPLOADED]: {
    emoji: '📸',
    subject: 'Photo Uploaded',
    buildMessage: (ctx) => 
      `📸 *Photo Uploaded*\n\n` +
      `Project: ${ctx.projectName}\n` +
      `Uploaded by: ${ctx.uploadedBy}\n` +
      `Category: ${ctx.category}`,
  },
  
  [PMNotificationType.PUNCH_LIST_ITEM]: {
    emoji: '🔧',
    subject: 'Punch List Item',
    buildMessage: (ctx) => 
      `🔧 *Punch List Item*\n\n` +
      `Project: ${ctx.projectName}\n\n` +
      `Location: ${ctx.location}\n` +
      `Issue: ${ctx.description}\n` +
      `Priority: ${ctx.priority}`,
  },
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class WhatsAppTemplatesServiceImpl {
  /**
   * Build a message for a notification type.
   */
  buildMessage(
    notificationType: PMNotificationType,
    context: NotificationTemplateContext
  ): { message: string; responseOptions?: ResponseOption[] } {
    const config = TEMPLATE_CONFIG[notificationType];
    
    if (!config) {
      return {
        message: `📬 *Notification*\n\nProject: ${context.projectName}\n\n${JSON.stringify(context)}`,
      };
    }

    return {
      message: config.buildMessage(context),
      responseOptions: config.responseOptions,
    };
  }

  /**
   * Get emoji for notification type.
   */
  getEmoji(notificationType: PMNotificationType): string {
    return TEMPLATE_CONFIG[notificationType]?.emoji || '📬';
  }

  /**
   * Get subject for notification type.
   */
  getSubject(notificationType: PMNotificationType): string {
    return TEMPLATE_CONFIG[notificationType]?.subject || 'Notification';
  }

  /**
   * Check if notification type has response options.
   */
  hasResponseOptions(notificationType: PMNotificationType): boolean {
    return !!TEMPLATE_CONFIG[notificationType]?.responseOptions;
  }

  /**
   * Get available response options for notification type.
   */
  getResponseOptions(notificationType: PMNotificationType): ResponseOption[] {
    return TEMPLATE_CONFIG[notificationType]?.responseOptions || [];
  }

  /**
   * Build help message listing available commands.
   */
  buildHelpMessage(): string {
    return (
      `🤖 *PropMetrik PM Bot Commands*\n\n` +
      `📊 *STATUS* - View project status\n` +
      `📋 *RFI* - View pending RFIs\n` +
      `📄 *SUBMITTALS* - View pending submittals\n` +
      `🚚 *DELIVERIES* - View upcoming deliveries\n` +
      `📝 *LOG* - Start daily log\n` +
      `🌤️ *WEATHER* - Get site weather\n` +
      `💰 *BUDGET* - View budget summary\n` +
      `📸 *PHOTO* - Upload site photo\n` +
      `❓ *HELP* - Show this help message\n\n` +
      `Type any command to get started!`
    );
  }

  /**
   * Build error message for user.
   */
  buildErrorMessage(error: string): string {
    return `❌ *Error*\n\n${error}\n\nType *HELP* for available commands.`;
  }

  /**
   * Build success message.
   */
  buildSuccessMessage(action: string, details?: string): string {
    let message = `✅ *${action}*`;
    if (details) {
      message += `\n\n${details}`;
    }
    return message;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const whatsAppTemplates = new WhatsAppTemplatesServiceImpl();
