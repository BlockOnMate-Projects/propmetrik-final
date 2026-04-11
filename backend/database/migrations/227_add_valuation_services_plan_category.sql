-- Migration 227: Add 'valuation_services' to subscription_plans category CHECK constraint
-- This enables Valuation Services as a standalone pricing category

ALTER TABLE subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_category_check;

ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_category_check
  CHECK (category IN (
    'full_platform', 'valuation_services', 'property_management',
    'crm', 'data_intelligence', 'project_management'
  ));

-- Seed the three Valuation Services plans
INSERT INTO subscription_plans (
  slug, name, description, category, tier, segment,
  price_monthly_ghs, price_annual_ghs,
  max_users, max_valuations_monthly,
  target_audience, features, cta_text, is_featured, sort_order
) VALUES
  (
    'val-starter', 'Starter', 'Essential valuation tools for independent valuers',
    'valuation_services', 'starter', 'b2c',
    325, 3250,
    1, 10,
    'Independent Valuers',
    '["Up to 10 Valuations/month","Standard Report Templates","Comparable Sales Access","Basic Market Data","PDF Export","Email Support"]',
    'Start Valuations', false, 1
  ),
  (
    'val-professional', 'Professional', 'Advanced valuation suite for growing firms',
    'valuation_services', 'professional', 'b2b',
    780, 7800,
    5, 50,
    'Valuation Firms',
    '["Up to 50 Valuations/month","Custom Report Branding","Advanced Comparable Analysis","Historical Market Trends","Team Collaboration","Priority Support","E-Signature Integration","Up to 5 User Seats"]',
    'Go Professional', true, 2
  ),
  (
    'val-enterprise', 'Enterprise', 'Full-scale valuation platform for institutions',
    'valuation_services', 'enterprise', 'b2b',
    1950, 19500,
    NULL, NULL,
    'Banks & Institutional Valuers',
    '["Unlimited Valuations","GhIS & RICS Compliance Tools","Portfolio Valuation","Automated Quality Checks","API Integration","Custom Workflows","Dedicated Account Manager","Unlimited Seats","SLA Guarantee"]',
    'Contact Sales', false, 3
  )
ON CONFLICT (slug) DO NOTHING;
