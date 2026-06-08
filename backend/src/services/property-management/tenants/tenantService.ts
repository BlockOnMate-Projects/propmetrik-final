/**
 * TenantService
 * Phase 4.3: Tenant Management Service
 * 
 * Handles tenant registration, screening, and lifecycle management
 * 
 * @module services/property-management/tenants
 */

import { Pool } from 'pg';
import { pool } from '../../../database';
import {
    Tenant,
    CreateTenantDto,
    UpdateTenantDto,
    TenantStatus,
    TenantFilters,
    PaginationParams,
    PaginatedResponse
} from '../../../types/property-management.types';

/**
 * Service for managing tenants
 */
export class TenantService {
    private db: Pool;

    constructor(database?: Pool) {
        this.db = database || pool;
    }

    /**
     * Register a new tenant
     * @param organizationId - Organization creating the tenant
     * @param data - Tenant registration data
     * @param userId - User creating the record
     * @returns Created tenant
     */
    async createTenant(
        organizationId: string,
        data: CreateTenantDto,
        userId?: string
    ): Promise<Tenant> {
        const query = `
      INSERT INTO tenants (
        organization_id,
        full_name,
        ghana_card_number,
        date_of_birth,
        phone_primary,
        phone_secondary,
        email,
        current_address,
        digital_address,
        occupation,
        employer_name,
        employer_address,
        employer_phone,
        monthly_income,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        character_references,
        previous_addresses,
        notes,
        status,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      RETURNING *
    `;

        const values = [
            organizationId,
            data.fullName,
            data.ghanaCardNumber || null,
            data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            data.phonePrimary,
            data.phoneSecondary || null,
            data.email || null,
            data.currentAddress || null,
            data.digitalAddress || null,
            data.occupation || null,
            data.employerName || null,
            data.employerAddress || null,
            data.employerPhone || null,
            data.monthlyIncome || null,
            data.emergencyContactName || null,
            data.emergencyContactPhone || null,
            data.emergencyContactRelationship || null,
            JSON.stringify(data.characterReferences || []),
            JSON.stringify(data.previousAddresses || []),
            data.notes || null,
            TenantStatus.PENDING_VERIFICATION,
            userId || null
        ];

        const result = await this.db.query(query, values);
        return this.mapRowToTenant(result.rows[0]);
    }

    /**
     * Get tenant by ID
     * @param tenantId - Tenant UUID
     * @param organizationId - Organization ID for access control
     * @returns Tenant or null
     */
    async getTenantById(
        tenantId: string,
        organizationId: string
    ): Promise<Tenant | null> {
        const query = `
      SELECT * FROM tenants
            WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `;

        const result = await this.db.query(query, [tenantId, organizationId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToTenant(result.rows[0]);
    }

    /**
     * Get tenants with pagination and filtering
     * @param organizationId - Organization ID
     * @param filters - Filter options
     * @param pagination - Pagination options
     * @returns Paginated list of tenants
     */
    async getTenants(
        organizationId: string,
        filters: TenantFilters = {},
        pagination: PaginationParams = {}
    ): Promise<PaginatedResponse<Tenant>> {
        const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        // Build WHERE clause
        const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
        const params: (string | number | boolean)[] = [organizationId];
        let paramIndex = 2;

        if (filters.status) {
            conditions.push(`status = $${paramIndex}`);
            params.push(filters.status);
            paramIndex++;
        }

        if (filters.search) {
            conditions.push(`(
        full_name ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex} OR
        phone_primary ILIKE $${paramIndex} OR
        ghana_card_number ILIKE $${paramIndex}
      )`);
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        if (filters.hasActiveTenancy !== undefined) {
            if (filters.hasActiveTenancy) {
                conditions.push(`id IN (
          SELECT tenant_id FROM tenancies WHERE status = 'active'
        )`);
            } else {
                conditions.push(`id NOT IN (
          SELECT tenant_id FROM tenancies WHERE status = 'active'
        )`);
            }
        }

        const whereClause = conditions.join(' AND ');

        // Validate sortBy to prevent SQL injection
        const allowedSortFields = ['created_at', 'full_name', 'status', 'email'];
        const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
        const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM tenants WHERE ${whereClause}`;
        const countResult = await this.db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count, 10);

        // Get paginated results
        const dataQuery = `
      SELECT * FROM tenants
      WHERE ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);

        const dataResult = await this.db.query(dataQuery, params);
        const tenants = dataResult.rows.map(row => this.mapRowToTenant(row));

        const totalPages = Math.ceil(total / limit);

        return {
            data: tenants,
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrevious: page > 1
        };
    }

    /**
     * Update tenant information
     * @param tenantId - Tenant UUID
     * @param organizationId - Organization ID for access control
     * @param data - Update data
     * @returns Updated tenant
     */
    async updateTenant(
        tenantId: string,
        organizationId: string,
        data: UpdateTenantDto
    ): Promise<Tenant | null> {
        // Build SET clause dynamically
        const updates: string[] = [];
        const params: (string | number | boolean | Date | null)[] = [];
        let paramIndex = 1;

        const fieldMappings: Record<keyof UpdateTenantDto, string> = {
            fullName: 'full_name',
            ghanaCardNumber: 'ghana_card_number',
            dateOfBirth: 'date_of_birth',
            phonePrimary: 'phone_primary',
            phoneSecondary: 'phone_secondary',
            email: 'email',
            currentAddress: 'current_address',
            digitalAddress: 'digital_address',
            occupation: 'occupation',
            employerName: 'employer_name',
            employerAddress: 'employer_address',
            employerPhone: 'employer_phone',
            monthlyIncome: 'monthly_income',
            emergencyContactName: 'emergency_contact_name',
            emergencyContactPhone: 'emergency_contact_phone',
            emergencyContactRelationship: 'emergency_contact_relationship',
            characterReferences: 'character_references',
            previousAddresses: 'previous_addresses',
            notes: 'notes',
            status: 'status',
            creditScore: 'credit_score'
        };

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && key in fieldMappings) {
                const dbField = fieldMappings[key as keyof UpdateTenantDto];
                updates.push(`${dbField} = $${paramIndex}`);

                // Handle JSON fields
                if (key === 'characterReferences' || key === 'previousAddresses') {
                    params.push(JSON.stringify(value));
                } else if (key === 'dateOfBirth' && value) {
                    params.push(new Date(value as string));
                } else {
                    params.push(value as string | number | boolean | null);
                }
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return this.getTenantById(tenantId, organizationId);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        const query = `
      UPDATE tenants
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;
        params.push(tenantId, organizationId);

        const result = await this.db.query(query, params);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToTenant(result.rows[0]);
    }

    /**
     * Delete a tenant (soft delete by setting status to inactive)
     * @param tenantId - Tenant UUID
     * @param organizationId - Organization ID for access control
     * @returns Success boolean
     */
    async deleteTenant(
        tenantId: string,
        organizationId: string
    ): Promise<boolean> {
        // Check for active tenancies first
        const activeTenancyCheck = await this.db.query(
            `SELECT COUNT(*) FROM tenancies WHERE tenant_id = $1 AND organization_id = $2 AND status = 'active'`,
            [tenantId, organizationId]
        );

        if (parseInt(activeTenancyCheck.rows[0].count, 10) > 0) {
            throw new Error('Cannot delete tenant with active tenancies');
        }

        const query = `
      UPDATE tenants
            SET status = $1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL
      RETURNING id
    `;

        const result = await this.db.query(query, [
            TenantStatus.INACTIVE,
            tenantId,
            organizationId
        ]);

        return result.rows.length > 0;
    }

    /**
     * Screen a tenant by checking their history and characterReferences
     * @param tenantId - Tenant UUID
     * @param organizationId - Organization ID
     * @returns Screening result
     */
    async screenTenant(
        tenantId: string,
        organizationId: string
    ): Promise<TenantScreeningResult> {
        const tenant = await this.getTenantById(tenantId, organizationId);
        if (!tenant) {
            throw new Error('Tenant not found');
        }

        // Calculate screening scores
        const incomeScore = this.calculateIncomeScore(tenant);
        const historyScore = this.calculateHistoryScore(tenant);
        const referenceScore = this.calculateReferenceScore(tenant);

        const overallScore = Math.round(
            (incomeScore * 0.4) + (historyScore * 0.3) + (referenceScore * 0.3)
        );

        const recommendation = this.getRecommendation(overallScore);

        return {
            tenantId,
            overallScore,
            breakdown: {
                incomeScore,
                historyScore,
                referenceScore
            },
            recommendation,
            riskFactors: this.identifyRiskFactors(tenant),
            positiveFactors: this.identifyPositiveFactors(tenant),
            screenedAt: new Date()
        };
    }

    /**
     * Verify a tenant's status
     * @param tenantId - Tenant UUID
     * @param organizationId - Organization ID
     * @returns Updated tenant
     */
    async verifyTenant(
        tenantId: string,
        organizationId: string
    ): Promise<Tenant | null> {
        return this.updateTenant(tenantId, organizationId, {
            status: TenantStatus.ACTIVE
        });
    }

    /**
     * Blacklist a tenant
     * @param tenantId - Tenant UUID
     * @param organizationId - Organization ID
     * @param reason - Reason for blacklisting
     * @returns Updated tenant
     */
    async blacklistTenant(
        tenantId: string,
        organizationId: string,
        reason: string
    ): Promise<Tenant | null> {
        return this.updateTenant(tenantId, organizationId, {
            status: TenantStatus.BLACKLISTED,
            notes: reason
        });
    }

    // =====================================================
    // PRIVATE HELPER METHODS
    // =====================================================

    /**
     * Map database row to Tenant interface
     */
    private mapRowToTenant(row: Record<string, unknown>): Tenant {
        return {
            id: row.id as string,
            organizationId: row.organization_id as string,
            fullName: row.full_name as string,
            ghanaCardNumber: row.ghana_card_number as string | undefined,
            dateOfBirth: row.date_of_birth as Date | undefined,
            phonePrimary: row.phone_primary as string,
            phoneSecondary: row.phone_secondary as string | undefined,
            email: row.email as string | undefined,
            currentAddress: row.current_address as string | undefined,
            digitalAddress: row.digital_address as string | undefined,
            occupation: row.occupation as string | undefined,
            employerName: row.employer_name as string | undefined,
            employerAddress: row.employer_address as string | undefined,
            employerPhone: row.employer_phone as string | undefined,
            monthlyIncome: row.monthly_income ? parseFloat(row.monthly_income as string) : undefined,
            emergencyContactName: row.emergency_contact_name as string | undefined,
            emergencyContactPhone: row.emergency_contact_phone as string | undefined,
            emergencyContactRelationship: row.emergency_contact_relationship as string | undefined,
            creditScore: row.credit_score as number | undefined,
            characterReferences: (row.character_references as TenantReference[]) || [],
            previousAddresses: (row.previous_addresses as PreviousAddress[]) || [],
            status: row.status as TenantStatus,
            notes: row.notes as string | undefined,
            createdBy: row.created_by as string | undefined,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date
        };
    }

    private calculateIncomeScore(tenant: Tenant): number {
        if (!tenant.monthlyIncome) return 50;
        // Basic scoring: Higher income = higher score (max 100)
        const baseScore = Math.min(100, Math.round(tenant.monthlyIncome / 100));
        return Math.max(0, baseScore);
    }

    private calculateHistoryScore(tenant: Tenant): number {
        let score = 70; // Base score

        // Positive: Has previous addresses with good characterReferences
        if (tenant.previousAddresses.length > 0) {
            score += 10;
        }

        // Positive: Long tenure at current address
        if (tenant.currentAddress) {
            score += 10;
        }

        // Negative: Blacklisted status (shouldn't happen but safety check)
        if (tenant.status === TenantStatus.BLACKLISTED) {
            score -= 50;
        }

        return Math.max(0, Math.min(100, score));
    }

    private calculateReferenceScore(tenant: Tenant): number {
        const referenceCount = tenant.characterReferences.length;
        const baseScore = Math.min(100, referenceCount * 25 + 50);
        return baseScore;
    }

    private getRecommendation(score: number): TenantRecommendation {
        if (score >= 80) return 'APPROVE';
        if (score >= 60) return 'APPROVE_WITH_CONDITIONS';
        if (score >= 40) return 'REVIEW_REQUIRED';
        return 'DECLINE';
    }

    private identifyRiskFactors(tenant: Tenant): string[] {
        const factors: string[] = [];

        if (!tenant.ghanaCardNumber) {
            factors.push('Missing Ghana Card number');
        }
        if (!tenant.monthlyIncome) {
            factors.push('Income not verified');
        }
        if (!tenant.employerName) {
            factors.push('Employment not verified');
        }
        if (tenant.characterReferences.length === 0) {
            factors.push('No characterReferences provided');
        }
        if (!tenant.emergencyContactPhone) {
            factors.push('No emergency contact');
        }

        return factors;
    }

    private identifyPositiveFactors(tenant: Tenant): string[] {
        const factors: string[] = [];

        if (tenant.ghanaCardNumber) {
            factors.push('Valid Ghana Card');
        }
        if (tenant.monthlyIncome && tenant.monthlyIncome > 5000) {
            factors.push('Stable income');
        }
        if (tenant.employerName) {
            factors.push('Verified employment');
        }
        if (tenant.characterReferences.length >= 2) {
            factors.push('Multiple characterReferences');
        }
        if (tenant.previousAddresses.length > 0) {
            factors.push('Rental history available');
        }

        return factors;
    }
}

// =====================================================
// ADDITIONAL TYPES FOR THIS SERVICE
// =====================================================

interface TenantReference {
    name: string;
    phone: string;
    email?: string;
    relationship: string;
    notes?: string;
}

interface PreviousAddress {
    address: string;
    city: string;
    region: string;
    fromDate: string;
    toDate: string;
    landlordName?: string;
    landlordPhone?: string;
    reasonForLeaving?: string;
}

type TenantRecommendation = 'APPROVE' | 'APPROVE_WITH_CONDITIONS' | 'REVIEW_REQUIRED' | 'DECLINE';

interface TenantScreeningResult {
    tenantId: string;
    overallScore: number;
    breakdown: {
        incomeScore: number;
        historyScore: number;
        referenceScore: number;
    };
    recommendation: TenantRecommendation;
    riskFactors: string[];
    positiveFactors: string[];
    screenedAt: Date;
}

// Export singleton instance
export const tenantService = new TenantService();
