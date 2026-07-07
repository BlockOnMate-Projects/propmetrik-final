/**
 * Subscription → Service entitlement grants.
 *
 * The billing layer (`subscriptions` / `subscription_plans`) records WHAT an org
 * pays for; the ACCESS layer (`user_service_subscriptions`, read by
 * `middleware/serviceAccess.ts`) records WHAT services an org may actually use.
 * Historically these were decoupled: `createSubscription` wrote the billing rows
 * but never the access rows, so a paying customer stayed blocked (only teammate
 * invites ever wrote `user_service_subscriptions`). This module is the missing
 * link — called on every activation to grant access, and on cancel/expiry to
 * revoke it.
 *
 * Sellable workflow services (à la carte 1/2/3 of 4, or the full-platform bundle):
 *   valuations · property_management · crm · projects
 * Data Hub / Analytics / Market Intelligence / Short-stay are intentionally NOT
 * granted here (parked until the data product is opened to subscription).
 *
 * @module shared-services/payments/subscriptions/subscriptionEntitlements
 */
import { logger } from '../../../src/utils/logger';

/** Minimal DB handle — a pooled client (inside a txn) or the pool itself. */
type Db = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

/**
 * The concrete `platform_services.service_key`s each sellable service unlocks.
 * Most map 1:1; Projects also unlocks its operational sub-tabs so a Projects
 * subscriber isn't blocked on construction/procurement/budget routes.
 * (Shared services — esign/messaging/notifications — need no grant; they are
 * `category='shared'` and always pass `requireServiceAccess`.)
 */
export const SELLABLE_SERVICE_KEYS: Record<string, string[]> = {
  valuations: ['valuations'],
  property_management: ['property_management'],
  crm: ['crm'],
  projects: ['projects', 'construction', 'procurement', 'budget'],
};

/** The four sellable workflow services, in canonical order. */
export const WORKFLOW_SERVICES = ['valuations', 'property_management', 'crm', 'projects'] as const;
export type WorkflowService = (typeof WORKFLOW_SERVICES)[number];

/** All service keys the full-platform bundle unlocks (union of the four). */
export const FULL_PLATFORM_SERVICE_KEYS: string[] = Array.from(
  new Set(WORKFLOW_SERVICES.flatMap((s) => SELLABLE_SERVICE_KEYS[s]))
);

/** Access tiers permitted by `user_service_subscriptions.tier` (chk_uss_tier). */
const ACCESS_TIERS = ['free', 'starter', 'professional', 'enterprise'];

/**
 * Map a plan's marketing tier to a valid access tier. Pass-through for the four
 * real access tiers; the unlimited 'annual' SKU maps to 'enterprise' (its
 * unlimited access matches the top tier); anything unknown falls back to 'starter'.
 */
export function normalizeAccessTier(planTier?: string | null): string {
  if (planTier && ACCESS_TIERS.includes(planTier)) return planTier;
  if (planTier === 'annual') return 'enterprise';
  return 'starter';
}

/** Map a `subscription_plans.category` to its sellable workflow service (or null when not a workflow plan). */
const CATEGORY_TO_WORKFLOW: Record<string, WorkflowService | 'full' | null> = {
  valuation_services: 'valuations',
  property_management: 'property_management',
  crm: 'crm',
  project_management: 'projects',
  full_platform: 'full',
  data_intelligence: null, // parked — no access grant
};

/**
 * Resolve the concrete platform-service keys a subscription should grant.
 * @param plan            the subscription's plan (needs `.category`)
 * @param bundleServices  optional à la carte selection — a list of WORKFLOW_SERVICES
 *                        (e.g. `['crm','projects']`); overrides the plan category.
 */
export function resolveEntitlementServiceKeys(
  plan: { category?: string } | null | undefined,
  bundleServices?: string[] | null
): string[] {
  if (bundleServices && bundleServices.length > 0) {
    const keys = bundleServices
      .filter((s): s is WorkflowService => (WORKFLOW_SERVICES as readonly string[]).includes(s))
      .flatMap((s) => SELLABLE_SERVICE_KEYS[s]);
    return Array.from(new Set(keys));
  }
  const mapped = plan?.category ? CATEGORY_TO_WORKFLOW[plan.category] : null;
  if (mapped === 'full') return FULL_PLATFORM_SERVICE_KEYS;
  if (mapped && SELLABLE_SERVICE_KEYS[mapped]) return SELLABLE_SERVICE_KEYS[mapped];
  return [];
}

/**
 * Grant the org owner active access to the given service keys (idempotent upsert).
 * The subscribing user becomes `service_admin` (the only role that can invite
 * teammates) for each service. Teammates continue to be granted via invites.
 */
export async function grantServiceEntitlements(
  db: Db,
  opts: { organizationId?: string | null; userId?: string | null; serviceKeys: string[]; tier?: string | null }
): Promise<void> {
  const { organizationId, userId, serviceKeys } = opts;
  // user_service_subscriptions.tier is constrained to free/starter/professional/
  // enterprise (the ACCESS tiers). A plan's marketing tier can be something else
  // — e.g. the unlimited 'annual' SKU — which must be mapped, or the INSERT
  // violates chk_uss_tier and the grant silently fails (paid-but-blocked).
  const tier = normalizeAccessTier(opts.tier);
  if (!userId || !serviceKeys.length) return;

  for (const key of serviceKeys) {
    const svc = await db.query('SELECT id FROM platform_services WHERE service_key = $1', [key]);
    if (svc.rows.length === 0) continue;
    await db.query(
      `INSERT INTO user_service_subscriptions (user_id, service_id, organization_id, tier, status, service_role)
       VALUES ($1, $2, $3, $4, 'active', 'service_admin'::customer_service_role)
       ON CONFLICT (user_id, service_id) DO UPDATE SET
         status = 'active',
         tier = EXCLUDED.tier,
         organization_id = COALESCE(user_service_subscriptions.organization_id, EXCLUDED.organization_id)`,
      [userId, svc.rows[0].id, organizationId || null, tier]
    );
  }
  logger.info('Subscription entitlements granted', { organizationId, userId, serviceKeys, tier });
}

/**
 * Revoke access when a subscription is cancelled/expired. Deactivates the org's
 * service rows (whole-org: a lapsed org subscription removes access for the org's
 * seats). Pass `serviceKeys` to scope the revoke (e.g. a downgrade dropping one
 * service); omit to revoke all of the org's workflow services.
 */
export async function revokeServiceEntitlements(
  db: Db,
  opts: { organizationId?: string | null; serviceKeys?: string[] }
): Promise<void> {
  const { organizationId, serviceKeys } = opts;
  if (!organizationId) return;

  if (serviceKeys && serviceKeys.length > 0) {
    await db.query(
      `UPDATE user_service_subscriptions SET status = 'cancelled'
       WHERE organization_id = $1
         AND service_id IN (SELECT id FROM platform_services WHERE service_key = ANY($2))`,
      [organizationId, serviceKeys]
    );
  } else {
    // Only revoke the sellable workflow services — never touch shared services.
    await db.query(
      `UPDATE user_service_subscriptions SET status = 'cancelled'
       WHERE organization_id = $1
         AND service_id IN (SELECT id FROM platform_services WHERE service_key = ANY($2))`,
      [organizationId, FULL_PLATFORM_SERVICE_KEYS]
    );
  }
  logger.info('Subscription entitlements revoked', { organizationId, serviceKeys: serviceKeys || 'all-workflow' });
}
