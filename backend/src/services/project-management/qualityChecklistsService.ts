/**
 * Quality Checklists Service
 * Phase 3A Week 4 - Configurable QC Inspection Templates & Digital Signatures
 * 
 * Features:
 * - Template management with sections and items
 * - Checklist instance execution
 * - Response collection with photo support
 * - Digital signature capture
 * - Scoring and pass/fail determination
 * - Offline sync support
 * 
 * @deprecated This god file (1551 lines) has been split into focused services.
 * Use the new modular services in ./quality/:
 * - checklistTemplateService: Template, section, and item management
 * - checklistInspectionService: Instance lifecycle and workflow
 * - checklistResponseService: Responses, signatures, and deficiencies
 * 
 * Import from './quality' instead of using this file directly.
 * This file is kept for backwards compatibility only.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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

export type ChecklistStatus = 
  | 'draft' 
  | 'in_progress' 
  | 'pending_review' 
  | 'approved' 
  | 'rejected' 
  | 'requires_reinspection' 
  | 'completed' 
  | 'archived';

export type ChecklistItemResult = 'pass' | 'fail' | 'na' | 'pending' | 'deferred';

export interface TemplateCreateInput {
  organizationId: string;
  categoryId?: string;
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
  createdBy: string;
}

export interface TemplateSectionInput {
  templateId: string;
  name: string;
  description?: string;
  displayOrder?: number;
  isRequired?: boolean;
  isRepeatable?: boolean;
  repeatFor?: string;
  conditionLogic?: any;
}

export interface TemplateItemInput {
  templateId: string;
  sectionId?: string;
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
  dependsOnItemId?: string;
  dependsOnValue?: string;
  showCondition?: any;
  referenceCode?: string;
  referenceNotes?: string;
  aiDetectionEnabled?: boolean;
  aiDetectionType?: string;
}

export interface InstanceCreateInput {
  templateId: string;
  organizationId: string;
  projectId?: string;
  unitId?: string;
  locationDescription?: string;
  title?: string;
  description?: string;
  scheduledDate?: string;
  dueDate?: string;
  assignedTo?: string;
  assignedBy?: string;
  inspectorName?: string;
  inspectorCompany?: string;
  weatherConditions?: any;
  offlineId?: string;
  deviceId?: string;
  createdBy: string;
}

export interface ResponseInput {
  instanceId: string;
  templateItemId: string;
  responseValue?: string;
  result?: ChecklistItemResult;
  numericValue?: number;
  unitOfMeasure?: string;
  notes?: string;
  internalNotes?: string;
  photos?: any[];
  respondedBy: string;
  offlineId?: string;
}

export interface SignatureInput {
  instanceId: string;
  signerId?: string;
  signerName: string;
  signerTitle?: string;
  signerCompany?: string;
  signerEmail?: string;
  signerRole: string;
  signatureType: 'drawn' | 'typed' | 'digital_certificate';
  signatureData: string;
  signOffType?: string;
  statement?: string;
  ipAddress?: string;
  deviceInfo?: any;
  locationData?: any;
  certificateId?: string;
  certificateIssuer?: string;
  certificateValidUntil?: string;
}

export interface TemplateFilters {
  organizationId?: string;
  categoryId?: string;
  templateType?: ChecklistTemplateType;
  isPublished?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface InstanceFilters {
  organizationId?: string;
  projectId?: string;
  unitId?: string;
  templateId?: string;
  status?: ChecklistStatus | ChecklistStatus[];
  overallResult?: ChecklistItemResult;
  assignedTo?: string;
  fromDate?: string;
  toDate?: string;
  overdue?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// QUALITY CHECKLISTS SERVICE
// ============================================================================

export class QualityChecklistsService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // --------------------------------------------------------------------------
  // CATEGORIES
  // --------------------------------------------------------------------------

  async getCategories(organizationId?: string): Promise<any[]> {
    const query = `
      SELECT * FROM checklist_categories
      WHERE (organization_id IS NULL OR organization_id = $1) AND is_active = true
      ORDER BY display_order, name
    `;
    const result = await this.pool.query(query, [organizationId]);
    return result.rows;
  }

  async createCategory(
    name: string,
    organizationId?: string,
    description?: string,
    icon?: string,
    color?: string
  ): Promise<any> {
    const id = uuidv4();
    const query = `
      INSERT INTO checklist_categories (id, organization_id, name, description, icon, color)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await this.pool.query(query, [id, organizationId, name, description, icon, color]);
    return result.rows[0];
  }

  // --------------------------------------------------------------------------
  // TEMPLATES
  // --------------------------------------------------------------------------

  async createTemplate(input: TemplateCreateInput): Promise<any> {
    const id = uuidv4();
    
    const query = `
      INSERT INTO checklist_templates (
        id, organization_id, category_id, name, code, description, template_type,
        applicable_trades, applicable_phases, applicable_unit_types,
        requires_signature, requires_photo, allow_partial_save, enforce_sequence,
        pass_threshold, scoring_enabled, max_score, passing_score,
        notify_on_fail, notify_on_complete, notify_recipients,
        reference_standards, reference_documents, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
      )
      RETURNING *
    `;

    const values = [
      id,
      input.organizationId,
      input.categoryId || null,
      input.name,
      input.code || null,
      input.description || null,
      input.templateType || 'custom',
      input.applicableTrades || [],
      input.applicablePhases || [],
      input.applicableUnitTypes || [],
      input.requiresSignature || false,
      input.requiresPhoto || false,
      input.allowPartialSave !== false,
      input.enforceSequence || false,
      input.passThreshold || 100,
      input.scoringEnabled || false,
      input.maxScore || null,
      input.passingScore || null,
      input.notifyOnFail !== false,
      input.notifyOnComplete !== false,
      JSON.stringify(input.notifyRecipients || []),
      input.referenceStandards || [],
      JSON.stringify(input.referenceDocuments || []),
      input.createdBy
    ];

    const result = await this.pool.query(query, values);
    
    await this.logActivity(null, id, 'template_created', 'Template created', input.createdBy, {});

    return this.formatTemplate(result.rows[0]);
  }

  async getTemplateById(id: string): Promise<any | null> {
    const query = `SELECT * FROM checklist_template_overview WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    
    return this.formatTemplate(result.rows[0]);
  }

  async getTemplateFull(id: string): Promise<any | null> {
    const query = `SELECT get_checklist_template_full($1) as data`;
    const result = await this.pool.query(query, [id]);
    
    if (!result.rows[0]?.data) return null;
    
    return result.rows[0].data;
  }

  async getTemplates(filters: TemplateFilters): Promise<{ templates: any[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      conditions.push(`(organization_id = $${paramIndex++} OR is_global = true)`);
      values.push(filters.organizationId);
    }

    if (filters.categoryId) {
      conditions.push(`category_id = $${paramIndex++}`);
      values.push(filters.categoryId);
    }

    if (filters.templateType) {
      conditions.push(`template_type = $${paramIndex++}`);
      values.push(filters.templateType);
    }

    if (filters.isPublished !== undefined) {
      conditions.push(`is_published = $${paramIndex++}`);
      values.push(filters.isPublished);
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR code ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const countQuery = `SELECT COUNT(*) as total FROM checklist_template_overview ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    const query = `
      SELECT * FROM checklist_template_overview
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(pageSize, offset);

    const result = await this.pool.query(query, values);

    return {
      templates: result.rows.map(row => this.formatTemplate(row)),
      total
    };
  }

  async updateTemplate(id: string, input: Partial<TemplateCreateInput>, updatedBy: string): Promise<any | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      code: 'code',
      description: 'description',
      templateType: 'template_type',
      categoryId: 'category_id',
      requiresSignature: 'requires_signature',
      requiresPhoto: 'requires_photo',
      allowPartialSave: 'allow_partial_save',
      enforceSequence: 'enforce_sequence',
      passThreshold: 'pass_threshold',
      scoringEnabled: 'scoring_enabled',
      maxScore: 'max_score',
      passingScore: 'passing_score',
      notifyOnFail: 'notify_on_fail',
      notifyOnComplete: 'notify_on_complete'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((input as any)[key] !== undefined) {
        updates.push(`${column} = $${paramIndex++}`);
        values.push((input as any)[key]);
      }
    }

    if (input.applicableTrades) {
      updates.push(`applicable_trades = $${paramIndex++}`);
      values.push(input.applicableTrades);
    }

    if (input.referenceStandards) {
      updates.push(`reference_standards = $${paramIndex++}`);
      values.push(input.referenceStandards);
    }

    if (input.notifyRecipients) {
      updates.push(`notify_recipients = $${paramIndex++}`);
      values.push(JSON.stringify(input.notifyRecipients));
    }

    if (updates.length === 0) {
      return this.getTemplateById(id);
    }

    values.push(id);

    const query = `
      UPDATE checklist_templates
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) return null;

    await this.logActivity(null, id, 'template_updated', 'Template updated', updatedBy, {});

    return this.formatTemplate(result.rows[0]);
  }

  async publishTemplate(id: string, publishedBy: string): Promise<any | null> {
    const query = `
      UPDATE checklist_templates
      SET is_published = true, published_at = CURRENT_TIMESTAMP, published_by = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [publishedBy, id]);
    
    if (result.rows.length === 0) return null;

    await this.logActivity(null, id, 'template_published', 'Template published', publishedBy, {});

    return this.formatTemplate(result.rows[0]);
  }

  async duplicateTemplate(id: string, newName: string, createdBy: string): Promise<any> {
    // Get original template
    const original = await this.getTemplateFull(id);
    if (!original) throw new Error('Template not found');

    const template = original.template;
    const newId = uuidv4();

    // Create new template
    const insertQuery = `
      INSERT INTO checklist_templates (
        id, organization_id, category_id, name, code, description, template_type,
        applicable_trades, applicable_phases, applicable_unit_types,
        requires_signature, requires_photo, allow_partial_save, enforce_sequence,
        pass_threshold, scoring_enabled, max_score, passing_score,
        notify_on_fail, notify_on_complete, notify_recipients,
        reference_standards, reference_documents, created_by
      )
      SELECT 
        $1, organization_id, category_id, $2, NULL, description, template_type,
        applicable_trades, applicable_phases, applicable_unit_types,
        requires_signature, requires_photo, allow_partial_save, enforce_sequence,
        pass_threshold, scoring_enabled, max_score, passing_score,
        notify_on_fail, notify_on_complete, notify_recipients,
        reference_standards, reference_documents, $3
      FROM checklist_templates WHERE id = $4
      RETURNING *
    `;

    const result = await this.pool.query(insertQuery, [newId, newName, createdBy, id]);

    // Copy sections and items
    await this.copyTemplateSections(id, newId);

    return this.formatTemplate(result.rows[0]);
  }

  private async copyTemplateSections(fromTemplateId: string, toTemplateId: string): Promise<void> {
    // Get sections
    const sectionsQuery = `SELECT * FROM checklist_template_sections WHERE template_id = $1`;
    const sections = await this.pool.query(sectionsQuery, [fromTemplateId]);

    const sectionIdMap: Record<string, string> = {};

    for (const section of sections.rows) {
      const newSectionId = uuidv4();
      sectionIdMap[section.id] = newSectionId;

      await this.pool.query(`
        INSERT INTO checklist_template_sections (id, template_id, name, description, display_order, is_required, is_repeatable, repeat_for, condition_logic)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [newSectionId, toTemplateId, section.name, section.description, section.display_order, section.is_required, section.is_repeatable, section.repeat_for, section.condition_logic]);
    }

    // Get items
    const itemsQuery = `SELECT * FROM checklist_template_items WHERE template_id = $1`;
    const items = await this.pool.query(itemsQuery, [fromTemplateId]);

    for (const item of items.rows) {
      const newSectionId = item.section_id ? sectionIdMap[item.section_id] : null;

      await this.pool.query(`
        INSERT INTO checklist_template_items (
          id, template_id, section_id, item_number, question, description,
          response_type, response_options, validation_rules, default_value,
          display_order, is_required, photo_required_on, min_photos, max_photos,
          points, weight, is_critical, reference_code, reference_notes,
          ai_detection_enabled, ai_detection_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      `, [
        uuidv4(), toTemplateId, newSectionId, item.item_number, item.question, item.description,
        item.response_type, item.response_options, item.validation_rules, item.default_value,
        item.display_order, item.is_required, item.photo_required_on, item.min_photos, item.max_photos,
        item.points, item.weight, item.is_critical, item.reference_code, item.reference_notes,
        item.ai_detection_enabled, item.ai_detection_type
      ]);
    }
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const query = `DELETE FROM checklist_templates WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  // --------------------------------------------------------------------------
  // TEMPLATE SECTIONS
  // --------------------------------------------------------------------------

  async addSection(input: TemplateSectionInput): Promise<any> {
    const id = uuidv4();

    const query = `
      INSERT INTO checklist_template_sections (
        id, template_id, name, description, display_order,
        is_required, is_repeatable, repeat_for, condition_logic
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      id,
      input.templateId,
      input.name,
      input.description || null,
      input.displayOrder || 0,
      input.isRequired !== false,
      input.isRepeatable || false,
      input.repeatFor || null,
      input.conditionLogic ? JSON.stringify(input.conditionLogic) : null
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async getSections(templateId: string): Promise<any[]> {
    const query = `
      SELECT * FROM checklist_template_sections
      WHERE template_id = $1
      ORDER BY display_order
    `;
    const result = await this.pool.query(query, [templateId]);
    return result.rows;
  }

  async updateSection(id: string, updates: Partial<TemplateSectionInput>): Promise<any | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.displayOrder !== undefined) {
      fields.push(`display_order = $${paramIndex++}`);
      values.push(updates.displayOrder);
    }
    if (updates.isRequired !== undefined) {
      fields.push(`is_required = $${paramIndex++}`);
      values.push(updates.isRequired);
    }

    if (fields.length === 0) return null;

    values.push(id);

    const query = `
      UPDATE checklist_template_sections
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async deleteSection(id: string): Promise<boolean> {
    const query = `DELETE FROM checklist_template_sections WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  // --------------------------------------------------------------------------
  // TEMPLATE ITEMS
  // --------------------------------------------------------------------------

  async addItem(input: TemplateItemInput): Promise<any> {
    const id = uuidv4();

    const query = `
      INSERT INTO checklist_template_items (
        id, template_id, section_id, item_number, question, description,
        response_type, response_options, validation_rules, default_value,
        display_order, is_required, photo_required_on, min_photos, max_photos,
        points, weight, is_critical, depends_on_item_id, depends_on_value,
        show_condition, reference_code, reference_notes,
        ai_detection_enabled, ai_detection_type
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
      )
      RETURNING *
    `;

    const values = [
      id,
      input.templateId,
      input.sectionId || null,
      input.itemNumber || null,
      input.question,
      input.description || null,
      input.responseType || 'pass_fail',
      input.responseOptions ? JSON.stringify(input.responseOptions) : null,
      input.validationRules ? JSON.stringify(input.validationRules) : null,
      input.defaultValue || null,
      input.displayOrder || 0,
      input.isRequired !== false,
      input.photoRequiredOn || null,
      input.minPhotos || 0,
      input.maxPhotos || 10,
      input.points || 0,
      input.weight || 1.0,
      input.isCritical || false,
      input.dependsOnItemId || null,
      input.dependsOnValue || null,
      input.showCondition ? JSON.stringify(input.showCondition) : null,
      input.referenceCode || null,
      input.referenceNotes || null,
      input.aiDetectionEnabled || false,
      input.aiDetectionType || null
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async addItemsBulk(templateId: string, items: Omit<TemplateItemInput, 'templateId'>[]): Promise<any[]> {
    const client = await this.pool.connect();
    const createdItems: any[] = [];

    try {
      await client.query('BEGIN');

      for (const item of items) {
        const result = await this.addItem({ ...item, templateId });
        createdItems.push(result);
      }

      await client.query('COMMIT');
      return createdItems;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getItems(templateId: string, sectionId?: string): Promise<any[]> {
    let query = `
      SELECT * FROM checklist_template_items
      WHERE template_id = $1
    `;
    const values: any[] = [templateId];

    if (sectionId) {
      query += ` AND section_id = $2`;
      values.push(sectionId);
    }

    query += ` ORDER BY display_order`;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async updateItem(id: string, updates: Partial<TemplateItemInput>): Promise<any | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      itemNumber: 'item_number',
      question: 'question',
      description: 'description',
      responseType: 'response_type',
      displayOrder: 'display_order',
      isRequired: 'is_required',
      photoRequiredOn: 'photo_required_on',
      minPhotos: 'min_photos',
      maxPhotos: 'max_photos',
      points: 'points',
      weight: 'weight',
      isCritical: 'is_critical',
      referenceCode: 'reference_code',
      referenceNotes: 'reference_notes'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((updates as any)[key] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push((updates as any)[key]);
      }
    }

    if (updates.responseOptions !== undefined) {
      fields.push(`response_options = $${paramIndex++}`);
      values.push(JSON.stringify(updates.responseOptions));
    }

    if (updates.validationRules !== undefined) {
      fields.push(`validation_rules = $${paramIndex++}`);
      values.push(JSON.stringify(updates.validationRules));
    }

    if (fields.length === 0) return null;

    values.push(id);

    const query = `
      UPDATE checklist_template_items
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async deleteItem(id: string): Promise<boolean> {
    const query = `DELETE FROM checklist_template_items WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async reorderItems(templateId: string, itemOrders: { id: string; order: number }[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const item of itemOrders) {
        await client.query(
          `UPDATE checklist_template_items SET display_order = $1 WHERE id = $2 AND template_id = $3`,
          [item.order, item.id, templateId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // --------------------------------------------------------------------------
  // CHECKLIST INSTANCES
  // --------------------------------------------------------------------------

  async createInstance(input: InstanceCreateInput): Promise<any> {
    const id = uuidv4();

    // Get template to set total items
    const templateItems = await this.getItems(input.templateId);
    const totalItems = templateItems.length;

    const query = `
      INSERT INTO checklist_instances (
        id, template_id, organization_id, project_id, unit_id, location_description,
        title, description, scheduled_date, due_date,
        assigned_to, assigned_by, inspector_name, inspector_company,
        weather_conditions, total_items, offline_id, device_id, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      RETURNING *
    `;

    const values = [
      id,
      input.templateId,
      input.organizationId,
      input.projectId || null,
      input.unitId || null,
      input.locationDescription || null,
      input.title || null,
      input.description || null,
      input.scheduledDate || null,
      input.dueDate || null,
      input.assignedTo || null,
      input.assignedBy || null,
      input.inspectorName || null,
      input.inspectorCompany || null,
      input.weatherConditions ? JSON.stringify(input.weatherConditions) : null,
      totalItems,
      input.offlineId || null,
      input.deviceId || null,
      input.createdBy
    ];

    const result = await this.pool.query(query, values);

    // Pre-create response records for all template items
    await this.initializeResponses(id, input.templateId);

    await this.logActivity(id, input.templateId, 'instance_created', 'Checklist instance created', input.createdBy, {});

    return this.formatInstance(result.rows[0]);
  }

  private async initializeResponses(instanceId: string, templateId: string): Promise<void> {
    const items = await this.getItems(templateId);

    for (const item of items) {
      await this.pool.query(`
        INSERT INTO checklist_responses (id, instance_id, template_item_id, result)
        VALUES ($1, $2, $3, 'pending')
      `, [uuidv4(), instanceId, item.id]);
    }
  }

  async getInstanceById(id: string): Promise<any | null> {
    const query = `
      SELECT ci.*, ct.name as template_name, ct.code as template_code
      FROM checklist_instances ci
      JOIN checklist_templates ct ON ci.template_id = ct.id
      WHERE ci.id = $1
    `;

    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    
    return this.formatInstance(result.rows[0]);
  }

  async getInstanceFull(id: string): Promise<any | null> {
    const query = `SELECT get_checklist_instance_full($1) as data`;
    const result = await this.pool.query(query, [id]);
    
    if (!result.rows[0]?.data) return null;
    
    return result.rows[0].data;
  }

  async getInstances(filters: InstanceFilters): Promise<{ instances: any[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      conditions.push(`ci.organization_id = $${paramIndex++}`);
      values.push(filters.organizationId);
    }

    if (filters.projectId) {
      conditions.push(`ci.project_id = $${paramIndex++}`);
      values.push(filters.projectId);
    }

    if (filters.unitId) {
      conditions.push(`ci.unit_id = $${paramIndex++}`);
      values.push(filters.unitId);
    }

    if (filters.templateId) {
      conditions.push(`ci.template_id = $${paramIndex++}`);
      values.push(filters.templateId);
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      conditions.push(`ci.status = ANY($${paramIndex++})`);
      values.push(statuses);
    }

    if (filters.overallResult) {
      conditions.push(`ci.overall_result = $${paramIndex++}`);
      values.push(filters.overallResult);
    }

    if (filters.assignedTo) {
      conditions.push(`ci.assigned_to = $${paramIndex++}`);
      values.push(filters.assignedTo);
    }

    if (filters.fromDate) {
      conditions.push(`ci.scheduled_date >= $${paramIndex++}`);
      values.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`ci.scheduled_date <= $${paramIndex++}`);
      values.push(filters.toDate);
    }

    if (filters.overdue) {
      conditions.push(`ci.due_date < CURRENT_DATE AND ci.status NOT IN ('completed', 'approved')`);
    }

    if (filters.search) {
      conditions.push(`(ci.title ILIKE $${paramIndex} OR ci.instance_number ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const countQuery = `SELECT COUNT(*) as total FROM checklist_instances ci ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    const query = `
      SELECT ci.*, ct.name as template_name, ct.code as template_code
      FROM checklist_instances ci
      JOIN checklist_templates ct ON ci.template_id = ct.id
      ${whereClause}
      ORDER BY ci.scheduled_date DESC NULLS LAST, ci.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    values.push(pageSize, offset);
    const result = await this.pool.query(query, values);

    return {
      instances: result.rows.map(row => this.formatInstance(row)),
      total
    };
  }

  async startInstance(id: string, startedBy: string): Promise<any | null> {
    const query = `
      UPDATE checklist_instances
      SET status = 'in_progress', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'draft'
      RETURNING *
    `;

    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;

    await this.logActivity(id, null, 'instance_started', 'Inspection started', startedBy, {});

    return this.formatInstance(result.rows[0]);
  }

  async updateInstanceStatus(id: string, status: ChecklistStatus, changedBy: string, notes?: string): Promise<any | null> {
    const updates: string[] = ['status = $1', 'status_changed_at = CURRENT_TIMESTAMP', 'status_changed_by = $2'];
    const values: any[] = [status, changedBy];
    let paramIndex = 3;

    if (status === 'completed' || status === 'approved') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (notes) {
      updates.push(`result_notes = $${paramIndex++}`);
      values.push(notes);
    }

    values.push(id);

    const query = `
      UPDATE checklist_instances
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    
    if (result.rows.length === 0) return null;

    await this.logActivity(id, null, 'status_changed', `Status changed to ${status}`, changedBy, { status });

    return this.formatInstance(result.rows[0]);
  }

  async submitForReview(id: string, submittedBy: string): Promise<any | null> {
    // Calculate score first
    await this.pool.query(`SELECT calculate_checklist_score($1)`, [id]);

    const query = `
      UPDATE checklist_instances
      SET status = 'pending_review', status_changed_at = CURRENT_TIMESTAMP, status_changed_by = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [submittedBy, id]);
    
    if (result.rows.length === 0) return null;

    await this.logActivity(id, null, 'submitted_for_review', 'Submitted for review', submittedBy, {});

    return this.formatInstance(result.rows[0]);
  }

  async approveInstance(id: string, approvedBy: string, notes?: string): Promise<any | null> {
    return this.updateInstanceStatus(id, 'approved', approvedBy, notes);
  }

  async rejectInstance(id: string, rejectedBy: string, notes: string): Promise<any | null> {
    return this.updateInstanceStatus(id, 'rejected', rejectedBy, notes);
  }

  async requireReinspection(id: string, requiredBy: string, notes: string): Promise<any | null> {
    const instance = await this.getInstanceById(id);
    if (!instance) return null;

    // Update current instance
    await this.updateInstanceStatus(id, 'requires_reinspection', requiredBy, notes);

    // Create new instance for reinspection
    const newInstance = await this.createInstance({
      templateId: instance.templateId,
      organizationId: instance.organizationId,
      projectId: instance.projectId,
      unitId: instance.unitId,
      locationDescription: instance.locationDescription,
      title: `Re-inspection: ${instance.title || instance.instanceNumber}`,
      createdBy: requiredBy
    });

    // Update reinspection tracking
    await this.pool.query(`
      UPDATE checklist_instances 
      SET original_instance_id = $1, reinspection_count = (SELECT reinspection_count + 1 FROM checklist_instances WHERE id = $1)
      WHERE id = $2
    `, [id, newInstance.id]);

    return newInstance;
  }

  // --------------------------------------------------------------------------
  // RESPONSES
  // --------------------------------------------------------------------------

  async saveResponse(input: ResponseInput): Promise<any> {
    // Check if response exists
    const existingQuery = `
      SELECT id FROM checklist_responses
      WHERE instance_id = $1 AND template_item_id = $2
    `;
    const existing = await this.pool.query(existingQuery, [input.instanceId, input.templateItemId]);

    if (existing.rows.length > 0) {
      // Update existing
      return this.updateResponse(existing.rows[0].id, input);
    }

    // Create new
    const id = uuidv4();

    const query = `
      INSERT INTO checklist_responses (
        id, instance_id, template_item_id, response_value, result,
        numeric_value, unit_of_measure, notes, internal_notes,
        photos, responded_at, responded_by, offline_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11, $12)
      RETURNING *
    `;

    const values = [
      id,
      input.instanceId,
      input.templateItemId,
      input.responseValue || null,
      input.result || 'pending',
      input.numericValue || null,
      input.unitOfMeasure || null,
      input.notes || null,
      input.internalNotes || null,
      JSON.stringify(input.photos || []),
      input.respondedBy,
      input.offlineId || null
    ];

    const result = await this.pool.query(query, values);

    // Calculate score for item
    await this.calculateResponseScore(id);

    return result.rows[0];
  }

  async updateResponse(id: string, input: Partial<ResponseInput>): Promise<any | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.responseValue !== undefined) {
      updates.push(`response_value = $${paramIndex++}`);
      values.push(input.responseValue);
    }

    if (input.result !== undefined) {
      updates.push(`result = $${paramIndex++}`);
      values.push(input.result);
    }

    if (input.numericValue !== undefined) {
      updates.push(`numeric_value = $${paramIndex++}`);
      values.push(input.numericValue);
    }

    if (input.unitOfMeasure !== undefined) {
      updates.push(`unit_of_measure = $${paramIndex++}`);
      values.push(input.unitOfMeasure);
    }

    if (input.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(input.notes);
    }

    if (input.photos !== undefined) {
      updates.push(`photos = $${paramIndex++}`);
      values.push(JSON.stringify(input.photos));
    }

    if (input.respondedBy) {
      updates.push(`responded_by = $${paramIndex++}`);
      values.push(input.respondedBy);
      updates.push(`responded_at = CURRENT_TIMESTAMP`);
    }

    if (updates.length === 0) return null;

    values.push(id);

    const query = `
      UPDATE checklist_responses
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length > 0) {
      await this.calculateResponseScore(id);
    }

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async calculateResponseScore(responseId: string): Promise<void> {
    // Get response and item details
    const query = `
      SELECT cr.*, cti.points, cti.is_critical
      FROM checklist_responses cr
      JOIN checklist_template_items cti ON cr.template_item_id = cti.id
      WHERE cr.id = $1
    `;
    const result = await this.pool.query(query, [responseId]);
    
    if (result.rows.length === 0) return;

    const response = result.rows[0];
    let score = 0;

    if (response.result === 'pass') {
      score = response.points || 0;
    }

    await this.pool.query(
      `UPDATE checklist_responses SET score = $1 WHERE id = $2`,
      [score, responseId]
    );
  }

  async saveResponsesBulk(responses: ResponseInput[]): Promise<any[]> {
    const savedResponses: any[] = [];

    for (const response of responses) {
      const saved = await this.saveResponse(response);
      savedResponses.push(saved);
    }

    return savedResponses;
  }

  async getResponses(instanceId: string): Promise<any[]> {
    const query = `
      SELECT cr.*, cti.question, cti.item_number, cti.response_type, cti.is_critical, cti.points
      FROM checklist_responses cr
      JOIN checklist_template_items cti ON cr.template_item_id = cti.id
      WHERE cr.instance_id = $1
      ORDER BY cti.display_order
    `;

    const result = await this.pool.query(query, [instanceId]);
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // SIGNATURES
  // --------------------------------------------------------------------------

  async addSignature(input: SignatureInput): Promise<any> {
    const id = uuidv4();

    const query = `
      INSERT INTO checklist_signatures (
        id, instance_id, signer_id, signer_name, signer_title, signer_company,
        signer_email, signer_role, signature_type, signature_data,
        sign_off_type, statement, ip_address, device_info, location_data,
        certificate_id, certificate_issuer, certificate_valid_until
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      RETURNING *
    `;

    const values = [
      id,
      input.instanceId,
      input.signerId || null,
      input.signerName,
      input.signerTitle || null,
      input.signerCompany || null,
      input.signerEmail || null,
      input.signerRole,
      input.signatureType,
      input.signatureData,
      input.signOffType || null,
      input.statement || null,
      input.ipAddress || null,
      input.deviceInfo ? JSON.stringify(input.deviceInfo) : null,
      input.locationData ? JSON.stringify(input.locationData) : null,
      input.certificateId || null,
      input.certificateIssuer || null,
      input.certificateValidUntil || null
    ];

    const result = await this.pool.query(query, values);

    await this.logActivity(input.instanceId, null, 'signature_added', `Signature added by ${input.signerName}`, input.signerId || input.signerName, {});

    return result.rows[0];
  }

  async getSignatures(instanceId: string): Promise<any[]> {
    const query = `
      SELECT * FROM checklist_signatures
      WHERE instance_id = $1
      ORDER BY signed_at
    `;

    const result = await this.pool.query(query, [instanceId]);
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  async getProjectStats(projectId: string): Promise<any> {
    const query = `SELECT * FROM project_checklist_summary WHERE project_id = $1`;
    const result = await this.pool.query(query, [projectId]);

    if (result.rows.length === 0) {
      return {
        totalInspections: 0,
        completedInspections: 0,
        pendingInspections: 0,
        passedInspections: 0,
        failedInspections: 0,
        overdueInspections: 0,
        avgScore: 0,
        awaitingReview: 0
      };
    }

    const row = result.rows[0];
    return {
      totalInspections: parseInt(row.total_inspections),
      completedInspections: parseInt(row.completed_inspections),
      pendingInspections: parseInt(row.pending_inspections),
      passedInspections: parseInt(row.passed_inspections),
      failedInspections: parseInt(row.failed_inspections),
      overdueInspections: parseInt(row.overdue_inspections),
      avgScore: parseFloat(row.avg_score) || 0,
      awaitingReview: parseInt(row.awaiting_review)
    };
  }

  async getDashboardData(organizationId: string, projectId?: string): Promise<any> {
    const filters: InstanceFilters = { organizationId };
    if (projectId) filters.projectId = projectId;

    const [instances, stats] = await Promise.all([
      this.getInstances({ ...filters, pageSize: 10 }),
      projectId ? this.getProjectStats(projectId) : Promise.resolve(null)
    ]);

    // Get template usage
    const templateQuery = `
      SELECT ct.id, ct.name, COUNT(ci.id) as usage_count
      FROM checklist_templates ct
      LEFT JOIN checklist_instances ci ON ct.id = ci.template_id
      WHERE ct.organization_id = $1 OR ct.is_global = true
      GROUP BY ct.id, ct.name
      ORDER BY usage_count DESC
      LIMIT 5
    `;
    const templateResult = await this.pool.query(templateQuery, [organizationId]);

    // Get recent activity
    const activityQuery = `
      SELECT * FROM checklist_activities
      WHERE instance_id IN (SELECT id FROM checklist_instances WHERE organization_id = $1)
      ORDER BY performed_at DESC
      LIMIT 20
    `;
    const activityResult = await this.pool.query(activityQuery, [organizationId]);

    return {
      recentInstances: instances.instances,
      stats: stats || await this.getOrganizationStats(organizationId),
      topTemplates: templateResult.rows,
      recentActivity: activityResult.rows
    };
  }

  private async getOrganizationStats(organizationId: string): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_inspections,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_inspections,
        COUNT(CASE WHEN status IN ('draft', 'in_progress') THEN 1 END) as pending_inspections,
        COUNT(CASE WHEN overall_result = 'pass' THEN 1 END) as passed_inspections,
        COUNT(CASE WHEN overall_result = 'fail' THEN 1 END) as failed_inspections,
        AVG(CASE WHEN status = 'completed' THEN score_percentage END) as avg_score
      FROM checklist_instances
      WHERE organization_id = $1
    `;

    const result = await this.pool.query(query, [organizationId]);
    const row = result.rows[0];

    return {
      totalInspections: parseInt(row.total_inspections),
      completedInspections: parseInt(row.completed_inspections),
      pendingInspections: parseInt(row.pending_inspections),
      passedInspections: parseInt(row.passed_inspections),
      failedInspections: parseInt(row.failed_inspections),
      avgScore: parseFloat(row.avg_score) || 0
    };
  }

  // --------------------------------------------------------------------------
  // ACTIVITY LOG
  // --------------------------------------------------------------------------

  private async logActivity(
    instanceId: string | null,
    templateId: string | null,
    activityType: string,
    description: string,
    performedBy: string,
    data: any
  ): Promise<void> {
    const query = `
      INSERT INTO checklist_activities (
        id, instance_id, template_id, activity_type, description,
        new_value, performed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await this.pool.query(query, [
      uuidv4(),
      instanceId,
      templateId,
      activityType,
      description,
      JSON.stringify(data),
      performedBy
    ]);
  }

  async getActivities(instanceId: string, limit: number = 50): Promise<any[]> {
    const query = `
      SELECT * FROM checklist_activities
      WHERE instance_id = $1
      ORDER BY performed_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [instanceId, limit]);
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private formatTemplate(row: any): any {
    return {
      id: row.id,
      organizationId: row.organization_id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      name: row.name,
      code: row.code,
      description: row.description,
      version: row.version,
      templateType: row.template_type,
      applicableTrades: row.applicable_trades,
      applicablePhases: row.applicable_phases,
      applicableUnitTypes: row.applicable_unit_types,
      requiresSignature: row.requires_signature,
      requiresPhoto: row.requires_photo,
      allowPartialSave: row.allow_partial_save,
      enforceSequence: row.enforce_sequence,
      passThreshold: row.pass_threshold,
      scoringEnabled: row.scoring_enabled,
      maxScore: row.max_score,
      passingScore: row.passing_score,
      notifyOnFail: row.notify_on_fail,
      notifyOnComplete: row.notify_on_complete,
      notifyRecipients: row.notify_recipients,
      referenceStandards: row.reference_standards,
      referenceDocuments: row.reference_documents,
      isPublished: row.is_published,
      isGlobal: row.is_global,
      publishedAt: row.published_at,
      publishedBy: row.published_by,
      sectionCount: row.section_count,
      itemCount: row.item_count,
      usageCount: row.usage_count,
      completedCount: row.completed_count,
      avgScore: row.avg_score,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private formatInstance(row: any): any {
    return {
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name,
      templateCode: row.template_code,
      organizationId: row.organization_id,
      projectId: row.project_id,
      unitId: row.unit_id,
      locationDescription: row.location_description,
      instanceNumber: row.instance_number,
      title: row.title,
      description: row.description,
      scheduledDate: row.scheduled_date,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      dueDate: row.due_date,
      assignedTo: row.assigned_to,
      assignedBy: row.assigned_by,
      inspectorName: row.inspector_name,
      inspectorCompany: row.inspector_company,
      status: row.status,
      statusChangedAt: row.status_changed_at,
      statusChangedBy: row.status_changed_by,
      totalItems: row.total_items,
      completedItems: row.completed_items,
      passedItems: row.passed_items,
      failedItems: row.failed_items,
      naItems: row.na_items,
      score: row.score,
      maxPossibleScore: row.max_possible_score,
      scorePercentage: row.score_percentage,
      overallResult: row.overall_result,
      resultNotes: row.result_notes,
      originalInstanceId: row.original_instance_id,
      reinspectionCount: row.reinspection_count,
      weatherConditions: row.weather_conditions,
      offlineId: row.offline_id,
      syncStatus: row.sync_status,
      deviceId: row.device_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

// Export singleton
let qualityChecklistsServiceInstance: QualityChecklistsService | null = null;

export function getQualityChecklistsService(pool: Pool): QualityChecklistsService {
  if (!qualityChecklistsServiceInstance) {
    qualityChecklistsServiceInstance = new QualityChecklistsService(pool);
  }
  return qualityChecklistsServiceInstance;
}

export default QualityChecklistsService;
