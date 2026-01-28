/**
 * Lease Template Service
 * Property Management module - Lease document generation
 * 
 * Features:
 * - CRUD for lease templates
 * - Variable substitution (Handlebars)
 * - PDF generation
 * - E-Sign integration
 * 
 * @module services/property-management/leases/leaseTemplateService
 */

import { pool } from '../../../database';
import { logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { 
    documentService, 
    templateService, 
    DocumentInfo 
} from '../../../../shared-services/document-service';

// =====================================================
// INTERFACES
// =====================================================

export interface LeaseTemplate {
    id: string;
    organizationId: string;
    name: string;
    description?: string;
    content: string; // Handlebars/HTML template
    variables: string[];
    category: 'residential' | 'commercial' | 'short_term' | 'custom';
    isDefault: boolean;
    isActive: boolean;
    version: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateLeaseTemplateParams {
    name: string;
    description?: string;
    content: string;
    category?: 'residential' | 'commercial' | 'short_term' | 'custom';
    isDefault?: boolean;
}

export interface UpdateLeaseTemplateParams {
    name?: string;
    description?: string;
    content?: string;
    category?: 'residential' | 'commercial' | 'short_term' | 'custom';
    isDefault?: boolean;
    isActive?: boolean;
}

export interface GenerateLeaseParams {
    tenancyId: string;
    templateId?: string; // Uses default if not specified
    additionalData?: Record<string, any>;
    format?: 'pdf' | 'html';
}

export interface GeneratedLease {
    documentId: string;
    documentKey: string;
    filename: string;
    downloadUrl: string;
    tenancyId: string;
    templateId: string;
    generatedAt: Date;
}

// =====================================================
// LEASE TEMPLATE SERVICE
// =====================================================

export class LeaseTemplateService {
    
    // ========================================
    // TEMPLATE CRUD
    // ========================================

    /**
     * Create a new lease template
     */
    async createTemplate(
        organizationId: string,
        params: CreateLeaseTemplateParams,
        createdBy: string
    ): Promise<LeaseTemplate> {
        const id = uuidv4();
        const variables = templateService.extractVariables(params.content);

        // If setting as default, unset other defaults in same category
        if (params.isDefault) {
            await pool.query(
                `UPDATE lease_templates 
                 SET is_default = FALSE, updated_at = NOW()
                 WHERE organization_id = $1 AND category = $2`,
                [organizationId, params.category || 'residential']
            );
        }

        const query = `
            INSERT INTO lease_templates (
                id, organization_id, name, description, content, 
                variables, category, is_default, is_active, version,
                created_by, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 1, $9, NOW(), NOW())
            RETURNING *
        `;

        const result = await pool.query(query, [
            id,
            organizationId,
            params.name,
            params.description || null,
            params.content,
            JSON.stringify(variables),
            params.category || 'residential',
            params.isDefault || false,
            createdBy
        ]);

        logger.info('Lease template created', { id, name: params.name, organizationId });

        return this.mapRowToTemplate(result.rows[0]);
    }

    /**
     * Get a template by ID
     */
    async getTemplate(templateId: string, organizationId: string): Promise<LeaseTemplate | null> {
        const result = await pool.query(
            `SELECT * FROM lease_templates 
             WHERE id = $1 AND organization_id = $2`,
            [templateId, organizationId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToTemplate(result.rows[0]);
    }

    /**
     * Get all templates for an organization
     */
    async listTemplates(
        organizationId: string,
        options?: {
            category?: string;
            activeOnly?: boolean;
            limit?: number;
            offset?: number;
        }
    ): Promise<{ templates: LeaseTemplate[]; total: number }> {
        let whereClause = 'WHERE organization_id = $1';
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (options?.category) {
            whereClause += ` AND category = $${paramIndex}`;
            params.push(options.category);
            paramIndex++;
        }

        if (options?.activeOnly !== false) {
            whereClause += ' AND is_active = TRUE';
        }

        // Get total count
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM lease_templates ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get templates with pagination
        let query = `
            SELECT * FROM lease_templates 
            ${whereClause}
            ORDER BY is_default DESC, name ASC
        `;

        if (options?.limit) {
            query += ` LIMIT $${paramIndex}`;
            params.push(options.limit);
            paramIndex++;
        }

        if (options?.offset) {
            query += ` OFFSET $${paramIndex}`;
            params.push(options.offset);
        }

        const result = await pool.query(query, params);

        return {
            templates: result.rows.map(row => this.mapRowToTemplate(row)),
            total
        };
    }

    /**
     * Update a template
     */
    async updateTemplate(
        templateId: string,
        organizationId: string,
        params: UpdateLeaseTemplateParams
    ): Promise<LeaseTemplate | null> {
        const existing = await this.getTemplate(templateId, organizationId);
        if (!existing) {
            return null;
        }

        const updates: string[] = ['updated_at = NOW()'];
        const values: any[] = [];
        let paramIndex = 1;

        if (params.name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            values.push(params.name);
            paramIndex++;
        }

        if (params.description !== undefined) {
            updates.push(`description = $${paramIndex}`);
            values.push(params.description);
            paramIndex++;
        }

        if (params.content !== undefined) {
            const variables = templateService.extractVariables(params.content);
            updates.push(`content = $${paramIndex}`);
            values.push(params.content);
            paramIndex++;
            updates.push(`variables = $${paramIndex}`);
            values.push(JSON.stringify(variables));
            paramIndex++;
            updates.push(`version = version + 1`);
        }

        if (params.category !== undefined) {
            updates.push(`category = $${paramIndex}`);
            values.push(params.category);
            paramIndex++;
        }

        if (params.isDefault !== undefined) {
            // Unset other defaults if setting this as default
            if (params.isDefault) {
                await pool.query(
                    `UPDATE lease_templates 
                     SET is_default = FALSE, updated_at = NOW()
                     WHERE organization_id = $1 AND category = $2 AND id != $3`,
                    [organizationId, params.category || existing.category, templateId]
                );
            }
            updates.push(`is_default = $${paramIndex}`);
            values.push(params.isDefault);
            paramIndex++;
        }

        if (params.isActive !== undefined) {
            updates.push(`is_active = $${paramIndex}`);
            values.push(params.isActive);
            paramIndex++;
        }

        values.push(templateId, organizationId);

        const result = await pool.query(
            `UPDATE lease_templates 
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return null;
        }

        logger.info('Lease template updated', { templateId, organizationId });

        return this.mapRowToTemplate(result.rows[0]);
    }

    /**
     * Delete a template (soft delete)
     */
    async deleteTemplate(templateId: string, organizationId: string): Promise<boolean> {
        const result = await pool.query(
            `UPDATE lease_templates 
             SET is_active = FALSE, updated_at = NOW()
             WHERE id = $1 AND organization_id = $2`,
            [templateId, organizationId]
        );

        if (result.rowCount === 0) {
            return false;
        }

        logger.info('Lease template deleted', { templateId, organizationId });
        return true;
    }

    // ========================================
    // DOCUMENT GENERATION
    // ========================================

    /**
     * Generate a lease document from template and tenancy data
     */
    async generateLease(
        organizationId: string,
        params: GenerateLeaseParams
    ): Promise<GeneratedLease> {
        // Get tenancy with all related data
        const tenancyData = await this.getTenancyData(params.tenancyId, organizationId);
        if (!tenancyData) {
            throw new Error('Tenancy not found');
        }

        // Get template
        let template: LeaseTemplate | null;
        if (params.templateId) {
            template = await this.getTemplate(params.templateId, organizationId);
            if (!template) {
                throw new Error('Template not found');
            }
        } else {
            // Get default template for category
            const category = tenancyData.propertyType === 'commercial' ? 'commercial' : 'residential';
            const result = await pool.query(
                `SELECT * FROM lease_templates 
                 WHERE organization_id = $1 AND category = $2 AND is_default = TRUE AND is_active = TRUE
                 LIMIT 1`,
                [organizationId, category]
            );
            if (result.rows.length === 0) {
                throw new Error('No default template found for this category');
            }
            template = this.mapRowToTemplate(result.rows[0]);
        }

        // Prepare data for template
        const templateData = {
            // Lease details
            leaseStartDate: tenancyData.startDate,
            leaseEndDate: tenancyData.endDate,
            leaseTerm: this.calculateLeaseTerm(tenancyData.startDate, tenancyData.endDate),
            
            // Financial
            monthlyRent: tenancyData.rentAmount,
            rentCurrency: tenancyData.rentCurrency,
            securityDeposit: tenancyData.securityDeposit,
            paymentDueDay: tenancyData.paymentDueDay || 1,
            
            // Property
            propertyTitle: tenancyData.propertyTitle,
            propertyAddress: tenancyData.propertyAddress,
            propertyType: tenancyData.propertyType,
            unitNumber: tenancyData.unitNumber,
            bedrooms: tenancyData.bedrooms,
            bathrooms: tenancyData.bathrooms,
            
            // Tenant
            tenantName: tenancyData.tenantName,
            tenantEmail: tenancyData.tenantEmail,
            tenantPhone: tenancyData.tenantPhone,
            tenantIdType: tenancyData.tenantIdType,
            tenantIdNumber: tenancyData.tenantIdNumber,
            
            // Landlord/Organization
            landlordName: tenancyData.organizationName,
            landlordAddress: tenancyData.organizationAddress,
            landlordPhone: tenancyData.organizationPhone,
            landlordEmail: tenancyData.organizationEmail,
            
            // Dates
            today: new Date(),
            generatedAt: new Date().toISOString(),
            
            // Additional custom data
            ...params.additionalData
        };

        // Generate document
        const filename = `Lease_Agreement_${tenancyData.propertyTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.${params.format || 'pdf'}`;

        const docInfo = await documentService.generateAndStore({
            templateContent: template.content,
            data: templateData,
            filename,
            organizationId,
            module: 'property-management',
            entityType: 'tenancy',
            entityId: params.tenancyId,
            format: params.format || 'pdf'
        });

        // Get download URL
        const downloadUrl = await documentService.storage.getDownloadUrl(docInfo.key);

        // Record in lease_documents table
        await pool.query(
            `INSERT INTO lease_documents (
                id, tenancy_id, template_id, document_key, filename, 
                generated_at, organization_id
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
            [uuidv4(), params.tenancyId, template.id, docInfo.key, filename, organizationId]
        );

        logger.info('Lease document generated', {
            tenancyId: params.tenancyId,
            templateId: template.id,
            documentKey: docInfo.key
        });

        return {
            documentId: docInfo.id,
            documentKey: docInfo.key,
            filename,
            downloadUrl,
            tenancyId: params.tenancyId,
            templateId: template.id,
            generatedAt: new Date()
        };
    }

    /**
     * Preview a template with sample data
     */
    async previewTemplate(
        templateId: string,
        organizationId: string,
        sampleData?: Record<string, any>
    ): Promise<string> {
        const template = await this.getTemplate(templateId, organizationId);
        if (!template) {
            throw new Error('Template not found');
        }

        // Use sample data or generate placeholder data
        const data = sampleData || this.generateSampleData();

        return templateService.render(template.content, data);
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    private async getTenancyData(tenancyId: string, organizationId: string): Promise<any> {
        const result = await pool.query(`
            SELECT 
                t.id,
                t.start_date,
                t.end_date,
                t.rent_amount,
                t.rent_currency,
                t.security_deposit,
                t.payment_due_day,
                p.title as property_title,
                p.address as property_address,
                p.property_type,
                p.unit_number,
                p.bedrooms,
                p.bathrooms,
                tn.full_name as tenant_name,
                tn.email as tenant_email,
                tn.phone as tenant_phone,
                tn.id_type as tenant_id_type,
                tn.id_number as tenant_id_number,
                o.name as organization_name,
                o.address as organization_address,
                o.phone as organization_phone,
                o.email as organization_email
            FROM tenancies t
            JOIN properties p ON t.property_id = p.id
            JOIN tenants tn ON t.tenant_id = tn.id
            JOIN organizations o ON t.organization_id = o.id
            WHERE t.id = $1 AND t.organization_id = $2
        `, [tenancyId, organizationId]);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            id: row.id,
            startDate: row.start_date,
            endDate: row.end_date,
            rentAmount: parseFloat(row.rent_amount),
            rentCurrency: row.rent_currency,
            securityDeposit: parseFloat(row.security_deposit || 0),
            paymentDueDay: row.payment_due_day,
            propertyTitle: row.property_title,
            propertyAddress: row.property_address,
            propertyType: row.property_type,
            unitNumber: row.unit_number,
            bedrooms: row.bedrooms,
            bathrooms: row.bathrooms,
            tenantName: row.tenant_name,
            tenantEmail: row.tenant_email,
            tenantPhone: row.tenant_phone,
            tenantIdType: row.tenant_id_type,
            tenantIdNumber: row.tenant_id_number,
            organizationName: row.organization_name,
            organizationAddress: row.organization_address,
            organizationPhone: row.organization_phone,
            organizationEmail: row.organization_email
        };
    }

    private calculateLeaseTerm(startDate: Date, endDate: Date): string {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        
        if (months >= 12) {
            const years = Math.floor(months / 12);
            const remainingMonths = months % 12;
            if (remainingMonths === 0) {
                return `${years} year${years > 1 ? 's' : ''}`;
            }
            return `${years} year${years > 1 ? 's' : ''} and ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
        }
        return `${months} month${months > 1 ? 's' : ''}`;
    }

    private generateSampleData(): Record<string, any> {
        return {
            leaseStartDate: new Date(),
            leaseEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            leaseTerm: '1 year',
            monthlyRent: 2500,
            rentCurrency: 'GHS',
            securityDeposit: 5000,
            paymentDueDay: 1,
            propertyTitle: 'Sample Property',
            propertyAddress: '123 Sample Street, Accra',
            propertyType: 'apartment',
            unitNumber: 'A1',
            bedrooms: 2,
            bathrooms: 1,
            tenantName: 'John Doe',
            tenantEmail: 'john.doe@example.com',
            tenantPhone: '+233 20 123 4567',
            tenantIdType: 'Ghana Card',
            tenantIdNumber: 'GHA-123456789-0',
            landlordName: 'Sample Property Management',
            landlordAddress: '456 Business Ave, Accra',
            landlordPhone: '+233 30 987 6543',
            landlordEmail: 'info@sample-pm.com',
            today: new Date(),
            generatedAt: new Date().toISOString()
        };
    }

    private mapRowToTemplate(row: any): LeaseTemplate {
        return {
            id: row.id,
            organizationId: row.organization_id,
            name: row.name,
            description: row.description,
            content: row.content,
            variables: typeof row.variables === 'string' ? JSON.parse(row.variables) : row.variables,
            category: row.category,
            isDefault: row.is_default,
            isActive: row.is_active,
            version: row.version,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const leaseTemplateService = new LeaseTemplateService();
