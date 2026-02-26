/**
 * Documents Module
 * 
 * Phase 3.10: Split projectDocumentService (1177 lines → 5 focused services)
 * 
 * Architecture:
 * - FolderService: Folder hierarchy management
 * - DocumentCrudService: Core document operations
 * - DocumentVersionService: Version control
 * - DocumentSharingService: Share links and access
 * - DocumentTemplateService: Document templates
 * 
 * @module services/project-management/documents
 */

// Types
export * from './types';

// Individual Services
export { folderService } from './FolderService';
export { documentCrudService } from './DocumentCrudService';
export { documentVersionService } from './DocumentVersionService';
export { documentSharingService } from './DocumentSharingService';
export { documentTemplateService } from './DocumentTemplateService';

// =============================================================================
// FACADE
// =============================================================================

import { folderService } from './FolderService';
import { documentCrudService } from './DocumentCrudService';
import { documentVersionService } from './DocumentVersionService';
import { documentSharingService } from './DocumentSharingService';
import { documentTemplateService } from './DocumentTemplateService';
import {
  ProjectFolder,
  ProjectDocument,
  DocumentVersion,
  DocumentShare,
  DocumentTemplate,
  CreateFolderInput,
  UpdateFolderInput,
  CreateDocumentInput,
  UpdateDocumentInput,
  UploadNewVersionInput,
  CreateShareInput,
  DocumentFilters,
  DocumentStats,
} from './types';

/**
 * Facade for document operations
 * 
 * Provides a unified API for working with project documents,
 * delegating to specialized services internally.
 */
export const documentsFacade = {
  // ==========================================================================
  // FOLDER OPERATIONS
  // ==========================================================================

  /**
   * Create a new folder
   */
  createFolder(input: CreateFolderInput): Promise<ProjectFolder> {
    return folderService.createFolder(input);
  },

  /**
   * Get folders by project
   */
  getFoldersByProject(projectId: string): Promise<ProjectFolder[]> {
    return folderService.getFoldersByProject(projectId);
  },

  /**
   * Get folder tree structure
   */
  getFolderTree(projectId: string): Promise<ProjectFolder[]> {
    return folderService.getFolderTree(projectId);
  },

  /**
   * Get folder by ID
   */
  getFolderById(folderId: string): Promise<ProjectFolder | null> {
    return folderService.getFolderById(folderId);
  },

  /**
   * Update folder
   */
  updateFolder(folderId: string, input: UpdateFolderInput): Promise<ProjectFolder | null> {
    return folderService.updateFolder(folderId, input);
  },

  /**
   * Delete folder
   */
  deleteFolder(folderId: string, moveDocumentsTo?: string): Promise<boolean> {
    return folderService.deleteFolder(folderId, moveDocumentsTo);
  },

  /**
   * Initialize default folders for a project
   */
  initializeDefaultFolders(projectId: string, organizationId: string, createdBy?: string) {
    return folderService.initializeDefaultFolders(projectId, organizationId, createdBy);
  },

  // ==========================================================================
  // DOCUMENT OPERATIONS
  // ==========================================================================

  /**
   * Create a new document
   */
  createDocument(input: CreateDocumentInput): Promise<ProjectDocument> {
    return documentCrudService.createDocument(input);
  },

  /**
   * Get document by ID
   */
  getDocumentById(documentId: string): Promise<ProjectDocument | null> {
    return documentCrudService.getDocumentById(documentId);
  },

  /**
   * Get documents by project with filters
   */
  getDocumentsByProject(filters: DocumentFilters): Promise<ProjectDocument[]> {
    return documentCrudService.getDocumentsByProject(filters);
  },

  /**
   * Get documents by folder
   */
  getDocumentsByFolder(folderId: string): Promise<ProjectDocument[]> {
    return documentCrudService.getDocumentsByFolder(folderId);
  },

  /**
   * Update document
   */
  updateDocument(documentId: string, input: UpdateDocumentInput): Promise<ProjectDocument | null> {
    return documentCrudService.updateDocument(documentId, input);
  },

  /**
   * Delete document
   */
  deleteDocument(documentId: string, hardDelete?: boolean): Promise<boolean> {
    return documentCrudService.deleteDocument(documentId, hardDelete);
  },

  /**
   * Archive document
   */
  archiveDocument(documentId: string): Promise<ProjectDocument | null> {
    return documentCrudService.archiveDocument(documentId);
  },

  /**
   * Restore document
   */
  restoreDocument(documentId: string): Promise<ProjectDocument | null> {
    return documentCrudService.restoreDocument(documentId);
  },

  /**
   * Get expiring documents
   */
  getExpiringDocuments(projectId: string, withinDays?: number): Promise<ProjectDocument[]> {
    return documentCrudService.getExpiringDocuments(projectId, withinDays);
  },

  /**
   * Get expired documents
   */
  getExpiredDocuments(projectId: string): Promise<ProjectDocument[]> {
    return documentCrudService.getExpiredDocuments(projectId);
  },

  /**
   * Get document statistics
   */
  getDocumentStats(projectId: string): Promise<DocumentStats> {
    return documentCrudService.getDocumentStats(projectId);
  },

  /**
   * Record document access
   */
  recordDocumentAccess(documentId: string, userId: string): Promise<void> {
    return documentCrudService.recordDocumentAccess(documentId, userId);
  },

  // ==========================================================================
  // VERSION OPERATIONS
  // ==========================================================================

  /**
   * Upload new version
   */
  uploadNewVersion(documentId: string, input: UploadNewVersionInput): Promise<ProjectDocument | null> {
    return documentVersionService.uploadNewVersion(documentId, input);
  },

  /**
   * Get version history
   */
  getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    return documentVersionService.getDocumentVersions(documentId);
  },

  /**
   * Revert to previous version
   */
  revertToVersion(documentId: string, versionId: string, changedBy?: string): Promise<ProjectDocument | null> {
    return documentVersionService.revertToVersion(documentId, versionId, changedBy);
  },

  /**
   * Compare versions
   */
  compareVersions(documentId: string, versionA: number, versionB: number) {
    return documentVersionService.compareVersions(documentId, versionA, versionB);
  },

  // ==========================================================================
  // SHARING OPERATIONS
  // ==========================================================================

  /**
   * Create share link
   */
  createShare(input: CreateShareInput): Promise<DocumentShare> {
    return documentSharingService.createShare(input);
  },

  /**
   * Get share by token
   */
  getShareByToken(shareToken: string): Promise<DocumentShare | null> {
    return documentSharingService.getShareByToken(shareToken);
  },

  /**
   * Validate share access
   */
  validateShare(shareToken: string, password?: string) {
    return documentSharingService.validateShare(shareToken, password);
  },

  /**
   * Record share access
   */
  recordShareAccess(shareToken: string, accessInfo: { ip?: string; userAgent?: string; isDownload?: boolean }) {
    return documentSharingService.recordShareAccess(shareToken, accessInfo);
  },

  /**
   * Delete share
   */
  deleteShare(shareId: string): Promise<boolean> {
    return documentSharingService.deleteShare(shareId);
  },

  /**
   * Get shares by document
   */
  getSharesByDocument(documentId: string): Promise<DocumentShare[]> {
    return documentSharingService.getSharesByDocument(documentId);
  },

  // ==========================================================================
  // TEMPLATE OPERATIONS
  // ==========================================================================

  /**
   * Get templates
   */
  getTemplates(filters?: Parameters<typeof documentTemplateService.getTemplates>[0]): Promise<DocumentTemplate[]> {
    return documentTemplateService.getTemplates(filters);
  },

  /**
   * Get template by ID
   */
  getTemplateById(templateId: string): Promise<DocumentTemplate | null> {
    return documentTemplateService.getTemplateById(templateId);
  },

  /**
   * Get Ghana-specific templates
   */
  getGhanaTemplates(region?: string): Promise<DocumentTemplate[]> {
    return documentTemplateService.getGhanaTemplates(region);
  },

  /**
   * Get template categories
   */
  getTemplateCategories() {
    return documentTemplateService.getTemplateCategories();
  },
};

// Default export for convenience
export default documentsFacade;
