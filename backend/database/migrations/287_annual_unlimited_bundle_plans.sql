-- =============================================================================
-- Migration 287: Annual unlimited bundle plans (entry-strategy SKU family)
-- =============================================================================
-- The annual-only entry strategy sells ONE unlimited annual plan per service
-- (+ full platform) — NOT the capped starter tier. Reusing the starter tier
-- (mig 286 default) wrongly dragged in usage caps (10 valuations/mo, 1 user,
-- 50 properties, etc.). This migration introduces a dedicated `annual` tier:
--   * max_* = NULL  → unlimited usage (createSubscription creates no usage caps)
--   * is_public = false → hidden from the legacy tiered public page
--   * honest "unlimited" feature copy (not starter caps)
-- and repoints pricing_display_config.canonical_tier from 'starter' → 'annual'.
-- Prices seed from the current starter annual prices (placeholders the owner
-- edits after price discovery); full platform seeds at the sum of the four
-- services so it is never cheaper than a partial bundle.
-- Idempotent — safe to re-run.
-- =============================================================================

-- 1. Allow 'annual' as a tier value.
ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_tier_check;
ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_tier_check
  CHECK ((tier)::text = ANY (ARRAY['starter','professional','enterprise','annual']::text[]));

-- 2. Seed the five unlimited annual plans (max_* left NULL = unlimited).
INSERT INTO subscription_plans
  (slug, name, description, category, tier, segment,
   price_monthly_ghs, price_annual_ghs, currency,
   features, cta_text, is_featured, sort_order, is_active, is_public, trial_days)
VALUES
  ('val-annual', 'Valuations', 'Unlimited property valuations, all year.',
   'valuation_services', 'annual', 'any',
   271, 3250, 'GHS',
   '["Unlimited valuations","All RICS report templates","Full comparable & market data access","AI-assisted report drafting","PDF & DOCX export","Priority support"]'::jsonb,
   'Get Started', false, 10, true, false, 0),

  ('pm-annual', 'Property Management', 'Manage unlimited properties end to end.',
   'property_management', 'annual', 'any',
   325, 3900, 'GHS',
   '["Unlimited properties & units","Tenant portal & e-signing","Online rent collection & auto-pay","Maintenance & work orders","Full accounting & ledgers","Lease management"]'::jsonb,
   'Get Started', false, 11, true, false, 0),

  ('crm-annual', 'CRM', 'Unlimited pipeline, contacts and deals.',
   'crm', 'annual', 'any',
   271, 3250, 'GHS',
   '["Unlimited users, contacts & deals","Full sales pipeline & automation","Campaigns & drip sequences","Territories & commissions","Mobile app access","Priority support"]'::jsonb,
   'Get Started', false, 12, true, false, 0),

  ('proj-annual', 'Projects', 'Run unlimited development projects.',
   'project_management', 'annual', 'any',
   271, 3250, 'GHS',
   '["Unlimited active projects","Phases, milestones & Gantt","Budgets & procurement","RFIs & change orders","Document management","Contractor contracts"]'::jsonb,
   'Get Started', false, 13, true, false, 0),

  ('full-platform-annual', 'Full Platform', 'Everything, unlimited — the complete platform.',
   'full_platform', 'annual', 'any',
   1138, 13650, 'GHS',
   '["All four services included","Unlimited valuations, properties, deals & projects","Unlimited users","Tenant portal, e-sign & rent collection","Full accounting, budgets & procurement","Priority support · single annual invoice"]'::jsonb,
   'Get Started', true, 9, true, false, 0)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  is_active = true,
  is_public = false,
  -- keep any price the owner already edited; only backfill if still default
  price_annual_ghs = COALESCE(subscription_plans.price_annual_ghs, EXCLUDED.price_annual_ghs);

-- 2b. Force ALL usage limits to NULL (unlimited). max_users and storage_gb have
--     column defaults of 1, so they must be nulled explicitly — this is the crux
--     of the "annual = unlimited" guarantee. Idempotent.
UPDATE subscription_plans
   SET max_users = NULL,
       max_properties = NULL,
       max_valuations_monthly = NULL,
       max_projects = NULL,
       max_api_calls_monthly = NULL,
       storage_gb = NULL
 WHERE tier = 'annual';

-- 3. Pricing display config, pointed at the unlimited annual tier. Self-contained
--    (creates the row if absent) so this migration stands alone — supersedes the
--    earlier standalone seed. On an existing row, only repoint canonical_tier and
--    keep any admin-tuned annual_only / bundle_discounts.
INSERT INTO platform_settings (setting_key, setting_value)
VALUES (
    'pricing_display_config',
    '{"annual_only": true, "canonical_tier": "annual", "bundle_discounts": {"2": 0.20, "3": 0.35}}'::jsonb
)
ON CONFLICT (setting_key) DO UPDATE
   SET setting_value = jsonb_set(platform_settings.setting_value, '{canonical_tier}', '"annual"'),
       updated_at = NOW();
