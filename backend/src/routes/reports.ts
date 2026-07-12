/**
 * Reports API Routes
 * 
 * REST API endpoints for Valuation Report management.
 * Implements RICS/GhIS compliant report lifecycle.
 * 
 * Phase 1 Endpoints:
 * - POST /api/reports - Create new draft report
 * - GET /api/reports/:id - Get report by ID
 * - GET /api/reports - List reports with filters
 * - PUT /api/reports/:id - Update draft report
 * - DELETE /api/reports/:id - Delete draft report
 * - GET /api/reports/:id/photos - Get report photos
 * - POST /api/reports/:id/photos - Upload photos
 * - DELETE /api/reports/:id/photos/:photoId - Delete photo
 * - PUT /api/reports/:id/photos/reorder - Reorder photos
 * - GET /api/reports/:id/audit - Get audit log
 */

import { Router, Request, Response, NextFunction } from 'express';
import config from '../config';
import { logger } from '../utils/logger';
import { pool } from '../database';
import { scanUploadedFiles } from '../middleware/virusScan';
import { authenticate } from '../middleware/auth';
import {
  reportService,
  ReportStatus,
  ReportTemplate,
  PhotoCategory,
  CreateReportInput,
  UpdateReportInput,
  ReportListFilters,
} from '../services/valuation-engine/reportService';
import { reportDataService } from '../services/valuation-engine/reportDataService';
import { docGenerationService, DocxGenerationOptions } from '../services/valuation-engine/docGenerationService';
import { 
  imageProcessingService,
  approvalService,
  pdfGenerationService,
  auditLogService,
} from '../services/valuation-engine';
import { getPresignedDownloadUrl, getFile, uploadFile } from '../database/minio';
import { reportTemplateService } from '../services/valuation-engine/reportTemplateService';
import { notificationService, pdfSigningService } from '../../shared-services';
import crypto from 'crypto';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Validate UUID parameter
 */
const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuid || !uuidRegex.test(uuid)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid ${paramName}: must be a valid UUID`,
      });
    }

    next();
  };
};

/**
 * Validate create report request
 */
const validateCreateReport = (req: Request, res: Response, next: NextFunction) => {
  const { valuation_id, template } = req.body;

  if (!valuation_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'valuation_id is required',
    });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(valuation_id)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'valuation_id must be a valid UUID',
    });
  }

  const validTemplates: ReportTemplate[] = [
    'ghis_standard',
    'rics_residential',
    'rics_commercial',
    'bank_mortgage',
    'insurance',
    'custom',
  ];

  if (template && !validTemplates.includes(template)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Invalid template. Must be one of: ${validTemplates.join(', ')}`,
    });
  }

  next();
};

// =====================================================
// PUBLIC ENDPOINTS (no auth required — verification)
// These MUST be defined BEFORE router.use(authenticate)
// =====================================================

/**
 * GET /api/reports/verify/:hash
 * Public: Verify report by digital seal hash (QR code verification)
 */
router.get('/verify/:hash', async (req: Request, res: Response) => {
  try {
    const hash = req.params.hash;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
    const result = await approvalService.verifyByHash(hash);
    if (result.valid && result.report) {
      await auditLogService.logVerified(result.report.id, ipAddress, true);
    }
    res.json({ hash, ...result });
  } catch (error: any) {
    logger.error('Failed to verify by hash', { hash: req.params.hash, error: error.message });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify report' });
  }
});

/**
 * GET /api/reports/:id/verify
 * Public: Verify report by ID
 */
router.get('/:id/verify', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
    const result = await approvalService.verifyReportById(req.params.id);
    await auditLogService.logVerified(req.params.id, ipAddress, result.valid);
    res.json({ report_id: req.params.id, ...result });
  } catch (error: any) {
    logger.error('Failed to verify report', { reportId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify report' });
  }
});

// =====================================================
// AUTH GUARD — all routes below require authentication
// =====================================================
router.use(authenticate);

// =====================================================
// REPORT CRUD ENDPOINTS
// =====================================================

/**
 * POST /api/reports
 * Create a new draft report from a valuation
 */
router.post('/', validateCreateReport, async (req: Request, res: Response) => {
  try {
    const input: CreateReportInput = {
      valuation_id: req.body.valuation_id,
      template: req.body.template || 'ghis_standard',
      options: req.body.options || {},
    };

    // Get user ID from auth context (placeholder for now)
    const userId = (req as any).user?.id || null;

    const report = await reportService.createReport(input, userId);

    logger.info('Report created via API', {
      reportId: report.id,
      valuationId: input.valuation_id,
      template: report.template,
    });

    res.status(201).json(report);
  } catch (error: any) {
    logger.error('Failed to create report', { error: error.message });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    if (error.message.includes('must be completed') || error.message.includes('already exists')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create report',
    });
  }
});

/**
 * GET /api/reports
 * List reports with filters and pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: ReportListFilters = {
      status: req.query.status as ReportStatus | undefined,
      template: req.query.template as ReportTemplate | undefined,
      valuation_id: req.query.valuation_id as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    };

    if (req.query.from_date) {
      filters.from_date = new Date(req.query.from_date as string);
    }
    if (req.query.to_date) {
      filters.to_date = new Date(req.query.to_date as string);
    }

    const result = await reportService.listReports(filters);

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to list reports', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list reports',
    });
  }
});



/**
 * GET /api/reports/:id
 * Get a report by ID
 */
router.get('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const report = await reportService.getReportById(req.params.id);

    if (!report) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Report not found: ${req.params.id}`,
      });
    }

    res.json(report);
  } catch (error: any) {
    logger.error('Failed to get report', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get report',
    });
  }
});

/**
 * PUT /api/reports/:id
 * Update a draft report's content
 */
router.put('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const input: UpdateReportInput = {
      sections: req.body.sections,
      content: req.body.content,
    };

    const userId = (req as any).user?.id || null;

    const report = await reportService.updateReport(req.params.id, input, userId);

    logger.info('Report updated via API', { reportId: report.id });

    res.json(report);
  } catch (error: any) {
    logger.error('Failed to update report', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    if (error.message.includes('Cannot update')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update report',
    });
  }
});

/**
 * DELETE /api/reports/:id
 * Delete a draft report
 */
router.delete('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || null;

    await reportService.deleteReport(req.params.id, userId);

    logger.info('Report deleted via API', { reportId: req.params.id });

    res.status(204).send();
  } catch (error: any) {
    logger.error('Failed to delete report', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    if (error.message.includes('Cannot delete')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete report',
    });
  }
});

/**
 * POST /api/reports/:id/supersede
 * Create a new version of an approved report
 */
router.post('/:id/supersede', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || null;

    const newReport = await reportService.supersede(req.params.id, userId);

    logger.info('Report superseded via API', { 
      oldReportId: req.params.id,
      newReportId: newReport.id,
      version: newReport.version,
    });

    res.status(201).json(newReport);
  } catch (error: any) {
    logger.error('Failed to supersede report', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    if (error.message.includes('Only approved')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to supersede report',
    });
  }
});

// =====================================================
// PHOTO ENDPOINTS
// =====================================================

/**
 * GET /api/reports/:id/photos
 * Get all photos for a report
 */
router.get('/:id/photos', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const photos = await reportService.getPhotos(req.params.id);
    res.json({ photos });
  } catch (error: any) {
    logger.error('Failed to get report photos', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get photos',
    });
  }
});

/**
 * POST /api/reports/:id/photos
 * Add a photo to a report
 * Note: Actual file upload should go through a separate upload endpoint to MinIO
 */
router.post('/:id/photos', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { storage_url, category, caption, thumbnail_url, file_size_bytes } = req.body;

    if (!storage_url) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'storage_url is required',
      });
    }

    const validCategories: PhotoCategory[] = [
      'exterior', 'interior', 'amenities', 'neighbourhood', 'damage'
    ];
    if (category && !validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      });
    }

    const photo = await reportService.addPhoto(
      req.params.id,
      storage_url,
      category || 'exterior',
      caption,
      thumbnail_url,
      file_size_bytes
    );

    res.status(201).json(photo);
  } catch (error: any) {
    logger.error('Failed to add photo', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add photo',
    });
  }
});

/**
 * DELETE /api/reports/:id/photos/:photoId
 * Remove a photo from a report
 */
router.delete(
  '/:id/photos/:photoId',
  validateUUID('id'),
  validateUUID('photoId'),
  async (req: Request, res: Response) => {
    try {
      const deleted = await reportService.deletePhoto(req.params.id, req.params.photoId);

      if (!deleted) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Photo not found',
        });
      }

      res.status(204).send();
    } catch (error: any) {
      logger.error('Failed to delete photo', { 
        reportId: req.params.id,
        photoId: req.params.photoId,
        error: error.message 
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete photo',
      });
    }
  }
);

/**
 * PUT /api/reports/:id/photos/reorder
 * Reorder photos in a report
 */
router.put('/:id/photos/reorder', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { photo_order } = req.body;

    if (!Array.isArray(photo_order)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'photo_order must be an array of photo IDs',
      });
    }

    await reportService.reorderPhotos(req.params.id, photo_order);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to reorder photos', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to reorder photos',
    });
  }
});

// =====================================================
// PHASE 2: DATA COLLECTION ENDPOINTS
// =====================================================

/**
 * GET /api/reports/:id/cover
 * Get cover page data for a report
 */
router.get('/:id/cover', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const coverData = await reportDataService.getCoverData(req.params.id);
    res.json(coverData);
  } catch (error: any) {
    logger.error('Failed to get cover data', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get cover data',
    });
  }
});

/**
 * GET /api/reports/:id/transmittal
 * Get transmittal letter data for a report
 */
router.get('/:id/transmittal', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const transmittalData = await reportDataService.getTransmittalData(req.params.id);
    res.json(transmittalData);
  } catch (error: any) {
    logger.error('Failed to get transmittal data', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get transmittal data',
    });
  }
});

/**
 * GET /api/reports/:id/certification
 * Get certification/valuation opinion data for a report
 */
router.get('/:id/certification', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const certificationData = await reportDataService.getCertificationData(req.params.id);
    res.json(certificationData);
  } catch (error: any) {
    logger.error('Failed to get certification data', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get certification data',
    });
  }
});

/**
 * GET /api/reports/:id/disclaimers
 * Get disclaimers and limiting conditions for a report
 */
router.get('/:id/disclaimers', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const disclaimersData = await reportDataService.getDisclaimersData(req.params.id);
    res.json(disclaimersData);
  } catch (error: any) {
    logger.error('Failed to get disclaimers data', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get disclaimers data',
    });
  }
});

// =====================================================
// AUDIT ENDPOINTS
// =====================================================

/**
 * GET /api/reports/:id/audit
 * Get audit log for a report
 */
router.get('/:id/audit', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const auditLog = await reportService.getAuditLog(req.params.id);
    res.json({ audit_log: auditLog });
  } catch (error: any) {
    logger.error('Failed to get audit log', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get audit log',
    });
  }
});

// =====================================================
// VALUATION-SPECIFIC ENDPOINTS
// =====================================================

/**
 * GET /api/valuations/:valuationId/reports
 * Get all reports for a valuation
 */
router.get(
  '/valuation/:valuationId',
  validateUUID('valuationId'),
  async (req: Request, res: Response) => {
    try {
      const reports = await reportService.getReportsForValuation(req.params.valuationId);
      res.json({ reports });
    } catch (error: any) {
      logger.error('Failed to get reports for valuation', { 
        valuationId: req.params.valuationId, 
        error: error.message 
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get reports',
      });
    }
  }
);

/**
 * GET /api/reports/valuation/:valuationId/download
 * Resolve the valuation's FINALIZED report and return a direct download URL for the
 * sealed/signed PDF. Returns { available:false, finalized:false } when no finalized report
 * exists, so the UI can disable the Download action. Prefers the client-signed PDF
 * (signed_report_url) over the valuer-sealed PDF (pdf_storage_key).
 */
router.get(
  '/valuation/:valuationId/download',
  validateUUID('valuationId'),
  async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, status, content, pdf_storage_key, signed_report_url, client_esign_status
         FROM valuation_reports WHERE valuation_id = $1 ORDER BY created_at DESC`,
        [req.params.valuationId]
      );
      if (!rows.length) {
        return res.json({ available: false, finalized: false, reason: 'no_report' });
      }
      const FINAL = ['approved', 'completed'];
      const report =
        rows.find((r: any) => FINAL.includes(String(r.status)) || r.client_esign_status === 'completed') || rows[0];
      const finalized = FINAL.includes(String(report.status)) || report.client_esign_status === 'completed';
      if (!finalized) {
        return res.json({ available: false, finalized: false, reason: 'not_finalized' });
      }
      // Prefer the client-countersigned PDF (already a URL); else presign the valuer-sealed PDF.
      if (report.signed_report_url) {
        return res.json({ available: true, finalized: true, download_url: report.signed_report_url, filename: 'Valuation_Report.pdf' });
      }
      const content = typeof report.content === 'string' ? JSON.parse(report.content) : report.content || {};
      const key = report.pdf_storage_key || content.pdf_storage_key;
      if (!key) {
        return res.json({ available: false, finalized: true, reason: 'no_pdf' });
      }
      const bucket = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-documents';
      const url = await getPresignedDownloadUrl(bucket, key, 60 * 60);
      return res.json({ available: true, finalized: true, download_url: url, filename: 'Valuation_Report.pdf' });
    } catch (error: any) {
      logger.error('Failed to get finalized report download', {
        valuationId: req.params.valuationId,
        error: error.message,
      });
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get report download' });
    }
  }
);

// =====================================================
// DOCUMENT GENERATION ENDPOINTS (Phase 2)
// =====================================================

/**
 * POST /api/reports/:id/generate
 * Generate DOCX report
 */
router.post('/:id/generate', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const options: DocxGenerationOptions = {
      template: req.body.template,
      includeFloorPlans: req.body.include_floor_plans !== false,
      includePhotos: req.body.include_photos !== false,
      includeMaps: req.body.include_maps !== false,
      includeComparables: req.body.include_comparables !== false,
      currency: req.body.currency || 'GHS',
      secondaryCurrency: req.body.secondary_currency || 'USD',
    };

    logger.info('Generating DOCX report', { reportId: req.params.id, options });

    // If reset_sections is true, clear saved editor sections first
    // so the DOCX builder regenerates from template defaults
    if (req.body.reset_sections) {
      await pool.query(
        `UPDATE valuation_reports 
         SET content = COALESCE(content, '{}'::jsonb) - 'sections',
             updated_at = NOW()
         WHERE id = $1`,
        [req.params.id]
      );
      logger.info('Cleared saved editor sections for regeneration', { reportId: req.params.id });
    }

    const result = await docGenerationService.generateDocx(req.params.id, options);

    res.json({
      report_id: result.reportId,
      filename: result.filename,
      docx_url: result.docxUrl,
      generated_at: result.generatedAt,
    });
  } catch (error: any) {
    logger.error('Failed to generate DOCX report', { 
      reportId: req.params.id, 
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate report',
      detail: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/reports/:id/download
 * Download generated DOCX report
 */
router.get('/:id/download', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const report = await reportService.getReportById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found',
      });
    }

    // Check if report has been generated
    const content = report.content as any;
    const storageKey = report.docx_url || content?.storage_key;
    if (!storageKey) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Report has not been generated yet. Call POST /api/reports/:id/generate first.',
      });
    }

    // Get fresh signed URL
    const bucket = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-reports';
    const signedUrl = await getPresignedDownloadUrl(bucket, storageKey, 60 * 60); // 1 hour

    // Option 1: Redirect to signed URL
    if (req.query.redirect === 'true') {
      return res.redirect(signedUrl);
    }

    // Option 2: Return URL in response
    res.json({
      report_id: req.params.id,
      download_url: signedUrl,
      filename: content.filename || `report_${req.params.id}.docx`,
      expires_in: 3600, // seconds
      generated_at: content.generated_at,
    });
  } catch (error: any) {
    logger.error('Failed to get download URL', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get download URL',
    });
  }
});

/**
 * GET /api/reports/:id/status
 * Get report generation status
 */
router.get('/:id/status', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const report = await reportService.getReportById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found',
      });
    }

    const content = report.content as any;
    const isGenerated = !!report.docx_url || !!content?.storage_key;
    const storageKey = report.docx_url || content?.storage_key;

    res.json({
      report_id: req.params.id,
      status: report.status,
      template: report.template,
      version: report.version,
      is_generated: isGenerated,
      generated_at: content?.generated_at || null,
      storage_key: isGenerated ? storageKey : null,
    });
  } catch (error: any) {
    logger.error('Failed to get report status', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get report status',
    });
  }
});

// =====================================================
// REPORT CONTENT EDITING ENDPOINTS
// =====================================================

/**
 * GET /api/reports/:id/content
 * Get editable report content (sections)
 * Uses template-based generation with dynamic data injection
 */
router.get('/:id/content', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const report = await reportService.getReportById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found',
      });
    }

    const content = report.content as any;
    const forceRegenerate = req.query.regenerate === 'true';

    // Firm branding for the report viewer letterhead (name/logo/colors) — falls back to PROPMETRIK.
    // Never fatal: a branding failure must not block report content from loading.
    let brand: any = null;
    try {
      brand = await reportTemplateService.getReportBrand(report.valuation_id);
    } catch (brandErr: any) {
      logger.warn('Failed to resolve report brand for viewer letterhead', {
        reportId: req.params.id,
        error: brandErr?.message,
      });
    }

    // Return editable sections if already saved and not forcing regeneration
    if (!forceRegenerate && content?.sections && Array.isArray(content.sections) && content.sections.length > 0) {
      // Fix expired presigned MinIO URLs in saved content by replacing with proxy URLs
      let fixedSections = content.sections;
      try {
        const { floorPlanService } = await import ('../services/valuation-engine/floorPlanService');
        const floorPlans = await floorPlanService.getByValuationId(report.valuation_id);
        const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

        // Build a map: floor_number → planId for quick lookup
        const floorNumberToPlanId = new Map<number, string>();
        for (const fp of floorPlans) {
          floorNumberToPlanId.set(fp.floor_number, fp.id);
        }

        fixedSections = content.sections.map((section: any) => {
          if (section.content && typeof section.content === 'string') {
            // Replace expired presigned S3/MinIO floor plan URLs with proxy URLs
            section.content = section.content.replace(
              /(<img[^>]*\ssrc=")https?:\/\/[^"]*?floor-plans\/[^/]+\/floor-(\d+)\.\w+(?:\?[^"]*)?(")/g,
              (match: string, prefix: string, floorNumStr: string, suffix: string) => {
                const floorNum = parseInt(floorNumStr, 10);
                const planId = floorNumberToPlanId.get(floorNum);
                if (planId) {
                  return `${prefix}${apiBase}/api/v1/valuations/floor-plans/${planId}/image-stream${suffix}`;
                }
                return match; // leave unchanged if can't resolve
              }
            );
          }
          return section;
        });
      } catch (err: any) {
        logger.warn('Could not fix floor plan URLs in saved content', { error: err.message });
      }

      return res.json({
        report_id: req.params.id,
        sections: fixedSections,
        brand,
        last_modified: content.last_modified || report.updated_at,
      });
    }

    // Generate sections from template with valuation data
    try {
      const userId = (req as any).user?.id || null;
      const sections = await reportTemplateService.generateReportSections(
        report.valuation_id,
        'ghis-standard',
        userId
      );

      res.json({
        report_id: req.params.id,
        sections,
        brand,
        last_modified: report.updated_at,
        generated_from_template: true,
      });
    } catch (templateError: any) {
      logger.error('CRITICAL: Modular template generation failed.', {
        error: templateError.message,
        stack: templateError.stack,
        valuationId: report.valuation_id,
      });

      return res.status(500).json({
        error: 'Template Generation Failed',
        message: templateError.message,
        details: templateError.stack
      });

      /* 
         DEAD CODE - FALLBACK REMOVED
         We no longer want to generate legacy reports.
      */

      /*
         DEAD CODE - FALLBACK REMOVED
         We no longer want to generate legacy reports.
      */
    }
  } catch (error: any) {
    logger.error('Failed to get report content', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get report content',
    });
  }
});

/**
 * PUT /api/reports/:id/content
 * Save editable report content (sections)
 */
router.put('/:id/content', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { sections } = req.body;
    
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sections array is required',
      });
    }

    const report = await reportService.getReportById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found',
      });
    }

    // Block editing superseded reports
    if (report.status === 'superseded') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot edit superseded reports',
      });
    }

    // If editing an approved report, revert to draft since content has changed
    const shouldRevertToDraft = report.status === 'approved';

    // Update content with sections directly using SQL
    const existingContent = (report.content as any) || {};
    const updatedContent = {
      ...existingContent,
      sections,
      last_modified: new Date().toISOString(),
    };

    // Direct update to preserve array structure
    await pool.query(
      `UPDATE valuation_reports 
       SET content = $1, updated_at = NOW()${shouldRevertToDraft ? ", status = 'draft'" : ''}
       WHERE id = $2`,
      [JSON.stringify(updatedContent), req.params.id]
    );

    logger.info('Report content saved', { reportId: req.params.id });

    res.json({
      success: true,
      report_id: req.params.id,
      last_modified: updatedContent.last_modified,
    });
  } catch (error: any) {
    logger.error('Failed to save report content', { 
      reportId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to save report content',
    });
  }
});

// Helper functions to generate HTML sections from valuation data
function generateExecutiveSummaryHTML(data: any): string {
  const property = data.property || {};
  const valuation = data.valuation || {};
  const reconciliation = data.reconciliation || {};
  
  const address = [property.address, property.city, property.region].filter(Boolean).join(', ');
  const finalValue = reconciliation.final_value || valuation.final_value_ghs || 0;
  const formattedValue = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(finalValue);
  
  const effectiveDate = valuation.effective_date ? new Date(valuation.effective_date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
  
  return `
    <h2>Executive Summary</h2>
    <p>This valuation report has been prepared in accordance with Ghana Institution of Surveyors (GhIS) standards and RICS Global Valuation Standards.</p>
    
    <h3>Property Details</h3>
    <table>
      <tr><th>Property Address</th><td>${address || 'Not specified'}</td></tr>
      <tr><th>Property Type</th><td>${property.property_type || 'Residential'}</td></tr>
      <tr><th>Land Area</th><td>${property.land_area_sqm ? property.land_area_sqm + ' sqm' : 'Not specified'}</td></tr>
      <tr><th>Building Area</th><td>${property.building_area_sqm ? property.building_area_sqm + ' sqm' : 'Not specified'}</td></tr>
    </table>
    
    <h3>Valuation Conclusion</h3>
    <p><strong>Market Value:</strong> ${formattedValue}</p>
    <p><strong>Effective Date:</strong> ${effectiveDate}</p>
    <p><strong>Purpose:</strong> ${valuation.valuation_purpose || 'Market Valuation'}</p>
  `;
}

function generateInstructionsHTML(data: any): string {
  const valuation = data.valuation || {};
  const client = data.client || {};
  
  const instructionDate = valuation.instruction_date ? new Date(valuation.instruction_date).toLocaleDateString('en-GB') : 'Not specified';
  
  return `
    <h2>Instructions & Scope</h2>
    
    <h3>Client Information</h3>
    <p><strong>Client:</strong> ${client.name || valuation.client_name || 'Not specified'}</p>
    <p><strong>Instruction Date:</strong> ${instructionDate}</p>
    
    <h3>Purpose of Valuation</h3>
    <p>${valuation.valuation_purpose || 'To determine the Market Value of the property for the purposes stated by the client.'}</p>
    
    <h3>Basis of Valuation</h3>
    <p>Market Value as defined by the Royal Institution of Chartered Surveyors (RICS) as:</p>
    <blockquote>"The estimated amount for which an asset or liability should exchange on the valuation date between a willing buyer and a willing seller in an arm's length transaction, after proper marketing and where the parties had each acted knowledgeably, prudently and without compulsion."</blockquote>
    
    <h3>Scope of Work</h3>
    <ul>
      <li>Physical inspection of the property</li>
      <li>Review of title documentation</li>
      <li>Market research and analysis</li>
      <li>Application of appropriate valuation methods</li>
      <li>Preparation of this formal report</li>
    </ul>
  `;
}

function generatePropertyDescriptionHTML(data: any): string {
  const property = data.property || {};
  
  const coords = property.latitude && property.longitude ? property.latitude + ', ' + property.longitude : 'Not recorded';
  const landArea = property.land_area_sqm ? property.land_area_sqm + ' square meters' : 'Not measured';
  const buildingArea = property.building_area_sqm ? property.building_area_sqm + ' square meters' : 'Not measured';
  const amenities = property.amenities ? (Array.isArray(property.amenities) ? property.amenities.join(', ') : property.amenities) : 'Standard utilities connected';
  
  return `
    <h2>Property Description</h2>
    
    <h3>Location</h3>
    <p><strong>Address:</strong> ${property.address || 'Not specified'}</p>
    <p><strong>City/Town:</strong> ${property.city || 'Not specified'}</p>
    <p><strong>Region:</strong> ${property.region || 'Not specified'}</p>
    <p><strong>GPS Coordinates:</strong> ${coords}</p>
    
    <h3>Land Details</h3>
    <p><strong>Land Area:</strong> ${landArea}</p>
    <p><strong>Plot Shape:</strong> ${property.plot_shape || 'Regular'}</p>
    <p><strong>Topography:</strong> ${property.topography || 'Generally level'}</p>
    
    <h3>Building Description</h3>
    <p><strong>Property Type:</strong> ${property.property_type || 'Residential'}</p>
    <p><strong>Building Area:</strong> ${buildingArea}</p>
    <p><strong>Number of Floors:</strong> ${property.floors || 'Not specified'}</p>
    <p><strong>Bedrooms:</strong> ${property.bedrooms || 'Not specified'}</p>
    <p><strong>Bathrooms:</strong> ${property.bathrooms || 'Not specified'}</p>
    <p><strong>Year Built:</strong> ${property.year_built || 'Not specified'}</p>
    <p><strong>Condition:</strong> ${property.condition || 'Good'}</p>
    
    <h3>Services and Amenities</h3>
    <p>${amenities}</p>
  `;
}

function generateMarketAnalysisHTML(_data: any): string {
  return `
    <h2>Market Analysis</h2>
    
    <h3>Economic Overview</h3>
    <p>The Ghana real estate market continues to show resilience despite global economic challenges. Key economic indicators relevant to property values include:</p>
    <ul>
      <li>GDP growth and inflation rates</li>
      <li>Interest rates and mortgage availability</li>
      <li>Foreign direct investment trends</li>
      <li>Infrastructure development projects</li>
    </ul>
    
    <h3>Local Market Conditions</h3>
    <p>Analysis of the immediate locality indicates the following market conditions:</p>
    <ul>
      <li>Supply and demand dynamics</li>
      <li>Recent transaction activity</li>
      <li>Rental market trends</li>
      <li>Development pipeline</li>
    </ul>
    
    <h3>Highest and Best Use Analysis</h3>
    <p>Based on the analysis of legal permissibility, physical possibility, financial feasibility, and maximum productivity, the highest and best use of the property is determined to be its current use.</p>
  `;
}

function generateValuationMethodologyHTML(data: any): string {
  const methods = data.methods_summary || {};
  const methodsList = Object.keys(methods);
  
  let methodsListHtml = '<li>Comparable Sales Method</li><li>Income Approach</li><li>Cost Approach</li>';
  if (methodsList.length > 0) {
    methodsListHtml = methodsList.map(m => {
      const formatted = m.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      return '<li>' + formatted + ' Approach</li>';
    }).join('\n');
  }
  
  return `
    <h2>Valuation Methodology</h2>
    
    <h3>Methods Applied</h3>
    <p>The following valuation methods have been applied in this assessment:</p>
    <ul>
      ${methodsListHtml}
    </ul>
    
    <h3>Method Selection Rationale</h3>
    <p>The selection of valuation methods was based on:</p>
    <ul>
      <li>Property type and characteristics</li>
      <li>Availability of market data</li>
      <li>Purpose of the valuation</li>
      <li>GhIS and RICS guidance</li>
    </ul>
  `;
}

function generateValuationCalculationsHTML(data: any): string {
  const methods = data.methods_summary || {};
  
  let calculationsHTML = '<h2>Valuation Calculations</h2>';
  
  for (const [method, details] of Object.entries(methods)) {
    const methodData = details as any;
    const formattedValue = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(methodData.value || 0);
    const methodName = method.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    
    calculationsHTML += `
      <h3>${methodName} Approach</h3>
      <p><strong>Indicated Value:</strong> ${formattedValue}</p>
      <p>${methodData.summary || 'Detailed calculations available in supporting documentation.'}</p>
    `;
  }
  
  if (Object.keys(methods).length === 0) {
    calculationsHTML += '<p>Valuation calculations to be inserted from the valuation analysis.</p>';
  }
  
  return calculationsHTML;
}

function generateReconciliationHTML(data: any): string {
  const reconciliation = data.reconciliation || {};
  const finalValue = reconciliation.final_value || 0;
  const formattedValue = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(finalValue);
  
  return `
    <h2>Reconciliation & Final Value</h2>
    
    <h3>Value Reconciliation</h3>
    <p>${reconciliation.narrative || 'The indicated values from each approach have been reconciled considering the reliability and relevance of each method to the subject property.'}</p>
    
    <h3>Market Value Conclusion</h3>
    <p>Based on the analysis and investigations undertaken, and subject to the assumptions and limiting conditions contained in this report, the Market Value of the property as at the date of valuation is:</p>
    
    <p style="font-size: 1.5em; font-weight: bold; text-align: center; padding: 20px; background: #f5f5f5; border: 2px solid #333;">
      ${formattedValue}
    </p>
    
    <p style="text-align: center;"><em>(Subject to assumptions and limiting conditions stated herein)</em></p>
  `;
}

function generateAssumptionsHTML(data: any): string {
  const valuation = data.valuation || {};
  const specialAssumptions = valuation.special_assumptions || [];
  
  let specialAssumptionsHtml = '<p>No special assumptions have been applied to this valuation.</p>';
  if (specialAssumptions.length > 0) {
    const items = (Array.isArray(specialAssumptions) ? specialAssumptions : [specialAssumptions])
      .map((a: string) => '<li>' + a + '</li>').join('');
    specialAssumptionsHtml = '<ol>' + items + '</ol>';
  }
  
  return `
    <h2>Assumptions & Limiting Conditions</h2>
    
    <h3>Standard Assumptions</h3>
    <ol>
      <li>The property is free from any encumbrances, restrictions, or defects other than those stated.</li>
      <li>All relevant planning permissions are in place and the property is being used in accordance with its approved use.</li>
      <li>No structural surveys have been undertaken and the property is assumed to be structurally sound.</li>
      <li>No environmental audits have been conducted and no contamination is assumed.</li>
      <li>The information provided is accurate and complete.</li>
    </ol>
    
    <h3>Special Assumptions</h3>
    ${specialAssumptionsHtml}
    
    <h3>Limiting Conditions</h3>
    <ol>
      <li>This report is for the exclusive use of the addressee and may not be relied upon by third parties.</li>
      <li>The valuation is valid only as of the stated date and may change with market conditions.</li>
      <li>The valuer accepts no responsibility for matters of a legal nature.</li>
      <li>No responsibility is accepted for items not inspected or matters not reported.</li>
    </ol>
  `;
}

function generateCertificationHTML(data: any): string {
  const valuer = data.valuer || {};
  const dateStr = new Date().toLocaleDateString('en-GB');
  
  return `
    <h2>Valuer Certification</h2>
    
    <p>I hereby certify that:</p>
    <ol>
      <li>The statements of fact contained in this report are true and correct.</li>
      <li>The reported analyses, opinions, and conclusions are limited only by the reported assumptions and limiting conditions and are my personal, impartial, and unbiased professional analyses, opinions, and conclusions.</li>
      <li>I have no present or prospective interest in the property that is the subject of this report and no personal interest with respect to the parties involved.</li>
      <li>I have no bias with respect to the property that is the subject of this report or to the parties involved with this assignment.</li>
      <li>My engagement in this assignment was not contingent upon developing or reporting predetermined results.</li>
      <li>My compensation for completing this assignment is not contingent upon the development or reporting of a predetermined value or direction in value.</li>
      <li>This valuation has been made in conformity with the standards of GhIS and RICS.</li>
    </ol>
    
    <div style="margin-top: 40px;">
      <p><strong>Signed:</strong> _________________________________</p>
      <p><strong>Name:</strong> ${valuer.name || '[Valuer Name]'}</p>
      <p><strong>Qualification:</strong> ${valuer.qualification || 'GhIS Registered Valuer'}</p>
      <p><strong>Registration No:</strong> ${valuer.registration_number || '[Registration Number]'}</p>
      <p><strong>Date:</strong> ${dateStr}</p>
    </div>
  `;
}

// =====================================================
// ENHANCED PHOTO ENDPOINTS WITH THUMBNAILS (Phase 3)
// =====================================================

// Configure multer for memory storage (process in memory before upload)
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 10, // Max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
    }
  },
});

/**
 * POST /api/reports/:id/photos/upload
 * Upload and process photos with thumbnail generation
 */
router.post(
  '/:id/photos/upload',
  validateUUID('id'),
  photoUpload.array('photos', 10),
  scanUploadedFiles,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'No files uploaded',
        });
      }

      const category = req.body.category || 'exterior';
      const reportId = req.params.id;

      // Process each file
      const uploadedPhotos = await Promise.all(
        files.map(async (file, index) => {
          const photoId = uuidv4();

          // Validate image
          const validation = await imageProcessingService.validateImage(file.buffer);
          if (!validation.valid) {
            throw new Error(`File "${file.originalname}": ${validation.error}`);
          }

          // Process image (compress + generate thumbnails)
          const processed = await imageProcessingService.processImage(
            file.buffer,
            reportId,
            photoId,
            file.originalname
          );

          // Get current max display order
          const orderResult = await reportService.getPhotos(reportId);
          const maxOrder = orderResult.length > 0
            ? Math.max(...orderResult.map(p => p.display_order))
            : -1;

          // Save to database - use correct method signature
          const photo = await reportService.addPhoto(
            reportId,
            processed.original.storageKey, // storageUrl
            category as any, // category
            req.body[`caption_${index}`] || file.originalname, // caption
            processed.thumbnail.storageKey, // thumbnailUrl
            processed.original.size // fileSizeBytes
          );

          return {
            ...photo,
            original_url: await getPresignedDownloadUrl(
              process.env.MINIO_PHOTOS_BUCKET || 'propmetrik-report-photos',
              processed.original.storageKey,
              3600
            ),
            thumbnail_url: await getPresignedDownloadUrl(
              process.env.MINIO_PHOTOS_BUCKET || 'propmetrik-report-photos',
              processed.thumbnail.storageKey,
              3600
            ),
            dimensions: {
              width: processed.original.width,
              height: processed.original.height,
            },
            file_size: processed.original.size,
            compression_ratio: ((1 - processed.original.size / file.buffer.length) * 100).toFixed(1) + '%',
          };
        })
      );

      res.status(201).json({
        photos: uploadedPhotos,
        count: uploadedPhotos.length,
      });
    } catch (error: any) {
      logger.error('Photo upload failed', {
        reportId: req.params.id,
        error: error.message,
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to upload photos',
      });
    }
  }
);

/**
 * GET /api/reports/:id/photos/gallery
 * Get all photos with signed URLs for gallery view
 */
router.get('/:id/photos/gallery', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const photos = await reportService.getPhotos(req.params.id);
    const bucket = process.env.MINIO_PHOTOS_BUCKET || 'propmetrik-report-photos';

    // Add signed URLs to each photo (using storage_url and thumbnail_url from ReportPhoto)
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => ({
        ...photo,
        original_url: photo.storage_url
          ? await getPresignedDownloadUrl(bucket, photo.storage_url, 3600)
          : null,
        thumb_url: photo.thumbnail_url
          ? await getPresignedDownloadUrl(bucket, photo.thumbnail_url, 3600)
          : null,
      }))
    );

    // Group by category
    const grouped = photosWithUrls.reduce((acc, photo) => {
      const category = photo.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(photo);
      return acc;
    }, {} as Record<string, any[]>);

    res.json({
      photos: photosWithUrls,
      grouped,
      count: photosWithUrls.length,
    });
  } catch (error: any) {
    logger.error('Failed to get photo gallery', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get photos',
    });
  }
});

// =====================================================
// PHASE 4: APPROVAL & SIGNATURE ENDPOINTS
// =====================================================

/**
 * POST /api/reports/:id/submit
 * Submit report for approval (draft → pending_review)
 */
router.post('/:id/submit', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || null;
    
    const submitted = await approvalService.submitForApproval(req.params.id, userId);

    if (!submitted) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Report cannot be submitted. It may already be submitted or not in draft status.',
      });
    }

    // Log audit
    await auditLogService.logSubmitted(req.params.id, userId);

    logger.info('Report submitted for approval', { reportId: req.params.id });

    res.json({
      success: true,
      message: 'Report submitted for approval',
      report_id: req.params.id,
    });
  } catch (error: any) {
    logger.error('Failed to submit report', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit report',
    });
  }
});

/**
 * GET /api/reports/:id/approval-check
 * Check if report can be approved
 */
router.get('/:id/approval-check', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await approvalService.canApprove(req.params.id);

    res.json({
      report_id: req.params.id,
      can_approve: result.canApprove,
      reasons: result.reasons,
    });
  } catch (error: any) {
    logger.error('Failed to check approval status', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check approval status',
    });
  }
});

/**
 * POST /api/reports/:id/revise
 * Create a new DRAFT revision of a (typically sealed) report. Clones the content into a fresh
 * row with version+1, links it to the source via supersedes_report_id, and records a reason.
 * The original is retained untouched (it flips to 'superseded' only when the revision is sealed).
 */
router.post('/:id/revise', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const reason = (req.body?.reason ?? '').toString().trim();
    const src = await pool.query(
      `SELECT valuation_id, template, content, version, created_by FROM valuation_reports WHERE id = $1`,
      [req.params.id]
    );
    if (!src.rows.length) {
      return res.status(404).json({ error: 'Not Found', message: 'Report not found' });
    }
    const s = src.rows[0];
    const ins = await pool.query(
      `INSERT INTO valuation_reports
        (valuation_id, template, content, status, version, supersedes_report_id, revision_reason, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, version`,
      [s.valuation_id, s.template, s.content, (Number(s.version) || 1) + 1, req.params.id, reason || null, s.created_by || null]
    );
    logger.info('Report revision created', {
      sourceReportId: req.params.id,
      newReportId: ins.rows[0].id,
      version: ins.rows[0].version,
    });
    return res.status(201).json({
      id: ins.rows[0].id,
      version: ins.rows[0].version,
      supersedes: req.params.id,
      valuation_id: s.valuation_id,
    });
  } catch (err: any) {
    logger.error('Failed to create report revision', { reportId: req.params.id, error: err.message });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create revision' });
  }
});

/**
 * POST /api/reports/:id/approve
 * Approve a report
 */
router.post('/:id/approve', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { valuer_id, comments, generate_pdf, esign_fields } = req.body;

    if (!valuer_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'valuer_id is required',
      });
    }

    // Lock-on-seal: a report that is already sealed cannot be re-approved/re-signed in place.
    // To change it, the valuer must create a revision (a new draft version) and seal that.
    const lockCheck = await pool.query(`SELECT status FROM valuation_reports WHERE id = $1`, [req.params.id]);
    if (lockCheck.rows.length && lockCheck.rows[0].status === 'approved') {
      return res.status(409).json({
        error: 'Already Sealed',
        message: 'This report is already sealed. Create a revision to make changes.',
        alreadySealed: true,
      });
    }

    logger.info('[approve] Step 1: approving report', { reportId: req.params.id, valuer_id });

    // Approve the report
    const approvalResult = await approvalService.approveReport({
      reportId: req.params.id,
      valuerId: valuer_id,
      comments,
    });

    if (!approvalResult.success) {
      return res.status(400).json({
        error: 'Approval Failed',
        message: approvalResult.error,
      });
    }

    logger.info('[approve] Step 2: logging audit', { reportId: req.params.id });

    // Log audit
    await auditLogService.logApproved(
      req.params.id,
      valuer_id,
      approvalResult.digitalSealHash
    );

    logger.info('[approve] Step 3: generating PDF', { reportId: req.params.id, generate_pdf });

    // Generate PDF if requested
    let pdfResult = null;
    if (generate_pdf !== false) {
      // Regenerate DOCX from stored editor sections before converting to PDF.
      // This ensures the PDF always reflects the latest editor content.
      try {
        logger.info('[approve] Step 3a: regenerating DOCX from editor content', { reportId: req.params.id });
        await docGenerationService.generateDocx(req.params.id);
      } catch (docxErr: any) {
        logger.warn('[approve] DOCX regeneration failed, proceeding with existing DOCX', {
          reportId: req.params.id,
          error: docxErr.message,
        });
      }

      pdfResult = await pdfGenerationService.convertDocxToPdf(req.params.id, {
        addQrCode: true,
        addDigitalSeal: true,
      });

      // Burn e-sign fields (signatures, dates, names) into the PDF and append Certificate of Completion
      if (pdfResult.success && pdfResult.storageKey && Array.isArray(esign_fields) && esign_fields.length > 0) {
        try {
          logger.info('[approve] Step 3b: burning e-sign fields into PDF', {
            reportId: req.params.id,
            fieldCount: esign_fields.length,
          });

          const bucket = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-reports';
          const basePdfFile = await getFile(bucket, pdfResult.storageKey);
          const basePdfBytes = new Uint8Array(Buffer.from(basePdfFile.body));

          // Separate signatures from date/text fields
          const signatureFields = esign_fields.filter(
            (f: any) => (f.type === 'signature' || f.type === 'initial' || f.type === 'stamp') && f.data
          );
          const dateFields = esign_fields.filter(
            (f: any) => f.type !== 'signature' && f.type !== 'initial' && f.type !== 'stamp' && f.data
          );

          // Get signer info
          const signerName = req.user?.name || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Valuer';
          const signerEmail = req.user?.email || '';

          // Look up signer's permanent PMT ID
          let signerPmtId: string | undefined;
          if (signerEmail) {
            const pmtResult = await pool.query(
              'SELECT permanent_id FROM esign_signer_identities WHERE email = $1 LIMIT 1',
              [signerEmail]
            );
            signerPmtId = pmtResult.rows[0]?.permanent_id;
          }

          // Get property address for the certificate
          const report = await reportService.getReportById(req.params.id);
          let propertyAddress = 'Valuation Report';
          if (report?.valuation_id) {
            const propResult = await pool.query(
              `SELECT p.title, p.address_street, p.address_city
               FROM valuations v JOIN properties p ON v.property_id = p.id
               WHERE v.id = $1`,
              [report.valuation_id]
            );
            const prop = propResult.rows[0];
            if (prop) {
              propertyAddress = [prop.address_street, prop.address_city].filter(Boolean).join(', ') || prop.title || 'Valuation Report';
            }
          }

          // Compute document hash for certificate
          const documentHash = crypto.createHash('sha256').update(Buffer.from(basePdfBytes)).digest('hex');

          const signedPdfBytes = await pdfSigningService.generateFinalSignedPdf({
            originalPdfBytes: basePdfBytes,
            signatures: signatureFields.map((f: any) => ({
              signatureData: f.data,
              page: f.page || 1,
              x: f.x,
              y: f.y,
              width: f.width,
              height: f.height,
              signatureId: signerPmtId,
              signerName,
              signerEmail,
              signedAt: new Date(),
              usePercentage: true,
            })),
            dateFields: dateFields.map((f: any) => ({
              value: f.data, // base64 image rendered by the frontend
              page: f.page || 1,
              x: f.x,
              y: f.y,
              width: f.width,
              height: f.height,
              usePercentage: true,
            })),
            appendCertificatePage: true,
            documentHash,
            envelopeId: req.params.id,
            documentTitle: `Valuation Report — ${propertyAddress}`,
            organizationName: 'PROPMETRIK Ghana Ltd.',
            signers: [{
              name: signerName,
              email: signerEmail,
              role: 'Qualified Valuer',
              signedAt: new Date(),
              signatureId: signerPmtId,
            }],
            auditEvents: [
              { eventType: 'created', timestamp: new Date(), description: 'E-sign envelope created', actor: signerName },
              { eventType: 'signed', timestamp: new Date(), description: 'All fields signed by valuer', actor: signerName },
              { eventType: 'approved', timestamp: new Date(), description: 'Report approved and sealed', actor: signerName },
            ],
          });

          // Upload the signed PDF back to MinIO (overwrite the same key)
          await uploadFile(bucket, pdfResult.storageKey, Buffer.from(signedPdfBytes), 'application/pdf');

          // Update file size for accurate reporting
          pdfResult.fileSize = signedPdfBytes.length;

          // Regenerate presigned URL for the signed version
          pdfResult.pdfUrl = await getPresignedDownloadUrl(bucket, pdfResult.storageKey);

          logger.info('[approve] E-sign fields burned into PDF with Certificate of Completion', {
            reportId: req.params.id,
            signatureCount: signatureFields.length,
            dateFieldCount: dateFields.length,
            finalSize: signedPdfBytes.length,
          });
        } catch (signErr: any) {
          logger.error('[approve] Failed to burn e-sign fields into PDF (base PDF still saved)', {
            reportId: req.params.id,
            error: signErr.message,
            stack: signErr.stack,
          });
          // Don't fail the entire approval — the base PDF is still valid
        }
      }

      if (pdfResult.success) {
        await auditLogService.logPdfGenerated(req.params.id, valuer_id, pdfResult.fileSize);
      }
    }

    logger.info('Report approved', {
      reportId: req.params.id,
      valuerId: valuer_id,
      pdfGenerated: pdfResult?.success || false,
    });

    // Email signed PDF to the user (non-blocking — don't fail approval if email fails)
    if (pdfResult?.success && pdfResult.storageKey && req.user?.email) {
      (async () => {
        try {
          const bucket = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-reports';
          const pdfFile = await getFile(bucket, pdfResult.storageKey!);
          const pdfBuffer = Buffer.from(pdfFile.body);

          // Get property address for the email subject
          const report = await reportService.getReportById(req.params.id);
          let propertyAddress = 'Property';
          if (report?.valuation_id) {
            const propResult = await pool.query(
              `SELECT p.title, p.address_street, p.address_city
               FROM valuations v JOIN properties p ON v.property_id = p.id
               WHERE v.id = $1`,
              [report.valuation_id]
            );
            const prop = propResult.rows[0];
            if (prop) {
              propertyAddress = [prop.address_street, prop.address_city].filter(Boolean).join(', ') || prop.title || 'Property';
            }
          }

          const signerName = req.user?.name || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Valuer';

          await notificationService.sendEmail({
            to: req.user!.email!,
            subject: `Signed Valuation Report — ${propertyAddress}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #10b981;">Valuation Report Approved & Signed</h2>
                <p>Hi ${signerName},</p>
                <p>Your valuation report for <strong>${propertyAddress}</strong> has been approved and digitally signed.</p>
                <p>A copy of the signed PDF is attached to this email for your records.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #6b7280; font-size: 13px;">This is an automated message from PropMetrik. Please do not reply to this email.</p>
              </div>
            `,
            attachments: [{
              filename: `Valuation_Report_${propertyAddress.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            }],
          });

          logger.info('Signed report emailed to user', {
            reportId: req.params.id,
            email: req.user!.email,
          });
        } catch (emailErr: any) {
          logger.warn('Failed to email signed report (approval still succeeded)', {
            reportId: req.params.id,
            error: emailErr.message,
          });
        }
      })();
    }

    res.json({
      success: true,
      report_id: req.params.id,
      status: 'approved',
      approved_at: approvalResult.approvedAt,
      approved_by: approvalResult.approvedBy,
      digital_seal_hash: approvalResult.digitalSealHash,
      verification_url: approvalResult.verificationUrl,
      pdf: pdfResult ? {
        success: pdfResult.success,
        url: pdfResult.pdfUrl,
        error: pdfResult.error,
      } : null,
    });
  } catch (error: any) {
    logger.error('Failed to approve report', {
      reportId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to approve report',
    });
  }
});

/**
 * POST /api/reports/:id/prepare-esign
 * Prepare self-sign e-sign envelope data for valuation report approval.
 * Returns document URL and signer info for the e-sign UI.
 */
router.post('/:id/prepare-esign', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { valuer_id } = req.body;

    if (!valuer_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'valuer_id is required',
      });
    }

    // Get report
    const report = await reportService.getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Not Found', message: 'Report not found' });
    }

    // Get valuer credentials - try by valuer ID first, then by user ID
    let credentials = await approvalService.getValuerCredentials(valuer_id);
    if (!credentials) {
      // valuer_id might be a user ID — look up the valuer by user_id
      const valuerByUser = await approvalService.getValuerByUserId(valuer_id);
      if (valuerByUser) {
        credentials = await approvalService.getValuerCredentials(valuerByUser.id);
      }
    }
    if (!credentials) {
      return res.status(404).json({
        error: 'Not Found',
        message:
          'The assigned valuer has no registered valuer profile (license + signature), which is required to sign reports. ' +
          'Register the valuer in the valuers registry, or reassign the valuation to a registered valuer.',
      });
    }

    // Ensure DOCX is generated
    const content = report.content as any;
    const storageKey = report.docx_url || content?.storage_key;
    if (!storageKey) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Report document has not been generated. Generate the DOCX first.',
      });
    }

    // Get the valuation info for property details
    const valResult = await pool.query(
      `SELECT v.id, p.title, p.address_street, p.address_city, p.digital_address
       FROM valuations v
       JOIN properties p ON v.property_id = p.id
       WHERE v.id = $1`,
      [report.valuation_id]
    );

    const property = valResult.rows[0] || {};
    const propertyAddress = [property.address_street, property.address_city].filter(Boolean).join(', ') || property.title || 'Property';

    // Get the authenticated user's info (the person actually signing)
    const signerName = req.user?.name || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || credentials.name;
    const signerEmail = req.user?.email || '';

    // Regenerate the DOCX to ensure it has the latest editor content and data
    logger.info('Regenerating DOCX before e-sign to ensure latest content', { reportId: req.params.id });
    try {
      await docGenerationService.generateDocx(req.params.id);
    } catch (genErr: any) {
      logger.warn('DOCX regeneration failed, proceeding with existing DOCX', {
        reportId: req.params.id,
        error: genErr.message,
      });
    }

    // E-sign UI requires PDF — always regenerate to use latest cover page
    const bucket = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-reports';
    logger.info('Converting DOCX to PDF for e-sign', { reportId: req.params.id });
    const pdfResult = await pdfGenerationService.convertDocxToPdf(req.params.id, {
      addQrCode: false,
      addDigitalSeal: false,
    });

    if (!pdfResult.success || !pdfResult.pdfUrl) {
      return res.status(500).json({
        error: 'PDF Conversion Failed',
        message: pdfResult.error || 'Failed to convert report to PDF for signing. Ensure LibreOffice is installed.',
      });
    }

    const pdfStorageKey = pdfResult.storageKey;

    // Use backend proxy URL to avoid CORS issues with S3 presigned URLs.
    // config.app.url (DEV_/PROD_APP_URL by NODE_ENV) — NOT raw APP_URL, which is the
    // public OAuth-redirect base and may hold a stale ngrok tunnel in local dev.
    const apiBase = config.app.url;
    const documentUrl = `${apiBase}/api/v1/reports/${req.params.id}/pdf-stream?v=${Date.now()}`;

    const baseFilename = content?.filename?.replace(/\.docx$/i, '') || `valuation_report_${req.params.id}`;
    const filename = `${baseFilename}.pdf`;

    res.json({
      success: true,
      reportId: req.params.id,
      valuationId: report.valuation_id,
      documentUrl,
      documentKey: pdfStorageKey || storageKey,
      filename,
      propertyAddress,
      // Authenticated user (the signer)
      signer: {
        name: signerName,
        email: signerEmail,
      },
      // Valuer credentials (for the professional seal)
      valuer: {
        id: credentials.id,
        name: credentials.name,
        title: credentials.title,
        qualifications: credentials.qualifications,
        license_number: credentials.license_number,
      },
      signers: [{
        name: signerName,
        email: signerEmail,
        role: 'signer',
        order: 1,
      }],
      subject: `Valuation Report - ${propertyAddress}`,
      message: `Professional valuation report for ${propertyAddress}. Please review and sign to approve.`,
    });
  } catch (error: any) {
    logger.error('Failed to prepare e-sign for report', {
      reportId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to prepare e-sign data',
    });
  }
});

/**
 * GET /api/reports/:id/pdf-stream
 * Stream the report PDF directly (avoids CORS issues with S3 presigned URLs).
 * Used by the e-sign UI iframe to load the document.
 */
router.get('/:id/pdf-stream', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const report = await reportService.getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Not Found', message: 'Report not found' });
    }

    const pdfKey = report.pdf_url as string | undefined;
    if (!pdfKey) {
      return res.status(404).json({ error: 'Not Found', message: 'PDF has not been generated yet' });
    }

    const bucket = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-reports';
    const file = await getFile(bucket, pdfKey);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report_${req.params.id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.send(Buffer.from(file.body));
  } catch (error: any) {
    logger.error('Failed to stream report PDF', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * POST /api/reports/:id/reject
 * Reject a report (send back for revision)
 */
router.post('/:id/reject', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { valuer_id, reason } = req.body;

    if (!valuer_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'valuer_id is required',
      });
    }

    if (!reason) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'reason is required',
      });
    }

    const result = await approvalService.rejectReport(req.params.id, valuer_id, reason);

    if (!result.success) {
      return res.status(400).json({
        error: 'Rejection Failed',
        message: result.error,
      });
    }

    // Log audit
    await auditLogService.logRejected(req.params.id, valuer_id, reason);

    logger.info('Report rejected', { reportId: req.params.id, reason });

    res.json({
      success: true,
      report_id: req.params.id,
      status: 'draft',
      message: 'Report sent back for revision',
    });
  } catch (error: any) {
    logger.error('Failed to reject report', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to reject report',
    });
  }
});

// =====================================================
// PHASE 4: PDF GENERATION & DOWNLOAD ENDPOINTS
// =====================================================

/**
 * POST /api/reports/:id/generate-pdf
 * Generate PDF from approved report
 */
router.post('/:id/generate-pdf', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || null;

    const result = await pdfGenerationService.convertDocxToPdf(req.params.id, {
      addQrCode: req.body.add_qr_code !== false,
      addDigitalSeal: req.body.add_digital_seal !== false,
    });

    if (!result.success) {
      return res.status(400).json({
        error: 'PDF Generation Failed',
        message: result.error,
      });
    }

    // Log audit (non-blocking — don't let audit failure block PDF response)
    try {
      await auditLogService.logPdfGenerated(req.params.id, userId, result.fileSize);
    } catch (auditErr: any) {
      logger.warn('Audit log failed for PDF generation', { reportId: req.params.id, error: auditErr.message });
    }

    logger.info('PDF generated', {
      reportId: req.params.id,
      fileSize: result.fileSize,
    });

    res.json({
      success: true,
      report_id: req.params.id,
      pdf_url: result.pdfUrl,
      storage_key: result.storageKey,
      digital_seal_hash: result.digitalSealHash,
      verification_url: result.verificationUrl,
      file_size: result.fileSize,
      generated_at: result.generatedAt,
    });
  } catch (error: any) {
    logger.error('Failed to generate PDF', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate PDF',
    });
  }
});

/**
 * GET /api/reports/:id/download/pdf
 * Download PDF report
 */
router.get('/:id/download/pdf', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;

    const result = await pdfGenerationService.getPdfDownloadUrl(req.params.id);

    if (result.error) {
      return res.status(400).json({
        error: 'Download Failed',
        message: result.error,
      });
    }

    // Log audit
    await auditLogService.logDownloaded(req.params.id, userId, 'pdf', ipAddress);

    // Redirect or return URL
    if (req.query.redirect === 'true') {
      return res.redirect(result.url!);
    }

    res.json({
      download_url: result.url,
      filename: result.filename,
      expires_in: 3600,
    });
  } catch (error: any) {
    logger.error('Failed to get PDF download', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get download URL',
    });
  }
});

/**
 * GET /api/reports/:id/download/docx
 * Download DOCX report
 */
router.get('/:id/download/docx', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;

    const result = await pdfGenerationService.getDocxDownloadUrl(req.params.id);

    if (result.error) {
      return res.status(400).json({
        error: 'Download Failed',
        message: result.error,
      });
    }

    // Log audit
    await auditLogService.logDownloaded(req.params.id, userId, 'docx', ipAddress);

    // Redirect or return URL
    if (req.query.redirect === 'true') {
      return res.redirect(result.url!);
    }

    res.json({
      download_url: result.url,
      filename: result.filename,
      expires_in: 3600,
    });
  } catch (error: any) {
    logger.error('Failed to get DOCX download', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get download URL',
    });
  }
});

// =====================================================
// PHASE 4: INTEGRITY & QR CODE ENDPOINTS
// =====================================================

/**
 * GET /api/reports/:id/integrity
 * Verify document integrity (compare stored vs current hash)
 */
router.get('/:id/integrity', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await pdfGenerationService.verifyDocumentHash(req.params.id);

    res.json({
      report_id: req.params.id,
      ...result,
    });
  } catch (error: any) {
    logger.error('Failed to verify integrity', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify document integrity',
    });
  }
});

/**
 * GET /api/reports/:id/qr-code
 * Get QR code for verification
 */
router.get('/:id/qr-code', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const report = await reportService.getReportById(req.params.id);

    if (!report) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found',
      });
    }

    if (!report.digital_seal_hash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Report has not been approved yet',
      });
    }

    const qrCodeDataUrl = await pdfGenerationService.generateQrCode(
      req.params.id,
      report.digital_seal_hash
    );

    res.json({
      report_id: req.params.id,
      qr_code: qrCodeDataUrl,
      verification_url: report.verification_url,
    });
  } catch (error: any) {
    logger.error('Failed to generate QR code', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate QR code',
    });
  }
});

// =====================================================
// PHASE 4: AUDIT LOG ENDPOINTS
// =====================================================

/**
 * GET /api/reports/:id/audit-summary
 * Get audit summary for a report
 */
router.get('/:id/audit-summary', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const summary = await auditLogService.getReportSummary(req.params.id);

    res.json(summary);
  } catch (error: any) {
    logger.error('Failed to get audit summary', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get audit summary',
    });
  }
});

/**
 * GET /api/reports/:id/audit-log
 * Get detailed audit log for a report
 */
router.get('/:id/audit-log', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const entries = await auditLogService.getReportLog(req.params.id, limit);

    res.json({
      report_id: req.params.id,
      entries,
      count: entries.length,
    });
  } catch (error: any) {
    logger.error('Failed to get audit log', {
      reportId: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get audit log',
    });
  }
});

/**
 * GET /api/reports/pdf-converter-status
 * Check LibreOffice availability
 */
router.get('/pdf-converter-status', async (req: Request, res: Response) => {
  try {
    const available = await pdfGenerationService.isLibreOfficeAvailable();
    const version = await pdfGenerationService.getLibreOfficeVersion();

    res.json({
      available,
      version,
    });
  } catch (error: any) {
    res.json({
      available: false,
      error: error.message,
    });
  }
});

export default router;
