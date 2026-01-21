
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { propertyEnrichmentService } from '../services/data-hub/propertyEnrichmentService';
import { reportDataService } from '../services/valuation-engine/reportDataService';
import { logger } from '../utils/logger';
import { query } from '../database';

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
      res.status(400).json({
          error: {
              code: 'INVALID_ID',
              message: 'Invalid property ID format'
          }
      });
      return;
  }

  try {
    const result = await propertyEnrichmentService.getEnrichedProperty(id);

    if (!result) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Property not found'
        }
      });
      return;
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

// =====================================================
// PROPERTY REPORT DATA ENDPOINTS (Phase 2)
// =====================================================

/**
 * Get property legal data
 * GET /api/properties/:id/legal
 */
router.get('/:id/legal', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid property ID format' }
    });
    return;
  }

  try {
    const legalData = await reportDataService.getPropertyLegal(id);
    res.json(legalData);
  } catch (error: any) {
    logger.error('Error fetching property legal data', { propertyId: id, error: error.message });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve property legal data' }
    });
  }
}));

/**
 * Get property construction data
 * GET /api/properties/:id/construction
 */
router.get('/:id/construction', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid property ID format' }
    });
    return;
  }

  try {
    const constructionData = await reportDataService.getPropertyConstruction(id);
    res.json(constructionData);
  } catch (error: any) {
    logger.error('Error fetching property construction data', { propertyId: id, error: error.message });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve property construction data' }
    });
  }
}));

/**
 * Get property externals data
 * GET /api/properties/:id/externals
 */
router.get('/:id/externals', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid property ID format' }
    });
    return;
  }

  try {
    const externalsData = await reportDataService.getPropertyExternals(id);
    res.json(externalsData);
  } catch (error: any) {
    logger.error('Error fetching property externals data', { propertyId: id, error: error.message });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve property externals data' }
    });
  }
}));

/**
 * Get property risk assessment
 * GET /api/properties/:id/risk-assessment
 */
router.get('/:id/risk-assessment', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid property ID format' }
    });
    return;
  }

  try {
    const riskData = await reportDataService.getPropertyRiskAssessment(id);
    res.json(riskData);
  } catch (error: any) {
    logger.error('Error fetching property risk assessment', { propertyId: id, error: error.message });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve property risk assessment' }
    });
  }
}));

// =====================================================
// PROPERTY UPDATE ENDPOINT
// =====================================================

/**
 * Update property by ID
 * PUT /api/v1/properties/:id
 * Supports all basic fields plus metadata JSONB for Chapter 3 report data
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const propertyData = req.body;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid property ID format' }
    });
    return;
  }

  try {
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Allowed fields for direct update (only columns that exist in the properties table)
    const allowedFields = [
      'address_street', 'address_city', 'address_district', 'digital_address', 'region',
      'property_type', 'title', 'description', 'bedrooms', 'bathrooms', 'floors',
      'built_area_sqm', 'land_area_sqm', 'year_built', 'condition',
      'owner_name', 'owner_email', 'owner_phone', 'owner_address', 'owner_contact_preference',
      'metadata'
    ];

    // Fields that should go into metadata instead of direct columns
    const metadataFields = [
      'quality_rating', 'tenure_type', 'view_quality', 'neighborhood_rating', 'accessibility_rating'
    ];

    // Field mappings from frontend to database
    const fieldMappings: Record<string, string> = {
      'address': 'address_street',
      'city': 'address_city',
      'land_area': 'land_area_sqm',
      'building_area_sqm': 'built_area_sqm',
      'total_floors': 'floors',
      'gfa': 'built_area_sqm',
    };

    // Collect metadata fields separately
    let metadataToMerge: Record<string, any> = {};

    for (const [frontendField, value] of Object.entries(propertyData)) {
      if (value === undefined) continue;

      // Check if this field should go into metadata
      if (metadataFields.includes(frontendField)) {
        if (value !== null && value !== '') {
          metadataToMerge[frontendField] = value;
        }
        continue;
      }

      // Map frontend field names to database field names
      const dbField = fieldMappings[frontendField] || frontendField;

      if (allowedFields.includes(dbField)) {
        // Handle type conversions and special fields
        if (['bedrooms', 'bathrooms', 'year_built', 'floors'].includes(dbField)) {
          updates.push(`${dbField} = $${paramIndex}`);
          values.push(value ? parseInt(String(value)) : null);
        } else if (['land_area_sqm', 'built_area_sqm'].includes(dbField)) {
          updates.push(`${dbField} = $${paramIndex}`);
          values.push(value ? parseFloat(String(value)) : null);
        } else if (dbField === 'metadata') {
          // Merge with metadataToMerge - will be handled after loop
          if (typeof value === 'object' && value !== null) {
            metadataToMerge = { ...metadataToMerge, ...value };
          }
        } else {
          updates.push(`${dbField} = $${paramIndex}`);
          values.push(value);
        }
        if (dbField !== 'metadata') {
          paramIndex++;
        }
      }
    }

    // Add metadata merge if we have any metadata
    if (Object.keys(metadataToMerge).length > 0) {
      updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${paramIndex}::jsonb`);
      values.push(JSON.stringify(metadataToMerge));
      paramIndex++;
    }

    if (updates.length === 0) {
      res.status(400).json({
        error: { code: 'NO_UPDATES', message: 'No valid fields to update' }
      });
      return;
    }

    // Add updated_at
    updates.push('updated_at = NOW()');
    values.push(id);

    const updateQuery = `
      UPDATE properties 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    // Debug logging
    logger.info('Executing property update', { 
      query: updateQuery, 
      valueCount: values.length,
      paramIndex,
      updates: updates.length
    });

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Property not found' }
      });
      return;
    }

    logger.info('Property updated successfully', { 
      propertyId: id, 
      fieldsUpdated: updates.length - 1 
    });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Property updated successfully'
    });
  } catch (error: any) {
    logger.error('Error updating property', { 
      propertyId: id, 
      error: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to update property' }
    });
  }
}));

export default router;
