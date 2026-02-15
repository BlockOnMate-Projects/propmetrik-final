/**
 * Photo Organization Service
 * 
 * Phase 3.7: Split photoService
 * 
 * Handles photo organization features:
 * - Album management (create, update, delete)
 * - Photo-album relationships
 * - Before/after comparisons
 * - Share link generation
 * 
 * @module services/project-management/photos/PhotoOrganizationService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { eventBus } from '../events/EventBus';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  Album,
  CreateAlbumInput,
  UpdateAlbumInput,
  PhotoComparison,
  CreateComparisonInput,
  ShareLink,
  ShareLinkOptions,
  ShareLinkContent,
  Photo,
} from './types';
import { photoUploadService } from './PhotoUploadService';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class PhotoOrganizationServiceImpl extends BaseService {
  constructor() {
    super('PhotoOrganizationService');
  }

  // ==========================================================================
  // ALBUM CRUD
  // ==========================================================================

  /**
   * Create a new album
   */
  async createAlbum(input: CreateAlbumInput): Promise<Album> {
    const result = await this.query(
      `INSERT INTO photo_albums (
         project_id, organization_id, name, description,
         is_public, is_featured, created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        input.projectId,
        input.organizationId,
        input.name,
        input.description || null,
        input.isPublic ?? false,
        input.isFeatured ?? false,
        input.createdBy,
      ]
    );

    const album = this.mapAlbum(result.rows[0]);

    eventBus.emit('photo.album.created' as any, {
      albumId: album.id,
      projectId: album.projectId,
      createdBy: input.createdBy,
    });

    return album;
  }

  /**
   * Get album by ID with photos
   */
  async getAlbumById(id: string): Promise<(Album & { photos: Photo[] }) | null> {
    const result = await this.query(
      `SELECT 
         pa.*,
         u.full_name as created_by_name,
         cp.thumbnail_path as cover_photo_path,
         (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = pa.id) as photo_count
       FROM photo_albums pa
       LEFT JOIN users u ON pa.created_by = u.id
       LEFT JOIN site_photos cp ON pa.cover_photo_id = cp.id
       WHERE pa.id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      return null;
    }

    const album = this.mapAlbum(result.rows[0]);

    // Get photos in album
    const photosResult = await this.query(
      `SELECT 
         sp.*,
         u.full_name as uploaded_by_name,
         ap.sort_order
       FROM album_photos ap
       JOIN site_photos sp ON ap.photo_id = sp.id
       LEFT JOIN users u ON sp.uploaded_by = u.id
       WHERE ap.album_id = $1 AND sp.deleted_at IS NULL
       ORDER BY ap.sort_order ASC`,
      [id]
    );

    return {
      ...album,
      photos: photosResult.rows.map(this.mapPhoto),
    };
  }

  /**
   * Get all albums for a project
   */
  async getAlbumsByProject(projectId: string): Promise<Album[]> {
    const result = await this.query(
      `SELECT 
         pa.*,
         u.full_name as created_by_name,
         cp.thumbnail_path as cover_photo_path,
         (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = pa.id) as photo_count
       FROM photo_albums pa
       LEFT JOIN users u ON pa.created_by = u.id
       LEFT JOIN site_photos cp ON pa.cover_photo_id = cp.id
       WHERE pa.project_id = $1
       ORDER BY pa.sort_order ASC, pa.created_at DESC`,
      [projectId]
    );

    return result.rows.map(this.mapAlbum);
  }

  /**
   * Update an album
   */
  async updateAlbum(id: string, data: UpdateAlbumInput): Promise<Album | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }

    if (data.coverPhotoId !== undefined) {
      updates.push(`cover_photo_id = $${paramIndex++}`);
      params.push(data.coverPhotoId);
    }

    if (data.isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      params.push(data.isPublic);
    }

    if (data.isFeatured !== undefined) {
      updates.push(`is_featured = $${paramIndex++}`);
      params.push(data.isFeatured);
    }

    if (data.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(data.sortOrder);
    }

    params.push(id);

    const result = await this.query(
      `UPDATE photo_albums SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0] ? this.mapAlbum(result.rows[0]) : null;
  }

  /**
   * Delete an album
   */
  async deleteAlbum(id: string): Promise<boolean> {
    // Delete album-photo relationships first
    await this.query(`DELETE FROM album_photos WHERE album_id = $1`, [id]);

    const result = await this.query(
      `DELETE FROM photo_albums WHERE id = $1`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  // ==========================================================================
  // ALBUM-PHOTO MANAGEMENT
  // ==========================================================================

  /**
   * Add photos to an album
   */
  async addPhotosToAlbum(
    albumId: string,
    photoIds: string[],
    userId: string
  ): Promise<number> {
    // Get current max sort order
    const maxResult = await this.query(
      `SELECT COALESCE(MAX(sort_order), 0) as max_order FROM album_photos WHERE album_id = $1`,
      [albumId]
    );
    let sortOrder = parseInt(maxResult.rows[0].max_order, 10);

    let added = 0;
    for (const photoId of photoIds) {
      try {
        await this.query(
          `INSERT INTO album_photos (album_id, photo_id, sort_order, added_by, added_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (album_id, photo_id) DO NOTHING`,
          [albumId, photoId, ++sortOrder, userId]
        );
        added++;
      } catch (error) {
        this.logError('addPhotosToAlbum', error as Error, { albumId, photoId });
      }
    }

    // Set first photo as cover if album has no cover
    if (added > 0) {
      await this.query(
        `UPDATE photo_albums
         SET cover_photo_id = (
           SELECT photo_id FROM album_photos
           WHERE album_id = $1
           ORDER BY sort_order ASC
           LIMIT 1
         )
         WHERE id = $1 AND cover_photo_id IS NULL`,
        [albumId]
      );
    }

    return added;
  }

  /**
   * Remove photos from an album
   */
  async removePhotosFromAlbum(albumId: string, photoIds: string[]): Promise<number> {
    const result = await this.query(
      `DELETE FROM album_photos WHERE album_id = $1 AND photo_id = ANY($2)`,
      [albumId, photoIds]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Reorder photos in an album
   */
  async reorderAlbumPhotos(albumId: string, photoIds: string[]): Promise<void> {
    await this.executeInTransaction(async (client) => {
      for (let i = 0; i < photoIds.length; i++) {
        await client.query(
          `UPDATE album_photos SET sort_order = $1 WHERE album_id = $2 AND photo_id = $3`,
          [i + 1, albumId, photoIds[i]]
        );
      }
    });
  }

  // ==========================================================================
  // BEFORE/AFTER COMPARISONS
  // ==========================================================================

  /**
   * Create a before/after comparison
   */
  async createComparison(input: CreateComparisonInput): Promise<PhotoComparison> {
    const result = await this.query(
      `INSERT INTO photo_comparisons (
         project_id, title, description,
         before_photo_id, after_photo_id,
         comparison_date, created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        input.projectId,
        input.title,
        input.description || null,
        input.beforePhotoId,
        input.afterPhotoId,
        input.comparisonDate || new Date().toISOString().split('T')[0],
        input.createdBy,
      ]
    );

    eventBus.emit('photo.comparison.created' as any, {
      comparisonId: result.rows[0].id,
      projectId: input.projectId,
    });

    return this.getComparisonById(result.rows[0].id) as Promise<PhotoComparison>;
  }

  /**
   * Get comparison by ID
   */
  async getComparisonById(id: string): Promise<PhotoComparison | null> {
    const result = await this.query(
      `SELECT 
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
         u.full_name as created_by_name
       FROM photo_comparisons pc
       JOIN site_photos before_photo ON pc.before_photo_id = before_photo.id
       JOIN site_photos after_photo ON pc.after_photo_id = after_photo.id
       LEFT JOIN users u ON pc.created_by = u.id
       WHERE pc.id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapComparison(result.rows[0]) : null;
  }

  /**
   * Get comparisons for a project
   */
  async getComparisonsByProject(projectId: string): Promise<PhotoComparison[]> {
    const result = await this.query(
      `SELECT 
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
       ORDER BY pc.comparison_date DESC`,
      [projectId]
    );

    return result.rows.map(this.mapComparison);
  }

  /**
   * Delete a comparison
   */
  async deleteComparison(id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM photo_comparisons WHERE id = $1`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  // ==========================================================================
  // SHARE LINKS
  // ==========================================================================

  /**
   * Create a share link for a photo or album
   */
  async createShareLink(
    entityType: 'photo' | 'album',
    entityId: string,
    userId: string,
    options: ShareLinkOptions = {}
  ): Promise<ShareLink> {
    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    
    const expiresAt = options.expiresInDays 
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const passwordHash = options.password 
      ? this.hashPassword(options.password) 
      : null;

    const result = await this.query(
      `INSERT INTO photo_share_links (
         photo_id, album_id,
         share_token,
         expires_at, password_hash, max_views, allow_download,
         created_by, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, NOW()
       )
       RETURNING *`,
      [
        entityType === 'photo' ? entityId : null,
        entityType === 'album' ? entityId : null,
        token,
        expiresAt,
        passwordHash,
        options.maxViews || null,
        options.allowDownload ?? true,
        userId,
      ]
    );

    return {
      ...this.mapShareLink(result.rows[0]),
      shareUrl: `/share/${token}`,
    };
  }

  /**
   * Get share link content
   */
  async getShareLinkContent(token: string, password?: string): Promise<ShareLinkContent> {
    const result = await this.query(
      `SELECT * FROM photo_share_links WHERE share_token = $1`,
      [token]
    );

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
      if (!password || !this.verifyPassword(password, link.password_hash)) {
        throw new Error('Invalid password');
      }
    }

    // Increment view count
    await this.query(
      `UPDATE photo_share_links
       SET view_count = view_count + 1, last_accessed_at = NOW()
       WHERE id = $1`,
      [link.id]
    );

    // Get content
    if (link.photo_id) {
      const photo = await photoUploadService.getById(link.photo_id);
      if (!photo) {
        throw new Error('Photo not found');
      }
      return {
        type: 'photo',
        content: photo,
        allowDownload: link.allow_download,
      };
    } else {
      const album = await this.getAlbumById(link.album_id);
      if (!album) {
        throw new Error('Album not found');
      }
      return {
        type: 'album',
        content: album,
        allowDownload: link.allow_download,
      };
    }
  }

  /**
   * Delete a share link
   */
  async deleteShareLink(id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM photo_share_links WHERE id = $1`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get share links for a photo or album
   */
  async getShareLinks(
    entityType: 'photo' | 'album',
    entityId: string
  ): Promise<ShareLink[]> {
    const column = entityType === 'photo' ? 'photo_id' : 'album_id';
    const result = await this.query(
      `SELECT * FROM photo_share_links WHERE ${column} = $1 ORDER BY created_at DESC`,
      [entityId]
    );

    return result.rows.map(row => ({
      ...this.mapShareLink(row),
      shareUrl: `/share/${row.share_token}`,
    }));
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapAlbum(row: any): Album {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      coverPhotoId: row.cover_photo_id,
      coverPhotoPath: row.cover_photo_path,
      isPublic: row.is_public || false,
      isFeatured: row.is_featured || false,
      sortOrder: parseInt(row.sort_order, 10) || 0,
      photoCount: parseInt(row.photo_count, 10) || 0,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at?.toISOString() || '',
      updatedAt: row.updated_at?.toISOString(),
    };
  }

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

  private mapComparison(row: any): PhotoComparison {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      beforePhotoId: row.before_photo_id,
      beforePhotoPath: row.before_photo_path,
      beforeThumbnailPath: row.before_thumbnail_path,
      beforePhotoTitle: row.before_photo_title,
      beforeTakenAt: row.before_taken_at?.toISOString(),
      beforeLatitude: row.before_latitude ? parseFloat(row.before_latitude) : undefined,
      beforeLongitude: row.before_longitude ? parseFloat(row.before_longitude) : undefined,
      afterPhotoId: row.after_photo_id,
      afterPhotoPath: row.after_photo_path,
      afterThumbnailPath: row.after_thumbnail_path,
      afterPhotoTitle: row.after_photo_title,
      afterTakenAt: row.after_taken_at?.toISOString(),
      afterLatitude: row.after_latitude ? parseFloat(row.after_latitude) : undefined,
      afterLongitude: row.after_longitude ? parseFloat(row.after_longitude) : undefined,
      comparisonDate: row.comparison_date?.toISOString().split('T')[0] || '',
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at?.toISOString() || '',
    };
  }

  private mapShareLink(row: any): ShareLink {
    return {
      id: row.id,
      photoId: row.photo_id,
      albumId: row.album_id,
      shareToken: row.share_token,
      shareUrl: `/share/${row.share_token}`,
      expiresAt: row.expires_at?.toISOString(),
      hasPassword: !!row.password_hash,
      maxViews: row.max_views,
      viewCount: parseInt(row.view_count, 10) || 0,
      allowDownload: row.allow_download || false,
      createdBy: row.created_by,
      lastAccessedAt: row.last_accessed_at?.toISOString(),
      createdAt: row.created_at?.toISOString() || '',
    };
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private verifyPassword(password: string, hash: string): boolean {
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    return inputHash === hash;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const photoOrganizationService = new PhotoOrganizationServiceImpl();
