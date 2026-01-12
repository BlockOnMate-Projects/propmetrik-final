/**
 * Base Cost Calculation Service
 * 
 * Automatically calculates regional base construction costs per square meter
 * from real market data:
 * - Material prices × Category weights
 * - Labor rates by skill level
 * - Regional cost multipliers
 * - Economic adjustments (CPI, FX rates)
 * 
 * This replaces hardcoded base costs with data-driven calculations
 * that feed into the valuation engine.
 */

import { query, transaction } from '../../database';
import { logger } from '../../utils/logger';
import { economicDataService } from './economicDataService';
import { constructionCostService } from './constructionCostService';

// =====================================================
// TYPES
// =====================================================

export type PropertyType = 'residential' | 'commercial' | 'industrial';
export type QualityLevel = 'basic' | 'standard' | 'premium' | 'luxury';
export type RegionCode = 
  | 'greater_accra' | 'ashanti' | 'western' | 'eastern' | 'central'
  | 'volta' | 'northern' | 'upper_east' | 'upper_west' | 'bono'
  | 'bono_east' | 'ahafo' | 'savannah' | 'north_east' | 'oti' | 'western_north';

export interface BaseCostInput {
  property_type: PropertyType;
  quality_level: QualityLevel;
  region: RegionCode;
}

export interface CalculatedBaseCost {
  property_type: PropertyType;
  quality_level: QualityLevel;
  region: RegionCode;
  cost_ghs: number;
  material_component_ghs: number;
  labor_component_ghs: number;
  overhead_component_ghs: number;
  cpi_adjustment_factor: number;
  fx_adjustment_factor: number;
  calculation_source: string;
}

export interface MaterialCategoryWeight {
  category: string;
  weight: number;
}

export interface RegionalMultiplier {
  region: string;
  material_multiplier: number;
  labor_multiplier: number;
  transport_multiplier: number;
  combined_multiplier: number;
}

export interface CalculationResult {
  success: boolean;
  regions_calculated: number;
  property_types: number;
  quality_levels: number;
  total_records: number;
  errors: string[];
  calculation_date: Date;
}

// =====================================================
// CONFIGURATION
// =====================================================

/**
 * Standard material quantities per sqm by property type and quality
 * Based on Quantity Surveyor takeoff standards for Ghana
 */
const MATERIAL_QUANTITIES_PER_SQM: Record<PropertyType, Record<QualityLevel, Record<string, number>>> = {
  residential: {
    basic: {
      cement: 0.8,      // bags
      steel: 12,        // kg
      blocks: 12,       // pieces
      sand: 0.05,       // cubic meters
      roofing: 1.2,     // sqm of roof
      plumbing: 0.15,   // fixture units
      electrical: 0.12, // points
      paint: 0.3,       // liters
      tiles: 0.3,       // sqm
      timber: 0.02,     // cubic meters
    },
    standard: {
      cement: 1.0,
      steel: 18,
      blocks: 14,
      sand: 0.06,
      roofing: 1.3,
      plumbing: 0.25,
      electrical: 0.18,
      paint: 0.4,
      tiles: 0.5,
      timber: 0.03,
    },
    premium: {
      cement: 1.3,
      steel: 25,
      blocks: 16,
      sand: 0.07,
      roofing: 1.4,
      plumbing: 0.35,
      electrical: 0.25,
      paint: 0.5,
      tiles: 0.8,
      timber: 0.05,
    },
    luxury: {
      cement: 1.6,
      steel: 35,
      blocks: 18,
      sand: 0.08,
      roofing: 1.5,
      plumbing: 0.50,
      electrical: 0.35,
      paint: 0.6,
      tiles: 1.2,
      timber: 0.08,
    },
  },
  commercial: {
    basic: {
      cement: 1.0,
      steel: 20,
      blocks: 14,
      sand: 0.06,
      roofing: 1.0,
      plumbing: 0.20,
      electrical: 0.25,
      paint: 0.35,
      tiles: 0.6,
      timber: 0.02,
    },
    standard: {
      cement: 1.3,
      steel: 30,
      blocks: 16,
      sand: 0.08,
      roofing: 1.2,
      plumbing: 0.30,
      electrical: 0.35,
      paint: 0.45,
      tiles: 0.9,
      timber: 0.03,
    },
    premium: {
      cement: 1.6,
      steel: 40,
      blocks: 18,
      sand: 0.10,
      roofing: 1.3,
      plumbing: 0.45,
      electrical: 0.50,
      paint: 0.55,
      tiles: 1.2,
      timber: 0.05,
    },
    luxury: {
      cement: 2.0,
      steel: 50,
      blocks: 20,
      sand: 0.12,
      roofing: 1.4,
      plumbing: 0.60,
      electrical: 0.65,
      paint: 0.65,
      tiles: 1.5,
      timber: 0.08,
    },
  },
  industrial: {
    basic: {
      cement: 0.6,
      steel: 25,
      blocks: 10,
      sand: 0.08,
      roofing: 1.5,
      plumbing: 0.10,
      electrical: 0.15,
      paint: 0.2,
      tiles: 0.1,
      timber: 0.01,
    },
    standard: {
      cement: 0.8,
      steel: 35,
      blocks: 12,
      sand: 0.10,
      roofing: 1.6,
      plumbing: 0.15,
      electrical: 0.25,
      paint: 0.25,
      tiles: 0.2,
      timber: 0.02,
    },
    premium: {
      cement: 1.0,
      steel: 45,
      blocks: 14,
      sand: 0.12,
      roofing: 1.7,
      plumbing: 0.25,
      electrical: 0.35,
      paint: 0.3,
      tiles: 0.4,
      timber: 0.03,
    },
    luxury: {
      cement: 1.2,
      steel: 55,
      blocks: 16,
      sand: 0.14,
      roofing: 1.8,
      plumbing: 0.35,
      electrical: 0.45,
      paint: 0.35,
      tiles: 0.6,
      timber: 0.04,
    },
  },
};

/**
 * Labor person-days per sqm by property type and quality
 */
const LABOR_DAYS_PER_SQM: Record<PropertyType, Record<QualityLevel, Record<string, number>>> = {
  residential: {
    basic: {
      mason: 0.15,
      carpenter: 0.08,
      plumber: 0.04,
      electrician: 0.04,
      painter: 0.06,
      general_laborer: 0.25,
      tiler: 0.03,
    },
    standard: {
      mason: 0.20,
      carpenter: 0.12,
      plumber: 0.06,
      electrician: 0.06,
      painter: 0.08,
      general_laborer: 0.30,
      tiler: 0.05,
    },
    premium: {
      mason: 0.25,
      carpenter: 0.18,
      plumber: 0.10,
      electrician: 0.10,
      painter: 0.12,
      general_laborer: 0.35,
      tiler: 0.08,
    },
    luxury: {
      mason: 0.30,
      carpenter: 0.25,
      plumber: 0.15,
      electrician: 0.15,
      painter: 0.18,
      general_laborer: 0.40,
      tiler: 0.12,
    },
  },
  commercial: {
    basic: {
      mason: 0.18,
      carpenter: 0.10,
      plumber: 0.06,
      electrician: 0.08,
      painter: 0.05,
      general_laborer: 0.28,
      tiler: 0.05,
    },
    standard: {
      mason: 0.22,
      carpenter: 0.15,
      plumber: 0.10,
      electrician: 0.12,
      painter: 0.08,
      general_laborer: 0.32,
      tiler: 0.08,
    },
    premium: {
      mason: 0.28,
      carpenter: 0.22,
      plumber: 0.15,
      electrician: 0.18,
      painter: 0.12,
      general_laborer: 0.38,
      tiler: 0.12,
    },
    luxury: {
      mason: 0.35,
      carpenter: 0.30,
      plumber: 0.22,
      electrician: 0.25,
      painter: 0.18,
      general_laborer: 0.45,
      tiler: 0.18,
    },
  },
  industrial: {
    basic: {
      mason: 0.10,
      carpenter: 0.05,
      plumber: 0.03,
      electrician: 0.05,
      painter: 0.03,
      general_laborer: 0.30,
      welder: 0.08,
    },
    standard: {
      mason: 0.12,
      carpenter: 0.08,
      plumber: 0.05,
      electrician: 0.08,
      painter: 0.04,
      general_laborer: 0.35,
      welder: 0.12,
    },
    premium: {
      mason: 0.15,
      carpenter: 0.10,
      plumber: 0.08,
      electrician: 0.12,
      painter: 0.05,
      general_laborer: 0.40,
      welder: 0.15,
    },
    luxury: {
      mason: 0.18,
      carpenter: 0.12,
      plumber: 0.10,
      electrician: 0.15,
      painter: 0.06,
      general_laborer: 0.45,
      welder: 0.18,
    },
  },
};

/**
 * Overhead percentages by quality level
 */
const OVERHEAD_PERCENTAGES: Record<QualityLevel, number> = {
  basic: 0.15,    // 15% overhead
  standard: 0.18, // 18% overhead
  premium: 0.22,  // 22% overhead
  luxury: 0.28,   // 28% overhead (includes higher profit margins)
};

// Base CPI reference (January 2020 = 100)
const BASE_CPI_VALUE = 100;
const BASE_CPI_DATE = new Date('2020-01-01');

// =====================================================
// SERVICE CLASS
// =====================================================

export class BaseCostCalculationService {
  
  /**
   * Recalculate all base costs for all regions, property types, and quality levels
   */
  async recalculateAllBaseCosts(): Promise<CalculationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let totalRecords = 0;
    
    const propertyTypes: PropertyType[] = ['residential', 'commercial', 'industrial'];
    const qualityLevels: QualityLevel[] = ['basic', 'standard', 'premium', 'luxury'];
    
    logger.info('[BaseCostCalculation] Starting full recalculation...');

    try {
      // 1. Get current economic data
      const economicData = await this.getEconomicAdjustments();
      logger.info('[BaseCostCalculation] Economic adjustments', economicData);

      // 2. Get material prices (Greater Accra as base)
      const materialPrices = await this.getAverageMaterialPrices();
      logger.info('[BaseCostCalculation] Material prices loaded', { count: Object.keys(materialPrices).length });

      // 3. Get labor rates (Greater Accra as base)
      const laborRates = await this.getAverageLaborRates();
      logger.info('[BaseCostCalculation] Labor rates loaded', { count: Object.keys(laborRates).length });

      // 4. Get category weights
      const categoryWeights = await this.getMaterialCategoryWeights();
      logger.info('[BaseCostCalculation] Category weights loaded', { count: categoryWeights.length });

      // 5. Get regional multipliers
      const regionalMultipliers = await this.getRegionalMultipliers();
      logger.info('[BaseCostCalculation] Regional multipliers loaded', { count: regionalMultipliers.length });

      // 6. Calculate base costs for each combination
      const calculatedCosts: CalculatedBaseCost[] = [];

      for (const region of regionalMultipliers) {
        for (const propertyType of propertyTypes) {
          for (const qualityLevel of qualityLevels) {
            try {
              const cost = await this.calculateSingleBaseCost({
                property_type: propertyType,
                quality_level: qualityLevel,
                region: region.region as RegionCode,
                materialPrices,
                laborRates,
                categoryWeights,
                regionalMultiplier: region,
                economicData,
              });
              
              calculatedCosts.push(cost);
              totalRecords++;
            } catch (error) {
              const msg = `Failed to calculate ${propertyType}/${qualityLevel}/${region.region}: ${error}`;
              errors.push(msg);
              logger.error('[BaseCostCalculation]', { error: msg });
            }
          }
        }
      }

      // 7. Save all calculated costs to database
      await this.saveCalculatedCosts(calculatedCosts);

      // 8. Log calculation history
      await this.logCalculation(calculatedCosts, economicData);

      const duration = Date.now() - startTime;
      logger.info('[BaseCostCalculation] Recalculation complete', {
        totalRecords,
        duration: `${duration}ms`,
        errors: errors.length,
      });

      return {
        success: errors.length === 0,
        regions_calculated: regionalMultipliers.length,
        property_types: propertyTypes.length,
        quality_levels: qualityLevels.length,
        total_records: totalRecords,
        errors,
        calculation_date: new Date(),
      };
    } catch (error) {
      logger.error('[BaseCostCalculation] Recalculation failed', { error });
      throw error;
    }
  }

  /**
   * Calculate base cost for a single combination
   */
  private async calculateSingleBaseCost(params: {
    property_type: PropertyType;
    quality_level: QualityLevel;
    region: RegionCode;
    materialPrices: Record<string, number>;
    laborRates: Record<string, number>;
    categoryWeights: MaterialCategoryWeight[];
    regionalMultiplier: RegionalMultiplier;
    economicData: { cpi_factor: number; fx_factor: number };
  }): Promise<CalculatedBaseCost> {
    const {
      property_type,
      quality_level,
      region,
      materialPrices,
      laborRates,
      categoryWeights,
      regionalMultiplier,
      economicData,
    } = params;

    // Get quantities for this property/quality combination
    const materialQuantities = MATERIAL_QUANTITIES_PER_SQM[property_type][quality_level];
    const laborDays = LABOR_DAYS_PER_SQM[property_type][quality_level];

    // =====================================================
    // MATERIAL COST COMPONENT
    // =====================================================
    let materialCost = 0;
    const weightMap = new Map(categoryWeights.map(w => [w.category.toLowerCase(), w.weight]));

    for (const [category, quantity] of Object.entries(materialQuantities)) {
      const pricePerUnit = materialPrices[category] || 0;
      const weight = weightMap.get(category) || 0.05; // Default 5% if not found
      
      // Cost = quantity * price * weight adjustment
      // Weight affects how much this category influences total cost
      const categoryCost = quantity * pricePerUnit * (1 + weight);
      materialCost += categoryCost;
    }

    // Apply regional material multiplier
    materialCost *= regionalMultiplier.material_multiplier;

    // =====================================================
    // LABOR COST COMPONENT
    // =====================================================
    let laborCost = 0;

    for (const [laborType, days] of Object.entries(laborDays)) {
      const dailyRate = laborRates[laborType] || laborRates['general_laborer'] || 80;
      laborCost += days * dailyRate;
    }

    // Apply regional labor multiplier
    laborCost *= regionalMultiplier.labor_multiplier;

    // =====================================================
    // OVERHEAD COMPONENT
    // =====================================================
    const overheadRate = OVERHEAD_PERCENTAGES[quality_level];
    const subtotal = materialCost + laborCost;
    const overheadCost = subtotal * overheadRate;

    // =====================================================
    // ECONOMIC ADJUSTMENTS
    // =====================================================
    // Apply CPI inflation adjustment
    const cpiAdjustedTotal = (subtotal + overheadCost) * economicData.cpi_factor;
    
    // Apply FX adjustment for imported materials (affects ~30% of material costs)
    const fxAdjustment = materialCost * 0.30 * (economicData.fx_factor - 1);
    const finalCost = cpiAdjustedTotal + fxAdjustment;

    return {
      property_type,
      quality_level,
      region,
      cost_ghs: Math.round(finalCost * 100) / 100,
      material_component_ghs: Math.round(materialCost * 100) / 100,
      labor_component_ghs: Math.round(laborCost * 100) / 100,
      overhead_component_ghs: Math.round(overheadCost * 100) / 100,
      cpi_adjustment_factor: economicData.cpi_factor,
      fx_adjustment_factor: economicData.fx_factor,
      calculation_source: 'baseCostCalculationService',
    };
  }

  /**
   * Get average material prices by category from database
   */
  private async getAverageMaterialPrices(): Promise<Record<string, number>> {
    const result = await query<{ category: string; avg_price: number }>(`
      SELECT 
        category::text as category,
        AVG(price_ghs) as avg_price
      FROM material_prices
      WHERE effective_date >= NOW() - INTERVAL '90 days'
      GROUP BY category
    `);

    const prices: Record<string, number> = {};
    for (const row of result.rows) {
      prices[row.category.toLowerCase()] = Number(row.avg_price);
    }

    // Ensure we have fallback prices for essential categories
    const fallbackPrices: Record<string, number> = {
      cement: 95,
      steel: 18,
      blocks: 8,
      sand: 1200,
      roofing: 180,
      plumbing: 150,
      electrical: 120,
      paint: 85,
      tiles: 120,
      timber: 450,
      gravel: 800,
    };

    for (const [category, fallback] of Object.entries(fallbackPrices)) {
      if (!prices[category]) {
        prices[category] = fallback;
        logger.warn(`[BaseCostCalculation] Using fallback price for ${category}`);
      }
    }

    return prices;
  }

  /**
   * Get average labor rates by category from database
   */
  private async getAverageLaborRates(): Promise<Record<string, number>> {
    const result = await query<{ category: string; avg_rate: number }>(`
      SELECT 
        category as category,
        AVG(daily_rate_ghs) as avg_rate
      FROM labor_rates
      WHERE effective_date >= NOW() - INTERVAL '90 days'
      GROUP BY category
    `);

    const rates: Record<string, number> = {};
    for (const row of result.rows) {
      rates[row.category.toLowerCase()] = Number(row.avg_rate);
    }

    // Fallback rates based on GSS minimum wage calculations
    const fallbackRates: Record<string, number> = {
      general_laborer: 80,
      mason: 150,
      carpenter: 160,
      plumber: 180,
      electrician: 200,
      painter: 120,
      welder: 180,
      tiler: 160,
      foreman: 250,
    };

    for (const [category, fallback] of Object.entries(fallbackRates)) {
      if (!rates[category]) {
        rates[category] = fallback;
        logger.warn(`[BaseCostCalculation] Using fallback rate for ${category}`);
      }
    }

    return rates;
  }

  /**
   * Get material category weights from database
   */
  private async getMaterialCategoryWeights(): Promise<MaterialCategoryWeight[]> {
    const result = await query<MaterialCategoryWeight>(`
      SELECT category, weight
      FROM material_category_weights
      ORDER BY weight DESC
    `);

    if (result.rows.length === 0) {
      // Return default weights if table is empty
      return [
        { category: 'cement', weight: 0.25 },
        { category: 'steel', weight: 0.20 },
        { category: 'blocks', weight: 0.10 },
        { category: 'roofing', weight: 0.08 },
        { category: 'sand', weight: 0.075 },
        { category: 'gravel', weight: 0.075 },
        { category: 'timber', weight: 0.06 },
        { category: 'tiles', weight: 0.05 },
        { category: 'plumbing', weight: 0.05 },
        { category: 'paint', weight: 0.04 },
        { category: 'electrical', weight: 0.03 },
      ];
    }

    return result.rows.map(row => ({
      category: row.category,
      weight: Number(row.weight),
    }));
  }

  /**
   * Get regional cost multipliers from database
   */
  private async getRegionalMultipliers(): Promise<RegionalMultiplier[]> {
    const result = await query<RegionalMultiplier>(`
      SELECT 
        region,
        material_multiplier,
        labor_multiplier,
        transport_multiplier,
        combined_multiplier
      FROM regional_cost_multipliers
      ORDER BY combined_multiplier DESC
    `);

    return result.rows.map(row => ({
      region: row.region,
      material_multiplier: Number(row.material_multiplier),
      labor_multiplier: Number(row.labor_multiplier),
      transport_multiplier: Number(row.transport_multiplier),
      combined_multiplier: Number(row.combined_multiplier),
    }));
  }

  /**
   * Get economic adjustment factors
   */
  private async getEconomicAdjustments(): Promise<{ cpi_factor: number; fx_factor: number }> {
    try {
      // Get latest CPI
      const cpiIndicator = await economicDataService.getLatest('cpi_index');
      const currentCpi = cpiIndicator?.value || 145; // Default if not found
      const cpi_factor = currentCpi / BASE_CPI_VALUE;

      // Get latest USD/GHS exchange rate
      const fxIndicator = await economicDataService.getLatest('exchange_rate_usd');
      const currentFx = fxIndicator?.value || 15.5;
      const baseFx = 5.5; // Base rate from January 2020
      const fx_factor = currentFx / baseFx;

      return {
        cpi_factor: Math.round(cpi_factor * 1000) / 1000,
        fx_factor: Math.round(fx_factor * 1000) / 1000,
      };
    } catch (error) {
      logger.warn('[BaseCostCalculation] Failed to get economic data, using defaults', { error });
      return {
        cpi_factor: 1.45, // ~45% inflation since 2020
        fx_factor: 2.82, // ~15.5/5.5 exchange rate change
      };
    }
  }

  /**
   * Save calculated costs to database
   */
  private async saveCalculatedCosts(costs: CalculatedBaseCost[]): Promise<void> {
    logger.info('[BaseCostCalculation] Saving calculated costs...', { count: costs.length });
    
    let saved = 0;
    let errors = 0;
    
    for (const cost of costs) {
      try {
        await query(`
          INSERT INTO base_costs_per_sqm (
            property_type, quality_level, region, cost_ghs,
            material_component_ghs, labor_component_ghs, overhead_component_ghs,
            cpi_adjustment_factor, fx_adjustment_factor,
            is_calculated, calculation_source, effective_date, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, CURRENT_DATE, NOW())
          ON CONFLICT (property_type, quality_level, region)
          DO UPDATE SET
            cost_ghs = EXCLUDED.cost_ghs,
            material_component_ghs = EXCLUDED.material_component_ghs,
            labor_component_ghs = EXCLUDED.labor_component_ghs,
            overhead_component_ghs = EXCLUDED.overhead_component_ghs,
            cpi_adjustment_factor = EXCLUDED.cpi_adjustment_factor,
            fx_adjustment_factor = EXCLUDED.fx_adjustment_factor,
            is_calculated = TRUE,
            calculation_source = EXCLUDED.calculation_source,
            effective_date = CURRENT_DATE,
            updated_at = NOW()
        `, [
          cost.property_type,
          cost.quality_level,
          cost.region,
          cost.cost_ghs,
          cost.material_component_ghs,
          cost.labor_component_ghs,
          cost.overhead_component_ghs,
          cost.cpi_adjustment_factor,
          cost.fx_adjustment_factor,
          cost.calculation_source,
        ]);
        saved++;
      } catch (error) {
        errors++;
        logger.error('[BaseCostCalculation] Failed to save cost', {
          property_type: cost.property_type,
          quality_level: cost.quality_level,
          region: cost.region,
          error,
        });
      }
    }

    logger.info('[BaseCostCalculation] Saved calculated costs', { saved, errors });
  }

  /**
   * Log calculation for audit trail
   */
  private async logCalculation(
    costs: CalculatedBaseCost[],
    economicData: { cpi_factor: number; fx_factor: number }
  ): Promise<void> {
    const calculationDate = new Date();
    
    // Log a summary entry for each unique property_type/quality_level (Greater Accra as reference)
    const accraData = costs.filter(c => c.region === 'greater_accra');
    
    for (const cost of accraData) {
      await query(`
        INSERT INTO base_cost_calculation_log (
          calculation_date, property_type, quality_level, region,
          calculated_cost_ghs, material_component_ghs, labor_component_ghs,
          overhead_component_ghs, cpi_value, usd_ghs_rate, calculation_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        calculationDate,
        cost.property_type,
        cost.quality_level,
        cost.region,
        cost.cost_ghs,
        cost.material_component_ghs,
        cost.labor_component_ghs,
        cost.overhead_component_ghs,
        economicData.cpi_factor * BASE_CPI_VALUE,
        economicData.fx_factor * 5.5, // Convert back to absolute rate
        'weighted_average',
      ]);
    }
  }

  /**
   * Get base cost for a specific combination
   */
  async getBaseCost(
    property_type: PropertyType,
    quality_level: QualityLevel,
    region: RegionCode = 'greater_accra'
  ): Promise<number | null> {
    const result = await query<{ cost_ghs: number }>(`
      SELECT cost_ghs
      FROM base_costs_per_sqm
      WHERE property_type = $1
        AND quality_level = $2
        AND region = $3
    `, [property_type, quality_level, region]);

    return result.rows[0]?.cost_ghs ? Number(result.rows[0].cost_ghs) : null;
  }

  /**
   * Get all base costs for a region
   */
  async getBaseCostsByRegion(region: RegionCode): Promise<CalculatedBaseCost[]> {
    const result = await query<CalculatedBaseCost>(`
      SELECT 
        property_type, quality_level, region, cost_ghs,
        material_component_ghs, labor_component_ghs, overhead_component_ghs,
        cpi_adjustment_factor, fx_adjustment_factor, calculation_source
      FROM base_costs_per_sqm
      WHERE region = $1
      ORDER BY property_type, quality_level
    `, [region]);

    return result.rows;
  }

  /**
   * Validate calculated costs against historical data
   */
  async validateAgainstActual(): Promise<{
    avg_deviation: number;
    max_deviation: number;
    validation_count: number;
  }> {
    // Compare against completed_projects if available
    const result = await query<{ avg_deviation: number; max_deviation: number; cnt: number }>(`
      SELECT 
        AVG(ABS(cp.actual_cost_per_sqm - bc.cost_ghs) / bc.cost_ghs * 100) as avg_deviation,
        MAX(ABS(cp.actual_cost_per_sqm - bc.cost_ghs) / bc.cost_ghs * 100) as max_deviation,
        COUNT(*) as cnt
      FROM completed_projects cp
      JOIN base_costs_per_sqm bc 
        ON cp.property_type = bc.property_type
        AND cp.quality_level = bc.quality_level
        AND cp.region = bc.region
      WHERE cp.completion_date >= NOW() - INTERVAL '12 months'
        AND bc.is_calculated = TRUE
    `);

    const row = result.rows[0];
    return {
      avg_deviation: row?.avg_deviation ? Number(row.avg_deviation) : 0,
      max_deviation: row?.max_deviation ? Number(row.max_deviation) : 0,
      validation_count: row?.cnt ? Number(row.cnt) : 0,
    };
  }
}

// Export singleton instance
export const baseCostCalculationService = new BaseCostCalculationService();
