/**
 * Valuation Analytics Routes (Phase 2)
 *
 * REST API endpoints for Analytics.md Section 3:
 *   3.1 — Portfolio Valuation Volume
 *   3.2 — Method Performance & Quality
 *   3.3 — Valuer Performance / Leaderboard
 *   3.4 — Market-Relative Analytics
 *   3.5 — Floor Plan Analytics
 *   3.6 — Sensitivity Analysis
 *
 * Mounted at: /api/v1/analytics/valuations
 *           + /api/analytics/valuations  (frontend compat)
 *
 * @module routes/valuationAnalytics
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { valuationAnalyticsService } from '../services/analytics/valuationAnalyticsService';
import { floorPlanAnalyticsService } from '../services/analytics/floorPlanAnalyticsService';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================================
// 3.1 PORTFOLIO VALUATION VOLUME
// ============================================================================

/**
 * GET /volume/summary
 * Get valuation volume summary with breakdowns.
 * Query: ?region=greater_accra&propertyType=residential&months=12
 */
router.get(
  '/volume/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getVolumeSummary({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /volume/history
 * Get valuation volume time series.
 * Query: ?region=greater_accra&propertyType=residential&months=24
 */
router.get(
  '/volume/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getVolumeHistory({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ============================================================================
// 3.2 METHOD PERFORMANCE & QUALITY
// ============================================================================

/**
 * GET /methods/performance
 * Get current method performance metrics.
 * Query: ?region=greater_accra&propertyType=residential&months=12
 */
router.get(
  '/methods/performance',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getMethodPerformance({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /methods/history
 * Get method performance history (time series).
 * Query: ?region=greater_accra&months=12
 */
router.get(
  '/methods/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, months } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getMethodHistory({
      region: region || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /quality
 * Get quality and comparable metrics.
 * Query: ?region=greater_accra&months=12
 */
router.get(
  '/quality',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, months } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getQualityMetrics({
      region: region || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ============================================================================
// 3.3 VALUER PERFORMANCE / LEADERBOARD
// ============================================================================

/**
 * GET /valuers/leaderboard
 * Get valuer leaderboard.
 * Query: ?region=greater_accra&months=6&sortBy=volume&limit=50
 */
router.get(
  '/valuers/leaderboard',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, months, sortBy, limit } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getValuerLeaderboard({
      region: region || undefined,
      months: months ? parseInt(months, 10) : undefined,
      sortBy: (sortBy as 'volume' | 'quality' | 'speed' | 'value') || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /valuers/:valuerId
 * Get detailed performance for a specific valuer.
 * Query: ?months=12
 */
router.get(
  '/valuers/:valuerId',
  asyncHandler(async (req: Request, res: Response) => {
    const { valuerId } = req.params;
    const { months } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getValuerDetail(
      valuerId,
      months ? parseInt(months, 10) : undefined,
    );
    if (!data) {
      return res.status(404).json({ success: false, error: 'Valuer not found' });
    }
    res.json({ success: true, data });
  }),
);

// ============================================================================
// 3.4 MARKET-RELATIVE ANALYTICS
// ============================================================================

/**
 * GET /market-relative
 * Get market-relative valuation analytics.
 * Query: ?region=greater_accra&propertyType=residential
 */
router.get(
  '/market-relative',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getMarketRelative({
      region: region || undefined,
      propertyType: propertyType || undefined,
    });
    res.json({ success: true, data });
  }),
);

// ============================================================================
// 3.5 FLOOR PLAN ANALYTICS
// ============================================================================

/**
 * GET /floor-plans/summary
 * Get floor plan summary metrics.
 * Query: ?region=greater_accra&propertyType=residential&months=24
 */
router.get(
  '/floor-plans/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await floorPlanAnalyticsService.getSummary({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /floor-plans/by-region
 * Get floor plan analytics by region.
 * Query: ?months=24
 */
router.get(
  '/floor-plans/by-region',
  asyncHandler(async (req: Request, res: Response) => {
    const { months } = req.query as Record<string, string>;
    const data = await floorPlanAnalyticsService.getByRegion({
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /floor-plans/rooms
 * Get room size analytics by room type.
 * Query: ?region=greater_accra&propertyType=residential&months=24
 */
router.get(
  '/floor-plans/rooms',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await floorPlanAnalyticsService.getRoomAnalytics({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /floor-plans/distribution
 * Get GFA size distribution (histogram data).
 * Query: ?region=greater_accra&propertyType=residential&months=24
 */
router.get(
  '/floor-plans/distribution',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await floorPlanAnalyticsService.getGFADistribution({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /floor-plans/compliance
 * Get Ghana Building Code compliance violations.
 * Query: ?region=greater_accra&months=24
 */
router.get(
  '/floor-plans/compliance',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, months } = req.query as Record<string, string>;
    const data = await floorPlanAnalyticsService.getComplianceViolations({
      region: region || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ============================================================================
// 3.6 SENSITIVITY ANALYSIS
// ============================================================================

/**
 * GET /sensitivity/:valuationId
 * Get sensitivity analyses for a specific valuation.
 */
router.get(
  '/sensitivity/:valuationId',
  asyncHandler(async (req: Request, res: Response) => {
    const { valuationId } = req.params;
    const data = await valuationAnalyticsService.getSensitivityAnalyses(valuationId);
    res.json({ success: true, data });
  }),
);

/**
 * GET /sensitivity/summary
 * Get aggregated sensitivity analysis summary.
 * Query: ?region=greater_accra&months=12
 */
router.get(
  '/sensitivity-summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, months } = req.query as Record<string, string>;
    const data = await valuationAnalyticsService.getSensitivitySummary({
      region: region || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SNAPSHOT COMPUTATION
// ============================================================================

/**
 * POST /compute-snapshot
 * Compute and store a valuation analytics snapshot.
 * Body: { date?: string, period_type?: string }
 */
router.post(
  '/compute-snapshot',
  asyncHandler(async (req: Request, res: Response) => {
    const { date, period_type = 'monthly' } = req.body;
    const snapshotDate = date ? new Date(date) : new Date();
    await valuationAnalyticsService.computeAndStoreSnapshot(snapshotDate, period_type);
    res.json({ success: true, message: `Snapshot computed for ${snapshotDate.toISOString().split('T')[0]}` });
  }),
);

export default router;
