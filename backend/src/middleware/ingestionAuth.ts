import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { logger } from '../utils/logger';

/**
 * Guard for external data-intake routes (ingestion, pull-integrations).
 *
 * These accept data into the pipeline that underpins the platform's data products, so they
 * must not be anonymous. Access is granted if EITHER:
 *   - a valid machine API key is presented (header `x-api-key` === env INGESTION_API_KEY), OR
 *   - the caller is an authenticated user (delegates to the standard `authenticate`).
 *
 * If INGESTION_API_KEY is not configured, only authenticated users may call these routes.
 */
export function requireIngestionAuth(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers['x-api-key'];
  const expected = process.env.INGESTION_API_KEY;

  if (expected && typeof provided === 'string' && provided === expected) {
    (req as any).ingestionViaApiKey = true;
    return next();
  }
  if (provided && expected && provided !== expected) {
    logger.warn({ path: req.originalUrl, ip: req.ip }, 'ingestionAuth: invalid API key');
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  // No (valid) API key — require an authenticated user.
  void authenticate(req, res, next);
}
