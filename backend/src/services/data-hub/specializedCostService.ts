/**
 * Specialized Construction Cost Service
 * 
 * RICS/GhIS compliant specialized asset construction cost management.
 * 
 * Two modes per RICS cost hierarchy:
 *   Mode A (Tier 3): Derived from existing base_costs_per_sqm via elemental analysis
 *   Mode B (Tier 2): Published rates from GREDA/BRRI, stored directly
 * 
 * Published rates (is_published_rate=true) always override derived values.
 * Per RICS Red Book DRC guidance: NO entrepreneur's profit included.
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';

// =====================================================
// TYPES
// =====================================================

export type BuildingFunction =
  | 'educational'
  | 'health_clinic'
  | 'health_hospital'
  | 'religious'
  | 'government'
  | 'heritage'
  | 'recreation'
  | 'library'
  | 'museum'
  | 'stadium'
  | 'industrial_warehouse'
  | 'industrial_factory'
  | 'mixed_use'
  | 'institutional_other';

export type QualityLevel = 'basic' | 'standard' | 'premium' | 'luxury';
export type RegionCode = 'greater_accra' | 'kumasi_metro' | 'eastern' | 'western_cluster' | 'northern_cluster';

export interface SpecializedCost {
  building_function: BuildingFunction;
  quality_level: QualityLevel;
  region: RegionCode;
  base_cost_sqm: number;
  substructure_pct: number;
  superstructure_pct: number;
  internal_finishes_pct: number;
  me_services_pct: number;
  external_works_pct: number;
  professional_fees_pct: number;
  structural_complexity_factor: number;
  me_addon_sqm: number;
  source: string;
  source_url?: string;
  source_date?: Date;
  is_published_rate: boolean;
  is_calculated: boolean;
  calculation_source?: string;
  notes?: string;
  effective_date: Date;
}

/** Configuration for Tier 3 (derived) calculations per building function */
interface FunctionConfig {
  /** Multiplier vs commercial/standard base cost */
  structural_complexity_factor: number;
  /** Default M&E services percentage */
  default_me_pct: number;
  /** RICS elemental percentages */
  substructure_pct: number;
  superstructure_pct: number;
  internal_finishes_pct: number;
  external_works_pct: number;
  professional_fees_pct: number;
  /** Human-readable label */
  label: string;
}

// =====================================================
// RICS ELEMENTAL CONFIGS PER BUILDING FUNCTION
// These are elemental analysis templates — NOT cost data.
// Actual costs come from base_costs_per_sqm (scraped) or
// published GREDA/BRRI rates.
// =====================================================

const FUNCTION_CONFIGS: Record<BuildingFunction, FunctionConfig> = {
  educational: {
    structural_complexity_factor: 0.95,
    default_me_pct: 15,
    substructure_pct: 16, superstructure_pct: 42,
    internal_finishes_pct: 14, external_works_pct: 8,
    professional_fees_pct: 12,
    label: 'Educational (Schools, Universities)',
  },
  health_clinic: {
    structural_complexity_factor: 1.05,
    default_me_pct: 25,
    substructure_pct: 17, superstructure_pct: 38,
    internal_finishes_pct: 12, external_works_pct: 5,
    professional_fees_pct: 13,
    label: 'Health Clinic',
  },
  health_hospital: {
    structural_complexity_factor: 1.15,
    default_me_pct: 35,
    substructure_pct: 18, superstructure_pct: 35,
    internal_finishes_pct: 10, external_works_pct: 5,
    professional_fees_pct: 15,
    label: 'Health Hospital',
  },
  religious: {
    structural_complexity_factor: 0.85,
    default_me_pct: 10,
    substructure_pct: 15, superstructure_pct: 45,
    internal_finishes_pct: 15, external_works_pct: 6,
    professional_fees_pct: 12,
    label: 'Religious (Church, Mosque)',
  },
  government: {
    structural_complexity_factor: 1.00,
    default_me_pct: 20,
    substructure_pct: 17, superstructure_pct: 40,
    internal_finishes_pct: 12, external_works_pct: 5,
    professional_fees_pct: 13,
    label: 'Government Office',
  },
  heritage: {
    structural_complexity_factor: 1.25,
    default_me_pct: 12,
    substructure_pct: 20, superstructure_pct: 42,
    internal_finishes_pct: 14, external_works_pct: 7,
    professional_fees_pct: 15,
    label: 'Heritage / Conservation',
  },
  recreation: {
    structural_complexity_factor: 1.00,
    default_me_pct: 18,
    substructure_pct: 16, superstructure_pct: 42,
    internal_finishes_pct: 12, external_works_pct: 8,
    professional_fees_pct: 12,
    label: 'Recreation Facility',
  },
  library: {
    structural_complexity_factor: 1.05,
    default_me_pct: 22,
    substructure_pct: 16, superstructure_pct: 40,
    internal_finishes_pct: 13, external_works_pct: 5,
    professional_fees_pct: 13,
    label: 'Library',
  },
  museum: {
    structural_complexity_factor: 1.10,
    default_me_pct: 22,
    substructure_pct: 17, superstructure_pct: 40,
    internal_finishes_pct: 13, external_works_pct: 5,
    professional_fees_pct: 14,
    label: 'Museum',
  },
  stadium: {
    structural_complexity_factor: 1.10,
    default_me_pct: 18,
    substructure_pct: 20, superstructure_pct: 40,
    internal_finishes_pct: 10, external_works_pct: 8,
    professional_fees_pct: 14,
    label: 'Stadium / Sports',
  },
  industrial_warehouse: {
    structural_complexity_factor: 0.80,
    default_me_pct: 10,
    substructure_pct: 18, superstructure_pct: 48,
    internal_finishes_pct: 8, external_works_pct: 8,
    professional_fees_pct: 10,
    label: 'Industrial Warehouse',
  },
  industrial_factory: {
    structural_complexity_factor: 0.90,
    default_me_pct: 15,
    substructure_pct: 20, superstructure_pct: 44,
    internal_finishes_pct: 8, external_works_pct: 8,
    professional_fees_pct: 12,
    label: 'Industrial Factory',
  },
  mixed_use: {
    structural_complexity_factor: 1.05,
    default_me_pct: 22,
    substructure_pct: 18, superstructure_pct: 38,
    internal_finishes_pct: 13, external_works_pct: 6,
    professional_fees_pct: 13,
    label: 'Mixed Use',
  },
  institutional_other: {
    structural_complexity_factor: 1.00,
    default_me_pct: 18,
    substructure_pct: 17, superstructure_pct: 40,
    internal_finishes_pct: 12, external_works_pct: 6,
    professional_fees_pct: 13,
    label: 'Institutional (Other)',
  },
};

const ALL_BUILDING_FUNCTIONS = Object.keys(FUNCTION_CONFIGS) as BuildingFunction[];
const ALL_QUALITY_LEVELS: QualityLevel[] = ['basic', 'standard', 'premium', 'luxury'];
const ALL_REGIONS: RegionCode[] = ['greater_accra', 'kumasi_metro', 'eastern', 'western_cluster', 'northern_cluster'];

// Quality level multipliers relative to standard (1.0)
const QUALITY_MULTIPLIERS: Record<QualityLevel, number> = {
  basic: 0.75,
  standard: 1.00,
  premium: 1.35,
  luxury: 1.80,
};

// =====================================================
// SERVICE
// =====================================================

export class SpecializedCostService {

  /**
   * Get the RICS elemental config for a building function.
   * These are NOT costs — they are elemental analysis templates.
   */
  getFunctionConfig(buildingFunction: BuildingFunction): FunctionConfig | null {
    return FUNCTION_CONFIGS[buildingFunction] || null;
  }

  /**
   * List all available building functions with labels
   */
  listBuildingFunctions(): { value: BuildingFunction; label: string }[] {
    return ALL_BUILDING_FUNCTIONS.map(fn => ({
      value: fn,
      label: FUNCTION_CONFIGS[fn].label,
    }));
  }

  // =====================================================
  // MODE B: PUBLISHED RATE MANAGEMENT (RICS Tier 2)
  // =====================================================

  /**
   * Upsert a published rate from GREDA/BRRI.
   * Published rates override any derived (Tier 3) values.
   */
  async upsertPublishedRate(rate: {
    building_function: BuildingFunction;
    quality_level: QualityLevel;
    region: RegionCode;
    base_cost_sqm: number;
    me_services_pct?: number;
    source: string;
    source_url?: string;
    source_date?: Date;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const config = FUNCTION_CONFIGS[rate.building_function];
    if (!config) throw new Error(`Unknown building function: ${rate.building_function}`);

    const mePct = rate.me_services_pct ?? config.default_me_pct;

    await query(`
      INSERT INTO specialized_construction_costs (
        building_function, quality_level, region, base_cost_sqm,
        substructure_pct, superstructure_pct, internal_finishes_pct,
        me_services_pct, external_works_pct, professional_fees_pct,
        structural_complexity_factor, me_addon_sqm,
        source, source_url, source_date,
        is_published_rate, is_calculated, calculation_source,
        notes, metadata, effective_date
      ) VALUES (
        $1::building_function_enum, $2, $3::region_code_enum, $4,
        $5, $6, $7, $8, $9, $10,
        $11, 0,
        $12, $13, $14,
        TRUE, FALSE, NULL,
        $15, $16, CURRENT_DATE
      )
      ON CONFLICT (building_function, quality_level, region)
      DO UPDATE SET
        base_cost_sqm = EXCLUDED.base_cost_sqm,
        me_services_pct = EXCLUDED.me_services_pct,
        source = EXCLUDED.source,
        source_url = EXCLUDED.source_url,
        source_date = EXCLUDED.source_date,
        is_published_rate = TRUE,
        is_calculated = FALSE,
        calculation_source = NULL,
        notes = EXCLUDED.notes,
        metadata = EXCLUDED.metadata,
        effective_date = CURRENT_DATE,
        updated_at = NOW()
    `, [
      rate.building_function,
      rate.quality_level,
      rate.region,
      rate.base_cost_sqm,
      config.substructure_pct,
      config.superstructure_pct,
      config.internal_finishes_pct,
      mePct,
      config.external_works_pct,
      config.professional_fees_pct,
      config.structural_complexity_factor,
      rate.source,
      rate.source_url || null,
      rate.source_date || null,
      rate.notes || null,
      JSON.stringify(rate.metadata || {}),
    ]);

    logger.info('[SpecializedCost] Published rate upserted', {
      building_function: rate.building_function,
      quality_level: rate.quality_level,
      region: rate.region,
      cost: rate.base_cost_sqm,
      source: rate.source,
    });
  }

  /**
   * Bulk upsert published rates (from scraper)
   */
  async bulkUpsertPublishedRates(rates: Array<{
    building_function: BuildingFunction;
    quality_level: QualityLevel;
    region: RegionCode;
    base_cost_sqm: number;
    me_services_pct?: number;
    source: string;
    source_url?: string;
    source_date?: Date;
    notes?: string;
    metadata?: Record<string, unknown>;
  }>): Promise<{ saved: number; errors: number }> {
    let saved = 0;
    let errors = 0;

    for (const rate of rates) {
      try {
        await this.upsertPublishedRate(rate);
        saved++;
      } catch (error) {
        errors++;
        logger.error('[SpecializedCost] Failed to upsert published rate', {
          building_function: rate.building_function,
          region: rate.region,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return { saved, errors };
  }

  // =====================================================
  // MODE A: DERIVED CALCULATION (RICS Tier 3)
  // =====================================================

  /**
   * Recalculate derived costs for ALL function/quality/region combos.
   * Only updates rows that are NOT published rates (is_published_rate=false).
   * Uses commercial/standard base cost from base_costs_per_sqm as the reference.
   */
  async recalculateDerivedCosts(): Promise<{
    success: boolean;
    total_calculated: number;
    skipped_published: number;
    errors: string[];
  }> {
    logger.info('[SpecializedCost] Starting derived cost recalculation...');

    const errors: string[] = [];
    let totalCalculated = 0;
    let skippedPublished = 0;

    // Get all base costs from base_costs_per_sqm (commercial as reference for specialized)
    const baseCostsResult = await query<{
      quality_level: string;
      region: string;
      cost_ghs: number;
    }>(`
      SELECT quality_level, region::text, cost_ghs
      FROM base_costs_per_sqm
      WHERE property_type = 'commercial'
    `);

    if (baseCostsResult.rows.length === 0) {
      logger.warn('[SpecializedCost] No commercial base costs found — cannot derive specialized costs');
      return { success: false, total_calculated: 0, skipped_published: 0, errors: ['No commercial base costs in base_costs_per_sqm'] };
    }

    // Build lookup: region -> quality_level -> cost
    const baseCostLookup = new Map<string, Map<string, number>>();
    for (const row of baseCostsResult.rows) {
      if (!baseCostLookup.has(row.region)) {
        baseCostLookup.set(row.region, new Map());
      }
      baseCostLookup.get(row.region)!.set(row.quality_level, Number(row.cost_ghs));
    }

    // Get existing published rates to skip
    const publishedResult = await query<{
      building_function: string;
      quality_level: string;
      region: string;
    }>(`
      SELECT building_function::text, quality_level, region::text
      FROM specialized_construction_costs
      WHERE is_published_rate = TRUE
    `);

    const publishedKeys = new Set(
      publishedResult.rows.map(r => `${r.building_function}|${r.quality_level}|${r.region}`)
    );

    // Calculate for each combination
    for (const buildingFunction of ALL_BUILDING_FUNCTIONS) {
      const config = FUNCTION_CONFIGS[buildingFunction];

      for (const qualityLevel of ALL_QUALITY_LEVELS) {
        for (const region of ALL_REGIONS) {
          const key = `${buildingFunction}|${qualityLevel}|${region}`;

          // Skip published rates — they take priority
          if (publishedKeys.has(key)) {
            skippedPublished++;
            continue;
          }

          // Get base cost for this quality_level + region
          const regionCosts = baseCostLookup.get(region);
          const baseCost = regionCosts?.get(qualityLevel);

          if (!baseCost) {
            errors.push(`No base cost for commercial/${qualityLevel}/${region}`);
            continue;
          }

          // Tier 3 derivation:
          // cost = baseCost × structural_factor × quality_multiplier_adjustment
          // + M&E addon (derived from M&E % difference vs commercial default 20%)
          const qualityAdj = QUALITY_MULTIPLIERS[qualityLevel] / QUALITY_MULTIPLIERS.standard;
          const structuralCost = baseCost * config.structural_complexity_factor;

          // M&E addon: difference between this function's M&E % and the commercial default (20%)
          // expressed as absolute GHS/sqm
          const commercialMePct = 20; // Commercial base already includes ~20% M&E
          const meDiff = (config.default_me_pct - commercialMePct) / 100;
          const meAddon = structuralCost * meDiff;

          // Professional fees adjust (DRC: no entrepreneur's profit)
          const feesDiff = (config.professional_fees_pct - 13) / 100; // 13% is commercial default
          const feesAddon = structuralCost * feesDiff;

          const totalCost = Math.round((structuralCost + meAddon + feesAddon) * 100) / 100;

          try {
            await query(`
              INSERT INTO specialized_construction_costs (
                building_function, quality_level, region, base_cost_sqm,
                substructure_pct, superstructure_pct, internal_finishes_pct,
                me_services_pct, external_works_pct, professional_fees_pct,
                structural_complexity_factor, me_addon_sqm,
                source, is_published_rate, is_calculated, calculation_source,
                notes, effective_date
              ) VALUES (
                $1::building_function_enum, $2, $3::region_code_enum, $4,
                $5, $6, $7, $8, $9, $10,
                $11, $12,
                'derived_from_base_costs', FALSE, TRUE, 'specializedCostService',
                $13, CURRENT_DATE
              )
              ON CONFLICT (building_function, quality_level, region)
              DO UPDATE SET
                base_cost_sqm = EXCLUDED.base_cost_sqm,
                structural_complexity_factor = EXCLUDED.structural_complexity_factor,
                me_addon_sqm = EXCLUDED.me_addon_sqm,
                is_calculated = TRUE,
                calculation_source = 'specializedCostService',
                effective_date = CURRENT_DATE,
                updated_at = NOW()
              WHERE specialized_construction_costs.is_published_rate = FALSE
            `, [
              buildingFunction,
              qualityLevel,
              region,
              totalCost,
              config.substructure_pct,
              config.superstructure_pct,
              config.internal_finishes_pct,
              config.default_me_pct,
              config.external_works_pct,
              config.professional_fees_pct,
              config.structural_complexity_factor,
              Math.round(meAddon * 100) / 100,
              `Derived: commercial/${qualityLevel}/${region} base=${baseCost} × factor=${config.structural_complexity_factor} + M&E_addon=${Math.round(meAddon)}`,
            ]);
            totalCalculated++;
          } catch (error) {
            errors.push(`${key}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        }
      }
    }

    // Log audit trail (Greater Accra standard as reference)
    const accraStd = ALL_BUILDING_FUNCTIONS.map(fn => ({
      fn,
      cost: baseCostLookup.get('greater_accra')?.get('standard'),
    }));

    for (const item of accraStd) {
      if (!item.cost) continue;
      const config = FUNCTION_CONFIGS[item.fn];
      const structuralCost = item.cost * config.structural_complexity_factor;
      const meAddon = structuralCost * ((config.default_me_pct - 20) / 100);
      const feesAddon = structuralCost * ((config.professional_fees_pct - 13) / 100);
      const totalCost = Math.round((structuralCost + meAddon + feesAddon) * 100) / 100;

      try {
        await query(`
          INSERT INTO specialized_cost_calculation_log (
            building_function, quality_level, region,
            calculated_cost_sqm, base_cost_used,
            structural_factor, me_addon,
            source, calculation_method
          ) VALUES ($1::building_function_enum, 'standard', 'greater_accra', $2, $3, $4, $5, 'specializedCostService', 'derived')
        `, [
          item.fn,
          totalCost,
          item.cost,
          config.structural_complexity_factor,
          Math.round(meAddon * 100) / 100,
        ]);
      } catch {
        // Non-critical audit log
      }
    }

    logger.info('[SpecializedCost] Derived cost recalculation complete', {
      totalCalculated,
      skippedPublished,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      total_calculated: totalCalculated,
      skipped_published: skippedPublished,
      errors,
    };
  }

  // =====================================================
  // QUERIES
  // =====================================================

  /**
   * Get specialized cost for a specific combination.
   * Returns published rate if available, otherwise derived.
   */
  async getSpecializedCost(
    buildingFunction: BuildingFunction,
    qualityLevel: QualityLevel = 'standard',
    region: RegionCode = 'greater_accra',
  ): Promise<SpecializedCost | null> {
    const result = await query<SpecializedCost>(`
      SELECT
        building_function::text as building_function,
        quality_level, region::text as region,
        base_cost_sqm,
        substructure_pct, superstructure_pct, internal_finishes_pct,
        me_services_pct, external_works_pct, professional_fees_pct,
        structural_complexity_factor, me_addon_sqm,
        source, source_url, source_date,
        is_published_rate, is_calculated, calculation_source,
        notes, effective_date
      FROM specialized_construction_costs
      WHERE building_function = $1::building_function_enum
        AND quality_level = $2
        AND region = $3::region_code_enum
    `, [buildingFunction, qualityLevel, region]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      base_cost_sqm: Number(row.base_cost_sqm),
      substructure_pct: Number(row.substructure_pct),
      superstructure_pct: Number(row.superstructure_pct),
      internal_finishes_pct: Number(row.internal_finishes_pct),
      me_services_pct: Number(row.me_services_pct),
      external_works_pct: Number(row.external_works_pct),
      professional_fees_pct: Number(row.professional_fees_pct),
      structural_complexity_factor: Number(row.structural_complexity_factor),
      me_addon_sqm: Number(row.me_addon_sqm),
    };
  }

  /**
   * Get all specialized costs for a region
   */
  async getSpecializedCostsByRegion(
    region: RegionCode = 'greater_accra',
  ): Promise<SpecializedCost[]> {
    const result = await query<SpecializedCost>(`
      SELECT
        building_function::text as building_function,
        quality_level, region::text as region,
        base_cost_sqm,
        substructure_pct, superstructure_pct, internal_finishes_pct,
        me_services_pct, external_works_pct, professional_fees_pct,
        structural_complexity_factor, me_addon_sqm,
        source, source_url, source_date,
        is_published_rate, is_calculated, calculation_source,
        notes, effective_date
      FROM specialized_construction_costs
      WHERE region = $1::region_code_enum
      ORDER BY building_function, quality_level
    `, [region]);

    return result.rows.map(row => ({
      ...row,
      base_cost_sqm: Number(row.base_cost_sqm),
      substructure_pct: Number(row.substructure_pct),
      superstructure_pct: Number(row.superstructure_pct),
      internal_finishes_pct: Number(row.internal_finishes_pct),
      me_services_pct: Number(row.me_services_pct),
      external_works_pct: Number(row.external_works_pct),
      professional_fees_pct: Number(row.professional_fees_pct),
      structural_complexity_factor: Number(row.structural_complexity_factor),
      me_addon_sqm: Number(row.me_addon_sqm),
    }));
  }

  /**
   * Get all specialized costs for a building function across regions
   */
  async getSpecializedCostsByFunction(
    buildingFunction: BuildingFunction,
  ): Promise<SpecializedCost[]> {
    const result = await query<SpecializedCost>(`
      SELECT
        building_function::text as building_function,
        quality_level, region::text as region,
        base_cost_sqm,
        substructure_pct, superstructure_pct, internal_finishes_pct,
        me_services_pct, external_works_pct, professional_fees_pct,
        structural_complexity_factor, me_addon_sqm,
        source, source_url, source_date,
        is_published_rate, is_calculated, calculation_source,
        notes, effective_date
      FROM specialized_construction_costs
      WHERE building_function = $1::building_function_enum
      ORDER BY region, quality_level
    `, [buildingFunction]);

    return result.rows.map(row => ({
      ...row,
      base_cost_sqm: Number(row.base_cost_sqm),
      substructure_pct: Number(row.substructure_pct),
      superstructure_pct: Number(row.superstructure_pct),
      internal_finishes_pct: Number(row.internal_finishes_pct),
      me_services_pct: Number(row.me_services_pct),
      external_works_pct: Number(row.external_works_pct),
      professional_fees_pct: Number(row.professional_fees_pct),
      structural_complexity_factor: Number(row.structural_complexity_factor),
      me_addon_sqm: Number(row.me_addon_sqm),
    }));
  }
}

// Export singleton
export const specializedCostService = new SpecializedCostService();
