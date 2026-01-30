/**
 * CRM Signature Service
 * Phase 5.2: CRM Service Layer
 * 
 * Manages signature envelopes and signer tracking for CRM documents.
 * NOTE: E-sign integration has been removed. This service is now a stub.
 * 
 * @module services/crm-deal-management/signatureService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { activityService } from './activityService';
import { crmDocumentService } from './crmDocumentService';

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
    constructor() {}

    /**
     * Create a signature envelope (stub - e-sign removed)
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
     * Send the signature request (stub - e-sign removed)
     */
    async sendSignatureRequest(
        envelopeId: string,
        organizationId: string,
        userId?: string
    ): Promise<SignatureEnvelope> {
        throw new Error('E-sign service has been removed. Signature sending is not available.');
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
     * Resend signature request (stub - e-sign removed)
     */
    async resendRequest(
        envelopeId: string,
        organizationId: string,
        signerEmail?: string
    ): Promise<void> {
        throw new Error('E-sign service has been removed. Signature resending is not available.');
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
