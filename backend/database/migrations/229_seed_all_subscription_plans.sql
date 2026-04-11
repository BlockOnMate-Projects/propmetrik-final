-- Migration 229: Seed all subscription plans from pricing page
--
-- Adds the full_platform, property_management, crm, data_intelligence,
-- and project_management plans so that pricing is fully database-driven.
-- Valuation_services plans already exist from migration 227.
--
-- Uses ON CONFLICT (slug) DO UPDATE to upsert — safe to re-run.

-- ════════════════════════════════════════════════════════════════
-- Full Platform (3 tiers)
-- ════════════════════════════════════════════════════════════════
INSERT INTO subscription_plans
  (slug, name, description, category, tier, segment,
   price_monthly_ghs, price_annual_ghs, max_users, max_properties,
   max_api_calls_monthly, storage_gb, target_audience, features,
   cta_text, is_featured, sort_order, is_active, is_public, trial_days)
VALUES
  ('full-platform-core', 'Core', 'Essential tools for getting started', 'full_platform', 'starter', 'b2c',
   390, 3900, 1, 50, NULL, 5,
   'Starters & Individuals',
   '["Access to public listings","Basic Valuation (limited)","Standard Market Reports","Email Support","1 User Seat","Up to 50 properties"]',
   'Start Free Trial', false, 0, true, true, 14),

  ('full-platform-pro', 'Pro', 'Complete suite for agencies and developers', 'full_platform', 'professional', 'b2b',
   975, 9750, 10, NULL, NULL, 25,
   'Agencies & Developers',
   '["All Core Features","Unlimited Valuations","Historical Transaction Data","CRM & Deal Management","Property Management","Priority Support","Up to 10 User Seats"]',
   'Get Started', true, 1, true, true, 14),

  ('full-platform-enterprise', 'Enterprise', 'Full institutional access with SLA', 'full_platform', 'enterprise', 'b2b',
   3250, 32500, NULL, NULL, 100000, 100,
   'Banks & Institutions',
   '["Full API Access (100k calls)","Portfolio Analysis Tools","Risk & Compliance Modules","Custom Reporting","Dedicated Account Manager","Unlimited Seats","Project Management","White-label Options","SLA Guarantee"]',
   'Contact Sales', false, 2, true, true, 14)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_ghs = EXCLUDED.price_monthly_ghs,
  price_annual_ghs = EXCLUDED.price_annual_ghs,
  max_users = EXCLUDED.max_users,
  max_properties = EXCLUDED.max_properties,
  max_api_calls_monthly = EXCLUDED.max_api_calls_monthly,
  storage_gb = EXCLUDED.storage_gb,
  target_audience = EXCLUDED.target_audience,
  features = EXCLUDED.features,
  cta_text = EXCLUDED.cta_text,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ════════════════════════════════════════════════════════════════
-- Valuation Services — upsert existing (from migration 227) with full data
-- ════════════════════════════════════════════════════════════════
INSERT INTO subscription_plans
  (slug, name, description, category, tier, segment,
   price_monthly_ghs, price_annual_ghs, max_users, max_valuations_monthly,
   storage_gb, target_audience, features,
   cta_text, is_featured, sort_order, is_active, is_public, trial_days)
VALUES
  ('val-starter', 'Starter', 'Essential valuation tools for independent valuers', 'valuation_services', 'starter', 'b2c',
   325, 3250, 1, 10, 5,
   'Independent Valuers',
   '["Up to 10 Valuations/month","Standard Report Templates","Comparable Sales Access","Basic Market Data","PDF Export","Email Support"]',
   'Start Valuations', false, 0, true, true, 14),

  ('val-professional', 'Professional', 'Advanced tools for valuation firms', 'valuation_services', 'professional', 'b2b',
   780, 7800, 5, 50, 25,
   'Valuation Firms',
   '["Up to 50 Valuations/month","Custom Report Branding","Advanced Comparable Analysis","Historical Market Trends","Team Collaboration","Priority Support","E-Signature Integration","Up to 5 User Seats"]',
   'Go Professional', true, 1, true, true, 14),

  ('val-enterprise', 'Enterprise', 'Unlimited valuations for institutional clients', 'valuation_services', 'enterprise', 'b2b',
   1950, 19500, NULL, NULL, 100,
   'Banks & Institutional Valuers',
   '["Unlimited Valuations","GhIS & RICS Compliance Tools","Portfolio Valuation","Automated Quality Checks","API Integration","Custom Workflows","Dedicated Account Manager","Unlimited Seats","SLA Guarantee"]',
   'Contact Sales', false, 2, true, true, 14)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_ghs = EXCLUDED.price_monthly_ghs,
  price_annual_ghs = EXCLUDED.price_annual_ghs,
  max_users = EXCLUDED.max_users,
  max_valuations_monthly = EXCLUDED.max_valuations_monthly,
  storage_gb = EXCLUDED.storage_gb,
  target_audience = EXCLUDED.target_audience,
  features = EXCLUDED.features,
  cta_text = EXCLUDED.cta_text,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ════════════════════════════════════════════════════════════════
-- Property Management (3 tiers)
-- ════════════════════════════════════════════════════════════════
INSERT INTO subscription_plans
  (slug, name, description, category, tier, segment,
   price_monthly_ghs, price_annual_ghs, max_users, max_properties,
   storage_gb, target_audience, features,
   cta_text, is_featured, sort_order, is_active, is_public, trial_days)
VALUES
  ('pm-basic', 'Basic', 'Essential property management for small portfolios', 'property_management', 'starter', 'b2c',
   390, 3900, 3, 100, 5,
   'Small Portfolios',
   '["Up to 100 Properties","Tenant Portal","Maintenance Tracking","Basic Accounting","Lease Management"]',
   'Start Basic', false, 0, true, true, 14),

  ('pm-premium', 'Premium', 'Full-featured management for growing portfolios', 'property_management', 'professional', 'b2b',
   780, 7800, 10, 500, 25,
   'Property Managers',
   '["Up to 500 Properties","Vendor Management","Automated Invoicing","Owner Portals","Vacancy Marketing","Multi-user Roles"]',
   'Go Premium', true, 1, true, true, 14),

  ('pm-enterprise', 'Enterprise', 'Enterprise-grade property management', 'property_management', 'enterprise', 'b2b',
   1560, 15600, NULL, NULL, 100,
   'Large Corporations',
   '["Unlimited Properties","Custom Workflows","API Integration","Dedicated Support","Advanced Analytics","Compliance Tools"]',
   'Contact Sales', false, 2, true, true, 14)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_ghs = EXCLUDED.price_monthly_ghs,
  price_annual_ghs = EXCLUDED.price_annual_ghs,
  max_users = EXCLUDED.max_users,
  max_properties = EXCLUDED.max_properties,
  storage_gb = EXCLUDED.storage_gb,
  target_audience = EXCLUDED.target_audience,
  features = EXCLUDED.features,
  cta_text = EXCLUDED.cta_text,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ════════════════════════════════════════════════════════════════
-- CRM (3 tiers)
-- ════════════════════════════════════════════════════════════════
INSERT INTO subscription_plans
  (slug, name, description, category, tier, segment,
   price_monthly_ghs, price_annual_ghs, max_users,
   storage_gb, target_audience, features,
   cta_text, is_featured, sort_order, is_active, is_public, trial_days)
VALUES
  ('crm-starter', 'Starter', 'CRM essentials for solo agents', 'crm', 'starter', 'b2c',
   325, 3250, 5, 5,
   'Solo Agents',
   '["Up to 5 Users","Lead Pipeline","Contact Management","Task & Calendar Sync","Mobile App Access"]',
   'Start CRM', false, 0, true, true, 14),

  ('crm-professional', 'Professional', 'Team CRM with deal analytics', 'crm', 'professional', 'b2b',
   650, 6500, 20, 25,
   'Growing Teams',
   '["Up to 20 Users","Team Performance Reports","Document Generation","E-Signature Integration","Email Campaigns","Deal Analytics"]',
   'Upgrade Team', true, 1, true, true, 14),

  ('crm-enterprise', 'Enterprise', 'Full brokerage CRM suite', 'crm', 'enterprise', 'b2b',
   1300, 13000, NULL, 100,
   'Brokerages',
   '["Unlimited Users","Advanced Permissions","Commission Tracking","Territory Management","API Access","Custom Integrations"]',
   'Contact Sales', false, 2, true, true, 14)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_ghs = EXCLUDED.price_monthly_ghs,
  price_annual_ghs = EXCLUDED.price_annual_ghs,
  max_users = EXCLUDED.max_users,
  storage_gb = EXCLUDED.storage_gb,
  target_audience = EXCLUDED.target_audience,
  features = EXCLUDED.features,
  cta_text = EXCLUDED.cta_text,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ════════════════════════════════════════════════════════════════
-- Data Intelligence (3 tiers)
-- ════════════════════════════════════════════════════════════════
INSERT INTO subscription_plans
  (slug, name, description, category, tier, segment,
   price_monthly_ghs, price_annual_ghs, max_users, max_api_calls_monthly,
   storage_gb, target_audience, features,
   cta_text, is_featured, sort_order, is_active, is_public, trial_days)
VALUES
  ('data-developer', 'Developer', 'API access for app builders', 'data_intelligence', 'starter', 'b2c',
   260, 2600, 1, 1000, 1,
   'App Builders',
   '["1,000 API Calls/mo","Standard Endpoints","Weekly Data Updates","Community Support","Sandbox Access"]',
   'Get API Key', false, 0, true, true, 14),

  ('data-business', 'Business', 'Scaled data access for startups', 'data_intelligence', 'professional', 'b2b',
   650, 6500, 5, 10000, 10,
   'PropTech Startups',
   '["10,000 API Calls/mo","Advanced Filtering","Daily Data Updates","Priority Support","Increased Rate Limits","Webhooks"]',
   'Scale Up', true, 1, true, true, 14),

  ('data-enterprise', 'Enterprise', 'Full database access with SLA', 'data_intelligence', 'enterprise', 'b2b',
   1950, 19500, NULL, 100000, 100,
   'Data Aggregators',
   '["100,000 API Calls/mo","Full Database Access","Real-time Webhooks","SLA Guarantee","Dedicated Solutions Engineer","Custom Data Feeds"]',
   'Talk to Sales', false, 2, true, true, 14)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_ghs = EXCLUDED.price_monthly_ghs,
  price_annual_ghs = EXCLUDED.price_annual_ghs,
  max_users = EXCLUDED.max_users,
  max_api_calls_monthly = EXCLUDED.max_api_calls_monthly,
  storage_gb = EXCLUDED.storage_gb,
  target_audience = EXCLUDED.target_audience,
  features = EXCLUDED.features,
  cta_text = EXCLUDED.cta_text,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ════════════════════════════════════════════════════════════════
-- Project Management (3 tiers)
-- ════════════════════════════════════════════════════════════════
INSERT INTO subscription_plans
  (slug, name, description, category, tier, segment,
   price_monthly_ghs, price_annual_ghs, max_users, max_projects,
   storage_gb, target_audience, features,
   cta_text, is_featured, sort_order, is_active, is_public, trial_days)
VALUES
  ('proj-starter', 'Starter', 'Project tools for small developers', 'project_management', 'starter', 'b2c',
   325, 3250, 5, 5, 5,
   'Small Developers',
   '["Up to 5 Active Projects","Task & Milestone Tracking","Budget Management","Document Storage (5 GB)","Basic Gantt Charts","Email Notifications"]',
   'Start Projects', false, 0, true, true, 14),

  ('proj-professional', 'Professional', 'Full project management for construction firms', 'project_management', 'professional', 'b2b',
   650, 6500, 20, 25, 25,
   'Construction Firms',
   '["Up to 25 Active Projects","Resource Allocation","Contractor Management","Financial Forecasting","Document Storage (25 GB)","Progress Dashboards","Team Collaboration","Inspection Tracking"]',
   'Go Professional', true, 1, true, true, 14),

  ('proj-enterprise', 'Enterprise', 'Enterprise project management with unlimited capacity', 'project_management', 'enterprise', 'b2b',
   1300, 13000, NULL, NULL, 100,
   'Large Developers & Govt',
   '["Unlimited Projects","Portfolio-level Analytics","Multi-site Management","Compliance & Audit Trail","Custom Workflows","API Integration","Unlimited Storage","Dedicated Support"]',
   'Contact Sales', false, 2, true, true, 14)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_ghs = EXCLUDED.price_monthly_ghs,
  price_annual_ghs = EXCLUDED.price_annual_ghs,
  max_users = EXCLUDED.max_users,
  max_projects = EXCLUDED.max_projects,
  storage_gb = EXCLUDED.storage_gb,
  target_audience = EXCLUDED.target_audience,
  features = EXCLUDED.features,
  cta_text = EXCLUDED.cta_text,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;
