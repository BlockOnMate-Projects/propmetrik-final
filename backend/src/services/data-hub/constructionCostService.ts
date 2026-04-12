/**
 * Construction Cost Service
 * Tier 4 Market Data - Construction & Material Costs
 * 
 * Tracks and manages:
 * - Building material prices (cement, steel, timber, etc.)
 * - Labor costs by skill type and region
 * - Equipment rental rates
 * - Construction cost indices
 */

import { query, transaction } from '../../database';
import { logger } from '../../utils/logger';

// =====================================================
// TYPES
// =====================================================

export type MaterialCategory =
  | 'cement'
  | 'steel'
  | 'timber'
  | 'roofing'
  | 'blocks'
  | 'sand'
  | 'gravel'
  | 'tiles'
  | 'plumbing'
  | 'electrical'
  | 'paint'
  | 'glass'
  | 'doors_windows'
  | 'finishing'
  | 'miscellaneous';

export type LaborCategory =
  | 'mason'
  | 'carpenter'
  | 'plumber'
  | 'electrician'
  | 'painter'
  | 'welder'
  | 'general_laborer'
  | 'foreman'
  | 'site_engineer'
  | 'architect'
  | 'quantity_surveyor'
  | 'tiler'
  | 'steel_fixer';

export type PriceUnit =
  | 'bag'      // 50kg bag (cement)
  | 'ton'
  | 'kg'
  | 'piece'
  | 'length'   // For steel bars, timber
  | 'sqm'      // Square meters
  | 'sqft'
  | 'cubic_m'  // Cubic meters (sand, gravel)
  | 'trip'     // For bulk deliveries
  | 'day'      // Labor day rate
  | 'hour'
  | 'month'
  | 'project';

export type RegionCode =
  | 'greater_accra'
  | 'kumasi_metro'
  | 'ashanti'
  | 'eastern'
  | 'western'
  | 'western_cluster'
  | 'central'
  | 'volta'
  | 'northern'
  | 'northern_cluster'
  | 'upper_east'
  | 'upper_west'
  | 'bono'
  | 'bono_east'
  | 'ahafo'
  | 'savannah'
  | 'north_east'
  | 'oti'
  | 'western_north';

export interface MaterialPrice {
  id: string;
  material_category: MaterialCategory;
  material_name: string;
  brand: string | null;
  specification: string | null;
  price_ghs: number;
  previous_price_ghs: number | null;
  price_change_percent: number | null;
  unit: PriceUnit;
  quantity_per_unit: number;
  region: RegionCode;
  supplier_type: 'retail' | 'wholesale' | 'manufacturer';
  supplier_name: string | null;
  survey_date: Date;
  is_verified: boolean;
  confidence_level: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface LaborRate {
  id: string;
  labor_category: LaborCategory;
  skill_level: 'apprentice' | 'journeyman' | 'master' | 'specialist';
  rate_ghs: number;
  previous_rate_ghs: number | null;
  rate_change_percent: number | null;
  rate_type: 'daily' | 'hourly' | 'monthly' | 'per_unit';
  unit_description: string | null;
  region: RegionCode;
  includes_benefits: boolean;
  minimum_hire_period: string | null;
  survey_date: Date;
  source: string;
  is_verified: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface EquipmentRate {
  id: string;
  equipment_name: string;
  equipment_type: string;
  rate_ghs: number;
  rate_period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  includes_operator: boolean;
  includes_fuel: boolean;
  deposit_required_ghs: number | null;
  region: RegionCode;
  supplier_name: string | null;
  survey_date: Date;
  is_verified: boolean;
  notes: string | null;
  created_at: Date;
}

export interface ConstructionCostIndex {
  id: string;
  index_name: string;
  index_value: number;
  base_year: number;
  base_value: number;
  period_start: Date;
  period_end: Date;
  change_from_previous: number | null;
  change_year_on_year: number | null;
  region: RegionCode | null;
  property_type: string | null;
  calculation_methodology: string | null;
  components: Array<{ name: string; weight: number; value: number }>;
  source: string;
  is_official: boolean;
  notes: string | null;
  material_index?: number;
  labor_index?: number;
  overall_index?: number;
  created_at: Date;
}

export interface CalculatedRegionalMultiplier {
  region: string;
  value: number;
  material_multiplier: number;
  labor_multiplier: number;
  transport_multiplier: number;
  source: 'calculated' | 'static';
  confidence: number;
  last_calculated_at: Date | null;
}

export interface CalculatedBaseCost {
  property_type: string;
  quality_level: string;
  region: string;
  cost_ghs: number;
  material_component_ghs: number;
  labor_component_ghs: number;
  overhead_component_ghs: number;
  is_calculated: boolean;
  calculation_source: string;
  updated_at: Date;
}

export interface CreateMaterialPriceInput {
  material_category: MaterialCategory;
  material_name: string;
  brand?: string;
  specification?: string;
  price_ghs: number;
  unit: PriceUnit;
  quantity_per_unit?: number;
  region: RegionCode;
  supplier_type: 'retail' | 'wholesale' | 'manufacturer';
  supplier_name?: string;
  survey_date?: Date;
  is_verified?: boolean;
  confidence_level?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateLaborRateInput {
  labor_category: LaborCategory;
  skill_level: 'apprentice' | 'journeyman' | 'master' | 'specialist';
  rate_ghs: number;
  rate_type: 'daily' | 'hourly' | 'monthly' | 'per_unit';
  unit_description?: string;
  region: RegionCode;
  includes_benefits?: boolean;
  minimum_hire_period?: string;
  source: string;
  is_verified?: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ConstructionEstimate {
  property_type: string;
  quality_level: 'basic' | 'standard' | 'premium' | 'luxury';
  region: RegionCode;
  built_area_sqm: number;
  num_floors: number;
  estimates: {
    materials: number;
    labor: number;
    equipment: number;
    overheads: number;
    contingency: number;
    total: number;
    cost_per_sqm: number;
  };
  breakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  assumptions: string[];
  validity_date: Date;
}

// =====================================================
// SERVICE
// =====================================================

export class ConstructionCostService {
  // Ghana-specific construction cost parameters
  private static readonly COST_MULTIPLIERS: Record<string, number> = {
    basic: 0.7,
    standard: 1.0,
    premium: 1.4,
    luxury: 2.0,
  };

  // Fallback static multipliers - used only when database values unavailable
  private static readonly FALLBACK_REGION_MULTIPLIERS: Record<string, number> = {
    greater_accra: 1.0,   // Base reference (matches database)
    ashanti: 0.95,
    kumasi_metro: 0.95,   // Alias for ashanti
    western: 0.97,
    western_cluster: 0.97,
    eastern: 0.95,
    central: 0.96,
    volta: 0.93,
    northern: 0.91,
    northern_cluster: 0.90,
    upper_east: 0.89,
    upper_west: 0.87,
    bono: 0.92,
    bono_east: 0.91,
    ahafo: 0.90,
    savannah: 0.88,
    north_east: 0.87,
    oti: 0.92,
    western_north: 0.93,
  };

  // Fallback base costs - used only when database calculated values unavailable
  private static readonly FALLBACK_BASE_COST_PER_SQM: Record<string, number> = {
    residential_basic: 3500,
    residential_standard: 5000,
    residential_premium: 8000,
    residential_luxury: 15000,
    commercial_basic: 4000,
    commercial_standard: 6500,
    commercial_premium: 10000,
    commercial_luxury: 14000,
    industrial_basic: 3000,
    industrial_standard: 4500,
    industrial_premium: 7000,
    industrial_luxury: 11000,
  };

  // Cost breakdown percentages
  private static readonly COST_BREAKDOWN = {
    materials: 0.55,     // 55% materials
    labor: 0.30,         // 30% labor
    equipment: 0.05,     // 5% equipment
    overheads: 0.07,     // 7% overheads/profit
    contingency: 0.03,   // 3% contingency
  };

  // =====================================================
  // DATABASE-DRIVEN MULTIPLIER & BASE COST METHODS
  // =====================================================

  /**
   * Get regional multiplier from database with fallback to static values
   * Uses data from regional_cost_multipliers table populated by baseCostCalculationService
   */
  async getRegionalMultiplier(region: string): Promise<CalculatedRegionalMultiplier> {
    try {
      const result = await query<{
        region: string;
        material_multiplier: number;
        labor_multiplier: number;
        transport_multiplier: number;
        combined_multiplier: number;
        last_calculated_at: Date | null;
      }>(
        `SELECT region, material_multiplier, labor_multiplier, transport_multiplier, 
                combined_multiplier, last_calculated_at
         FROM regional_cost_multipliers
         WHERE region = $1`,
        [region.toLowerCase().replace(/-/g, '_')]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          region: row.region,
          value: parseFloat(row.combined_multiplier as any),
          material_multiplier: parseFloat(row.material_multiplier as any),
          labor_multiplier: parseFloat(row.labor_multiplier as any),
          transport_multiplier: parseFloat(row.transport_multiplier as any),
          source: 'calculated',
          confidence: 0.9,
          last_calculated_at: row.last_calculated_at,
        };
      }

      // Fallback to static multiplier
      const staticValue = ConstructionCostService.FALLBACK_REGION_MULTIPLIERS[region] || 1.0;
      logger.warn('Using fallback regional multiplier', { region, value: staticValue });

      return {
        region,
        value: staticValue,
        material_multiplier: staticValue,
        labor_multiplier: staticValue,
        transport_multiplier: 1.0,
        source: 'static',
        confidence: 0.6,
        last_calculated_at: null,
      };
    } catch (error) {
      logger.error('Error fetching regional multiplier', { region, error });
      const staticValue = ConstructionCostService.FALLBACK_REGION_MULTIPLIERS[region] || 1.0;
      return {
        region,
        value: staticValue,
        material_multiplier: staticValue,
        labor_multiplier: staticValue,
        transport_multiplier: 1.0,
        source: 'static',
        confidence: 0.5,
        last_calculated_at: null,
      };
    }
  }

  /**
   * Get calculated base cost from database with fallback to static values
   * Uses data from base_costs_per_sqm table populated by baseCostCalculationService
   */
  async getCalculatedBaseCost(
    propertyType: string,
    qualityLevel: string,
    region: string
  ): Promise<CalculatedBaseCost | null> {
    try {
      const normalizedRegion = region.toLowerCase().replace(/-/g, '_');

      const result = await query<{
        property_type: string;
        quality_level: string;
        region: string;
        cost_ghs: number;
        material_component_ghs: number;
        labor_component_ghs: number;
        overhead_component_ghs: number;
        is_calculated: boolean;
        calculation_source: string;
        updated_at: Date;
      }>(
        `SELECT property_type, quality_level, region, cost_ghs,
                COALESCE(material_component_ghs, 0) as material_component_ghs,
                COALESCE(labor_component_ghs, 0) as labor_component_ghs,
                COALESCE(overhead_component_ghs, 0) as overhead_component_ghs,
                COALESCE(is_calculated, false) as is_calculated,
                COALESCE(calculation_source, 'legacy') as calculation_source,
                updated_at
         FROM base_costs_per_sqm
         WHERE property_type = $1 AND quality_level = $2 AND region = $3`,
        [propertyType, qualityLevel, normalizedRegion]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          property_type: row.property_type,
          quality_level: row.quality_level,
          region: row.region,
          cost_ghs: parseFloat(row.cost_ghs as any),
          material_component_ghs: parseFloat(row.material_component_ghs as any),
          labor_component_ghs: parseFloat(row.labor_component_ghs as any),
          overhead_component_ghs: parseFloat(row.overhead_component_ghs as any),
          is_calculated: row.is_calculated,
          calculation_source: row.calculation_source,
          updated_at: row.updated_at,
        };
      }

      // Try without region (for legacy data without region column)
      const legacyResult = await query<{
        property_type: string;
        quality_level: string;
        cost_ghs: number;
        updated_at: Date;
      }>(
        `SELECT property_type, quality_level, cost_ghs, updated_at
         FROM base_costs_per_sqm
         WHERE property_type = $1 AND quality_level = $2 AND (region IS NULL OR region = '')
         LIMIT 1`,
        [propertyType, qualityLevel]
      );

      if (legacyResult.rows.length > 0) {
        const row = legacyResult.rows[0];
        const baseCost = parseFloat(row.cost_ghs as any);

        // Apply regional multiplier to legacy base cost
        const multiplier = await this.getRegionalMultiplier(normalizedRegion);
        const adjustedCost = baseCost * multiplier.value;

        return {
          property_type: row.property_type,
          quality_level: row.quality_level,
          region: normalizedRegion,
          cost_ghs: adjustedCost,
          material_component_ghs: adjustedCost * 0.55,
          labor_component_ghs: adjustedCost * 0.30,
          overhead_component_ghs: adjustedCost * 0.15,
          is_calculated: false,
          calculation_source: 'legacy_with_multiplier',
          updated_at: row.updated_at,
        };
      }

      return null;
    } catch (error) {
      logger.error('Error fetching calculated base cost', { propertyType, qualityLevel, region, error });
      return null;
    }
  }

  /**
   * Get all regional multipliers for comparison/display
   */
  async getAllRegionalMultipliers(): Promise<CalculatedRegionalMultiplier[]> {
    try {
      const result = await query<{
        region: string;
        material_multiplier: number;
        labor_multiplier: number;
        transport_multiplier: number;
        combined_multiplier: number;
        last_calculated_at: Date | null;
      }>(
        `SELECT region, material_multiplier, labor_multiplier, transport_multiplier, 
                combined_multiplier, last_calculated_at
         FROM regional_cost_multipliers
         ORDER BY region`
      );

      return result.rows.map(row => ({
        region: row.region,
        value: parseFloat(row.combined_multiplier as any),
        material_multiplier: parseFloat(row.material_multiplier as any),
        labor_multiplier: parseFloat(row.labor_multiplier as any),
        transport_multiplier: parseFloat(row.transport_multiplier as any),
        source: 'calculated' as const,
        confidence: 0.9,
        last_calculated_at: row.last_calculated_at,
      }));
    } catch (error) {
      logger.error('Error fetching all regional multipliers', { error });
      // Return fallback static values
      return Object.entries(ConstructionCostService.FALLBACK_REGION_MULTIPLIERS).map(([region, value]) => ({
        region,
        value,
        material_multiplier: value,
        labor_multiplier: value,
        transport_multiplier: 1.0,
        source: 'static' as const,
        confidence: 0.6,
        last_calculated_at: null,
      }));
    }
  }

  /**
   * Create a new material price record
   */
  async createMaterialPrice(input: CreateMaterialPriceInput): Promise<MaterialPrice> {
    // Get previous price for change calculation
    const previousResult = await query<{ price_ghs: number }>(
      `SELECT price_ghs FROM material_prices 
       WHERE material_category = $1 AND material_name = $2 AND region = $3
       ORDER BY survey_date DESC LIMIT 1`,
      [input.material_category, input.material_name, input.region]
    );

    const previousPrice = previousResult.rows[0]?.price_ghs || null;
    const changePercent = previousPrice
      ? ((input.price_ghs - previousPrice) / previousPrice) * 100
      : null;

    const result = await query<MaterialPrice>(
      `INSERT INTO material_prices (
        material_category, material_name, brand, specification,
        price_ghs, previous_price_ghs, price_change_percent,
        unit, quantity_per_unit, region, supplier_type, supplier_name,
        survey_date, is_verified, confidence_level, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        input.material_category, input.material_name, input.brand || null,
        input.specification || null, input.price_ghs, previousPrice, changePercent,
        input.unit, input.quantity_per_unit || 1, input.region,
        input.supplier_type, input.supplier_name || null,
        input.survey_date || new Date(), input.is_verified || false,
        input.confidence_level || 0.8, input.notes || null,
        JSON.stringify(input.metadata || {}),
      ]
    );

    logger.info('Created material price', {
      material: input.material_name,
      price: input.price_ghs,
      region: input.region,
    });

    return result.rows[0];
  }

  /**
   * Create a new labor rate record
   */
  async createLaborRate(input: CreateLaborRateInput): Promise<LaborRate> {
    const previousResult = await query<{ rate_ghs: number }>(
      `SELECT daily_rate_ghs AS rate_ghs FROM labor_rates 
       WHERE labor_category = $1 AND skill_level = $2 AND region = $3
       ORDER BY survey_date DESC LIMIT 1`,
      [input.labor_category, input.skill_level, input.region]
    );

    const previousRate = previousResult.rows[0]?.rate_ghs || null;
    const changePercent = previousRate
      ? ((input.rate_ghs - previousRate) / previousRate) * 100
      : null;

    const result = await query<LaborRate>(
      `INSERT INTO labor_rates (
        labor_category, skill_level, daily_rate_ghs, previous_rate_ghs, rate_change_percent,
        rate_type, unit_description, region, includes_benefits, minimum_hire_period,
        survey_date, source, is_verified, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, labor_category, skill_level, daily_rate_ghs AS rate_ghs, 
                 previous_rate_ghs, rate_change_percent, rate_type, unit_description, 
                 region, includes_benefits, minimum_hire_period, survey_date, source, 
                 is_verified, notes, metadata, created_at, updated_at`,
      [
        input.labor_category, input.skill_level, input.rate_ghs, previousRate, changePercent,
        input.rate_type, input.unit_description || null, input.region,
        input.includes_benefits || false, input.minimum_hire_period || null,
        new Date(), input.source, input.is_verified || false, input.notes || null,
        JSON.stringify(input.metadata || {}),
      ]
    );

    logger.info('Created labor rate', {
      category: input.labor_category,
      rate: input.rate_ghs,
      region: input.region,
    });

    return result.rows[0];
  }

  /**
   * Get latest material prices by category and region
   */
  async getMaterialPrices(
    options: {
      category?: MaterialCategory;
      region?: RegionCode;
      supplier_type?: 'retail' | 'wholesale' | 'manufacturer';
    } = {}
  ): Promise<MaterialPrice[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options.category) {
      conditions.push(`mp.material_category = $${paramIndex++}`);
      params.push(options.category);
    }
    if (options.region) {
      conditions.push(`mp.region = $${paramIndex++}`);
      params.push(options.region);
    }
    if (options.supplier_type) {
      conditions.push(`mp.supplier_type = $${paramIndex++}`);
      params.push(options.supplier_type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get latest price for each material/region combination and derive delta from
    // the most recent prior DIFFERENT price to avoid artificial 0.0% outputs.
    const result = await query<MaterialPrice>(
      `WITH latest AS (
         SELECT DISTINCT ON (mp.material_name, mp.region)
           mp.*
         FROM material_prices mp
         ${whereClause}
         ORDER BY mp.material_name, mp.region, mp.survey_date DESC, mp.created_at DESC
       )
       SELECT
         l.id,
         l.material_category,
         l.material_name,
         l.brand,
         l.specification,
         l.price_ghs,
         COALESCE(p_diff.price_ghs, p_any.price_ghs, l.price_ghs) AS previous_price_ghs,
         CASE
           WHEN p_diff.price_ghs IS NOT NULL AND p_diff.price_ghs <> 0
           THEN ((l.price_ghs - p_diff.price_ghs) / p_diff.price_ghs) * 100
           WHEN p_any.price_ghs IS NOT NULL
           THEN 0
           ELSE 0
         END AS price_change_percent,
         l.unit,
         l.quantity_per_unit,
         l.region,
         l.supplier_type,
         l.supplier_name,
         l.survey_date,
         l.is_verified,
         l.confidence_level,
         l.notes,
         l.metadata,
         l.created_at,
         l.updated_at
       FROM latest l
       LEFT JOIN LATERAL (
         SELECT mp_prev.price_ghs
         FROM material_prices mp_prev
         WHERE mp_prev.material_name = l.material_name
           AND mp_prev.region = l.region
           AND (
             mp_prev.survey_date < l.survey_date
             OR (mp_prev.survey_date = l.survey_date AND mp_prev.created_at < l.created_at)
           )
           AND mp_prev.price_ghs <> l.price_ghs
         ORDER BY mp_prev.survey_date DESC, mp_prev.created_at DESC
         LIMIT 1
       ) p_diff ON true
       LEFT JOIN LATERAL (
         SELECT mp_prev.price_ghs
         FROM material_prices mp_prev
         WHERE mp_prev.material_name = l.material_name
           AND mp_prev.region = l.region
           AND (
             mp_prev.survey_date < l.survey_date
             OR (mp_prev.survey_date = l.survey_date AND mp_prev.created_at < l.created_at)
           )
         ORDER BY mp_prev.survey_date DESC, mp_prev.created_at DESC
         LIMIT 1
       ) p_any ON true
       ORDER BY l.material_name, l.region`,
      params
    );

    return result.rows;
  }

  /**
   * Get latest labor rates by category and region
   */
  async getLaborRates(
    options: {
      category?: LaborCategory;
      skill_level?: 'apprentice' | 'journeyman' | 'master' | 'specialist';
      region?: RegionCode;
    } = {}
  ): Promise<LaborRate[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options.category) {
      conditions.push(`lr.labor_category = $${paramIndex++}`);
      params.push(options.category);
    }
    if (options.skill_level) {
      conditions.push(`lr.skill_level = $${paramIndex++}`);
      params.push(options.skill_level);
    }
    if (options.region) {
      conditions.push(`lr.region = $${paramIndex++}`);
      params.push(options.region);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query<LaborRate>(
      `WITH latest AS (
         SELECT DISTINCT ON (lr.labor_category, lr.skill_level, lr.region)
           lr.*
         FROM labor_rates lr
         ${whereClause}
         ORDER BY lr.labor_category, lr.skill_level, lr.region, lr.survey_date DESC, lr.created_at DESC
       )
       SELECT
         l.id,
         l.labor_category,
         l.skill_level,
         l.daily_rate_ghs AS rate_ghs,
         l.region,
         l.survey_date,
         COALESCE(p_diff.daily_rate_ghs, p_any.daily_rate_ghs, l.daily_rate_ghs) AS previous_rate_ghs,
         CASE
           WHEN p_diff.daily_rate_ghs IS NOT NULL AND p_diff.daily_rate_ghs <> 0
           THEN ((l.daily_rate_ghs - p_diff.daily_rate_ghs) / p_diff.daily_rate_ghs) * 100
           WHEN p_any.daily_rate_ghs IS NOT NULL
           THEN 0
           ELSE 0
         END AS rate_change_percent,
         l.notes
       FROM latest l
       LEFT JOIN LATERAL (
         SELECT lr_prev.daily_rate_ghs
         FROM labor_rates lr_prev
         WHERE lr_prev.labor_category = l.labor_category
           AND lr_prev.skill_level = l.skill_level
           AND lr_prev.region = l.region
           AND (
             lr_prev.survey_date < l.survey_date
             OR (lr_prev.survey_date = l.survey_date AND lr_prev.created_at < l.created_at)
           )
           AND lr_prev.daily_rate_ghs <> l.daily_rate_ghs
         ORDER BY lr_prev.survey_date DESC, lr_prev.created_at DESC
         LIMIT 1
       ) p_diff ON true
       LEFT JOIN LATERAL (
         SELECT lr_prev.daily_rate_ghs
         FROM labor_rates lr_prev
         WHERE lr_prev.labor_category = l.labor_category
           AND lr_prev.skill_level = l.skill_level
           AND lr_prev.region = l.region
           AND (
             lr_prev.survey_date < l.survey_date
             OR (lr_prev.survey_date = l.survey_date AND lr_prev.created_at < l.created_at)
           )
         ORDER BY lr_prev.survey_date DESC, lr_prev.created_at DESC
         LIMIT 1
       ) p_any ON true
       ORDER BY l.labor_category, l.skill_level, l.region`,
      params
    );

    return result.rows;
  }

  /**
   * Get price history for a material
   */
  async getMaterialPriceHistory(
    materialName: string,
    region: RegionCode,
    options: { from?: Date; to?: Date; limit?: number } = {}
  ): Promise<MaterialPrice[]> {
    const conditions = ['material_name = $1', 'region = $2'];
    const params: unknown[] = [materialName, region];
    let paramIndex = 3;

    if (options.from) {
      conditions.push(`survey_date >= $${paramIndex++}`);
      params.push(options.from);
    }
    if (options.to) {
      conditions.push(`survey_date <= $${paramIndex++}`);
      params.push(options.to);
    }

    params.push(options.limit || 52); // Default to 1 year of weekly data

    const result = await query<MaterialPrice>(
      `SELECT * FROM material_prices 
       WHERE ${conditions.join(' AND ')}
       ORDER BY survey_date DESC
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows;
  }

  /**
   * Calculate construction cost estimate using database-driven values
   * Uses calculated base costs from base_costs_per_sqm and regional multipliers
   */
  async estimateConstructionCost(
    propertyType: 'residential' | 'commercial' | 'industrial',
    qualityLevel: 'basic' | 'standard' | 'premium' | 'luxury',
    region: RegionCode,
    builtAreaSqm: number,
    numFloors: number = 1
  ): Promise<ConstructionEstimate & {
    regional_multiplier?: CalculatedRegionalMultiplier;
    data_source?: string;
    base_cost_calculated?: boolean;
  }> {
    // Normalize region code
    const normalizedRegion = region.toLowerCase().replace(/-/g, '_') as RegionCode;

    // 1. Try to get calculated base cost from database (includes regional adjustment)
    const calculatedBaseCost = await this.getCalculatedBaseCost(propertyType, qualityLevel, normalizedRegion);

    // 2. Get regional multiplier for metadata
    const regionalMultiplier = await this.getRegionalMultiplier(normalizedRegion);

    let baseCostPerSqm: number;
    let dataSource: string;
    let baseCalculated: boolean;
    let materialComponent: number;
    let laborComponent: number;
    let overheadComponent: number;

    if (calculatedBaseCost && calculatedBaseCost.cost_ghs > 0) {
      // Use database-calculated base cost (already includes regional adjustment)
      baseCostPerSqm = calculatedBaseCost.cost_ghs;
      dataSource = calculatedBaseCost.calculation_source;
      baseCalculated = calculatedBaseCost.is_calculated;
      materialComponent = calculatedBaseCost.material_component_ghs;
      laborComponent = calculatedBaseCost.labor_component_ghs;
      overheadComponent = calculatedBaseCost.overhead_component_ghs;

      logger.debug('Using calculated base cost', {
        propertyType, qualityLevel, region: normalizedRegion,
        baseCost: baseCostPerSqm, source: dataSource
      });
    } else {
      // Fallback to static base cost + regional multiplier
      const baseKey = `${propertyType}_${qualityLevel}`;
      const staticBaseCost = ConstructionCostService.FALLBACK_BASE_COST_PER_SQM[baseKey] ||
        ConstructionCostService.FALLBACK_BASE_COST_PER_SQM['residential_standard'];

      // Apply regional multiplier to static base cost
      baseCostPerSqm = staticBaseCost * regionalMultiplier.value;
      dataSource = 'static_with_multiplier';
      baseCalculated = false;
      materialComponent = baseCostPerSqm * 0.55;
      laborComponent = baseCostPerSqm * 0.30;
      overheadComponent = baseCostPerSqm * 0.15;

      logger.warn('Using fallback static base cost', {
        propertyType, qualityLevel, region: normalizedRegion,
        staticBase: staticBaseCost, multiplier: regionalMultiplier.value,
        adjustedCost: baseCostPerSqm
      });
    }

    // Apply floor multiplier
    const floorMultiplier = 1 + (numFloors - 1) * 0.05; // 5% increase per additional floor

    // Get current construction index to adjust for inflation (additional adjustment)
    const latestIndex = await this.getLatestConstructionIndex(normalizedRegion);
    const indexMultiplier = latestIndex ? latestIndex.index_value / latestIndex.base_value : 1.0;

    // Final adjusted cost per sqm
    const adjustedCostPerSqm = baseCostPerSqm * floorMultiplier * indexMultiplier;
    const totalCost = adjustedCostPerSqm * builtAreaSqm;

    // Calculate breakdown using component data
    const breakdown = ConstructionCostService.COST_BREAKDOWN;
    const materialsCost = totalCost * breakdown.materials;
    const laborCost = totalCost * breakdown.labor;
    const equipmentCost = totalCost * breakdown.equipment;
    const overheadsCost = totalCost * breakdown.overheads;
    const contingencyCost = totalCost * breakdown.contingency;

    return {
      property_type: propertyType,
      quality_level: qualityLevel,
      region: normalizedRegion,
      built_area_sqm: builtAreaSqm,
      num_floors: numFloors,
      estimates: {
        materials: Math.round(materialsCost),
        labor: Math.round(laborCost),
        equipment: Math.round(equipmentCost),
        overheads: Math.round(overheadsCost),
        contingency: Math.round(contingencyCost),
        total: Math.round(totalCost),
        cost_per_sqm: Math.round(adjustedCostPerSqm),
      },
      breakdown: [
        { category: 'Materials', amount: Math.round(materialsCost), percentage: breakdown.materials * 100 },
        { category: 'Labor', amount: Math.round(laborCost), percentage: breakdown.labor * 100 },
        { category: 'Equipment', amount: Math.round(equipmentCost), percentage: breakdown.equipment * 100 },
        { category: 'Overheads & Profit', amount: Math.round(overheadsCost), percentage: breakdown.overheads * 100 },
        { category: 'Contingency', amount: Math.round(contingencyCost), percentage: breakdown.contingency * 100 },
      ],
      assumptions: [
        'Standard foundation requirements (no piling)',
        'Municipal water and electricity connections available',
        'No abnormal site conditions',
        'Standard specifications for quality level',
        `Prices as of ${new Date().toLocaleDateString('en-GB')}`,
        `Regional multiplier: ${regionalMultiplier.value.toFixed(3)} (${regionalMultiplier.source})`,
        `Construction index multiplier: ${indexMultiplier.toFixed(2)}`,
        `Data source: ${dataSource}`,
      ],
      validity_date: new Date(),
      // Extended fields for transparency
      regional_multiplier: regionalMultiplier,
      data_source: dataSource,
      base_cost_calculated: baseCalculated,
    };
  }

  /**
   * Get latest construction cost index
   */
  async getLatestConstructionIndex(region?: RegionCode): Promise<ConstructionCostIndex | null> {
    try {
      const result = await query<ConstructionCostIndex>(
        `SELECT *, methodology AS calculation_methodology FROM construction_cost_indices 
         WHERE ($1::text IS NULL OR region::text = $1)
         ORDER BY period_end DESC LIMIT 1`,
        [region || null]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // If no index found, calculate it on the fly
      logger.info('No construction index found in database, calculating from market data', { region });
      return await this.calculateCurrentIndex(region);
    } catch (error: any) {
      logger.warn('Could not fetch construction index', { region, error: error.message });
      return null;
    }
  }

  /**
   * Calculate current construction index based on live market data
   */
  async calculateCurrentIndex(region?: RegionCode): Promise<ConstructionCostIndex> {
    logger.info('Starting calculateCurrentIndex', { region });
    const materialIndex = await this.calculateMaterialIndex(region);
    const laborIndex = await this.calculateLaborIndex(region);

    logger.info('Sub-indices calculated', { materialIndex, laborIndex, region });

    // Combine indices based on breakdown weights
    const materialsWeight = ConstructionCostService.COST_BREAKDOWN.materials;
    const laborWeight = ConstructionCostService.COST_BREAKDOWN.labor;
    const othersWeight = 1 - materialsWeight - laborWeight;

    const overallIndexValue = (materialIndex * materialsWeight) +
      (laborIndex * laborWeight) +
      (100 * othersWeight);

    logger.info('Overall index value calculated', { overallIndexValue, region });

    return {
      id: `calc-${Date.now()}`,
      index_name: 'Composite Construction Cost Index',
      index_value: Math.round(overallIndexValue * 10) / 10,
      material_index: Math.round(materialIndex * 10) / 10,
      labor_index: Math.round(laborIndex * 10) / 10,
      overall_index: Math.round(overallIndexValue * 10) / 10,
      base_year: 2024,
      base_value: 100,
      period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      period_end: new Date(),
      change_from_previous: 0,
      change_year_on_year: 0,
      region: region as any,
      property_type: 'residential',
      calculation_methodology: 'Weighted relative average of materials and labor',
      components: [
        { name: 'Materials', weight: ConstructionCostService.COST_BREAKDOWN.materials, value: materialIndex },
        { name: 'Labor', weight: ConstructionCostService.COST_BREAKDOWN.labor, value: laborIndex }
      ],
      source: 'calculated',
      is_official: false,
      notes: 'Calculated from live market price surveys',
      created_at: new Date()
    };
  }

  /**
   * Calculate material index based on weighted average of major materials
   */
  async calculateMaterialIndex(region?: RegionCode): Promise<number> {
    const weights = await this.getMaterialWeights();
    if (weights.length === 0) return 100;

    // Only use material categories, not labor/equipment/overheads/contingency
    const nonMaterialCategories = ['labor', 'equipment', 'overheads', 'contingency'];
    const materialWeights = weights.filter(w => !nonMaterialCategories.includes(w.category));
    if (materialWeights.length === 0) return 100;

    let totalWeightedPrice = 0;
    let totalWeight = 0;

    for (const item of materialWeights) {
      const prices = await this.getMaterialPrices({
        category: item.category as MaterialCategory,
        region
      });

      if (prices.length > 0) {
        const avgPrice = prices.reduce((sum, p) => sum + parseFloat(p.price_ghs as any), 0) / prices.length;
        if (!isNaN(avgPrice)) {
          totalWeightedPrice += avgPrice * item.weight;
          totalWeight += item.weight;
        }
      }
    }

    // Normalize: relative to base price of 100 GHS per unit
    return totalWeight > 0 ? (totalWeightedPrice / totalWeight) : 100;
  }

  /**
   * Calculate labor index based on weighted average of labor rates
   */
  async calculateLaborIndex(region?: RegionCode): Promise<number> {
    const laborRates = await this.getLaborRates({ region });
    if (laborRates.length === 0) return 100;

    const avgRate = laborRates.reduce((sum, l) => sum + parseFloat(l.rate_ghs as any), 0) / laborRates.length;
    if (isNaN(avgRate) || avgRate === 0) return 100;

    // Base rate: average daily rate in 2024 was ~150 GHS
    return (avgRate / 150) * 100;
  }

  /**
   * Create or update construction cost index
   */
  async updateConstructionIndex(input: {
    index_name: string;
    index_value: number;
    material_index?: number;
    labor_index?: number;
    overall_index?: number;
    base_year: number;
    base_value: number;
    period_start: Date;
    period_end: Date;
    region?: RegionCode;
    property_type?: string;
    calculation_methodology?: string;
    components?: Array<{ name: string; weight: number; value: number }>;
    source: string;
    is_official?: boolean;
    notes?: string;
  }): Promise<ConstructionCostIndex> {
    // Get previous index for change calculation
    const previousResult = await query<{ index_value: number; period_end: Date }>(
      `SELECT index_value, period_end FROM construction_cost_indices 
       WHERE index_name = $1 AND ($2::text IS NULL OR region::text = $2)
       ORDER BY period_end DESC LIMIT 1`,
      [input.index_name, input.region || null]
    );

    const previous = previousResult.rows[0];
    const changeFromPrevious = previous
      ? ((input.index_value - previous.index_value) / previous.index_value) * 100
      : null;

    // Calculate YoY change
    const yoyResult = await query<{ index_value: number }>(
      `SELECT index_value FROM construction_cost_indices 
       WHERE index_name = $1 AND ($2::text IS NULL OR region::text = $2)
         AND period_end <= $3::date - INTERVAL '1 year'
       ORDER BY period_end DESC LIMIT 1`,
      [input.index_name, input.region || null, input.period_end]
    );
    const yoyPrevious = yoyResult.rows[0];
    const changeYoY = yoyPrevious
      ? ((input.index_value - yoyPrevious.index_value) / yoyPrevious.index_value) * 100
      : null;

    const result = await query<ConstructionCostIndex>(
      `INSERT INTO construction_cost_indices (
        index_name, index_value, material_index, labor_index, overall_index, 
        base_year, base_value, period_start, period_end, effective_date,
        change_from_previous, change_year_on_year, region, property_type, 
        methodology, components, source, is_official, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (effective_date, region) DO UPDATE SET
        index_value = EXCLUDED.index_value,
        material_index = EXCLUDED.material_index,
        labor_index = EXCLUDED.labor_index,
        overall_index = EXCLUDED.overall_index,
        change_from_previous = EXCLUDED.change_from_previous,
        change_year_on_year = EXCLUDED.change_year_on_year,
        components = EXCLUDED.components,
        updated_at = NOW()
      RETURNING *, methodology AS calculation_methodology`,
      [
        input.index_name, input.index_value, input.material_index || input.index_value,
        input.labor_index || input.index_value, input.overall_index || input.index_value,
        input.base_year, input.base_value, input.period_start, input.period_end, input.period_end,
        changeFromPrevious, changeYoY, input.region || null, input.property_type || null,
        input.calculation_methodology || null, JSON.stringify(input.components || []),
        input.source, input.is_official || false, input.notes || null,
      ]
    );

    logger.info('Updated construction index', {
      name: input.index_name,
      value: input.index_value,
      change: changeFromPrevious,
    });

    return result.rows[0];
  }

  /**
   * Get material price comparison across regions
   */
  async getMaterialPriceComparison(materialName: string): Promise<Array<{
    region: RegionCode;
    price_ghs: number;
    diff_from_average: number;
  }>> {
    const result = await query<{ region: RegionCode; price_ghs: number }>(
      `SELECT DISTINCT ON (region) region, price_ghs
       FROM material_prices 
       WHERE material_name = $1
       ORDER BY region, survey_date DESC`,
      [materialName]
    );

    const prices = result.rows;
    if (prices.length === 0) return [];

    const avgPrice = prices.reduce((sum, p) => sum + p.price_ghs, 0) / prices.length;

    return prices.map(p => ({
      region: p.region,
      price_ghs: p.price_ghs,
      diff_from_average: Math.round(((p.price_ghs - avgPrice) / avgPrice) * 100 * 10) / 10,
    }));
  }

  /**
   * Calculate depreciated replacement cost (for valuation)
   */
  async calculateDepreciatedReplacementCost(
    propertyType: 'residential' | 'commercial' | 'industrial',
    qualityLevel: 'basic' | 'standard' | 'premium' | 'luxury',
    region: RegionCode,
    builtAreaSqm: number,
    ageYears: number,
    condition: 'excellent' | 'good' | 'fair' | 'poor'
  ): Promise<{
    replacement_cost_new: number;
    depreciation_rate: number;
    depreciation_amount: number;
    depreciated_value: number;
    effective_age: number;
    remaining_life: number;
  }> {
    // Get new construction cost
    const estimate = await this.estimateConstructionCost(
      propertyType, qualityLevel, region, builtAreaSqm, 1
    );

    const replacementCostNew = estimate.estimates.total;

    // Determine useful life based on property type and quality
    const usefulLifeYears: Record<string, number> = {
      residential_basic: 40,
      residential_standard: 50,
      residential_premium: 60,
      residential_luxury: 70,
      commercial_basic: 35,
      commercial_standard: 45,
      commercial_premium: 55,
      industrial_basic: 30,
      industrial_standard: 40,
    };

    const lifeKey = `${propertyType}_${qualityLevel}`;
    const totalLife = usefulLifeYears[lifeKey] || 50;

    // Adjust age based on condition (effective age)
    const conditionAdjustments: Record<string, number> = {
      excellent: -5,  // Effectively 5 years younger
      good: 0,
      fair: 5,        // Effectively 5 years older
      poor: 10,
    };
    const effectiveAge = Math.max(0, ageYears + (conditionAdjustments[condition] || 0));

    // Calculate depreciation using straight-line method
    const remainingLife = Math.max(0, totalLife - effectiveAge);
    const depreciationRate = effectiveAge / totalLife;
    const depreciationAmount = replacementCostNew * Math.min(depreciationRate, 0.85); // Max 85% depreciation
    const depreciatedValue = replacementCostNew - depreciationAmount;

    return {
      replacement_cost_new: Math.round(replacementCostNew),
      depreciation_rate: Math.round(depreciationRate * 1000) / 10, // percentage
      depreciation_amount: Math.round(depreciationAmount),
      depreciated_value: Math.round(depreciatedValue),
      effective_age: effectiveAge,
      remaining_life: remainingLife,
    };
  }

  /**
   * Seed initial construction cost data
   */
  async seedInitialData(): Promise<void> {
    const regions: RegionCode[] = ['greater_accra', 'kumasi_metro', 'eastern', 'western_cluster', 'northern_cluster'];

    // Seed material prices
    const materials: Array<Omit<CreateMaterialPriceInput, 'region'>> = [
      // Cement
      { material_category: 'cement', material_name: 'Portland Cement 42.5R', brand: 'Ghacem', price_ghs: 95, unit: 'bag', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'cement', material_name: 'Portland Cement 42.5R', brand: 'Diamond', price_ghs: 92, unit: 'bag', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'cement', material_name: 'Portland Cement 32.5R', brand: 'Ghacem', price_ghs: 85, unit: 'bag', quantity_per_unit: 1, supplier_type: 'retail' },

      // Steel
      { material_category: 'steel', material_name: 'Iron Rod 12mm', specification: '12m length', price_ghs: 85, unit: 'length', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'steel', material_name: 'Iron Rod 16mm', specification: '12m length', price_ghs: 145, unit: 'length', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'steel', material_name: 'Iron Rod 8mm', specification: '12m length', price_ghs: 45, unit: 'length', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'steel', material_name: 'BRC Mesh', specification: '6mm', price_ghs: 950, unit: 'piece', quantity_per_unit: 1, supplier_type: 'retail' },

      // Blocks
      { material_category: 'blocks', material_name: 'Sandcrete Block 6"', specification: '150mm', price_ghs: 8.5, unit: 'piece', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'blocks', material_name: 'Sandcrete Block 5"', specification: '125mm', price_ghs: 6.5, unit: 'piece', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'blocks', material_name: 'Sandcrete Block 4"', specification: '100mm', price_ghs: 5.0, unit: 'piece', quantity_per_unit: 1, supplier_type: 'retail' },

      // Aggregates
      { material_category: 'sand', material_name: 'Sharp Sand', specification: 'Per trip (10 tons)', price_ghs: 2500, unit: 'trip', quantity_per_unit: 10, supplier_type: 'wholesale' },
      { material_category: 'gravel', material_name: 'Gravel 3/4"', specification: 'Per trip (10 tons)', price_ghs: 3200, unit: 'trip', quantity_per_unit: 10, supplier_type: 'wholesale' },
      { material_category: 'gravel', material_name: 'Gravel 1/2"', specification: 'Per trip (10 tons)', price_ghs: 3000, unit: 'trip', quantity_per_unit: 10, supplier_type: 'wholesale' },

      // Roofing
      { material_category: 'roofing', material_name: 'Aluminum Roofing Sheet', specification: '0.55mm thick', price_ghs: 280, unit: 'length', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'roofing', material_name: 'Step Tile Roofing', specification: 'Long span', price_ghs: 350, unit: 'sqm', quantity_per_unit: 1, supplier_type: 'retail' },

      // Tiles
      { material_category: 'tiles', material_name: 'Ceramic Floor Tile', specification: '40x40cm', price_ghs: 85, unit: 'sqm', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'tiles', material_name: 'Porcelain Tile', specification: '60x60cm', price_ghs: 150, unit: 'sqm', quantity_per_unit: 1, supplier_type: 'retail' },
      { material_category: 'tiles', material_name: 'Wall Tile', specification: '25x40cm', price_ghs: 65, unit: 'sqm', quantity_per_unit: 1, supplier_type: 'retail' },
    ];

    // Seed labor rates
    const laborRates: Array<Omit<CreateLaborRateInput, 'region'>> = [
      { labor_category: 'mason', skill_level: 'journeyman', rate_ghs: 200, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'mason', skill_level: 'master', rate_ghs: 300, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'carpenter', skill_level: 'journeyman', rate_ghs: 180, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'carpenter', skill_level: 'master', rate_ghs: 280, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'plumber', skill_level: 'journeyman', rate_ghs: 220, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'electrician', skill_level: 'journeyman', rate_ghs: 250, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'painter', skill_level: 'journeyman', rate_ghs: 150, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'welder', skill_level: 'journeyman', rate_ghs: 220, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'tiler', skill_level: 'journeyman', rate_ghs: 200, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'general_laborer', skill_level: 'journeyman', rate_ghs: 80, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'foreman', skill_level: 'master', rate_ghs: 400, rate_type: 'daily', source: 'Market Survey' },
      { labor_category: 'site_engineer', skill_level: 'specialist', rate_ghs: 800, rate_type: 'daily', source: 'Market Survey' },
    ];

    // Insert data for each region
    for (const region of regions) {
      const regionMultiplier = ConstructionCostService.FALLBACK_REGION_MULTIPLIERS[region] || 1.0;

      for (const material of materials) {
        try {
          await this.createMaterialPrice({
            ...material,
            region,
            price_ghs: Math.round(material.price_ghs * regionMultiplier * 100) / 100,
          });
        } catch (error) {
          logger.debug('Material price may already exist', { material: material.material_name, region });
        }
      }

      for (const labor of laborRates) {
        try {
          await this.createLaborRate({
            ...labor,
            region,
            rate_ghs: Math.round(labor.rate_ghs * regionMultiplier),
          });
        } catch (error) {
          logger.debug('Labor rate may already exist', { category: labor.labor_category, region });
        }
      }
    }

    // Create initial construction cost index
    const now = new Date();
    await this.updateConstructionIndex({
      index_name: 'Ghana Construction Cost Index',
      index_value: 115.5,
      base_year: 2020,
      base_value: 100,
      period_start: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      period_end: new Date(now.getFullYear(), now.getMonth(), 0),
      source: 'Ghana Statistical Service',
      is_official: true,
      components: [
        { name: 'Materials', weight: 0.55, value: 118.2 },
        { name: 'Labor', weight: 0.30, value: 112.5 },
        { name: 'Equipment', weight: 0.10, value: 108.3 },
        { name: 'Overheads', weight: 0.05, value: 115.0 },
      ],
    });

    logger.info('Construction cost data seeded successfully');
  }

  // ============================================
  // Valuation Configuration (Admin)
  // ============================================

  /**
   * Get material category weights from database with fallback
   */
  async getMaterialWeights(): Promise<Array<{
    category: string;
    display_name: string;
    weight: number;
    updated_at: string;
  }>> {
    try {
      const result = await query<{
        category: string;
        percentage: number;
        description: string;
        updated_at: Date;
      }>(
        'SELECT category, percentage, description, updated_at FROM cost_breakdown ORDER BY display_order ASC'
      );

      if (result.rows.length === 0) {
        return this.getFallbackWeights();
      }

      return result.rows.map(row => ({
        category: row.category,
        display_name: row.description,
        weight: parseFloat(row.percentage as any),
        updated_at: row.updated_at.toISOString(),
      }));
    } catch (error) {
      // If table doesn't exist or other error, use fallback weights
      logger.info('Using fallback material weights (table cost_breakdown may be missing)');
      return this.getFallbackWeights();
    }
  }

  /**
   * Default cost breakdown weights for Ghana construction
   */
  private getFallbackWeights() {
    // Aligned with RICS elemental analysis + GSS PBCI structure for Ghana
    // Materials 55% + Labor 30% + Equipment 5% + Overheads 7% + Contingency 3% = 100%
    const now = new Date().toISOString();
    return [
      { category: 'cement',      display_name: 'Cement & Binding Agents',    weight: 0.12, updated_at: now },
      { category: 'steel',       display_name: 'Steel & Reinforcement',      weight: 0.10, updated_at: now },
      { category: 'blocks',      display_name: 'Blocks & Masonry',           weight: 0.08, updated_at: now },
      { category: 'sand',        display_name: 'Sand & Aggregates',          weight: 0.04, updated_at: now },
      { category: 'gravel',      display_name: 'Gravel & Stones',            weight: 0.03, updated_at: now },
      { category: 'timber',      display_name: 'Timber & Formwork',          weight: 0.05, updated_at: now },
      { category: 'roofing',     display_name: 'Roofing',                    weight: 0.06, updated_at: now },
      { category: 'finishing',   display_name: 'Finishing & Painting',        weight: 0.04, updated_at: now },
      { category: 'plumbing',    display_name: 'Plumbing & Sanitary',        weight: 0.02, updated_at: now },
      { category: 'electrical',  display_name: 'Electrical Works',           weight: 0.01, updated_at: now },
      { category: 'labor',       display_name: 'Labor',                      weight: 0.30, updated_at: now },
      { category: 'equipment',   display_name: 'Equipment & Plant',          weight: 0.05, updated_at: now },
      { category: 'overheads',   display_name: 'Overheads & Profit',         weight: 0.07, updated_at: now },
      { category: 'contingency', display_name: 'Contingency',                weight: 0.03, updated_at: now },
    ];
  }

  /**
   * Update material category weight
   */
  async updateMaterialWeight(category: string, weight: number, updatedBy?: string): Promise<void> {
    await query(
      'UPDATE cost_breakdown SET percentage = $1, updated_at = NOW() WHERE category = $2',
      [weight, category]
    );

    logger.info('Updated material weight', { category, weight, updatedBy });
  }

  /**
   * Get regional location factors from database
   */
  async getRegionalFactors(): Promise<Array<{
    region_code: string;
    region_name: string;
    location_factor: number;
    updated_at: string;
  }>> {
    const result = await query<{
      region: string;
      multiplier: number;
      description: string;
      updated_at: Date;
    }>(
      'SELECT region, multiplier, description, updated_at FROM region_multipliers ORDER BY region ASC'
    );

    return result.rows.map(row => ({
      region_code: row.region,
      region_name: row.description || row.region,
      location_factor: parseFloat(row.multiplier as any),
      updated_at: row.updated_at.toISOString(),
    }));
  }

  /**
   * Get single regional factor
   */
  async getRegionalFactor(regionCode: string): Promise<{ name: string; factor: number } | null> {
    const result = await query<{ description: string; multiplier: number }>(
      'SELECT description, multiplier FROM region_multipliers WHERE region = $1',
      [regionCode]
    );

    if (result.rows.length === 0) return null;

    return {
      name: result.rows[0].description,
      factor: parseFloat(result.rows[0].multiplier as any),
    };
  }

  /**
   * Update regional location factor
   */
  async updateRegionalFactor(regionCode: string, locationFactor: number, updatedBy?: string): Promise<void> {
    await query(
      'UPDATE region_multipliers SET multiplier = $1, updated_at = NOW() WHERE region = $2',
      [locationFactor, regionCode]
    );

    logger.info('Updated regional factor', { regionCode, locationFactor, updatedBy });
  }

  /**
   * Get base construction costs per sqm from database
   */
  async getBaseCosts(propertyType?: string, region?: string): Promise<Array<{
    quality_tier: string;
    display_name: string;
    base_cost_per_sqm: number;
    base_year: number;
    updated_at: string;
    property_type: string;
    region: string;
  }>> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (propertyType) {
      conditions.push(`property_type = $${paramIdx++}`);
      params.push(propertyType);
    } else {
      conditions.push(`property_type = 'residential'`);
    }

    if (region) {
      conditions.push(`region = $${paramIdx++}`);
      params.push(region);
    } else {
      // Default to Greater Accra as the reference region for base costs
      conditions.push(`region = 'greater_accra'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query<{
      quality_level: string;
      cost_ghs: number;
      notes: string;
      updated_at: Date;
      property_type: string;
      region: string;
    }>(
      `SELECT quality_level, cost_ghs, notes, updated_at, property_type, region FROM base_costs_per_sqm ${whereClause} ORDER BY cost_ghs ASC`,
      params
    );

    const tierDisplayNames: Record<string, string> = {
      substandard: 'Substandard - Minimal finish',
      basic: 'Basic - Standard residential finish',
      standard: 'Standard - Mid-range finish with fittings',
      premium: 'Premium - High-quality materials and finishes',
      luxury: 'Luxury - Top-tier imported materials',
    };

    return result.rows.map(row => ({
      quality_tier: row.quality_level,
      display_name: row.notes || tierDisplayNames[row.quality_level] || row.quality_level,
      base_cost_per_sqm: parseFloat(row.cost_ghs as any),
      base_year: new Date().getFullYear(),
      updated_at: row.updated_at.toISOString(),
      property_type: row.property_type,
      region: row.region,
    }));
  }

  /**
   * Update base construction cost
   */
  async updateBaseCost(qualityTier: string, baseCostPerSqm: number, updatedBy?: string): Promise<void> {
    await query(
      'UPDATE base_costs_per_sqm SET cost_ghs = $1, updated_at = NOW() WHERE quality_level = $2 AND property_type = \'residential\'',
      [baseCostPerSqm, qualityTier]
    );

    logger.info('Updated base cost', { qualityTier, baseCostPerSqm, updatedBy });
  }

  /**
   * Get comparable sale price per sqm from real market evidence
   * Queries the properties table with quality filtering:
   * - Only GHS-denominated listings (consistent currency)
   * - Area >= 30 sqm (excludes bad data entries)
   * - Price/sqm between 500-200,000 (excludes extreme outliers)
   * Returns median, average, and percentiles by property_type
   */
  async getComparablePricePerSqm(region?: string, propertyType?: string): Promise<Array<{
    property_type: string;
    region: string;
    median_price_sqm: number;
    avg_price_sqm: number;
    p25_price_sqm: number;
    p75_price_sqm: number;
    comparable_count: number;
    evidence_basis: string;
  }>> {
    const conditions: string[] = [
      `p.total_area_sqm >= 30`,
      `COALESCE(p.sold_price, p.transaction_value, p.inferred_sale_price, p.price) > 0`,
      `p.price_currency = 'GHS'`,
      `(COALESCE(p.sold_price, p.transaction_value, p.inferred_sale_price, p.price) / p.total_area_sqm) BETWEEN 500 AND 200000`,
    ];
    const params: any[] = [];
    let paramIdx = 1;

    if (region) {
      conditions.push(`p.region = $${paramIdx++}`);
      params.push(region);
    }
    if (propertyType) {
      conditions.push(`p.property_type = $${paramIdx++}`);
      params.push(propertyType);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const result = await query<{
      property_type: string;
      region: string;
      median_price_sqm: number;
      avg_price_sqm: number;
      p25_price_sqm: number;
      p75_price_sqm: number;
      comparable_count: number;
    }>(
      `SELECT 
        p.property_type,
        p.region,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY COALESCE(p.sold_price, p.transaction_value, p.inferred_sale_price, p.price) / p.total_area_sqm
        )::numeric, 0) as median_price_sqm,
        ROUND(AVG(COALESCE(p.sold_price, p.transaction_value, p.inferred_sale_price, p.price) / p.total_area_sqm)::numeric, 0) as avg_price_sqm,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (
          ORDER BY COALESCE(p.sold_price, p.transaction_value, p.inferred_sale_price, p.price) / p.total_area_sqm
        )::numeric, 0) as p25_price_sqm,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (
          ORDER BY COALESCE(p.sold_price, p.transaction_value, p.inferred_sale_price, p.price) / p.total_area_sqm
        )::numeric, 0) as p75_price_sqm,
        COUNT(*)::int as comparable_count
      FROM properties p
      ${whereClause}
      GROUP BY p.property_type, p.region
      ORDER BY p.property_type`,
      params
    );

    return result.rows.map(row => ({
      property_type: row.property_type,
      region: row.region,
      median_price_sqm: parseFloat(row.median_price_sqm as any),
      avg_price_sqm: parseFloat(row.avg_price_sqm as any),
      p25_price_sqm: parseFloat(row.p25_price_sqm as any),
      p75_price_sqm: parseFloat(row.p75_price_sqm as any),
      comparable_count: row.comparable_count,
      evidence_basis: 'Comparable market evidence (GHS listings)',
    }));
  }
}

export const constructionCostService = new ConstructionCostService();
