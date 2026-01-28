/**
 * Photos Module - Type Definitions
 * 
 * Phase 3.7: Split photoService (1207 lines)
 * 
 * Shared types for photo documentation:
 * - Photo categories and statuses
 * - DTOs for CRUD operations
 * - Album and comparison types
 * - Share link options
 * 
 * @module services/project-management/photos/types
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Photo categories for construction documentation
 */
export type PhotoCategory = 
  | 'progress'          // Construction progress documentation
  | 'issue'             // Issue/problem documentation
  | 'safety'            // Safety hazards or compliance
  | 'quality'           // Quality control documentation
  | 'delivery'          // Material/equipment deliveries
  | 'inspection'        // Inspection documentation
  | 'before_after'      // Before/after comparison pairs
  | 'equipment'         // Equipment documentation
  | 'materials'         // Materials on site
  | 'weather'           // Weather conditions
  | 'milestone'         // Milestone achievements
  | 'documentation'     // General documentation
  | 'other';

/**
 * Photo review status
 */
export type PhotoStatus = 'pending' | 'approved' | 'rejected' | 'archived';

/**
 * Annotation types for comments
 */
export type AnnotationType = 'pin' | 'arrow' | 'circle' | 'rectangle' | 'polygon';

// =============================================================================
// PHOTO INTERFACES
// =============================================================================

/**
 * Full photo record
 */
export interface Photo {
  id: string;
  projectId: string;
  organizationId: string;
  phaseId?: string;
  unitId?: string;
  title: string;
  description?: string;
  category: PhotoCategory;
  status: PhotoStatus;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  // Geolocation
  latitude?: number;
  longitude?: number;
  altitude?: number;
  accuracy?: number;
  locationName?: string;
  // Device metadata
  deviceMake?: string;
  deviceModel?: string;
  takenAt?: string;
  exifData?: Record<string, any>;
  // Tags
  manualTags: string[];
  aiTags: string[];
  aiConfidence?: number;
  // Relations
  relatedRfiId?: string;
  relatedPunchId?: string;
  relatedDailyLogId?: string;
  relatedSubmittalId?: string;
  // Audit
  uploadedBy: string;
  uploadedByName?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Create photo input
 */
export interface CreatePhotoInput {
  projectId: string;
  organizationId: string;
  phaseId?: string;
  unitId?: string;
  title: string;
  description?: string;
  category: PhotoCategory;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  accuracy?: number;
  locationName?: string;
  deviceMake?: string;
  deviceModel?: string;
  takenAt?: Date;
  exifData?: Record<string, any>;
  manualTags?: string[];
  relatedRfiId?: string;
  relatedPunchId?: string;
  relatedDailyLogId?: string;
  relatedSubmittalId?: string;
  uploadedBy: string;
}

/**
 * Update photo input
 */
export interface UpdatePhotoInput {
  title?: string;
  description?: string;
  category?: PhotoCategory;
  status?: PhotoStatus;
  manualTags?: string[];
  phaseId?: string;
  unitId?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  relatedRfiId?: string;
  relatedPunchId?: string;
  relatedDailyLogId?: string;
  relatedSubmittalId?: string;
}

/**
 * Photo filter parameters
 */
export interface PhotoFilters {
  projectId?: string;
  phaseId?: string;
  unitId?: string;
  category?: PhotoCategory | PhotoCategory[];
  status?: PhotoStatus | PhotoStatus[];
  uploadedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  hasGeoTag?: boolean;
  search?: string;
}

// =============================================================================
// ALBUM INTERFACES
// =============================================================================

/**
 * Photo album record
 */
export interface Album {
  id: string;
  projectId: string;
  organizationId: string;
  name: string;
  description?: string;
  coverPhotoId?: string;
  coverPhotoPath?: string;
  isPublic: boolean;
  isFeatured: boolean;
  sortOrder: number;
  photoCount: number;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Create album input
 */
export interface CreateAlbumInput {
  projectId: string;
  organizationId: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  createdBy: string;
}

/**
 * Update album input
 */
export interface UpdateAlbumInput {
  name?: string;
  description?: string;
  coverPhotoId?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
}

// =============================================================================
// COMPARISON INTERFACES
// =============================================================================

/**
 * Before/after comparison record
 */
export interface PhotoComparison {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  beforePhotoId: string;
  beforePhotoPath: string;
  beforeThumbnailPath?: string;
  beforePhotoTitle: string;
  beforeTakenAt?: string;
  beforeLatitude?: number;
  beforeLongitude?: number;
  afterPhotoId: string;
  afterPhotoPath: string;
  afterThumbnailPath?: string;
  afterPhotoTitle: string;
  afterTakenAt?: string;
  afterLatitude?: number;
  afterLongitude?: number;
  comparisonDate: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

/**
 * Create comparison input
 */
export interface CreateComparisonInput {
  projectId: string;
  title: string;
  description?: string;
  beforePhotoId: string;
  afterPhotoId: string;
  comparisonDate?: string;
  createdBy: string;
}

// =============================================================================
// COMMENT INTERFACES
// =============================================================================

/**
 * Photo comment with annotation
 */
export interface PhotoComment {
  id: string;
  photoId: string;
  comment: string;
  annotationX?: number;
  annotationY?: number;
  annotationType?: AnnotationType;
  annotationData?: Record<string, any>;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Create comment input
 */
export interface CreateCommentInput {
  photoId: string;
  comment: string;
  annotationX?: number;
  annotationY?: number;
  annotationType?: AnnotationType;
  annotationData?: Record<string, any>;
  createdBy: string;
}

// =============================================================================
// SHARE LINK INTERFACES
// =============================================================================

/**
 * Share link record
 */
export interface ShareLink {
  id: string;
  photoId?: string;
  albumId?: string;
  shareToken: string;
  shareUrl: string;
  expiresAt?: string;
  hasPassword: boolean;
  maxViews?: number;
  viewCount: number;
  allowDownload: boolean;
  createdBy: string;
  lastAccessedAt?: string;
  createdAt: string;
}

/**
 * Share link creation options
 */
export interface ShareLinkOptions {
  expiresInDays?: number;
  password?: string;
  maxViews?: number;
  allowDownload?: boolean;
}

/**
 * Share link content result
 */
export interface ShareLinkContent {
  type: 'photo' | 'album';
  content: Photo | Album;
  allowDownload: boolean;
}

// =============================================================================
// STATISTICS INTERFACES
// =============================================================================

/**
 * Project photo statistics
 */
export interface PhotoStats {
  totalPhotos: number;
  progressPhotos: number;
  issuePhotos: number;
  safetyPhotos: number;
  qualityPhotos: number;
  milestonePhotos: number;
  pendingPhotos: number;
  approvedPhotos: number;
  geotaggedPhotos: number;
  albumCount: number;
  comparisonCount: number;
}

/**
 * Photo timeline entry
 */
export interface PhotoTimelineEntry {
  photoDate: string;
  photoCount: number;
  categories: PhotoCategory[];
  photos: Array<{
    id: string;
    title: string;
    category: PhotoCategory;
    thumbnailPath?: string;
  }>;
}

// =============================================================================
// PAGINATION
// =============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}
