/**
 * Regional Pricing Automation Service
 * 
 * Automates rent pricing based on Ghana-specific market data:
 * - Regional market rates (Greater Accra, Ashanti, etc.)
 * - Property type adjustments
 * - Location quality factors
 * - Automatic rent increase recommendations
 * - Market comparison analysis
 */

import { pool } from '../../../database';
import { logger } from '../../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface RegionalMarketData {
  region: GhanaRegion;
  propertyType: PropertyType;
  unitType: UnitType;
  minRent: number;
  maxRent: number;
  averageRent: number;
  medianRent: number;
  pricePerSqm: number;
  sampleSize: number;
  lastUpdated: Date;
  yoyChange: number;
}

export interface LocationFactor {
  id: string;
  name: string;
  region: GhanaRegion;
  district: string;
  neighborhood?: string;
  qualityScore: number; // 0.5 to 1.5 multiplier
  amenityScore: number;
  securityScore: number;
  accessibilityScore: number;
  lastUpdated: Date;
}

export interface RentRecommendation {
  unitId: string;
  currentRent: number;
  recommendedRent: number;
  minRecommended: number;
  maxRecommended: number;
  confidence: number;
  factors: {
    factor: string;
    impact: number;
    description: string;
  }[];
  marketComparison: {
    percentile: number;
    aboveMarketAverage: boolean;
    difference: number;
  };
  suggestedIncrease?: {
    amount: number;
    percentage: number;
    effectiveDate: Date;
    reason: string;
  };
}

export interface BulkRentIncrease {
  id: string;
  organizationId: string;
  propertyIds: string[];
  increaseType: 'percentage' | 'fixed' | 'market_adjustment';
  increaseValue: number;
  effectiveDate: Date;
  affectedUnits: number;
  totalCurrentRent: number;
  totalNewRent: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'applied' | 'cancelled';
  createdAt: Date;
  approvedAt?: Date;
  appliedAt?: Date;
}

type GhanaRegion = 
  | 'greater_accra'
  | 'ashanti'
  | 'western'
  | 'central'
  | 'eastern'
  | 'volta'
  | 'northern'
  | 'upper_east'
  | 'upper_west'
  | 'bono'
  | 'bono_east'
  | 'ahafo'
  | 'savannah'
  | 'north_east'
  | 'oti'
  | 'western_north';

type PropertyType = 'residential' | 'commercial' | 'mixed_use' | 'industrial';
type UnitType = 'studio' | '1bed' | '2bed' | '3bed' | '4bed+' | 'office' | 'retail' | 'warehouse';

// ============================================================================
// REGIONAL MARKET BENCHMARKS (Ghana-specific baseline data)
// ============================================================================

// Base rent per month in GHS for standard units in each region
const REGIONAL_BASE_RATES: Record<GhanaRegion, Record<UnitType, { min: number; max: number; avg: number }>> = {
  greater_accra: {
    studio: { min: 800, max: 3000, avg: 1500 },
    '1bed': { min: 1200, max: 5000, avg: 2500 },
    '2bed': { min: 2000, max: 8000, avg: 4000 },
    '3bed': { min: 3000, max: 15000, avg: 6500 },
    '4bed+': { min: 5000, max: 25000, avg: 12000 },
    office: { min: 30, max: 100, avg: 55 }, // per sqm
    retail: { min: 40, max: 150, avg: 75 }, // per sqm
    warehouse: { min: 15, max: 50, avg: 30 }, // per sqm
  },
  ashanti: {
    studio: { min: 400, max: 1500, avg: 800 },
    '1bed': { min: 600, max: 2500, avg: 1200 },
    '2bed': { min: 1000, max: 4000, avg: 2000 },
    '3bed': { min: 1500, max: 7000, avg: 3500 },
    '4bed+': { min: 2500, max: 12000, avg: 6000 },
    office: { min: 20, max: 60, avg: 35 },
    retail: { min: 25, max: 80, avg: 45 },
    warehouse: { min: 10, max: 35, avg: 20 },
  },
  western: {
    studio: { min: 350, max: 1200, avg: 700 },
    '1bed': { min: 500, max: 2000, avg: 1000 },
    '2bed': { min: 800, max: 3500, avg: 1800 },
    '3bed': { min: 1200, max: 6000, avg: 3000 },
    '4bed+': { min: 2000, max: 10000, avg: 5000 },
    office: { min: 15, max: 50, avg: 30 },
    retail: { min: 20, max: 70, avg: 40 },
    warehouse: { min: 8, max: 30, avg: 18 },
  },
  central: {
    studio: { min: 300, max: 1000, avg: 600 },
    '1bed': { min: 450, max: 1800, avg: 900 },
    '2bed': { min: 700, max: 3000, avg: 1500 },
    '3bed': { min: 1000, max: 5000, avg: 2500 },
    '4bed+': { min: 1800, max: 8000, avg: 4000 },
    office: { min: 12, max: 40, avg: 25 },
    retail: { min: 15, max: 55, avg: 32 },
    warehouse: { min: 6, max: 25, avg: 15 },
  },
  eastern: {
    studio: { min: 280, max: 900, avg: 550 },
    '1bed': { min: 400, max: 1600, avg: 850 },
    '2bed': { min: 650, max: 2800, avg: 1400 },
    '3bed': { min: 900, max: 4500, avg: 2200 },
    '4bed+': { min: 1500, max: 7500, avg: 3800 },
    office: { min: 10, max: 35, avg: 22 },
    retail: { min: 12, max: 50, avg: 28 },
    warehouse: { min: 5, max: 22, avg: 12 },
  },
  volta: {
    studio: { min: 250, max: 800, avg: 500 },
    '1bed': { min: 350, max: 1400, avg: 750 },
    '2bed': { min: 550, max: 2500, avg: 1200 },
    '3bed': { min: 800, max: 4000, avg: 2000 },
    '4bed+': { min: 1400, max: 6500, avg: 3200 },
    office: { min: 8, max: 30, avg: 18 },
    retail: { min: 10, max: 45, avg: 25 },
    warehouse: { min: 4, max: 20, avg: 10 },
  },
  northern: {
    studio: { min: 200, max: 700, avg: 400 },
    '1bed': { min: 300, max: 1200, avg: 650 },
    '2bed': { min: 500, max: 2200, avg: 1000 },
    '3bed': { min: 700, max: 3500, avg: 1700 },
    '4bed+': { min: 1200, max: 5500, avg: 2800 },
    office: { min: 6, max: 25, avg: 15 },
    retail: { min: 8, max: 35, avg: 20 },
    warehouse: { min: 3, max: 15, avg: 8 },
  },
  // Simplified entries for other regions (similar to Northern)
  upper_east: {
    studio: { min: 180, max: 600, avg: 350 },
    '1bed': { min: 280, max: 1000, avg: 550 },
    '2bed': { min: 450, max: 1800, avg: 900 },
    '3bed': { min: 650, max: 3000, avg: 1500 },
    '4bed+': { min: 1000, max: 5000, avg: 2500 },
    office: { min: 5, max: 20, avg: 12 },
    retail: { min: 6, max: 30, avg: 16 },
    warehouse: { min: 2, max: 12, avg: 6 },
  },
  upper_west: {
    studio: { min: 180, max: 600, avg: 350 },
    '1bed': { min: 280, max: 1000, avg: 550 },
    '2bed': { min: 450, max: 1800, avg: 900 },
    '3bed': { min: 650, max: 3000, avg: 1500 },
    '4bed+': { min: 1000, max: 5000, avg: 2500 },
    office: { min: 5, max: 20, avg: 12 },
    retail: { min: 6, max: 30, avg: 16 },
    warehouse: { min: 2, max: 12, avg: 6 },
  },
  bono: {
    studio: { min: 300, max: 1000, avg: 550 },
    '1bed': { min: 400, max: 1600, avg: 850 },
    '2bed': { min: 650, max: 2800, avg: 1400 },
    '3bed': { min: 900, max: 4500, avg: 2200 },
    '4bed+': { min: 1500, max: 7500, avg: 3800 },
    office: { min: 10, max: 35, avg: 20 },
    retail: { min: 12, max: 50, avg: 28 },
    warehouse: { min: 5, max: 22, avg: 12 },
  },
  bono_east: {
    studio: { min: 280, max: 900, avg: 500 },
    '1bed': { min: 380, max: 1400, avg: 750 },
    '2bed': { min: 600, max: 2500, avg: 1200 },
    '3bed': { min: 850, max: 4000, avg: 2000 },
    '4bed+': { min: 1400, max: 6500, avg: 3200 },
    office: { min: 8, max: 30, avg: 18 },
    retail: { min: 10, max: 45, avg: 25 },
    warehouse: { min: 4, max: 18, avg: 10 },
  },
  ahafo: {
    studio: { min: 250, max: 800, avg: 450 },
    '1bed': { min: 350, max: 1300, avg: 700 },
    '2bed': { min: 550, max: 2200, avg: 1100 },
    '3bed': { min: 800, max: 3800, avg: 1900 },
    '4bed+': { min: 1300, max: 6000, avg: 3000 },
    office: { min: 7, max: 28, avg: 16 },
    retail: { min: 9, max: 40, avg: 22 },
    warehouse: { min: 4, max: 16, avg: 9 },
  },
  savannah: {
    studio: { min: 200, max: 700, avg: 400 },
    '1bed': { min: 300, max: 1200, avg: 600 },
    '2bed': { min: 480, max: 2000, avg: 950 },
    '3bed': { min: 700, max: 3200, avg: 1600 },
    '4bed+': { min: 1100, max: 5200, avg: 2600 },
    office: { min: 5, max: 22, avg: 13 },
    retail: { min: 7, max: 32, avg: 18 },
    warehouse: { min: 3, max: 14, avg: 7 },
  },
  north_east: {
    studio: { min: 180, max: 650, avg: 380 },
    '1bed': { min: 280, max: 1100, avg: 580 },
    '2bed': { min: 450, max: 1900, avg: 900 },
    '3bed': { min: 680, max: 3100, avg: 1550 },
    '4bed+': { min: 1050, max: 5000, avg: 2500 },
    office: { min: 5, max: 21, avg: 12 },
    retail: { min: 6, max: 30, avg: 17 },
    warehouse: { min: 3, max: 13, avg: 7 },
  },
  oti: {
    studio: { min: 220, max: 750, avg: 430 },
    '1bed': { min: 320, max: 1300, avg: 680 },
    '2bed': { min: 520, max: 2300, avg: 1100 },
    '3bed': { min: 760, max: 3700, avg: 1850 },
    '4bed+': { min: 1250, max: 6000, avg: 3000 },
    office: { min: 7, max: 27, avg: 15 },
    retail: { min: 9, max: 40, avg: 22 },
    warehouse: { min: 4, max: 17, avg: 9 },
  },
  western_north: {
    studio: { min: 300, max: 1000, avg: 600 },
    '1bed': { min: 420, max: 1700, avg: 900 },
    '2bed': { min: 680, max: 3000, avg: 1550 },
    '3bed': { min: 1000, max: 5200, avg: 2600 },
    '4bed+': { min: 1700, max: 8500, avg: 4200 },
    office: { min: 12, max: 42, avg: 25 },
    retail: { min: 16, max: 60, avg: 35 },
    warehouse: { min: 7, max: 28, avg: 15 },
  },
};

// District/neighborhood quality factors for Greater Accra
const ACCRA_LOCATION_FACTORS: Record<string, number> = {
  // Premium areas (1.3-1.5x)
  'Airport Residential': 1.5,
  'Cantonments': 1.45,
  'Ridge': 1.4,
  'East Legon': 1.35,
  'Labone': 1.3,
  
  // Upper-middle areas (1.1-1.25x)
  'Osu': 1.25,
  'Dzorwulu': 1.2,
  'Roman Ridge': 1.2,
  'Spintex': 1.15,
  'Tema Community 25': 1.1,
  
  // Middle areas (0.95-1.05x)
  'Dansoman': 1.0,
  'Achimota': 1.0,
  'Tesano': 1.0,
  'Adenta': 0.95,
  'Madina': 0.95,
  
  // Value areas (0.7-0.9x)
  'Kasoa': 0.8,
  'Ashaiman': 0.75,
  'Tema New Town': 0.7,
};

// ============================================================================
// MARKET DATA FUNCTIONS
// ============================================================================

export async function getRegionalMarketData(
  region: GhanaRegion,
  propertyType: PropertyType,
  unitType: UnitType
): Promise<RegionalMarketData> {
  // First try to get from database (real market data)
  const result = await pool.query(`
    SELECT * FROM pm_regional_market_data
    WHERE region = $1 
      AND property_type = $2 
      AND unit_type = $3
      AND last_updated > NOW() - INTERVAL '30 days'
    ORDER BY last_updated DESC
    LIMIT 1
  `, [region, propertyType, unitType]);

  if (result.rows.length > 0) {
    return mapMarketDataRow(result.rows[0]);
  }

  // Fall back to baseline data
  const baseRates = REGIONAL_BASE_RATES[region]?.[unitType] || REGIONAL_BASE_RATES.northern[unitType];
  
  return {
    region,
    propertyType,
    unitType,
    minRent: baseRates.min,
    maxRent: baseRates.max,
    averageRent: baseRates.avg,
    medianRent: baseRates.avg * 0.95, // Approximate
    pricePerSqm: unitType === 'office' || unitType === 'retail' || unitType === 'warehouse' 
      ? baseRates.avg 
      : baseRates.avg / 80, // Approximate sqm for residential
    sampleSize: 0, // Baseline data
    lastUpdated: new Date(),
    yoyChange: 0.08, // Assume 8% YoY increase (Ghana average)
  };
}

export async function updateMarketDataFromListings(organizationId: string): Promise<void> {
  // Calculate market data from actual tenancies
  const result = await pool.query(`
    INSERT INTO pm_regional_market_data (
      region, property_type, unit_type,
      min_rent, max_rent, average_rent, median_rent,
      price_per_sqm, sample_size, yoy_change
    )
    SELECT 
      p.region,
      p.property_type,
      u.unit_type,
      MIN(t.monthly_rent) as min_rent,
      MAX(t.monthly_rent) as max_rent,
      AVG(t.monthly_rent) as average_rent,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.monthly_rent) as median_rent,
      AVG(t.monthly_rent / NULLIF(u.floor_area_sqm, 0)) as price_per_sqm,
      COUNT(*) as sample_size,
      0.0 as yoy_change
    FROM pm_tenancies t
    JOIN pm_units u ON t.unit_id = u.id
    JOIN pm_properties p ON u.property_id = p.id
    WHERE t.status = 'active'
      AND t.start_date > NOW() - INTERVAL '12 months'
    GROUP BY p.region, p.property_type, u.unit_type
    HAVING COUNT(*) >= 3
    ON CONFLICT (region, property_type, unit_type) 
    DO UPDATE SET
      min_rent = EXCLUDED.min_rent,
      max_rent = EXCLUDED.max_rent,
      average_rent = EXCLUDED.average_rent,
      median_rent = EXCLUDED.median_rent,
      price_per_sqm = EXCLUDED.price_per_sqm,
      sample_size = EXCLUDED.sample_size,
      last_updated = NOW()
  `);

  logger.info('Updated regional market data from listings', { 
    rowsAffected: result.rowCount 
  });
}

// ============================================================================
// RENT RECOMMENDATION ENGINE
// ============================================================================

export async function getUnitRentRecommendation(unitId: string): Promise<RentRecommendation> {
  // Get unit details with property and current tenancy
  const unitResult = await pool.query(`
    SELECT 
      u.id,
      u.unit_type,
      u.floor_area_sqm,
      u.bedrooms,
      u.bathrooms,
      u.has_parking,
      u.floor_number,
      u.features,
      p.id as property_id,
      p.property_type,
      p.region,
      p.address_city,
      p.address_neighborhood,
      p.amenities as property_amenities,
      p.year_built,
      t.monthly_rent as current_rent,
      t.start_date as tenancy_start
    FROM pm_units u
    JOIN pm_properties p ON u.property_id = p.id
    LEFT JOIN pm_tenancies t ON t.unit_id = u.id AND t.status = 'active'
    WHERE u.id = $1
  `, [unitId]);

  if (unitResult.rows.length === 0) {
    throw new Error('Unit not found');
  }

  const unit = unitResult.rows[0];
  const factors: { factor: string; impact: number; description: string }[] = [];

  // Get regional market data
  const marketData = await getRegionalMarketData(
    unit.region as GhanaRegion,
    unit.property_type,
    mapBedrooms(unit.bedrooms)
  );

  let baseRent = marketData.averageRent;

  // Factor 1: Location quality
  const locationFactor = ACCRA_LOCATION_FACTORS[unit.address_neighborhood] || 1.0;
  if (locationFactor !== 1.0) {
    const impact = (locationFactor - 1) * 100;
    factors.push({
      factor: 'Location Quality',
      impact,
      description: `${unit.address_neighborhood} is ${locationFactor > 1 ? 'above' : 'below'} average`,
    });
  }
  baseRent *= locationFactor;

  // Factor 2: Size adjustment (price per sqm)
  if (unit.floor_area_sqm) {
    const expectedSqm = getExpectedSqm(unit.unit_type);
    const sizeRatio = unit.floor_area_sqm / expectedSqm;
    if (Math.abs(sizeRatio - 1) > 0.1) {
      const sizeAdjustment = 1 + (sizeRatio - 1) * 0.5; // 50% of size difference
      const impact = (sizeAdjustment - 1) * 100;
      factors.push({
        factor: 'Size Adjustment',
        impact,
        description: `Unit is ${(sizeRatio * 100 - 100).toFixed(0)}% ${sizeRatio > 1 ? 'larger' : 'smaller'} than typical`,
      });
      baseRent *= sizeAdjustment;
    }
  }

  // Factor 3: Amenities
  const amenityScore = calculateAmenityScore(unit.features, unit.property_amenities);
  if (amenityScore !== 1.0) {
    const impact = (amenityScore - 1) * 100;
    factors.push({
      factor: 'Amenities',
      impact,
      description: amenityScore > 1 ? 'Above average amenities' : 'Limited amenities',
    });
    baseRent *= amenityScore;
  }

  // Factor 4: Floor level (for apartments)
  if (unit.floor_number !== null && unit.floor_number !== undefined) {
    const floorAdjustment = getFloorAdjustment(unit.floor_number);
    if (floorAdjustment !== 1.0) {
      const impact = (floorAdjustment - 1) * 100;
      factors.push({
        factor: 'Floor Level',
        impact,
        description: unit.floor_number === 0 ? 'Ground floor (less preferred)' : 
                     unit.floor_number >= 10 ? 'High floor (premium views)' : 'Mid-floor',
      });
      baseRent *= floorAdjustment;
    }
  }

  // Factor 5: Parking
  if (unit.has_parking) {
    const parkingPremium = 1.05;
    factors.push({
      factor: 'Parking',
      impact: 5,
      description: 'Includes dedicated parking',
    });
    baseRent *= parkingPremium;
  }

  // Factor 6: Building age
  if (unit.year_built) {
    const age = new Date().getFullYear() - unit.year_built;
    const ageAdjustment = age < 3 ? 1.1 : age < 10 ? 1.0 : age < 20 ? 0.95 : 0.9;
    if (ageAdjustment !== 1.0) {
      const impact = (ageAdjustment - 1) * 100;
      factors.push({
        factor: 'Building Age',
        impact,
        description: age < 3 ? 'New construction' : 
                     age < 10 ? 'Modern building' : 
                     age < 20 ? 'Well-maintained older building' : 'Older building',
      });
      baseRent *= ageAdjustment;
    }
  }

  // Calculate confidence based on sample size and data freshness
  const confidence = Math.min(0.95, 0.6 + (marketData.sampleSize / 50) * 0.35);

  // Calculate range
  const variance = (marketData.maxRent - marketData.minRent) / marketData.averageRent;
  const minRecommended = baseRent * (1 - variance * 0.3);
  const maxRecommended = baseRent * (1 + variance * 0.3);

  // Market comparison
  const currentRent = unit.current_rent || 0;
  const percentile = calculatePercentile(baseRent, marketData.minRent, marketData.maxRent);

  const recommendation: RentRecommendation = {
    unitId,
    currentRent,
    recommendedRent: Math.round(baseRent / 10) * 10, // Round to nearest 10
    minRecommended: Math.round(minRecommended / 10) * 10,
    maxRecommended: Math.round(maxRecommended / 10) * 10,
    confidence,
    factors,
    marketComparison: {
      percentile,
      aboveMarketAverage: baseRent > marketData.averageRent,
      difference: baseRent - marketData.averageRent,
    },
  };

  // Suggest increase if current rent is below recommendation
  if (currentRent > 0 && baseRent > currentRent * 1.05) {
    const increaseAmount = baseRent - currentRent;
    const increasePercentage = (increaseAmount / currentRent) * 100;
    
    // Calculate effective date (minimum 3 months notice in Ghana)
    const effectiveDate = new Date();
    effectiveDate.setMonth(effectiveDate.getMonth() + 3);

    recommendation.suggestedIncrease = {
      amount: Math.round(increaseAmount / 10) * 10,
      percentage: Math.round(increasePercentage),
      effectiveDate,
      reason: `Current rent is ${increasePercentage.toFixed(0)}% below market recommendation`,
    };
  }

  return recommendation;
}

export async function getBulkRentRecommendations(
  organizationId: string,
  propertyIds?: string[]
): Promise<RentRecommendation[]> {
  const result = await pool.query(`
    SELECT u.id
    FROM pm_units u
    JOIN pm_properties p ON u.property_id = p.id
    WHERE p.organization_id = $1
      ${propertyIds ? 'AND p.id = ANY($2)' : ''}
      AND u.current_status = 'occupied'
  `, propertyIds ? [organizationId, propertyIds] : [organizationId]);

  const recommendations: RentRecommendation[] = [];

  for (const row of result.rows) {
    try {
      const recommendation = await getUnitRentRecommendation(row.id);
      if (recommendation.suggestedIncrease) {
        recommendations.push(recommendation);
      }
    } catch (error) {
      logger.error('Error getting rent recommendation', { unitId: row.id, error });
    }
  }

  // Sort by suggested increase percentage
  return recommendations.sort((a, b) => 
    (b.suggestedIncrease?.percentage || 0) - (a.suggestedIncrease?.percentage || 0)
  );
}

// ============================================================================
// BULK RENT INCREASE
// ============================================================================

export async function createBulkRentIncrease(
  organizationId: string,
  propertyIds: string[],
  increaseType: 'percentage' | 'fixed' | 'market_adjustment',
  increaseValue: number,
  effectiveDate: Date
): Promise<BulkRentIncrease> {
  // Calculate affected units and totals
  const unitsResult = await pool.query(`
    SELECT 
      COUNT(*) as affected_units,
      SUM(t.monthly_rent) as total_current_rent
    FROM pm_tenancies t
    JOIN pm_units u ON t.unit_id = u.id
    JOIN pm_properties p ON u.property_id = p.id
    WHERE p.organization_id = $1
      AND p.id = ANY($2)
      AND t.status = 'active'
  `, [organizationId, propertyIds]);

  const stats = unitsResult.rows[0];
  const totalCurrentRent = parseFloat(stats.total_current_rent) || 0;
  
  let totalNewRent: number;
  if (increaseType === 'percentage') {
    totalNewRent = totalCurrentRent * (1 + increaseValue / 100);
  } else if (increaseType === 'fixed') {
    totalNewRent = totalCurrentRent + (parseInt(stats.affected_units) * increaseValue);
  } else {
    // Market adjustment - calculate individually
    const recommendations = await getBulkRentRecommendations(organizationId, propertyIds);
    totalNewRent = recommendations.reduce((sum, r) => sum + r.recommendedRent, 0);
  }

  const result = await pool.query(`
    INSERT INTO pm_bulk_rent_increases (
      organization_id, property_ids, increase_type, increase_value,
      effective_date, affected_units, total_current_rent, total_new_rent, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
    RETURNING *
  `, [
    organizationId,
    propertyIds,
    increaseType,
    increaseValue,
    effectiveDate,
    parseInt(stats.affected_units),
    totalCurrentRent,
    totalNewRent,
  ]);

  logger.info('Created bulk rent increase', {
    id: result.rows[0].id,
    affectedUnits: stats.affected_units,
    totalIncrease: totalNewRent - totalCurrentRent,
  });

  return mapBulkIncreaseRow(result.rows[0]);
}

export async function applyBulkRentIncrease(bulkIncreaseId: string): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get the bulk increase details
    const increaseResult = await client.query(`
      SELECT * FROM pm_bulk_rent_increases
      WHERE id = $1 AND status = 'approved'
      FOR UPDATE
    `, [bulkIncreaseId]);

    if (increaseResult.rows.length === 0) {
      throw new Error('Bulk increase not found or not approved');
    }

    const increase = increaseResult.rows[0];

    // Get all affected tenancies
    const tenanciesResult = await client.query(`
      SELECT t.id, t.monthly_rent
      FROM pm_tenancies t
      JOIN pm_units u ON t.unit_id = u.id
      JOIN pm_properties p ON u.property_id = p.id
      WHERE p.organization_id = $1
        AND p.id = ANY($2)
        AND t.status = 'active'
    `, [increase.organization_id, increase.property_ids]);

    // Apply increases
    for (const tenancy of tenanciesResult.rows) {
      let newRent: number;
      
      if (increase.increase_type === 'percentage') {
        newRent = tenancy.monthly_rent * (1 + increase.increase_value / 100);
      } else if (increase.increase_type === 'fixed') {
        newRent = tenancy.monthly_rent + increase.increase_value;
      } else {
        // Market adjustment - get individual recommendation
        const recommendation = await getUnitRentRecommendation(tenancy.unit_id);
        newRent = recommendation.recommendedRent;
      }

      // Create rent adjustment record
      await client.query(`
        INSERT INTO pm_rent_adjustments (
          tenancy_id, old_rent, new_rent, adjustment_type,
          effective_date, reason, bulk_increase_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        tenancy.id,
        tenancy.monthly_rent,
        Math.round(newRent),
        increase.increase_type,
        increase.effective_date,
        `Bulk rent increase: ${increase.increase_type} ${increase.increase_value}`,
        bulkIncreaseId,
      ]);

      // Update tenancy rent (effective from the specified date)
      await client.query(`
        UPDATE pm_tenancies
        SET monthly_rent = $1, updated_at = NOW()
        WHERE id = $2
      `, [Math.round(newRent), tenancy.id]);
    }

    // Mark bulk increase as applied
    await client.query(`
      UPDATE pm_bulk_rent_increases
      SET status = 'applied', applied_at = NOW()
      WHERE id = $1
    `, [bulkIncreaseId]);

    await client.query('COMMIT');

    logger.info('Applied bulk rent increase', {
      id: bulkIncreaseId,
      affectedTenancies: tenanciesResult.rows.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function mapBedrooms(bedrooms: number | null): UnitType {
  if (!bedrooms) return '1bed';
  if (bedrooms === 0) return 'studio';
  if (bedrooms === 1) return '1bed';
  if (bedrooms === 2) return '2bed';
  if (bedrooms === 3) return '3bed';
  return '4bed+';
}

function getExpectedSqm(unitType: string): number {
  const expected: Record<string, number> = {
    studio: 35,
    '1bed': 55,
    '2bed': 80,
    '3bed': 120,
    '4bed+': 180,
    office: 100,
    retail: 80,
    warehouse: 500,
  };
  return expected[unitType] || 80;
}

function calculateAmenityScore(unitFeatures: any, propertyAmenities: any): number {
  let score = 1.0;
  const features = Array.isArray(unitFeatures) ? unitFeatures : [];
  const amenities = Array.isArray(propertyAmenities) ? propertyAmenities : [];
  
  const premiumFeatures = ['air_conditioning', 'furnished', 'generator', 'water_tank', 'borehole'];
  const premiumAmenities = ['swimming_pool', 'gym', 'security_24hr', 'elevator', 'rooftop_terrace'];
  
  const unitPremiumCount = features.filter((f: string) => premiumFeatures.includes(f)).length;
  const propertyPremiumCount = amenities.filter((a: string) => premiumAmenities.includes(a)).length;
  
  score += unitPremiumCount * 0.03;
  score += propertyPremiumCount * 0.02;
  
  return Math.min(1.25, score);
}

function getFloorAdjustment(floor: number): number {
  if (floor === 0) return 0.95; // Ground floor discount
  if (floor >= 1 && floor <= 3) return 1.0; // Standard
  if (floor >= 4 && floor <= 9) return 1.03; // Mid-high premium
  if (floor >= 10) return 1.08; // Penthouse premium
  return 1.0;
}

function calculatePercentile(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.round(((value - min) / (max - min)) * 100);
}

function mapMarketDataRow(row: any): RegionalMarketData {
  return {
    region: row.region,
    propertyType: row.property_type,
    unitType: row.unit_type,
    minRent: parseFloat(row.min_rent),
    maxRent: parseFloat(row.max_rent),
    averageRent: parseFloat(row.average_rent),
    medianRent: parseFloat(row.median_rent),
    pricePerSqm: parseFloat(row.price_per_sqm),
    sampleSize: parseInt(row.sample_size),
    lastUpdated: new Date(row.last_updated),
    yoyChange: parseFloat(row.yoy_change),
  };
}

function mapBulkIncreaseRow(row: any): BulkRentIncrease {
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyIds: row.property_ids,
    increaseType: row.increase_type,
    increaseValue: parseFloat(row.increase_value),
    effectiveDate: new Date(row.effective_date),
    affectedUnits: parseInt(row.affected_units),
    totalCurrentRent: parseFloat(row.total_current_rent),
    totalNewRent: parseFloat(row.total_new_rent),
    status: row.status,
    createdAt: new Date(row.created_at),
    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
    appliedAt: row.applied_at ? new Date(row.applied_at) : undefined,
  };
}

export default {
  getRegionalMarketData,
  updateMarketDataFromListings,
  getUnitRentRecommendation,
  getBulkRentRecommendations,
  createBulkRentIncrease,
  applyBulkRentIncrease,
};
