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
import { reportDataService } from '../services/valuation-engine/reportDataService';
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
      // Forward to next matching route instead of returning 400.
      // This allows static routes like /rental-benchmarks, /cap-rate/benchmarks,
      // /market/:region to be matched even when defined after /:id.
      return next('route');
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

    // RBAC: determine if user can see all valuations or only assigned ones
    const userRole = req.user?.realmRoles?.[0] || req.user?.clientRoles?.[0] || '';
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.user?.organizationId;
    const fullAccessRoles = ['super_admin', 'admin', 'firm_principal', 'senior_valuer', 'manager', 'compliance_officer'];
    const hasFullAccess = fullAccessRoles.includes(userRole);

    let whereClause = '';
    let joinClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    // Assignment-based filtering for non-admin roles
    if (!hasFullAccess && userId) {
      joinClause = ` INNER JOIN valuation_team_members vtm ON vtm.valuation_id = v.id AND vtm.user_id = $${paramIndex++} AND vtm.is_active = true`;
      params.push(userId);
    } else if (orgId && !['super_admin'].includes(userRole)) {
      // Org-scoped: admin/managers see their org's valuations only
      whereClause += ` WHERE v.valuer_organization_id = $${paramIndex++}`;
      params.push(orgId);
    }

    if (status) {
      whereClause += whereClause ? ` AND v.status = $${paramIndex++}` : ` WHERE v.status = $${paramIndex++}`;
      params.push(status);
    }

    if (purpose) {
      whereClause += whereClause ? ` AND v.valuation_purpose = $${paramIndex++}` : ` WHERE v.valuation_purpose = $${paramIndex++}`;
      params.push(purpose);
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM valuations v${joinClause}${whereClause}`,
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
        v.methods_applied,
        v.created_at,
        v.updated_at,
        v.current_step,
        p.title as property_title,
        p.address_street,
        p.address_city,
        p.region,
        p.property_type,
        p.digital_address
      FROM valuations v${joinClause}
      LEFT JOIN properties p ON v.property_id = p.id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // Transform rows to include nested property object for frontend compatibility
    const transformedData = result.rows.map((row: any) => ({
      id: row.id,
      property_id: row.property_id,
      status: row.status,
      valuation_purpose: row.valuation_purpose,
      valuation_type: row.valuation_type,
      estimated_value: row.estimated_value,
      final_value_ghs: row.estimated_value, // Map for frontend
      confidence_score: row.confidence_score,
      primary_method: row.primary_method,
      methods_applied: row.methods_applied || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      current_step: row.current_step || 1,
      // Nested property object for frontend
      property: {
        id: row.property_id,
        title: row.property_title,
        address: row.address_street || row.digital_address,
        address_street: row.address_street,
        city: row.address_city,
        address_city: row.address_city,
        region: row.region,
        property_type: row.property_type,
        digital_address: row.digital_address,
      },
    }));

    res.json({
      success: true,
      data: transformedData,
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
    // RBAC: same logic as list — filter by assignment for non-admin roles
    const userRole = req.user?.realmRoles?.[0] || req.user?.clientRoles?.[0] || '';
    const userId = req.user?.id || req.user?.sub;
    const orgId = req.user?.organizationId;
    const fullAccessRoles = ['super_admin', 'admin', 'firm_principal', 'senior_valuer', 'manager', 'compliance_officer'];
    const hasFullAccess = fullAccessRoles.includes(userRole);

    let joinClause = '';
    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (!hasFullAccess && userId) {
      joinClause = ` INNER JOIN valuation_team_members vtm ON vtm.valuation_id = v.id AND vtm.user_id = $${paramIndex++} AND vtm.is_active = true`;
      params.push(userId);
    } else if (orgId && !['super_admin'].includes(userRole)) {
      whereClause = ` WHERE v.valuer_organization_id = $${paramIndex++}`;
      params.push(orgId);
    }

    const result = await query(`
      SELECT 
        COUNT(*) as total_valuations,
        COUNT(DISTINCT v.property_id) as unique_properties,
        AVG(v.estimated_value) as avg_value,
        AVG(v.confidence_score) as avg_confidence,
        COUNT(CASE WHEN v.status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN v.status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN v.status = 'pending_review' THEN 1 END) as pending_review_count,
        COUNT(CASE WHEN v.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN v.created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7_days,
        COUNT(CASE WHEN v.created_at > NOW() - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM valuations v${joinClause}${whereClause}
    `, params);

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
    const {
      property,
      property_id,
      valuation_type,
      valuation_purpose,
      valuation_date,
      inspection_date,
      instruction_date,
      report_date,
      is_retrospective,
      client_id,
      options = {},
    } = req.body;
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
          // Generate descriptive title from address or digital address
          property.title || property.address_street || property.address || property.digital_address || `Property in ${property.address_city}`,
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

      // Track contribution for Data Hub
      try {
        const { ServiceHooks } = await import('../services/data-hub/serviceHooks');
        await ServiceHooks.createContribution({
          contributor_id: userId,
          organization_id: (req as any).user?.organizationId,
          contribution_type: 'new_property',
          source_context: 'valuation_workflow',
          source_id: propId,
          data: {
            property_id: propId,
            reference_number: refNumber,
            address: property.address_street || property.address,
            region: property.region,
            property_type: dbPropertyType,
            action: 'subject_property_creation'
          }
        });
      } catch (hookError) {
        logger.error('Failed to create valuation contribution hook', { error: hookError });
      }
    }

    logger.info('Creating valuation', {
      propertyId: propId,
      valuationType: valuation_type || 'full_appraisal',
      purpose: valuation_purpose || 'sale',
      userId,
    });

    // Create a DRAFT valuation record - do NOT run valuation engine yet
    // The valuation engine runs at reconciliation step after all data is gathered
    const effectiveDate = valuation_date || new Date().toISOString().split('T')[0];
    const inspectionDate = inspection_date || null;
    const retrospectiveFlag = typeof is_retrospective === 'boolean' ? is_retrospective : null;
    const metadata = {
      instruction_date: instruction_date || null,
      report_date: report_date || null,
    };

    // Also capture the organization ID for client linkage
    const organizationId = (req as any).user?.organizationId || null;

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
        effective_date,
        inspection_date,
        is_retrospective,
        metadata,
        client_id,
        valuer_organization_id
      ) VALUES (
        $1, $2, $3, $4, 'draft', 0, 0, '[]', $5, $6, COALESCE($7, FALSE), $8, $9, $10
      ) RETURNING id, property_id, status, valuation_type, valuation_purpose, created_at`,
      [
        propId,
        userId,
        valuation_type || 'professional',
        valuation_purpose || 'sale',
        effectiveDate,
        inspectionDate,
        retrospectiveFlag,
        metadata,
        client_id || null,
        organizationId,
      ]
    );

    const result = valuationResult.rows[0];

    // If client_id provided, auto-populate engagement from client registry
    if (client_id) {
      try {
        const clientRow = await query(
          `SELECT name, company_name, email, phone, address FROM valuation_clients WHERE id = $1 AND organization_id = $2`,
          [client_id, organizationId]
        );
        if (clientRow.rows.length > 0) {
          const c = clientRow.rows[0];
          await query(
            `INSERT INTO valuation_engagements (
              valuation_id, client_name, client_company, client_email, client_contact, client_address,
              request_type, request_date, purpose
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              result.id,
              c.name, c.company_name, c.email, c.phone, c.address,
              property?.request_type || 'written',
              instruction_date || new Date().toISOString().split('T')[0],
              valuation_purpose || 'sale',
            ]
          );
          logger.info('Valuation engagement auto-populated from client registry', { valuationId: result.id, clientId: client_id });
        }
      } catch (engErr: any) {
        logger.warn('Failed to auto-populate engagement from client', { valuationId: result.id, error: engErr.message });
      }
    }

    // Create valuation engagement record with client info if provided (inline fields)
    else if (property?.client_name || property?.request_type) {
      try {
        await query(
          `INSERT INTO valuation_engagements (
            valuation_id,
            client_name,
            client_address,
            client_email,
            client_contact,
            request_type,
            request_date,
            purpose
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            result.id,
            property.client_name || property.owner_name || null,
            property.client_address || property.owner_address || null,
            property.client_email || property.owner_email || null,
            property.client_phone || property.owner_phone || null,
            property.request_type || 'written',
            instruction_date || new Date().toISOString().split('T')[0],
            valuation_purpose || 'sale',
          ]
        );
        logger.info('Valuation engagement created', { valuationId: result.id });
      } catch (engErr: any) {
        logger.warn('Failed to create valuation engagement', {
          valuationId: result.id,
          error: engErr.message
        });
      }
    }

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
        p.address_district,
        p.property_type,
        p.bedrooms,
        p.bathrooms,
        p.land_area_sqm,
        p.year_built,
        p.latitude,
        p.longitude
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

    // Fetch basket comparables for RICS calculation
    const basketResult = await query(
      `SELECT vb.id as basket_id
       FROM valuation_comparable_baskets vb
       WHERE vb.valuation_id = $1
       ORDER BY vb.created_at DESC
       LIMIT 1`,
      [valuationId]
    );

    let comparables: any[] = [];

    if (basketResult.rows.length > 0) {
      const basketId = basketResult.rows[0].basket_id;

      // Get comparables from the basket with property details
      const comparablesResult = await query(
        `SELECT 
          bc.id,
          bc.comparable_property_id,
          bc.weight,
          bc.is_excluded,
          p.price,
          p.price_currency,
          p.bedrooms,
          p.bathrooms,
          p.land_area_sqm,
          p.year_built,
          p.region,
          p.address_city,
          p.address_district,
          p.property_type,
          p.evidence_type,
          p.created_at as listing_date
        FROM valuation_basket_comparables bc
        JOIN properties p ON bc.comparable_property_id = p.id
        WHERE bc.basket_id = $1 AND bc.is_excluded = false
        ORDER BY bc.weight DESC`,
        [basketId]
      );

      comparables = comparablesResult.rows.map((comp: any) => ({
        id: comp.comparable_property_id || comp.id,
        price: parseFloat(comp.price) || 0,
        price_currency: comp.price_currency || 'GHS',
        bedrooms: comp.bedrooms,
        bathrooms: comp.bathrooms,
        gfa_sqm: comp.land_area_sqm, // Use land area as proxy for GFA
        land_area_sqm: comp.land_area_sqm,
        year_built: comp.year_built,
        condition: 'good',
        region: comp.region,
        address_city: comp.address_city,
        address_district: comp.address_district,
        property_type: comp.property_type,
        evidence_type: comp.evidence_type || 'listing',
        transaction_date: comp.listing_date,
        weight: parseFloat(comp.weight) || 1.0,
        adjustments: {} // Adjustments calculated by Python service
      }));
    }

    // Prepare property data for Python service
    const propertyData = {
      id: valuation.property_id,
      region: valuation.region,
      address_city: valuation.address_city,
      address_district: valuation.address_district,
      property_type: valuation.property_type,
      bedrooms: valuation.bedrooms,
      bathrooms: valuation.bathrooms,
      land_area_sqm: valuation.land_area_sqm,
      building_size_sqm: valuation.land_area_sqm, // Use land area as proxy
      year_built: valuation.year_built,
      latitude: valuation.latitude,
      longitude: valuation.longitude,
      condition: 'good',
    };

    logger.info('Calling Python RICS valuation service', {
      valuationId,
      propertyId: valuation.property_id,
      city: valuation.address_city,
      region: valuation.region,
      comparablesCount: comparables.length,
    });

    // Use RICS endpoint if we have comparables, otherwise fall back to standard
    const pythonEndpoint = comparables.length > 0
      ? 'http://localhost:8001/api/v1/methods/sales-comparison-rics'
      : 'http://localhost:8001/api/v1/methods/sales-comparison';

    const requestBody = comparables.length > 0
      ? {
        property: propertyData,
        comparables: comparables,
        valuation_date: new Date().toISOString(),
        usd_to_ghs_rate: req.body.usd_to_ghs_rate || 16.0,
        options: req.body.options || {},
      }
      : {
        property: propertyData,
        valuation_date: new Date().toISOString(),
        options: req.body.options || {},
      };

    const pythonResponse = await fetch(pythonEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      logger.error('Python valuation service failed', {
        status: pythonResponse.status,
        error: errorText,
        endpoint: pythonEndpoint,
      });

      return res.status(502).json({
        error: 'Service Error',
        message: 'Python valuation service failed',
        details: process.env.NODE_ENV === 'development' ? errorText : undefined,
      });
    }

    const pythonResult = await pythonResponse.json() as {
      success: boolean;
      method: string;
      estimated_value: number;
      confidence_score: number;
      confidence_level: string;
      value_range: { low: number; high: number; most_probable?: number };
      details: Record<string, unknown>;
      assumptions: string[];
      limitations: string[];
      // RICS-specific fields
      comparables_analyzed?: Array<{
        id: string;
        original_price_ghs: number;
        adjusted_price_ghs: number;
        adjustments_applied: Record<string, number>;
        total_adjustment_percent: number;
        weight: number;
        weighted_value: number;
      }>;
      adjustment_grid?: Record<string, Record<string, number>>;
      methodology_notes?: string[];
    };

    // Update the valuation record with Python results
    if (pythonResult.success && pythonResult.estimated_value) {
      const updateResult = await query(
        `UPDATE valuations SET
          estimated_value = $1,
          confidence_score = $2,
          value_range_low = $3,
          value_range_high = $4,
          methods_used = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING *`,
        [
          pythonResult.estimated_value,
          pythonResult.confidence_score,
          pythonResult.value_range?.low,
          pythonResult.value_range?.high,
          JSON.stringify([pythonResult.method]),
          valuationId,
        ]
      );

      const duration = Date.now() - startTime;
      const isRICS = pythonResult.method === 'sales_comparison_rics';

      logger.info('Python valuation completed successfully', {
        valuationId,
        method: pythonResult.method,
        estimatedValue: pythonResult.estimated_value,
        confidence: pythonResult.confidence_score,
        comparablesUsed: pythonResult.comparables_analyzed?.length || 0,
        duration,
      });

      res.json({
        success: true,
        data: {
          id: valuationId,
          ...updateResult.rows[0],
          sales_comparison: {
            estimated_value: pythonResult.estimated_value,
            confidence_score: pythonResult.confidence_score,
            confidence_level: pythonResult.confidence_level,
            value_range: pythonResult.value_range,
            details: pythonResult.details,
            assumptions: pythonResult.assumptions,
            limitations: pythonResult.limitations,
            // RICS-specific data
            ...(isRICS && {
              comparables_analyzed: pythonResult.comparables_analyzed,
              adjustment_grid: pythonResult.adjustment_grid,
              methodology_notes: pythonResult.methodology_notes,
            }),
          },
        },
        meta: {
          duration_ms: duration,
          engine: 'python',
          method: pythonResult.method,
          version: '2.0.0',
          rics_compliant: isRICS,
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

    if (updateData.valuation_date && updateData.effective_date === undefined) {
      updateData.effective_date = updateData.valuation_date;
    }

    if (updateData.valuation_date !== undefined) {
      delete updateData.valuation_date;
    }

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
      'effective_date',
      'inspection_date',
      'is_retrospective',
      'valuation_purpose',
      'final_value_ghs',
      'estimated_value',
      'confidence_score',
      'methods_applied',
      'method_weights',
      'weighting_rationale',
      'method_results',
      'primary_method',
      'methods_used',
      'hbu_results',
      'hbu_analysis',
      'rental_market_analysis',
      // Method-specific values for summary
      'cost_approach_value',
      'cost_approach_confidence',
      'sales_comparison_value',
      'sales_comparison_confidence',
      'income_approach_value',
      'income_approach_confidence',
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        // Handle JSONB fields - merge with existing
        const jsonbFields = ['method_results', 'hbu_results', 'hbu_analysis', 'method_weights', 'methods_used', 'rental_market_analysis'];
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

    // Debug logging for SQL
    logger.debug('Executing valuation update', {
      query: updateQuery,
      values: values.map((v, i) => `$${i + 1}: ${typeof v === 'string' && v.length > 100 ? v.substring(0, 100) + '...' : v}`),
    });

    const result = await query(updateQuery, values);

    // If method_results was updated, recalculate estimated_value from method values
    if (updateData.method_results) {
      const updatedRow = result.rows[0];
      const methodResults = updatedRow.method_results || {};

      // Calculate the estimated value from method_results
      let totalValue = 0;
      let totalWeight = 0;
      let methodCount = 0;

      // Priority: income_approach, cost_approach, sales_comparison
      const methodPriority = ['income_approach', 'direct_capitalisation', 'dcf_analysis', 'cost_approach', 'sales_comparison', 'income', 'cost'];

      for (const methodKey of Object.keys(methodResults)) {
        const methodData = methodResults[methodKey];
        if (methodData && typeof methodData === 'object') {
          const value = methodData.value || methodData.value_ghs || methodData.estimated_value || 0;
          const weight = methodData.weight || 100;

          if (value > 0) {
            totalValue += value * (weight / 100);
            totalWeight += weight;
            methodCount++;
          }
        }
      }

      // Calculate weighted average or simple average
      const estimatedValue = totalWeight > 0 ? totalValue : (methodCount > 0 ? totalValue / methodCount : 0);

      // Update estimated_value if we have a calculated value
      if (estimatedValue > 0) {
        await query(
          `UPDATE valuations SET estimated_value = $1, updated_at = NOW() WHERE id = $2`,
          [Math.round(estimatedValue * 100) / 100, id]
        );
        logger.info('Updated estimated_value from method_results', { valuationId: id, estimatedValue });
      }
    }

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
      stack: error.stack,
      code: error.code,
      detail: error.detail,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update valuation',
      detail: error.message,
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
      radiusKm = 15,
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
        -- Transaction classification fields
        COALESCE(p.is_transaction_record, FALSE) AS is_transaction_record,
        p.transaction_value,
        p.transaction_date,
        p.transaction_source,
        p.transaction_confidence,
        -- Evidence weight from config table (replaces hardcoded values)
        -- Falls back to legacy hardcoded values if config not found
        COALESCE(
          (SELECT ewc.base_weight 
           FROM evidence_weight_config ewc 
           WHERE ewc.evidence_type = COALESCE(p.evidence_type, 'listing')
             AND ewc.is_active = TRUE
             AND (ewc.source_tier IS NULL OR ewc.source_tier = p.data_source::text)
           ORDER BY CASE WHEN ewc.source_tier IS NOT NULL THEN 0 ELSE 1 END
           LIMIT 1),
          CASE 
            WHEN p.evidence_type = 'verified_sale' THEN 1.0
            WHEN p.evidence_type = 'government_record' THEN 1.0
            WHEN p.evidence_type = 'bank_valuation' THEN 0.95
            WHEN p.evidence_type = 'bank_collateral' THEN 0.92
            WHEN p.evidence_type = 'partner_transaction' THEN 0.88
            WHEN p.evidence_type = 'agent_confirmed' THEN 0.85
            WHEN p.evidence_type = 'delisted_inferred' THEN 0.80
            WHEN p.evidence_type = 'contributed' THEN 0.75
            ELSE 0.6  -- listing (asking price)
          END
        ) AS evidence_weight,
        -- Selection priority (lower = better, for ordering)
        COALESCE(
          (SELECT ewc.selection_priority 
           FROM evidence_weight_config ewc 
           WHERE ewc.evidence_type = COALESCE(p.evidence_type, 'listing')
             AND ewc.is_active = TRUE
           LIMIT 1),
          CASE 
            WHEN p.evidence_type = 'verified_sale' THEN 10
            WHEN p.evidence_type = 'government_record' THEN 10
            WHEN p.evidence_type = 'bank_valuation' THEN 20
            WHEN p.evidence_type = 'delisted_inferred' THEN 50
            WHEN p.evidence_type = 'contributed' THEN 60
            ELSE 80  -- listing
          END
        ) AS selection_priority,
        -- RICS classification for reporting
        COALESCE(
          (SELECT ewc.rics_classification 
           FROM evidence_weight_config ewc 
           WHERE ewc.evidence_type = COALESCE(p.evidence_type, 'listing')
             AND ewc.is_active = TRUE
           LIMIT 1),
          CASE 
            WHEN p.evidence_type IN ('verified_sale', 'government_record') THEN 'verified_transaction'
            WHEN p.evidence_type IN ('bank_valuation', 'bank_collateral') THEN 'verified_valuation'
            WHEN p.evidence_type = 'delisted_inferred' THEN 'inferred_transaction'
            WHEN p.evidence_type = 'partner_transaction' THEN 'agent_reported'
            ELSE 'asking_price'
          END
        ) AS rics_classification,
        -- Effective transaction/sale value (prioritize verified data)
        COALESCE(
          p.sold_price,           -- 1. Actual sold price (highest priority)
          p.transaction_value,    -- 2. Transaction value (bank valuation, etc.)
          p.inferred_sale_price,  -- 3. Inferred from delisting
          p.price                 -- 4. Asking price (lowest priority)
        ) AS effective_value,
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
        -- Only include sale properties (not rentals)
        AND p.transaction_type = 'sale'
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

    // RICS/GhIS Compliant Ordering:
    // 1. Prioritize verified transactions over listings (selection_priority)
    // 2. Higher evidence weight (closer to 1.0 = more reliable)
    // 3. Higher similarity score (better match to subject)
    // 4. Closer distance
    // This ensures we prefer verified sales/bank valuations over asking prices
    searchQuery += `
      ORDER BY 
        selection_priority ASC,     -- Lower = better (verified > bank > inferred > listing)
        evidence_weight DESC,       -- Higher = more reliable
        similarity_score DESC,      -- Better physical match
        distance_km ASC            -- Closer = more relevant
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
      avgPrice: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.sale_price || r.effective_value || 0), 0) / comparablesFound),
      avgPricePerSqm: Math.round(result.rows.reduce((sum: number, r: any) => {
        const price = r.sale_price || r.effective_value || 0;
        const area = r.gfa || r.plot_size || 1;
        return sum + (price / area);
      }, 0) / comparablesFound),
      avgDistance: Math.round((result.rows.reduce((sum: number, r: any) => sum + (r.distance_km || 0), 0) / comparablesFound) * 10) / 10,
      avgSimilarity: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.similarity_score || 0), 0) / comparablesFound),
      minPrice: Math.min(...result.rows.map((r: any) => r.sale_price || r.effective_value || 0)),
      maxPrice: Math.max(...result.rows.map((r: any) => r.sale_price || r.effective_value || 0)),
      minPricePerSqm: Math.round(Math.min(...result.rows.map((r: any) => (r.sale_price || r.effective_value || 0) / (r.gfa || r.plot_size || 1)))),
      maxPricePerSqm: Math.round(Math.max(...result.rows.map((r: any) => (r.sale_price || r.effective_value || 0) / (r.gfa || r.plot_size || 1)))),
      // Enhanced evidence quality breakdown per RICS/GhIS guidance
      evidenceQuality: {
        // Tier 1: Government verified (highest reliability)
        governmentRecords: result.rows.filter((r: any) => r.evidence_type === 'government_record' || r.evidence_type === 'lands_commission').length,
        // Tier 2: Bank valuations
        bankValuations: result.rows.filter((r: any) => ['bank_valuation', 'bank_collateral', 'forced_sale'].includes(r.evidence_type)).length,
        // Verified sales (any source with confirmed transaction)
        verifiedSales: result.rows.filter((r: any) => r.evidence_type === 'verified_sale').length,
        // Partner/agent reported
        partnerTransactions: result.rows.filter((r: any) => ['partner_transaction', 'agent_confirmed'].includes(r.evidence_type)).length,
        // Inferred from delisting
        delistedInferred: result.rows.filter((r: any) => r.evidence_type === 'delisted_inferred').length,
        // User contributed
        contributed: result.rows.filter((r: any) => r.evidence_type === 'contributed').length,
        // Active listings (asking prices only)
        activeListings: result.rows.filter((r: any) => r.evidence_type === 'listing' || r.evidence_type === 'listing_aged').length,

        // Transaction-based count (actual sales vs listing prices)
        transactionRecords: result.rows.filter((r: any) => r.is_transaction_record === true).length,
        askingPriceOnly: result.rows.filter((r: any) => r.is_transaction_record !== true).length,

        // Average evidence weight (1.0 = all verified, 0.6 = all listings)
        avgWeight: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.evidence_weight || 0.6), 0) / comparablesFound * 100) / 100,

        // RICS classification breakdown
        ricsClassification: {
          verifiedTransaction: result.rows.filter((r: any) => r.rics_classification === 'verified_transaction').length,
          verifiedValuation: result.rows.filter((r: any) => r.rics_classification === 'verified_valuation').length,
          inferredTransaction: result.rows.filter((r: any) => r.rics_classification === 'inferred_transaction').length,
          agentReported: result.rows.filter((r: any) => r.rics_classification === 'agent_reported').length,
          askingPrice: result.rows.filter((r: any) => r.rics_classification === 'asking_price' || !r.rics_classification).length,
        },

        // RICS compliance quality rating based on transaction evidence
        qualityRating: (() => {
          // Count all transaction-based evidence (not just asking prices)
          const verified = result.rows.filter((r: any) => ['verified_sale', 'government_record', 'lands_commission'].includes(r.evidence_type)).length;
          const bankBased = result.rows.filter((r: any) => ['bank_valuation', 'bank_collateral'].includes(r.evidence_type)).length;
          const partnerBased = result.rows.filter((r: any) => ['partner_transaction', 'agent_confirmed'].includes(r.evidence_type)).length;
          const delisted = result.rows.filter((r: any) => r.evidence_type === 'delisted_inferred').length;

          // Weight: verified=1.0, bank=0.9, partner=0.8, delisted=0.7
          const weightedScore = (verified * 1.0 + bankBased * 0.9 + partnerBased * 0.8 + delisted * 0.7) / comparablesFound;

          if (weightedScore >= 0.85) return 'excellent';  // >85% weighted transaction evidence
          if (weightedScore >= 0.65) return 'good';       // >65% weighted transaction evidence
          if (weightedScore >= 0.40) return 'fair';       // >40% weighted transaction evidence
          if (weightedScore >= 0.20) return 'limited';    // >20% weighted transaction evidence
          return 'insufficient';  // Mostly asking prices
        })(),

        // Compliance note for RICS reporting
        complianceNote: (() => {
          const transactionBased = result.rows.filter((r: any) => r.is_transaction_record === true).length;
          const ratio = transactionBased / comparablesFound;
          if (ratio >= 0.75) return 'Evidence quality meets RICS requirements - majority transaction-based';
          if (ratio >= 0.50) return 'Evidence quality acceptable - mixed transaction and listing data';
          if (ratio >= 0.25) return 'Evidence quality limited - predominantly listing prices, apply caution';
          return 'Evidence quality insufficient - primarily asking prices, consider expanding search or noting limitation';
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
 * @route POST /api/valuations/:id/rental-comparables/search
 * @desc Search for rental comparable properties for Income Approach rent estimation
 * @access Private
 * 
 * RICS-Compliant Rental Comparable Search:
 * - Location: Within specified radius (default 3km - tighter for rentals)
 * - Property Type: Same or similar property type
 * - Size: Within ±25% of subject GFA
 * - Bedrooms: Within ±1 of subject
 * - Recency: Within 6 months (rentals change faster than sales)
 * - Transaction Type: Rental listings only
 * 
 * Used by: Income Approach to estimate market rent for subject property
 */
router.post('/:id/rental-comparables/search', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id: valuationId } = req.params;
    const {
      latitude,
      longitude,
      radiusKm = 3,              // Default: 3km (tighter for rentals)
      propertyType,
      bedroomsMin,
      bedroomsMax,
      sizeMin,
      sizeMax,
      maxAgeMonths = 6,         // Default: 6 months (rentals change faster)
      furnishing,               // 'furnished' | 'unfurnished' | 'semi-furnished'
      excludeIds = [],
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
      logger.info('Geocoding digital address for rental comparables search', {
        digitalAddress: subjectProperty.digital_address,
        valuationId,
      });

      try {
        const geocodeResult = await ghanaPostService.geocodeDigitalAddress(subjectProperty.digital_address);
        if (geocodeResult) {
          searchLat = geocodeResult.latitude;
          searchLng = geocodeResult.longitude;
        }
      } catch (geocodeError) {
        logger.warn('Failed to geocode digital address for rental search', {
          digitalAddress: subjectProperty.digital_address,
          error: geocodeError instanceof Error ? geocodeError.message : 'Unknown error',
        });
      }
    }

    const searchPropertyType = propertyType || subjectProperty.property_type;
    const subjectSize = subjectProperty.built_area_sqm || subjectProperty.plot_size || 150;
    const subjectBedrooms = subjectProperty.bedrooms || 3;

    // Size range: ±25% for rentals (tighter than sales)
    const searchSizeMin = sizeMin ?? subjectSize * 0.75;
    const searchSizeMax = sizeMax ?? subjectSize * 1.25;

    // Bedroom range: ±1 by default
    const searchBedroomsMin = bedroomsMin ?? Math.max(1, subjectBedrooms - 1);
    const searchBedroomsMax = bedroomsMax ?? subjectBedrooms + 1;

    // Build rental comparables search query
    // Filters for transaction_type = 'rental' only
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
        p.built_area_sqm AS gfa_sqm,
        p.total_area_sqm AS plot_size,
        -- Original price fields
        p.price AS price_original,
        p.price_currency,
        -- Currency-normalized rent in GHS
        CASE 
          WHEN p.price_currency = 'USD' THEN p.price * fx.usd_to_ghs
          ELSE p.price
        END AS asking_rent_monthly,
        -- Rent per sqm per month
        CASE 
          WHEN p.price_currency = 'USD' THEN (p.price * fx.usd_to_ghs) / NULLIF(COALESCE(p.built_area_sqm, p.total_area_sqm), 0)
          ELSE p.price / NULLIF(COALESCE(p.built_area_sqm, p.total_area_sqm), 0)
        END AS rent_per_sqm_monthly,
        -- Exchange rate used
        fx.usd_to_ghs AS fx_rate_used,
        p.amenities,
        p.data_source,
        p.created_at AS listing_date,
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
        -- Calculate rental similarity score (weighted for rental-specific factors)
        CASE 
          WHEN p.property_type::text = $3::text THEN 25 ELSE 10 
        END +
        -- Size similarity (more important for rentals)
        CASE 
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.10 THEN 25
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.20 THEN 18
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.30 THEN 10
          ELSE 5
        END +
        -- Bedroom match (critical for rentals)
        CASE 
          WHEN p.bedrooms = $5 THEN 25
          WHEN ABS(COALESCE(p.bedrooms, 0) - $5) = 1 THEN 15
          ELSE 5
        END +
        -- Freshness (rentals change faster, recent data more valuable)
        CASE 
          WHEN p.created_at >= NOW() - INTERVAL '1 month' THEN 25
          WHEN p.created_at >= NOW() - INTERVAL '3 months' THEN 20
          WHEN p.created_at >= NOW() - INTERVAL '6 months' THEN 12
          ELSE 5
        END AS similarity_score
      FROM properties p
      CROSS JOIN fx_rate fx
      WHERE p.id != COALESCE($6::uuid, p.id)
        -- RENTAL ONLY filter
        AND p.transaction_type = 'rental'
        AND p.latitude IS NOT NULL 
        AND p.longitude IS NOT NULL
        AND p.price IS NOT NULL
        AND p.price > 0
        -- Location filter: within radius
        AND (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(p.latitude))
            ))
          )
        ) <= $7
        -- Property type filter
        AND ($3::text IS NULL OR p.property_type::text = $3::text)
        -- Size filter (±25% for rentals)
        AND (
          $8::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) >= $8
        )
        AND (
          $9::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) <= $9
        )
        -- Bedroom filter
        AND ($10::integer IS NULL OR p.bedrooms >= $10)
        AND ($11::integer IS NULL OR p.bedrooms <= $11)
        -- Recency filter (rentals = 6 months default)
        AND (p.created_at >= NOW() - ($12::text || ' months')::interval)
        -- Exclude already selected comparables
        AND p.id != ALL($13::uuid[])
    `;

    const params: any[] = [
      searchLat,                                                                    // $1
      searchLng,                                                                    // $2
      searchPropertyType,                                                           // $3
      subjectSize,                                                                  // $4
      subjectBedrooms,                                                              // $5
      subjectProperty.id,                                                           // $6 (exclude subject)
      radiusKm,                                                                     // $7
      searchSizeMin,                                                                // $8
      searchSizeMax,                                                                // $9
      searchBedroomsMin,                                                            // $10
      searchBedroomsMax,                                                            // $11
      maxAgeMonths,                                                                 // $12
      excludeIds.length > 0 ? excludeIds : ['00000000-0000-0000-0000-000000000000'], // $13
    ];

    // Order by similarity score and distance, limit results
    searchQuery += `
      ORDER BY similarity_score DESC, distance_km ASC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await query(searchQuery, params);

    // Calculate rental market statistics
    const comparablesFound = result.rows.length;
    const minRequired = 3; // Minimum for reliable rent estimation
    const hasGap = comparablesFound < minRequired;

    // Parse decimal strings to numbers for calculations
    const parseRent = (r: any) => parseFloat(r.asking_rent_monthly) || 0;
    const parseRentPerSqm = (r: any) => parseFloat(r.rent_per_sqm_monthly) || 0;

    const aggregates = comparablesFound > 0 ? {
      // Rental-specific metrics
      avgRentMonthly: Math.round(result.rows.reduce((sum: number, r: any) => sum + parseRent(r), 0) / comparablesFound),
      medianRentMonthly: (() => {
        const rents = result.rows.map((r: any) => parseRent(r)).sort((a: number, b: number) => a - b);
        const mid = Math.floor(rents.length / 2);
        return rents.length % 2 ? rents[mid] : Math.round((rents[mid - 1] + rents[mid]) / 2);
      })(),
      avgRentPerSqm: Math.round(
        result.rows.reduce((sum: number, r: any) => sum + parseRentPerSqm(r), 0) / comparablesFound * 100
      ) / 100,
      minRent: Math.min(...result.rows.map((r: any) => parseRent(r))),
      maxRent: Math.max(...result.rows.map((r: any) => parseRent(r))),
      minRentPerSqm: Math.round(Math.min(...result.rows.map((r: any) => parseRentPerSqm(r))) * 100) / 100,
      maxRentPerSqm: Math.round(Math.max(...result.rows.map((r: any) => parseRentPerSqm(r))) * 100) / 100,
      avgDistance: Math.round((result.rows.reduce((sum: number, r: any) => sum + (r.distance_km || 0), 0) / comparablesFound) * 10) / 10,
      avgSimilarity: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.similarity_score || 0), 0) / comparablesFound),
      // Suggested rent based on subject size (fallback to avg rent if no sqm data)
      suggestedRentForSubject: (() => {
        const avgRentPerSqm = result.rows.reduce((sum: number, r: any) => sum + parseRentPerSqm(r), 0) / comparablesFound;
        if (avgRentPerSqm > 0) {
          return Math.round(avgRentPerSqm * subjectSize);
        }
        // Fallback: use average rent if no sqm data available
        return Math.round(result.rows.reduce((sum: number, r: any) => sum + parseRent(r), 0) / comparablesFound);
      })(),
      suggestedRentPerSqm: Math.round(
        result.rows.reduce((sum: number, r: any) => sum + parseRentPerSqm(r), 0) / comparablesFound * 100
      ) / 100,
      confidence: Math.min(100, Math.round(
        (comparablesFound / 5) * 50 + // More comparables = higher confidence
        (result.rows.reduce((sum: number, r: any) => sum + (r.similarity_score || 0), 0) / comparablesFound / 100) * 50
      )),
    } : null;

    logger.info('Rental comparables search completed', {
      valuationId,
      comparablesFound,
      searchCriteria: { radiusKm, propertyType: searchPropertyType, maxAgeMonths },
    });

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
          bedroomsRange: { min: searchBedroomsMin, max: searchBedroomsMax },
          sizeRange: { min: searchSizeMin, max: searchSizeMax },
          maxAgeMonths,
        },
        count: comparablesFound,
        hasGap,
        aggregates,
        // Currency conversion info
        currencyConversion: {
          targetCurrency: 'GHS',
          fxRateUsed: result.rows[0]?.fx_rate_used || 15.5,
          usdCount: result.rows.filter((r: any) => r.price_currency === 'USD').length,
          ghsCount: result.rows.filter((r: any) => r.price_currency === 'GHS').length,
        },
        // Rent estimation helper
        rentEstimation: aggregates ? {
          suggestedMonthlyRent: aggregates.suggestedRentForSubject,
          rentPerSqm: aggregates.suggestedRentPerSqm,
          confidence: aggregates.confidence,
          comparablesUsed: comparablesFound,
          methodology: 'weighted_average',
          note: `Based on ${comparablesFound} rental comparable${comparablesFound === 1 ? '' : 's'} within ${radiusKm}km`,
        } : null,
        gapAnalysis: hasGap ? {
          required: minRequired,
          found: comparablesFound,
          shortfall: minRequired - comparablesFound,
          message: `Found ${comparablesFound} rental comparable${comparablesFound === 1 ? '' : 's'}, need at least ${minRequired} for reliable rent estimation`,
        } : null,
      },
    });

  } catch (error: any) {
    logger.error('Failed to search rental comparables', {
      valuationId: req.params.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to search for rental comparables',
      detail: error.message,
    });
  }
});

/**
 * @route GET /api/valuations/rental-benchmarks
 * @desc Get rental market benchmarks computed from Data Hub
 * @query area - Filter by area name (optional)
 * @query propertyType - Filter by property type (optional)
 * @access Private
 */
router.get('/rental-benchmarks', async (req: Request, res: Response) => {
  try {
    const { area, propertyType, limit = 50 } = req.query;

    let benchmarkQuery = `
      SELECT 
        id,
        area_name,
        area_type,
        property_type,
        listing_count,
        avg_rent_monthly,
        median_rent_monthly,
        min_rent_monthly,
        max_rent_monthly,
        avg_rent_per_sqm,
        median_rent_per_sqm,
        rent_by_bedrooms,
        vacancy_rate_estimate,
        avg_days_on_market,
        data_source,
        computed_at
      FROM rental_market_benchmarks
      WHERE 1=1
    `;
    const params: any[] = [];

    if (area) {
      params.push(`%${area}%`);
      benchmarkQuery += ` AND LOWER(area_name) LIKE LOWER($${params.length})`;
    }

    if (propertyType === 'all' || !propertyType) {
      // Return only aggregated benchmarks (property_type IS NULL)
      benchmarkQuery += ` AND property_type IS NULL`;
    } else if (propertyType) {
      params.push(propertyType);
      benchmarkQuery += ` AND property_type = $${params.length}`;
    }

    benchmarkQuery += ` ORDER BY listing_count DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));

    const result = await query(benchmarkQuery, params);

    res.json({
      success: true,
      data: result.rows,
      meta: {
        count: result.rows.length,
        dataSource: 'computed_from_data_hub',
        lastUpdated: result.rows[0]?.computed_at || null,
      },
    });

  } catch (error: any) {
    logger.error('Failed to fetch rental benchmarks', {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch rental market benchmarks',
    });
  }
});

/**
 * @route GET /api/valuations/rental-benchmarks/:area
 * @desc Get rental market benchmark for a specific area
 * @access Private
 */
router.get('/rental-benchmarks/:area', async (req: Request, res: Response) => {
  try {
    const { area } = req.params;
    const { propertyType } = req.query;

    // Try exact match first, then fuzzy match
    const benchmarkQuery = `
      SELECT 
        id,
        area_name,
        area_type,
        property_type,
        listing_count,
        avg_rent_monthly,
        median_rent_monthly,
        min_rent_monthly,
        max_rent_monthly,
        avg_rent_per_sqm,
        median_rent_per_sqm,
        rent_by_bedrooms,
        vacancy_rate_estimate,
        data_source,
        computed_at
      FROM rental_market_benchmarks
      WHERE (LOWER(area_name) = LOWER($1) OR LOWER(area_name) LIKE LOWER($2))
        AND ($3::text IS NULL OR property_type IS NULL OR property_type = $3)
      ORDER BY 
        CASE WHEN LOWER(area_name) = LOWER($1) THEN 0 ELSE 1 END,
        listing_count DESC
      LIMIT 1
    `;

    const result = await query(benchmarkQuery, [area, `%${area}%`, propertyType || null]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `No rental benchmark found for area: ${area}`,
        suggestion: 'Try a nearby area or check available benchmarks at /rental-benchmarks',
      });
    }

    const benchmark = result.rows[0];

    res.json({
      success: true,
      data: {
        areaName: benchmark.area_name,
        areaType: benchmark.area_type,
        propertyType: benchmark.property_type,
        listingCount: benchmark.listing_count,
        avgRentMonthly: parseFloat(benchmark.avg_rent_monthly),
        medianRentMonthly: parseFloat(benchmark.median_rent_monthly),
        minRentMonthly: parseFloat(benchmark.min_rent_monthly),
        maxRentMonthly: parseFloat(benchmark.max_rent_monthly),
        avgRentPerSqm: benchmark.avg_rent_per_sqm ? parseFloat(benchmark.avg_rent_per_sqm) : null,
        rentByBedrooms: benchmark.rent_by_bedrooms,
        vacancyRateEstimate: benchmark.vacancy_rate_estimate ? parseFloat(benchmark.vacancy_rate_estimate) : null,
        dataSource: benchmark.data_source,
        computedAt: benchmark.computed_at,
      },
    });

  } catch (error: any) {
    logger.error('Failed to fetch rental benchmark for area', {
      area: req.params.area,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch rental market benchmark',
    });
  }
});

// =====================================================
// CAP RATE ENDPOINTS
// =====================================================

import { capRateService, CapRateMethodology, ListingDerivedCapRate } from '../services/valuation-engine/CapRateService';

/**
 * @route GET /api/valuations/cap-rate/:region/:propertyType
 * @desc Get current market cap rate for region/property type combination.
 *       Uses RICS-compliant fallback hierarchy:
 *       1. Market extraction (transactions) - Category A
 *       2. Partner/bank data - Category A
 *       3. Listing-derived - Category B
 *       4. Survey/default - Category C
 * @access Private
 */
router.get('/cap-rate/:region/:propertyType', async (req: Request, res: Response) => {
  try {
    const { region, propertyType } = req.params;

    // Validate inputs
    const validRegions = ['greater_accra', 'kumasi_metro', 'eastern', 'western_cluster', 'northern_cluster'];
    const validPropertyTypes = ['residential_house', 'apartment_flat', 'commercial_office', 'commercial_shop', 'warehouse', 'mixed_use', 'land', 'industrial'];

    if (!validRegions.includes(region.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid region. Valid regions: ${validRegions.join(', ')}`
      });
    }

    if (!validPropertyTypes.includes(propertyType.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid property type. Valid types: ${validPropertyTypes.join(', ')}`
      });
    }

    // Select best cap rate methodology based on available data
    const capRateMethodology: CapRateMethodology = await capRateService.selectCapRateMethodology(
      region.toLowerCase(),
      propertyType.toLowerCase()
    );

    res.json({
      success: true,
      data: {
        region: region.toLowerCase(),
        propertyType: propertyType.toLowerCase(),
        capRate: capRateMethodology.capRate,
        range: {
          low: capRateMethodology.capRateLow,
          high: capRateMethodology.capRateHigh
        },
        confidence: capRateMethodology.confidence,
        methodology: capRateMethodology.method,
        ricsCategory: capRateMethodology.ricsCategory,
        sampleSize: capRateMethodology.sampleSize,
        description: capRateMethodology.description,
        uncertaintyNote: capRateMethodology.uncertaintyNote,
        source: capRateMethodology.source,
        retrievedAt: new Date().toISOString()
      },
      meta: {
        ricsCompliance: {
          category: capRateMethodology.ricsCategory,
          categoryDescription: capRateMethodology.ricsCategory === 'A'
            ? 'Direct transaction evidence'
            : capRateMethodology.ricsCategory === 'B'
              ? 'Adjusted listing evidence'
              : 'Indices, surveys, or defaults',
          materialUncertainty: capRateMethodology.confidence === 'limited' || capRateMethodology.confidence === 'insufficient',
          vps3Disclosure: capRateMethodology.uncertaintyNote || null
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get cap rate', {
      region: req.params.region,
      propertyType: req.params.propertyType,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve cap rate benchmark'
    });
  }
});

/**
 * @route POST /api/valuations/cap-rate/derive
 * @desc Manually trigger cap rate derivation from listings for a region/property type.
 *       This derives a new cap rate from current market listings and saves it as a benchmark.
 * @access Private (admin/valuer only)
 */
router.post('/cap-rate/derive', async (req: Request, res: Response) => {
  try {
    const { region, propertyType, forceRefresh = false } = req.body;

    // Validate inputs
    if (!region || !propertyType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Both region and propertyType are required'
      });
    }

    const validRegions = ['greater_accra', 'kumasi_metro', 'eastern', 'western_cluster', 'northern_cluster'];
    const validPropertyTypes = ['residential_house', 'apartment_flat', 'commercial_office', 'commercial_shop', 'warehouse', 'mixed_use', 'land', 'industrial'];

    if (!validRegions.includes(region.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid region. Valid regions: ${validRegions.join(', ')}`
      });
    }

    if (!validPropertyTypes.includes(propertyType.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid property type. Valid types: ${validPropertyTypes.join(', ')}`
      });
    }

    // Derive cap rate from listings
    const listingCapRate: ListingDerivedCapRate = await capRateService.deriveCapRateFromListings(
      region.toLowerCase(),
      propertyType.toLowerCase()
    );

    // Save the derived benchmark
    await capRateService.saveListingDerivedBenchmark(
      region.toLowerCase(),
      propertyType.toLowerCase(),
      listingCapRate
    );

    res.json({
      success: true,
      message: 'Cap rate derived and saved successfully',
      data: {
        region: region.toLowerCase(),
        propertyType: propertyType.toLowerCase(),
        derivedCapRate: listingCapRate.derivedCapRate,
        capRatePercentage: (listingCapRate.derivedCapRate * 100).toFixed(2) + '%',
        range: {
          low: listingCapRate.capRateLow,
          high: listingCapRate.capRateHigh,
          lowPercentage: (listingCapRate.capRateLow * 100).toFixed(2) + '%',
          highPercentage: (listingCapRate.capRateHigh * 100).toFixed(2) + '%'
        },
        methodology: listingCapRate.methodology,
        sampleSize: listingCapRate.sampleSize,
        confidence: listingCapRate.confidence,
        dataQuality: listingCapRate.dataQuality,
        marketCondition: listingCapRate.marketCondition,
        yieldTrend: listingCapRate.yieldTrend,
        warnings: listingCapRate.warnings,
        ricsDisclosure: listingCapRate.ricsDisclosure,
        impliedRatesSummary: {
          count: listingCapRate.impliedRates.length,
          avgAskingToAdjustedDiscount: listingCapRate.impliedRates.length > 0
            ? (listingCapRate.impliedRates.reduce((sum, r) => sum + r.adjustmentTotal, 0) / listingCapRate.impliedRates.length * 100).toFixed(2) + '%'
            : 'N/A',
          avgEstimatedNoi: listingCapRate.impliedRates.length > 0
            ? Math.round(listingCapRate.impliedRates.reduce((sum, r) => sum + r.estimatedNoi, 0) / listingCapRate.impliedRates.length)
            : 0
        },
        derivedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    logger.error('Failed to derive cap rate', {
      region: req.body.region,
      propertyType: req.body.propertyType,
      error: error.message,
      stack: error.stack
    });

    // Specific error handling
    if (error.message.includes('Insufficient')) {
      return res.status(422).json({
        error: 'Insufficient Data',
        message: error.message,
        suggestion: 'Need at least 3 listings with valid data to derive cap rate'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to derive cap rate from listings'
    });
  }
});

/**
 * @route GET /api/valuations/cap-rate/benchmarks
 * @desc Get all cap rate benchmarks currently stored in the database
 * @access Private
 */
router.get('/cap-rate/benchmarks', async (req: Request, res: Response) => {
  try {
    const { region, propertyType, methodology } = req.query;

    let benchmarkQuery = `
      SELECT 
        id,
        region,
        property_type,
        transaction_type,
        benchmark_cap_rate,
        cap_rate_range_low,
        cap_rate_range_high,
        sample_size,
        confidence_score,
        market_condition,
        yield_trend,
        data_quality,
        methodology,
        source_description,
        effective_date,
        expiry_date,
        created_at,
        updated_at
      FROM market_cap_rate_benchmarks
      WHERE (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    `;
    const params: any[] = [];

    if (region) {
      params.push(region);
      benchmarkQuery += ` AND region = $${params.length}::region_code_enum`;
    }

    if (propertyType) {
      params.push(propertyType);
      benchmarkQuery += ` AND property_type = $${params.length}::property_type_enum`;
    }

    if (methodology) {
      params.push(methodology);
      benchmarkQuery += ` AND methodology = $${params.length}`;
    }

    benchmarkQuery += ` ORDER BY region, property_type, methodology, effective_date DESC`;

    const result = await query(benchmarkQuery, params);

    res.json({
      success: true,
      data: result.rows.map((row: any) => ({
        id: row.id,
        region: row.region,
        propertyType: row.property_type,
        transactionType: row.transaction_type,
        benchmarkCapRate: parseFloat(row.benchmark_cap_rate),
        benchmarkCapRatePercentage: (parseFloat(row.benchmark_cap_rate) * 100).toFixed(2) + '%',
        range: {
          low: parseFloat(row.cap_rate_range_low),
          high: parseFloat(row.cap_rate_range_high)
        },
        sampleSize: row.sample_size,
        confidenceScore: parseFloat(row.confidence_score),
        marketCondition: row.market_condition,
        yieldTrend: row.yield_trend,
        dataQuality: row.data_quality,
        methodology: row.methodology,
        sourceDescription: row.source_description,
        effectiveDate: row.effective_date,
        expiryDate: row.expiry_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      meta: {
        count: result.rows.length,
        filters: { region, propertyType, methodology }
      }
    });

  } catch (error: any) {
    logger.error('Failed to fetch cap rate benchmarks', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch cap rate benchmarks'
    });
  }
});

/**
 * @route POST /api/valuations/cap-rate/income-approach
 * @desc Perform income approach valuation using the best available cap rate methodology
 * @access Private
 */
router.post('/cap-rate/income-approach', async (req: Request, res: Response) => {
  try {
    const {
      propertyId,
      region,
      propertyType,
      propertySubtype,
      totalAreaSqm,
      customNoi,
      customCapRate,
      vacancyRateOverride,
      expenseRatioOverride
    } = req.body;

    // Validate required inputs
    if (!region || !propertyType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'region and propertyType are required'
      });
    }

    if (!propertyId && !totalAreaSqm) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Either propertyId or totalAreaSqm is required for NOI estimation'
      });
    }

    // Perform income approach valuation
    const incomeResult = await capRateService.performIncomeApproachValuation({
      propertyId: propertyId || 'custom',
      region: region.toLowerCase(),
      propertyType: propertyType.toLowerCase(),
      propertySubtype,
      totalAreaSqm: totalAreaSqm ? parseFloat(totalAreaSqm) : undefined,
      customNoi: customNoi ? parseFloat(customNoi) : undefined,
      customCapRate: customCapRate ? parseFloat(customCapRate) : undefined,
      vacancyRateOverride: vacancyRateOverride ? parseFloat(vacancyRateOverride) : undefined,
      expenseRatioOverride: expenseRatioOverride ? parseFloat(expenseRatioOverride) : undefined
    });

    res.json({
      success: true,
      data: {
        indicatedValue: incomeResult.indicatedValue,
        valueRange: incomeResult.valueRange,
        confidenceScore: incomeResult.confidenceScore,
        methodology: incomeResult.methodology,
        noi: {
          grossPotentialRent: incomeResult.noi.grossPotentialRent,
          vacancyRate: incomeResult.noi.vacancyRate,
          vacancyLoss: incomeResult.noi.vacancyLoss,
          effectiveGrossIncome: incomeResult.noi.effectiveGrossIncome,
          operatingExpenses: incomeResult.noi.operatingExpenses,
          operatingExpenseRatio: incomeResult.noi.operatingExpenseRatio,
          netOperatingIncome: incomeResult.noi.netOperatingIncome,
          noiPerSqm: incomeResult.noi.noiPerSqm,
          methodology: incomeResult.noi.methodology,
          confidenceScore: incomeResult.noi.confidenceScore,
          evidenceCount: incomeResult.noi.evidenceCount
        },
        capRate: {
          baseCapRate: incomeResult.capRate.baseCapRate,
          adjustedCapRate: incomeResult.capRate.adjustedCapRate,
          adjustedCapRatePercentage: (incomeResult.capRate.adjustedCapRate * 100).toFixed(2) + '%',
          capRateRange: incomeResult.capRate.capRateRange,
          adjustments: incomeResult.capRate.adjustments,
          methodology: incomeResult.capRate.methodology,
          justification: incomeResult.capRate.justification,
          dataQuality: incomeResult.capRate.dataQuality,
          confidenceScore: incomeResult.capRate.confidenceScore,
          warnings: incomeResult.capRate.warnings
        },
        ricsCompliance: incomeResult.ricsCompliance
      }
    });

  } catch (error: any) {
    logger.error('Failed to perform income approach valuation', {
      body: req.body,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to perform income approach valuation'
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

// NOTE: LLM Design Intent routes were removed as part of Blender/LLM cleanup
// The floor plan builder now uses pure Fabric.js canvas on the frontend
// Data flows: ComprehensivePropertyForm → properties table → Fabric.js Floor Plan Builder

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
    res.setHeader('Content-Disposition', `inline; filename="floor-${floorPlan.floor_number}.${ext}"`);
    res.send(Buffer.from(file.body));
  } catch (error: any) {
    logger.error('Failed to stream floor plan image', { planId: req.params.planId, error: error.message });
    res.status(500).json({ error: 'Failed to stream floor plan image', message: error.message });
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

    logger.info('HBU save request received', {
      valuationId,
      recommendedUse,
      analysisNotes,
      legallyPermissible,
      physicallyPossible,
      financiallyFeasible,
      maximallyProductive
    });

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
    const valuationId = req.params.id;

    // First try to get basket from valuation_comparable_baskets
    const basketResult = await query(
      `SELECT * FROM valuation_comparable_baskets 
       WHERE valuation_id = $1 AND is_primary = true
       ORDER BY created_at DESC LIMIT 1`,
      [valuationId]
    );

    // If basket exists, get comparables from valuation_basket_comparables (the correct table)
    let comparablesResult;
    if (basketResult.rows.length > 0) {
      const basketId = basketResult.rows[0].id;
      comparablesResult = await query(
        `SELECT vbc.*, p.* 
         FROM valuation_basket_comparables vbc
         LEFT JOIN properties p ON vbc.comparable_property_id = p.id
         WHERE vbc.basket_id = $1
         ORDER BY vbc.added_at DESC NULLS LAST`,
        [basketId]
      );
    } else {
      // Fallback: try valuation_comparables (legacy)
      comparablesResult = await query(
        `SELECT vc.*, p.* 
         FROM valuation_comparables vc
         LEFT JOIN properties p ON vc.comparable_property_id = p.id
         WHERE vc.valuation_id = $1
         ORDER BY vc.similarity_score DESC NULLS LAST`,
        [valuationId]
      );
    }

    if (basketResult.rows.length === 0 && comparablesResult.rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        id: basketResult.rows[0]?.id || null,
        valuation_id: valuationId,
        basket_name: basketResult.rows[0]?.basket_name || 'Primary Basket',
        is_primary: true,
        comparable_count: comparablesResult.rows.length,
        avg_adjusted_value: basketResult.rows[0]?.avg_adjusted_value || null,
        comparables: comparablesResult.rows.map((row: any) => ({
          ...row,
          sale_price: row.price || row.asking_price_ghs || row.sale_price || 0,
          gfa: row.built_area_sqm || row.building_size_sqm || row.total_area_sqm || 0,
        }))
      }
    });
  } catch (error: any) {
    logger.error('Failed to get basket', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to get basket', message: error.message });
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

    // Create or update primary basket - use existing columns
    const basketResult = await query(
      `INSERT INTO valuation_comparable_baskets 
        (valuation_id, basket_name, is_primary, comparable_count, avg_adjusted_value, created_by, created_at)
       VALUES ($1, 'Primary Basket', true, $2, $3, $4, NOW())
       ON CONFLICT (valuation_id, basket_name) 
       DO UPDATE SET comparable_count = $2, avg_adjusted_value = $3
       RETURNING *`,
      [valuationId, comparables?.length || 0, indicatedValue, (req as any).user?.id]
    );

    const basketId = basketResult.rows[0]?.id;

    // Clear existing comparables and add new ones
    if (comparables && comparables.length > 0) {
      // First, delete existing comparables for this valuation
      await query('DELETE FROM valuation_comparables WHERE valuation_id = $1', [valuationId]);

      for (const comp of comparables) {
        await query(
          `INSERT INTO valuation_comparables 
            (valuation_id, comparable_property_id, source_type, property_type, bedrooms, bathrooms, 
             building_size_sqm, sale_price, sale_date, adjusted_price, adjustments)
           VALUES ($1, $2, 'database', $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            valuationId,
            comp.property_id || comp.id,
            comp.property_type,
            comp.bedrooms,
            comp.bathrooms,
            comp.gfa || comp.building_size_sqm || 0,
            comp.sale_price || comp.price || comp.adjustedPrice || 0,
            comp.sale_date || comp.listing_date || new Date().toISOString().split('T')[0],
            comp.adjusted_price || comp.adjustedPrice || comp.sale_price || comp.price || 0,
            JSON.stringify(comp.adjustments || {})
          ]
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
      `SELECT * FROM valuation_basket_comparables 
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
    // Accept both property_id (frontend) and comparable_property_id (legacy)
    const { comparable_property_id, property_id, is_manual_entry, manual_data, weight, tags, similarity_score } = req.body;
    const propertyId = comparable_property_id || property_id;

    if (!propertyId) {
      return res.status(400).json({ error: 'property_id or comparable_property_id is required' });
    }

    const result = await query(
      `INSERT INTO valuation_basket_comparables 
        (basket_id, comparable_property_id, is_manual_entry, manual_data, weight, tags, added_by, added_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [req.params.basketId, propertyId, is_manual_entry || false, manual_data, weight || similarity_score || 1.0, tags, (req as any).user?.id]
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
      `UPDATE valuation_basket_comparables SET
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
      FROM valuation_basket_comparables WHERE basket_id = $1`,
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
      'SELECT SUM(weight) as total_weight FROM valuation_basket_comparables WHERE basket_id = $1 AND is_excluded = false',
      [req.params.basketId]
    );
    const totalWeight = parseFloat(totalResult.rows[0]?.total_weight) || 1;

    // Normalize all weights
    await query(
      `UPDATE valuation_basket_comparables 
       SET weight = weight / $1, is_weight_manual = false
       WHERE basket_id = $2 AND is_excluded = false`,
      [totalWeight, req.params.basketId]
    );

    // Fetch updated comparables
    const result = await query(
      'SELECT * FROM valuation_basket_comparables WHERE basket_id = $1 AND is_excluded = false ORDER BY weight DESC',
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
 * Create reconciliation with method results
 */
router.post('/:id/reconciliation', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { method_results, weighting_method, property_type, valuation_purpose } = req.body;

    if (!method_results || Object.keys(method_results).length === 0) {
      return res.status(400).json({ error: 'method_results is required' });
    }

    // Calculate weighted average from method_results directly (don't rely on Python service)
    let weightedSum = 0;
    let totalWeight = 0;
    let confidenceSum = 0;
    const methodWeights: Record<string, number> = {};
    const values: number[] = [];

    Object.entries(method_results).forEach(([method, data]: [string, any]) => {
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
        JSON.stringify(method_results),
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

    const result = await query(
      `UPDATE valuation_reconciliations SET
        method_weights = $1,
        weighting_method = 'manual',
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [JSON.stringify(weights), req.params.reconciliationId]
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
           adjustments, adjusted_price, weight, notes, sale_price, sale_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          valuationId,
          basketId,
          comp.property_id || comp.id,
          comp.similarity_score || 80,
          JSON.stringify(comp.adjustments || {}),
          comp.adjusted_price || comp.adjustedPrice || comp.sale_price || comp.price || 0,
          comp.weight || 1.0,
          comp.notes || null,
          comp.sale_price || comp.price || comp.adjustedPrice || 0,
          comp.sale_date || comp.listing_date || new Date().toISOString().split('T')[0],
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

// =====================================================
// FLOOR PLAN ENHANCEMENT ROUTES (Phase 1)
// NOTE: Blender/LLM geometry and design intent routes were removed
// Floor plan builder now uses pure Fabric.js on frontend
// =====================================================

import floorPlanDesignRoutes from './floor-plan-design';

// Mount the floor plan design routes
// Design routes: /api/valuations/:valuationId/floor-plans/design
router.use('/', floorPlanDesignRoutes);

// =====================================================
// VALUATION REPORT DATA ENDPOINTS (Phase 2)
// =====================================================

/**
 * Get inspection data for a valuation
 * GET /api/valuations/:id/inspection
 */
router.get('/:id/inspection', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const inspectionData = await reportDataService.getInspectionData(req.params.id);
    res.json(inspectionData);
  } catch (error: any) {
    logger.error('Failed to get inspection data', {
      valuationId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get inspection data',
    });
  }
});

/**
 * Get engagement/terms of engagement for a valuation
 * GET /api/valuations/:id/engagement
 */
router.get('/:id/engagement', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const engagementData = await reportDataService.getEngagementData(req.params.id);
    res.json(engagementData);
  } catch (error: any) {
    logger.error('Failed to get engagement data', {
      valuationId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get engagement data',
    });
  }
});

/**
 * Update engagement/terms of engagement for a valuation
 * PUT /api/valuations/:id/engagement
 */
router.put('/:id/engagement', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id: valuationId } = req.params;
    const {
      client_name,
      client_address,
      client_email,
      client_phone,
      client_company,
      client_contact,
      request_type,
      request_date,
      purpose,
      basis_of_value,
      special_assumptions,
      departures,
      intended_user_name,
      intended_user_relationship,
      intended_user_address,
    } = req.body;

    // Check if engagement exists
    const existing = await query(
      `SELECT id FROM valuation_engagements WHERE valuation_id = $1`,
      [valuationId]
    );

    if (existing.rows.length === 0) {
      // Create new engagement - purpose is required so use a default
      // request_type must be: 'written', 'verbal', or 'online'
      const validRequestType = ['written', 'verbal', 'online'].includes(request_type)
        ? request_type
        : 'written';

      const insertResult = await query(
        `INSERT INTO valuation_engagements (
          valuation_id, client_name, client_address, client_contact, client_email, client_company,
          request_type, request_date, purpose, basis_of_value, special_assumptions, departures,
          intended_user_name, intended_user_relationship, intended_user_address,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        RETURNING *`,
        [
          valuationId,
          client_name || null,
          client_address || null,
          client_phone || client_contact || null,
          client_email || null,
          client_company || null,
          validRequestType,
          request_date || null,
          purpose || 'Market Value Assessment',  // Required field - use default
          basis_of_value || 'market_value',
          special_assumptions || null,
          departures || null,
          intended_user_name || null,
          intended_user_relationship || null,
          intended_user_address || null,
        ]
      );

      logger.info('Created engagement record', { valuationId });
      return res.json({
        success: true,
        data: insertResult.rows[0],
      });
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      client_name: 'client_name',
      client_address: 'client_address',
      client_email: 'client_email',
      client_phone: 'client_contact',
      client_company: 'client_company',
      client_contact: 'client_contact',
      request_type: 'request_type',
      request_date: 'request_date',
      purpose: 'purpose',
      basis_of_value: 'basis_of_value',
      special_assumptions: 'special_assumptions',
      departures: 'departures',
      intended_user_name: 'intended_user_name',
      intended_user_relationship: 'intended_user_relationship',
      intended_user_address: 'intended_user_address',
    };

    for (const [reqField, dbField] of Object.entries(fieldMappings)) {
      if (req.body[reqField] !== undefined) {
        // Skip duplicate mappings
        if (!updates.some(u => u.startsWith(`${dbField} =`))) {
          // Validate request_type if being updated
          let value = req.body[reqField];
          if (reqField === 'request_type') {
            value = ['written', 'verbal', 'online'].includes(value) ? value : 'written';
          }
          updates.push(`${dbField} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update',
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(valuationId);

    const updateQuery = `
      UPDATE valuation_engagements
      SET ${updates.join(', ')}
      WHERE valuation_id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, values);

    logger.info('Updated engagement record', { valuationId });
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    logger.error('Failed to update engagement data', {
      valuationId: req.params.id,
      error: error.message,
      stack: error.stack,
      body: req.body,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to update engagement data',
    });
  }
});

export default router;
