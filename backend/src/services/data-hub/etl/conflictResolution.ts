/**
 * Conflict Resolution Service
 * 
 * Implements intelligent field-level conflict resolution when multiple data sources
 * provide different values for the same property. Uses trust scores, data quality
 * metrics, and recency to determine the most accurate value.
 * 
 * Resolution Strategies:
 * 1. Trust-based: Higher trust score source wins
 * 2. Quality-based: Higher data quality score wins
 * 3. Recency-based: Most recent update wins
 * 4. Consensus-based: Most common value across sources wins
 * 5. Field-specific: Special rules for certain fields (e.g., price = max of verified sources)
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../../utils/logger';

// Field importance weights for calculating overall resolution confidence
const FIELD_WEIGHTS: Record<string, number> = {
  // Location fields (most important for property identity)
  address: 0.20,
  latitude: 0.15,
  longitude: 0.15,
  city: 0.10,
  region: 0.10,
  
  // Property characteristics
  property_type: 0.08,
  bedrooms: 0.05,
  bathrooms: 0.05,
  building_size_sqm: 0.05,
  land_size_sqm: 0.05,
  
  // Financial
  price: 0.15,
  
  // Meta
  title: 0.02,
  description: 0.02,
};

// Field-specific resolution strategies
type ResolutionStrategy = 
  | 'trust_score'        // Pick value from source with highest trust
  | 'quality_score'      // Pick value from source with highest data quality
  | 'most_recent'        // Pick most recently updated value
  | 'consensus'          // Pick most common value
  | 'numeric_max'        // Pick highest numeric value (for area, etc.)
  | 'numeric_min'        // Pick lowest numeric value
  | 'verified_max'       // For price: highest value from verified sources
  | 'prefer_non_null'    // Pick any non-null value, prefer higher trust
  | 'merge_arrays'       // For arrays: combine unique values
  | 'longest_text';      // For text: pick longest/most detailed

const FIELD_STRATEGIES: Record<string, ResolutionStrategy> = {
  // Identity fields - trust score wins
  address: 'trust_score',
  city: 'trust_score',
  region: 'trust_score',
  
  // Location - trust score (government sources most accurate)
  latitude: 'trust_score',
  longitude: 'trust_score',
  
  // Characteristics - consensus (multiple sources agree = likely correct)
  property_type: 'consensus',
  bedrooms: 'consensus',
  bathrooms: 'consensus',
  
  // Size - take maximum (undercounting more common than overcounting)
  building_size_sqm: 'numeric_max',
  land_size_sqm: 'numeric_max',
  total_area_sqm: 'numeric_max',
  
  // Price - use verified max (banks/government sources)
  price: 'verified_max',
  
  // Text - longest is usually most detailed
  title: 'longest_text',
  description: 'longest_text',
  
  // Arrays - merge all values
  amenities: 'merge_arrays',
  images: 'merge_arrays',
  
  // Timestamps - most recent
  updated_at: 'most_recent',
  
  // Default for other fields
  default: 'trust_score',
};

// Interface for a field value with source metadata
export interface SourcedValue {
  value: any;
  source_id: string;
  source_type: string;
  trust_score: number;
  quality_score: number;
  updated_at: Date;
  raw_field_name?: string;
}

// Interface for conflict detection result
export interface FieldConflict {
  field_name: string;
  values: SourcedValue[];
  has_conflict: boolean;
  conflict_severity: 'low' | 'medium' | 'high';
}

// Interface for resolution result
export interface FieldResolution {
  field_name: string;
  resolved_value: any;
  resolution_strategy: ResolutionStrategy;
  winning_source: string;
  confidence: number;
  all_sources: string[];
  conflict_existed: boolean;
}

// Interface for full property resolution result
export interface PropertyResolution {
  property_id: string;
  resolved_fields: Record<string, FieldResolution>;
  overall_confidence: number;
  conflicts_resolved: number;
  sources_consulted: string[];
  resolution_timestamp: Date;
}

// Interface for source data with all fields
export interface PropertySourceData {
  source_id: string;
  source_type: string;
  trust_score: number;
  data_quality_score: number;
  updated_at: Date;
  data: Record<string, any>;
}

export class ConflictResolutionService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  /**
   * Resolve conflicts for a property across all its data sources
   */
  async resolvePropertyConflicts(
    propertyId: string,
    options: {
      forceRecalculation?: boolean;
      dryRun?: boolean;
    } = {}
  ): Promise<PropertyResolution> {
    const client = await this.pool.connect();
    
    try {
      // Get all data sources for this property
      const sources = await this.getPropertySources(client, propertyId);
      
      if (sources.length === 0) {
        logger.warn(`No sources found for property ${propertyId}`);
        return {
          property_id: propertyId,
          resolved_fields: {},
          overall_confidence: 0,
          conflicts_resolved: 0,
          sources_consulted: [],
          resolution_timestamp: new Date(),
        };
      }
      
      // Detect conflicts across all fields
      const conflicts = this.detectConflicts(sources);
      
      // Resolve each field
      const resolved_fields: Record<string, FieldResolution> = {};
      let conflicts_resolved = 0;
      
      for (const [field_name, conflict] of Object.entries(conflicts)) {
        const resolution = this.resolveField(field_name, conflict);
        resolved_fields[field_name] = resolution;
        
        if (conflict.has_conflict) {
          conflicts_resolved++;
        }
      }
      
      // Calculate overall confidence
      const overall_confidence = this.calculateOverallConfidence(resolved_fields);
      
      const result: PropertyResolution = {
        property_id: propertyId,
        resolved_fields,
        overall_confidence,
        conflicts_resolved,
        sources_consulted: sources.map(s => s.source_id),
        resolution_timestamp: new Date(),
      };
      
      // Apply resolution if not dry run
      if (!options.dryRun) {
        await this.applyResolution(client, propertyId, result);
      }
      
      return result;
      
    } finally {
      client.release();
    }
  }

  /**
   * Get all data sources for a property from property_data_sources table
   */
  private async getPropertySources(
    client: PoolClient,
    propertyId: string
  ): Promise<PropertySourceData[]> {
    const result = await client.query(`
      SELECT 
        pds.data_source_id as source_id,
        pds.source_type,
        COALESCE(ds.trust_score, 0.5) as trust_score,
        pds.reliability_score as data_quality_score,
        pds.last_updated as updated_at,
        pds.data_fields as data,
        pds.raw_data
      FROM property_data_sources pds
      LEFT JOIN data_sources ds ON ds.id = pds.data_source_id
      WHERE pds.property_id = $1
      ORDER BY COALESCE(ds.trust_score, 0.5) DESC
    `, [propertyId]);
    
    return result.rows.map(row => ({
      source_id: row.source_id,
      source_type: row.source_type,
      trust_score: parseFloat(row.trust_score) || 0.5,
      data_quality_score: parseFloat(row.data_quality_score) || 0.5,
      updated_at: new Date(row.updated_at),
      data: row.data || row.raw_data || {},
    }));
  }

  /**
   * Detect conflicts across all fields from multiple sources
   */
  private detectConflicts(sources: PropertySourceData[]): Record<string, FieldConflict> {
    const conflicts: Record<string, FieldConflict> = {};
    
    // Collect all field names across all sources
    const allFields = new Set<string>();
    for (const source of sources) {
      Object.keys(source.data).forEach(f => allFields.add(f));
    }
    
    // For each field, check for conflicts
    for (const field of allFields) {
      const values: SourcedValue[] = [];
      
      for (const source of sources) {
        const value = source.data[field];
        
        // Only include non-null values
        if (value !== null && value !== undefined && value !== '') {
          values.push({
            value,
            source_id: source.source_id,
            source_type: source.source_type,
            trust_score: source.trust_score,
            quality_score: source.data_quality_score,
            updated_at: source.updated_at,
          });
        }
      }
      
      // Determine if there's a conflict
      const uniqueValues = this.getUniqueValues(values);
      const has_conflict = uniqueValues.length > 1;
      
      conflicts[field] = {
        field_name: field,
        values,
        has_conflict,
        conflict_severity: this.calculateConflictSeverity(field, values),
      };
    }
    
    return conflicts;
  }

  /**
   * Get unique values from sourced values
   */
  private getUniqueValues(values: SourcedValue[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];
    
    for (const v of values) {
      const key = this.normalizeForComparison(v.value);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(v.value);
      }
    }
    
    return unique;
  }

  /**
   * Normalize a value for comparison
   */
  private normalizeForComparison(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value.toLowerCase().trim();
    if (typeof value === 'number') return value.toString();
    if (Array.isArray(value)) return JSON.stringify(value.sort());
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Calculate conflict severity based on field importance and value divergence
   */
  private calculateConflictSeverity(
    field: string,
    values: SourcedValue[]
  ): 'low' | 'medium' | 'high' {
    if (values.length <= 1) return 'low';
    
    const weight = FIELD_WEIGHTS[field] || 0.01;
    
    // For numeric fields, calculate variance
    if (this.isNumericField(field)) {
      const numericValues = values
        .map(v => parseFloat(v.value))
        .filter(n => !isNaN(n));
      
      if (numericValues.length > 1) {
        const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        const variance = numericValues.reduce((sum, n) => sum + Math.pow(n - avg, 2), 0) / numericValues.length;
        const cv = Math.sqrt(variance) / avg; // Coefficient of variation
        
        if (cv > 0.3) return 'high';
        if (cv > 0.1) return 'medium';
        return 'low';
      }
    }
    
    // For non-numeric, high weight fields with different values = high severity
    if (weight > 0.1) return 'high';
    if (weight > 0.05) return 'medium';
    return 'low';
  }

  /**
   * Check if a field contains numeric values
   */
  private isNumericField(field: string): boolean {
    return [
      'price', 'bedrooms', 'bathrooms', 
      'building_size_sqm', 'land_size_sqm', 'total_area_sqm',
      'latitude', 'longitude',
    ].includes(field);
  }

  /**
   * Resolve a single field using the appropriate strategy
   */
  private resolveField(field: string, conflict: FieldConflict): FieldResolution {
    const strategy = FIELD_STRATEGIES[field] || FIELD_STRATEGIES.default;
    const values = conflict.values;
    
    if (values.length === 0) {
      return {
        field_name: field,
        resolved_value: null,
        resolution_strategy: strategy,
        winning_source: '',
        confidence: 0,
        all_sources: [],
        conflict_existed: false,
      };
    }
    
    if (values.length === 1) {
      return {
        field_name: field,
        resolved_value: values[0].value,
        resolution_strategy: strategy,
        winning_source: values[0].source_id,
        confidence: values[0].trust_score,
        all_sources: [values[0].source_id],
        conflict_existed: false,
      };
    }
    
    // Apply resolution strategy
    let winner: SourcedValue;
    let confidence: number;
    let resolved_value: any;
    
    switch (strategy) {
      case 'trust_score':
        winner = this.resolveTrustScore(values);
        resolved_value = winner.value;
        confidence = winner.trust_score;
        break;
        
      case 'quality_score':
        winner = this.resolveQualityScore(values);
        resolved_value = winner.value;
        confidence = winner.quality_score;
        break;
        
      case 'most_recent':
        winner = this.resolveMostRecent(values);
        resolved_value = winner.value;
        confidence = 0.7; // Recency gives moderate confidence
        break;
        
      case 'consensus':
        const consensusResult = this.resolveConsensus(values);
        resolved_value = consensusResult.value;
        winner = values.find(v => this.normalizeForComparison(v.value) === 
          this.normalizeForComparison(consensusResult.value)) || values[0];
        confidence = consensusResult.confidence;
        break;
        
      case 'numeric_max':
        winner = this.resolveNumericMax(values);
        resolved_value = winner.value;
        confidence = winner.trust_score * 0.8; // Slightly reduce confidence for max strategy
        break;
        
      case 'numeric_min':
        winner = this.resolveNumericMin(values);
        resolved_value = winner.value;
        confidence = winner.trust_score * 0.8;
        break;
        
      case 'verified_max':
        winner = this.resolveVerifiedMax(values);
        resolved_value = winner.value;
        confidence = winner.trust_score;
        break;
        
      case 'merge_arrays':
        resolved_value = this.resolveMergeArrays(values);
        winner = values.reduce((a, b) => a.trust_score > b.trust_score ? a : b);
        confidence = 0.9; // High confidence when merging
        break;
        
      case 'longest_text':
        winner = this.resolveLongestText(values);
        resolved_value = winner.value;
        confidence = winner.trust_score * 0.9;
        break;
        
      default:
        winner = this.resolveTrustScore(values);
        resolved_value = winner.value;
        confidence = winner.trust_score;
    }
    
    return {
      field_name: field,
      resolved_value,
      resolution_strategy: strategy,
      winning_source: winner.source_id,
      confidence,
      all_sources: values.map(v => v.source_id),
      conflict_existed: conflict.has_conflict,
    };
  }

  /**
   * Resolve by trust score - highest trust wins
   */
  private resolveTrustScore(values: SourcedValue[]): SourcedValue {
    return values.reduce((best, current) => 
      current.trust_score > best.trust_score ? current : best
    );
  }

  /**
   * Resolve by quality score - highest quality wins
   */
  private resolveQualityScore(values: SourcedValue[]): SourcedValue {
    return values.reduce((best, current) => 
      current.quality_score > best.quality_score ? current : best
    );
  }

  /**
   * Resolve by recency - most recent wins
   */
  private resolveMostRecent(values: SourcedValue[]): SourcedValue {
    return values.reduce((best, current) => 
      current.updated_at > best.updated_at ? current : best
    );
  }

  /**
   * Resolve by consensus - most common value wins
   */
  private resolveConsensus(values: SourcedValue[]): { value: any; confidence: number } {
    const counts = new Map<string, { value: any; count: number; trust_sum: number }>();
    
    for (const v of values) {
      const key = this.normalizeForComparison(v.value);
      const existing = counts.get(key) || { value: v.value, count: 0, trust_sum: 0 };
      existing.count++;
      existing.trust_sum += v.trust_score;
      counts.set(key, existing);
    }
    
    // Find value with most votes, weighted by trust
    let best = { value: values[0].value, count: 0, trust_sum: 0 };
    for (const entry of counts.values()) {
      const score = entry.count + entry.trust_sum;
      const bestScore = best.count + best.trust_sum;
      if (score > bestScore) {
        best = entry;
      }
    }
    
    // Confidence based on proportion agreeing
    const confidence = best.count / values.length;
    
    return { value: best.value, confidence };
  }

  /**
   * Resolve by taking maximum numeric value
   */
  private resolveNumericMax(values: SourcedValue[]): SourcedValue {
    return values.reduce((best, current) => {
      const bestNum = parseFloat(best.value) || 0;
      const currentNum = parseFloat(current.value) || 0;
      return currentNum > bestNum ? current : best;
    });
  }

  /**
   * Resolve by taking minimum numeric value
   */
  private resolveNumericMin(values: SourcedValue[]): SourcedValue {
    return values.reduce((best, current) => {
      const bestNum = parseFloat(best.value) || Infinity;
      const currentNum = parseFloat(current.value) || Infinity;
      return currentNum < bestNum ? current : best;
    });
  }

  /**
   * Resolve price by taking max from verified (high trust) sources
   */
  private resolveVerifiedMax(values: SourcedValue[]): SourcedValue {
    // Filter to high-trust sources (tier1, tier2)
    const verifiedValues = values.filter(v => 
      v.source_type?.startsWith('tier1') || 
      v.source_type?.startsWith('tier2') ||
      v.trust_score >= 0.7
    );
    
    // If we have verified sources, use max from those
    if (verifiedValues.length > 0) {
      return this.resolveNumericMax(verifiedValues);
    }
    
    // Otherwise, use trust score weighted selection
    return this.resolveTrustScore(values);
  }

  /**
   * Resolve by merging arrays
   */
  private resolveMergeArrays(values: SourcedValue[]): any[] {
    const merged = new Set<string>();
    const result: any[] = [];
    
    for (const v of values) {
      const arr = Array.isArray(v.value) ? v.value : [v.value];
      for (const item of arr) {
        const key = JSON.stringify(item);
        if (!merged.has(key)) {
          merged.add(key);
          result.push(item);
        }
      }
    }
    
    return result;
  }

  /**
   * Resolve by taking longest text
   */
  private resolveLongestText(values: SourcedValue[]): SourcedValue {
    return values.reduce((best, current) => {
      const bestLen = String(best.value || '').length;
      const currentLen = String(current.value || '').length;
      return currentLen > bestLen ? current : best;
    });
  }

  /**
   * Calculate overall resolution confidence
   */
  private calculateOverallConfidence(
    resolved: Record<string, FieldResolution>
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (const [field, resolution] of Object.entries(resolved)) {
      const weight = FIELD_WEIGHTS[field] || 0.01;
      weightedSum += resolution.confidence * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Apply resolved values to the property record
   */
  private async applyResolution(
    client: PoolClient,
    propertyId: string,
    resolution: PropertyResolution
  ): Promise<void> {
    // Build update query for resolved fields
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    // Map resolution field names to database column names
    const fieldMapping: Record<string, string> = {
      address: 'address_street',
      city: 'address_city',
      price: 'price',
      title: 'title',
      description: 'description',
      bedrooms: 'bedrooms',
      bathrooms: 'bathrooms',
      building_size_sqm: 'built_area_sqm',
      land_size_sqm: 'land_area_sqm',
      total_area_sqm: 'total_area_sqm',
      property_type: 'property_type',
      latitude: 'latitude',
      longitude: 'longitude',
      amenities: 'amenities',
      images: 'image_urls',
    };
    
    for (const [field, result] of Object.entries(resolution.resolved_fields)) {
      const dbColumn = fieldMapping[field];
      if (dbColumn && result.resolved_value !== null) {
        updates.push(`${dbColumn} = $${paramIndex++}`);
        
        // Handle JSON fields
        if (['amenities', 'images', 'image_urls'].includes(field)) {
          values.push(JSON.stringify(result.resolved_value));
        } else {
          values.push(result.resolved_value);
        }
      }
    }
    
    if (updates.length === 0) return;
    
    // Add metadata
    updates.push(`conflict_resolution_metadata = $${paramIndex++}`);
    values.push(JSON.stringify({
      resolved_at: resolution.resolution_timestamp,
      confidence: resolution.overall_confidence,
      conflicts_resolved: resolution.conflicts_resolved,
      sources: resolution.sources_consulted,
    }));
    
    updates.push(`updated_at = NOW()`);
    
    // Get property region for partitioned table query
    const regionResult = await client.query(
      'SELECT region FROM properties WHERE id = $1',
      [propertyId]
    );
    
    if (regionResult.rows.length === 0) {
      logger.warn(`Property ${propertyId} not found for resolution`);
      return;
    }
    
    values.push(propertyId, regionResult.rows[0].region);
    
    await client.query(`
      UPDATE properties 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND region = $${paramIndex}
    `, values);
    
    // Log resolution history
    await client.query(`
      INSERT INTO property_history (
        property_id, event_type, details, created_at
      ) VALUES ($1, 'conflict_resolution', $2, NOW())
    `, [
      propertyId,
      JSON.stringify({
        conflicts_resolved: resolution.conflicts_resolved,
        confidence: resolution.overall_confidence,
        sources: resolution.sources_consulted,
        field_resolutions: Object.entries(resolution.resolved_fields)
          .filter(([_, r]) => r.conflict_existed)
          .map(([field, r]) => ({
            field,
            strategy: r.resolution_strategy,
            winning_source: r.winning_source,
            confidence: r.confidence,
          })),
      }),
    ]);
    
    logger.info(`Resolved ${resolution.conflicts_resolved} conflicts for property ${propertyId}`);
  }

  /**
   * Batch resolve conflicts for multiple properties
   */
  async resolveConflictsBatch(
    propertyIds: string[],
    options: { dryRun?: boolean } = {}
  ): Promise<{
    successful: number;
    failed: number;
    results: PropertyResolution[];
    errors: { propertyId: string; error: string }[];
  }> {
    const results: PropertyResolution[] = [];
    const errors: { propertyId: string; error: string }[] = [];
    
    for (const propertyId of propertyIds) {
      try {
        const result = await this.resolvePropertyConflicts(propertyId, options);
        results.push(result);
      } catch (error) {
        errors.push({
          propertyId,
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
   * Find properties that have unresolved conflicts
   */
  async findPropertiesWithConflicts(
    options: { limit?: number; minSources?: number } = {}
  ): Promise<string[]> {
    const { limit = 1000, minSources = 2 } = options;
    
    const result = await this.pool.query(`
      SELECT pds.property_id, COUNT(DISTINCT pds.data_source_id) as source_count
      FROM property_data_sources pds
      GROUP BY pds.property_id
      HAVING COUNT(DISTINCT pds.data_source_id) >= $1
      LIMIT $2
    `, [minSources, limit]);
    
    return result.rows.map(r => r.property_id);
  }
}

// Export singleton instance
export const conflictResolutionService = new ConflictResolutionService();
