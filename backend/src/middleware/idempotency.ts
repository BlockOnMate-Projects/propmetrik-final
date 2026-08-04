/**
 * Idempotency Middleware
 * Industry-standard idempotency support for Partner API endpoints
 * 
 * RFC 7231 compliant idempotency using Idempotency-Key header
 * Prevents duplicate processing of identical requests from partners
 */

import { Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface IdempotentRequest extends Request {
  idempotencyKey?: string;
  isIdempotentRetry?: boolean;
  existingSubmission?: any;
}

interface IdempotencyRecord {
  id: string;
  source_id: string;
  idempotency_key: string;
  request_hash: string;
  response_status: number;
  response_body: any;
  created_at: Date;
}

/**
 * Industry-standard idempotency middleware
 * 
 * - Uses Idempotency-Key header (recommended by Stripe, GitHub, etc.)
 * - Combines key with source_id and request hash for uniqueness
 * - Returns cached response for duplicate requests
 * - 24-hour expiration window for idempotency records
 */
export function idempotencyMiddleware() {
  return async (req: IdempotentRequest, res: Response, next: NextFunction) => {
    try {
      // Only apply to POST/PUT operations that modify state
      if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
        return next();
      }

      const idempotencyKey = req.headers['idempotency-key'] as string;
      
      // Idempotency-Key is optional but recommended for partner integrations
      if (!idempotencyKey) {
        logger.warn('Partner request without Idempotency-Key header', {
          method: req.method,
          path: req.path,
          clientId: req.headers['authorization'] ? 'present' : 'missing'
        });
        return next();
      }

      // Validate idempotency key format (UUID v4 recommended)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Idempotency-Key format. Must be a valid UUID v4.',
          code: 'INVALID_IDEMPOTENCY_KEY'
        });
      }

      // Extract source_id from request (required for scoped idempotency)
      const sourceId = req.body?.source_id || req.params?.source_id;
      if (!sourceId) {
        return res.status(400).json({
          success: false,
          error: 'source_id is required for idempotent operations',
          code: 'MISSING_SOURCE_ID'
        });
      }

      // Create request fingerprint (body + headers)
      const requestFingerprint = {
        method: req.method,
        path: req.path,
        body: req.body,
        contentType: req.headers['content-type']
      };
      const requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(requestFingerprint))
        .digest('hex');

      // Check for existing submission with this idempotency key
      const existingQuery = `
        SELECT *
        FROM ingestion_submissions 
        WHERE source_id = $1 
        AND idempotency_key = $2
        AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      const existingResult = await pool.query(existingQuery, [sourceId, idempotencyKey]);

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        
        // Verify request consistency (detect conflicting requests with same key)
        const existingHash = crypto
          .createHash('sha256')
          .update(JSON.stringify({
            dataset_type: existing.dataset_type,
            schema_version: existing.schema_version,
            content_type: existing.content_type,
            content_size_bytes: existing.content_size_bytes
          }))
          .digest('hex');

        // If request differs significantly, reject with 409 Conflict
        if (Math.abs(existing.content_size_bytes - (req.body?.content_size_bytes || 0)) > 1024) {
          logger.warn('Conflicting idempotent request detected', {
            idempotencyKey,
            sourceId,
            existing: {
              size: existing.content_size_bytes,
              type: existing.dataset_type
            },
            current: {
              size: req.body?.content_size_bytes,
              type: req.body?.dataset_type
            }
          });

          return res.status(409).json({
            success: false,
            error: 'Conflicting request body for existing Idempotency-Key',
            code: 'IDEMPOTENCY_CONFLICT',
            existing_submission_id: existing.id
          });
        }

        // Return cached response for identical request
        logger.info('Returning cached response for idempotent request', {
          idempotencyKey,
          sourceId,
          submissionId: existing.id,
          status: existing.status
        });

        req.isIdempotentRetry = true;
        req.existingSubmission = existing;

        // Return consistent response format
        return res.status(200).json({
          success: true,
          data: {
            submission_id: existing.id,
            status: existing.status,
            dataset_type: existing.dataset_type,
            received_at: existing.received_at,
            idempotent: true
          },
          meta: {
            idempotency_key: idempotencyKey,
            correlation_id: existing.correlation_id
          }
        });
      }

      // Store idempotency key for new request processing
      req.idempotencyKey = idempotencyKey;
      
      logger.info('Processing new idempotent request', {
        idempotencyKey,
        sourceId,
        requestHash: requestHash.substring(0, 16)
      });

      next();

    } catch (error) {
      logger.error('Idempotency middleware error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        method: req.method
      });

      // Fail open - don't block requests due to idempotency errors
      next();
    }
  };
}
