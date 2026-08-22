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
import valuationAiRoutes from './valuationAiRoutes';
import valuationComparablesRoutes from './valuationComparablesRoutes';
import valuationReportRoutes from './valuationReportRoutes';
import { validateUUID, engineHeaders } from './valuationRouteMiddleware';

const router = Router();

// Direct engine fetches must carry the shared secret — see valuationRouteMiddleware.engineHeaders.

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

router.use(valuationAiRoutes);

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
          bedrooms, bathrooms, land_area_sqm, built_area_sqm, year_built, price, price_currency,
          data_source, status, created_by, 
          owner_name, owner_email, owner_phone, owner_address, owner_contact_preference,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27,
          $28
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
          property.built_area_sqm || property.gfa || null,
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
          // Persist the full comprehensive form snapshot so the valuation report's
          // metadata.* lookups (city/neighbourhood/location/brief descriptions, building
          // elements, risk assessment, etc.) resolve. Previously dropped on save.
          property.comprehensive_data || {},
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

    // Create valuation engagement record from the client the valuer entered. The
    // comprehensive form nests client fields under comprehensive_data, so read there too.
    // The property OWNER is NOT the client — do not substitute it.
    else if (property?.client_name || property?.comprehensive_data?.client_name || property?.request_type || property?.comprehensive_data?.request_type) {
      const cd = property?.comprehensive_data || {};
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
            property.client_name || cd.client_name || null,
            property.client_address || cd.client_address || null,
            property.client_email || cd.client_email || null,
            property.client_phone || cd.client_phone || null,
            property.request_type || cd.request_type || 'written',
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
        p.built_area_sqm,
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

    // Single source of truth for currency: fetch the LIVE USD/GHS rate from the DB
    // (same indicator the comparable search uses). All comparable prices are normalised
    // to GHS exactly once, here, and tagged 'GHS' so nothing downstream re-converts.
    const fxResult = await query(
      `SELECT value FROM economic_indicators
       WHERE indicator_type = 'exchange_rate_usd'
       ORDER BY effective_date DESC LIMIT 1`
    );
    const usdToGhs = parseFloat(fxResult.rows[0]?.value);
    // No fallback by design: refuse to value with a guessed rate rather than emit a wrong number.
    if (!usdToGhs || usdToGhs <= 0) {
      return res.status(503).json({
        error: 'FX rate unavailable',
        message: 'No live USD/GHS exchange rate is available. Valuation refused — a guessed rate is never used.',
      });
    }
    const toGhs = (price: number, currency?: string | null): number =>
      (currency || 'GHS').toUpperCase() === 'USD' ? price * usdToGhs : price;

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

    // Use comparables from request body if provided (frontend sends them before basket is saved)
    if (req.body.comparables && Array.isArray(req.body.comparables) && req.body.comparables.length > 0) {
      // The engine NEVER trusts frontend-supplied prices/sizes. Resolve each comparable's
      // authoritative price + currency + building area from the properties table by id, and
      // convert to GHS exactly once. The frontend only contributes the selection + weights.
      const bodyComps = req.body.comparables;
      const ids = bodyComps.map((c: any) => c.id).filter(Boolean);
      const propRows = ids.length
        ? (await query(
            `SELECT id, price, price_currency, built_area_sqm, land_area_sqm,
                    bedrooms, bathrooms, year_built, address_district, evidence_type
             FROM properties WHERE id = ANY($1)`,
            [ids]
          )).rows
        : [];
      const byId = new Map(propRows.map((r: any) => [String(r.id), r]));
      comparables = bodyComps.map((c: any) => {
        const p = byId.get(String(c.id));
        if (!p) {
          // Manual/unsaved comparable not in properties — convert its supplied native price once
          return { ...c, price: toGhs(parseFloat(c.price) || 0, c.price_currency), price_currency: 'GHS' };
        }
        return {
          ...c,
          price: toGhs(parseFloat(p.price) || 0, p.price_currency), // DB-native price, converted ONCE
          price_currency: 'GHS',
          gfa_sqm: p.built_area_sqm || c.gfa_sqm || p.land_area_sqm, // building area is the size basis
          land_area_sqm: p.land_area_sqm,
          bedrooms: c.bedrooms ?? p.bedrooms,
          bathrooms: c.bathrooms ?? p.bathrooms,
          year_built: c.year_built ?? p.year_built,
          address_district: c.address_district ?? p.address_district,
          evidence_type: c.evidence_type ?? p.evidence_type ?? 'listing',
        };
      });
      logger.info('Resolved request-body comparables from DB', { count: comparables.length, usdToGhs });
    } else if (basketResult.rows.length > 0) {
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
          p.built_area_sqm,
          p.year_built,
          p.region,
          p.address_city,
          p.address_district,
          p.property_type,
          p.evidence_type,
          p.transaction_date,
          p.latitude,
          p.longitude,
          p.created_at as listing_date
        FROM valuation_basket_comparables bc
        JOIN properties p ON bc.comparable_property_id = p.id
        WHERE bc.basket_id = $1 AND bc.is_excluded = false
        ORDER BY bc.weight DESC`,
        [basketId]
      );

      comparables = comparablesResult.rows.map((comp: any) => ({
        id: comp.comparable_property_id || comp.id,
        // Normalise to GHS once, here, using the live rate; tag GHS so Python never re-converts
        price: toGhs(parseFloat(comp.price) || 0, comp.price_currency),
        price_currency: 'GHS',
        bedrooms: comp.bedrooms,
        bathrooms: comp.bathrooms,
        gfa_sqm: comp.built_area_sqm || comp.land_area_sqm, // building area is the GFA basis; land only as last resort
        land_area_sqm: comp.land_area_sqm,
        year_built: comp.year_built,
        condition: 'good',
        region: comp.region,
        address_city: comp.address_city,
        address_district: comp.address_district,
        property_type: comp.property_type,
        evidence_type: comp.evidence_type || 'listing',
        // REAL transaction date drives the RICS time adjustment; the row's created_at
        // (listing_date) is only a proxy when no transaction date is recorded.
        transaction_date: comp.transaction_date || comp.listing_date,
        latitude: comp.latitude != null ? Number(comp.latitude) : null,
        longitude: comp.longitude != null ? Number(comp.longitude) : null,
        weight: parseFloat(comp.weight) || 1.0,
        adjustments: {} // Adjustments calculated by Python service
      }));
    }

    if (comparables.length === 0) {
      logger.warn('No comparables available for Python valuation', { valuationId });
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
      // GFA must be the BUILDING area, not the plot. Land area only as a last-resort fallback.
      building_size_sqm: valuation.built_area_sqm || valuation.land_area_sqm,
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

    // Sales comparison is RICS-only and REQUIRES real comparable evidence. There is no simplified
    // fallback that fabricates a value from a price-per-sqm — if there are no comparables, the method
    // is not applicable and we fail loudly so the valuer adds evidence or chooses another method.
    if (comparables.length === 0) {
      return res.status(422).json({
        error: 'Insufficient Evidence',
        message: 'Sales comparison requires at least one comparable property. Add comparable evidence or use a different valuation method.',
      });
    }

    // ── Market-derived adjustment inputs (RICS Comparable Evidence GN) ──
    // 1) TIME: regional 12-month movement of median GHS/sqm from the transaction
    //    record (recent 6 months vs the 12-18-months-ago window). Passed to the
    //    engine as options.annual_market_movement_pct; the engine falls back to its
    //    flagged default when the sample is too thin (nulls here).
    let annualMarketMovementPct: number | null = null;
    try {
      const mv = await query(
        `WITH recent AS (
           SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price / NULLIF(built_area_sqm, 0)) AS med,
                  COUNT(*) AS n
           FROM properties
           WHERE region = $1::region_code_enum AND price > 0 AND built_area_sqm > 0
             AND transaction_type = 'sale'
             AND COALESCE(transaction_date, created_at::date) >= CURRENT_DATE - INTERVAL '6 months'
         ), prior AS (
           SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price / NULLIF(built_area_sqm, 0)) AS med,
                  COUNT(*) AS n
           FROM properties
           WHERE region = $1::region_code_enum AND price > 0 AND built_area_sqm > 0
             AND transaction_type = 'sale'
             AND COALESCE(transaction_date, created_at::date) BETWEEN CURRENT_DATE - INTERVAL '18 months'
                                                                  AND CURRENT_DATE - INTERVAL '12 months'
         )
         SELECT recent.med AS recent_med, recent.n AS recent_n, prior.med AS prior_med, prior.n AS prior_n
         FROM recent, prior`,
        [valuation.region || 'greater_accra']
      );
      const r = mv.rows[0];
      if (r?.recent_med && r?.prior_med && Number(r.recent_n) >= 8 && Number(r.prior_n) >= 8) {
        annualMarketMovementPct = (Number(r.recent_med) / Number(r.prior_med) - 1) * 100;
      }
    } catch (e: any) {
      logger.warn('Market movement derivation failed — engine will use its flagged default', { error: e.message });
    }

    // 2) LOCATION: district price relativity — median GHS/sqm of the subject's district
    //    vs each comp's district (last 24 months, min sample 5). The engine converts the
    //    observed differential into the location adjustment; distance alone never signs it.
    const districtMedians = new Map<string, number>();
    try {
      const districts = Array.from(new Set(
        [valuation.address_district, ...comparables.map((c: any) => c.address_district)]
          .filter((d: any) => typeof d === 'string' && d.trim())
          .map((d: string) => d.trim().toLowerCase())
      ));
      if (districts.length > 1 && valuation.address_district) {
        const dm = await query(
          `SELECT LOWER(TRIM(address_district)) AS district,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY price / NULLIF(built_area_sqm, 0)) AS med
           FROM properties
           WHERE region = $1::region_code_enum AND price > 0 AND built_area_sqm > 0
             AND LOWER(TRIM(address_district)) = ANY($2)
             AND COALESCE(transaction_date, created_at::date) >= CURRENT_DATE - INTERVAL '24 months'
           GROUP BY LOWER(TRIM(address_district))
           HAVING COUNT(*) >= 5`,
          [valuation.region || 'greater_accra', districts]
        );
        for (const row of dm.rows) districtMedians.set(row.district, Number(row.med));
      }
    } catch (e: any) {
      logger.warn('District relativity derivation failed — engine falls back per-comp', { error: e.message });
    }
    const subjDistrictMed = valuation.address_district
      ? districtMedians.get(String(valuation.address_district).trim().toLowerCase())
      : undefined;

    // 3) DISTANCE: Haversine subject→comp so the engine can recognise same-locality
    //    comps (<=2 km ⇒ no location adjustment needed).
    const toRad = (x: number) => (x * Math.PI) / 180;
    const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const dLat = toRad(bLat - aLat);
      const dLng = toRad(bLng - aLng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.sqrt(h));
    };
    for (const c of comparables as any[]) {
      const compDistrict = c.address_district ? String(c.address_district).trim().toLowerCase() : null;
      const compMed = compDistrict ? districtMedians.get(compDistrict) : undefined;
      c.district_price_relativity = subjDistrictMed && compMed ? subjDistrictMed / compMed : null;
      c.distance_km = (valuation.latitude != null && valuation.longitude != null && c.latitude != null && c.longitude != null)
        ? haversineKm(Number(valuation.latitude), Number(valuation.longitude), c.latitude, c.longitude)
        : null;
    }

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pythonEndpoint = `${pythonBase}/api/v1/methods/sales-comparison`;

    const requestBody = {
      property: propertyData,
      comparables: comparables,
      valuation_date: new Date().toISOString(),
      usd_to_ghs_rate: usdToGhs, // live DB rate (comps already GHS; passed only as a safety net)
      options: {
        ...(req.body.options || {}),
        ...(annualMarketMovementPct != null ? { annual_market_movement_pct: annualMarketMovementPct } : {}),
      },
    };

    const pythonResponse = await fetch(pythonEndpoint, {
      method: 'POST',
      headers: engineHeaders(),
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
      subject_gfa?: number;
      implied_price_per_sqm?: number;
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

    // Persist the sales-comparison RESULT (engine calculation) while PRESERVING the valuer's overlays.
    // Robustness contract: a recalculation must NEVER trample manual work.
    //  - the fresh sales result is MERGED into method_results.sales_comparison (other methods untouched),
    //    keeping the valuer's per-method weight / primary-flag overlay across recalculations;
    //  - method_weights and final_value_ghs (the reconciliation overlay) are NEVER written here;
    //  - the overall headline (estimated_value / range / confidence) is set ONLY when the valuation has
    //    not yet been reconciled (final_value_ghs IS NULL); once reconciled, the reconciled value stands.
    if (pythonResult.success && pythonResult.estimated_value) {
      // Sales comparison is now a single RICS-compliant methodology (legacy passthrough removed),
      // so every result here carries the full RICS evidence grid.
      const isRICS = pythonResult.method === 'sales_comparison';

      const existingResults: Record<string, any> = (valuation.method_results && typeof valuation.method_results === 'object')
        ? valuation.method_results
        : {};
      const existingSales: any = existingResults.sales_comparison || {};
      const salesResult = {
        method: 'sales_comparison',
        value: pythonResult.estimated_value,
        value_ghs: pythonResult.estimated_value,
        confidence: pythonResult.confidence_score,
        confidence_score: pythonResult.confidence_score,
        confidence_level: pythonResult.confidence_level,
        // preserve the valuer's overlay (weight / primary flag) — a recalc keeps manual reconciliation intent
        weight: typeof existingSales.weight === 'number' ? existingSales.weight : 0,
        is_primary: existingSales.is_primary ?? false,
        value_range: pythonResult.value_range,
        details: {
          ...(pythonResult.details || {}),
          indicated_value: pythonResult.estimated_value,
          ...(isRICS ? {
            comparables_analyzed: pythonResult.comparables_analyzed,
            adjustment_grid: pythonResult.adjustment_grid,
            methodology_notes: pythonResult.methodology_notes,
          } : {}),
        },
        assumptions: pythonResult.assumptions,
        limitations: pythonResult.limitations,
        calculated_at: new Date().toISOString(),
        calculated_by: 'python_rics_engine',
      };
      const mergedResults = { ...existingResults, sales_comparison: salesResult };

      const existingMethodsUsed: string[] = Array.isArray(valuation.methods_used)
        ? valuation.methods_used
        : (() => { try { return JSON.parse(valuation.methods_used || '[]'); } catch { return []; } })();
      const mergedMethodsUsed = Array.from(new Set([...existingMethodsUsed, 'sales_comparison']));

      const updateResult = await query(
        `UPDATE valuations SET
          method_results = $1,
          sales_comparison_value = $2,
          sales_comparison_confidence = $3,
          methods_used = $4,
          estimated_value  = CASE WHEN final_value_ghs IS NULL THEN $5 ELSE estimated_value END,
          value_range_low  = CASE WHEN final_value_ghs IS NULL THEN $6 ELSE value_range_low END,
          value_range_high = CASE WHEN final_value_ghs IS NULL THEN $7 ELSE value_range_high END,
          confidence_score = CASE WHEN final_value_ghs IS NULL THEN $8 ELSE confidence_score END,
          updated_at = NOW()
        WHERE id = $9
        RETURNING *`,
        [
          JSON.stringify(mergedResults),
          pythonResult.estimated_value,
          pythonResult.confidence_score,
          JSON.stringify(mergedMethodsUsed),
          pythonResult.estimated_value,
          pythonResult.value_range?.low,
          pythonResult.value_range?.high,
          pythonResult.confidence_score,
          valuationId,
        ]
      );

      const duration = Date.now() - startTime;

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
            subject_gfa: pythonResult.subject_gfa,
            implied_price_per_sqm: pythonResult.implied_price_per_sqm,
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
    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pythonResponse = await fetch(`${pythonBase}/health`, {
      method: 'GET',
      headers: engineHeaders(),
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

    // Normalize date fields: empty string → NULL, ISO datetime → yyyy-MM-dd.
    // (A native date picker / DateField can send '' or a full ISO timestamp, both of which a
    // Postgres `date` column rejects — "invalid input syntax for type date".)
    for (const df of ['effective_date', 'inspection_date', 'instruction_date']) {
      const v = updateData[df];
      if (v === undefined) continue;
      if (v === '' || v === null) updateData[df] = null;
      else if (typeof v === 'string') updateData[df] = v.split('T')[0];
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
      // Forced Sale Value (valuer-set on the reconciliation page; read by the report)
      'fsv_discount_percent',
      'force_sale_value',
      'force_sale_value_usd',
      'sensitivity_analysis',
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

    // Intermediate/non-valuation method keys that should not be stored in method_results (Recommendation 4)
    // These are intermediate calculation data, not standalone valuation methods
    const INTERMEDIATE_METHOD_KEYS = ['rental_market', 'rental_market_analysis', 'land_value'];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        // Handle JSONB fields - merge with existing
        const jsonbFields = ['method_results', 'hbu_results', 'hbu_analysis', 'method_weights', 'methods_used', 'rental_market_analysis'];
        if (jsonbFields.includes(field)) {
          let fieldData = updateData[field];

          // Filter intermediate method data from method_results at storage time
          if (field === 'method_results' && typeof fieldData === 'object' && fieldData !== null) {
            const filtered: Record<string, any> = {};
            for (const [key, val] of Object.entries(fieldData)) {
              if (!INTERMEDIATE_METHOD_KEYS.includes(key)) {
                filtered[key] = val;
              } else {
                logger.debug('Filtered intermediate method from method_results', { valuationId: id, method: key });
              }
            }
            fieldData = filtered;
          }

          updates.push(`${field} = COALESCE(${field}, '{}'::jsonb) || $${paramIndex}::jsonb`);
          values.push(JSON.stringify(fieldData));
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

    // Auto-transition valuation status based on current_step (Recommendation 2)
    // When all 7 workflow steps are complete (step 7 = report generation),
    // mark the valuation as completed. The pending_review status applies only to reports.
    if (updateData.current_step) {
      const updatedRow = result.rows[0];
      const step = parseInt(updatedRow.current_step);
      const currentStatus = updatedRow.status;

      if (step >= 7 && (currentStatus === 'in_progress' || currentStatus === 'draft' || currentStatus === 'pending_review')) {
        await query(
          `UPDATE valuations SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [id]
        );
        logger.info('Auto-transitioned valuation status to completed', { valuationId: id, step });
      } else if (step > 1 && currentStatus === 'draft') {
        await query(
          `UPDATE valuations SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
          [id]
        );
        logger.info('Auto-transitioned valuation status to in_progress', { valuationId: id, step });
      }
    }

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


router.use(valuationComparablesRoutes);
router.use(valuationReportRoutes);

/**
 * @route GET /api/valuations/market/:region
 * @desc Get market conditions for a region
 * @access Private
 */
router.get('/market/:region', async (req: Request, res: Response) => {
  try {
    const { region } = req.params;
    const propertyType = (req.query.propertyType as string) || (req.query.property_type as string) || 'house';

    // Validate region
    const validRegions: RegionCode[] = [
      'greater_accra',
      'ashanti',
      'eastern',
      'central',
      'western',
      'volta',
      'northern',
      'upper_east',
      'upper_west',
      'bono',
      'bono_east',
      'ahafo',
      'savannah',
      'north_east',
      'oti',
      'western_north',
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
 * DELETE /api/valuations/baskets/:basketId/comparables
 * Clear all comparables from a basket (used when re-selecting comparables)
 */
router.delete('/baskets/:basketId/comparables', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM valuation_basket_comparables WHERE basket_id = $1`,
      [req.params.basketId]
    );
    res.json({ success: true, deleted: result.rowCount });
  } catch (error: any) {
    logger.error('Failed to clear basket comparables', { error: error.message });
    res.status(500).json({ error: 'Failed to clear basket comparables', message: error.message });
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

    // weight = analyst weighting (defaults 1.0); quality_score = the search's
    // similarity score persisted so a restored selection keeps its provenance.
    // Search reports similarity on a 0-100 scale but the column is numeric(5,4) —
    // store as a 0-1 fraction (95 → 0.95) or the insert overflows.
    const qualityScore = similarity_score != null && Number.isFinite(Number(similarity_score))
      ? Math.max(0, Math.min(1, Number(similarity_score) > 1 ? Number(similarity_score) / 100 : Number(similarity_score)))
      : null;
    const result = await query(
      `INSERT INTO valuation_basket_comparables
        (basket_id, comparable_property_id, is_manual_entry, manual_data, weight, quality_score, tags, added_by, added_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [req.params.basketId, propertyId, is_manual_entry || false, manual_data, weight || 1.0, qualityScore, tags, (req as any).user?.id]
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

// NOTE: the real POST /:id/sensitivity (driver-based per-method engine re-runs, RICS VPS 3) is
// defined earlier in this file. A second, legacy POST /:id/sensitivity used to live here and was
// dead (shadowed by the earlier registration); it has been removed.

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

    // Update valuations.method_results to include sales_comparison so it's available for reconciliation
    if (indicated_value && indicated_value > 0) {
      const confidenceScore = Math.min(0.95, 0.5 +
        (evidenceQuality.verifiedSales * 0.15) +
        (evidenceQuality.delistedInferred * 0.10) +
        (evidenceQuality.contributed * 0.05) +
        (Math.min(comparables.length, 5) * 0.03)
      );
      await query(
        `UPDATE valuations SET
          method_results = COALESCE(method_results, '{}'::jsonb) || $1::jsonb,
          sales_comparison_value = $2,
          sales_comparison_confidence = $3,
          comparables_count = $4,
          updated_at = NOW()
        WHERE id = $5`,
        [
          JSON.stringify({
            sales_comparison: {
              value: indicated_value,
              method: 'sales_comparison',
              weight: 0,
              confidence_score: confidenceScore,
              confidence: confidenceScore,
              data_quality_score: 0.7,
              notes: `Based on ${comparables.length} comparable properties`,
              details: {
                comparables_count: comparables.length,
                avg_price_per_sqm: avg_price_per_sqm || null,
                evidence_quality: evidenceQuality,
              },
              calculated_at: new Date().toISOString(),
              calculated_by: 'user_sales_comparison',
            },
          }),
          indicated_value,
          confidenceScore,
          comparables.length,
          valuationId,
        ]
      );
    }

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
 * Get engagement/terms of engagement for a valuation
 * GET /api/valuations/:id/engagement
 */
router.get('/:id/engagement', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id: valuationId } = req.params;
    const result = await query(
      `SELECT * FROM valuation_engagements WHERE valuation_id = $1 LIMIT 1`,
      [valuationId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to get engagement', { valuationId: req.params.id, error: error.message });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get engagement' });
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
