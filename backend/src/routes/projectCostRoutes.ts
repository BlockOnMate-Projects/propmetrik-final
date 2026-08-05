/**
 * Project Cost & Currency Routes
 * Exchange rates, cost estimation, benchmarks, and market data for the cost estimator.
 */

import { Router, Request, Response, NextFunction } from 'express';
import projectCostCurrencyService from '../services/project-management/projectCostCurrencyService';
import { constructionCostService } from '../services/data-hub/constructionCostService';
import { economicDataService } from '../services/data-hub/economicDataService';
import { registerPMParamValidation, registerProjectAccessParams, requirePMWrite } from '../middleware/pmAuth';

const router = Router();

registerPMParamValidation(router);
registerProjectAccessParams(router, ['projectId']);

// Get exchange rates
router.get('/exchange-rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rates = await projectCostCurrencyService.getAllExchangeRates();
    res.json(rates);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// COST ESTIMATOR MARKET DATA — single aggregate endpoint for the frontend
// Returns: FX rates, regional multipliers, base costs, material prices, labor rates
// ============================================================================
router.get('/cost-estimator/market-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. FX rates — from the SAME authoritative live source as the payment system
    //    (economicDataService.getExchangeRate, which getGHSPerUSD uses). NO hardcoded
    //    fallback: a currency we can't price live is simply omitted (the older path used
    //    a separate fxFeedService instance with a stale cache + a hardcoded 15.5/16.8/19.5
    //    fallback, which is why the estimator showed a stale/wrong USD rate).
    //    getExchangeRate returns `rate` = GHS per 1 unit; the frontend needs GHS → currency.
    const fxRates: Record<string, number> = { GHS: 1 };
    const fxSources: Record<string, string> = { GHS: 'base' };
    let fxTimestamp: Date = new Date();
    for (const cur of ['USD', 'EUR', 'GBP'] as const) {
      try {
        const r = await economicDataService.getExchangeRate(cur);
        const ghsPerUnit = Number(r.rate);
        if (ghsPerUnit > 0 && Number.isFinite(ghsPerUnit)) {
          fxRates[cur] = Math.round((1 / ghsPerUnit) * 1_000_000) / 1_000_000;
          fxSources[cur] = r.source;
          if (r.date) fxTimestamp = new Date(r.date);
        }
      } catch {
        // Live rate unavailable for this currency → omit it (never a hardcoded fallback).
      }
    }

    // 2. Regional multipliers (from constructionCostService DB)
    const regionalMultipliers = await constructionCostService.getAllRegionalMultipliers();

    // 3. Base costs per sqm for all property type + quality combos
    const propertyTypes = ['residential', 'commercial', 'industrial'] as const;
    const qualityLevels = ['basic', 'standard', 'premium', 'luxury'] as const;
    const baseCosts: Record<string, { cost_ghs: number; source: string; material_pct: number; labor_pct: number }> = {};

    for (const pt of propertyTypes) {
      for (const ql of qualityLevels) {
        const bc = await constructionCostService.getCalculatedBaseCost(pt, ql, 'greater_accra');
        if (bc && bc.cost_ghs > 0) {
          const total = bc.cost_ghs;
          baseCosts[`${pt}_${ql}`] = {
            cost_ghs: Math.round(total),
            source: bc.calculation_source || 'database',
            material_pct: total > 0 ? Math.round((bc.material_component_ghs / total) * 100) : 55,
            labor_pct: total > 0 ? Math.round((bc.labor_component_ghs / total) * 100) : 30,
          };
        }
      }
    }

    // 4. Material prices (latest for Greater Accra as reference)
    let materialPrices: Array<{ category: string; name: string; price_ghs: number; previous_price_ghs: number | null; price_change_percent: number | null; unit: string }> = [];
    try {
      const prices = await constructionCostService.getMaterialPrices({ region: 'greater_accra' });
      materialPrices = prices.map(p => ({
        category: p.material_category,
        name: p.material_name,
        price_ghs: parseFloat(p.price_ghs as any) || 0,
        previous_price_ghs: (p as any).previous_price_ghs != null ? parseFloat((p as any).previous_price_ghs) : null,
        price_change_percent: (p as any).price_change_percent != null ? parseFloat((p as any).price_change_percent) : null,
        unit: p.unit,
      }));
    } catch (e) {
      // No material prices available
    }

    // 5. Labor rates (latest for Greater Accra as reference)
    let laborRates: Array<{ category: string; skill_level: string; daily_rate_ghs: number; rate_change_percent: number | null }> = [];
    try {
      const rates = await constructionCostService.getLaborRates({ region: 'greater_accra' });
      laborRates = rates.map(r => ({
        category: r.labor_category,
        skill_level: r.skill_level,
        daily_rate_ghs: parseFloat(r.rate_ghs as any) || 0,
        rate_change_percent: (r as any).rate_change_percent != null ? parseFloat((r as any).rate_change_percent) : null,
      }));
    } catch (e) {
      // No labor rates available
    }

    // 6. Construction cost index (includes separate material & labor sub-indices)
    let constructionIndex: {
      value: number; base_value: number; period: string; source: string;
      material_index: number; labor_index: number;
      change_yoy: number | null;
    } | null = null;
    try {
      const idx = await constructionCostService.getLatestConstructionIndex();
      if (idx) {
        constructionIndex = {
          value: idx.index_value,
          base_value: idx.base_value,
          period: idx.period_end?.toISOString?.() || new Date().toISOString(),
          source: idx.source,
          material_index: (idx as any).material_index ?? idx.index_value,
          labor_index: (idx as any).labor_index ?? idx.index_value,
          change_yoy: (idx as any).change_year_on_year ?? null,
        };
      }
    } catch (e) {
      // No index available
    }

    res.json({
      fx_rates: fxRates,
      fx_sources: fxSources,
      fx_timestamp: fxTimestamp,
      regional_multipliers: regionalMultipliers,
      base_costs: baseCosts,
      material_prices: materialPrices,
      labor_rates: laborRates,
      construction_index: constructionIndex,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});


// Convert currency
router.post('/convert-currency', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;
    
    const result = await projectCostCurrencyService.convertCurrency(
      amount,
      fromCurrency,
      toCurrency
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Generate cost estimate
router.post('/estimate-costs', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      project_type, 
      total_sqm,
      sqm, // Accept sqm as alias for total_sqm
      total_floors,
      region,
      finish_level,
      include_land,
      land_cost_per_sqm,
      display_currency 
    } = req.body;
    
    const effectiveSqm = total_sqm || sqm;
    
    const estimate = await projectCostCurrencyService.generateCostEstimate(
      {
        project_type,
        total_sqm: effectiveSqm,
        total_floors: total_floors || 1,
        region,
        finish_level: finish_level || 'standard',
        include_land,
        land_cost_per_sqm,
      },
      display_currency || 'GHS'
    );
    
    res.json(estimate);
  } catch (error) {
    next(error);
  }
});

// Get material cost benchmarks
router.get('/benchmarks/materials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region, category } = req.query;
    
    const benchmarks = await projectCostCurrencyService.getMaterialCostBenchmarks(
      region as any,
      category as string | undefined
    );
    
    res.json(benchmarks);
  } catch (error) {
    next(error);
  }
});

// Get labor rate benchmarks
router.get('/benchmarks/labor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    const benchmarks = await projectCostCurrencyService.getLaborRateBenchmarks(
      region as any
    );
    
    res.json(benchmarks);
  } catch (error) {
    next(error);
  }
});

// Capture exchange rate snapshot for project
router.post('/:projectId/capture-exchange-rates', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshot = await projectCostCurrencyService.captureExchangeRateSnapshot(
      req.params.projectId
    );
    
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default router;
