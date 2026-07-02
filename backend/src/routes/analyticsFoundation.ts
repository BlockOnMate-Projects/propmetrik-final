/**
 * Analytics Foundation Routes (Phase 1)
 *
 * REST API endpoints for:
 *   Section 1 — Construction Cost Index (CCI)
 *   Section 2 — Housing Affordability Index (GHAI)
 *   Alerts    — Analytics alert system
 *
 * Mounted at: /api/v1/analytics/platform
 *           + /api/analytics/platform  (frontend compat)
 *
 * These are the "pure analytics" endpoints that sit alongside
 * the existing ML analytics routes at /api/v1/analytics/ml.
 *
 * @module routes/analyticsFoundation
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { constructionCostIndexService } from '../services/analytics/constructionCostIndexService';
import { ghaiService } from '../services/analytics/ghaiService';
import { alertService } from '../services/analytics/alertService';
import { housingDemandScoreService } from '../services/analytics/housingDemandScoreService';
import { gssPhcHousingService } from '../services/data-hub/scrapers/gssPhcHousingService';
import { gssFinancialService } from '../services/data-hub/scrapers/gssFinancialService';
import { analyticsScheduler } from '../services/analytics/analyticsScheduler';
import { gssPhcPopulationService } from '../services/data-hub/scrapers/gssPhcPopulationService';
import { gssPhcEmploymentService } from '../services/data-hub/scrapers/gssPhcEmploymentService';
import { gssPhcPovertyService } from '../services/data-hub/scrapers/gssPhcPovertyService';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================================
// SECTION 1: Construction Cost Index
// ============================================================================

/**
 * GET /construction/index
 * Get national CCI summary with components, regional breakdown, and trend.
 */
router.get(
  '/construction/index',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await constructionCostIndexService.getNationalSummary();
    res.json({ success: true, data });
  }),
);

/**
 * GET /construction/history
 * Get CCI time-series history.
 * Query: ?region=greater_accra&period=monthly&months=24
 */
router.get(
  '/construction/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, period = 'monthly', months = '24' } = req.query as Record<string, string>;
    const data = await constructionCostIndexService.getHistory(
      region || undefined,
      period,
      parseInt(months, 10),
    );
    res.json({ success: true, data });
  }),
);

/**
 * GET /construction/regional
 * Get regional cost comparison matrix.
 * Query: ?region=greater_accra
 */
router.get(
  '/construction/regional',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.query as Record<string, string>;
    const data = await constructionCostIndexService.getRegionalComparison(region || undefined);
    res.json({ success: true, data });
  }),
);

/**
 * GET /construction/materials
 * Get material price data with optional filtering.
 * Query: ?category=cement&region=greater_accra&months=12
 */
router.get(
  '/construction/materials',
  asyncHandler(async (req: Request, res: Response) => {
    const { category, region, months } = req.query as Record<string, string>;
    const data = await constructionCostIndexService.getMaterialPrices({
      category: category || undefined,
      region: region || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /construction/materials/summary
 * Get material price summary grouped by category.
 */
router.get(
  '/construction/materials/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await constructionCostIndexService.getMaterialSummary();
    res.json({ success: true, data });
  }),
);

/**
 * GET /construction/labor
 * Get labor rate data with optional filtering.
 * Query: ?category=mason&skillLevel=skilled&region=greater_accra
 */
router.get(
  '/construction/labor',
  asyncHandler(async (req: Request, res: Response) => {
    const { category, skillLevel, region } = req.query as Record<string, string>;
    const data = await constructionCostIndexService.getLaborRates({
      category: category || undefined,
      skillLevel: skillLevel || undefined,
      region: region || undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * POST /construction/compute
 * Trigger CCI snapshot computation from raw data.
 * Body: { periodDate?: string, periodType?: string }
 */
router.post(
  '/construction/compute',
  asyncHandler(async (req: Request, res: Response) => {
    const { periodDate, periodType = 'monthly' } = req.body;
    const date = periodDate ? new Date(periodDate) : new Date();
    const data = await constructionCostIndexService.computeAndStoreSnapshot(date, periodType);
    res.json({ success: true, data });
  }),
);

/**
 * GET /construction/forecast
 * Forecast CCI values using weighted linear regression.
 * Query: ?region=greater_accra&horizon=6&history=24
 */
router.get(
  '/construction/forecast',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, horizon = '6', history = '24' } = req.query as Record<string, string>;
    const data = await constructionCostIndexService.forecastCCI(
      region || undefined,
      parseInt(horizon, 10),
      parseInt(history, 10),
    );
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 2: Housing Affordability Index (GHAI)
// ============================================================================

/**
 * GET /hai/current
 * Get current GHAI for all regions or specific region.
 * Query: ?region=greater_accra
 */
router.get(
  '/hai/current',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.query as Record<string, string>;
    const data = await ghaiService.getCurrent(region || undefined);
    res.json({ success: true, data });
  }),
);

/**
 * GET /hai/region/:region
 * Get detailed GHAI for a specific region.
 */
router.get(
  '/hai/region/:region',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.params;
    const data = await ghaiService.getCurrent(region);
    if (data.length === 0) {
      res.status(404).json({ success: false, error: `No GHAI data for region: ${region}` });
      return;
    }
    res.json({ success: true, data: data[0] });
  }),
);

/**
 * GET /hai/history/:region
 * Get GHAI history for a region.
 * Query: ?months=24
 */
router.get(
  '/hai/history/:region',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.params;
    const { months = '24' } = req.query as Record<string, string>;
    const data = await ghaiService.getHistory(region, parseInt(months, 10));
    res.json({ success: true, data });
  }),
);

/**
 * GET /hai/comparison
 * Get GHAI comparison across all regions.
 */
router.get(
  '/hai/comparison',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await ghaiService.getRegionalComparison();
    res.json({ success: true, data });
  }),
);

/**
 * GET /hai/supplementary/:region
 * Get supplementary indices (CAI, LAI, MAS) for a region.
 */
router.get(
  '/hai/supplementary/:region',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.params;
    const data = await ghaiService.getSupplementaryIndices(region);
    if (!data) {
      res.status(404).json({ success: false, error: `No supplementary data for region: ${region}` });
      return;
    }
    res.json({ success: true, data });
  }),
);

/**
 * GET /hai/weights
 * Get the regional weight matrix used in GHAI computation.
 */
router.get(
  '/hai/weights',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await ghaiService.getRegionalWeights();
    res.json({ success: true, data });
  }),
);

/**
 * POST /hai/compute
 * Compute GHAI for provided input data.
 * Body: { region, median_property_price, median_household_income, mortgage_rate, median_monthly_rent, ... }
 */
router.post(
  '/hai/compute',
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body;
    if (!input.region || !input.median_property_price || !input.median_household_income || !input.mortgage_rate || !input.median_monthly_rent) {
      res.status(400).json({
        success: false,
        error: 'Required: region, median_property_price, median_household_income, mortgage_rate, median_monthly_rent',
      });
      return;
    }

    // Compute without persisting
    const data = ghaiService.computeForRegion(input);
    res.json({ success: true, data });
  }),
);

/**
 * POST /hai/compute-and-store
 * Compute and persist GHAI for multiple regions.
 * Body: { regions: RegionalInputData[], calculationDate?: string }
 */
router.post(
  '/hai/compute-and-store',
  asyncHandler(async (req: Request, res: Response) => {
    const { regions, calculationDate } = req.body;
    if (!Array.isArray(regions) || regions.length === 0) {
      res.status(400).json({ success: false, error: 'Required: regions array with input data' });
      return;
    }
    const date = calculationDate ? new Date(calculationDate) : new Date();
    const data = await ghaiService.computeAndStore(regions, date);
    res.json({ success: true, data });
  }),
);

/**
 * GET /hai/forecast/:region
 * Forecast GHAI values using weighted linear regression.
 * Query: ?horizon=6&history=24
 */
router.get(
  '/hai/forecast/:region',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.params;
    const { horizon = '6', history = '24' } = req.query as Record<string, string>;
    const data = await ghaiService.forecastGHAI(
      region,
      parseInt(horizon, 10),
      parseInt(history, 10),
    );
    if (!data) {
      res.status(404).json({
        success: false,
        error: `Insufficient GHAI history for region: ${region}`,
      });
      return;
    }
    res.json({ success: true, data });
  }),
);

// ============================================================================
// ALERTS
// ============================================================================

/**
 * GET /alerts/summary
 * Get alert summary with counts and recent alerts.
 */
router.get(
  '/alerts/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { limit = '10' } = req.query as Record<string, string>;
    const data = await alertService.getSummary(parseInt(limit, 10));
    res.json({ success: true, data });
  }),
);

/**
 * GET /alerts
 * List alerts with filtering.
 * Query: ?status=active&severity=critical&category=construction&region=greater_accra&limit=50&offset=0
 */
router.get(
  '/alerts',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, severity, category, region, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const data = await alertService.list({
      status: status as any || undefined,
      severity: severity as any || undefined,
      category: category || undefined,
      region: region || undefined,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
    res.json({ success: true, ...data });
  }),
);

/**
 * POST /alerts
 * Create a manual alert.
 */
router.post(
  '/alerts',
  asyncHandler(async (req: Request, res: Response) => {
    const { severity, category, title, message, ...rest } = req.body;
    if (!severity || !category || !title || !message) {
      res.status(400).json({ success: false, error: 'Required: severity, category, title, message' });
      return;
    }
    const data = await alertService.create({ severity, category, title, message, ...rest });
    res.status(201).json({ success: true, data });
  }),
);

/**
 * PATCH /alerts/:id/acknowledge
 */
router.patch(
  '/alerts/:id/acknowledge',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const data = await alertService.acknowledge(req.params.id, userId);
    if (!data) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }
    res.json({ success: true, data });
  }),
);

/**
 * PATCH /alerts/:id/resolve
 */
router.patch(
  '/alerts/:id/resolve',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await alertService.resolve(req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }
    res.json({ success: true, data });
  }),
);

/**
 * PATCH /alerts/:id/dismiss
 */
router.patch(
  '/alerts/:id/dismiss',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await alertService.dismiss(req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }
    res.json({ success: true, data });
  }),
);

/**
 * GET /alerts/rules
 * List all alert rules.
 * Query: ?active=true
 */
router.get(
  '/alerts/rules',
  asyncHandler(async (req: Request, res: Response) => {
    const active = req.query.active !== 'false';
    const data = await alertService.listRules(active);
    res.json({ success: true, data });
  }),
);

/**
 * POST /alerts/rules
 * Create a new alert rule.
 */
router.post(
  '/alerts/rules',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, category, metric_name, condition, threshold_value, severity, ...rest } = req.body;
    if (!name || !category || !metric_name || !condition || threshold_value === undefined || !severity) {
      res.status(400).json({
        success: false,
        error: 'Required: name, category, metric_name, condition, threshold_value, severity',
      });
      return;
    }
    const data = await alertService.createRule({
      name,
      category,
      metric_name,
      condition,
      threshold_value,
      severity,
      description: rest.description || null,
      region: rest.region || null,
      comparison_period: rest.comparison_period || null,
      cooldown_hours: rest.cooldown_hours || 24,
    });
    res.status(201).json({ success: true, data });
  }),
);

/**
 * PATCH /alerts/rules/:id/toggle
 */
router.patch(
  '/alerts/rules/:id/toggle',
  asyncHandler(async (req: Request, res: Response) => {
    const { is_active } = req.body;
    const data = await alertService.toggleRule(req.params.id, is_active !== false);
    if (!data) {
      res.status(404).json({ success: false, error: 'Rule not found' });
      return;
    }
    res.json({ success: true, data });
  }),
);

/**
 * DELETE /alerts/rules/:id
 */
router.delete(
  '/alerts/rules/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await alertService.deleteRule(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Rule not found' });
      return;
    }
    res.json({ success: true, message: 'Rule deleted' });
  }),
);

/**
 * POST /alerts/evaluate
 * Manually trigger alert rule evaluation.
 */
router.post(
  '/alerts/evaluate',
  asyncHandler(async (_req: Request, res: Response) => {
    const alerts = await alertService.evaluateAllRules();
    res.json({ success: true, data: { evaluated: true, new_alerts: alerts.length, alerts } });
  }),
);

// ============================================================================
// SECTION: Affordability context (Slice 1/2 frontend — tenure + rate cycle)
// ============================================================================

/**
 * GET /hai/tenure
 * PHC 2021 housing-tenure profile per region (renting / owner-occupied / perching).
 * Feeds the affordability "Housing Tenure Profile" panel + weight-derivation tooltip.
 */
router.get(
  '/hai/tenure',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await gssPhcHousingService.getTenureByRegion();
    res.json({ success: true, data });
  }),
);

/**
 * GET /hai/interest-history
 * GSS average-lending-rate history + rate-cycle tag (easing/tightening/stable).
 * Feeds the affordability GSS interest-rate sparkline panel.
 */
router.get(
  '/hai/interest-history',
  asyncHandler(async (req: Request, res: Response) => {
    const { months = '24' } = req.query as Record<string, string>;
    const [history, cycle, latest] = await Promise.all([
      gssFinancialService.getLendingRateHistory(parseInt(months, 10)),
      gssFinancialService.getInterestRateCycle(),
      gssFinancialService.getLatestLendingRate(),
    ]);
    res.json({ success: true, data: { history, cycle, latest } });
  }),
);

// ============================================================================
// SECTION: Regional Housing Demand (Slice 3 — PHC Population/Employment/Poverty)
// ============================================================================

/**
 * GET /demand
 * Composite payload for the /analytics/demand page: RHDS scores + population
 * projections (20–40 cohort) + employment rates + MPI poverty metrics per region.
 */
router.get(
  '/demand',
  asyncHandler(async (_req: Request, res: Response) => {
    const [rhds, projections, formalEmp, unemployment, mpi] = await Promise.all([
      housingDemandScoreService.getScores(),
      gssPhcPopulationService.getProjectionsByRegion(2021, 2030),
      gssPhcEmploymentService.getFormalEmploymentByRegion(),
      gssPhcEmploymentService.getUnemploymentByRegion(),
      gssPhcPovertyService.getMpiByRegion(),
    ]);

    // Population cohort chart: current vs 2030 working-age (20–40) per region.
    const population = Object.entries(projections).map(([region, p]) => ({
      region,
      base_working_age: p.base_working_age,
      horizon_working_age: p.horizon_working_age,
      base_total: p.base_total,
      horizon_total: p.horizon_total,
      growth_pct: (p.base_working_age && p.horizon_working_age && p.base_working_age > 0)
        ? Math.round(((p.horizon_working_age / p.base_working_age) - 1) * 10000) / 100
        : null,
    })).sort((a, b) => (b.growth_pct ?? -999) - (a.growth_pct ?? -999));

    // Employment bar chart: formal-employment rate (desc) per region.
    const regions = new Set<string>([...Object.keys(formalEmp), ...Object.keys(unemployment)]);
    const employment = Array.from(regions).map((region) => ({
      region,
      formal_employment_pct: formalEmp[region] ?? null,
      unemployment_rate: unemployment[region] ?? null,
    })).sort((a, b) => (b.formal_employment_pct ?? -1) - (a.formal_employment_pct ?? -1));

    const poverty = Object.entries(mpi).map(([region, m]) => ({ region, ...m }));

    res.json({ success: true, data: { rhds, population, employment, poverty } });
  }),
);

/**
 * GET /demand/scores
 * RHDS composite scores only (for the heatmap + top-5 ranking).
 */
router.get(
  '/demand/scores',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await housingDemandScoreService.getScores();
    res.json({ success: true, data });
  }),
);

/**
 * POST /demand/recompute
 * Recompute + persist the RHDS composite from current source tables.
 */
router.post(
  '/demand/recompute',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await housingDemandScoreService.computeAndStore();
    res.json({ success: true, data: { recomputed: true, regions: data.length, scores: data } });
  }),
);

// ============================================================================
// SECTION: Analytics scheduler — manual recompute of all derived snapshots
// ============================================================================

/**
 * POST /snapshots/recompute
 * Force-run every analytics compute-and-persist job (GHAI, CCI, market,
 * investment, valuation, RHDS) now. Normally these run monthly + on startup.
 */
router.post(
  '/snapshots/recompute',
  asyncHandler(async (_req: Request, res: Response) => {
    const results = await analyticsScheduler.runAll('manual-api');
    res.json({ success: true, data: { recomputed: true, jobs: results } });
  }),
);

export default router;
