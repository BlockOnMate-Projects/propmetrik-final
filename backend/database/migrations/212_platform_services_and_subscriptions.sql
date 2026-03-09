-- Migration 212: Platform Services & User Service Subscriptions
-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 3 RBAC: Service access control for customers.
--
-- Creates:
--   1. platform_services — catalogue of services customers can subscribe to
--   2. user_service_subscriptions — maps users to subscribed services + tier
--   3. subscription_tier column on organizations — org-level default tier
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Platform Services catalogue
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key VARCHAR(60)  NOT NULL UNIQUE,       -- e.g. 'valuations', 'crm'
  name        VARCHAR(120) NOT NULL,               -- human-readable label
  description TEXT,
  category    VARCHAR(40)  NOT NULL DEFAULT 'core',-- core | analytics | admin
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  platform_services IS 'Catalogue of subscribable platform services';
COMMENT ON COLUMN platform_services.service_key IS 'Programmatic key used with requireServiceAccess()';

-- Seed the service catalogue (matches route mounts / resource types)
INSERT INTO platform_services (service_key, name, description, category, sort_order) VALUES
  -- Core services
  ('valuations',            'Valuations',                   'Property valuations, comparables, HBU, reconciliation, reports',           'core', 1),
  ('property_management',   'Property Management',          'Tenancies, rent collection, maintenance, utilities, inspections',          'core', 2),
  ('crm',                   'CRM & Client Management',      'Leads, deals, pipeline, contacts, activities, communications',            'core', 3),
  ('projects',              'Project Management',           'Projects, milestones, tasks, RFIs, submittals, change orders',             'core', 4),
  ('construction',          'Construction Management',      'Site diaries, safety, equipment, timesheets, closeout',                    'core', 5),
  ('data_hub',              'Data Hub',                     'Market data, research, economic indicators, geo intelligence',             'core', 6),

  -- Analytics services
  ('analytics',             'Analytics & Intelligence',     'Dashboards, cohorts, funnels, velocity, lead sources, agent performance',  'analytics', 10),
  ('market_intelligence',   'Market Intelligence',          'Market trends, supply/demand, competitor analysis',                        'analytics', 11),
  ('portfolio',             'Portfolio Analytics',          'Portfolio summary, project metrics, activity, deadlines',                   'analytics', 12),

  -- Specialised services
  ('short_stay',            'Short Stay / Hospitality',     'Airbnb metrics, benchmarks, competitive analysis, investment opps',        'specialised', 20),
  ('litigation',            'Litigation & Risk',            'Cases, hotspots, trends, risk assessment',                                 'specialised', 21),
  ('procurement',           'Procurement',                  'Purchase orders, vendors, bidding',                                        'specialised', 22),
  ('budget',                'Budget & Finance',             'Budgets, cost tracking, financial planning',                               'specialised', 23),

  -- Shared services (no gating — listed for completeness / billing)
  ('esign',                 'E-Sign',                       'Electronic signatures, envelopes, certificate of completion',              'shared', 90),
  ('messaging',             'Messaging',                    'In-app messaging, conversations',                                         'shared', 91),
  ('notifications',         'Notifications',                'Email, SMS, in-app notifications',                                        'shared', 92)
ON CONFLICT (service_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. User Service Subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_service_subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id        UUID         NOT NULL REFERENCES platform_services(id) ON DELETE CASCADE,
  organization_id   UUID         REFERENCES organizations(id) ON DELETE CASCADE,
  tier              VARCHAR(30)  NOT NULL DEFAULT 'starter',
  status            VARCHAR(20)  NOT NULL DEFAULT 'active',
  granted_by_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  starts_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,              -- NULL = no expiry
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_uss_tier   CHECK (tier   IN ('free','starter','professional','enterprise')),
  CONSTRAINT chk_uss_status CHECK (status IN ('active','suspended','expired','cancelled')),
  CONSTRAINT uq_user_service UNIQUE (user_id, service_id)   -- one subscription per service
);

CREATE INDEX idx_uss_user        ON user_service_subscriptions(user_id);
CREATE INDEX idx_uss_service     ON user_service_subscriptions(service_id);
CREATE INDEX idx_uss_org         ON user_service_subscriptions(organization_id);
CREATE INDEX idx_uss_status      ON user_service_subscriptions(status);
CREATE INDEX idx_uss_lookup      ON user_service_subscriptions(user_id, status) WHERE status = 'active';

COMMENT ON TABLE  user_service_subscriptions IS 'Maps customer users to their subscribed platform services';
COMMENT ON COLUMN user_service_subscriptions.tier IS 'Feature tier within this service (free/starter/professional/enterprise)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add subscription_tier to organizations (org-level default)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE organizations
      ADD COLUMN subscription_tier VARCHAR(30) NOT NULL DEFAULT 'starter';
    ALTER TABLE organizations
      ADD CONSTRAINT chk_org_subscription_tier
      CHECK (subscription_tier IN ('free','starter','professional','enterprise'));
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Migration 212: platform_services, user_service_subscriptions tables created; organizations.subscription_tier added'; END $$;

COMMIT;
