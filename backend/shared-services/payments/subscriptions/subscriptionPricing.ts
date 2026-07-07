/**
 * Annual bundle pricing.
 *
 * The public catalog sells the four workflow services à la carte (pick 1/2/3)
 * or as the full-platform bundle (all 4). Pricing is 100% DB-sourced from
 * `subscription_plans`; nothing here is hardcoded except the bundle DISCOUNT
 * curve, which is itself admin-overridable via `platform_settings`.
 *
 *   1 service   → 0%  off (list price)
 *   2 services  → 20% off the summed annual price
 *   3 services  → 35% off the summed annual price
 *   4 services  → the full-platform plan's own annual price (not derived)
 *
 * Because tiered pricing is hidden in annual-only mode, ONE canonical tier
 * (default 'starter', configurable) represents each service's single annual
 * price. Admins edit that plan's `price_annual_ghs` in the existing editor.
 *
 * All bundle prices are recomputed server-side at subscribe time — the frontend
 * figure is display-only and never trusted.
 *
 * @module shared-services/payments/subscriptions/subscriptionPricing
 */
import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { WORKFLOW_SERVICES, WorkflowService } from './subscriptionEntitlements';

const SETTING_KEY = 'pricing_display_config';

/** Category (in subscription_plans) that backs each sellable workflow service. */
const SERVICE_CATEGORY: Record<WorkflowService, string> = {
  valuations: 'valuation_services',
  property_management: 'property_management',
  crm: 'crm',
  projects: 'project_management',
};

/** Human-facing labels for the sellable services. */
const SERVICE_LABEL: Record<WorkflowService, string> = {
  valuations: 'Valuations',
  property_management: 'Property Management',
  crm: 'CRM',
  projects: 'Projects',
};

export interface PricingDisplayConfig {
  /** When true, public UI shows annual-only bundle pricing and hides tiered + monthly plans. */
  annual_only: boolean;
  /** Which subscription_plans.tier is the single canonical price per service. */
  canonical_tier: string;
  /** Bundle discount by number of services selected (2 and 3; 1 = none, 4 = full-platform price). */
  bundle_discounts: Record<string, number>;
}

const DEFAULT_CONFIG: PricingDisplayConfig = {
  annual_only: true,
  // The dedicated unlimited annual SKU family (mig 287), NOT the capped starter tier.
  canonical_tier: 'annual',
  bundle_discounts: { '2': 0.2, '3': 0.35 },
};

export interface ServicePrice {
  key: WorkflowService;
  name: string;
  plan_slug: string;
  annual_ghs: number;
  monthly_ghs: number;
  description: string;
  features: string[];
}

export interface PricingCatalog {
  mode: 'annual_bundle' | 'legacy_tiered';
  currency: 'GHS';
  canonical_tier: string;
  bundle_discounts: Record<string, number>;
  services: ServicePrice[];
  full_platform: {
    plan_slug: string;
    annual_ghs: number;
    monthly_ghs: number;
    description: string;
    features: string[];
  } | null;
}

/** Read the pricing display config from platform_settings, falling back to defaults. */
export async function getPricingConfig(): Promise<PricingDisplayConfig> {
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = $1`,
      [SETTING_KEY]
    );
    if (rows[0]?.setting_value) {
      const v = rows[0].setting_value;
      return {
        annual_only: v.annual_only ?? DEFAULT_CONFIG.annual_only,
        canonical_tier: v.canonical_tier || DEFAULT_CONFIG.canonical_tier,
        bundle_discounts: v.bundle_discounts || DEFAULT_CONFIG.bundle_discounts,
      };
    }
  } catch (err: any) {
    logger.warn('Failed to read pricing config; using defaults', { error: err?.message });
  }
  return { ...DEFAULT_CONFIG };
}

/** Persist the pricing display config (admin only). */
export async function setPricingConfig(
  patch: Partial<PricingDisplayConfig>,
  actorId?: string
): Promise<PricingDisplayConfig> {
  const current = await getPricingConfig();
  const next: PricingDisplayConfig = {
    annual_only: patch.annual_only ?? current.annual_only,
    canonical_tier: patch.canonical_tier || current.canonical_tier,
    bundle_discounts: patch.bundle_discounts || current.bundle_discounts,
  };
  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [SETTING_KEY, JSON.stringify(next), actorId || null]
  );
  logger.info('Pricing display config updated', { next, actorId });
  return next;
}

/**
 * Build the bundle catalog for a given tier from the DB. Returns the four
 * service prices + the full-platform price + discount curve. Defaults to the
 * annual entry tier (config.canonical_tier); pass an explicit `tier`
 * (starter/professional/enterprise) to build a tiered bundle catalog — the same
 * multi-service + discount mechanism, just against a different plan tier.
 */
export async function getPricingCatalog(tier?: string): Promise<PricingCatalog> {
  const config = await getPricingConfig();
  const effectiveTier = tier || config.canonical_tier;
  const categories = [...Object.values(SERVICE_CATEGORY), 'full_platform'];

  const { rows } = await pool.query(
    `SELECT slug, category, price_annual_ghs, price_monthly_ghs, description, features
       FROM subscription_plans
      WHERE is_active = true AND tier = $1 AND category = ANY($2)`,
    [effectiveTier, categories]
  );
  const byCategory = new Map<string, any>();
  for (const r of rows) byCategory.set(r.category, r);

  const asFeatures = (v: any): string[] => (Array.isArray(v) ? v.map(String) : []);

  const services: ServicePrice[] = [];
  for (const key of WORKFLOW_SERVICES) {
    const row = byCategory.get(SERVICE_CATEGORY[key]);
    if (!row) continue;
    services.push({
      key,
      name: SERVICE_LABEL[key],
      plan_slug: row.slug,
      annual_ghs: Number(row.price_annual_ghs) || 0,
      monthly_ghs: Number(row.price_monthly_ghs) || 0,
      description: row.description || '',
      features: asFeatures(row.features),
    });
  }

  const fp = byCategory.get('full_platform');
  const full_platform = fp
    ? {
        plan_slug: fp.slug,
        annual_ghs: Number(fp.price_annual_ghs) || 0,
        monthly_ghs: Number(fp.price_monthly_ghs) || 0,
        description: fp.description || '',
        features: asFeatures(fp.features),
      }
    : null;

  return {
    mode: config.annual_only ? 'annual_bundle' : 'legacy_tiered',
    currency: 'GHS',
    canonical_tier: effectiveTier,
    bundle_discounts: config.bundle_discounts,
    services,
    full_platform,
  };
}

export interface BundleQuote {
  /** Normalised, de-duplicated list of selected workflow services. */
  services: WorkflowService[];
  /** The plan slug the subscription is anchored on (single service, or full-platform for multi/all). */
  anchor_plan_slug: string;
  /** Authoritative price to charge for the chosen interval, after any bundle discount. */
  price_ghs: number;
  /** List price before discount (sum of selected services). */
  list_ghs: number;
  discount_pct: number;
  billing_interval: 'annual' | 'monthly';
  is_full_platform: boolean;
}

/**
 * Compute the authoritative price for a set of selected services. This is the
 * single source of truth for what a bundle costs — the subscribe route calls it
 * and never trusts a client-supplied amount.
 *
 * @throws if no valid services are supplied or a required plan is missing.
 */
export async function computeBundleQuote(
  selected: string[],
  interval: 'annual' | 'monthly' = 'annual',
  tier?: string
): Promise<BundleQuote> {
  const catalog = await getPricingCatalog(tier);
  const priceOf = (s: ServicePrice) => (interval === 'annual' ? s.annual_ghs : s.monthly_ghs);

  // Normalise: keep only recognised workflow services, dedupe, preserve canonical order.
  const chosen = WORKFLOW_SERVICES.filter(
    (s) => selected.includes(s) && catalog.services.some((c) => c.key === s)
  );
  if (chosen.length === 0) throw new Error('No valid services selected');

  // All four → the full-platform plan's own authoritative price.
  if (chosen.length === WORKFLOW_SERVICES.length) {
    if (!catalog.full_platform) throw new Error('Full-platform plan not configured');
    const list = catalog.services.reduce((sum, s) => sum + priceOf(s), 0);
    const price = interval === 'annual' ? catalog.full_platform.annual_ghs : catalog.full_platform.monthly_ghs;
    return {
      services: chosen,
      anchor_plan_slug: catalog.full_platform.plan_slug,
      price_ghs: round2(price),
      list_ghs: round2(list),
      discount_pct: list > 0 ? round2(1 - price / list) : 0,
      billing_interval: interval,
      is_full_platform: true,
    };
  }

  const selectedPrices = catalog.services.filter((c) => chosen.includes(c.key));
  const list = selectedPrices.reduce((sum, s) => sum + priceOf(s), 0);
  const discount = chosen.length >= 2 ? Number(catalog.bundle_discounts[String(chosen.length)] || 0) : 0;
  const price = list * (1 - discount);

  // Single service anchors on its own plan (correct usage limits, no override).
  // Multi-service bundles anchor on full-platform for generous limits, with the
  // real service set + discounted price carried in subscription metadata.
  const anchorSlug =
    chosen.length === 1
      ? selectedPrices[0].plan_slug
      : catalog.full_platform?.plan_slug || selectedPrices[0].plan_slug;

  return {
    services: chosen,
    anchor_plan_slug: anchorSlug,
    price_ghs: round2(price),
    list_ghs: round2(list),
    discount_pct: round2(discount),
    billing_interval: interval,
    is_full_platform: false,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
