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
import multer from 'multer';
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

// In-memory multer for valuation document uploads (photos + title/indenture scans).
// Streamed multipart avoids the base64-in-JSON path, which inflates files ~33% and blows
// the global 10 MB express.json limit — a scanned title deed of ~8 MB used to 500 there.
// Accepts images and PDFs up to 50 MB, buffered in memory then streamed to MinIO.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf';
    if (ok) cb(null, true);
    else cb(new Error('Only image or PDF files are allowed'));
  },
});

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
 * @route POST /api/valuations/ai/area-narrative
 * @desc Draft city/neighbourhood/location/services descriptions for the subject
 *       step, grounded in real geocoding + Google Places data. Returns DRAFT text
 *       (the valuer reviews/edits before approving the report) plus the evidence used.
 * @access Private
 */
router.post('/ai/area-narrative', async (req: Request, res: Response) => {
  try {
    const { areaNarrativeService } = await import('../services/valuation-engine/areaNarrativeService');
    const b = req.body || {};
    const result = await areaNarrativeService.generate({
      latitude: typeof b.latitude === 'number' ? b.latitude : (b.latitude ? Number(b.latitude) : null),
      longitude: typeof b.longitude === 'number' ? b.longitude : (b.longitude ? Number(b.longitude) : null),
      digitalAddress: b.digitalAddress || b.digital_address || null,
      address: b.address || b.addressStreet || null,
      city: b.city || b.addressCity || null,
      region: b.region || null,
      neighborhoodClass: b.neighborhoodClass || b.neighborhood_class || null,
      propertyType: b.propertyType || b.property_type || null,
    });
    return res.json(result);
  } catch (err: any) {
    const msg = err?.message || 'Failed to generate area narrative';
    const status = /could not determine the property location/i.test(msg) ? 400
      : /not configured/i.test(msg) ? 503
      : 502;
    return res.status(status).json({ error: msg });
  }
});

/**
 * @route POST /api/valuations/ai/property-description
 * @desc Draft the formal "Description of Property" prose for the subject step,
 *       grounded STRICTLY in the structured features the valuer has entered
 *       (type, beds/baths, area, floors, condition, tenure, etc.) — no invented
 *       amenities or claims. Returns DRAFT text for the valuer to review/edit.
 * @access Private
 */
router.post('/ai/property-description', async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const { generatePropertyDescription } = await import('../services/ai/propertyDescriptionService');
    const result = await generatePropertyDescription(req.body, 'valuation');
    return res.json({ description: result.text, provider: result.provider });
  } catch (err: any) {
    if (err?.statusCode === 400) return res.status(400).json({ error: err.message });
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

const WRITEUP_SECTIONS = [
  'land_value_evidence',
  'grounds_external_works',
  'condition_state',
  'services_description',
  'accommodation_description',
] as const;

/**
 * @route POST /api/valuations/:id/ai/writeup
 * @desc Draft a free-text report writeup section (Evidence of Land Values, Grounds,
 *       Condition, Services, Accommodation) grounded in the subject's data — and, for
 *       land evidence, the real land comparables. Returns DRAFT text for valuer review.
 * @access Private
 */
router.post('/:id/ai/writeup', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const section = String(req.body?.section || '');
    if (!(WRITEUP_SECTIONS as readonly string[]).includes(section)) {
      return res.status(400).json({ error: `Invalid section. Expected one of: ${WRITEUP_SECTIONS.join(', ')}` });
    }
    const r = await query(
      `SELECT v.*, p.* FROM valuations v JOIN properties p ON p.id = v.property_id WHERE v.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Valuation not found' });
    const row = r.rows[0];

    const subject: any = {
      property_type: row.property_type,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      floors: row.floors,
      year_built: row.year_built,
      condition: row.condition,
      land_area_sqm: row.land_area_sqm || row.land_size_sqm,
      building_area_sqm: row.built_area_sqm || row.building_size_sqm,
      amenities: row.amenities,
      neighbourhood: row.neighbourhood || row.address_neighbourhood,
      city: row.address_city || row.city,
      region: row.region,
      tenure: row.tenure,
      currency: 'GH₵',
    };

    if (section === 'land_value_evidence') {
      try {
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
        const lc: any = await pythonClient.getLandComparables(propertyInput, { max_distance_km: 10, max_results: 8 });
        const rawComps: any[] = Array.isArray(lc) ? lc : lc?.comparables || lc?.data?.comparables || [];
        subject.landComparables = rawComps.map((c: any) => ({
          address: c.address || c.address_street || c.title || null,
          land_area_sqm: Number(c.land_area_sqm || c.land_size_sqm) || null,
          price: Number(c.price || c.sale_price || c.adjusted_price) || null,
          price_per_sqm: Number(c.price_per_sqm || c.rate_per_sqm) || null,
          distance_km: Number(c.distance_km) || null,
        }));
        subject.landRatePerSqm =
          Number(lc?.land_rate_per_sqm || lc?.adopted_rate_per_sqm || lc?.data?.land_rate_per_sqm) || null;
      } catch (e: any) {
        logger.warn('writeup: land comparables fetch failed, drafting without comps', { error: e?.message });
      }
    }

    const { valuationWriteupService } = await import('../services/valuation-engine/valuationWriteupService');
    const out = await valuationWriteupService.generate(section as any, subject);
    return res.json({ section, text: out.text, provider: out.provider });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

/**
 * @route POST /api/valuations/:id/ai/hbu-justification
 * @desc Draft the Highest-and-Best-Use justification from the valuer's concluded use + the
 *       four-test analysis posted from the HBU page. Reasons only from the supplied facts.
 */
router.post('/:id/ai/hbu-justification', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const conclusion = String(req.body?.conclusion || '').trim();
    if (!conclusion) {
      return res.status(400).json({ error: 'Select a Highest & Best Use conclusion first.' });
    }
    const tests = Array.isArray(req.body?.tests) ? req.body.tests : [];

    const r = await query(
      `SELECT v.*, p.* FROM valuations v JOIN properties p ON p.id = v.property_id WHERE v.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Valuation not found' });
    const row = r.rows[0];

    const { valuationWriteupService } = await import('../services/valuation-engine/valuationWriteupService');
    const out = await valuationWriteupService.generateHbuJustification({
      conclusion,
      tests,
      propertyType: row.property_type,
      currentUse: row.property_use || row.property_type,
      city: row.address_city || row.city,
      neighbourhood: row.neighbourhood || row.address_neighbourhood,
      region: row.region,
      tenure: row.tenure,
    });
    return res.json({ text: out.text, provider: out.provider });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

/**
 * @route POST /api/valuations/:id/ai/weight-rationale
 * @desc Draft the reconciliation "Weight Rationale" from the method indications + weights.
 *       Prefers the live values posted by the reconciliation page (so it reflects on-screen
 *       edits); falls back to the saved reconciliation row. Returns DRAFT text for review.
 * @access Private
 */
router.post('/:id/ai/weight-rationale', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const NAMES: Record<string, string> = {
      cost_approach: 'Cost Approach',
      sales_comparison: 'Sales Comparison Approach',
      income_approach: 'Income Capitalisation Approach',
      drc_method: 'Depreciated Replacement Cost',
      residual_method: 'Residual Method',
      profits_method: 'Profits Method',
    };
    const body = req.body || {};
    let methods: Array<{ name: string; value: number; weight: number }> = Array.isArray(body.methods)
      ? body.methods
          .map((m: any) => ({ name: String(m.name || m.method || ''), value: Number(m.value) || 0, weight: Number(m.weight) || 0 }))
          .filter((m: any) => m.name && (m.weight > 0 || m.value > 0))
      : [];
    let reconciledValue = Number(body.reconciledValue) || 0;
    let spreadPct = body.spreadPct != null ? Number(body.spreadPct) : null;
    let propertyType = body.propertyType || null;

    if (!methods.length || !reconciledValue) {
      const r = await query(
        `SELECT vr.method_results, vr.final_market_value, vr.value_spread_percentage, p.property_type
         FROM valuation_reconciliations vr
         JOIN valuations v ON v.id = vr.valuation_id
         JOIN properties p ON p.id = v.property_id
         WHERE vr.valuation_id = $1`,
        [req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Reconciliation not found' });
      const row = r.rows[0];
      const mr = row.method_results || {};
      if (!methods.length) {
        methods = Object.entries(mr)
          .map(([k, v]: any) => ({ name: NAMES[k] || k, value: Number(v?.value) || 0, weight: Number(v?.weight) || 0 }))
          .filter((m) => m.weight > 0 || m.value > 0);
      }
      if (!reconciledValue) reconciledValue = Number(row.final_market_value) || 0;
      if (spreadPct == null && row.value_spread_percentage != null) spreadPct = Number(row.value_spread_percentage);
      propertyType = propertyType || row.property_type;
    }

    if (!methods.length) {
      return res.status(400).json({ error: 'No weighted methods to summarise — set the method weights first.' });
    }

    const { valuationWriteupService } = await import('../services/valuation-engine/valuationWriteupService');
    const out = await valuationWriteupService.generateWeightRationale({
      methods,
      reconciledValue,
      spreadPct,
      propertyType,
      currency: 'GH₵',
    });
    return res.json({ text: out.text, provider: out.provider });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

/**
 * @route PUT /api/valuations/:id/writeups
 * @desc Persist valuer-reviewed writeup sections into properties.metadata (the report
 *       reads them from there). Only the known writeup keys are accepted.
 * @access Private
 */
router.put('/:id/writeups', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const updates: Record<string, string> = {};
    for (const k of WRITEUP_SECTIONS) {
      if (typeof body[k] === 'string') updates[k] = body[k];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No writeup fields provided' });
    }
    const r = await query(`SELECT property_id FROM valuations WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Valuation not found' });
    await query(
      `UPDATE properties SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [r.rows[0].property_id, JSON.stringify(updates)]
    );
    return res.json({ saved: Object.keys(updates) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to save writeups' });
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
        transaction_date: comp.listing_date,
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

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pythonEndpoint = `${pythonBase}/api/v1/methods/sales-comparison`;

    const requestBody = {
      property: propertyData,
      comparables: comparables,
      valuation_date: new Date().toISOString(),
      usd_to_ghs_rate: usdToGhs, // live DB rate (comps already GHS; passed only as a safety net)
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
        SELECT (
          SELECT value FROM economic_indicators
           WHERE indicator_type = 'exchange_rate_usd'
           ORDER BY effective_date DESC LIMIT 1
        ) AS usd_to_ghs  -- no fallback: USD rows yield NULL (and are excluded) if no live rate
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
        -- Exclude deleted properties (PM delete sets deleted_at)
        AND p.deleted_at IS NULL
        -- DATA-QUALITY SANITY BAND: drop implausible rows that would pollute the comparable
        -- set AND the summary aggregates (e.g. GHS amounts mislabelled USD -> multi-₵100M rows,
        -- or tiny built areas carrying huge prices -> ₵-millions/m²). Uses the GHS-normalised price.
        AND (CASE WHEN p.price_currency = 'USD'
                  THEN COALESCE(p.inferred_sale_price, p.price) * fx.usd_to_ghs
                  ELSE COALESCE(p.inferred_sale_price, p.price) END)
            BETWEEN 50000 AND 100000000               -- ₵50k .. ₵100M absolute sanity
        AND (
          COALESCE(p.built_area_sqm, p.total_area_sqm) IS NULL          -- unknown size: keep (no ₵/m² check)
          OR (
            COALESCE(p.built_area_sqm, p.total_area_sqm) >= 20          -- reject sub-20 m² "houses"
            AND (CASE WHEN p.price_currency = 'USD'
                      THEN COALESCE(p.inferred_sale_price, p.price) * fx.usd_to_ghs
                      ELSE COALESCE(p.inferred_sale_price, p.price) END)
                / COALESCE(p.built_area_sqm, p.total_area_sqm)
                BETWEEN 500 AND 60000                  -- plausible Ghana ₵/m² band
          )
        )
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
    // Note: PostgreSQL numeric columns are returned as strings by node-pg, so parseFloat is required
    // Median is the correct central tendency for comparables: robust to the odd high/low
    // outlier so a single atypical sale can't distort the headline figures (mean can).
    const median = (vals: number[]): number => {
      const a = vals.filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
      if (a.length === 0) return 0;
      const mid = Math.floor(a.length / 2);
      return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
    };
    const pricesGhs = result.rows.map((r: any) => parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0);
    const pricePerSqm = result.rows.map((r: any) => {
      const price = parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0;
      const area = parseFloat(r.gfa) || parseFloat(r.plot_size) || 0;
      return area > 0 ? price / area : 0;
    });
    const aggregates = comparablesFound > 0 ? {
      avgPrice: Math.round(median(pricesGhs)),            // median (robust), exposed under the same key
      avgPricePerSqm: Math.round(median(pricePerSqm)),    // median (robust)
      avgDistance: Math.round((result.rows.reduce((sum: number, r: any) => sum + (parseFloat(r.distance_km) || 0), 0) / comparablesFound) * 10) / 10,
      avgSimilarity: Math.round(result.rows.reduce((sum: number, r: any) => sum + (parseFloat(r.similarity_score) || 0), 0) / comparablesFound),
      minPrice: Math.min(...result.rows.map((r: any) => parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0)),
      maxPrice: Math.max(...result.rows.map((r: any) => parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0)),
      minPricePerSqm: Math.round(Math.min(...result.rows.map((r: any) => (parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0) / (parseFloat(r.gfa) || parseFloat(r.plot_size) || 1)))),
      maxPricePerSqm: Math.round(Math.max(...result.rows.map((r: any) => (parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0) / (parseFloat(r.gfa) || parseFloat(r.plot_size) || 1)))),
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
          fxRateUsed: result.rows[0]?.fx_rate_used ?? null,
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

    // RICS/GhIS tiered comparability: prefer the SAME sub-type, but admit other rentals in the same
    // CATEGORY (e.g. a house compared to apartments where same-type evidence is scarce). Same-type
    // comps still rank higher via the similarity score (exact type = 25 vs other = 10), and the
    // cross-type difference is flagged for adjustment/disclosure — rather than excluding them outright,
    // which forced the area-benchmark fallback even when local residential evidence existed.
    const PROPERTY_CATEGORY: Record<string, string[]> = {
      residential: ['residential_house', 'apartment_flat', 'townhouse'],
      commercial: ['commercial_shop', 'commercial_office', 'warehouse', 'industrial', 'mixed_use'],
      land: ['land'],
    };
    const categoryOf = (t?: string | null): string =>
      Object.keys(PROPERTY_CATEGORY).find((cat) => PROPERTY_CATEGORY[cat].includes(String(t))) || 'residential';
    const subjectCategory = categoryOf(searchPropertyType);
    // Always include the subject's own sub-type even if it is not in the map.
    const searchCategoryTypes = Array.from(
      new Set([...(PROPERTY_CATEGORY[subjectCategory] || []), String(searchPropertyType)])
    );

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
        SELECT (
          SELECT value FROM economic_indicators
           WHERE indicator_type = 'exchange_rate_usd'
           ORDER BY effective_date DESC LIMIT 1
        ) AS usd_to_ghs  -- no fallback: USD rows yield NULL (and are excluded) if no live rate
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
        END AS similarity_score,
        -- Collapse duplicate ingests of the same listing (same title + rent + location):
        -- keep only the most recent row per distinct listing.
        ROW_NUMBER() OVER (
          PARTITION BY p.title, p.price, round(p.latitude::numeric, 5), round(p.longitude::numeric, 5)
          ORDER BY p.created_at DESC NULLS LAST, p.id
        ) AS dup_rn
      FROM properties p
      CROSS JOIN fx_rate fx
      WHERE p.id != COALESCE($6::uuid, p.id)
        -- RENTAL ONLY filter
        AND p.transaction_type = 'rental'
        -- Exclude deleted properties (PM delete sets deleted_at)
        AND p.deleted_at IS NULL
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
        -- Property type filter: same CATEGORY (RICS tiered — same sub-type preferred via the
        -- similarity score, other same-category sub-types admitted at lower weight). $14 = sub-type list.
        AND p.property_type::text = ANY($14::text[])
        -- Data hygiene (RICS evidence verification): drop obviously-erroneous rows
        AND (p.bedrooms IS NULL OR p.bedrooms BETWEEN 0 AND 15)
        AND (COALESCE(p.built_area_sqm, p.total_area_sqm) IS NULL OR COALESCE(p.built_area_sqm, p.total_area_sqm) BETWEEN 5 AND 10000)
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
      searchCategoryTypes,                                                          // $14 same-category sub-types
    ];

    // Keep one row per distinct listing (dup_rn = 1), then order + limit.
    searchQuery = `
      SELECT * FROM (${searchQuery}) dq
      WHERE dq.dup_rn = 1
      ORDER BY dq.similarity_score DESC, dq.distance_km ASC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    // params[6] is $7 (radiusKm); params is [...$1-$14, $15 limit].
    let radiusUsed = radiusKm;
    let result = await query(searchQuery, params);
    // RICS: comparables should be local, so widen ONLY as needed. If nothing is within the requested
    // radius, step out to a capped maximum; distance is disclosed and already down-weights similarity.
    const MAX_RADIUS_KM = 25;
    if (result.rows.length === 0) {
      for (const r of [radiusKm * 2, radiusKm * 3, MAX_RADIUS_KM]) {
        if (r <= radiusUsed || r > MAX_RADIUS_KM) continue;
        params[6] = r; // $7 radius
        result = await query(searchQuery, params);
        radiusUsed = r;
        if (result.rows.length > 0) break;
      }
    }

    // Flag each comparable's type comparability for adjustment/disclosure (RICS): exact sub-type vs
    // same-category. Same-category comps already score lower (10 vs 25) but the explicit flag lets the
    // UI/report disclose and apply a property-type adjustment.
    for (const row of result.rows as any[]) {
      row.type_match = String(row.property_type) === String(searchPropertyType) ? 'exact' : 'category';
    }

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
        // RICS disclosure: how far we had to search, and how many comps are a different sub-type
        // (same category) and therefore need a property-type adjustment.
        radiusUsed,
        radiusWidened: radiusUsed > radiusKm,
        crossTypeCount: result.rows.filter((r: any) => r.type_match === 'category').length,
        aggregates,
        // Currency conversion info
        currencyConversion: {
          targetCurrency: 'GHS',
          fxRateUsed: result.rows[0]?.fx_rate_used ?? null,
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
 * POST /api/valuations/:id/rental-comparables/value
 * Single source of truth for market-rent estimation. Sources the adjustment factors from
 * valuation_adjustment_factors + the live USD/GHS rate, resolves comparable rents from the DB,
 * and runs the Python market-rent engine. The frontend only renders the result.
 */
router.post('/:id/rental-comparables/value', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const valuationId = req.params.id;

    const vRes = await query(
      `SELECT p.id, p.region, p.property_type, p.bedrooms, p.bathrooms, p.built_area_sqm, p.year_built
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    }
    const subject = vRes.rows[0];

    // Live FX — strict, no fallback.
    const fxRes = await query(
      `SELECT value FROM economic_indicators WHERE indicator_type='exchange_rate_usd' ORDER BY effective_date DESC LIMIT 1`
    );
    const usdToGhs = parseFloat(fxRes.rows[0]?.value);
    if (!usdToGhs || usdToGhs <= 0) {
      return res.status(503).json({ error: 'FX rate unavailable', message: 'No live USD/GHS rate. Valuation refused.' });
    }
    const toGhs = (price: number, cur?: string | null) =>
      (cur || 'GHS').toUpperCase() === 'USD' ? price * usdToGhs : price;

    // Adjustment factors from config — prefer region/type-specific, else global. No hardcoded factors.
    const facRes = await query(
      `SELECT adjustment_factor, base_adjustment_percent, min_value, max_value, unit,
              (region IS NOT NULL)::int + (property_type IS NOT NULL)::int AS specificity
       FROM valuation_adjustment_factors
       WHERE adjustment_category = 'rental_market' AND is_active = TRUE
         AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         AND (region IS NULL OR region = $1)
         AND (property_type IS NULL OR property_type::text = $2::text)
       ORDER BY specificity DESC`,
      [subject.region, subject.property_type]
    );
    const adjustment_factors: Record<string, any> = {};
    for (const r of facRes.rows) {
      if (!adjustment_factors[r.adjustment_factor]) {
        adjustment_factors[r.adjustment_factor] = {
          base_adjustment_percent: parseFloat(r.base_adjustment_percent) || 0,
          min_value: r.min_value != null ? parseFloat(r.min_value) : null,
          max_value: r.max_value != null ? parseFloat(r.max_value) : null,
          unit: r.unit,
        };
      }
    }
    if (Object.keys(adjustment_factors).length === 0) {
      return res.status(503).json({
        error: 'No adjustment factors configured',
        message: 'valuation_adjustment_factors has no active rental_market rows (run migration 251).',
      });
    }

    // Resolve comparable rents from the DB by id (never trust frontend prices); convert to GHS once.
    const bodyComps = Array.isArray(req.body.comparables) ? req.body.comparables : [];
    const ids = bodyComps.map((c: any) => c.id).filter(Boolean);
    const propRows = ids.length ? (await query(
      `SELECT id, price, price_currency, built_area_sqm, bedrooms, bathrooms, year_built, created_at
       FROM properties WHERE id = ANY($1)`, [ids]
    )).rows : [];
    const byId = new Map(propRows.map((r: any) => [String(r.id), r]));
    const comparables = bodyComps.map((c: any) => {
      const p: any = byId.get(String(c.id));
      const nativeRent = p ? parseFloat(p.price) : parseFloat(c.monthly_rent_ghs ?? c.asking_rent_monthly ?? c.price);
      const nativeCur = p ? p.price_currency : c.price_currency;
      return {
        id: String(c.id),
        monthly_rent_ghs: toGhs(nativeRent || 0, nativeCur),
        bedrooms: p?.bedrooms ?? c.bedrooms,
        bathrooms: p?.bathrooms ?? c.bathrooms,
        gfa_sqm: p?.built_area_sqm ?? c.gfa_sqm,
        year_built: p?.year_built ?? c.year_built,
        furnishing: c.furnishing,                 // not a DB column; only if the UI supplies it
        transaction_date: p?.created_at ?? c.transaction_date,
        weight: parseFloat(c.weight) || 1.0,
      };
    });

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/market-rent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: {
          bedrooms: subject.bedrooms,
          bathrooms: subject.bathrooms,
          building_size_sqm: subject.built_area_sqm,
          year_built: subject.year_built,
          furnishing: req.body.subject_furnishing,
        },
        comparables,
        adjustment_factors,
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('Market-rent engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({
        error: 'Engine error',
        message: 'Market-rent engine failed',
        details: process.env.NODE_ENV === 'development' ? txt : undefined,
      });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: { engine: 'python', method: 'market_rent', usd_to_ghs: usdToGhs, factors_used: Object.keys(adjustment_factors) },
    });
  } catch (error: any) {
    logger.error('rental-comparables/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/drc/value
 * Single source of truth for the Depreciated Replacement Cost (DRC) method. Sources the
 * replacement cost/sqm, MEA factor and economic (useful) life from specialized_construction_costs
 * (Data Hub), the land value from the system-wide Land Value reconciliation, and the building
 * attributes from the property — then runs the Python DRC engine. NO hardcoded fallbacks: any
 * input not resolvable from the DB must be supplied explicitly by the valuer, otherwise the
 * calculation strict-fails with a clear list of what's missing. The frontend only renders the result.
 */
router.post('/:id/drc/value', validateUUID('id'), async (req: Request, res: Response) => {
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  try {
    const valuationId = req.params.id;
    const b = req.body || {};

    const buildingFunction = String(b.building_function || '').trim();
    const qualityLevel = String(b.quality_level || '').trim();
    if (!buildingFunction || !qualityLevel) {
      return res.status(400).json({ error: 'Bad Request', message: 'building_function and quality_level are required.' });
    }

    // Subject property
    const vRes = await query(
      `SELECT p.id, p.region, p.built_area_sqm, p.land_area_sqm, p.year_built, p.condition,
              p.floors, p.metadata, p.address_city, p.address_street
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    const prop = vRes.rows[0];
    const region = prop.region || 'greater_accra';

    // DRC parameters from the Data Hub config table. Prefer the property's own region; otherwise the
    // greater_accra published reference rate (surfaced in meta.cost_region so it is never silent).
    const costRes = await query(
      `SELECT base_cost_sqm, useful_life_years, mea_factor, mea_feature_range, region
         FROM specialized_construction_costs
        WHERE building_function::text = $1 AND quality_level::text = $2
          AND region::text IN ($3, 'greater_accra')
        ORDER BY (region::text = $3) DESC
        LIMIT 1`,
      [buildingFunction, qualityLevel, region]
    );
    const costRow = costRes.rows[0];

    // Each input: explicit valuer override > DB config / property. Strict-fail if neither.
    const replacementCostPerSqm = num(b.replacement_cost_per_sqm) ?? num(costRow?.base_cost_sqm);
    // MEA: the DB value is the per-class BASELINE (anchor). Features modulate it within the range;
    // the valuer may instead post an explicit final MEA (mea_factor_override).
    const meaBaseline = num(b.mea_factor) ?? num(costRow?.mea_factor);
    const meaFeatureRange = num(b.mea_feature_range) ?? num(costRow?.mea_feature_range) ?? 0;
    const meaOverride = num(b.mea_factor_override);
    const usefulLife = num(b.useful_life_years) ?? num(costRow?.useful_life_years);
    const gfa = num(b.gfa_sqm) ?? num(prop.built_area_sqm);
    const yearBuilt = num(b.year_built) ?? num(prop.year_built);
    const condition = String(b.condition || prop.condition || '').trim();

    // Feature set for the feature-driven MEA (RICS Model A). Pulled from the property + metadata;
    // missing items are simply absent and the engine scores them neutral (never a silent skew).
    const md: any = prop.metadata || {};
    const floors = num(b.floors) ?? num(prop.floors) ?? num(md.total_floors) ?? num(md.floors);
    const features = {
      age_years: yearBuilt ? new Date().getFullYear() - yearBuilt : null,
      quality_rating: b.quality_rating || md.quality_rating || qualityLevel,
      floors: floors ?? null,
      services: {
        generator: !!md.has_generator,
        security: !!md.has_security,
        water: !!md.has_borehole,
        drainage: !!md.drainage_sanitation,
        elevator: !!md.has_elevator,
        solar: !!md.has_solar,
        ac: !!(md.has_ac ?? md.has_air_conditioning),
      },
    };

    // Land value — explicit override > system-wide Land Value reconciliation.
    let landValue = num(b.land_value);
    let landSource = 'user_entered';
    if (landValue == null || landValue <= 0) {
      const lvRes = await query(
        `SELECT calculated_value FROM valuation_method_inputs WHERE valuation_id = $1 AND method_type = 'land_value'`,
        [valuationId]
      );
      landValue = num(lvRes.rows[0]?.calculated_value);
      landSource = 'land_value_system';
    }

    const missing: string[] = [];
    if (!replacementCostPerSqm || replacementCostPerSqm <= 0) missing.push(`replacement cost/sqm (no published rate for ${buildingFunction}/${qualityLevel} and none supplied)`);
    if (!meaBaseline || meaBaseline <= 0) missing.push('MEA baseline factor');
    if (!usefulLife || usefulLife <= 0) missing.push('economic (useful) life');
    if (!gfa || gfa <= 0) missing.push('GFA (gross floor area)');
    if (!yearBuilt || yearBuilt <= 0) missing.push('year built');
    if (!condition) missing.push('building condition');
    if (landValue == null || landValue <= 0) missing.push('land value (no Land Value reconciliation on file and none supplied)');
    if (missing.length) {
      return res.status(422).json({
        error: 'Missing required DRC inputs',
        message: `Cannot run DRC — resolve or supply: ${missing.join('; ')}.`,
        missing,
      });
    }

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/drc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property: {
          id: prop.id,
          property_type: buildingFunction,
          region,
          building_size_sqm: gfa,
          land_area_sqm: num(prop.land_area_sqm),
          year_built: yearBuilt,
          condition,
          address_city: prop.address_city,
          address_street: prop.address_street,
        },
        options: {
          replacement_cost_per_sqm: replacementCostPerSqm,
          mea_factor: meaBaseline,                 // per-class baseline (anchor)
          mea_feature_range: meaFeatureRange,      // bounded feature modulation
          mea_factor_override: meaOverride ?? undefined,
          features,
          useful_life: usefulLife,
          land_value: landValue,
          depreciation_overrides: b.depreciation_overrides || {},
        },
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('DRC engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({ error: 'Engine error', message: 'DRC engine failed', details: process.env.NODE_ENV === 'development' ? txt : undefined });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: {
        engine: 'python',
        method: 'drc_method',
        sources: {
          replacement_cost_per_sqm: num(b.replacement_cost_per_sqm) != null ? 'user' : 'data_hub',
          mea_factor: meaOverride != null ? 'valuer_override' : 'feature_model',
          useful_life: num(b.useful_life_years) != null ? 'user' : 'data_hub',
          gfa: num(b.gfa_sqm) != null ? 'user' : 'property',
          land_value: landSource,
          cost_region: costRow?.region || null,
        },
      },
    });
  } catch (error: any) {
    logger.error('drc/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/profits/value
 * Single source of truth for the Profits (trade-related) method. Sources the per-type trading
 * benchmarks (revenue/unit, operating cost ratios, operator's remuneration %, trading cap rate)
 * from trading_property_benchmarks (Data Hub), applies any valuer overrides / actual turnover,
 * and runs the Python profits engine. NO hardcoded fallbacks — anything unresolved strict-fails
 * with a clear list. The frontend renders the result only.
 */
router.post('/:id/profits/value', validateUUID('id'), async (req: Request, res: Response) => {
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  try {
    const valuationId = req.params.id;
    const b = req.body || {};
    const tradingType = String(b.trading_property_type || b.property_type || '').trim();
    if (!tradingType) {
      return res.status(400).json({ error: 'Bad Request', message: 'trading_property_type is required.' });
    }

    const vRes = await query(
      `SELECT p.id, p.region, p.building_size_sqm, p.built_area_sqm
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    const prop = vRes.rows[0];
    const region = prop.region || 'greater_accra';

    // Trading benchmarks from the Data Hub config. Prefer the property's region; else greater_accra.
    const bmRes = await query(
      `SELECT unit_metric, revenue_per_unit, occupancy_default_pct, operating_cost_ratios,
              operator_remuneration_pct, typical_cap_rate, cap_rate_low, cap_rate_high,
              operator_capital_pct, return_on_operator_capital_pct, region
         FROM trading_property_benchmarks
        WHERE property_type = $1 AND region IN ($2, 'greater_accra')
        ORDER BY (region = $2) DESC
        LIMIT 1`,
      [tradingType, region]
    );
    const bm = bmRes.rows[0];

    // Resolve each input: explicit valuer override > DB benchmark.
    const grossActual = num(b.gross_annual_revenue);
    const haveActual = grossActual != null && grossActual > 0;
    const unitCount = num(b.unit_count);
    const revenuePerUnit = num(b.revenue_per_unit) ?? num(bm?.revenue_per_unit);
    const occupancyRate = num(b.occupancy_rate) ?? num(bm?.occupancy_default_pct);
    const ratiosOverride = b.operating_cost_ratios && typeof b.operating_cost_ratios === 'object'
      && Object.keys(b.operating_cost_ratios).length > 0;
    const operatingCostRatios = ratiosOverride ? b.operating_cost_ratios : bm?.operating_cost_ratios;
    const operatorRemPct = num(b.operator_remuneration_pct) ?? num(bm?.operator_remuneration_pct);

    // Cap rate resolution (priority): 1) valuer override, 2) the trading type's OWN yield from the
    // analytics cap-rate authority (capRateService.resolveCapRate → reads trading_property_benchmarks
    // directly; NO commercial-office proxy). Provenance is surfaced so a seeded yield is never
    // presented as hard market evidence.
    let capRate = num(b.cap_rate);
    let capLow: number | null = null;
    let capHigh: number | null = null;
    let capRateSource = 'valuer_override';
    let capRateMeta: any = null;
    if (capRate == null || capRate <= 0) {
      try {
        const mk = await capRateService.resolveCapRate(region, tradingType);
        if (mk && mk.benchmarkCapRate > 0) {
          capRate = mk.benchmarkCapRate;
          capLow = mk.capRateRangeLow;
          capHigh = mk.capRateRangeHigh;
          // sampleSize > 0 ⇒ real transaction evidence; trading seeds carry sampleSize 0.
          capRateSource = mk.sampleSize > 0 ? 'market_analytics' : 'indicative_benchmark';
          capRateMeta = {
            property_type: tradingType,
            sample_size: mk.sampleSize,
            confidence: mk.confidenceScore,
            data_quality: mk.dataQuality,
            note: mk.sampleSize > 0
              ? `Trading yield for ${tradingType} derived from market analytics.`
              : `Indicative ${tradingType} yield — valuer to confirm as market evidence accrues.`,
          };
        }
      } catch (e: any) {
        logger.debug('CapRateService.resolveCapRate failed for profits; falling back to seed', { error: e?.message });
      }
      // Last resort: the trading benchmark row already fetched above.
      if (capRate == null || capRate <= 0) {
        capRate = num(bm?.typical_cap_rate);
        capLow = num(bm?.cap_rate_low);
        capHigh = num(bm?.cap_rate_high);
        capRateSource = 'indicative_benchmark';
        capRateMeta = { note: 'Indicative trading yield — no market evidence available; valuer to confirm.' };
      }
    } else {
      capLow = num(bm?.cap_rate_low);
      capHigh = num(bm?.cap_rate_high);
    }

    const missing: string[] = [];
    if (!operatingCostRatios || Object.keys(operatingCostRatios).length === 0) missing.push(`operating cost ratios (no benchmark for ${tradingType} and none supplied)`);
    if (operatorRemPct == null || operatorRemPct <= 0) missing.push("operator's remuneration %");
    if (capRate == null || capRate <= 0) missing.push('capitalisation rate');
    if (!haveActual) {
      if (unitCount == null || unitCount <= 0) missing.push('unit count (or supply actual turnover)');
      if (revenuePerUnit == null || revenuePerUnit <= 0) missing.push('revenue per unit');
      if (occupancyRate == null) missing.push('occupancy rate');
    }
    if (missing.length) {
      return res.status(422).json({
        error: 'Missing required Profits inputs',
        message: `Cannot run the profits method — resolve or supply: ${missing.join('; ')}.`,
        missing,
      });
    }

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/profits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property: {
          id: prop.id,
          property_type: tradingType,
          region,
          building_size_sqm: num(prop.building_size_sqm) ?? num(prop.built_area_sqm),
        },
        options: {
          gross_annual_revenue: haveActual ? grossActual : undefined,
          unit_count: unitCount ?? undefined,
          revenue_per_unit: revenuePerUnit ?? undefined,
          occupancy_rate: occupancyRate ?? undefined,
          operating_cost_ratios: operatingCostRatios,
          ratios_source: ratiosOverride ? 'user' : 'config',
          operator_remuneration_pct: operatorRemPct,
          // Institutional divisible balance: return on the operator's capital (FF&E + stock).
          operator_capital_pct: num(b.operator_capital_pct) ?? num(bm?.operator_capital_pct) ?? undefined,
          return_on_operator_capital_pct: num(b.return_on_operator_capital_pct) ?? num(bm?.return_on_operator_capital_pct) ?? undefined,
          cap_rate: capRate,
          cap_rate_source: capRateSource === 'valuer_override' ? 'user' : 'config',
          cap_rate_low: capLow ?? undefined,
          cap_rate_high: capHigh ?? undefined,
        },
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('Profits engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({ error: 'Engine error', message: 'Profits engine failed', details: process.env.NODE_ENV === 'development' ? txt : undefined });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: {
        engine: 'python',
        method: 'profits_method',
        unit_metric: bm?.unit_metric || null,
        benchmark_region: bm?.region || null,
        cap_rate_provenance: { source: capRateSource, ...(capRateMeta || {}) },
        sources: {
          revenue: haveActual ? 'actual_turnover' : (num(b.revenue_per_unit) != null ? 'user' : 'benchmark'),
          operating_cost_ratios: ratiosOverride ? 'user' : 'benchmark',
          operator_remuneration_pct: num(b.operator_remuneration_pct) != null ? 'user' : 'benchmark',
          cap_rate: capRateSource,
        },
      },
    });
  } catch (error: any) {
    logger.error('profits/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/residual/value
 * Single source of truth for the Residual (development land) method. Sources the sale price/sqm
 * (market comparables), construction cost/sqm (base_costs_per_sqm — live, scrape-computed), development finance rate
 * (economic_indicators — live), and the development assumptions (residual_development_assumptions)
 * from the Data Hub, applies any valuer overrides, and runs the full Python residual engine.
 * NO hardcoded fallbacks — anything unresolved strict-fails with a clear list. Frontend renders only.
 */
router.post('/:id/residual/value', validateUUID('id'), async (req: Request, res: Response) => {
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // dev type → property_type for the two evidence sources
  const DEV_TO_SALE_TYPE: Record<string, string> = {
    house: 'residential_house', townhouse: 'residential_house', apartment: 'apartment_flat',
    commercial: 'commercial_shop', office: 'commercial_shop', industrial: 'commercial_shop', warehouse: 'commercial_shop',
  };
  const DEV_TO_COST_TYPE: Record<string, string> = {
    house: 'residential', townhouse: 'residential', apartment: 'residential',
    commercial: 'commercial', office: 'commercial', industrial: 'industrial', warehouse: 'industrial',
  };
  try {
    const valuationId = req.params.id;
    const b = req.body || {};

    const vRes = await query(
      `SELECT p.id, p.region, p.land_area_sqm, p.built_area_sqm, p.floors, p.property_type, p.property_sub_type
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    const prop = vRes.rows[0];
    const region = prop.region || 'greater_accra';

    // Development type: explicit body, else inferred from the property type.
    let devType = String(b.development_type || '').trim();
    if (!devType) {
      const pt = `${prop.property_type || ''} ${prop.property_sub_type || ''}`.toLowerCase();
      devType = pt.includes('commercial') ? 'commercial' : pt.includes('office') ? 'office'
        : pt.includes('industrial') ? 'industrial' : pt.includes('warehouse') ? 'warehouse'
        : (pt.includes('apartment') || pt.includes('flat')) ? 'apartment'
        : pt.includes('townhouse') ? 'townhouse' : 'house';
    }

    // Development assumptions from config (region-aware).
    const aRes = await query(
      `SELECT * FROM residual_development_assumptions
        WHERE development_type = $1 AND region IN ($2, 'greater_accra')
        ORDER BY (region = $2) DESC LIMIT 1`,
      [devType, region]
    );
    const a = aRes.rows[0];

    // Sale price/sqm from market comparables (evidence); construction cost from base costs.
    let salePriceEvidence: any = null;
    let basePrice: number | null = null;
    let baseCost: number | null = null;
    try {
      const comps = await constructionCostService.getComparablePricePerSqm(region, DEV_TO_SALE_TYPE[devType]);
      const match = comps.find((c: any) => c.property_type === DEV_TO_SALE_TYPE[devType]) || comps[0];
      if (match) { basePrice = num(match.median_price_sqm); salePriceEvidence = { count: match.comparable_count, p25: match.p25_price_sqm, p75: match.p75_price_sqm, median: match.median_price_sqm }; }
    } catch (e: any) { logger.debug('residual sale-price lookup failed', { error: e?.message }); }
    try {
      const costs = await constructionCostService.getBaseCosts(DEV_TO_COST_TYPE[devType], region);
      const std = costs.find((c: any) => c.quality_tier === 'standard') || costs[0];
      if (std) baseCost = num(std.base_cost_per_sqm);
    } catch (e: any) { logger.debug('residual base-cost lookup failed', { error: e?.message }); }

    // Live development finance rate (most recent of lending/prime/policy), unless overridden.
    let financeRate = num(b.finance_rate);
    if (financeRate == null || financeRate <= 0) {
      const fr = await query(
        `SELECT value::float AS value FROM economic_indicators
          WHERE indicator_type::text = ANY($1)
          ORDER BY effective_date DESC, array_position($1, indicator_type::text) LIMIT 1`,
        [['lending_rate', 'interest_rate_prime', 'interest_rate_policy']]
      );
      financeRate = num(fr.rows[0]?.value);
    }

    // Resolve every input: valuer override > evidence/config. Floors/coverage from property when known.
    const plotSize = num(b.plot_size) ?? num(prop.land_area_sqm);
    const floors = num(b.floors) ?? num(prop.floors) ?? 1;
    const builtArea = num(prop.built_area_sqm);
    let plotCoverage = num(b.plot_coverage);
    if (plotCoverage == null && plotSize && builtArea && floors && plotSize * floors > 0) {
      const c = builtArea / (plotSize * floors);
      if (c > 0 && c <= 1) plotCoverage = c;
    }
    if (plotCoverage == null) plotCoverage = num(a?.plot_coverage_default);

    const salePricePerSqm = num(b.sale_price_per_sqm) ?? basePrice;
    const constructionCostPerSqm = num(b.construction_cost_per_sqm) ?? baseCost;
    const efficiency = num(b.efficiency) ?? num(a?.efficiency_pct);

    const missing: string[] = [];
    if (!a) missing.push(`development assumptions (no config for ${devType})`);
    if (plotSize == null || plotSize <= 0) missing.push('plot size (land area)');
    if (salePricePerSqm == null || salePricePerSqm <= 0) missing.push('sale price/sqm (no comparables for this type/region and none supplied)');
    if (constructionCostPerSqm == null || constructionCostPerSqm <= 0) missing.push('construction cost/sqm (no base cost for this type/region and none supplied)');
    if (financeRate == null || financeRate <= 0) missing.push('development finance rate (no economic indicator and none supplied)');
    if (missing.length) {
      return res.status(422).json({ error: 'Missing required residual inputs', message: `Cannot run the residual method — resolve or supply: ${missing.join('; ')}.`, missing });
    }

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/residual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property: { id: prop.id, property_type: devType, region, land_area_sqm: plotSize },
        options: {
          plot_coverage: plotCoverage,
          floors,
          efficiency,
          sale_price_per_sqm: salePricePerSqm,
          construction_cost_per_sqm: constructionCostPerSqm,
          cost_basis: b.cost_basis || 'gross',
          professional_fees_pct: num(b.professional_fees_pct) ?? num(a.professional_fees_pct),
          contingency_pct: num(b.contingency_pct) ?? num(a.contingency_pct),
          marketing_pct: num(b.marketing_pct) ?? num(a.marketing_pct),
          sales_commission_pct: num(b.sales_commission_pct) ?? num(a.sales_commission_pct),
          legal_fees_pct: num(b.legal_fees_pct) ?? num(a.legal_fees_pct),
          finance_rate: financeRate,
          finance_ltv_pct: num(b.finance_ltv_pct) ?? num(a.finance_ltv_pct),
          finance_avg_balance_factor: num(b.finance_avg_balance_factor) ?? num(a.finance_avg_balance_factor),
          construction_months: num(b.construction_months) ?? num(a.construction_months),
          developer_profit_pct: num(b.developer_profit_pct) ?? num(a.developer_profit_pct),
          min_profit_pct: num(a.min_profit_pct),
        },
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('Residual engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({ error: 'Engine error', message: 'Residual engine failed', details: process.env.NODE_ENV === 'development' ? txt : undefined });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: {
        engine: 'python',
        method: 'residual_method',
        development_type: devType,
        sale_price_evidence: salePriceEvidence,
        sources: {
          sale_price_per_sqm: num(b.sale_price_per_sqm) != null ? 'user' : 'comparables',
          construction_cost_per_sqm: num(b.construction_cost_per_sqm) != null ? 'user' : 'base_costs',
          finance_rate: num(b.finance_rate) != null ? 'user' : 'economic_indicators',
          assumptions: 'config',
        },
      },
    });
  } catch (error: any) {
    logger.error('residual/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/sensitivity
 * Real, method-specific sensitivity analysis (RICS VPS 3). For the selected driver, it RE-RUNS the
 * actual Python method engine (via that method's /value route, which sources Data Hub inputs and
 * accepts overrides) at ±range around the base input, returning the true engine value at each point.
 * NO weight×% approximation — every point is an actual engine re-run with the driver perturbed.
 * The frontend re-weights these into the reconciled value using the weights it already holds.
 * Body: { driver, range_pct=10, points=5 }
 */
router.post('/:id/sensitivity', validateUUID('id'), async (req: Request, res: Response) => {
  // driver → which method engine to re-run, which input to perturb, and where to read its base value.
  const SENS_DRIVERS: Record<string, { method: string; endpoint: string; overrideKey: string; detailKey: string; label: string }> = {
    // Profits (trade-related)
    profits_cap_rate:       { method: 'profits_method',  endpoint: 'profits',  overrideKey: 'cap_rate',                   detailKey: 'cap_rate',                   label: 'Capitalisation Rate' },
    profits_revenue:        { method: 'profits_method',  endpoint: 'profits',  overrideKey: 'revenue_per_unit',           detailKey: 'revenue_per_unit',           label: 'Revenue per Unit' },
    profits_operator_share: { method: 'profits_method',  endpoint: 'profits',  overrideKey: 'operator_remuneration_pct',  detailKey: 'operator_remuneration_pct',  label: "Operator's Remuneration" },
    // Residual (development land)
    residual_gdv:           { method: 'residual_method', endpoint: 'residual', overrideKey: 'sale_price_per_sqm',         detailKey: 'sale_price_per_sqm',         label: 'GDV (Sale Price/sqm)' },
    residual_build_cost:    { method: 'residual_method', endpoint: 'residual', overrideKey: 'construction_cost_per_sqm',  detailKey: 'construction_cost_per_sqm',  label: 'Construction Cost/sqm' },
    residual_finance:       { method: 'residual_method', endpoint: 'residual', overrideKey: 'finance_rate',              detailKey: 'finance_rate',               label: 'Finance Rate' },
    // DRC (specialised)
    drc_replacement_cost:   { method: 'drc_method',      endpoint: 'drc',      overrideKey: 'replacement_cost_per_sqm',   detailKey: 'replacement_cost_per_sqm',   label: 'Replacement Cost/sqm' },
    drc_land_value:         { method: 'drc_method',      endpoint: 'drc',      overrideKey: 'land_value',                 detailKey: 'land_value',                 label: 'Land Value' },
  };
  // Methods WITHOUT a /value route (cost/income/sales): re-run the Python engine from the inputs the
  // engine echoed into the saved method_results.details, perturbing one driver. (Income is computed
  // from its echoed NOI/cap — exact for the cap-rate driver — since its engine recomputes NOI from
  // opex components not all echoed.)
  const RECON: Record<string, { method: string; pyEndpoint?: string; detailKey: string; kind: 'cost' | 'sales' | 'income'; overrideKey?: string; label: string }> = {
    construction_cost:     { method: 'cost_approach',     pyEndpoint: 'cost-approach',   kind: 'cost',  overrideKey: 'construction_cost_per_sqm', detailKey: 'cost_per_sqm',            label: 'Construction Cost/sqm' },
    land_value:            { method: 'cost_approach',     pyEndpoint: 'cost-approach',   kind: 'cost',  overrideKey: 'land_value_per_sqm',        detailKey: 'land_value_per_sqm',      label: 'Land Value/sqm' },
    depreciation:          { method: 'cost_approach',     pyEndpoint: 'cost-approach',   kind: 'cost',  overrideKey: 'physical_dep',              detailKey: 'physical_depreciation_pct', label: 'Depreciation' },
    price_per_sqm:         { method: 'sales_comparison',  pyEndpoint: 'sales-comparison', kind: 'sales', overrideKey: 'indicated_value',          detailKey: 'indicated_value',         label: 'Price per SQM' },
    comparable_adjustments:{ method: 'sales_comparison',  pyEndpoint: 'sales-comparison', kind: 'sales', overrideKey: 'total_multiplier',         detailKey: 'indicated_value',         label: 'Comparable Adjustments' },
    rental_rate:           { method: 'income_approach',   kind: 'income', detailKey: 'rental_rate',  label: 'Rental Rate' },
    cap_rate:              { method: 'income_approach',   kind: 'income', detailKey: 'cap_rate',     label: 'Capitalisation Rate' },
    vacancy_rate:          { method: 'income_approach',   kind: 'income', detailKey: 'vacancy_rate', label: 'Vacancy Rate' },
  };

  try {
    const valuationId = req.params.id;
    const b = req.body || {};
    const driver = String(b.driver || '').trim();
    const map = SENS_DRIVERS[driver];
    const recon = RECON[driver];
    if (!map && !recon) {
      return res.status(400).json({ error: 'Bad Request', message: `Unknown or unsupported sensitivity driver '${driver}'.`, supported: [...Object.keys(SENS_DRIVERS), ...Object.keys(RECON)] });
    }

    // ── Reconstruction path (cost / income / sales) ──────────────────────────
    if (recon) {
      const rangePctR = Number(b.range_pct) > 0 ? Number(b.range_pct) : 10;
      const pctsR = [-rangePctR, -rangePctR / 2, 0, rangePctR / 2, rangePctR];
      const vr = await query(
        `SELECT v.method_results, p.id AS property_id, p.property_type, p.building_size_sqm, p.built_area_sqm, p.land_area_sqm, p.year_built, p.condition, p.region
           FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
        [valuationId]
      );
      if (vr.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
      const prop = vr.rows[0];
      const mr = (prop.method_results || {})[recon.method];
      const d: any = mr?.details || {};
      const baseValueR = Number(mr?.value);
      let baseInputR = Number(d[recon.detailKey]);
      // Sales comparison persists only its headline value (no per-comp detail grid). Since the
      // method value scales linearly with the price/sqm (and with the adjustment multiplier), the
      // saved value IS a valid base input for those drivers.
      if (recon.kind === 'sales' && (!Number.isFinite(baseInputR) || baseInputR === 0)) baseInputR = baseValueR;
      if (!Number.isFinite(baseValueR) || !Number.isFinite(baseInputR) || baseInputR === 0) {
        return res.status(422).json({ error: 'Sensitivity unavailable', message: `No saved ${recon.method} result/input for '${driver}' — run that method first.` });
      }
      const pyBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
      const callPy = async (endpoint: string, property: any, options: any): Promise<number | null> => {
        try {
          const r = await fetch(`${pyBase}/api/v1/methods/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property, options }) });
          if (!r.ok) return null;
          const j: any = await r.json();
          return Number(j?.estimated_value);
        } catch { return null; }
      };

      const points = await Promise.all(pctsR.map(async (pct) => {
        const factor = 1 + pct / 100;
        if (pct === 0) return { pct, method_value: baseValueR };
        let mv: number | null = null;

        if (recon.kind === 'cost') {
          const property = { id: prop.property_id, property_type: prop.property_type, building_size_sqm: d.building_size_sqm, land_area_sqm: d.land_area_sqm, year_built: prop.year_built, condition: prop.condition, region: prop.region };
          const opts: any = {
            construction_cost_per_sqm: d.cost_per_sqm,
            land_value_per_sqm: d.land_value_per_sqm,
            soft_costs_percent: d.soft_costs_pct,
            siteworks: d.siteworks,
            entrepreneurial_profit_percent: d.entrepreneurial_profit_pct,
            depreciation_overrides: { physical: d.physical_depreciation_pct, functional: d.functional_obsolescence_pct, external: d.external_obsolescence_pct },
          };
          if (recon.overrideKey === 'construction_cost_per_sqm') opts.construction_cost_per_sqm = baseInputR * factor;
          else if (recon.overrideKey === 'land_value_per_sqm') opts.land_value_per_sqm = baseInputR * factor;
          else if (recon.overrideKey === 'physical_dep') opts.depreciation_overrides.physical = baseInputR * factor;
          mv = await callPy('cost-approach', property, opts);
        } else if (recon.kind === 'sales') {
          // Sales comparison value scales linearly with the indicated value and the comparable
          // adjustment multiplier (mv = indicated × total_multiplier). Compute inline — exact, and
          // avoids a redundant engine round-trip. (The legacy passthrough endpoint was removed.)
          const adj = { ...(d.adjustments || {}) };
          let indicated = Number(d.indicated_value) || baseValueR;                                // fall back to the saved headline value
          if (recon.overrideKey === 'indicated_value') indicated = indicated * factor;            // price per sqm scales value
          else if (recon.overrideKey === 'total_multiplier') adj.total_multiplier = (Number(adj.total_multiplier) || 1) * factor;
          mv = indicated * (Number(adj.total_multiplier) || 1);
        } else {
          // income — analytical perturbation from the engine's echoed NOI / EGI / cap (actual variables).
          const cap = Number(d.cap_rate_pct) / 100;
          const noi = Number(d.net_operating_income);
          const egi = Number(d.effective_gross_income);
          const pgi = Number(d.potential_gross_income);
          const opex = Number(d.operating_expenses);
          const expenseRatio = egi > 0 ? opex / egi : 0;
          const coll = Number(d.collection_loss_pct || 0) / 100;
          if (cap > 0) {
            if (recon.detailKey === 'cap_rate') {
              mv = noi / (cap * factor);                                                          // exact: value = NOI / cap
            } else if (recon.detailKey === 'rental_rate' && pgi > 0) {
              const newEgi = egi * factor;                                                        // rent scales PGI→EGI
              mv = (newEgi * (1 - expenseRatio)) / cap;
            } else if (recon.detailKey === 'vacancy_rate' && pgi > 0) {
              const vac = Number(d.vacancy_rate) / 100;
              const newEgi = pgi * (1 - vac * factor - coll);
              mv = (newEgi * (1 - expenseRatio)) / cap;
            }
          }
        }
        return { pct, method_value: Number.isFinite(mv as number) ? mv : null };
      }));

      return res.json({
        success: true, driver, driver_label: recon.label, method: recon.method, range_pct: rangePctR,
        base_input: baseInputR, base_method_value: baseValueR, points,
        meta: { engine: 'python', basis: recon.kind === 'income' ? 'engine variables (NOI/cap) perturbed' : 'actual engine re-run per point' },
      });
    }
    const rangePct = Number(b.range_pct) > 0 ? Number(b.range_pct) : 10;
    const pcts = [-rangePct, -rangePct / 2, 0, rangePct / 2, rangePct];

    // Re-run a method engine via its /value route (internal, on this same server).
    const base = `http://127.0.0.1:${process.env.PORT || 4000}/api/v1/valuations/${valuationId}/${map.endpoint}/value`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
    if (req.headers.cookie) headers['Cookie'] = req.headers.cookie;
    const runValue = async (override: Record<string, any>): Promise<any> => {
      const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(override) });
      if (!r.ok) { const t = await r.text(); throw new Error(`engine ${r.status}: ${t.slice(0, 200)}`); }
      return r.json();
    };

    // Base run — resolves the input from the Data Hub and gives the base engine value.
    const baseRes = await runValue({});
    const baseMethodValue = Number(baseRes?.data?.estimated_value);
    const baseInput = Number(baseRes?.data?.details?.[map.detailKey]);
    if (!Number.isFinite(baseMethodValue) || !Number.isFinite(baseInput) || baseInput === 0) {
      return res.status(422).json({ error: 'Sensitivity unavailable', message: `Could not resolve a base value/input for '${driver}' — the method may not be computable for this property.` });
    }

    // Perturb the driver input by each %, re-running the actual engine.
    const points = await Promise.all(pcts.map(async (pct) => {
      if (pct === 0) return { pct, input_value: baseInput, method_value: baseMethodValue };
      const perturbedInput = baseInput * (1 + pct / 100);
      try {
        const r = await runValue({ [map.overrideKey]: perturbedInput });
        return { pct, input_value: perturbedInput, method_value: Number(r?.data?.estimated_value) };
      } catch {
        return { pct, input_value: perturbedInput, method_value: null };
      }
    }));

    return res.json({
      success: true,
      driver,
      driver_label: map.label,
      method: map.method,
      range_pct: rangePct,
      base_input: baseInput,
      base_method_value: baseMethodValue,
      points,
      meta: { engine: 'python', basis: 'actual engine re-run per point' },
    });
  } catch (error: any) {
    logger.error('sensitivity failed', { error: error.message });
    return res.status(500).json({ error: 'Internal error', message: error.message });
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
      return res.json({
        success: true,
        data: null,
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

import { capRateService, CapRateMethodology, ListingDerivedCapRate } from '../services/analytics/capRateService';
import { constructionCostService } from '../services/data-hub/constructionCostService';

/**
/**
 * @route GET /api/valuations/neighborhood-premiums
 * @desc Location premium factors for sales-comparison adjustments, sourced from the
 *       neighborhood_premiums table (single source of truth). Replaces the hardcoded
 *       copy that used to live in the frontend AdjustmentGrid. Optional ?region filter.
 * @access Private
 */
router.get('/neighborhood-premiums', async (req: Request, res: Response) => {
  try {
    const region = (req.query.region as string | undefined)?.toLowerCase();
    // Order canonical (no-space) neighborhood rows FIRST so that, combined with the
    // first-write-wins map build below, a canonical row (e.g. 'east_legon') deterministically
    // wins over a space-variant duplicate ('East Legon') that normalizes to the same key.
    const result = region
      ? await query(
          `SELECT neighborhood, region, premium_factor, market_tier
           FROM neighborhood_premiums WHERE LOWER(region) = $1
           ORDER BY (neighborhood LIKE '% %') ASC, premium_factor DESC`,
          [region]
        )
      : await query(
          `SELECT neighborhood, region, premium_factor, market_tier
           FROM neighborhood_premiums
           ORDER BY (neighborhood LIKE '% %') ASC, region, premium_factor DESC`
        );

    // Map keyed by normalized neighborhood (underscore + lowercase) for fast client lookup.
    // First-write-wins (see ORDER BY above) makes the result deterministic.
    const premiums: Record<string, number> = {};
    for (const row of result.rows) {
      const key = String(row.neighborhood).toLowerCase().trim().replace(/\s+/g, '_');
      if (!(key in premiums)) premiums[key] = Number(row.premium_factor);
    }

    res.json({ success: true, data: { premiums, rows: result.rows, count: result.rows.length } });
  } catch (error: any) {
    logger.error('Failed to fetch neighborhood premiums', { error: error?.message });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch neighborhood premiums' });
  }
});

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
    const validRegions = ['greater_accra', 'ashanti', 'eastern', 'central', 'western', 'volta', 'northern', 'upper_east', 'upper_west', 'bono', 'bono_east', 'ahafo', 'savannah', 'north_east', 'oti', 'western_north'];
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

    const validRegions = ['greater_accra', 'ashanti', 'eastern', 'central', 'western', 'volta', 'northern', 'upper_east', 'upper_west', 'bono', 'bono_east', 'ahafo', 'savannah', 'north_east', 'oti', 'western_north'];
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
        benchmark_cap_rate,
        typical_cap_rate_low,
        typical_cap_rate_high,
        sample_size,
        confidence_score,
        market_condition,
        yield_trend,
        data_quality,
        methodology_notes,
        effective_date,
        valid_until,
        created_at,
        last_updated
      FROM market_cap_rate_benchmarks
      WHERE (valid_until IS NULL OR valid_until >= CURRENT_DATE)
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
      params.push(`%${methodology}%`);
      benchmarkQuery += ` AND methodology_notes ILIKE $${params.length}`;
    }

    benchmarkQuery += ` ORDER BY region, property_type, effective_date DESC`;

    const result = await query(benchmarkQuery, params);

    res.json({
      success: true,
      data: result.rows.map((row: any) => ({
        id: row.id,
        region: row.region,
        propertyType: row.property_type,
        benchmarkCapRate: parseFloat(row.benchmark_cap_rate),
        benchmarkCapRatePercentage: (parseFloat(row.benchmark_cap_rate) * 100).toFixed(2) + '%',
        range: {
          low: parseFloat(row.typical_cap_rate_low),
          high: parseFloat(row.typical_cap_rate_high)
        },
        sampleSize: row.sample_size,
        confidenceScore: parseFloat(row.confidence_score),
        marketCondition: row.market_condition,
        yieldTrend: row.yield_trend,
        dataQuality: row.data_quality,
        methodologyNotes: row.methodology_notes,
        effectiveDate: row.effective_date,
        expiryDate: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.last_updated
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
// FLOOR PLAN ROUTES
// =====================================================

import { floorPlanService } from '../services/valuation-engine/floorPlanService';
import { valuationDocumentService, ValuationDocType } from '../services/valuation-engine/valuationDocumentService';

// =====================================================
// DOCUMENTS & PHOTOS (Appendices C/D/E): subject photos, title documents, location map.
// Valuation-scoped, mirrors the floor-plan upload pattern (file in MinIO, ref in DB).
// =====================================================

/** POST /api/valuations/:id/documents — upload a photo or title document (base64 data URL). */
// Multer middleware wrapper that turns size/type rejections into clean client errors
// (a LIMIT_FILE_SIZE would otherwise surface as an opaque 500).
const handleDocumentUpload = (req: Request, res: Response, next: NextFunction) => {
  documentUpload.single('file')(req, res, (err: any) => {
    if (err) {
      const tooBig = err?.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'File too large' : 'Upload rejected',
        message: tooBig ? 'Maximum document size is 50MB' : (err?.message || 'Invalid upload'),
      });
    }
    next();
  });
};

router.post('/:id/documents', validateUUID('id'), handleDocumentUpload, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
    const allowed: ValuationDocType[] = ['photo', 'title_document'];
    const type: ValuationDocType = allowed.includes(body.docType) ? body.docType : 'photo';
    const displayOrder = body.displayOrder != null && Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0;

    let row;
    if (file?.buffer) {
      // Preferred path: streamed multipart file (no base64 inflation, no 10 MB JSON gate).
      row = await valuationDocumentService.saveFromBuffer({
        valuationId: req.params.id,
        propertyId: body.propertyId || null,
        buffer: file.buffer,
        mime: file.mimetype,
        filename: body.filename || file.originalname || null,
        docType: type,
        caption: body.caption || null,
        displayOrder,
        createdBy: (req as any).user?.id || null,
      });
    } else if (typeof body.dataUrl === 'string' && body.dataUrl) {
      // Legacy base64 path — retained for backward compatibility with any older callers.
      row = await valuationDocumentService.saveFromDataUrl({
        valuationId: req.params.id,
        propertyId: body.propertyId || null,
        dataUrl: body.dataUrl,
        filename: body.filename || null,
        docType: type,
        caption: body.caption || null,
        displayOrder,
        createdBy: (req as any).user?.id || null,
      });
    } else {
      return res.status(400).json({ error: 'Bad Request', message: 'A file (multipart field "file") or dataUrl is required' });
    }
    res.json({ success: true, data: row });
  } catch (err: any) {
    logger.error('Failed to upload valuation document', { error: err.message });
    res.status(500).json({ error: 'Upload failed', message: err.message });
  }
});

/** GET /api/valuations/:id/documents — list documents (optional ?type=photo|title_document|location_map). */
router.get('/:id/documents', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const type = req.query.type as ValuationDocType | undefined;
    const rows = await valuationDocumentService.list(req.params.id, type);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: 'List failed', message: err.message });
  }
});

/** DELETE /api/valuations/:id/documents/:docId */
router.delete('/:id/documents/:docId', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    await valuationDocumentService.remove(req.params.docId, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Delete failed', message: err.message });
  }
});

/** POST /api/valuations/:id/documents/location-map — (re)generate the satellite/location map. */
router.post('/:id/documents/location-map', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const propRes = await query(
      `SELECT p.id, p.latitude, p.longitude FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [req.params.id]
    );
    const prop = propRes.rows[0];
    const lat = prop?.latitude != null ? Number(prop.latitude) : null;
    const lng = prop?.longitude != null ? Number(prop.longitude) : null;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Subject property has no coordinates to map' });
    }
    const row = await valuationDocumentService.generateLocationMap(req.params.id, lat, lng, { propertyId: prop.id });
    if (!row) return res.status(502).json({ error: 'Map generation failed', message: 'Could not generate static map (check GOOGLE_MAPS_API_KEY)' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: 'Map generation failed', message: err.message });
  }
});

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
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', `inline; filename="floor-${floorPlan.floor_number}.${ext}"`);
    res.send(Buffer.from(file.body));
  } catch (error: any) {
    logger.error('Failed to stream floor plan image', { planId: req.params.planId, error: error.message });
    res.status(500).json({ error: 'Failed to stream floor plan image', message: error.message });
  }
});

/**
 * GET /api/valuations/:id/documents/:docId/image-stream
 * Stream a valuation document (location map / photo / title doc) from MinIO with a
 * non-expiring URL, so the report VIEWER can render Appendix C/D/E (mirrors floor plans).
 */
router.get('/:id/documents/:docId/image-stream', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT storage_url, mime_type, filename FROM valuation_documents WHERE id = $1 AND valuation_id = $2`,
      [req.params.docId, req.params.id]
    );
    const doc = r.rows[0];
    if (!doc?.storage_url) return res.status(404).json({ error: 'Document not found' });

    const match = String(doc.storage_url).match(/^minio:\/\/([^/]+)\/(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid storage URL format' });

    const [, bucket, key] = match;
    const { getFile } = await import('../database/minio');
    const file = await getFile(bucket, key);

    const ext = (key.split('.').pop() || 'png').toLowerCase();
    const mime = doc.mime_type
      || (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : 'image/png');

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename || 'document.' + ext}"`);
    res.send(Buffer.from(file.body));
  } catch (error: any) {
    logger.error('Failed to stream document image', { docId: req.params.docId, error: error.message });
    res.status(500).json({ error: 'Failed to stream document', message: error.message });
  }
});

/**
 * GET /api/valuations/:id/documents/:docId/image-pages
 * Render a document as ONE image (PDFs rasterized + stacked) for the report VIEWER's <img> —
 * avoids the X-Frame-Options block that prevents PDFs from rendering in an <iframe>.
 */
router.get('/:id/documents/:docId/image-pages', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const result = await valuationDocumentService.getDocumentImage(req.params.id, req.params.docId);
    if (!result) return res.status(404).json({ error: 'Document image not available' });
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(result.buffer);
  } catch (error: any) {
    logger.error('Failed to render document image', { docId: req.params.docId, error: error.message });
    res.status(500).json({ error: 'Failed to render document', message: error.message });
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

    // Filter intermediate method data before reconciliation (Recommendation 4)
    const INTERMEDIATE_METHODS = ['rental_market', 'rental_market_analysis', 'land_value'];
    const filteredResults: Record<string, any> = {};
    for (const [key, val] of Object.entries(method_results)) {
      if (!INTERMEDIATE_METHODS.includes(key)) {
        filteredResults[key] = val;
      }
    }

    // Augment with computed methods from methods_applied that are missing from the request
    // This ensures sales_comparison and other methods are included if they were computed
    try {
      const valuationRow = await query(
        `SELECT methods_applied, method_results as v_method_results FROM valuations WHERE id = $1`,
        [req.params.id]
      );
      if (valuationRow.rows.length > 0) {
        const { methods_applied, v_method_results } = valuationRow.rows[0];
        const appliedMethods: string[] = methods_applied || [];

        for (const method of appliedMethods) {
          if (INTERMEDIATE_METHODS.includes(method)) continue;
          if (filteredResults[method]) continue; // already in request

          // Check valuations.method_results for this method
          if (v_method_results && v_method_results[method]) {
            const mr = v_method_results[method];
            const value = mr.value || mr.value_ghs || mr.estimated_value || 0;
            if (value > 0) {
              filteredResults[method] = {
                ...mr,
                method,
                weight: mr.weight || 0,
              };
            }
          }

          // Also check valuation_method_inputs if still not found
          if (!filteredResults[method]) {
            const inputRow = await query(
              `SELECT calculated_value, confidence_score FROM valuation_method_inputs
               WHERE valuation_id = $1 AND method_type = $2 AND calculated_value IS NOT NULL AND calculated_value > 0`,
              [req.params.id, method]
            );
            if (inputRow.rows.length > 0) {
              filteredResults[method] = {
                value: Number(inputRow.rows[0].calculated_value),
                method,
                weight: 0,
                confidence_score: Number(inputRow.rows[0].confidence_score) || 0.5,
                data_quality_score: 0.7,
              };
            }
          }
        }
      }
    } catch (augmentError: any) {
      logger.warn('Failed to augment method_results with computed methods', { error: augmentError.message });
    }

    // Calculate weighted average from method_results directly (don't rely on Python service)
    let weightedSum = 0;
    let totalWeight = 0;
    let confidenceSum = 0;
    const methodWeights: Record<string, number> = {};
    const values: number[] = [];

    Object.entries(filteredResults).forEach(([method, data]: [string, any]) => {
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
        JSON.stringify(filteredResults),
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

    // Get the current reconciliation to access method_results
    const current = await query(
      `SELECT method_results, valuation_id FROM valuation_reconciliations WHERE id = $1`,
      [req.params.reconciliationId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation not found' });
    }

    const methodResults = current.rows[0].method_results || {};
    const valuationId = current.rows[0].valuation_id;

    // Recalculate weighted_average_value using method values × new weights
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [method, weight] of Object.entries(weights)) {
      const w = Number(weight) || 0;
      if (w <= 0) continue;

      // Get the indicated value for this method from method_results
      let value = 0;
      if (methodResults[method]?.indicated_value) {
        value = Number(methodResults[method].indicated_value);
      } else if (methodResults[method]?.value) {
        value = Number(methodResults[method].value);
      }

      // If method not in method_results, try valuation_method_inputs
      if (value === 0 && valuationId) {
        const inputResult = await query(
          `SELECT calculated_value FROM valuation_method_inputs
           WHERE valuation_id = $1 AND method_type = $2
           ORDER BY created_at DESC LIMIT 1`,
          [valuationId, method]
        );
        if (inputResult.rows.length > 0 && inputResult.rows[0].calculated_value) {
          value = Number(inputResult.rows[0].calculated_value);
        }
      }

      if (value > 0) {
        weightedSum += value * (w / 100);
        totalWeight += w;
      }
    }

    const weightedAverage = totalWeight > 0 ? Math.round(weightedSum) : null;

    const result = await query(
      `UPDATE valuation_reconciliations SET
        method_weights = $1,
        weighting_method = 'manual',
        weighted_average_value = COALESCE($3, weighted_average_value),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [JSON.stringify(weights), req.params.reconciliationId, weightedAverage]
    );

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
