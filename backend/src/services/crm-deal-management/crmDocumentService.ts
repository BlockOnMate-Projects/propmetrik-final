/**
 * CRM Document Service
 * Phase 5.2: CRM Service Layer
 * 
 * Handles document management for CRM entities (deals, contacts, companies).
 * Integrates with MinIO for storage and supports versioning and e-sign.
 * 
 * @module services/crm-deal-management/documentService
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../../database';
import { buildCrmOrderBy } from './queryHelpers';
import { logger } from '../../utils/logger';
import * as minio from '../../database/minio';
import { activityService } from './activityService';

// =============================================
// Types
// =============================================

export type DocumentType =
    | 'contract'
    | 'offer_letter'
    | 'mou'
    | 'deed_of_assignment'
    | 'indenture'
    | 'power_of_attorney'
    | 'lease_agreement'
    | 'receipt'
    | 'legal_document'
    | 'property_document'
    | 'identification'
    | 'financial_statement'
    | 'other';

export interface CrmDocument {
    id: string;
    organization_id: string;
    document_name: string;
    document_type: DocumentType;
    file_url: string;
    file_size: number;
    mime_type: string;
    checksum: string;
    entity_type: string;
    entity_id: string;
    version: number;
    parent_document_id?: string;
    is_latest_version: boolean;
    signature_envelope_id?: string;
    is_signed: boolean;
    signed_at?: Date;
    signed_by?: Record<string, any>[];
    description?: string;
    tags?: string[];
    folder?: string;
    is_public: boolean;
    allowed_users?: string[];
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
    created_by?: string;
    updated_by?: string;
}

export interface CreateDocumentInput {
    document_name: string;
    document_type: DocumentType;
    entity_type: string;
    entity_id: string;
    description?: string;
    tags?: string[];
    folder?: string;
    is_public?: boolean;
    allowed_users?: string[];
}

export interface UpdateDocumentInput {
    document_name?: string;
    document_type?: DocumentType;
    description?: string;
    tags?: string[];
    folder?: string;
    is_public?: boolean;
    allowed_users?: string[];
}

export interface DocumentFilters {
    entity_type?: string;
    entity_id?: string;
    document_type?: DocumentType;
    folder?: string;
    is_signed?: boolean;
    search?: string;
    tags?: string[];
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

export interface PaginatedDocuments {
    data: CrmDocument[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        total_pages: number;
    };
}

// =============================================
// CRM Document Service Class
// =============================================

export class CrmDocumentService {
    private bucket = minio.buckets.documents || 'propmetrik-documents';

    /**
     * Upload and create a document record
     */
    async uploadDocument(
        organizationId: string,
        data: CreateDocumentInput,
        file: {
            buffer: Buffer;
            mimetype: string;
            originalname: string;
        },
        userId?: string
    ): Promise<CrmDocument> {
        const id = uuidv4();
        const timestamp = Date.now();
        const fileExtension = file.originalname.split('.').pop() || '';

        // Generate storage key
        const key = `crm/${organizationId}/${data.entity_type}/${data.entity_id}/${timestamp}-${id}.${fileExtension}`;

        // Calculate checksum
        const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

        try {
            // Upload to MinIO
            const uploadResult = await minio.uploadFile(
                this.bucket,
                key,
                file.buffer,
                file.mimetype,
                {
                    'x-amz-meta-document-id': id,
                    'x-amz-meta-organization-id': organizationId,
                    'x-amz-meta-entity-type': data.entity_type,
                    'x-amz-meta-entity-id': data.entity_id,
                }
            );

            // Generate file URL
            const fileUrl = `${this.bucket}/${key}`;

            // Create database record
            const result = await db.query<CrmDocument>(
                `INSERT INTO documents (
                    id, organization_id, document_name, document_type,
                    file_url, file_size, mime_type, checksum,
                    entity_type, entity_id, version, is_latest_version,
                    description, tags, folder, is_public, allowed_users, created_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, true, $11, $12, $13, $14, $15, $16
                ) RETURNING *`,
                [
                    id,
                    organizationId,
                    data.document_name,
                    data.document_type,
                    fileUrl,
                    file.buffer.length,
                    file.mimetype,
                    checksum,
                    data.entity_type,
                    data.entity_id,
                    data.description || null,
                    data.tags || null,
                    data.folder || null,
                    data.is_public || false,
                    data.allowed_users || null,
                    userId || null,
                ]
            );

            const document = result.rows[0];
            logger.info('Document uploaded', { documentId: id, entityType: data.entity_type, entityId: data.entity_id });

            // Log activity if document is for a deal
            if (data.entity_type === 'deal' && userId) {
                try {
                    await activityService.createActivity({
                        deal_id: data.entity_id,
                        user_id: userId,
                        activity_type: 'document_received',
                        subject: `Document uploaded: ${data.document_name}`,
                        description: `${data.document_type} document uploaded`,
                        new_value: {
                            document_id: id,
                            document_name: data.document_name,
                            document_type: data.document_type,
                        },
                    });
                } catch (activityError) {
                    logger.error('Failed to log document upload activity', activityError);
                }
            }

            return document;
        } catch (error) {
            logger.error('Error uploading document', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get document by ID
     */
    async getDocumentById(
        documentId: string,
        organizationId: string
    ): Promise<CrmDocument | null> {
        try {
            const result = await db.query<CrmDocument>(
                `SELECT d.*,
                    u.first_name || ' ' || u.last_name as created_by_name
                FROM documents d
                LEFT JOIN users u ON d.created_by = u.id
                WHERE d.id = $1 AND d.organization_id = $2 AND d.deleted_at IS NULL`,
                [documentId, organizationId]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching document', { error, documentId, organizationId });
            throw error;
        }
    }

    /**
     * List documents with filters
     */
    async listDocuments(
        organizationId: string,
        filters: DocumentFilters = {}
    ): Promise<PaginatedDocuments> {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const offset = (page - 1) * limit;

            // Build WHERE conditions
            const conditions: string[] = [
                'd.organization_id = $1',
                'd.deleted_at IS NULL',
                'd.is_latest_version = true',
            ];
            const params: any[] = [organizationId];
            let paramIndex = 2;

            if (filters.entity_type) {
                conditions.push(`d.entity_type = $${paramIndex}`);
                params.push(filters.entity_type);
                paramIndex++;
            }

            if (filters.entity_id) {
                conditions.push(`d.entity_id = $${paramIndex}`);
                params.push(filters.entity_id);
                paramIndex++;
            }

            if (filters.document_type) {
                conditions.push(`d.document_type = $${paramIndex}`);
                params.push(filters.document_type);
                paramIndex++;
            }

            if (filters.folder) {
                conditions.push(`d.folder = $${paramIndex}`);
                params.push(filters.folder);
                paramIndex++;
            }

            if (filters.is_signed !== undefined) {
                conditions.push(`d.is_signed = $${paramIndex}`);
                params.push(filters.is_signed);
                paramIndex++;
            }

            if (filters.search) {
                conditions.push(`d.document_name ILIKE $${paramIndex}`);
                params.push(`%${filters.search}%`);
                paramIndex++;
            }

            if (filters.tags && filters.tags.length > 0) {
                conditions.push(`d.tags && $${paramIndex}`);
                params.push(filters.tags);
                paramIndex++;
            }

            const whereClause = conditions.join(' AND ');
            const orderBy = buildCrmOrderBy(
                'd',
                ['created_at', 'updated_at', 'title', 'document_type', 'file_size'],
                filters.sort_by,
                'created_at',
                filters.sort_order,
                'desc',
            );

            // Get total count
            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM documents d WHERE ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total, 10);

            // Get paginated data
            const dataParams = [...params, limit, offset];
            const result = await db.query<CrmDocument>(
                `SELECT d.*,
                    u.first_name || ' ' || u.last_name as created_by_name
                FROM documents d
                LEFT JOIN users u ON d.created_by = u.id
                WHERE ${whereClause}
                ORDER BY ${orderBy}
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
            logger.error('Error listing documents', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get documents for a specific entity
     */
    async getDocumentsByEntity(
        organizationId: string,
        entityType: string,
        entityId: string
    ): Promise<CrmDocument[]> {
        try {
            const result = await db.query<CrmDocument>(
                `SELECT d.*,
                    u.first_name || ' ' || u.last_name as created_by_name
                FROM documents d
                LEFT JOIN users u ON d.created_by = u.id
                WHERE d.organization_id = $1 
                    AND d.entity_type = $2 
                    AND d.entity_id = $3 
                    AND d.deleted_at IS NULL
                    AND d.is_latest_version = true
                ORDER BY d.created_at DESC`,
                [organizationId, entityType, entityId]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching documents by entity', { error, entityType, entityId, organizationId });
            throw error;
        }
    }

    /**
     * Get download URL for a document
     */
    async getDownloadUrl(
        documentId: string,
        organizationId: string,
        expiresInSeconds: number = 3600
    ): Promise<string> {
        try {
            const doc = await this.getDocumentById(documentId, organizationId);
            if (!doc) {
                throw new Error('Document not found');
            }

            // Parse bucket and key from file_url
            const [bucket, ...keyParts] = doc.file_url.split('/');
            const key = keyParts.join('/');

            return await minio.getPresignedDownloadUrl(bucket, key, expiresInSeconds);
        } catch (error) {
            logger.error('Error generating download URL', { error, documentId, organizationId });
            throw error;
        }
    }

    /**
     * Get upload URL for new document
     */
    async getUploadUrl(
        organizationId: string,
        entityType: string,
        entityId: string,
        filename: string,
        contentType: string,
        expiresInSeconds: number = 3600
    ): Promise<{ uploadUrl: string; key: string }> {
        try {
            const timestamp = Date.now();
            const id = uuidv4();
            const fileExtension = filename.split('.').pop() || '';

            const key = `crm/${organizationId}/${entityType}/${entityId}/${timestamp}-${id}.${fileExtension}`;

            const uploadUrl = await minio.getPresignedUploadUrl(
                this.bucket,
                key,
                contentType,
                expiresInSeconds
            );

            return { uploadUrl, key };
        } catch (error) {
            logger.error('Error generating upload URL', { error, organizationId });
            throw error;
        }
    }

    /**
     * Update document metadata
     */
    async updateDocument(
        documentId: string,
        organizationId: string,
        data: UpdateDocumentInput,
        userId?: string
    ): Promise<CrmDocument> {
        try {
            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (data.document_name !== undefined) {
                updates.push(`document_name = $${paramIndex}`);
                params.push(data.document_name);
                paramIndex++;
            }

            if (data.document_type !== undefined) {
                updates.push(`document_type = $${paramIndex}`);
                params.push(data.document_type);
                paramIndex++;
            }

            if (data.description !== undefined) {
                updates.push(`description = $${paramIndex}`);
                params.push(data.description);
                paramIndex++;
            }

            if (data.tags !== undefined) {
                updates.push(`tags = $${paramIndex}`);
                params.push(data.tags);
                paramIndex++;
            }

            if (data.folder !== undefined) {
                updates.push(`folder = $${paramIndex}`);
                params.push(data.folder);
                paramIndex++;
            }

            if (data.is_public !== undefined) {
                updates.push(`is_public = $${paramIndex}`);
                params.push(data.is_public);
                paramIndex++;
            }

            if (data.allowed_users !== undefined) {
                updates.push(`allowed_users = $${paramIndex}`);
                params.push(data.allowed_users);
                paramIndex++;
            }

            if (userId) {
                updates.push(`updated_by = $${paramIndex}`);
                params.push(userId);
                paramIndex++;
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(documentId, organizationId);

            const result = await db.query<CrmDocument>(
                `UPDATE documents
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
                RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                throw new Error('Document not found or unauthorized');
            }

            logger.info('Document updated', { documentId, organizationId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating document', { error, documentId, organizationId });
            throw error;
        }
    }

    /**
     * Upload new version of a document
     */
    async uploadNewVersion(
        parentDocumentId: string,
        organizationId: string,
        file: {
            buffer: Buffer;
            mimetype: string;
            originalname: string;
        },
        userId?: string
    ): Promise<CrmDocument> {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            // Get parent document
            const parentResult = await client.query<CrmDocument>(
                `SELECT * FROM documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
                [parentDocumentId, organizationId]
            );

            if (parentResult.rows.length === 0) {
                throw new Error('Parent document not found');
            }

            const parent = parentResult.rows[0];

            // Mark parent as not latest
            await client.query(
                `UPDATE documents SET is_latest_version = false, updated_at = NOW()
                WHERE id = $1`,
                [parentDocumentId]
            );

            // Create new version
            const newId = uuidv4();
            const timestamp = Date.now();
            const fileExtension = file.originalname.split('.').pop() || '';
            const key = `crm/${organizationId}/${parent.entity_type}/${parent.entity_id}/${timestamp}-${newId}.${fileExtension}`;
            const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

            // Upload to MinIO
            await minio.uploadFile(
                this.bucket,
                key,
                file.buffer,
                file.mimetype,
                {
                    'x-amz-meta-document-id': newId,
                    'x-amz-meta-parent-document-id': parentDocumentId,
                }
            );

            const fileUrl = `${this.bucket}/${key}`;

            // Create new version record
            const result = await client.query<CrmDocument>(
                `INSERT INTO documents (
                    id, organization_id, document_name, document_type,
                    file_url, file_size, mime_type, checksum,
                    entity_type, entity_id, version, parent_document_id, is_latest_version,
                    description, tags, folder, is_public, allowed_users, created_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true,
                    $13, $14, $15, $16, $17, $18
                ) RETURNING *`,
                [
                    newId,
                    organizationId,
                    parent.document_name,
                    parent.document_type,
                    fileUrl,
                    file.buffer.length,
                    file.mimetype,
                    checksum,
                    parent.entity_type,
                    parent.entity_id,
                    parent.version + 1,
                    parentDocumentId,
                    parent.description,
                    parent.tags,
                    parent.folder,
                    parent.is_public,
                    parent.allowed_users,
                    userId || null,
                ]
            );

            await client.query('COMMIT');

            logger.info('New document version uploaded', {
                documentId: newId,
                parentDocumentId,
                version: parent.version + 1,
            });

            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error uploading new document version', { error, parentDocumentId, organizationId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get document version history
     */
    async getDocumentVersions(
        documentId: string,
        organizationId: string
    ): Promise<CrmDocument[]> {
        try {
            // Find root document (first in version chain)
            let rootId = documentId;
            let currentDoc = await this.getDocumentById(documentId, organizationId);

            while (currentDoc?.parent_document_id) {
                rootId = currentDoc.parent_document_id;
                currentDoc = await this.getDocumentById(rootId, organizationId);
            }

            // Get all versions
            const result = await db.query<CrmDocument>(
                `WITH RECURSIVE version_chain AS (
                    SELECT * FROM documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
                    UNION ALL
                    SELECT d.* FROM documents d
                    INNER JOIN version_chain vc ON d.parent_document_id = vc.id
                    WHERE d.deleted_at IS NULL
                )
                SELECT * FROM version_chain ORDER BY version`,
                [rootId, organizationId]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching document versions', { error, documentId, organizationId });
            throw error;
        }
    }

    /**
     * Soft delete document
     */
    async deleteDocument(
        documentId: string,
        organizationId: string
    ): Promise<void> {
        try {
            // Check if document is signed
            const doc = await this.getDocumentById(documentId, organizationId);
            if (doc?.is_signed) {
                throw new Error('Cannot delete signed documents');
            }

            const result = await db.query(
                `UPDATE documents
                SET deleted_at = NOW()
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
                RETURNING id`,
                [documentId, organizationId]
            );

            if (result.rows.length === 0) {
                throw new Error('Document not found or already deleted');
            }

            logger.info('Document soft deleted', { documentId, organizationId });
        } catch (error) {
            logger.error('Error deleting document', { error, documentId, organizationId });
            throw error;
        }
    }

    /**
     * Mark document as signed
     */
    async markDocumentAsSigned(
        documentId: string,
        organizationId: string,
        signatureEnvelopeId: string,
        signedBy: { user_id: string; signed_at: Date; ip_address?: string }[]
    ): Promise<CrmDocument> {
        try {
            const result = await db.query<CrmDocument>(
                `UPDATE documents
                SET is_signed = true, 
                    signed_at = NOW(),
                    signature_envelope_id = $3,
                    signed_by = $4
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
                RETURNING *`,
                [documentId, organizationId, signatureEnvelopeId, JSON.stringify(signedBy)]
            );

            if (result.rows.length === 0) {
                throw new Error('Document not found');
            }

            logger.info('Document marked as signed', { documentId, signatureEnvelopeId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error marking document as signed', { error, documentId, organizationId });
            throw error;
        }
    }

    /**
     * Get document statistics
     */
    async getDocumentStats(
        organizationId: string,
        entityType?: string,
        entityId?: string
    ): Promise<{
        total: number;
        by_type: Record<string, number>;
        signed: number;
        total_size_bytes: number;
    }> {
        try {
            const params: any[] = [organizationId];
            let entityFilter = '';

            if (entityType && entityId) {
                entityFilter = 'AND entity_type = $2 AND entity_id = $3';
                params.push(entityType, entityId);
            }

            const result = await db.query(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_signed = true) as signed,
                    COALESCE(SUM(file_size), 0) as total_size_bytes,
                    jsonb_object_agg(
                        COALESCE(document_type::text, 'other'), 
                        type_count
                    ) as by_type
                FROM (
                    SELECT 
                        document_type,
                        file_size,
                        is_signed,
                        COUNT(*) OVER (PARTITION BY document_type) as type_count
                    FROM documents
                    WHERE organization_id = $1 
                        AND deleted_at IS NULL 
                        AND is_latest_version = true
                        ${entityFilter}
                ) subquery`,
                params
            );

            const row = result.rows[0];
            return {
                total: parseInt(row.total, 10) || 0,
                by_type: row.by_type || {},
                signed: parseInt(row.signed, 10) || 0,
                total_size_bytes: parseInt(row.total_size_bytes, 10) || 0,
            };
        } catch (error) {
            logger.error('Error fetching document stats', { error, organizationId });
            throw error;
        }
    }
}

export const crmDocumentService = new CrmDocumentService();
