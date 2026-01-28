/**
 * Checklist Template Service
 * 
 * Phase 3.3: Split qualityChecklistsService
 * 
 * Manages checklist templates, sections, and items.
 * Focused on template CRUD and configuration.
 * 
 * @module services/project-management/quality/ChecklistTemplateService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { UUID } from '../types';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export type ChecklistTemplateType = 
  | 'pre_construction' 
  | 'rough_in' 
  | 'pre_drywall' 
  | 'finish' 
  | 'substantial' 
  | 'final' 
  | 'turnover' 
  | 'safety' 
  | 'daily' 
  | 'weekly' 
  | 'monthly' 
  | 'warranty' 
  | 'custom';

export type ChecklistResponseType = 
  | 'pass_fail' 
  | 'yes_no' 
  | 'yes_no_na' 
  | 'rating' 
  | 'numeric' 
  | 'text' 
  | 'photo_required' 
  | 'measurement' 
  | 'multi_select' 
  | 'single_select' 
  | 'date' 
  | 'signature';

export interface TemplateCreateInput {
  organizationId: UUID;
  categoryId?: UUID;
  name: string;
  code?: string;
  description?: string;
  templateType?: ChecklistTemplateType;
  applicableTrades?: string[];
  applicablePhases?: string[];
  applicableUnitTypes?: string[];
  requiresSignature?: boolean;
  requiresPhoto?: boolean;
  allowPartialSave?: boolean;
  enforceSequence?: boolean;
  passThreshold?: number;
  scoringEnabled?: boolean;
  maxScore?: number;
  passingScore?: number;
  notifyOnFail?: boolean;
  notifyOnComplete?: boolean;
  notifyRecipients?: any[];
  referenceStandards?: string[];
  referenceDocuments?: any[];
  createdBy: UUID;
}

export interface TemplateSectionInput {
  templateId: UUID;
  name: string;
  description?: string;
  displayOrder?: number;
  isRequired?: boolean;
  isRepeatable?: boolean;
  repeatFor?: string;
  conditionLogic?: any;
}

export interface TemplateItemInput {
  templateId: UUID;
  sectionId?: UUID;
  itemNumber?: string;
  question: string;
  description?: string;
  responseType?: ChecklistResponseType;
  responseOptions?: any[];
  validationRules?: any;
  defaultValue?: string;
  displayOrder?: number;
  isRequired?: boolean;
  photoRequiredOn?: string;
  minPhotos?: number;
  maxPhotos?: number;
  points?: number;
  weight?: number;
  isCritical?: boolean;
  dependsOnItemId?: UUID;
  dependsOnValue?: string;
  showCondition?: any;
  referenceCode?: string;
  referenceNotes?: string;
  aiDetectionEnabled?: boolean;
  aiDetectionType?: string;
}

export interface TemplateFilters {
  organizationId?: UUID;
  categoryId?: UUID;
  templateType?: ChecklistTemplateType;
  isPublished?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ChecklistTemplate {
  id: UUID;
  organizationId: UUID;
  categoryId?: UUID;
  name: string;
  code?: string;
  description?: string;
  templateType: ChecklistTemplateType;
  version: number;
  isPublished: boolean;
  publishedAt?: Date;
  publishedBy?: UUID;
  itemCount: number;
  estimatedDuration?: number;
  requiresSignature: boolean;
  requiresPhoto: boolean;
  passThreshold?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateSection {
  id: UUID;
  templateId: UUID;
  name: string;
  description?: string;
  displayOrder: number;
  isRequired: boolean;
  itemCount: number;
}

export interface TemplateItem {
  id: UUID;
  templateId: UUID;
  sectionId?: UUID;
  itemNumber?: string;
  question: string;
  description?: string;
  responseType: ChecklistResponseType;
  responseOptions?: any[];
  displayOrder: number;
  isRequired: boolean;
  isCritical: boolean;
  points?: number;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ChecklistTemplateServiceImpl extends BaseService {
  constructor() {
    super('ChecklistTemplateService');
  }

  // ==========================================================================
  // CATEGORY MANAGEMENT
  // ==========================================================================

  async getCategories(organizationId?: UUID): Promise<any[]> {
    let query = `SELECT * FROM qc_checklist_categories WHERE deleted_at IS NULL`;
    const params: any[] = [];
    
    if (organizationId) {
      query += ` AND (organization_id = $1 OR organization_id IS NULL)`;
      params.push(organizationId);
    }
    
    query += ` ORDER BY name ASC`;
    
    const result = await this.query(query, params);
    return result.rows;
  }

  async createCategory(
    name: string,
    description: string,
    organizationId?: UUID,
    createdBy?: UUID
  ): Promise<any> {
    const result = await this.query(
      `INSERT INTO qc_checklist_categories (
         name, description, organization_id, created_by
       ) VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description, organizationId, createdBy]
    );
    return result.rows[0];
  }

  // ==========================================================================
  // TEMPLATE CRUD
  // ==========================================================================

  async createTemplate(input: TemplateCreateInput): Promise<ChecklistTemplate> {
    const code = input.code || this.generateTemplateCode(input.templateType);
    
    const result = await this.query(
      `INSERT INTO qc_checklist_templates (
         organization_id, category_id, name, code, description,
         template_type, applicable_trades, applicable_phases, applicable_unit_types,
         requires_signature, requires_photo, allow_partial_save, enforce_sequence,
         pass_threshold, scoring_enabled, max_score, passing_score,
         notify_on_fail, notify_on_complete, notify_recipients,
         reference_standards, reference_documents, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
       )
       RETURNING *`,
      [
        input.organizationId, input.categoryId, input.name, code, input.description,
        input.templateType || 'custom',
        input.applicableTrades ? JSON.stringify(input.applicableTrades) : null,
        input.applicablePhases ? JSON.stringify(input.applicablePhases) : null,
        input.applicableUnitTypes ? JSON.stringify(input.applicableUnitTypes) : null,
        input.requiresSignature ?? false, input.requiresPhoto ?? false,
        input.allowPartialSave ?? true, input.enforceSequence ?? false,
        input.passThreshold, input.scoringEnabled ?? false,
        input.maxScore, input.passingScore,
        input.notifyOnFail ?? false, input.notifyOnComplete ?? false,
        input.notifyRecipients ? JSON.stringify(input.notifyRecipients) : null,
        input.referenceStandards ? JSON.stringify(input.referenceStandards) : null,
        input.referenceDocuments ? JSON.stringify(input.referenceDocuments) : null,
        input.createdBy
      ]
    );
    
    return this.mapTemplateRow(result.rows[0]);
  }

  async getTemplateById(id: UUID): Promise<ChecklistTemplate | null> {
    const result = await this.query(
      `SELECT * FROM qc_checklist_templates WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ? this.mapTemplateRow(result.rows[0]) : null;
  }

  async getTemplateFull(id: UUID): Promise<any | null> {
    const template = await this.getTemplateById(id);
    if (!template) return null;

    const [sections, items] = await Promise.all([
      this.getSections(id),
      this.getItems(id),
    ]);

    return { ...template, sections, items };
  }

  async getTemplates(filters: TemplateFilters): Promise<{ templates: ChecklistTemplate[]; total: number }> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      conditions.push(`organization_id = $${paramIndex++}`);
      params.push(filters.organizationId);
    }

    if (filters.categoryId) {
      conditions.push(`category_id = $${paramIndex++}`);
      params.push(filters.categoryId);
    }

    if (filters.templateType) {
      conditions.push(`template_type = $${paramIndex++}`);
      params.push(filters.templateType);
    }

    if (filters.isPublished !== undefined) {
      conditions.push(`is_published = $${paramIndex++}`);
      params.push(filters.isPublished);
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR code ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.query(
        `SELECT * FROM qc_checklist_templates 
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM qc_checklist_templates WHERE ${whereClause}`,
        params
      ),
    ]);

    return {
      templates: dataResult.rows.map(this.mapTemplateRow),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async updateTemplate(
    id: UUID,
    input: Partial<TemplateCreateInput>,
    updatedBy: UUID
  ): Promise<ChecklistTemplate | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      code: 'code',
      description: 'description',
      categoryId: 'category_id',
      templateType: 'template_type',
      requiresSignature: 'requires_signature',
      requiresPhoto: 'requires_photo',
      allowPartialSave: 'allow_partial_save',
      enforceSequence: 'enforce_sequence',
      passThreshold: 'pass_threshold',
      scoringEnabled: 'scoring_enabled',
      maxScore: 'max_score',
      passingScore: 'passing_score',
      notifyOnFail: 'notify_on_fail',
      notifyOnComplete: 'notify_on_complete',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in input) {
        updates.push(`${column} = $${paramIndex++}`);
        params.push((input as any)[key]);
      }
    }

    // Handle JSON fields
    if (input.applicableTrades) {
      updates.push(`applicable_trades = $${paramIndex++}`);
      params.push(JSON.stringify(input.applicableTrades));
    }

    if (input.notifyRecipients) {
      updates.push(`notify_recipients = $${paramIndex++}`);
      params.push(JSON.stringify(input.notifyRecipients));
    }

    if (updates.length === 0) {
      return this.getTemplateById(id);
    }

    updates.push(`updated_by = $${paramIndex++}`);
    params.push(updatedBy);
    
    updates.push(`updated_at = NOW()`);
    
    params.push(id);

    const result = await this.query(
      `UPDATE qc_checklist_templates 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      params
    );

    return result.rows[0] ? this.mapTemplateRow(result.rows[0]) : null;
  }

  async publishTemplate(id: UUID, publishedBy: UUID): Promise<ChecklistTemplate | null> {
    const result = await this.query(
      `UPDATE qc_checklist_templates
       SET is_published = true, published_at = NOW(), published_by = $2,
           version = version + 1, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, publishedBy]
    );
    return result.rows[0] ? this.mapTemplateRow(result.rows[0]) : null;
  }

  async duplicateTemplate(id: UUID, newName: string, createdBy: UUID): Promise<ChecklistTemplate> {
    const original = await this.getTemplateFull(id);
    if (!original) {
      throw new Error(`Template not found: ${id}`);
    }

    // Create new template
    const newTemplate = await this.createTemplate({
      ...original,
      name: newName,
      code: undefined, // Generate new code
      createdBy,
    });

    // Copy sections and items
    await this.copyTemplateSections(id, newTemplate.id);

    return newTemplate;
  }

  async deleteTemplate(id: UUID): Promise<boolean> {
    const result = await this.query(
      `UPDATE qc_checklist_templates SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ==========================================================================
  // SECTION MANAGEMENT
  // ==========================================================================

  async addSection(input: TemplateSectionInput): Promise<TemplateSection> {
    // Get max order
    const orderResult = await this.query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 as next_order 
       FROM qc_template_sections WHERE template_id = $1`,
      [input.templateId]
    );
    const displayOrder = input.displayOrder ?? orderResult.rows[0].next_order;

    const result = await this.query(
      `INSERT INTO qc_template_sections (
         template_id, name, description, display_order, is_required,
         is_repeatable, repeat_for, condition_logic
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.templateId, input.name, input.description, displayOrder,
        input.isRequired ?? true, input.isRepeatable ?? false,
        input.repeatFor, input.conditionLogic ? JSON.stringify(input.conditionLogic) : null
      ]
    );

    return this.mapSectionRow(result.rows[0]);
  }

  async getSections(templateId: UUID): Promise<TemplateSection[]> {
    const result = await this.query(
      `SELECT s.*, 
         (SELECT COUNT(*) FROM qc_template_items WHERE section_id = s.id) as item_count
       FROM qc_template_sections s
       WHERE s.template_id = $1 AND s.deleted_at IS NULL
       ORDER BY s.display_order ASC`,
      [templateId]
    );
    return result.rows.map(this.mapSectionRow);
  }

  async updateSection(id: UUID, updates: Partial<TemplateSectionInput>): Promise<TemplateSection | null> {
    const sets: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }
    if (updates.displayOrder !== undefined) {
      sets.push(`display_order = $${paramIndex++}`);
      params.push(updates.displayOrder);
    }
    if (updates.isRequired !== undefined) {
      sets.push(`is_required = $${paramIndex++}`);
      params.push(updates.isRequired);
    }

    if (sets.length === 0) return null;

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.query(
      `UPDATE qc_template_sections SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0] ? this.mapSectionRow(result.rows[0]) : null;
  }

  async deleteSection(id: UUID): Promise<boolean> {
    const result = await this.query(
      `UPDATE qc_template_sections SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ==========================================================================
  // ITEM MANAGEMENT
  // ==========================================================================

  async addItem(input: TemplateItemInput): Promise<TemplateItem> {
    // Get max order
    const orderResult = await this.query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 as next_order 
       FROM qc_template_items WHERE template_id = $1`,
      [input.templateId]
    );
    const displayOrder = input.displayOrder ?? orderResult.rows[0].next_order;

    const result = await this.query(
      `INSERT INTO qc_template_items (
         template_id, section_id, item_number, question, description,
         response_type, response_options, validation_rules, default_value,
         display_order, is_required, photo_required_on, min_photos, max_photos,
         points, weight, is_critical, depends_on_item_id, depends_on_value,
         show_condition, reference_code, reference_notes, ai_detection_enabled, ai_detection_type
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
       )
       RETURNING *`,
      [
        input.templateId, input.sectionId, input.itemNumber, input.question, input.description,
        input.responseType || 'pass_fail',
        input.responseOptions ? JSON.stringify(input.responseOptions) : null,
        input.validationRules ? JSON.stringify(input.validationRules) : null,
        input.defaultValue, displayOrder, input.isRequired ?? true,
        input.photoRequiredOn, input.minPhotos, input.maxPhotos,
        input.points, input.weight, input.isCritical ?? false,
        input.dependsOnItemId, input.dependsOnValue,
        input.showCondition ? JSON.stringify(input.showCondition) : null,
        input.referenceCode, input.referenceNotes,
        input.aiDetectionEnabled ?? false, input.aiDetectionType
      ]
    );

    // Update template item count
    await this.query(
      `UPDATE qc_checklist_templates 
       SET item_count = (SELECT COUNT(*) FROM qc_template_items WHERE template_id = $1)
       WHERE id = $1`,
      [input.templateId]
    );

    return this.mapItemRow(result.rows[0]);
  }

  async addItemsBulk(templateId: UUID, items: Omit<TemplateItemInput, 'templateId'>[]): Promise<TemplateItem[]> {
    const results: TemplateItem[] = [];
    
    for (const item of items) {
      const result = await this.addItem({ ...item, templateId });
      results.push(result);
    }
    
    return results;
  }

  async getItems(templateId: UUID, sectionId?: UUID): Promise<TemplateItem[]> {
    let query = `SELECT * FROM qc_template_items WHERE template_id = $1 AND deleted_at IS NULL`;
    const params: any[] = [templateId];

    if (sectionId) {
      query += ` AND section_id = $2`;
      params.push(sectionId);
    }

    query += ` ORDER BY display_order ASC`;

    const result = await this.query(query, params);
    return result.rows.map(this.mapItemRow);
  }

  async updateItem(id: UUID, updates: Partial<TemplateItemInput>): Promise<TemplateItem | null> {
    const sets: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      sectionId: 'section_id',
      itemNumber: 'item_number',
      question: 'question',
      description: 'description',
      responseType: 'response_type',
      displayOrder: 'display_order',
      isRequired: 'is_required',
      isCritical: 'is_critical',
      points: 'points',
      weight: 'weight',
      referenceCode: 'reference_code',
      referenceNotes: 'reference_notes',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in updates) {
        sets.push(`${column} = $${paramIndex++}`);
        params.push((updates as any)[key]);
      }
    }

    if (updates.responseOptions) {
      sets.push(`response_options = $${paramIndex++}`);
      params.push(JSON.stringify(updates.responseOptions));
    }

    if (sets.length === 0) return null;

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.query(
      `UPDATE qc_template_items SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0] ? this.mapItemRow(result.rows[0]) : null;
  }

  async deleteItem(id: UUID): Promise<boolean> {
    const result = await this.query(
      `UPDATE qc_template_items SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async reorderItems(templateId: UUID, itemOrders: { id: UUID; order: number }[]): Promise<void> {
    for (const { id, order } of itemOrders) {
      await this.query(
        `UPDATE qc_template_items SET display_order = $2 WHERE id = $1 AND template_id = $3`,
        [id, order, templateId]
      );
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private generateTemplateCode(type?: ChecklistTemplateType): string {
    const prefix = type ? type.substring(0, 3).toUpperCase() : 'CKL';
    const timestamp = Date.now().toString(36).toUpperCase();
    return `${prefix}-${timestamp}`;
  }

  private async copyTemplateSections(fromTemplateId: UUID, toTemplateId: UUID): Promise<void> {
    const sections = await this.getSections(fromTemplateId);
    const sectionIdMap = new Map<UUID, UUID>();

    for (const section of sections) {
      const newSection = await this.addSection({
        templateId: toTemplateId,
        name: section.name,
        description: section.description,
        displayOrder: section.displayOrder,
        isRequired: section.isRequired,
      });
      sectionIdMap.set(section.id, newSection.id);
    }

    // Copy items
    const items = await this.getItems(fromTemplateId);
    for (const item of items) {
      await this.addItem({
        templateId: toTemplateId,
        sectionId: item.sectionId ? sectionIdMap.get(item.sectionId) : undefined,
        itemNumber: item.itemNumber,
        question: item.question,
        description: item.description,
        responseType: item.responseType,
        responseOptions: item.responseOptions,
        displayOrder: item.displayOrder,
        isRequired: item.isRequired,
        isCritical: item.isCritical,
        points: item.points,
      });
    }
  }

  private mapTemplateRow(row: any): ChecklistTemplate {
    return {
      id: row.id,
      organizationId: row.organization_id,
      categoryId: row.category_id,
      name: row.name,
      code: row.code,
      description: row.description,
      templateType: row.template_type,
      version: row.version || 1,
      isPublished: row.is_published,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      publishedBy: row.published_by,
      itemCount: parseInt(row.item_count, 10) || 0,
      estimatedDuration: row.estimated_duration_minutes,
      requiresSignature: row.requires_signature,
      requiresPhoto: row.requires_photo,
      passThreshold: row.pass_threshold,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapSectionRow(row: any): TemplateSection {
    return {
      id: row.id,
      templateId: row.template_id,
      name: row.name,
      description: row.description,
      displayOrder: row.display_order,
      isRequired: row.is_required,
      itemCount: parseInt(row.item_count, 10) || 0,
    };
  }

  private mapItemRow(row: any): TemplateItem {
    return {
      id: row.id,
      templateId: row.template_id,
      sectionId: row.section_id,
      itemNumber: row.item_number,
      question: row.question,
      description: row.description,
      responseType: row.response_type,
      responseOptions: row.response_options,
      displayOrder: row.display_order,
      isRequired: row.is_required,
      isCritical: row.is_critical,
      points: row.points,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const checklistTemplateService = new ChecklistTemplateServiceImpl();
