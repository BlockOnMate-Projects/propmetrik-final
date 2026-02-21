/**
 * Market Intelligence API Routes (Phase 3)
 *
 * Mount: /api/v1/analytics/market  +  /api/analytics/market
 *
 * Endpoints:
 *   GET /price-index              — latest price index by region/type
 *   GET /price-index/history      — monthly price index time-series
 *   GET /activity/summary         — market activity per region/type
 *   GET /activity/history         — monthly activity time-series
 *   GET /supply-demand            — supply/demand metrics per region
 *   GET /price-distribution       — price histogram buckets
 *   GET /recent-transactions      — latest transactions
 *   GET /rental/summary           — rental market summary
 *   GET /rental/yields            — rental yield analysis
 *   GET /rental/trends            — monthly rental price trends
 *   GET /rental/benchmarks        — rental_market_benchmarks data
 *   GET /investment/opportunities — scored investment opportunities
 *   GET /investment/regional      — regional comparison matrix
 *   GET /investment/:region       — detail for a specific region
 *   POST /compute-snapshot        — compute & persist market snapshot
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { marketIntelligenceService } from '../services/analytics/marketIntelligenceService';
import { rentalAnalyticsService } from '../services/analytics/rentalAnalyticsService';
import { investmentScoringService } from '../services/analytics/investmentScoringService';
import { logger } from '../utils/logger';

const router = Router();

// ====================================================================
// PRICE INDEX
// ====================================================================

router.get(
  '/price-index',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await marketIntelligenceService.getPriceIndex({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/price-index/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await marketIntelligenceService.getPriceIndexHistory({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ====================================================================
// MARKET ACTIVITY
// ====================================================================

router.get(
  '/activity/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await marketIntelligenceService.getMarketActivity({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/activity/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await marketIntelligenceService.getMarketActivityHistory({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ====================================================================
// SUPPLY / DEMAND
// ====================================================================

router.get(
  '/supply-demand',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.query as Record<string, string>;
    const data = await marketIntelligenceService.getSupplyDemand({
      region: region || undefined,
    });
    res.json({ success: true, data });
  }),
);

// ====================================================================
// PRICE DISTRIBUTION
// ====================================================================

router.get(
  '/price-distribution',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await marketIntelligenceService.getPriceDistribution({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ====================================================================
// RECENT TRANSACTIONS
// ====================================================================

router.get(
  '/recent-transactions',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, limit } = req.query as Record<string, string>;
    const data = await marketIntelligenceService.getRecentTransactions({
      region: region || undefined,
      propertyType: propertyType || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

// ====================================================================
// RENTAL ANALYTICS
// ====================================================================

router.get(
  '/rental/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await rentalAnalyticsService.getRentalSummary({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/rental/yields',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType } = req.query as Record<string, string>;
    const data = await rentalAnalyticsService.getRentalYields({
      region: region || undefined,
      propertyType: propertyType || undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/rental/trends',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType, months } = req.query as Record<string, string>;
    const data = await rentalAnalyticsService.getRentalTrends({
      region: region || undefined,
      propertyType: propertyType || undefined,
      months: months ? parseInt(months, 10) : undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/rental/benchmarks',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType } = req.query as Record<string, string>;
    const data = await rentalAnalyticsService.getRentalBenchmarks({
      region: region || undefined,
      propertyType: propertyType || undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/rental/by-region',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await rentalAnalyticsService.getRentalByRegion();
    res.json({ success: true, data });
  }),
);

// ====================================================================
// INVESTMENT OPPORTUNITIES
// ====================================================================

router.get(
  '/investment/opportunities',
  asyncHandler(async (req: Request, res: Response) => {
    const { region, propertyType } = req.query as Record<string, string>;
    const data = await investmentScoringService.getOpportunities({
      region: region || undefined,
      propertyType: propertyType || undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/investment/regional',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await investmentScoringService.getRegionalComparison();
    res.json({ success: true, data });
  }),
);

router.get(
  '/investment/:region',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.params;
    const data = await investmentScoringService.getRegionDetail(region);
    if (!data) {
      res.status(404).json({ success: false, error: `No investment data for region: ${region}` });
      return;
    }
    res.json({ success: true, data });
  }),
);

// ====================================================================
// SNAPSHOT COMPUTATION
// ====================================================================

router.post(
  '/compute-snapshot',
  asyncHandler(async (req: Request, res: Response) => {
    const date = req.body.date ? new Date(req.body.date) : new Date();
    logger.info('Manual market snapshot computation triggered', { date: date.toISOString() });

    // Run both snapshot computations
    await Promise.all([
      marketIntelligenceService.computeAndStoreSnapshot(date),
      investmentScoringService.computeAndStoreSnapshot(date),
    ]);

    res.json({ success: true, data: { message: 'Market intelligence snapshot computed', date: date.toISOString() } });
  }),
);

export default router;
