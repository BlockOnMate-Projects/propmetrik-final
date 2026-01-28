/**
 * Photo Annotation Service
 * 
 * Phase 3.7: Split photoService
 * 
 * Handles photo annotations and tagging:
 * - Comments with visual annotations
 * - Manual tagging
 * - AI tag management
 * - Tag search and filtering
 * 
 * @module services/project-management/photos/PhotoAnnotationService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  PhotoComment,
  CreateCommentInput,
  Photo,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class PhotoAnnotationServiceImpl extends BaseService {
  constructor() {
    super('PhotoAnnotationService');
  }

  // ==========================================================================
  // COMMENTS
  // ==========================================================================

  /**
   * Add a comment to a photo
   */
  async addComment(input: CreateCommentInput): Promise<PhotoComment> {
    const result = await this.query(
      `INSERT INTO photo_comments (
         photo_id, comment,
         annotation_x, annotation_y, annotation_type, annotation_data,
         created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        input.photoId,
        input.comment,
        input.annotationX || null,
        input.annotationY || null,
        input.annotationType || null,
        input.annotationData ? JSON.stringify(input.annotationData) : null,
        input.createdBy,
      ]
    );

    const comment = this.mapComment(result.rows[0]);

    eventBus.emit('photo.comment.added', {
      photoId: input.photoId,
      commentId: comment.id,
      createdBy: input.createdBy,
    });

    return comment;
  }

  /**
   * Get comments for a photo
   */
  async getComments(photoId: string): Promise<PhotoComment[]> {
    const result = await this.query(
      `SELECT 
         pc.*,
         u.full_name as created_by_name
       FROM photo_comments pc
       LEFT JOIN users u ON pc.created_by = u.id
       WHERE pc.photo_id = $1
       ORDER BY pc.created_at ASC`,
      [photoId]
    );

    return result.rows.map(this.mapComment);
  }

  /**
   * Update a comment
   */
  async updateComment(commentId: string, comment: string): Promise<PhotoComment | null> {
    const result = await this.query(
      `UPDATE photo_comments
       SET comment = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [comment, commentId]
    );

    return result.rows[0] ? this.mapComment(result.rows[0]) : null;
  }

  /**
   * Update comment annotation
   */
  async updateCommentAnnotation(
    commentId: string,
    annotationX: number,
    annotationY: number,
    annotationType?: string,
    annotationData?: Record<string, any>
  ): Promise<PhotoComment | null> {
    const result = await this.query(
      `UPDATE photo_comments
       SET annotation_x = $1, annotation_y = $2, annotation_type = $3, 
           annotation_data = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [annotationX, annotationY, annotationType, 
       annotationData ? JSON.stringify(annotationData) : null, commentId]
    );

    return result.rows[0] ? this.mapComment(result.rows[0]) : null;
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM photo_comments WHERE id = $1`,
      [commentId]
    );

    return result.rowCount > 0;
  }

  // ==========================================================================
  // MANUAL TAGS
  // ==========================================================================

  /**
   * Add tags to a photo
   */
  async addTags(photoId: string, tags: string[]): Promise<string[]> {
    const result = await this.query(
      `UPDATE site_photos
       SET manual_tags = array_cat(manual_tags, $1), updated_at = NOW()
       WHERE id = $2
       RETURNING manual_tags`,
      [tags, photoId]
    );

    // Remove duplicates
    if (result.rows[0]) {
      const uniqueTags = [...new Set(result.rows[0].manual_tags)];
      await this.query(
        `UPDATE site_photos SET manual_tags = $1 WHERE id = $2`,
        [uniqueTags, photoId]
      );
      return uniqueTags;
    }

    return [];
  }

  /**
   * Remove tags from a photo
   */
  async removeTags(photoId: string, tags: string[]): Promise<string[]> {
    const result = await this.query(
      `UPDATE site_photos
       SET manual_tags = array_remove_all(manual_tags, $1), updated_at = NOW()
       WHERE id = $2
       RETURNING manual_tags`,
      [tags, photoId]
    );

    // PostgreSQL doesn't have array_remove_all, need custom approach
    const currentResult = await this.query(
      `SELECT manual_tags FROM site_photos WHERE id = $1`,
      [photoId]
    );

    if (currentResult.rows[0]) {
      const currentTags: string[] = currentResult.rows[0].manual_tags || [];
      const filteredTags = currentTags.filter(t => !tags.includes(t));
      
      await this.query(
        `UPDATE site_photos SET manual_tags = $1, updated_at = NOW() WHERE id = $2`,
        [filteredTags, photoId]
      );
      
      return filteredTags;
    }

    return [];
  }

  /**
   * Set all tags for a photo (replace existing)
   */
  async setTags(photoId: string, tags: string[]): Promise<string[]> {
    const uniqueTags = [...new Set(tags)];
    
    await this.query(
      `UPDATE site_photos SET manual_tags = $1, updated_at = NOW() WHERE id = $2`,
      [uniqueTags, photoId]
    );

    return uniqueTags;
  }

  /**
   * Get all unique tags used in a project
   */
  async getProjectTags(projectId: string): Promise<{ tag: string; count: number }[]> {
    const result = await this.query(
      `SELECT unnest(manual_tags || ai_tags) as tag, COUNT(*) as count
       FROM site_photos
       WHERE project_id = $1 AND deleted_at IS NULL
       GROUP BY tag
       ORDER BY count DESC`,
      [projectId]
    );

    return result.rows.map(row => ({
      tag: row.tag,
      count: parseInt(row.count, 10),
    }));
  }

  // ==========================================================================
  // AI TAGS
  // ==========================================================================

  /**
   * Update AI-generated tags for a photo
   */
  async updateAITags(
    photoId: string,
    aiTags: string[],
    confidence?: number
  ): Promise<{ aiTags: string[]; aiConfidence?: number }> {
    const result = await this.query(
      `UPDATE site_photos
       SET ai_tags = $1, ai_confidence = $2, ai_tagged_at = NOW(), updated_at = NOW()
       WHERE id = $3
       RETURNING ai_tags, ai_confidence`,
      [aiTags, confidence || null, photoId]
    );

    if (result.rows[0]) {
      eventBus.emit('photo.ai.tagged', {
        photoId,
        tags: aiTags,
        confidence,
      });

      return {
        aiTags: result.rows[0].ai_tags || [],
        aiConfidence: result.rows[0].ai_confidence 
          ? parseFloat(result.rows[0].ai_confidence) 
          : undefined,
      };
    }

    return { aiTags: [] };
  }

  /**
   * Get photos pending AI tagging
   */
  async getPhotosNeedingAITags(
    projectId?: string,
    limit: number = 100
  ): Promise<Array<{ id: string; filePath: string; category: string }>> {
    const conditions = ['deleted_at IS NULL', 'ai_tagged_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(projectId);
    }

    params.push(limit);

    const result = await this.query(
      `SELECT id, file_path, category
       FROM site_photos
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at ASC
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      category: row.category,
    }));
  }

  /**
   * Bulk update AI tags
   */
  async bulkUpdateAITags(
    updates: Array<{ photoId: string; aiTags: string[]; confidence?: number }>
  ): Promise<number> {
    let updated = 0;

    await this.executeInTransaction(async (client) => {
      for (const update of updates) {
        await client.query(
          `UPDATE site_photos
           SET ai_tags = $1, ai_confidence = $2, ai_tagged_at = NOW(), updated_at = NOW()
           WHERE id = $3`,
          [update.aiTags, update.confidence || null, update.photoId]
        );
        updated++;
      }
    });

    return updated;
  }

  // ==========================================================================
  // SEARCH BY TAGS
  // ==========================================================================

  /**
   * Search photos by tags
   */
  async searchByTags(
    projectId: string,
    tags: string[],
    matchAll: boolean = false
  ): Promise<Photo[]> {
    const operator = matchAll ? '@>' : '&&';
    
    const result = await this.query(
      `SELECT sp.*, u.full_name as uploaded_by_name
       FROM site_photos sp
       LEFT JOIN users u ON sp.uploaded_by = u.id
       WHERE sp.project_id = $1 
         AND sp.deleted_at IS NULL
         AND ((sp.manual_tags ${operator} $2) OR (sp.ai_tags ${operator} $2))
       ORDER BY sp.created_at DESC`,
      [projectId, tags]
    );

    return result.rows.map(this.mapPhoto);
  }

  /**
   * Get photos with specific annotation types
   */
  async getPhotosWithAnnotations(
    projectId: string,
    annotationType?: string
  ): Promise<Array<{ photo: Photo; commentCount: number }>> {
    const conditions = ['sp.project_id = $1', 'sp.deleted_at IS NULL'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (annotationType) {
      conditions.push(`pc.annotation_type = $${paramIndex++}`);
      params.push(annotationType);
    } else {
      conditions.push('pc.annotation_x IS NOT NULL');
    }

    const result = await this.query(
      `SELECT 
         sp.*,
         u.full_name as uploaded_by_name,
         COUNT(pc.id) as comment_count
       FROM site_photos sp
       JOIN photo_comments pc ON sp.id = pc.photo_id
       LEFT JOIN users u ON sp.uploaded_by = u.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY sp.id, u.full_name
       ORDER BY comment_count DESC`,
      params
    );

    return result.rows.map(row => ({
      photo: this.mapPhoto(row),
      commentCount: parseInt(row.comment_count, 10),
    }));
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapComment(row: any): PhotoComment {
    return {
      id: row.id,
      photoId: row.photo_id,
      comment: row.comment,
      annotationX: row.annotation_x ? parseFloat(row.annotation_x) : undefined,
      annotationY: row.annotation_y ? parseFloat(row.annotation_y) : undefined,
      annotationType: row.annotation_type,
      annotationData: typeof row.annotation_data === 'string' 
        ? JSON.parse(row.annotation_data) 
        : row.annotation_data,
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
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const photoAnnotationService = new PhotoAnnotationServiceImpl();
