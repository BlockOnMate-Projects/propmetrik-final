/**
 * Photos Module
 * 
 * Phase 3.7: Split photoService (1207 lines)
 * 
 * Provides:
 * - PhotoUploadService: CRUD, approval workflow, stats
 * - PhotoOrganizationService: Albums, comparisons, share links
 * - PhotoAnnotationService: Comments, tags, AI tagging
 * 
 * @module services/project-management/photos
 */

// Types
export * from './types';

// Services
export { photoUploadService } from './PhotoUploadService';
export { photoOrganizationService } from './PhotoOrganizationService';
export { photoAnnotationService } from './PhotoAnnotationService';

// =============================================================================
// FACADE (provides backward-compatible interface)
// =============================================================================

import { photoUploadService } from './PhotoUploadService';
import { photoOrganizationService } from './PhotoOrganizationService';
import { photoAnnotationService } from './PhotoAnnotationService';
import {
  Photo,
  CreatePhotoInput,
  UpdatePhotoInput,
  PhotoFilters,
  PhotoStats,
  PhotoTimelineEntry,
  PaginationParams,
  PaginatedResult,
  Album,
  CreateAlbumInput,
  UpdateAlbumInput,
  PhotoComparison,
  CreateComparisonInput,
  ShareLink,
  ShareLinkOptions,
  ShareLinkContent,
  PhotoComment,
  CreateCommentInput,
} from './types';

/**
 * Photos Facade
 * 
 * Provides unified access to all photo functionality.
 * Use this for backward compatibility with photoService.
 */
export class PhotosFacade {
  // ==========================================================================
  // PHOTO CRUD
  // ==========================================================================

  async create(input: CreatePhotoInput): Promise<Photo> {
    return photoUploadService.create(input);
  }

  async createBulk(photos: CreatePhotoInput[]): Promise<Photo[]> {
    return photoUploadService.createBulk(photos);
  }

  async getById(id: string): Promise<Photo | null> {
    return photoUploadService.getById(id);
  }

  async getAll(filters: PhotoFilters, pagination?: PaginationParams): Promise<PaginatedResult<Photo>> {
    return photoUploadService.getAll(filters, pagination);
  }

  async update(id: string, data: UpdatePhotoInput, userId: string): Promise<Photo | null> {
    return photoUploadService.update(id, data, userId);
  }

  async delete(id: string): Promise<boolean> {
    return photoUploadService.delete(id);
  }

  // ==========================================================================
  // APPROVAL WORKFLOW
  // ==========================================================================

  async approve(id: string, userId: string): Promise<Photo | null> {
    return photoUploadService.approve(id, userId);
  }

  async reject(id: string, userId: string, reason?: string): Promise<Photo | null> {
    return photoUploadService.reject(id, userId, reason);
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  async getProjectStats(projectId: string): Promise<PhotoStats> {
    return photoUploadService.getProjectStats(projectId);
  }

  async getRecentPhotos(projectId: string, limit?: number): Promise<Photo[]> {
    return photoUploadService.getRecentPhotos(projectId, limit);
  }

  async getPhotoTimeline(projectId: string, dateFrom?: string, dateTo?: string): Promise<PhotoTimelineEntry[]> {
    return photoUploadService.getPhotoTimeline(projectId, dateFrom, dateTo);
  }

  async getPhotosByLocation(lat: number, lon: number, radiusKm?: number, projectId?: string): Promise<Photo[]> {
    return photoUploadService.getPhotosByLocation(lat, lon, radiusKm, projectId);
  }

  // ==========================================================================
  // ALBUMS
  // ==========================================================================

  async createAlbum(input: CreateAlbumInput): Promise<Album> {
    return photoOrganizationService.createAlbum(input);
  }

  async getAlbumById(id: string): Promise<(Album & { photos: Photo[] }) | null> {
    return photoOrganizationService.getAlbumById(id);
  }

  async getAlbumsByProject(projectId: string): Promise<Album[]> {
    return photoOrganizationService.getAlbumsByProject(projectId);
  }

  async updateAlbum(id: string, data: UpdateAlbumInput): Promise<Album | null> {
    return photoOrganizationService.updateAlbum(id, data);
  }

  async deleteAlbum(id: string): Promise<boolean> {
    return photoOrganizationService.deleteAlbum(id);
  }

  async addPhotosToAlbum(albumId: string, photoIds: string[], userId: string): Promise<number> {
    return photoOrganizationService.addPhotosToAlbum(albumId, photoIds, userId);
  }

  async removePhotosFromAlbum(albumId: string, photoIds: string[]): Promise<number> {
    return photoOrganizationService.removePhotosFromAlbum(albumId, photoIds);
  }

  async reorderAlbumPhotos(albumId: string, photoIds: string[]): Promise<void> {
    return photoOrganizationService.reorderAlbumPhotos(albumId, photoIds);
  }

  // ==========================================================================
  // COMPARISONS
  // ==========================================================================

  async createComparison(input: CreateComparisonInput): Promise<PhotoComparison> {
    return photoOrganizationService.createComparison(input);
  }

  async getComparisonById(id: string): Promise<PhotoComparison | null> {
    return photoOrganizationService.getComparisonById(id);
  }

  async getComparisonsByProject(projectId: string): Promise<PhotoComparison[]> {
    return photoOrganizationService.getComparisonsByProject(projectId);
  }

  async deleteComparison(id: string): Promise<boolean> {
    return photoOrganizationService.deleteComparison(id);
  }

  // ==========================================================================
  // SHARE LINKS
  // ==========================================================================

  async createShareLink(entityType: 'photo' | 'album', entityId: string, userId: string, options?: ShareLinkOptions): Promise<ShareLink> {
    return photoOrganizationService.createShareLink(entityType, entityId, userId, options);
  }

  async getShareLinkContent(token: string, password?: string): Promise<ShareLinkContent> {
    return photoOrganizationService.getShareLinkContent(token, password);
  }

  async deleteShareLink(id: string): Promise<boolean> {
    return photoOrganizationService.deleteShareLink(id);
  }

  // ==========================================================================
  // COMMENTS & ANNOTATIONS
  // ==========================================================================

  async addComment(input: CreateCommentInput): Promise<PhotoComment> {
    return photoAnnotationService.addComment(input);
  }

  async getComments(photoId: string): Promise<PhotoComment[]> {
    return photoAnnotationService.getComments(photoId);
  }

  async updateComment(commentId: string, comment: string): Promise<PhotoComment | null> {
    return photoAnnotationService.updateComment(commentId, comment);
  }

  async deleteComment(commentId: string): Promise<boolean> {
    return photoAnnotationService.deleteComment(commentId);
  }

  // ==========================================================================
  // TAGS
  // ==========================================================================

  async addTags(photoId: string, tags: string[]): Promise<string[]> {
    return photoAnnotationService.addTags(photoId, tags);
  }

  async removeTags(photoId: string, tags: string[]): Promise<string[]> {
    return photoAnnotationService.removeTags(photoId, tags);
  }

  async updateAITags(photoId: string, aiTags: string[], confidence?: number): Promise<{ aiTags: string[]; aiConfidence?: number }> {
    return photoAnnotationService.updateAITags(photoId, aiTags, confidence);
  }

  async getProjectTags(projectId: string): Promise<{ tag: string; count: number }[]> {
    return photoAnnotationService.getProjectTags(projectId);
  }

  async searchByTags(projectId: string, tags: string[], matchAll?: boolean): Promise<Photo[]> {
    return photoAnnotationService.searchByTags(projectId, tags, matchAll);
  }
}

// Singleton export
export const photosFacade = new PhotosFacade();

// Default export for backward compatibility
export default photosFacade;
