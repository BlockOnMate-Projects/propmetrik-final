/**
 * Template Service
 * 
 * Manages reusable document templates for e-signature workflows.
 * Templates can be used to quickly create envelopes with predefined
 * document structure, signers, and fields.
 * 
 * @module shared-services/e-sign/templateService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';
import {
    Template,
    CreateTemplateDto,
    UpdateTemplateDto,
    ListTemplatesOptions
} from './types';

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

        const result = await db.query(
            `INSERT INTO esign_templates (
                id, organization_id, created_by, name, description, category,
                document_html, document_pdf_url, is_active, usage_count,
                default_signers, default_fields, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                id,
                organizationId,
                userId,
                dto.name,
                dto.description || null,
                dto.category || null,
                dto.documentHtml || null,
                dto.documentPdfUrl || null,
                true, // is_active
                0, // usage_count
                JSON.stringify(dto.defaultSigners || []),
                JSON.stringify(dto.defaultFields || []),
                JSON.stringify(dto.metadata || {})
            ]
        );

        logger.info('Template created', { templateId: id, organizationId, userId });
        return this.mapRowToTemplate(result.rows[0]);
    }

    /**
     * Get a template by ID
     */
    async getTemplateById(id: string, organizationId: string): Promise<Template | null> {
        const result = await db.query(
            `SELECT * FROM esign_templates 
             WHERE id = $1 AND organization_id = $2`,
            [id, organizationId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToTemplate(result.rows[0]);
    }

    /**
     * List templates for an organization
     */
    async listTemplates(
        organizationId: string,
        options: ListTemplatesOptions = {}
    ): Promise<{ templates: Template[]; total: number }> {
        const conditions = ['organization_id = $1'];
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
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM esign_templates WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get paginated results
        let query = `SELECT * FROM esign_templates WHERE ${whereClause} ORDER BY created_at DESC`;
        
        if (options.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(options.limit);
        }
        
        if (options.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(options.offset);
        }

        const result = await db.query(query, params);
        const templates = result.rows.map(row => this.mapRowToTemplate(row));

        return { templates, total };
    }

    /**
     * Update a template
     */
    async updateTemplate(
        id: string,
        organizationId: string,
        userId: string,
        dto: UpdateTemplateDto
    ): Promise<Template | null> {
        const existing = await this.getTemplateById(id, organizationId);
        if (!existing) {
            return null;
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
        if (dto.isActive !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(dto.isActive);
        }
        if (dto.defaultSigners !== undefined) {
            updates.push(`default_signers = $${paramIndex++}`);
            params.push(JSON.stringify(dto.defaultSigners));
        }
        if (dto.defaultFields !== undefined) {
            updates.push(`default_fields = $${paramIndex++}`);
            params.push(JSON.stringify(dto.defaultFields));
        }
        if (dto.metadata !== undefined) {
            updates.push(`metadata = $${paramIndex++}`);
            params.push(JSON.stringify(dto.metadata));
        }

        if (updates.length === 0) {
            return existing;
        }

        updates.push(`updated_at = NOW()`);
        params.push(id, organizationId);

        const result = await db.query(
            `UPDATE esign_templates 
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
             RETURNING *`,
            params
        );

        logger.info('Template updated', { templateId: id, organizationId, userId });
        return this.mapRowToTemplate(result.rows[0]);
    }

    /**
     * Delete a template (soft delete by setting is_active = false)
     */
    async deleteTemplate(id: string, organizationId: string, userId: string): Promise<boolean> {
        const result = await db.query(
            `UPDATE esign_templates 
             SET is_active = false, updated_at = NOW()
             WHERE id = $1 AND organization_id = $2
             RETURNING id`,
            [id, organizationId]
        );

        if (result.rows.length > 0) {
            logger.info('Template deleted (soft)', { templateId: id, organizationId, userId });
            return true;
        }
        return false;
    }

    /**
     * Get unique categories for an organization
     */
    async getCategories(organizationId: string): Promise<string[]> {
        const result = await db.query(
            `SELECT DISTINCT category FROM esign_templates 
             WHERE organization_id = $1 AND category IS NOT NULL AND is_active = true
             ORDER BY category`,
            [organizationId]
        );

        return result.rows.map(row => row.category);
    }

    /**
     * Get popular templates by usage count
     */
    async getPopularTemplates(organizationId: string, limit: number = 10): Promise<Template[]> {
        const result = await db.query(
            `SELECT * FROM esign_templates 
             WHERE organization_id = $1 AND is_active = true
             ORDER BY usage_count DESC, last_used_at DESC NULLS LAST
             LIMIT $2`,
            [organizationId, limit]
        );

        return result.rows.map(row => this.mapRowToTemplate(row));
    }

    /**
     * Record template usage (called when creating envelope from template)
     */
    async useTemplate(id: string, organizationId: string): Promise<Template | null> {
        const result = await db.query(
            `UPDATE esign_templates 
             SET usage_count = usage_count + 1, last_used_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND organization_id = $2
             RETURNING *`,
            [id, organizationId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToTemplate(result.rows[0]);
    }

    /**
     * Clone a template
     */
    async cloneTemplate(
        id: string,
        organizationId: string,
        userId: string,
        newName: string
    ): Promise<Template | null> {
        const existing = await this.getTemplateById(id, organizationId);
        if (!existing) {
            return null;
        }

        return this.createTemplate(organizationId, userId, {
            name: newName,
            description: existing.description,
            category: existing.category,
            documentHtml: existing.documentHtml,
            documentPdfUrl: existing.documentPdfUrl,
            defaultSigners: existing.defaultSigners as any,
            defaultFields: existing.defaultFields as any,
            metadata: existing.metadata
        });
    }

    /**
     * Map database row to Template object
     */
    private mapRowToTemplate(row: any): Template {
        return {
            id: row.id,
            organizationId: row.organization_id,
            createdBy: row.created_by,
            name: row.name,
            description: row.description,
            category: row.category,
            documentHtml: row.document_html,
            documentPdfUrl: row.document_pdf_url,
            isActive: row.is_active,
            usageCount: row.usage_count,
            lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
            defaultSigners: typeof row.default_signers === 'string' 
                ? JSON.parse(row.default_signers) 
                : row.default_signers || [],
            defaultFields: typeof row.default_fields === 'string'
                ? JSON.parse(row.default_fields)
                : row.default_fields || [],
            metadata: typeof row.metadata === 'string'
                ? JSON.parse(row.metadata)
                : row.metadata || {},
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }
}

// Export singleton instance
export const templateService = new TemplateService();
