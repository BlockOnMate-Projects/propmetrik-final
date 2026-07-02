/**
 * Developer Portal service — org-scoped API usage + entitlements.
 *
 * Backs the subscriber-facing `/developers` console (Overview · Usage · Keys ·
 * Plan). Everything here is scoped to a single organization and computed from
 * REAL data:
 *   - keys + metering:  org_api_keys, api_key_usage_daily  (migration 153)
 *   - entitlements:     user_service_subscriptions, platform_services (mig 212),
 *                       subscription_plans (mig 154, max_api_calls_monthly)
 *
 * Nothing is seeded or fabricated: an org with no traffic yields zeroes/empties,
 * an org with no plan yields a null monthly quota (not a made-up number).
 */

import { pool } from '../../database';

/** The separately-sold API products (see platform_services / migration 212). */
export const API_PRODUCTS = ['analytics', 'market_intelligence', 'short_stay'] as const;
export type ApiProduct = (typeof API_PRODUCTS)[number];

const TIER_ORDER = ['free', 'starter', 'professional', 'enterprise'] as const;
type Tier = (typeof TIER_ORDER)[number];

/**
 * Enforced rate limits per subscription tier. These are the real ceilings the
 * Phase-1 gate applies to a key (per_minute / per_day). Keys created through the
 * portal are stamped with the limits for the org's highest API tier.
 */
export function defaultLimitsForTier(tier: string): { per_minute: number; per_day: number } {
  switch (tier) {
    case 'enterprise':   return { per_minute: 1000, per_day: 1_000_000 };
    case 'professional': return { per_minute: 300,  per_day: 100_000 };
    case 'starter':      return { per_minute: 60,   per_day: 10_000 };
    case 'free':
    default:             return { per_minute: 30,   per_day: 1_000 };
  }
}

/** Max concurrent WebSocket connections per org, by subscription tier. */
export function wsConnectionLimitForTier(tier: string): number {
  switch (tier) {
    case 'enterprise':   return 100;
    case 'professional': return 25;
    case 'starter':      return 3;
    case 'free':
    default:             return 1;
  }
}

function highestTier(tiers: string[]): Tier {
  let best = 0;
  for (const t of tiers) {
    const i = TIER_ORDER.indexOf(t as Tier);
    if (i > best) best = i;
  }
  return TIER_ORDER[best];
}

// ────────────────────────────────────────────────────────────────────────────
//  Usage
// ────────────────────────────────────────────────────────────────────────────

export async function getOrgUsageSummary(orgId: string) {
  const { rows: [agg] } = await pool.query(
    `SELECT
        COALESCE(SUM(u.request_count), 0)::bigint AS total_requests,
        COALESCE(SUM(u.error_count), 0)::bigint   AS total_errors,
        COALESCE(SUM(u.request_count) FILTER (WHERE u.date >= CURRENT_DATE - INTERVAL '29 days'), 0)::bigint AS requests_30d,
        COALESCE(SUM(u.request_count) FILTER (WHERE u.date = CURRENT_DATE), 0)::bigint AS requests_today
       FROM api_key_usage_daily u
       JOIN org_api_keys k ON k.id = u.key_id
      WHERE k.org_id = $1`,
    [orgId]
  );
  const { rows: [keys] } = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE is_active)::int AS active_keys,
        COUNT(*)::int                          AS total_keys,
        MAX(last_used_at)                      AS last_used_at
       FROM org_api_keys WHERE org_id = $1`,
    [orgId]
  );
  const totalReq = Number(agg.total_requests);
  const totalErr = Number(agg.total_errors);
  return {
    total_requests: totalReq,
    total_errors: totalErr,
    error_rate: totalReq > 0 ? +(totalErr / totalReq).toFixed(4) : 0,
    requests_30d: Number(agg.requests_30d),
    requests_today: Number(agg.requests_today),
    active_keys: keys.active_keys,
    total_keys: keys.total_keys,
    last_used_at: keys.last_used_at,
  };
}

/** Daily request/error series, zero-filled across the whole window for charts. */
export async function getOrgUsageDaily(orgId: string, days = 30) {
  const window = Math.min(Math.max(days, 1), 365);
  const { rows } = await pool.query(
    `SELECT to_char(u.date, 'YYYY-MM-DD') AS date,
            SUM(u.request_count)::int AS request_count,
            SUM(u.error_count)::int   AS error_count
       FROM api_key_usage_daily u
       JOIN org_api_keys k ON k.id = u.key_id
      WHERE k.org_id = $1
        AND u.date >= CURRENT_DATE - ($2::int - 1) * INTERVAL '1 day'
      GROUP BY u.date
      ORDER BY u.date`,
    [orgId, window]
  );

  const byDate = new Map(rows.map((r: any) => [r.date, r]));
  const series: { date: string; request_count: number; error_count: number }[] = [];
  const today = new Date();
  for (let i = window - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit: any = byDate.get(key);
    series.push({
      date: key,
      request_count: hit ? hit.request_count : 0,
      error_count: hit ? hit.error_count : 0,
    });
  }
  return series;
}

/** Aggregate per-endpoint call counts from endpoints_hit JSONB across the window. */
export async function getOrgUsageByEndpoint(orgId: string, days = 30) {
  const window = Math.min(Math.max(days, 1), 365);
  const { rows } = await pool.query(
    `SELECT e.key AS endpoint, SUM(e.value::int)::int AS count
       FROM api_key_usage_daily u
       JOIN org_api_keys k ON k.id = u.key_id
       CROSS JOIN LATERAL jsonb_each_text(u.endpoints_hit) AS e(key, value)
      WHERE k.org_id = $1
        AND u.date >= CURRENT_DATE - ($2::int - 1) * INTERVAL '1 day'
      GROUP BY e.key
      ORDER BY count DESC
      LIMIT 100`,
    [orgId, window]
  );
  return rows;
}

/** Per-key totals over the window (includes keys with zero traffic). */
export async function getOrgUsageByKey(orgId: string, days = 30) {
  const window = Math.min(Math.max(days, 1), 365);
  const { rows } = await pool.query(
    `SELECT k.id AS key_id, k.name, k.key_prefix, k.is_active, k.last_used_at,
            COALESCE(SUM(u.request_count) FILTER (WHERE u.date >= CURRENT_DATE - ($2::int - 1) * INTERVAL '1 day'), 0)::int AS request_count,
            COALESCE(SUM(u.error_count)   FILTER (WHERE u.date >= CURRENT_DATE - ($2::int - 1) * INTERVAL '1 day'), 0)::int AS error_count
       FROM org_api_keys k
       LEFT JOIN api_key_usage_daily u ON u.key_id = k.id
      WHERE k.org_id = $1
      GROUP BY k.id
      ORDER BY request_count DESC, k.created_at DESC`,
    [orgId, window]
  );
  return rows;
}

/** Org-wide WebSocket streaming usage (connections, frames, connection-minutes). */
export async function getOrgWsUsageSummary(orgId: string) {
  const { rows: [agg] } = await pool.query(
    `SELECT
        COALESCE(SUM(u.connections), 0)::bigint         AS total_connections,
        COALESCE(SUM(u.messages), 0)::bigint            AS total_messages,
        COALESCE(SUM(u.connection_seconds), 0)::bigint  AS total_connection_seconds,
        COALESCE(SUM(u.connections) FILTER (WHERE u.date >= CURRENT_DATE - INTERVAL '29 days'), 0)::bigint AS connections_30d,
        COALESCE(SUM(u.messages) FILTER (WHERE u.date >= CURRENT_DATE - INTERVAL '29 days'), 0)::bigint    AS messages_30d
       FROM api_key_ws_usage_daily u
       JOIN org_api_keys k ON k.id = u.key_id
      WHERE k.org_id = $1`,
    [orgId]
  );
  const seconds = Number(agg.total_connection_seconds);
  return {
    total_connections: Number(agg.total_connections),
    total_messages: Number(agg.total_messages),
    connection_minutes: Math.round(seconds / 60),
    connections_30d: Number(agg.connections_30d),
    messages_30d: Number(agg.messages_30d),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Entitlements
// ────────────────────────────────────────────────────────────────────────────

/**
 * The org's active subscriptions to the API products, one row per product with
 * its highest active tier. `orgHasService`-equivalent SQL (org-scoped OR held by
 * any org member). Platform org (staff) is reported as enterprise on all.
 */
async function getOrgApiSubscriptions(orgId: string) {
  const plat = await pool.query('SELECT is_platform_org FROM organizations WHERE id = $1', [orgId]);
  if (plat.rows[0]?.is_platform_org === true) {
    return API_PRODUCTS.map((service_key) => ({
      service_key,
      name: service_key,
      tier: 'enterprise' as Tier,
      status: 'active',
      expires_at: null as string | null,
    }));
  }

  const { rows } = await pool.query(
    `SELECT ps.service_key, ps.name, uss.tier, uss.status, uss.expires_at
       FROM user_service_subscriptions uss
       JOIN platform_services ps ON ps.id = uss.service_id
      WHERE ps.service_key = ANY($1)
        AND uss.status = 'active'
        AND (uss.expires_at IS NULL OR uss.expires_at > NOW())
        AND (uss.organization_id = $2 OR uss.user_id IN (SELECT id FROM users WHERE organization_id = $2))`,
    [API_PRODUCTS as unknown as string[], orgId]
  );

  // Collapse to one row per product at its highest tier + latest expiry.
  const byProduct = new Map<string, { service_key: string; name: string; tier: string; status: string; expires_at: string | null }>();
  for (const r of rows) {
    const cur = byProduct.get(r.service_key);
    if (!cur) {
      byProduct.set(r.service_key, { service_key: r.service_key, name: r.name, tier: r.tier, status: r.status, expires_at: r.expires_at });
    } else {
      cur.tier = highestTier([cur.tier, r.tier]);
      // keep the furthest expiry (null = no expiry = furthest)
      if (cur.expires_at !== null && (r.expires_at === null || new Date(r.expires_at) > new Date(cur.expires_at))) {
        cur.expires_at = r.expires_at;
      }
    }
  }
  return Array.from(byProduct.values());
}

/** Highest API tier the org holds across all subscribed API products. */
export async function resolveOrgApiTier(orgId: string): Promise<Tier> {
  const subs = await getOrgApiSubscriptions(orgId);
  if (subs.length === 0) return 'free';
  return highestTier(subs.map((s) => s.tier));
}

/**
 * Full entitlements payload for the org's plan panel: subscribed products, the
 * enforced rate limits for their tier, the plan's advertised monthly API-call
 * cap (real, from subscription_plans; null if no matching plan), and this
 * period's consumption.
 */
export async function getOrgEntitlements(orgId: string) {
  const products = await getOrgApiSubscriptions(orgId);
  const tier = products.length ? highestTier(products.map((p) => p.tier)) : 'free';
  const limits = defaultLimitsForTier(tier);

  // Advertised monthly cap for this tier's data-intelligence plan (informational).
  let monthlyQuota: number | null = null;
  const planRes = await pool.query(
    `SELECT max_api_calls_monthly
       FROM subscription_plans
      WHERE tier = $1 AND is_active = true AND max_api_calls_monthly IS NOT NULL
        AND category IN ('data_intelligence', 'full_platform')
      ORDER BY (category = 'data_intelligence') DESC, max_api_calls_monthly DESC
      LIMIT 1`,
    [tier]
  );
  if (planRes.rows[0]?.max_api_calls_monthly != null) {
    monthlyQuota = Number(planRes.rows[0].max_api_calls_monthly);
  }

  // This-period (calendar month) + today + all-time consumption.
  const { rows: [usage] } = await pool.query(
    `SELECT
        COALESCE(SUM(u.request_count) FILTER (WHERE u.date >= date_trunc('month', CURRENT_DATE)), 0)::bigint AS month_to_date,
        COALESCE(SUM(u.request_count) FILTER (WHERE u.date = CURRENT_DATE), 0)::bigint AS today,
        COALESCE(SUM(u.request_count), 0)::bigint AS total
       FROM api_key_usage_daily u
       JOIN org_api_keys k ON k.id = u.key_id
      WHERE k.org_id = $1`,
    [orgId]
  );

  const monthToDate = Number(usage.month_to_date);
  return {
    tier,
    products,
    has_api_access: products.length > 0,
    limits: { rate_limit_per_minute: limits.per_minute, rate_limit_per_day: limits.per_day },
    monthly_quota: monthlyQuota,
    usage: {
      today: Number(usage.today),
      month_to_date: monthToDate,
      total: Number(usage.total),
      quota_used_pct: monthlyQuota && monthlyQuota > 0 ? +((monthToDate / monthlyQuota) * 100).toFixed(1) : null,
    },
  };
}
