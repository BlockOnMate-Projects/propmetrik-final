/**
 * Subscription & Billing Service
 * 
 * Manages subscription plans, active subscriptions, usage tracking,
 * invoice generation, and Keycloak role sync.
 * 
 * Supports B2C (individual), B2B (organization), and à la carte modules.
 * super_admin is platform-level only — never a subscription tier.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { keycloakConfig } from '../../config';
import axios from 'axios';
import crypto from 'crypto';

// ============================================================
// Types
// ============================================================

export interface SubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  category: PlanCategory;
  tier: PlanTier;
  segment: PlanSegment;
  price_monthly_ghs: number;
  price_annual_ghs?: number;
  price_monthly_usd?: number;
  price_annual_usd?: number;
  currency: string;
  max_users?: number;
  max_properties?: number;
  max_api_calls_monthly?: number;
  max_valuations_monthly?: number;
  max_projects?: number;
  storage_gb?: number;
  target_audience?: string;
  features: string[];
  cta_text: string;
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
  is_public: boolean;
  trial_days: number;
  modules?: PlanModule[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type PlanCategory = 'full_platform' | 'property_management' | 'crm' | 'data_intelligence' | 'project_management';
export type PlanTier = 'starter' | 'professional' | 'enterprise';
export type PlanSegment = 'b2c' | 'b2b' | 'any';

export interface PlanModule {
  module_slug: string;
  access_level: 'basic' | 'standard' | 'full' | 'unlimited';
  usage_limit?: number;
}

export interface Subscription {
  id: string;
  organization_id?: string;
  user_id?: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_interval: 'monthly' | 'annual';
  current_period_start: string;
  current_period_end: string;
  trial_ends_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  payment_provider?: string;
  payment_provider_subscription_id?: string;
  payment_provider_customer_id?: string;
  quantity: number;
  keycloak_group_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
  addons?: SubscriptionAddon[];
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended' | 'incomplete';

export interface SubscriptionAddon {
  id: string;
  subscription_id: string;
  plan_id: string;
  quantity: number;
  price_override?: number;
  status: string;
  plan?: SubscriptionPlan;
  created_at: string;
}

export interface Invoice {
  id: string;
  subscription_id?: string;
  organization_id?: string;
  user_id?: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  amount_paid: number;
  currency: string;
  billing_period_start?: string;
  billing_period_end?: string;
  due_date: string;
  paid_at?: string;
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
  items?: InvoiceItem[];
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  plan_id?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface UsageMetric {
  metric: string;
  used: number;
  limit_value?: number;
  period_start: string;
  period_end: string;
  percentage_used?: number;
}

export interface SubscriptionMetrics {
  total_subscriptions: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  mrr_ghs: number;
  arr_ghs: number;
  churn_rate: number;
  plans_breakdown: { plan_slug: string; plan_name: string; count: number }[];
  category_breakdown: { category: string; count: number; revenue: number }[];
}

// ============================================================
// Plan Management
// ============================================================

/**
 * List all active public plans, optionally filtered
 */
export async function listPlans(filters?: {
  category?: PlanCategory;
  segment?: PlanSegment;
  tier?: PlanTier;
  includeInactive?: boolean;
}): Promise<SubscriptionPlan[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 0;

  if (!filters?.includeInactive) {
    conditions.push('sp.is_active = TRUE');
    conditions.push('sp.is_public = TRUE');
  }
  if (filters?.category) {
    paramIdx++;
    conditions.push(`sp.category = $${paramIdx}`);
    params.push(filters.category);
  }
  if (filters?.segment) {
    paramIdx++;
    conditions.push(`(sp.segment = $${paramIdx} OR sp.segment = 'any')`);
    params.push(filters.segment);
  }
  if (filters?.tier) {
    paramIdx++;
    conditions.push(`sp.tier = $${paramIdx}`);
    params.push(filters.tier);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: plans } = await pool.query(`
    SELECT sp.*,
      COALESCE(
        json_agg(json_build_object(
          'module_slug', pm.module_slug,
          'access_level', pm.access_level,
          'usage_limit', pm.usage_limit
        )) FILTER (WHERE pm.id IS NOT NULL),
        '[]'
      ) as modules
    FROM subscription_plans sp
    LEFT JOIN plan_modules pm ON pm.plan_id = sp.id
    ${whereClause}
    GROUP BY sp.id
    ORDER BY sp.category, sp.sort_order, sp.price_monthly_ghs
  `, params);

  return plans;
}

/**
 * Get a single plan by ID or slug
 */
export async function getPlan(idOrSlug: string): Promise<SubscriptionPlan | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const column = isUuid ? 'sp.id' : 'sp.slug';

  const { rows } = await pool.query(`
    SELECT sp.*,
      COALESCE(
        json_agg(json_build_object(
          'module_slug', pm.module_slug,
          'access_level', pm.access_level,
          'usage_limit', pm.usage_limit
        )) FILTER (WHERE pm.id IS NOT NULL),
        '[]'
      ) as modules
    FROM subscription_plans sp
    LEFT JOIN plan_modules pm ON pm.plan_id = sp.id
    WHERE ${column} = $1
    GROUP BY sp.id
  `, [idOrSlug]);

  return rows[0] || null;
}

/**
 * Create a new subscription plan (super_admin only)
 */
export async function createPlan(data: {
  slug: string;
  name: string;
  description?: string;
  category: PlanCategory;
  tier: PlanTier;
  segment?: PlanSegment;
  price_monthly_ghs: number;
  price_annual_ghs?: number;
  price_monthly_usd?: number;
  price_annual_usd?: number;
  max_users?: number;
  max_properties?: number;
  max_api_calls_monthly?: number;
  max_valuations_monthly?: number;
  max_projects?: number;
  storage_gb?: number;
  target_audience?: string;
  features?: string[];
  cta_text?: string;
  is_featured?: boolean;
  sort_order?: number;
  trial_days?: number;
  modules?: PlanModule[];
  metadata?: Record<string, any>;
}): Promise<SubscriptionPlan> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      INSERT INTO subscription_plans (
        slug, name, description, category, tier, segment,
        price_monthly_ghs, price_annual_ghs, price_monthly_usd, price_annual_usd,
        max_users, max_properties, max_api_calls_monthly,
        max_valuations_monthly, max_projects, storage_gb,
        target_audience, features, cta_text, is_featured,
        sort_order, trial_days, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23
      ) RETURNING *
    `, [
      data.slug, data.name, data.description || null,
      data.category, data.tier, data.segment || 'any',
      data.price_monthly_ghs, data.price_annual_ghs || null,
      data.price_monthly_usd || null, data.price_annual_usd || null,
      data.max_users || null, data.max_properties || null,
      data.max_api_calls_monthly || null, data.max_valuations_monthly || null,
      data.max_projects || null, data.storage_gb || 1,
      data.target_audience || null,
      JSON.stringify(data.features || []),
      data.cta_text || 'Get Started',
      data.is_featured || false,
      data.sort_order || 0,
      data.trial_days ?? 14,
      JSON.stringify(data.metadata || {}),
    ]);

    // Insert plan modules
    if (data.modules && data.modules.length > 0) {
      for (const mod of data.modules) {
        await client.query(`
          INSERT INTO plan_modules (plan_id, module_slug, access_level, usage_limit)
          VALUES ($1, $2, $3, $4)
        `, [rows[0].id, mod.module_slug, mod.access_level || 'full', mod.usage_limit || null]);
      }
    }

    await client.query('COMMIT');

    // Fetch with modules
    return (await getPlan(rows[0].id))!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update a subscription plan
 */
export async function updatePlan(
  id: string,
  data: Partial<Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at' | 'modules'>> & { modules?: PlanModule[] }
): Promise<SubscriptionPlan | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allowedColumns = [
      'slug', 'name', 'description', 'category', 'tier', 'segment',
      'price_monthly_ghs', 'price_annual_ghs', 'price_monthly_usd', 'price_annual_usd',
      'max_users', 'max_properties', 'max_api_calls_monthly',
      'max_valuations_monthly', 'max_projects', 'storage_gb',
      'target_audience', 'cta_text', 'is_featured', 'sort_order',
      'is_active', 'is_public', 'trial_days',
    ];

    const sets: string[] = [];
    const params: any[] = [id];
    let paramIdx = 1;

    for (const col of allowedColumns) {
      if ((data as any)[col] !== undefined) {
        paramIdx++;
        sets.push(`${col} = $${paramIdx}`);
        params.push((data as any)[col]);
      }
    }

    // Handle features JSON separately
    if (data.features !== undefined) {
      paramIdx++;
      sets.push(`features = $${paramIdx}`);
      params.push(JSON.stringify(data.features));
    }

    if (data.metadata !== undefined) {
      paramIdx++;
      sets.push(`metadata = $${paramIdx}`);
      params.push(JSON.stringify(data.metadata));
    }

    if (sets.length > 0) {
      await client.query(
        `UPDATE subscription_plans SET ${sets.join(', ')} WHERE id = $1`,
        params
      );
    }

    // Update modules if provided
    if (data.modules !== undefined) {
      await client.query('DELETE FROM plan_modules WHERE plan_id = $1', [id]);
      for (const mod of data.modules) {
        await client.query(`
          INSERT INTO plan_modules (plan_id, module_slug, access_level, usage_limit)
          VALUES ($1, $2, $3, $4)
        `, [id, mod.module_slug, mod.access_level || 'full', mod.usage_limit || null]);
      }
    }

    await client.query('COMMIT');
    return getPlan(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft-deactivate a plan (don't delete — existing subscriptions reference it)
 */
export async function deactivatePlan(id: string): Promise<void> {
  await pool.query(
    `UPDATE subscription_plans SET is_active = FALSE, is_public = FALSE WHERE id = $1`,
    [id]
  );
}

// ============================================================
// Subscription Management
// ============================================================

/**
 * Get the active subscription for an org or user
 */
export async function getSubscription(
  orgId?: string,
  userId?: string
): Promise<Subscription | null> {
  if (!orgId && !userId) return null;

  const conditions: string[] = [];
  const params: any[] = [];

  if (orgId) {
    params.push(orgId);
    conditions.push(`s.organization_id = $${params.length}`);
  }
  if (userId && !orgId) {
    params.push(userId);
    conditions.push(`s.user_id = $${params.length}`);
    conditions.push('s.organization_id IS NULL');
  }

  const { rows } = await pool.query(`
    SELECT s.*,
      row_to_json(sp.*) as plan
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE ${conditions.join(' AND ')}
      AND s.status NOT IN ('cancelled', 'expired')
    ORDER BY s.created_at DESC
    LIMIT 1
  `, params);

  if (!rows[0]) return null;

  // Fetch addons
  const { rows: addons } = await pool.query(`
    SELECT sa.*, row_to_json(sp.*) as plan
    FROM subscription_addons sa
    JOIN subscription_plans sp ON sp.id = sa.plan_id
    WHERE sa.subscription_id = $1 AND sa.status = 'active'
  `, [rows[0].id]);

  return { ...rows[0], addons };
}

/**
 * Get subscription by ID with full details
 */
export async function getSubscriptionById(id: string): Promise<Subscription | null> {
  const { rows } = await pool.query(`
    SELECT s.*,
      row_to_json(sp.*) as plan
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.id = $1
  `, [id]);

  if (!rows[0]) return null;

  const { rows: addons } = await pool.query(`
    SELECT sa.*, row_to_json(sp.*) as plan
    FROM subscription_addons sa
    JOIN subscription_plans sp ON sp.id = sa.plan_id
    WHERE sa.subscription_id = $1 AND sa.status = 'active'
  `, [id]);

  // Fetch plan modules
  const plan = await getPlan(rows[0].plan_id);

  return { ...rows[0], plan: plan || rows[0].plan, addons };
}

/**
 * Create a new subscription
 */
export async function createSubscription(data: {
  organization_id?: string;
  user_id?: string;
  plan_slug: string;
  billing_interval?: 'monthly' | 'annual';
  payment_provider?: string;
  payment_provider_customer_id?: string;
  quantity?: number;
  start_trial?: boolean;
  metadata?: Record<string, any>;
  actor_id?: string;
}): Promise<Subscription> {
  const plan = await getPlan(data.plan_slug);
  if (!plan) throw new Error(`Plan not found: ${data.plan_slug}`);
  if (!plan.is_active) throw new Error('Plan is not active');

  // Check for existing active subscription
  const existing = await getSubscription(data.organization_id, data.user_id);
  if (existing) {
    throw new Error('Active subscription already exists. Use upgrade/downgrade instead.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const interval = data.billing_interval || 'monthly';
    const now = new Date();
    const periodEnd = new Date(now);
    if (interval === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const startTrial = data.start_trial !== false && plan.trial_days > 0;
    const trialEnds = startTrial ? new Date(now.getTime() + plan.trial_days * 86400000) : null;
    const status = startTrial ? 'trialing' : 'active';

    const { rows } = await client.query(`
      INSERT INTO subscriptions (
        organization_id, user_id, plan_id, status,
        billing_interval, current_period_start, current_period_end,
        trial_ends_at, payment_provider, payment_provider_customer_id,
        quantity, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      data.organization_id || null,
      data.user_id || null,
      plan.id,
      status,
      interval,
      now.toISOString(),
      periodEnd.toISOString(),
      trialEnds?.toISOString() || null,
      data.payment_provider || null,
      data.payment_provider_customer_id || null,
      data.quantity || 1,
      JSON.stringify(data.metadata || {}),
    ]);

    const subscription = rows[0];

    // Link to organization
    if (data.organization_id) {
      await client.query(`
        UPDATE organizations
        SET subscription_id = $1, subscription_status = $2
        WHERE id = $3
      `, [subscription.id, status, data.organization_id]);
    }

    // Update user's subscription_tier for backward compat
    if (data.user_id) {
      await client.query(`
        UPDATE users SET subscription_tier = $1 WHERE id = $2
      `, [plan.tier, data.user_id]);
    }

    // Initialize usage metrics
    const metrics = ['api_calls', 'properties', 'users', 'valuations', 'reports', 'projects'];
    const limitMap: Record<string, number | null> = {
      api_calls: plan.max_api_calls_monthly || null,
      properties: plan.max_properties || null,
      users: plan.max_users || null,
      valuations: plan.max_valuations_monthly || null,
      reports: null,
      projects: plan.max_projects || null,
    };

    for (const metric of metrics) {
      const limit = limitMap[metric];
      if (limit !== null && limit !== undefined) {
        await client.query(`
          INSERT INTO subscription_usage (subscription_id, metric, period_start, period_end, used, limit_value)
          VALUES ($1, $2, $3, $4, 0, $5)
        `, [subscription.id, metric, now.toISOString(), periodEnd.toISOString(), limit]);
      }
    }

    // Record event
    await client.query(`
      INSERT INTO subscription_events (subscription_id, event_type, to_plan_id, to_status, actor_id, actor_type, details)
      VALUES ($1, $2, $3, $4, $5, 'user', $6)
    `, [
      subscription.id,
      startTrial ? 'trial_started' : 'created',
      plan.id,
      status,
      data.actor_id || data.user_id || null,
      JSON.stringify({ plan_slug: plan.slug, billing_interval: interval }),
    ]);

    await client.query('COMMIT');

    // Sync Keycloak roles (best-effort)
    syncKeycloakSubscription(subscription.id, plan).catch(err =>
      logger.warn('Failed to sync Keycloak subscription roles', { error: err.message })
    );

    return getSubscriptionById(subscription.id) as Promise<Subscription>;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Upgrade or downgrade a subscription to a new plan
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  newPlanSlug: string,
  actorId?: string
): Promise<Subscription> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) throw new Error('Subscription not found');

  const newPlan = await getPlan(newPlanSlug);
  if (!newPlan) throw new Error(`Plan not found: ${newPlanSlug}`);
  if (!newPlan.is_active) throw new Error('Target plan is not active');

  const oldPlanId = subscription.plan_id;
  const isUpgrade = newPlan.price_monthly_ghs > (subscription.plan?.price_monthly_ghs || 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE subscriptions
      SET plan_id = $1, status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newPlan.id, subscriptionId]);

    // Update org subscription status
    if (subscription.organization_id) {
      await client.query(`
        UPDATE organizations SET subscription_status = 'active' WHERE id = $1
      `, [subscription.organization_id]);
    }

    // Update usage limits
    await client.query(`DELETE FROM subscription_usage WHERE subscription_id = $1`, [subscriptionId]);
    const metrics = ['api_calls', 'properties', 'users', 'valuations', 'projects'];
    const limitMap: Record<string, number | null> = {
      api_calls: newPlan.max_api_calls_monthly || null,
      properties: newPlan.max_properties || null,
      users: newPlan.max_users || null,
      valuations: newPlan.max_valuations_monthly || null,
      projects: newPlan.max_projects || null,
    };

    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    for (const metric of metrics) {
      const limit = limitMap[metric];
      if (limit !== null && limit !== undefined) {
        await client.query(`
          INSERT INTO subscription_usage (subscription_id, metric, period_start, period_end, used, limit_value)
          VALUES ($1, $2, $3, $4, 0, $5)
        `, [subscriptionId, metric, now.toISOString(), periodEnd.toISOString(), limit]);
      }
    }

    // Record event
    await client.query(`
      INSERT INTO subscription_events (
        subscription_id, event_type, from_plan_id, to_plan_id,
        from_status, to_status, actor_id, actor_type, details
      ) VALUES ($1, $2, $3, $4, $5, 'active', $6, 'user', $7)
    `, [
      subscriptionId,
      isUpgrade ? 'upgraded' : 'downgraded',
      oldPlanId, newPlan.id,
      subscription.status,
      actorId || null,
      JSON.stringify({ from_plan: subscription.plan?.slug, to_plan: newPlan.slug }),
    ]);

    await client.query('COMMIT');

    // Sync Keycloak
    syncKeycloakSubscription(subscriptionId, newPlan).catch(err =>
      logger.warn('Failed to sync Keycloak after plan change', { error: err.message })
    );

    return (await getSubscriptionById(subscriptionId))!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  reason?: string,
  cancelImmediately: boolean = false,
  actorId?: string
): Promise<Subscription> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) throw new Error('Subscription not found');
  if (subscription.status === 'cancelled') throw new Error('Subscription already cancelled');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const now = new Date();
    const newStatus = cancelImmediately ? 'cancelled' : subscription.status;

    await client.query(`
      UPDATE subscriptions
      SET cancelled_at = $1, cancel_reason = $2, status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [now.toISOString(), reason || null, newStatus, subscriptionId]);

    if (cancelImmediately && subscription.organization_id) {
      await client.query(`
        UPDATE organizations SET subscription_status = 'cancelled' WHERE id = $1
      `, [subscription.organization_id]);
    }

    await client.query(`
      INSERT INTO subscription_events (
        subscription_id, event_type, from_status, to_status, actor_id, actor_type, details
      ) VALUES ($1, 'cancelled', $2, $3, $4, 'user', $5)
    `, [
      subscriptionId,
      subscription.status,
      newStatus,
      actorId || null,
      JSON.stringify({ reason, immediate: cancelImmediately }),
    ]);

    await client.query('COMMIT');
    return (await getSubscriptionById(subscriptionId))!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reactivate a cancelled subscription
 */
export async function reactivateSubscription(
  subscriptionId: string,
  actorId?: string
): Promise<Subscription> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) throw new Error('Subscription not found');
  if (subscription.status !== 'cancelled') {
    throw new Error('Only cancelled subscriptions can be reactivated');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const now = new Date();
    const periodEnd = new Date(now);
    if (subscription.billing_interval === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await client.query(`
      UPDATE subscriptions
      SET status = 'active', cancelled_at = NULL, cancel_reason = NULL,
          current_period_start = $1, current_period_end = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [now.toISOString(), periodEnd.toISOString(), subscriptionId]);

    if (subscription.organization_id) {
      await client.query(`
        UPDATE organizations SET subscription_status = 'active' WHERE id = $1
      `, [subscription.organization_id]);
    }

    await client.query(`
      INSERT INTO subscription_events (
        subscription_id, event_type, from_status, to_status, actor_id, actor_type
      ) VALUES ($1, 'reactivated', 'cancelled', 'active', $2, 'user')
    `, [subscriptionId, actorId || null]);

    await client.query('COMMIT');
    return (await getSubscriptionById(subscriptionId))!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Add-on Management (à la carte)
// ============================================================

/**
 * Add an à la carte module to an existing subscription
 */
export async function addSubscriptionAddon(
  subscriptionId: string,
  planSlug: string,
  quantity: number = 1,
  actorId?: string
): Promise<SubscriptionAddon> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) throw new Error('Subscription not found');
  if (!['active', 'trialing'].includes(subscription.status)) {
    throw new Error('Subscription must be active or trialing to add add-ons');
  }

  const plan = await getPlan(planSlug);
  if (!plan) throw new Error(`Add-on plan not found: ${planSlug}`);

  const { rows } = await pool.query(`
    INSERT INTO subscription_addons (subscription_id, plan_id, quantity)
    VALUES ($1, $2, $3)
    ON CONFLICT (subscription_id, plan_id) DO UPDATE
    SET quantity = $3, status = 'active', cancelled_at = NULL
    RETURNING *
  `, [subscriptionId, plan.id, quantity]);

  // Record event
  await pool.query(`
    INSERT INTO subscription_events (subscription_id, event_type, to_plan_id, actor_id, details)
    VALUES ($1, 'addon_added', $2, $3, $4)
  `, [
    subscriptionId, plan.id, actorId || null,
    JSON.stringify({ addon_slug: plan.slug, quantity }),
  ]);

  return { ...rows[0], plan };
}

/**
 * Remove an à la carte add-on
 */
export async function removeSubscriptionAddon(
  subscriptionId: string,
  addonId: string,
  actorId?: string
): Promise<void> {
  const { rows } = await pool.query(`
    UPDATE subscription_addons
    SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND subscription_id = $2
    RETURNING plan_id
  `, [addonId, subscriptionId]);

  if (rows[0]) {
    await pool.query(`
      INSERT INTO subscription_events (subscription_id, event_type, from_plan_id, actor_id, details)
      VALUES ($1, 'addon_removed', $2, $3, '{}')
    `, [subscriptionId, rows[0].plan_id, actorId || null]);
  }
}

// ============================================================
// Feature & Module Access Checking
// ============================================================

/**
 * Check if an org/user can access a specific module
 */
export async function canAccessModule(
  orgId?: string,
  userId?: string,
  moduleSlug?: string
): Promise<boolean> {
  if (!moduleSlug) return true;

  const subscription = await getSubscription(orgId, userId);
  if (!subscription) return false;
  if (!['active', 'trialing'].includes(subscription.status)) return false;

  // Check base plan modules
  const { rows: planModules } = await pool.query(`
    SELECT pm.module_slug FROM plan_modules pm
    WHERE pm.plan_id = $1 AND pm.module_slug = $2
  `, [subscription.plan_id, moduleSlug]);

  if (planModules.length > 0) return true;

  // Check à la carte add-ons
  const { rows: addonModules } = await pool.query(`
    SELECT pm.module_slug
    FROM subscription_addons sa
    JOIN plan_modules pm ON pm.plan_id = sa.plan_id
    WHERE sa.subscription_id = $1
      AND sa.status = 'active'
      AND pm.module_slug = $2
  `, [subscription.id, moduleSlug]);

  return addonModules.length > 0;
}

/**
 * Get all active modules for an org/user
 */
export async function getActiveModules(
  orgId?: string,
  userId?: string
): Promise<PlanModule[]> {
  const subscription = await getSubscription(orgId, userId);
  if (!subscription) return [];
  if (!['active', 'trialing'].includes(subscription.status)) return [];

  const { rows } = await pool.query(`
    SELECT DISTINCT pm.module_slug, pm.access_level, pm.usage_limit
    FROM plan_modules pm
    WHERE pm.plan_id = $1
    UNION
    SELECT DISTINCT pm.module_slug, pm.access_level, pm.usage_limit
    FROM subscription_addons sa
    JOIN plan_modules pm ON pm.plan_id = sa.plan_id
    WHERE sa.subscription_id = $2 AND sa.status = 'active'
  `, [subscription.plan_id, subscription.id]);

  return rows;
}

/**
 * Check if a usage metric is within limits
 */
export async function checkUsageLimit(
  subscriptionId: string,
  metric: string
): Promise<{ allowed: boolean; used: number; limit: number | null; remaining: number | null }> {
  const now = new Date();
  const { rows } = await pool.query(`
    SELECT used, limit_value
    FROM subscription_usage
    WHERE subscription_id = $1
      AND metric = $2
      AND period_start <= $3
      AND period_end >= $3
    ORDER BY period_start DESC
    LIMIT 1
  `, [subscriptionId, metric, now.toISOString()]);

  if (!rows[0]) return { allowed: true, used: 0, limit: null, remaining: null };

  const { used, limit_value } = rows[0];
  if (limit_value === null) return { allowed: true, used, limit: null, remaining: null };

  return {
    allowed: used < limit_value,
    used,
    limit: limit_value,
    remaining: Math.max(0, limit_value - used),
  };
}

/**
 * Track usage for a metric
 */
export async function trackUsage(
  subscriptionId: string,
  metric: string,
  amount: number = 1
): Promise<void> {
  const now = new Date();
  await pool.query(`
    UPDATE subscription_usage
    SET used = used + $1, updated_at = CURRENT_TIMESTAMP
    WHERE subscription_id = $2
      AND metric = $3
      AND period_start <= $4
      AND period_end >= $4
  `, [amount, subscriptionId, metric, now.toISOString()]);
}

/**
 * Get all usage metrics for a subscription
 */
export async function getUsageMetrics(subscriptionId: string): Promise<UsageMetric[]> {
  const now = new Date();
  const { rows } = await pool.query(`
    SELECT metric, used, limit_value, period_start, period_end
    FROM subscription_usage
    WHERE subscription_id = $1
      AND period_start <= $2
      AND period_end >= $2
    ORDER BY metric
  `, [subscriptionId, now.toISOString()]);

  return rows.map(r => ({
    ...r,
    percentage_used: r.limit_value ? Math.round((r.used / r.limit_value) * 100) : null,
  }));
}

// ============================================================
// Invoice Management
// ============================================================

/**
 * Generate an invoice number
 */
async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { rows } = await pool.query(`
    SELECT COUNT(*) as count FROM invoices
    WHERE invoice_number LIKE $1
  `, [`${prefix}%`]);

  const seq = parseInt(rows[0].count, 10) + 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

/**
 * Create an invoice for a subscription billing period
 */
export async function createInvoice(
  subscriptionId: string,
  options?: {
    tax_rate?: number;
    discount_amount?: number;
    notes?: string;
    due_days?: number;
  }
): Promise<Invoice> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) throw new Error('Subscription not found');
  if (!subscription.plan) throw new Error('Plan not found for subscription');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceNumber = await generateInvoiceNumber();
    const taxRate = options?.tax_rate ?? 0.125; // 12.5% Ghana NHIL+VAT+GETFund
    const dueDays = options?.due_days ?? 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Calculate base price
    const price = subscription.billing_interval === 'annual'
      ? (subscription.plan.price_annual_ghs || subscription.plan.price_monthly_ghs * 12)
      : subscription.plan.price_monthly_ghs;

    let subtotal = price * subscription.quantity;

    // Add add-on prices
    if (subscription.addons) {
      for (const addon of subscription.addons) {
        if (addon.plan) {
          const addonPrice = addon.price_override
            ?? (subscription.billing_interval === 'annual'
              ? (addon.plan.price_annual_ghs || addon.plan.price_monthly_ghs * 12)
              : addon.plan.price_monthly_ghs);
          subtotal += addonPrice * addon.quantity;
        }
      }
    }

    const discountAmount = options?.discount_amount || 0;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;
    const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

    const { rows: invoiceRows } = await client.query(`
      INSERT INTO invoices (
        subscription_id, organization_id, user_id,
        invoice_number, status, subtotal, tax_rate, tax_amount,
        discount_amount, total, currency,
        billing_period_start, billing_period_end,
        due_date, notes
      ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      subscriptionId,
      subscription.organization_id || null,
      subscription.user_id || null,
      invoiceNumber,
      subtotal, taxRate, taxAmount, discountAmount, total,
      subscription.plan.currency || 'GHS',
      subscription.current_period_start,
      subscription.current_period_end,
      dueDate.toISOString(),
      options?.notes || null,
    ]);

    const invoice = invoiceRows[0];

    // Add base plan line item
    await client.query(`
      INSERT INTO invoice_items (invoice_id, description, plan_id, quantity, unit_price, total)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      invoice.id,
      `${subscription.plan.name} (${subscription.billing_interval})`,
      subscription.plan.id,
      subscription.quantity,
      price,
      price * subscription.quantity,
    ]);

    // Add add-on line items
    if (subscription.addons) {
      for (const addon of subscription.addons) {
        if (addon.plan) {
          const addonPrice = addon.price_override
            ?? (subscription.billing_interval === 'annual'
              ? (addon.plan.price_annual_ghs || addon.plan.price_monthly_ghs * 12)
              : addon.plan.price_monthly_ghs);
          await client.query(`
            INSERT INTO invoice_items (invoice_id, description, plan_id, quantity, unit_price, total)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            invoice.id,
            `Add-on: ${addon.plan.name}`,
            addon.plan.id,
            addon.quantity,
            addonPrice,
            addonPrice * addon.quantity,
          ]);
        }
      }
    }

    await client.query('COMMIT');
    return getInvoice(invoice.id) as Promise<Invoice>;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get invoice with line items
 */
export async function getInvoice(id: string): Promise<Invoice | null> {
  const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (!rows[0]) return null;

  const { rows: items } = await pool.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at',
    [id]
  );

  return { ...rows[0], items };
}

/**
 * List invoices for an org or user
 */
export async function listInvoices(
  orgId?: string,
  userId?: string,
  filters?: { status?: string; limit?: number; offset?: number }
): Promise<{ invoices: Invoice[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (orgId) {
    params.push(orgId);
    conditions.push(`organization_id = $${params.length}`);
  } else if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(`SELECT * FROM invoices ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]),
    pool.query(`SELECT COUNT(*) as total FROM invoices ${whereClause}`, params),
  ]);

  return { invoices: rows, total: parseInt(countRows[0].total, 10) };
}

/**
 * Mark an invoice as paid
 */
export async function markInvoicePaid(
  id: string,
  paymentRef: string,
  paymentMethod: string
): Promise<Invoice> {
  const { rows } = await pool.query(`
    UPDATE invoices
    SET status = 'paid', paid_at = CURRENT_TIMESTAMP,
        payment_reference = $1, payment_method = $2,
        amount_paid = total, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING subscription_id
  `, [paymentRef, paymentMethod, id]);

  if (!rows[0]) throw new Error('Invoice not found');

  // Activate subscription if payment was for activation
  if (rows[0].subscription_id) {
    await pool.query(`
      UPDATE subscriptions SET status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('incomplete', 'past_due')
    `, [rows[0].subscription_id]);

    await pool.query(`
      INSERT INTO subscription_events (subscription_id, event_type, to_status, details)
      VALUES ($1, 'payment_succeeded', 'active', $2)
    `, [rows[0].subscription_id, JSON.stringify({ invoice_id: id, payment_ref: paymentRef })]);
  }

  return (await getInvoice(id))!;
}

// ============================================================
// Subscription History & Events
// ============================================================

/**
 * Get subscription event history
 */
export async function getSubscriptionHistory(
  subscriptionId: string,
  limit: number = 50
): Promise<any[]> {
  const { rows } = await pool.query(`
    SELECT se.*,
      sp_from.slug as from_plan_slug, sp_from.name as from_plan_name,
      sp_to.slug as to_plan_slug, sp_to.name as to_plan_name,
      u.email as actor_email, u.display_name as actor_name
    FROM subscription_events se
    LEFT JOIN subscription_plans sp_from ON sp_from.id = se.from_plan_id
    LEFT JOIN subscription_plans sp_to ON sp_to.id = se.to_plan_id
    LEFT JOIN users u ON u.id = se.actor_id
    WHERE se.subscription_id = $1
    ORDER BY se.created_at DESC
    LIMIT $2
  `, [subscriptionId, limit]);

  return rows;
}

// ============================================================
// Admin Metrics (super_admin only)
// ============================================================

/**
 * Get platform-wide subscription metrics
 */
export async function getSubscriptionMetrics(): Promise<SubscriptionMetrics> {
  const [
    { rows: total },
    { rows: active },
    { rows: trialing },
    { rows: mrrRows },
    { rows: plansBreakdown },
    { rows: categoryBreakdown },
    { rows: churnRows },
  ] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM subscriptions'),
    pool.query("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"),
    pool.query("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing'"),
    pool.query(`
      SELECT COALESCE(SUM(
        CASE WHEN s.billing_interval = 'annual'
          THEN COALESCE(sp.price_annual_ghs, sp.price_monthly_ghs * 12) / 12
          ELSE sp.price_monthly_ghs
        END * s.quantity
      ), 0) as mrr
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.status = 'active'
    `),
    pool.query(`
      SELECT sp.slug as plan_slug, sp.name as plan_name, COUNT(s.id) as count
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.status IN ('active', 'trialing')
      GROUP BY sp.slug, sp.name
      ORDER BY count DESC
    `),
    pool.query(`
      SELECT sp.category,
        COUNT(s.id) as count,
        COALESCE(SUM(sp.price_monthly_ghs * s.quantity), 0) as revenue
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.status IN ('active', 'trialing')
      GROUP BY sp.category
    `),
    pool.query(`
      SELECT
        COUNT(CASE WHEN status = 'cancelled' AND cancelled_at >= NOW() - INTERVAL '30 days' THEN 1 END) as churned,
        COUNT(CASE WHEN status IN ('active', 'trialing', 'cancelled') THEN 1 END) as base
      FROM subscriptions
    `),
  ]);

  const mrrValue = parseFloat(mrrRows[0].mrr);

  return {
    total_subscriptions: parseInt(total[0].count, 10),
    active_subscriptions: parseInt(active[0].count, 10),
    trialing_subscriptions: parseInt(trialing[0].count, 10),
    mrr_ghs: mrrValue,
    arr_ghs: mrrValue * 12,
    churn_rate: churnRows[0].base > 0
      ? Math.round((churnRows[0].churned / churnRows[0].base) * 10000) / 100
      : 0,
    plans_breakdown: plansBreakdown.map(r => ({ ...r, count: parseInt(r.count, 10) })),
    category_breakdown: categoryBreakdown.map(r => ({
      ...r,
      count: parseInt(r.count, 10),
      revenue: parseFloat(r.revenue),
    })),
  };
}

/**
 * List all subscriptions (admin view)
 */
export async function listAllSubscriptions(filters?: {
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ subscriptions: Subscription[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`s.status = $${params.length}`);
  }
  if (filters?.category) {
    params.push(filters.category);
    conditions.push(`sp.category = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(`
      SELECT s.*, row_to_json(sp.*) as plan,
        o.name as org_name, u.email as user_email
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      LEFT JOIN organizations o ON o.id = s.organization_id
      LEFT JOIN users u ON u.id = s.user_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]),
    pool.query(`
      SELECT COUNT(*) as total FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      ${whereClause}
    `, params),
  ]);

  return {
    subscriptions: rows,
    total: parseInt(countRows[0].total, 10),
  };
}

// ============================================================
// Keycloak Sync
// ============================================================

/**
 * Sync subscription-based attributes to Keycloak user
 * Best-effort — failures are logged but don't block operations
 */
async function syncKeycloakSubscription(
  subscriptionId: string,
  plan: SubscriptionPlan
): Promise<void> {
  try {
    if (!keycloakConfig.url || !keycloakConfig.adminClientId) {
      logger.debug('Keycloak not configured — skipping subscription sync');
      return;
    }

    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) return;

    // Get Keycloak admin token
    const tokenUrl = `${keycloakConfig.authServerUrl}/realms/${keycloakConfig.adminRealm || 'master'}/protocol/openid-connect/token`;
    let adminToken: string;

    try {
      const tokenRes = await axios.post(tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: keycloakConfig.adminClientId!,
          client_secret: keycloakConfig.adminSecret!,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      adminToken = tokenRes.data.access_token;
    } catch (tokenErr: any) {
      // Fallback: try password grant
      try {
        const tokenRes = await axios.post(tokenUrl,
          new URLSearchParams({
            grant_type: 'password',
            client_id: keycloakConfig.adminClientId!,
            username: keycloakConfig.adminUsername || 'admin',
            password: keycloakConfig.adminPassword || '',
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        adminToken = tokenRes.data.access_token;
      } catch {
        logger.warn('Could not obtain Keycloak admin token for subscription sync');
        return;
      }
    }

    // Find Keycloak user(s) to update
    const userIds: string[] = [];
    if (subscription.user_id) {
      const { rows } = await pool.query('SELECT keycloak_id FROM users WHERE id = $1', [subscription.user_id]);
      if (rows[0]?.keycloak_id) userIds.push(rows[0].keycloak_id);
    } else if (subscription.organization_id) {
      // Sync for all org members
      const { rows } = await pool.query(
        'SELECT keycloak_id FROM users WHERE organization_id = $1 AND keycloak_id IS NOT NULL',
        [subscription.organization_id]
      );
      userIds.push(...rows.map(r => r.keycloak_id));
    }

    if (userIds.length === 0) return;

    // Get plan modules
    const { rows: modules } = await pool.query(
      'SELECT module_slug, access_level FROM plan_modules WHERE plan_id = $1',
      [plan.id]
    );

    const baseUrl = `${keycloakConfig.authServerUrl}/admin/realms/${keycloakConfig.realm}`;

    // Update each user's attributes
    for (const kcId of userIds) {
      try {
        await axios.put(
          `${baseUrl}/users/${kcId}`,
          {
            attributes: {
              subscription_tier: [plan.tier],
              subscription_plan: [plan.slug],
              subscription_status: [subscription.status],
              subscription_modules: [modules.map(m => m.module_slug).join(',')],
            },
          },
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
      } catch (err: any) {
        logger.warn(`Failed to sync Keycloak attributes for user ${kcId}`, {
          error: err.response?.data || err.message,
        });
      }
    }

    logger.info(`Synced subscription to Keycloak for ${userIds.length} user(s)`, {
      subscriptionId,
      planSlug: plan.slug,
    });
  } catch (err: any) {
    logger.warn('Keycloak subscription sync failed', { error: err.message });
  }
}
