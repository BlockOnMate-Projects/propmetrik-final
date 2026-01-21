/**
 * WhatsApp Business Cloud API Service
 * 
 * Provides WhatsApp messaging capabilities for CRM Deal Management:
 * - Send text messages to contacts
 * - Send template messages (pre-approved)
 * - Send documents (contracts, proposals)
 * - Handle incoming webhooks
 * 
 * API Documentation: https://developers.facebook.com/docs/whatsapp/cloud-api/
 * 
 * FREE TIER: 1,000 service conversations/month
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../../src/config';
import { logger } from '../../src/utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface WhatsAppContact {
  phoneNumber: string; // Format: country code + number (e.g., "233201234567")
  name?: string;
}

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template' | 'document' | 'image';
  text?: {
    body: string;
    preview_url?: boolean;
  };
  template?: {
    name: string;
    language: { code: string };
    components?: TemplateComponent[];
  };
  document?: {
    link: string;
    filename: string;
    caption?: string;
  };
  image?: {
    link: string;
    caption?: string;
  };
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: TemplateParameter[];
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { link: string };
  document?: { link: string; filename: string };
}

export interface WhatsAppResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface WebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'button' | 'interactive';
          text?: { body: string };
          button?: { text: string; payload: string };
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string; message: string }>;
        }>;
      };
      field: string;
    }>;
  }>;
}

// ============================================================================
// Service Class
// ============================================================================

export class WhatsAppService {
  private client: AxiosInstance;
  private phoneNumberId: string;
  private enabled: boolean;

  constructor() {
    this.enabled = config.whatsapp.enabled;
    this.phoneNumberId = config.whatsapp.phoneNumberId;

    this.client = axios.create({
      baseURL: `${config.whatsapp.apiBaseUrl}/${config.whatsapp.apiVersion}`,
      headers: {
        'Authorization': `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if WhatsApp is configured
   */
  isEnabled(): boolean {
    return this.enabled && !!this.phoneNumberId;
  }

  /**
   * Format phone number to WhatsApp format (remove + and spaces)
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If starts with 0, assume Ghana and add 233
    if (cleaned.startsWith('0')) {
      cleaned = '233' + cleaned.substring(1);
    }
    
    return cleaned;
  }

  /**
   * Send a text message
   */
  async sendTextMessage(to: string, message: string): Promise<WhatsAppResponse | null> {
    if (!this.isEnabled()) {
      logger.warn('WhatsApp is not configured. Message not sent.');
      return null;
    }

    const formattedNumber = this.formatPhoneNumber(to);

    try {
      const response = await this.client.post<WhatsAppResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'text',
          text: {
            body: message,
            preview_url: true,
          },
        }
      );

      logger.info('WhatsApp message sent', {
        to: formattedNumber,
        messageId: response.data.messages?.[0]?.id,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp message', {
        to: formattedNumber,
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Send a template message (pre-approved by Meta)
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'en',
    components?: TemplateComponent[]
  ): Promise<WhatsAppResponse | null> {
    if (!this.isEnabled()) {
      logger.warn('WhatsApp is not configured. Template not sent.');
      return null;
    }

    const formattedNumber = this.formatPhoneNumber(to);

    try {
      const payload: any = {
        messaging_product: 'whatsapp',
        to: formattedNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      };

      if (components) {
        payload.template.components = components;
      }

      const response = await this.client.post<WhatsAppResponse>(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      logger.info('WhatsApp template sent', {
        to: formattedNumber,
        template: templateName,
        messageId: response.data.messages?.[0]?.id,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp template', {
        to: formattedNumber,
        template: templateName,
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Send a document (PDF, contract, etc.)
   */
  async sendDocument(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string
  ): Promise<WhatsAppResponse | null> {
    if (!this.isEnabled()) {
      logger.warn('WhatsApp is not configured. Document not sent.');
      return null;
    }

    const formattedNumber = this.formatPhoneNumber(to);

    try {
      const response = await this.client.post<WhatsAppResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'document',
          document: {
            link: documentUrl,
            filename: filename,
            caption: caption,
          },
        }
      );

      logger.info('WhatsApp document sent', {
        to: formattedNumber,
        filename,
        messageId: response.data.messages?.[0]?.id,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp document', {
        to: formattedNumber,
        filename,
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Verify webhook (for initial setup)
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === config.whatsapp.webhookVerifyToken) {
      logger.info('WhatsApp webhook verified');
      return challenge;
    }
    logger.warn('WhatsApp webhook verification failed', { mode, token });
    return null;
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhook(payload: WebhookPayload): Promise<void> {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;

        // Handle incoming messages
        if (value.messages) {
          for (const message of value.messages) {
            await this.handleIncomingMessage({
              from: message.from,
              messageId: message.id,
              timestamp: message.timestamp,
              type: message.type,
              text: message.text?.body,
              contactName: value.contacts?.[0]?.profile?.name,
            });
          }
        }

        // Handle status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await this.handleStatusUpdate({
              messageId: status.id,
              status: status.status,
              timestamp: status.timestamp,
              recipientId: status.recipient_id,
              errors: status.errors,
            });
          }
        }
      }
    }
  }

  /**
   * Handle incoming message (override in implementation)
   */
  private async handleIncomingMessage(message: {
    from: string;
    messageId: string;
    timestamp: string;
    type: string;
    text?: string;
    contactName?: string;
  }): Promise<void> {
    logger.info('Incoming WhatsApp message', message);
    
    // TODO: Match to CRM contact, create activity, notify agent
    // This will be implemented in Phase 5.7
  }

  /**
   * Handle status update (delivery receipts)
   */
  private async handleStatusUpdate(status: {
    messageId: string;
    status: string;
    timestamp: string;
    recipientId: string;
    errors?: Array<{ code: number; title: string; message: string }>;
  }): Promise<void> {
    logger.info('WhatsApp status update', status);
    
    // TODO: Update message status in database
    // This will be implemented in Phase 5.7
  }

  // ==========================================================================
  // CRM-Specific Message Templates
  // ==========================================================================

  /**
   * Send deal status update to contact
   */
  async sendDealStatusUpdate(
    contactPhone: string,
    contactName: string,
    dealTitle: string,
    newStatus: string,
    agentName: string
  ): Promise<WhatsAppResponse | null> {
    const message = `Hello ${contactName},\n\n` +
      `Your deal "${dealTitle}" has been updated to: ${newStatus}\n\n` +
      `If you have any questions, please reach out to your agent ${agentName}.\n\n` +
      `Best regards,\nPropMetrik Team`;

    return this.sendTextMessage(contactPhone, message);
  }

  /**
   * Send viewing appointment reminder
   */
  async sendViewingReminder(
    contactPhone: string,
    contactName: string,
    propertyAddress: string,
    viewingDateTime: Date,
    agentName: string,
    agentPhone: string
  ): Promise<WhatsAppResponse | null> {
    const dateStr = viewingDateTime.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeStr = viewingDateTime.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const message = `Hello ${contactName},\n\n` +
      `📅 Reminder: Property Viewing Tomorrow\n\n` +
      `📍 Location: ${propertyAddress}\n` +
      `🕐 Time: ${dateStr} at ${timeStr}\n` +
      `👤 Agent: ${agentName}\n` +
      `📞 Contact: ${agentPhone}\n\n` +
      `Please reply YES to confirm or contact your agent to reschedule.\n\n` +
      `PropMetrik`;

    return this.sendTextMessage(contactPhone, message);
  }

  /**
   * Send document for signature
   */
  async sendDocumentForSignature(
    contactPhone: string,
    contactName: string,
    documentName: string,
    signUrl: string
  ): Promise<WhatsAppResponse | null> {
    const message = `Hello ${contactName},\n\n` +
      `📄 A document is ready for your signature:\n\n` +
      `Document: ${documentName}\n\n` +
      `Click here to review and sign:\n${signUrl}\n\n` +
      `This link expires in 7 days.\n\n` +
      `PropMetrik`;

    return this.sendTextMessage(contactPhone, message);
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppService();
export default whatsappService;
