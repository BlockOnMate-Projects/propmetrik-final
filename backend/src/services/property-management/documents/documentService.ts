
import { v4 as uuidv4 } from 'uuid';
import db from '../../../database';
import {
    PropertyDocument,
    CreatePropertyDocumentDto,
    PropertyDocumentType,
    PaginationParams,
    PaginatedResponse
} from '../../../types/property-management.types';
import { AppError } from '../../../middleware/errorHandler';

/**
 * Unified document interface for the Document Vault
 * Merges property_management_documents + lease_documents + tenancy lease URLs
 */
export interface VaultDocument {
    id: string;
    title: string;
    fileName: string;
    fileUrl: string;
    fileSizeBytes?: number;
    mimeType?: string;
    documentType: string;
    source: 'upload' | 'lease' | 'signed_lease';
    propertyId?: string;
    propertyTitle?: string;
    tenancyId?: string;
    tenantName?: string;
    signingStatus?: string; // draft | sent_for_signature | partially_signed | signed | expired | voided
    isVerified: boolean;
    tags?: string[];
    createdAt: string;
    updatedAt?: string;
}

export interface VaultSummary {
    totalFiles: number;
    totalStorageBytes: number;
    leaseDocuments: number;
    signedLeases: number;
    tenantUploads: number;
    byType: Record<string, number>;
}

export class DocumentService {
    /**
     * Record a new document upload
     */
    async createDocument(
        organizationId: string,
        data: CreatePropertyDocumentDto & {
            fileUrl: string;
            fileName: string;
            fileSizeBytes?: number;
            mimeType?: string;
        },
        userId: string
    ): Promise<PropertyDocument> {
        const id = uuidv4();

        const query = `
      INSERT INTO property_management_documents (
        id, property_id, tenancy_id, organization_id, 
        document_type, title, description, 
        file_url, file_name, file_size_bytes, mime_type,
        issue_date, expiry_date, issuing_authority, reference_number,
        folder_path, tags, uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

        const values = [
            id,
            data.propertyId,
            data.tenancyId || null,
            organizationId,
            data.documentType,
            data.title,
            data.description || null,
            data.fileUrl,
            data.fileName,
            data.fileSizeBytes || null,
            data.mimeType || null,
            data.issueDate ? new Date(data.issueDate) : null,
            data.expiryDate ? new Date(data.expiryDate) : null,
            data.issuingAuthority || null,
            data.referenceNumber || null,
            data.folderPath || '/',
            data.tags || [],
            userId
        ];

        const result = await db.query(query, values);
        return this.mapToDocument(result.rows[0]);
    }

    /**
     * Get documents for a property
     */
    async listDocuments(
        organizationId: string,
        filters: {
            propertyId?: string;
            tenancyId?: string;
            type?: PropertyDocumentType;
            search?: string;
            isVerified?: boolean;
        },
        pagination: PaginationParams
    ): Promise<PaginatedResponse<PropertyDocument>> {
        const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        const conditions = [`organization_id = $1`];
        const values: any[] = [organizationId];
        let paramIndex = 2;

        if (filters.propertyId) {
            conditions.push(`property_id = $${paramIndex}`);
            values.push(filters.propertyId);
            paramIndex++;
        }

        if (filters.tenancyId) {
            conditions.push(`tenancy_id = $${paramIndex}`);
            values.push(filters.tenancyId);
            paramIndex++;
        }

        if (filters.type) {
            conditions.push(`document_type = $${paramIndex}`);
            values.push(filters.type);
            paramIndex++;
        }

        if (filters.isVerified !== undefined) {
            conditions.push(`is_verified = $${paramIndex}`);
            values.push(filters.isVerified);
            paramIndex++;
        }

        if (filters.search) {
            conditions.push(`(
        title ILIKE $${paramIndex} OR 
        description ILIKE $${paramIndex} OR
        file_name ILIKE $${paramIndex} OR
        reference_number ILIKE $${paramIndex}
      )`);
            values.push(`%${filters.search}%`);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total
        const countQuery = `SELECT COUNT(*) FROM property_management_documents ${whereClause}`;
        const countResult = await db.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Get Data
        const query = `
      SELECT * FROM property_management_documents
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

        values.push(limit, offset);

        const result = await db.query(query, values);
        const data = result.rows.map(this.mapToDocument);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrevious: page > 1
        };
    }

    /**
     * Verify a document
     */
    async verifyDocument(id: string, organizationId: string, verifiedBy: string): Promise<PropertyDocument> {
        const query = `
      UPDATE property_management_documents
      SET is_verified = TRUE, verified_by = $2, verified_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $3
      RETURNING *
    `;
        const result = await db.query(query, [id, verifiedBy, organizationId]);

        if (result.rows.length === 0) {
            throw new AppError('Document not found', 404);
        }

        return this.mapToDocument(result.rows[0]);
    }

    /**
     * Delete a document (metadata only, physical file deletion handled elsewhere)
     */
    async deleteDocument(id: string, organizationId: string): Promise<void> {
        const query = `
      DELETE FROM property_management_documents
      WHERE id = $1 AND organization_id = $2
    `;
        const result = await db.query(query, [id, organizationId]);

        if ((result.rowCount ?? 0) === 0) {
            throw new AppError('Document not found', 404);
        }
    }

    /**
     * Get unified document vault: property_management_documents + lease_documents + tenancy signed leases
     */
    async listVaultDocuments(
        organizationId: string,
        filters: {
            search?: string;
            source?: 'upload' | 'lease' | 'signed_lease' | 'all';
            category?: 'legal' | 'financial' | 'tenant' | 'all';
            propertyId?: string;
            tenancyId?: string;
        },
        pagination: PaginationParams
    ): Promise<{ data: VaultDocument[]; total: number; page: number; limit: number; totalPages: number; summary: VaultSummary }> {
        const { page = 1, limit = 50, sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        // ---- 1. Property Management Documents (uploads) ----
        const pmConditions = [`pmd.organization_id = $1`];
        const pmValues: any[] = [organizationId];
        let pmIdx = 2;

        if (filters.propertyId) {
            pmConditions.push(`pmd.property_id = $${pmIdx}`);
            pmValues.push(filters.propertyId);
            pmIdx++;
        }
        if (filters.tenancyId) {
            pmConditions.push(`pmd.tenancy_id = $${pmIdx}`);
            pmValues.push(filters.tenancyId);
            pmIdx++;
        }
        if (filters.search) {
            pmConditions.push(`(pmd.title ILIKE $${pmIdx} OR pmd.file_name ILIKE $${pmIdx} OR pmd.description ILIKE $${pmIdx})`);
            pmValues.push(`%${filters.search}%`);
            pmIdx++;
        }
        if (filters.category === 'legal') {
            pmConditions.push(`pmd.document_type IN ('lease_agreement','indenture','power_of_attorney','tenant_agreements','lands_commission_search')`);
        } else if (filters.category === 'financial') {
            pmConditions.push(`pmd.document_type IN ('property_tax_receipts','insurance_policies','mortgage_documents','utility_bills','vendor_contracts')`);
        } else if (filters.category === 'tenant') {
            pmConditions.push(`pmd.tenancy_id IS NOT NULL`);
        }

        const pmQuery = `
            SELECT 
                pmd.id,
                pmd.title,
                pmd.file_name,
                pmd.file_url,
                pmd.file_size_bytes,
                pmd.mime_type,
                pmd.document_type,
                'upload' as source,
                pmd.property_id,
                p.title as property_title,
                pmd.tenancy_id,
                t_info.full_name as tenant_name,
                NULL as signing_status,
                pmd.is_verified,
                pmd.tags,
                pmd.created_at,
                pmd.updated_at
            FROM property_management_documents pmd
            LEFT JOIN properties p ON p.id = pmd.property_id
            LEFT JOIN tenancies ten ON ten.id = pmd.tenancy_id
            LEFT JOIN tenants t_info ON t_info.id = ten.tenant_id
            WHERE ${pmConditions.join(' AND ')}
        `;

        // ---- 2. Lease Documents (generated from templates) ----
        const ldConditions = [`ld.organization_id = $1`];
        const ldValues: any[] = [organizationId];
        let ldIdx = 2;

        if (filters.propertyId) {
            ldConditions.push(`ten2.property_id = $${ldIdx}`);
            ldValues.push(filters.propertyId);
            ldIdx++;
        }
        if (filters.tenancyId) {
            ldConditions.push(`ld.tenancy_id = $${ldIdx}`);
            ldValues.push(filters.tenancyId);
            ldIdx++;
        }
        if (filters.search) {
            ldConditions.push(`(ld.filename ILIKE $${ldIdx})`);
            ldValues.push(`%${filters.search}%`);
            ldIdx++;
        }
        // For category filters: lease docs are always 'legal'
        if (filters.category === 'financial' || filters.category === 'tenant') {
            // Lease documents don't match these categories — exclude
            ldConditions.push(`FALSE`);
        }

        const ldQuery = `
            SELECT 
                ld.id,
                COALESCE('Lease Agreement - ' || p2.title, ld.filename) as title,
                ld.filename as file_name,
                ld.document_key as file_url,
                NULL::bigint as file_size_bytes,
                'application/pdf' as mime_type,
                'lease_agreement' as document_type,
                CASE WHEN ten2.lease_signed_url IS NOT NULL THEN 'signed_lease' ELSE 'lease' END as source,
                ten2.property_id,
                p2.title as property_title,
                ld.tenancy_id,
                t_info2.full_name as tenant_name,
                COALESCE(ten2.esign_status, 'draft') as signing_status,
                CASE WHEN ten2.lease_signed_url IS NOT NULL THEN TRUE ELSE FALSE END as is_verified,
                ARRAY[]::text[] as tags,
                ld.generated_at as created_at,
                ld.generated_at as updated_at
            FROM lease_documents ld
            LEFT JOIN tenancies ten2 ON ten2.id = ld.tenancy_id
            LEFT JOIN properties p2 ON p2.id = ten2.property_id
            LEFT JOIN tenants t_info2 ON t_info2.id = ten2.tenant_id
            WHERE ${ldConditions.join(' AND ')}
        `;

        // ---- 3. Tenancy signed lease URLs (from tenancies table directly) ----
        const tsConditions = [`ten3.organization_id = $1`, `(ten3.lease_document_url IS NOT NULL OR ten3.lease_signed_url IS NOT NULL)`];
        const tsValues: any[] = [organizationId];
        let tsIdx = 2;

        if (filters.propertyId) {
            tsConditions.push(`ten3.property_id = $${tsIdx}`);
            tsValues.push(filters.propertyId);
            tsIdx++;
        }
        if (filters.tenancyId) {
            tsConditions.push(`ten3.id = $${tsIdx}`);
            tsValues.push(filters.tenancyId);
            tsIdx++;
        }
        if (filters.search) {
            tsConditions.push(`(p3.title ILIKE $${tsIdx} OR t_info3.full_name ILIKE $${tsIdx})`);
            tsValues.push(`%${filters.search}%`);
            tsIdx++;
        }
        if (filters.category === 'financial' || filters.category === 'tenant') {
            tsConditions.push(`FALSE`);
        }

        const tsQuery = `
            SELECT 
                ten3.id,
                CASE 
                    WHEN ten3.lease_signed_url IS NOT NULL THEN 'Signed Lease - ' || COALESCE(p3.title, 'Property')
                    ELSE 'Draft Lease - ' || COALESCE(p3.title, 'Property')
                END as title,
                CASE 
                    WHEN ten3.lease_signed_url IS NOT NULL THEN 'signed_lease.pdf'
                    ELSE 'draft_lease.pdf'
                END as file_name,
                COALESCE(ten3.lease_signed_url, ten3.lease_document_url) as file_url,
                NULL::bigint as file_size_bytes,
                'application/pdf' as mime_type,
                'lease_agreement' as document_type,
                CASE WHEN ten3.lease_signed_url IS NOT NULL THEN 'signed_lease' ELSE 'lease' END as source,
                ten3.property_id,
                p3.title as property_title,
                ten3.id as tenancy_id,
                t_info3.full_name as tenant_name,
                CASE 
                    WHEN ten3.lease_signed_url IS NOT NULL THEN 'signed'
                    WHEN ten3.esign_status IS NOT NULL THEN ten3.esign_status
                    ELSE 'draft'
                END as signing_status,
                CASE WHEN ten3.lease_signed_url IS NOT NULL THEN TRUE ELSE FALSE END as is_verified,
                ARRAY[]::text[] as tags,
                COALESCE(ten3.lease_sent_at, ten3.created_at) as created_at,
                ten3.updated_at
            FROM tenancies ten3
            LEFT JOIN properties p3 ON p3.id = ten3.property_id
            LEFT JOIN tenants t_info3 ON t_info3.id = ten3.tenant_id
            WHERE ${tsConditions.join(' AND ')}
        `;

        // Apply source filter — run all 3 queries in parallel
        // IMPORTANT: We process tsQuery (tenancies/signed leases) BEFORE ldQuery (lease_documents)
        // so the signed version takes priority over the unsigned template during dedup.
        const allResults: { source: 'pm' | 'ts' | 'ld'; sql: string; values: any[] }[] = [];
        const sourceFilter = filters.source || 'all';
        if (sourceFilter === 'all' || sourceFilter === 'upload') {
            allResults.push({ source: 'pm', sql: pmQuery, values: pmValues });
        }
        if (sourceFilter === 'all' || sourceFilter === 'signed_lease' || sourceFilter === 'lease') {
            allResults.push({ source: 'ts', sql: tsQuery, values: tsValues });
        }
        if (sourceFilter === 'all' || sourceFilter === 'lease') {
            allResults.push({ source: 'ld', sql: ldQuery, values: ldValues });
        }

        // Execute all queries in parallel
        const rawResults = await Promise.all(allResults.map(q => db.query(q.sql, q.values)));
        
        // Reorder: pm first, then ts (signed/tenancy leases), then ld (unsigned template leases)
        // This ensures signed versions win dedup over unsigned templates
        const orderedResults: { source: string; rows: any[] }[] = [];
        for (let i = 0; i < allResults.length; i++) {
            orderedResults.push({ source: allResults[i].source, rows: rawResults[i].rows });
        }
        // Sort so pm < ts < ld
        orderedResults.sort((a, b) => {
            const order = { pm: 0, ts: 1, ld: 2 };
            return (order[a.source as keyof typeof order] ?? 9) - (order[b.source as keyof typeof order] ?? 9);
        });

        // Merge and deduplicate (lease docs may appear in both lease_documents and tenancy URLs)
        const allDocs: VaultDocument[] = [];
        const seenTenancyLeases = new Set<string>();

        for (const result of orderedResults) {
            for (const row of result.rows) {
                // Deduplicate: signed lease from tenancies takes priority; skip unsigned lease_documents duplicate
                const dedupeKey = row.tenancy_id && row.source !== 'upload' ? `lease-${row.tenancy_id}` : null;
                if (dedupeKey) {
                    if (seenTenancyLeases.has(dedupeKey)) continue;
                    seenTenancyLeases.add(dedupeKey);
                }

                // Convert MinIO keys and data URLs to proper download URLs
                let resolvedFileUrl = row.file_url;
                
                // Handle data: URLs (base64-encoded signed PDFs stored in tenancies.lease_signed_url)
                if (resolvedFileUrl && resolvedFileUrl.startsWith('data:')) {
                    // Route through a dedicated signed-lease endpoint
                    resolvedFileUrl = `/api/v1/pm/tenancies/${row.tenancy_id}/signed-lease`;
                } else if (resolvedFileUrl && !resolvedFileUrl.startsWith('http') && !resolvedFileUrl.startsWith('/api/')) {
                    // It's a MinIO key — route through the file proxy
                    // Determine the bucket from the key pattern
                    const bucket = resolvedFileUrl.startsWith('propmetrik-') 
                        ? resolvedFileUrl.split('/')[0] 
                        : 'propmetrik-documents';
                    const key = resolvedFileUrl.startsWith('propmetrik-')
                        ? resolvedFileUrl.substring(bucket.length + 1)
                        : resolvedFileUrl;
                    resolvedFileUrl = `/api/v1/files/${bucket}/${key}`;
                }

                allDocs.push({
                    id: row.id,
                    title: row.title,
                    fileName: row.file_name,
                    fileUrl: resolvedFileUrl,
                    fileSizeBytes: row.file_size_bytes ? parseInt(row.file_size_bytes) : undefined,
                    mimeType: row.mime_type,
                    documentType: row.document_type,
                    source: row.source,
                    propertyId: row.property_id,
                    propertyTitle: row.property_title,
                    tenancyId: row.tenancy_id,
                    tenantName: row.tenant_name,
                    signingStatus: row.signing_status,
                    isVerified: row.is_verified || false,
                    tags: row.tags || [],
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                });
            }
        }

        // Sort by created_at
        allDocs.sort((a, b) => {
            const da = new Date(a.createdAt).getTime();
            const db_time = new Date(b.createdAt).getTime();
            return sortOrder === 'asc' ? da - db_time : db_time - da;
        });

        // Build summary
        const summary: VaultSummary = {
            totalFiles: allDocs.length,
            totalStorageBytes: allDocs.reduce((sum, d) => sum + (d.fileSizeBytes || 0), 0),
            leaseDocuments: allDocs.filter(d => d.source === 'lease' || d.source === 'signed_lease').length,
            signedLeases: allDocs.filter(d => d.source === 'signed_lease' || d.signingStatus === 'signed').length,
            tenantUploads: allDocs.filter(d => d.source === 'upload' && d.tenancyId).length,
            byType: allDocs.reduce((acc, d) => {
                acc[d.documentType] = (acc[d.documentType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)
        };

        // Paginate
        const total = allDocs.length;
        const paginatedData = allDocs.slice(offset, offset + limit);

        return {
            data: paginatedData,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            summary
        };
    }

    private mapToDocument(row: any): PropertyDocument {
        return {
            id: row.id,
            propertyId: row.property_id,
            tenancyId: row.tenancy_id,
            organizationId: row.organization_id,
            documentType: row.document_type,
            title: row.title,
            description: row.description,
            fileUrl: row.file_url,
            fileName: row.file_name,
            fileSizeBytes: row.file_size_bytes ? parseInt(row.file_size_bytes) : undefined,
            mimeType: row.mime_type,
            issueDate: row.issue_date,
            expiryDate: row.expiry_date,
            issuingAuthority: row.issuing_authority,
            referenceNumber: row.reference_number,
            isVerified: row.is_verified,
            verifiedBy: row.verified_by,
            verifiedAt: row.verified_at,
            folderPath: row.folder_path,
            tags: row.tags,
            uploadedBy: row.uploaded_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const documentService = new DocumentService();
