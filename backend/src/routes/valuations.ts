/**
 * Valuation API Routes
 * 
 * REST API endpoints for the Valuation Engine.
 * Part of Phase 3: Valuation Engine Implementation.
 * 
 * Endpoints:
 * - POST /api/valuations - Create new valuation
 * - GET /api/valuations/:id - Get valuation by ID
 * - GET /api/valuations/property/:propertyId - Get valuations for property
 * - GET /api/valuations/:id/comparables - Get comparables for valuation
 * - GET /api/valuations/:id/report - Get valuation report (PDF)
 * - GET /api/valuations/market/:region - Get market conditions
 */

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database';
import { logger } from '../utils/logger';
import { ghanaPostService } from '../services/data-hub/ghanaPostGeocodingService';
import { 
  validate, 
  landValueCalculateRequestSchema,
  landComparablesQuerySchema,
} from '../middleware/validation';
import {
  valuationEngineService,
  pythonClient,
  valuationReportService,
  getValuation,
  getValuationHistory,
} from '../services/valuation-engine';
import type {
  PropertyForValuation,
  ValuationOptions,
  RegionCode,
  CreateValuationInput,
  PropertyType,
} from '../services/valuation-engine/types';

const router = Router();

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Validate valuation request body
 * Accepts either property_id or full property object (for creating new subject property)
 */
const validateValuationRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { property, property_id } = req.body;

  // Accept either property_id or full property object
  if (!property && !property_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Either property_id or property object is required',
    });
  }

  // If full property object provided (new subject property), validate required fields
  if (property && !property_id) {
    // For new subject properties, id is NOT required - we will create it
    if (!property.property_type) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Property type is required',
      });
    }

    if (!property.region) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Region is required',
      });
    }

    if (!property.address_city) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'City is required',
      });
    }
  }

  next();
};

/**
 * Validate UUID parameter
 */
const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
};

// =====================================================
// ROUTES
// =====================================================

/**
 * @route GET /api/valuations
 * @desc List all valuations with pagination and filtering
 * @access Private
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;
    const purpose = req.query.purpose as string;

    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` WHERE v.status = $${paramIndex++}`;
      params.push(status);
    }

    if (purpose) {
      whereClause += whereClause ? ` AND v.valuation_purpose = $${paramIndex++}` : ` WHERE v.valuation_purpose = $${paramIndex++}`;
      params.push(purpose);
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM valuations v${whereClause}`,
      params
    );

    const result = await query(
      `SELECT 
        v.id,
        v.property_id,
        v.status,
        v.valuation_purpose,
        v.valuation_type,
        v.estimated_value,
        v.confidence_score,
        v.primary_method,
        v.created_at,
        v.updated_at,
        p.title as property_title,
        p.address_street,
        p.address_city,
        p.region,
        p.property_type
      FROM valuations v
      LEFT JOIN properties p ON v.property_id = p.id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      meta: {
        total: parseInt(countResult.rows[0].total),
        limit,
        offset,
        count: result.rows.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to list valuations', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list valuations',
    });
  }
});

/**
 * @route GET /api/valuations/stats
 * @desc Get valuation statistics (must be before /:id to avoid route conflict)
 * @access Private
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_valuations,
        COUNT(DISTINCT property_id) as unique_properties,
        AVG(estimated_value) as avg_value,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN status = 'pending_review' THEN 1 END) as pending_review_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7_days,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM valuations
    `);

    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        total: parseInt(stats.total_valuations) || 0,
        byStatus: {
          draft: parseInt(stats.draft_count) || 0,
          in_progress: parseInt(stats.in_progress_count) || 0,
          pending_review: parseInt(stats.pending_review_count) || 0,
          completed: parseInt(stats.completed_count) || 0,
        },
        avg_value: parseFloat(stats.avg_value) || 0,
        unique_properties: parseInt(stats.unique_properties) || 0,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get valuation stats', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve statistics',
    });
  }
});

/**
 * @route POST /api/valuations
 * @desc Create a new valuation for a property
 * @access Private
 */
router.post('/', validateValuationRequest, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { property, property_id, valuation_type, valuation_purpose, options = {} } = req.body;
    // Use user ID if authenticated, otherwise null for anonymous
    const userId = (req as any).user?.id || null;

    let propId = property_id;

    // If no property_id but property object provided, create new subject property
    if (!property_id && property) {
      logger.info('Creating new subject property for valuation', {
        city: property.address_city,
        region: property.region,
        propertyType: property.property_type,
        digitalAddress: property.digital_address,
      });

      // Auto-geocode digital address to get coordinates if not provided
      let latitude: number | null = property.latitude || null;
      let longitude: number | null = property.longitude || null;
      
      if (!latitude && !longitude && property.digital_address) {
        logger.info('Geocoding digital address for subject property', {
          digitalAddress: property.digital_address,
        });
        
        try {
          const geocodeResult = await ghanaPostService.geocodeDigitalAddress(property.digital_address);
          if (geocodeResult) {
            latitude = geocodeResult.latitude;
            longitude = geocodeResult.longitude;
            logger.info('Successfully geocoded digital address', {
              digitalAddress: property.digital_address,
              latitude,
              longitude,
              district: geocodeResult.district,
            });
          } else {
            logger.warn('Could not geocode digital address', {
              digitalAddress: property.digital_address,
            });
          }
        } catch (geocodeError) {
          logger.error('Error geocoding digital address', {
            digitalAddress: property.digital_address,
            error: geocodeError instanceof Error ? geocodeError.message : 'Unknown error',
          });
        }
      }

      // Generate reference number
      const refNumber = `PROP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      // Map frontend property types to database enum values
      const propertyTypeMap: Record<string, string> = {
        'house': 'residential_house',
        'apartment': 'apartment_flat',
        'commercial': 'commercial_shop',
        'office': 'commercial_office',
        'warehouse': 'warehouse',
        'land': 'land',
        'industrial': 'industrial',
        'mixed_use': 'mixed_use',
        // Also allow direct enum values
        'residential_house': 'residential_house',
        'apartment_flat': 'apartment_flat',
        'commercial_shop': 'commercial_shop',
        'commercial_office': 'commercial_office',
      };
      const dbPropertyType = propertyTypeMap[property.property_type] || 'residential_house';

      // Create the subject property in database
      const createResult = await query(
        `INSERT INTO properties (
          reference_number, region, address_street, address_city, address_district,
          digital_address, latitude, longitude, property_type, transaction_type, title, description,
          bedrooms, bathrooms, land_area_sqm, year_built, price, price_currency,
          data_source, status, created_by, 
          owner_name, owner_email, owner_phone, owner_address, owner_contact_preference
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26
        ) RETURNING id`,
        [
          refNumber,
          property.region,
          property.address_street || property.address || null,
          property.address_city,
          property.address_district || null,
          property.digital_address || null,
          latitude,  // Geocoded from digital address or from property
          longitude, // Geocoded from digital address or from property
          dbPropertyType,
          'sale', // Default transaction type for valuation subjects
          property.title || `Subject Property - ${property.address_city}`,
          property.description || null,
          property.bedrooms ? parseInt(property.bedrooms) : null,
          property.bathrooms ? parseInt(property.bathrooms) : null,
          property.land_area_sqm || property.plotSize || null,
          property.year_built || property.yearBuilt ? parseInt(property.year_built || property.yearBuilt) : null,
          0, // No price for subject property
          'GHS',
          'manual_entry',
          'draft',
          userId,
          // Owner information fields
          property.owner_name || null,
          property.owner_email || null,
          property.owner_phone || null,
          property.owner_address || null,
          property.owner_contact_preference || 'email',
        ]
      );

      propId = createResult.rows[0].id;
      logger.info('Subject property created', { propertyId: propId, refNumber });
    }

    logger.info('Creating valuation', {
      propertyId: propId,
      valuationType: valuation_type || 'full_appraisal',
      purpose: valuation_purpose || 'sale',
      userId,
    });

    // Create a DRAFT valuation record - do NOT run valuation engine yet
    // The valuation engine runs at reconciliation step after all data is gathered
    const valuationResult = await query(
      `INSERT INTO valuations (
        property_id,
        valuer_id,
        valuation_type,
        valuation_purpose,
        status,
        estimated_value,
        confidence_score,
        methods_used,
        effective_date
      ) VALUES (
        $1, $2, $3, $4, 'draft', 0, 0, '[]', CURRENT_DATE
      ) RETURNING id, property_id, status, valuation_type, valuation_purpose, created_at`,
      [
        propId,
        userId,
        valuation_type || 'professional',
        valuation_purpose || 'sale',
      ]
    );

    const result = valuationResult.rows[0];

    const duration = Date.now() - startTime;
    logger.info('Draft valuation created', {
      valuationId: result.id,
      propertyId: propId,
      status: 'draft',
      duration,
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        property_id: result.property_id,
        status: result.status,
        valuation_type: result.valuation_type,
        valuation_purpose: result.valuation_purpose,
        created_at: result.created_at,
        // No estimated_value yet - it's a draft
      },
      meta: {
        duration_ms: duration,
        workflow_next: `/valuations/${result.id}/property`,
      },
    });

  } catch (error: any) {
    logger.error('Failed to create valuation', {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create valuation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route POST /api/valuations/:id/run-python
 * @desc Run Python valuation engine for a valuation
 * @access Private
 */
router.post('/:id/run-python', validateUUID('id'), async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const valuationId = req.params.id;

    // Get the valuation and property data
    const valuationResult = await query(
      `SELECT v.*, 
        p.id as property_id,
        p.region,
        p.address_city,
        p.property_type,
        p.bedrooms,
        p.bathrooms,
        p.land_area_sqm,
        p.year_built
      FROM valuations v
      JOIN properties p ON v.property_id = p.id
      WHERE v.id = $1`,
      [valuationId]
    );

    if (valuationResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    const valuation = valuationResult.rows[0];

    // Prepare property data for Python service
    const propertyData = {
      id: valuation.property_id,
      region: valuation.region,
      city: valuation.address_city,
      property_type: valuation.property_type,
      bedrooms: valuation.bedrooms,
      bathrooms: valuation.bathrooms,
      land_area_sqm: valuation.land_area_sqm,
      year_built: valuation.year_built,
    };

    // Call Python valuation service
    logger.info('Calling Python valuation service', {
      valuationId,
      propertyId: valuation.property_id,
      city: valuation.address_city,
      region: valuation.region,
    });

    const pythonResponse = await fetch('http://localhost:8001/api/v1/valuations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        property: propertyData,
        valuation_type: valuation.valuation_type,
        valuation_purpose: valuation.valuation_purpose,
        options: req.body.options || {},
      }),
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      logger.error('Python valuation service failed', {
        status: pythonResponse.status,
        error: errorText,
      });
      
      return res.status(502).json({
        error: 'Service Error',
        message: 'Python valuation service failed',
        details: process.env.NODE_ENV === 'development' ? errorText : undefined,
      });
    }

    const pythonResult = await pythonResponse.json() as {
      success: boolean;
      data?: {
        estimated_value: number;
        confidence_score: number;
        value_range?: { low: number; high: number };
        methods_used?: string[];
      };
    };

    // Update the valuation record with Python results
    if (pythonResult.success && pythonResult.data) {
      const updateResult = await query(
        `UPDATE valuations SET
          estimated_value = $1,
          confidence_score = $2,
          value_range_low = $3,
          value_range_high = $4,
          methods_used = $5,
          status = 'completed',
          updated_at = NOW()
        WHERE id = $6
        RETURNING *`,
        [
          pythonResult.data.estimated_value,
          pythonResult.data.confidence_score,
          pythonResult.data.value_range?.low,
          pythonResult.data.value_range?.high,
          JSON.stringify(pythonResult.data.methods_used || []),
          valuationId,
        ]
      );

      const duration = Date.now() - startTime;
      logger.info('Python valuation completed successfully', {
        valuationId,
        estimatedValue: pythonResult.data.estimated_value,
        confidence: pythonResult.data.confidence_score,
        duration,
      });

      res.json({
        success: true,
        data: {
          id: valuationId,
          ...updateResult.rows[0],
          python_details: pythonResult.data,
        },
        meta: {
          duration_ms: duration,
          engine: 'python',
          version: '2.0.0', // Python valuation engine version
        },
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Invalid response from Python service',
        details: pythonResult,
      });
    }

  } catch (error: any) {
    logger.error('Failed to run Python valuation', {
      valuationId: req.params.id,
      error: error.message,
      stack: error.stack,
    });

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Python valuation service is not running. Please start it with: cd python-valuation && python start.py',
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to run Python valuation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route GET /api/valuations/test/python-health
 * @desc Test if Python valuation service is running
 * @access Private
 */
router.get('/test/python-health', async (req: Request, res: Response) => {
  try {
    const pythonResponse = await fetch('http://localhost:8001/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!pythonResponse.ok) {
      return res.status(503).json({
        success: false,
        message: 'Python service is not responding properly',
        status: pythonResponse.status,
      });
    }

    const healthData = await pythonResponse.json();
    
    res.json({
      success: true,
      message: 'Python valuation service is running',
      data: healthData,
    });

  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Python service is not running',
        instructions: 'Start it with: cd python-valuation && python start.py',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to check Python service health',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/valuations/:id
 * @desc Get a valuation by ID
 * @access Private
 */
router.get('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const valuation = await getValuation(id);

    if (!valuation) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    res.json({
      success: true,
      data: valuation,
    });

  } catch (error: any) {
    logger.error('Failed to get valuation', {
      valuationId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve valuation',
    });
  }
});

/**
 * @route PUT /api/valuations/:id
 * @desc Update a valuation by ID
 * @access Private
 */
router.put('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if valuation exists
    const existing = await query('SELECT id FROM valuations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Allowed fields for update (must match actual database columns)
    const allowedFields = [
      'current_step',
      'status',
      'valuation_date',
      'valuation_purpose',
      'final_value_ghs',
      'estimated_value',
      'confidence_score',
      'methods_applied',
      'method_weights',
      'method_results',
      'primary_method',
      'methods_used',
      'hbu_results',
      'hbu_analysis',
      'reconciliation_data',
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        // Handle JSONB fields - merge with existing
        const jsonbFields = ['method_results', 'hbu_results', 'hbu_analysis', 'method_weights', 'reconciliation_data', 'methods_used'];
        if (jsonbFields.includes(field)) {
          updates.push(`${field} = COALESCE(${field}, '{}'::jsonb) || $${paramIndex}::jsonb`);
          values.push(JSON.stringify(updateData[field]));
        } else if (field === 'methods_applied' || field === 'selected_methods') {
          // Handle array fields
          updates.push(`${field} = $${paramIndex}::text[]`);
          values.push(updateData[field]);
        } else {
          updates.push(`${field} = $${paramIndex}`);
          values.push(updateData[field]);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update',
      });
    }

    // Add updated_at and ID
    updates.push(`updated_at = NOW()`);
    values.push(id);

    const updateQuery = `
      UPDATE valuations 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, values);

    // Get full valuation with property data
    const valuation = await getValuation(id);

    logger.info('Valuation updated', { valuationId: id, fields: Object.keys(updateData) });

    res.json({
      success: true,
      data: valuation,
    });

  } catch (error: any) {
    logger.error('Failed to update valuation', {
      valuationId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update valuation',
    });
  }
});

/**
 * @route DELETE /api/valuations/:id
 * @desc Delete a valuation by ID
 * @access Private
 */
router.delete('/:id', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if valuation exists
    const existing = await query('SELECT id FROM valuations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    // Delete related records first (foreign key constraints)
    await query('DELETE FROM valuation_floor_plans WHERE valuation_id = $1', [id]);
    await query('DELETE FROM valuation_comparables WHERE valuation_id = $1', [id]);
    await query('DELETE FROM valuation_user_overrides WHERE valuation_id = $1', [id]);
    await query('DELETE FROM valuation_hbu_analyses WHERE valuation_id = $1', [id]);
    
    // Delete the valuation
    await query('DELETE FROM valuations WHERE id = $1', [id]);

    logger.info('Valuation deleted', { valuationId: id });

    res.json({
      success: true,
      message: 'Valuation deleted successfully',
    });

  } catch (error: any) {
    logger.error('Failed to delete valuation', {
      valuationId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete valuation',
    });
  }
});

/**
 * @route GET /api/valuations/property/:propertyId
 * @desc Get all valuations for a property
 * @access Private
 */
router.get('/property/:propertyId', async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const valuations = await getValuationHistory(propertyId, limit);

    res.json({
      success: true,
      data: valuations,
      meta: {
        propertyId,
        count: valuations.length,
        limit,
        offset,
      },
    });

  } catch (error: any) {
    logger.error('Failed to get property valuations', {
      propertyId: req.params.propertyId,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve valuations',
    });
  }
});

/**
 * @route GET /api/valuations/:id/comparables
 * @desc Get comparables used in a valuation
 * @access Private
 */
router.get('/:id/comparables', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM valuation_comparables
       WHERE valuation_id = $1
       ORDER BY similarity_score DESC`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No comparables found for this valuation',
      });
    }

    res.json({
      success: true,
      data: result.rows,
      meta: {
        valuationId: id,
        count: result.rows.length,
      },
    });

  } catch (error: any) {
    logger.error('Failed to get comparables', {
      valuationId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve comparables',
    });
  }
});

/**
 * @route POST /api/valuations/:id/comparables/search
 * @desc Search for comparable properties based on subject property characteristics
 * @access Private
 * 
 * RICS-Compliant Comparable Search Criteria:
 * - Location: Within specified radius from subject property
 * - Property Type: Same or similar property type
 * - Size: Within ±30% of subject GFA/plot size
 * - Age: Within reasonable age range
 * - Condition: Similar condition category
 * - Transaction Recency: Within specified months (default 12)
 * - Building Features: Quality rating, floor level, view, parking
 */
router.post('/:id/comparables/search', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id: valuationId } = req.params;
    const {
      latitude,
      longitude,
      radiusKm = 5,
      propertyType,
      priceMin,
      priceMax,
      sizeMin,
      sizeMax,
      bedroomsMin,
      bedroomsMax,
      maxAgeMonths = 24,
      condition,
      qualityRating,
      excludeIds = [],
      includeContributed = true,
      limit = 20,
    } = req.body;

    // Get the subject property for context
    const valuationResult = await query(
      `SELECT v.*, p.*
       FROM valuations v
       LEFT JOIN properties p ON p.id = v.property_id
       WHERE v.id = $1`,
      [valuationId]
    );

    if (valuationResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    const subjectProperty = valuationResult.rows[0];

    // Use provided values or fall back to subject property
    let searchLat = latitude || subjectProperty.latitude;
    let searchLng = longitude || subjectProperty.longitude;
    
    // If still no coordinates but we have a digital address, geocode it
    if ((!searchLat || !searchLng) && subjectProperty.digital_address) {
      logger.info('Geocoding digital address for comparables search', {
        digitalAddress: subjectProperty.digital_address,
        valuationId,
      });
      
      try {
        const geocodeResult = await ghanaPostService.geocodeDigitalAddress(subjectProperty.digital_address);
        if (geocodeResult) {
          searchLat = geocodeResult.latitude;
          searchLng = geocodeResult.longitude;
          
          // Update the property with the geocoded coordinates for future use
          await query(
            `UPDATE properties SET latitude = $1, longitude = $2 WHERE id = $3`,
            [searchLat, searchLng, subjectProperty.property_id]
          );
          
          logger.info('Successfully geocoded and updated property coordinates', {
            digitalAddress: subjectProperty.digital_address,
            latitude: searchLat,
            longitude: searchLng,
          });
        }
      } catch (geocodeError) {
        logger.warn('Failed to geocode digital address', {
          digitalAddress: subjectProperty.digital_address,
          error: geocodeError instanceof Error ? geocodeError.message : 'Unknown error',
        });
      }
    }
    
    const searchPropertyType = propertyType || subjectProperty.property_type;
    const subjectSize = subjectProperty.built_area_sqm || subjectProperty.plot_size || 200;
    const searchSizeMin = sizeMin ?? subjectSize * 0.7;
    const searchSizeMax = sizeMax ?? subjectSize * 1.3;

    // Build RICS-compliant comparable search query
    // Includes: location proximity, property type, size range, age, condition, building features
    // Evidence Types: 'listing' (active), 'delisted_inferred' (probable sale), 
    //                 'verified_sale' (confirmed), 'contributed' (user-submitted)
    // Currency conversion: All prices converted to GHS for uniform comparison
    let searchQuery = `
      WITH fx_rate AS (
        -- Get latest USD/GHS exchange rate
        SELECT COALESCE(
          (SELECT value FROM economic_indicators 
           WHERE indicator_type = 'exchange_rate_usd' 
           ORDER BY effective_date DESC LIMIT 1),
          15.5  -- Fallback rate if no data
        ) AS usd_to_ghs
      )
      SELECT 
        p.id,
        p.reference_number,
        p.title,
        p.address_street,
        p.address_city,
        p.address_district AS neighborhood,
        p.region,
        p.latitude,
        p.longitude,
        p.property_type,
        p.bedrooms,
        p.bathrooms,
        p.built_area_sqm AS gfa,
        p.total_area_sqm AS plot_size,
        p.year_built,
        p.condition,
        p.floors,
        p.amenities,
        -- Original price fields
        p.price AS price_original,
        p.price_currency,
        -- Currency-normalized prices in GHS for uniform comparison
        CASE 
          WHEN p.price_currency = 'USD' THEN p.price * fx.usd_to_ghs
          ELSE p.price  -- Already in GHS or other (treat as GHS)
        END AS asking_price_ghs,
        CASE 
          WHEN p.price_currency = 'USD' THEN COALESCE(p.inferred_sale_price, p.price) * fx.usd_to_ghs
          ELSE COALESCE(p.inferred_sale_price, p.price)
        END AS sale_price,
        -- Keep original asking_price for reference
        p.price AS asking_price,
        -- Exchange rate used for conversion
        fx.usd_to_ghs AS fx_rate_used,
        -- For delisted properties, use delisted_at as sale_date; otherwise use last_seen/created
        COALESCE(p.delisted_at, p.last_seen_at, p.created_at) AS sale_date,
        p.transaction_type AS listing_type,
        p.data_source,
        p.created_at,
        -- Evidence quality fields for RICS/GhIS compliance
        COALESCE(p.evidence_type, 'listing') AS evidence_type,
        p.is_delisted,
        p.first_seen_at,
        p.last_seen_at,
        p.delisted_at,
        p.inferred_sale_price,
        -- Evidence quality weight: verified > delisted > contributed > listing
        CASE 
          WHEN p.evidence_type = 'verified_sale' THEN 1.0
          WHEN p.evidence_type = 'delisted_inferred' THEN 0.85
          WHEN p.evidence_type = 'contributed' THEN 0.75
          ELSE 0.6  -- listing (asking price)
        END AS evidence_weight,
        -- Calculate distance using Haversine formula (in km)
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(p.latitude))
            ))
          )
        ) AS distance_km,
        -- Calculate similarity score
        CASE 
          WHEN p.property_type::text = $3::text THEN 30 ELSE 10 
        END +
        CASE 
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.15 THEN 25
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.30 THEN 15
          ELSE 5
        END +
        CASE 
          WHEN p.bedrooms = $5 THEN 15
          WHEN ABS(COALESCE(p.bedrooms, 0) - $5) <= 1 THEN 10
          ELSE 5
        END +
        CASE 
          WHEN p.created_at >= NOW() - INTERVAL '6 months' THEN 20
          WHEN p.created_at >= NOW() - INTERVAL '12 months' THEN 15
          ELSE 5
        END +
        CASE 
          WHEN p.condition::text = $6 THEN 10
          ELSE 5
        END AS similarity_score
      FROM properties p
      CROSS JOIN fx_rate fx
      WHERE p.id != COALESCE($7::uuid, p.id)
        AND p.latitude IS NOT NULL 
        AND p.longitude IS NOT NULL
        AND (p.price IS NOT NULL OR p.inferred_sale_price IS NOT NULL)
        AND COALESCE(p.inferred_sale_price, p.price) > 0
        -- Location filter: within radius
        AND (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(p.latitude))
            ))
          )
        ) <= $8
        -- Property type filter
        AND ($3::text IS NULL OR p.property_type::text = $3::text)
        -- Size filter (±30% by default) - also include properties with unknown size
        AND (
          $9::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) >= $9
        )
        AND (
          $10::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) <= $10
        )
        -- Transaction recency filter
        AND (p.created_at >= NOW() - ($11::text || ' months')::interval)
        -- Exclude already selected comparables
        AND p.id != ALL($12::uuid[])
    `;

    // Add optional filters
    const params: any[] = [
      searchLat,                           // $1
      searchLng,                           // $2
      searchPropertyType,                  // $3
      subjectSize,                         // $4
      subjectProperty.bedrooms || 3,       // $5
      subjectProperty.condition || 'good', // $6
      subjectProperty.id,                  // $7 (exclude subject property)
      radiusKm,                            // $8
      searchSizeMin,                       // $9
      searchSizeMax,                       // $10
      maxAgeMonths,                        // $11
      excludeIds.length > 0 ? excludeIds : ['00000000-0000-0000-0000-000000000000'], // $12
    ];

    // Add price filters if provided
    if (priceMin !== undefined) {
      params.push(priceMin);
      searchQuery += ` AND p.price >= $${params.length}`;
    }
    if (priceMax !== undefined) {
      params.push(priceMax);
      searchQuery += ` AND p.price <= $${params.length}`;
    }

    // Add bedroom filters if provided
    if (bedroomsMin !== undefined) {
      params.push(bedroomsMin);
      searchQuery += ` AND p.bedrooms >= $${params.length}`;
    }
    if (bedroomsMax !== undefined) {
      params.push(bedroomsMax);
      searchQuery += ` AND p.bedrooms <= $${params.length}`;
    }

    // Add condition filter if provided
    if (condition) {
      params.push(condition);
      searchQuery += ` AND p.condition = $${params.length}`;
    }

    // Add quality rating filter if provided
    if (qualityRating) {
      params.push(qualityRating);
      searchQuery += ` AND p.quality_rating = $${params.length}`;
    }

    // Order by similarity score and distance, limit results
    searchQuery += `
      ORDER BY similarity_score DESC, distance_km ASC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await query(searchQuery, params);

    // Calculate gap analysis
    const comparablesFound = result.rows.length;
    const minRequired = 3; // RICS minimum for reliable valuation
    const hasGap = comparablesFound < minRequired;
    const gapSeverity = comparablesFound === 0 ? 'severe' : comparablesFound < 3 ? 'moderate' : comparablesFound < 5 ? 'minor' : 'none';

    // Calculate aggregate statistics for the UI
    const aggregates = comparablesFound > 0 ? {
      avgPrice: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.sale_price || 0), 0) / comparablesFound),
      avgPricePerSqm: Math.round(result.rows.reduce((sum: number, r: any) => {
        const price = r.sale_price || 0;
        const area = r.gfa || r.plot_size || 1;
        return sum + (price / area);
      }, 0) / comparablesFound),
      avgDistance: Math.round((result.rows.reduce((sum: number, r: any) => sum + (r.distance_km || 0), 0) / comparablesFound) * 10) / 10,
      avgSimilarity: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.similarity_score || 0), 0) / comparablesFound),
      minPrice: Math.min(...result.rows.map((r: any) => r.sale_price || 0)),
      maxPrice: Math.max(...result.rows.map((r: any) => r.sale_price || 0)),
      minPricePerSqm: Math.round(Math.min(...result.rows.map((r: any) => (r.sale_price || 0) / (r.gfa || r.plot_size || 1)))),
      maxPricePerSqm: Math.round(Math.max(...result.rows.map((r: any) => (r.sale_price || 0) / (r.gfa || r.plot_size || 1)))),
      // Evidence quality breakdown per RICS guidance
      evidenceQuality: {
        verifiedSales: result.rows.filter((r: any) => r.evidence_type === 'verified_sale').length,
        delistedInferred: result.rows.filter((r: any) => r.evidence_type === 'delisted_inferred').length,
        contributed: result.rows.filter((r: any) => r.evidence_type === 'contributed').length,
        activeListings: result.rows.filter((r: any) => r.evidence_type === 'listing').length,
        // Average evidence weight (1.0 = all verified, 0.6 = all listings)
        avgWeight: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.evidence_weight || 0.6), 0) / comparablesFound * 100) / 100,
        // RICS compliance: prefer verified/delisted over listing prices
        qualityRating: (() => {
          const verified = result.rows.filter((r: any) => r.evidence_type === 'verified_sale').length;
          const delisted = result.rows.filter((r: any) => r.evidence_type === 'delisted_inferred').length;
          const transactionBased = verified + delisted;
          const ratio = transactionBased / comparablesFound;
          if (ratio >= 0.75) return 'excellent';
          if (ratio >= 0.50) return 'good';
          if (ratio >= 0.25) return 'fair';
          return 'limited';
        })(),
      },
    } : null;

    res.json({
      success: true,
      data: result.rows,
      meta: {
        valuationId,
        searchCriteria: {
          latitude: searchLat,
          longitude: searchLng,
          radiusKm,
          propertyType: searchPropertyType,
          sizeRange: { min: searchSizeMin, max: searchSizeMax },
          maxAgeMonths,
        },
        count: comparablesFound,
        hasGap,
        gapSeverity,
        aggregates,
        // Currency conversion info
        currencyConversion: {
          targetCurrency: 'GHS',
          fxRateUsed: result.rows[0]?.fx_rate_used || 15.5,
          fxRateDate: new Date().toISOString().split('T')[0],
          usdCount: result.rows.filter((r: any) => r.price_currency === 'USD').length,
          ghsCount: result.rows.filter((r: any) => r.price_currency === 'GHS').length,
          note: 'All prices converted to GHS for uniform comparison'
        },
        gapAnalysis: hasGap ? {
          required: minRequired,
          found: comparablesFound,
          shortfall: minRequired - comparablesFound,
          message: `Found ${comparablesFound} comparable${comparablesFound === 1 ? '' : 's'}, need at least ${minRequired} for reliable valuation`,
          contributionPrompt: {
            type: 'comparable',
            title: 'Help Improve Valuations in This Area',
            description: `We need more comparable sales data for ${subjectProperty.neighborhood || subjectProperty.address_city || 'this area'}. Contribute property data to earn credits.`,
            rewardCredits: 50 + (minRequired - comparablesFound) * 25,
            searchCriteria: {
              region: subjectProperty.region,
              propertyType: searchPropertyType,
              minArea: searchSizeMin,
              maxArea: searchSizeMax,
              radiusKm,
            },
          },
        } : null,
      },
    });

  } catch (error: any) {
    logger.error('Failed to search comparables', {
      valuationId: req.params.id,
      error: error.message,
      stack: error.stack,
      detail: error.detail || 'No detail',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to search for comparables',
      detail: error.message,
    });
  }
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

/**
 * @route GET /api/valuations/market/:region
 * @desc Get market conditions for a region
 * @access Private
 */
router.get('/market/:region', async (req: Request, res: Response) => {
  try {
    const { region } = req.params;
    const propertyType = req.query.propertyType as string || 'house';

    // Validate region
    const validRegions: RegionCode[] = [
      'greater_accra',
      'kumasi_metro',
      'eastern',
      'western_cluster',
      'northern_cluster',
    ];

    if (!validRegions.includes(region as RegionCode)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid region. Valid options: ${validRegions.join(', ')}`,
      });
    }

    // Call Python service for market conditions
    const conditions = await pythonClient.getMarketConditions({
      region: region as string,
      property_type: propertyType,
    });

    res.json({
      success: true,
      data: conditions.success ? conditions.conditions : null,
      meta: {
        region,
        propertyType,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    logger.error('Failed to get market conditions', {
      region: req.params.region,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve market conditions',
    });
  }
});

/**
 * @route GET /api/valuations/market/:region/indices
 * @desc Get market index history for a region
 * @access Private
 */
router.get('/market/:region/indices', async (req: Request, res: Response) => {
  try {
    const { region } = req.params;
    const propertyType = req.query.propertyType as string || 'house';
    const months = parseInt(req.query.months as string) || 24;

    // Query database for market index history
    // Table is valuation_market_indices (from migration 014)
    const result = await query(`
      SELECT 
        id, region, property_type, index_type, 
        index_value, base_value, base_period, current_period,
        created_at
      FROM valuation_market_indices
      WHERE region = $1 
        AND (property_type = $2 OR property_type IS NULL)
        AND current_period >= NOW() - INTERVAL '${months} months'
      ORDER BY current_period DESC
    `, [region, propertyType]);

    const indices = result.rows;

    res.json({
      success: true,
      data: indices,
      meta: {
        region,
        propertyType,
        months,
        count: indices.length,
      },
    });

  } catch (error: any) {
    logger.error('Failed to get market indices', {
      region: req.params.region,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve market indices',
    });
  }
});

/**
 * @route POST /api/valuations/quick
 * @desc Quick valuation (Sales Comparison only)
 * @access Private
 */
router.post('/quick', validateValuationRequest, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { property, property_id } = req.body;
    const propId = property_id || property?.id;

    // Build input for quick valuation
    const input: CreateValuationInput = {
      property_id: propId,
      valuation_type: 'avm',
      valuation_purpose: 'internal',
    };

    // Force only sales comparison method
    const options: ValuationOptions = {
      methods: ['sales_comparison'],
      valuation_purpose: 'internal',
    };

    const result = await valuationEngineService.createValuation(input, options);

    const duration = Date.now() - startTime;

    res.status(200).json({
      success: true,
      data: {
        estimated_value: result.estimated_value,
        confidence: result.confidence_score,
        value_range: result.value_range_low && result.value_range_high 
          ? { low: result.value_range_low, high: result.value_range_high }
          : null,
      },
      meta: {
        duration_ms: duration,
        type: 'quick_estimate',
      },
    });

  } catch (error: any) {
    logger.error('Quick valuation failed', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create quick valuation',
    });
  }
});

/**
 * @route POST /api/valuations/batch
 * @desc Create valuations for multiple properties
 * @access Private
 */
router.post('/batch', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { properties, property_ids, options = {} } = req.body;

    // Accept either array of property objects or array of property IDs
    const items = properties || property_ids?.map((id: string) => ({ id }));

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Properties array or property_ids array is required and must not be empty',
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Maximum 50 properties per batch',
      });
    }

    const results = [];
    const errors = [];

    for (const property of items) {
      try {
        const input: CreateValuationInput = {
          property_id: property.id,
          valuation_type: 'avm',
          valuation_purpose: 'sale',
        };
        const result = await valuationEngineService.createValuation(input, options);
        results.push({
          propertyId: property.id,
          valuationId: result.id,
          value: result.estimated_value,
          confidence: result.confidence_score,
        });
      } catch (error: any) {
        errors.push({
          propertyId: property.id,
          error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    res.status(200).json({
      success: true,
      data: {
        completed: results,
        failed: errors,
      },
      meta: {
        total: properties.length,
        successful: results.length,
        failed: errors.length,
        duration_ms: duration,
      },
    });

  } catch (error: any) {
    logger.error('Batch valuation failed', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process batch valuations',
    });
  }
});

// =====================================================
// FLOOR PLAN ROUTES
// =====================================================

import { floorPlanService } from '../services/valuation-engine/floorPlanService';

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
// HBU ANALYSIS ROUTES
// =====================================================

import { hbuAnalysisService } from '../services/valuation-engine/hbuAnalysisService';

/**
 * GET /api/valuations/:id/hbu
 * Get HBU analysis for a valuation
 */
router.get('/:id/hbu', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const hbu = await hbuAnalysisService.getOrCreate(req.params.id, (req as any).user?.id);
    res.json({ success: true, data: hbu });
  } catch (error: any) {
    logger.error('Failed to get HBU analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to get HBU analysis' });
  }
});

/**
 * POST /api/valuations/:id/hbu
 * Create or update HBU analysis for a valuation
 */
router.post('/:id/hbu', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const valuationId = req.params.id;
    const { 
      legallyPermissible, 
      physicallyPossible, 
      financiallyFeasible, 
      maximallyProductive,
      recommendedUse,
      analysisNotes,
      tests,
      scenarios 
    } = req.body;

    // Get or create HBU analysis
    const hbu = await hbuAnalysisService.getOrCreate(valuationId, (req as any).user?.id);
    
    // Update all test results
    const updatedHbu = await hbuAnalysisService.updateAllTests(hbu.id, {
      legal_test_passed: legallyPermissible,
      physical_test_passed: physicallyPossible,
      financial_test_passed: financiallyFeasible,
      productive_test_passed: maximallyProductive,
      recommended_use: recommendedUse,
      analysis_notes: analysisNotes,
      legal_analysis: tests?.find((t: any) => t.id === 'legally_permissible') || {},
      physical_analysis: tests?.find((t: any) => t.id === 'physically_possible') || {},
      financial_analysis: tests?.find((t: any) => t.id === 'financially_feasible') || {},
      productive_analysis: tests?.find((t: any) => t.id === 'maximally_productive') || {},
      alternative_uses: scenarios || [],
    });

    res.json({ success: true, data: updatedHbu || hbu });
  } catch (error: any) {
    logger.error('Failed to create/update HBU analysis', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to create HBU analysis', message: error.message });
  }
});

/**
 * PUT /api/valuations/hbu/:hbuId/legal
 * Update legal analysis
 */
router.put('/hbu/:hbuId/legal', async (req: Request, res: Response) => {
  try {
    const { legal_analysis, legal_test_passed } = req.body;
    const hbu = await hbuAnalysisService.updateLegalAnalysis(req.params.hbuId, {
      legal_analysis,
      legal_test_passed
    });

    if (!hbu) {
      return res.status(404).json({ error: 'HBU analysis not found' });
    }

    res.json({ success: true, data: hbu });
  } catch (error: any) {
    logger.error('Failed to update legal analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to update legal analysis', message: error.message });
  }
});

/**
 * PUT /api/valuations/hbu/:hbuId/physical
 * Update physical analysis
 */
router.put('/hbu/:hbuId/physical', async (req: Request, res: Response) => {
  try {
    const { physical_analysis, physical_test_passed } = req.body;
    const hbu = await hbuAnalysisService.updatePhysicalAnalysis(req.params.hbuId, {
      physical_analysis,
      physical_test_passed
    });

    if (!hbu) {
      return res.status(404).json({ error: 'HBU analysis not found' });
    }

    res.json({ success: true, data: hbu });
  } catch (error: any) {
    logger.error('Failed to update physical analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to update physical analysis', message: error.message });
  }
});

/**
 * PUT /api/valuations/hbu/:hbuId/financial
 * Update financial analysis
 */
router.put('/hbu/:hbuId/financial', async (req: Request, res: Response) => {
  try {
    const { financial_analysis, financial_test_passed } = req.body;
    const hbu = await hbuAnalysisService.updateFinancialAnalysis(req.params.hbuId, {
      financial_analysis,
      financial_test_passed
    });

    if (!hbu) {
      return res.status(404).json({ error: 'HBU analysis not found' });
    }

    res.json({ success: true, data: hbu });
  } catch (error: any) {
    logger.error('Failed to update financial analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to update financial analysis', message: error.message });
  }
});

/**
 * PUT /api/valuations/hbu/:hbuId/productivity
 * Update productivity analysis
 */
router.put('/hbu/:hbuId/productivity', async (req: Request, res: Response) => {
  try {
    const { productivity_analysis, productivity_test_passed } = req.body;
    const hbu = await hbuAnalysisService.updateProductivityAnalysis(req.params.hbuId, {
      productivity_analysis,
      productivity_test_passed
    });

    if (!hbu) {
      return res.status(404).json({ error: 'HBU analysis not found' });
    }

    res.json({ success: true, data: hbu });
  } catch (error: any) {
    logger.error('Failed to update productivity analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to update productivity analysis', message: error.message });
  }
});

/**
 * POST /api/valuations/hbu/:hbuId/finalize
 * Finalize HBU analysis with conclusion
 */
router.post('/hbu/:hbuId/finalize', async (req: Request, res: Response) => {
  try {
    const { hbu_conclusion, hbu_justification, recommended_methods, method_justifications, hbu_as_vacant, hbu_as_improved } = req.body;
    
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hbu = await hbuAnalysisService.finalize(req.params.hbuId, {
      hbu_conclusion,
      hbu_justification,
      recommended_methods,
      method_justifications,
      hbu_as_vacant,
      hbu_as_improved,
      completed_by: userId
    });

    if (!hbu) {
      return res.status(404).json({ error: 'HBU analysis not found' });
    }

    res.json({ success: true, data: hbu });
  } catch (error: any) {
    logger.error('Failed to finalize HBU analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to finalize HBU analysis', message: error.message });
  }
});

// =====================================================
// OVERRIDE TRACKING ROUTES
// =====================================================

import { overrideTrackingService } from '../services/valuation-engine/overrideTrackingService';

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
// COMPARABLE BASKET ROUTES (Frontend-compatible endpoints)
// =====================================================

/**
 * GET /api/valuations/:id/comparables/basket
 * Get comparable basket for a valuation (frontend-compatible)
 */
router.get('/:id/comparables/basket', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM valuation_comparable_baskets 
       WHERE valuation_id = $1 AND is_primary = true
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }
    
    // Get comparables in the basket
    const basketId = result.rows[0].id;
    const comparablesResult = await query(
      `SELECT vc.*, p.* 
       FROM valuation_comparables vc
       LEFT JOIN properties p ON vc.comparable_property_id = p.id
       WHERE vc.basket_id = $1
       ORDER BY vc.similarity_score DESC`,
      [basketId]
    );
    
    res.json({ 
      success: true, 
      data: {
        ...result.rows[0],
        comparables: comparablesResult.rows
      }
    });
  } catch (error: any) {
    logger.error('Failed to get basket', { error: error.message });
    res.status(500).json({ error: 'Failed to get basket' });
  }
});

/**
 * POST /api/valuations/:id/comparables/basket
 * Save comparable basket for a valuation (frontend-compatible)
 */
router.post('/:id/comparables/basket', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { comparables, indicatedValue, avgPricePerSqm } = req.body;
    const valuationId = req.params.id;
    
    // Create or update primary basket
    const basketResult = await query(
      `INSERT INTO valuation_comparable_baskets 
        (valuation_id, basket_name, is_primary, indicated_value, avg_price_per_sqm, created_by, created_at)
       VALUES ($1, 'Primary Basket', true, $2, $3, $4, NOW())
       ON CONFLICT (valuation_id, basket_name) 
       DO UPDATE SET indicated_value = $2, avg_price_per_sqm = $3, updated_at = NOW()
       RETURNING *`,
      [valuationId, indicatedValue, avgPricePerSqm, (req as any).user?.id]
    );
    
    const basketId = basketResult.rows[0]?.id;
    
    // Clear existing comparables and add new ones
    if (basketId && comparables && comparables.length > 0) {
      await query('DELETE FROM valuation_comparables WHERE basket_id = $1', [basketId]);
      
      for (const comp of comparables) {
        await query(
          `INSERT INTO valuation_comparables 
            (valuation_id, basket_id, comparable_property_id, similarity_score, adjustments, adjusted_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [valuationId, basketId, comp.property_id || comp.id, comp.similarity_score || 80, 
           JSON.stringify(comp.adjustments || {}), comp.adjusted_price || comp.price]
        );
      }
    }
    
    res.json({ success: true, data: basketResult.rows[0] });
  } catch (error: any) {
    logger.error('Failed to save basket', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to save basket', message: error.message });
  }
});

// =====================================================
// COMPARABLE BASKET ROUTES (Legacy endpoints)
// These routes manage comparable property baskets for valuations.
// Basket data is stored in the database and calculations use Python service.
// =====================================================

/**
 * GET /api/valuations/:id/baskets
 * Get all comparable baskets for a valuation
 */
router.get('/:id/baskets', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM valuation_comparable_baskets WHERE valuation_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    logger.error('Failed to get baskets', { error: error.message });
    res.status(500).json({ error: 'Failed to get baskets' });
  }
});

/**
 * POST /api/valuations/:id/baskets
 * Create a new comparable basket
 */
router.post('/:id/baskets', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { basket_name, is_primary, search_criteria } = req.body;
    const result = await query(
      `INSERT INTO valuation_comparable_baskets 
        (valuation_id, basket_name, is_primary, search_criteria, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *`,
      [req.params.id, basket_name, is_primary || false, search_criteria, (req as any).user?.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create basket', { error: error.message });
    res.status(500).json({ error: 'Failed to create basket', message: error.message });
  }
});

/**
 * GET /api/valuations/baskets/:basketId/comparables
 * Get comparables in a basket
 */
router.get('/baskets/:basketId/comparables', async (req: Request, res: Response) => {
  try {
    const includeExcluded = req.query.include_excluded === 'true';
    const whereClause = includeExcluded ? '' : 'AND is_excluded = false';
    const result = await query(
      `SELECT * FROM basket_comparables 
       WHERE basket_id = $1 ${whereClause}
       ORDER BY weight DESC, added_at`,
      [req.params.basketId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    logger.error('Failed to get comparables', { error: error.message });
    res.status(500).json({ error: 'Failed to get comparables' });
  }
});

/**
 * POST /api/valuations/baskets/:basketId/comparables
 * Add comparable to basket
 */
router.post('/baskets/:basketId/comparables', async (req: Request, res: Response) => {
  try {
    const { comparable_property_id, is_manual_entry, manual_data, weight, tags } = req.body;
    const result = await query(
      `INSERT INTO basket_comparables 
        (basket_id, comparable_property_id, is_manual_entry, manual_data, weight, tags, added_by, added_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [req.params.basketId, comparable_property_id, is_manual_entry || false, manual_data, weight || 1.0, tags, (req as any).user?.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to add comparable', { error: error.message });
    res.status(500).json({ error: 'Failed to add comparable', message: error.message });
  }
});

/**
 * PUT /api/valuations/comparables/:comparableId
 * Update a comparable
 */
router.put('/comparables/:comparableId', async (req: Request, res: Response) => {
  try {
    const { weight, is_weight_manual, weight_justification, is_excluded, exclusion_reason, adjusted_sale_price, adjustments_summary } = req.body;
    const result = await query(
      `UPDATE basket_comparables SET
        weight = COALESCE($1, weight),
        is_weight_manual = COALESCE($2, is_weight_manual),
        weight_justification = COALESCE($3, weight_justification),
        is_excluded = COALESCE($4, is_excluded),
        exclusion_reason = COALESCE($5, exclusion_reason),
        adjusted_sale_price = COALESCE($6, adjusted_sale_price),
        adjustments_summary = COALESCE($7, adjustments_summary),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *`,
      [weight, is_weight_manual, weight_justification, is_excluded, exclusion_reason, adjusted_sale_price, adjustments_summary, req.params.comparableId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comparable not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to update comparable', { error: error.message });
    res.status(500).json({ error: 'Failed to update comparable', message: error.message });
  }
});

/**
 * GET /api/valuations/baskets/:basketId/statistics
 * Get basket statistics
 */
router.get('/baskets/:basketId/statistics', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT 
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE is_excluded = false) as active_count,
        AVG(adjusted_sale_price) FILTER (WHERE is_excluded = false) as avg_price,
        MIN(adjusted_sale_price) FILTER (WHERE is_excluded = false) as min_price,
        MAX(adjusted_sale_price) FILTER (WHERE is_excluded = false) as max_price,
        STDDEV(adjusted_sale_price) FILTER (WHERE is_excluded = false) as stddev_price
      FROM basket_comparables WHERE basket_id = $1`,
      [req.params.basketId]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to get basket statistics', { error: error.message });
    res.status(500).json({ error: 'Failed to get basket statistics' });
  }
});

/**
 * POST /api/valuations/baskets/:basketId/normalize-weights
 * Normalize basket weights to sum to 1.0
 */
router.post('/baskets/:basketId/normalize-weights', async (req: Request, res: Response) => {
  try {
    // Calculate total weight
    const totalResult = await query(
      'SELECT SUM(weight) as total_weight FROM basket_comparables WHERE basket_id = $1 AND is_excluded = false',
      [req.params.basketId]
    );
    const totalWeight = parseFloat(totalResult.rows[0]?.total_weight) || 1;
    
    // Normalize all weights
    await query(
      `UPDATE basket_comparables 
       SET weight = weight / $1, is_weight_manual = false
       WHERE basket_id = $2 AND is_excluded = false`,
      [totalWeight, req.params.basketId]
    );
    
    // Fetch updated comparables
    const result = await query(
      'SELECT * FROM basket_comparables WHERE basket_id = $1 AND is_excluded = false ORDER BY weight DESC',
      [req.params.basketId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    logger.error('Failed to normalize weights', { error: error.message });
    res.status(500).json({ error: 'Failed to normalize weights', message: error.message });
  }
});

// =====================================================
// SENSITIVITY ANALYSIS ROUTES
// Uses Python valuation service for calculations
// =====================================================

/**
 * GET /api/valuations/:id/sensitivity
 * Get all sensitivity analyses for a valuation
 */
router.get('/:id/sensitivity', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM sensitivity_analyses WHERE valuation_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    logger.error('Failed to get sensitivity analyses', { error: error.message });
    res.status(500).json({ error: 'Failed to get sensitivity analyses' });
  }
});

/**
 * POST /api/valuations/:id/sensitivity
 * Run sensitivity analysis via Python service
 */
router.post('/:id/sensitivity', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { property, base_value, variables, variation_range } = req.body;
    
    if (!property || !base_value) {
      return res.status(400).json({ error: 'property and base_value are required' });
    }

    // Call Python service for sensitivity analysis
    const pythonProperty = {
      id: property.id || req.params.id,
      property_type: property.property_type || 'residential',
      region: property.region || 'Greater Accra',
      land_area_sqm: property.land_area_sqm,
      building_size_sqm: property.building_size_sqm,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      year_built: property.year_built,
    };

    const sensitivityResult = await pythonClient.sensitivityAnalysis({
      property: pythonProperty,
      base_value,
      variables: variables || ['land_value', 'construction_cost', 'cap_rate'],
      variation_range: variation_range || 0.2,
    });

    // Store result in database
    const insertResult = await query(
      `INSERT INTO sensitivity_analyses 
        (valuation_id, analysis_type, base_value, sensitivity_results, created_by, created_at)
      VALUES ($1, 'multi_variable', $2, $3, $4, NOW())
      RETURNING *`,
      [req.params.id, base_value, sensitivityResult, (req as any).user?.id]
    );

    res.status(201).json({ success: true, data: { ...insertResult.rows[0], python_result: sensitivityResult } });
  } catch (error: any) {
    logger.error('Failed to run sensitivity analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to run sensitivity analysis', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/sensitivity/cap-rate
 * Quick cap rate sensitivity analysis
 */
router.post('/:id/sensitivity/cap-rate', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { noi, base_cap_rate } = req.body;
    
    if (!noi || !base_cap_rate) {
      return res.status(400).json({ error: 'noi and base_cap_rate are required' });
    }

    // Calculate cap rate sensitivity locally
    const baseValue = noi / base_cap_rate;
    const variations = [-0.02, -0.01, -0.005, 0, 0.005, 0.01, 0.02];
    const results = variations.map(v => ({
      cap_rate: base_cap_rate + v,
      value: noi / (base_cap_rate + v),
      change_pct: ((noi / (base_cap_rate + v)) - baseValue) / baseValue,
    }));

    // Store result
    const insertResult = await query(
      `INSERT INTO sensitivity_analyses 
        (valuation_id, analysis_type, base_value, sensitivity_results, created_by, created_at)
      VALUES ($1, 'cap_rate', $2, $3, $4, NOW())
      RETURNING *`,
      [req.params.id, baseValue, JSON.stringify({ noi, base_cap_rate, variations: results }), (req as any).user?.id]
    );

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (error: any) {
    logger.error('Failed to run cap rate sensitivity', { error: error.message });
    res.status(500).json({ error: 'Failed to run sensitivity analysis', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/sensitivity/tornado
 * Tornado diagram analysis for income approach
 */
router.post('/:id/sensitivity/tornado', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { gross_income, vacancy_rate, operating_expenses, cap_rate } = req.body;
    
    if (!gross_income || vacancy_rate === undefined || !operating_expenses || !cap_rate) {
      return res.status(400).json({ error: 'Missing required income approach inputs' });
    }

    // Calculate base NOI and value
    const effectiveGross = gross_income * (1 - vacancy_rate);
    const noi = effectiveGross - operating_expenses;
    const baseValue = noi / cap_rate;

    // Calculate tornado data for each variable
    const variationPct = 0.1; // 10% variation
    const tornadoData = [
      {
        variable: 'gross_income',
        low: ((gross_income * (1 - variationPct)) * (1 - vacancy_rate) - operating_expenses) / cap_rate,
        high: ((gross_income * (1 + variationPct)) * (1 - vacancy_rate) - operating_expenses) / cap_rate,
      },
      {
        variable: 'vacancy_rate',
        low: (gross_income * (1 - vacancy_rate * 0.5) - operating_expenses) / cap_rate,
        high: (gross_income * (1 - vacancy_rate * 1.5) - operating_expenses) / cap_rate,
      },
      {
        variable: 'operating_expenses',
        low: (effectiveGross - operating_expenses * (1 - variationPct)) / cap_rate,
        high: (effectiveGross - operating_expenses * (1 + variationPct)) / cap_rate,
      },
      {
        variable: 'cap_rate',
        low: noi / (cap_rate * 1.1),
        high: noi / (cap_rate * 0.9),
      },
    ].sort((a, b) => (b.high - b.low) - (a.high - a.low)); // Sort by impact

    // Store result
    const insertResult = await query(
      `INSERT INTO sensitivity_analyses 
        (valuation_id, analysis_type, base_value, sensitivity_results, created_by, created_at)
      VALUES ($1, 'tornado', $2, $3, $4, NOW())
      RETURNING *`,
      [req.params.id, baseValue, JSON.stringify({ base_value: baseValue, tornado_data: tornadoData }), (req as any).user?.id]
    );

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (error: any) {
    logger.error('Failed to run tornado analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to run tornado analysis', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/sensitivity/monte-carlo
 * Monte Carlo simulation for residual method
 */
router.post('/:id/sensitivity/monte-carlo', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { gdv, construction_cost, developer_profit_rate, finance_cost, iterations } = req.body;
    
    if (!gdv || !construction_cost || !developer_profit_rate) {
      return res.status(400).json({ error: 'Missing required residual method inputs' });
    }

    // Simple Monte Carlo simulation
    const numIterations = iterations || 1000;
    const results: number[] = [];
    
    for (let i = 0; i < numIterations; i++) {
      // Apply random variations (normal distribution approximation)
      const gdvVar = gdv * (1 + (Math.random() - 0.5) * 0.2);
      const costVar = construction_cost * (1 + (Math.random() - 0.5) * 0.15);
      const profitVar = developer_profit_rate * (1 + (Math.random() - 0.5) * 0.1);
      
      const landValue = gdvVar - costVar - (finance_cost || 0) - (gdvVar * profitVar);
      results.push(landValue);
    }
    
    results.sort((a, b) => a - b);
    
    const stats = {
      mean: results.reduce((a, b) => a + b, 0) / numIterations,
      median: results[Math.floor(numIterations / 2)],
      std_dev: Math.sqrt(results.reduce((sum, val) => sum + Math.pow(val - (results.reduce((a, b) => a + b, 0) / numIterations), 2), 0) / numIterations),
      p5: results[Math.floor(numIterations * 0.05)],
      p95: results[Math.floor(numIterations * 0.95)],
      min: results[0],
      max: results[numIterations - 1],
    };

    // Store result
    const insertResult = await query(
      `INSERT INTO sensitivity_analyses 
        (valuation_id, analysis_type, base_value, sensitivity_results, created_by, created_at)
      VALUES ($1, 'monte_carlo', $2, $3, $4, NOW())
      RETURNING *`,
      [req.params.id, stats.mean, JSON.stringify({ iterations: numIterations, statistics: stats }), (req as any).user?.id]
    );

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (error: any) {
    logger.error('Failed to run Monte Carlo simulation', { error: error.message });
    res.status(500).json({ error: 'Failed to run Monte Carlo simulation', message: error.message });
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
 * Create reconciliation with method results via Python service
 */
router.post('/:id/reconciliation', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { method_results, weighting_method, property_type, valuation_purpose } = req.body;
    
    if (!method_results || Object.keys(method_results).length === 0) {
      return res.status(400).json({ error: 'method_results is required' });
    }

    // Call Python reconciliation service
    const reconciliationResult = await pythonClient.reconcile({
      method_results,
      property_type: property_type || 'residential',
      valuation_purpose: valuation_purpose || 'sale',
    });

    // Store result in database
    const insertResult = await query(
      `INSERT INTO valuation_reconciliations 
        (valuation_id, method_results, weighting_method, reconciled_value, value_range_low, value_range_high, 
         method_weights, primary_method, confidence_score, reconciliation_notes, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *`,
      [
        req.params.id,
        JSON.stringify(method_results),
        weighting_method || 'auto',
        reconciliationResult.reconciled_value,
        reconciliationResult.value_range?.low,
        reconciliationResult.value_range?.high,
        JSON.stringify(reconciliationResult.method_weights),
        reconciliationResult.primary_method,
        reconciliationResult.confidence_score,
        JSON.stringify(reconciliationResult.reconciliation_notes),
        (req as any).user?.id
      ]
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

    const result = await query(
      `UPDATE valuation_reconciliations SET
        method_weights = $1,
        weight_justifications = $2,
        weighting_method = 'manual',
        updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
      [JSON.stringify(weights), JSON.stringify(justifications), req.params.reconciliationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation not found' });
    }

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
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

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

    res.json({ success: true, data: result.rows[0] });
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
  `- ${method.replace(/_/g, ' ').toUpperCase()}: GHS ${(data.estimated_value || 0).toLocaleString()}`
).join('\n')}

Primary Method: ${(reconciliation.primary_method || 'Not specified').replace(/_/g, ' ')}

Reconciled Value: GHS ${(reconciliation.reconciled_value || 0).toLocaleString()}
Value Range: GHS ${(reconciliation.value_range_low || 0).toLocaleString()} - GHS ${(reconciliation.value_range_high || 0).toLocaleString()}

Confidence Level: ${reconciliation.confidence_score >= 0.8 ? 'High' : reconciliation.confidence_score >= 0.6 ? 'Medium' : 'Low'}

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

/**
 * Update property information for a valuation
 * PUT /api/valuations/:id/property
 * @desc Update property details including owner information
 * @access Private
 */
router.put('/:id/property', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const propertyData = req.body;

    // Check if valuation exists and get property ID
    const valuation = await query(
      'SELECT property_id FROM valuations WHERE id = $1',
      [id]
    );
    
    if (valuation.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    const propertyId = valuation.rows[0].property_id;

    // Build dynamic update query for properties table
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Property fields that can be updated
    const allowedFields = [
      'address_street', 'address_city', 'address_district', 'digital_address',
      'property_type', 'title', 'description', 'bedrooms', 'bathrooms', 
      'land_area_sqm', 'year_built', 'owner_name', 'owner_email', 
      'owner_phone', 'owner_address', 'owner_contact_preference'
    ];

    // Handle field mapping from frontend to database
    const fieldMappings: Record<string, string> = {
      'address': 'address_street',
      'city': 'address_city',
      'land_area': 'land_area_sqm',
    };

    for (const [frontendField, value] of Object.entries(propertyData)) {
      if (value === undefined || value === null) continue;
      
      // Map frontend field names to database field names
      const dbField = fieldMappings[frontendField] || frontendField;
      
      if (allowedFields.includes(dbField)) {
        updates.push(`${dbField} = $${paramIndex}`);
        
        // Handle type conversions
        if (['bedrooms', 'bathrooms', 'year_built'].includes(dbField)) {
          values.push(value ? parseInt(String(value)) : null);
        } else if (['land_area_sqm'].includes(dbField)) {
          values.push(value ? parseFloat(String(value)) : null);
        } else {
          values.push(value);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update',
      });
    }

    // Add updated_at and property ID
    updates.push('updated_at = NOW()');
    values.push(propertyId);

    const updateQuery = `
      UPDATE properties 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Property not found',
      });
    }

    logger.info('Property updated successfully', { 
      valuationId: id, 
      propertyId, 
      fieldsUpdated: updates.length - 1 // Subtract 1 for updated_at
    });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Property updated successfully',
    });

  } catch (error: any) {
    logger.error('Failed to update property', { 
      valuationId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to update property information',
    });
  }
});

// =====================================================
// VALUATION METHOD INPUT ENDPOINTS
// These store user inputs for each valuation method
// =====================================================

/**
 * Get method inputs for a valuation
 * GET /api/v1/valuations/:id/:methodType
 * methodType: cost-approach, income-approach, drc-method, profits-method, residual-method
 */
router.get('/:id/cost-approach', validateUUID('id'), async (req: Request, res: Response) => {
  return getMethodInputs(req, res, 'cost_approach');
});

router.get('/:id/income-approach', validateUUID('id'), async (req: Request, res: Response) => {
  return getMethodInputs(req, res, 'income_approach');
});

router.get('/:id/drc-method', validateUUID('id'), async (req: Request, res: Response) => {
  return getMethodInputs(req, res, 'drc_method');
});

router.get('/:id/profits-method', validateUUID('id'), async (req: Request, res: Response) => {
  return getMethodInputs(req, res, 'profits_method');
});

router.get('/:id/residual-method', validateUUID('id'), async (req: Request, res: Response) => {
  return getMethodInputs(req, res, 'residual_method');
});

/**
 * Get sales comparison approach data for a valuation
 * GET /api/v1/valuations/:id/sales-comparison
 * 
 * Returns basket data, comparables, adjustments, and indicated value
 */
router.get('/:id/sales-comparison', validateUUID('id'), async (req: Request, res: Response) => {
  const valuationId = req.params.id;
  
  try {
    // Get the primary basket for this valuation
    const basketResult = await query(
      `SELECT * FROM valuation_comparable_baskets 
       WHERE valuation_id = $1 AND is_primary = true
       ORDER BY created_at DESC LIMIT 1`,
      [valuationId]
    );
    
    if (basketResult.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No sales comparison data for this valuation yet',
      });
    }
    
    const basket = basketResult.rows[0];
    
    // Get comparables with full property details and adjustments
    const comparablesResult = await query(
      `SELECT 
        vc.id AS comparable_id,
        vc.similarity_score,
        vc.adjustments,
        vc.adjusted_price,
        vc.weight,
        vc.notes,
        p.id,
        p.reference_number,
        p.title,
        p.address_street,
        p.address_city,
        p.address_district AS neighborhood,
        p.region,
        p.latitude,
        p.longitude,
        p.property_type,
        p.bedrooms,
        p.bathrooms,
        p.built_area_sqm AS gfa,
        p.total_area_sqm AS plot_size,
        p.year_built,
        p.condition,
        COALESCE(p.inferred_sale_price, p.price) AS sale_price,
        p.price AS asking_price,
        p.price_currency,
        COALESCE(p.delisted_at, p.last_seen_at, p.created_at) AS sale_date,
        COALESCE(p.evidence_type, 'listing') AS evidence_type,
        p.is_delisted,
        p.inferred_sale_price,
        CASE 
          WHEN p.evidence_type = 'verified_sale' THEN 1.0
          WHEN p.evidence_type = 'delisted_inferred' THEN 0.85
          WHEN p.evidence_type = 'contributed' THEN 0.75
          ELSE 0.6
        END AS evidence_weight
       FROM valuation_comparables vc
       LEFT JOIN properties p ON vc.comparable_property_id = p.id
       WHERE vc.basket_id = $1
       ORDER BY vc.weight DESC, vc.similarity_score DESC`,
      [basket.id]
    );
    
    // Get method inputs if saved
    const inputsResult = await query(
      `SELECT * FROM valuation_method_inputs 
       WHERE valuation_id = $1 AND method_type = 'sales_comparison'`,
      [valuationId]
    );
    
    const methodInputs = inputsResult.rows.length > 0 ? inputsResult.rows[0] : null;
    
    // Calculate evidence quality summary
    const comparables = comparablesResult.rows;
    const evidenceQuality = comparables.length > 0 ? {
      verifiedSales: comparables.filter((c: any) => c.evidence_type === 'verified_sale').length,
      delistedInferred: comparables.filter((c: any) => c.evidence_type === 'delisted_inferred').length,
      contributed: comparables.filter((c: any) => c.evidence_type === 'contributed').length,
      activeListings: comparables.filter((c: any) => c.evidence_type === 'listing').length,
      avgWeight: comparables.reduce((sum: number, c: any) => sum + (c.evidence_weight || 0.6), 0) / comparables.length,
      qualityRating: (() => {
        const verified = comparables.filter((c: any) => c.evidence_type === 'verified_sale').length;
        const delisted = comparables.filter((c: any) => c.evidence_type === 'delisted_inferred').length;
        const transactionBased = verified + delisted;
        const ratio = transactionBased / comparables.length;
        if (ratio >= 0.75) return 'excellent';
        if (ratio >= 0.50) return 'good';
        if (ratio >= 0.25) return 'fair';
        return 'limited';
      })(),
    } : null;
    
    res.json({
      success: true,
      data: {
        basket: {
          id: basket.id,
          basket_name: basket.basket_name,
          indicated_value: basket.indicated_value,
          avg_price_per_sqm: basket.avg_price_per_sqm,
          created_at: basket.created_at,
          updated_at: basket.updated_at,
        },
        comparables: comparables,
        comparables_count: comparables.length,
        method_inputs: methodInputs ? {
          ...methodInputs.inputs,
          calculated_value: methodInputs.calculated_value,
          confidence_score: methodInputs.confidence_score,
        } : null,
        evidence_quality: evidenceQuality,
        // RICS compliance indicators
        rics_compliance: {
          minimum_comparables_met: comparables.length >= 3,
          has_transaction_evidence: comparables.some((c: any) => 
            c.evidence_type === 'verified_sale' || c.evidence_type === 'delisted_inferred'
          ),
          evidence_quality_rating: evidenceQuality?.qualityRating || 'unknown',
          requires_disclosure: evidenceQuality?.qualityRating === 'limited' || comparables.length < 3,
        },
      },
    });
  } catch (error: any) {
    logger.error('Failed to get sales comparison data', { valuationId, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get sales comparison data',
      message: error.message,
    });
  }
});

/**
 * Save method inputs for a valuation
 * POST /api/v1/valuations/:id/:methodType
 */
router.post('/:id/cost-approach', validateUUID('id'), async (req: Request, res: Response) => {
  return saveMethodInputs(req, res, 'cost_approach');
});

router.post('/:id/income-approach', validateUUID('id'), async (req: Request, res: Response) => {
  return saveMethodInputs(req, res, 'income_approach');
});

router.post('/:id/drc-method', validateUUID('id'), async (req: Request, res: Response) => {
  return saveMethodInputs(req, res, 'drc_method');
});

router.post('/:id/profits-method', validateUUID('id'), async (req: Request, res: Response) => {
  return saveMethodInputs(req, res, 'profits_method');
});

router.post('/:id/residual-method', validateUUID('id'), async (req: Request, res: Response) => {
  return saveMethodInputs(req, res, 'residual_method');
});

/**
 * Save sales comparison approach data for a valuation
 * POST /api/v1/valuations/:id/sales-comparison
 * 
 * Saves basket, comparables, adjustments, and calculates indicated value
 */
router.post('/:id/sales-comparison', validateUUID('id'), async (req: Request, res: Response) => {
  const valuationId = req.params.id;
  const userId = (req as any).user?.id;
  
  try {
    const {
      comparables,
      adjustments,
      indicated_value,
      avg_price_per_sqm,
      reconciliation_notes,
      weighting_rationale,
    } = req.body;
    
    // Validate minimum comparables for RICS compliance
    if (!comparables || comparables.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'RICS compliance requires at least 3 comparables',
        message: 'Please select at least 3 comparable properties',
      });
    }
    
    // Create or update primary basket
    const basketResult = await query(
      `INSERT INTO valuation_comparable_baskets 
        (valuation_id, basket_name, is_primary, indicated_value, avg_price_per_sqm, created_by, created_at)
       VALUES ($1, 'Primary Basket', true, $2, $3, $4, NOW())
       ON CONFLICT (valuation_id, basket_name) 
       DO UPDATE SET 
         indicated_value = EXCLUDED.indicated_value, 
         avg_price_per_sqm = EXCLUDED.avg_price_per_sqm, 
         updated_at = NOW()
       RETURNING *`,
      [valuationId, indicated_value, avg_price_per_sqm, userId]
    );
    
    const basketId = basketResult.rows[0]?.id;
    
    // Clear existing comparables
    await query('DELETE FROM valuation_comparables WHERE basket_id = $1', [basketId]);
    
    // Insert new comparables with adjustments
    for (const comp of comparables) {
      await query(
        `INSERT INTO valuation_comparables 
          (valuation_id, basket_id, comparable_property_id, similarity_score, 
           adjustments, adjusted_price, weight, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          valuationId,
          basketId,
          comp.property_id || comp.id,
          comp.similarity_score || 80,
          JSON.stringify(comp.adjustments || {}),
          comp.adjusted_price || comp.sale_price || comp.price,
          comp.weight || 1.0,
          comp.notes || null,
        ]
      );
    }
    
    // Calculate evidence quality
    const evidenceQuality = {
      verifiedSales: comparables.filter((c: any) => c.evidence_type === 'verified_sale').length,
      delistedInferred: comparables.filter((c: any) => c.evidence_type === 'delisted_inferred').length,
      contributed: comparables.filter((c: any) => c.evidence_type === 'contributed').length,
      activeListings: comparables.filter((c: any) => c.evidence_type === 'listing').length,
    };
    
    // Save method inputs for audit trail
    await query(
      `INSERT INTO valuation_method_inputs 
        (valuation_id, method_type, inputs, calculated_value, confidence_score, status, created_by)
       VALUES ($1, 'sales_comparison', $2, $3, $4, 'completed', $5)
       ON CONFLICT (valuation_id, method_type) 
       DO UPDATE SET 
         inputs = EXCLUDED.inputs,
         calculated_value = EXCLUDED.calculated_value,
         confidence_score = EXCLUDED.confidence_score,
         updated_at = NOW()
       RETURNING *`,
      [
        valuationId,
        JSON.stringify({
          comparables_count: comparables.length,
          adjustments: adjustments || {},
          reconciliation_notes,
          weighting_rationale,
          evidence_quality: evidenceQuality,
          avg_price_per_sqm,
        }),
        indicated_value,
        // Confidence based on evidence quality
        Math.min(0.95, 0.5 + 
          (evidenceQuality.verifiedSales * 0.15) + 
          (evidenceQuality.delistedInferred * 0.10) +
          (evidenceQuality.contributed * 0.05) +
          (Math.min(comparables.length, 5) * 0.03)
        ),
        userId,
      ]
    );
    
    res.json({
      success: true,
      data: {
        basket_id: basketId,
        indicated_value,
        avg_price_per_sqm,
        comparables_count: comparables.length,
        evidence_quality: evidenceQuality,
        rics_compliance: {
          minimum_comparables_met: true,
          has_transaction_evidence: 
            evidenceQuality.verifiedSales > 0 || evidenceQuality.delistedInferred > 0,
        },
      },
    });
  } catch (error: any) {
    logger.error('Failed to save sales comparison data', { valuationId, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to save sales comparison data',
      message: error.message,
    });
  }
});

/**
 * Auto-calculate sales comparison adjustments using Python valuation engine
 * POST /api/v1/valuations/:id/sales-comparison/auto-calculate
 * 
 * Calls the Python valuation service to calculate:
 * - Physical adjustments (GFA, bedrooms, age, condition, etc.)
 * - Location adjustments (neighborhood premiums, view, accessibility)
 * - Time adjustments (market appreciation since listing)
 * - Listing adjustments (asking-to-achieved discount)
 * - Ghana-specific adjustments (tenure risk, neighborhood premiums)
 * 
 * Returns calculated adjustments for frontend display.
 */
router.post('/:id/sales-comparison/auto-calculate', validateUUID('id'), async (req: Request, res: Response) => {
  const valuationId = req.params.id;
  
  try {
    const { subject_property, comparables, options } = req.body;
    
    // Validate input
    if (!subject_property) {
      return res.status(400).json({
        success: false,
        error: 'subject_property is required',
      });
    }
    
    if (!comparables || !Array.isArray(comparables) || comparables.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'comparables array is required and must not be empty',
      });
    }
    
    // Check if Python service is available
    const pythonAvailable = await pythonClient.isAvailable();
    
    if (!pythonAvailable) {
      // Fallback to TypeScript calculation
      logger.warn('Python service not available, using TypeScript fallback for auto-calculate');
      
      const adjustedComparables = comparables.map((comp: any) => {
        const adjustments: Record<string, number> = {};
        
        // Physical adjustments
        if (subject_property.gfa && comp.gfa) {
          const gfaDiff = (subject_property.gfa - comp.gfa) / comp.gfa;
          adjustments.gfa = Math.max(-25, Math.min(25, gfaDiff * 100));
        }
        
        if (subject_property.bedrooms && comp.bedrooms) {
          adjustments.bedrooms = (subject_property.bedrooms - comp.bedrooms) * 2.5;
        }
        
        if (subject_property.bathrooms && comp.bathrooms) {
          adjustments.bathrooms = (subject_property.bathrooms - comp.bathrooms) * 2;
        }
        
        // Age adjustment (0.5% per year)
        const subjectAge = subject_property.age || (subject_property.year_built ? new Date().getFullYear() - subject_property.year_built : 0);
        const compAge = comp.age || (comp.year_built ? new Date().getFullYear() - comp.year_built : 0);
        if (subjectAge && compAge) {
          adjustments.age = (compAge - subjectAge) * 0.5;
        }
        
        // Condition adjustment (5% per level)
        const conditionRatings: Record<string, number> = { excellent: 4, good: 3, fair: 2, poor: 1 };
        const subjectCondition = conditionRatings[subject_property.condition || 'good'] || 3;
        const compCondition = conditionRatings[comp.condition || 'good'] || 3;
        adjustments.condition = (subjectCondition - compCondition) * 5;
        
        // Listing adjustment (asking-to-achieved)
        const evidenceType = comp.evidence_type || 'listing';
        if (evidenceType === 'listing' || evidenceType === 'asking_price') {
          const qualityDiscounts: Record<string, number> = {
            luxury: -20, high: -15, standard: -12, basic: -8
          };
          adjustments.listing_adjustment = qualityDiscounts[comp.quality_rating || 'standard'] || -12;
        } else {
          adjustments.listing_adjustment = 0;
        }
        
        // Ghana-specific tenure adjustment
        const tenureRisks: Record<string, number> = {
          freehold: 0, leasehold_99: -3, government_lease: -5,
          leasehold_50_99: -8, customary_freehold: -10, stool_land_documented: -12,
          leasehold_under_50: -15, family_land_documented: -18,
          stool_land_undocumented: -25, family_land_undocumented: -30
        };
        const subjectTenure = tenureRisks[subject_property.tenure_type || 'freehold'] || 0;
        const compTenure = tenureRisks[comp.tenure_type || 'freehold'] || 0;
        adjustments.tenure = subjectTenure - compTenure;
        
        // Time adjustment (0.5% per month, ~6% annual)
        if (comp.sale_date) {
          const saleDate = new Date(comp.sale_date);
          const monthsSince = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
          adjustments.time = Math.min(15, monthsSince * 0.5);
        }
        
        // Calculate total adjustment
        const totalAdjustment = Object.values(adjustments).reduce((sum, adj) => sum + adj, 0);
        const adjustedPrice = comp.sale_price * (1 + totalAdjustment / 100);
        
        return {
          ...comp,
          adjustments,
          total_adjustment_pct: totalAdjustment,
          adjusted_price: adjustedPrice,
          adjusted_price_per_sqm: comp.gfa ? adjustedPrice / comp.gfa : null,
          calculation_source: 'typescript_fallback',
        };
      });
      
      // Calculate indicated value
      const totalWeight = adjustedComparables.length;
      const indicatedValue = adjustedComparables.reduce(
        (sum: number, c: any) => sum + c.adjusted_price, 
        0
      ) / totalWeight;
      
      return res.json({
        success: true,
        data: {
          valuation_id: valuationId,
          comparables: adjustedComparables,
          indicated_value: indicatedValue,
          avg_adjustment_pct: adjustedComparables.reduce(
            (sum: number, c: any) => sum + Math.abs(c.total_adjustment_pct), 
            0
          ) / adjustedComparables.length,
          calculation_source: 'typescript_fallback',
          python_available: false,
          message: 'Calculated using TypeScript fallback (Python service unavailable)',
        },
      });
    }
    
    // Convert subject property to Python format
    const pythonSubject = {
      id: valuationId,
      property_type: subject_property.property_type || 'residential',
      region: subject_property.region || 'greater_accra',
      address_city: subject_property.city,
      address_street: subject_property.address,
      latitude: subject_property.latitude,
      longitude: subject_property.longitude,
      land_area_sqm: subject_property.plot_size,
      building_size_sqm: subject_property.gfa,
      bedrooms: subject_property.bedrooms,
      bathrooms: subject_property.bathrooms,
      year_built: subject_property.year_built,
      condition: subject_property.condition,
      current_price_ghs: subject_property.price,
    };
    
    // Call Python sales comparison service
    const pythonResult = await pythonClient.salesComparison(pythonSubject, {
      comparables: comparables.map((c: any) => ({
        id: c.id,
        property_type: c.property_type || 'residential',
        region: c.region || 'greater_accra',
        address_city: c.city,
        address_street: c.address,
        latitude: c.latitude,
        longitude: c.longitude,
        land_area_sqm: c.plot_size,
        building_size_sqm: c.gfa,
        bedrooms: c.bedrooms,
        bathrooms: c.bathrooms,
        year_built: c.year_built,
        condition: c.condition,
        current_price_ghs: c.sale_price || c.price,
        sale_date: c.sale_date,
        evidence_type: c.evidence_type,
        tenure_type: c.tenure_type,
        neighborhood: c.neighborhood,
      })),
      include_ghana_adjustments: options?.include_ghana_adjustments ?? true,
      include_tenure_risk: options?.include_tenure_risk ?? true,
      include_neighborhood_premiums: options?.include_neighborhood_premiums ?? true,
    });
    
    if (!pythonResult.success) {
      throw new Error(pythonResult.details?.error || 'Python calculation failed');
    }
    
    // Map Python result back to frontend format
    const adjustedComparables = comparables.map((comp: any, index: number) => {
      const pythonComp = pythonResult.details?.comparables?.[index] || {};
      
      return {
        ...comp,
        adjustments: pythonComp.adjustments || {},
        total_adjustment_pct: pythonComp.total_adjustment_percentage || 0,
        adjusted_price: pythonComp.adjusted_value || comp.sale_price,
        adjusted_price_per_sqm: comp.gfa ? (pythonComp.adjusted_value || comp.sale_price) / comp.gfa : null,
        similarity_score: pythonComp.similarity_score || 0.8,
        weight: pythonComp.weight || 1.0,
        calculation_source: 'python_valuation_engine',
      };
    });
    
    res.json({
      success: true,
      data: {
        valuation_id: valuationId,
        comparables: adjustedComparables,
        indicated_value: pythonResult.estimated_value,
        confidence_score: pythonResult.confidence_score,
        confidence_level: pythonResult.confidence_level,
        value_range: pythonResult.value_range,
        avg_adjustment_pct: pythonResult.details?.average_adjustment_pct || 0,
        calculation_source: 'python_valuation_engine',
        python_available: true,
        methodology_notes: pythonResult.details?.methodology_notes,
        assumptions: pythonResult.assumptions,
        limitations: pythonResult.limitations,
        ghana_adjustments_applied: {
          tenure_risk: options?.include_tenure_risk ?? true,
          neighborhood_premiums: options?.include_neighborhood_premiums ?? true,
        },
      },
    });
  } catch (error: any) {
    logger.error('Failed to auto-calculate sales comparison', { valuationId, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to auto-calculate sales comparison',
      message: error.message,
    });
  }
});

// =====================================================
// LAND VALUE ROUTES (2-Method Reconciliation: Residual + Comparable)
// =====================================================

/**
 * Get land value for a valuation
 * GET /api/v1/valuations/:id/land-value
 * 
 * Returns the calculated land value from valuation_method_inputs
 * if previously calculated, otherwise returns null.
 */
router.get('/:id/land-value', validateUUID('id'), async (req: Request, res: Response) => {
  const valuationId = req.params.id;
  
  try {
    const result = await query(
      `SELECT * FROM valuation_method_inputs 
       WHERE valuation_id = $1 AND method_type = 'land_value'`,
      [valuationId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No land value calculated for this valuation yet',
      });
    }

    const row = result.rows[0];
    
    res.json({
      success: true,
      data: {
        id: row.id,
        valuation_id: row.valuation_id,
        method_type: row.method_type,
        ...row.inputs,
        calculated_value: row.calculated_value,
        calculation_result: row.calculation_result,
        confidence_score: row.confidence_score,
        status: row.status,
        updated_at: row.updated_at,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get land value', { valuationId, error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve land value',
    });
  }
});

/**
 * Calculate land value for a valuation
 * POST /api/v1/valuations/:id/land-value/calculate
 * 
 * Calls the Python valuation engine to calculate land value
 * using Residual + Comparable methods with comp-strength-based weighting.
 * 
 * If user_entered_value is provided, it is a 100% OVERRIDE.
 * 
 * Request body:
 * {
 *   user_entered_value?: number  // Optional: User override (100% bypass)
 *   user_justification?: string  // Required if user_entered_value provided
 *   force_recalculate?: boolean  // Force recalculation even if cached
 * }
 */
router.post(
  '/:id/land-value/calculate', 
  validateUUID('id'), 
  validate(landValueCalculateRequestSchema, 'body'),
  async (req: Request, res: Response) => {
  const valuationId = req.params.id;
  const { user_entered_value, user_justification, force_recalculate } = req.body;
  
  try {
    // Get valuation with property details
    const valuationResult = await query(
      `SELECT v.*, p.* 
       FROM valuations v
       JOIN properties p ON p.id = v.property_id
       WHERE v.id = $1`,
      [valuationId]
    );
    
    if (valuationResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }
    
    const row = valuationResult.rows[0];
    
    // Build property input for Python service
    const propertyInput = {
      id: row.property_id,
      property_type: row.property_type || 'residential',
      region: row.region || 'greater_accra',
      address_city: row.address_city,
      address_street: row.address_street,
      latitude: row.latitude,
      longitude: row.longitude,
      land_area_sqm: row.land_area_sqm || row.land_size_sqm,
      building_size_sqm: row.building_size_sqm || row.built_area_sqm || row.total_area_sqm,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      year_built: row.year_built,
      condition: row.condition || 'good',
    };
    
    // Call Python land value service
    const landValueResult = await pythonClient.getLandValue({
      property: propertyInput,
      valuation_id: valuationId,
      user_entered_value: user_entered_value,
      user_justification: user_justification,
      force_recalculate: force_recalculate || false,
    });
    
    if (!landValueResult.success) {
      return res.status(400).json({
        error: 'Calculation Error',
        message: landValueResult.error || 'Failed to calculate land value',
      });
    }
    
    // Store in valuation_method_inputs
    const inputs = {
      user_entered_value,
      user_justification,
      property_id: row.property_id,
      land_area_sqm: propertyInput.land_area_sqm,
    };
    
    const saveResult = await query(
      `INSERT INTO valuation_method_inputs 
         (valuation_id, method_type, inputs, calculated_value, calculation_result, confidence_score, status)
       VALUES ($1, 'land_value', $2, $3, $4, $5, 'calculated')
       ON CONFLICT (valuation_id, method_type) 
       DO UPDATE SET
         inputs = EXCLUDED.inputs,
         calculated_value = EXCLUDED.calculated_value,
         calculation_result = EXCLUDED.calculation_result,
         confidence_score = EXCLUDED.confidence_score,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        valuationId,
        JSON.stringify(inputs),
        landValueResult.final_land_value,
        JSON.stringify(landValueResult),
        landValueResult.confidence_score,
      ]
    );
    
    const savedRow = saveResult.rows[0];
    
    logger.info('Land value calculated and saved', {
      valuationId,
      landValue: landValueResult.final_land_value,
      isUserOverride: landValueResult.is_user_override,
      comparableStrength: landValueResult.comparable_strength,
    });
    
    res.json({
      success: true,
      data: {
        id: savedRow.id,
        valuation_id: savedRow.valuation_id,
        method_type: savedRow.method_type,
        ...landValueResult,
        stored_at: savedRow.updated_at,
      },
      message: landValueResult.is_user_override 
        ? 'User-entered land value saved successfully'
        : 'Land value calculated and saved successfully',
    });
  } catch (error: any) {
    logger.error('Failed to calculate land value', { valuationId, error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to calculate land value',
    });
  }
});

/**
 * Get land comparables for a valuation
 * GET /api/v1/valuations/:id/land-value/comparables
 * 
 * Returns land comparable sales without full reconciliation.
 * Useful for displaying comparables to the user before calculating.
 * 
 * Query params:
 *   max_distance_km?: number (default: 10)
 *   max_results?: number (default: 10)
 */
router.get(
  '/:id/land-value/comparables', 
  validateUUID('id'), 
  validate(landComparablesQuerySchema, 'query'),
  async (req: Request, res: Response) => {
  const valuationId = req.params.id;
  // Validated by Zod middleware - defaults applied
  const max_distance_km = Number(req.query.max_distance_km) || 10;
  const max_results = Number(req.query.max_results) || 10;
  
  try {
    // Get valuation with property details
    const valuationResult = await query(
      `SELECT v.*, p.* 
       FROM valuations v
       JOIN properties p ON p.id = v.property_id
       WHERE v.id = $1`,
      [valuationId]
    );
    
    if (valuationResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }
    
    const row = valuationResult.rows[0];
    
    // Build property input
    const propertyInput = {
      id: row.property_id,
      property_type: row.property_type || 'residential',
      region: row.region || 'greater_accra',
      address_city: row.address_city,
      address_street: row.address_street,
      latitude: row.latitude,
      longitude: row.longitude,
      land_area_sqm: row.land_area_sqm || row.land_size_sqm,
      building_size_sqm: row.building_size_sqm || row.built_area_sqm,
    };
    
    // Call Python comparables service
    const comparablesResult = await pythonClient.getLandComparables(propertyInput, {
      max_distance_km: max_distance_km,
      max_results: max_results,
    });
    
    res.json({
      success: true,
      data: comparablesResult,
    });
  } catch (error: any) {
    logger.error('Failed to get land comparables', { valuationId, error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve land comparables',
    });
  }
});

/**
 * Save/update land value inputs (without recalculating)
 * POST /api/v1/valuations/:id/land-value
 * 
 * Stores inputs and optionally calculation results without calling Python service.
 * Useful for saving user edits or restoring from saved state.
 */
router.post('/:id/land-value', validateUUID('id'), async (req: Request, res: Response) => {
  return saveMethodInputs(req, res, 'land_value');
});

/**
 * Helper: Get method inputs
 */
async function getMethodInputs(req: Request, res: Response, methodType: string) {
  const valuationId = req.params.id;
  
  try {
    const result = await query(
      `SELECT * FROM valuation_method_inputs 
       WHERE valuation_id = $1 AND method_type = $2`,
      [valuationId, methodType]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: `No ${methodType} inputs found for this valuation`,
      });
    }

    const row = result.rows[0];
    
    // Return inputs merged with calculation results for frontend convenience
    res.json({
      success: true,
      data: {
        id: row.id,
        valuation_id: row.valuation_id,
        method_type: row.method_type,
        ...row.inputs,
        calculated_value: row.calculated_value,
        calculation_result: row.calculation_result,
        confidence_score: row.confidence_score,
        status: row.status,
        updated_at: row.updated_at,
      },
    });
  } catch (error: any) {
    logger.error(`Failed to get ${methodType} inputs`, { valuationId, error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to retrieve ${methodType} inputs`,
    });
  }
}

/**
 * Helper: Save method inputs (UPSERT)
 */
async function saveMethodInputs(req: Request, res: Response, methodType: string) {
  const valuationId = req.params.id;
  const inputs = req.body;
  
  // Extract special fields from inputs
  const { 
    calculated_value, 
    calculation_result, 
    confidence_score, 
    status,
    id, // Ignore if passed
    valuation_id, // Ignore if passed
    method_type, // Ignore if passed
    ...inputsOnly 
  } = inputs;
  
  try {
    const result = await query(
      `INSERT INTO valuation_method_inputs 
         (valuation_id, method_type, inputs, calculated_value, calculation_result, confidence_score, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (valuation_id, method_type) 
       DO UPDATE SET
         inputs = EXCLUDED.inputs,
         calculated_value = COALESCE(EXCLUDED.calculated_value, valuation_method_inputs.calculated_value),
         calculation_result = COALESCE(EXCLUDED.calculation_result, valuation_method_inputs.calculation_result),
         confidence_score = COALESCE(EXCLUDED.confidence_score, valuation_method_inputs.confidence_score),
         status = COALESCE(EXCLUDED.status, valuation_method_inputs.status),
         updated_at = NOW()
       RETURNING *`,
      [
        valuationId, 
        methodType, 
        JSON.stringify(inputsOnly),
        calculated_value || null,
        calculation_result ? JSON.stringify(calculation_result) : null,
        confidence_score || null,
        status || 'draft',
      ]
    );

    const row = result.rows[0];
    
    logger.info(`${methodType} inputs saved`, { valuationId, methodType });

    res.json({
      success: true,
      data: {
        id: row.id,
        valuation_id: row.valuation_id,
        method_type: row.method_type,
        ...row.inputs,
        calculated_value: row.calculated_value,
        calculation_result: row.calculation_result,
        confidence_score: row.confidence_score,
        status: row.status,
        updated_at: row.updated_at,
      },
      message: `${methodType} inputs saved successfully`,
    });
  } catch (error: any) {
    logger.error(`Failed to save ${methodType} inputs`, { valuationId, error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to save ${methodType} inputs`,
    });
  }
}

export default router;
