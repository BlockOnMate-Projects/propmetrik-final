/**
 * Template Service
 * Reusable document templates with predefined fields
 * Ported from phase12-esign/backend/api/templates.py
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';

export interface TemplateFieldDefinition {
    id?: string;
    role: string;           // 'landlord', 'tenant', etc.
    type: string;           // 'signature', 'initials', 'date_signed', 'text'
    page: number;
    x: number;              // Percentage (0-100)
    y: number;              // Percentage (0-100)
    width: number;
    height: number;
    required: boolean;
    label?: string;
}

export interface TemplateRole {
    name: string;
    order: number;
    required: boolean;
}

export interface Template {
    id: string;
    organizationId: string;
    name: string;
    description?: string;
    category: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    documentDriveId?: string;
    fieldDefinitions: TemplateFieldDefinition[];
    roles: TemplateRole[];
    isShared: boolean;
    isActive: boolean;
    usedCount: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateTemplateDto {
    name: string;
    description?: string;
    category?: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    documentDriveId?: string;
    fieldDefinitions: TemplateFieldDefinition[];
    roles: TemplateRole[];
    isShared?: boolean;
}

export interface UpdateTemplateDto {
    name?: string;
    description?: string;
    category?: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    documentDriveId?: string;
    fieldDefinitions?: TemplateFieldDefinition[];
    roles?: TemplateRole[];
    isShared?: boolean;
    isActive?: boolean;
}

export interface TemplateListOptions {
    category?: string;
    search?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
}

export class TemplateService {
    /**
     * Create a new template
     */
    async createTemplate(
        organizationId: string,
        userId: string,
        dto: CreateTemplateDto
    ): Promise<Template> {
        const id = uuidv4();

        // Assign IDs to field definitions if not present
        const fieldDefinitions = dto.fieldDefinitions.map(field => ({
            ...field,
            id: field.id || uuidv4()
        }));

        const result = await db.query(
            `INSERT INTO esign_templates (
                id, organization_id, name, description, category,
                document_html, document_pdf_url, document_drive_id,
                field_definitions, roles, is_shared, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                id,
                organizationId,
                dto.name,
                dto.description || null,
                dto.category || 'General',
                dto.documentHtml || null,
                dto.documentPdfUrl || null,
                dto.documentDriveId || null,
                JSON.stringify(fieldDefinitions),
                JSON.stringify(dto.roles),
                dto.isShared || false,
                userId
            ]
        );

        logger.info('Template created', { id, name: dto.name, organizationId });
        return this.mapToTemplate(result.rows[0]);
    }

    /**
     * List templates for organization
     */
    async listTemplates(
        organizationId: string,
        options: TemplateListOptions = {}
    ): Promise<{ templates: Template[]; total: number }> {
        const conditions: string[] = ['(organization_id = $1 OR is_shared = TRUE)'];
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (options.category) {
            conditions.push(`category = $${paramIndex++}`);
            params.push(options.category);
        }

        if (options.search) {
            conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
            params.push(`%${options.search}%`);
            paramIndex++;
        }

        if (options.isActive !== undefined) {
            conditions.push(`is_active = $${paramIndex++}`);
            params.push(options.isActive);
        } else {
            conditions.push('is_active = TRUE');
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM esign_templates WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0]?.total || '0', 10);

        // Get paginated results
        let query = `SELECT * FROM esign_templates WHERE ${whereClause} ORDER BY used_count DESC, created_at DESC`;
        
        if (options.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(options.limit);
        }
        
        if (options.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(options.offset);
        }

        const result = await db.query(query, params);
        return {
            templates: result.rows.map(row => this.mapToTemplate(row)),
            total
        };
    }

    /**
     * Get template by ID
     */
    async getTemplateById(templateId: string, organizationId?: string): Promise<Template | null> {
        let query = `SELECT * FROM esign_templates WHERE id = $1`;
        const params: any[] = [templateId];
        
        if (organizationId) {
            query += ` AND (organization_id = $2 OR is_shared = TRUE)`;
            params.push(organizationId);
        }

        const result = await db.query(query, params);

        if (result.rows.length === 0) return null;
        return this.mapToTemplate(result.rows[0]);
    }

    /**
     * Update a template
     */
    async updateTemplate(
        templateId: string,
        organizationId: string,
        userId: string,
        dto: UpdateTemplateDto
    ): Promise<Template | null> {
        // Verify ownership
        const existing = await this.getTemplateById(templateId, organizationId);
        if (!existing) return null;
        
        // Only owner can update non-shared templates
        if (existing.createdBy !== userId && !existing.isShared) {
            throw new Error('Not authorized to update this template');
        }

        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (dto.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(dto.name);
        }
        if (dto.description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(dto.description);
        }
        if (dto.category !== undefined) {
            updates.push(`category = $${paramIndex++}`);
            params.push(dto.category);
        }
        if (dto.documentHtml !== undefined) {
            updates.push(`document_html = $${paramIndex++}`);
            params.push(dto.documentHtml);
        }
        if (dto.documentPdfUrl !== undefined) {
            updates.push(`document_pdf_url = $${paramIndex++}`);
            params.push(dto.documentPdfUrl);
        }
        if (dto.documentDriveId !== undefined) {
            updates.push(`document_drive_id = $${paramIndex++}`);
            params.push(dto.documentDriveId);
        }
        if (dto.fieldDefinitions !== undefined) {
            // Assign IDs to new fields
            const fieldDefinitions = dto.fieldDefinitions.map(field => ({
                ...field,
                id: field.id || uuidv4()
            }));
            updates.push(`field_definitions = $${paramIndex++}`);
            params.push(JSON.stringify(fieldDefinitions));
        }
        if (dto.roles !== undefined) {
            updates.push(`roles = $${paramIndex++}`);
            params.push(JSON.stringify(dto.roles));
        }
        if (dto.isShared !== undefined) {
            updates.push(`is_shared = $${paramIndex++}`);
            params.push(dto.isShared);
        }
        if (dto.isActive !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(dto.isActive);
        }

        if (updates.length === 0) {
            return existing;
        }

        params.push(templateId);

        const result = await db.query(
            `UPDATE esign_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            params
        );

        logger.info('Template updated', { templateId, updates: Object.keys(dto) });
        return this.mapToTemplate(result.rows[0]);
    }

    /**
     * Use a template (increment counter and return data)
     */
    async useTemplate(templateId: string, organizationId: string): Promise<Template | null> {
        const template = await this.getTemplateById(templateId, organizationId);
        if (!template) return null;

        await db.query(
            `UPDATE esign_templates SET used_count = used_count + 1 WHERE id = $1`,
            [templateId]
        );

        logger.info('Template used', { templateId, newCount: template.usedCount + 1 });
        return { ...template, usedCount: template.usedCount + 1 };
    }

    /**
     * Delete template (soft delete by marking inactive)
     */
    async deleteTemplate(templateId: string, organizationId: string, userId: string): Promise<boolean> {
        const result = await db.query(
            `UPDATE esign_templates SET is_active = FALSE
             WHERE id = $1 AND organization_id = $2 AND created_by = $3 AND is_shared = FALSE
             RETURNING id`,
            [templateId, organizationId, userId]
        );

        if (result.rowCount && result.rowCount > 0) {
            logger.info('Template deleted (soft)', { templateId });
            return true;
        }
        return false;
    }

    /**
     * Hard delete template (permanent)
     */
    async hardDeleteTemplate(templateId: string, organizationId: string, userId: string): Promise<boolean> {
        const result = await db.query(
            `DELETE FROM esign_templates 
             WHERE id = $1 AND organization_id = $2 AND created_by = $3 AND is_shared = FALSE
             RETURNING id`,
            [templateId, organizationId, userId]
        );

        if (result.rowCount && result.rowCount > 0) {
            logger.info('Template deleted (hard)', { templateId });
            return true;
        }
        return false;
    }

    /**
     * Get template categories for an organization
     */
    async getCategories(organizationId: string): Promise<{ category: string; count: number }[]> {
        const result = await db.query(
            `SELECT category, COUNT(*) as count 
             FROM esign_templates 
             WHERE (organization_id = $1 OR is_shared = TRUE) AND is_active = TRUE
             GROUP BY category
             ORDER BY count DESC, category ASC`,
            [organizationId]
        );

        return result.rows.map(row => ({
            category: row.category,
            count: parseInt(row.count, 10)
        }));
    }

    /**
     * Clone a template
     */
    async cloneTemplate(
        templateId: string,
        organizationId: string,
        userId: string,
        newName?: string
    ): Promise<Template | null> {
        const source = await this.getTemplateById(templateId, organizationId);
        if (!source) return null;

        return this.createTemplate(organizationId, userId, {
            name: newName || `${source.name} (Copy)`,
            description: source.description,
            category: source.category,
            documentHtml: source.documentHtml,
            documentPdfUrl: source.documentPdfUrl,
            documentDriveId: source.documentDriveId,
            fieldDefinitions: source.fieldDefinitions,
            roles: source.roles,
            isShared: false // Clones are always private
        });
    }

    /**
     * Get popular templates (most used)
     */
    async getPopularTemplates(organizationId: string, limit: number = 10): Promise<Template[]> {
        const result = await db.query(
            `SELECT * FROM esign_templates 
             WHERE (organization_id = $1 OR is_shared = TRUE) AND is_active = TRUE
             ORDER BY used_count DESC
             LIMIT $2`,
            [organizationId, limit]
        );

        return result.rows.map(row => this.mapToTemplate(row));
    }

    /**
     * Map database row to Template object
     */
    private mapToTemplate(row: any): Template {
        return {
            id: row.id,
            organizationId: row.organization_id,
            name: row.name,
            description: row.description,
            category: row.category,
            documentHtml: row.document_html,
            documentPdfUrl: row.document_pdf_url,
            documentDriveId: row.document_drive_id,
            fieldDefinitions: typeof row.field_definitions === 'string' 
                ? JSON.parse(row.field_definitions) 
                : row.field_definitions || [],
            roles: typeof row.roles === 'string' 
                ? JSON.parse(row.roles) 
                : row.roles || [],
            isShared: row.is_shared,
            isActive: row.is_active,
            usedCount: row.used_count || 0,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const templateService = new TemplateService();
