/**
 * Property Data Mapper
 * 
 * Converts between different property data formats in the system:
 * - Database property records → PropertyFeatures (for LLM)
 * - ComprehensivePropertyData (frontend) → PropertyFeatures (backend)
 * - Valuation data → PropertyFeatures
 * 
 * This ensures unified architecture between:
 * - User input (ComprehensivePropertyForm)
 * - Database storage (properties table)
 * - LLM design intent generation (PropertyFeatures)
 * - Blender geometry generation
 * - Fabric.js rendering
 * 
 * @module utils/propertyMapper
 * @version 1.0.0
 * @since 2026-01-14
 */

import type {
  PropertyFeatures,
  PropertyType,
  ConstructionType,
  LayoutStyle,
  UserLayoutPreferences,
} from '../types/floorPlanDesign';

// ============================================================================
// DATABASE PROPERTY RECORD TYPE
// ============================================================================

/**
 * Property record as stored in the database (properties table)
 * Matches the columns from ComprehensivePropertyData on frontend
 */
export interface DatabasePropertyRecord {
  id: string;
  // Basic Information
  address?: string;
  address_street?: string;
  address_city?: string;
  address_district?: string;
  region?: string;
  digital_address?: string;
  property_type?: string;
  
  // Physical Characteristics (actual database columns)
  total_area_sqm?: number;      // Primary area column in DB
  built_area_sqm?: number;      // Built/GFA area
  land_area_sqm?: number;       // Land/plot area
  plot_size_acres?: number;     // Plot size in acres
  
  // Legacy/fallback fields (for backward compatibility)
  gfa?: number;
  gfa_sqm?: number;
  building_area_sqm?: number;
  plot_size?: number;
  
  year_built?: number;
  age?: number;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  total_floors?: number;
  floor_number?: number;
  parking_spaces?: number;
  
  // Quality & Condition (from ComprehensivePropertyData)
  quality_rating?: string;
  condition?: string;
  
  // Construction
  construction_type?: string;
  wall_material?: string;
  roof_type?: string;
  
  // Lot dimensions (if available)
  lot_width_m?: number;
  lot_depth_m?: number;
  frontage_m?: number;
  
  // Setbacks
  front_setback_m?: number;
  rear_setback_m?: number;
  side_setback_m?: number;
  
  // Amenities (boolean flags from ComprehensivePropertyData)
  has_pool?: boolean;
  has_garden?: boolean;
  has_security?: boolean;
  has_elevator?: boolean;
  has_balcony?: boolean;
  has_terrace?: boolean;
  has_gym?: boolean;
  has_generator?: boolean;
  has_solar?: boolean;
  has_borehole?: boolean;
  
  // Location Quality
  view_quality?: string;
  neighborhood_rating?: string;
  accessibility_rating?: string;
  
  // Tenure
  tenure_type?: string;
  lease_years_remaining?: number;
  
  // Coordinates
  latitude?: number;
  longitude?: number;
}

/**
 * Valuation record joined with property data
 */
export interface ValuationWithProperty extends DatabasePropertyRecord {
  valuation_id: string;
  property_id: string;
  valuation_type?: string;
  valuation_purpose?: string;
  valuation_date?: string;
  status?: string;
}

// ============================================================================
// PROPERTY TYPE MAPPING
// ============================================================================

/**
 * Map frontend/database property types to LLM PropertyType
 * Frontend uses comprehensiveProperty.ts PROPERTY_TYPES values
 */
const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  // Residential
  'house': 'single_family',
  'detached_house': 'single_family',
  'single_family': 'single_family',
  'semi_detached': 'multi_family',
  'semi-detached': 'multi_family',
  'townhouse': 'townhouse',
  'apartment': 'apartment',
  'flat': 'apartment',
  'condo': 'apartment',
  'condominium': 'apartment',
  'villa': 'single_family',
  'bungalow': 'single_family',
  'duplex': 'multi_family',
  'compound': 'compound',
  
  // Commercial
  'commercial': 'commercial',
  'office': 'commercial',
  'retail': 'commercial',
  'shop': 'commercial',
  
  // Industrial
  'industrial': 'industrial',
  'warehouse': 'industrial',
  'factory': 'industrial',
  
  // Mixed/Other
  'mixed_use': 'mixed_use',
  'mixed': 'mixed_use',
  'land': 'single_family', // Default for land valuations
  'vacant_land': 'single_family',
};

/**
 * Map construction types from database to LLM ConstructionType
 */
const CONSTRUCTION_TYPE_MAP: Record<string, ConstructionType> = {
  'concrete_block': 'concrete_block',
  'sandcrete': 'sandcrete_block',
  'sandcrete_block': 'sandcrete_block',
  'burnt_brick': 'burnt_brick',
  'mud_brick': 'mud_brick',
  'adobe': 'mud_brick',
  'timber': 'timber_frame',
  'timber_frame': 'timber_frame',
  'wood': 'timber_frame',
  'steel': 'steel_frame',
  'steel_frame': 'steel_frame',
  'reinforced_concrete': 'reinforced_concrete',
  'rc_frame': 'reinforced_concrete',
  'prefab': 'prefabricated',
  'prefabricated': 'prefabricated',
  'modular': 'prefabricated',
};

/**
 * Infer layout style from property type and quality
 */
function inferLayoutStyle(
  propertyType: PropertyType,
  qualityRating?: string,
  yearBuilt?: number
): LayoutStyle {
  // Modern for newer properties (after 2010)
  if (yearBuilt && yearBuilt >= 2010) {
    return 'modern';
  }
  
  // Apartments get apartment style
  if (propertyType === 'apartment') {
    return 'apartment';
  }
  
  // Compounds get compound style
  if (propertyType === 'compound') {
    return 'compound';
  }
  
  // Luxury/high quality tends to be modern
  if (qualityRating === 'luxury' || qualityRating === 'high') {
    return 'modern';
  }
  
  // Single-floor properties
  if (propertyType === 'single_family') {
    return 'bungalow';
  }
  
  // Default to colonial for typical Ghanaian residential
  return 'colonial';
}

// ============================================================================
// MAPPER FUNCTIONS
// ============================================================================

/**
 * Helper to safely convert a value to number
 * PostgreSQL returns numeric types as strings, so we need to parse them
 */
function toNumber(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Map database property record to PropertyFeatures for LLM design intent
 * 
 * @param record - Database property record (from properties table or valuation join)
 * @param overrides - Optional overrides for specific fields
 * @returns PropertyFeatures compatible with LLM design intent service
 */
export function mapPropertyToFeatures(
  record: DatabasePropertyRecord | ValuationWithProperty,
  overrides?: Partial<PropertyFeatures>
): PropertyFeatures {
  // Get total area - try multiple sources (matching actual database columns)
  // PostgreSQL returns numeric types as strings, so we parse them
  const totalAreaSqm = 
    toNumber(record.total_area_sqm) || 
    toNumber(record.built_area_sqm) || 
    toNumber(record.land_area_sqm) || 
    toNumber(record.gfa_sqm) || 
    toNumber(record.gfa) || 
    toNumber(record.building_area_sqm) || 
    toNumber(record.plot_size) || 
    100; // Fallback for minimum floor plan

  // Map property type
  const propertyType = PROPERTY_TYPE_MAP[record.property_type?.toLowerCase() ?? ''] 
    ?? 'single_family';

  // Map construction type
  const constructionType = record.construction_type 
    ? CONSTRUCTION_TYPE_MAP[record.construction_type.toLowerCase()] ?? 'concrete_block'
    : undefined;

  // Get floor count (also parse in case of string from DB)
  const floors = toNumber(record.floors) || toNumber(record.total_floors) || 1;

  // Parse numeric values for lot dimensions
  const lotWidthM = toNumber(record.lot_width_m);
  const lotDepthM = toNumber(record.lot_depth_m);
  const frontageM = toNumber(record.frontage_m);
  const landAreaSqm = toNumber(record.land_area_sqm);

  // Build lot dimensions if available
  const lotDimensions = (lotWidthM > 0 && lotDepthM > 0)
    ? { width_m: lotWidthM, depth_m: lotDepthM }
    : (frontageM > 0 && landAreaSqm > 0)
      ? { width_m: frontageM, depth_m: landAreaSqm / frontageM }
      : undefined;

  // Build setbacks if available
  const setbacks = (record.front_setback_m || record.rear_setback_m || record.side_setback_m)
    ? {
        front_m: toNumber(record.front_setback_m, 3.0),
        rear_m: toNumber(record.rear_setback_m, 3.0),
        side_m: toNumber(record.side_setback_m, 1.5),
      }
    : undefined;

  // Parse bedroom and bathroom counts
  const bedrooms = toNumber(record.bedrooms, 3);
  const bathrooms = toNumber(record.bathrooms, 2);

  // Infer user preferences from property data
  const userPreferences: UserLayoutPreferences = {
    preferred_style: inferLayoutStyle(propertyType, record.quality_rating, toNumber(record.year_built)),
    open_plan_kitchen: record.quality_rating === 'luxury' || record.quality_rating === 'high',
    master_ensuite: bathrooms >= 2,
    separate_dining: totalAreaSqm >= 100,
    garage_spaces: toNumber(record.parking_spaces, 0),
    outdoor_living: record.has_garden ?? record.has_terrace ?? record.has_balcony ?? false,
    home_office: totalAreaSqm >= 120 && bedrooms >= 3,
  };

  // Build PropertyFeatures object
  const features: PropertyFeatures = {
    bedrooms,
    bathrooms,
    total_area_sqm: totalAreaSqm,
    property_type: propertyType,
    floors,
    year_built: toNumber(record.year_built) || undefined,
    construction_type: constructionType,
    lot_dimensions: lotDimensions,
    setbacks,
    user_preferences: userPreferences,
    ...overrides,
  };

  return features;
}

/**
 * Fetch property features from valuation ID
 * Queries the database to get property data linked to a valuation
 * 
 * @param valuationId - UUID of the valuation
 * @param pool - Database pool instance
 * @returns PropertyFeatures or null if not found
 */
export async function fetchPropertyFeaturesFromValuation(
  valuationId: string,
  queryFn: (sql: string, params: any[]) => Promise<{ rows: any[] }>
): Promise<PropertyFeatures | null> {
  const result = await queryFn(
    `SELECT 
      v.id as valuation_id,
      p.id as property_id,
      p.property_type,
      p.bedrooms,
      p.bathrooms,
      p.total_area_sqm,
      p.built_area_sqm,
      p.land_area_sqm,
      p.plot_size_acres,
      p.year_built,
      p.floors,
      p.condition,
      p.features,
      p.amenities,
      p.region,
      p.address_city,
      p.latitude,
      p.longitude
    FROM valuations v
    JOIN properties p ON v.property_id = p.id
    WHERE v.id = $1`,
    [valuationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapPropertyToFeatures(result.rows[0] as ValuationWithProperty);
}

/**
 * Convert ComprehensivePropertyData (frontend format) to PropertyFeatures
 * Used when frontend sends property data directly (e.g., new valuation flow)
 * 
 * @param data - Frontend ComprehensivePropertyData object
 * @returns PropertyFeatures for LLM service
 */
export function mapComprehensivePropertyToFeatures(data: {
  property_type?: string;
  gfa?: number;
  bedrooms?: number;
  bathrooms?: number;
  total_floors?: number;
  year_built?: number;
  quality_rating?: string;
  condition?: string;
  has_pool?: boolean;
  has_garden?: boolean;
  has_balcony?: boolean;
  has_terrace?: boolean;
  parking_spaces?: number;
  plot_size?: number;
  land_area?: number;
}): PropertyFeatures {
  // Map property type from PROPERTY_TYPES in comprehensiveProperty.ts
  const propertyType = PROPERTY_TYPE_MAP[data.property_type?.toLowerCase() ?? 'house'] 
    ?? 'single_family';

  const totalAreaSqm = data.gfa ?? data.plot_size ?? data.land_area ?? 100;

  return {
    bedrooms: data.bedrooms ?? 3,
    bathrooms: data.bathrooms ?? 2,
    total_area_sqm: totalAreaSqm,
    property_type: propertyType,
    floors: data.total_floors ?? 1,
    year_built: data.year_built,
    user_preferences: {
      preferred_style: inferLayoutStyle(propertyType, data.quality_rating, data.year_built),
      open_plan_kitchen: data.quality_rating === 'luxury' || data.quality_rating === 'high',
      master_ensuite: (data.bathrooms ?? 1) >= 2,
      separate_dining: totalAreaSqm >= 100,
      garage_spaces: data.parking_spaces ?? 0,
      outdoor_living: data.has_garden ?? data.has_terrace ?? data.has_balcony ?? false,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  PROPERTY_TYPE_MAP,
  CONSTRUCTION_TYPE_MAP,
  inferLayoutStyle,
};
