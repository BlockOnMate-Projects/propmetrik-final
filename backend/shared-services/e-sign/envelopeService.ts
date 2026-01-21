/**
 * E-Sign Envelope Service
 * Core service for managing e-sign envelopes, signers, and fields.
 * DocuSign-like electronic signature functionality.
 */

import crypto from 'crypto';
import { Pool } from 'pg';
import { emailService } from './emailService';
import { reminderService } from './reminderService';
import { logger } from '../../src/utils/logger';

// Enums
export enum EnvelopeStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  DELIVERED = 'delivered',
  SIGNED = 'signed',
  COMPLETED = 'completed',
  DECLINED = 'declined',
  VOIDED = 'voided',
  EXPIRED = 'expired'
}

export enum SignerStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  SIGNED = 'signed',
  DECLINED = 'declined',
  AUTHENTICATION_FAILED = 'authentication_failed'
}

export enum FieldType {
  SIGNATURE = 'signature',
  INITIALS = 'initials',
  DATE_SIGNED = 'date_signed',
  TEXT = 'text',
  CHECKBOX = 'checkbox',
  DROPDOWN = 'dropdown'
}

// Types
export interface ESignEnvelope {
  id: string;
  organizationId: string;
  name: string;
  documentHtml?: string;
  documentPdfUrl?: string;
  contextType?: string;
  contextEntityId?: string;
  contextEntityName?: string;
  message?: string;
  status: EnvelopeStatus;
  expiresAt?: Date;
  sentAt?: Date;
  completedAt?: Date;
  voidedAt?: Date;
  voidedBy?: string;
  voidReason?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  signers?: ESignSigner[];
  fields?: ESignField[];
}

export interface ESignSigner {
  id: string;
  envelopeId: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  signingOrder: number;
  status: SignerStatus;
  accessToken?: string;
  accessTokenExpiresAt?: Date;
  sentAt?: Date;
  viewedAt?: Date;
  signedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;
  signedFromIp?: string;
  signedUserAgent?: string;
  createdAt: Date;
}

export interface ESignField {
  id: string;
  envelopeId: string;
  signerId: string;
  fieldType: FieldType;
  page: number;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
  value?: string;
  fontFamily?: string;
  signedAt?: Date;
  required: boolean;
  label?: string;
  createdAt: Date;
}

export interface CreateEnvelopeDto {
  name: string;
  documentHtml: string;
  contextType?: string;
  contextEntityId?: string;
  contextEntityName?: string;
  message?: string;
  expiresInDays?: number;
  templateId?: string;
  signers: {
    name: string;
    email: string;
    phone?: string;
    role?: string;
    order?: number;
  }[];
  fields: {
    signerId: string;
    fieldType: FieldType;
    page?: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
    required?: boolean;
    label?: string;
    value?: string;
    fontFamily?: string;
    signedAt?: Date;
  }[];
}

export class EnvelopeService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  private generateAccessToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private mapRowToEnvelope(row: any): ESignEnvelope {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      documentHtml: row.document_html,
      documentPdfUrl: row.document_pdf_url,
      contextType: row.context_type,
      contextEntityId: row.context_entity_id,
      contextEntityName: row.context_entity_name,
      message: row.message,
      status: row.status as EnvelopeStatus,
      expiresAt: row.expires_at,
      sentAt: row.sent_at,
      completedAt: row.completed_at,
      voidedAt: row.voided_at,
      voidedBy: row.voided_by,
      voidReason: row.void_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapRowToSigner(row: any): ESignSigner {
    return {
      id: row.id,
      envelopeId: row.envelope_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      signingOrder: row.signing_order,
      status: row.status as SignerStatus,
      accessToken: row.access_token,
      accessTokenExpiresAt: row.access_token_expires_at,
      sentAt: row.sent_at,
      viewedAt: row.viewed_at,
      signedAt: row.signed_at,
      declinedAt: row.declined_at,
      declineReason: row.decline_reason,
      signedFromIp: row.signed_from_ip,
      signedUserAgent: row.signed_user_agent,
      createdAt: row.created_at
    };
  }

  private mapRowToField(row: any): ESignField {
    return {
      id: row.id,
      envelopeId: row.envelope_id,
      signerId: row.signer_id,
      fieldType: row.field_type as FieldType,
      page: row.page,
      xPosition: parseFloat(row.x_position),
      yPosition: parseFloat(row.y_position),
      width: parseFloat(row.width),
      height: parseFloat(row.height),
      value: row.value,
      fontFamily: row.font_family,
      signedAt: row.signed_at,
      required: row.required,
      label: row.label,
      createdAt: row.created_at
    };
  }

  /**
   * Create a new envelope and send it
   */
  async createAndSendEnvelope(
    organizationId: string,
    userId: string,
    data: CreateEnvelopeDto
  ): Promise<ESignEnvelope> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays || 30));

    const envelopeQuery = `
      INSERT INTO esign_envelopes (
        organization_id,
        name,
        document_html,
        context_type,
        context_entity_id,
        context_entity_name,
        message,
        status,
        expires_at,
        sent_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
      RETURNING *
    `;

    const envelopeResult = await this.db.query(envelopeQuery, [
      organizationId,
      data.name,
      data.documentHtml,
      data.contextType || 'lease',
      data.contextEntityId,
      data.contextEntityName,
      data.message,
      EnvelopeStatus.SENT,
      expiresAt,
      userId
    ]);

    const envelope = this.mapRowToEnvelope(envelopeResult.rows[0]);

    // Create signers with access tokens
    const signerIdMap: Record<string, string> = {};
    const signers: ESignSigner[] = [];

    for (const signerData of data.signers) {
      const accessToken = this.generateAccessToken();
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

      const signerQuery = `
        INSERT INTO esign_signers (
          envelope_id,
          name,
          email,
          phone,
          role,
          signing_order,
          status,
          access_token,
          access_token_expires_at,
          sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `;

      const signerResult = await this.db.query(signerQuery, [
        envelope.id,
        signerData.name,
        signerData.email,
        signerData.phone,
        signerData.role,
        signerData.order || 1,
        SignerStatus.SENT,
        accessToken,
        tokenExpiresAt
      ]);

      const signer = this.mapRowToSigner(signerResult.rows[0]);
      signers.push(signer);

      if (signerData.role) {
        signerIdMap[signerData.role] = signer.id;
      }
      signerIdMap[`signer_${signerData.order || 1}`] = signer.id;
    }

    // Create fields
    const fields: ESignField[] = [];
    for (const fieldData of data.fields) {
      let signerId = signerIdMap[fieldData.signerId];
      if (!signerId) {
        const signerIndex = parseInt(fieldData.signerId.replace('signer_', '').replace('landlord', '0').replace('applicant', '1'));
        signerId = signers[signerIndex]?.id || signers[0]?.id;
      }

      if (!signerId) continue;

      const fieldQuery = `
        INSERT INTO esign_fields (
          envelope_id,
          signer_id,
          field_type,
          page,
          x_position,
          y_position,
          width,
          height,
          value,
          font_family,
          signed_at,
          required,
          label
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const fieldResult = await this.db.query(fieldQuery, [
        envelope.id,
        signerId,
        fieldData.fieldType || FieldType.SIGNATURE,
        fieldData.page || 1,
        fieldData.x,
        fieldData.y,
        fieldData.width || 200,
        fieldData.height || 50,
        fieldData.value || null,
        fieldData.fontFamily || null,
        fieldData.signedAt || null,
        fieldData.required !== false,
        fieldData.label
      ]);

      fields.push(this.mapRowToField(fieldResult.rows[0]));
    }

    // Log events
    await this.logEvent(envelope.id, null, 'created', { userId });
    await this.logEvent(envelope.id, null, 'sent', { userId, signerCount: signers.length });

    // Get creator info for emails
    const creatorResult = await this.db.query(
      `SELECT full_name, email FROM users WHERE id = $1`,
      [userId]
    );
    const creatorName = creatorResult.rows[0]?.full_name || 'PropMetrik';

    // Send signing request emails
    const signingBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    for (const signer of signers) {
      const signingUrl = `${signingBaseUrl}/sign/${signer.accessToken}`;
      
      emailService.sendSigningRequestEmail({
        signerEmail: signer.email,
        signerName: signer.name,
        documentTitle: envelope.name,
        creatorName,
        signingUrl,
        expiresAt: envelope.expiresAt,
        message: data.message,
      }).catch(err => {
        logger.error('Failed to send signing request email', { signerId: signer.id, error: err });
      });
    }

    // Schedule reminders
    if (envelope.expiresAt) {
      reminderService.scheduleRemindersForEnvelope(envelope.id, envelope.expiresAt).catch(err => {
        logger.error('Failed to schedule reminders', { envelopeId: envelope.id, error: err });
      });
    }

    return { ...envelope, signers, fields };
  }

  /**
   * Get envelope by ID with signers and fields
   */
  async getEnvelopeById(envelopeId: string, organizationId: string): Promise<ESignEnvelope | null> {
    const envelopeQuery = `SELECT * FROM esign_envelopes WHERE id = $1 AND organization_id = $2`;
    const envelopeResult = await this.db.query(envelopeQuery, [envelopeId, organizationId]);

    if (envelopeResult.rows.length === 0) return null;

    const envelope = this.mapRowToEnvelope(envelopeResult.rows[0]);

    const signersQuery = `SELECT * FROM esign_signers WHERE envelope_id = $1 ORDER BY signing_order`;
    const signersResult = await this.db.query(signersQuery, [envelopeId]);
    envelope.signers = signersResult.rows.map(this.mapRowToSigner);

    const fieldsQuery = `SELECT * FROM esign_fields WHERE envelope_id = $1`;
    const fieldsResult = await this.db.query(fieldsQuery, [envelopeId]);
    envelope.fields = fieldsResult.rows.map(this.mapRowToField);

    return envelope;
  }

  /**
   * Get envelope by access token (for external signers)
   */
  async getEnvelopeByAccessToken(accessToken: string): Promise<{ envelope: ESignEnvelope; signer: ESignSigner } | null> {
    const signerQuery = `SELECT * FROM esign_signers WHERE access_token = $1 AND access_token_expires_at > NOW()`;
    const signerResult = await this.db.query(signerQuery, [accessToken]);

    if (signerResult.rows.length === 0) return null;

    const signer = this.mapRowToSigner(signerResult.rows[0]);
    const envelopeQuery = `SELECT * FROM esign_envelopes WHERE id = $1`;
    const envelopeResult = await this.db.query(envelopeQuery, [signer.envelopeId]);

    if (envelopeResult.rows.length === 0) return null;

    const envelope = this.mapRowToEnvelope(envelopeResult.rows[0]);

    const signersQuery = `SELECT * FROM esign_signers WHERE envelope_id = $1 ORDER BY signing_order`;
    const signersResult = await this.db.query(signersQuery, [envelope.id]);
    envelope.signers = signersResult.rows.map(this.mapRowToSigner);

    const fieldsQuery = `SELECT * FROM esign_fields WHERE envelope_id = $1`;
    const fieldsResult = await this.db.query(fieldsQuery, [envelope.id]);
    envelope.fields = fieldsResult.rows.map(this.mapRowToField);

    // Mark as viewed
    if (!signer.viewedAt) {
      await this.db.query(`UPDATE esign_signers SET viewed_at = NOW() WHERE id = $1`, [signer.id]);
      await this.logEvent(envelope.id, signer.id, 'viewed', {});
    }

    return { envelope, signer };
  }

  /**
   * List envelopes for an organization
   */
  async listEnvelopes(
    organizationId: string,
    options: {
      status?: EnvelopeStatus;
      contextType?: string;
      contextEntityId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ envelopes: ESignEnvelope[]; total: number }> {
    let whereClause = 'WHERE organization_id = $1';
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (options.status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(options.status);
    }
    if (options.contextType) {
      whereClause += ` AND context_type = $${paramIndex++}`;
      params.push(options.contextType);
    }
    if (options.contextEntityId) {
      whereClause += ` AND context_entity_id = $${paramIndex++}`;
      params.push(options.contextEntityId);
    }

    const countQuery = `SELECT COUNT(*) FROM esign_envelopes ${whereClause}`;
    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = options.limit || 20;
    const offset = options.offset || 0;
    const query = `
      SELECT * FROM esign_envelopes ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    const envelopes = result.rows.map(this.mapRowToEnvelope);

    return { envelopes, total };
  }

  /**
   * Void an envelope
   */
  async voidEnvelope(envelopeId: string, organizationId: string, userId: string, reason: string): Promise<ESignEnvelope> {
    const envelope = await this.getEnvelopeById(envelopeId, organizationId);
    if (!envelope) throw new Error('Envelope not found');

    if (envelope.status === EnvelopeStatus.COMPLETED || envelope.status === EnvelopeStatus.VOIDED) {
      throw new Error(`Cannot void envelope with status: ${envelope.status}`);
    }

    const query = `
      UPDATE esign_envelopes
      SET status = $1, voided_at = NOW(), voided_by = $2, void_reason = $3
      WHERE id = $4
      RETURNING *
    `;

    const result = await this.db.query(query, [EnvelopeStatus.VOIDED, userId, reason, envelopeId]);
    await this.logEvent(envelopeId, null, 'voided', { userId, reason });

    return this.mapRowToEnvelope(result.rows[0]);
  }

  /**
   * Resend envelope to pending signers
   */
  async resendEnvelope(envelopeId: string, organizationId: string, userId: string): Promise<ESignEnvelope> {
    const envelope = await this.getEnvelopeById(envelopeId, organizationId);
    if (!envelope) throw new Error('Envelope not found');

    if (envelope.status === EnvelopeStatus.VOIDED || envelope.status === EnvelopeStatus.COMPLETED) {
      throw new Error(`Cannot resend envelope with status: ${envelope.status}`);
    }

    for (const signer of envelope.signers || []) {
      if (signer.status !== SignerStatus.SIGNED) {
        const newToken = this.generateAccessToken();
        const tokenExpiresAt = new Date();
        tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

        await this.db.query(
          `UPDATE esign_signers SET access_token = $1, access_token_expires_at = $2, sent_at = NOW(), status = $3 WHERE id = $4`,
          [newToken, tokenExpiresAt, SignerStatus.SENT, signer.id]
        );
      }
    }

    await this.db.query(`UPDATE esign_envelopes SET sent_at = NOW() WHERE id = $1`, [envelopeId]);
    await this.logEvent(envelopeId, null, 'resent', { userId });

    return (await this.getEnvelopeById(envelopeId, organizationId))!;
  }

  /**
   * Sign a field
   */
  async signField(
    accessToken: string,
    fieldId: string,
    value: string,
    fontFamily?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ESignField> {
    const data = await this.getEnvelopeByAccessToken(accessToken);
    if (!data) throw new Error('Invalid or expired access token');

    const { envelope, signer } = data;

    if (envelope.status === EnvelopeStatus.VOIDED || envelope.status === EnvelopeStatus.COMPLETED) {
      throw new Error(`Cannot sign envelope with status: ${envelope.status}`);
    }

    const field = envelope.fields?.find(f => f.id === fieldId);
    if (!field || field.signerId !== signer.id) {
      throw new Error('Field not found or not assigned to this signer');
    }

    const query = `UPDATE esign_fields SET value = $1, font_family = $2, signed_at = NOW() WHERE id = $3 RETURNING *`;
    const result = await this.db.query(query, [value, fontFamily, fieldId]);

    await this.logEvent(envelope.id, signer.id, 'field_signed', { fieldId, fieldType: field.fieldType });

    const signerFields = envelope.fields?.filter(f => f.signerId === signer.id) || [];
    const unsignedFields = signerFields.filter(f => f.id !== fieldId && !f.value);

    if (unsignedFields.length === 0) {
      await this.db.query(
        `UPDATE esign_signers SET status = $1, signed_at = NOW(), signed_from_ip = $2, signed_user_agent = $3 WHERE id = $4`,
        [SignerStatus.SIGNED, ipAddress, userAgent, signer.id]
      );

      await this.logEvent(envelope.id, signer.id, 'signed', { ipAddress });

      reminderService.cancelRemindersForSigner(signer.id).catch(err => {
        logger.error('Failed to cancel reminders for signer', { signerId: signer.id, error: err });
      });

      await this.checkEnvelopeCompletion(envelope.id, signer.name);
    }

    return this.mapRowToField(result.rows[0]);
  }

  /**
   * Check if all signers have signed and complete the envelope
   */
  private async checkEnvelopeCompletion(envelopeId: string, signerName?: string): Promise<void> {
    const envelopeResult = await this.db.query(
      `SELECT e.*, u.full_name as creator_name, u.email as creator_email
       FROM esign_envelopes e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.id = $1`,
      [envelopeId]
    );

    if (envelopeResult.rows.length === 0) return;

    const envelope = envelopeResult.rows[0];
    const creatorName = envelope.creator_name || 'Document Owner';
    const creatorEmail = envelope.creator_email;

    const signersQuery = `SELECT * FROM esign_signers WHERE envelope_id = $1`;
    const signersResult = await this.db.query(signersQuery, [envelopeId]);
    const allSigned = signersResult.rows.every(row => row.status === SignerStatus.SIGNED);
    const signedCount = signersResult.rows.filter(row => row.status === SignerStatus.SIGNED).length;
    const totalCount = signersResult.rows.length;

    // Send signature completion notification
    if (creatorEmail && signerName) {
      const viewUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/esign/envelopes/${envelopeId}`;
      
      emailService.sendSignatureCompletedEmail({
        recipientEmail: creatorEmail,
        recipientName: creatorName,
        documentTitle: envelope.name,
        signerName,
        completedCount: signedCount,
        totalCount,
        viewUrl,
      }).catch(err => {
        logger.error('Failed to send signature completed email', { envelopeId, error: err });
      });
    }

    if (allSigned) {
      await this.db.query(
        `UPDATE esign_envelopes SET status = $1, completed_at = NOW() WHERE id = $2`,
        [EnvelopeStatus.COMPLETED, envelopeId]
      );

      await this.logEvent(envelopeId, null, 'completed', {});

      reminderService.cancelRemindersForEnvelope(envelopeId).catch(err => {
        logger.error('Failed to cancel reminders for completed envelope', { envelopeId, error: err });
      });

      await this.handleContextCompletion(envelope, signersResult.rows);

      // Send completion notifications
      const signersList = signersResult.rows.map(s => ({ name: s.name, signedAt: s.signed_at }));

      for (const row of signersResult.rows) {
        emailService.sendEnvelopeCompletedEmail({
          recipientEmail: row.email,
          recipientName: row.name,
          documentTitle: envelope.name,
          completedAt: new Date(),
          signers: signersList,
        }).catch(err => {
          logger.error('Failed to send envelope completed email', { signerId: row.id, error: err });
        });
      }

      if (creatorEmail) {
        emailService.sendEnvelopeCompletedEmail({
          recipientEmail: creatorEmail,
          recipientName: creatorName,
          documentTitle: envelope.name,
          completedAt: new Date(),
          signers: signersList,
        }).catch(err => {
          logger.error('Failed to send envelope completed email to creator', { envelopeId, error: err });
        });
      }
    }
  }

  /**
   * Handle context-specific actions when envelope is completed
   */
  private async handleContextCompletion(envelope: any, signers: any[]): Promise<void> {
    const contextType = envelope.context_type;
    const contextEntityId = envelope.context_entity_id;

    if (!contextType || !contextEntityId) return;

    try {
      switch (contextType) {
        case 'valuation_report':
          await this.handleValuationReportCompletion(contextEntityId, envelope, signers);
          break;
        case 'lease':
          await this.handleLeaseCompletion(contextEntityId, envelope, signers);
          break;
        default:
          logger.info('No specific handler for context type', { contextType, contextEntityId });
      }
    } catch (error) {
      logger.error('Failed to handle context completion', { contextType, contextEntityId, error });
    }
  }

  /**
   * Handle valuation report approval when e-sign envelope is completed
   */
  private async handleValuationReportCompletion(reportId: string, envelope: any, signers: any[]): Promise<void> {
    logger.info('Processing valuation report completion via e-sign', { reportId, envelopeId: envelope.id });

    const sealData = `${reportId}:${envelope.id}:${new Date().toISOString()}`;
    const digitalSealHash = crypto.createHash('sha256').update(sealData).digest('hex');

    const primarySigner = signers.find(s => s.status === 'signed') || signers[0];
    const approvedBy = primarySigner?.id || envelope.created_by;

    const result = await this.db.query(
      `UPDATE valuation_reports 
       SET status = 'approved', approved_at = NOW(), approved_by = $1, digital_seal_hash = $2, verification_url = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, status`,
      [approvedBy, digitalSealHash, `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${reportId}`, reportId]
    );

    if (result.rows.length > 0) {
      logger.info('Valuation report approved via e-sign', { reportId, envelopeId: envelope.id, digitalSealHash });

      await this.db.query(
        `INSERT INTO valuation_audit_log (report_id, action, actor_id, details, created_at)
         VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING`,
        [reportId, 'approved_via_esign', approvedBy, JSON.stringify({
          envelopeId: envelope.id,
          digitalSealHash,
          signers: signers.map(s => ({ name: s.name, email: s.email, signedAt: s.signed_at })),
        })]
      ).catch(() => {});
    } else {
      logger.warn('Valuation report not found for e-sign completion', { reportId });
    }
  }

  /**
   * Handle lease signing completion when e-sign envelope is completed
   */
  private async handleLeaseCompletion(tenancyId: string, envelope: any, signers: any[]): Promise<void> {
    logger.info('Processing lease completion via e-sign', { tenancyId, envelopeId: envelope.id });

    const result = await this.db.query(
      `UPDATE tenancies SET lease_signed_at = NOW(), lease_status = 'signed', updated_at = NOW() WHERE id = $1 RETURNING id`,
      [tenancyId]
    );

    if (result.rows.length > 0) {
      logger.info('Tenancy lease marked as signed via e-sign', { tenancyId, envelopeId: envelope.id });
    } else {
      logger.warn('Tenancy not found for e-sign completion', { tenancyId });
    }
  }

  /**
   * Create an envelope from a template
   */
  async createEnvelopeFromTemplate(
    organizationId: string,
    userId: string,
    templateId: string,
    data: {
      name?: string;
      message?: string;
      expiresInDays?: number;
      contextType?: string;
      contextEntityId?: string;
      contextEntityName?: string;
      signerAssignments: { role: string; name: string; email: string; phone?: string }[];
    }
  ): Promise<ESignEnvelope> {
    const templateQuery = `SELECT * FROM esign_templates WHERE id = $1 AND (organization_id = $2 OR is_shared = TRUE) AND is_active = TRUE`;
    const templateResult = await this.db.query(templateQuery, [templateId, organizationId]);
    
    if (templateResult.rows.length === 0) throw new Error('Template not found');
    
    const template = templateResult.rows[0];
    const fieldDefinitions = typeof template.field_definitions === 'string' ? JSON.parse(template.field_definitions) : template.field_definitions || [];
    const roles = typeof template.roles === 'string' ? JSON.parse(template.roles) : template.roles || [];

    const requiredRoles = roles.filter((r: any) => r.required).map((r: any) => r.name);
    const assignedRoles = data.signerAssignments.map(s => s.role);
    const missingRoles = requiredRoles.filter((role: string) => !assignedRoles.includes(role));
    
    if (missingRoles.length > 0) throw new Error(`Missing required signers for roles: ${missingRoles.join(', ')}`);

    const signers = data.signerAssignments.map((assignment, index) => {
      const roleConfig = roles.find((r: any) => r.name === assignment.role);
      return {
        name: assignment.name,
        email: assignment.email,
        phone: assignment.phone,
        role: assignment.role,
        order: roleConfig?.order || index + 1
      };
    });

    const fields = fieldDefinitions.map((fieldDef: any) => ({
      signerId: fieldDef.role,
      fieldType: fieldDef.type as FieldType,
      page: fieldDef.page || 1,
      x: fieldDef.x,
      y: fieldDef.y,
      width: fieldDef.width || 200,
      height: fieldDef.height || 50,
      required: fieldDef.required !== false,
      label: fieldDef.label
    }));

    await this.db.query('UPDATE esign_templates SET used_count = used_count + 1 WHERE id = $1', [templateId]);

    return this.createAndSendEnvelope(organizationId, userId, {
      name: data.name || template.name,
      documentHtml: template.document_html,
      contextType: data.contextType,
      contextEntityId: data.contextEntityId,
      contextEntityName: data.contextEntityName,
      message: data.message,
      expiresInDays: data.expiresInDays,
      templateId,
      signers,
      fields
    });
  }

  /**
   * Log an event to the audit log
   */
  private async logEvent(envelopeId: string, signerId: string | null, eventType: string, eventData: any, ipAddress?: string, userAgent?: string): Promise<void> {
    const query = `INSERT INTO esign_audit_log (envelope_id, signer_id, event_type, event_data, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)`;
    await this.db.query(query, [envelopeId, signerId, eventType, JSON.stringify(eventData), ipAddress, userAgent]);
  }

  /**
   * Get audit log for an envelope
   */
  async getAuditLog(envelopeId: string, organizationId: string): Promise<any[]> {
    const envelope = await this.getEnvelopeById(envelopeId, organizationId);
    if (!envelope) throw new Error('Envelope not found');

    const query = `
      SELECT al.*, s.name as signer_name, s.email as signer_email
      FROM esign_audit_log al
      LEFT JOIN esign_signers s ON s.id = al.signer_id
      WHERE al.envelope_id = $1
      ORDER BY al.created_at ASC
    `;

    const result = await this.db.query(query, [envelopeId]);
    return result.rows.map(row => ({
      id: row.id,
      envelopeId: row.envelope_id,
      signerId: row.signer_id,
      signerName: row.signer_name,
      signerEmail: row.signer_email,
      eventType: row.event_type,
      eventData: row.event_data,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at
    }));
  }
}

export const createEnvelopeService = (db: Pool) => new EnvelopeService(db);
