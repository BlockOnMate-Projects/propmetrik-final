import { logger } from '../../../src/utils/logger';
import { config } from '../../../src/config';
import axios from 'axios';

export interface WhatsAppMessage {
  to: string;
  body: string;
  mediaUrl?: string;
  templateName?: string;
  templateParams?: string[];
}

export class WhatsAppService {
  private static instance: WhatsAppService;
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly phoneNumberId: string;

  private constructor() {
    // These should be in your .env / config
    this.apiUrl = config.whatsapp?.apiUrl || 'https://graph.facebook.com/v17.0';
    this.apiToken = config.whatsapp?.apiToken || process.env.WHATSAPP_API_TOKEN || 'mock-token';
    this.phoneNumberId = config.whatsapp?.phoneNumberId || process.env.WHATSAPP_PHONE_ID || 'mock-phone-id';
  }

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  /**
   * Send a text message via WhatsApp
   */
  public async sendMessage(to: string, body: string): Promise<boolean> {
    try {
      if (this.isMock()) {
        logger.info(`[MOCK] Sending WhatsApp to ${to}: ${body}`);
        return true;
      }

      await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: body },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`WhatsApp message sent to ${to}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp message', {
        to,
        error: error.response?.data || error.message,
      });
      return false;
    }
  }

  /**
   * Send a template message (recommended for initiating conversations)
   */
  public async sendTemplate(to: string, templateName: string, components: any[] = []): Promise<boolean> {
    try {
      if (this.isMock()) {
        logger.info(`[MOCK] Sending WhatsApp Template ${templateName} to ${to} with params: ${JSON.stringify(components)}`);
        return true;
      }

      await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en_US' },
            components: components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      return true;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp template', {
        to,
        template: templateName,
        error: error.response?.data || error.message,
      });
      return false;
    }
  }

  private isMock(): boolean {
    return this.apiToken === 'mock-token' || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  }
}

export const whatsappService = WhatsAppService.getInstance();
