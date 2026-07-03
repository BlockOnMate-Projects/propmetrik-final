/**
 * CRM Signature Service
 * Phase 5.2: CRM Service Layer
 * Phase 4 E-Sign Integration: Re-implemented to use eSignIntegrationService
 * 
 * Manages signature envelopes and signer tracking for CRM documents.
 * Now integrates with the central e-sign integration service.
 * 
 * @module services/crm-deal-management/signatureService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { activityService } from './activityService';
import { crmDocumentService } from './crmDocumentService';
import { eSignIntegrationService } from '../../../shared-services/e-sign/integration/eSignIntegrationService';
import { ESignField, CompletionEvent } from '../../../shared-services/e-sign/integration/types';

// =============================================
// Types
// =============================================

export type SignatureStatus = 'pending' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'cancelled';

export interface SignatureEnvelope {
    id: string;
    organization_id: string;
    deal_id?: string;
    document_id: string;
    esign_envelope_id?: string;
    esign_envelope_id_external?: string;  // Reference to e-sign service envelope
    status: SignatureStatus;
    signers: SignerInfo[];
    signing_order: number;
    sent_at?: Date;
    viewed_at?: Date;
    completed_at?: Date;
    expires_at?: Date;
    subject?: string;
    message?: string;
    reminder_settings?: Record<string, any>;
    created_at: Date;
    updated_at: Date;
    created_by?: string;
}

export interface SignerInfo {
    contact_id?: string;
    user_id?: string;
    email: string;
    name: string;
    status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
    signed_at?: Date;
    ip_address?: string;
    user_agent?: string;
    order: number;
}

export interface CreateSignatureEnvelopeInput {
    deal_id?: string;
    document_id: string;
    signers: {
        contact_id?: string;
        user_id?: string;
        email: string;
        name: string;
        order?: number;
    }[];
    subject?: string;
    message?: string;
    expires_in_days?: number;
    reminder_settings?: {
        remind_before_days?: number;
        remind_frequency_days?: number;
    };
}

export interface SignatureEnvelopeFilters {
    deal_id?: string;
    document_id?: string;
    status?: SignatureStatus;
    page?: number;
    limit?: number;
}

export interface PaginatedEnvelopes {
    data: SignatureEnvelope[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        total_pages: number;
    };
}

// =============================================
// Signature Service Class
// =============================================

export class SignatureService {
    constructor() {}

    /**
     * Create a signature envelope (draft). Actual sending/signing is delegated to the
     * shared e-sign engine in sendSignatureRequest(); completion syncs back via
     * handleEsignCompletion().
     */
    async createSignatureEnvelope(
        organizationId: string,
        data: CreateSignatureEnvelopeInput,
        userId?: string
    ): Promise<SignatureEnvelope> {
        const client = await db.getClient();
        const id = uuidv4();

        try {
            await client.query('BEGIN');

            // Get the document
            const document = await crmDocumentService.getDocumentById(data.document_id, organizationId);
            if (!document) {
                throw new Error('Document not found');
            }

            if (document.is_signed) {
                throw new Error('Document is already signed');
            }

            // Calculate expiration date
            const expiresAt = data.expires_in_days
                ? new Date(Date.now() + data.expires_in_days * 24 * 60 * 60 * 1000)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

            // Prepare signers
            const signers: SignerInfo[] = data.signers.map((s, index) => ({
                contact_id: s.contact_id,
                user_id: s.user_id,
                email: s.email,
                name: s.name,
                status: 'pending' as const,
                order: s.order ?? index + 1,
            }));

            // Create CRM signature envelope record
            const result = await client.query<SignatureEnvelope>(
                `INSERT INTO signature_envelopes (
                    id, organization_id, deal_id, document_id,
                    status, signers, signing_order,
                    expires_at, subject, message, reminder_settings, created_by
                ) VALUES (
                    $1, $2, $3, $4, 'pending', $5, 1, $6, $7, $8, $9, $10
                ) RETURNING *`,
                [
                    id,
                    organizationId,
                    data.deal_id || null,
                    data.document_id,
                    JSON.stringify(signers),
                    expiresAt,
                    data.subject || `Please sign: ${document.document_name}`,
                    data.message || null,
                    data.reminder_settings ? JSON.stringify(data.reminder_settings) : null,
                    userId || null,
                ]
            );

            await client.query('COMMIT');

            const envelope = result.rows[0];
            logger.info('Signature envelope created', { envelopeId: id, documentId: data.document_id });

            // Log activity if associated with a deal
            if (data.deal_id && userId) {
                try {
                    await activityService.createActivity({
                        deal_id: data.deal_id,
                        user_id: userId,
                        activity_type: 'document_request',
                        subject: `Signature requested: ${document.document_name}`,
                        description: `Signature request sent to ${signers.map(s => s.name).join(', ')}`,
                        new_value: {
                            envelope_id: id,
                            document_id: data.document_id,
                            signers: signers.map(s => ({ email: s.email, name: s.name })),
                        },
                    });
                } catch (activityError) {
                    logger.error('Failed to log signature request activity', activityError);
                }
            }

            return envelope;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error creating signature envelope', { error, organizationId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Send the signature request via e-sign integration service
     * Phase 4: Re-implemented to use eSignIntegrationService
     */
    async sendSignatureRequest(
        envelopeId: string,
        organizationId: string,
        userId?: string
    ): Promise<SignatureEnvelope> {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            // Get envelope
            const envelope = await this.getEnvelopeById(envelopeId, organizationId);
            if (!envelope) {
                throw new Error('Envelope not found');
            }

            if (envelope.status !== 'pending') {
                throw new Error(`Cannot send envelope with status: ${envelope.status}`);
            }

            // Get document
            const document = await crmDocumentService.getDocumentById(envelope.document_id, organizationId);
            if (!document) {
                throw new Error('Document not found');
            }

            // Fetch document content
            const documentBuffer = await this.fetchDocumentContent(document.file_url);

            // Build signers for e-sign service
            const signers = envelope.signers.map((s, idx) => ({
                name: s.name,
                email: s.email,
                role: 'signer' as const,
                order: s.order || idx + 1,
            }));

            // Build default signature fields (one per signer, stacked vertically)
            const fields: ESignField[] = envelope.signers.map((s, idx) => ({
                type: 'signature' as const,
                recipientEmail: s.email,
                documentIndex: 0,
                page: 1,
                x: 0.10,
                y: 0.70 - (idx * 0.15),
                width: 0.30,
                height: 0.10,
                required: true,
            }));

            // Create e-sign envelope via integration service
            const esignResult = await eSignIntegrationService.createEnvelope({
                subject: envelope.subject || `Please sign: ${document.document_name}`,
                message: envelope.message || 'Please review and sign this document.',
                documents: [{
                    name: document.document_name,
                    content: documentBuffer,
                    mimeType: 'application/pdf',
                    source: 'system_generated',
                }],
                signers,
                fields,
                organizationId,
                sourceModule: 'crm',
                sourceEntityType: 'signature_envelope',
                sourceEntityId: envelopeId,
                expiresInDays: 30,
            });

            // Update CRM envelope with e-sign envelope reference
            const result = await client.query<SignatureEnvelope>(
                `UPDATE signature_envelopes
                 SET status = 'sent',
                     esign_envelope_id_external = $1,
                     sent_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $2 AND organization_id = $3
                 RETURNING *`,
                [esignResult.envelopeId, envelopeId, organizationId]
            );

            await client.query('COMMIT');

            logger.info('Signature request sent via e-sign service', {
                envelopeId,
                esignEnvelopeId: esignResult.envelopeId,
                organizationId,
            });

            // Log activity if deal is associated
            if (envelope.deal_id && userId) {
                try {
                    await activityService.createActivity({
                        deal_id: envelope.deal_id,
                        user_id: userId,
                        activity_type: 'document_request',
                        subject: `Signature request sent: ${document.document_name}`,
                        description: `Signature request sent to ${envelope.signers.map(s => s.name).join(', ')}`,
                        new_value: {
                            envelope_id: envelopeId,
                            esign_envelope_id: esignResult.envelopeId,
                        },
                    });
                } catch (activityError) {
                    logger.error('Failed to log signature send activity', activityError);
                }
            }

            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error sending signature request', { error, envelopeId, organizationId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Fetch document content from URL or storage
     */
    private async fetchDocumentContent(fileUrl: string): Promise<Buffer> {
        try {
            if (!fileUrl.startsWith('http')) {
                // It's a storage key
                const { documentService } = await import('../../../shared-services/document-service');
                const { buffer } = await documentService.storage.download(fileUrl);
                return buffer;
            }

            // Fetch from URL
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch document: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error: any) {
            logger.error('Failed to fetch document content', { fileUrl, error: error.message });
            throw error;
        }
    }

    /**
     * Get envelope by ID
     */
    async getEnvelopeById(
        envelopeId: string,
        organizationId: string
    ): Promise<SignatureEnvelope | null> {
        try {
            const result = await db.query<SignatureEnvelope>(
                `SELECT se.*,
                    d.document_name,
                    d.document_type,
                    deal.title as deal_title,
                    deal.deal_number
                FROM signature_envelopes se
                LEFT JOIN documents d ON se.document_id = d.id
                LEFT JOIN deals deal ON se.deal_id = deal.id
                WHERE se.id = $1 AND se.organization_id = $2`,
                [envelopeId, organizationId]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching envelope', { error, envelopeId, organizationId });
            throw error;
        }
    }

    /**
     * List envelopes with filters
     */
    async listEnvelopes(
        organizationId: string,
        filters: SignatureEnvelopeFilters = {}
    ): Promise<PaginatedEnvelopes> {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const offset = (page - 1) * limit;

            const conditions: string[] = ['se.organization_id = $1'];
            const params: any[] = [organizationId];
            let paramIndex = 2;

            if (filters.deal_id) {
                conditions.push(`se.deal_id = $${paramIndex}`);
                params.push(filters.deal_id);
                paramIndex++;
            }

            if (filters.document_id) {
                conditions.push(`se.document_id = $${paramIndex}`);
                params.push(filters.document_id);
                paramIndex++;
            }

            if (filters.status) {
                conditions.push(`se.status = $${paramIndex}`);
                params.push(filters.status);
                paramIndex++;
            }

            const whereClause = conditions.join(' AND ');

            // Get total count
            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM signature_envelopes se WHERE ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total, 10);

            // Get paginated data
            const dataParams = [...params, limit, offset];
            const result = await db.query<SignatureEnvelope>(
                `SELECT se.*,
                    d.document_name,
                    d.document_type,
                    deal.title as deal_title,
                    deal.deal_number
                FROM signature_envelopes se
                LEFT JOIN documents d ON se.document_id = d.id
                LEFT JOIN deals deal ON se.deal_id = deal.id
                WHERE ${whereClause}
                ORDER BY se.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                dataParams
            );

            return {
                data: result.rows,
                pagination: {
                    total,
                    page,
                    limit,
                    total_pages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            logger.error('Error listing envelopes', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get envelopes for a deal
     */
    async getEnvelopesByDeal(
        dealId: string,
        organizationId: string
    ): Promise<SignatureEnvelope[]> {
        try {
            const result = await db.query<SignatureEnvelope>(
                `SELECT se.*,
                    d.document_name,
                    d.document_type
                FROM signature_envelopes se
                LEFT JOIN documents d ON se.document_id = d.id
                WHERE se.deal_id = $1 AND se.organization_id = $2
                ORDER BY se.created_at DESC`,
                [dealId, organizationId]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching envelopes by deal', { error, dealId, organizationId });
            throw error;
        }
    }

    /**
     * Cancel a signature envelope
     */
    async cancelEnvelope(
        envelopeId: string,
        organizationId: string,
        reason?: string,
        userId?: string
    ): Promise<SignatureEnvelope> {
        try {
            const envelope = await this.getEnvelopeById(envelopeId, organizationId);
            if (!envelope) {
                throw new Error('Envelope not found');
            }

            if (['signed', 'cancelled', 'expired'].includes(envelope.status)) {
                throw new Error(`Cannot cancel envelope with status: ${envelope.status}`);
            }

            // Void the underlying e-sign envelope so outstanding magic links stop working.
            // Previously only the CRM row flipped to 'cancelled' while the real envelope
            // stayed live — signers could still open their link and sign a "cancelled" doc.
            if (envelope.esign_envelope_id_external) {
                try {
                    await eSignIntegrationService.voidEnvelope(
                        envelope.esign_envelope_id_external,
                        reason || 'Cancelled by sender'
                    );
                } catch (voidError: any) {
                    logger.error('Failed to void underlying e-sign envelope', {
                        envelopeId,
                        esignEnvelopeId: envelope.esign_envelope_id_external,
                        error: voidError?.message,
                    });
                }
            }

            // Update CRM envelope
            const result = await db.query<SignatureEnvelope>(
                `UPDATE signature_envelopes
                SET status = 'cancelled', updated_at = NOW()
                WHERE id = $1 AND organization_id = $2
                RETURNING *`,
                [envelopeId, organizationId]
            );

            logger.info('Envelope cancelled', { envelopeId, organizationId });

            return result.rows[0];
        } catch (error) {
            logger.error('Error cancelling envelope', { error, envelopeId, organizationId });
            throw error;
        }
    }

    /**
     * Resend signature request to a specific signer
     * Phase 4: Re-implemented using e-sign integration service
     */
    async resendRequest(
        envelopeId: string,
        organizationId: string,
        signerEmail?: string
    ): Promise<void> {
        try {
            const envelope = await this.getEnvelopeById(envelopeId, organizationId);
            if (!envelope) {
                throw new Error('Envelope not found');
            }

            if (!envelope.esign_envelope_id_external) {
                throw new Error('Envelope has not been sent yet. Use sendSignatureRequest first.');
            }

            if (!['sent', 'viewed'].includes(envelope.status)) {
                throw new Error(`Cannot resend envelope with status: ${envelope.status}`);
            }

            // Re-notify the outstanding signer(s) via the shared e-sign engine — the same
            // path used for the initial send. (The engine re-sends to the next pending
            // signer; per-signer targeting is not yet exposed, so signerEmail is advisory.)
            await eSignIntegrationService.resendEnvelope(
                envelope.esign_envelope_id_external,
                signerEmail ? `Reminder requested for ${signerEmail}` : 'Signature reminder'
            );

            logger.info('Signature reminder resent via e-sign service', {
                envelopeId,
                esignEnvelopeId: envelope.esign_envelope_id_external,
                signerEmail,
            });
        } catch (error) {
            logger.error('Error resending signature request', { error, envelopeId, organizationId });
            throw error;
        }
    }

    /**
     * Handle e-sign completion for a CRM signature envelope.
     *
     * Dispatched from the internal completion handler (routes/eSign.ts) and the
     * external webhook (routes/webhooks.ts) when the underlying e-sign envelope is
     * completed/voided/expired. Mirrors the verified valuation/lease pattern: it syncs
     * the terminal status back to the CRM `signature_envelopes` row, stamps per-signer
     * signed times, flips the linked CRM document to signed, and logs deal activity.
     *
     * Without this, a fully-signed envelope stayed stuck at 'sent' on the deal's
     * Signatures tab and the linked document never flipped to signed.
     */
    async handleEsignCompletion(event: CompletionEvent): Promise<void> {
        const { envelope, sourceContext, documents, signers } = event;

        if (sourceContext.entityType !== 'signature_envelope') {
            logger.warn('Invalid entity type for CRM signature e-sign completion', {
                expected: 'signature_envelope',
                received: sourceContext.entityType,
            });
            return;
        }

        const crmEnvelopeId = sourceContext.entityId;

        try {
            const existing = await db.query<SignatureEnvelope>(
                `SELECT * FROM signature_envelopes WHERE id = $1`,
                [crmEnvelopeId]
            );

            if (existing.rows.length === 0) {
                logger.warn('CRM signature envelope not found for completion', { crmEnvelopeId });
                return;
            }

            const env = existing.rows[0];
            const signedDoc = documents?.[0];

            // Map terminal e-sign event → CRM signature status
            const terminalStatus: SignatureStatus =
                event.event === 'envelope.voided' ? 'cancelled'
                    : event.event === 'envelope.expired' ? 'expired'
                        : 'signed';

            // Stamp per-signer signed status by matching on email
            const signedByEmail = new Map(
                (signers || []).map(s => [s.email.toLowerCase(), s])
            );
            const updatedSigners: SignerInfo[] = (env.signers || []).map(s => {
                const match = signedByEmail.get(s.email.toLowerCase());
                return match
                    ? {
                        ...s,
                        status: 'signed' as const,
                        signed_at: match.signedAt,
                        ip_address: match.ipAddress,
                    }
                    : s;
            });

            await db.query(
                `UPDATE signature_envelopes
                 SET status = $1,
                     signers = $2,
                     completed_at = CASE WHEN $1 = 'signed' THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = $3`,
                [terminalStatus, JSON.stringify(updatedSigners), crmEnvelopeId]
            );

            // Flip the linked CRM document to signed (only on a real completion)
            if (terminalStatus === 'signed' && env.document_id && signedDoc?.signedUrl) {
                try {
                    const signedBy = (signers || []).map(s => {
                        const envSigner = (env.signers || []).find(
                            es => es.email.toLowerCase() === s.email.toLowerCase()
                        );
                        return {
                            user_id: (envSigner?.user_id || envSigner?.contact_id || s.email) as string,
                            signed_at: s.signedAt,
                            ip_address: s.ipAddress,
                        };
                    });
                    await crmDocumentService.markDocumentAsSigned(
                        env.document_id,
                        env.organization_id,
                        envelope.id,
                        signedBy
                    );
                } catch (docError: any) {
                    logger.error('Failed to mark CRM document as signed on completion', {
                        documentId: env.document_id,
                        crmEnvelopeId,
                        error: docError?.message,
                    });
                }
            }

            // Log activity on the associated deal
            if (env.deal_id) {
                try {
                    await activityService.createActivity({
                        deal_id: env.deal_id,
                        // No acting user at completion time — column is nullable.
                        user_id: (env.created_by || null) as unknown as string,
                        activity_type: terminalStatus === 'signed' ? 'document_received' : 'document_request',
                        subject: terminalStatus === 'signed'
                            ? 'Document fully signed'
                            : `Signature ${terminalStatus}`,
                        description: terminalStatus === 'signed'
                            ? 'All parties have signed the document'
                            : `Signature envelope ${terminalStatus}`,
                        new_value: {
                            envelope_id: crmEnvelopeId,
                            esign_envelope_id: envelope.id,
                            signed_url: signedDoc?.signedUrl,
                        },
                    });
                } catch (activityError) {
                    logger.error('Failed to log CRM signature completion activity', activityError);
                }
            }

            logger.info('CRM signature envelope completion processed', {
                crmEnvelopeId,
                esignEnvelopeId: envelope.id,
                status: terminalStatus,
            });
        } catch (error) {
            logger.error('Error processing CRM signature completion', { error, crmEnvelopeId });
            throw error;
        }
    }

    /**
     * Get signature status statistics
     */
    async getSignatureStats(
        organizationId: string,
        dealId?: string
    ): Promise<{
        total: number;
        pending: number;
        sent: number;
        signed: number;
        declined: number;
        expired: number;
    }> {
        try {
            const params: any[] = [organizationId];
            let dealFilter = '';

            if (dealId) {
                dealFilter = 'AND deal_id = $2';
                params.push(dealId);
            }

            const result = await db.query(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'sent') as sent,
                    COUNT(*) FILTER (WHERE status = 'signed') as signed,
                    COUNT(*) FILTER (WHERE status = 'declined') as declined,
                    COUNT(*) FILTER (WHERE status = 'expired') as expired
                FROM signature_envelopes
                WHERE organization_id = $1 ${dealFilter}`,
                params
            );

            const row = result.rows[0];
            return {
                total: parseInt(row.total, 10),
                pending: parseInt(row.pending, 10),
                sent: parseInt(row.sent, 10),
                signed: parseInt(row.signed, 10),
                declined: parseInt(row.declined, 10),
                expired: parseInt(row.expired, 10),
            };
        } catch (error) {
            logger.error('Error fetching signature stats', { error, organizationId });
            throw error;
        }
    }
}

export const signatureService = new SignatureService();
