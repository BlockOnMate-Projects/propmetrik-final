
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { propertyEnrichmentService } from '../services/data-hub/propertyEnrichmentService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get list of properties
 * GET /api/public/properties
 * Query params:
 *   - limit: number (default 24)
 *   - offset: number (default 0)
 *   - type: 'sale' | 'rental' (optional filter)
 *   - search: string (optional search term for address/city)
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 24;
  const offset = parseInt(req.query.offset as string) || 0;
  const transactionType = req.query.type as 'sale' | 'rental' | undefined;
  const search = req.query.search as string | undefined;

  const [properties, counts] = await Promise.all([
    propertyEnrichmentService.getProperties(limit, offset, transactionType, search),
    propertyEnrichmentService.getPropertyCounts()
  ]);
  
  res.json({ 
    success: true, 
    count: properties.length, 
    total: counts,
    data: properties 
  });
}));

/**
 * Get enriched property details
 * GET /api/public/properties/:id/enriched
 */
router.get('/:id/enriched', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Basic UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
      return res.status(400).json({
          error: {
              code: 'INVALID_ID',
              message: 'Invalid property ID format'
          }
      });
  }

  try {
    const result = await propertyEnrichmentService.getEnrichedProperty(id);

    if (!result) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Property not found'
        }
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Error fetching enriched property', { propertyId: id, error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve property details'
      }
    });
  }
}));

export default router;
