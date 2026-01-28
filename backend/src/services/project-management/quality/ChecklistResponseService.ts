/**
 * Checklist Response Service
 * 
 * Phase 3.3: Split qualityChecklistsService
 * 
 * Manages responses and signatures:
 * - Item responses (pass/fail/etc.)
 * - Photo attachments
 * - Digital signatures
 * - Bulk operations
 * 
 * @module services/project-management/quality/ChecklistResponseService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { UUID } from '../types';
import { eventBus } from '../events/EventBus';

// =============================================================================
// TYPES
// =============================================================================

export type ChecklistItemResult = 'pass' | 'fail' | 'na' | 'pending' | 'deferred';

export interface ResponseInput {
  instanceId: UUID;
  templateItemId: UUID;
  result: ChecklistItemResult;
  value?: string | number;
  notes?: string;
  photoUrls?: string[];
  deficiencyDescription?: string;
  correctiveAction?: string;
  respondedBy: UUID;
}

export interface ResponseUpdateInput {
  result?: ChecklistItemResult;
  value?: string | number;
  notes?: string;
  photoUrls?: string[];
  deficiencyDescription?: string;
  correctiveAction?: string;
  updatedBy: UUID;
}

export interface ChecklistResponse {
  id: UUID;
  instanceId: UUID;
  templateItemId: UUID;
  itemTitle: string;
  sectionTitle: string;
  result: ChecklistItemResult;
  value?: string | number;
  notes?: string;
  photoUrls: string[];
  deficiencyDescription?: string;
  correctiveAction?: string;
  respondedBy?: UUID;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignatureInput {
  instanceId: UUID;
  signatureType: 'inspector' | 'supervisor' | 'client' | 'witness';
  signedBy: UUID;
  signedByName: string;
  signatureData: string; // Base64 encoded
  title?: string;
  company?: string;
  notes?: string;
}

export interface ChecklistSignature {
  id: UUID;
  instanceId: UUID;
  signatureType: string;
  signedBy?: UUID;
  signedByName: string;
  signatureData: string;
  title?: string;
  company?: string;
  notes?: string;
  signedAt: Date;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ChecklistResponseServiceImpl extends BaseService {
  constructor() {
    super('ChecklistResponseService');
  }

  // ==========================================================================
  // RESPONSE MANAGEMENT
  // ==========================================================================

  async saveResponse(input: ResponseInput): Promise<ChecklistResponse> {
    const result = await this.query(
      `INSERT INTO qc_instance_responses (
         instance_id, template_item_id, result, value, notes,
         photo_urls, deficiency_description, corrective_action,
         responded_by, responded_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (instance_id, template_item_id)
       DO UPDATE SET
         result = EXCLUDED.result,
         value = EXCLUDED.value,
         notes = EXCLUDED.notes,
         photo_urls = EXCLUDED.photo_urls,
         deficiency_description = EXCLUDED.deficiency_description,
         corrective_action = EXCLUDED.corrective_action,
         responded_by = EXCLUDED.responded_by,
         responded_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        input.instanceId,
        input.templateItemId,
        input.result,
        input.value,
        input.notes,
        input.photoUrls ? JSON.stringify(input.photoUrls) : null,
        input.deficiencyDescription,
        input.correctiveAction,
        input.respondedBy,
      ]
    );

    const response = await this.getResponseWithDetails(result.rows[0].id);

    // Emit event for deficiencies
    if (input.result === 'fail' && input.deficiencyDescription) {
      eventBus.emit('checklist.deficiency.recorded', {
        instanceId: input.instanceId,
        responseId: result.rows[0].id,
        deficiency: input.deficiencyDescription,
      });
    }

    return response!;
  }

  async updateResponse(id: UUID, input: ResponseUpdateInput): Promise<ChecklistResponse | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let paramIndex = 2;

    if (input.result !== undefined) {
      updates.push(`result = $${paramIndex++}`);
      params.push(input.result);
    }

    if (input.value !== undefined) {
      updates.push(`value = $${paramIndex++}`);
      params.push(input.value);
    }

    if (input.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(input.notes);
    }

    if (input.photoUrls !== undefined) {
      updates.push(`photo_urls = $${paramIndex++}`);
      params.push(JSON.stringify(input.photoUrls));
    }

    if (input.deficiencyDescription !== undefined) {
      updates.push(`deficiency_description = $${paramIndex++}`);
      params.push(input.deficiencyDescription);
    }

    if (input.correctiveAction !== undefined) {
      updates.push(`corrective_action = $${paramIndex++}`);
      params.push(input.correctiveAction);
    }

    await this.query(
      `UPDATE qc_instance_responses SET ${updates.join(', ')} WHERE id = $1`,
      params
    );

    return this.getResponseWithDetails(id);
  }

  async saveResponsesBulk(responses: ResponseInput[]): Promise<ChecklistResponse[]> {
    if (!responses.length) return [];

    const saved: ChecklistResponse[] = [];
    
    // Use transaction for bulk save
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const input of responses) {
        const result = await client.query(
          `INSERT INTO qc_instance_responses (
             instance_id, template_item_id, result, value, notes,
             photo_urls, deficiency_description, corrective_action,
             responded_by, responded_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (instance_id, template_item_id)
           DO UPDATE SET
             result = EXCLUDED.result,
             value = EXCLUDED.value,
             notes = EXCLUDED.notes,
             photo_urls = EXCLUDED.photo_urls,
             deficiency_description = EXCLUDED.deficiency_description,
             corrective_action = EXCLUDED.corrective_action,
             responded_by = EXCLUDED.responded_by,
             responded_at = NOW(),
             updated_at = NOW()
           RETURNING *`,
          [
            input.instanceId,
            input.templateItemId,
            input.result,
            input.value,
            input.notes,
            input.photoUrls ? JSON.stringify(input.photoUrls) : null,
            input.deficiencyDescription,
            input.correctiveAction,
            input.respondedBy,
          ]
        );
        saved.push(this.mapResponseRow(result.rows[0]));
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Emit bulk event
    const instanceId = responses[0].instanceId;
    eventBus.emit('checklist.responses.saved', {
      instanceId,
      count: saved.length,
    });

    return saved;
  }

  async getResponses(instanceId: UUID): Promise<ChecklistResponse[]> {
    const result = await this.query(
      `SELECT r.*, ti.title as item_title, ts.title as section_title
       FROM qc_instance_responses r
       JOIN qc_template_items ti ON ti.id = r.template_item_id
       JOIN qc_template_sections ts ON ts.id = ti.section_id
       WHERE r.instance_id = $1
       ORDER BY ts.sort_order, ti.sort_order`,
      [instanceId]
    );

    return result.rows.map(this.mapResponseRow);
  }

  async getResponseWithDetails(id: UUID): Promise<ChecklistResponse | null> {
    const result = await this.query(
      `SELECT r.*, ti.title as item_title, ts.title as section_title
       FROM qc_instance_responses r
       JOIN qc_template_items ti ON ti.id = r.template_item_id
       JOIN qc_template_sections ts ON ts.id = ti.section_id
       WHERE r.id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapResponseRow(result.rows[0]) : null;
  }

  // ==========================================================================
  // PHOTO MANAGEMENT
  // ==========================================================================

  async addPhotoToResponse(responseId: UUID, photoUrl: string): Promise<ChecklistResponse | null> {
    const result = await this.query(
      `UPDATE qc_instance_responses
       SET photo_urls = COALESCE(photo_urls, '[]'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [responseId, JSON.stringify([photoUrl])]
    );

    return result.rows[0] ? this.getResponseWithDetails(responseId) : null;
  }

  async removePhotoFromResponse(responseId: UUID, photoUrl: string): Promise<ChecklistResponse | null> {
    const result = await this.query(
      `UPDATE qc_instance_responses
       SET photo_urls = (
         SELECT jsonb_agg(elem) 
         FROM jsonb_array_elements(photo_urls) elem 
         WHERE elem::text != $2
       ),
       updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [responseId, JSON.stringify(photoUrl)]
    );

    return result.rows[0] ? this.getResponseWithDetails(responseId) : null;
  }

  // ==========================================================================
  // SIGNATURE MANAGEMENT
  // ==========================================================================

  async addSignature(input: SignatureInput): Promise<ChecklistSignature> {
    const result = await this.query(
      `INSERT INTO qc_instance_signatures (
         instance_id, signature_type, signed_by, signed_by_name,
         signature_data, title, company, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.instanceId,
        input.signatureType,
        input.signedBy,
        input.signedByName,
        input.signatureData,
        input.title,
        input.company,
        input.notes,
      ]
    );

    const signature = this.mapSignatureRow(result.rows[0]);

    eventBus.emit('checklist.signature.added', {
      instanceId: input.instanceId,
      signatureId: signature.id,
      type: input.signatureType,
    });

    return signature;
  }

  async getSignatures(instanceId: UUID): Promise<ChecklistSignature[]> {
    const result = await this.query(
      `SELECT * FROM qc_instance_signatures
       WHERE instance_id = $1
       ORDER BY signed_at ASC`,
      [instanceId]
    );

    return result.rows.map(this.mapSignatureRow);
  }

  async deleteSignature(id: UUID): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM qc_instance_signatures WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rowCount > 0;
  }

  // ==========================================================================
  // DEFICIENCY TRACKING
  // ==========================================================================

  async getDeficiencies(instanceId: UUID): Promise<ChecklistResponse[]> {
    const result = await this.query(
      `SELECT r.*, ti.title as item_title, ts.title as section_title
       FROM qc_instance_responses r
       JOIN qc_template_items ti ON ti.id = r.template_item_id
       JOIN qc_template_sections ts ON ts.id = ti.section_id
       WHERE r.instance_id = $1 AND r.result = 'fail'
       ORDER BY ts.sort_order, ti.sort_order`,
      [instanceId]
    );

    return result.rows.map(this.mapResponseRow);
  }

  async getProjectDeficiencies(projectId: UUID): Promise<any[]> {
    const result = await this.query(
      `SELECT r.*, ti.title as item_title, ts.title as section_title,
         i.title as instance_title, t.name as template_name
       FROM qc_instance_responses r
       JOIN qc_checklist_instances i ON i.id = r.instance_id
       JOIN qc_checklist_templates t ON t.id = i.template_id
       JOIN qc_template_items ti ON ti.id = r.template_item_id
       JOIN qc_template_sections ts ON ts.id = ti.section_id
       WHERE i.project_id = $1 AND r.result = 'fail'
       ORDER BY r.responded_at DESC`,
      [projectId]
    );

    return result.rows.map(row => ({
      ...this.mapResponseRow(row),
      instanceTitle: row.instance_title,
      templateName: row.template_name,
    }));
  }

  // ==========================================================================
  // ACTIVITY LOGGING
  // ==========================================================================

  async getActivities(
    instanceId: UUID,
    limit: number = 50
  ): Promise<any[]> {
    const result = await this.query(
      `SELECT a.*, u.name as performed_by_name
       FROM qc_instance_activities a
       LEFT JOIN users u ON u.id = a.performed_by
       WHERE a.instance_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [instanceId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      instanceId: row.instance_id,
      action: row.action,
      performedBy: row.performed_by,
      performedByName: row.performed_by_name,
      notes: row.notes,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    }));
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapResponseRow(row: any): ChecklistResponse {
    return {
      id: row.id,
      instanceId: row.instance_id,
      templateItemId: row.template_item_id,
      itemTitle: row.item_title || '',
      sectionTitle: row.section_title || '',
      result: row.result,
      value: row.value,
      notes: row.notes,
      photoUrls: row.photo_urls ? (typeof row.photo_urls === 'string' ? JSON.parse(row.photo_urls) : row.photo_urls) : [],
      deficiencyDescription: row.deficiency_description,
      correctiveAction: row.corrective_action,
      respondedBy: row.responded_by,
      respondedAt: row.responded_at ? new Date(row.responded_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapSignatureRow(row: any): ChecklistSignature {
    return {
      id: row.id,
      instanceId: row.instance_id,
      signatureType: row.signature_type,
      signedBy: row.signed_by,
      signedByName: row.signed_by_name,
      signatureData: row.signature_data,
      title: row.title,
      company: row.company,
      notes: row.notes,
      signedAt: new Date(row.signed_at || row.created_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const checklistResponseService = new ChecklistResponseServiceImpl();
