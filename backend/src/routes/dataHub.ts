/**
 * Data Hub API Routes
 * Phase 2: Data Sources, ETL Jobs, Contributions, Geocoding
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, requireOrganization } from '../middleware/auth';
import {
  dataSourceService,
  etlJobService,
  contributionService,
  contributorProfileService,
  geocodingService,
  dataHubQueueManager,
  DataHubQueueManager,
  dataHubAnalyticsService,
  dataHubPerformanceService,
  spiderManagementService,
  DataCatalogService,
  DataSourceTier,
  EtlJobType,
  EtlJobStatus,
  ContributionType,
  ValidationStatus,
  RegionCode,
} from '../services/data-hub';
import { dataQualityService } from '../services/data-hub/dataQualityService';
import { systemSettingsService } from '../services/data-hub/systemSettingsService';
import { systemHealthService } from '../services/data-hub/systemHealthService';
import { dataLineageService } from '../services/data-hub/dataLineageService';
import { dataInsightsService } from '../services/data-hub/dataInsightsService';
import { economicDataService, EconomicIndicatorType } from '../services/data-hub/economicDataService';
import { constructionCostService, MaterialCategory, LaborCategory } from '../services/data-hub/constructionCostService';
import { logger } from '../utils/logger';
import { query } from '../database';

const router = Router();

// ============================================
// Data Sources
// ============================================

/**
 * List all data sources
 * GET /data-hub/sources
 */
router.get('/sources', asyncHandler(async (req: Request, res: Response) => {
  const filters = {
    tier: req.query.tier as DataSourceTier | undefined,
    is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
    is_paused: req.query.is_paused === 'true' ? true : req.query.is_paused === 'false' ? false : undefined,
    search: req.query.search as string | undefined,
    page: parseInt(req.query.page as string, 10) || 1,
    limit: Math.min(parseInt(req.query.limit as string, 10) || 20, 100),
    sortBy: req.query.sortBy as string | undefined,
    sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
  };

  const result = await dataSourceService.findAll(filters);

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
}));

/**
 * Get data source statistics by tier
 * GET /data-hub/sources/stats/by-tier
 */
router.get('/sources/stats/by-tier', asyncHandler(async (req: Request, res: Response) => {
  const stats = await dataSourceService.getStatsByTier();

  res.json({
    success: true,
    data: stats,
  });
}));

/**
 * Get data source by ID
 * GET /data-hub/sources/:id
 */
router.get('/sources/:id', asyncHandler(async (req: Request, res: Response) => {
  const source = await dataSourceService.findById(req.params.id);

  if (!source) {
    res.status(404).json({
      success: false,
      error: 'Data source not found',
    });
    return;
  }

  res.json({
    success: true,
    data: source,
  });
}));

/**
 * Create data source
 * POST /data-hub/sources
 */
router.post('/sources', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add auth middleware and get user from req.user
  const userId = req.body.created_by || 'system';

  const source = await dataSourceService.create({
    ...req.body,
    created_by: userId,
  });

  logger.info('Data source created', { sourceId: source.id, name: source.name });

  res.status(201).json({
    success: true,
    data: source,
  });
}));

/**
 * Update data source
 * PUT /data-hub/sources/:id
 */
router.put('/sources/:id', asyncHandler(async (req: Request, res: Response) => {
  const source = await dataSourceService.update(req.params.id, req.body);

  if (!source) {
    res.status(404).json({
      success: false,
      error: 'Data source not found',
    });
    return;
  }

  res.json({
    success: true,
    data: source,
  });
}));

/**
 * Delete data source
 * DELETE /data-hub/sources/:id
 */
router.delete('/sources/:id', asyncHandler(async (req: Request, res: Response) => {
  const deleted = await dataSourceService.delete(req.params.id);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'Data source not found',
    });
    return;
  }

  res.json({
    success: true,
    message: 'Data source deleted',
  });
}));

/**
 * Trigger sync for a data source
 * POST /data-hub/sources/:id/sync
 */
router.post('/sources/:id/sync', asyncHandler(async (req: Request, res: Response) => {
  const source = await dataSourceService.findById(req.params.id);

  if (!source) {
    res.status(404).json({
      success: false,
      error: 'Data source not found',
    });
    return;
  }

  // Add job to ingestion queue
  const job = await dataHubQueueManager.addJob(
    DataHubQueueManager.QUEUES.DATA_INGESTION,
    {
      dataSourceId: source.id,
      options: req.body.options || {},
      userId: req.body.userId || 'system',
    }
  );

  res.json({
    success: true,
    message: 'Sync job queued',
    data: {
      jobId: job.id,
      dataSourceId: source.id,
    },
  });
}));

// ============================================
// ETL Jobs
// ============================================

/**
 * Get ETL job statistics
 * GET /data-hub/jobs/stats
 */
router.get('/jobs/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await etlJobService.getStats();

  res.json({
    success: true,
    data: stats,
  });
}));

/**
 * List ETL jobs
 * GET /data-hub/jobs
 */
router.get('/jobs', asyncHandler(async (req: Request, res: Response) => {
  const filters = {
    source_id: req.query.data_source_id as string | undefined,
    job_type: req.query.job_type as EtlJobType | undefined,
    status: req.query.status as EtlJobStatus | undefined,
    page: parseInt(req.query.page as string, 10) || 1,
    limit: Math.min(parseInt(req.query.limit as string, 10) || 20, 100),
  };

  const result = await etlJobService.findAll(filters);

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
}));

/**
 * Get ETL job by ID
 * GET /data-hub/jobs/:id
 */
router.get('/jobs/:id', asyncHandler(async (req: Request, res: Response) => {
  const job = await etlJobService.findById(req.params.id);

  if (!job) {
    res.status(404).json({
      success: false,
      error: 'ETL job not found',
    });
    return;
  }

  res.json({
    success: true,
    data: job,
  });
}));

/**
 * Get ETL job logs
 * GET /data-hub/jobs/:id/logs
 */
router.get('/jobs/:id/logs', asyncHandler(async (req: Request, res: Response) => {
  const level = req.query.level as 'debug' | 'info' | 'warn' | 'error' | undefined;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);

  const logs = await etlJobService.getLogs(req.params.id, { level, limit });

  res.json({
    success: true,
    data: logs,
  });
}));

/**
 * Cancel ETL job
 * POST /data-hub/jobs/:id/cancel
 */
router.post('/jobs/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const job = await etlJobService.cancel(req.params.id, req.body.reason || 'User cancelled');

  if (!job) {
    res.status(404).json({
      success: false,
      error: 'ETL job not found',
    });
    return;
  }

  res.json({
    success: true,
    data: job,
  });
}));

// ============================================
// Contributions
// ============================================

/**
 * Get pending contributions for review
 * GET /data-hub/contributions/pending
 */
router.get('/contributions/pending', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

  const contributions = await contributionService.getPendingForReview(limit);

  res.json({
    success: true,
    data: contributions,
    count: contributions.length,
  });
}));

/**
 * List contributions
 * GET /data-hub/contributions
 */
router.get('/contributions', asyncHandler(async (req: Request, res: Response) => {
  const filters = {
    contributor_id: req.query.contributor_id as string | undefined,
    contribution_type: req.query.contribution_type as ContributionType | undefined,
    validation_status: req.query.validation_status as ValidationStatus | undefined,
    property_region: req.query.property_region as RegionCode | undefined,
    source_context: req.query.source_context as string | undefined,
    page: parseInt(req.query.page as string, 10) || 1,
    limit: Math.min(parseInt(req.query.limit as string, 10) || 20, 100),
  };

  const result = await contributionService.findAll(filters);

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
}));

/**
 * Get contribution stats
 * GET /data-hub/contributions/stats
 */
router.get('/contributions/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await contributionService.getStats();
  res.json({
    success: true,
    data: stats,
  });
}));



// =====================================================
// DATA QUALITY ROUTES
// =====================================================

router.get('/quality/trends', asyncHandler(async (req: Request, res: Response) => {
  const trends = await dataQualityService.getQualityTrends(parseInt(req.query.days as string) || 30);
  res.json({ success: true, data: trends });
}));

router.get('/quality/validation', asyncHandler(async (req: Request, res: Response) => {
  const results = await dataQualityService.getValidationResults();
  res.json({ success: true, data: results });
}));

router.get('/quality/completeness', asyncHandler(async (req: Request, res: Response) => {
  const completeness = await dataQualityService.getFieldCompleteness();
  res.json({ success: true, data: completeness });
}));

router.get('/quality/anomalies', asyncHandler(async (req: Request, res: Response) => {
  const anomalies = await dataQualityService.getAnomalies(parseInt(req.query.limit as string) || 10);
  res.json({ success: true, data: anomalies });
}));

router.get('/quality/profiles', asyncHandler(async (req: Request, res: Response) => {
  const profiles = await dataQualityService.getDataProfiles();
  res.json({ success: true, data: profiles });
}));

// =====================================================
// DATA LINEAGE ROUTES
// =====================================================

router.get('/lineage/flow', asyncHandler(async (req: Request, res: Response) => {
  const flow = await dataLineageService.getLineageFlow();
  res.json({ success: true, data: flow });
}));

router.get('/lineage/audit', asyncHandler(async (req: Request, res: Response) => {
  const logs = await dataLineageService.getAuditLog(parseInt(req.query.limit as string) || 50);
  res.json({ success: true, data: logs });
}));

// =====================================================
// DATA INSIGHTS ROUTES
// =====================================================

router.get('/insights', asyncHandler(async (req: Request, res: Response) => {
  const activeInsights = await dataInsightsService.getActiveInsights();
  const predictions = await dataInsightsService.getPredictions();

  // Combine for now as the frontend expects separate but we can just send everything or 
  // create dedicated endpoints if the frontend is strict.
  // The frontend calls specific endpoints? No, the frontend mocks it currently.
  // Let's assume the frontend will be updated to call this.

  res.json({
    success: true,
    data: {
      insights: activeInsights,
      predictions: predictions
    }
  });
}));

// =====================================================
// SYSTEM SETTINGS ROUTES
// =====================================================

router.get('/settings', asyncHandler(async (req: Request, res: Response) => {
  const settings = await systemSettingsService.getAll();
  res.json({ success: true, data: settings });
}));

router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
  await systemSettingsService.updateBatch(req.body, (req as any).user?.id || 'system');
  res.json({ success: true, message: 'Settings updated' });
}));



router.get('/quality/profiles', asyncHandler(async (req: Request, res: Response) => {
  const profiles = await dataQualityService.getDataProfiles();
  res.json({ success: true, data: profiles });
}));

/**
 * Get contribution by ID
 * GET /data-hub/contributions/:id
 */
router.get('/contributions/:id', asyncHandler(async (req: Request, res: Response) => {
  const contribution = await contributionService.findById(req.params.id);

  if (!contribution) {
    res.status(404).json({
      success: false,
      error: 'Contribution not found',
    });
    return;
  }

  res.json({
    success: true,
    data: contribution,
  });
}));

/**
 * Create contribution
 * POST /data-hub/contributions
 */
router.post('/contributions', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Get user from auth middleware
  const userId = req.body.contributor_id || 'anonymous';

  const contribution = await contributionService.create({
    ...req.body,
    contributor_id: userId,
  });

  res.status(201).json({
    success: true,
    data: contribution,
  });
}));

/**
 * Approve contribution
 * POST /data-hub/contributions/:id/approve
 */
router.post('/contributions/:id/approve', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Get reviewer from auth middleware
  const reviewerId = req.body.reviewer_id || 'system';

  const contribution = await contributionService.approve(
    req.params.id,
    reviewerId,
    req.body.credits_awarded
  );

  if (!contribution) {
    res.status(404).json({
      success: false,
      error: 'Contribution not found',
    });
    return;
  }

  res.json({
    success: true,
    data: contribution,
  });
}));

/**
 * Reject contribution
 * POST /data-hub/contributions/:id/reject
 */
router.post('/contributions/:id/reject', asyncHandler(async (req: Request, res: Response) => {
  const reviewerId = req.body.reviewer_id || 'system';

  if (!req.body.reason) {
    res.status(400).json({
      success: false,
      error: 'Rejection reason is required',
    });
    return;
  }

  const contribution = await contributionService.reject(
    req.params.id,
    reviewerId,
    req.body.reason
  );

  if (!contribution) {
    res.status(404).json({
      success: false,
      error: 'Contribution not found',
    });
    return;
  }

  res.json({
    success: true,
    data: contribution,
  });
}));

// ============================================
// Contributor Profiles
// ============================================

/**
 * Get contributor leaderboard
 * GET /data-hub/contributors/leaderboard
 */
router.get('/contributors/leaderboard', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 100);
  const region = req.query.region as string | undefined;
  const period = req.query.period as 'week' | 'month' | 'all' | undefined;

  const leaderboard = await contributorProfileService.getLeaderboard({
    limit,
    region,
    period,
  });

  res.json({
    success: true,
    data: leaderboard,
  });
}));

/**
 * Get contributor profile
 * GET /data-hub/contributors/:id
 */
router.get('/contributors/:id', asyncHandler(async (req: Request, res: Response) => {
  const profile = await contributorProfileService.findByUserId(req.params.id);

  if (!profile) {
    res.status(404).json({
      success: false,
      error: 'Contributor profile not found',
    });
    return;
  }

  res.json({
    success: true,
    data: profile,
  });
}));

/**
 * Verify professional credentials
 * POST /data-hub/contributors/:id/verify
 */
router.post('/contributors/:id/verify', asyncHandler(async (req: Request, res: Response) => {
  const { profession, license_number } = req.body;

  if (!profession || !license_number) {
    res.status(400).json({
      success: false,
      error: 'profession and license_number are required',
    });
    return;
  }

  const profile = await contributorProfileService.verifyProfessional(
    req.params.id,
    license_number,
    profession
  );

  if (!profile) {
    res.status(404).json({
      success: false,
      error: 'Contributor profile not found',
    });
    return;
  }

  res.json({
    success: true,
    data: profile,
  });
}));

// ============================================
// Geocoding
// ============================================

/**
 * Geocode an address
 * POST /data-hub/geocode
 */
router.post('/geocode', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.body;

  if (!address) {
    res.status(400).json({
      success: false,
      error: 'Address is required',
    });
    return;
  }

  const result = await geocodingService.geocode(address);

  if (!result) {
    res.status(404).json({
      success: false,
      error: 'Could not geocode address',
    });
    return;
  }

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * Reverse geocode coordinates
 * POST /data-hub/geocode/reverse
 */
router.post('/geocode/reverse', asyncHandler(async (req: Request, res: Response) => {
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    res.status(400).json({
      success: false,
      error: 'latitude and longitude are required',
    });
    return;
  }

  const result = await geocodingService.reverseGeocode(latitude, longitude);

  if (!result) {
    res.status(404).json({
      success: false,
      error: 'Could not reverse geocode coordinates',
    });
    return;
  }

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * Batch geocode addresses
 * POST /data-hub/geocode/batch
 */
router.post('/geocode/batch', asyncHandler(async (req: Request, res: Response) => {
  const { addresses } = req.body;

  if (!Array.isArray(addresses) || addresses.length === 0) {
    res.status(400).json({
      success: false,
      error: 'addresses array is required',
    });
    return;
  }

  if (addresses.length > 100) {
    res.status(400).json({
      success: false,
      error: 'Maximum 100 addresses per batch',
    });
    return;
  }

  const results = await geocodingService.geocodeBatch(addresses);

  // Convert Map to object for JSON response
  const data: Record<string, unknown> = {};
  results.forEach((value, key) => {
    data[key] = value;
  });

  res.json({
    success: true,
    data,
    processed: addresses.length,
    successful: Array.from(results.values()).filter(r => r !== null).length,
  });
}));

/**
 * Get geocoding cache statistics
 * GET /data-hub/geocode/stats
 */
router.get('/geocode/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await geocodingService.getCacheStats();

  res.json({
    success: true,
    data: stats,
  });
}));

// ============================================
// Queue Management
// ============================================

/**
 * Get queue statistics
 * GET /data-hub/queues/stats
 */
router.get('/queues/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await dataHubQueueManager.getQueueStats();

  res.json({
    success: true,
    data: stats,
  });
}));

/**
 * Trigger specific job
 * POST /data-hub/queues/trigger
 */
router.post('/queues/trigger', asyncHandler(async (req: Request, res: Response) => {
  const { queue, data, options } = req.body;

  if (!queue || !Object.values(DataHubQueueManager.QUEUES).includes(queue)) {
    res.status(400).json({
      success: false,
      error: 'Invalid queue name',
      valid_queues: Object.values(DataHubQueueManager.QUEUES),
    });
    return;
  }

  const job = await dataHubQueueManager.addJob(queue, data || {}, options);

  res.json({
    success: true,
    message: 'Job added to queue',
    data: {
      jobId: job.id,
      queue,
    },
  });
}));

// ============================================
// Economic Data (Tier 4)
// ============================================

/**
 * Get current economic snapshot
 * GET /data-hub/economic/snapshot
 */
router.get('/economic/snapshot', asyncHandler(async (req: Request, res: Response) => {
  const snapshot = await economicDataService.getLatestSnapshot();

  res.json({
    success: true,
    data: snapshot,
  });
}));

/**
 * Get latest value for an economic indicator
 * GET /data-hub/economic/indicators/:type
 */
router.get('/economic/indicators/:type', asyncHandler(async (req: Request, res: Response) => {
  const indicatorType = req.params.type as EconomicIndicatorType;
  const indicator = await economicDataService.getLatest(indicatorType);

  if (!indicator) {
    res.status(404).json({
      success: false,
      error: `No data found for indicator: ${indicatorType}`,
    });
    return;
  }

  res.json({
    success: true,
    data: indicator,
  });
}));

/**
 * Get historical data for an indicator
 * GET /data-hub/economic/indicators/:type/history
 */
router.get('/economic/indicators/:type/history', asyncHandler(async (req: Request, res: Response) => {
  const indicatorType = req.params.type as EconomicIndicatorType;
  const options = {
    from: req.query.from ? new Date(req.query.from as string) : undefined,
    to: req.query.to ? new Date(req.query.to as string) : undefined,
    limit: parseInt(req.query.limit as string, 10) || 50,
  };

  const history = await economicDataService.getHistory(indicatorType, options);

  res.json({
    success: true,
    data: history,
    count: history.length,
  });
}));

/**
 * Get current exchange rate
 * GET /data-hub/economic/exchange-rate/:currency
 */
router.get('/economic/exchange-rate/:currency', asyncHandler(async (req: Request, res: Response) => {
  const fromCurrency = req.params.currency.toUpperCase();
  const toCurrency = (req.query.to as string)?.toUpperCase() || 'GHS';

  const rate = await economicDataService.getExchangeRate(fromCurrency, toCurrency);

  res.json({
    success: true,
    data: rate,
  });
}));

/**
 * Get historical exchange rate for a specific date (RICS VPS 3 compliant)
 * 
 * This endpoint supports fetching exchange rates as of a specific valuation date,
 * which is critical for RICS Red Book and GhIS compliant retrospective valuations.
 * 
 * @example GET /data-hub/economic/exchange-rate/USD/historical?date=2025-06-15
 * 
 * GET /data-hub/economic/exchange-rate/:currency/historical
 */
router.get('/economic/exchange-rate/:currency/historical', asyncHandler(async (req: Request, res: Response) => {
  const fromCurrency = req.params.currency.toUpperCase();
  const toCurrency = (req.query.to as string)?.toUpperCase() || 'GHS';
  const dateParam = req.query.date as string;

  // Validate date parameter
  if (!dateParam) {
    res.status(400).json({
      success: false,
      error: 'date query parameter is required (format: YYYY-MM-DD)',
      example: '/data-hub/economic/exchange-rate/USD/historical?date=2025-06-15',
    });
    return;
  }

  const asOfDate = new Date(dateParam);

  // Validate date format
  if (isNaN(asOfDate.getTime())) {
    res.status(400).json({
      success: false,
      error: 'Invalid date format. Use ISO 8601 format: YYYY-MM-DD',
      received: dateParam,
    });
    return;
  }

  // Validate date is not too far in the future (max 3 months per RICS VPS 3)
  const maxFutureDate = new Date();
  maxFutureDate.setMonth(maxFutureDate.getMonth() + 3);
  if (asOfDate > maxFutureDate) {
    res.status(400).json({
      success: false,
      error: 'Date cannot be more than 3 months in the future per RICS VPS 3 guidelines',
      received: dateParam,
      maxAllowed: maxFutureDate.toISOString().split('T')[0],
    });
    return;
  }

  // Validate date is not too far in the past (practical limit: 10 years)
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 10);
  if (asOfDate < minDate) {
    res.status(400).json({
      success: false,
      error: 'Historical rates are only available for the last 10 years',
      received: dateParam,
      minAllowed: minDate.toISOString().split('T')[0],
    });
    return;
  }

  try {
    const rate = await economicDataService.getExchangeRateForDate(fromCurrency, toCurrency, asOfDate);

    res.json({
      success: true,
      data: {
        ...rate,
        requested_date: dateParam,
        is_retrospective: asOfDate < new Date(),
        rics_compliant: true,
      },
      metadata: {
        note: 'Exchange rate as of the specified valuation date per RICS VPS 3',
        source_priority: ['Database Cache', 'Yahoo Finance Historical', 'Fallback'],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch historical exchange rate',
      requested: {
        currency: fromCurrency,
        date: dateParam,
      },
    });
  }
}));

/**
 * Convert currency to GHS
 * POST /data-hub/economic/convert
 */
router.post('/economic/convert', asyncHandler(async (req: Request, res: Response) => {
  const { amount, from_currency } = req.body;

  if (!amount || !from_currency) {
    res.status(400).json({
      success: false,
      error: 'amount and from_currency are required',
    });
    return;
  }

  const converted = await economicDataService.convertToGHS(amount, from_currency);

  res.json({
    success: true,
    data: {
      original_amount: amount,
      from_currency,
      to_currency: 'GHS',
      converted_amount: converted,
    },
  });
}));

/**
 * Calculate affordability index
 * POST /data-hub/economic/affordability
 */
router.post('/economic/affordability', asyncHandler(async (req: Request, res: Response) => {
  const { median_property_price, median_household_income } = req.body;

  if (!median_property_price || !median_household_income) {
    res.status(400).json({
      success: false,
      error: 'median_property_price and median_household_income are required',
    });
    return;
  }

  const affordability = await economicDataService.calculateAffordabilityIndex(
    median_property_price,
    median_household_income
  );

  res.json({
    success: true,
    data: affordability,
  });
}));

/**
 * Update Bank of Ghana indicators (admin)
 * POST /data-hub/economic/indicators/bog
 */
router.post('/economic/indicators/bog', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin auth middleware
  await economicDataService.updateBOGIndicators(req.body);

  res.json({
    success: true,
    message: 'BOG indicators updated',
  });
}));

/**
 * Seed initial economic data
 * POST /data-hub/economic/seed
 */
router.post('/economic/seed', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin auth middleware
  await economicDataService.seedInitialData();

  res.json({
    success: true,
    message: 'Economic data seeded',
  });
}));

// ============================================
// Construction Costs (Tier 4)
// ============================================

/**
 * Get material prices
 * GET /data-hub/construction/materials
 */
router.get('/construction/materials', asyncHandler(async (req: Request, res: Response) => {
  const options = {
    category: req.query.category as MaterialCategory | undefined,
    region: req.query.region as RegionCode | undefined,
    supplier_type: req.query.supplier_type as 'retail' | 'wholesale' | 'manufacturer' | undefined,
  };

  const materials = await constructionCostService.getMaterialPrices(options);

  res.json({
    success: true,
    data: materials,
    count: materials.length,
  });
}));

/**
 * Get material price history
 * GET /data-hub/construction/materials/:name/history
 */
router.get('/construction/materials/:name/history', asyncHandler(async (req: Request, res: Response) => {
  const materialName = decodeURIComponent(req.params.name);
  const region = req.query.region as RegionCode || 'greater_accra';
  const options = {
    from: req.query.from ? new Date(req.query.from as string) : undefined,
    to: req.query.to ? new Date(req.query.to as string) : undefined,
    limit: parseInt(req.query.limit as string, 10) || 52,
  };

  const history = await constructionCostService.getMaterialPriceHistory(materialName, region, options);

  res.json({
    success: true,
    data: history,
    count: history.length,
  });
}));

/**
 * Compare material prices across regions
 * GET /data-hub/construction/materials/:name/compare
 */
router.get('/construction/materials/:name/compare', asyncHandler(async (req: Request, res: Response) => {
  const materialName = decodeURIComponent(req.params.name);
  const comparison = await constructionCostService.getMaterialPriceComparison(materialName);

  res.json({
    success: true,
    data: comparison,
  });
}));

/**
 * Create material price entry
 * POST /data-hub/construction/materials
 */
router.post('/construction/materials', asyncHandler(async (req: Request, res: Response) => {
  const material = await constructionCostService.createMaterialPrice(req.body);

  res.status(201).json({
    success: true,
    data: material,
  });
}));

/**
 * Get labor rates
 * GET /data-hub/construction/labor
 */
router.get('/construction/labor', asyncHandler(async (req: Request, res: Response) => {
  const options = {
    category: req.query.category as LaborCategory | undefined,
    skill_level: req.query.skill_level as 'apprentice' | 'journeyman' | 'master' | 'specialist' | undefined,
    region: req.query.region as RegionCode | undefined,
  };

  const rates = await constructionCostService.getLaborRates(options);

  res.json({
    success: true,
    data: rates,
    count: rates.length,
  });
}));

/**
 * Create labor rate entry
 * POST /data-hub/construction/labor
 */
router.post('/construction/labor', asyncHandler(async (req: Request, res: Response) => {
  const rate = await constructionCostService.createLaborRate(req.body);

  res.status(201).json({
    success: true,
    data: rate,
  });
}));

/**
 * Get construction cost estimate
 * POST /data-hub/construction/estimate
 */
router.post('/construction/estimate', asyncHandler(async (req: Request, res: Response) => {
  const {
    property_type = 'residential',
    quality_level = 'standard',
    region = 'greater_accra',
    built_area_sqm,
    num_floors = 1,
  } = req.body;

  if (!built_area_sqm) {
    res.status(400).json({
      success: false,
      error: 'built_area_sqm is required',
    });
    return;
  }

  const estimate = await constructionCostService.estimateConstructionCost(
    property_type,
    quality_level,
    region as RegionCode,
    built_area_sqm,
    num_floors
  );

  res.json({
    success: true,
    data: estimate,
  });
}));

/**
 * Calculate depreciated replacement cost
 * POST /data-hub/construction/drc
 */
router.post('/construction/drc', asyncHandler(async (req: Request, res: Response) => {
  const {
    property_type = 'residential',
    quality_level = 'standard',
    region = 'greater_accra',
    built_area_sqm,
    age_years,
    condition = 'good',
  } = req.body;

  if (!built_area_sqm || age_years === undefined) {
    res.status(400).json({
      success: false,
      error: 'built_area_sqm and age_years are required',
    });
    return;
  }

  const drc = await constructionCostService.calculateDepreciatedReplacementCost(
    property_type,
    quality_level,
    region as RegionCode,
    built_area_sqm,
    age_years,
    condition
  );

  res.json({
    success: true,
    data: drc,
  });
}));

/**
 * Get latest construction cost index
 * GET /data-hub/construction/index
 */
router.get('/construction/index', asyncHandler(async (req: Request, res: Response) => {
  const region = req.query.region as RegionCode | undefined;
  const index = await constructionCostService.getLatestConstructionIndex(region);

  if (!index) {
    res.status(404).json({
      success: false,
      error: 'No construction cost index found',
    });
    return;
  }

  res.json({
    success: true,
    data: index,
  });
}));

/**
 * Seed initial construction cost data
 * POST /data-hub/construction/seed
 */
router.post('/construction/seed', asyncHandler(async (req: Request, res: Response) => {
  try {
    await constructionCostService.seedInitialData();
    res.json({
      success: true,
      message: 'Construction cost data seeded',
    });
  } catch (error: any) {
    logger.error('Error in POST /construction/seed', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}));

// ============================================
// Economic Data Sync (Scrapers)
// ============================================

import {
  economicDataSyncService,
  SyncSource,
  SyncType,
} from '../services/data-hub/scrapers';

/**
 * Get sync status for all sources
 * GET /data-hub/economic/sync/status
 */
router.get('/economic/sync/status', asyncHandler(async (req: Request, res: Response) => {
  const status = await economicDataSyncService.getStatus();

  res.json({
    success: true,
    data: status,
  });
}));

/**
 * Get sync history
 * GET /data-hub/economic/sync/history
 */
router.get('/economic/sync/history', asyncHandler(async (req: Request, res: Response) => {
  const source = req.query.source as string | undefined;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const history = await economicDataSyncService.getHistory(source, limit);

  res.json({
    success: true,
    data: history,
    count: history.length,
  });
}));

/**
 * Get sync statistics
 * GET /data-hub/economic/sync/stats
 */
router.get('/economic/sync/stats', asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string, 10) || 30;
  const stats = await economicDataSyncService.getStats(days);

  res.json({
    success: true,
    data: stats,
  });
}));

/**
 * Trigger manual sync for a source
 * POST /data-hub/economic/sync/:source
 */
router.post('/economic/sync/:source', asyncHandler(async (req: Request, res: Response) => {
  const source = req.params.source as SyncSource;
  const syncType = (req.query.type as SyncType) || 'full';
  const triggeredBy = req.body.triggered_by || 'api';

  // Validate source
  if (!['bog', 'wdi', 'fx', 'all'].includes(source)) {
    res.status(400).json({
      success: false,
      error: `Invalid source: ${source}. Must be one of: bog, wdi, fx, all`,
    });
    return;
  }

  logger.info('Manual sync triggered', { source, syncType, triggeredBy });

  const result = await economicDataSyncService.sync({
    source,
    type: syncType,
    triggeredBy,
  });

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * Get live FX rates
 * GET /data-hub/economic/fx/live
 */
router.get('/economic/fx/live', asyncHandler(async (req: Request, res: Response) => {
  const rates = await economicDataSyncService.getLiveFXRates();

  res.json({
    success: true,
    data: rates,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Convert currency to GHS
 * POST /data-hub/economic/fx/convert
 */
router.post('/economic/fx/convert', asyncHandler(async (req: Request, res: Response) => {
  const { amount, currency } = req.body;

  if (!amount || !currency) {
    res.status(400).json({
      success: false,
      error: 'amount and currency are required',
    });
    return;
  }

  const result = await economicDataSyncService.convertToGHS(amount, currency);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * Health check for all data sources
 * GET /data-hub/economic/sync/health
 */
router.get('/economic/sync/health', asyncHandler(async (req: Request, res: Response) => {
  const health = await economicDataSyncService.healthCheck();

  res.json({
    success: true,
    data: health,
    all_healthy: Object.values(health).every(h => h),
  });
}));

/**
 * Clear all caches
 * POST /data-hub/economic/sync/clear-cache
 */
router.post('/economic/sync/clear-cache', asyncHandler(async (req: Request, res: Response) => {
  await economicDataSyncService.clearCaches();

  res.json({
    success: true,
    message: 'All caches cleared',
  });
}));

// ============================================
// Scheduler Management
// ============================================

import { economicDataScheduler } from '../services/data-hub/schedulers';

/**
 * Get scheduler status
 * GET /data-hub/scheduler/status
 */
router.get('/scheduler/status', asyncHandler(async (req: Request, res: Response) => {
  const isActive = economicDataScheduler.isActive();
  const jobStatus = economicDataScheduler.getStatus();

  res.json({
    success: true,
    data: {
      isActive,
      jobs: jobStatus,
      timestamp: new Date().toISOString(),
    },
  });
}));

/**
 * Start the scheduler
 * POST /data-hub/scheduler/start
 */
router.post('/scheduler/start', asyncHandler(async (req: Request, res: Response) => {
  if (economicDataScheduler.isActive()) {
    res.status(400).json({
      success: false,
      error: 'Scheduler is already running',
    });
    return;
  }

  economicDataScheduler.start();

  res.json({
    success: true,
    message: 'Scheduler started',
    data: {
      isActive: economicDataScheduler.isActive(),
      jobs: economicDataScheduler.getStatus(),
    },
  });
}));

/**
 * Stop the scheduler
 * POST /data-hub/scheduler/stop
 */
router.post('/scheduler/stop', asyncHandler(async (req: Request, res: Response) => {
  if (!economicDataScheduler.isActive()) {
    res.status(400).json({
      success: false,
      error: 'Scheduler is not running',
    });
    return;
  }

  economicDataScheduler.stop();

  res.json({
    success: true,
    message: 'Scheduler stopped',
  });
}));

/**
 * Trigger immediate sync via scheduler
 * POST /data-hub/scheduler/trigger/:source
 */
router.post('/scheduler/trigger/:source', asyncHandler(async (req: Request, res: Response) => {
  const rawSource = req.params.source.toUpperCase();

  // Normalize 'ALL' to 'all' for consistency
  const source = rawSource === 'ALL' ? 'all' : rawSource as SyncSource | 'all';

  // Validate source
  const validSources = ['BOG', 'WDI', 'FX', 'all'];
  if (!validSources.includes(source)) {
    res.status(400).json({
      success: false,
      error: `Invalid source: ${source}. Must be one of: ${validSources.join(', ')}`,
    });
    return;
  }

  logger.info('Manual scheduler trigger', { source, triggeredBy: 'api' });

  // Run async - don't wait
  economicDataScheduler.triggerSync(source).catch(err => {
    logger.error('Scheduler trigger failed', { source, error: err });
  });

  res.json({
    success: true,
    message: `Sync triggered for ${source}`,
    note: 'Sync is running in background. Check /scheduler/status for progress.',
  });
}));

// ============================================
// Monitoring & Health
// ============================================

import { economicDataMonitoringService } from '../services/data-hub/monitoring';

/**
 * Get comprehensive monitoring report
 * GET /data-hub/monitoring/report
 */
router.get('/monitoring/report', asyncHandler(async (req: Request, res: Response) => {
  const report = await economicDataMonitoringService.getFullReport();

  res.json({
    success: true,
    data: report,
  });
}));

/**
 * Check data freshness
 * GET /data-hub/monitoring/freshness
 */
router.get('/monitoring/freshness', asyncHandler(async (req: Request, res: Response) => {
  const freshness = await economicDataMonitoringService.checkDataFreshness();

  const isAllFresh = freshness.every((f) => !f.isStale);

  res.json({
    success: true,
    data: {
      checks: freshness,
      allFresh: isAllFresh,
      timestamp: new Date().toISOString(),
    },
  });
}));

/**
 * Get source health status
 * GET /data-hub/monitoring/health
 */
router.get('/monitoring/health', asyncHandler(async (req: Request, res: Response) => {
  const health = await economicDataMonitoringService.getSourceHealth();

  const overallHealthy = health.every((h) => h.status === 'healthy');

  res.json({
    success: true,
    data: {
      sources: health,
      allHealthy: overallHealthy,
      timestamp: new Date().toISOString(),
    },
  });
}));

/**
 * Get active alerts
 * GET /data-hub/monitoring/alerts
 */
router.get('/monitoring/alerts', asyncHandler(async (req: Request, res: Response) => {
  const alerts = await economicDataMonitoringService.getActiveAlerts();

  res.json({
    success: true,
    data: {
      alerts,
      count: alerts.length,
      hasCritical: alerts.some((a) => a.severity === 'critical'),
    },
  });
}));

/**
 * Acknowledge an alert
 * POST /data-hub/monitoring/alerts/:alertId/acknowledge
 */
router.post('/monitoring/alerts/:alertId/acknowledge', asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;

  await economicDataMonitoringService.acknowledgeAlert(alertId);

  res.json({
    success: true,
    message: `Alert ${alertId} acknowledged`,
  });
}));

/**
 * Get data metrics
 * GET /data-hub/monitoring/metrics
 */
router.get('/monitoring/metrics', asyncHandler(async (req: Request, res: Response) => {
  const report = await economicDataMonitoringService.getFullReport();

  res.json({
    success: true,
    data: {
      metrics: report.metrics,
      timestamp: new Date().toISOString(),
    },
  });
}));

// ============================================
// Valuation Configuration (Admin)
// ============================================

/**
 * Get material category weights
 * GET /data-hub/valuation-config/material-weights
 */
router.get('/valuation-config/material-weights', asyncHandler(async (req: Request, res: Response) => {
  const result = await constructionCostService.getMaterialWeights();

  res.json({
    success: true,
    data: result,
    count: result.length,
  });
}));

/**
 * Update material category weight
 * PUT /data-hub/valuation-config/material-weights/:category
 */
router.put('/valuation-config/material-weights/:category', asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.params;
  const { weight, updated_by } = req.body;

  if (weight === undefined) {
    res.status(400).json({
      success: false,
      error: 'Weight is required',
    });
    return;
  }

  await constructionCostService.updateMaterialWeight(category, weight, updated_by);

  res.json({
    success: true,
    message: `Material weight for ${category} updated`,
  });
}));

/**
 * Get regional location factors
 * GET /data-hub/valuation-config/regional-factors
 */
router.get('/valuation-config/regional-factors', asyncHandler(async (req: Request, res: Response) => {
  const result = await constructionCostService.getRegionalFactors();

  res.json({
    success: true,
    data: result,
    count: result.length,
  });
}));

/**
 * Get single regional factor
 * GET /data-hub/valuation-config/regional-factors/:regionCode
 */
router.get('/valuation-config/regional-factors/:regionCode', asyncHandler(async (req: Request, res: Response) => {
  const { regionCode } = req.params;
  const result = await constructionCostService.getRegionalFactor(regionCode);

  if (!result) {
    res.status(404).json({
      success: false,
      error: `Regional factor for ${regionCode} not found`,
    });
    return;
  }

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * Update regional location factor
 * PUT /data-hub/valuation-config/regional-factors/:regionCode
 */
router.put('/valuation-config/regional-factors/:regionCode', asyncHandler(async (req: Request, res: Response) => {
  const { regionCode } = req.params;
  const { location_factor, updated_by } = req.body;

  if (location_factor === undefined) {
    res.status(400).json({
      success: false,
      error: 'Location factor is required',
    });
    return;
  }

  await constructionCostService.updateRegionalFactor(regionCode, location_factor, updated_by);

  res.json({
    success: true,
    message: `Regional factor for ${regionCode} updated`,
  });
}));

/**
 * Get base construction costs
 * GET /data-hub/valuation-config/base-costs
 */
router.get('/valuation-config/base-costs', asyncHandler(async (req: Request, res: Response) => {
  const result = await constructionCostService.getBaseCosts();

  res.json({
    success: true,
    data: result,
    count: result.length,
  });
}));

/**
 * Update base construction cost
 * PUT /data-hub/valuation-config/base-costs/:qualityTier
 */
router.put('/valuation-config/base-costs/:qualityTier', asyncHandler(async (req: Request, res: Response) => {
  const { qualityTier } = req.params;
  const { base_cost_per_sqm, updated_by } = req.body;

  if (base_cost_per_sqm === undefined) {
    res.status(400).json({
      success: false,
      error: 'Base cost per sqm is required',
    });
    return;
  }

  await constructionCostService.updateBaseCost(qualityTier, base_cost_per_sqm, updated_by);

  res.json({
    success: true,
    message: `Base cost for ${qualityTier} updated`,
  });
}));

// ============================================
// Data Quality Statistics
// ============================================

/**
 * Get comprehensive data quality statistics
 * GET /data-hub/quality/stats
 * 
 * Returns metrics for data quality dashboard:
 * - Total properties by source
 * - Geocoding coverage percentage
 * - Price data coverage percentage
 * - Average data age by source
 * - Evidence type distribution
 * - Weekly trends
 */
router.get('/quality/stats', asyncHandler(async (req: Request, res: Response) => {
  // Total properties by source
  const sourceStatsResult = await query(`
    SELECT 
      data_source,
      COUNT(*) as total,
      COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as geocoded,
      COUNT(CASE WHEN price IS NOT NULL AND price > 0 THEN 1 END) as with_price,
      COUNT(CASE WHEN listing_status = 'delisted' THEN 1 END) as delisted,
      AVG(EXTRACT(EPOCH FROM (NOW() - scraped_at)) / 86400)::numeric(10,1) as avg_age_days,
      AVG(CASE WHEN completeness_score IS NOT NULL THEN completeness_score ELSE 0 END)::numeric(5,2) as avg_completeness,
      MAX(scraped_at) as last_scraped
    FROM properties
    WHERE created_at >= NOW() - INTERVAL '1 year'
    GROUP BY data_source
    ORDER BY total DESC
  `);

  // Overall statistics
  const overallStatsResult = await query(`
    SELECT 
      COUNT(*) as total_properties,
      COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as geocoded_properties,
      COUNT(CASE WHEN price IS NOT NULL AND price > 0 THEN 1 END) as with_price,
      COUNT(CASE WHEN listing_status = 'delisted' THEN 1 END) as delisted_properties,
      COUNT(CASE WHEN evidence_type IS NOT NULL THEN 1 END) as with_evidence_type,
      COUNT(CASE WHEN digital_address IS NOT NULL THEN 1 END) as with_digital_address,
      COUNT(CASE WHEN building_size_sqm IS NOT NULL OR land_size_sqm IS NOT NULL THEN 1 END) as with_size_data,
      COUNT(CASE WHEN images IS NOT NULL AND array_length(images, 1) > 0 THEN 1 END) as with_images,
      AVG(completeness_score)::numeric(5,2) as avg_completeness_score
    FROM properties
    WHERE created_at >= NOW() - INTERVAL '1 year'
  `);

  // Evidence type distribution
  const evidenceDistributionResult = await query(`
    SELECT 
      COALESCE(evidence_type, 'unclassified') as evidence_type,
      COUNT(*) as count
    FROM properties
    WHERE created_at >= NOW() - INTERVAL '1 year'
    GROUP BY evidence_type
    ORDER BY count DESC
  `);

  // Property type distribution
  const propertyTypeDistributionResult = await query(`
    SELECT 
      COALESCE(property_type, 'unknown') as property_type,
      COUNT(*) as count
    FROM properties
    WHERE created_at >= NOW() - INTERVAL '1 year'
    GROUP BY property_type
    ORDER BY count DESC
    LIMIT 10
  `);

  // Region distribution
  const regionDistributionResult = await query(`
    SELECT 
      COALESCE(region, 'unknown') as region,
      COUNT(*) as count,
      COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as geocoded
    FROM properties
    WHERE created_at >= NOW() - INTERVAL '1 year'
    GROUP BY region
    ORDER BY count DESC
  `);

  // Weekly trends (last 12 weeks)
  const weeklyTrendsResult = await query(`
    SELECT 
      DATE_TRUNC('week', created_at) as week,
      COUNT(*) as new_properties,
      COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as geocoded,
      COUNT(CASE WHEN price IS NOT NULL THEN 1 END) as with_price,
      AVG(completeness_score)::numeric(5,2) as avg_completeness
    FROM properties
    WHERE created_at >= NOW() - INTERVAL '12 weeks'
    GROUP BY DATE_TRUNC('week', created_at)
    ORDER BY week DESC
  `);

  // Calculate percentages
  const overall = overallStatsResult.rows[0] || {};
  const total = parseInt(overall.total_properties) || 1;

  res.json({
    success: true,
    data: {
      overview: {
        total_properties: parseInt(overall.total_properties) || 0,
        geocoding_coverage: ((parseInt(overall.geocoded_properties) || 0) / total * 100).toFixed(1),
        price_coverage: ((parseInt(overall.with_price) || 0) / total * 100).toFixed(1),
        delisted_count: parseInt(overall.delisted_properties) || 0,
        with_evidence_type: parseInt(overall.with_evidence_type) || 0,
        with_digital_address: parseInt(overall.with_digital_address) || 0,
        with_size_data: parseInt(overall.with_size_data) || 0,
        with_images: parseInt(overall.with_images) || 0,
        avg_completeness_score: parseFloat(overall.avg_completeness_score) || 0,
      },
      by_source: sourceStatsResult.rows.map(row => ({
        source: row.data_source || 'unknown',
        total: parseInt(row.total),
        geocoded: parseInt(row.geocoded),
        geocoding_pct: ((parseInt(row.geocoded) / parseInt(row.total)) * 100).toFixed(1),
        with_price: parseInt(row.with_price),
        price_pct: ((parseInt(row.with_price) / parseInt(row.total)) * 100).toFixed(1),
        delisted: parseInt(row.delisted),
        avg_age_days: parseFloat(row.avg_age_days) || 0,
        avg_completeness: parseFloat(row.avg_completeness) || 0,
        last_scraped: row.last_scraped,
      })),
      evidence_distribution: evidenceDistributionResult.rows.map(row => ({
        type: row.evidence_type,
        count: parseInt(row.count),
      })),
      property_type_distribution: propertyTypeDistributionResult.rows.map(row => ({
        type: row.property_type,
        count: parseInt(row.count),
      })),
      region_distribution: regionDistributionResult.rows.map(row => ({
        region: row.region,
        count: parseInt(row.count),
        geocoded: parseInt(row.geocoded),
        geocoding_pct: ((parseInt(row.geocoded) / parseInt(row.count)) * 100).toFixed(1),
      })),
      weekly_trends: weeklyTrendsResult.rows.map(row => ({
        week: row.week,
        new_properties: parseInt(row.new_properties),
        geocoded: parseInt(row.geocoded),
        with_price: parseInt(row.with_price),
        avg_completeness: parseFloat(row.avg_completeness) || 0,
      })),
    },
  });
}));

/**
 * Get geocoding coverage statistics
 * GET /data-hub/quality/geocoding
 */
router.get('/quality/geocoding', asyncHandler(async (req: Request, res: Response) => {
  const result = await query(`
    SELECT 
      data_source,
      region,
      COUNT(*) as total,
      COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as geocoded,
      COUNT(CASE WHEN digital_address IS NOT NULL THEN 1 END) as with_gps_code,
      COUNT(CASE WHEN coordinates_source = 'ghanapost_gps' THEN 1 END) as geocoded_via_gps,
      COUNT(CASE WHEN coordinates_source = 'geocoded' THEN 1 END) as geocoded_via_api,
      COUNT(CASE WHEN coordinates_source = 'original' THEN 1 END) as original_coords
    FROM properties
    WHERE created_at >= NOW() - INTERVAL '1 year'
    GROUP BY data_source, region
    ORDER BY data_source, region
  `);

  // Aggregate by source
  const bySource: Record<string, any> = {};
  result.rows.forEach(row => {
    const source = row.data_source || 'unknown';
    if (!bySource[source]) {
      bySource[source] = {
        total: 0,
        geocoded: 0,
        with_gps_code: 0,
        geocoded_via_gps: 0,
        geocoded_via_api: 0,
        original_coords: 0,
      };
    }
    bySource[source].total += parseInt(row.total);
    bySource[source].geocoded += parseInt(row.geocoded);
    bySource[source].with_gps_code += parseInt(row.with_gps_code);
    bySource[source].geocoded_via_gps += parseInt(row.geocoded_via_gps);
    bySource[source].geocoded_via_api += parseInt(row.geocoded_via_api);
    bySource[source].original_coords += parseInt(row.original_coords);
  });

  res.json({
    success: true,
    data: {
      by_source: Object.entries(bySource).map(([source, stats]: [string, any]) => ({
        source,
        ...stats,
        geocoding_pct: ((stats.geocoded / stats.total) * 100).toFixed(1),
      })),
      by_source_and_region: result.rows,
    },
  });
}));

// ============================================
// Data Hub Analytics
// ============================================

router.get('/analytics/volume', asyncHandler(async (req: Request, res: Response) => {
  const stats = await dataHubAnalyticsService.getVolumeByTier();
  res.json({ success: true, data: stats });
}));

router.get('/analytics/trends', asyncHandler(async (req: Request, res: Response) => {
  const range = (req.query.range as any) || '24h';
  const trends = await dataHubAnalyticsService.getVolumeTrends(range);
  res.json({ success: true, data: trends });
}));

router.get('/analytics/geographic', asyncHandler(async (req: Request, res: Response) => {
  const dist = await dataHubAnalyticsService.getGeographicDistribution();
  res.json({ success: true, data: dist });
}));

router.get('/analytics/performance', asyncHandler(async (req: Request, res: Response) => {
  const perf = await dataHubAnalyticsService.getSourcePerformance();
  res.json({ success: true, data: perf });
}));

router.get('/analytics/temporal', asyncHandler(async (req: Request, res: Response) => {
  const patterns = await dataHubAnalyticsService.getTemporalPatterns();
  res.json({ success: true, data: patterns });
}));

// ============================================
// Data Hub Performance
// ============================================

router.get('/performance/ingestion', asyncHandler(async (req: Request, res: Response) => {
  const speed = await dataHubPerformanceService.getIngestionSpeed();
  res.json({ success: true, data: speed });
}));

router.get('/performance/processing', asyncHandler(async (req: Request, res: Response) => {
  const times = await dataHubPerformanceService.getProcessingTime();
  res.json({ success: true, data: times });
}));

router.get('/performance/queues', asyncHandler(async (req: Request, res: Response) => {
  const queues = await dataHubPerformanceService.getQueueDepth();
  res.json({ success: true, data: queues });
}));

router.get('/performance/resources', asyncHandler(async (req: Request, res: Response) => {
  const resources = await dataHubPerformanceService.getResourceUtilization();
  res.json({ success: true, data: resources });
}));

router.get('/performance/sla', asyncHandler(async (req: Request, res: Response) => {
  const sla = await dataHubPerformanceService.getSlaMetrics();
  res.json({ success: true, data: sla });
}));

router.get('/performance/bottlenecks', asyncHandler(async (req: Request, res: Response) => {
  const alertList = await dataHubPerformanceService.getBottlenecks();
  res.json({ success: true, data: alertList });
}));

// ============================================
// Spider Management
// ============================================

router.get('/spiders', asyncHandler(async (req: Request, res: Response) => {
  const spiders = await spiderManagementService.listSpiders();
  res.json({ success: true, data: spiders });
}));

router.post('/spiders/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const success = await spiderManagementService.startSpider(req.params.id);
  res.json({ success });
}));

router.post('/spiders/:id/stop', asyncHandler(async (req: Request, res: Response) => {
  const success = await spiderManagementService.stopSpider(req.params.id);
  res.json({ success });
}));


// ============================================
// Data Catalog
// ============================================

router.get('/catalog/entries', asyncHandler(async (req: Request, res: Response) => {
  const entries = await DataCatalogService.listEntries();
  res.json({ success: true, data: entries });
}));

router.get('/catalog/entries/:id/schema', asyncHandler(async (req: Request, res: Response) => {
  const fields = await DataCatalogService.getSchema(req.params.id);
  res.json({ success: true, data: fields });
}));

// ============================================
// SYSTEM HEALTH ROUTES
// ============================================

router.get(
  '/system/health',
  asyncHandler(async (req: Request, res: Response) => {
    const health = await systemHealthService.getSystemHealth();
    res.json({
      success: true,
      data: health
    });
  })
);

export default router;

