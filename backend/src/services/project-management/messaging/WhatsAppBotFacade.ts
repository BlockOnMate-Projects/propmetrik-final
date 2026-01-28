/**
 * WhatsApp Bot Facade
 * 
 * Phase 3.2: Unified facade for backward compatibility
 * 
 * Maintains the original whatsappBotService API while delegating
 * to the new focused services.
 * 
 * @module services/project-management/messaging/WhatsAppBotFacade
 */

import { 
  PMWhatsAppNotification, 
  WebhookPayload, 
  WhatsAppIncomingMessage,
  ConversationSession,
  CommandContext,
} from './types';
import { whatsAppTemplates } from './WhatsAppTemplates';
import { whatsAppCommandHandler } from './WhatsAppCommandHandler';
import { whatsAppNotificationService, NotificationResult, BulkNotificationResult } from './WhatsAppNotificationService';
import { pool } from '../../../database';

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

// In-memory session store (would use Redis in production)
const sessions = new Map<string, ConversationSession>();

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// =============================================================================
// FACADE IMPLEMENTATION
// =============================================================================

class WhatsAppBotFacadeImpl {
  // ==========================================================================
  // NOTIFICATIONS (delegated)
  // ==========================================================================

  async sendNotification(notification: PMWhatsAppNotification): Promise<boolean> {
    const result = await whatsAppNotificationService.sendNotification(notification);
    return result.success;
  }

  async sendBulkNotification(
    notifications: PMWhatsAppNotification[]
  ): Promise<{ successful: number; failed: number }> {
    const result = await whatsAppNotificationService.sendBulkNotification(notifications);
    return { successful: result.successful, failed: result.failed };
  }

  async sendDailyLogReminders(): Promise<void> {
    await whatsAppNotificationService.sendDailyLogReminders();
  }

  async sendOverdueRFIReminders(): Promise<void> {
    await whatsAppNotificationService.sendOverdueRFIReminders();
  }

  async sendDeliveryNotifications(): Promise<void> {
    await whatsAppNotificationService.sendDeliveryNotifications();
  }

  // ==========================================================================
  // WEBHOOK PROCESSING
  // ==========================================================================

  async processWebhook(payload: WebhookPayload): Promise<void> {
    if (payload.object !== 'whatsapp_business_account') {
      return;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages' && change.value.messages) {
          for (const message of change.value.messages) {
            await this.handleIncomingMessage(message);
          }
        }
      }
    }
  }

  // ==========================================================================
  // MESSAGE HANDLING
  // ==========================================================================

  private async handleIncomingMessage(message: WhatsAppIncomingMessage): Promise<void> {
    const phone = message.from;
    
    // Get or create session
    let session = this.getSession(phone);
    if (!session) {
      session = this.createSession(phone);
    }

    // Update session activity
    session.lastActivityAt = new Date();

    // Look up user by phone
    if (!session.userId) {
      const user = await this.findUserByPhone(phone);
      if (user) {
        session.userId = user.id;
      }
    }

    // Build command context
    const context: CommandContext = {
      phone,
      userId: session.userId,
      projectId: session.projectId,
      session,
    };

    // Handle based on message type
    switch (message.type) {
      case 'text':
        await this.handleTextMessage(message, context);
        break;
      case 'interactive':
        await this.handleInteractiveMessage(message, context);
        break;
      case 'button':
        await this.handleButtonMessage(message, context);
        break;
      case 'image':
        await this.handleImageMessage(message, context);
        break;
      case 'location':
        await this.handleLocationMessage(message, context);
        break;
    }
  }

  private async handleTextMessage(
    message: WhatsAppIncomingMessage,
    context: CommandContext
  ): Promise<void> {
    const text = message.text?.body || '';
    
    // Check if in active flow
    if (context.session?.currentFlow) {
      await this.continueFlow(text, context);
      return;
    }

    // Check for commands
    if (whatsAppCommandHandler.isCommand(text)) {
      const result = await whatsAppCommandHandler.executeCommand(text, context);
      await this.sendResponse(context.phone, result.message);
      
      if (result.continueFlow) {
        context.session!.currentFlow = text.split(' ')[0].toLowerCase();
        context.session!.flowStep = 1;
      }
      return;
    }

    // Default response
    await this.sendResponse(
      context.phone,
      whatsAppTemplates.buildHelpMessage()
    );
  }

  private async handleInteractiveMessage(
    message: WhatsAppIncomingMessage,
    context: CommandContext
  ): Promise<void> {
    const reply = message.interactive?.button_reply || message.interactive?.list_reply;
    if (reply) {
      // Handle the action
      await this.handleAction(reply.id, context);
    }
  }

  private async handleButtonMessage(
    message: WhatsAppIncomingMessage,
    context: CommandContext
  ): Promise<void> {
    const payload = message.button?.payload;
    if (payload) {
      await this.handleAction(payload, context);
    }
  }

  private async handleImageMessage(
    message: WhatsAppIncomingMessage,
    context: CommandContext
  ): Promise<void> {
    if (!context.projectId) {
      await this.sendResponse(
        context.phone,
        'Please select a project first with *PROJECTS* before uploading photos.'
      );
      return;
    }

    // Would process image upload
    await this.sendResponse(
      context.phone,
      whatsAppTemplates.buildSuccessMessage(
        'Photo Received',
        'Your photo has been saved to the project.'
      )
    );
  }

  private async handleLocationMessage(
    message: WhatsAppIncomingMessage,
    context: CommandContext
  ): Promise<void> {
    const location = message.location;
    if (location && context.session?.currentFlow === 'daily_log') {
      context.session.data.location = {
        latitude: location.latitude,
        longitude: location.longitude,
      };
      await this.sendResponse(
        context.phone,
        '📍 Location recorded!'
      );
    }
  }

  private async handleAction(action: string, context: CommandContext): Promise<void> {
    const [actionType, ...params] = action.split('_');
    
    switch (action) {
      case 'rfi_accept':
      case 'rfi_extend':
      case 'rfi_view':
        // Handle RFI actions
        break;
      case 'submittal_approve':
      case 'submittal_revise':
      case 'submittal_reject':
        // Handle submittal actions
        break;
      case 'delivery_confirm':
      case 'delivery_issue':
        // Handle delivery actions
        break;
      case 'daily_log_start':
        context.session!.currentFlow = 'daily_log';
        context.session!.flowStep = 1;
        await this.sendResponse(
          context.phone,
          '📝 Starting daily log...\n\nWhat\'s the weather like on site?'
        );
        break;
    }
  }

  private async continueFlow(text: string, context: CommandContext): Promise<void> {
    const flow = context.session?.currentFlow;
    const step = context.session?.flowStep || 1;

    // Handle flow-specific logic
    if (flow === 'daily_log') {
      await this.continueDailyLogFlow(text, step, context);
    }
  }

  private async continueDailyLogFlow(
    text: string,
    step: number,
    context: CommandContext
  ): Promise<void> {
    const session = context.session!;

    switch (step) {
      case 1: // Weather
        session.data.weather = text;
        session.flowStep = 2;
        await this.sendResponse(
          context.phone,
          '*Step 2/5: Workers on Site*\n\nHow many workers are on site today?'
        );
        break;
      case 2: // Workers
        session.data.workerCount = parseInt(text) || 0;
        session.flowStep = 3;
        await this.sendResponse(
          context.phone,
          '*Step 3/5: Work Completed*\n\nDescribe the work completed today.'
        );
        break;
      case 3: // Work completed
        session.data.workCompleted = text;
        session.flowStep = 4;
        await this.sendResponse(
          context.phone,
          '*Step 4/5: Issues or Delays*\n\nAny issues or delays? Reply *NONE* if everything is OK.'
        );
        break;
      case 4: // Issues
        session.data.issues = text.toLowerCase() === 'none' ? null : text;
        session.flowStep = 5;
        await this.sendResponse(
          context.phone,
          '*Step 5/5: Photos*\n\nWould you like to attach photos? Send them now or reply *DONE* to finish.'
        );
        break;
      case 5: // Photos/Done
        if (text.toLowerCase() === 'done') {
          // Submit the log
          await this.submitDailyLog(session.data, context);
          session.currentFlow = undefined;
          session.flowStep = undefined;
          session.data = {};
        }
        break;
    }
  }

  private async submitDailyLog(data: any, context: CommandContext): Promise<void> {
    // Would create daily log entry
    await this.sendResponse(
      context.phone,
      whatsAppTemplates.buildSuccessMessage(
        'Daily Log Submitted',
        `Weather: ${data.weather}\n` +
        `Workers: ${data.workerCount}\n` +
        `Work: ${data.workCompleted}\n` +
        `Issues: ${data.issues || 'None'}`
      )
    );
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  private getSession(phone: string): ConversationSession | undefined {
    const session = sessions.get(phone);
    if (session) {
      // Check if expired
      if (Date.now() - session.lastActivityAt.getTime() > SESSION_TIMEOUT_MS) {
        sessions.delete(phone);
        return undefined;
      }
    }
    return session;
  }

  private createSession(phone: string): ConversationSession {
    const session: ConversationSession = {
      phone,
      data: {},
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    sessions.set(phone, session);
    return session;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async findUserByPhone(phone: string): Promise<any> {
    const result = await pool.query(
      `SELECT id, name, email FROM users WHERE phone = $1`,
      [phone]
    );
    return result.rows[0];
  }

  private async sendResponse(phone: string, message: string): Promise<void> {
    // Would send via WhatsApp API
    console.log(`[WhatsApp] To: ${phone}\n${message}`);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const whatsAppBotFacade = new WhatsAppBotFacadeImpl();
