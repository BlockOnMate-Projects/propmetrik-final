/**
 * Property Quality Scoring Service
 * 
 * Calculates data quality scores for properties based on completeness,
 * accuracy, and consistency of data.
 */

import { Pool, PoolClient } from 'pg';
import { pool as dbPool } from '../../../database';

export interface QualityScore {
  overall: number;
  completeness: number;
  accuracy: number;
  freshness: number;
  consistency: number;
  breakdown: QualityBreakdown;
}

export interface QualityBreakdown {
  hasTitle: boolean;
  hasDescription: boolean;
  hasPrice: boolean;
  hasLocation: boolean;
  hasCoordinates: boolean;
  hasPropertyType: boolean;
  hasBedrooms: boolean;
  hasBathrooms: boolean;
  hasSize: boolean;
  hasImages: boolean;
  hasAgentInfo: boolean;
  titleLength: number;
  descriptionLength: number;
  imageCount: number;
  daysOld: number;
  priceInRange: boolean;
  coordinatesInGhana: boolean;
}

export interface PropertyQualityMetrics {
  id: string;
  score: QualityScore;
  issues: string[];
  suggestions: string[];
}

// Field weights for quality calculation
const FIELD_WEIGHTS = {
  title: 0.10,
  description: 0.10,
  price: 0.15,
  location: 0.15,
  coordinates: 0.10,
  propertyType: 0.05,
  bedrooms: 0.05,
  bathrooms: 0.05,
  size: 0.05,
  images: 0.10,
  agentInfo: 0.05,
  freshness: 0.05,
};

// Price ranges by property type (USD)
const PRICE_RANGES: Record<string, { min: number; max: number }> = {
  apartment: { min: 5000, max: 5000000 },
  house: { min: 10000, max: 10000000 },
  land: { min: 1000, max: 50000000 },
  commercial: { min: 50000, max: 100000000 },
  default: { min: 1000, max: 100000000 },
};

// Ghana bounding box
const GHANA_BOUNDS = {
  minLat: 4.5,
  maxLat: 11.2,
  minLon: -3.3,
  maxLon: 1.2,
};

export class QualityScoringService {
  private pool: Pool;

  constructor(pool: Pool = dbPool) {
    this.pool = pool;
  }

  /**
   * Calculate quality score for a single property
   */
  async calculateScore(propertyId: string): Promise<PropertyQualityMetrics> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          p.*,
          ST_Y(p.location::geometry) as latitude,
          ST_X(p.location::geometry) as longitude,
          COALESCE(array_length(p.images, 1), 0) as image_count,
          EXTRACT(DAY FROM NOW() - p.created_at) as days_old
        FROM properties p
        WHERE p.id = $1
      `, [propertyId]);

      if (result.rows.length === 0) {
        throw new Error(`Property ${propertyId} not found`);
      }

      const property = result.rows[0];
      return this.calculatePropertyScore(property);
    } finally {
      client.release();
    }
  }

  /**
   * Batch calculate quality scores for multiple properties
   */
  async calculateBatch(propertyIds: string[]): Promise<PropertyQualityMetrics[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          p.*,
          ST_Y(p.location::geometry) as latitude,
          ST_X(p.location::geometry) as longitude,
          COALESCE(array_length(p.images, 1), 0) as image_count,
          EXTRACT(DAY FROM NOW() - p.created_at) as days_old
        FROM properties p
        WHERE p.id = ANY($1)
      `, [propertyIds]);

      return result.rows.map(property => this.calculatePropertyScore(property));
    } finally {
      client.release();
    }
  }

  /**
   * Process all properties and update quality scores
   */
  async processAll(options: { batchSize?: number } = {}): Promise<{
    processed: number;
    updated: number;
    errors: number;
  }> {
    const { batchSize = 100 } = options;
    const stats = { processed: 0, updated: 0, errors: 0 };
    
    const client = await this.pool.connect();
    
    try {
      // Get total count
      const countResult = await client.query('SELECT COUNT(*) FROM properties');
      const total = parseInt(countResult.rows[0].count);
      
      let offset = 0;
      
      while (offset < total) {
        const properties = await client.query(`
          SELECT 
            p.*,
            ST_Y(p.location::geometry) as latitude,
            ST_X(p.location::geometry) as longitude,
            COALESCE(array_length(p.images, 1), 0) as image_count,
            EXTRACT(DAY FROM NOW() - p.created_at) as days_old
          FROM properties p
          ORDER BY p.id
          LIMIT $1 OFFSET $2
        `, [batchSize, offset]);

        for (const property of properties.rows) {
          try {
            const metrics = this.calculatePropertyScore(property);
            
            // Update property_quality_metrics table
            await client.query(`
              INSERT INTO property_quality_metrics (
                property_id, overall_score, completeness_score,
                accuracy_score, freshness_score, field_scores,
                calculated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, NOW())
              ON CONFLICT (property_id) DO UPDATE SET
                overall_score = EXCLUDED.overall_score,
                completeness_score = EXCLUDED.completeness_score,
                accuracy_score = EXCLUDED.accuracy_score,
                freshness_score = EXCLUDED.freshness_score,
                field_scores = EXCLUDED.field_scores,
                calculated_at = NOW()
            `, [
              property.id,
              metrics.score.overall,
              metrics.score.completeness,
              metrics.score.accuracy,
              metrics.score.freshness,
              JSON.stringify(metrics.score.breakdown)
            ]);
            
            // Also update the property's data_quality_score
            await client.query(`
              UPDATE properties 
              SET data_quality_score = $1
              WHERE id = $2
            `, [metrics.score.overall, property.id]);
            
            stats.updated++;
          } catch (error) {
            stats.errors++;
          }
          stats.processed++;
        }
        
        offset += batchSize;
      }
      
      return stats;
    } finally {
      client.release();
    }
  }

  /**
   * Get quality distribution statistics
   */
  async getQualityStats(): Promise<{
    average: number;
    distribution: { range: string; count: number }[];
    bottomPercentile: string[];
  }> {
    const client = await this.pool.connect();
    
    try {
      // Average score
      const avgResult = await client.query(`
        SELECT AVG(data_quality_score) as avg_score
        FROM properties
      `);
      
      // Distribution
      const distResult = await client.query(`
        SELECT 
          CASE 
            WHEN data_quality_score >= 0.9 THEN '90-100%'
            WHEN data_quality_score >= 0.7 THEN '70-89%'
            WHEN data_quality_score >= 0.5 THEN '50-69%'
            WHEN data_quality_score >= 0.3 THEN '30-49%'
            ELSE '0-29%'
          END as range,
          COUNT(*) as count
        FROM properties
        GROUP BY range
        ORDER BY range DESC
      `);
      
      // Bottom 10% properties
      const bottomResult = await client.query(`
        SELECT id
        FROM properties
        ORDER BY data_quality_score ASC
        LIMIT 10
      `);
      
      return {
        average: parseFloat(avgResult.rows[0].avg_score) || 0,
        distribution: distResult.rows.map(r => ({
          range: r.range,
          count: parseInt(r.count)
        })),
        bottomPercentile: bottomResult.rows.map(r => r.id)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Calculate quality score for a property object
   */
  private calculatePropertyScore(property: any): PropertyQualityMetrics {
    const breakdown: QualityBreakdown = {
      hasTitle: !!property.title && property.title.length > 0,
      hasDescription: !!property.description && property.description.length > 0,
      hasPrice: property.price != null && property.price > 0,
      hasLocation: !!property.address || !!property.city,
      hasCoordinates: property.latitude != null && property.longitude != null,
      hasPropertyType: !!property.property_type,
      hasBedrooms: property.bedrooms != null,
      hasBathrooms: property.bathrooms != null,
      hasSize: property.building_size_sqm != null || property.land_size_sqm != null,
      hasImages: property.image_count > 0,
      hasAgentInfo: !!property.agent_name || !!property.agent_phone,
      titleLength: (property.title || '').length,
      descriptionLength: (property.description || '').length,
      imageCount: property.image_count || 0,
      daysOld: property.days_old || 0,
      priceInRange: this.isPriceInRange(property.price_usd, property.property_type),
      coordinatesInGhana: this.isInGhana(property.latitude, property.longitude),
    };

    const issues: string[] = [];
    const suggestions: string[] = [];

    // Calculate completeness score
    let completenessScore = 0;
    
    if (breakdown.hasTitle) {
      completenessScore += FIELD_WEIGHTS.title;
      if (breakdown.titleLength < 20) {
        suggestions.push('Title is too short, consider adding more details');
      }
    } else {
      issues.push('Missing title');
    }

    if (breakdown.hasDescription) {
      completenessScore += FIELD_WEIGHTS.description;
      if (breakdown.descriptionLength < 100) {
        suggestions.push('Description is short, add more property details');
      }
    } else {
      issues.push('Missing description');
    }

    if (breakdown.hasPrice) {
      completenessScore += FIELD_WEIGHTS.price;
    } else {
      issues.push('Missing price');
    }

    if (breakdown.hasLocation) {
      completenessScore += FIELD_WEIGHTS.location;
    } else {
      issues.push('Missing location information');
    }

    if (breakdown.hasCoordinates) {
      completenessScore += FIELD_WEIGHTS.coordinates;
    } else {
      suggestions.push('Add GPS coordinates for better map display');
    }

    if (breakdown.hasPropertyType) {
      completenessScore += FIELD_WEIGHTS.propertyType;
    } else {
      issues.push('Missing property type');
    }

    if (breakdown.hasBedrooms) {
      completenessScore += FIELD_WEIGHTS.bedrooms;
    } else {
      suggestions.push('Add bedroom count');
    }

    if (breakdown.hasBathrooms) {
      completenessScore += FIELD_WEIGHTS.bathrooms;
    } else {
      suggestions.push('Add bathroom count');
    }

    if (breakdown.hasSize) {
      completenessScore += FIELD_WEIGHTS.size;
    } else {
      suggestions.push('Add property size information');
    }

    if (breakdown.hasImages) {
      completenessScore += FIELD_WEIGHTS.images;
      if (breakdown.imageCount < 3) {
        suggestions.push('Add more images (at least 5 recommended)');
      }
    } else {
      issues.push('No images provided');
    }

    if (breakdown.hasAgentInfo) {
      completenessScore += FIELD_WEIGHTS.agentInfo;
    }

    // Calculate accuracy score
    let accuracyScore = 1.0;
    
    if (breakdown.hasPrice && !breakdown.priceInRange) {
      accuracyScore -= 0.2;
      issues.push('Price seems outside typical range');
    }

    if (breakdown.hasCoordinates && !breakdown.coordinatesInGhana) {
      accuracyScore -= 0.3;
      issues.push('Coordinates are outside Ghana');
    }

    // Calculate freshness score
    let freshnessScore = 1.0;
    const daysOld = breakdown.daysOld;
    
    if (daysOld > 180) {
      freshnessScore = 0.3;
      suggestions.push('Listing is over 6 months old');
    } else if (daysOld > 90) {
      freshnessScore = 0.5;
    } else if (daysOld > 30) {
      freshnessScore = 0.7;
    } else if (daysOld > 7) {
      freshnessScore = 0.9;
    }

    // Calculate consistency score (placeholder for more complex checks)
    const consistencyScore = 1.0;

    // Calculate overall score
    const overall = (
      completenessScore * 0.5 +
      accuracyScore * 0.25 +
      freshnessScore * 0.15 +
      consistencyScore * 0.10
    );

    return {
      id: property.id,
      score: {
        overall: Math.round(overall * 100) / 100,
        completeness: Math.round(completenessScore * 100) / 100,
        accuracy: Math.round(accuracyScore * 100) / 100,
        freshness: Math.round(freshnessScore * 100) / 100,
        consistency: Math.round(consistencyScore * 100) / 100,
        breakdown,
      },
      issues,
      suggestions,
    };
  }

  /**
   * Check if price is within typical range for property type
   */
  private isPriceInRange(price: number | null, propertyType: string | null): boolean {
    if (!price) return true;
    
    const range = PRICE_RANGES[propertyType || 'default'] || PRICE_RANGES.default;
    return price >= range.min && price <= range.max;
  }

  /**
   * Check if coordinates are within Ghana
   */
  private isInGhana(lat: number | null, lon: number | null): boolean {
    if (lat == null || lon == null) return true;
    
    return (
      lat >= GHANA_BOUNDS.minLat &&
      lat <= GHANA_BOUNDS.maxLat &&
      lon >= GHANA_BOUNDS.minLon &&
      lon <= GHANA_BOUNDS.maxLon
    );
  }
}

// Export singleton instance
export const qualityScoringService = new QualityScoringService();
