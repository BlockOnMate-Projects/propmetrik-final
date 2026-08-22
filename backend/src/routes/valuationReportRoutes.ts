/**
 * Valuation report, documents, overrides, and reconciliation routes — extracted from valuations.ts (Phase 4).
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { query } from '../database';
import { logger } from '../utils/logger';
import { ghanaPostService } from '../services/data-hub/ghanaPostGeocodingService';
import { valuationReportService } from '../services/valuation-engine';
import { floorPlanService } from '../services/valuation-engine/floorPlanService';
import { valuationDocumentService, ValuationDocType } from '../services/valuation-engine/valuationDocumentService';
import { overrideTrackingService } from '../services/valuation-engine/overrideTrackingService';
import { validateUUID } from './valuationRouteMiddleware';

const router = Router();

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf';
    if (ok) cb(null, true);
    else cb(new Error('Only image or PDF files are allowed'));
  },
});

/**
 * @route GET /api/valuations/:id/report
 * @desc Generate PDF report for a valuation
 * @access Private
 */
router.get('/:id/report', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const format = req.query.format as string || 'json';
    const template = req.query.template as string || 'standard';

    // Generate report data
    const reportData = await valuationReportService.generateReport(id, {
      template: template as any,
      includeComparables: req.query.includeComparables !== 'false',
      includeMethodDetails: req.query.includeMethodDetails !== 'false',
      includeMarketAnalysis: req.query.includeMarketAnalysis !== 'false',
      currency: req.query.currency as any || 'GHS',
    });

    if (format === 'html') {
      const html = await valuationReportService.generateHtmlReport(id, {
        template: template as any,
      });
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    // Return JSON report data
    return res.json({
      success: true,
      data: reportData,
    });

  } catch (error: any) {
    logger.error('Failed to generate report', {
      valuationId: req.params.id,
      error: error.message,
    });

    if (error.message === 'Valuation not found' || error.message === 'Property not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate report',
    });
  }
});
// =====================================================
// FLOOR PLAN ROUTES
// =====================================================

// =====================================================
// DOCUMENTS & PHOTOS (Appendices C/D/E): subject photos, title documents, location map.
// Valuation-scoped, mirrors the floor-plan upload pattern (file in MinIO, ref in DB).
// =====================================================

/** POST /api/valuations/:id/documents — upload a photo or title document (base64 data URL). */
// Multer middleware wrapper that turns size/type rejections into clean client errors
// (a LIMIT_FILE_SIZE would otherwise surface as an opaque 500).
const handleDocumentUpload = (req: Request, res: Response, next: NextFunction) => {
  documentUpload.single('file')(req, res, (err: any) => {
    if (err) {
      const tooBig = err?.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'File too large' : 'Upload rejected',
        message: tooBig ? 'Maximum document size is 50MB' : (err?.message || 'Invalid upload'),
      });
    }
    next();
  });
};

router.post('/:id/documents', validateUUID('id'), handleDocumentUpload, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
    const allowed: ValuationDocType[] = ['photo', 'title_document', '3d_view'];
    const type: ValuationDocType = allowed.includes(body.docType) ? body.docType : 'photo';
    const displayOrder = body.displayOrder != null && Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0;

    let row;
    if (file?.buffer) {
      // Preferred path: streamed multipart file (no base64 inflation, no 10 MB JSON gate).
      row = await valuationDocumentService.saveFromBuffer({
        valuationId: req.params.id,
        propertyId: body.propertyId || null,
        buffer: file.buffer,
        mime: file.mimetype,
        filename: body.filename || file.originalname || null,
        docType: type,
        caption: body.caption || null,
        displayOrder,
        createdBy: (req as any).user?.id || null,
      });
    } else if (typeof body.dataUrl === 'string' && body.dataUrl) {
      // Legacy base64 path — retained for backward compatibility with any older callers.
      row = await valuationDocumentService.saveFromDataUrl({
        valuationId: req.params.id,
        propertyId: body.propertyId || null,
        dataUrl: body.dataUrl,
        filename: body.filename || null,
        docType: type,
        caption: body.caption || null,
        displayOrder,
        createdBy: (req as any).user?.id || null,
      });
    } else {
      return res.status(400).json({ error: 'Bad Request', message: 'A file (multipart field "file") or dataUrl is required' });
    }
    res.json({ success: true, data: row });
  } catch (err: any) {
    logger.error('Failed to upload valuation document', { error: err.message });
    res.status(500).json({ error: 'Upload failed', message: err.message });
  }
});

/** GET /api/valuations/:id/documents — list documents (optional ?type=photo|title_document|location_map). */
router.get('/:id/documents', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const type = req.query.type as ValuationDocType | undefined;
    const rows = await valuationDocumentService.list(req.params.id, type);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: 'List failed', message: err.message });
  }
});

/** DELETE /api/valuations/:id/documents/:docId */
router.delete('/:id/documents/:docId', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    await valuationDocumentService.remove(req.params.docId, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Delete failed', message: err.message });
  }
});

/** POST /api/valuations/:id/documents/location-map — (re)generate the satellite/location map. */
router.post('/:id/documents/location-map', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const propRes = await query(
      `SELECT p.id, p.latitude, p.longitude, p.digital_address FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [req.params.id]
    );
    const prop = propRes.rows[0];
    let lat = prop?.latitude != null ? Number(prop.latitude) : null;
    let lng = prop?.longitude != null ? Number(prop.longitude) : null;
    // No stored coordinates but the subject has a Ghana Post digital address —
    // resolve it (self-hosted GhanaPostGPS → public API → neighborhood fallback)
    // and persist the coordinates so every later consumer (report, analytics) has them.
    if ((lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) && prop?.digital_address) {
      const geo = await ghanaPostService.geocodeDigitalAddress(String(prop.digital_address)).catch(() => null);
      if (geo?.latitude != null && geo?.longitude != null) {
        lat = geo.latitude;
        lng = geo.longitude;
        await query(`UPDATE properties SET latitude = $1, longitude = $2 WHERE id = $3 AND latitude IS NULL`, [lat, lng, prop.id])
          .catch(() => { /* best-effort persist — map generation proceeds regardless */ });
      }
    }
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: prop?.digital_address
          ? `Could not resolve coordinates from digital address ${prop.digital_address} — set the property's location on the map or enter coordinates.`
          : 'Subject property has no coordinates to map — enter a digital address or set the location on the property.',
      });
    }
    const row = await valuationDocumentService.generateLocationMap(req.params.id, lat, lng, { propertyId: prop.id });
    if (!row) return res.status(502).json({ error: 'Map generation failed', message: 'Could not generate static map (check GOOGLE_MAPS_API_KEY)' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: 'Map generation failed', message: err.message });
  }
});

// Floor plans are drawn client-side (Konva) and stored as canvas_json + a rasterized PNG in MinIO

/**
 * POST /api/valuations/:id/floor-plans
 * Create a new floor plan for a valuation
 */
router.post('/:id/floor-plans', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { canvas_json, scale_pixels_per_meter, floor_number, floor_label, calibration_reference } = req.body;

    if (!canvas_json) {
      return res.status(400).json({ error: 'canvas_json is required' });
    }

    const floorPlan = await floorPlanService.create({
      valuation_id: req.params.id,
      canvas_json,
      scale_pixels_per_meter,
      floor_number,
      floor_label,
      calibration_reference,
      created_by: (req as any).user?.id
    });

    res.status(201).json({ success: true, data: floorPlan });
  } catch (error: any) {
    logger.error('Failed to create floor plan', { error: error.message });
    res.status(500).json({ error: 'Failed to create floor plan', message: error.message });
  }
});

/**
 * GET /api/valuations/:id/floor-plans
 * Get all floor plans for a valuation
 */
router.get('/:id/floor-plans', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const floorPlans = await floorPlanService.getByValuationId(req.params.id);
    res.json({ success: true, data: floorPlans });
  } catch (error: any) {
    logger.error('Failed to get floor plans', { error: error.message });
    res.status(500).json({ error: 'Failed to get floor plans' });
  }
});

/**
 * GET /api/valuations/:id/floor-plans/summary
 * Get floor plan summary with room counts and validation
 */
router.get('/:id/floor-plans/summary', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const summary = await floorPlanService.getSummary(req.params.id);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    logger.error('Failed to get floor plan summary', { error: error.message });
    res.status(500).json({ error: 'Failed to get floor plan summary' });
  }
});

/**
 * PUT /api/valuations/floor-plans/:planId
 * Update a floor plan
 */
router.put('/floor-plans/:planId', async (req: Request, res: Response) => {
  try {
    const { canvas_json, scale_pixels_per_meter, floor_label } = req.body;

    const floorPlan = await floorPlanService.update(req.params.planId, {
      canvas_json,
      scale_pixels_per_meter,
      floor_label
    });

    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    res.json({ success: true, data: floorPlan });
  } catch (error: any) {
    logger.error('Failed to update floor plan', { error: error.message });
    res.status(500).json({ error: 'Failed to update floor plan', message: error.message });
  }
});

/**
 * PUT /api/valuations/floor-plans/:planId/image
 * Upload floor plan image (PNG) for report appendices
 * Body: { imageDataUrl: "data:image/png;base64,...", width?: number, height?: number }
 */
router.put('/floor-plans/:planId/image', async (req: Request, res: Response) => {
  try {
    const { imageDataUrl, width, height } = req.body;

    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required' });
    }

    if (!imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data URL format' });
    }

    const floorPlan = await floorPlanService.saveImage(
      req.params.planId,
      imageDataUrl,
      width,
      height
    );

    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    logger.info('Floor plan image uploaded', {
      planId: req.params.planId,
      imageUrl: floorPlan.image_url
    });

    res.json({ success: true, data: floorPlan });
  } catch (error: any) {
    logger.error('Failed to upload floor plan image', { error: error.message });
    res.status(500).json({ error: 'Failed to upload floor plan image', message: error.message });
  }
});

/**
 * GET /api/valuations/floor-plans/:planId/image
 * Get presigned URL for floor plan image
 */
router.get('/floor-plans/:planId/image', async (req: Request, res: Response) => {
  try {
    const imageUrl = await floorPlanService.getImageUrl(req.params.planId);

    if (!imageUrl) {
      return res.status(404).json({ error: 'Floor plan image not found' });
    }

    res.json({ success: true, data: { imageUrl } });
  } catch (error: any) {
    logger.error('Failed to get floor plan image URL', { error: error.message });
    res.status(500).json({ error: 'Failed to get floor plan image URL', message: error.message });
  }
});

/**
 * GET /api/valuations/floor-plans/:planId/image-stream
 * Stream floor plan image directly from MinIO (avoids presigned URL expiry issues).
 * Used by report editor to display floor plan images without expiring URLs.
 */
router.get('/floor-plans/:planId/image-stream', async (req: Request, res: Response) => {
  try {
    const floorPlan = await floorPlanService.getById(req.params.planId);
    if (!floorPlan || !floorPlan.image_url) {
      return res.status(404).json({ error: 'Floor plan image not found' });
    }

    // Parse minio:// URL
    const match = floorPlan.image_url.match(/^minio:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid image URL format' });
    }

    const [, bucket, key] = match;
    const { getFile } = await import('../database/minio');
    const file = await getFile(bucket, key);

    const ext = key.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h cache
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', `inline; filename="floor-${floorPlan.floor_number}.${ext}"`);
    res.send(Buffer.from(file.body));
  } catch (error: any) {
    logger.error('Failed to stream floor plan image', { planId: req.params.planId, error: error.message });
    res.status(500).json({ error: 'Failed to stream floor plan image', message: error.message });
  }
});

/**
 * GET /api/valuations/:id/documents/:docId/image-stream
 * Stream a valuation document (location map / photo / title doc) from MinIO with a
 * non-expiring URL, so the report VIEWER can render Appendix C/D/E (mirrors floor plans).
 */
router.get('/:id/documents/:docId/image-stream', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT storage_url, mime_type, filename FROM valuation_documents WHERE id = $1 AND valuation_id = $2`,
      [req.params.docId, req.params.id]
    );
    const doc = r.rows[0];
    if (!doc?.storage_url) return res.status(404).json({ error: 'Document not found' });

    const match = String(doc.storage_url).match(/^minio:\/\/([^/]+)\/(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid storage URL format' });

    const [, bucket, key] = match;
    const { getFile } = await import('../database/minio');
    const file = await getFile(bucket, key);

    const ext = (key.split('.').pop() || 'png').toLowerCase();
    const mime = doc.mime_type
      || (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : 'image/png');

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename || 'document.' + ext}"`);
    res.send(Buffer.from(file.body));
  } catch (error: any) {
    logger.error('Failed to stream document image', { docId: req.params.docId, error: error.message });
    res.status(500).json({ error: 'Failed to stream document', message: error.message });
  }
});

/**
 * GET /api/valuations/:id/documents/:docId/image-pages
 * Render a document as ONE image (PDFs rasterized + stacked) for the report VIEWER's <img> —
 * avoids the X-Frame-Options block that prevents PDFs from rendering in an <iframe>.
 */
router.get('/:id/documents/:docId/image-pages', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await valuationDocumentService.getDocumentImage(req.params.id, req.params.docId);
    if (!result) return res.status(404).json({ error: 'Document image not available' });
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(result.buffer);
  } catch (error: any) {
    logger.error('Failed to render document image', { docId: req.params.docId, error: error.message });
    res.status(500).json({ error: 'Failed to render document', message: error.message });
  }
});

/**
 * POST /api/valuations/floor-plans/:planId/recalculate
 * Recalculate rooms from existing canvas data (after logic updates)
 */
router.post('/floor-plans/:planId/recalculate', async (req: Request, res: Response) => {
  try {
    const floorPlan = await floorPlanService.recalculate(req.params.planId);

    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    res.json({ success: true, data: floorPlan });
  } catch (error: any) {
    logger.error('Failed to recalculate floor plan', { error: error.message });
    res.status(500).json({ error: 'Failed to recalculate floor plan', message: error.message });
  }
});

/**
 * POST /api/valuations/floor-plans/:planId/lock
 * Lock a floor plan
 */
router.post('/floor-plans/:planId/lock', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const floorPlan = await floorPlanService.lock(req.params.planId, userId);
    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    res.json({ success: true, data: floorPlan });
  } catch (error: any) {
    logger.error('Failed to lock floor plan', { error: error.message });
    res.status(500).json({ error: 'Failed to lock floor plan', message: error.message });
  }
});

/**
 * POST /api/valuations/floor-plans/:planId/unlock
 * Unlock a locked floor plan (requires authentication, mirrors /lock)
 */
router.post('/floor-plans/:planId/unlock', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required to unlock floor plans' });
    }
    const floorPlan = await floorPlanService.unlock(req.params.planId);
    if (!floorPlan) {
      return res.status(404).json({ error: 'Not Found', message: 'Floor plan not found' });
    }
    res.json({ success: true, data: floorPlan });
  } catch (error: any) {
    logger.error('Failed to unlock floor plan', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * DELETE /api/valuations/floor-plans/:planId
 * Delete a floor plan
 */
router.delete('/floor-plans/:planId', async (req: Request, res: Response) => {
  try {
    const deleted = await floorPlanService.delete(req.params.planId);
    if (!deleted) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }
    res.json({ success: true, message: 'Floor plan deleted' });
  } catch (error: any) {
    logger.error('Failed to delete floor plan', { error: error.message });
    res.status(500).json({ error: 'Failed to delete floor plan', message: error.message });
  }
});
// =====================================================
// OVERRIDE TRACKING ROUTES
// =====================================================

/**
 * POST /api/valuations/:id/overrides
 * Record a user override
 */
router.post('/:id/overrides', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { category, field_path, field_label, system_default_value, user_override_value, value_unit, reason, supporting_evidence } = req.body;

    if (!category || !field_path || !field_label || system_default_value === undefined || user_override_value === undefined || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const override = await overrideTrackingService.create({
      valuation_id: req.params.id,
      category,
      field_path,
      field_label,
      system_default_value,
      user_override_value,
      value_unit,
      reason,
      supporting_evidence,
      overridden_by: userId
    });

    res.status(201).json({ success: true, data: override });
  } catch (error: any) {
    logger.error('Failed to create override', { error: error.message });
    res.status(500).json({ error: 'Failed to create override', message: error.message });
  }
});

/**
 * GET /api/valuations/:id/overrides
 * Get all overrides for a valuation
 */
router.get('/:id/overrides', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const overrides = await overrideTrackingService.getByValuationId(req.params.id);
    res.json({ success: true, data: overrides });
  } catch (error: any) {
    logger.error('Failed to get overrides', { error: error.message });
    res.status(500).json({ error: 'Failed to get overrides' });
  }
});

/**
 * GET /api/valuations/:id/overrides/summary
 * Get override summary with disclaimers
 */
router.get('/:id/overrides/summary', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const summary = await overrideTrackingService.getSummary(req.params.id);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    logger.error('Failed to get override summary', { error: error.message });
    res.status(500).json({ error: 'Failed to get override summary' });
  }
});

/**
 * POST /api/valuations/overrides/:overrideId/approve
 * Approve an override
 */
router.post('/overrides/:overrideId/approve', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { approval_notes } = req.body;
    const override = await overrideTrackingService.approve(req.params.overrideId, {
      approved_by: userId,
      approval_notes
    });

    if (!override) {
      return res.status(404).json({ error: 'Override not found' });
    }

    res.json({ success: true, data: override });
  } catch (error: any) {
    logger.error('Failed to approve override', { error: error.message });
    res.status(500).json({ error: 'Failed to approve override', message: error.message });
  }
});

/**
 * POST /api/valuations/overrides/:overrideId/reject
 * Reject an override
 */
router.post('/overrides/:overrideId/reject', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { approval_notes } = req.body;
    const override = await overrideTrackingService.reject(req.params.overrideId, {
      approved_by: userId,
      approval_notes
    });

    if (!override) {
      return res.status(404).json({ error: 'Override not found' });
    }

    res.json({ success: true, data: override });
  } catch (error: any) {
    logger.error('Failed to reject override', { error: error.message });
    res.status(500).json({ error: 'Failed to reject override', message: error.message });
  }
});
// =====================================================
// RECONCILIATION ROUTES
// Uses Python service for value reconciliation
// =====================================================

/**
 * GET /api/valuations/:id/reconciliation
 * Get reconciliation for a valuation
 */
router.get('/:id/reconciliation', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM valuation_reconciliations WHERE valuation_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );
    // Return empty data for new valuations (not an error condition)
    if (result.rows.length === 0) {
      return res.json({ success: true, data: null, message: 'No reconciliation data yet' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to get reconciliation', { error: error.message });
    res.status(500).json({ error: 'Failed to get reconciliation' });
  }
});

/**
 * POST /api/valuations/:id/reconciliation
 * Create reconciliation with method results
 */
router.post('/:id/reconciliation', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { method_results, weighting_method, property_type, valuation_purpose } = req.body;

    if (!method_results || Object.keys(method_results).length === 0) {
      return res.status(400).json({ error: 'method_results is required' });
    }

    // Filter intermediate method data before reconciliation (Recommendation 4)
    const INTERMEDIATE_METHODS = ['rental_market', 'rental_market_analysis', 'land_value'];
    const filteredResults: Record<string, any> = {};
    for (const [key, val] of Object.entries(method_results)) {
      if (!INTERMEDIATE_METHODS.includes(key)) {
        filteredResults[key] = val;
      }
    }

    // Augment with computed methods from methods_applied that are missing from the request
    // This ensures sales_comparison and other methods are included if they were computed
    try {
      const valuationRow = await query(
        `SELECT methods_applied, method_results as v_method_results FROM valuations WHERE id = $1`,
        [req.params.id]
      );
      if (valuationRow.rows.length > 0) {
        const { methods_applied, v_method_results } = valuationRow.rows[0];
        const appliedMethods: string[] = methods_applied || [];

        for (const method of appliedMethods) {
          if (INTERMEDIATE_METHODS.includes(method)) continue;
          if (filteredResults[method]) continue; // already in request

          // Check valuations.method_results for this method
          if (v_method_results && v_method_results[method]) {
            const mr = v_method_results[method];
            const value = mr.value || mr.value_ghs || mr.estimated_value || 0;
            if (value > 0) {
              filteredResults[method] = {
                ...mr,
                method,
                weight: mr.weight || 0,
              };
            }
          }

          // Also check valuation_method_inputs if still not found
          if (!filteredResults[method]) {
            const inputRow = await query(
              `SELECT calculated_value, confidence_score FROM valuation_method_inputs
               WHERE valuation_id = $1 AND method_type = $2 AND calculated_value IS NOT NULL AND calculated_value > 0`,
              [req.params.id, method]
            );
            if (inputRow.rows.length > 0) {
              filteredResults[method] = {
                value: Number(inputRow.rows[0].calculated_value),
                method,
                weight: 0,
                confidence_score: Number(inputRow.rows[0].confidence_score) || 0.5,
                data_quality_score: 0.7,
              };
            }
          }
        }
      }
    } catch (augmentError: any) {
      logger.warn('Failed to augment method_results with computed methods', { error: augmentError.message });
    }

    // Calculate weighted average from method_results directly (don't rely on Python service)
    let weightedSum = 0;
    let totalWeight = 0;
    let confidenceSum = 0;
    const methodWeights: Record<string, number> = {};
    const values: number[] = [];

    Object.entries(filteredResults).forEach(([method, data]: [string, any]) => {
      const value = data.value || data.value_ghs || data.estimated_value || 0;
      const weight = data.weight || 0;
      const confidence = data.confidence_score || data.confidence || 0.5;

      if (value > 0) {
        values.push(value);
        weightedSum += value * (weight / 100);
        totalWeight += weight;
        confidenceSum += confidence * weight;
        methodWeights[method] = weight;
      }
    });

    // Calculate reconciled value
    const reconciledValue = totalWeight > 0 ? weightedSum : (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0);
    const avgConfidence = totalWeight > 0 ? confidenceSum / totalWeight : 0.5;

    // Calculate value range
    const valueLow = values.length > 0 ? Math.min(...values) : reconciledValue;
    const valueHigh = values.length > 0 ? Math.max(...values) : reconciledValue;

    // Determine confidence level string from score
    const confidenceLevel = avgConfidence >= 0.8 ? 'high' : avgConfidence >= 0.6 ? 'medium' : 'low';

    // Store result in database - include all NOT NULL columns
    const insertResult = await query(
      `INSERT INTO valuation_reconciliations 
        (valuation_id, method_results, weighting_method, weighted_average_value, value_range_low, value_range_high, 
         method_weights, overall_confidence_score, overall_confidence_level, final_value_selection, final_market_value,
         reconciliation_narrative, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *`,
      [
        req.params.id,
        JSON.stringify(filteredResults),
        weighting_method || 'manual',
        reconciledValue,
        valueLow,
        valueHigh,
        JSON.stringify(methodWeights),
        avgConfidence,
        confidenceLevel,
        'weighted_average',  // final_value_selection - will be updated on finalize
        reconciledValue,     // final_market_value - initial value, will be updated on finalize
        '',                  // reconciliation_narrative - will be updated on finalize
        (req as any).user?.id
      ]
    );

    // Also update the main valuations table so dashboard shows the value
    await query(
      `UPDATE valuations SET
        final_value_ghs = $1,
        estimated_value = $1,
        confidence_score = $2,
        updated_at = NOW()
      WHERE id = $3`,
      [reconciledValue, avgConfidence, req.params.id]
    );

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create reconciliation', { error: error.message });
    res.status(500).json({ error: 'Failed to create reconciliation', message: error.message });
  }
});

/**
 * PUT /api/valuations/reconciliation/:reconciliationId/weights
 * Set manual method weights
 */
router.put('/reconciliation/:reconciliationId/weights', async (req: Request, res: Response) => {
  try {
    const { weights, justifications } = req.body;

    if (!weights) {
      return res.status(400).json({ error: 'weights is required' });
    }

    // Get the current reconciliation to access method_results
    const current = await query(
      `SELECT method_results, valuation_id FROM valuation_reconciliations WHERE id = $1`,
      [req.params.reconciliationId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation not found' });
    }

    const methodResults = current.rows[0].method_results || {};
    const valuationId = current.rows[0].valuation_id;

    // Recalculate weighted_average_value using method values × new weights
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [method, weight] of Object.entries(weights)) {
      const w = Number(weight) || 0;
      if (w <= 0) continue;

      // Get the indicated value for this method from method_results
      let value = 0;
      if (methodResults[method]?.indicated_value) {
        value = Number(methodResults[method].indicated_value);
      } else if (methodResults[method]?.value) {
        value = Number(methodResults[method].value);
      }

      // If method not in method_results, try valuation_method_inputs
      if (value === 0 && valuationId) {
        const inputResult = await query(
          `SELECT calculated_value FROM valuation_method_inputs
           WHERE valuation_id = $1 AND method_type = $2
           ORDER BY created_at DESC LIMIT 1`,
          [valuationId, method]
        );
        if (inputResult.rows.length > 0 && inputResult.rows[0].calculated_value) {
          value = Number(inputResult.rows[0].calculated_value);
        }
      }

      if (value > 0) {
        weightedSum += value * (w / 100);
        totalWeight += w;
      }
    }

    const weightedAverage = totalWeight > 0 ? Math.round(weightedSum) : null;

    const result = await query(
      `UPDATE valuation_reconciliations SET
        method_weights = $1,
        weighting_method = 'manual',
        weighted_average_value = COALESCE($3, weighted_average_value),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [JSON.stringify(weights), req.params.reconciliationId, weightedAverage]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to set method weights', { error: error.message });
    res.status(500).json({ error: 'Failed to set method weights', message: error.message });
  }
});

/**
 * POST /api/valuations/reconciliation/:reconciliationId/finalize
 * Finalize reconciliation with narrative and final value
 */
router.post('/reconciliation/:reconciliationId/finalize', async (req: Request, res: Response) => {
  try {
    // Make userId optional for development
    const userId = (req as any).user?.id || null;

    const { final_value_selection, final_market_value, reconciliation_narrative, special_assumptions, departures_from_standards, building_area_sqm } = req.body;

    if (!reconciliation_narrative) {
      return res.status(400).json({ error: 'reconciliation_narrative is required' });
    }

    const result = await query(
      `UPDATE valuation_reconciliations SET
        final_value_selection = $1,
        final_market_value = $2,
        reconciliation_narrative = $3,
        special_assumptions = $4,
        departures_from_standards = $5,
        building_area_sqm = $6,
        finalized_by = $7,
        finalized_at = NOW(),
        status = 'finalized',
        updated_at = NOW()
      WHERE id = $8
      RETURNING *`,
      [final_value_selection || 'weighted_average', final_market_value, reconciliation_narrative,
        special_assumptions, departures_from_standards, building_area_sqm, userId, req.params.reconciliationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation not found' });
    }

    const reconciliation = result.rows[0];

    // Also update the main valuations table with the final values
    await query(
      `UPDATE valuations SET
        final_value_ghs = $1,
        estimated_value = $1,
        confidence_score = $2,
        updated_at = NOW()
      WHERE id = $3`,
      [
        reconciliation.final_market_value,
        reconciliation.overall_confidence_score || 0.75,
        reconciliation.valuation_id
      ]
    );

    res.json({ success: true, data: reconciliation });
  } catch (error: any) {
    logger.error('Failed to finalize reconciliation', { error: error.message });
    res.status(500).json({ error: 'Failed to finalize reconciliation', message: error.message });
  }
});

/**
 * POST /api/valuations/reconciliation/:reconciliationId/approve
 * Approve reconciliation (reviewer)
 */
router.post('/reconciliation/:reconciliationId/approve', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { notes } = req.body;
    const result = await query(
      `UPDATE valuation_reconciliations SET
        approved_by = $1,
        approved_at = NOW(),
        approval_notes = $2,
        status = 'approved',
        updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
      [userId, notes, req.params.reconciliationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to approve reconciliation', { error: error.message });
    res.status(500).json({ error: 'Failed to approve reconciliation', message: error.message });
  }
});

/**
 * POST /api/valuations/reconciliation/:reconciliationId/lock
 * Lock reconciliation (final)
 */
router.post('/reconciliation/:reconciliationId/lock', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `UPDATE valuation_reconciliations SET
        is_locked = true,
        locked_at = NOW(),
        status = 'locked',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [req.params.reconciliationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to lock reconciliation', { error: error.message });
    res.status(500).json({ error: 'Failed to lock reconciliation', message: error.message });
  }
});

/**
 * GET /api/valuations/reconciliation/:reconciliationId/narrative-template
 * Get narrative template for reconciliation
 */
router.get('/reconciliation/:reconciliationId/narrative-template', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM valuation_reconciliations WHERE id = $1',
      [req.params.reconciliationId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation not found' });
    }

    const reconciliation = result.rows[0];
    const template = `
VALUATION RECONCILIATION

Based on our analysis using multiple valuation approaches, we have determined the following:

Methods Applied:
${Object.entries(reconciliation.method_results || {}).map(([method, data]: [string, any]) =>
      `- ${method.replace(/_/g, ' ').toUpperCase()}: GHS ${(data.estimated_value || data.value_ghs || 0).toLocaleString()}`
    ).join('\n')}

Reconciled Value: GHS ${(reconciliation.weighted_average_value || reconciliation.final_market_value || 0).toLocaleString()}
Value Range: GHS ${(reconciliation.value_range_low || 0).toLocaleString()} - GHS ${(reconciliation.value_range_high || 0).toLocaleString()}

Confidence Level: ${(reconciliation.overall_confidence_score || 0) >= 0.8 ? 'High' : (reconciliation.overall_confidence_score || 0) >= 0.6 ? 'Medium' : 'Low'}

[Add your professional commentary here]

Special Assumptions:
[List any special assumptions]

Departures from Standards:
[List any departures from RICS/IVS standards]
`;

    res.json({ success: true, data: { template } });
  } catch (error: any) {
    logger.error('Failed to generate narrative template', { error: error.message });
    res.status(500).json({ error: 'Failed to generate narrative template' });
  }
});

export default router;
