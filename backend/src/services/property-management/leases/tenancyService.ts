/**
 * TenancyService
 * Phase 4.3: Tenancy/Lease Management Service
 * 
 * Handles lease creation, renewal, termination, and lifecycle management
 * 
 * @module services/property-management/leases
 */

import { Pool } from 'pg';
import { pool } from '../../../database';
import {
    Tenancy,
    CreateTenancyDto,
    UpdateTenancyDto,
    TenancyStatus,
    TenancyFilters,
    PaginationParams,
    PaginatedResponse
} from '../../../types/property-management.types';

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
            `SELECT id FROM properties WHERE id = $1`,
            [data.propertyId]
        );

        if (propertyCheck.rows.length === 0) {
            throw new Error('Property not found');
        }

        // Check for overlapping active tenancies
        const overlapCheck = await this.db.query(
            `SELECT id FROM tenancies 
       WHERE property_id = $1 
       AND unit_number IS NOT DISTINCT FROM $2
       AND status = 'active'
       AND (
         ($3::DATE, $4::DATE) OVERLAPS (lease_start_date, lease_end_date)
       )`,
            [data.propertyId, data.unitNumber || null, data.leaseStartDate, data.leaseEndDate]
        );

        if (overlapCheck.rows.length > 0) {
            throw new Error('Overlapping tenancy exists for this property/unit');
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
            data.tenantId,
            organizationId,
            data.unitNumber || null,
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
            TenancyStatus.PENDING,
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
     * Activate a pending tenancy
     */
    async activateTenancy(
        tenancyId: string,
        organizationId: string
    ): Promise<Tenancy | null> {
        return this.updateTenancy(tenancyId, organizationId, {
            status: TenancyStatus.ACTIVE
        });
    }

    /**
     * Terminate a tenancy
     */
    async terminateTenancy(
        tenancyId: string,
        organizationId: string,
        reason: string
    ): Promise<Tenancy | null> {
        return this.updateTenancy(tenancyId, organizationId, {
            status: TenancyStatus.TERMINATED,
            terminationReason: reason
        });
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

        return this.updateTenancy(tenancyId, organizationId, {
            leaseEndDate: renewalData.newEndDate,
            monthlyRent: renewalData.newMonthlyRent,
            advancePaymentAmount: renewalData.advancePaymentAmount,
            status: TenancyStatus.RENEWED
        });
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

// Export singleton instance
export const tenancyService = new TenancyService();
