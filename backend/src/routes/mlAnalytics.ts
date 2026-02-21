/**
 * ML Analytics API Routes
 *
 * Express router exposing the ML Analytics endpoints defined in Analytics.md
 * Sections 1-4 (data-hub powered) and Sections 8.1-8.7 (ML Serving powered).
 *
 * Mount: /api/v1/analytics/ml
 *
 * @module routes/mlAnalytics
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { mlAnalyticsService } from '../services/analytics/mlAnalyticsService';

const router = Router();

// ============================================================================
// HELPERS
// ============================================================================

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      logger.error('ML Analytics route error', { error: err.message, path: req.path });
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    });
  };
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * GET /api/v1/analytics/ml/dashboard
 * High-level ML analytics dashboard summary
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const summary = await mlAnalyticsService.getDashboardSummary();
    res.json({ success: true, data: summary });
  }),
);

/**
 * GET /api/v1/analytics/ml/health
 * ML Serving microservice health check
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const available = await mlAnalyticsService.isMLServiceAvailable();
    if (available) {
      const health = await mlAnalyticsService.checkMLServiceHealth();
      res.json({ success: true, data: health });
    } else {
      res.status(503).json({ success: false, error: 'ML service unavailable' });
    }
  }),
);

// ============================================================================
// SECTION 1: Construction Cost Analytics
// ============================================================================

/**
 * GET /api/v1/analytics/ml/construction/index
 * Current national construction cost index with components
 */
router.get(
  '/construction/index',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.getConstructionCostIndex();
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/construction/regional
 * Regional cost comparison data
 */
router.get(
  '/construction/regional',
  asyncHandler(async (req, res) => {
    const region = req.query.region as string | undefined;
    const data = await mlAnalyticsService.getRegionalCosts(region);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/construction/materials
 * Material price trends
 */
router.get(
  '/construction/materials',
  asyncHandler(async (req, res) => {
    const material = req.query.material as string | undefined;
    const period = req.query.period as string | undefined;
    const data = await mlAnalyticsService.getMaterialPriceTrends(material, period);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/construction/labor
 * Labor cost analytics
 */
router.get(
  '/construction/labor',
  asyncHandler(async (req, res) => {
    const skillLevel = req.query.skill_level as string | undefined;
    const region = req.query.region as string | undefined;
    const data = await mlAnalyticsService.getLaborCostAnalytics(skillLevel, region);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/construction/forecast
 * Cost forecasts with confidence intervals (via ML Serving)
 */
router.get(
  '/construction/forecast',
  asyncHandler(async (req, res) => {
    const region = (req.query.region as string) || 'greater_accra';
    const horizon = parseInt(req.query.horizon as string, 10) || 6;
    const data = await mlAnalyticsService.forecastPrices({ region, forecast_months: horizon });
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 2: Housing Affordability Index (GHAI)
// ============================================================================

/**
 * GET /api/v1/analytics/ml/hai/current
 * Current GHAI values for all regions
 */
router.get(
  '/hai/current',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.getHousingAffordabilityIndex();
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/hai/region/:region
 * Detailed HAI for a specific region
 */
router.get(
  '/hai/region/:region',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.getHousingAffordabilityIndex(req.params.region);
    res.json({ success: true, data: data.length > 0 ? data[0] : null });
  }),
);

/**
 * GET /api/v1/analytics/ml/hai/history
 * Historical GHAI trends for a region
 */
router.get(
  '/hai/history',
  asyncHandler(async (req, res) => {
    const region = req.query.region as string;
    if (!region) {
      res.status(400).json({ success: false, error: 'region query parameter is required' });
      return;
    }
    const months = parseInt(req.query.period as string, 10) || 24;
    const data = await mlAnalyticsService.getHAIHistory(region, months);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 3: Valuation Analytics
// ============================================================================

/**
 * GET /api/v1/analytics/ml/valuations/volume
 * Valuation volume metrics
 */
router.get(
  '/valuations/volume',
  asyncHandler(async (req, res) => {
    const period = req.query.period as string | undefined;
    const region = req.query.region as string | undefined;
    const data = await mlAnalyticsService.getValuationVolume(period, region);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 4: Market Intelligence
// ============================================================================

/**
 * GET /api/v1/analytics/ml/market/price-index
 * Property price index
 */
router.get(
  '/market/price-index',
  asyncHandler(async (req, res) => {
    const region = req.query.region as string | undefined;
    const propertyType = req.query.property_type as string | undefined;
    const data = await mlAnalyticsService.getMarketPriceIndex(region, propertyType);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/market/activity
 * Market activity metrics (listings, sales, days on market)
 */
router.get(
  '/market/activity',
  asyncHandler(async (req, res) => {
    const region = req.query.region as string | undefined;
    const period = req.query.period as string | undefined;
    const data = await mlAnalyticsService.getMarketActivity(region, period);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/market/investment
 * Investment opportunity scores (ML-powered)
 */
router.get(
  '/market/investment',
  asyncHandler(async (req, res) => {
    const region = req.query.region as string | undefined;
    const data = await mlAnalyticsService.getInvestmentOpportunities(region);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 8.1: AVM Performance
// ============================================================================

/**
 * GET /api/v1/analytics/ml/performance
 * AVM model accuracy metrics
 */
router.get(
  '/performance',
  asyncHandler(async (req, res) => {
    const modelVersion = req.query.model_version as string | undefined;
    const periodDays = req.query.period_days ? parseInt(req.query.period_days as string, 10) : undefined;
    const data = await mlAnalyticsService.getAVMPerformance(modelVersion, periodDays);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/performance/segments
 * Performance broken down by property type, region, price band
 */
router.get(
  '/performance/segments',
  asyncHandler(async (req, res) => {
    const modelVersion = req.query.model_version as string | undefined;
    const segmentType = req.query.segment_type as string | undefined;
    const data = await mlAnalyticsService.getPerformanceBySegment(modelVersion, segmentType);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/performance/trend
 * Performance metric trend over time
 */
router.get(
  '/performance/trend',
  asyncHandler(async (req, res) => {
    const metricName = req.query.metric_name as string | undefined;
    const modelVersion = req.query.model_version as string | undefined;
    const months = req.query.months ? parseInt(req.query.months as string, 10) : undefined;
    const data = await mlAnalyticsService.getPerformanceTrend(metricName, modelVersion, months);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 8.2: Feature Importance
// ============================================================================

/**
 * GET /api/v1/analytics/ml/features
 * Feature importance rankings
 */
router.get(
  '/features',
  asyncHandler(async (req, res) => {
    const modelVersion = req.query.model_version as string | undefined;
    const data = await mlAnalyticsService.getFeatureImportance(modelVersion);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/predictions/:id/explain
 * SHAP-based explanation for a specific prediction
 */
router.get(
  '/predictions/:id/explain',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.explainPrediction(req.params.id);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 8.3: Prediction Confidence
// ============================================================================

/**
 * GET /api/v1/analytics/ml/confidence
 * Confidence distribution across predictions
 */
router.get(
  '/confidence',
  asyncHandler(async (req, res) => {
    const modelVersion = req.query.model_version as string | undefined;
    const periodDays = req.query.period_days ? parseInt(req.query.period_days as string, 10) : undefined;
    const data = await mlAnalyticsService.getConfidenceDistribution(modelVersion, periodDays);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 8.4: Model Drift & Monitoring
// ============================================================================

/**
 * GET /api/v1/analytics/ml/monitoring/drift
 * Drift detection (concept, data, and prediction drift)
 */
router.get(
  '/monitoring/drift',
  asyncHandler(async (req, res) => {
    const modelVersion = req.query.model_version as string | undefined;
    const baselineDays = req.query.baseline_days ? parseInt(req.query.baseline_days as string, 10) : undefined;
    const currentDays = req.query.current_days ? parseInt(req.query.current_days as string, 10) : undefined;
    const data = await mlAnalyticsService.detectDrift(modelVersion, baselineDays, currentDays);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/monitoring/drift/features
 * Per-feature data drift analysis
 */
router.get(
  '/monitoring/drift/features',
  asyncHandler(async (req, res) => {
    const modelVersion = req.query.model_version as string | undefined;
    const data = await mlAnalyticsService.getDataDriftDetails(modelVersion);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 8.5: Price Forecasting
// ============================================================================

/**
 * GET /api/v1/analytics/ml/forecast
 * Price forecasts for a region/property type
 */
router.get(
  '/forecast',
  asyncHandler(async (req, res) => {
    const region = (req.query.region as string) || 'greater_accra';
    const propertyType = req.query.property_type as string | undefined;
    const horizon = parseInt(req.query.horizon as string, 10) || 6;
    const data = await mlAnalyticsService.forecastPrices({
      region,
      property_type: propertyType,
      forecast_months: horizon,
    });
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 8.6: Ensemble Analytics
// ============================================================================

/**
 * GET /api/v1/analytics/ml/ensemble
 * Ensemble model composition and diversity analytics
 */
router.get(
  '/ensemble',
  asyncHandler(async (req, res) => {
    const modelVersion = req.query.model_version as string | undefined;
    const data = await mlAnalyticsService.getEnsembleAnalytics(modelVersion);
    res.json({ success: true, data });
  }),
);

// ============================================================================
// SECTION 8.7: Centralized ML/NLP Services
// ============================================================================

// --- Sentiment Analysis ---

/**
 * POST /api/v1/analytics/ml/sentiment/analyze
 * Analyze sentiment from news/social/reports/policy
 */
router.post(
  '/sentiment/analyze',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.analyzeSentiment(req.body);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/sentiment/history
 * Historical sentiment results
 */
router.get(
  '/sentiment/history',
  asyncHandler(async (req, res) => {
    const sourceType = req.query.source_type as string | undefined;
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const data = await mlAnalyticsService.getSentimentHistory(sourceType, days, limit);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/sentiment/market-confidence
 * Aggregated market confidence index
 */
router.get(
  '/sentiment/market-confidence',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const data = await mlAnalyticsService.getMarketConfidenceIndex(days);
    res.json({ success: true, data });
  }),
);

// --- Named Entity Recognition ---

/**
 * POST /api/v1/analytics/ml/ner/extract
 * Extract named entities from text
 */
router.post(
  '/ner/extract',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.extractEntities(req.body);
    res.json({ success: true, data });
  }),
);

/**
 * POST /api/v1/analytics/ml/ner/batch
 * Batch entity extraction
 */
router.post(
  '/ner/batch',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.batchExtractEntities(req.body);
    res.json({ success: true, data });
  }),
);

// --- Trend Extraction ---

/**
 * POST /api/v1/analytics/ml/trends/analyze
 * Analyze text for market trends
 */
router.post(
  '/trends/analyze',
  asyncHandler(async (req, res) => {
    const { text, source_type } = req.body;
    const data = await mlAnalyticsService.analyzeTrends(text, source_type);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/v1/analytics/ml/trends/trending
 * Current trending topics
 */
router.get(
  '/trends/trending',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const data = await mlAnalyticsService.getTrendingTopics(days, limit);
    res.json({ success: true, data });
  }),
);

// --- Document Intelligence ---

/**
 * POST /api/v1/analytics/ml/documents/process
 * Process a document and extract structured data
 */
router.post(
  '/documents/process',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.processDocument(req.body);
    res.json({ success: true, data });
  }),
);

/**
 * POST /api/v1/analytics/ml/documents/batch
 * Batch document processing
 */
router.post(
  '/documents/batch',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.batchProcessDocuments(req.body);
    res.json({ success: true, data });
  }),
);

// --- AI Assistant ---

/**
 * POST /api/v1/analytics/ml/assistant/query
 * Natural language market intelligence query
 */
router.post(
  '/assistant/query',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.assistantQuery(req.body);
    res.json({ success: true, data });
  }),
);

/**
 * POST /api/v1/analytics/ml/assistant/report
 * Generate automated market report
 */
router.post(
  '/assistant/report',
  asyncHandler(async (req, res) => {
    const data = await mlAnalyticsService.generateReport(req.body);
    res.json({ success: true, data });
  }),
);

export default router;
