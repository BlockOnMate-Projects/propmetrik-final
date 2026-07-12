/**
 * Charts Routes
 * Chart catalog, preview, and snapshot endpoints for publications
 * Wraps existing Analytics API endpoints for CMS use
 */
import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================
// CHART CATALOG — Available analytics endpoints for embedding
// ============================================================

const CHART_CATALOG = [
  {
    id: 'cci_national',
    category: 'Construction',
    title: 'Construction Cost Index — National',
    endpoint: '/api/v1/analytics/ml/construction/index',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'National CCI with material and labor components',
    params: [],
  },
  {
    id: 'cci_regional',
    category: 'Construction',
    title: 'Regional Cost Comparison',
    endpoint: '/api/v1/analytics/ml/construction/regional',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Construction costs by region',
    params: [],
  },
  {
    id: 'construction_materials',
    category: 'Construction',
    title: 'Material Price Trends',
    endpoint: '/api/v1/analytics/ml/construction/materials',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'Cement, steel, roofing material price trends',
    params: [],
  },
  {
    id: 'construction_labor',
    category: 'Construction',
    title: 'Labor Cost Analytics',
    endpoint: '/api/v1/analytics/ml/construction/labor',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Labor cost breakdown by trade',
    params: [],
  },
  {
    id: 'construction_forecast',
    category: 'Construction',
    title: 'Construction Cost Forecast',
    endpoint: '/api/v1/analytics/ml/construction/forecast',
    chartType: 'forecast',
    component: 'ForecastChart',
    description: 'ML-powered cost forecasts with confidence intervals',
    params: [],
  },
  {
    id: 'ghai_current',
    category: 'Affordability',
    title: 'Housing Affordability Index — All Regions',
    endpoint: '/api/v1/analytics/ml/hai/current',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Current GHAI scores across all regions',
    params: [],
  },
  {
    id: 'ghai_region',
    category: 'Affordability',
    title: 'Regional Affordability Detail',
    endpoint: '/api/v1/analytics/ml/hai/region',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'Detailed affordability for a specific region',
    params: [{ name: 'region', type: 'select', options: ['greater_accra', 'ashanti', 'western', 'central', 'eastern', 'northern'] }],
  },
  {
    id: 'ghai_history',
    category: 'Affordability',
    title: 'Affordability History',
    endpoint: '/api/v1/analytics/ml/hai/history',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'Historical GHAI trends',
    params: [],
  },
  {
    id: 'price_index',
    category: 'Market',
    title: 'Property Price Index (GHPI)',
    endpoint: '/api/v1/analytics/ml/market/price-index',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'National and regional property price index',
    params: [],
  },
  {
    id: 'market_activity',
    category: 'Market',
    title: 'Market Activity',
    endpoint: '/api/v1/analytics/ml/market/activity',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Listings, sales, and days-on-market trends',
    params: [],
  },
  {
    id: 'investment_scores',
    category: 'Market',
    title: 'Investment Opportunities',
    endpoint: '/api/v1/analytics/ml/market/investment',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'ML-powered investment opportunity scores',
    params: [],
  },
  {
    id: 'valuation_volume',
    category: 'Valuations',
    title: 'Valuation Volumes',
    endpoint: '/api/v1/analytics/ml/valuations/volume',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Valuation volumes by period and region',
    params: [],
  },
  {
    id: 'ml_performance',
    category: 'ML Performance',
    title: 'AVM Model Accuracy',
    endpoint: '/api/v1/analytics/ml/performance',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'Automated Valuation Model accuracy metrics',
    params: [],
  },
  {
    id: 'ml_performance_segments',
    category: 'ML Performance',
    title: 'Performance by Segment',
    endpoint: '/api/v1/analytics/ml/performance/segments',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Model performance by property type and region',
    params: [],
  },
  {
    id: 'feature_importance',
    category: 'ML Performance',
    title: 'Feature Importance',
    endpoint: '/api/v1/analytics/ml/features',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Feature importance rankings for valuation models',
    params: [],
  },
  {
    id: 'confidence_distribution',
    category: 'ML Performance',
    title: 'Confidence Distributions',
    endpoint: '/api/v1/analytics/ml/confidence',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Prediction confidence distributions',
    params: [],
  },
  {
    id: 'model_drift',
    category: 'ML Performance',
    title: 'Model Drift Detection',
    endpoint: '/api/v1/analytics/ml/monitoring/drift',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'Model drift monitoring over time',
    params: [],
  },
  {
    id: 'dashboard_summary',
    category: 'Overview',
    title: 'Dashboard Summary',
    endpoint: '/api/v1/analytics/dashboard',
    chartType: 'bar',
    component: 'AnalyticsChart',
    description: 'Overall analytics dashboard summary',
    params: [],
  },
  {
    id: 'deal_velocity',
    category: 'Overview',
    title: 'Deal Velocity',
    endpoint: '/api/v1/analytics/velocity',
    chartType: 'line',
    component: 'AnalyticsChart',
    description: 'Deal velocity and pipeline activity',
    params: [],
  },
];

/**
 * GET /api/v1/charts/catalog
 * Returns list of available chart types for the CMS chart picker
 */
router.get('/catalog', (_req: Request, res: Response) => {
  const categories = [...new Set(CHART_CATALOG.map(c => c.category))];
  res.json({
    success: true,
    data: {
      charts: CHART_CATALOG,
      categories,
      total: CHART_CATALOG.length,
    },
  });
});

/**
 * GET /api/v1/charts/preview
 * Fetches data from an analytics endpoint and returns formatted for chart rendering
 * Query params: endpoint, params (JSON string)
 */
router.get('/preview', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.query;
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, error: 'endpoint query parameter is required' });
    }

    // SECURITY: prevent SSRF — only allow endpoints that exist in the chart
    // catalog. A user-supplied URL must never be concatenated into a fetch.
    const allowed = new Set(CHART_CATALOG.map(c => c.endpoint));
    if (!allowed.has(endpoint)) {
      return res.status(400).json({ success: false, error: 'Unknown chart endpoint' });
    }

    // Fetch from the internal analytics API. Identity comes from the
    // authenticated session only — never from client-supplied headers.
    // Self-call: always loopback — never APP_URL (public OAuth-redirect base,
    // may hold a stale ngrok tunnel) and no reason to leave the process's host.
    const apiBase = `http://localhost:${process.env.PORT || 4000}`;
    const apiUrl = `${apiBase}${endpoint}`;

    const response = await fetch(apiUrl, {
      headers: {
        'x-user-id': (req as any).user?.id || '',
        'x-organization-id': (req as any).user?.organizationId || '',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `Analytics API returned ${response.status}` });
    }

    const data = await response.json();
    res.json({ success: true, data, snapshotAt: new Date().toISOString() });
  } catch (error) {
    logger.error('Chart preview failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch chart data' });
  }
});

export default router;
