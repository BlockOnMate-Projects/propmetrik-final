/**
 * Document Version Service
 * 
 * Phase 3.10: Split projectDocumentService
 * 
 * Manages document versioning:
 * - Upload new versions
 * - Version history
 * - Revert to previous versions
 * 
 * @module services/project-management/documents/DocumentVersionService
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  ProjectDocument,
  DocumentVersion,
  UploadNewVersionInput,
  mapRowToDocument,
  mapRowToVersion,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class DocumentVersionServiceImpl extends BaseService {
  constructor() {
    super('DocumentVersionService');
  }

  /**
   * Upload a new version of a document
   */
  async uploadNewVersion(
    documentId: string,
    input: UploadNewVersionInput
  ): Promise<ProjectDocument | null> {
    const document = await this.getDocument(documentId);
    if (!document) {
      return null;
    }

    return this.executeInTransaction(async (client) => {
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
          document.fileUrl,
          document.fileKey,
          document.fileSize,
          `Version ${document.version}`,
          input.changedBy,
          JSON.stringify(document.metadata),
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
           previous_version_id = $5,
           updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          input.fileUrl,
          input.fileKey,
          input.fileSize,
          input.versionNotes,
          document.id,
          documentId,
        ]
      );

      return mapRowToDocument(result.rows[0]);
    });
  }

  /**
   * Get version history for a document
   */
  async getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    const result = await this.query(
      `SELECT * FROM document_versions
       WHERE document_id = $1
       ORDER BY version DESC`,
      [documentId]
    );

    return result.rows.map(mapRowToVersion);
  }

  /**
   * Get a specific version
   */
  async getVersion(versionId: string): Promise<DocumentVersion | null> {
    const result = await this.query(
      'SELECT * FROM document_versions WHERE id = $1',
      [versionId]
    );

    return result.rows[0] ? mapRowToVersion(result.rows[0]) : null;
  }

  /**
   * Revert document to a previous version
   */
  async revertToVersion(
    documentId: string,
    versionId: string,
    changedBy?: string
  ): Promise<ProjectDocument | null> {
    const version = await this.getVersion(versionId);
    if (!version || version.documentId !== documentId) {
      return null;
    }

    const document = await this.getDocument(documentId);
    if (!document) {
      return null;
    }

    return this.executeInTransaction(async (client) => {
      // Save current as new version first
      await client.query(
        `INSERT INTO document_versions (
           id, document_id, version, file_url, file_key, file_size,
           change_summary, changed_by, metadata_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuidv4(),
          documentId,
          document.version,
          document.fileUrl,
          document.fileKey,
          document.fileSize,
          `Before revert to v${version.version}`,
          changedBy,
          JSON.stringify(document.metadata),
        ]
      );

      // Revert to the selected version
      const result = await client.query(
        `UPDATE project_documents SET
           file_url = $1,
           file_key = $2,
           file_size = $3,
           version = version + 1,
           version_notes = $4,
           metadata = $5,
           updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          version.fileUrl,
          version.fileKey,
          version.fileSize,
          `Reverted to version ${version.version}`,
          JSON.stringify(version.metadataSnapshot || {}),
          documentId,
        ]
      );

      return mapRowToDocument(result.rows[0]);
    });
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    documentId: string,
    versionA: number,
    versionB: number
  ): Promise<{
    versionA: DocumentVersion | null;
    versionB: DocumentVersion | null;
    differences: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  }> {
    const result = await this.query(
      `SELECT * FROM document_versions
       WHERE document_id = $1 AND version IN ($2, $3)
       ORDER BY version`,
      [documentId, versionA, versionB]
    );

    const versions = result.rows.map(mapRowToVersion);
    const verA = versions.find(v => v.version === versionA) || null;
    const verB = versions.find(v => v.version === versionB) || null;

    const differences: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    if (verA && verB) {
      // Compare file sizes
      if (verA.fileSize !== verB.fileSize) {
        differences.push({
          field: 'fileSize',
          oldValue: verA.fileSize,
          newValue: verB.fileSize,
        });
      }

      // Compare metadata snapshots
      const metaA = verA.metadataSnapshot || {};
      const metaB = verB.metadataSnapshot || {};
      const allKeys = new Set([...Object.keys(metaA), ...Object.keys(metaB)]);

      for (const key of allKeys) {
        if (JSON.stringify(metaA[key]) !== JSON.stringify(metaB[key])) {
          differences.push({
            field: `metadata.${key}`,
            oldValue: metaA[key],
            newValue: metaB[key],
          });
        }
      }
    }

    return { versionA: verA, versionB: verB, differences };
  }

  /**
   * Delete old versions (keep only last N)
   */
  async pruneVersions(documentId: string, keepCount = 10): Promise<number> {
    const result = await this.query(
      `DELETE FROM document_versions
       WHERE document_id = $1
       AND id NOT IN (
         SELECT id FROM document_versions
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT $2
       )
       RETURNING id`,
      [documentId, keepCount]
    );

    return result.rowCount ?? 0;
  }

  // =============================================================================

  private async getDocument(documentId: string): Promise<ProjectDocument | null> {
    const result = await this.query(
      'SELECT * FROM project_documents WHERE id = $1',
      [documentId]
    );

    return result.rows[0] ? mapRowToDocument(result.rows[0]) : null;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const documentVersionService = new DocumentVersionServiceImpl();
