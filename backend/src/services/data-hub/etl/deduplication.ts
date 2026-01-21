/**
 * Property Deduplication Service
 * 
 * Identifies and manages duplicate properties across multiple data sources.
 * Uses various matching strategies including exact matching, fuzzy matching,
 * location-based matching, title similarity, and image perceptual hashing.
 * 
 * Enhanced with:
 * - Title similarity using normalized text comparison
 * - Image perceptual hashing for visual comparison
 * - Integration with conflict resolution for smart merging
 * - Multi-source tracking for merged records
 * - Batch processing with progress callbacks
 */

import { Pool, PoolClient } from 'pg';
import { pool as dbPool } from '../../../database';
import crypto from 'crypto';
import { logger } from '../../../utils/logger';

export interface PropertyMatch {
  id: string;
  source: string;
  title: string;
  address: string;
  price?: number;
  matchScore: number;
  matchReasons: string[];
  imageMatchScore?: number;
  titleMatchScore?: number;
}

export interface DuplicateGroup {
  canonicalId: string;
  properties: PropertyMatch[];
  confidence: number;
  mergeStrategy: 'highest_trust' | 'most_complete' | 'most_recent';
  autoMergeEligible: boolean;
}

export interface DeduplicationResult {
  totalProcessed: number;
  duplicatesFound: number;
  groupsCreated: number;
  mergesConducted: number;
  autoMerges: number;
  errors: string[];
}

export interface MergeResult {
  canonicalId: string;
  mergedIds: string[];
  fieldsResolved: number;
  confidence: number;
  success: boolean;
  error?: string;
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
  imageUrls?: string[];
  imageHashes?: string[];
}

// Matching weights for different fields (total possible = 120)
const MATCH_WEIGHTS = {
  exactAddress: 25,
  fuzzyAddress: 18,
  locationProximity: 20,  // Within 50m
  titleSimilarity: 12,    // Similar listing titles
  exactPrice: 12,
  similarPrice: 8,        // Within 5%
  sameType: 8,
  sameBedrooms: 4,
  sameBathrooms: 3,
  similarSize: 5,
  imageMatch: 5,          // Perceptual image hash match
};

const DUPLICATE_THRESHOLD = 70;  // Minimum score to consider duplicate
const HIGH_CONFIDENCE_THRESHOLD = 85;  // Score for auto-merge eligibility

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
      autoMerges: 0,
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

    // Check if eligible for auto-merge (high confidence)
    const autoMergeEligible = avgMatchScore >= HIGH_CONFIDENCE_THRESHOLD;

    return {
      canonicalId: canonical.id,
      properties: allProperties,
      confidence,
      mergeStrategy: 'highest_trust',
      autoMergeEligible
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
      'jiji': 0.55,
      'housemaster': 0.60,
      'tonaton': 0.55,
    };
    
    return scores[source] || 0.5;
  }

  // ==========================================================================
  // ENHANCED MATCHING METHODS
  // ==========================================================================

  /**
   * Calculate title similarity using normalized text comparison
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    if (!title1 || !title2) return 0;
    
    // Normalize titles
    const normalized1 = this.normalizeTitle(title1);
    const normalized2 = this.normalizeTitle(title2);
    
    if (normalized1 === normalized2) return 1;
    
    // Use Jaccard similarity on word sets
    const words1 = new Set(normalized1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(normalized2.split(' ').filter(w => w.length > 2));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;
    
    // Also check Levenshtein for short titles
    const levenshtein = this.stringSimilarity(normalized1, normalized2);
    
    // Return weighted average
    return jaccard * 0.6 + levenshtein * 0.4;
  }

  /**
   * Normalize title for comparison
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')  // Remove punctuation
      .replace(/\b(for|sale|rent|bedroom|br|bath|house|apartment|flat|property)\b/g, '')
      .replace(/\b\d+(sqm|sq|m2|sqft|ft)\b/g, '')  // Remove size mentions
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Compare image sets using perceptual hashing
   * Returns similarity score 0-1
   */
  private compareImageSets(
    images1: string[] | undefined,
    images2: string[] | undefined,
    hashes1?: string[],
    hashes2?: string[]
  ): number {
    // If we have pre-computed hashes, use them
    if (hashes1?.length && hashes2?.length) {
      return this.comparePerceptualHashes(hashes1, hashes2);
    }
    
    // Fallback: compare URL similarity (same images often have similar URLs)
    if (!images1?.length || !images2?.length) return 0;
    
    let matches = 0;
    for (const img1 of images1) {
      for (const img2 of images2) {
        if (this.imageUrlSimilarity(img1, img2) > 0.8) {
          matches++;
          break;
        }
      }
    }
    
    return matches / Math.max(images1.length, images2.length);
  }

  /**
   * Compare perceptual hashes using Hamming distance
   */
  private comparePerceptualHashes(hashes1: string[], hashes2: string[]): number {
    if (!hashes1.length || !hashes2.length) return 0;
    
    let bestMatch = 0;
    for (const h1 of hashes1) {
      for (const h2 of hashes2) {
        const similarity = this.hammingSimilarity(h1, h2);
        bestMatch = Math.max(bestMatch, similarity);
        if (bestMatch > 0.95) return bestMatch; // Early exit on near-match
      }
    }
    
    return bestMatch;
  }

  /**
   * Calculate Hamming similarity between two hashes
   */
  private hammingSimilarity(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return 0;
    
    let differences = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) differences++;
    }
    
    return 1 - (differences / hash1.length);
  }

  /**
   * Compare image URLs for similarity
   */
  private imageUrlSimilarity(url1: string, url2: string): number {
    // Extract filename from URL
    const getFilename = (url: string) => {
      try {
        const parts = url.split('/').pop() || '';
        return parts.split('?')[0].toLowerCase();
      } catch {
        return '';
      }
    };
    
    const file1 = getFilename(url1);
    const file2 = getFilename(url2);
    
    if (file1 && file1 === file2) return 1;
    
    return this.stringSimilarity(file1, file2);
  }

  // ==========================================================================
  // MERGE OPERATIONS
  // ==========================================================================

  /**
   * Merge duplicate properties into canonical record
   */
  async mergeProperties(
    group: DuplicateGroup,
    options: { dryRun?: boolean; resolveConflicts?: boolean } = {}
  ): Promise<MergeResult> {
    const { dryRun = false, resolveConflicts = true } = options;
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const canonicalId = group.canonicalId;
      const duplicateIds = group.properties
        .filter(p => p.id !== canonicalId)
        .map(p => p.id);
      
      if (duplicateIds.length === 0) {
        await client.query('ROLLBACK');
        return {
          canonicalId,
          mergedIds: [],
          fieldsResolved: 0,
          confidence: group.confidence,
          success: true,
        };
      }
      
      // Import multi-source tracking service dynamically to avoid circular deps
      const { multiSourceTrackingService: msts } = await import('./multiSourceTracking');
      
      // Track source contributions from duplicates to canonical
      for (const dupId of duplicateIds) {
        await msts.mergePropertySources(dupId, canonicalId);
      }
      
      let fieldsResolved = 0;
      
      // Resolve conflicts if requested
      if (resolveConflicts) {
        const { conflictResolutionService: crs } = await import('./conflictResolution');
        const resolution = await crs.resolvePropertyConflicts(canonicalId, { dryRun });
        fieldsResolved = resolution.conflicts_resolved;
      }
      
      if (!dryRun) {
        // Update duplicate records to mark as merged
        for (const dupId of duplicateIds) {
          await client.query(`
            UPDATE property_duplicates SET
              status = 'merged',
              merged_at = NOW(),
              merged_into_id = $1
            WHERE property_id = $2
          `, [canonicalId, dupId]);
        }
        
        // Soft-delete duplicate properties
        await client.query(`
          UPDATE properties SET
            status = 'merged',
            merged_into_property_id = $1,
            updated_at = NOW()
          WHERE id = ANY($2::uuid[])
        `, [canonicalId, duplicateIds]);
        
        // Log merge operation
        await client.query(`
          INSERT INTO property_history (
            property_id, event_type, details, created_at
          ) VALUES ($1, 'merge', $2, NOW())
        `, [
          canonicalId,
          JSON.stringify({
            merged_ids: duplicateIds,
            merge_strategy: group.mergeStrategy,
            confidence: group.confidence,
            fields_resolved: fieldsResolved,
          }),
        ]);
        
        await client.query('COMMIT');
        
        logger.info(`Merged ${duplicateIds.length} properties into ${canonicalId}`);
      } else {
        await client.query('ROLLBACK');
      }
      
      return {
        canonicalId,
        mergedIds: duplicateIds,
        fieldsResolved,
        confidence: group.confidence,
        success: true,
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Merge failed for ${group.canonicalId}: ${errorMessage}`);
      
      return {
        canonicalId: group.canonicalId,
        mergedIds: [],
        fieldsResolved: 0,
        confidence: 0,
        success: false,
        error: errorMessage,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Auto-merge high confidence duplicates
   */
  async autoMergeHighConfidence(
    options: { 
      batchSize?: number;
      threshold?: number;
      dryRun?: boolean;
    } = {}
  ): Promise<{
    attempted: number;
    successful: number;
    failed: number;
    results: MergeResult[];
  }> {
    const { 
      batchSize = 50, 
      threshold = HIGH_CONFIDENCE_THRESHOLD,
      dryRun = false 
    } = options;
    
    const results: MergeResult[] = [];
    
    // Get pending duplicate groups with high confidence
    const groups = await this.pool.query(`
      SELECT 
        pd.canonical_property_id,
        array_agg(pd.property_id) as duplicate_ids,
        AVG(pd.similarity_score) as avg_score
      FROM property_duplicates pd
      WHERE pd.status = 'pending'
        AND pd.similarity_score >= $1
      GROUP BY pd.canonical_property_id
      HAVING COUNT(*) >= 1
      LIMIT $2
    `, [threshold / 100, batchSize]);
    
    for (const row of groups.rows) {
      const group: DuplicateGroup = {
        canonicalId: row.canonical_property_id,
        properties: [
          { 
            id: row.canonical_property_id, 
            source: '', 
            title: '', 
            address: '', 
            matchScore: 100,
            matchReasons: ['Canonical'] 
          },
          ...row.duplicate_ids.map((id: string) => ({
            id,
            source: '',
            title: '',
            address: '',
            matchScore: row.avg_score * 100,
            matchReasons: ['High confidence match'],
          })),
        ],
        confidence: row.avg_score,
        mergeStrategy: 'highest_trust',
        autoMergeEligible: true,
      };
      
      const result = await this.mergeProperties(group, { 
        dryRun, 
        resolveConflicts: true 
      });
      results.push(result);
    }
    
    return {
      attempted: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Process duplicates with enhanced matching including title and images
   */
  async processWithEnhancedMatching(
    options: {
      batchSize?: number;
      includeImages?: boolean;
      dryRun?: boolean;
      progressCallback?: (progress: { processed: number; found: number }) => void;
    } = {}
  ): Promise<DeduplicationResult> {
    const { 
      batchSize = 100, 
      includeImages = true,
      dryRun = false,
      progressCallback 
    } = options;
    
    const result: DeduplicationResult = {
      totalProcessed: 0,
      duplicatesFound: 0,
      groupsCreated: 0,
      mergesConducted: 0,
      autoMerges: 0,
      errors: [],
    };
    
    const client = await this.pool.connect();
    
    try {
      // Build enhanced query with images if requested
      const imageSelect = includeImages 
        ? `, image_urls as "imageUrls"` 
        : '';
      
      const countResult = await client.query(
        'SELECT COUNT(*) FROM properties WHERE status = $1',
        ['active']
      );
      const totalCount = parseInt(countResult.rows[0].count);
      
      let offset = 0;
      const processedIds = new Set<string>();
      
      while (offset < totalCount) {
        const properties = await client.query<PropertyForMatching>(`
          SELECT 
            id, external_source as source, title, 
            address_street as address, address_city as city, region,
            latitude, longitude,
            price as price,
            price_currency as "priceCurrency",
            bedrooms, bathrooms,
            built_area_sqm as "buildingSizeSqm",
            land_area_sqm as "landSizeSqm",
            property_type as "propertyType",
            transaction_type as "listingType",
            COALESCE(
              (SELECT trust_score FROM data_sources WHERE slug = properties.external_source),
              0.5
            ) as "trustScore"
            ${imageSelect}
          FROM properties
          WHERE status = 'active'
            AND id NOT IN (
              SELECT property_id FROM property_duplicates WHERE status = 'merged'
            )
          ORDER BY id
          LIMIT $1 OFFSET $2
        `, [batchSize, offset]);
        
        for (const property of properties.rows) {
          if (processedIds.has(property.id)) continue;
          
          result.totalProcessed++;
          
          try {
            const duplicates = await this.findDuplicatesEnhanced(
              property, 
              { threshold: DUPLICATE_THRESHOLD, includeImages }
            );
            
            if (duplicates.length > 0) {
              result.duplicatesFound += duplicates.length;
              
              // Create duplicate group
              const group = this.createEnhancedDuplicateGroup(property, duplicates);
              
              if (!dryRun) {
                await this.saveDuplicateGroup(client, group);
                result.groupsCreated++;
                
                // Auto-merge if high confidence
                if (group.autoMergeEligible) {
                  const mergeResult = await this.mergeProperties(group, { 
                    dryRun: false, 
                    resolveConflicts: true 
                  });
                  if (mergeResult.success) {
                    result.autoMerges++;
                    result.mergesConducted++;
                  }
                }
              }
              
              // Mark processed
              processedIds.add(property.id);
              duplicates.forEach(d => processedIds.add(d.id));
            }
          } catch (error) {
            result.errors.push(`Error processing ${property.id}: ${error}`);
          }
          
          // Progress callback
          if (progressCallback && result.totalProcessed % 10 === 0) {
            progressCallback({ 
              processed: result.totalProcessed, 
              found: result.duplicatesFound 
            });
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
   * Find duplicates with enhanced matching (title + images)
   */
  private async findDuplicatesEnhanced(
    property: PropertyForMatching,
    options: { threshold?: number; includeImages?: boolean } = {}
  ): Promise<PropertyMatch[]> {
    const { threshold = DUPLICATE_THRESHOLD, includeImages = true } = options;
    const client = await this.pool.connect();
    
    try {
      const candidates = await this.findCandidatesEnhanced(client, property, includeImages);
      const matches: PropertyMatch[] = [];
      
      for (const candidate of candidates) {
        if (candidate.id === property.id) continue;
        
        const { score, reasons, titleScore, imageScore } = 
          this.calculateEnhancedMatchScore(property, candidate);
        
        if (score >= threshold) {
          matches.push({
            id: candidate.id,
            source: candidate.source,
            title: candidate.title,
            address: candidate.address || '',
            price: candidate.price,
            matchScore: score,
            matchReasons: reasons,
            titleMatchScore: titleScore,
            imageMatchScore: imageScore,
          });
        }
      }
      
      // Sort by score descending
      matches.sort((a, b) => b.matchScore - a.matchScore);
      
      return matches.slice(0, 10);
      
    } finally {
      client.release();
    }
  }

  /**
   * Find candidates with image URLs included
   */
  private async findCandidatesEnhanced(
    client: PoolClient,
    property: PropertyForMatching,
    includeImages: boolean
  ): Promise<PropertyForMatching[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;
    
    // Exclude same property
    conditions.push(`id != $${paramIndex++}`);
    params.push(property.id);
    
    // Active status
    conditions.push(`status = 'active'`);
    
    // Same city (if available)
    if (property.city) {
      conditions.push(`address_city = $${paramIndex++}`);
      params.push(property.city);
    }
    
    // Same property type
    if (property.propertyType) {
      conditions.push(`property_type = $${paramIndex++}`);
      params.push(property.propertyType);
    }
    
    // Similar price range (within 30%)
    if (property.price) {
      const priceLow = property.price * 0.7;
      const priceHigh = property.price * 1.3;
      conditions.push(`price BETWEEN $${paramIndex++} AND $${paramIndex++}`);
      params.push(priceLow, priceHigh);
    }
    
    // Location proximity (within 300m)
    if (property.latitude && property.longitude) {
      conditions.push(`
        ST_DWithin(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography,
          300
        )
      `);
      params.push(property.longitude, property.latitude);
    }
    
    const imageSelect = includeImages 
      ? `, image_urls as "imageUrls"` 
      : '';
    
    const query = `
      SELECT 
        id, external_source as source, title, 
        address_street as address, address_city as city, region,
        latitude, longitude,
        price,
        price_currency as "priceCurrency",
        bedrooms, bathrooms,
        built_area_sqm as "buildingSizeSqm",
        land_area_sqm as "landSizeSqm",
        property_type as "propertyType",
        transaction_type as "listingType",
        COALESCE(
          (SELECT trust_score FROM data_sources WHERE slug = properties.external_source),
          0.5
        ) as "trustScore"
        ${imageSelect}
      FROM properties
      WHERE ${conditions.join(' AND ')}
      LIMIT 100
    `;
    
    const result = await client.query<PropertyForMatching>(query, params);
    return result.rows;
  }

  /**
   * Calculate enhanced match score including title and images
   */
  private calculateEnhancedMatchScore(
    prop1: PropertyForMatching,
    prop2: PropertyForMatching
  ): { score: number; reasons: string[]; titleScore: number; imageScore: number } {
    let score = 0;
    const reasons: string[] = [];
    
    // Standard matching (address, location, price, etc.)
    const { score: baseScore, reasons: baseReasons } = this.calculateMatchScore(prop1, prop2);
    score = baseScore;
    reasons.push(...baseReasons);
    
    // Title similarity
    const titleSimilarity = this.calculateTitleSimilarity(prop1.title, prop2.title);
    let titleScore = 0;
    if (titleSimilarity >= 0.8) {
      titleScore = MATCH_WEIGHTS.titleSimilarity;
      score += titleScore;
      reasons.push(`Similar titles (${Math.round(titleSimilarity * 100)}%)`);
    } else if (titleSimilarity >= 0.6) {
      titleScore = MATCH_WEIGHTS.titleSimilarity * 0.5;
      score += titleScore;
      reasons.push(`Somewhat similar titles (${Math.round(titleSimilarity * 100)}%)`);
    }
    
    // Image comparison
    let imageScore = 0;
    const imageSimilarity = this.compareImageSets(
      prop1.imageUrls, 
      prop2.imageUrls,
      prop1.imageHashes,
      prop2.imageHashes
    );
    if (imageSimilarity >= 0.5) {
      imageScore = MATCH_WEIGHTS.imageMatch * imageSimilarity;
      score += imageScore;
      reasons.push(`Similar images (${Math.round(imageSimilarity * 100)}%)`);
    }
    
    return { score, reasons, titleScore, imageScore };
  }

  /**
   * Create duplicate group with auto-merge eligibility
   */
  private createEnhancedDuplicateGroup(
    primary: PropertyForMatching,
    duplicates: PropertyMatch[]
  ): DuplicateGroup {
    const allProperties: PropertyMatch[] = [
      {
        id: primary.id,
        source: primary.source,
        title: primary.title,
        address: primary.address || '',
        price: primary.price,
        matchScore: 100,
        matchReasons: ['Primary property'],
      },
      ...duplicates,
    ];
    
    // Select canonical based on trust score
    const canonical = allProperties.reduce((best, current) => {
      const bestTrust = this.getSourceTrustScore(best.source);
      const currentTrust = this.getSourceTrustScore(current.source);
      return currentTrust > bestTrust ? current : best;
    });
    
    // Calculate confidence
    const avgMatchScore = duplicates.reduce((sum, d) => sum + d.matchScore, 0) / duplicates.length;
    const confidence = avgMatchScore / 100;
    
    // Check auto-merge eligibility
    const autoMergeEligible = avgMatchScore >= HIGH_CONFIDENCE_THRESHOLD;
    
    return {
      canonicalId: canonical.id,
      properties: allProperties,
      confidence,
      mergeStrategy: 'highest_trust',
      autoMergeEligible,
    };
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get duplicate groups pending review
   */
  async getPendingDuplicateGroups(
    options: { limit?: number; minScore?: number } = {}
  ): Promise<{
    canonicalId: string;
    duplicateCount: number;
    avgScore: number;
    sources: string[];
  }[]> {
    const { limit = 100, minScore = DUPLICATE_THRESHOLD } = options;
    
    const result = await this.pool.query(`
      SELECT 
        pd.canonical_property_id,
        COUNT(pd.property_id) as duplicate_count,
        AVG(pd.similarity_score) as avg_score,
        array_agg(DISTINCT p.external_source) as sources
      FROM property_duplicates pd
      LEFT JOIN properties p ON p.id = pd.property_id
      WHERE pd.status = 'pending'
        AND pd.similarity_score >= $1
      GROUP BY pd.canonical_property_id
      ORDER BY avg_score DESC
      LIMIT $2
    `, [minScore / 100, limit]);
    
    return result.rows.map(r => ({
      canonicalId: r.canonical_property_id,
      duplicateCount: parseInt(r.duplicate_count),
      avgScore: parseFloat(r.avg_score) * 100,
      sources: r.sources || [],
    }));
  }

  /**
   * Reject a duplicate match
   */
  async rejectDuplicate(
    propertyId: string,
    canonicalId: string,
    reason?: string
  ): Promise<void> {
    await this.pool.query(`
      UPDATE property_duplicates SET
        status = 'rejected',
        rejected_at = NOW(),
        rejection_reason = $3
      WHERE property_id = $1 AND canonical_property_id = $2
    `, [propertyId, canonicalId, reason || null]);
  }

  /**
   * Confirm a duplicate match
   */
  async confirmDuplicate(
    propertyId: string,
    canonicalId: string
  ): Promise<void> {
    await this.pool.query(`
      UPDATE property_duplicates SET
        status = 'confirmed',
        confirmed_at = NOW()
      WHERE property_id = $1 AND canonical_property_id = $2
    `, [propertyId, canonicalId]);
  }

  /**
   * Get deduplication statistics
   */
  async getStatistics(): Promise<{
    total_properties: number;
    properties_with_duplicates: number;
    pending_groups: number;
    merged_count: number;
    rejected_count: number;
    avg_confidence: number;
  }> {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM properties WHERE status = 'active') as total_properties,
        (SELECT COUNT(DISTINCT canonical_property_id) FROM property_duplicates) as properties_with_duplicates,
        (SELECT COUNT(DISTINCT canonical_property_id) FROM property_duplicates WHERE status = 'pending') as pending_groups,
        (SELECT COUNT(*) FROM property_duplicates WHERE status = 'merged') as merged_count,
        (SELECT COUNT(*) FROM property_duplicates WHERE status = 'rejected') as rejected_count,
        (SELECT AVG(similarity_score) FROM property_duplicates) as avg_confidence
    `);
    
    const row = result.rows[0];
    return {
      total_properties: parseInt(row.total_properties) || 0,
      properties_with_duplicates: parseInt(row.properties_with_duplicates) || 0,
      pending_groups: parseInt(row.pending_groups) || 0,
      merged_count: parseInt(row.merged_count) || 0,
      rejected_count: parseInt(row.rejected_count) || 0,
      avg_confidence: (parseFloat(row.avg_confidence) || 0) * 100,
    };
  }
}

// Export singleton instance
export const deduplicationService = new DeduplicationService();
