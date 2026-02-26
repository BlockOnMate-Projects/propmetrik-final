/**
 * Folder Service
 * 
 * Phase 3.10: Split projectDocumentService
 * 
 * Manages document folder hierarchy:
 * - Create, update, delete folders
 * - Build folder tree structures
 * - System folder initialization
 * 
 * @module services/project-management/documents/FolderService
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  ProjectFolder,
  CreateFolderInput,
  UpdateFolderInput,
  mapRowToFolder,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class FolderServiceImpl extends BaseService {
  constructor() {
    super('FolderService');
  }

  /**
   * Create a new folder
   */
  async createFolder(input: CreateFolderInput): Promise<ProjectFolder> {
    const id = uuidv4();
    
    // Get next sort order if not specified
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const maxResult = await this.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
         FROM project_folders
         WHERE project_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
        [input.projectId, input.parentId]
      );
      sortOrder = maxResult.rows[0].next_order;
    }

    const result = await this.query(
      `INSERT INTO project_folders (
         id, project_id, organization_id, parent_id,
         name, description, folder_type, icon, color,
         sort_order, is_system, auto_categorize, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, false, $11)
       RETURNING *`,
      [
        id,
        input.projectId,
        input.organizationId,
        input.parentId,
        input.name,
        input.description,
        input.folderType,
        input.icon,
        input.color,
        sortOrder,
        input.createdBy,
      ]
    );

    return mapRowToFolder(result.rows[0]);
  }

  /**
   * Get all folders for a project (flat list)
   */
  async getFoldersByProject(projectId: string): Promise<ProjectFolder[]> {
    const result = await this.query(
      `SELECT f.*, COUNT(d.id) as document_count
       FROM project_folders f
       LEFT JOIN project_documents d ON f.id = d.folder_id AND d.status = 'active'
       WHERE f.project_id = $1
       GROUP BY f.id
       ORDER BY f.sort_order`,
      [projectId]
    );

    return result.rows.map(mapRowToFolder);
  }

  /**
   * Get folder tree structure
   */
  async getFolderTree(projectId: string): Promise<ProjectFolder[]> {
    const folders = await this.getFoldersByProject(projectId);
    return this.buildTree(folders);
  }

  /**
   * Build tree from flat folder list
   */
  private buildTree(folders: ProjectFolder[], parentId?: string): ProjectFolder[] {
    return folders
      .filter(f => f.parentId === parentId)
      .map(folder => ({
        ...folder,
        children: this.buildTree(folders, folder.id),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Get a specific folder by ID
   */
  async getFolderById(folderId: string): Promise<ProjectFolder | null> {
    const result = await this.query(
      `SELECT f.*, COUNT(d.id) as document_count
       FROM project_folders f
       LEFT JOIN project_documents d ON f.id = d.folder_id AND d.status = 'active'
       WHERE f.id = $1
       GROUP BY f.id`,
      [folderId]
    );

    return result.rows[0] ? mapRowToFolder(result.rows[0]) : null;
  }

  /**
   * Update a folder
   */
  async updateFolder(folderId: string, input: UpdateFolderInput): Promise<ProjectFolder | null> {
    const folder = await this.getFolderById(folderId);
    if (!folder) {
      return null;
    }

    // Don't allow renaming system folders
    if (folder.isSystem && input.name && input.name !== folder.name) {
      throw new Error('Cannot rename system folders');
    }

    // Prevent circular parent references
    if (input.parentId) {
      const descendants = await this.getFolderDescendants(folderId);
      if (descendants.includes(input.parentId)) {
        throw new Error('Cannot move folder into its own descendant');
      }
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
    if (input.parentId !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      values.push(input.parentId || null);
    }
    if (input.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(input.icon);
    }
    if (input.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(input.color);
    }
    if (input.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(input.sortOrder);
    }

    if (updates.length === 0) {
      return folder;
    }

    updates.push(`updated_at = NOW()`);
    values.push(folderId);

    const result = await this.query(
      `UPDATE project_folders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return mapRowToFolder(result.rows[0]);
  }

  /**
   * Delete a folder
   */
  async deleteFolder(folderId: string, moveDocumentsTo?: string): Promise<boolean> {
    const folder = await this.getFolderById(folderId);
    if (!folder) {
      return false;
    }

    if (folder.isSystem) {
      throw new Error('Cannot delete system folders');
    }

    // Get all descendant folders
    const descendants = await this.getFolderDescendants(folderId);
    const allFolderIds = [folderId, ...descendants];

    return this.executeInTransaction(async (client) => {
      // Move documents to target folder or root
      await client.query(
        `UPDATE project_documents 
         SET folder_id = $1, updated_at = NOW()
         WHERE folder_id = ANY($2)`,
        [moveDocumentsTo || null, allFolderIds]
      );

      // Delete folders (children first due to foreign key constraints)
      for (const id of allFolderIds.reverse()) {
        await client.query('DELETE FROM project_folders WHERE id = $1', [id]);
      }

      return true;
    });
  }

  /**
   * Get all descendant folder IDs
   */
  async getFolderDescendants(folderId: string): Promise<string[]> {
    const result = await this.query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM project_folders WHERE parent_id = $1
         UNION ALL
         SELECT f.id FROM project_folders f
         JOIN descendants d ON f.parent_id = d.id
       )
       SELECT id FROM descendants`,
      [folderId]
    );

    return result.rows.map(r => r.id);
  }

  /**
   * Initialize default folders for a new project
   */
  async initializeDefaultFolders(
    projectId: string,
    organizationId: string,
    createdBy?: string
  ): Promise<ProjectFolder[]> {
    const defaultFolders = [
      { name: 'Land & Legal', folderType: 'legal', icon: 'scale', sortOrder: 1 },
      { name: 'Permits', folderType: 'permits', icon: 'badge-check', sortOrder: 2 },
      { name: 'Drawings', folderType: 'drawings', icon: 'pencil-ruler', sortOrder: 3 },
      { name: 'Contracts', folderType: 'contracts', icon: 'file-signature', sortOrder: 4 },
      { name: 'Financial', folderType: 'financial', icon: 'dollar-sign', sortOrder: 5 },
      { name: 'Reports', folderType: 'reports', icon: 'chart-bar', sortOrder: 6 },
      { name: 'Marketing', folderType: 'marketing', icon: 'megaphone', sortOrder: 7 },
      { name: 'Handover', folderType: 'handover', icon: 'key', sortOrder: 8 },
    ];

    const folders: ProjectFolder[] = [];

    for (const def of defaultFolders) {
      const result = await this.query(
        `INSERT INTO project_folders (
           id, project_id, organization_id, parent_id,
           name, folder_type, icon, sort_order, is_system, created_by
         ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, true, $8)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          uuidv4(),
          projectId,
          organizationId,
          def.name,
          def.folderType,
          def.icon,
          def.sortOrder,
          createdBy,
        ]
      );

      if (result.rows[0]) {
        folders.push(mapRowToFolder(result.rows[0]));
      }
    }

    return folders;
  }

  /**
   * Move folder to new parent
   */
  async moveFolder(folderId: string, newParentId: string | null): Promise<ProjectFolder | null> {
    return this.updateFolder(folderId, { parentId: newParentId ?? undefined });
  }

  /**
   * Reorder folders within same parent
   */
  async reorderFolders(folderIds: string[]): Promise<void> {
    await this.executeInTransaction(async (client) => {
      for (let i = 0; i < folderIds.length; i++) {
        await client.query(
          'UPDATE project_folders SET sort_order = $1, updated_at = NOW() WHERE id = $2',
          [i + 1, folderIds[i]]
        );
      }
    });
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const folderService = new FolderServiceImpl();
