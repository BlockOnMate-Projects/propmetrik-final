/**
 * Data Enrichment Service
 * 
 * Enriches property data with additional information from external sources
 * and internal calculations.
 */

import { Pool } from 'pg';
import { pool as dbPool } from '../../../database';
import { AddressStandardizationService } from './addressStandardization';
import { GeocodingService } from '../geocodingService';

export interface EnrichmentResult {
  propertyId: string;
  enrichments: EnrichmentField[];
  success: boolean;
  errors: string[];
}

export interface EnrichmentField {
  field: string;
  originalValue: any;
  enrichedValue: any;
  source: string;
  confidence: number;
}

export interface EnrichmentOptions {
  standardizeAddress?: boolean;
  geocode?: boolean;
  calculatePricePerSqm?: boolean;
  inferMissingFields?: boolean;
  addNeighborhoodData?: boolean;
  addMarketComparables?: boolean;
}

// Ghana city populations for tier inference
const CITY_POPULATIONS: Record<string, number> = {
  'accra': 2388000,
  'kumasi': 1468600,
  'sekondi-takoradi': 445200,
  'tamale': 371300,
  'cape coast': 169900,
  'koforidua': 157000,
  'tema': 155000,
  'ho': 104700,
  'sunyani': 74200,
  'bolgatanga': 66700,
};

// Major neighborhoods with average prices (GHS/sqm)
const NEIGHBORHOOD_PRICES: Record<string, number> = {
  // Accra Premium
  'airport residential': 25000,
  'cantonments': 22000,
  'east legon': 20000,
  'labone': 18000,
  'ridge': 17000,
  'roman ridge': 16000,
  // Accra Middle
  'osu': 14000,
  'dzorwulu': 13000,
  'adjiringanor': 12000,
  'spintex': 10000,
  'tema community': 9000,
  // Accra Affordable
  'kasoa': 4000,
  'madina': 5500,
  'achimota': 6000,
  'dome': 6500,
  // Kumasi
  'asokwa': 6000,
  'ahodwo': 8000,
  'nhyiaeso': 7000,
};

// Average room sizes in sqm
const TYPICAL_ROOM_SIZES = {
  bedroom: 15,
  bathroom: 6,
  kitchen: 12,
  livingRoom: 25,
  diningRoom: 15,
};

export class DataEnrichmentService {
  private pool: Pool;
  private addressService: AddressStandardizationService;
  private geocodingService: GeocodingService;

  constructor(pool: Pool = dbPool) {
    this.pool = pool;
    this.addressService = new AddressStandardizationService();
    this.geocodingService = new GeocodingService();
  }

  /**
   * Enrich a single property
   */
  async enrich(
    propertyId: string,
    options: EnrichmentOptions = {}
  ): Promise<EnrichmentResult> {
    const client = await this.pool.connect();
    const enrichments: EnrichmentField[] = [];
    const errors: string[] = [];

    try {
      // Fetch property
      const result = await client.query(`
        SELECT 
          p.*,
          ST_Y(p.location::geometry) as latitude,
          ST_X(p.location::geometry) as longitude
        FROM properties p
        WHERE p.id = $1
      `, [propertyId]);

      if (result.rows.length === 0) {
        throw new Error(`Property ${propertyId} not found`);
      }

      const property = result.rows[0];

      // Address standardization
      if (options.standardizeAddress !== false) {
        try {
          const addressEnrichments = await this.enrichAddress(property);
          enrichments.push(...addressEnrichments);
        } catch (e: any) {
          errors.push(`Address standardization failed: ${e.message}`);
        }
      }

      // Geocoding
      if (options.geocode !== false && !property.latitude && property.address) {
        try {
          const geoEnrichments = await this.enrichGeocoding(property);
          enrichments.push(...geoEnrichments);
        } catch (e: any) {
          errors.push(`Geocoding failed: ${e.message}`);
        }
      }

      // Price per sqm calculation
      if (options.calculatePricePerSqm !== false) {
        const priceEnrichments = this.enrichPriceMetrics(property);
        enrichments.push(...priceEnrichments);
      }

      // Missing field inference
      if (options.inferMissingFields !== false) {
        const inferredEnrichments = this.inferMissingFields(property);
        enrichments.push(...inferredEnrichments);
      }

      // Neighborhood data
      if (options.addNeighborhoodData !== false) {
        const neighborhoodEnrichments = this.enrichNeighborhoodData(property);
        enrichments.push(...neighborhoodEnrichments);
      }

      // Apply enrichments to database
      if (enrichments.length > 0) {
        await this.applyEnrichments(client, propertyId, enrichments);
      }

      return {
        propertyId,
        enrichments,
        success: errors.length === 0,
        errors,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Batch enrich multiple properties
   */
  async enrichBatch(
    propertyIds: string[],
    options: EnrichmentOptions = {}
  ): Promise<EnrichmentResult[]> {
    const results: EnrichmentResult[] = [];

    for (const propertyId of propertyIds) {
      const result = await this.enrich(propertyId, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Process all properties needing enrichment
   */
  async processAll(options: {
    batchSize?: number;
    enrichmentOptions?: EnrichmentOptions;
  } = {}): Promise<{
    processed: number;
    enriched: number;
    errors: number;
  }> {
    const { batchSize = 50, enrichmentOptions = {} } = options;
    const stats = { processed: 0, enriched: 0, errors: 0 };

    const client = await this.pool.connect();

    try {
      // Find properties that need enrichment
      const needsEnrichment = await client.query(`
        SELECT id FROM properties 
        WHERE enrichment_status IS NULL 
           OR enrichment_status = 'pending'
           OR enrichment_status = 'partial'
        ORDER BY created_at DESC
        LIMIT $1
      `, [batchSize]);

      for (const row of needsEnrichment.rows) {
        try {
          const result = await this.enrich(row.id, enrichmentOptions);
          
          if (result.success && result.enrichments.length > 0) {
            stats.enriched++;
          }
          
          // Update enrichment status
          await client.query(`
            UPDATE properties 
            SET enrichment_status = $1,
                enriched_at = NOW()
            WHERE id = $2
          `, [result.success ? 'completed' : 'partial', row.id]);
          
        } catch (e) {
          stats.errors++;
        }
        stats.processed++;
      }

      return stats;
    } finally {
      client.release();
    }
  }

  /**
   * Standardize and enrich address fields
   */
  private async enrichAddress(property: any): Promise<EnrichmentField[]> {
    const enrichments: EnrichmentField[] = [];
    
    const rawAddress = [
      property.address,
      property.neighborhood,
      property.city,
      property.region
    ].filter(Boolean).join(', ');

    if (!rawAddress) return enrichments;

    const standardized = await this.addressService.standardize(rawAddress);
    const { components } = standardized;

    if (components.city && components.city !== property.city) {
      enrichments.push({
        field: 'city',
        originalValue: property.city,
        enrichedValue: components.city,
        source: 'address_standardization',
        confidence: standardized.confidence,
      });
    }

    if (components.region && components.region !== property.region) {
      enrichments.push({
        field: 'region',
        originalValue: property.region,
        enrichedValue: components.region,
        source: 'address_standardization',
        confidence: standardized.confidence,
      });
    }

    if (components.neighborhood && components.neighborhood !== property.neighborhood) {
      enrichments.push({
        field: 'neighborhood',
        originalValue: property.neighborhood,
        enrichedValue: components.neighborhood,
        source: 'address_standardization',
        confidence: standardized.confidence,
      });
    }

    if (components.streetName && components.streetName !== property.street) {
      enrichments.push({
        field: 'street',
        originalValue: property.street,
        enrichedValue: components.streetName,
        source: 'address_standardization',
        confidence: standardized.confidence,
      });
    }

    return enrichments;
  }

  /**
   * Add geocoding coordinates
   */
  private async enrichGeocoding(property: any): Promise<EnrichmentField[]> {
    const enrichments: EnrichmentField[] = [];
    
    const address = [
      property.address,
      property.neighborhood,
      property.city,
      property.region,
      'Ghana'
    ].filter(Boolean).join(', ');

    const coords = await this.geocodingService.geocode(address);

    if (coords) {
      enrichments.push({
        field: 'latitude',
        originalValue: property.latitude,
        enrichedValue: coords.latitude,
        source: 'geocoding_api',
        confidence: coords.confidence || 0.8,
      });

      enrichments.push({
        field: 'longitude',
        originalValue: property.longitude,
        enrichedValue: coords.longitude,
        source: 'geocoding_api',
        confidence: coords.confidence || 0.8,
      });
    }

    return enrichments;
  }

  /**
   * Calculate price per sqm and related metrics
   */
  private enrichPriceMetrics(property: any): EnrichmentField[] {
    const enrichments: EnrichmentField[] = [];
    
    const price = property.price_usd || property.price;
    const size = property.building_size_sqm || property.land_size_sqm;

    if (price && size && !property.price_per_sqm) {
      const pricePerSqm = price / size;
      
      enrichments.push({
        field: 'price_per_sqm',
        originalValue: property.price_per_sqm,
        enrichedValue: Math.round(pricePerSqm * 100) / 100,
        source: 'calculation',
        confidence: 1.0,
      });
    }

    // Calculate USD price if only GHS is available
    if (property.currency === 'GHS' && property.price && !property.price_usd) {
      // Current approximate exchange rate
      const exchangeRate = 12.5;
      const priceUsd = property.price / exchangeRate;
      
      enrichments.push({
        field: 'price_usd',
        originalValue: property.price_usd,
        enrichedValue: Math.round(priceUsd * 100) / 100,
        source: 'currency_conversion',
        confidence: 0.9,
      });
    }

    return enrichments;
  }

  /**
   * Infer missing fields from available data
   */
  private inferMissingFields(property: any): EnrichmentField[] {
    const enrichments: EnrichmentField[] = [];
    
    // Infer city tier
    if (property.city && !property.city_tier) {
      const cityLower = property.city.toLowerCase();
      const population = CITY_POPULATIONS[cityLower];
      
      let tier: number;
      if (population && population > 1000000) {
        tier = 1;
      } else if (population && population > 300000) {
        tier = 2;
      } else if (population && population > 100000) {
        tier = 3;
      } else {
        tier = 4;
      }

      enrichments.push({
        field: 'city_tier',
        originalValue: property.city_tier,
        enrichedValue: tier,
        source: 'inference',
        confidence: 0.85,
      });
    }

    // Estimate building size from bedrooms if missing
    if (property.bedrooms && !property.building_size_sqm) {
      const estimated = 
        property.bedrooms * TYPICAL_ROOM_SIZES.bedroom +
        (property.bathrooms || property.bedrooms) * TYPICAL_ROOM_SIZES.bathroom +
        TYPICAL_ROOM_SIZES.livingRoom +
        TYPICAL_ROOM_SIZES.kitchen;

      enrichments.push({
        field: 'estimated_size_sqm',
        originalValue: null,
        enrichedValue: estimated,
        source: 'inference_from_rooms',
        confidence: 0.5,
      });
    }

    // Infer listing type from keywords in title/description
    if (!property.listing_type) {
      const text = `${property.title || ''} ${property.description || ''}`.toLowerCase();
      
      let listingType: string | null = null;
      let confidence = 0.7;

      if (text.includes('for rent') || text.includes('to let') || text.includes('monthly')) {
        listingType = 'rent';
        confidence = 0.9;
      } else if (text.includes('for sale') || text.includes('selling')) {
        listingType = 'sale';
        confidence = 0.9;
      }

      if (listingType) {
        enrichments.push({
          field: 'listing_type',
          originalValue: property.listing_type,
          enrichedValue: listingType,
          source: 'text_inference',
          confidence,
        });
      }
    }

    // Infer property type from keywords
    if (!property.property_type) {
      const text = `${property.title || ''} ${property.description || ''}`.toLowerCase();
      
      let propertyType: string | null = null;
      let confidence = 0.7;

      if (text.includes('apartment') || text.includes('flat')) {
        propertyType = 'apartment';
      } else if (text.includes('house') || text.includes('bungalow') || text.includes('villa')) {
        propertyType = 'house';
      } else if (text.includes('land') || text.includes('plot') || text.includes('acre')) {
        propertyType = 'land';
      } else if (text.includes('office') || text.includes('shop') || text.includes('warehouse')) {
        propertyType = 'commercial';
      }

      if (propertyType) {
        enrichments.push({
          field: 'property_type',
          originalValue: property.property_type,
          enrichedValue: propertyType,
          source: 'text_inference',
          confidence,
        });
      }
    }

    return enrichments;
  }

  /**
   * Add neighborhood-specific data
   */
  private enrichNeighborhoodData(property: any): EnrichmentField[] {
    const enrichments: EnrichmentField[] = [];
    
    const neighborhood = (property.neighborhood || '').toLowerCase();
    
    if (neighborhood && NEIGHBORHOOD_PRICES[neighborhood]) {
      const avgPrice = NEIGHBORHOOD_PRICES[neighborhood];
      
      enrichments.push({
        field: 'neighborhood_avg_price_sqm',
        originalValue: null,
        enrichedValue: avgPrice,
        source: 'market_data',
        confidence: 0.8,
      });

      // Calculate price relative to neighborhood average
      if (property.price_per_sqm) {
        const priceIndex = property.price_per_sqm / avgPrice;
        
        enrichments.push({
          field: 'price_index',
          originalValue: null,
          enrichedValue: Math.round(priceIndex * 100) / 100,
          source: 'calculation',
          confidence: 0.8,
        });
      }
    }

    return enrichments;
  }

  /**
   * Apply enrichments to database
   */
  private async applyEnrichments(
    client: any,
    propertyId: string,
    enrichments: EnrichmentField[]
  ): Promise<void> {
    // Build update query for high-confidence enrichments
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const enrichment of enrichments) {
      // Only apply enrichments with confidence > 0.6
      if (enrichment.confidence < 0.6) continue;
      
      // Skip calculated/derived fields
      if (['neighborhood_avg_price_sqm', 'price_index', 'estimated_size_sqm'].includes(enrichment.field)) {
        continue;
      }

      // Add to update list
      updates.push(`${enrichment.field} = $${paramIndex}`);
      values.push(enrichment.enrichedValue);
      paramIndex++;
    }

    if (updates.length > 0) {
      values.push(propertyId);
      
      await client.query(`
        UPDATE properties 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
      `, values);
    }

    // Store all enrichments in enrichment_log
    await client.query(`
      INSERT INTO property_enrichment_log (
        property_id, enrichments, created_at
      )
      VALUES ($1, $2, NOW())
    `, [propertyId, JSON.stringify(enrichments)]);
  }
}

// Export singleton instance
export const dataEnrichmentService = new DataEnrichmentService();
