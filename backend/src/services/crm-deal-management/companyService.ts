/**
 * Company Service
 * Phase 5.2: CRM Service Layer
 * 
 * Handles all company-related operations for corporate buyers, developers,
 * and institutional entities with organization scoping and soft deletes.
 * 
 * @module services/crm-deal-management/companyService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import {
    Company,
    CreateCompanyInput,
    UpdateCompanyInput,
    PaginatedResponse,
} from './types';

// =============================================
// Types
// =============================================

export interface CompanyFilters {
    search?: string;
    company_type?: string;
    industry?: string;
    region?: string;
    tags?: string[];
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

// =============================================
// Company Service Class
// =============================================

export class CompanyService {
    /**
     * Create a new company
     */
    async createCompany(
        organizationId: string,
        data: CreateCompanyInput,
        userId?: string
    ): Promise<Company> {
        const id = uuidv4();

        try {
            const result = await db.query<Company>(
                `INSERT INTO companies (
                    id, organization_id, company_name, company_type, industry,
                    company_size, registration_number, primary_contact_id,
                    phone, email, website, address, region, city, digital_address,
                    notes, tags, created_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
                ) RETURNING *`,
                [
                    id,
                    organizationId,
                    data.company_name,
                    data.company_type || null,
                    data.industry || null,
                    data.company_size || null,
                    data.registration_number || null,
                    data.primary_contact_id || null,
                    data.phone || null,
                    data.email || null,
                    data.website || null,
                    data.address ? JSON.stringify(data.address) : null,
                    data.region || null,
                    data.city || null,
                    data.digital_address || null,
                    data.notes || null,
                    data.tags || null,
                    userId || null,
                ]
            );

            const company = result.rows[0];
            logger.info('Company created', { companyId: id, organizationId });

            // Track contribution for Data Hub
            try {
                const { ServiceHooks } = await import('../data-hub/serviceHooks');
                await ServiceHooks.createContribution({
                    contributor_id: userId || null,
                    organization_id: organizationId,
                    contribution_type: 'crm_company',
                    source_context: 'crm_deal_management',
                    source_id: id,
                    data: {
                        company_id: id,
                        company_name: data.company_name,
                        company_type: data.company_type,
                        action: 'company_creation',
                    },
                });
            } catch (hookError) {
                logger.error('Failed to create company contribution hook', hookError);
            }

            return company;
        } catch (error) {
            logger.error('Error creating company', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get company by ID with organization scoping
     */
    async getCompanyById(companyId: string, organizationId: string): Promise<Company | null> {
        try {
            const result = await db.query<Company>(
                `SELECT c.*,
                    pc.first_name || ' ' || pc.last_name as primary_contact_name,
                    pc.email as primary_contact_email,
                    pc.primary_phone as primary_contact_phone
                FROM companies c
                LEFT JOIN contacts pc ON c.primary_contact_id = pc.id
                WHERE c.id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL`,
                [companyId, organizationId]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching company', { error, companyId, organizationId });
            throw error;
        }
    }

    /**
     * List companies with filters and pagination
     */
    async listCompanies(
        organizationId: string,
        filters: CompanyFilters = {}
    ): Promise<PaginatedResponse<Company>> {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const offset = (page - 1) * limit;

            // Build WHERE conditions
            const conditions: string[] = ['c.organization_id = $1', 'c.deleted_at IS NULL'];
            const params: any[] = [organizationId];
            let paramIndex = 2;

            if (filters.search) {
                conditions.push(`(
                    c.search_vector @@ plainto_tsquery('english', $${paramIndex})
                    OR c.company_name ILIKE $${paramIndex + 1}
                    OR c.email ILIKE $${paramIndex + 2}
                )`);
                params.push(filters.search, `%${filters.search}%`, `%${filters.search}%`);
                paramIndex += 3;
            }

            if (filters.company_type) {
                conditions.push(`c.company_type = $${paramIndex}`);
                params.push(filters.company_type);
                paramIndex++;
            }

            if (filters.industry) {
                conditions.push(`c.industry ILIKE $${paramIndex}`);
                params.push(`%${filters.industry}%`);
                paramIndex++;
            }

            if (filters.region) {
                conditions.push(`c.region = $${paramIndex}`);
                params.push(filters.region);
                paramIndex++;
            }

            if (filters.tags && filters.tags.length > 0) {
                conditions.push(`c.tags && $${paramIndex}`);
                params.push(filters.tags);
                paramIndex++;
            }

            const whereClause = conditions.join(' AND ');
            const sortBy = filters.sort_by || 'created_at';
            const sortOrder = filters.sort_order || 'desc';
            const orderBy = `c.${sortBy} ${sortOrder.toUpperCase()}`;

            // Get total count
            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM companies c WHERE ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total, 10);

            // Get paginated data
            const dataParams = [...params, limit, offset];
            const result = await db.query<Company>(
                `SELECT c.*,
                    pc.first_name || ' ' || pc.last_name as primary_contact_name
                FROM companies c
                LEFT JOIN contacts pc ON c.primary_contact_id = pc.id
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
            logger.error('Error listing companies', { error, organizationId });
            throw error;
        }
    }

    /**
     * Update company
     */
    async updateCompany(
        companyId: string,
        organizationId: string,
        data: UpdateCompanyInput,
        userId?: string
    ): Promise<Company> {
        try {
            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            const fields: (keyof UpdateCompanyInput)[] = [
                'company_name',
                'company_type',
                'industry',
                'company_size',
                'registration_number',
                'primary_contact_id',
                'phone',
                'email',
                'website',
                'address',
                'notes',
                'tags',
                'custom_fields',
            ];

            for (const field of fields) {
                if (data[field] !== undefined) {
                    updates.push(`${field} = $${paramIndex}`);
                    if (field === 'address' || field === 'custom_fields') {
                        params.push(JSON.stringify(data[field]));
                    } else {
                        params.push(data[field]);
                    }
                    paramIndex++;
                }
            }

            if (userId) {
                updates.push(`updated_by = $${paramIndex}`);
                params.push(userId);
                paramIndex++;
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(companyId, organizationId);

            const result = await db.query<Company>(
                `UPDATE companies
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
                RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                throw new Error('Company not found or unauthorized');
            }

            logger.info('Company updated', { companyId, organizationId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating company', { error, companyId, organizationId });
            throw error;
        }
    }

    /**
     * Soft delete company
     */
    async deleteCompany(companyId: string, organizationId: string): Promise<void> {
        try {
            const result = await db.query(
                `UPDATE companies
                SET deleted_at = NOW()
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
                RETURNING id`,
                [companyId, organizationId]
            );

            if (result.rows.length === 0) {
                throw new Error('Company not found or already deleted');
            }

            logger.info('Company soft deleted', { companyId, organizationId });
        } catch (error) {
            logger.error('Error deleting company', { error, companyId, organizationId });
            throw error;
        }
    }

    /**
     * Get contacts associated with a company
     */
    async getCompanyContacts(
        companyId: string,
        organizationId: string
    ): Promise<any[]> {
        try {
            const result = await db.query(
                `SELECT c.id, c.first_name, c.last_name, c.email, c.primary_phone,
                    c.contact_type, c.lead_status, c.lead_score
                FROM contacts c
                WHERE c.company_id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL
                ORDER BY c.created_at DESC`,
                [companyId, organizationId]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching company contacts', { error, companyId, organizationId });
            throw error;
        }
    }

    /**
     * Get deals associated with a company
     */
    async getCompanyDeals(
        companyId: string,
        organizationId: string
    ): Promise<any[]> {
        try {
            const result = await db.query(
                `SELECT d.id, d.deal_number, d.title, d.deal_type, d.deal_status,
                    d.deal_value, d.close_probability, d.stage_id, ds.stage_name, ds.stage_color
                FROM deals d
                LEFT JOIN deal_stages ds ON d.stage_id = ds.id
                WHERE d.company_id = $1 AND d.organization_id = $2 AND d.deleted_at IS NULL
                ORDER BY d.created_at DESC`,
                [companyId, organizationId]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching company deals', { error, companyId, organizationId });
            throw error;
        }
    }

    /**
     * Get company statistics
     */
    async getCompanyStats(organizationId: string): Promise<{
        total: number;
        by_type: Record<string, number>;
        by_industry: Record<string, number>;
    }> {
        try {
            const result = await db.query(
                `SELECT 
                    COUNT(*) as total,
                    jsonb_object_agg(COALESCE(company_type::text, 'unknown'), type_count) as by_type,
                    jsonb_object_agg(COALESCE(industry, 'unknown'), industry_count) as by_industry
                FROM (
                    SELECT 
                        company_type,
                        industry,
                        COUNT(*) OVER (PARTITION BY company_type) as type_count,
                        COUNT(*) OVER (PARTITION BY industry) as industry_count
                    FROM companies
                    WHERE organization_id = $1 AND deleted_at IS NULL
                ) subquery`,
                [organizationId]
            );

            const row = result.rows[0];
            return {
                total: parseInt(row.total, 10) || 0,
                by_type: row.by_type || {},
                by_industry: row.by_industry || {},
            };
        } catch (error) {
            logger.error('Error fetching company stats', { error, organizationId });
            throw error;
        }
    }
}

export const companyService = new CompanyService();
