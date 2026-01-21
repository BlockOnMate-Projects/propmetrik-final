/**
 * Valuers API Routes
 * 
 * REST API endpoints for Valuer management.
 * Handles valuer profiles, credentials, and signature management.
 * 
 * Phase 4: Week 7 - Valuer Endpoints
 * - GET /api/valuers/:id - Get valuer by ID
 * - GET /api/valuers/user/:userId - Get valuer by user ID
 * - GET /api/valuers/:id/credentials - Get valuer credentials
 * - POST /api/valuers/:id/signature - Upload valuer signature
 * - GET /api/valuers - List all active valuers
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { approvalService } from '../services/valuation-engine';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../database/minio';
import { query } from '../database';

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

// Configure multer for signature upload
const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max for signatures
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG and JPEG are allowed for signatures.'));
    }
  },
});

// =====================================================
// VALUER ENDPOINTS
// =====================================================

/**
 * GET /api/valuers
 * List all active valuers
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const valuers = await approvalService.listActiveValuers();

    res.json({
      valuers,
      count: valuers.length,
    });
  } catch (error: any) {
    logger.error('Failed to list valuers', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list valuers',
    });
  }
});

/**
 * GET /api/valuers/:id
 * Get valuer by ID
 */
router.get('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const valuer = await approvalService.getValuerById(req.params.id);

    if (!valuer) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Valuer not found: ${req.params.id}`,
      });
    }

    // Get signed URL for signature if exists
    let signatureUrl = null;
    if (valuer.signature_storage_key) {
      const bucket = buckets.documents || 'propmetrik-documents';
      signatureUrl = await getPresignedDownloadUrl(
        bucket,
        valuer.signature_storage_key,
        3600
      );
    }

    res.json({
      ...valuer,
      signature_url: signatureUrl,
    });
  } catch (error: any) {
    logger.error('Failed to get valuer', { 
      valuerId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get valuer',
    });
  }
});

/**
 * GET /api/valuers/user/:userId
 * Get valuer by user ID
 */
router.get('/user/:userId', validateUUID('userId'), async (req: Request, res: Response) => {
  try {
    const valuer = await approvalService.getValuerByUserId(req.params.userId);

    if (!valuer) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No valuer found for user: ${req.params.userId}`,
      });
    }

    // Get signed URL for signature if exists
    let signatureUrl = null;
    if (valuer.signature_storage_key) {
      const bucket = buckets.documents || 'propmetrik-documents';
      signatureUrl = await getPresignedDownloadUrl(
        bucket,
        valuer.signature_storage_key,
        3600
      );
    }

    res.json({
      ...valuer,
      signature_url: signatureUrl,
    });
  } catch (error: any) {
    logger.error('Failed to get valuer by user ID', { 
      userId: req.params.userId, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get valuer',
    });
  }
});

/**
 * GET /api/valuers/:id/credentials
 * Get valuer credentials (for approval verification)
 */
router.get('/:id/credentials', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const credentials = await approvalService.getValuerCredentials(req.params.id);

    if (!credentials) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Valuer not found: ${req.params.id}`,
      });
    }

    res.json(credentials);
  } catch (error: any) {
    logger.error('Failed to get valuer credentials', { 
      valuerId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get valuer credentials',
    });
  }
});

/**
 * POST /api/valuers/:id/signature
 * Upload valuer digital signature
 */
router.post(
  '/:id/signature',
  validateUUID('id'),
  signatureUpload.single('signature'),
  async (req: Request, res: Response) => {
    try {
      // Check if valuer exists
      const valuer = await approvalService.getValuerById(req.params.id);
      
      if (!valuer) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Valuer not found: ${req.params.id}`,
        });
      }

      let signatureBuffer: Buffer;
      let contentType = 'image/png';

      // Handle file upload or base64 data URL
      if (req.file) {
        // File upload
        signatureBuffer = req.file.buffer;
        contentType = req.file.mimetype;
      } else if (req.body.signature_data_url) {
        // Base64 data URL (from canvas)
        const dataUrl = req.body.signature_data_url as string;
        
        // Parse data URL
        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid signature data URL format',
          });
        }

        contentType = matches[1];
        signatureBuffer = Buffer.from(matches[2], 'base64');
      } else {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'No signature provided. Send as file or base64 data URL.',
        });
      }

      // Upload to MinIO
      const bucket = buckets.documents || 'propmetrik-documents';
      const storageKey = `signatures/valuers/${req.params.id}/${Date.now()}.png`;

      await uploadFile(
        bucket,
        storageKey,
        signatureBuffer,
        contentType,
        {
          'valuer-id': req.params.id,
          'uploaded-at': new Date().toISOString(),
        }
      );

      // Update valuer record
      const updated = await approvalService.updateValuerSignature(
        req.params.id,
        storageKey
      );

      if (!updated) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to update valuer signature',
        });
      }

      // Get signed URL for response
      const signatureUrl = await getPresignedDownloadUrl(bucket, storageKey, 3600);

      logger.info('Valuer signature uploaded', {
        valuerId: req.params.id,
        storageKey,
      });

      res.status(201).json({
        success: true,
        message: 'Signature uploaded successfully',
        signature_url: signatureUrl,
        storage_key: storageKey,
      });
    } catch (error: any) {
      logger.error('Failed to upload signature', { 
        valuerId: req.params.id, 
        error: error.message 
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to upload signature',
      });
    }
  }
);

/**
 * DELETE /api/valuers/:id/signature
 * Remove valuer signature
 */
router.delete('/:id/signature', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const valuer = await approvalService.getValuerById(req.params.id);
    
    if (!valuer) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Valuer not found: ${req.params.id}`,
      });
    }

    // Clear signature from record (don't delete from storage for audit trail)
    await query(
      `UPDATE valuers SET signature_storage_key = NULL, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    logger.info('Valuer signature removed', { valuerId: req.params.id });

    res.json({
      success: true,
      message: 'Signature removed successfully',
    });
  } catch (error: any) {
    logger.error('Failed to remove signature', { 
      valuerId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to remove signature',
    });
  }
});

/**
 * POST /api/valuers
 * Create a new valuer record (admin only)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      user_id,
      name,
      qualifications,
      title,
      license_number,
      license_issuer,
      license_valid_until,
      pi_provider,
      pi_policy_number,
      pi_coverage,
      pi_valid_until,
      contact_address,
      contact_email,
      contact_phone,
      company_name,
      company_address,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name is required',
      });
    }

    const valuerId = uuidv4();

    const result = await query(
      `INSERT INTO valuers (
        id, user_id, name, qualifications, title,
        license_number, license_issuer, license_valid_until, license_status,
        pi_provider, pi_policy_number, pi_coverage, pi_valid_until,
        contact_address, contact_email, contact_phone,
        company_name, company_address, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        valuerId,
        user_id || null,
        name,
        qualifications || null,
        title || null,
        license_number || null,
        license_issuer || null,
        license_valid_until ? new Date(license_valid_until) : null,
        'active',
        pi_provider || null,
        pi_policy_number || null,
        pi_coverage || null,
        pi_valid_until ? new Date(pi_valid_until) : null,
        contact_address || null,
        contact_email || null,
        contact_phone || null,
        company_name || null,
        company_address || null,
        true,
      ]
    );

    logger.info('Valuer created', { valuerId, name });

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    logger.error('Failed to create valuer', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create valuer',
    });
  }
});

/**
 * PUT /api/valuers/:id
 * Update valuer record
 */
router.put('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const valuer = await approvalService.getValuerById(req.params.id);
    
    if (!valuer) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Valuer not found: ${req.params.id}`,
      });
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'name', 'qualifications', 'title',
      'license_number', 'license_issuer', 'license_valid_until', 'license_status',
      'pi_provider', 'pi_policy_number', 'pi_coverage', 'pi_valid_until',
      'contact_address', 'contact_email', 'contact_phone',
      'company_name', 'company_address', 'is_active',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex++}`);
        
        // Handle date fields
        if (field.includes('_until') && req.body[field]) {
          updateValues.push(new Date(req.body[field]));
        } else {
          updateValues.push(req.body[field]);
        }
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update',
      });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(req.params.id);

    const result = await query(
      `UPDATE valuers SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    logger.info('Valuer updated', { valuerId: req.params.id });

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Failed to update valuer', { 
      valuerId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update valuer',
    });
  }
});

export default router;
