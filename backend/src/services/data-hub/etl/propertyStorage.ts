/**
 * Property Storage Service
 * 
 * Handles storing scraped property data into the properties table.
 * Performs upsert (insert or update) based on source_slug + external_id.
 */

import { Pool } from 'pg';
import { pool as dbPool, query } from '../../../database';
import { logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { ghanaPostService } from '../ghanaPostGeocodingService';

export interface RawPropertyData {
  // Source identification
  source_slug: string;
  source_id: string;
  source_url?: string;
  
  // Basic info
  title?: string;
  description?: string;
  
  // Location
  location?: string;
  region?: string;
  city?: string;
  neighborhood?: string;
  address?: string;
  digital_address?: string;
  ghana_post_gps?: string;
  landmark?: string;
  nearby_landmarks?: string[];
  street_name?: string;
  latitude?: number | string;
  longitude?: number | string;
  coordinates_source?: string;
  geocoding_confidence?: number | string;
  
  // Property details
  property_type?: string;
  listing_type?: string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  toilets?: number | string;
  floors?: number | string;
  parking_spaces?: number | string;
  
  // Size - can be string from scraped data (e.g., "286.0")
  total_area_sqm?: number | string;
  land_area_sqm?: number | string;
  building_size_sqm?: number | string;
  plot_size_acres?: number | string;
  
  // Price - can be string from scraped data (e.g., "295000")
  price?: number | string;
  currency?: string;
  price_negotiable?: boolean;
  
  // Agent/Contact
  agent_name?: string;
  agent_phone?: string;
  agent_email?: string;
  
  // Media
  images?: string[];
  video_url?: string;
  
  // Features
  features?: string[] | Record<string, any>;
  amenities?: string[] | Record<string, any>;
  
  // Dates
  date_scraped?: string;
  date_listed?: string;
  
  // Raw data for reference
  raw_data?: Record<string, any>;
}

export interface PropertyStorageResult {
  success: boolean;
  propertyId?: string;
  action: 'created' | 'updated' | 'skipped';
  error?: string;
}

/**
 * Normalize property type to match database enum
 * Database enum values: residential_house, apartment_flat, commercial_shop, 
 * commercial_office, warehouse, land, industrial, mixed_use
 */
function normalizePropertyType(type?: string): string | null {
  if (!type) return null;
  
  const normalized = type.toLowerCase().trim();
  
  // Map common variations to database enum values
  const mappings: Record<string, string> = {
    // Residential house variations
    'house': 'residential_house',
    'home': 'residential_house',
    'villa': 'residential_house',
    'bungalow': 'residential_house',
    'townhouse': 'residential_house',
    'town house': 'residential_house',
    'detached': 'residential_house',
    'semi-detached': 'residential_house',
    'duplex': 'residential_house',
    'mansion': 'residential_house',
    'residential': 'residential_house',
    // Apartment variations
    'apartment': 'apartment_flat',
    'flat': 'apartment_flat',
    'studio': 'apartment_flat',
    'penthouse': 'apartment_flat',
    'condo': 'apartment_flat',
    'condominium': 'apartment_flat',
    'self-contained': 'apartment_flat',
    'self contained': 'apartment_flat',
    'bedsitter': 'apartment_flat',
    // Land
    'land': 'land',
    'plot': 'land',
    'plots': 'land',
    'acre': 'land',
    // Commercial
    'commercial': 'commercial_shop',
    'shop': 'commercial_shop',
    'store': 'commercial_shop',
    'retail': 'commercial_shop',
    'office': 'commercial_office',
    // Industrial/Warehouse
    'warehouse': 'warehouse',
    'industrial': 'industrial',
    'factory': 'industrial',
    // Mixed use
    'mixed': 'mixed_use',
  };
  
  for (const [key, value] of Object.entries(mappings)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  // Default to residential_house for unknown types
  return 'residential_house';
}

/**
 * Normalize transaction/listing type
 * Database enum values: sale, rental, lease
 */
function normalizeTransactionType(type?: string): string {
  if (!type) return 'sale';
  
  const normalized = type.toLowerCase().trim();
  
  if (normalized.includes('rent')) {
    return 'rental';
  }
  if (normalized.includes('lease')) {
    return 'lease';
  }
  if (normalized.includes('sale') || normalized.includes('sell') || normalized.includes('buy')) {
    return 'sale';
  }
  if (normalized.includes('short') && normalized.includes('let')) {
    return 'rental'; // Short let is a type of rental
  }
  
  return 'sale';
}

/**
 * Normalize region to match database enum
 * Database enum values: greater_accra, kumasi_metro, eastern, western_cluster, northern_cluster
 */
function normalizeRegion(region?: string, city?: string): string {
  const input = (region || city || '').toLowerCase().trim();
  
  const mappings: Record<string, string> = {
    // Greater Accra
    'greater accra': 'greater_accra',
    'accra': 'greater_accra',
    'tema': 'greater_accra',
    'east legon': 'greater_accra',
    'spintex': 'greater_accra',
    'airport': 'greater_accra',
    'cantonments': 'greater_accra',
    'osu': 'greater_accra',
    'labone': 'greater_accra',
    'adenta': 'greater_accra',
    'madina': 'greater_accra',
    'kasoa': 'greater_accra',
    // Kumasi Metro
    'ashanti': 'kumasi_metro',
    'kumasi': 'kumasi_metro',
    // Eastern region
    'eastern': 'eastern',
    'koforidua': 'eastern',
    // Western cluster
    'western': 'western_cluster',
    'takoradi': 'western_cluster',
    'sekondi': 'western_cluster',
    'central': 'western_cluster',
    'cape coast': 'western_cluster',
    // Northern cluster
    'northern': 'northern_cluster',
    'tamale': 'northern_cluster',
    'upper east': 'northern_cluster',
    'upper west': 'northern_cluster',
    'volta': 'northern_cluster',
    'brong ahafo': 'northern_cluster',
    'bono': 'northern_cluster',
  };
  
  for (const [key, value] of Object.entries(mappings)) {
    if (input.includes(key)) {
      return value;
    }
  }
  
  return 'greater_accra'; // Default
}

/**
 * Normalize currency
 */
function normalizeCurrency(currency?: string): string {
  if (!currency) return 'GHS';
  
  const upper = currency.toUpperCase().trim();
  
  if (upper.includes('USD') || upper.includes('$') || upper === 'DOLLAR') {
    return 'USD';
  }
  if (upper.includes('GHS') || upper.includes('GHC') || upper.includes('CEDI') || upper.includes('₵')) {
    return 'GHS';
  }
  if (upper.includes('EUR') || upper.includes('€')) {
    return 'EUR';
  }
  if (upper.includes('GBP') || upper.includes('£')) {
    return 'GBP';
  }
  
  return 'GHS';
}

/**
 * Parse a numeric value from string or number
 */
function parseNumeric(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Generate a unique reference number for a property
 * Format: PM-{REGION_CODE}-{YYYYMMDD}-{RANDOM}
 */
function generateReferenceNumber(region: string): string {
  const regionCodes: Record<string, string> = {
    'greater_accra': 'GA',
    'kumasi_metro': 'KM',
    'eastern': 'ER',
    'western_cluster': 'WC',
    'northern_cluster': 'NC',
  };
  const code = regionCodes[region] || 'XX';
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PM-${code}-${dateStr}-${random}`;
}

/**
 * Apply small deterministic offset to coordinates for neighborhood/city geocoded properties
 * This spreads properties visually on the map while keeping the offset consistent for the same property
 * 
 * @param lat - Original latitude
 * @param lng - Original longitude  
 * @param sourceId - Unique identifier for the property (used for deterministic offset)
 * @param coordinatesSource - How the coordinates were obtained
 * @returns Object with offset latitude and longitude
 */
function applyCoordinateOffset(
  lat: number,
  lng: number,
  sourceId: string,
  coordinatesSource?: string
): { latitude: number; longitude: number } {
  // Only apply offset for neighborhood or city-level geocoding
  if (!coordinatesSource || !['neighborhood', 'city'].includes(coordinatesSource)) {
    return { latitude: lat, longitude: lng };
  }

  // Create deterministic hash from sourceId to get consistent offset
  const hash = createHash('md5').update(sourceId).digest('hex');
  
  // Use first 8 chars of hash to generate offset values
  // Convert hex to number between 0 and 1
  const latOffset = (parseInt(hash.substring(0, 4), 16) / 0xFFFF) - 0.5; // -0.5 to 0.5
  const lngOffset = (parseInt(hash.substring(4, 8), 16) / 0xFFFF) - 0.5; // -0.5 to 0.5
  
  // Max offset: ~500m for neighborhood, ~1km for city
  // 1 degree lat ≈ 111km, so 0.005 degrees ≈ 555m
  const maxOffset = coordinatesSource === 'neighborhood' ? 0.004 : 0.008;
  
  return {
    latitude: lat + (latOffset * maxOffset),
    longitude: lng + (lngOffset * maxOffset),
  };
}

export class PropertyStorageService {
  private pool: Pool;

  constructor(pool: Pool = dbPool) {
    this.pool = pool;
  }

  /**
   * Store or update a property from scraped data
   */
  async storeProperty(rawData: RawPropertyData): Promise<PropertyStorageResult> {
    const client = await this.pool.connect();
    
    try {
      // Check if property already exists
      const existingResult = await client.query(`
        SELECT id, updated_at FROM properties 
        WHERE source_slug = $1 AND external_id = $2
        LIMIT 1
      `, [rawData.source_slug, rawData.source_id]);

      const existingProperty = existingResult.rows[0];
      
      // Prepare normalized data
      const propertyType = normalizePropertyType(rawData.property_type);
      const transactionType = normalizeTransactionType(rawData.listing_type);
      const region = normalizeRegion(rawData.region, rawData.city);
      const currency = normalizeCurrency(rawData.currency);
      
      // Parse numeric fields (scraped data may have strings like "295000" or "286.0")
      const price = parseNumeric(rawData.price);
      const bedrooms = parseNumeric(rawData.bedrooms);
      const bathrooms = parseNumeric(rawData.bathrooms);
      const floors = parseNumeric(rawData.floors);
      const totalAreaSqm = parseNumeric(rawData.total_area_sqm);
      const landAreaSqm = parseNumeric(rawData.land_area_sqm);
      const buildingSizeSqm = parseNumeric(rawData.building_size_sqm);
      let latitude = parseNumeric(rawData.latitude);
      let longitude = parseNumeric(rawData.longitude);
      const geocodingConfidence = parseNumeric(rawData.geocoding_confidence);
      
      // Apply coordinate offset for neighborhood/city geocoded properties
      // This spreads properties visually on the map while keeping offset consistent
      if (latitude && longitude && rawData.coordinates_source) {
        const sourceId = `${rawData.source_slug}-${rawData.source_id}`;
        const offsetCoords = applyCoordinateOffset(latitude, longitude, sourceId, rawData.coordinates_source);
        latitude = offsetCoords.latitude;
        longitude = offsetCoords.longitude;
      }
      
      // Use digital_address or ghana_post_gps - if not available, reverse geocode from coordinates
      let digitalAddress = rawData.digital_address || rawData.ghana_post_gps || null;
      
      // If we have coordinates but no digital address, try to reverse geocode
      if (!digitalAddress && latitude && longitude) {
        try {
          logger.debug(`Reverse geocoding coordinates (${latitude}, ${longitude}) for ${rawData.source_slug}:${rawData.source_id}`);
          const reverseResult = await ghanaPostService.reverseGeocode(latitude, longitude);
          if (reverseResult && reverseResult.digitalAddress) {
            digitalAddress = reverseResult.digitalAddress;
            logger.info(`Obtained digital address ${digitalAddress} via reverse geocoding for ${rawData.source_slug}:${rawData.source_id}`);
          }
        } catch (error) {
          logger.warn(`Reverse geocoding failed for ${rawData.source_slug}:${rawData.source_id}:`, error);
          // Continue without digital address - it's optional
        }
      }
      
      // Prepare images array
      const imageUrls = rawData.images && rawData.images.length > 0 
        ? JSON.stringify(rawData.images) 
        : null;
      
      // Primary image
      const primaryImageUrl = rawData.images && rawData.images.length > 0 
        ? rawData.images[0] 
        : null;
      
      // Prepare features/amenities as JSONB
      const features = rawData.features 
        ? JSON.stringify(Array.isArray(rawData.features) ? { items: rawData.features } : rawData.features)
        : null;
      const amenities = rawData.amenities
        ? JSON.stringify(Array.isArray(rawData.amenities) ? { items: rawData.amenities } : rawData.amenities)
        : null;
      
      // Agent metadata
      const metadata = JSON.stringify({
        agent_name: rawData.agent_name,
        agent_phone: rawData.agent_phone,
        agent_email: rawData.agent_email,
        source_url: rawData.source_url,
        date_scraped: rawData.date_scraped || new Date().toISOString(),
        date_listed: rawData.date_listed,
        raw_data: rawData.raw_data,
      });
      
      // Nearby landmarks as array
      const nearbyLandmarks = rawData.nearby_landmarks && rawData.nearby_landmarks.length > 0
        ? rawData.nearby_landmarks
        : null;

      if (existingProperty) {
        // UPDATE existing property
        await client.query(`
          UPDATE properties SET
            title = COALESCE($1, title),
            description = COALESCE($2, description),
            region = $3,
            address_city = COALESCE($4, address_city),
            address_district = COALESCE($5, address_district),
            address_street = COALESCE($6, address_street),
            digital_address = COALESCE($7, digital_address),
            landmark = COALESCE($8, landmark),
            nearby_landmarks = COALESCE($9, nearby_landmarks),
            street_name = COALESCE($10, street_name),
            latitude = COALESCE($11, latitude),
            longitude = COALESCE($12, longitude),
            coordinates_source = COALESCE($13, coordinates_source),
            geocoding_confidence = COALESCE($14, geocoding_confidence),
            property_type = COALESCE($15, property_type),
            transaction_type = COALESCE($16, transaction_type),
            bedrooms = COALESCE($17, bedrooms),
            bathrooms = COALESCE($18, bathrooms),
            floors = COALESCE($19, floors),
            total_area_sqm = COALESCE($20, total_area_sqm),
            land_area_sqm = COALESCE($21, land_area_sqm),
            building_size_sqm = COALESCE($22, building_size_sqm),
            price = COALESCE($23, price),
            price_currency = $24,
            is_negotiable = COALESCE($25, is_negotiable),
            primary_image_url = COALESCE($26, primary_image_url),
            image_urls = COALESCE($27::jsonb, image_urls),
            video_url = COALESCE($28, video_url),
            features = COALESCE($29::jsonb, features),
            amenities = COALESCE($30::jsonb, amenities),
            metadata = COALESCE($31::jsonb, metadata),
            updated_at = NOW()
          WHERE id = $32
        `, [
          rawData.title,
          rawData.description,
          region,
          rawData.city,
          rawData.neighborhood,
          rawData.address,
          digitalAddress,
          rawData.landmark,
          nearbyLandmarks,
          rawData.street_name,
          latitude,
          longitude,
          rawData.coordinates_source,
          geocodingConfidence,
          propertyType,
          transactionType,
          bedrooms,
          bathrooms,
          floors,
          totalAreaSqm,
          landAreaSqm,
          buildingSizeSqm,
          price,
          currency,
          rawData.price_negotiable,
          primaryImageUrl,
          imageUrls,
          rawData.video_url,
          features,
          amenities,
          metadata,
          existingProperty.id,
        ]);

        logger.debug(`Updated property ${existingProperty.id} from ${rawData.source_slug}:${rawData.source_id}`);
        
        return {
          success: true,
          propertyId: existingProperty.id,
          action: 'updated',
        };
      } else {
        // INSERT new property
        const newId = uuidv4();
        const referenceNumber = generateReferenceNumber(region);
        
        await client.query(`
          INSERT INTO properties (
            id, reference_number, source_slug, external_id, external_source,
            title, description, region, address_city, address_district, address_street,
            digital_address, landmark, nearby_landmarks, street_name,
            latitude, longitude, coordinates_source, geocoding_confidence,
            property_type, transaction_type,
            bedrooms, bathrooms, floors,
            total_area_sqm, land_area_sqm, building_size_sqm,
            price, price_currency, is_negotiable,
            primary_image_url, image_urls, video_url,
            features, amenities, metadata,
            data_source, status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21,
            $22, $23, $24,
            $25, $26, $27,
            $28, $29, $30,
            $31, $32::jsonb, $33,
            $34::jsonb, $35::jsonb, $36::jsonb,
            'tier5_web', 'active', NOW(), NOW()
          )
        `, [
          newId,
          referenceNumber,
          rawData.source_slug,
          rawData.source_id,
          rawData.source_slug,
          rawData.title || 'Untitled Property',
          rawData.description,
          region,
          rawData.city || 'Unknown',
          rawData.neighborhood,
          rawData.address,
          digitalAddress,
          rawData.landmark,
          nearbyLandmarks,
          rawData.street_name,
          latitude,
          longitude,
          rawData.coordinates_source,
          geocodingConfidence,
          propertyType,
          transactionType,
          bedrooms,
          bathrooms,
          floors,
          totalAreaSqm,
          landAreaSqm,
          buildingSizeSqm,
          price || 0, // price is NOT NULL
          currency,
          rawData.price_negotiable,
          primaryImageUrl,
          imageUrls,
          rawData.video_url,
          features,
          amenities,
          metadata,
        ]);

        logger.info(`Created new property ${newId} (${referenceNumber}) from ${rawData.source_slug}:${rawData.source_id}`);
        
        return {
          success: true,
          propertyId: newId,
          action: 'created',
        };
      }
    } catch (error: any) {
      logger.error(`Failed to store property ${rawData.source_slug}:${rawData.source_id}`, { error: error.message });
      return {
        success: false,
        action: 'skipped',
        error: error.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Batch store multiple properties
   */
  async storeProperties(properties: RawPropertyData[]): Promise<{
    created: number;
    updated: number;
    failed: number;
    errors: string[];
  }> {
    const stats = { created: 0, updated: 0, failed: 0, errors: [] as string[] };

    for (const property of properties) {
      const result = await this.storeProperty(property);
      
      if (result.success) {
        if (result.action === 'created') stats.created++;
        else if (result.action === 'updated') stats.updated++;
      } else {
        stats.failed++;
        if (result.error) {
          stats.errors.push(`${property.source_slug}:${property.source_id}: ${result.error}`);
        }
      }
    }

    return stats;
  }
}

// Export singleton instance
export const propertyStorageService = new PropertyStorageService();
