/**
 * E-Sign Integration Service
 * 
 * Provides programmatic access to e-sign capabilities for all business services.
 * This is the ONLY interface business services should use to trigger e-sign workflows.
 * 
 * @module services/e-sign/eSignIntegrationService
 */

import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  CreateEnvelopeInput,
  EnvelopeResult,
  EnvelopeStatus,
  WebhookRegistration,
  ESignSourceModule,
  IESignIntegrationService,
} from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

const ESIGN_SERVICE_URL = process.env.ESIGN_SERVICE_URL || 'http://localhost:8002';
const ESIGN_INTERNAL_API_KEY = process.env.ESIGN_INTERNAL_API_KEY || '';
const ESIGN_WEBHOOK_SECRET = process.env.ESIGN_WEBHOOK_SECRET || '';

// =============================================================================
// HELPER TYPES
// =============================================================================

interface ESignAPIDocument {
  name: string;
  content_base64: string;
  mime_type: string;
  source: string;
}

interface ESignAPISigner {
  name: string;
  email: string;
  role: string;
  order: number;
}

interface ESignAPIField {
  type: string;
  recipient_email: string;
  document_index: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
}

interface ESignAPIEnvelopeInput {
  subject: string;
  message: string;
  documents: ESignAPIDocument[];
  signers: ESignAPISigner[];
  fields: ESignAPIField[];
  source_module: string;
  source_entity_type: string;
  source_entity_id: string;
  callback_url?: string;
  expires_in_days: number;
  auto_send: boolean;
}

interface ESignAPIEnvelopeResponse {
  envelope_id: string;
  status: string;
  signing_urls: Record<string, string>;
  embedded_signing_urls?: Record<string, string>;
  expires_at?: string;
  created_at: string;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ESignIntegrationService implements IESignIntegrationService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = ESIGN_SERVICE_URL;
    this.apiKey = ESIGN_INTERNAL_API_KEY;
    
    if (!this.apiKey) {
      logger.warn('ESIGN_INTERNAL_API_KEY not set - e-sign integration will fail in production');
    }
  }

  /**
   * Make authenticated request to e-sign service
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': this.apiKey,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('E-Sign API error', {
          url,
          status: response.status,
          error: errorText,
        });
        throw new Error(`E-Sign API error: ${response.status} - ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      logger.error('E-Sign API request failed', { url, error });
      throw error;
    }
  }

  /**
   * Create an envelope and optionally send for signing
   */
  async createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeResult> {
    logger.info('Creating e-sign envelope', {
      subject: input.subject,
      sourceModule: input.sourceModule,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      signerCount: input.signers.length,
      documentCount: input.documents.length,
    });

    // Transform to API format
    const apiInput: ESignAPIEnvelopeInput = {
      subject: input.subject,
      message: input.message || '',
      documents: input.documents.map(doc => ({
        name: doc.name,
        content_base64: doc.content.toString('base64'),
        mime_type: doc.mimeType,
        source: doc.source,
      })),
      signers: input.signers.map(signer => ({
        name: signer.name,
        email: signer.email,
        role: signer.role,
        order: signer.order,
      })),
      fields: input.fields.map(field => ({
        type: field.type,
        recipient_email: field.recipientEmail,
        document_index: field.documentIndex,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        required: field.required,
        label: field.label,
      })),
      source_module: input.sourceModule,
      source_entity_type: input.sourceEntityType,
      source_entity_id: input.sourceEntityId,
      callback_url: input.callbackUrl,
      expires_in_days: input.expiresInDays ?? 30,
      auto_send: input.autoSend ?? true,
    };

    const response = await this.request<ESignAPIEnvelopeResponse>(
      'POST',
      '/programmatic/envelopes/create',
      apiInput
    );

    return this.mapEnvelopeResponse(response);
  }

  /**
   * Send an existing envelope for signing
   */
  async sendForSigning(envelopeId: string): Promise<void> {
    logger.info('Sending envelope for signing', { envelopeId });

    await this.request<{ success: boolean }>(
      'POST',
      `/programmatic/envelopes/${envelopeId}/send`,
      {}
    );
  }

  /**
   * Get signing URL for a specific recipient
   */
  async getSigningUrl(envelopeId: string, recipientEmail: string): Promise<string> {
    const response = await this.request<{ signing_url: string }>(
      'GET',
      `/programmatic/envelopes/${envelopeId}/signing-url?email=${encodeURIComponent(recipientEmail)}`
    );

    return response.signing_url;
  }

  /**
   * Get embedded signing URL (for iframe integration)
   */
  async getEmbeddedSigningUrl(envelopeId: string, recipientEmail: string): Promise<string> {
    const response = await this.request<{ embedded_url: string }>(
      'GET',
      `/programmatic/envelopes/${envelopeId}/embedded-signing?email=${encodeURIComponent(recipientEmail)}`
    );

    return response.embedded_url;
  }

  /**
   * Get envelope status and details
   */
  async getEnvelopeStatus(envelopeId: string): Promise<EnvelopeResult> {
    logger.debug('Getting envelope status', { envelopeId });

    const response = await this.request<ESignAPIEnvelopeResponse>(
      'GET',
      `/programmatic/envelopes/${envelopeId}`
    );

    return this.mapEnvelopeResponse(response);
  }

  /**
   * Download signed document
   */
  async downloadSignedDocument(envelopeId: string): Promise<Buffer> {
    logger.info('Downloading signed document', { envelopeId });

    const url = `${this.baseUrl}/envelopes/${envelopeId}/document`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Internal-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download document: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Download certificate of completion
   */
  async downloadCertificate(envelopeId: string): Promise<Buffer> {
    logger.info('Downloading certificate', { envelopeId });

    const url = `${this.baseUrl}/envelopes/${envelopeId}/certificate`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Internal-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download certificate: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Void an envelope
   */
  async voidEnvelope(envelopeId: string, reason: string): Promise<void> {
    logger.info('Voiding envelope', { envelopeId, reason });

    await this.request<{ success: boolean }>(
      'POST',
      `/programmatic/envelopes/${envelopeId}/void`,
      { reason }
    );
  }

  /**
   * Register a webhook for a module
   */
  async registerWebhook(registration: WebhookRegistration): Promise<void> {
    logger.info('Registering e-sign webhook', {
      sourceModule: registration.sourceModule,
      callbackUrl: registration.callbackUrl,
      events: registration.events,
    });

    await this.request<{ success: boolean }>(
      'POST',
      '/webhooks/register',
      {
        source_module: registration.sourceModule,
        callback_url: registration.callbackUrl,
        events: registration.events,
        secret: registration.secret || ESIGN_WEBHOOK_SECRET,
      }
    );
  }

  /**
   * Unregister webhook for a module
   */
  async unregisterWebhook(sourceModule: ESignSourceModule): Promise<void> {
    logger.info('Unregistering e-sign webhook', { sourceModule });

    await this.request<{ success: boolean }>(
      'DELETE',
      `/webhooks/register/${sourceModule}`
    );
  }

  /**
   * Map API response to EnvelopeResult
   */
  private mapEnvelopeResponse(response: ESignAPIEnvelopeResponse): EnvelopeResult {
    return {
      envelopeId: response.envelope_id,
      status: response.status as EnvelopeStatus,
      signingUrls: response.signing_urls,
      embeddedSigningUrls: response.embedded_signing_urls,
      expiresAt: response.expires_at ? new Date(response.expires_at) : undefined,
      createdAt: new Date(response.created_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const eSignIntegrationService = new ESignIntegrationService();
export default eSignIntegrationService;
