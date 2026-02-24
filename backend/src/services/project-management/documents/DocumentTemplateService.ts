/**
 * Document Template Service
 * 
 * Phase 3.10: Split projectDocumentService
 * 
 * Manages document templates:
 * - Template retrieval
 * - Ghana-specific templates
 * - Template categories
 * 
 * @module services/project-management/documents/DocumentTemplateService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  DocumentTemplate,
  mapRowToTemplate,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class DocumentTemplateServiceImpl extends BaseService {
  constructor() {
    super('DocumentTemplateService');
  }

  /**
   * Get all templates with optional filters
   */
  async getTemplates(filters?: {
    organizationId?: string;
    category?: string;
    templateType?: string;
    isGhanaSpecific?: boolean;
    region?: string;
    search?: string;
  }): Promise<DocumentTemplate[]> {
    const conditions: string[] = ['is_active = true'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.organizationId) {
      conditions.push(`(organization_id = $${paramIndex++} OR organization_id IS NULL)`);
      values.push(filters.organizationId);
    }

    if (filters?.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filters.category);
    }

    if (filters?.templateType) {
      conditions.push(`template_type = $${paramIndex++}`);
      values.push(filters.templateType);
    }

    if (filters?.isGhanaSpecific !== undefined) {
      conditions.push(`is_ghana_specific = $${paramIndex++}`);
      values.push(filters.isGhanaSpecific);
    }

    if (filters?.region) {
      conditions.push(`(applicable_regions IS NULL OR $${paramIndex++} = ANY(applicable_regions))`);
      values.push(filters.region);
    }

    if (filters?.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const result = await this.query(
      `SELECT * FROM document_templates
       WHERE ${conditions.join(' AND ')}
       ORDER BY is_system DESC, category, name`,
      values
    );

    return result.rows.map(mapRowToTemplate);
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: string): Promise<DocumentTemplate | null> {
    const result = await this.query(
      'SELECT * FROM document_templates WHERE id = $1',
      [templateId]
    );

    return result.rows[0] ? mapRowToTemplate(result.rows[0]) : null;
  }

  /**
   * Get templates by category
   */
  async getTemplatesByCategory(category: string): Promise<DocumentTemplate[]> {
    return this.getTemplates({ category });
  }

  /**
   * Get Ghana-specific templates
   */
  async getGhanaTemplates(region?: string): Promise<DocumentTemplate[]> {
    return this.getTemplates({ isGhanaSpecific: true, region });
  }

  /**
   * Get template categories
   */
  async getTemplateCategories(): Promise<Array<{
    category: string;
    count: number;
    hasGhanaSpecific: boolean;
  }>> {
    const result = await this.query(
      `SELECT 
         category,
         COUNT(*) as count,
         BOOL_OR(is_ghana_specific) as has_ghana_specific
       FROM document_templates
       WHERE is_active = true
       GROUP BY category
       ORDER BY category`
    );

    return result.rows.map(row => ({
      category: row.category || 'uncategorized',
      count: parseInt(row.count),
      hasGhanaSpecific: row.has_ghana_specific,
    }));
  }

  /**
   * Get template types
   */
  async getTemplateTypes(): Promise<string[]> {
    const result = await this.query(
      `SELECT DISTINCT template_type 
       FROM document_templates 
       WHERE is_active = true AND template_type IS NOT NULL
       ORDER BY template_type`
    );

    return result.rows.map(r => r.template_type);
  }

  /**
   * Get applicable regions for templates
   */
  async getTemplateRegions(): Promise<string[]> {
    const result = await this.query(
      `SELECT DISTINCT unnest(applicable_regions) as region
       FROM document_templates
       WHERE is_active = true AND applicable_regions IS NOT NULL
       ORDER BY region`
    );

    return result.rows.map(r => r.region);
  }

  /**
   * Create a template (for organizations)
   */
  async createTemplate(input: {
    organizationId: string;
    name: string;
    description?: string;
    templateType: string;
    category?: string;
    templateUrl?: string;
    templateContent?: string;
    format?: string;
    variables?: Array<{
      name: string;
      type: string;
      required?: boolean;
      defaultValue?: unknown;
    }>;
    isGhanaSpecific?: boolean;
    applicableRegions?: string[];
  }): Promise<DocumentTemplate> {
    const id = require('uuid').v4();

    const result = await this.query(
      `INSERT INTO document_templates (
         id, organization_id, name, description,
         template_type, category,
         template_url, template_content, format,
         variables, is_ghana_specific, applicable_regions,
         is_active, is_system
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, false)
       RETURNING *`,
      [
        id,
        input.organizationId,
        input.name,
        input.description,
        input.templateType,
        input.category,
        input.templateUrl,
        input.templateContent,
        input.format,
        JSON.stringify(input.variables || []),
        input.isGhanaSpecific || false,
        input.applicableRegions,
      ]
    );

    return mapRowToTemplate(result.rows[0]);
  }

  /**
   * Update a template
   */
  async updateTemplate(
    templateId: string,
    input: {
      name?: string;
      description?: string;
      templateUrl?: string;
      templateContent?: string;
      variables?: Array<{
        name: string;
        type: string;
        required?: boolean;
        defaultValue?: unknown;
      }>;
      isActive?: boolean;
    }
  ): Promise<DocumentTemplate | null> {
    const template = await this.getTemplateById(templateId);
    if (!template || template.isSystem) {
      return null; // Can't update system templates
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.templateUrl !== undefined) {
      updates.push(`template_url = $${paramIndex++}`);
      values.push(input.templateUrl);
    }
    if (input.templateContent !== undefined) {
      updates.push(`template_content = $${paramIndex++}`);
      values.push(input.templateContent);
    }
    if (input.variables !== undefined) {
      updates.push(`variables = $${paramIndex++}`);
      values.push(JSON.stringify(input.variables));
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }

    if (updates.length === 0) {
      return template;
    }

    updates.push(`updated_at = NOW()`);
    values.push(templateId);

    const result = await this.query(
      `UPDATE document_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return mapRowToTemplate(result.rows[0]);
  }

  /**
   * Delete a template (only non-system templates)
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const result = await this.query(
      'DELETE FROM document_templates WHERE id = $1 AND is_system = false RETURNING id',
      [templateId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Clone a template for an organization
   */
  async cloneTemplate(
    templateId: string,
    organizationId: string,
    newName?: string
  ): Promise<DocumentTemplate | null> {
    const original = await this.getTemplateById(templateId);
    if (!original) {
      return null;
    }

    return this.createTemplate({
      organizationId,
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      templateType: original.templateType,
      category: original.category,
      templateUrl: original.templateUrl,
      templateContent: original.templateContent,
      format: original.format,
      variables: original.variables,
      isGhanaSpecific: original.isGhanaSpecific,
      applicableRegions: original.applicableRegions,
    });
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const documentTemplateService = new DocumentTemplateServiceImpl();
