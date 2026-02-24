-- Migration: 153_b2b_enterprise_features
-- Description: Org settings/branding, multi-level approval chains, API key management
-- Created: 2026-02-20

-- ═════════════════════════════════════════════════════════════════════
--  1 — Organization Settings & Branding
-- ═════════════════════════════════════════════════════════════════════

-- Extend organizations table with branding/white-label columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#f59e0b';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#000000';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) DEFAULT '#f59e0b';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS font_family VARCHAR(100) DEFAULT 'Inter';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_header_html TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_footer_html TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_signature_html TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) DEFAULT 'GHS';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country VARCHAR(3) DEFAULT 'GH';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS professional_body VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_expiry DATE;

-- ═════════════════════════════════════════════════════════════════════
--  2 — Multi-Level Approval Chains
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approval_chains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  entity_type VARCHAR(50) NOT NULL DEFAULT 'valuation_report',
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, name)
);

COMMENT ON TABLE approval_chains IS 'Configurable multi-level approval chains for valuations and reports';

CREATE TABLE IF NOT EXISTS approval_chain_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_id UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  step_order SMALLINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  required_role VARCHAR(50) NOT NULL,
  min_approvers SMALLINT DEFAULT 1,
  auto_escalate_hours INTEGER,
  escalate_to_role VARCHAR(50),
  instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chain_id, step_order)
);

COMMENT ON TABLE approval_chain_steps IS 'Individual steps within an approval chain';

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_id UUID NOT NULL REFERENCES approval_chains(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  current_step SMALLINT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'escalated', 'cancelled')),
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_entity ON approval_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_org ON approval_requests(org_id, status);

COMMENT ON TABLE approval_requests IS 'Active approval requests linked to entities (valuations, reports)';

CREATE TABLE IF NOT EXISTS approval_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES approval_chain_steps(id),
  step_order SMALLINT NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'rejected', 'escalated', 'deferred')),
  decided_by UUID NOT NULL,
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  comments TEXT,
  signature_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_request ON approval_decisions(request_id);

COMMENT ON TABLE approval_decisions IS 'Individual approval decisions at each step';

-- ═════════════════════════════════════════════════════════════════════
--  3 — API Key Management
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  key_hash VARCHAR(128) NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['read'],
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_day INTEGER DEFAULT 10000,
  allowed_ips TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_used_ip VARCHAR(45),
  usage_count BIGINT DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID
);

CREATE INDEX IF NOT EXISTS idx_org_api_keys_prefix ON org_api_keys(key_prefix) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_org_api_keys_org ON org_api_keys(org_id, is_active);

COMMENT ON TABLE org_api_keys IS 'Self-service API keys for org integrations (key_hash = SHA-256 of full key)';

-- Daily usage tracking for analytics + billing
CREATE TABLE IF NOT EXISTS api_key_usage_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES org_api_keys(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  endpoints_hit JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key_id, date)
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_date ON api_key_usage_daily(key_id, date DESC);

-- ═════════════════════════════════════════════════════════════════════
--  4 — Seed: Default Approval Chain Templates
-- ═════════════════════════════════════════════════════════════════════

-- These are org-level templates that each org can clone and customize.
-- We insert for org_id of the first organization found (or skip if no orgs).
-- In practice, chains are created per-org via the API.

-- (No seed data needed — chains are created per-org via the settings UI)

-- ═════════════════════════════════════════════════════════════════════
--  5 — Add authorization policies for new features
-- ═════════════════════════════════════════════════════════════════════

INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, description)
VALUES
  -- Org settings
  ('org_settings_read', 'org_settings', 'read', ARRAY['super_admin','firm_principal','admin','finance_manager']::user_role_enum[], 'View org settings and branding'),
  ('org_settings_manage', 'org_settings', 'manage', ARRAY['super_admin','firm_principal','admin']::user_role_enum[], 'Edit org settings, branding, and white-label config'),
  -- Approval chains
  ('approval_chain_read', 'approval_chain', 'read', ARRAY['super_admin','firm_principal','admin','manager','senior_valuer','compliance_officer']::user_role_enum[], 'View approval chain configs'),
  ('approval_chain_manage', 'approval_chain', 'manage', ARRAY['super_admin','firm_principal','admin']::user_role_enum[], 'Create/edit/delete approval chains'),
  ('approval_chain_decide', 'approval_chain', 'decide', ARRAY['super_admin','firm_principal','senior_valuer','manager','compliance_officer']::user_role_enum[], 'Approve or reject at assigned step'),
  -- API keys
  ('api_key_read', 'api_key', 'read', ARRAY['super_admin','firm_principal','admin']::user_role_enum[], 'View org API keys'),
  ('api_key_manage', 'api_key', 'manage', ARRAY['super_admin','firm_principal','admin']::user_role_enum[], 'Create/rotate/revoke API keys'),
  -- Firm analytics
  ('firm_analytics_read', 'firm_analytics', 'read', ARRAY['super_admin','firm_principal','admin','finance_manager','manager']::user_role_enum[], 'View firm performance analytics')
ON CONFLICT (policy_name) DO UPDATE
SET allowed_roles = EXCLUDED.allowed_roles,
    description = EXCLUDED.description;
