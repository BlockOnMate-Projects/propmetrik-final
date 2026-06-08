/**
 * Envelope Service
 * 
 * DocuSign-style envelope management for e-signature workflows.
 * An envelope groups documents and signers together for a complete
 * signing transaction.
 * 
 * @module shared-services/e-sign/envelopeService
 */

import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import { logger } from '../../src/utils/logger';
import {
    Envelope,
    EnvelopeSigner,
    EnvelopeField,
    EnvelopeStatus,
    CreateEnvelopeDto,
    ListEnvelopesOptions
} from './types';
import { templateService } from './templateService';
import { auditLogService } from './auditLogService';
import { notify } from '../notifications/notify';

/**
 * Factory function to create an envelope service instance
 * This allows dependency injection of the database pool
 */
export function createEnvelopeService(pool: Pool) {
    return new EnvelopeService(pool);
}

export class EnvelopeService {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    /**
     * Create and optionally send an envelope for signing
     */
    async createAndSendEnvelope(
        organizationId: string,
        userId: string,
        dto: CreateEnvelopeDto
    ): Promise<Envelope> {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');

            const envelopeId = uuidv4();
            const expiresAt = dto.expiresInDays 
                ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

            // Create the envelope
            const envelopeResult = await client.query(
                `INSERT INTO esign_envelopes (
                    id, organization_id, created_by, name, message, status,
                    context_type, context_entity_id, context_entity_name,
                    document_html, document_pdf_url, expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    envelopeId,
                    organizationId,
                    userId,
                    dto.name,
                    dto.message || null,
                    dto.initialStatus || (dto.autoSend !== false ? EnvelopeStatus.SENT : EnvelopeStatus.DRAFT),
                    dto.contextType || null,
                    dto.contextEntityId || null,
                    dto.contextEntityName || null,
                    dto.documentHtml || null,
                    dto.documentPdfUrl || null,
                    expiresAt
                ]
            );

            // Create signers
            for (const signer of dto.signers) {
                const signerId = uuidv4();
                const accessToken = randomBytes(32).toString('hex');
                const signerFields = dto.fields?.filter(f => f.signerEmail === signer.email) || [];
                const requiredSignerFields = signerFields.filter(field => field.required);
                const signerFullySigned =
                    requiredSignerFields.length > 0 &&
                    requiredSignerFields.every(field => this.isFieldMarkedSigned(field));
                const signerStatus = dto.initialStatus === 'completed' || signerFullySigned
                    ? 'signed'
                    : 'pending';
                const signerSignedAt = signerStatus === 'signed' ? new Date() : null;

                await client.query(
                    `INSERT INTO esign_signers (
                        id, envelope_id, name, email, role, signing_order, status, access_token, signed_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        signerId,
                        envelopeId,
                        signer.name,
                        signer.email,
                        signer.role,
                        signer.order,
                        signerStatus,
                        accessToken,
                        signerSignedAt
                    ]
                );

                // Create fields for this signer
                if (dto.fields) {
                    for (const field of signerFields) {
                        const fieldSigned = this.isFieldMarkedSigned(field);
                        const fieldValue = this.normalizeFieldValue(field.value);

                        await client.query(
                            `INSERT INTO esign_fields (
                                id, envelope_id, signer_id, field_type, page, x_position, y_position, width, height, required, label, value, signed_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                            [
                                uuidv4(),
                                envelopeId,
                                signerId,
                                field.type,
                                field.page,
                                field.x,
                                field.y,
                                field.width,
                                field.height,
                                field.required,
                                field.label || null,
                                fieldValue,
                                fieldSigned ? new Date() : null
                            ]
                        );
                    }
                }
            }

            await client.query('COMMIT');

            // Log the creation
            await auditLogService.createAuditEvent({
                eventType: 'envelope.created',
                actorType: 'user',
                actorId: userId,
                metadata: {
                    envelopeId,
                    organizationId,
                    signerCount: dto.signers.length,
                    contextType: dto.contextType
                }
            });

            logger.info('Envelope created', { envelopeId, organizationId, userId });

            // Best-effort: email the next pending signer their signing link. The
            // envelope is created and committed regardless of notification outcome —
            // a notification failure must never break the send.
            const createdStatus = envelopeResult.rows[0].status;
            if (createdStatus === EnvelopeStatus.SENT) {
                try {
                    await this.notifyNextPendingSigner(envelopeId);
                } catch (notifyErr: any) {
                    logger.warn('Failed to notify next pending signer on send', {
                        envelopeId,
                        error: notifyErr?.message || 'Unknown error'
                    });
                }
            }

            return this.mapRowToEnvelope(envelopeResult.rows[0]);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Email the next pending signer (lowest signing order) their personal signing
     * link. Sequential signing: only one signer is invited at a time, and the next
     * is invited when the prior one completes (see the sign-envelope complete route).
     *
     * Returns true if a signer was notified, false if there are no pending signers.
     * Never throws — notification is best-effort.
     */
    async notifyNextPendingSigner(envelopeId: string): Promise<boolean> {
        const res = await this.pool.query(
            `SELECT s.name, s.email, s.access_token,
                    e.name AS envelope_name, e.message AS envelope_message
             FROM esign_signers s
             JOIN esign_envelopes e ON e.id = s.envelope_id
             WHERE s.envelope_id = $1 AND s.status = 'pending'
             ORDER BY s.signing_order ASC NULLS LAST, s.created_at ASC
             LIMIT 1`,
            [envelopeId]
        );

        if (res.rowCount === 0) return false;

        const row = res.rows[0];
        if (!row.email || !row.access_token) return false;

        // Resolve the public frontend URL the same way the app config does, so signing links in
        // emails are reachable by external signers. FRONTEND_URL overrides; otherwise pick the
        // env-specific URL (these are the vars actually defined in .env), falling back to localhost.
        const frontendUrl = process.env.FRONTEND_URL
            || (process.env.NODE_ENV === 'production' ? process.env.PROD_FRONTEND_URL : process.env.DEV_FRONTEND_URL)
            || 'http://localhost:3000';
        const signingUrl = `${frontendUrl}/sign/${row.access_token}`;
        const docName = row.envelope_name || 'a document';
        const greeting = row.name ? `Hi ${row.name},` : 'Hello,';

        const html = `
            <p>${greeting}</p>
            <p>You have a document awaiting your signature: <strong>${docName}</strong>.</p>
            ${row.envelope_message ? `<p>${row.envelope_message}</p>` : ''}
            <p style="margin:24px 0;">
              <a href="${signingUrl}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Review &amp; Sign</a>
            </p>
            <p style="color:#6b7280;font-size:13px;">Or paste this link into your browser:<br>${signingUrl}</p>
        `;

        await notify({
            recipients: [{ audience: 'staff', userId: '', email: row.email, name: row.name }],
            category: 'esign',
            type: 'esign.signature_requested',
            title: `Signature requested: ${docName}`,
            body: `You have a document awaiting your signature: "${docName}".`,
            priority: 'high',
            channels: { email: true },
            sourceUrl: signingUrl,
            email: {
                subject: `Signature requested: ${docName}`,
                html
            }
        });

        return true;
    }

    /**
     * Create an envelope from a template
     */
    async createEnvelopeFromTemplate(
        organizationId: string,
        userId: string,
        templateId: string,
        overrides: Partial<CreateEnvelopeDto> = {}
    ): Promise<Envelope> {
        const template = await templateService.getTemplateById(templateId, organizationId);
        if (!template) {
            throw new Error('Template not found');
        }

        // Record template usage
        await templateService.useTemplate(templateId, organizationId);

        // Merge template defaults with overrides
        const dto: CreateEnvelopeDto = {
            name: overrides.name || template.name,
            message: overrides.message || undefined,
            documentHtml: overrides.documentHtml || template.documentHtml,
            documentPdfUrl: overrides.documentPdfUrl || template.documentPdfUrl,
            contextType: overrides.contextType,
            contextEntityId: overrides.contextEntityId,
            contextEntityName: overrides.contextEntityName,
            signers: overrides.signers || (template.defaultSigners as any) || [],
            fields: overrides.fields || (template.defaultFields as any) || [],
            expiresInDays: overrides.expiresInDays || 30,
            autoSend: overrides.autoSend
        };

        return this.createAndSendEnvelope(organizationId, userId, dto);
    }

    /**
     * List envelopes for an organization
     */
    async listEnvelopes(
        organizationId: string,
        options: ListEnvelopesOptions = {}
    ): Promise<{ envelopes: Envelope[]; total: number }> {
        const conditions = ['e.organization_id = $1'];
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (options.status) {
            conditions.push(`e.status = $${paramIndex++}`);
            params.push(options.status);
        }

        if (options.contextType) {
            conditions.push(`e.context_type = $${paramIndex++}`);
            params.push(options.contextType);
        }

        if (options.contextEntityId) {
            conditions.push(`e.context_entity_id = $${paramIndex++}`);
            params.push(options.contextEntityId);
        }

        // If filtering by signer email, join with signers table
        let joinClause = '';
        if (options.signerEmail) {
            joinClause = 'INNER JOIN esign_signers es ON e.id = es.envelope_id';
            conditions.push(`es.email = $${paramIndex++}`);
            params.push(options.signerEmail);
            conditions.push(`es.status = 'pending'`);
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countResult = await this.pool.query(
            `SELECT COUNT(DISTINCT e.id) FROM esign_envelopes e ${joinClause} WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get paginated results
        let query = `SELECT DISTINCT e.* FROM esign_envelopes e ${joinClause} WHERE ${whereClause} ORDER BY e.created_at DESC`;
        
        if (options.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(options.limit);
        }
        
        if (options.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(options.offset);
        }

        const result = await this.pool.query(query, params);
        const envelopes = result.rows.map(row => this.mapRowToEnvelope(row));

        return { envelopes, total };
    }

    /**
     * Get an envelope by ID
     */
    async getEnvelopeById(id: string, organizationId: string): Promise<Envelope | null> {
        const result = await this.pool.query(
            `SELECT * FROM esign_envelopes WHERE id = $1 AND organization_id = $2`,
            [id, organizationId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const envelope = this.mapRowToEnvelope(result.rows[0]);
        
        // Fetch signers
        const signersResult = await this.pool.query(
            `SELECT * FROM esign_signers WHERE envelope_id = $1 ORDER BY signing_order`,
            [id]
        );
        (envelope as any).signers = signersResult.rows.map(row => this.mapRowToSigner(row));

        // Fetch fields
        const fieldsResult = await this.pool.query(
            `SELECT * FROM esign_fields WHERE envelope_id = $1`,
            [id]
        );
        (envelope as any).fields = fieldsResult.rows.map(row => this.mapRowToField(row));

        return envelope;
    }

    /**
     * Get envelope by access token (for signing flow)
     */
    async getEnvelopeByAccessToken(token: string): Promise<{ envelope: Envelope; signer: EnvelopeSigner } | null> {
        const signerResult = await this.pool.query(
            `SELECT * FROM esign_signers WHERE access_token = $1`,
            [token]
        );

        if (signerResult.rows.length === 0) {
            return null;
        }

        const signer = this.mapRowToSigner(signerResult.rows[0]);

        const envelopeResult = await this.pool.query(
            `SELECT e.*, o.name as organization_name FROM esign_envelopes e
             LEFT JOIN organizations o ON e.organization_id::uuid = o.id
             WHERE e.id = $1`,
            [signer.envelopeId]
        );

        if (envelopeResult.rows.length === 0) {
            return null;
        }

        const envelope = this.mapRowToEnvelope(envelopeResult.rows[0]);

        // Fetch ALL fields for the envelope (so other signers' completed work is visible)
        const fieldsResult = await this.pool.query(
            `SELECT f.*, s.name as signer_name
             FROM esign_fields f
             LEFT JOIN esign_signers s ON f.signer_id = s.id
             WHERE f.envelope_id = $1`,
            [envelope.id]
        );
        (envelope as any).fields = fieldsResult.rows.map(row => ({
            ...this.mapRowToField(row),
            signerName: row.signer_name,
        }));

        return { envelope, signer };
    }

    /**
     * Sign a field in an envelope
     */
    async signField(
        envelopeId: string,
        fieldId: string,
        signerId: string,
        value: string,
        ipAddress: string,
        userAgent: string
    ): Promise<EnvelopeField> {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');

            const existingFieldResult = await client.query(
                `SELECT field_type FROM esign_fields
                 WHERE id = $1 AND envelope_id = $2 AND signer_id = $3`,
                [fieldId, envelopeId, signerId]
            );

            if (existingFieldResult.rows.length === 0) {
                throw new Error('Field not found');
            }

            const fieldType = String(existingFieldResult.rows[0].field_type || '').toLowerCase();
            if (this.requiresImageSignature(fieldType)) {
                this.assertValidSignatureImage(value, fieldType);
            }

            // Update the field with signature value
            const fieldResult = await client.query(
                `UPDATE esign_fields 
                 SET value = $1, signed_at = NOW()
                 WHERE id = $2 AND envelope_id = $3 AND signer_id = $4
                 RETURNING *`,
                [value, fieldId, envelopeId, signerId]
            );

            if (fieldResult.rows.length === 0) {
                throw new Error('Field not found');
            }

            // Check if all required fields for this signer are signed
            const pendingFields = await client.query(
                `SELECT COUNT(*) FROM esign_fields 
                 WHERE envelope_id = $1 AND signer_id = $2 AND required = true AND signed_at IS NULL`,
                [envelopeId, signerId]
            );

            if (parseInt(pendingFields.rows[0].count, 10) === 0) {
                // Mark signer as signed
                await client.query(
                    `UPDATE esign_signers 
                     SET status = 'signed', signed_at = NOW(), signed_from_ip = $1, signed_user_agent = $2
                     WHERE id = $3`,
                    [ipAddress, userAgent, signerId]
                );

                // Check if all signers have signed
                await this.checkAndCompleteEnvelope(client, envelopeId);
            }

            await client.query('COMMIT');

            return this.mapRowToField(fieldResult.rows[0]);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private requiresImageSignature(fieldType: string): boolean {
        return fieldType === 'signature' || fieldType === 'initial' || fieldType === 'initials';
    }

    private normalizeFieldValue(value?: string): string | null {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    private isFieldMarkedSigned(field: { value?: string; signed?: boolean }): boolean {
        if (field.signed === true) {
            return true;
        }

        return this.normalizeFieldValue(field.value) !== null;
    }

    private assertValidSignatureImage(value: string, fieldType: string): void {
        if (!value || !value.startsWith('data:image/')) {
            throw new Error(`Invalid ${fieldType} value. Expected an image signature.`);
        }

        const parts = value.split(',', 2);
        if (parts.length < 2 || !parts[1]) {
            throw new Error(`Invalid ${fieldType} image data.`);
        }

        let imageBytes = 0;
        try {
            imageBytes = Buffer.from(parts[1], 'base64').length;
        } catch {
            throw new Error(`Invalid ${fieldType} image encoding.`);
        }

        if (imageBytes < 256) {
            throw new Error(`${fieldType} image is too small. Please re-sign the field.`);
        }
    }

    /**
     * Check if all signers have signed and complete the envelope
     */
    private async checkAndCompleteEnvelope(client: any, envelopeId: string): Promise<void> {
        const pendingSigners = await client.query(
            `SELECT COUNT(*) FROM esign_signers 
             WHERE envelope_id = $1 AND role = 'signer' AND status != 'signed'`,
            [envelopeId]
        );

        if (parseInt(pendingSigners.rows[0].count, 10) === 0) {
            await client.query(
                `UPDATE esign_envelopes 
                 SET status = $1, completed_at = NOW(), updated_at = NOW()
                 WHERE id = $2`,
                [EnvelopeStatus.COMPLETED, envelopeId]
            );

            logger.info('Envelope completed', { envelopeId });
        }
    }

    /**
     * Void an envelope
     */
    async voidEnvelope(
        id: string,
        organizationId: string,
        userId: string,
        reason: string
    ): Promise<Envelope> {
        const result = await this.pool.query(
            `UPDATE esign_envelopes 
             SET status = $1, voided_at = NOW(), void_reason = $2, updated_at = NOW()
             WHERE id = $3 AND organization_id = $4
             RETURNING *`,
            [EnvelopeStatus.VOIDED, reason, id, organizationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Envelope not found');
        }

        await auditLogService.createAuditEvent({
            eventType: 'envelope.voided',
            actorType: 'user',
            actorId: userId,
            metadata: { envelopeId: id, reason }
        });

        return this.mapRowToEnvelope(result.rows[0]);
    }

    /**
     * Delete an envelope
     */
    async deleteEnvelope(id: string, organizationId: string): Promise<void> {
        const result = await this.pool.query(
            `DELETE FROM esign_envelopes WHERE id = $1 AND organization_id = $2 RETURNING id`,
            [id, organizationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Envelope not found');
        }

        logger.info('Envelope deleted', { envelopeId: id, organizationId });
    }

    /**
     * Resend envelope notifications
     */
    async resendEnvelope(id: string, organizationId: string, userId: string): Promise<Envelope> {
        const envelope = await this.getEnvelopeById(id, organizationId);
        if (!envelope) {
            throw new Error('Envelope not found');
        }

        // TODO: Send email notifications to pending signers
        // This would integrate with an email service

        await auditLogService.createAuditEvent({
            eventType: 'envelope.resent',
            actorType: 'user',
            actorId: userId,
            metadata: { envelopeId: id }
        });

        return envelope;
    }

    /**
     * Get audit log for an envelope
     */
    async getAuditLog(id: string, organizationId: string): Promise<any[]> {
        // Verify envelope belongs to organization
        const envelope = await this.getEnvelopeById(id, organizationId);
        if (!envelope) {
            throw new Error('Envelope not found');
        }

        const result = await this.pool.query(
            `SELECT * FROM esign_audit_log 
             WHERE resource_type = 'envelope' AND resource_id = $1
             ORDER BY created_at DESC`,
            [id]
        );

        return result.rows;
    }

    /**
     * Map database row to Envelope object
     */
    private mapRowToEnvelope(row: any): Envelope {
        return {
            id: row.id,
            organizationId: row.organization_id,
            createdBy: row.created_by,
            name: row.name,
            message: row.message,
            status: row.status as EnvelopeStatus,
            contextType: row.context_type,
            contextEntityId: row.context_entity_id,
            contextEntityName: row.context_entity_name,
            documentHtml: row.document_html,
            documentPdfUrl: row.document_pdf_url,
            signedPdfUrl: row.signed_pdf_url,
            expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            voidedAt: row.voided_at ? new Date(row.voided_at) : undefined,
            voidReason: row.void_reason,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to EnvelopeSigner object
     */
    private mapRowToSigner(row: any): EnvelopeSigner {
        return {
            id: row.id,
            envelopeId: row.envelope_id,
            name: row.name,
            email: row.email,
            role: row.role,
            order: row.signing_order,
            status: row.status,
            accessToken: row.access_token,
            signedAt: row.signed_at ? new Date(row.signed_at) : undefined,
            declinedAt: row.declined_at ? new Date(row.declined_at) : undefined,
            declineReason: row.decline_reason,
            ipAddress: row.signed_from_ip,
            userAgent: row.signed_user_agent,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at || row.created_at)
        };
    }

    /**
     * Map database row to EnvelopeField object
     */
    private mapRowToField(row: any): EnvelopeField {
        return {
            id: row.id,
            envelopeId: row.envelope_id,
            signerId: row.signer_id,
            type: row.field_type,
            page: row.page,
            x: parseFloat(row.x_position),
            y: parseFloat(row.y_position),
            width: parseFloat(row.width),
            height: parseFloat(row.height),
            required: row.required,
            label: row.label,
            value: row.value,
            signedAt: row.signed_at ? new Date(row.signed_at) : undefined
        };
    }
}
