/**
 * E-Sign Integration Service
 * 
 * Provides programmatic access to e-sign capabilities for all business services.
 * This is the ONLY interface business services should use to trigger e-sign workflows.
 * 
 * Now uses the integrated TypeScript e-sign services instead of HTTP calls.
 * 
 * @module services/e-sign/eSignIntegrationService
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../src/utils/logger';
import { pool } from '../../../src/database';
import {
  CreateEnvelopeInput,
  EnvelopeResult,
  EnvelopeStatus,
  WebhookRegistration,
  ESignSourceModule,
  IESignIntegrationService,
} from './types';
import { 
  createEnvelopeService, 
  EnvelopeStatus as InternalEnvelopeStatus 
} from '../';

// =============================================================================
// CONFIGURATION
// =============================================================================

const ESIGN_INTERNAL_API_KEY = process.env.ESIGN_INTERNAL_API_KEY || '';
const ESIGN_WEBHOOK_SECRET = process.env.ESIGN_WEBHOOK_SECRET || '';
const ESIGN_BASE_URL = process.env.ESIGN_MAGIC_LINK_BASE_URL || 'http://localhost:3000/sign';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ESignIntegrationService implements IESignIntegrationService {
  private envelopeService: ReturnType<typeof createEnvelopeService>;
  private apiKey: string;

  constructor() {
    this.envelopeService = createEnvelopeService(pool);
    this.apiKey = ESIGN_INTERNAL_API_KEY;
    
    if (!this.apiKey) {
      logger.warn('ESIGN_INTERNAL_API_KEY not set - e-sign integration may fail in production');
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

    // For now, we'll store documents as base64 in the envelope
    // TODO: In production, upload to MinIO and store URLs
    const documentPdfUrl = input.documents.length > 0 
      ? `data:${input.documents[0].mimeType};base64,${input.documents[0].content.toString('base64')}`
      : undefined;

    // Use a default organization ID - in practice this would come from the authenticated context
    const organizationId = input.sourceEntityId.split('-')[0] || 'default-org';
    const userId = 'system';

    const envelope = await this.envelopeService.createAndSendEnvelope(organizationId, userId, {
      name: input.subject,
      message: input.message,
      documentPdfUrl,
      contextType: input.sourceModule,
      contextEntityId: input.sourceEntityId,
      contextEntityName: input.sourceEntityType,
      signers: input.signers.map(signer => ({
        name: signer.name,
        email: signer.email,
        role: signer.role,
        order: signer.order,
      })),
      fields: input.fields.map(field => ({
        signerEmail: field.recipientEmail,
        type: field.type,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        required: field.required,
        label: field.label,
      })),
      expiresInDays: input.expiresInDays ?? 30,
      autoSend: input.autoSend ?? true,
    });

    // Get signers with their access tokens for signing URLs
    const fullEnvelope = await this.envelopeService.getEnvelopeById(envelope.id, organizationId);
    const signers = (fullEnvelope as any)?.signers || [];
    
    const signingUrls: Record<string, string> = {};
    for (const signer of signers) {
      if (signer.accessToken) {
        signingUrls[signer.email] = `${ESIGN_BASE_URL}/${signer.accessToken}`;
      }
    }

    return {
      envelopeId: envelope.id,
      status: this.mapStatus(envelope.status),
      signingUrls,
      embeddedSigningUrls: signingUrls,
      expiresAt: envelope.expiresAt,
      createdAt: envelope.createdAt,
    };
  }

  /**
   * Send an existing envelope for signing
   */
  async sendForSigning(envelopeId: string): Promise<void> {
    logger.info('Sending envelope for signing', { envelopeId });
    // In the current implementation, envelopes are auto-sent on creation
    // This method is a no-op but maintains interface compatibility
  }

  /**
   * Get signing URL for a specific recipient
   */
  async getSigningUrl(envelopeId: string, recipientEmail: string): Promise<string> {
    // Query the signer's access token from the database
    const result = await pool.query(
      `SELECT access_token FROM esign_signers 
       WHERE envelope_id = $1 AND email = $2`,
      [envelopeId, recipientEmail]
    );

    if (result.rows.length === 0) {
      throw new Error('Signer not found');
    }

    return `${ESIGN_BASE_URL}/${result.rows[0].access_token}`;
  }

  /**
   * Get embedded signing URL (for iframe integration)
   */
  async getEmbeddedSigningUrl(envelopeId: string, recipientEmail: string): Promise<string> {
    // Same as regular signing URL for now
    return this.getSigningUrl(envelopeId, recipientEmail);
  }

  /**
   * Get envelope status and details
   */
  async getEnvelopeStatus(envelopeId: string): Promise<EnvelopeResult> {
    logger.debug('Getting envelope status', { envelopeId });

    // Query envelope directly - we need to find it without knowing the org
    const result = await pool.query(
      `SELECT e.*, es.email, es.access_token 
       FROM esign_envelopes e
       LEFT JOIN esign_signers es ON es.envelope_id = e.id
       WHERE e.id = $1`,
      [envelopeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Envelope not found');
    }

    const envelope = result.rows[0];
    
    // Build signing URLs from signers
    const signingUrls: Record<string, string> = {};
    for (const row of result.rows) {
      if (row.email && row.access_token) {
        signingUrls[row.email] = `${ESIGN_BASE_URL}/${row.access_token}`;
      }
    }

    return {
      envelopeId: envelope.id,
      status: this.mapStatus(envelope.status),
      signingUrls,
      embeddedSigningUrls: signingUrls,
      expiresAt: envelope.expires_at ? new Date(envelope.expires_at) : undefined,
      createdAt: new Date(envelope.created_at),
    };
  }

  /**
   * Download signed document
   */
  async downloadSignedDocument(envelopeId: string): Promise<Buffer> {
    logger.info('Downloading signed document', { envelopeId });

    const result = await pool.query(
      `SELECT signed_pdf_url, document_pdf_url FROM esign_envelopes WHERE id = $1`,
      [envelopeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Envelope not found');
    }

    const pdfUrl = result.rows[0].signed_pdf_url || result.rows[0].document_pdf_url;
    
    if (!pdfUrl) {
      throw new Error('No document available');
    }

    // Handle base64 data URLs
    if (pdfUrl.startsWith('data:')) {
      const base64Data = pdfUrl.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    }

    // Handle external URLs (fetch from MinIO, etc.)
    const response = await fetch(pdfUrl);
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
    // TODO: Generate certificate of completion
    // For now, return the signed document
    return this.downloadSignedDocument(envelopeId);
  }

  /**
   * Void an envelope
   */
  async voidEnvelope(envelopeId: string, reason: string): Promise<void> {
    logger.info('Voiding envelope', { envelopeId, reason });

    // Find the organization for this envelope
    const result = await pool.query(
      `SELECT organization_id FROM esign_envelopes WHERE id = $1`,
      [envelopeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Envelope not found');
    }

    await this.envelopeService.voidEnvelope(
      envelopeId,
      result.rows[0].organization_id,
      'system',
      reason
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

    // Store webhook registration in database
    await pool.query(
      `INSERT INTO webhook_registrations (
        id, source_module, callback_url, events, secret
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (source_module) DO UPDATE SET
        callback_url = EXCLUDED.callback_url,
        events = EXCLUDED.events,
        secret = EXCLUDED.secret,
        updated_at = NOW()`,
      [
        uuidv4(),
        registration.sourceModule,
        registration.callbackUrl,
        JSON.stringify(registration.events),
        registration.secret || ESIGN_WEBHOOK_SECRET,
      ]
    );
  }

  /**
   * Unregister webhook for a module
   */
  async unregisterWebhook(sourceModule: ESignSourceModule): Promise<void> {
    logger.info('Unregistering e-sign webhook', { sourceModule });

    await pool.query(
      `DELETE FROM webhook_registrations WHERE source_module = $1`,
      [sourceModule]
    );
  }

  /**
   * Map internal status to external EnvelopeStatus
   */
  private mapStatus(status: InternalEnvelopeStatus | string): EnvelopeStatus {
    // Map to valid Postgres enum values: draft, sent, delivered, signed, completed, declined, voided, expired
    const statusStr = String(status).toLowerCase();
    const validStatuses = ['draft', 'sent', 'delivered', 'signed', 'completed', 'declined', 'voided', 'expired'];
    
    if (validStatuses.includes(statusStr)) {
      return statusStr as EnvelopeStatus;
    }
    // Map legacy values
    if (statusStr === 'pending') return 'sent' as EnvelopeStatus;
    if (statusStr === 'in_progress') return 'delivered' as EnvelopeStatus;
    return 'sent' as EnvelopeStatus;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const eSignIntegrationService = new ESignIntegrationService();
export default eSignIntegrationService;
