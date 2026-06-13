/**
 * TenancyService
 * Phase 4.3: Tenancy/Lease Management Service
 * 
 * Handles lease creation, renewal, termination, and lifecycle management
 * Phase 2 E-Sign Integration: Automatic lease signing on activation
 * 
 * @module services/property-management/leases
 */

import { Pool } from 'pg';
import { pool } from '../../../database';
import { logger } from '../../../utils/logger';
import {
    Tenancy,
    CreateTenancyDto,
    UpdateTenancyDto,
    TenancyStatus,
    TenancyFilters,
    PaginationParams,
    PaginatedResponse
} from '../../../types/property-management.types';
import { eSignIntegrationService, CompletionEvent } from '../../../../shared-services/e-sign';
import { notify, resolveTenantByTenancy } from '../../../../shared-services/notifications/in-mail';
import { leaseTemplateService } from './leaseTemplateService';
import { storeSignedLeaseDocument } from './signedLeaseStorage';

/**
 * Service for managing tenancies/leases
 */
export class TenancyService {
    private db: Pool;

    constructor(database?: Pool) {
        this.db = database || pool;
    }

    /**
     * Create a new tenancy
     * @param organizationId - Organization creating the tenancy
     * @param data - Tenancy creation data
     * @param userId - User creating the record
     * @returns Created tenancy
     */
    async createTenancy(
        organizationId: string,
        data: CreateTenancyDto,
        userId?: string
    ): Promise<Tenancy> {
        // Validate property exists and belongs to organization
        const propertyCheck = await this.db.query(
            `SELECT id, unit_number FROM properties WHERE id = $1`,
            [data.propertyId]
        );

        if (propertyCheck.rows.length === 0) {
            throw new Error('Property not found');
        }

        // When the tenancy points at a unit (child property row), inherit its unit number
        // so the lease document renders the unit even if the caller didn't pass one explicitly.
        const effectiveUnitNumber = data.unitNumber || propertyCheck.rows[0].unit_number || null;

        // Check for overlapping active tenancies
        const overlapCheck = await this.db.query(
            `SELECT id FROM tenancies
       WHERE property_id = $1
       AND unit_number IS NOT DISTINCT FROM $2
       AND status = 'active'
       AND (
         ($3::DATE, $4::DATE) OVERLAPS (lease_start_date, lease_end_date)
       )`,
            [data.propertyId, effectiveUnitNumber, data.leaseStartDate, data.leaseEndDate]
        );

        if (overlapCheck.rows.length > 0) {
            throw new Error('An active tenancy already overlaps this lease period for the selected property/unit');
        }

        const query = `
      INSERT INTO tenancies (
        property_id,
        tenant_id,
        organization_id,
        unit_number,
        lease_start_date,
        lease_end_date,
        monthly_rent,
        rent_currency,
        advance_payment_months,
        advance_payment_amount,
        advance_payment_date,
        security_deposit,
        rent_due_day,
        late_fee_amount,
        late_fee_grace_days,
        renewal_options,
        auto_renew,
        lease_terms,
        special_conditions,
        status,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING *
    `;

        const values = [
            data.propertyId,
            data.tenantId || null, // Optional - tenant created after e-sign
            organizationId,
            effectiveUnitNumber,
            new Date(data.leaseStartDate),
            new Date(data.leaseEndDate),
            data.monthlyRent,
            data.rentCurrency || 'GHS',
            data.advancePaymentMonths || 12,
            data.advancePaymentAmount || null,
            data.advancePaymentDate ? new Date(data.advancePaymentDate) : null,
            data.securityDeposit || 0,
            data.rentDueDay || 1,
            data.lateFeeAmount || 0,
            data.lateFeeGraceDays || 7,
            JSON.stringify(data.renewalOptions || {}),
            data.autoRenew || false,
            JSON.stringify(data.leaseTerms || {}),
            data.specialConditions || null,
            data.status || TenancyStatus.PENDING, // Allow setting initial status (e.g., pending_signature)
            userId || null
        ];

        const result = await this.db.query(query, values);
        const tenancy = this.mapRowToTenancy(result.rows[0]);

        // Track contribution for Data Hub
        try {
            const { ServiceHooks } = await import('../../data-hub/serviceHooks');
            await ServiceHooks.createContribution({
                contributor_id: userId || null,
                organization_id: organizationId,
                contribution_type: 'comparable',
                source_context: 'property_management',
                source_id: tenancy.id,
                data: {
                    tenancy_id: tenancy.id,
                    property_id: tenancy.propertyId,
                    monthly_rent: tenancy.monthlyRent,
                    currency: tenancy.rentCurrency,
                    lease_start_date: tenancy.leaseStartDate,
                    lease_end_date: tenancy.leaseEndDate,
                    unit_number: tenancy.unitNumber,
                    action: 'tenancy_creation'
                }
            });
        } catch (hookError) {
            // Log error but don't fail the tenancy creation
            console.error('Failed to create tenancy contribution hook', hookError);
        }

        return tenancy;
    }

    /**
     * Get tenancy by ID
     * @param tenancyId - Tenancy UUID
     * @param organizationId - Organization ID for access control
     * @returns Tenancy or null
     */
    async getTenancyById(
        tenancyId: string,
        organizationId: string
    ): Promise<Tenancy | null> {
        const query = `
      SELECT 
        t.*,
        tn.id as tenant_id_ref,
        tn.full_name as tenant_name,
        tn.phone_primary as tenant_phone,
        tn.email as tenant_email,
        tn.current_address as tenant_current_address,
        tn.digital_address as tenant_digital_address,
        tn.ghana_card_number as tenant_ghana_card,
        tn.occupation as tenant_occupation,
        tn.employer_name as tenant_employer,
        p.id as property_id_ref,
        p.title as property_title,
        p.address_street as property_address,
        p.address_city as property_city,
        p.region as property_region,
        p.digital_address as property_digital_address,
        p.property_type as property_type,
        p.bedrooms as property_bedrooms,
        p.bathrooms as property_bathrooms
      FROM tenancies t
      LEFT JOIN tenants tn ON t.tenant_id = tn.id
      LEFT JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND t.organization_id = $2
    `;

        const result = await this.db.query(query, [tenancyId, organizationId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToTenancy(result.rows[0], true);
    }

    /**
     * Get tenancies with pagination and filtering
     */
    async getTenancies(
        organizationId: string,
        filters: TenancyFilters = {},
        pagination: PaginationParams = {}
    ): Promise<PaginatedResponse<Tenancy>> {
        const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        const conditions: string[] = ['t.organization_id = $1'];
        const params: (string | number)[] = [organizationId];
        let paramIndex = 2;

        if (filters.status) {
            conditions.push(`t.status = $${paramIndex}`);
            params.push(filters.status);
            paramIndex++;
        }

        if (filters.propertyId) {
            conditions.push(`t.property_id = $${paramIndex}`);
            params.push(filters.propertyId);
            paramIndex++;
        }

        if (filters.tenantId) {
            conditions.push(`t.tenant_id = $${paramIndex}`);
            params.push(filters.tenantId);
            paramIndex++;
        }

        if (filters.leaseExpiringWithinDays) {
            conditions.push(`t.lease_end_date <= CURRENT_DATE + INTERVAL '${filters.leaseExpiringWithinDays} days'`);
            conditions.push(`t.lease_end_date >= CURRENT_DATE`);
            conditions.push(`t.status = 'active'`);
        }

        const whereClause = conditions.join(' AND ');

        const allowedSortFields = ['created_at', 'lease_start_date', 'lease_end_date', 'monthly_rent', 'status'];
        const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
        const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

        const countResult = await this.db.query(
            `SELECT COUNT(*) FROM tenancies t WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const dataQuery = `
      SELECT 
        t.*,
        tn.full_name as tenant_name,
        tn.phone_primary as tenant_phone,
        p.title as property_title
      FROM tenancies t
      LEFT JOIN tenants tn ON t.tenant_id = tn.id
      LEFT JOIN properties p ON t.property_id = p.id
      WHERE ${whereClause}
      ORDER BY t.${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);

        const dataResult = await this.db.query(dataQuery, params);
        const tenancies = dataResult.rows.map(row => this.mapRowToTenancy(row, true));

        const totalPages = Math.ceil(total / limit);

        return {
            data: tenancies,
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrevious: page > 1
        };
    }

    /**
     * Update tenancy
     */
    async updateTenancy(
        tenancyId: string,
        organizationId: string,
        data: UpdateTenancyDto
    ): Promise<Tenancy | null> {
        const updates: string[] = [];
        const params: (string | number | boolean | Date | null)[] = [];
        let paramIndex = 1;

        const fieldMappings: Record<string, string> = {
            unitNumber: 'unit_number',
            leaseStartDate: 'lease_start_date',
            leaseEndDate: 'lease_end_date',
            monthlyRent: 'monthly_rent',
            rentCurrency: 'rent_currency',
            advancePaymentMonths: 'advance_payment_months',
            advancePaymentAmount: 'advance_payment_amount',
            advancePaymentDate: 'advance_payment_date',
            securityDeposit: 'security_deposit',
            securityDepositPaid: 'security_deposit_paid',
            rentDueDay: 'rent_due_day',
            lateFeeAmount: 'late_fee_amount',
            lateFeeGraceDays: 'late_fee_grace_days',
            status: 'status',
            renewalOptions: 'renewal_options',
            autoRenew: 'auto_renew',
            leaseTerms: 'lease_terms',
            specialConditions: 'special_conditions',
            terminationReason: 'termination_reason'
        };

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && key in fieldMappings) {
                const dbField = fieldMappings[key];
                updates.push(`${dbField} = $${paramIndex}`);

                if (key === 'renewalOptions' || key === 'leaseTerms') {
                    params.push(JSON.stringify(value));
                } else if (['leaseStartDate', 'leaseEndDate', 'advancePaymentDate'].includes(key) && value) {
                    params.push(new Date(value as string));
                } else {
                    params.push(value as string | number | boolean | null);
                }
                paramIndex++;
            }
        }

        // Handle termination
        if (data.status === TenancyStatus.TERMINATED) {
            updates.push(`terminated_at = CURRENT_TIMESTAMP`);
        }

        if (updates.length === 0) {
            return this.getTenancyById(tenancyId, organizationId);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        const query = `
      UPDATE tenancies
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;
        params.push(tenancyId, organizationId);

        const result = await this.db.query(query, params);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToTenancy(result.rows[0]);
    }

    /**
     * Activate a pending tenancy and trigger e-sign lease workflow
     * Phase 2 E-Sign Integration: Generates lease PDF and sends for signing
     */
    async activateTenancy(
        tenancyId: string,
        organizationId: string,
        userId?: string,
        options?: {
            skipEsign?: boolean;
            templateId?: string;
            witnessEmail?: string;
            witnessName?: string;
        }
    ): Promise<Tenancy | null> {
        // First update status to active
        const tenancy = await this.updateTenancy(tenancyId, organizationId, {
            status: TenancyStatus.ACTIVE
        });

        if (!tenancy) {
            return null;
        }

        // Skip e-sign if explicitly requested
        if (options?.skipEsign) {
            logger.info('E-Sign skipped for tenancy activation', { tenancyId });
            return tenancy;
        }

        // Trigger e-sign workflow
        try {
            await this.initiateLeaseEsign(tenancy, organizationId, userId, options);
        } catch (error) {
            // Log error but don't fail activation
            logger.error('Failed to initiate e-sign for lease', { 
                tenancyId, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
        }

        return tenancy;
    }

    /**
     * Initiate e-sign workflow for a tenancy lease
     */
    async initiateLeaseEsign(
        tenancy: Tenancy,
        organizationId: string,
        userId?: string,
        options?: {
            templateId?: string;
            witnessEmail?: string;
            witnessName?: string;
        }
    ): Promise<{ envelopeId: string; signingUrls: Record<string, string> }> {
        logger.info('Initiating e-sign for lease', { 
            tenancyId: tenancy.id,
            organizationId 
        });

        // Get full tenancy data with relations
        const fullTenancy = await this.getTenancyById(tenancy.id, organizationId);
        if (!fullTenancy || !fullTenancy.tenant || !fullTenancy.property) {
            throw new Error('Tenancy data incomplete - missing tenant or property');
        }

        // Generate lease PDF
        const leaseDoc = await leaseTemplateService.generateLease(organizationId, {
            tenancyId: tenancy.id,
            templateId: options?.templateId,
            format: 'pdf'
        });

        // Download the generated PDF
        const { documentService } = await import('../../../../shared-services/document-service');
        const { buffer: pdfBuffer } = await documentService.storage.download(leaseDoc.documentKey);

        // Get signature field placements for the template
        const signatureFields = await this.getSignatureFieldPlacements(
            leaseDoc.templateId, 
            organizationId
        );

        // Get landlord info from organization
        const orgInfo = await this.getOrganizationInfo(organizationId);

        // Build signers list
        const signers = [
            { 
                name: fullTenancy.tenant.fullName, 
                email: fullTenancy.tenant.email || '', 
                role: 'signer' as const, 
                order: 1 
            },
            { 
                name: orgInfo.name || 'Property Manager', 
                email: orgInfo.email || '', 
                role: 'signer' as const, 
                order: 2 
            }
        ];

        // Add witness if provided
        if (options?.witnessEmail && options?.witnessName) {
            signers.push({
                name: options.witnessName,
                email: options.witnessEmail,
                role: 'signer' as const,
                order: 3
            });
        }

        // Build e-sign fields from template configuration
        const eSignFields = this.buildEsignFields(signatureFields, signers);

        // Create envelope via e-sign integration service
        const envelope = await eSignIntegrationService.createEnvelope({
            subject: `Lease Agreement - ${fullTenancy.property.title}`,
            message: `Please sign the lease agreement for ${fullTenancy.property.addressStreet || fullTenancy.property.address}. This lease is effective from ${new Date(fullTenancy.leaseStartDate).toLocaleDateString('en-GB')} to ${new Date(fullTenancy.leaseEndDate).toLocaleDateString('en-GB')}.`,
            documents: [{
                name: leaseDoc.filename,
                content: pdfBuffer,
                mimeType: 'application/pdf',
                source: 'system_generated'
            }],
            signers,
            fields: eSignFields,
            organizationId,
            createdByUserId: userId,
            sourceModule: 'property_management',
            sourceEntityType: 'tenancy',
            sourceEntityId: tenancy.id,
            expiresInDays: 30,
            autoSend: true
        });

        // Update tenancy with envelope reference
        await this.db.query(
            `UPDATE tenancies 
             SET esign_envelope_id = $1, 
                 esign_status = $2, 
                 esign_created_at = NOW(),
                 lease_sent_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [envelope.envelopeId, 'pending', tenancy.id]
        );

        logger.info('E-Sign envelope created for lease', {
            tenancyId: tenancy.id,
            envelopeId: envelope.envelopeId,
            signerCount: signers.length
        });

        return {
            envelopeId: envelope.envelopeId,
            signingUrls: envelope.signingUrls
        };
    }

    /**
     * Handle e-sign completion webhook for tenancy
     * Called from webhook handler when envelope is completed
     */
    async handleEsignCompletion(event: CompletionEvent): Promise<void> {
        const tenancyId = event.sourceContext.entityId;
        
        logger.info('Processing e-sign completion for tenancy', {
            tenancyId,
            envelopeId: event.envelope.id
        });

        // Get signed document URL and persist it in our private S3/MinIO bucket.
        const signedDocUrl = event.documents[0]?.signedUrl;
        const signedLeaseObjectRef = signedDocUrl
            ? await storeSignedLeaseDocument({
                tenancyId,
                envelopeId: event.envelope.id,
                sourceUrl: signedDocUrl,
            })
            : null;
        const certificateUrl = event.documents[0]?.certificateUrl;

        // Extract signer completion times
        const tenantSigner = event.signers.find(s => s.email !== ''); // First signer is tenant
        const landlordSigner = event.signers.length > 1 ? event.signers[1] : null;

        // Update tenancy with signed lease info. A fully-executed lease means the tenancy is now
        // active — flip status to 'active' (but never resurrect a terminated/expired tenancy).
        await this.db.query(
            `UPDATE tenancies
             SET esign_status = 'completed',
                 esign_completed_at = $1,
                 lease_signed_url = $2,
                 lease_status = 'countersigned',
                 status = CASE WHEN status IN ('pending', 'pending_signature') THEN 'active' ELSE status END,
                 tenant_signed_at = $3,
                 landlord_signed_at = $4,
                 updated_at = NOW()
             WHERE id = $5`,
            [
                event.envelope.completedAt,
                signedLeaseObjectRef,
                tenantSigner?.signedAt,
                landlordSigner?.signedAt,
                tenancyId
            ]
        );

        // Store security hash for verification
        await this.db.query(
            `INSERT INTO tenancy_document_audit (
                tenancy_id, 
                document_url, 
                certificate_url,
                security_hash, 
                hash_algorithm,
                completed_at,
                signer_details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tenancy_id) DO UPDATE SET
                document_url = EXCLUDED.document_url,
                certificate_url = EXCLUDED.certificate_url,
                security_hash = EXCLUDED.security_hash,
                completed_at = EXCLUDED.completed_at,
                signer_details = EXCLUDED.signer_details`,
            [
                tenancyId,
                signedLeaseObjectRef,
                certificateUrl,
                event.security.hash,
                event.security.algorithm,
                event.envelope.completedAt,
                JSON.stringify(event.signers)
            ]
        );

        logger.info('Tenancy lease signing completed', {
            tenancyId,
            envelopeId: event.envelope.id,
            signedDocUrl
        });
    }

    /**
     * Get signature field placements for a template
     */
    private async getSignatureFieldPlacements(
        templateId: string,
        organizationId: string
    ): Promise<SignatureFieldPlacement[]> {
        const result = await this.db.query(
            `SELECT * FROM lease_template_signature_fields
             WHERE template_id = $1 AND organization_id = $2
             ORDER BY signer_role, display_order`,
            [templateId, organizationId]
        );

        if (result.rows.length === 0) {
            // Return default signature fields if none configured
            return this.getDefaultSignatureFields();
        }

        return result.rows.map(row => ({
            signerRole: row.signer_role,
            fieldType: row.field_type,
            pageNumber: row.page_number,
            x: parseFloat(row.x_position),
            y: parseFloat(row.y_position),
            width: parseFloat(row.width),
            height: parseFloat(row.height),
            required: row.required,
            label: row.label
        }));
    }

    /**
     * Get default signature field placements
     */
    private getDefaultSignatureFields(): SignatureFieldPlacement[] {
        return [
            // Tenant signature block
            { signerRole: 'tenant', fieldType: 'signature', pageNumber: -1, x: 0.10, y: 0.70, width: 0.30, height: 0.08, required: true, label: 'Tenant Signature' },
            { signerRole: 'tenant', fieldType: 'date', pageNumber: -1, x: 0.45, y: 0.70, width: 0.15, height: 0.05, required: true, label: 'Date' },
            // Landlord signature block
            { signerRole: 'landlord', fieldType: 'signature', pageNumber: -1, x: 0.10, y: 0.55, width: 0.30, height: 0.08, required: true, label: 'Landlord Signature' },
            { signerRole: 'landlord', fieldType: 'date', pageNumber: -1, x: 0.45, y: 0.55, width: 0.15, height: 0.05, required: true, label: 'Date' },
            // Witness signature (optional)
            { signerRole: 'witness', fieldType: 'signature', pageNumber: -1, x: 0.55, y: 0.70, width: 0.30, height: 0.08, required: false, label: 'Witness Signature' }
        ];
    }

    /**
     * Build e-sign fields from signature placements
     */
    private buildEsignFields(
        placements: SignatureFieldPlacement[],
        signers: { name: string; email: string; role: string; order: number }[]
    ): Array<{
        type: 'signature' | 'initials' | 'date' | 'text';
        recipientEmail: string;
        documentIndex: number;
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        required: boolean;
    }> {
        const signerMap: Record<string, string> = {
            'tenant': signers[0]?.email || '',
            'landlord': signers[1]?.email || '',
            'witness': signers[2]?.email || ''
        };

        return placements
            .filter(p => signerMap[p.signerRole]) // Only include fields for signers we have
            .filter(p => p.signerRole !== 'witness' || signers.length > 2) // Skip witness if no witness signer
            .map(p => ({
                type: p.fieldType as 'signature' | 'initials' | 'date' | 'text',
                recipientEmail: signerMap[p.signerRole],
                documentIndex: 0,
                page: p.pageNumber,
                x: p.x,
                y: p.y,
                width: p.width,
                height: p.height,
                required: p.required
            }));
    }

    /**
     * Get organization info for landlord details
     */
    private async getOrganizationInfo(organizationId: string): Promise<{
        name: string;
        email: string;
        phone: string;
        address: string;
    }> {
        const result = await this.db.query(
            `SELECT name, email, phone, address 
             FROM organizations 
             WHERE id = $1`,
            [organizationId]
        );

        if (result.rows.length === 0) {
            return { name: '', email: '', phone: '', address: '' };
        }

        const row = result.rows[0];
        return {
            name: row.name || '',
            email: row.email || '',
            phone: row.phone || '',
            address: row.address || ''
        };
    }

    /**
     * Terminate a tenancy
     */
    async terminateTenancy(
        tenancyId: string,
        organizationId: string,
        reason: string
    ): Promise<Tenancy | null> {
        const tenancy = await this.updateTenancy(tenancyId, organizationId, {
            status: TenancyStatus.TERMINATED,
            terminationReason: reason
        });
        await this.notifyTenancyLifecycle(
            tenancyId,
            organizationId,
            'lease.terminated',
            'Your tenancy has ended',
            `Your tenancy has been terminated.${reason ? ` Reason: ${reason}` : ''}`,
            'high',
        );
        return tenancy;
    }

    /**
     * Renew a tenancy
     */
    async renewTenancy(
        tenancyId: string,
        organizationId: string,
        renewalData: {
            newEndDate: string;
            newMonthlyRent?: number;
            advancePaymentAmount?: number;
        }
    ): Promise<Tenancy | null> {
        const existingTenancy = await this.getTenancyById(tenancyId, organizationId);
        if (!existingTenancy) {
            throw new Error('Tenancy not found');
        }

        if (existingTenancy.status !== TenancyStatus.ACTIVE) {
            throw new Error('Only active tenancies can be renewed');
        }

        const tenancy = await this.updateTenancy(tenancyId, organizationId, {
            leaseEndDate: renewalData.newEndDate,
            monthlyRent: renewalData.newMonthlyRent,
            advancePaymentAmount: renewalData.advancePaymentAmount,
            status: TenancyStatus.RENEWED
        });
        await this.notifyTenancyLifecycle(
            tenancyId,
            organizationId,
            'lease.renewed',
            'Your tenancy has been renewed',
            `Your tenancy has been renewed through ${renewalData.newEndDate}.`,
            'normal',
        );
        return tenancy;
    }

    /**
     * Notify the tenant of a tenancy lifecycle change (renewal, termination, …).
     * Best-effort — never throws into the caller.
     */
    private async notifyTenancyLifecycle(
        tenancyId: string,
        organizationId: string,
        type: string,
        title: string,
        body: string,
        priority: 'low' | 'normal' | 'high' | 'urgent',
    ): Promise<void> {
        try {
            const tenant = await resolveTenantByTenancy(tenancyId);
            if (!tenant) return;
            await notify({
                recipients: tenant,
                category: 'property',
                type,
                title,
                body,
                summary: title,
                priority,
                sourceType: 'tenancy',
                sourceId: tenancyId,
                tenantActionUrl: '/dashboard/tenant/lease',
                organizationId,
                channels: { inApp: true, email: true },
            });
        } catch (err: any) {
            logger.warn(`notify(${type}) failed`, { tenancyId, error: err.message });
        }
    }

    /**
     * Get tenancies expiring soon
     */
    async getExpiringTenancies(
        organizationId: string,
        daysUntilExpiry: number = 30
    ): Promise<Tenancy[]> {
        const query = `
      SELECT 
        t.*,
        tn.full_name as tenant_name,
        tn.phone_primary as tenant_phone,
        p.title as property_title
      FROM tenancies t
      LEFT JOIN tenants tn ON t.tenant_id = tn.id
      LEFT JOIN properties p ON t.property_id = p.id
      WHERE t.organization_id = $1
        AND t.status = 'active'
        AND t.lease_end_date <= CURRENT_DATE + INTERVAL '${daysUntilExpiry} days'
        AND t.lease_end_date >= CURRENT_DATE
      ORDER BY t.lease_end_date ASC
    `;

        const result = await this.db.query(query, [organizationId]);
        return result.rows.map(row => this.mapRowToTenancy(row, true));
    }

    /**
     * Get tenancy payment summary
     */
    async getTenancyPaymentSummary(
        tenancyId: string,
        organizationId: string
    ): Promise<TenancyPaymentSummary> {
        const tenancy = await this.getTenancyById(tenancyId, organizationId);
        if (!tenancy) {
            throw new Error('Tenancy not found');
        }

        const paymentsQuery = `
      SELECT 
        COALESCE(SUM(payment_amount), 0) as total_paid,
        COUNT(*) as payment_count,
        MAX(payment_date) as last_payment_date
      FROM rent_payments
      WHERE tenancy_id = $1 AND status = 'completed'
    `;

        const paymentsResult = await this.db.query(paymentsQuery, [tenancyId]);
        const payments = paymentsResult.rows[0];

        // Calculate expected payments
        const startDate = new Date(tenancy.leaseStartDate);
        const endDate = new Date(tenancy.leaseEndDate);
        const today = new Date();
        const effectiveEndDate = today < endDate ? today : endDate;

        const monthsDiff = this.monthsBetween(startDate, effectiveEndDate);
        const expectedPayments = monthsDiff * tenancy.monthlyRent;

        const totalPaid = parseFloat(payments.total_paid);
        const balance = expectedPayments - totalPaid;

        return {
            tenancyId,
            monthlyRent: tenancy.monthlyRent,
            totalExpected: expectedPayments,
            totalPaid,
            balance,
            paymentCount: parseInt(payments.payment_count, 10),
            lastPaymentDate: payments.last_payment_date,
            status: balance > 0 ? 'ARREARS' : balance < 0 ? 'ADVANCE' : 'CURRENT'
        };
    }

    // =====================================================
    // PRIVATE HELPER METHODS
    // =====================================================

    private mapRowToTenancy(row: Record<string, unknown>, includeRelations = false): Tenancy {
        const tenancy: Tenancy = {
            id: row.id as string,
            referenceNumber: row.reference_number as string,
            propertyId: row.property_id as string,
            tenantId: row.tenant_id as string,
            organizationId: row.organization_id as string,
            applicationId: row.application_id as string | undefined,
            unitNumber: row.unit_number as string | undefined,
            leaseStartDate: row.lease_start_date as Date,
            leaseEndDate: row.lease_end_date as Date,
            monthlyRent: parseFloat(row.monthly_rent as string),
            rentCurrency: row.rent_currency as string,
            advancePaymentMonths: row.advance_payment_months as number,
            advancePaymentAmount: row.advance_payment_amount ? parseFloat(row.advance_payment_amount as string) : undefined,
            advancePaymentDate: row.advance_payment_date as Date | undefined,
            securityDeposit: parseFloat(row.security_deposit as string) || 0,
            securityDepositPaid: row.security_deposit_paid as boolean,
            rentDueDay: row.rent_due_day as number,
            lateFeeAmount: parseFloat(row.late_fee_amount as string) || 0,
            lateFeeGraceDays: row.late_fee_grace_days as number,
            status: row.status as TenancyStatus,
            renewalOptions: row.renewal_options as RenewalOptions || {},
            autoRenew: row.auto_renew as boolean,
            leaseTerms: row.lease_terms as LeaseTerms || {},
            specialConditions: row.special_conditions as string | undefined,
            leaseDocumentUrl: row.lease_document_url as string | undefined,
            leaseSignedUrl: row.lease_signed_url as string | undefined,
            leaseStatus: row.lease_status as string | undefined,
            leaseSentAt: row.lease_sent_at as Date | undefined,
            tenantSignedAt: row.tenant_signed_at as Date | undefined,
            landlordSignedAt: row.landlord_signed_at as Date | undefined,
            esignEnvelopeId: row.esign_envelope_id as string | undefined,
            esignStatus: row.esign_status as string | undefined,
            esignCreatedAt: row.esign_created_at as Date | undefined,
            esignCompletedAt: row.esign_completed_at as Date | undefined,
            terminatedAt: row.terminated_at as Date | undefined,
            terminationReason: row.termination_reason as string | undefined,
            createdBy: row.created_by as string | undefined,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date
        };

        if (includeRelations) {
            if (row.tenant_name) {
                tenancy.tenant = {
                    id: tenancy.tenantId,
                    organizationId: tenancy.organizationId,
                    fullName: row.tenant_name as string,
                    phonePrimary: row.tenant_phone as string,
                    email: row.tenant_email as string | undefined,
                    currentAddress: row.tenant_current_address as string | undefined,
                    digitalAddress: row.tenant_digital_address as string | undefined,
                    ghanaCardNumber: row.tenant_ghana_card as string | undefined,
                    occupation: row.tenant_occupation as string | undefined,
                    employerName: row.tenant_employer as string | undefined,
                    characterReferences: [],
                    previousAddresses: [],
                    status: 'active' as TenantStatus,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            }
            if (row.property_title) {
                tenancy.property = {
                    id: tenancy.propertyId,
                    title: row.property_title as string,
                    address: row.property_address as string,
                    addressStreet: row.property_address as string,
                    addressCity: row.property_city as string | undefined,
                    addressRegion: row.property_region as string | undefined,
                    digitalAddress: row.property_digital_address as string | undefined,
                    propertyType: row.property_type as string | undefined,
                    bedrooms: row.property_bedrooms as number | undefined,
                    bathrooms: row.property_bathrooms as number | undefined
                };
            }
        }

        return tenancy;
    }

    private monthsBetween(startDate: Date, endDate: Date): number {
        const months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
        return months + endDate.getMonth() - startDate.getMonth() + 1;
    }
}

// Additional interfaces
import { RenewalOptions, LeaseTerms, TenantStatus, Tenant } from '../../../types/property-management.types';

interface TenancyPaymentSummary {
    tenancyId: string;
    monthlyRent: number;
    totalExpected: number;
    totalPaid: number;
    balance: number;
    paymentCount: number;
    lastPaymentDate: Date | null;
    status: 'ARREARS' | 'CURRENT' | 'ADVANCE';
}

interface SignatureFieldPlacement {
    signerRole: 'tenant' | 'landlord' | 'witness' | 'co_tenant';
    fieldType: 'signature' | 'initials' | 'date' | 'text';
    pageNumber: number; // -1 means last page
    x: number; // 0-1 percentage
    y: number;
    width: number;
    height: number;
    required: boolean;
    label?: string;
}

// Export singleton instance
export const tenancyService = new TenancyService();
