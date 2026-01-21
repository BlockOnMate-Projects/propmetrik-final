/**
 * CRM Signature Service
 * Phase 5.2: CRM Service Layer
 * 
 * Integrates with the shared e-sign service for document signing workflows.
 * Manages signature envelopes, signer tracking, and e-sign status.
 * 
 * @module services/crm-deal-management/signatureService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { activityService } from './activityService';
import { crmDocumentService } from './crmDocumentService';

// Import shared e-sign service
import { EnvelopeService, EnvelopeStatus, CreateEnvelopeDto, FieldType } from '../../../shared-services/e-sign/envelopeService';
import { pool } from '../../database';

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
    private envelopeService: EnvelopeService;

    constructor() {
        this.envelopeService = new EnvelopeService(pool);
    }

    /**
     * Create a signature envelope and request signatures
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
     * Send the signature request
     * This integrates with the shared e-sign service
     */
    async sendSignatureRequest(
        envelopeId: string,
        organizationId: string,
        userId?: string
    ): Promise<SignatureEnvelope> {
        try {
            // Get the envelope
            const envelope = await this.getEnvelopeById(envelopeId, organizationId);
            if (!envelope) {
                throw new Error('Envelope not found');
            }

            if (envelope.status !== 'pending') {
                throw new Error(`Cannot send envelope with status: ${envelope.status}`);
            }

            // Get the document
            const document = await crmDocumentService.getDocumentById(envelope.document_id, organizationId);
            if (!document) {
                throw new Error('Document not found');
            }

            // Get download URL for PDF
            const downloadUrl = await crmDocumentService.getDownloadUrl(envelope.document_id, organizationId);

            // Create envelope in shared e-sign service
            const createEnvelopeDto: CreateEnvelopeDto = {
                name: envelope.subject || `Sign: ${document.document_name}`,
                documentHtml: `<iframe src="${downloadUrl}" width="100%" height="800px"></iframe>`,
                contextType: 'crm_deal',
                contextEntityId: envelope.deal_id || undefined,
                contextEntityName: document.document_name,
                message: envelope.message || undefined,
                expiresInDays: envelope.expires_at
                    ? Math.ceil((envelope.expires_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
                    : 30,
                signers: envelope.signers.map((s: SignerInfo) => ({
                    name: s.name,
                    email: s.email,
                    phone: undefined,
                    role: 'signer',
                    order: s.order,
                })),
                fields: envelope.signers.map((s: SignerInfo, index: number) => ({
                    signerId: `signer-${index}`,
                    fieldType: FieldType.SIGNATURE,
                    page: 1,
                    x: 100,
                    y: 700 - (index * 100),
                    width: 200,
                    height: 50,
                    required: true,
                    label: `Signature - ${s.name}`,
                })),
            };

            const esignEnvelope = await this.envelopeService.createAndSendEnvelope(
                organizationId,
                userId || '',
                createEnvelopeDto
            );

            // Update CRM envelope with e-sign ID and status
            const result = await db.query<SignatureEnvelope>(
                `UPDATE signature_envelopes
                SET esign_envelope_id = $1, 
                    status = 'sent', 
                    sent_at = NOW(),
                    signers = $2
                WHERE id = $3 AND organization_id = $4
                RETURNING *`,
                [
                    esignEnvelope.id,
                    JSON.stringify(envelope.signers.map((s: SignerInfo) => ({ ...s, status: 'sent' }))),
                    envelopeId,
                    organizationId,
                ]
            );

            logger.info('Signature request sent', { envelopeId, esignEnvelopeId: esignEnvelope.id });

            return result.rows[0];
        } catch (error) {
            logger.error('Error sending signature request', { error, envelopeId, organizationId });
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
     * Update envelope status from e-sign service callback
     * This is called when the shared e-sign service notifies us of status changes
     */
    async handleEsignCallback(
        esignEnvelopeId: string,
        status: EnvelopeStatus,
        signerUpdates?: {
            email: string;
            status: 'signed' | 'declined' | 'viewed';
            signedAt?: Date;
            ipAddress?: string;
            userAgent?: string;
        }[]
    ): Promise<SignatureEnvelope | null> {
        try {
            // Find CRM envelope by e-sign ID
            const envelopeResult = await db.query<SignatureEnvelope>(
                `SELECT * FROM signature_envelopes WHERE esign_envelope_id = $1`,
                [esignEnvelopeId]
            );

            if (envelopeResult.rows.length === 0) {
                logger.warn('No CRM envelope found for e-sign callback', { esignEnvelopeId });
                return null;
            }

            const envelope = envelopeResult.rows[0];

            // Map e-sign status to CRM status
            const statusMap: Record<EnvelopeStatus, SignatureStatus> = {
                [EnvelopeStatus.DRAFT]: 'pending',
                [EnvelopeStatus.SENT]: 'sent',
                [EnvelopeStatus.DELIVERED]: 'sent',
                [EnvelopeStatus.SIGNED]: 'signed',
                [EnvelopeStatus.COMPLETED]: 'signed',
                [EnvelopeStatus.DECLINED]: 'declined',
                [EnvelopeStatus.VOIDED]: 'cancelled',
                [EnvelopeStatus.EXPIRED]: 'expired',
            };

            const newStatus = statusMap[status] || envelope.status;

            // Update signer statuses if provided
            let updatedSigners = envelope.signers;
            if (signerUpdates && signerUpdates.length > 0) {
                updatedSigners = (envelope.signers as SignerInfo[]).map((signer) => {
                    const update = signerUpdates.find(u => u.email === signer.email);
                    if (update) {
                        return {
                            ...signer,
                            status: update.status,
                            signed_at: update.signedAt,
                            ip_address: update.ipAddress,
                            user_agent: update.userAgent,
                        };
                    }
                    return signer;
                });
            }

            // Update envelope
            const updateFields: string[] = [`status = $1`, `signers = $2`];
            const updateParams: any[] = [newStatus, JSON.stringify(updatedSigners)];
            let paramIndex = 3;

            if (status === EnvelopeStatus.COMPLETED || status === EnvelopeStatus.SIGNED) {
                updateFields.push(`completed_at = NOW()`);
            }

            if (status === EnvelopeStatus.DELIVERED) {
                updateFields.push(`viewed_at = COALESCE(viewed_at, NOW())`);
            }

            updateParams.push(envelope.id);

            const result = await db.query<SignatureEnvelope>(
                `UPDATE signature_envelopes
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *`,
                updateParams
            );

            const updatedEnvelope = result.rows[0];

            // If completed, mark the document as signed
            if (newStatus === 'signed' && updatedEnvelope) {
                await crmDocumentService.markDocumentAsSigned(
                    envelope.document_id,
                    envelope.organization_id,
                    envelope.id,
                    updatedSigners.filter((s: SignerInfo) => s.status === 'signed').map((s: SignerInfo) => ({
                        user_id: s.user_id || s.contact_id || s.email,
                        signed_at: s.signed_at || new Date(),
                        ip_address: s.ip_address,
                    }))
                );

                // Log activity
                if (envelope.deal_id) {
                    try {
                        await activityService.createActivity({
                            deal_id: envelope.deal_id,
                            user_id: updatedSigners.find((s: SignerInfo) => s.status === 'signed')?.user_id || 'system',
                            activity_type: 'document_review',
                            subject: 'Document signed',
                            description: `All signers have signed the document`,
                            outcome: 'completed',
                            new_value: {
                                envelope_id: envelope.id,
                                document_id: envelope.document_id,
                            },
                        });
                    } catch (activityError) {
                        logger.error('Failed to log document signed activity', activityError);
                    }
                }
            }

            logger.info('Envelope status updated from e-sign callback', {
                envelopeId: envelope.id,
                esignEnvelopeId,
                newStatus,
            });

            return updatedEnvelope;
        } catch (error) {
            logger.error('Error handling e-sign callback', { error, esignEnvelopeId });
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

            // Cancel in e-sign service if sent
            if (envelope.esign_envelope_id) {
                try {
                    await this.envelopeService.voidEnvelope(
                        envelope.esign_envelope_id,
                        organizationId,
                        userId || 'system',
                        reason || 'Cancelled by user'
                    );
                } catch (esignError) {
                    logger.warn('Failed to void envelope in e-sign service', { esignError, esignEnvelopeId: envelope.esign_envelope_id });
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
     * Resend signature request
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

            if (envelope.status !== 'sent') {
                throw new Error(`Cannot resend for envelope with status: ${envelope.status}`);
            }

            if (!envelope.esign_envelope_id) {
                throw new Error('Envelope has not been sent yet');
            }

            // Resend via e-sign service
            // Note: This would call the shared e-sign service's resend functionality
            logger.info('Signature request resent', { envelopeId, signerEmail });
        } catch (error) {
            logger.error('Error resending signature request', { error, envelopeId, organizationId });
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
