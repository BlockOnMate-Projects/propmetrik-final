/**
 * Project Document Service
 * Phase 3: Compliance & Document Management
 * 
 * @deprecated This file is deprecated. Use the new modular documents module:
 * 
 * import { 
 *   documentsFacade,
 *   folderService,
 *   documentCrudService,
 *   documentVersionService,
 *   documentSharingService,
 *   documentTemplateService 
 * } from './documents';
 * 
 * The monolithic service has been split into:
 * - FolderService: Folder hierarchy management
 * - DocumentCrudService: Core document operations
 * - DocumentVersionService: Version control
 * - DocumentSharingService: Share links and access
 * - DocumentTemplateService: Document templates
 * 
 * This file remains for backward compatibility and will be removed in a future version.
 * 
 * Handles:
 * - Folder management (create, list, move, delete)
 * - Document CRUD with version control
 * - File upload to MinIO/S3
 * - Document templates and generation
 * - Document sharing with external parties
 * - Expiration tracking for documents
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  emitProjectUpdated,
  emitDashboardRefresh,
} from './projectRealtimeEvents';

// ============================================================================
// TYPES
// ============================================================================

export type DocumentType =
  | 'land_title'
  | 'indenture'
  | 'consent_letter'
  | 'site_plan'
  | 'survey_report'
  | 'traditional_authority_letter'
  | 'stool_lands_consent'
  | 'lease_agreement'
  | 'development_permit'
  | 'building_permit'
  | 'epa_permit'
  | 'fire_certificate'
  | 'occupancy_certificate'
  | 'commencement_permit'
  | 'architectural_drawing'
  | 'structural_drawing'
  | 'mep_drawing'
  | 'landscape_drawing'
  | 'as_built_drawing'
  | 'shop_drawing'
  | 'detail_drawing'
  | 'main_contract'
  | 'subcontract'
  | 'consultant_agreement'
  | 'vendor_agreement'
  | 'variation_order'
  | 'completion_certificate'
  | 'budget_document'
  | 'invoice'
  | 'receipt'
  | 'payment_certificate'
  | 'bank_guarantee'
  | 'insurance_certificate'
  | 'valuation_report'
  | 'daily_log'
  | 'weekly_report'
  | 'monthly_report'
  | 'progress_report'
  | 'inspection_report'
  | 'test_report'
  | 'quality_report'
  | 'brochure'
  | 'floor_plan'
  | 'render'
  | 'photography'
  | 'video'
  | 'sales_material'
  | 'snag_list'
  | 'warranty_document'
  | 'operation_manual'
  | 'maintenance_schedule'
  | 'key_register'
  | 'handover_certificate'
  | 'correspondence'
  | 'meeting_minutes'
  | 'specification'
  | 'schedule'
  | 'other';

export type AccessLevel = 'public' | 'team' | 'restricted' | 'confidential';

export interface ProjectFolder {
  id: string;
  project_id: string;
  organization_id: string;
  parent_id?: string;
  
  name: string;
  description?: string;
  folder_type?: string;
  icon?: string;
  color?: string;
  
  sort_order: number;
  is_system: boolean;
  auto_categorize: boolean;
  
  created_by?: string;
  created_at: Date;
  updated_at: Date;
  
  // Computed
  children?: ProjectFolder[];
  document_count?: number;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  folder_id?: string;
  organization_id: string;
  
  name: string;
  original_filename?: string;
  description?: string;
  document_type?: string;
  
  file_url: string;
  file_key?: string;
  thumbnail_url?: string;
  file_size?: number;
  mime_type?: string;
  
  version: number;
  is_current: boolean;
  previous_version_id?: string;
  version_notes?: string;
  
  tags: string[];
  metadata: Record<string, any>;
  
  expiration_date?: Date;
  expiration_reminder_days: number;
  
  access_level: AccessLevel;
  shared_with: string[];
  
  status: 'active' | 'archived' | 'deleted';
  
  related_permit_id?: string;
  related_phase_id?: string;
  related_milestone_id?: string;
  
  uploaded_by?: string;
  last_accessed_at?: Date;
  last_accessed_by?: string;
  
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  file_url: string;
  file_key?: string;
  file_size?: number;
  change_summary?: string;
  changed_by?: string;
  metadata_snapshot?: Record<string, any>;
  created_at: Date;
}

export interface DocumentTemplate {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  template_type: string;
  category?: string;
  template_url?: string;
  template_content?: string;
  format?: string;
  variables: any[];
  preview_url?: string;
  thumbnail_url?: string;
  is_ghana_specific: boolean;
  applicable_regions?: string[];
  is_active: boolean;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentShare {
  id: string;
  document_id: string;
  share_token: string;
  share_url?: string;
  expires_at?: Date;
  password_hash?: string;
  max_downloads?: number;
  download_count: number;
  recipient_email?: string;
  recipient_name?: string;
  can_download: boolean;
  can_view_only: boolean;
  last_accessed_at?: Date;
  access_log: any[];
  created_by?: string;
  created_at: Date;
}

// Input types
export interface CreateFolderInput {
  project_id: string;
  organization_id: string;
  parent_id?: string;
  name: string;
  description?: string;
  folder_type?: string;
  icon?: string;
  color?: string;
  sort_order?: number;
  created_by?: string;
}

export interface UpdateFolderInput {
  name?: string;
  description?: string;
  parent_id?: string;
  icon?: string;
  color?: string;
  sort_order?: number;
}

export interface CreateDocumentInput {
  project_id: string;
  organization_id: string;
  folder_id?: string;
  
  name: string;
  original_filename?: string;
  description?: string;
  document_type?: DocumentType;
  
  file_url: string;
  file_key?: string;
  thumbnail_url?: string;
  file_size?: number;
  mime_type?: string;
  
  tags?: string[];
  metadata?: Record<string, any>;
  
  expiration_date?: Date;
  expiration_reminder_days?: number;
  
  access_level?: AccessLevel;
  shared_with?: string[];
  
  related_permit_id?: string;
  related_phase_id?: string;
  related_milestone_id?: string;
  
  uploaded_by?: string;
}

export interface UpdateDocumentInput {
  name?: string;
  description?: string;
  folder_id?: string;
  document_type?: DocumentType;
  
  tags?: string[];
  metadata?: Record<string, any>;
  
  expiration_date?: Date;
  expiration_reminder_days?: number;
  
  access_level?: AccessLevel;
  shared_with?: string[];
  
  related_permit_id?: string;
  related_phase_id?: string;
  related_milestone_id?: string;
}

export interface UploadNewVersionInput {
  file_url: string;
  file_key?: string;
  file_size?: number;
  version_notes?: string;
  changed_by?: string;
}

export interface CreateShareInput {
  document_id: string;
  expires_at?: Date;
  password?: string;
  max_downloads?: number;
  recipient_email?: string;
  recipient_name?: string;
  can_download?: boolean;
  can_view_only?: boolean;
  created_by?: string;
}

export interface DocumentFilters {
  project_id: string;
  folder_id?: string;
  document_type?: DocumentType | DocumentType[];
  tags?: string[];
  status?: 'active' | 'archived' | 'deleted';
  expiring_within_days?: number;
  search?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProjectDocumentService {
  // --------------------------------------------------------------------------
  // FOLDERS
  // --------------------------------------------------------------------------

  async createFolder(input: CreateFolderInput): Promise<ProjectFolder> {
    const id = uuidv4();
    
    // Get max sort order for siblings
    let sortOrder = input.sort_order;
    if (sortOrder === undefined) {
      const maxResult = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
         FROM project_folders 
         WHERE project_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
        [input.project_id, input.parent_id]
      );
      sortOrder = maxResult.rows[0].next_order;
    }

    const result = await pool.query(
      `INSERT INTO project_folders (
        id, project_id, organization_id, parent_id,
        name, description, folder_type, icon, color,
        sort_order, is_system, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)
      RETURNING *`,
      [
        id,
        input.project_id,
        input.organization_id,
        input.parent_id,
        input.name,
        input.description,
        input.folder_type,
        input.icon,
        input.color,
        sortOrder,
        input.created_by,
      ]
    );

    return result.rows[0];
  }

  async getFoldersByProject(projectId: string): Promise<ProjectFolder[]> {
    const result = await pool.query(
      `SELECT pf.*, 
        (SELECT COUNT(*) FROM project_documents WHERE folder_id = pf.id AND status = 'active') as document_count
       FROM project_folders pf
       WHERE pf.project_id = $1
       ORDER BY pf.sort_order, pf.name`,
      [projectId]
    );
    return result.rows;
  }

  async getFolderTree(projectId: string): Promise<ProjectFolder[]> {
    const folders = await this.getFoldersByProject(projectId);
    return this.buildFolderTree(folders);
  }

  private buildFolderTree(folders: ProjectFolder[], parentId: string | null = null): ProjectFolder[] {
    const tree: ProjectFolder[] = [];
    
    for (const folder of folders) {
      const isChild = parentId === null 
        ? !folder.parent_id 
        : folder.parent_id === parentId;
      
      if (isChild) {
        const children = this.buildFolderTree(folders, folder.id);
        tree.push({
          ...folder,
          children: children.length > 0 ? children : undefined,
        });
      }
    }
    
    return tree.sort((a, b) => a.sort_order - b.sort_order);
  }

  async getFolderById(folderId: string): Promise<ProjectFolder | null> {
    const result = await pool.query(
      'SELECT * FROM project_folders WHERE id = $1',
      [folderId]
    );
    return result.rows[0] || null;
  }

  async updateFolder(
    folderId: string,
    input: UpdateFolderInput
  ): Promise<ProjectFolder | null> {
    const folder = await this.getFolderById(folderId);
    if (!folder) return null;

    // Prevent moving into own subtree
    if (input.parent_id) {
      const descendants = await this.getFolderDescendants(folderId);
      if (descendants.includes(input.parent_id)) {
        throw new Error('Cannot move folder into its own subtree');
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields = ['name', 'description', 'parent_id', 'icon', 'color', 'sort_order'];

    for (const field of fields) {
      if ((input as any)[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push((input as any)[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return folder;

    values.push(folderId);

    const result = await pool.query(
      `UPDATE project_folders SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async deleteFolder(folderId: string, moveDocumentsTo?: string): Promise<boolean> {
    const folder = await this.getFolderById(folderId);
    if (!folder) return false;

    if (folder.is_system) {
      throw new Error('Cannot delete system folders');
    }

    // Move or delete documents in this folder
    if (moveDocumentsTo) {
      await pool.query(
        'UPDATE project_documents SET folder_id = $1 WHERE folder_id = $2',
        [moveDocumentsTo, folderId]
      );
    } else {
      await pool.query(
        `UPDATE project_documents SET status = 'deleted', deleted_at = NOW() WHERE folder_id = $1`,
        [folderId]
      );
    }

    // Delete folder (cascades to subfolders)
    await pool.query('DELETE FROM project_folders WHERE id = $1', [folderId]);

    return true;
  }

  private async getFolderDescendants(folderId: string): Promise<string[]> {
    const result = await pool.query(
      `WITH RECURSIVE descendants AS (
        SELECT id FROM project_folders WHERE parent_id = $1
        UNION ALL
        SELECT f.id FROM project_folders f
        INNER JOIN descendants d ON f.parent_id = d.id
      )
      SELECT id FROM descendants`,
      [folderId]
    );
    return result.rows.map((r) => r.id);
  }

  // --------------------------------------------------------------------------
  // DOCUMENTS
  // --------------------------------------------------------------------------

  async createDocument(input: CreateDocumentInput): Promise<ProjectDocument> {
    const id = uuidv4();

    // Auto-categorize to folder if no folder specified
    let folderId: string | null | undefined = input.folder_id;
    if (!folderId && input.document_type) {
      folderId = await this.findFolderByDocumentType(
        input.project_id,
        input.document_type
      );
    }

    const result = await pool.query(
      `INSERT INTO project_documents (
        id, project_id, organization_id, folder_id,
        name, original_filename, description, document_type,
        file_url, file_key, thumbnail_url, file_size, mime_type,
        version, is_current,
        tags, metadata,
        expiration_date, expiration_reminder_days,
        access_level, shared_with, status,
        related_permit_id, related_phase_id, related_milestone_id,
        uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, true, $14, $15, $16, $17, $18, $19, 'active', $20, $21, $22, $23)
      RETURNING *`,
      [
        id,
        input.project_id,
        input.organization_id,
        folderId,
        input.name,
        input.original_filename,
        input.description,
        input.document_type,
        input.file_url,
        input.file_key,
        input.thumbnail_url,
        input.file_size,
        input.mime_type,
        input.tags || [],
        input.metadata || {},
        input.expiration_date,
        input.expiration_reminder_days || 30,
        input.access_level || 'team',
        input.shared_with || [],
        input.related_permit_id,
        input.related_phase_id,
        input.related_milestone_id,
        input.uploaded_by,
      ]
    );

    const document = result.rows[0];

    // Emit real-time update
    emitProjectUpdated(input.project_id, input.organization_id, { action: { old: '', new: 'document_uploaded' } } as any);

    return document;
  }

  async getDocumentById(documentId: string): Promise<ProjectDocument | null> {
    const result = await pool.query(
      'SELECT * FROM project_documents WHERE id = $1',
      [documentId]
    );
    return result.rows[0] || null;
  }

  async getDocumentsByProject(
    projectId: string,
    filters?: Partial<DocumentFilters>
  ): Promise<ProjectDocument[]> {
    let query = `SELECT pd.*, u.full_name as uploaded_by_name FROM project_documents pd LEFT JOIN users u ON pd.uploaded_by::text = u.id::text WHERE pd.project_id = $1 AND pd.status = 'active'`;
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (filters?.folder_id) {
      query += ` AND pd.folder_id = $${paramIndex}`;
      params.push(filters.folder_id);
      paramIndex++;
    }

    if (filters?.document_type) {
      const types = Array.isArray(filters.document_type)
        ? filters.document_type
        : [filters.document_type];
      query += ` AND pd.document_type = ANY($${paramIndex})`;
      params.push(types);
      paramIndex++;
    }

    if (filters?.tags && filters.tags.length > 0) {
      query += ` AND pd.tags && $${paramIndex}`;
      params.push(filters.tags);
      paramIndex++;
    }

    if (filters?.expiring_within_days) {
      query += ` AND pd.expiration_date IS NOT NULL 
                 AND pd.expiration_date BETWEEN CURRENT_DATE 
                 AND CURRENT_DATE + INTERVAL '${filters.expiring_within_days} days'`;
    }

    if (filters?.search) {
      query += ` AND (pd.name ILIKE $${paramIndex} OR pd.description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` AND pd.is_current = true ORDER BY pd.created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  async getDocumentsByFolder(folderId: string): Promise<ProjectDocument[]> {
    const result = await pool.query(
      `SELECT * FROM project_documents 
       WHERE folder_id = $1 AND status = 'active' AND is_current = true
       ORDER BY name`,
      [folderId]
    );
    return result.rows;
  }

  async updateDocument(
    documentId: string,
    input: UpdateDocumentInput
  ): Promise<ProjectDocument | null> {
    const document = await this.getDocumentById(documentId);
    if (!document) return null;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields = [
      'name',
      'description',
      'folder_id',
      'document_type',
      'tags',
      'metadata',
      'expiration_date',
      'expiration_reminder_days',
      'access_level',
      'shared_with',
      'related_permit_id',
      'related_phase_id',
      'related_milestone_id',
    ];

    for (const field of fields) {
      if ((input as any)[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push((input as any)[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return document;

    values.push(documentId);

    const result = await pool.query(
      `UPDATE project_documents SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async deleteDocument(
    documentId: string,
    hardDelete: boolean = false
  ): Promise<boolean> {
    if (hardDelete) {
      const result = await pool.query(
        'DELETE FROM project_documents WHERE id = $1 RETURNING id',
        [documentId]
      );
      return (result.rowCount ?? 0) > 0;
    }

    const result = await pool.query(
      `UPDATE project_documents 
       SET status = 'deleted', deleted_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [documentId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async archiveDocument(documentId: string): Promise<ProjectDocument | null> {
    const result = await pool.query(
      `UPDATE project_documents 
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [documentId]
    );
    return result.rows[0] || null;
  }

  async restoreDocument(documentId: string): Promise<ProjectDocument | null> {
    const result = await pool.query(
      `UPDATE project_documents 
       SET status = 'active', deleted_at = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [documentId]
    );
    return result.rows[0] || null;
  }

  // --------------------------------------------------------------------------
  // VERSION CONTROL
  // --------------------------------------------------------------------------

  async uploadNewVersion(
    documentId: string,
    input: UploadNewVersionInput
  ): Promise<ProjectDocument> {
    const document = await this.getDocumentById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Save current version to history
      await client.query(
        `INSERT INTO document_versions (
          id, document_id, version, file_url, file_key, file_size,
          change_summary, changed_by, metadata_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuidv4(),
          documentId,
          document.version,
          document.file_url,
          document.file_key,
          document.file_size,
          input.version_notes || 'New version uploaded',
          input.changed_by,
          document.metadata,
        ]
      );

      // Update document with new version
      const result = await client.query(
        `UPDATE project_documents SET
          file_url = $1,
          file_key = $2,
          file_size = $3,
          version = version + 1,
          version_notes = $4,
          updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          input.file_url,
          input.file_key,
          input.file_size,
          input.version_notes,
          documentId,
        ]
      );

      await client.query('COMMIT');

      const updatedDocument = result.rows[0];

      // Emit real-time update
      emitProjectUpdated(
        document.project_id,
        document.organization_id,
        { action: { old: '', new: 'document_version_uploaded' } } as any
      );

      return updatedDocument;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    const result = await pool.query(
      `SELECT * FROM document_versions
       WHERE document_id = $1
       ORDER BY version DESC`,
      [documentId]
    );
    return result.rows;
  }

  async revertToVersion(
    documentId: string,
    versionId: string,
    changedBy?: string
  ): Promise<ProjectDocument> {
    const version = await pool.query(
      'SELECT * FROM document_versions WHERE id = $1 AND document_id = $2',
      [versionId, documentId]
    );

    if (!version.rows[0]) {
      throw new Error('Version not found');
    }

    const versionData = version.rows[0];
    const document = await this.getDocumentById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Upload as new version (reverting means creating a new version with old content)
    return this.uploadNewVersion(documentId, {
      file_url: versionData.file_url,
      file_key: versionData.file_key,
      file_size: versionData.file_size,
      version_notes: `Reverted to version ${versionData.version}`,
      changed_by: changedBy,
    });
  }

  // --------------------------------------------------------------------------
  // DOCUMENT SHARING
  // --------------------------------------------------------------------------

  async createShare(input: CreateShareInput): Promise<DocumentShare> {
    const id = uuidv4();
    const shareToken = crypto.randomBytes(32).toString('hex');
    
    let passwordHash: string | null = null;
    if (input.password) {
      passwordHash = crypto
        .createHash('sha256')
        .update(input.password)
        .digest('hex');
    }

    const result = await pool.query(
      `INSERT INTO document_shares (
        id, document_id, share_token, expires_at,
        password_hash, max_downloads, recipient_email, recipient_name,
        can_download, can_view_only, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id,
        input.document_id,
        shareToken,
        input.expires_at,
        passwordHash,
        input.max_downloads,
        input.recipient_email,
        input.recipient_name,
        input.can_download ?? true,
        input.can_view_only ?? false,
        input.created_by,
      ]
    );

    return result.rows[0];
  }

  async getShareByToken(shareToken: string): Promise<DocumentShare | null> {
    const result = await pool.query(
      'SELECT * FROM document_shares WHERE share_token = $1',
      [shareToken]
    );
    return result.rows[0] || null;
  }

  async validateShare(
    shareToken: string,
    password?: string
  ): Promise<{ valid: boolean; document?: ProjectDocument; message?: string }> {
    const share = await this.getShareByToken(shareToken);
    
    if (!share) {
      return { valid: false, message: 'Share link not found' };
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return { valid: false, message: 'Share link has expired' };
    }

    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return { valid: false, message: 'Maximum downloads reached' };
    }

    if (share.password_hash) {
      if (!password) {
        return { valid: false, message: 'Password required' };
      }
      const inputHash = crypto
        .createHash('sha256')
        .update(password)
        .digest('hex');
      if (inputHash !== share.password_hash) {
        return { valid: false, message: 'Invalid password' };
      }
    }

    const document = await this.getDocumentById(share.document_id);
    if (!document || document.status !== 'active') {
      return { valid: false, message: 'Document not found' };
    }

    return { valid: true, document };
  }

  async recordShareAccess(
    shareToken: string,
    accessInfo: { ip?: string; userAgent?: string }
  ): Promise<void> {
    await pool.query(
      `UPDATE document_shares SET
        download_count = download_count + 1,
        last_accessed_at = NOW(),
        access_log = access_log || $1::jsonb
       WHERE share_token = $2`,
      [
        JSON.stringify({
          timestamp: new Date().toISOString(),
          ...accessInfo,
        }),
        shareToken,
      ]
    );
  }

  async deleteShare(shareId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM document_shares WHERE id = $1 RETURNING id',
      [shareId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getSharesByDocument(documentId: string): Promise<DocumentShare[]> {
    const result = await pool.query(
      'SELECT * FROM document_shares WHERE document_id = $1 ORDER BY created_at DESC',
      [documentId]
    );
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // TEMPLATES
  // --------------------------------------------------------------------------

  async getTemplates(
    organizationId?: string,
    category?: string,
    templateType?: string
  ): Promise<DocumentTemplate[]> {
    let query = `SELECT * FROM document_templates 
                 WHERE is_active = true 
                 AND (organization_id IS NULL OR organization_id = $1)`;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (templateType) {
      query += ` AND template_type = $${paramIndex}`;
      params.push(templateType);
      paramIndex++;
    }

    query += ' ORDER BY is_system DESC, name';

    const result = await pool.query(query, params);
    return result.rows;
  }

  async getTemplateById(templateId: string): Promise<DocumentTemplate | null> {
    const result = await pool.query(
      'SELECT * FROM document_templates WHERE id = $1',
      [templateId]
    );
    return result.rows[0] || null;
  }

  // --------------------------------------------------------------------------
  // EXPIRING DOCUMENTS
  // --------------------------------------------------------------------------

  async getExpiringDocuments(
    organizationId: string,
    daysAhead: number = 30
  ): Promise<(ProjectDocument & { project_name: string })[]> {
    const result = await pool.query(
      `SELECT pd.*, dp.name as project_name
       FROM project_documents pd
       JOIN development_projects dp ON pd.project_id = dp.id
       WHERE pd.organization_id = $1
         AND pd.expiration_date IS NOT NULL
         AND pd.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * $2
         AND pd.status = 'active'
       ORDER BY pd.expiration_date ASC`,
      [organizationId, daysAhead]
    );
    return result.rows;
  }

  async getExpiredDocuments(
    organizationId: string
  ): Promise<(ProjectDocument & { project_name: string })[]> {
    const result = await pool.query(
      `SELECT pd.*, dp.name as project_name
       FROM project_documents pd
       JOIN development_projects dp ON pd.project_id = dp.id
       WHERE pd.organization_id = $1
         AND pd.expiration_date IS NOT NULL
         AND pd.expiration_date < CURRENT_DATE
         AND pd.status = 'active'
       ORDER BY pd.expiration_date DESC`,
      [organizationId]
    );
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  async getDocumentStats(projectId: string): Promise<{
    total_documents: number;
    by_type: Record<string, number>;
    by_folder: { folder_id: string; folder_name: string; count: number }[];
    total_size_bytes: number;
    recent_uploads: ProjectDocument[];
  }> {
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as total_size
       FROM project_documents 
       WHERE project_id = $1 AND status = 'active' AND is_current = true`,
      [projectId]
    );

    const byTypeResult = await pool.query(
      `SELECT document_type, COUNT(*) as count
       FROM project_documents 
       WHERE project_id = $1 AND status = 'active' AND is_current = true
       GROUP BY document_type`,
      [projectId]
    );

    const byFolderResult = await pool.query(
      `SELECT pf.id as folder_id, pf.name as folder_name, COUNT(pd.id) as count
       FROM project_folders pf
       LEFT JOIN project_documents pd ON pd.folder_id = pf.id AND pd.status = 'active' AND pd.is_current = true
       WHERE pf.project_id = $1
       GROUP BY pf.id, pf.name
       ORDER BY pf.sort_order`,
      [projectId]
    );

    const recentResult = await pool.query(
      `SELECT * FROM project_documents
       WHERE project_id = $1 AND status = 'active' AND is_current = true
       ORDER BY created_at DESC
       LIMIT 5`,
      [projectId]
    );

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      byType[row.document_type || 'other'] = parseInt(row.count);
    }

    return {
      total_documents: parseInt(totalResult.rows[0].total),
      by_type: byType,
      by_folder: byFolderResult.rows.map((r) => ({
        folder_id: r.folder_id,
        folder_name: r.folder_name,
        count: parseInt(r.count),
      })),
      total_size_bytes: parseInt(totalResult.rows[0].total_size),
      recent_uploads: recentResult.rows,
    };
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private async findFolderByDocumentType(
    projectId: string,
    documentType: DocumentType
  ): Promise<string | null> {
    const typeToFolderMap: Record<string, string> = {
      land_title: 'land_legal',
      indenture: 'land_legal',
      consent_letter: 'land_legal',
      site_plan: 'land_legal',
      survey_report: 'land_legal',
      traditional_authority_letter: 'land_legal',
      stool_lands_consent: 'land_legal',
      lease_agreement: 'land_legal',
      development_permit: 'permits',
      building_permit: 'permits',
      epa_permit: 'permits',
      fire_certificate: 'permits',
      occupancy_certificate: 'permits',
      commencement_permit: 'permits',
      architectural_drawing: 'architectural',
      structural_drawing: 'structural',
      mep_drawing: 'mep',
      as_built_drawing: 'as_built',
      main_contract: 'contracts',
      subcontract: 'contracts',
      consultant_agreement: 'contracts',
      vendor_agreement: 'contracts',
      budget_document: 'budget',
      invoice: 'invoices',
      receipt: 'receipts',
      daily_log: 'site_reports',
      weekly_report: 'site_reports',
      monthly_report: 'site_reports',
      progress_report: 'site_reports',
      inspection_report: 'site_reports',
      brochure: 'marketing',
      floor_plan: 'marketing',
      render: 'marketing',
      photography: 'marketing',
      snag_list: 'handover',
      warranty_document: 'handover',
      operation_manual: 'handover',
      handover_certificate: 'handover',
    };

    const folderType = typeToFolderMap[documentType];
    if (!folderType) return null;

    const result = await pool.query(
      `SELECT id FROM project_folders 
       WHERE project_id = $1 AND folder_type = $2 
       LIMIT 1`,
      [projectId, folderType]
    );

    return result.rows[0]?.id || null;
  }

  async recordDocumentAccess(
    documentId: string,
    userId: string
  ): Promise<void> {
    await pool.query(
      `UPDATE project_documents SET
        last_accessed_at = NOW(),
        last_accessed_by = $1
       WHERE id = $2`,
      [userId, documentId]
    );
  }
}

// Export singleton
export const projectDocumentService = new ProjectDocumentService();
