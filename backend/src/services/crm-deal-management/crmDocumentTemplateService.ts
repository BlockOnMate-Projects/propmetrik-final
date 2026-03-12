/**
 * CRM Document Template Service
 * Phase 5.10: E-Sign & Document Integration
 * 
 * Manages document templates with merge fields for Ghana real estate transactions.
 * Supports template CRUD, merge field resolution, and document generation.
 * 
 * @module services/crm-deal-management/crmDocumentTemplateService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';

// =============================================
// Types
// =============================================

export type DocumentTemplateCategory =
  | 'offer_letter'
  | 'mou'
  | 'reservation_agreement'
  | 'sales_agreement_freehold'
  | 'sales_agreement_leasehold'
  | 'deed_of_assignment'
  | 'power_of_attorney'
  | 'indenture'
  | 'lease_agreement'
  | 'tenancy_agreement'
  | 'receipt'
  | 'letter_of_intent'
  | 'commission_agreement'
  | 'other';

export type DocumentTemplateStatus = 'draft' | 'active' | 'archived';

export interface MergeFieldDefinition {
  key: string;
  required: boolean;
  defaultValue?: string;
}

export interface SignatureFieldDefinition {
  role: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
}

export interface SignerRoleDefinition {
  name: string;
  order: number;
  required: boolean;
}

export interface DocumentTemplate {
  id: string;
  organization_id: string;
  name: string;
  category: DocumentTemplateCategory;
  description?: string;
  template_html?: string;
  template_pdf_url?: string;
  merge_fields: MergeFieldDefinition[];
  signature_fields: SignatureFieldDefinition[];
  signer_roles: SignerRoleDefinition[];
  is_system_template: boolean;
  is_shared: boolean;
  status: DocumentTemplateStatus;
  version: number;
  use_count: number;
  last_used_at?: Date;
  ghana_legal_requirements?: string;
  requires_stamp_duty: boolean;
  requires_notarization: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTemplateInput {
  name: string;
  category: DocumentTemplateCategory;
  description?: string;
  template_html?: string;
  template_pdf_url?: string;
  merge_fields?: MergeFieldDefinition[];
  signature_fields?: SignatureFieldDefinition[];
  signer_roles?: SignerRoleDefinition[];
  is_shared?: boolean;
  ghana_legal_requirements?: string;
  requires_stamp_duty?: boolean;
  requires_notarization?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  category?: DocumentTemplateCategory;
  description?: string;
  template_html?: string;
  template_pdf_url?: string;
  merge_fields?: MergeFieldDefinition[];
  signature_fields?: SignatureFieldDefinition[];
  signer_roles?: SignerRoleDefinition[];
  is_shared?: boolean;
  status?: DocumentTemplateStatus;
  ghana_legal_requirements?: string;
  requires_stamp_duty?: boolean;
  requires_notarization?: boolean;
}

export interface TemplateFilters {
  category?: DocumentTemplateCategory;
  status?: DocumentTemplateStatus;
  search?: string;
  is_system?: boolean;
  page?: number;
  limit?: number;
}

export interface MergeFieldInfo {
  key: string;
  label: string;
  category: string;
  description?: string;
  data_type: string;
  format_pattern?: string;
}

// =============================================
// Service Class
// =============================================

class CrmDocumentTemplateService {
  
  // =============================================
  // Template CRUD
  // =============================================

  /**
   * Create a new document template
   */
  async create(
    organizationId: string,
    input: CreateTemplateInput,
    createdBy: string
  ): Promise<DocumentTemplate> {
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO crm_document_templates (
        id, organization_id, name, category, description,
        template_html, template_pdf_url, merge_fields,
        signature_fields, signer_roles, is_shared,
        ghana_legal_requirements, requires_stamp_duty,
        requires_notarization, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id,
        organizationId,
        input.name,
        input.category,
        input.description || null,
        input.template_html || null,
        input.template_pdf_url || null,
        JSON.stringify(input.merge_fields || []),
        JSON.stringify(input.signature_fields || []),
        JSON.stringify(input.signer_roles || []),
        input.is_shared || false,
        input.ghana_legal_requirements || null,
        input.requires_stamp_duty || false,
        input.requires_notarization || false,
        createdBy
      ]
    );

    logger.info({ templateId: id, name: input.name }, 'Document template created');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get template by ID
   */
  async getById(templateId: string, organizationId?: string): Promise<DocumentTemplate | null> {
    let query = 'SELECT * FROM crm_document_templates WHERE id = $1';
    const params: any[] = [templateId];

    if (organizationId) {
      query += ' AND (organization_id = $2 OR is_shared = TRUE OR is_system_template = TRUE)';
      params.push(organizationId);
    }

    const result = await db.query(query, params);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * List templates for organization
   */
  async list(
    organizationId: string,
    filters: TemplateFilters = {}
  ): Promise<{ templates: DocumentTemplate[]; total: number }> {
    const conditions: string[] = [
      '(organization_id = $1 OR is_shared = TRUE OR is_system_template = TRUE)'
    ];
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(filters.category);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    } else {
      conditions.push("status = 'active'");
    }

    if (filters.is_system !== undefined) {
      conditions.push(`is_system_template = $${paramIndex++}`);
      params.push(filters.is_system);
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM crm_document_templates WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Paginate
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const query = `
      SELECT * FROM crm_document_templates 
      WHERE ${whereClause}
      ORDER BY is_system_template DESC, use_count DESC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(limit, offset);

    const result = await db.query(query, params);

    return {
      templates: result.rows.map(row => this.mapRow(row)),
      total
    };
  }

  /**
   * Update template
   */
  async update(
    templateId: string,
    organizationId: string,
    input: UpdateTemplateInput,
    updatedBy: string
  ): Promise<DocumentTemplate | null> {
    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(input.name);
    }
    if (input.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(input.category);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(input.description);
    }
    if (input.template_html !== undefined) {
      updates.push(`template_html = $${paramIndex++}`);
      params.push(input.template_html);
    }
    if (input.template_pdf_url !== undefined) {
      updates.push(`template_pdf_url = $${paramIndex++}`);
      params.push(input.template_pdf_url);
    }
    if (input.merge_fields !== undefined) {
      updates.push(`merge_fields = $${paramIndex++}`);
      params.push(JSON.stringify(input.merge_fields));
    }
    if (input.signature_fields !== undefined) {
      updates.push(`signature_fields = $${paramIndex++}`);
      params.push(JSON.stringify(input.signature_fields));
    }
    if (input.signer_roles !== undefined) {
      updates.push(`signer_roles = $${paramIndex++}`);
      params.push(JSON.stringify(input.signer_roles));
    }
    if (input.is_shared !== undefined) {
      updates.push(`is_shared = $${paramIndex++}`);
      params.push(input.is_shared);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(input.status);
    }
    if (input.ghana_legal_requirements !== undefined) {
      updates.push(`ghana_legal_requirements = $${paramIndex++}`);
      params.push(input.ghana_legal_requirements);
    }
    if (input.requires_stamp_duty !== undefined) {
      updates.push(`requires_stamp_duty = $${paramIndex++}`);
      params.push(input.requires_stamp_duty);
    }
    if (input.requires_notarization !== undefined) {
      updates.push(`requires_notarization = $${paramIndex++}`);
      params.push(input.requires_notarization);
    }

    if (updates.length === 0) {
      return this.getById(templateId, organizationId);
    }

    updates.push('updated_at = NOW()');
    updates.push(`version = version + 1`);

    params.push(templateId, organizationId);

    const result = await db.query(
      `UPDATE crm_document_templates 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND organization_id = $${paramIndex} AND is_system_template = FALSE
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;
    
    logger.info({ templateId }, 'Document template updated');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Delete template (soft delete by archiving)
   */
  async delete(templateId: string, organizationId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE crm_document_templates 
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND is_system_template = FALSE
       RETURNING id`,
      [templateId, organizationId]
    );

    if (result.rows.length > 0) {
      logger.info({ templateId }, 'Document template archived');
      return true;
    }
    return false;
  }

  /**
   * Duplicate a template
   */
  async duplicate(
    templateId: string,
    organizationId: string,
    newName: string,
    createdBy: string
  ): Promise<DocumentTemplate | null> {
    const original = await this.getById(templateId, organizationId);
    if (!original) return null;

    return this.create(organizationId, {
      name: newName,
      category: original.category,
      description: original.description,
      template_html: original.template_html,
      template_pdf_url: original.template_pdf_url,
      merge_fields: original.merge_fields,
      signature_fields: original.signature_fields,
      signer_roles: original.signer_roles,
      is_shared: false,
      ghana_legal_requirements: original.ghana_legal_requirements,
      requires_stamp_duty: original.requires_stamp_duty,
      requires_notarization: original.requires_notarization
    }, createdBy);
  }

  // =============================================
  // Merge Fields
  // =============================================

  /**
   * Get all available merge fields
   */
  async getMergeFields(organizationId?: string): Promise<MergeFieldInfo[]> {
    let query = 'SELECT * FROM crm_merge_field_registry WHERE is_system = TRUE';
    const params: any[] = [];

    if (organizationId) {
      query += ' OR organization_id = $1';
      params.push(organizationId);
    }

    query += ' ORDER BY field_category, field_key';

    const result = await db.query(query, params);
    return result.rows.map(row => ({
      key: row.field_key,
      label: row.field_label,
      category: row.field_category,
      description: row.description,
      data_type: row.data_type,
      format_pattern: row.format_pattern
    }));
  }

  /**
   * Get merge fields grouped by category
   */
  async getMergeFieldsByCategory(organizationId?: string): Promise<Record<string, MergeFieldInfo[]>> {
    const fields = await this.getMergeFields(organizationId);
    const grouped: Record<string, MergeFieldInfo[]> = {};

    for (const field of fields) {
      if (!grouped[field.category]) {
        grouped[field.category] = [];
      }
      grouped[field.category].push(field);
    }

    return grouped;
  }

  /**
   * Register a custom merge field for an organization
   */
  async registerCustomMergeField(
    organizationId: string,
    field: {
      key: string;
      label: string;
      category: string;
      description?: string;
      dataType?: string;
    }
  ): Promise<MergeFieldInfo> {
    const result = await db.query(
      `INSERT INTO crm_merge_field_registry (
        field_key, field_label, field_category, description, data_type,
        is_system, organization_id
      ) VALUES ($1, $2, $3, $4, $5, FALSE, $6)
      ON CONFLICT (field_key) DO UPDATE SET
        field_label = EXCLUDED.field_label,
        description = EXCLUDED.description
      RETURNING *`,
      [
        field.key,
        field.label,
        field.category,
        field.description || null,
        field.dataType || 'text',
        organizationId
      ]
    );

    return {
      key: result.rows[0].field_key,
      label: result.rows[0].field_label,
      category: result.rows[0].field_category,
      description: result.rows[0].description,
      data_type: result.rows[0].data_type
    };
  }

  // =============================================
  // Stage Document Requirements
  // =============================================

  /**
   * Get document requirements for a pipeline stage
   */
  async getStageRequirements(
    stageId: string,
    organizationId: string
  ): Promise<StageDocumentRequirement[]> {
    const result = await db.query(
      `SELECT sdr.*, dt.name as template_name, dt.category as template_category
       FROM crm_stage_document_requirements sdr
       LEFT JOIN crm_document_templates dt ON sdr.template_id = dt.id
       WHERE sdr.stage_id = $1 AND sdr.organization_id = $2
       ORDER BY sdr.order_index`,
      [stageId, organizationId]
    );

    return result.rows.map(row => ({
      id: row.id,
      organization_id: row.organization_id,
      pipeline_id: row.pipeline_id,
      stage_id: row.stage_id,
      template_id: row.template_id,
      template_name: row.template_name,
      template_category: row.template_category,
      document_type: row.document_type,
      document_name: row.document_name,
      is_required: row.is_required,
      is_blocking: row.is_blocking,
      order_index: row.order_index,
      instructions: row.instructions,
      created_at: row.created_at
    }));
  }

  /**
   * Add document requirement to a stage
   */
  async addStageRequirement(
    organizationId: string,
    pipelineId: string,
    stageId: string,
    input: {
      templateId?: string;
      documentType?: string;
      documentName: string;
      isRequired?: boolean;
      isBlocking?: boolean;
      instructions?: string;
    },
    createdBy: string
  ): Promise<StageDocumentRequirement> {
    // Get max order_index
    const orderResult = await db.query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
       FROM crm_stage_document_requirements
       WHERE stage_id = $1`,
      [stageId]
    );
    const orderIndex = orderResult.rows[0]?.next_order || 0;

    const result = await db.query(
      `INSERT INTO crm_stage_document_requirements (
        organization_id, pipeline_id, stage_id, template_id,
        document_type, document_name, is_required, is_blocking,
        order_index, instructions, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        organizationId,
        pipelineId,
        stageId,
        input.templateId || null,
        input.documentType || null,
        input.documentName,
        input.isRequired !== false,
        input.isBlocking || false,
        orderIndex,
        input.instructions || null,
        createdBy
      ]
    );

    logger.info({ stageId, documentName: input.documentName }, 'Stage document requirement added');
    return this.mapStageRequirement(result.rows[0]);
  }

  /**
   * Remove stage requirement
   */
  async removeStageRequirement(requirementId: string, organizationId: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM crm_stage_document_requirements
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [requirementId, organizationId]
    );
    return result.rows.length > 0;
  }

  private mapStageRequirement(row: any): StageDocumentRequirement {
    return {
      id: row.id,
      organization_id: row.organization_id,
      pipeline_id: row.pipeline_id,
      stage_id: row.stage_id,
      template_id: row.template_id,
      template_name: row.template_name,
      template_category: row.template_category,
      document_type: row.document_type,
      document_name: row.document_name,
      is_required: row.is_required,
      is_blocking: row.is_blocking,
      order_index: row.order_index,
      instructions: row.instructions,
      created_at: row.created_at
    };
  }

  // =============================================
  // Template Categories
  // =============================================

  /**
   * Get all template categories with counts
   */
  async getCategories(organizationId: string): Promise<{ category: string; count: number }[]> {
    const result = await db.query(
      `SELECT category, COUNT(*) as count
       FROM crm_document_templates
       WHERE (organization_id = $1 OR is_shared = TRUE OR is_system_template = TRUE)
         AND status = 'active'
       GROUP BY category
       ORDER BY count DESC`,
      [organizationId]
    );

    return result.rows.map(row => ({
      category: row.category,
      count: parseInt(row.count, 10)
    }));
  }

  // =============================================
  // Seed Templates
  // =============================================

  /**
   * Seed Ghana document templates for an organization
   */
  async seedGhanaTemplates(organizationId: string, createdBy: string): Promise<number> {
    const result = await db.query(
      'SELECT seed_ghana_document_templates($1, $2) as count',
      [organizationId, createdBy]
    );
    return result.rows[0]?.count || 0;
  }

  // =============================================
  // Private Helpers
  // =============================================

  private mapRow(row: any): DocumentTemplate & { template_name: string; template_description: string | null } {
    return {
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      template_name: row.name,
      category: row.category,
      description: row.description,
      template_description: row.description,
      template_html: row.template_html,
      template_pdf_url: row.template_pdf_url,
      merge_fields: typeof row.merge_fields === 'string' 
        ? JSON.parse(row.merge_fields) 
        : row.merge_fields || [],
      signature_fields: typeof row.signature_fields === 'string'
        ? JSON.parse(row.signature_fields)
        : row.signature_fields || [],
      signer_roles: typeof row.signer_roles === 'string'
        ? JSON.parse(row.signer_roles)
        : row.signer_roles || [],
      is_system_template: row.is_system_template,
      is_shared: row.is_shared,
      status: row.status,
      version: row.version,
      use_count: row.use_count,
      last_used_at: row.last_used_at,
      ghana_legal_requirements: row.ghana_legal_requirements,
      requires_stamp_duty: row.requires_stamp_duty,
      requires_notarization: row.requires_notarization,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

// =============================================
// Additional Types
// =============================================

export interface StageDocumentRequirement {
  id: string;
  organization_id: string;
  pipeline_id: string;
  stage_id: string;
  template_id?: string;
  template_name?: string;
  template_category?: string;
  document_type?: string;
  document_name: string;
  is_required: boolean;
  is_blocking: boolean;
  order_index: number;
  instructions?: string;
  created_at: Date;
}

// =============================================
// Export Singleton
// =============================================

export const crmDocumentTemplateService = new CrmDocumentTemplateService();
export default crmDocumentTemplateService;
