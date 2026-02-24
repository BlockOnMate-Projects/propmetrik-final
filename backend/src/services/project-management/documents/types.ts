/**
 * Project Documents Module - Type Definitions
 * 
 * Phase 3.10: Split projectDocumentService (1177 lines → 4 focused services)
 * 
 * @module services/project-management/documents/types
 */

// =============================================================================
// DOCUMENT TYPES
// =============================================================================

export type DocumentType =
  // Land & Legal
  | 'land_title'
  | 'indenture'
  | 'consent_letter'
  | 'site_plan'
  | 'survey_report'
  | 'traditional_authority_letter'
  | 'stool_lands_consent'
  | 'lease_agreement'
  // Permits
  | 'development_permit'
  | 'building_permit'
  | 'epa_permit'
  | 'fire_certificate'
  | 'occupancy_certificate'
  | 'commencement_permit'
  // Drawings
  | 'architectural_drawing'
  | 'structural_drawing'
  | 'mep_drawing'
  | 'landscape_drawing'
  | 'as_built_drawing'
  | 'shop_drawing'
  | 'detail_drawing'
  // Contracts
  | 'main_contract'
  | 'subcontract'
  | 'consultant_agreement'
  | 'vendor_agreement'
  | 'variation_order'
  | 'completion_certificate'
  // Financial
  | 'budget_document'
  | 'invoice'
  | 'receipt'
  | 'payment_certificate'
  | 'bank_guarantee'
  | 'insurance_certificate'
  | 'valuation_report'
  // Reports
  | 'daily_log'
  | 'weekly_report'
  | 'monthly_report'
  | 'progress_report'
  | 'inspection_report'
  | 'test_report'
  | 'quality_report'
  // Marketing
  | 'brochure'
  | 'floor_plan'
  | 'render'
  | 'photography'
  | 'video'
  | 'sales_material'
  // Handover
  | 'snag_list'
  | 'warranty_document'
  | 'operation_manual'
  | 'maintenance_schedule'
  | 'key_register'
  | 'handover_certificate'
  // General
  | 'correspondence'
  | 'meeting_minutes'
  | 'specification'
  | 'schedule'
  | 'other';

export type AccessLevel = 'public' | 'team' | 'restricted' | 'confidential';

export type DocumentStatus = 'active' | 'archived' | 'deleted';

// =============================================================================
// FOLDER INTERFACES
// =============================================================================

export interface ProjectFolder {
  id: string;
  projectId: string;
  organizationId: string;
  parentId?: string;
  
  name: string;
  description?: string;
  folderType?: string;
  icon?: string;
  color?: string;
  
  sortOrder: number;
  isSystem: boolean;
  autoCategorize: boolean;
  
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  
  // Computed
  children?: ProjectFolder[];
  documentCount?: number;
}

export interface CreateFolderInput {
  projectId: string;
  organizationId: string;
  parentId?: string;
  name: string;
  description?: string;
  folderType?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  createdBy?: string;
}

export interface UpdateFolderInput {
  name?: string;
  description?: string;
  parentId?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

// =============================================================================
// DOCUMENT INTERFACES
// =============================================================================

export interface ProjectDocument {
  id: string;
  projectId: string;
  folderId?: string;
  organizationId: string;
  
  name: string;
  originalFilename?: string;
  description?: string;
  documentType?: DocumentType;
  
  fileUrl: string;
  fileKey?: string;
  thumbnailUrl?: string;
  fileSize?: number;
  mimeType?: string;
  
  version: number;
  isCurrent: boolean;
  previousVersionId?: string;
  versionNotes?: string;
  
  tags: string[];
  metadata: Record<string, unknown>;
  
  expirationDate?: string;
  expirationReminderDays: number;
  
  accessLevel: AccessLevel;
  sharedWith: string[];
  
  status: DocumentStatus;
  
  relatedPermitId?: string;
  relatedPhaseId?: string;
  relatedMilestoneId?: string;
  
  uploadedBy?: string;
  lastAccessedAt?: string;
  lastAccessedBy?: string;
  
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateDocumentInput {
  projectId: string;
  organizationId: string;
  folderId?: string;
  
  name: string;
  originalFilename?: string;
  description?: string;
  documentType?: DocumentType;
  
  fileUrl: string;
  fileKey?: string;
  thumbnailUrl?: string;
  fileSize?: number;
  mimeType?: string;
  
  tags?: string[];
  metadata?: Record<string, unknown>;
  
  expirationDate?: string;
  expirationReminderDays?: number;
  
  accessLevel?: AccessLevel;
  sharedWith?: string[];
  
  relatedPermitId?: string;
  relatedPhaseId?: string;
  relatedMilestoneId?: string;
  
  uploadedBy?: string;
}

export interface UpdateDocumentInput {
  name?: string;
  description?: string;
  folderId?: string;
  documentType?: DocumentType;
  
  tags?: string[];
  metadata?: Record<string, unknown>;
  
  expirationDate?: string;
  expirationReminderDays?: number;
  
  accessLevel?: AccessLevel;
  sharedWith?: string[];
  
  relatedPermitId?: string;
  relatedPhaseId?: string;
  relatedMilestoneId?: string;
}

// =============================================================================
// VERSION INTERFACES
// =============================================================================

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  fileUrl: string;
  fileKey?: string;
  fileSize?: number;
  changeSummary?: string;
  changedBy?: string;
  metadataSnapshot?: Record<string, unknown>;
  createdAt: string;
}

export interface UploadNewVersionInput {
  fileUrl: string;
  fileKey?: string;
  fileSize?: number;
  versionNotes?: string;
  changedBy?: string;
}

// =============================================================================
// SHARING INTERFACES
// =============================================================================

export interface DocumentShare {
  id: string;
  documentId: string;
  shareToken: string;
  shareUrl?: string;
  expiresAt?: string;
  passwordHash?: string;
  maxDownloads?: number;
  downloadCount: number;
  recipientEmail?: string;
  recipientName?: string;
  canDownload: boolean;
  canViewOnly: boolean;
  lastAccessedAt?: string;
  accessLog: Array<{
    accessedAt: string;
    ip?: string;
    userAgent?: string;
  }>;
  createdBy?: string;
  createdAt: string;
}

export interface CreateShareInput {
  documentId: string;
  expiresAt?: string;
  password?: string;
  maxDownloads?: number;
  recipientEmail?: string;
  recipientName?: string;
  canDownload?: boolean;
  canViewOnly?: boolean;
  createdBy?: string;
}

// =============================================================================
// TEMPLATE INTERFACES
// =============================================================================

export interface DocumentTemplate {
  id: string;
  organizationId?: string;
  name: string;
  description?: string;
  templateType: string;
  category?: string;
  templateUrl?: string;
  templateContent?: string;
  format?: string;
  variables: Array<{
    name: string;
    type: string;
    required?: boolean;
    defaultValue?: unknown;
  }>;
  previewUrl?: string;
  thumbnailUrl?: string;
  isGhanaSpecific: boolean;
  applicableRegions?: string[];
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// FILTER & QUERY INTERFACES
// =============================================================================

export interface DocumentFilters {
  projectId: string;
  folderId?: string;
  documentType?: DocumentType | DocumentType[];
  tags?: string[];
  status?: DocumentStatus;
  expiringWithinDays?: number;
  search?: string;
}

export interface DocumentStats {
  totalDocuments: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byAccessLevel: Record<string, number>;
  totalSize: number;
  expiringCount: number;
  expiredCount: number;
  sharedCount: number;
}

// =============================================================================
// ROW MAPPERS
// =============================================================================

export function mapRowToFolder(row: any): ProjectFolder {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    parentId: row.parent_id,
    name: row.name,
    description: row.description,
    folderType: row.folder_type,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order ?? 0,
    isSystem: row.is_system ?? false,
    autoCategorize: row.auto_categorize ?? false,
    createdBy: row.created_by,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    documentCount: row.document_count ? parseInt(row.document_count) : undefined,
  };
}

export function mapRowToDocument(row: any): ProjectDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    folderId: row.folder_id,
    organizationId: row.organization_id,
    name: row.name,
    originalFilename: row.original_filename,
    description: row.description,
    documentType: row.document_type,
    fileUrl: row.file_url,
    fileKey: row.file_key,
    thumbnailUrl: row.thumbnail_url,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    version: row.version ?? 1,
    isCurrent: row.is_current ?? true,
    previousVersionId: row.previous_version_id,
    versionNotes: row.version_notes,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    expirationDate: row.expiration_date?.toISOString().split('T')[0],
    expirationReminderDays: row.expiration_reminder_days ?? 30,
    accessLevel: row.access_level ?? 'team',
    sharedWith: row.shared_with ?? [],
    status: row.status ?? 'active',
    relatedPermitId: row.related_permit_id,
    relatedPhaseId: row.related_phase_id,
    relatedMilestoneId: row.related_milestone_id,
    uploadedBy: row.uploaded_by,
    lastAccessedAt: row.last_accessed_at?.toISOString(),
    lastAccessedBy: row.last_accessed_by,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    deletedAt: row.deleted_at?.toISOString(),
  };
}

export function mapRowToVersion(row: any): DocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    version: row.version,
    fileUrl: row.file_url,
    fileKey: row.file_key,
    fileSize: row.file_size,
    changeSummary: row.change_summary,
    changedBy: row.changed_by,
    metadataSnapshot: row.metadata_snapshot,
    createdAt: row.created_at?.toISOString(),
  };
}

export function mapRowToShare(row: any): DocumentShare {
  return {
    id: row.id,
    documentId: row.document_id,
    shareToken: row.share_token,
    shareUrl: row.share_url,
    expiresAt: row.expires_at?.toISOString(),
    passwordHash: row.password_hash,
    maxDownloads: row.max_downloads,
    downloadCount: row.download_count ?? 0,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    canDownload: row.can_download ?? true,
    canViewOnly: row.can_view_only ?? false,
    lastAccessedAt: row.last_accessed_at?.toISOString(),
    accessLog: row.access_log ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at?.toISOString(),
  };
}

export function mapRowToTemplate(row: any): DocumentTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    templateType: row.template_type,
    category: row.category,
    templateUrl: row.template_url,
    templateContent: row.template_content,
    format: row.format,
    variables: row.variables ?? [],
    previewUrl: row.preview_url,
    thumbnailUrl: row.thumbnail_url,
    isGhanaSpecific: row.is_ghana_specific ?? false,
    applicableRegions: row.applicable_regions,
    isActive: row.is_active ?? true,
    isSystem: row.is_system ?? false,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}
