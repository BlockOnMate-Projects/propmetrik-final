/**
 * Commercialization Routes — Phase 7
 * 
 * Usage Analytics & Customer Success endpoints for the admin portal.
 * Aggregates data from existing tables:
 *   - api_key_usage_daily  (per-key request counts)
 *   - subscription_usage   (metric-level consumption)
 *   - subscriptions / subscription_plans
 *   - organizations
 *   - properties / valuations / deals
 * 
 * Mounted at /api/v1/admin/platform
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { logger } from '../utils/logger';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ────────────────────────────────────────────────────────────────
// USAGE ANALYTICS
// ────────────────────────────────────────────────────────────────

/**
 * GET /usage/summary
 * High-level usage KPIs: total API calls, active orgs, active subs, etc.
 */
router.get('/usage/summary', asyncHandler(async (_req: Request, res: Response) => {
  const [
    apiCalls,
    activeOrgs,
    activeSubs,
    totalProperties,
    totalValuations,
    totalDeals,
    totalUsers,
  ] = await Promise.all([
    // Total API calls (last 30 days)
    pool.query(`
      SELECT COALESCE(SUM(request_count), 0) AS total,
             COALESCE(SUM(error_count), 0)   AS errors
      FROM api_key_usage_daily
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `).catch(() => ({ rows: [{ total: 0, errors: 0 }] })),

    // Active organizations (with at least 1 property or valuation)
    pool.query(`
      SELECT COUNT(DISTINCT organization_id) AS count
      FROM (
        SELECT organization_id FROM properties WHERE organization_id IS NOT NULL
        UNION
        SELECT organization_id FROM valuations WHERE organization_id IS NOT NULL
      ) t
    `).catch(() => ({ rows: [{ count: 0 }] })),

    // Active subscriptions
    pool.query(`
      SELECT COUNT(*) AS count FROM subscriptions WHERE status = 'active'
    `).catch(() => ({ rows: [{ count: 0 }] })),

    // Content counts
    pool.query(`SELECT COUNT(*) AS count FROM properties`),
    pool.query(`SELECT COUNT(*) AS count FROM valuations`).catch(() => ({ rows: [{ count: 0 }] })),
    pool.query(`SELECT COUNT(*) AS count FROM deals`).catch(() => ({ rows: [{ count: 0 }] })),
    pool.query(`SELECT COUNT(*) AS count FROM users`).catch(() => ({ rows: [{ count: 0 }] })),
  ]);

  res.json({
    success: true,
    data: {
      api_calls_30d: parseInt(apiCalls.rows[0]?.total) || 0,
      api_errors_30d: parseInt(apiCalls.rows[0]?.errors) || 0,
      active_organizations: parseInt(activeOrgs.rows[0]?.count) || 0,
      active_subscriptions: parseInt(activeSubs.rows[0]?.count) || 0,
      total_properties: parseInt(totalProperties.rows[0]?.count) || 0,
      total_valuations: parseInt(totalValuations.rows[0]?.count) || 0,
      total_deals: parseInt(totalDeals.rows[0]?.count) || 0,
      total_users: parseInt(totalUsers.rows[0]?.count) || 0,
    },
  });
}));

/**
 * GET /usage/daily
 * Daily API call volume for the last N days (default 30)
 */
router.get('/usage/daily', asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 90);

  const result = await pool.query(`
    SELECT
      d.date::text AS date,
      COALESCE(u.requests, 0) AS requests,
      COALESCE(u.errors, 0)   AS errors
    FROM generate_series(
      CURRENT_DATE - ($1 || ' days')::interval,
      CURRENT_DATE,
      '1 day'
    ) AS d(date)
    LEFT JOIN (
      SELECT date, SUM(request_count) AS requests, SUM(error_count) AS errors
      FROM api_key_usage_daily
      GROUP BY date
    ) u ON u.date = d.date::date
    ORDER BY d.date
  `, [days]).catch(() => ({ rows: [] }));

  res.json({ success: true, data: result.rows });
}));

/**
 * GET /usage/by-endpoint
 * Top endpoints by call volume (last 30 days)
 */
router.get('/usage/by-endpoint', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT
      ep.key AS endpoint,
      SUM((ep.value)::int) AS calls
    FROM api_key_usage_daily u,
         jsonb_each_text(u.endpoints_hit) ep
    WHERE u.date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY ep.key
    ORDER BY calls DESC
    LIMIT 20
  `).catch(() => ({ rows: [] }));

  res.json({ success: true, data: result.rows });
}));

/**
 * GET /usage/by-org
 * API usage breakdown by organization
 */
router.get('/usage/by-org', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT
      COALESCE(o.name, 'Unknown') AS org_name,
      o.id AS org_id,
      SUM(u.request_count) AS total_requests,
      SUM(u.error_count)   AS total_errors,
      COUNT(DISTINCT u.key_id) AS api_keys,
      MIN(u.date) AS first_seen,
      MAX(u.date) AS last_active
    FROM api_key_usage_daily u
    JOIN org_api_keys k ON k.id = u.key_id
    JOIN organizations o ON o.id = k.organization_id
    WHERE u.date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY o.id, o.name
    ORDER BY total_requests DESC
    LIMIT 50
  `).catch(() => ({ rows: [] }));

  res.json({ success: true, data: result.rows });
}));

// ────────────────────────────────────────────────────────────────
// CUSTOMER SUCCESS
// ────────────────────────────────────────────────────────────────

/**
 * GET /customers/health
 * Customer health dashboard – org-level metrics
 */
router.get('/customers/health', asyncHandler(async (_req: Request, res: Response) => {
  // Fetch organizations with subscription and activity data
  const orgs = await pool.query(`
    SELECT
      o.id,
      o.name,
      o.subscription_status,
      o.created_at,
      s.plan_id,
      sp.name AS plan_name,
      sp.tier,
      s.status AS sub_status,
      s.current_period_end,
      (SELECT COUNT(*) FROM properties p WHERE p.organization_id = o.id) AS properties,
      (SELECT COUNT(*) FROM valuations v WHERE v.organization_id = o.id) AS valuations,
      (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id)      AS users,
      (
        SELECT COALESCE(SUM(request_count), 0)
        FROM api_key_usage_daily aku
        JOIN org_api_keys ak ON ak.id = aku.key_id
        WHERE ak.organization_id = o.id
          AND aku.date >= CURRENT_DATE - INTERVAL '30 days'
      ) AS api_calls_30d
    FROM organizations o
    LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status = 'active'
    LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
    ORDER BY o.created_at DESC
    LIMIT 100
  `).catch(() => ({ rows: [] }));

  // Health scoring: active sub + recent API usage + content = healthy
  const customers = orgs.rows.map((o: any) => {
    const activity = parseInt(o.api_calls_30d) || 0;
    const content = (parseInt(o.properties) || 0) + (parseInt(o.valuations) || 0);
    const hasSub = o.sub_status === 'active';
    
    let health: 'healthy' | 'at_risk' | 'churned' | 'new' = 'new';
    if (hasSub && activity > 100 && content > 0) health = 'healthy';
    else if (hasSub && (activity > 0 || content > 0)) health = 'at_risk';
    else if (!hasSub && content > 0) health = 'churned';

    return {
      id: o.id,
      name: o.name,
      plan: o.plan_name || 'Free',
      tier: o.tier || 'none',
      status: o.sub_status || 'none',
      health,
      properties: parseInt(o.properties) || 0,
      valuations: parseInt(o.valuations) || 0,
      users: parseInt(o.users) || 0,
      api_calls_30d: activity,
      renewal_date: o.current_period_end,
      joined: o.created_at,
    };
  });

  // Aggregate health metrics
  const summary = {
    total: customers.length,
    healthy: customers.filter((c: any) => c.health === 'healthy').length,
    at_risk: customers.filter((c: any) => c.health === 'at_risk').length,
    churned: customers.filter((c: any) => c.health === 'churned').length,
    new_accounts: customers.filter((c: any) => c.health === 'new').length,
  };

  res.json({ success: true, data: { summary, customers } });
}));

/**
 * GET /customers/metrics
 * Aggregate subscription & revenue metrics
 */
router.get('/customers/metrics', asyncHandler(async (_req: Request, res: Response) => {
  const [subMetrics, planBreakdown, recentEvents] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')    AS active,
        COUNT(*) FILTER (WHERE status = 'cancelled')  AS cancelled,
        COUNT(*) FILTER (WHERE status = 'past_due')   AS past_due,
        COUNT(*) FILTER (WHERE status = 'trialing')   AS trialing,
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'active' THEN
          COALESCE((SELECT price_ghs FROM subscription_plans WHERE id = plan_id), 0)
        END), 0) AS mrr_ghs
      FROM subscriptions
    `).catch(() => ({ rows: [{ active: 0, cancelled: 0, past_due: 0, trialing: 0, total: 0, mrr_ghs: 0 }] })),

    pool.query(`
      SELECT sp.name AS plan_name, sp.tier, COUNT(s.id) AS subscribers
      FROM subscription_plans sp
      LEFT JOIN subscriptions s ON s.plan_id = sp.id AND s.status = 'active'
      WHERE sp.is_active = true
      GROUP BY sp.id, sp.name, sp.tier
      ORDER BY subscribers DESC
    `).catch(() => ({ rows: [] })),

    pool.query(`
      SELECT event_type, subscription_id, metadata, created_at
      FROM subscription_events
      ORDER BY created_at DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),
  ]);

  res.json({
    success: true,
    data: {
      subscriptions: {
        active: parseInt(subMetrics.rows[0]?.active) || 0,
        cancelled: parseInt(subMetrics.rows[0]?.cancelled) || 0,
        past_due: parseInt(subMetrics.rows[0]?.past_due) || 0,
        trialing: parseInt(subMetrics.rows[0]?.trialing) || 0,
        total: parseInt(subMetrics.rows[0]?.total) || 0,
        mrr_ghs: parseFloat(subMetrics.rows[0]?.mrr_ghs) || 0,
      },
      plan_breakdown: planBreakdown.rows,
      recent_events: recentEvents.rows,
    },
  });
}));

// ────────────────────────────────────────────────────────────────
// API CATALOG (for API Docs portal)
// ────────────────────────────────────────────────────────────────

/**
 * GET /api-catalog
 * Returns the full list of API endpoints organized by domain
 */
router.get('/api-catalog', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      version: 'v1',
      base_url: '/api/v1',
      domains: [
        {
          name: 'Market Intelligence',
          prefix: '/analytics/market',
          endpoints: [
            { method: 'GET', path: '/price-index', description: 'Property price index by region/type', params: ['region', 'property_type'] },
            { method: 'GET', path: '/price-index/history', description: 'Monthly price index time-series', params: ['region', 'months'] },
            { method: 'GET', path: '/activity/summary', description: 'Market activity per region/type', params: ['region'] },
            { method: 'GET', path: '/activity/history', description: 'Monthly activity time-series', params: ['region', 'months'] },
            { method: 'GET', path: '/supply-demand', description: 'Supply/demand metrics per region', params: ['region'] },
            { method: 'GET', path: '/price-distribution', description: 'Price histogram distribution', params: ['region', 'property_type'] },
            { method: 'GET', path: '/recent-transactions', description: 'Latest property transactions', params: ['limit'] },
            { method: 'GET', path: '/rental/summary', description: 'Rental market summary', params: ['region'] },
            { method: 'GET', path: '/rental/yields', description: 'Rental yield analysis', params: ['region'] },
            { method: 'GET', path: '/rental/trends', description: 'Monthly rental price trends', params: ['region'] },
            { method: 'GET', path: '/rental/benchmarks', description: 'Rental market benchmarks', params: [] },
            { method: 'GET', path: '/investment/opportunities', description: 'Scored investment opportunities', params: ['region'] },
            { method: 'GET', path: '/investment/regional', description: 'Regional comparison matrix', params: [] },
            { method: 'GET', path: '/investment/:region', description: 'Detail for a specific region', params: ['region'] },
          ],
        },
        {
          name: 'Construction Analytics',
          prefix: '/analytics/platform/construction',
          endpoints: [
            { method: 'GET', path: '/cost-index', description: 'National construction cost index', params: ['region'] },
            { method: 'GET', path: '/cost-index/history', description: 'CCI historical data', params: ['months'] },
            { method: 'GET', path: '/regional', description: 'Regional construction cost data', params: [] },
            { method: 'GET', path: '/materials', description: 'Material price trends', params: [] },
            { method: 'GET', path: '/labor', description: 'Labor cost analytics', params: [] },
            { method: 'GET', path: '/forecast', description: 'Cost forecasts (ML-powered)', params: ['horizon'] },
          ],
        },
        {
          name: 'Housing Affordability',
          prefix: '/analytics/platform/hai',
          endpoints: [
            { method: 'GET', path: '/current', description: 'All regional GHAI values', params: [] },
            { method: 'GET', path: '/region/:region', description: 'Detailed HAI for a region', params: ['region'] },
            { method: 'GET', path: '/history', description: 'Historical HAI trends', params: ['months'] },
            { method: 'GET', path: '/components/:region', description: 'MHAI, CHAI, RHAI breakdown', params: ['region'] },
          ],
        },
        {
          name: 'Valuation Analytics',
          prefix: '/analytics/valuations',
          endpoints: [
            { method: 'GET', path: '/volume/summary', description: 'Portfolio valuation volume with breakdowns', params: ['period'] },
            { method: 'GET', path: '/volume/history', description: 'Monthly volume time series', params: ['months'] },
            { method: 'GET', path: '/methods/performance', description: 'Per-method accuracy/usage metrics', params: [] },
            { method: 'GET', path: '/quality', description: 'Comparable quality, confidence distribution', params: [] },
            { method: 'GET', path: '/valuers/leaderboard', description: 'Sorted valuer rankings', params: ['limit'] },
            { method: 'GET', path: '/valuers/:valuerId', description: 'Detailed valuer metrics', params: ['valuerId'] },
            { method: 'GET', path: '/market-relative', description: 'Valuation vs market position metrics', params: [] },
            { method: 'GET', path: '/sensitivity/:valuationId', description: 'Sensitivity analyses for valuation', params: ['valuationId'] },
          ],
        },
        {
          name: 'ML/AI Analytics',
          prefix: '/analytics/ml',
          endpoints: [
            { method: 'GET', path: '/dashboard', description: 'ML analytics dashboard summary', params: [] },
            { method: 'GET', path: '/health', description: 'ML service health check', params: [] },
            { method: 'GET', path: '/performance', description: 'AVM accuracy metrics', params: [] },
            { method: 'GET', path: '/performance/trend', description: 'Performance trend over time', params: ['metric_name'] },
            { method: 'GET', path: '/performance/segments', description: 'Performance by segment', params: ['segment_type'] },
            { method: 'GET', path: '/features', description: 'Feature importance rankings', params: [] },
            { method: 'GET', path: '/predictions/:id/explain', description: 'SHAP prediction explanation', params: ['id'] },
            { method: 'GET', path: '/confidence', description: 'Confidence distribution histogram', params: [] },
            { method: 'GET', path: '/monitoring/drift', description: 'Drift detection summary', params: [] },
            { method: 'GET', path: '/monitoring/drift/features', description: 'Per-feature PSI & KS stats', params: [] },
            { method: 'GET', path: '/forecast', description: 'Price forecasts with scenarios', params: ['region', 'property_type', 'horizon'] },
            { method: 'GET', path: '/ensemble', description: 'Ensemble model analytics', params: [] },
            { method: 'POST', path: '/sentiment/analyze', description: 'Analyze text sentiment', params: ['text'] },
            { method: 'POST', path: '/ner/extract', description: 'Extract named entities from text', params: ['text'] },
            { method: 'POST', path: '/assistant/query', description: 'Natural language query', params: ['question'] },
            { method: 'POST', path: '/assistant/report', description: 'Generate market report', params: ['region'] },
          ],
        },
        {
          name: 'Properties & Listings',
          prefix: '/properties',
          endpoints: [
            { method: 'GET', path: '/', description: 'List properties with filters', params: ['region', 'type', 'min_price', 'max_price', 'page'] },
            { method: 'GET', path: '/:id', description: 'Property detail', params: ['id'] },
            { method: 'POST', path: '/', description: 'Create new property', params: [] },
            { method: 'PUT', path: '/:id', description: 'Update property', params: ['id'] },
          ],
        },
        {
          name: 'Valuations',
          prefix: '/valuations',
          endpoints: [
            { method: 'GET', path: '/', description: 'List valuations', params: ['status', 'page'] },
            { method: 'GET', path: '/:id', description: 'Valuation detail', params: ['id'] },
            { method: 'POST', path: '/', description: 'Create valuation request', params: [] },
            { method: 'PUT', path: '/:id', description: 'Update valuation', params: ['id'] },
          ],
        },
        {
          name: 'Subscriptions & Billing',
          prefix: '/subscriptions',
          endpoints: [
            { method: 'GET', path: '/plans', description: 'List all active plans', params: ['category', 'segment', 'tier'] },
            { method: 'GET', path: '/plans/:slug', description: 'Plan detail by slug', params: ['slug'] },
            { method: 'GET', path: '/subscription', description: 'Current subscription', params: [] },
            { method: 'POST', path: '/subscribe', description: 'Create new subscription', params: ['plan_id'] },
            { method: 'POST', path: '/subscription/change-plan', description: 'Upgrade/downgrade plan', params: ['plan_id'] },
            { method: 'GET', path: '/subscription/usage', description: 'Usage metrics for current period', params: [] },
            { method: 'GET', path: '/invoices', description: 'Invoice history', params: ['page'] },
          ],
        },
        {
          name: 'Data Hub',
          prefix: '/data-hub',
          endpoints: [
            { method: 'GET', path: '/sources', description: 'List data sources', params: [] },
            { method: 'GET', path: '/analytics/geographic', description: 'Geographic analytics', params: [] },
            { method: 'GET', path: '/analytics/quality', description: 'Data quality scores', params: [] },
            { method: 'GET', path: '/ingestion/jobs', description: 'Ingestion job history', params: ['status'] },
          ],
        },
        {
          name: 'Ticker / Live Data',
          prefix: '/ticker',
          endpoints: [
            { method: 'GET', path: '/', description: 'Live market ticker data for TopNav', params: [] },
          ],
        },
      ],
    },
  });
}));

// ────────────────────────────────────────────────────────────────
// ONBOARDING STATUS
// ────────────────────────────────────────────────────────────────

/**
 * GET /onboarding/checklist
 * Returns the onboarding completion status for the current org/user
 */
router.get('/onboarding/checklist', asyncHandler(async (req: Request, res: Response) => {
  // Use the user from auth if available, otherwise return template
  const userId = (req as any).user?.id;
  const orgId = (req as any).user?.organization_id;

  // Check completion status of each onboarding step
  const [hasProperties, hasValuations, hasApiKey, hasSubscription, hasTeamMembers] = await Promise.all([
    pool.query(`SELECT EXISTS(SELECT 1 FROM properties WHERE organization_id = $1 OR created_by = $2) AS done`, [orgId, userId]).catch(() => ({ rows: [{ done: false }] })),
    pool.query(`SELECT EXISTS(SELECT 1 FROM valuations WHERE organization_id = $1 OR requested_by = $2) AS done`, [orgId, userId]).catch(() => ({ rows: [{ done: false }] })),
    pool.query(`SELECT EXISTS(SELECT 1 FROM org_api_keys WHERE organization_id = $1 AND is_active = true) AS done`, [orgId]).catch(() => ({ rows: [{ done: false }] })),
    pool.query(`SELECT EXISTS(SELECT 1 FROM subscriptions WHERE organization_id = $1 AND status = 'active') AS done`, [orgId]).catch(() => ({ rows: [{ done: false }] })),
    pool.query(`SELECT COUNT(*) > 1 AS done FROM users WHERE organization_id = $1`, [orgId]).catch(() => ({ rows: [{ done: false }] })),
  ]);

  const steps = [
    { id: 'profile', title: 'Complete your profile', description: 'Add your organization details and branding', done: true, href: '/dashboard/profile' },
    { id: 'property', title: 'Add your first property', description: 'Import or manually create a property listing', done: hasProperties.rows[0]?.done === true, href: '/dashboard/deals' },
    { id: 'valuation', title: 'Request a valuation', description: 'Submit a property for professional valuation', done: hasValuations.rows[0]?.done === true, href: '/dashboard/valuations' },
    { id: 'api_key', title: 'Generate an API key', description: 'Enable programmatic access to PROPMETRIK APIs', done: hasApiKey.rows[0]?.done === true, href: '/dashboard/admin/api-keys' },
    { id: 'subscription', title: 'Choose a subscription plan', description: 'Select a plan that fits your needs', done: hasSubscription.rows[0]?.done === true, href: '/dashboard/admin/billing' },
    { id: 'team', title: 'Invite team members', description: 'Add your colleagues with appropriate roles', done: hasTeamMembers.rows[0]?.done === true, href: '/dashboard/admin/users' },
    { id: 'analytics', title: 'Explore analytics', description: 'View market intelligence and property analytics', done: true, href: '/dashboard/analytics' },
  ];

  const completed = steps.filter(s => s.done).length;

  res.json({
    success: true,
    data: {
      steps,
      completed,
      total: steps.length,
      progress_pct: Math.round((completed / steps.length) * 100),
    },
  });
}));

export default router;
