/**
 * Annual bundle pricing — client helpers.
 *
 * Mirrors the backend `subscriptionPricing` service. The catalog + discount
 * curve are DB-sourced (GET /api/subscriptions/pricing-catalog); this file only
 * computes DISPLAY prices. The server always recomputes the authoritative charge
 * at subscribe time from the same catalog, so the client figure can never
 * over/under-bill.
 */

export type WorkflowService = 'valuations' | 'property_management' | 'crm' | 'projects';

export const WORKFLOW_SERVICES: WorkflowService[] = [
  'valuations',
  'property_management',
  'crm',
  'projects',
];

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

export interface LocalQuote {
  services: WorkflowService[];
  list_ghs: number;
  price_ghs: number;
  discount_pct: number;
  is_full_platform: boolean;
}

/**
 * Fetch the bundle catalog. Omit `tier` for the annual entry tier; pass a
 * tier (starter/professional/enterprise) to build a tiered bundle catalog.
 * Returns null on failure.
 */
export async function fetchPricingCatalog(tier?: string): Promise<PricingCatalog | null> {
  try {
    const qs = tier ? `?tier=${encodeURIComponent(tier)}` : '';
    const res = await fetch(`/api/subscriptions/pricing-catalog${qs}`);
    if (!res.ok) return null;
    return (await res.json()) as PricingCatalog;
  } catch {
    return null;
  }
}

/**
 * Compute a display quote for a set of selected services, matching the backend:
 *   1 service   → list price (0% off)
 *   2 services  → 20% off the summed annual price
 *   3 services  → 35% off
 *   4 services  → the full-platform plan's own price
 */
export function computeLocalQuote(
  catalog: PricingCatalog,
  selected: WorkflowService[],
  interval: 'annual' | 'monthly' = 'annual'
): LocalQuote {
  const priceOf = (s: ServicePrice) => (interval === 'annual' ? s.annual_ghs : s.monthly_ghs);
  const chosen = WORKFLOW_SERVICES.filter(
    (s) => selected.includes(s) && catalog.services.some((c) => c.key === s)
  );
  const selectedPrices = catalog.services.filter((c) => chosen.includes(c.key));
  const list = round2(selectedPrices.reduce((sum, s) => sum + priceOf(s), 0));

  if (chosen.length === 0) {
    return { services: [], list_ghs: 0, price_ghs: 0, discount_pct: 0, is_full_platform: false };
  }

  if (chosen.length === WORKFLOW_SERVICES.length && catalog.full_platform) {
    const price = round2(
      interval === 'annual' ? catalog.full_platform.annual_ghs : catalog.full_platform.monthly_ghs
    );
    return {
      services: chosen,
      list_ghs: list,
      price_ghs: price,
      discount_pct: list > 0 ? round2(1 - price / list) : 0,
      is_full_platform: true,
    };
  }

  const discount = chosen.length >= 2 ? Number(catalog.bundle_discounts[String(chosen.length)] || 0) : 0;
  return {
    services: chosen,
    list_ghs: list,
    price_ghs: round2(list * (1 - discount)),
    discount_pct: round2(discount),
    is_full_platform: false,
  };
}

export function formatGhs(n: number): string {
  return `GHS ${Math.round(n).toLocaleString()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
