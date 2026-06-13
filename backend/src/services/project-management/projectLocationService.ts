/**
 * Project Location Integration Service
 * Phase 1 Sprint 1: Data Hub Integration for Project Location
 * 
 * Extends project creation/update with location validation and enrichment
 * using existing Data Hub services:
 * - ghanaPostService (Ghana PostGPS validation)
 * - addressValidationService (address cross-referencing)
 * - geocodingService (coordinate validation)
 * 
 * IMPORTANT: This service CONSUMES Data Hub services, NOT duplicates them.
 * 
 * @deprecated This god file (1264 lines) has been split into focused services.
 * Use the new modular services in ./location/:
 * - locationValidationService: Validate/enrich locations via Data Hub
 * - projectSearchService: Location-based project search
 * - regulatoryService: Permits and regulatory authorities
 * 
 * Import from './location' instead of using this file directly.
 * This file is kept for backwards compatibility only.
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// Import existing Data Hub services - DO NOT DUPLICATE
import { ghanaPostService, GHANA_GPS_DISTRICTS, GHANA_NEIGHBORHOODS } from '../data-hub/ghanaPostGeocodingService';
import { addressValidationService, AddressValidationResult } from '../data-hub/addressValidationService';
import { geocodingService } from '../data-hub/geocodingService';

// Import project service types
import { CreateProjectInput, DevelopmentProject, ProjectType } from './projectService';
import { getDefaultPhasesForType, classifyMilestone, PhaseTemplate } from './projectDefaults';

// ============================================================================
// TYPES
// ============================================================================

export interface LocationValidationInput {
  ghana_post_gps?: string;
  latitude?: number;
  longitude?: number;
  address_line1?: string;
  city?: string;
  region?: string;
}

export interface LocationValidationResult {
  isValid: boolean;
  confidence: number;
  validated: {
    ghana_post_gps?: string;
    latitude?: number;
    longitude?: number;
    ghana_region?: string;
    ghana_district?: string;
    ghana_area?: string;
    city?: string;
    region?: string;
  };
  enrichments: Array<{
    field: string;
    value: string;
    source: string;
    confidence: number;
  }>;
  issues: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    field?: string;
  }>;
  source: string;
}

export interface CreateProjectWithLocationInput extends CreateProjectInput {
  // Ghana-specific fields from migration 076
  ghana_region?: string;
  ghana_district?: string;
  ghana_area?: string;
  land_tenure_type?: 'government_lease' | 'stool_land_lease' | 'family_land' | 'freehold' | 'leasehold' | 'government_allocation';
  land_parcel_id?: string;
  traditional_authority_id?: string;
  assembly_id?: string;
  
  // Marketing
  hero_image_url?: string;
  floor_plan_url?: string;
  site_plan_url?: string;
  render_url?: string;
  
  // Financial structure
  funding_sources?: Array<{
    type: 'equity' | 'debt' | 'grant' | 'presales';
    amount: number;
    currency: string;
    provider?: string;
    interest_rate?: number;
  }>;
  display_currency?: 'GHS' | 'USD' | 'EUR' | 'GBP';
  
  // Unit mix (denormalized summary)
  unit_mix?: Array<{
    type: string;
    count: number;
    min_price?: number;
    max_price?: number;
    available?: number;
  }>;
  
  // Skip validation (for trusted imports)
  skip_location_validation?: boolean;
}

export interface EnrichedProjectData {
  // Original input with enrichments applied
  enrichedInput: CreateProjectWithLocationInput;
  // Validation result for UI feedback
  locationValidation: LocationValidationResult;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProjectLocationService {
  
  /**
   * Validate and enrich location data using Data Hub services
   * @param input Raw location input (GPS code, coordinates, or address)
   * @returns Validation result with enriched location data
   */
  async validateAndEnrichLocation(input: LocationValidationInput): Promise<LocationValidationResult> {
    const result: LocationValidationResult = {
      isValid: false,
      confidence: 0,
      validated: {},
      enrichments: [],
      issues: [],
      source: 'none',
    };

    // 1. Try Ghana PostGPS validation first (most reliable for Ghana)
    if (input.ghana_post_gps) {
      const normalized = ghanaPostService.normalizeGPSCode(input.ghana_post_gps);
      
      if (!normalized) {
        result.issues.push({
          type: 'invalid_gps_format',
          severity: 'error',
          message: `Invalid Ghana PostGPS format: ${input.ghana_post_gps}. Expected format: XX-XXXX-XXXX`,
          field: 'ghana_post_gps',
        });
      } else {
        // Valid format - now geocode it
        const geocodeResult = await ghanaPostService.geocodeDigitalAddress(normalized);
        
        if (geocodeResult) {
          result.validated = {
            ghana_post_gps: geocodeResult.digitalAddress,
            latitude: geocodeResult.latitude,
            longitude: geocodeResult.longitude,
            ghana_region: geocodeResult.region,
            ghana_district: geocodeResult.district,
            ghana_area: geocodeResult.area,
            city: this.inferCityFromDistrict(geocodeResult.district, geocodeResult.region),
            region: geocodeResult.region,
          };
          result.confidence = geocodeResult.confidence;
          result.isValid = geocodeResult.confidence >= 0.5;
          result.source = geocodeResult.source;

          // Log enrichments
          if (geocodeResult.region) {
            result.enrichments.push({
              field: 'ghana_region',
              value: geocodeResult.region,
              source: geocodeResult.source,
              confidence: geocodeResult.confidence,
            });
          }
          if (geocodeResult.district) {
            result.enrichments.push({
              field: 'ghana_district',
              value: geocodeResult.district,
              source: geocodeResult.source,
              confidence: geocodeResult.confidence,
            });
          }
          if (geocodeResult.area) {
            result.enrichments.push({
              field: 'ghana_area',
              value: geocodeResult.area,
              source: geocodeResult.source,
              confidence: geocodeResult.confidence,
            });
          }

          // Cross-check with provided coordinates if any
          if (input.latitude && input.longitude) {
            const distance = this.calculateDistance(
              input.latitude,
              input.longitude,
              geocodeResult.latitude,
              geocodeResult.longitude
            );
            
            if (distance > 1.0) { // More than 1km difference
              result.issues.push({
                type: 'coordinates_mismatch',
                severity: 'warning',
                message: `Provided coordinates differ from GPS code location by ${distance.toFixed(2)}km`,
                field: 'coordinates',
              });
            }
          }
        } else {
          result.issues.push({
            type: 'gps_geocode_failed',
            severity: 'warning',
            message: `Could not geocode Ghana PostGPS: ${normalized}`,
            field: 'ghana_post_gps',
          });
        }
      }
    }

    // 2. If no GPS code, try coordinates
    if (!result.isValid && input.latitude && input.longitude) {
      // Validate coordinates are within Ghana
      if (!geocodingService.isWithinGhana(input.latitude, input.longitude)) {
        result.issues.push({
          type: 'outside_ghana',
          severity: 'error',
          message: 'Coordinates are outside Ghana boundaries',
          field: 'coordinates',
        });
      } else {
        // Try reverse geocoding to get GPS code
        const reverseResult = await ghanaPostService.reverseGeocode(input.latitude, input.longitude);
        
        if (reverseResult) {
          result.validated = {
            ghana_post_gps: reverseResult.digitalAddress,
            latitude: input.latitude,
            longitude: input.longitude,
            ghana_region: reverseResult.region,
            ghana_district: reverseResult.district,
            ghana_area: reverseResult.area,
            city: this.inferCityFromDistrict(reverseResult.district, reverseResult.region),
            region: reverseResult.region,
          };
          result.confidence = reverseResult.confidence;
          result.isValid = reverseResult.confidence >= 0.4;
          result.source = 'reverse_geocode';

          result.enrichments.push({
            field: 'ghana_post_gps',
            value: reverseResult.digitalAddress,
            source: 'reverse_geocode',
            confidence: reverseResult.confidence,
          });
        } else {
          // At least mark coordinates as validated
          result.validated.latitude = input.latitude;
          result.validated.longitude = input.longitude;
          result.confidence = 0.3;
          result.isValid = true; // Coordinates are valid even without GPS code
          result.source = 'coordinates_only';

          result.issues.push({
            type: 'no_gps_for_coordinates',
            severity: 'info',
            message: 'Could not determine Ghana PostGPS code for these coordinates',
            field: 'ghana_post_gps',
          });
        }
      }
    }

    // 3. Try address-based lookup as fallback
    if (!result.isValid && input.address_line1) {
      const addressResult = await addressValidationService.validateAddress(
        input.address_line1,
        input.latitude && input.longitude 
          ? { latitude: input.latitude, longitude: input.longitude }
          : undefined
      );
      
      if (addressResult.isValid) {
        result.validated = {
          ...result.validated,
          ghana_post_gps: addressResult.validatedAddress.digitalAddress,
          latitude: addressResult.validatedAddress.latitude,
          longitude: addressResult.validatedAddress.longitude,
          ghana_region: addressResult.validatedAddress.region,
          ghana_district: addressResult.validatedAddress.district,
          ghana_area: addressResult.validatedAddress.area,
          region: addressResult.validatedAddress.region,
        };
        result.confidence = addressResult.confidence;
        result.isValid = true;
        result.source = addressResult.source;

        result.enrichments.push(...addressResult.enrichments.map(e => ({
          ...e,
          confidence: e.confidence,
        })));
      }
    }

    // 4. Final fallback: use provided region/city if nothing else worked
    if (!result.isValid) {
      if (input.region) {
        result.validated.region = input.region;
        result.validated.ghana_region = input.region;
      }
      if (input.city) {
        result.validated.city = input.city;
      }
      
      result.issues.push({
        type: 'location_incomplete',
        severity: 'warning',
        message: 'Location could not be fully validated. Consider providing a Ghana PostGPS code.',
      });
      
      // Still allow project creation with partial location
      result.isValid = !!(input.region || input.city);
      result.confidence = 0.2;
      result.source = 'user_provided';
    }

    return result;
  }

  /**
   * Prepare project input with validated and enriched location data
   * @param input Raw project creation input
   * @returns Enriched input with location data filled in
   */
  async enrichProjectInput(input: CreateProjectWithLocationInput): Promise<EnrichedProjectData> {
    // Skip validation if explicitly requested (for trusted imports)
    if (input.skip_location_validation) {
      return {
        enrichedInput: input,
        locationValidation: {
          isValid: true,
          confidence: 1.0,
          validated: {
            ghana_post_gps: input.ghana_post_gps,
            latitude: input.latitude,
            longitude: input.longitude,
            ghana_region: input.ghana_region,
            ghana_district: input.ghana_district,
            ghana_area: input.ghana_area,
            city: input.city,
            region: input.region,
          },
          enrichments: [],
          issues: [],
          source: 'trusted_import',
        },
      };
    }

    // Validate and enrich location
    const locationResult = await this.validateAndEnrichLocation({
      ghana_post_gps: input.ghana_post_gps,
      latitude: input.latitude,
      longitude: input.longitude,
      address_line1: input.address_line1,
      city: input.city,
      region: input.region,
    });

    // Apply enrichments to input
    const enrichedInput: CreateProjectWithLocationInput = {
      ...input,
      // Apply validated location data (only if not already provided)
      ghana_post_gps: input.ghana_post_gps || locationResult.validated.ghana_post_gps,
      latitude: input.latitude ?? locationResult.validated.latitude,
      longitude: input.longitude ?? locationResult.validated.longitude,
      ghana_region: input.ghana_region || locationResult.validated.ghana_region,
      ghana_district: input.ghana_district || locationResult.validated.ghana_district,
      ghana_area: input.ghana_area || locationResult.validated.ghana_area,
      city: input.city || locationResult.validated.city,
      region: input.region || locationResult.validated.region,
    };

    return {
      enrichedInput,
      locationValidation: locationResult,
    };
  }

  /**
   * Helper to check if a string is a valid UUID
   */
  private isValidUUID(str: string | undefined | null): boolean {
    if (!str) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Create a project with full location validation and enrichment
   * Wrapper around projectService.create() with Data Hub integration
   */
  async createWithValidation(
    input: CreateProjectWithLocationInput
  ): Promise<{ project: DevelopmentProject; locationValidation: LocationValidationResult }> {
    
    // Enrich the input with validated location data
    const { enrichedInput, locationValidation } = await this.enrichProjectInput(input);

    // If validation failed with errors (not just warnings), throw
    const errors = locationValidation.issues.filter(i => i.severity === 'error');
    if (errors.length > 0 && !enrichedInput.skip_location_validation) {
      const errorMessages = errors.map(e => e.message).join('; ');
      throw new Error(`Location validation failed: ${errorMessages}`);
    }

    // Validate UUIDs for optional foreign key fields - set to null if not valid UUIDs
    const traditionalAuthorityId = this.isValidUUID(enrichedInput.traditional_authority_id) 
      ? enrichedInput.traditional_authority_id 
      : null;
    const assemblyId = this.isValidUUID(enrichedInput.assembly_id) 
      ? enrichedInput.assembly_id 
      : null;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Generate project number
      const numberResult = await client.query(
        'SELECT generate_project_number($1) as project_number',
        [enrichedInput.organization_id]
      );
      const projectNumber = numberResult.rows[0].project_number;
      
      // Calculate acres from sqm if provided
      let landSizeAcres: number | null = null;
      if (enrichedInput.land_size_sqm) {
        landSizeAcres = enrichedInput.land_size_sqm / 4046.86;
      }
      
      const id = uuidv4();
      
      // Extended insert with Ghana-specific fields
      const result = await client.query(
        `INSERT INTO development_projects (
          id, organization_id, project_number, name, description,
          project_type, status,
          address_line1, address_line2, city, region, country,
          ghana_post_gps, latitude, longitude,
          ghana_region, ghana_district, ghana_area,
          traditional_authority_id, assembly_id,
          land_tenure_type, land_parcel_id,
          land_size_sqm, land_size_acres, land_title_number, land_cost,
          total_floors, total_buildings,
          total_budget,
          planned_start_date, planned_completion_date,
          developer_name, developer_contact, developer_email,
          project_manager_id,
          marketing_name, tagline,
          cover_image_url, hero_image_url, floor_plan_url, site_plan_url, render_url,
          amenities,
          funding_sources, display_currency, unit_mix,
          auto_create_deals, default_pipeline_id,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, 'planning',
          $7, $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17,
          $18, $19,
          $20, $21,
          $22, $23, $24, $25,
          $26, $27,
          $28,
          $29, $30,
          $31, $32, $33,
          $34,
          $35, $36,
          $37, $38, $39, $40, $41,
          $42,
          $43, $44, $45,
          $46, $47,
          $48
        ) RETURNING *`,
        [
          id,
          enrichedInput.organization_id,
          projectNumber,
          enrichedInput.name,
          enrichedInput.description,
          enrichedInput.project_type,
          enrichedInput.address_line1,
          enrichedInput.address_line2,
          enrichedInput.city,
          enrichedInput.region,
          enrichedInput.country || 'Ghana',
          enrichedInput.ghana_post_gps,
          enrichedInput.latitude,
          enrichedInput.longitude,
          enrichedInput.ghana_region,
          enrichedInput.ghana_district,
          enrichedInput.ghana_area,
          traditionalAuthorityId,  // Use validated UUID or null
          assemblyId,              // Use validated UUID or null
          enrichedInput.land_tenure_type,
          enrichedInput.land_parcel_id,
          enrichedInput.land_size_sqm,
          landSizeAcres,
          enrichedInput.land_title_number,
          enrichedInput.land_cost,
          enrichedInput.total_floors,
          enrichedInput.total_buildings || 1,
          enrichedInput.total_budget || 0,
          enrichedInput.planned_start_date,
          enrichedInput.planned_completion_date,
          enrichedInput.developer_name,
          enrichedInput.developer_contact,
          enrichedInput.developer_email,
          enrichedInput.project_manager_id,
          enrichedInput.marketing_name,
          enrichedInput.tagline,
          enrichedInput.cover_image_url,
          enrichedInput.hero_image_url,
          enrichedInput.floor_plan_url,
          enrichedInput.site_plan_url,
          enrichedInput.render_url,
          JSON.stringify(enrichedInput.amenities || []),
          JSON.stringify(enrichedInput.funding_sources || []),
          enrichedInput.display_currency || 'GHS',
          JSON.stringify(enrichedInput.unit_mix || []),
          enrichedInput.auto_create_deals !== false,
          enrichedInput.default_pipeline_id,
          enrichedInput.created_by
        ]
      );
      
      const project = this.mapRowExtended(result.rows[0]);
      
      // Seed a structured phase + milestone plan. Use the explicitly chosen
      // template when present, otherwise auto-apply the sensible default for the
      // project type so every new project starts with a real plan (not blank).
      const seeded = await this.seedPhasesAndMilestones(client, id, enrichedInput.organization_id, {
        templateId: enrichedInput.phase_template_id,
        projectType: enrichedInput.project_type,
        startDate: enrichedInput.planned_start_date,
        createdBy: enrichedInput.created_by,
      });
      logger.info('Seeded project plan', { projectId: id, phases: seeded.phases, milestones: seeded.milestones });
      
      await client.query('COMMIT');
      
      logger.info('Project created with location validation', {
        projectId: id,
        projectNumber,
        locationConfidence: locationValidation.confidence,
        locationSource: locationValidation.source,
        enrichments: locationValidation.enrichments.length,
        issues: locationValidation.issues.length,
      });
      
      return { project, locationValidation };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Project creation failed', { error, input: enrichedInput.name });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Lookup traditional authority by location
   */
  async findTraditionalAuthority(
    region: string,
    district?: string
  ): Promise<{ id: string; name: string; paramount_chief?: string } | null> {
    const result = await pool.query(
      `SELECT id, name, paramount_chief 
       FROM traditional_authorities 
       WHERE region = $1 
         AND ($2::text IS NULL OR district = $2)
         AND is_active = true
       ORDER BY name
       LIMIT 1`,
      [region, district]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Lookup regulatory assembly by location
   */
  async findRegulatoryAssembly(
    region: string,
    assemblyName?: string
  ): Promise<{ id: string; assembly_name: string; permit_office_phone?: string } | null> {
    const conditions = ['region = $1', 'is_active = true'];
    const params: any[] = [region];
    
    if (assemblyName) {
      conditions.push('assembly_name ILIKE $2');
      params.push(`%${assemblyName}%`);
    }
    
    const result = await pool.query(
      `SELECT id, assembly_name, permit_office_phone 
       FROM assembly_regulatory_contacts 
       WHERE ${conditions.join(' AND ')}
       ORDER BY assembly_name
       LIMIT 1`,
      params
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get all assemblies for a region (for dropdown selection)
   */
  async getAssembliesByRegion(region: string): Promise<Array<{
    id: string;
    assembly_name: string;
    assembly_type: string;
  }>> {
    const result = await pool.query(
      `SELECT id, assembly_name, assembly_type 
       FROM assembly_regulatory_contacts 
       WHERE region = $1 AND is_active = true
       ORDER BY assembly_type, assembly_name`,
      [region]
    );
    
    return result.rows;
  }

  /**
   * Get all traditional authorities for a region
   */
  async getTraditionalAuthoritiesByRegion(region: string): Promise<Array<{
    id: string;
    name: string;
    authority_type: string;
    paramount_chief?: string;
  }>> {
    const result = await pool.query(
      `SELECT id, name, authority_type, paramount_chief 
       FROM traditional_authorities 
       WHERE region = $1 AND is_active = true
       ORDER BY name`,
      [region]
    );
    
    return result.rows;
  }

  /**
   * Search projects with full-text search and filters
   */
  async searchProjects(params: {
    organizationId: string;
    query?: string;
    region?: string;
    district?: string;
    projectType?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    projects: Array<{ id: string; name: string; project_number: string; rank?: number }>;
    total: number;
  }> {
    const { organizationId, query, region, district, projectType, status, limit = 20, offset = 0 } = params;
    
    let whereClause = 'organization_id = $1 AND deleted_at IS NULL';
    const queryParams: any[] = [organizationId];
    let paramIndex = 2;
    
    if (query) {
      whereClause += ` AND search_vector @@ plainto_tsquery('english', $${paramIndex})`;
      queryParams.push(query);
      paramIndex++;
    }
    
    if (region) {
      whereClause += ` AND ghana_region = $${paramIndex}`;
      queryParams.push(region);
      paramIndex++;
    }
    
    if (district) {
      whereClause += ` AND ghana_district = $${paramIndex}`;
      queryParams.push(district);
      paramIndex++;
    }
    
    if (projectType) {
      whereClause += ` AND project_type = $${paramIndex}`;
      queryParams.push(projectType);
      paramIndex++;
    }
    
    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }
    
    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM development_projects WHERE ${whereClause}`,
      queryParams
    );
    
    // Get projects with optional ranking
    const selectFields = query
      ? `id, name, project_number, ts_rank(search_vector, plainto_tsquery('english', $2)) as rank`
      : `id, name, project_number, null as rank`;
    
    const orderBy = query ? 'ORDER BY rank DESC' : 'ORDER BY updated_at DESC';
    
    const limitParam = paramIndex++;
    const offsetParam = paramIndex;
    queryParams.push(limit, offset);
    
    const result = await pool.query(
      `SELECT ${selectFields}
       FROM development_projects 
       WHERE ${whereClause}
       ${orderBy}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      queryParams
    );
    
    return {
      projects: result.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Find projects near a location (using PostGIS)
   */
  async findNearbyProjects(
    organizationId: string,
    latitude: number,
    longitude: number,
    radiusMeters: number = 5000,
    limit: number = 10
  ): Promise<Array<{ id: string; name: string; distance_km: number }>> {
    const result = await pool.query(
      `SELECT id, name, 
              ST_Distance(
                location_geom::geography,
                ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
              ) / 1000 as distance_km
       FROM development_projects 
       WHERE organization_id = $1 
         AND deleted_at IS NULL
         AND location_geom IS NOT NULL
         AND ST_DWithin(
           location_geom::geography,
           ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
           $4
         )
       ORDER BY distance_km
       LIMIT $5`,
      [organizationId, latitude, longitude, radiusMeters, limit]
    );
    
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // PERMIT MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Get project permits
   */
  async getProjectPermits(projectId: string): Promise<Array<{
    id: string;
    permit_type_id: string;
    permit_type_name: string;
    permit_type_code: string;
    application_number?: string;
    status: string;
    submitted_date?: Date;
    approved_date?: Date;
    expiry_date?: Date;
    fees?: number;
    documents?: Array<{ name: string; url: string }>;
    notes?: string;
  }>> {
    const result = await pool.query(
      `SELECT pp.*, pt.name as permit_type_name, pt.code as permit_type_code
       FROM project_permits pp
       JOIN permit_types pt ON pp.permit_type_id = pt.id
       WHERE pp.project_id = $1
       ORDER BY pt.typical_order, pp.created_at`,
      [projectId]
    );
    
    return result.rows;
  }

  /**
   * Add permit to project
   */
  async addProjectPermit(input: {
    projectId: string;
    permitTypeId: string;
    applicationNumber?: string;
    status: string;
    submittedDate?: string;
    approvedDate?: string;
    expiryDate?: string;
    fees?: number;
    documents?: Array<{ name: string; url: string }>;
    createdBy: string;
  }): Promise<any> {
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO project_permits (
        id, project_id, permit_type_id, application_number, status,
        submitted_date, approved_date, expiry_date, fees, documents,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id,
        input.projectId,
        input.permitTypeId,
        input.applicationNumber,
        input.status,
        input.submittedDate,
        input.approvedDate,
        input.expiryDate,
        input.fees,
        JSON.stringify(input.documents || []),
        input.createdBy
      ]
    );
    
    return result.rows[0];
  }

  /**
   * Update permit status
   */
  async updatePermitStatus(
    permitId: string,
    updates: Partial<{
      status: string;
      applicationNumber: string;
      submittedDate: string;
      approvedDate: string;
      expiryDate: string;
      fees: number;
      documents: Array<{ name: string; url: string }>;
      notes: string;
    }>,
    updatedBy: string
  ): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.applicationNumber !== undefined) {
      fields.push(`application_number = $${paramIndex++}`);
      values.push(updates.applicationNumber);
    }
    if (updates.submittedDate !== undefined) {
      fields.push(`submitted_date = $${paramIndex++}`);
      values.push(updates.submittedDate);
    }
    if (updates.approvedDate !== undefined) {
      fields.push(`approved_date = $${paramIndex++}`);
      values.push(updates.approvedDate);
    }
    if (updates.expiryDate !== undefined) {
      fields.push(`expiry_date = $${paramIndex++}`);
      values.push(updates.expiryDate);
    }
    if (updates.fees !== undefined) {
      fields.push(`fees = $${paramIndex++}`);
      values.push(updates.fees);
    }
    if (updates.documents !== undefined) {
      fields.push(`documents = $${paramIndex++}`);
      values.push(JSON.stringify(updates.documents));
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }
    
    fields.push(`updated_by = $${paramIndex++}`);
    values.push(updatedBy);
    fields.push(`updated_at = NOW()`);
    
    values.push(permitId);
    
    const result = await pool.query(
      `UPDATE project_permits 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    return result.rows[0];
  }

  /**
   * Get required permits for project type
   */
  async getRequiredPermits(params: {
    projectType: string;
    region?: string;
    totalArea?: number;
  }): Promise<Array<{
    permit_type_id: string;
    name: string;
    code: string;
    issuing_authority: string;
    is_required: boolean;
    typical_duration_days: number;
    estimated_fee_range?: { min: number; max: number };
    notes?: string;
  }>> {
    const result = await pool.query(
      `SELECT id as permit_type_id, name, code, issuing_authority,
              true as is_required, typical_duration_days,
              CASE 
                WHEN min_fee IS NOT NULL AND max_fee IS NOT NULL 
                THEN jsonb_build_object('min', min_fee, 'max', max_fee)
                ELSE NULL
              END as estimated_fee_range,
              notes
       FROM permit_types
       WHERE is_active = true
       ORDER BY typical_order`,
      []
    );
    
    // Filter based on project type and area
    let permits = result.rows;
    
    // EPA permit typically required for larger projects
    if (params.totalArea && params.totalArea < 2000) {
      permits = permits.filter(p => p.code !== 'EPA');
    }
    
    return permits;
  }

  /**
   * Get traditional authorities with filters
   */
  async getTraditionalAuthorities(params: {
    region?: string;
    district?: string;
    search?: string;
  }): Promise<Array<{
    id: string;
    name: string;
    chief_title: string;
    region: string;
    district?: string;
    contact_phone?: string;
    contact_email?: string;
  }>> {
    let query = `
      SELECT id, name, chief_title, region, district, contact_phone, contact_email
      FROM traditional_authorities
      WHERE is_active = true
    `;
    const queryParams: any[] = [];
    let paramIndex = 1;
    
    if (params.region) {
      query += ` AND region = $${paramIndex++}`;
      queryParams.push(params.region);
    }
    
    if (params.district) {
      query += ` AND district = $${paramIndex++}`;
      queryParams.push(params.district);
    }
    
    if (params.search) {
      query += ` AND (name ILIKE $${paramIndex} OR chief_title ILIKE $${paramIndex})`;
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }
    
    query += ' ORDER BY name';
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  /**
   * Get regulatory assemblies with filters
   */
  async getRegulatoryAssemblies(params: {
    region?: string;
    district?: string;
  }): Promise<Array<{
    id: string;
    assembly_name: string;
    region: string;
    district: string;
    planning_department_phone?: string;
    planning_department_email?: string;
    physical_planning_officer?: string;
    building_inspector?: string;
    office_address?: string;
    website_url?: string;
  }>> {
    let query = `
      SELECT id, assembly_name, region, district, 
             planning_department_phone, planning_department_email,
             physical_planning_officer, building_inspector,
             office_address, website_url
      FROM assembly_regulatory_contacts
      WHERE is_active = true
    `;
    const queryParams: any[] = [];
    let paramIndex = 1;
    
    if (params.region) {
      query += ` AND region = $${paramIndex++}`;
      queryParams.push(params.region);
    }
    
    if (params.district) {
      query += ` AND district = $${paramIndex++}`;
      queryParams.push(params.district);
    }
    
    query += ' ORDER BY assembly_name';
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  /**
   * Generate a phase + milestone plan for an EXISTING project (one created
   * before auto-seeding, or that was left blank). No-op if the project already
   * has phases, unless `force` is set. Used by the Gantt "Generate Schedule"
   * action so old projects get a real, draggable schedule.
   */
  async generateScheduleForProject(
    projectId: string,
    organizationId: string,
    opts: { templateId?: string; createdBy?: string; force?: boolean } = {}
  ): Promise<{ seeded: boolean; phases: number; milestones: number; reason?: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const proj = await client.query(
        `SELECT id, organization_id, project_type, planned_start_date
           FROM development_projects WHERE id = $1`,
        [projectId]
      );
      if (proj.rows.length === 0) {
        await client.query('ROLLBACK');
        return { seeded: false, phases: 0, milestones: 0, reason: 'not_found' };
      }
      const row = proj.rows[0];
      if (organizationId && row.organization_id !== organizationId) {
        await client.query('ROLLBACK');
        return { seeded: false, phases: 0, milestones: 0, reason: 'not_found' };
      }

      const existing = await client.query(
        'SELECT COUNT(*)::int AS n FROM project_phases WHERE project_id = $1',
        [projectId]
      );
      if (existing.rows[0].n > 0 && !opts.force) {
        await client.query('ROLLBACK');
        return { seeded: false, phases: existing.rows[0].n, milestones: 0, reason: 'already_has_phases' };
      }

      const result = await this.seedPhasesAndMilestones(client, projectId, row.organization_id, {
        templateId: opts.templateId,
        projectType: row.project_type,
        startDate: row.planned_start_date ? new Date(row.planned_start_date) : undefined,
        createdBy: opts.createdBy,
      });

      await client.query('COMMIT');
      logger.info('Generated schedule for existing project', { projectId, ...result });
      return { seeded: true, ...result };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('generateScheduleForProject failed', { projectId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed a project's phases AND their statutory/construction milestones.
   * Resolves the phase set from an explicit template id when given, otherwise
   * from the default framework for the project type. Each phase's embedded
   * milestone labels become real project_milestones rows (typed + Ghana-tagged),
   * targeted at the phase's planned end date.
   */
  private async seedPhasesAndMilestones(
    client: any,
    projectId: string,
    organizationId: string,
    opts: { templateId?: string; projectType?: string; startDate?: Date; createdBy?: string }
  ): Promise<{ phases: number; milestones: number }> {
    // Resolve the phase set.
    let phases: PhaseTemplate[] = [];
    if (opts.templateId) {
      const tpl = await client.query('SELECT phases FROM project_phase_templates WHERE id = $1', [opts.templateId]);
      if (tpl.rows.length > 0 && Array.isArray(tpl.rows[0].phases)) {
        phases = tpl.rows[0].phases as PhaseTemplate[];
      }
    }
    if (phases.length === 0) {
      phases = getDefaultPhasesForType(opts.projectType);
    }
    if (phases.length === 0) {
      return { phases: 0, milestones: 0 };
    }

    let currentDate = opts.startDate ? new Date(opts.startDate) : new Date();
    let milestoneCount = 0;

    for (const phase of phases) {
      const plannedEndDate = new Date(currentDate);
      plannedEndDate.setDate(plannedEndDate.getDate() + (phase.duration_days || 30));
      const phaseId = uuidv4();
      const milestoneLabels: string[] = Array.isArray(phase.milestones) ? phase.milestones : [];

      await client.query(
        `INSERT INTO project_phases (
          id, project_id, organization_id,
          phase_number, name, description, weight, duration_days,
          planned_start_date, planned_end_date,
          color, milestones, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          phaseId, projectId, organizationId,
          phase.phase_number, phase.name, phase.description || null, phase.weight, phase.duration_days,
          currentDate, plannedEndDate,
          phase.color || '#3B82F6', JSON.stringify(milestoneLabels), opts.createdBy
        ]
      );

      // Each milestone label → a real, dated, typed milestone on this phase.
      for (let i = 0; i < milestoneLabels.length; i++) {
        const label = milestoneLabels[i];
        const { milestone_type, is_ghana_specific } = classifyMilestone(label);
        await client.query(
          `INSERT INTO project_milestones (
            project_id, phase_id, organization_id,
            name, target_date, status, milestone_type,
            is_ghana_specific, is_from_template, milestone_code, created_by
          ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, true, $8, $9)`,
          [
            projectId, phaseId, organizationId,
            label, plannedEndDate, milestone_type,
            is_ghana_specific, `M${phase.phase_number}-${i + 1}`, opts.createdBy
          ]
        );
        milestoneCount++;
      }

      currentDate = new Date(plannedEndDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { phases: phases.length, milestones: milestoneCount };
  }

  private inferCityFromDistrict(district?: string, region?: string): string | undefined {
    if (!district) return undefined;
    
    const districtLower = district.toLowerCase();
    
    // Greater Accra
    if (districtLower.includes('accra') || 
        districtLower.includes('ga ') ||
        districtLower.includes('ayawaso') ||
        districtLower.includes('ledzokuku') ||
        districtLower.includes('adenta') ||
        districtLower.includes('madina') ||
        districtLower.includes('krowor') ||
        districtLower.includes('ablekuma')) {
      return 'Accra';
    }
    
    if (districtLower.includes('tema')) {
      return 'Tema';
    }
    
    // Ashanti
    if (districtLower.includes('kumasi')) {
      return 'Kumasi';
    }
    
    if (districtLower.includes('obuasi')) {
      return 'Obuasi';
    }
    
    // Central
    if (districtLower.includes('cape coast')) {
      return 'Cape Coast';
    }
    
    // Western
    if (districtLower.includes('sekondi') || districtLower.includes('takoradi')) {
      return 'Sekondi-Takoradi';
    }
    
    // Eastern
    if (districtLower.includes('koforidua') || districtLower.includes('new juaben')) {
      return 'Koforidua';
    }
    
    // Northern
    if (districtLower.includes('tamale')) {
      return 'Tamale';
    }
    
    return undefined;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private mapRowExtended(row: any): DevelopmentProject {
    return {
      id: row.id,
      organization_id: row.organization_id,
      project_number: row.project_number,
      name: row.name,
      description: row.description,
      project_type: row.project_type,
      status: row.status,
      
      address_line1: row.address_line1,
      address_line2: row.address_line2,
      city: row.city,
      region: row.region,
      country: row.country,
      ghana_post_gps: row.ghana_post_gps,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      
      // Ghana-specific location fields
      ghana_region: row.ghana_region,
      ghana_district: row.ghana_district,
      ghana_area: row.ghana_area,
      traditional_authority_id: row.traditional_authority_id,
      assembly_id: row.assembly_id,
      land_tenure_type: row.land_tenure_type,
      land_parcel_id: row.land_parcel_id,
      
      land_size_sqm: row.land_size_sqm ? parseFloat(row.land_size_sqm) : undefined,
      land_size_acres: row.land_size_acres ? parseFloat(row.land_size_acres) : undefined,
      land_title_number: row.land_title_number,
      land_acquisition_date: row.land_acquisition_date,
      land_cost: row.land_cost ? parseFloat(row.land_cost) : undefined,
      
      total_units: row.total_units || 0,
      total_floors: row.total_floors,
      total_buildings: row.total_buildings || 1,
      total_sqm: row.total_sqm ? parseFloat(row.total_sqm) : undefined,
      
      total_budget: parseFloat(row.total_budget) || 0,
      total_spent: parseFloat(row.total_spent) || 0,
      total_committed: parseFloat(row.total_committed) || 0,
      projected_revenue: parseFloat(row.projected_revenue) || 0,
      actual_revenue: parseFloat(row.actual_revenue) || 0,
      
      planned_start_date: row.planned_start_date,
      actual_start_date: row.actual_start_date,
      planned_completion_date: row.planned_completion_date,
      estimated_completion_date: row.estimated_completion_date,
      actual_completion_date: row.actual_completion_date,
      
      overall_progress: parseFloat(row.overall_progress) || 0,
      construction_progress: parseFloat(row.construction_progress) || 0,
      sales_progress: parseFloat(row.sales_progress) || 0,
      
      building_permit_number: row.building_permit_number,
      building_permit_date: row.building_permit_date,
      environmental_permit_number: row.environmental_permit_number,
      fire_safety_certificate_number: row.fire_safety_certificate_number,
      
      developer_name: row.developer_name,
      developer_contact: row.developer_contact,
      developer_email: row.developer_email,
      
      project_manager_id: row.project_manager_id,
      
      marketing_name: row.marketing_name,
      tagline: row.tagline,
      website_url: row.website_url,
      brochure_url: row.brochure_url,
      
      cover_image_url: row.cover_image_url,
      hero_image_url: row.hero_image_url,
      floor_plan_url: row.floor_plan_url,
      site_plan_url: row.site_plan_url,
      render_url: row.render_url,
      logo_url: row.logo_url,
      gallery_urls: row.gallery_urls || [],
      
      amenities: row.amenities || [],
      
      // Financial structure
      funding_sources: row.funding_sources || [],
      display_currency: row.display_currency || 'GHS',
      base_exchange_rate: row.base_exchange_rate,
      unit_mix: row.unit_mix || [],
      
      settings: row.settings || {},
      metadata: row.metadata || {},
      
      linked_property_id: row.linked_property_id,
      auto_create_deals: row.auto_create_deals,
      default_pipeline_id: row.default_pipeline_id,
      
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    } as DevelopmentProject;
  }
}

export const projectLocationService = new ProjectLocationService();
export default projectLocationService;
