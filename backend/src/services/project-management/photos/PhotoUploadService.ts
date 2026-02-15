/**
 * Photo Upload Service
 * 
 * Phase 3.7: Split photoService
 * 
 * Handles core photo CRUD operations:
 * - Create/upload photos with metadata
 * - Bulk photo uploads
 * - Photo retrieval with filtering
 * - Photo updates and approval workflow
 * - Photo deletion
 * 
 * @module services/project-management/photos/PhotoUploadService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  Photo,
  CreatePhotoInput,
  UpdatePhotoInput,
  PhotoFilters,
  PhotoStats,
  PhotoTimelineEntry,
  PaginationParams,
  PaginatedResult,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class PhotoUploadServiceImpl extends BaseService {
  constructor() {
    super('PhotoUploadService');
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Create a new photo record
   */
  async create(input: CreatePhotoInput): Promise<Photo> {
    const result = await this.query(
      `INSERT INTO site_photos (
         project_id, organization_id, phase_id, unit_id,
         title, description, category, status,
         file_path, file_name, file_size, mime_type, thumbnail_path,
         latitude, longitude, altitude, accuracy, location_name,
         device_make, device_model, taken_at, exif_data,
         manual_tags,
         related_rfi_id, related_punch_id, related_daily_log_id, related_submittal_id,
         uploaded_by, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'pending',
         $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17,
         $18, $19, $20, $21,
         $22,
         $23, $24, $25, $26,
         $27, NOW()
       ) RETURNING *`,
      [
        input.projectId,
        input.organizationId,
        input.phaseId || null,
        input.unitId || null,
        input.title,
        input.description || null,
        input.category,
        input.filePath,
        input.fileName,
        input.fileSize,
        input.mimeType,
        input.thumbnailPath || null,
        input.latitude || null,
        input.longitude || null,
        input.altitude || null,
        input.accuracy || null,
        input.locationName || null,
        input.deviceMake || null,
        input.deviceModel || null,
        input.takenAt || null,
        input.exifData ? JSON.stringify(input.exifData) : null,
        input.manualTags || [],
        input.relatedRfiId || null,
        input.relatedPunchId || null,
        input.relatedDailyLogId || null,
        input.relatedSubmittalId || null,
        input.uploadedBy,
      ]
    );

    const photo = this.mapPhoto(result.rows[0]);

    eventBus.emit('photo.uploaded' as any, {
      projectId: photo.projectId,
      category: photo.category,
      uploadedBy: photo.uploadedBy,
    });

    return photo;
  }

  /**
   * Create multiple photos in bulk
   */
  async createBulk(photos: CreatePhotoInput[]): Promise<Photo[]> {
    const results: Photo[] = [];

    await this.executeInTransaction(async (client) => {
      for (const input of photos) {
        const result = await client.query(
          `INSERT INTO site_photos (
             project_id, organization_id, phase_id, unit_id,
             title, description, category, status,
             file_path, file_name, file_size, mime_type, thumbnail_path,
             latitude, longitude, altitude, accuracy, location_name,
             device_make, device_model, taken_at, exif_data,
             manual_tags,
             related_rfi_id, related_punch_id, related_daily_log_id, related_submittal_id,
             uploaded_by, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'pending',
             $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17,
             $18, $19, $20, $21,
             $22,
             $23, $24, $25, $26,
             $27, NOW()
           ) RETURNING *`,
          [
            input.projectId,
            input.organizationId,
            input.phaseId || null,
            input.unitId || null,
            input.title,
            input.description || null,
            input.category,
            input.filePath,
            input.fileName,
            input.fileSize,
            input.mimeType,
            input.thumbnailPath || null,
            input.latitude || null,
            input.longitude || null,
            input.altitude || null,
            input.accuracy || null,
            input.locationName || null,
            input.deviceMake || null,
            input.deviceModel || null,
            input.takenAt || null,
            input.exifData ? JSON.stringify(input.exifData) : null,
            input.manualTags || [],
            input.relatedRfiId || null,
            input.relatedPunchId || null,
            input.relatedDailyLogId || null,
            input.relatedSubmittalId || null,
            input.uploadedBy,
          ]
        );
        results.push(this.mapPhoto(result.rows[0]));
      }
    });

    // Emit events for each photo
    for (const photo of results) {
      eventBus.emit('photo.uploaded' as any, {
        projectId: photo.projectId,
        category: photo.category,
        uploadedBy: photo.uploadedBy,
      });
    }

    return results;
  }

  // ==========================================================================
  // READ
  // ==========================================================================

  /**
   * Get photo by ID
   */
  async getById(id: string): Promise<Photo | null> {
    const result = await this.query(
      `SELECT 
         sp.*,
         u.full_name as uploaded_by_name,
         p.name as phase_name,
         un.unit_number
       FROM site_photos sp
       LEFT JOIN users u ON sp.uploaded_by = u.id
       LEFT JOIN project_phases p ON sp.phase_id = p.id
       LEFT JOIN project_units un ON sp.unit_id = un.id
       WHERE sp.id = $1 AND sp.deleted_at IS NULL`,
      [id]
    );

    return result.rows[0] ? this.mapPhoto(result.rows[0]) : null;
  }

  /**
   * Get photos with filters and pagination
   */
  async getAll(
    filters: PhotoFilters,
    pagination: PaginationParams = {}
  ): Promise<PaginatedResult<Photo>> {
    const conditions: string[] = ['sp.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    // Apply filters
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
      conditions.push(`DATE(sp.created_at) >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`DATE(sp.created_at) <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`(sp.manual_tags && $${paramIndex} OR sp.ai_tags && $${paramIndex})`);
      params.push(filters.tags);
      paramIndex++;
    }

    if (filters.hasGeoTag === true) {
      conditions.push('sp.latitude IS NOT NULL');
    } else if (filters.hasGeoTag === false) {
      conditions.push('sp.latitude IS NULL');
    }

    if (filters.search) {
      conditions.push(`(sp.title ILIKE $${paramIndex} OR sp.description ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await this.query(
      `SELECT COUNT(*) FROM site_photos sp WHERE ${conditions.join(' AND ')}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Pagination
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const offset = (page - 1) * limit;
    const sortBy = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';

    // Get photos
    const result = await this.query(
      `SELECT 
         sp.*,
         u.full_name as uploaded_by_name
       FROM site_photos sp
       LEFT JOIN users u ON sp.uploaded_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sp.${sortBy} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const items = result.rows.map(this.mapPhoto);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  /**
   * Update a photo
   */
  async update(id: string, data: UpdatePhotoInput, userId: string): Promise<Photo | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }

    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(data.category);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    if (data.manualTags !== undefined) {
      updates.push(`manual_tags = $${paramIndex++}`);
      params.push(data.manualTags);
    }

    if (data.phaseId !== undefined) {
      updates.push(`phase_id = $${paramIndex++}`);
      params.push(data.phaseId);
    }

    if (data.unitId !== undefined) {
      updates.push(`unit_id = $${paramIndex++}`);
      params.push(data.unitId);
    }

    if (data.latitude !== undefined) {
      updates.push(`latitude = $${paramIndex++}`);
      params.push(data.latitude);
    }

    if (data.longitude !== undefined) {
      updates.push(`longitude = $${paramIndex++}`);
      params.push(data.longitude);
    }

    if (data.locationName !== undefined) {
      updates.push(`location_name = $${paramIndex++}`);
      params.push(data.locationName);
    }

    if (updates.length === 1) {
      // Only updated_at, no actual changes
      return this.getById(id);
    }

    params.push(id);

    const result = await this.query(
      `UPDATE site_photos SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows[0]) {
      eventBus.emit('photo.updated' as any, {
        photoId: id,
        updatedBy: userId,
      });
    }

    return result.rows[0] ? this.mapPhoto(result.rows[0]) : null;
  }

  // ==========================================================================
  // APPROVAL WORKFLOW
  // ==========================================================================

  /**
   * Approve a photo
   */
  async approve(id: string, userId: string): Promise<Photo | null> {
    const result = await this.query(
      `UPDATE site_photos
       SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, userId]
    );

    if (result.rows[0]) {
      eventBus.emit('photo.approved' as any, {
        photoId: id,
        approvedBy: userId,
      });
    }

    return result.rows[0] ? this.mapPhoto(result.rows[0]) : null;
  }

  /**
   * Reject a photo
   */
  async reject(id: string, userId: string, reason?: string): Promise<Photo | null> {
    const result = await this.query(
      `UPDATE site_photos
       SET status = 'rejected', rejected_by = $2, rejected_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, userId, reason || null]
    );

    if (result.rows[0]) {
      eventBus.emit('photo.rejected' as any, {
        photoId: id,
        rejectedBy: userId,
        reason,
      });
    }

    return result.rows[0] ? this.mapPhoto(result.rows[0]) : null;
  }

  /**
   * Archive a photo
   */
  async archive(id: string, userId: string): Promise<Photo | null> {
    const result = await this.query(
      `UPDATE site_photos
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, userId]
    );

    return result.rows[0] ? this.mapPhoto(result.rows[0]) : null;
  }

  // ==========================================================================
  // DELETE
  // ==========================================================================

  /**
   * Soft delete a photo
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.query(
      `UPDATE site_photos SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if ((result.rowCount ?? 0) > 0) {
      eventBus.emit('photo.deleted' as any, { photoId: id });
    }

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Permanently delete a photo (admin only)
   */
  async permanentDelete(id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM site_photos WHERE id = $1`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get photo statistics for a project
   */
  async getProjectStats(projectId: string): Promise<PhotoStats> {
    const result = await this.query(
      `SELECT
         COUNT(*) as total_photos,
         COUNT(*) FILTER (WHERE category = 'progress') as progress_photos,
         COUNT(*) FILTER (WHERE category = 'issue') as issue_photos,
         COUNT(*) FILTER (WHERE category = 'safety') as safety_photos,
         COUNT(*) FILTER (WHERE category = 'quality') as quality_photos,
         COUNT(*) FILTER (WHERE category = 'milestone') as milestone_photos,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_photos,
         COUNT(*) FILTER (WHERE status = 'approved') as approved_photos,
         COUNT(*) FILTER (WHERE latitude IS NOT NULL) as geotagged_photos
       FROM site_photos
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );

    const albumResult = await this.query(
      `SELECT COUNT(*) FROM photo_albums WHERE project_id = $1`,
      [projectId]
    );

    const comparisonResult = await this.query(
      `SELECT COUNT(*) FROM photo_comparisons WHERE project_id = $1`,
      [projectId]
    );

    const row = result.rows[0] || {};

    return {
      totalPhotos: parseInt(row.total_photos, 10) || 0,
      progressPhotos: parseInt(row.progress_photos, 10) || 0,
      issuePhotos: parseInt(row.issue_photos, 10) || 0,
      safetyPhotos: parseInt(row.safety_photos, 10) || 0,
      qualityPhotos: parseInt(row.quality_photos, 10) || 0,
      milestonePhotos: parseInt(row.milestone_photos, 10) || 0,
      pendingPhotos: parseInt(row.pending_photos, 10) || 0,
      approvedPhotos: parseInt(row.approved_photos, 10) || 0,
      geotaggedPhotos: parseInt(row.geotagged_photos, 10) || 0,
      albumCount: parseInt(albumResult.rows[0]?.count, 10) || 0,
      comparisonCount: parseInt(comparisonResult.rows[0]?.count, 10) || 0,
    };
  }

  /**
   * Get recent photos for a project
   */
  async getRecentPhotos(projectId: string, limit: number = 10): Promise<Photo[]> {
    const result = await this.query(
      `SELECT sp.*, u.full_name as uploaded_by_name
       FROM site_photos sp
       LEFT JOIN users u ON sp.uploaded_by = u.id
       WHERE sp.project_id = $1 AND sp.deleted_at IS NULL
       ORDER BY sp.created_at DESC
       LIMIT $2`,
      [projectId, limit]
    );

    return result.rows.map(this.mapPhoto);
  }

  /**
   * Get photo timeline (grouped by date)
   */
  async getPhotoTimeline(
    projectId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<PhotoTimelineEntry[]> {
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

    const result = await this.query(
      `SELECT 
         DATE(COALESCE(taken_at, created_at)) as photo_date,
         COUNT(*) as photo_count,
         array_agg(DISTINCT category) as categories,
         json_agg(json_build_object(
           'id', id,
           'title', title,
           'category', category,
           'thumbnailPath', thumbnail_path
         ) ORDER BY COALESCE(taken_at, created_at)) as photos
       FROM site_photos
       WHERE ${conditions.join(' AND ')}
       GROUP BY DATE(COALESCE(taken_at, created_at))
       ORDER BY photo_date DESC`,
      params
    );

    return result.rows.map(row => ({
      photoDate: row.photo_date?.toISOString().split('T')[0] || '',
      photoCount: parseInt(row.photo_count, 10),
      categories: row.categories || [],
      photos: row.photos || [],
    }));
  }

  /**
   * Get photos by location (within radius)
   */
  async getPhotosByLocation(
    latitude: number,
    longitude: number,
    radiusKm: number = 1,
    projectId?: string
  ): Promise<Photo[]> {
    const conditions: string[] = ['deleted_at IS NULL', 'latitude IS NOT NULL'];
    const params: any[] = [latitude, longitude, radiusKm];
    let paramIndex = 4;

    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(projectId);
    }

    const result = await this.query(
      `SELECT 
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
       ORDER BY distance_km ASC`,
      params
    );

    return result.rows.map(this.mapPhoto);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapPhoto(row: any): Photo {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      phaseId: row.phase_id,
      unitId: row.unit_id,
      title: row.title,
      description: row.description,
      category: row.category,
      status: row.status,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: parseInt(row.file_size, 10) || 0,
      mimeType: row.mime_type,
      thumbnailPath: row.thumbnail_path,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      altitude: row.altitude ? parseFloat(row.altitude) : undefined,
      accuracy: row.accuracy ? parseFloat(row.accuracy) : undefined,
      locationName: row.location_name,
      deviceMake: row.device_make,
      deviceModel: row.device_model,
      takenAt: row.taken_at?.toISOString(),
      exifData: typeof row.exif_data === 'string' ? JSON.parse(row.exif_data) : row.exif_data,
      manualTags: row.manual_tags || [],
      aiTags: row.ai_tags || [],
      aiConfidence: row.ai_confidence ? parseFloat(row.ai_confidence) : undefined,
      relatedRfiId: row.related_rfi_id,
      relatedPunchId: row.related_punch_id,
      relatedDailyLogId: row.related_daily_log_id,
      relatedSubmittalId: row.related_submittal_id,
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at?.toISOString(),
      rejectedBy: row.rejected_by,
      rejectedAt: row.rejected_at?.toISOString(),
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at?.toISOString() || '',
      updatedAt: row.updated_at?.toISOString(),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const photoUploadService = new PhotoUploadServiceImpl();
