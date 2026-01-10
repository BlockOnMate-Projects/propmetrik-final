/**
 * Partner API Ingestion Router
 * Industry-standard REST API for Tier 1/2 partner data submissions
 * 
 * Base path: /api/v1/ingestion
 * 
 * Endpoints:
 * - POST /submissions - Create submission
 * - POST /submissions/:id/presign - Get presigned upload URL
 * - POST /submissions/:id/complete - Mark upload complete
 * - GET /submissions/:id - Get submission status
 * - GET /submissions - List submissions (paginated)
 * 
 * Security:
 * - OAuth2 Client Credentials authentication
 * - Partner-scoped authorization
 * - Rate limiting (1000 req/hour per client)
 * - Idempotency support
 * - Request/response logging
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticatePartner, authorizeSource, partnerRateLimit, PartnerAuthRequest } from '../middleware/partnerAuth';
import { idempotencyMiddleware, IdempotentRequest } from '../middleware/idempotency';
import { ingestionSubmissionService } from '../services/data-hub/ingestionSubmissionService';
import { logger } from '../utils/logger';

const router = Router();

// Apply partner authentication and rate limiting to all routes
router.use(authenticatePartner());
router.use(partnerRateLimit());

// Request validation helper
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array()
    });
  }
  next();
};

/**
 * POST /api/v1/ingestion/submissions
 * Create a new data submission
 * 
 * Industry standards followed:
 * - RFC 7231 (HTTP/1.1 Semantics) for status codes
 * - RFC 6585 for 429 Too Many Requests
 * - Idempotency-Key header support (Stripe/GitHub pattern)
 * - Comprehensive error codes for API consumers
 */
router.post('/submissions',
  idempotencyMiddleware(),
  [
    body('source_id')
      .isUUID()
      .withMessage('source_id must be a valid UUID'),
    body('dataset_type')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('dataset_type is required and must be 1-100 characters'),
    body('schema_version')
      .optional()
      .matches(/^\d+\.\d+\.\d+$/)
      .withMessage('schema_version must be in semantic version format (x.y.z)'),
    body('content_type')
      .isString()
      .matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/)
      .withMessage('content_type must be a valid MIME type'),
    body('content_size_bytes')
      .optional()
      .isInt({ min: 1, max: 500 * 1024 * 1024 }) // 500MB max
      .withMessage('content_size_bytes must be between 1 byte and 500MB')
  ],
  handleValidationErrors,
  authorizeSource(),
  asyncHandler(async (req: PartnerAuthRequest & IdempotentRequest, res: Response) => {
    // Handle idempotent retry
    if (req.isIdempotentRetry && req.existingSubmission) {
      return res.status(200).json({
        success: true,
        data: {
          submission_id: req.existingSubmission.id,
          status: req.existingSubmission.status,
          dataset_type: req.existingSubmission.dataset_type,
          received_at: req.existingSubmission.received_at,
          idempotent: true
        },
        meta: {
          idempotency_key: req.idempotencyKey,
          correlation_id: req.existingSubmission.correlation_id
        }
      });
    }

    const {
      source_id,
      dataset_type,
      schema_version,
      content_type,
      content_size_bytes
    } = req.body;

    try {
      const submission = await ingestionSubmissionService.createSubmission({
        source_id,
        dataset_type,
        schema_version,
        content_type,
        content_size_bytes,
        idempotency_key: req.idempotencyKey,
        submitted_by: req.partner!.clientId,
        client_id: req.partner!.clientId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      logger.info('Partner submission created', {
        submissionId: submission.submission_id,
        clientId: req.partner!.clientId,
        datasetType: dataset_type,
        hasIdempotencyKey: !!req.idempotencyKey
      });

      res.status(201).json({
        success: true,
        data: submission,
        meta: {
          idempotency_key: req.idempotencyKey,
          correlation_id: submission.correlation_id
        }
      });

    } catch (error) {
      logger.error('Failed to create submission', {
        clientId: req.partner!.clientId,
        sourceId: source_id,
        datasetType: dataset_type,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'SOURCE_NOT_FOUND'
        });
      }

      if (error instanceof Error && error.message.includes('not allowed')) {
        return res.status(403).json({
          success: false,
          error: error.message,
          code: 'DATASET_NOT_ALLOWED'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create submission',
        code: 'SUBMISSION_CREATE_FAILED'
      });
    }
  })
);

/**
 * POST /api/v1/ingestion/submissions/:id/presign
 * Get presigned upload URL for submission content
 */
router.post('/submissions/:id/presign',
  [
    param('id')
      .isUUID()
      .withMessage('Submission ID must be a valid UUID')
  ],
  handleValidationErrors,
  asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
    const submissionId = req.params.id;

    try {
      const presignedUpload = await ingestionSubmissionService.getPresignedUploadUrl(submissionId);

      logger.info('Presigned upload URL generated', {
        submissionId,
        clientId: req.partner!.clientId,
        expiresAt: presignedUpload.expires_at
      });

      res.status(200).json({
        success: true,
        data: presignedUpload,
        meta: {
          instructions: {
            method: 'PUT',
            headers: {
              'Content-Type': req.body?.content_type || 'application/octet-stream'
            },
            checksum_header: presignedUpload.checksum_required ? 'x-amz-checksum-sha256' : null
          }
        }
      });

    } catch (error) {
      logger.error('Failed to generate presigned URL', {
        submissionId,
        clientId: req.partner!.clientId,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Submission not found or not in received status',
          code: 'SUBMISSION_NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to generate presigned upload URL',
        code: 'PRESIGN_FAILED'
      });
    }
  })
);

/**
 * POST /api/v1/ingestion/submissions/:id/complete
 * Mark upload complete and trigger validation
 */
router.post('/submissions/:id/complete',
  [
    param('id')
      .isUUID()
      .withMessage('Submission ID must be a valid UUID'),
    body('checksum_sha256')
      .optional()
      .matches(/^[a-f0-9]{64}$/i)
      .withMessage('checksum_sha256 must be a valid SHA-256 hex string'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('metadata must be an object')
  ],
  handleValidationErrors,
  asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
    const submissionId = req.params.id;
    const { checksum_sha256, metadata } = req.body;

    try {
      const result = await ingestionSubmissionService.completeSubmission(submissionId, {
        checksum_sha256,
        metadata
      });

      logger.info('Submission marked complete', {
        submissionId,
        clientId: req.partner!.clientId,
        hasChecksum: !!checksum_sha256,
        validationStarted: result.validation_started
      });

      res.status(200).json({
        success: true,
        data: {
          submission_id: submissionId,
          validation_started: result.validation_started,
          estimated_validation_time: '30-120 seconds'
        }
      });

    } catch (error) {
      logger.error('Failed to complete submission', {
        submissionId,
        clientId: req.partner!.clientId,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Submission not found or not in received status',
          code: 'SUBMISSION_NOT_FOUND'
        });
      }

      if (error instanceof Error && error.message.includes('Checksum')) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'CHECKSUM_VERIFICATION_FAILED'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to complete submission',
        code: 'COMPLETION_FAILED'
      });
    }
  })
);

/**
 * GET /api/v1/ingestion/submissions/:id
 * Get submission status and details
 */
router.get('/submissions/:id',
  [
    param('id')
      .isUUID()
      .withMessage('Submission ID must be a valid UUID')
  ],
  handleValidationErrors,
  asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
    const submissionId = req.params.id;

    try {
      const submission = await ingestionSubmissionService.getSubmission(submissionId);

      // Ensure partner can only access their own submissions
      if (!req.partner!.sourceIds.includes(submission.source.id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this submission',
          code: 'SUBMISSION_ACCESS_DENIED'
        });
      }

      res.status(200).json({
        success: true,
        data: submission
      });

    } catch (error) {
      logger.error('Failed to get submission', {
        submissionId,
        clientId: req.partner!.clientId,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Submission not found',
          code: 'SUBMISSION_NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve submission',
        code: 'SUBMISSION_GET_FAILED'
      });
    }
  })
);

/**
 * GET /api/v1/ingestion/submissions
 * List submissions with filtering and pagination
 */
router.get('/submissions',
  [
    query('status')
      .optional()
      .isIn(['received', 'validating', 'accepted', 'rejected', 'processing', 'completed', 'failed'])
      .withMessage('Invalid status value'),
    query('dataset_type')
      .optional()
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('dataset_type must be 1-100 characters'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100')
  ],
  handleValidationErrors,
  asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
    const {
      status,
      dataset_type,
      page,
      limit
    } = req.query;

    try {
      const result = await ingestionSubmissionService.listSubmissions({
        source_id: req.partner!.sourceIds.length === 1 ? req.partner!.sourceIds[0] : undefined,
        client_id: req.partner!.clientId,
        status: status as any,
        dataset_type: dataset_type as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      // Filter submissions to only those the partner can access
      const filteredSubmissions = result.submissions.filter(submission =>
        req.partner!.sourceIds.includes(submission.source_id)
      );

      res.status(200).json({
        success: true,
        data: filteredSubmissions,
        meta: {
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            pages: Math.ceil(result.total / result.limit)
          }
        }
      });

    } catch (error) {
      logger.error('Failed to list submissions', {
        clientId: req.partner!.clientId,
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to list submissions',
        code: 'SUBMISSIONS_LIST_FAILED'
      });
    }
  })
);

export { router as ingestionRouter };