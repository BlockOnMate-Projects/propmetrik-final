/**
 * Document CRUD Service
 * 
 * Phase 3.10: Split projectDocumentService
 * 
 * Core document operations:
 * - Create, read, update, delete documents
 * - Archive and restore
 * - Query and filtering
 * - Access tracking
 * 
 * @module services/project-management/documents/DocumentCrudService
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  ProjectDocument,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentFilters,
  DocumentStats,
  mapRowToDocument,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class DocumentCrudServiceImpl extends BaseService {
  constructor() {
    super('DocumentCrudService');
  }

  /**
   * Create a new document
   */
  async createDocument(input: CreateDocumentInput): Promise<ProjectDocument> {
    const id = uuidv4();

    const result = await this.query(
      `INSERT INTO project_documents (
         id, project_id, folder_id, organization_id,
         name, original_filename, description, document_type,
         file_url, file_key, thumbnail_url, file_size, mime_type,
         version, is_current,
         tags, metadata,
         expiration_date, expiration_reminder_days,
         access_level, shared_with, status,
         related_permit_id, related_phase_id, related_milestone_id,
         uploaded_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         1, true,
         $14, $15,
         $16, $17,
         $18, $19, 'active',
         $20, $21, $22,
         $23
       )
       RETURNING *`,
      [
        id,
        input.projectId,
        input.folderId,
        input.organizationId,
        input.name,
        input.originalFilename,
        input.description,
        input.documentType,
        input.fileUrl,
        input.fileKey,
        input.thumbnailUrl,
        input.fileSize,
        input.mimeType,
        input.tags || [],
        JSON.stringify(input.metadata || {}),
        input.expirationDate,
        input.expirationReminderDays || 30,
        input.accessLevel || 'team',
        input.sharedWith || [],
        input.relatedPermitId,
        input.relatedPhaseId,
        input.relatedMilestoneId,
        input.uploadedBy,
      ]
    );

    return mapRowToDocument(result.rows[0]);
  }

  /**
   * Get document by ID
   */
  async getDocumentById(documentId: string): Promise<ProjectDocument | null> {
    const result = await this.query(
      'SELECT * FROM project_documents WHERE id = $1',
      [documentId]
    );

    return result.rows[0] ? mapRowToDocument(result.rows[0]) : null;
  }

  /**
   * Get documents by project with filters
   */
  async getDocumentsByProject(filters: DocumentFilters): Promise<ProjectDocument[]> {
    const conditions: string[] = ['project_id = $1'];
    const values: unknown[] = [filters.projectId];
    let paramIndex = 2;

    if (filters.folderId) {
      conditions.push(`folder_id = $${paramIndex++}`);
      values.push(filters.folderId);
    }

    if (filters.documentType) {
      if (Array.isArray(filters.documentType)) {
        conditions.push(`document_type = ANY($${paramIndex++})`);
        values.push(filters.documentType);
      } else {
        conditions.push(`document_type = $${paramIndex++}`);
        values.push(filters.documentType);
      }
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${paramIndex++}`);
      values.push(filters.tags);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    } else {
      conditions.push(`status = 'active'`);
    }

    if (filters.expiringWithinDays) {
      conditions.push(`expiration_date BETWEEN NOW() AND NOW() + INTERVAL '${filters.expiringWithinDays} days'`);
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const result = await this.query(
      `SELECT * FROM project_documents
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      values
    );

    return result.rows.map(mapRowToDocument);
  }

  /**
   * Get documents by folder
   */
  async getDocumentsByFolder(folderId: string): Promise<ProjectDocument[]> {
    const result = await this.query(
      `SELECT * FROM project_documents
       WHERE folder_id = $1 AND status = 'active'
       ORDER BY name`,
      [folderId]
    );

    return result.rows.map(mapRowToDocument);
  }

  /**
   * Update a document
   */
  async updateDocument(
    documentId: string,
    input: UpdateDocumentInput
  ): Promise<ProjectDocument | null> {
    const document = await this.getDocumentById(documentId);
    if (!document) {
      return null;
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
    if (input.folderId !== undefined) {
      updates.push(`folder_id = $${paramIndex++}`);
      values.push(input.folderId || null);
    }
    if (input.documentType !== undefined) {
      updates.push(`document_type = $${paramIndex++}`);
      values.push(input.documentType);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.expirationDate !== undefined) {
      updates.push(`expiration_date = $${paramIndex++}`);
      values.push(input.expirationDate || null);
    }
    if (input.expirationReminderDays !== undefined) {
      updates.push(`expiration_reminder_days = $${paramIndex++}`);
      values.push(input.expirationReminderDays);
    }
    if (input.accessLevel !== undefined) {
      updates.push(`access_level = $${paramIndex++}`);
      values.push(input.accessLevel);
    }
    if (input.sharedWith !== undefined) {
      updates.push(`shared_with = $${paramIndex++}`);
      values.push(input.sharedWith);
    }
    if (input.relatedPermitId !== undefined) {
      updates.push(`related_permit_id = $${paramIndex++}`);
      values.push(input.relatedPermitId || null);
    }
    if (input.relatedPhaseId !== undefined) {
      updates.push(`related_phase_id = $${paramIndex++}`);
      values.push(input.relatedPhaseId || null);
    }
    if (input.relatedMilestoneId !== undefined) {
      updates.push(`related_milestone_id = $${paramIndex++}`);
      values.push(input.relatedMilestoneId || null);
    }

    if (updates.length === 0) {
      return document;
    }

    updates.push(`updated_at = NOW()`);
    values.push(documentId);

    const result = await this.query(
      `UPDATE project_documents SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return mapRowToDocument(result.rows[0]);
  }

  /**
   * Delete a document (soft delete or hard delete)
   */
  async deleteDocument(documentId: string, hardDelete = false): Promise<boolean> {
    if (hardDelete) {
      const result = await this.query(
        'DELETE FROM project_documents WHERE id = $1 RETURNING id',
        [documentId]
      );
      return (result.rowCount ?? 0) > 0;
    }

    const result = await this.query(
      `UPDATE project_documents 
       SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [documentId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Archive a document
   */
  async archiveDocument(documentId: string): Promise<ProjectDocument | null> {
    const result = await this.query(
      `UPDATE project_documents 
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [documentId]
    );

    return result.rows[0] ? mapRowToDocument(result.rows[0]) : null;
  }

  /**
   * Restore an archived document
   */
  async restoreDocument(documentId: string): Promise<ProjectDocument | null> {
    const result = await this.query(
      `UPDATE project_documents 
       SET status = 'active', deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('archived', 'deleted')
       RETURNING *`,
      [documentId]
    );

    return result.rows[0] ? mapRowToDocument(result.rows[0]) : null;
  }

  /**
   * Get expiring documents
   */
  async getExpiringDocuments(
    projectId: string,
    withinDays = 30
  ): Promise<ProjectDocument[]> {
    const result = await this.query(
      `SELECT * FROM project_documents
       WHERE project_id = $1
       AND status = 'active'
       AND expiration_date IS NOT NULL
       AND expiration_date BETWEEN NOW() AND NOW() + INTERVAL '1 day' * $2
       ORDER BY expiration_date`,
      [projectId, withinDays]
    );

    return result.rows.map(mapRowToDocument);
  }

  /**
   * Get expired documents
   */
  async getExpiredDocuments(projectId: string): Promise<ProjectDocument[]> {
    const result = await this.query(
      `SELECT * FROM project_documents
       WHERE project_id = $1
       AND status = 'active'
       AND expiration_date IS NOT NULL
       AND expiration_date < NOW()
       ORDER BY expiration_date DESC`,
      [projectId]
    );

    return result.rows.map(mapRowToDocument);
  }

  /**
   * Get document statistics for a project
   */
  async getDocumentStats(projectId: string): Promise<DocumentStats> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total,
         SUM(file_size) as total_size,
         COUNT(*) FILTER (WHERE status = 'active') as active,
         COUNT(*) FILTER (WHERE status = 'archived') as archived,
         COUNT(*) FILTER (WHERE status = 'deleted') as deleted,
         COUNT(*) FILTER (WHERE access_level = 'public') as public,
         COUNT(*) FILTER (WHERE access_level = 'team') as team,
         COUNT(*) FILTER (WHERE access_level = 'restricted') as restricted,
         COUNT(*) FILTER (WHERE access_level = 'confidential') as confidential,
         COUNT(*) FILTER (WHERE expiration_date < NOW()) as expired,
         COUNT(*) FILTER (WHERE expiration_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') as expiring,
         COUNT(DISTINCT id) FILTER (WHERE id IN (SELECT document_id FROM document_shares WHERE expires_at > NOW())) as shared
       FROM project_documents
       WHERE project_id = $1`,
      [projectId]
    );

    const row = result.rows[0];

    // Get by type
    const typeResult = await this.query(
      `SELECT document_type, COUNT(*) as count
       FROM project_documents
       WHERE project_id = $1 AND status = 'active'
       GROUP BY document_type`,
      [projectId]
    );

    const byType: Record<string, number> = {};
    typeResult.rows.forEach(r => {
      if (r.document_type) {
        byType[r.document_type] = parseInt(r.count);
      }
    });

    return {
      totalDocuments: parseInt(row.total) || 0,
      byType,
      byStatus: {
        active: parseInt(row.active) || 0,
        archived: parseInt(row.archived) || 0,
        deleted: parseInt(row.deleted) || 0,
      },
      byAccessLevel: {
        public: parseInt(row.public) || 0,
        team: parseInt(row.team) || 0,
        restricted: parseInt(row.restricted) || 0,
        confidential: parseInt(row.confidential) || 0,
      },
      totalSize: parseInt(row.total_size) || 0,
      expiringCount: parseInt(row.expiring) || 0,
      expiredCount: parseInt(row.expired) || 0,
      sharedCount: parseInt(row.shared) || 0,
    };
  }

  /**
   * Record document access
   */
  async recordDocumentAccess(
    documentId: string,
    userId: string
  ): Promise<void> {
    await this.query(
      `UPDATE project_documents
       SET last_accessed_at = NOW(), last_accessed_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [userId, documentId]
    );
  }

  /**
   * Move document to folder
   */
  async moveDocument(documentId: string, folderId: string | null): Promise<ProjectDocument | null> {
    return this.updateDocument(documentId, { folderId: folderId ?? undefined });
  }

  /**
   * Bulk move documents
   */
  async bulkMoveDocuments(documentIds: string[], folderId: string | null): Promise<number> {
    const result = await this.query(
      `UPDATE project_documents
       SET folder_id = $1, updated_at = NOW()
       WHERE id = ANY($2)
       RETURNING id`,
      [folderId, documentIds]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Bulk delete documents
   */
  async bulkDeleteDocuments(documentIds: string[], hardDelete = false): Promise<number> {
    if (hardDelete) {
      const result = await this.query(
        'DELETE FROM project_documents WHERE id = ANY($1) RETURNING id',
        [documentIds]
      );
      return result.rowCount ?? 0;
    }

    const result = await this.query(
      `UPDATE project_documents
       SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
       WHERE id = ANY($1)
       RETURNING id`,
      [documentIds]
    );

    return result.rowCount ?? 0;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const documentCrudService = new DocumentCrudServiceImpl();
