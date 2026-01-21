/**
 * Multi-Source Tracking Service
 * 
 * Tracks and manages data from multiple sources for each property.
 * Populates the property_data_sources table with field-level attribution,
 * enabling audit trails and conflict resolution.
 * 
 * Key Features:
 * 1. Record which fields came from which source
 * 2. Store raw data from each source for audit
 * 3. Calculate and track reliability scores per source per property
 * 4. Detect and flag discrepancies between sources
 * 5. Support for incremental updates and historical tracking
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../../utils/logger';
import crypto from 'crypto';

// Source type tiers for trust scoring
const SOURCE_TYPE_TRUST: Record<string, number> = {
  'tier1_government': 0.95,
  'tier2_financial': 0.85,
  'tier3_partner': 0.75,
  'tier3c_construction': 0.70,
  'tier4_user': 0.60,
  'tier5_web': 0.55,
  'manual_entry': 0.50,
  'api_import': 0.65,
};

// Fields that should be tracked for multi-source comparison
const TRACKABLE_FIELDS = [
  'title',
  'description',
  'address',
  'city',
  'region',
  'latitude',
  'longitude',
  'price',
  'currency',
  'bedrooms',
  'bathrooms',
  'building_size_sqm',
  'land_size_sqm',
  'total_area_sqm',
  'property_type',
  'listing_type',
  'amenities',
  'images',
  'agent_name',
  'agent_phone',
  'year_built',
  'floor_count',
  'parking_spaces',
];

// Interface for source contribution record
export interface SourceContribution {
  source_id: string;
  source_type: string;
  data_fields: Record<string, any>;
  raw_data: Record<string, any>;
  reliability_score: number;
  is_primary_source: boolean;
  first_seen_at: Date;
  last_updated: Date;
  update_count: number;
}

// Interface for tracking result
export interface TrackingResult {
  property_id: string;
  source_id: string;
  is_new_source: boolean;
  fields_added: string[];
  fields_updated: string[];
  reliability_score: number;
  total_sources: number;
}

// Interface for property source summary
export interface PropertySourceSummary {
  property_id: string;
  total_sources: number;
  primary_source: string | null;
  sources: {
    source_id: string;
    source_type: string;
    field_count: number;
    reliability_score: number;
    is_primary: boolean;
    last_updated: Date;
  }[];
  field_coverage: Record<string, string[]>; // field -> sources that provide it
  discrepancies: {
    field: string;
    values: { source: string; value: any }[];
  }[];
}

// Interface for batch tracking options
export interface BatchTrackingOptions {
  source_id: string;
  source_type: string;
  source_url?: string;
  override_existing?: boolean;
}

export class MultiSourceTrackingService {
  private pool: Pool;
  private dataSourceCache: Map<string, { id: string; trust_score: number }> = new Map();

  constructor(pool?: Pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  /**
   * Track a data contribution from a source for a property
   */
  async trackSourceContribution(
    propertyId: string,
    sourceSlug: string,
    sourceType: string,
    data: Record<string, any>,
    options: {
      sourceUrl?: string;
      isPrimary?: boolean;
      rawData?: Record<string, any>;
    } = {}
  ): Promise<TrackingResult> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get or resolve data source ID
      const dataSource = await this.resolveDataSource(client, sourceSlug, sourceType);
      
      // Extract trackable fields from data
      const dataFields = this.extractTrackableFields(data);
      
      // Calculate reliability score
      const reliabilityScore = this.calculateReliabilityScore(dataFields, sourceType);
      
      // Check if this source already exists for this property
      const existing = await client.query(`
        SELECT id, data_fields, update_count 
        FROM property_data_sources 
        WHERE property_id = $1 AND data_source_id = $2
      `, [propertyId, dataSource.id]);
      
      let result: TrackingResult;
      
      if (existing.rows.length > 0) {
        // Update existing source contribution
        result = await this.updateSourceContribution(
          client,
          propertyId,
          dataSource.id,
          existing.rows[0],
          dataFields,
          options.rawData || data,
          reliabilityScore
        );
      } else {
        // Insert new source contribution
        result = await this.insertSourceContribution(
          client,
          propertyId,
          dataSource.id,
          sourceType,
          dataFields,
          options.rawData || data,
          reliabilityScore,
          options.isPrimary || false
        );
      }
      
      // Update primary source designation if needed
      if (options.isPrimary) {
        await this.setPrimarySource(client, propertyId, dataSource.id);
      }
      
      // Get total source count
      const countResult = await client.query(
        'SELECT COUNT(*) FROM property_data_sources WHERE property_id = $1',
        [propertyId]
      );
      result.total_sources = parseInt(countResult.rows[0].count);
      
      await client.query('COMMIT');
      
      return result;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resolve data source ID from slug or create if needed
   */
  private async resolveDataSource(
    client: PoolClient,
    sourceSlug: string,
    sourceType: string
  ): Promise<{ id: string; trust_score: number }> {
    // Check cache first
    if (this.dataSourceCache.has(sourceSlug)) {
      return this.dataSourceCache.get(sourceSlug)!;
    }
    
    // Query database
    let result = await client.query(
      'SELECT id, trust_score FROM data_sources WHERE slug = $1',
      [sourceSlug]
    );
    
    if (result.rows.length === 0) {
      // Create new data source entry
      const trustScore = SOURCE_TYPE_TRUST[sourceType] || 0.5;
      result = await client.query(`
        INSERT INTO data_sources (
          name, slug, source_type, trust_score, is_active, created_at
        ) VALUES ($1, $2, $3, $4, true, NOW())
        ON CONFLICT (slug) DO UPDATE SET source_type = EXCLUDED.source_type
        RETURNING id, trust_score
      `, [
        this.formatSourceName(sourceSlug),
        sourceSlug,
        sourceType,
        trustScore,
      ]);
    }
    
    const dataSource = {
      id: result.rows[0].id,
      trust_score: parseFloat(result.rows[0].trust_score) || 0.5,
    };
    
    // Cache result
    this.dataSourceCache.set(sourceSlug, dataSource);
    
    return dataSource;
  }

  /**
   * Format source slug into readable name
   */
  private formatSourceName(slug: string): string {
    return slug
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Extract trackable fields from raw data
   */
  private extractTrackableFields(data: Record<string, any>): Record<string, any> {
    const fields: Record<string, any> = {};
    
    // Direct field mapping
    const fieldMappings: Record<string, string[]> = {
      title: ['title', 'name', 'listing_title'],
      description: ['description', 'details', 'summary'],
      address: ['address', 'address_raw', 'address_street', 'location_text'],
      city: ['city', 'location_city', 'area'],
      region: ['region', 'state', 'location_region'],
      latitude: ['latitude', 'lat', 'geo_lat'],
      longitude: ['longitude', 'lng', 'lon', 'geo_lng'],
      price: ['price', 'price_usd', 'price_value', 'asking_price'],
      currency: ['currency', 'price_currency'],
      bedrooms: ['bedrooms', 'beds', 'bedroom_count', 'num_bedrooms'],
      bathrooms: ['bathrooms', 'baths', 'bathroom_count', 'num_bathrooms'],
      building_size_sqm: ['building_size_sqm', 'built_area', 'floor_area', 'total_area_sqm'],
      land_size_sqm: ['land_size_sqm', 'plot_size', 'land_area'],
      property_type: ['property_type', 'type', 'category'],
      listing_type: ['listing_type', 'transaction_type', 'for_sale', 'for_rent'],
      amenities: ['amenities', 'features', 'facilities'],
      images: ['images', 'photos', 'image_urls', 'gallery'],
      agent_name: ['agent_name', 'agent', 'broker_name', 'seller_name'],
      agent_phone: ['agent_phone', 'phone', 'contact_phone'],
      year_built: ['year_built', 'construction_year', 'built_year'],
      floor_count: ['floor_count', 'floors', 'stories', 'levels'],
      parking_spaces: ['parking_spaces', 'parking', 'garage_spaces'],
    };
    
    for (const [targetField, sourceFields] of Object.entries(fieldMappings)) {
      for (const sourceField of sourceFields) {
        if (data[sourceField] !== undefined && data[sourceField] !== null && data[sourceField] !== '') {
          fields[targetField] = data[sourceField];
          break;
        }
      }
    }
    
    return fields;
  }

  /**
   * Calculate reliability score based on data completeness and source type
   */
  private calculateReliabilityScore(
    fields: Record<string, any>,
    sourceType: string
  ): number {
    // Base score from source type
    const baseScore = SOURCE_TYPE_TRUST[sourceType] || 0.5;
    
    // Completeness bonus
    const totalPossibleFields = TRACKABLE_FIELDS.length;
    const providedFields = Object.keys(fields).filter(
      k => fields[k] !== null && fields[k] !== undefined && fields[k] !== ''
    ).length;
    const completeness = providedFields / totalPossibleFields;
    
    // Weight important fields more
    const importantFields = ['address', 'price', 'bedrooms', 'latitude', 'longitude'];
    const importantProvided = importantFields.filter(f => fields[f]).length;
    const importantBonus = (importantProvided / importantFields.length) * 0.1;
    
    // Final score = base * 0.7 + completeness * 0.2 + important * 0.1
    return Math.min(1, baseScore * 0.7 + completeness * 0.2 + importantBonus);
  }

  /**
   * Insert new source contribution
   */
  private async insertSourceContribution(
    client: PoolClient,
    propertyId: string,
    dataSourceId: string,
    sourceType: string,
    dataFields: Record<string, any>,
    rawData: Record<string, any>,
    reliabilityScore: number,
    isPrimary: boolean
  ): Promise<TrackingResult> {
    await client.query(`
      INSERT INTO property_data_sources (
        property_id,
        data_source_id,
        source_type,
        data_fields,
        raw_data,
        reliability_score,
        is_primary_source,
        first_seen_at,
        last_updated,
        update_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), 1)
    `, [
      propertyId,
      dataSourceId,
      sourceType,
      JSON.stringify(dataFields),
      JSON.stringify(rawData),
      reliabilityScore,
      isPrimary,
    ]);
    
    return {
      property_id: propertyId,
      source_id: dataSourceId,
      is_new_source: true,
      fields_added: Object.keys(dataFields),
      fields_updated: [],
      reliability_score: reliabilityScore,
      total_sources: 0, // Will be updated by caller
    };
  }

  /**
   * Update existing source contribution
   */
  private async updateSourceContribution(
    client: PoolClient,
    propertyId: string,
    dataSourceId: string,
    existing: { data_fields: Record<string, any>; update_count: number },
    newFields: Record<string, any>,
    rawData: Record<string, any>,
    reliabilityScore: number
  ): Promise<TrackingResult> {
    const oldFields = existing.data_fields || {};
    
    // Determine which fields are new vs updated
    const fieldsAdded: string[] = [];
    const fieldsUpdated: string[] = [];
    
    for (const [field, value] of Object.entries(newFields)) {
      if (!(field in oldFields)) {
        fieldsAdded.push(field);
      } else if (JSON.stringify(oldFields[field]) !== JSON.stringify(value)) {
        fieldsUpdated.push(field);
      }
    }
    
    // Merge fields (new values take precedence)
    const mergedFields = { ...oldFields, ...newFields };
    
    await client.query(`
      UPDATE property_data_sources SET
        data_fields = $1,
        raw_data = $2,
        reliability_score = $3,
        last_updated = NOW(),
        update_count = update_count + 1
      WHERE property_id = $4 AND data_source_id = $5
    `, [
      JSON.stringify(mergedFields),
      JSON.stringify(rawData),
      reliabilityScore,
      propertyId,
      dataSourceId,
    ]);
    
    return {
      property_id: propertyId,
      source_id: dataSourceId,
      is_new_source: false,
      fields_added: fieldsAdded,
      fields_updated: fieldsUpdated,
      reliability_score: reliabilityScore,
      total_sources: 0, // Will be updated by caller
    };
  }

  /**
   * Set a source as the primary source for a property
   */
  private async setPrimarySource(
    client: PoolClient,
    propertyId: string,
    dataSourceId: string
  ): Promise<void> {
    // Unset all other sources as primary
    await client.query(`
      UPDATE property_data_sources 
      SET is_primary_source = FALSE 
      WHERE property_id = $1
    `, [propertyId]);
    
    // Set specified source as primary
    await client.query(`
      UPDATE property_data_sources 
      SET is_primary_source = TRUE 
      WHERE property_id = $1 AND data_source_id = $2
    `, [propertyId, dataSourceId]);
  }

  /**
   * Get summary of all sources for a property
   */
  async getPropertySourceSummary(propertyId: string): Promise<PropertySourceSummary> {
    const client = await this.pool.connect();
    
    try {
      const sources = await client.query(`
        SELECT 
          pds.data_source_id as source_id,
          ds.slug as source_slug,
          pds.source_type,
          pds.data_fields,
          pds.reliability_score,
          pds.is_primary_source,
          pds.last_updated,
          pds.update_count
        FROM property_data_sources pds
        LEFT JOIN data_sources ds ON ds.id = pds.data_source_id
        WHERE pds.property_id = $1
        ORDER BY pds.reliability_score DESC
      `, [propertyId]);
      
      if (sources.rows.length === 0) {
        return {
          property_id: propertyId,
          total_sources: 0,
          primary_source: null,
          sources: [],
          field_coverage: {},
          discrepancies: [],
        };
      }
      
      // Build field coverage map
      const fieldCoverage: Record<string, string[]> = {};
      const fieldValues: Record<string, { source: string; value: any }[]> = {};
      
      for (const row of sources.rows) {
        const fields = row.data_fields || {};
        const sourceId = row.source_slug || row.source_id;
        
        for (const [field, value] of Object.entries(fields)) {
          if (value === null || value === undefined || value === '') continue;
          
          if (!fieldCoverage[field]) {
            fieldCoverage[field] = [];
            fieldValues[field] = [];
          }
          
          fieldCoverage[field].push(sourceId);
          fieldValues[field].push({ source: sourceId, value });
        }
      }
      
      // Detect discrepancies
      const discrepancies: { field: string; values: { source: string; value: any }[] }[] = [];
      
      for (const [field, values] of Object.entries(fieldValues)) {
        if (values.length < 2) continue;
        
        const uniqueValues = new Set(values.map(v => this.normalizeValue(v.value)));
        if (uniqueValues.size > 1) {
          discrepancies.push({ field, values });
        }
      }
      
      return {
        property_id: propertyId,
        total_sources: sources.rows.length,
        primary_source: sources.rows.find(r => r.is_primary_source)?.source_slug || null,
        sources: sources.rows.map(r => ({
          source_id: r.source_slug || r.source_id,
          source_type: r.source_type,
          field_count: Object.keys(r.data_fields || {}).length,
          reliability_score: parseFloat(r.reliability_score) || 0,
          is_primary: r.is_primary_source,
          last_updated: new Date(r.last_updated),
        })),
        field_coverage: fieldCoverage,
        discrepancies,
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Normalize value for comparison
   */
  private normalizeValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value.toLowerCase().trim();
    if (typeof value === 'number') return value.toString();
    return JSON.stringify(value);
  }

  /**
   * Track batch of properties from same source
   */
  async trackBatchContributions(
    contributions: { propertyId: string; data: Record<string, any> }[],
    options: BatchTrackingOptions
  ): Promise<{
    successful: number;
    failed: number;
    results: TrackingResult[];
    errors: { propertyId: string; error: string }[];
  }> {
    const results: TrackingResult[] = [];
    const errors: { propertyId: string; error: string }[] = [];
    
    for (const contribution of contributions) {
      try {
        const result = await this.trackSourceContribution(
          contribution.propertyId,
          options.source_id,
          options.source_type,
          contribution.data,
          { sourceUrl: options.source_url }
        );
        results.push(result);
      } catch (error) {
        errors.push({
          propertyId: contribution.propertyId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return {
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Merge source data when properties are merged
   */
  async mergePropertySources(
    sourcePropertyId: string,
    targetPropertyId: string
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get source property's data sources
      const sources = await client.query(`
        SELECT * FROM property_data_sources WHERE property_id = $1
      `, [sourcePropertyId]);
      
      for (const row of sources.rows) {
        // Check if target already has this data source
        const existing = await client.query(`
          SELECT id, data_fields FROM property_data_sources 
          WHERE property_id = $1 AND data_source_id = $2
        `, [targetPropertyId, row.data_source_id]);
        
        if (existing.rows.length > 0) {
          // Merge data fields
          const mergedFields = {
            ...(existing.rows[0].data_fields || {}),
            ...(row.data_fields || {}),
          };
          
          await client.query(`
            UPDATE property_data_sources SET
              data_fields = $1,
              update_count = update_count + 1,
              last_updated = NOW()
            WHERE property_id = $2 AND data_source_id = $3
          `, [JSON.stringify(mergedFields), targetPropertyId, row.data_source_id]);
        } else {
          // Move source record to target
          await client.query(`
            UPDATE property_data_sources SET
              property_id = $1,
              is_primary_source = FALSE
            WHERE property_id = $2 AND data_source_id = $3
          `, [targetPropertyId, sourcePropertyId, row.data_source_id]);
        }
      }
      
      await client.query('COMMIT');
      
      logger.info(`Merged sources from property ${sourcePropertyId} to ${targetPropertyId}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get field provenance - which source provided which field value
   */
  async getFieldProvenance(
    propertyId: string,
    fieldName: string
  ): Promise<{
    field: string;
    sources: {
      source_id: string;
      source_type: string;
      value: any;
      reliability_score: number;
      last_updated: Date;
    }[];
  }> {
    const result = await this.pool.query(`
      SELECT 
        ds.slug as source_id,
        pds.source_type,
        pds.data_fields->$2 as value,
        pds.reliability_score,
        pds.last_updated
      FROM property_data_sources pds
      LEFT JOIN data_sources ds ON ds.id = pds.data_source_id
      WHERE pds.property_id = $1 
        AND pds.data_fields ? $2
      ORDER BY pds.reliability_score DESC
    `, [propertyId, fieldName]);
    
    return {
      field: fieldName,
      sources: result.rows.map(r => ({
        source_id: r.source_id,
        source_type: r.source_type,
        value: r.value,
        reliability_score: parseFloat(r.reliability_score) || 0,
        last_updated: new Date(r.last_updated),
      })),
    };
  }

  /**
   * Generate data lineage hash for a property
   * Used for detecting when source data changes
   */
  generateSourceDataHash(data: Record<string, any>): string {
    const sortedKeys = Object.keys(data).sort();
    const normalized: Record<string, any> = {};
    
    for (const key of sortedKeys) {
      if (TRACKABLE_FIELDS.includes(key)) {
        normalized[key] = this.normalizeValue(data[key]);
      }
    }
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  /**
   * Find properties that have stale source data (not updated recently)
   */
  async findPropertiesWithStaleData(
    staleDays: number = 30
  ): Promise<{ property_id: string; source_id: string; last_updated: Date }[]> {
    const result = await this.pool.query(`
      SELECT 
        pds.property_id,
        ds.slug as source_id,
        pds.last_updated
      FROM property_data_sources pds
      LEFT JOIN data_sources ds ON ds.id = pds.data_source_id
      WHERE pds.last_updated < NOW() - INTERVAL '${staleDays} days'
      ORDER BY pds.last_updated ASC
      LIMIT 1000
    `);
    
    return result.rows.map(r => ({
      property_id: r.property_id,
      source_id: r.source_id,
      last_updated: new Date(r.last_updated),
    }));
  }

  /**
   * Get statistics about source contributions
   */
  async getSourceStatistics(): Promise<{
    total_tracked_properties: number;
    sources: {
      source_id: string;
      source_type: string;
      property_count: number;
      avg_reliability: number;
      avg_field_count: number;
    }[];
    coverage_by_field: Record<string, number>;
  }> {
    const client = await this.pool.connect();
    
    try {
      // Total tracked properties
      const totalResult = await client.query(`
        SELECT COUNT(DISTINCT property_id) as count FROM property_data_sources
      `);
      
      // Per-source statistics
      const sourceStats = await client.query(`
        SELECT 
          ds.slug as source_id,
          pds.source_type,
          COUNT(DISTINCT pds.property_id) as property_count,
          AVG(pds.reliability_score) as avg_reliability,
          AVG(jsonb_object_keys_count(pds.data_fields)) as avg_field_count
        FROM property_data_sources pds
        LEFT JOIN data_sources ds ON ds.id = pds.data_source_id
        GROUP BY ds.slug, pds.source_type
        ORDER BY property_count DESC
      `);
      
      // Field coverage
      const fieldCoverage: Record<string, number> = {};
      for (const field of TRACKABLE_FIELDS) {
        const result = await client.query(`
          SELECT COUNT(DISTINCT property_id) as count
          FROM property_data_sources
          WHERE data_fields ? $1
        `, [field]);
        fieldCoverage[field] = parseInt(result.rows[0].count) || 0;
      }
      
      return {
        total_tracked_properties: parseInt(totalResult.rows[0].count) || 0,
        sources: sourceStats.rows.map(r => ({
          source_id: r.source_id,
          source_type: r.source_type,
          property_count: parseInt(r.property_count) || 0,
          avg_reliability: parseFloat(r.avg_reliability) || 0,
          avg_field_count: parseFloat(r.avg_field_count) || 0,
        })),
        coverage_by_field: fieldCoverage,
      };
      
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const multiSourceTrackingService = new MultiSourceTrackingService();
