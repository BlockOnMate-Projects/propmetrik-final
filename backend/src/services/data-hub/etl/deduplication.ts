/**
 * Property Deduplication Service
 * 
 * Identifies and manages duplicate properties across multiple data sources.
 * Uses various matching strategies including exact matching, fuzzy matching,
 * and location-based matching.
 */

import { Pool, PoolClient } from 'pg';
import { pool as dbPool } from '../../../database';
import crypto from 'crypto';

export interface PropertyMatch {
  id: string;
  source: string;
  title: string;
  address: string;
  price?: number;
  matchScore: number;
  matchReasons: string[];
}

export interface DuplicateGroup {
  canonicalId: string;
  properties: PropertyMatch[];
  confidence: number;
  mergeStrategy: 'highest_trust' | 'most_complete' | 'most_recent';
}

export interface DeduplicationResult {
  totalProcessed: number;
  duplicatesFound: number;
  groupsCreated: number;
  mergesConducted: number;
  errors: string[];
}

export interface PropertyForMatching {
  id: string;
  source: string;
  title: string;
  address?: string;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  priceCurrency?: string;
  bedrooms?: number;
  bathrooms?: number;
  buildingSizeSqm?: number;
  landSizeSqm?: number;
  propertyType?: string;
  listingType?: string;
  trustScore: number;
}

// Matching weights for different fields
const MATCH_WEIGHTS = {
  exactAddress: 30,
  fuzzyAddress: 20,
  locationProximity: 25,  // Within 50m
  exactPrice: 15,
  similarPrice: 10,      // Within 5%
  sameType: 10,
  sameBedrooms: 5,
  sameBathrooms: 3,
  similarSize: 7,
};

const DUPLICATE_THRESHOLD = 70;  // Minimum score to consider duplicate

export class DeduplicationService {
  private pool: Pool;

  constructor(pool: Pool = dbPool) {
    this.pool = pool;
  }

  /**
   * Find potential duplicates for a single property
   */
  async findDuplicates(
    property: PropertyForMatching,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<PropertyMatch[]> {
    const { limit = 10, threshold = DUPLICATE_THRESHOLD } = options;
    const client = await this.pool.connect();

    try {
      // Build query to find potential matches
      const candidates = await this.findCandidates(client, property);
      
      // Score each candidate
      const matches: PropertyMatch[] = [];
      
      for (const candidate of candidates) {
        if (candidate.id === property.id) continue;
        
        const { score, reasons } = this.calculateMatchScore(property, candidate);
        
        if (score >= threshold) {
          matches.push({
            id: candidate.id,
            source: candidate.source,
            title: candidate.title,
            address: candidate.address || '',
            price: candidate.price,
            matchScore: score,
            matchReasons: reasons
          });
        }
      }
      
      // Sort by score descending
      matches.sort((a, b) => b.matchScore - a.matchScore);
      
      return matches.slice(0, limit);
    } finally {
      client.release();
    }
  }

  /**
   * Process all properties to find and group duplicates
   */
  async processAll(
    options: { batchSize?: number; dryRun?: boolean } = {}
  ): Promise<DeduplicationResult> {
    const { batchSize = 100, dryRun = false } = options;
    const result: DeduplicationResult = {
      totalProcessed: 0,
      duplicatesFound: 0,
      groupsCreated: 0,
      mergesConducted: 0,
      errors: []
    };

    const client = await this.pool.connect();

    try {
      // Get all properties ordered by trust score (highest first)
      const countResult = await client.query('SELECT COUNT(*) FROM properties');
      const totalCount = parseInt(countResult.rows[0].count);
      
      let offset = 0;
      const processedIds = new Set<string>();
      
      while (offset < totalCount) {
        const properties = await client.query<PropertyForMatching>(`
          SELECT 
            id, source, title, address, city, region,
            ST_Y(location::geometry) as latitude,
            ST_X(location::geometry) as longitude,
            price_usd as price,
            currency as "priceCurrency",
            bedrooms, bathrooms,
            building_size_sqm as "buildingSizeSqm",
            land_size_sqm as "landSizeSqm",
            property_type as "propertyType",
            listing_type as "listingType",
            COALESCE(
              (SELECT trust_score FROM data_sources WHERE slug = properties.source),
              0.5
            ) as "trustScore"
          FROM properties
          WHERE id NOT IN (SELECT property_id FROM property_duplicates)
          ORDER BY id
          LIMIT $1 OFFSET $2
        `, [batchSize, offset]);

        for (const property of properties.rows) {
          if (processedIds.has(property.id)) continue;
          
          result.totalProcessed++;
          
          try {
            const duplicates = await this.findDuplicates(property, { threshold: DUPLICATE_THRESHOLD });
            
            if (duplicates.length > 0) {
              result.duplicatesFound += duplicates.length;
              
              // Create duplicate group
              const group = this.createDuplicateGroup(property, duplicates);
              
              if (!dryRun) {
                await this.saveDuplicateGroup(client, group);
                result.groupsCreated++;
              }
              
              // Mark all properties in group as processed
              processedIds.add(property.id);
              duplicates.forEach(d => processedIds.add(d.id));
            }
          } catch (error) {
            result.errors.push(`Error processing ${property.id}: ${error}`);
          }
        }
        
        offset += batchSize;
      }
      
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Find candidate properties that might be duplicates
   */
  private async findCandidates(
    client: PoolClient,
    property: PropertyForMatching
  ): Promise<PropertyForMatching[]> {
    // Build query conditions
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Exclude same source (cross-source dedup only)
    conditions.push(`source != $${paramIndex++}`);
    params.push(property.source);

    // Same city
    if (property.city) {
      conditions.push(`city = $${paramIndex++}`);
      params.push(property.city);
    }

    // Same property type
    if (property.propertyType) {
      conditions.push(`property_type = $${paramIndex++}`);
      params.push(property.propertyType);
    }

    // Same listing type
    if (property.listingType) {
      conditions.push(`listing_type = $${paramIndex++}`);
      params.push(property.listingType);
    }

    // Similar price range (within 20%)
    if (property.price) {
      const priceLow = property.price * 0.8;
      const priceHigh = property.price * 1.2;
      conditions.push(`price_usd BETWEEN $${paramIndex++} AND $${paramIndex++}`);
      params.push(priceLow, priceHigh);
    }

    // Location proximity (within 200m)
    if (property.latitude && property.longitude) {
      conditions.push(`
        ST_DWithin(
          location::geography,
          ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography,
          200
        )
      `);
      params.push(property.longitude, property.latitude);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const query = `
      SELECT 
        id, source, title, address, city, region,
        ST_Y(location::geometry) as latitude,
        ST_X(location::geometry) as longitude,
        price_usd as price,
        currency as "priceCurrency",
        bedrooms, bathrooms,
        building_size_sqm as "buildingSizeSqm",
        land_size_sqm as "landSizeSqm",
        property_type as "propertyType",
        listing_type as "listingType",
        COALESCE(
          (SELECT trust_score FROM data_sources WHERE slug = properties.source),
          0.5
        ) as "trustScore"
      FROM properties
      ${whereClause}
      LIMIT 100
    `;

    const result = await client.query<PropertyForMatching>(query, params);
    return result.rows;
  }

  /**
   * Calculate match score between two properties
   */
  private calculateMatchScore(
    prop1: PropertyForMatching,
    prop2: PropertyForMatching
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Address matching
    if (prop1.address && prop2.address) {
      const addressSimilarity = this.stringSimilarity(
        this.normalizeAddress(prop1.address),
        this.normalizeAddress(prop2.address)
      );
      
      if (addressSimilarity >= 0.95) {
        score += MATCH_WEIGHTS.exactAddress;
        reasons.push('Exact address match');
      } else if (addressSimilarity >= 0.7) {
        score += MATCH_WEIGHTS.fuzzyAddress * addressSimilarity;
        reasons.push(`Similar address (${Math.round(addressSimilarity * 100)}%)`);
      }
    }

    // Location proximity
    if (prop1.latitude && prop1.longitude && prop2.latitude && prop2.longitude) {
      const distance = this.haversineDistance(
        prop1.latitude, prop1.longitude,
        prop2.latitude, prop2.longitude
      );
      
      if (distance <= 50) {
        score += MATCH_WEIGHTS.locationProximity;
        reasons.push(`Within 50m (${Math.round(distance)}m)`);
      } else if (distance <= 100) {
        score += MATCH_WEIGHTS.locationProximity * 0.5;
        reasons.push(`Within 100m (${Math.round(distance)}m)`);
      }
    }

    // Price matching
    if (prop1.price && prop2.price) {
      const priceDiff = Math.abs(prop1.price - prop2.price) / Math.max(prop1.price, prop2.price);
      
      if (priceDiff === 0) {
        score += MATCH_WEIGHTS.exactPrice;
        reasons.push('Exact price match');
      } else if (priceDiff <= 0.05) {
        score += MATCH_WEIGHTS.similarPrice;
        reasons.push(`Similar price (${Math.round(priceDiff * 100)}% diff)`);
      }
    }

    // Property type
    if (prop1.propertyType && prop2.propertyType && prop1.propertyType === prop2.propertyType) {
      score += MATCH_WEIGHTS.sameType;
      reasons.push('Same property type');
    }

    // Bedrooms
    if (prop1.bedrooms !== undefined && prop2.bedrooms !== undefined && prop1.bedrooms === prop2.bedrooms) {
      score += MATCH_WEIGHTS.sameBedrooms;
      reasons.push('Same bedrooms');
    }

    // Bathrooms
    if (prop1.bathrooms !== undefined && prop2.bathrooms !== undefined && prop1.bathrooms === prop2.bathrooms) {
      score += MATCH_WEIGHTS.sameBathrooms;
      reasons.push('Same bathrooms');
    }

    // Building size
    if (prop1.buildingSizeSqm && prop2.buildingSizeSqm) {
      const sizeDiff = Math.abs(prop1.buildingSizeSqm - prop2.buildingSizeSqm) / 
        Math.max(prop1.buildingSizeSqm, prop2.buildingSizeSqm);
      
      if (sizeDiff <= 0.1) {
        score += MATCH_WEIGHTS.similarSize;
        reasons.push(`Similar size (${Math.round(sizeDiff * 100)}% diff)`);
      }
    }

    return { score, reasons };
  }

  /**
   * Create a duplicate group with canonical selection
   */
  private createDuplicateGroup(
    primary: PropertyForMatching,
    duplicates: PropertyMatch[]
  ): DuplicateGroup {
    // Include primary in the properties list
    const allProperties: PropertyMatch[] = [
      {
        id: primary.id,
        source: primary.source,
        title: primary.title,
        address: primary.address || '',
        price: primary.price,
        matchScore: 100,
        matchReasons: ['Primary property']
      },
      ...duplicates
    ];

    // Select canonical based on trust score (highest trust wins)
    const canonical = allProperties.reduce((best, current) => {
      // Get trust scores from sources
      const bestTrust = this.getSourceTrustScore(best.source);
      const currentTrust = this.getSourceTrustScore(current.source);
      
      return currentTrust > bestTrust ? current : best;
    });

    // Calculate overall confidence
    const avgMatchScore = duplicates.reduce((sum, d) => sum + d.matchScore, 0) / duplicates.length;
    const confidence = avgMatchScore / 100;

    return {
      canonicalId: canonical.id,
      properties: allProperties,
      confidence,
      mergeStrategy: 'highest_trust'
    };
  }

  /**
   * Save duplicate group to database
   */
  private async saveDuplicateGroup(
    client: PoolClient,
    group: DuplicateGroup
  ): Promise<void> {
    // Insert duplicate records
    for (const property of group.properties) {
      if (property.id === group.canonicalId) continue;
      
      await client.query(`
        INSERT INTO property_duplicates (
          property_id, canonical_property_id, 
          similarity_score, match_reasons, 
          status, detected_at
        )
        VALUES ($1, $2, $3, $4, 'pending', NOW())
        ON CONFLICT (property_id, canonical_property_id) 
        DO UPDATE SET
          similarity_score = EXCLUDED.similarity_score,
          match_reasons = EXCLUDED.match_reasons,
          detected_at = NOW()
      `, [
        property.id,
        group.canonicalId,
        property.matchScore / 100,
        JSON.stringify(property.matchReasons)
      ]);
    }
  }

  /**
   * Generate duplicate hash for a property
   */
  generateDuplicateHash(property: PropertyForMatching): string {
    const components = [
      (property.title || '').toLowerCase().substring(0, 50),
      (property.address || '').toLowerCase().substring(0, 50),
      property.price?.toString() || '',
      property.bedrooms?.toString() || '',
      property.propertyType || ''
    ];
    
    const composite = components.join('|');
    return crypto.createHash('md5').update(composite).digest('hex');
  }

  /**
   * Normalize address for comparison
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[.,;:'"]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\b(street|st|road|rd|avenue|ave|drive|dr)\b/g, '')
      .trim();
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private stringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);
    
    if (maxLen === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    
    return dp[m][n];
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private haversineDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Get trust score for a data source
   */
  private getSourceTrustScore(source: string): number {
    const scores: Record<string, number> = {
      'lands-commission': 0.95,
      'gra': 0.90,
      'ama': 0.85,
      'ecobank': 0.80,
      'gcb': 0.80,
      'agency-network': 0.70,
      'meqasa': 0.65,
      'gpc': 0.65,
      'user-contributions': 0.60,
    };
    
    return scores[source] || 0.5;
  }
}

// Export singleton instance
export const deduplicationService = new DeduplicationService();
