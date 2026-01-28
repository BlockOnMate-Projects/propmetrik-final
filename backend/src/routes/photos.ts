/**
 * Photo Documentation Routes
 * Phase 3A Week 3: Site Photo Management API
 * 
 * Provides endpoints for:
 * - Photo CRUD operations
 * - Album management
 * - Comments and annotations
 * - Before/after comparisons
 * - Share links
 * - Photo analytics
 * 
 * @module routes/photos
 */

import express, { Request, Response } from 'express';
import { photoService, PhotoFilters } from '../services/project-management/photoService';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

const router = express.Router();

// ============================================================================
// File Upload Configuration
// ============================================================================

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'photos', new Date().toISOString().split('T')[0]);
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 20 // Max 20 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
    }
  }
});

// Helper to get user info from request
const getUserId = (req: Request): string => {
  return (req as any).user?.id || req.headers['x-user-id'] as string || 'system';
};

const getOrganizationId = (req: Request): string => {
  return (req as any).user?.organizationId || req.headers['x-organization-id'] as string || 'default';
};

// ============================================================================
// Photo CRUD Endpoints
// ============================================================================

/**
 * GET /
 * List photos with filters and pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: PhotoFilters = {
      projectId: req.query.projectId as string,
      phaseId: req.query.phaseId as string,
      unitId: req.query.unitId as string,
      category: req.query.category as any,
      status: req.query.status as any,
      uploadedBy: req.query.uploadedBy as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      hasGeoTag: req.query.hasGeoTag ? req.query.hasGeoTag === 'true' : undefined,
      search: req.query.search as string
    };

    const pagination = {
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      sortBy: req.query.sortBy as string || 'created_at',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await photoService.getAll(filters, pagination);

    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error('Failed to list photos', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /:id
 * Get photo by ID with full details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const photo = await photoService.getById(req.params.id);

    if (!photo) {
      return res.status(404).json({ success: false, error: 'Photo not found' });
    }

    res.json({ success: true, photo });
  } catch (error: any) {
    logger.error('Failed to get photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /
 * Create photo record (metadata only, without file)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    const photo = await photoService.create({
      ...req.body,
      uploadedBy: userId,
      organizationId
    });

    res.status(201).json({ success: true, photo });
  } catch (error: any) {
    logger.error('Failed to create photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /upload
 * Upload photos with files
 */
router.post('/upload', upload.array('photos', 20), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const { projectId, category = 'progress', phaseId, unitId } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }

    // Parse geo data if provided
    const latitude = req.body.latitude ? parseFloat(req.body.latitude) : undefined;
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : undefined;

    const results = [];

    for (const file of files) {
      try {
        const photo = await photoService.create({
          projectId,
          phaseId,
          unitId,
          title: req.body.title || file.originalname.replace(/\.[^/.]+$/, ''),
          description: req.body.description,
          category,
          filePath: file.path,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          latitude,
          longitude,
          locationName: req.body.locationName,
          manualTags: req.body.tags ? JSON.parse(req.body.tags) : [],
          uploadedBy: userId,
          organizationId
        });

        results.push({ success: true, photo });
      } catch (error: any) {
        results.push({ success: false, fileName: file.originalname, error: error.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.status(201).json({
      success: true,
      uploaded: successful,
      failed,
      results
    });
  } catch (error: any) {
    logger.error('Failed to upload photos', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /:id
 * Update photo metadata
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const photo = await photoService.update(req.params.id, req.body, userId);

    res.json({ success: true, photo });
  } catch (error: any) {
    logger.error('Failed to update photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:id/approve
 * Approve a photo
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const photo = await photoService.approve(req.params.id, userId);

    res.json({ success: true, photo });
  } catch (error: any) {
    logger.error('Failed to approve photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:id/reject
 * Reject a photo
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { reason } = req.body;
    const photo = await photoService.reject(req.params.id, userId, reason);

    res.json({ success: true, photo });
  } catch (error: any) {
    logger.error('Failed to reject photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /:id
 * Soft delete a photo
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await photoService.delete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Photo not found' });
    }

    res.json({ success: true, message: 'Photo deleted' });
  } catch (error: any) {
    logger.error('Failed to delete photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:id/tags
 * Add tags to a photo
 */
router.post('/:id/tags', async (req: Request, res: Response) => {
  try {
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ success: false, error: 'tags array required' });
    }

    const photo = await photoService.addTags(req.params.id, tags);

    res.json({ success: true, photo });
  } catch (error: any) {
    logger.error('Failed to add tags', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /:id/tags
 * Remove tags from a photo
 */
router.delete('/:id/tags', async (req: Request, res: Response) => {
  try {
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ success: false, error: 'tags array required' });
    }

    const photo = await photoService.removeTags(req.params.id, tags);

    res.json({ success: true, photo });
  } catch (error: any) {
    logger.error('Failed to remove tags', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Album Endpoints
// ============================================================================

/**
 * GET /albums
 * List albums for a project
 */
router.get('/albums/project/:projectId', async (req: Request, res: Response) => {
  try {
    const albums = await photoService.getAlbumsByProject(req.params.projectId);

    res.json({ success: true, albums });
  } catch (error: any) {
    logger.error('Failed to list albums', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /albums/:id
 * Get album with photos
 */
router.get('/albums/:id', async (req: Request, res: Response) => {
  try {
    const album = await photoService.getAlbumById(req.params.id);

    if (!album) {
      return res.status(404).json({ success: false, error: 'Album not found' });
    }

    res.json({ success: true, album });
  } catch (error: any) {
    logger.error('Failed to get album', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /albums
 * Create a new album
 */
router.post('/albums', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    const album = await photoService.createAlbum({
      ...req.body,
      createdBy: userId,
      organizationId
    });

    res.status(201).json({ success: true, album });
  } catch (error: any) {
    logger.error('Failed to create album', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /albums/:id
 * Update album
 */
router.put('/albums/:id', async (req: Request, res: Response) => {
  try {
    const album = await photoService.updateAlbum(req.params.id, req.body);

    res.json({ success: true, album });
  } catch (error: any) {
    logger.error('Failed to update album', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /albums/:id/photos
 * Add photos to an album
 */
router.post('/albums/:id/photos', async (req: Request, res: Response) => {
  try {
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds)) {
      return res.status(400).json({ success: false, error: 'photoIds array required' });
    }

    const userId = getUserId(req);
    const added = await photoService.addPhotosToAlbum(req.params.id, photoIds, userId);

    res.json({ success: true, added });
  } catch (error: any) {
    logger.error('Failed to add photos to album', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /albums/:id/photos
 * Remove photos from an album
 */
router.delete('/albums/:id/photos', async (req: Request, res: Response) => {
  try {
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds)) {
      return res.status(400).json({ success: false, error: 'photoIds array required' });
    }

    const removed = await photoService.removePhotosFromAlbum(req.params.id, photoIds);

    res.json({ success: true, removed });
  } catch (error: any) {
    logger.error('Failed to remove photos from album', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /albums/:id/reorder
 * Reorder photos in an album
 */
router.put('/albums/:id/reorder', async (req: Request, res: Response) => {
  try {
    const { photoOrders } = req.body;

    if (!photoOrders || !Array.isArray(photoOrders)) {
      return res.status(400).json({ success: false, error: 'photoOrders array required' });
    }

    await photoService.reorderAlbumPhotos(req.params.id, photoOrders);

    res.json({ success: true, message: 'Photos reordered' });
  } catch (error: any) {
    logger.error('Failed to reorder photos', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /albums/:id
 * Delete an album
 */
router.delete('/albums/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await photoService.deleteAlbum(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Album not found' });
    }

    res.json({ success: true, message: 'Album deleted' });
  } catch (error: any) {
    logger.error('Failed to delete album', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Comment Endpoints
// ============================================================================

/**
 * GET /:id/comments
 * Get comments for a photo
 */
router.get('/:id/comments', async (req: Request, res: Response) => {
  try {
    const comments = await photoService.getComments(req.params.id);

    res.json({ success: true, comments });
  } catch (error: any) {
    logger.error('Failed to get comments', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:id/comments
 * Add a comment to a photo
 */
router.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    const comment = await photoService.addComment({
      photoId: req.params.id,
      ...req.body,
      createdBy: userId
    });

    res.status(201).json({ success: true, comment });
  } catch (error: any) {
    logger.error('Failed to add comment', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /comments/:id
 * Update a comment
 */
router.put('/comments/:id', async (req: Request, res: Response) => {
  try {
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({ success: false, error: 'comment required' });
    }

    const updated = await photoService.updateComment(req.params.id, comment);

    res.json({ success: true, comment: updated });
  } catch (error: any) {
    logger.error('Failed to update comment', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /comments/:id
 * Delete a comment
 */
router.delete('/comments/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await photoService.deleteComment(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error: any) {
    logger.error('Failed to delete comment', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Comparison Endpoints
// ============================================================================

/**
 * GET /comparisons/project/:projectId
 * Get comparisons for a project
 */
router.get('/comparisons/project/:projectId', async (req: Request, res: Response) => {
  try {
    const comparisons = await photoService.getComparisonsByProject(req.params.projectId);

    res.json({ success: true, comparisons });
  } catch (error: any) {
    logger.error('Failed to get comparisons', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /comparisons/:id
 * Get comparison by ID
 */
router.get('/comparisons/:id', async (req: Request, res: Response) => {
  try {
    const comparison = await photoService.getComparisonById(req.params.id);

    if (!comparison) {
      return res.status(404).json({ success: false, error: 'Comparison not found' });
    }

    res.json({ success: true, comparison });
  } catch (error: any) {
    logger.error('Failed to get comparison', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /comparisons
 * Create a before/after comparison
 */
router.post('/comparisons', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    const comparison = await photoService.createComparison({
      ...req.body,
      createdBy: userId
    });

    res.status(201).json({ success: true, comparison });
  } catch (error: any) {
    logger.error('Failed to create comparison', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /comparisons/:id
 * Delete a comparison
 */
router.delete('/comparisons/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await photoService.deleteComparison(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Comparison not found' });
    }

    res.json({ success: true, message: 'Comparison deleted' });
  } catch (error: any) {
    logger.error('Failed to delete comparison', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Share Link Endpoints
// ============================================================================

/**
 * POST /share/photo/:id
 * Create a share link for a photo
 */
router.post('/share/photo/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { expiresInDays, password, maxViews, allowDownload } = req.body;

    const shareLink = await photoService.createShareLink(
      'photo',
      req.params.id,
      userId,
      { expiresInDays, password, maxViews, allowDownload }
    );

    res.status(201).json({ success: true, shareLink });
  } catch (error: any) {
    logger.error('Failed to create share link', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /share/album/:id
 * Create a share link for an album
 */
router.post('/share/album/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { expiresInDays, password, maxViews, allowDownload } = req.body;

    const shareLink = await photoService.createShareLink(
      'album',
      req.params.id,
      userId,
      { expiresInDays, password, maxViews, allowDownload }
    );

    res.status(201).json({ success: true, shareLink });
  } catch (error: any) {
    logger.error('Failed to create share link', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /share/:token
 * Access shared content via token
 */
router.get('/share/:token', async (req: Request, res: Response) => {
  try {
    const { password } = req.query;

    const content = await photoService.getShareLinkContent(
      req.params.token,
      password as string
    );

    res.json({ success: true, ...content });
  } catch (error: any) {
    logger.error('Failed to access share link', { error });
    const status = error.message.includes('expired') || error.message.includes('not found') 
      ? 404 
      : error.message.includes('password') ? 401 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /share/:id
 * Delete a share link
 */
router.delete('/share/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await photoService.deleteShareLink(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Share link not found' });
    }

    res.json({ success: true, message: 'Share link deleted' });
  } catch (error: any) {
    logger.error('Failed to delete share link', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Analytics Endpoints
// ============================================================================

/**
 * GET /stats/project/:projectId
 * Get photo statistics for a project
 */
router.get('/stats/project/:projectId', async (req: Request, res: Response) => {
  try {
    const stats = await photoService.getProjectStats(req.params.projectId);

    res.json({ success: true, stats });
  } catch (error: any) {
    logger.error('Failed to get photo stats', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /recent/project/:projectId
 * Get recent photos for a project
 */
router.get('/recent/project/:projectId', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const photos = await photoService.getRecentPhotos(req.params.projectId, limit);

    res.json({ success: true, photos });
  } catch (error: any) {
    logger.error('Failed to get recent photos', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /timeline/project/:projectId
 * Get photo timeline for a project
 */
router.get('/timeline/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const timeline = await photoService.getPhotoTimeline(
      req.params.projectId,
      dateFrom as string,
      dateTo as string
    );

    res.json({ success: true, timeline });
  } catch (error: any) {
    logger.error('Failed to get photo timeline', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /nearby
 * Get photos near a location
 */
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, radius, projectId } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'latitude and longitude required' });
    }

    const photos = await photoService.getPhotosByLocation(
      parseFloat(latitude as string),
      parseFloat(longitude as string),
      parseFloat(radius as string) || 1,
      projectId as string
    );

    res.json({ success: true, photos });
  } catch (error: any) {
    logger.error('Failed to get nearby photos', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
