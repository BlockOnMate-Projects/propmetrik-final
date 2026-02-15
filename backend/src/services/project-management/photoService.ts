/**
 * Photo Documentation Service
 * Phase 3A Week 3: Site Photo Management with Geo-tagging
 * 
 * Provides:
 * - Photo upload with geo-tagging
 * - Album management
 * - Photo categorization and tagging
 * - Before/after comparisons
 * - Share link generation
 * - Photo search and filtering
 * 
 * @deprecated This monolithic service has been split into focused modules.
 * Import from 'photos/' instead:
 * 
 * - photoUploadService - CRUD, approval workflow, stats
 * - photoOrganizationService - Albums, comparisons, share links
 * - photoAnnotationService - Comments, tags, AI tagging
 * - photosFacade - Unified access (backward compatible)
 * 
 * @see photos/PhotoUploadService.ts
 * @see photos/PhotoOrganizationService.ts
 * @see photos/PhotoAnnotationService.ts
 * @see photos/index.ts
 * 
 * @module services/project-management/photoService
 */

import { logger } from '../../utils/logger';
import db from '../../database';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type PhotoCategory = 
  | 'progress'
  | 'issue'
  | 'safety'
  | 'quality'
  | 'delivery'
  | 'inspection'
  | 'before_after'
  | 'equipment'
  | 'materials'
  | 'weather'
  | 'milestone'
  | 'documentation'
  | 'other';

export type PhotoStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export interface CreatePhotoDTO {
  projectId: string;
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
  organizationId: string;
}

export interface UpdatePhotoDTO {
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

export interface CreateAlbumDTO {
  projectId: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  createdBy: string;
  organizationId: string;
}

export interface UpdateAlbumDTO {
  name?: string;
  description?: string;
  coverPhotoId?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface PhotoCommentDTO {
  photoId: string;
  comment: string;
  annotationX?: number;
  annotationY?: number;
  annotationType?: 'pin' | 'arrow' | 'circle' | 'rectangle';
  createdBy: string;
}

export interface CreateComparisonDTO {
  projectId: string;
  title: string;
  description?: string;
  beforePhotoId: string;
  afterPhotoId: string;
  comparisonDate?: string;
  createdBy: string;
}

export interface ShareLinkOptions {
  expiresInDays?: number;
  password?: string;
  maxViews?: number;
  allowDownload?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Photo Service
// ============================================================================

class PhotoService {
  // -------------------------------------------------------------------------
  // Photo CRUD
  // -------------------------------------------------------------------------

  /**
   * Create a new photo record
   */
  async create(data: CreatePhotoDTO): Promise<any> {
    const client = await db.pool.connect();
    
    try {
      const result = await client.query(`
        INSERT INTO site_photos (
          project_id, phase_id, unit_id,
          title, description, category, status,
          file_path, file_name, file_size, mime_type, thumbnail_path,
          latitude, longitude, altitude, accuracy, location_name,
          device_make, device_model, taken_at, exif_data,
          manual_tags,
          related_rfi_id, related_punch_id, related_daily_log_id, related_submittal_id,
          uploaded_by, organization_id,
          created_at
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, 'pending',
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20,
          $21,
          $22, $23, $24, $25,
          $26, $27,
          NOW()
        )
        RETURNING *
      `, [
        data.projectId, data.phaseId, data.unitId,
        data.title, data.description, data.category,
        data.filePath, data.fileName, data.fileSize, data.mimeType, data.thumbnailPath,
        data.latitude, data.longitude, data.altitude, data.accuracy, data.locationName,
        data.deviceMake, data.deviceModel, data.takenAt, JSON.stringify(data.exifData || {}),
        data.manualTags || [],
        data.relatedRfiId, data.relatedPunchId, data.relatedDailyLogId, data.relatedSubmittalId,
        data.uploadedBy, data.organizationId
      ]);

      const photo = result.rows[0];

      logger.info('Photo created', { 
        photoId: photo.id, 
        projectId: data.projectId,
        category: data.category
      });

      return photo;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk create photos (for multi-upload)
   */
  async createBulk(photos: CreatePhotoDTO[]): Promise<any[]> {
    const results: any[] = [];
    
    for (const photo of photos) {
      try {
        const created = await this.create(photo);
        results.push({ success: true, photo: created });
      } catch (error: any) {
        results.push({ success: false, error: error.message, photo: { title: photo.title } });
      }
    }

    return results;
  }

  /**
   * Get photo by ID
   */
  async getById(id: string): Promise<any> {
    const result = await db.query(`
      SELECT 
        sp.*,
        p.name as project_name,
        pp.name as phase_name,
        pu.unit_number,
        u.full_name as uploaded_by_name,
        approver.full_name as approved_by_name,
        (SELECT COUNT(*) FROM photo_comments pc WHERE pc.photo_id = sp.id) as comment_count,
        (SELECT COUNT(*) FROM photo_album_items pai WHERE pai.photo_id = sp.id) as album_count,
        (
          SELECT json_agg(json_build_object('id', pa.id, 'name', pa.name))
          FROM photo_album_items pai2
          JOIN photo_albums pa ON pai2.album_id = pa.id
          WHERE pai2.photo_id = sp.id
        ) as albums
      FROM site_photos sp
      LEFT JOIN projects p ON sp.project_id = p.id
      LEFT JOIN project_phases pp ON sp.phase_id = pp.id
      LEFT JOIN project_units pu ON sp.unit_id = pu.id
      LEFT JOIN users u ON sp.uploaded_by = u.id
      LEFT JOIN users approver ON sp.approved_by = approver.id
      WHERE sp.id = $1 AND sp.deleted_at IS NULL
    `, [id]);

    return result.rows[0] || null;
  }

  /**
   * Get all photos with filters and pagination
   */
  async getAll(
    filters: PhotoFilters,
    pagination: PaginationParams = {}
  ): Promise<{ photos: any[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = pagination;

    const offset = (page - 1) * limit;
    const conditions: string[] = ['sp.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    // Build filter conditions
    if (filters.projectId) {
      conditions.push(`sp.project_id = $${paramIndex++}`);
      params.push(filters.projectId);
    }

    if (filters.phaseId) {
      conditions.push(`sp.phase_id = $${paramIndex++}`);
      params.push(filters.phaseId);
    }

    if (filters.unitId) {
      conditions.push(`sp.unit_id = $${paramIndex++}`);
      params.push(filters.unitId);
    }

    if (filters.category) {
      if (Array.isArray(filters.category)) {
        conditions.push(`sp.category = ANY($${paramIndex++})`);
        params.push(filters.category);
      } else {
        conditions.push(`sp.category = $${paramIndex++}`);
        params.push(filters.category);
      }
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`sp.status = ANY($${paramIndex++})`);
        params.push(filters.status);
      } else {
        conditions.push(`sp.status = $${paramIndex++}`);
        params.push(filters.status);
      }
    }

    if (filters.uploadedBy) {
      conditions.push(`sp.uploaded_by = $${paramIndex++}`);
      params.push(filters.uploadedBy);
    }

    if (filters.dateFrom) {
      conditions.push(`sp.created_at >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`sp.created_at <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`sp.manual_tags && $${paramIndex++}`);
      params.push(filters.tags);
    }

    if (filters.hasGeoTag !== undefined) {
      if (filters.hasGeoTag) {
        conditions.push(`sp.latitude IS NOT NULL`);
      } else {
        conditions.push(`sp.latitude IS NULL`);
      }
    }

    if (filters.search) {
      conditions.push(`(
        sp.title ILIKE $${paramIndex} OR
        sp.description ILIKE $${paramIndex} OR
        sp.location_name ILIKE $${paramIndex} OR
        $${paramIndex}::text = ANY(sp.manual_tags)
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    // Validate sort column
    const validSortColumns = ['created_at', 'taken_at', 'title', 'category', 'status', 'file_size'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM site_photos sp
      ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].total);

    // Get photos
    const result = await db.query(`
      SELECT 
        sp.*,
        p.name as project_name,
        pp.name as phase_name,
        u.full_name as uploaded_by_name,
        (SELECT COUNT(*) FROM photo_comments pc WHERE pc.photo_id = sp.id) as comment_count
      FROM site_photos sp
      LEFT JOIN projects p ON sp.project_id = p.id
      LEFT JOIN project_phases pp ON sp.phase_id = pp.id
      LEFT JOIN users u ON sp.uploaded_by = u.id
      ${whereClause}
      ORDER BY sp.${sortColumn} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, [...params, limit, offset]);

    return {
      photos: result.rows,
      total,
      page,
      limit
    };
  }

  /**
   * Update a photo
   */
  async update(id: string, data: UpdatePhotoDTO, userId: string): Promise<any> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    const updateFields: Array<[keyof UpdatePhotoDTO, string]> = [
      ['title', 'title'],
      ['description', 'description'],
      ['category', 'category'],
      ['status', 'status'],
      ['manualTags', 'manual_tags'],
      ['phaseId', 'phase_id'],
      ['unitId', 'unit_id'],
      ['latitude', 'latitude'],
      ['longitude', 'longitude'],
      ['locationName', 'location_name'],
      ['relatedRfiId', 'related_rfi_id'],
      ['relatedPunchId', 'related_punch_id'],
      ['relatedDailyLogId', 'related_daily_log_id'],
      ['relatedSubmittalId', 'related_submittal_id']
    ];

    for (const [key, column] of updateFields) {
      if (data[key] !== undefined) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push(key === 'manualTags' ? data[key] : data[key]);
      }
    }

    if (setClauses.length === 1) {
      return this.getById(id);
    }

    params.push(id);

    const result = await db.query(`
      UPDATE site_photos
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      throw new Error('Photo not found');
    }

    return result.rows[0];
  }

  /**
   * Approve a photo
   */
  async approve(id: string, userId: string): Promise<any> {
    const result = await db.query(`
      UPDATE site_photos
      SET 
        status = 'approved',
        approved_by = $1,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [userId, id]);

    if (result.rows.length === 0) {
      throw new Error('Photo not found');
    }

    return result.rows[0];
  }

  /**
   * Reject a photo
   */
  async reject(id: string, userId: string, reason?: string): Promise<any> {
    const result = await db.query(`
      UPDATE site_photos
      SET 
        status = 'rejected',
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      throw new Error('Photo not found');
    }

    return result.rows[0];
  }

  /**
   * Soft delete a photo
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.query(`
      UPDATE site_photos
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Add tags to a photo
   */
  async addTags(id: string, tags: string[]): Promise<any> {
    const result = await db.query(`
      UPDATE site_photos
      SET 
        manual_tags = array_cat(manual_tags, $1::text[]),
        updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [tags, id]);

    return result.rows[0];
  }

  /**
   * Remove tags from a photo
   */
  async removeTags(id: string, tags: string[]): Promise<any> {
    const result = await db.query(`
      UPDATE site_photos
      SET 
        manual_tags = array_remove(manual_tags, unnest($1::text[])),
        updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [tags, id]);

    return result.rows[0];
  }

  /**
   * Update AI tags (from AI analysis)
   */
  async updateAITags(
    id: string, 
    aiTags: string[], 
    aiDescription?: string,
    aiConfidence?: number
  ): Promise<any> {
    const result = await db.query(`
      UPDATE site_photos
      SET 
        ai_tags = $1,
        ai_description = $2,
        ai_confidence = $3,
        updated_at = NOW()
      WHERE id = $4 AND deleted_at IS NULL
      RETURNING *
    `, [aiTags, aiDescription, aiConfidence, id]);

    return result.rows[0];
  }

  // -------------------------------------------------------------------------
  // Album Management
  // -------------------------------------------------------------------------

  /**
   * Create an album
   */
  async createAlbum(data: CreateAlbumDTO): Promise<any> {
    const result = await db.query(`
      INSERT INTO photo_albums (
        project_id, name, description,
        is_public, is_featured,
        created_by, organization_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      data.projectId,
      data.name,
      data.description,
      data.isPublic || false,
      data.isFeatured || false,
      data.createdBy,
      data.organizationId
    ]);

    return result.rows[0];
  }

  /**
   * Get album by ID with photos
   */
  async getAlbumById(id: string): Promise<any> {
    const albumResult = await db.query(`
      SELECT 
        pa.*,
        p.name as project_name,
        u.full_name as created_by_name,
        cover.file_path as cover_photo_path,
        cover.thumbnail_path as cover_thumbnail_path
      FROM photo_albums pa
      LEFT JOIN projects p ON pa.project_id = p.id
      LEFT JOIN users u ON pa.created_by = u.id
      LEFT JOIN site_photos cover ON pa.cover_photo_id = cover.id
      WHERE pa.id = $1
    `, [id]);

    if (albumResult.rows.length === 0) {
      return null;
    }

    const album = albumResult.rows[0];

    // Get photos in album
    const photosResult = await db.query(`
      SELECT 
        sp.*,
        pai.sort_order,
        u.full_name as uploaded_by_name
      FROM photo_album_items pai
      JOIN site_photos sp ON pai.photo_id = sp.id
      LEFT JOIN users u ON sp.uploaded_by = u.id
      WHERE pai.album_id = $1 AND sp.deleted_at IS NULL
      ORDER BY pai.sort_order ASC
    `, [id]);

    album.photos = photosResult.rows;

    return album;
  }

  /**
   * Get all albums for a project
   */
  async getAlbumsByProject(projectId: string): Promise<any[]> {
    const result = await db.query(`
      SELECT 
        pa.*,
        u.full_name as created_by_name,
        cover.file_path as cover_photo_path,
        cover.thumbnail_path as cover_thumbnail_path
      FROM photo_albums pa
      LEFT JOIN users u ON pa.created_by = u.id
      LEFT JOIN site_photos cover ON pa.cover_photo_id = cover.id
      WHERE pa.project_id = $1
      ORDER BY pa.sort_order ASC, pa.created_at DESC
    `, [projectId]);

    return result.rows;
  }

  /**
   * Update an album
   */
  async updateAlbum(id: string, data: UpdateAlbumDTO): Promise<any> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.coverPhotoId !== undefined) {
      setClauses.push(`cover_photo_id = $${paramIndex++}`);
      params.push(data.coverPhotoId);
    }
    if (data.isPublic !== undefined) {
      setClauses.push(`is_public = $${paramIndex++}`);
      params.push(data.isPublic);
    }
    if (data.isFeatured !== undefined) {
      setClauses.push(`is_featured = $${paramIndex++}`);
      params.push(data.isFeatured);
    }
    if (data.sortOrder !== undefined) {
      setClauses.push(`sort_order = $${paramIndex++}`);
      params.push(data.sortOrder);
    }

    params.push(id);

    const result = await db.query(`
      UPDATE photo_albums
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

    return result.rows[0];
  }

  /**
   * Add photos to an album
   */
  async addPhotosToAlbum(
    albumId: string, 
    photoIds: string[], 
    userId: string
  ): Promise<number> {
    // Get current max sort order
    const maxResult = await db.query(`
      SELECT COALESCE(MAX(sort_order), 0) as max_order
      FROM photo_album_items
      WHERE album_id = $1
    `, [albumId]);
    
    let sortOrder = maxResult.rows[0].max_order + 1;
    let added = 0;

    for (const photoId of photoIds) {
      try {
        await db.query(`
          INSERT INTO photo_album_items (album_id, photo_id, sort_order, added_by, added_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (album_id, photo_id) DO NOTHING
        `, [albumId, photoId, sortOrder++, userId]);
        added++;
      } catch (error) {
        // Ignore duplicates
      }
    }

    return added;
  }

  /**
   * Remove photos from an album
   */
  async removePhotosFromAlbum(albumId: string, photoIds: string[]): Promise<number> {
    const result = await db.query(`
      DELETE FROM photo_album_items
      WHERE album_id = $1 AND photo_id = ANY($2)
    `, [albumId, photoIds]);

    return result.rowCount ?? 0;
  }

  /**
   * Reorder photos in an album
   */
  async reorderAlbumPhotos(
    albumId: string, 
    photoOrders: Array<{ photoId: string; order: number }>
  ): Promise<void> {
    for (const { photoId, order } of photoOrders) {
      await db.query(`
        UPDATE photo_album_items
        SET sort_order = $1
        WHERE album_id = $2 AND photo_id = $3
      `, [order, albumId, photoId]);
    }
  }

  /**
   * Delete an album
   */
  async deleteAlbum(id: string): Promise<boolean> {
    const result = await db.query(`
      DELETE FROM photo_albums WHERE id = $1
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Comments & Annotations
  // -------------------------------------------------------------------------

  /**
   * Add a comment to a photo
   */
  async addComment(data: PhotoCommentDTO): Promise<any> {
    const result = await db.query(`
      INSERT INTO photo_comments (
        photo_id, comment,
        annotation_x, annotation_y, annotation_type,
        created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [
      data.photoId,
      data.comment,
      data.annotationX,
      data.annotationY,
      data.annotationType,
      data.createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get comments for a photo
   */
  async getComments(photoId: string): Promise<any[]> {
    const result = await db.query(`
      SELECT 
        pc.*,
        u.full_name as created_by_name
      FROM photo_comments pc
      LEFT JOIN users u ON pc.created_by = u.id
      WHERE pc.photo_id = $1
      ORDER BY pc.created_at ASC
    `, [photoId]);

    return result.rows;
  }

  /**
   * Update a comment
   */
  async updateComment(commentId: string, comment: string): Promise<any> {
    const result = await db.query(`
      UPDATE photo_comments
      SET comment = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [comment, commentId]);

    return result.rows[0];
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<boolean> {
    const result = await db.query(`
      DELETE FROM photo_comments WHERE id = $1
    `, [commentId]);

    return (result.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Before/After Comparisons
  // -------------------------------------------------------------------------

  /**
   * Create a before/after comparison
   */
  async createComparison(data: CreateComparisonDTO): Promise<any> {
    const result = await db.query(`
      INSERT INTO photo_comparisons (
        project_id, title, description,
        before_photo_id, after_photo_id,
        comparison_date, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      data.projectId,
      data.title,
      data.description,
      data.beforePhotoId,
      data.afterPhotoId,
      data.comparisonDate || new Date().toISOString().split('T')[0],
      data.createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get comparisons for a project
   */
  async getComparisonsByProject(projectId: string): Promise<any[]> {
    const result = await db.query(`
      SELECT 
        pc.*,
        before_photo.file_path as before_photo_path,
        before_photo.thumbnail_path as before_thumbnail_path,
        before_photo.title as before_photo_title,
        before_photo.taken_at as before_taken_at,
        after_photo.file_path as after_photo_path,
        after_photo.thumbnail_path as after_thumbnail_path,
        after_photo.title as after_photo_title,
        after_photo.taken_at as after_taken_at,
        u.full_name as created_by_name
      FROM photo_comparisons pc
      JOIN site_photos before_photo ON pc.before_photo_id = before_photo.id
      JOIN site_photos after_photo ON pc.after_photo_id = after_photo.id
      LEFT JOIN users u ON pc.created_by = u.id
      WHERE pc.project_id = $1
      ORDER BY pc.comparison_date DESC
    `, [projectId]);

    return result.rows;
  }

  /**
   * Get comparison by ID
   */
  async getComparisonById(id: string): Promise<any> {
    const result = await db.query(`
      SELECT 
        pc.*,
        before_photo.file_path as before_photo_path,
        before_photo.thumbnail_path as before_thumbnail_path,
        before_photo.title as before_photo_title,
        before_photo.taken_at as before_taken_at,
        before_photo.latitude as before_latitude,
        before_photo.longitude as before_longitude,
        after_photo.file_path as after_photo_path,
        after_photo.thumbnail_path as after_thumbnail_path,
        after_photo.title as after_photo_title,
        after_photo.taken_at as after_taken_at,
        after_photo.latitude as after_latitude,
        after_photo.longitude as after_longitude,
        u.full_name as created_by_name,
        p.name as project_name
      FROM photo_comparisons pc
      JOIN site_photos before_photo ON pc.before_photo_id = before_photo.id
      JOIN site_photos after_photo ON pc.after_photo_id = after_photo.id
      LEFT JOIN users u ON pc.created_by = u.id
      LEFT JOIN projects p ON pc.project_id = p.id
      WHERE pc.id = $1
    `, [id]);

    return result.rows[0] || null;
  }

  /**
   * Delete a comparison
   */
  async deleteComparison(id: string): Promise<boolean> {
    const result = await db.query(`
      DELETE FROM photo_comparisons WHERE id = $1
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Share Links
  // -------------------------------------------------------------------------

  /**
   * Create a share link for a photo or album
   */
  async createShareLink(
    entityType: 'photo' | 'album',
    entityId: string,
    userId: string,
    options: ShareLinkOptions = {}
  ): Promise<any> {
    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    
    const expiresAt = options.expiresInDays 
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const result = await db.query(`
      INSERT INTO photo_share_links (
        photo_id, album_id,
        share_token,
        expires_at, password_hash, max_views, allow_download,
        created_by, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
      RETURNING *
    `, [
      entityType === 'photo' ? entityId : null,
      entityType === 'album' ? entityId : null,
      token,
      expiresAt,
      options.password ? await this.hashPassword(options.password) : null,
      options.maxViews,
      options.allowDownload ?? true,
      userId
    ]);

    return {
      ...result.rows[0],
      shareUrl: `/share/${token}`
    };
  }

  /**
   * Get share link content
   */
  async getShareLinkContent(token: string, password?: string): Promise<any> {
    const result = await db.query(`
      SELECT * FROM photo_share_links WHERE share_token = $1
    `, [token]);

    const link = result.rows[0];
    if (!link) {
      throw new Error('Share link not found');
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      throw new Error('Share link has expired');
    }

    // Check view count
    if (link.max_views && link.view_count >= link.max_views) {
      throw new Error('Share link has reached maximum views');
    }

    // Check password
    if (link.password_hash) {
      if (!password || !(await this.verifyPassword(password, link.password_hash))) {
        throw new Error('Invalid password');
      }
    }

    // Increment view count
    await db.query(`
      UPDATE photo_share_links
      SET view_count = view_count + 1, last_accessed_at = NOW()
      WHERE id = $1
    `, [link.id]);

    // Get content
    if (link.photo_id) {
      return {
        type: 'photo',
        content: await this.getById(link.photo_id),
        allowDownload: link.allow_download
      };
    } else {
      return {
        type: 'album',
        content: await this.getAlbumById(link.album_id),
        allowDownload: link.allow_download
      };
    }
  }

  /**
   * Delete a share link
   */
  async deleteShareLink(id: string): Promise<boolean> {
    const result = await db.query(`
      DELETE FROM photo_share_links WHERE id = $1
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Statistics & Analytics
  // -------------------------------------------------------------------------

  /**
   * Get photo statistics for a project
   */
  async getProjectStats(projectId: string): Promise<any> {
    const result = await db.query(`
      SELECT * FROM project_photo_stats WHERE project_id = $1
    `, [projectId]);

    if (result.rows.length === 0) {
      return {
        total_photos: 0,
        progress_photos: 0,
        issue_photos: 0,
        safety_photos: 0,
        quality_photos: 0,
        milestone_photos: 0,
        pending_photos: 0,
        approved_photos: 0,
        geotagged_photos: 0
      };
    }

    return result.rows[0];
  }

  /**
   * Get recent photos for a project
   */
  async getRecentPhotos(projectId: string, limit: number = 10): Promise<any[]> {
    const result = await db.query(`
      SELECT 
        sp.*,
        u.full_name as uploaded_by_name
      FROM site_photos sp
      LEFT JOIN users u ON sp.uploaded_by = u.id
      WHERE sp.project_id = $1 AND sp.deleted_at IS NULL
      ORDER BY sp.created_at DESC
      LIMIT $2
    `, [projectId, limit]);

    return result.rows;
  }

  /**
   * Get photo timeline (grouped by date)
   */
  async getPhotoTimeline(
    projectId: string, 
    dateFrom?: string, 
    dateTo?: string
  ): Promise<any[]> {
    const conditions = ['project_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (dateFrom) {
      conditions.push(`DATE(COALESCE(taken_at, created_at)) >= $${paramIndex++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`DATE(COALESCE(taken_at, created_at)) <= $${paramIndex++}`);
      params.push(dateTo);
    }

    const result = await db.query(`
      SELECT 
        DATE(COALESCE(taken_at, created_at)) as photo_date,
        COUNT(*) as photo_count,
        array_agg(category) as categories,
        json_agg(json_build_object(
          'id', id,
          'title', title,
          'category', category,
          'thumbnail_path', thumbnail_path
        ) ORDER BY COALESCE(taken_at, created_at)) as photos
      FROM site_photos
      WHERE ${conditions.join(' AND ')}
      GROUP BY DATE(COALESCE(taken_at, created_at))
      ORDER BY photo_date DESC
    `, params);

    return result.rows;
  }

  /**
   * Get photos by location (within radius)
   */
  async getPhotosByLocation(
    latitude: number,
    longitude: number,
    radiusKm: number = 1,
    projectId?: string
  ): Promise<any[]> {
    const conditions = [
      'deleted_at IS NULL',
      'latitude IS NOT NULL'
    ];
    const params: any[] = [latitude, longitude, radiusKm];
    let paramIndex = 4;

    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(projectId);
    }

    const result = await db.query(`
      SELECT 
        sp.*,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )
        ) as distance_km
      FROM site_photos sp
      WHERE ${conditions.join(' AND ')}
        AND (
          6371 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )
        ) <= $3
      ORDER BY distance_km ASC
    `, params);

    return result.rows;
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  private async hashPassword(password: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    const crypto = await import('crypto');
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    return inputHash === hash;
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const photoService = new PhotoService();
