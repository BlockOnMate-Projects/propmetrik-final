/**
 * Data Hub API Routes
 * Phase 2: Data Sources, ETL Jobs, Contributions, Geocoding
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { 
  dataSourceService, 
  etlJobService, 
  contributionService, 
  contributorProfileService,
  geocodingService,
  dataHubQueueManager,
  DataHubQueueManager,
  DataSourceTier,
  EtlJobType,
  EtlJobStatus,
  ContributionType,
  ValidationStatus,
  RegionCode,
} from '../services/data-hub';
import { economicDataService, EconomicIndicatorType } from '../services/data-hub/economicDataService';
import { constructionCostService, MaterialCategory, LaborCategory } from '../services/data-hub/constructionCostService';
import { logger } from '../utils/logger';

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
  // TODO: Add admin auth middleware
  await constructionCostService.seedInitialData();

  res.json({
    success: true,
    message: 'Construction cost data seeded',
  });
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

export default router;
