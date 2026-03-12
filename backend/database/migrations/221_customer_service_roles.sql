-- Migration 221: Customer Service-Specific Roles
-- Adds per-service roles for customer users so team members
-- invited to a service get scoped access instead of full admin.
-- Backward-compatible: existing customers default to service_admin.

BEGIN;

-- ============================================================
-- 1. Create customer_service_role ENUM
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_service_role') THEN
    CREATE TYPE customer_service_role AS ENUM (
      -- Universal (all services)
      'service_admin',
      'viewer',
      -- Valuations-specific
      'senior_associate',
      'associate',
      'finance_officer',
      -- CRM-specific
      'sales_manager',
      'sales_agent',
      -- Projects-specific
      'project_manager',
      'site_supervisor',
      'quantity_surveyor',
      -- Property Management-specific
      'property_manager',
      'leasing_agent',
      'maintenance_coordinator',
      'accounts_officer',
      -- Analytics-specific
      'analyst'
    );
  END IF;
END $$;

-- ============================================================
-- 2. Add service_role column to user_service_subscriptions
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_service_subscriptions' AND column_name = 'service_role'
  ) THEN
    ALTER TABLE user_service_subscriptions
      ADD COLUMN service_role customer_service_role NOT NULL DEFAULT 'service_admin';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_uss_service_role
  ON user_service_subscriptions(service_role);

-- ============================================================
-- 3. Create customer_service_role_config (valid roles per service)
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_service_role_config (
  service_key   VARCHAR(50)  NOT NULL,
  service_role  VARCHAR(50)  NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  description   TEXT,
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_key, service_role)
);

COMMENT ON TABLE customer_service_role_config IS
  'Lookup table: which customer roles are valid for each service, with display metadata for invite UI.';

-- Seed: Valuations
INSERT INTO customer_service_role_config (service_key, service_role, display_name, description, sort_order) VALUES
  ('valuations', 'service_admin',    'Firm Administrator',          'Full access to all service features. Can invite and manage team members.', 0),
  ('valuations', 'senior_associate', 'Senior Valuation Associate',  'Creates and finalizes valuations. Reviews and approves junior work. Manages clients.', 1),
  ('valuations', 'associate',        'Valuation Associate',         'Creates and edits valuations. Manages clients and calendar. Cannot access financials or settings.', 2),
  ('valuations', 'finance_officer',  'Finance Officer',             'Full access to the Finance tab (invoicing, payment accounts). Read-only access to valuations and clients.', 3),
  ('valuations', 'viewer',           'Viewer',                      'Read-only access to valuations. No financials, clients, or settings.', 4)
ON CONFLICT (service_key, service_role) DO NOTHING;

-- Seed: CRM
INSERT INTO customer_service_role_config (service_key, service_role, display_name, description, sort_order) VALUES
  ('crm', 'service_admin',  'Agency Administrator', 'Full access including pipeline config, commissions, drip campaigns, analytics. Can invite and manage team.', 0),
  ('crm', 'sales_manager',  'Sales Manager',        'Manages all deals and the full team pipeline. Can approve commissions, manage drip campaigns, view analytics.', 1),
  ('crm', 'sales_agent',    'Sales Agent',          'Creates and manages their own deals, contacts, and companies. Manages tasks and calendar. No financials or analytics.', 2),
  ('crm', 'viewer',         'Viewer',               'Read-only access to deals, contacts, and companies. No financials, analytics, or pipeline config.', 3)
ON CONFLICT (service_key, service_role) DO NOTHING;

-- Seed: Projects
INSERT INTO customer_service_role_config (service_key, service_role, display_name, description, sort_order) VALUES
  ('projects', 'service_admin',     'Project Director',    'Full access to all project features including settings, analytics, and team management.', 0),
  ('projects', 'project_manager',   'Project Manager',     'End-to-end project management: phases, milestones, budgets, contractors, draw requests, units.', 1),
  ('projects', 'site_supervisor',   'Site Supervisor',     'Field-focused: daily logs, punch lists, photos, checklists, site diaries, construction tab.', 2),
  ('projects', 'quantity_surveyor', 'Quantity Surveyor',   'Cost-focused: procurement, budgets, draw requests, costs. Can view overview and documents.', 3),
  ('projects', 'viewer',            'Viewer',              'Read-only access to overview, documents, and units. Suitable for investors or clients.', 4)
ON CONFLICT (service_key, service_role) DO NOTHING;

-- Seed: Property Management
INSERT INTO customer_service_role_config (service_key, service_role, display_name, description, sort_order) VALUES
  ('property_management', 'service_admin',             'Portfolio Director',        'Full access to all property management features. Manages team, settings, portfolios, and all financials.', 0),
  ('property_management', 'property_manager',          'Property Manager',          'Full operational access: properties, tenants, leases, maintenance, documents, calendar. Read-only on financials.', 1),
  ('property_management', 'leasing_agent',             'Leasing Agent',             'Focused on tenant acquisition: rental applications, tenant screening, lease creation and signing.', 2),
  ('property_management', 'maintenance_coordinator',   'Maintenance Coordinator',   'Manages work orders end-to-end: create, assign, and close maintenance requests. Full access to vendors.', 3),
  ('property_management', 'accounts_officer',          'Accounts Officer',          'Focused on financials: rent collection, invoicing, payment tracking, NOI reporting.', 4),
  ('property_management', 'viewer',                    'Viewer',                    'Read-only access to overview, properties, tenants, and documents.', 5)
ON CONFLICT (service_key, service_role) DO NOTHING;

-- Seed: Analytics
INSERT INTO customer_service_role_config (service_key, service_role, display_name, description, sort_order) VALUES
  ('analytics', 'service_admin', 'Analytics Administrator', 'Full access to all analytics modules, export, and settings. Can invite and manage team.', 0),
  ('analytics', 'analyst',       'Analyst',                 'Full read access across all analytics sub-tabs. Can export data. No Management dashboard or Settings.', 1),
  ('analytics', 'viewer',        'Viewer',                  'Read access to most analytics. Cannot export, access ML Models, Forecasting, or Management dashboards.', 2)
ON CONFLICT (service_key, service_role) DO NOTHING;

-- ============================================================
-- 4. Create customer_authorization_policies table
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_authorization_policies (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key       VARCHAR(50)  NOT NULL,
  resource_type     VARCHAR(50)  NOT NULL,
  action            VARCHAR(50)  NOT NULL,
  allowed_roles     TEXT[]       NOT NULL,
  require_ownership BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cap_service_resource_action UNIQUE (service_key, resource_type, action)
);

COMMENT ON TABLE customer_authorization_policies IS
  'Defines which customer service roles can perform which actions on which resource types per service.';

CREATE INDEX IF NOT EXISTS idx_cap_service_key ON customer_authorization_policies(service_key);

-- -------------------------------------------------------
-- Seed: Valuations policies
-- -------------------------------------------------------
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership) VALUES
  -- Valuations
  ('valuations', 'valuation',         'list',    '{service_admin,senior_associate,associate,finance_officer,viewer}', false),
  ('valuations', 'valuation',         'read',    '{service_admin,senior_associate,associate,finance_officer,viewer}', false),
  ('valuations', 'valuation',         'create',  '{service_admin,senior_associate,associate}', false),
  ('valuations', 'valuation',         'update',  '{service_admin,senior_associate,associate}', false),
  ('valuations', 'valuation',         'delete',  '{service_admin,senior_associate}', false),
  ('valuations', 'valuation',         'approve', '{service_admin,senior_associate}', false),
  -- Reports
  ('valuations', 'report',            'list',    '{service_admin,senior_associate,associate,finance_officer,viewer}', false),
  ('valuations', 'report',            'read',    '{service_admin,senior_associate,associate,finance_officer,viewer}', false),
  ('valuations', 'report',            'create',  '{service_admin,senior_associate,associate}', false),
  ('valuations', 'report',            'update',  '{service_admin,senior_associate,associate}', false),
  ('valuations', 'report',            'delete',  '{service_admin,senior_associate}', false),
  -- Publications
  ('valuations', 'publication',       'list',    '{service_admin,senior_associate,associate,viewer}', false),
  ('valuations', 'publication',       'read',    '{service_admin,senior_associate,associate,viewer}', false),
  ('valuations', 'publication',       'create',  '{service_admin,senior_associate}', false),
  ('valuations', 'publication',       'update',  '{service_admin,senior_associate}', false),
  -- Valuation clients
  ('valuations', 'valuation_client',  'list',    '{service_admin,senior_associate,associate}', false),
  ('valuations', 'valuation_client',  'read',    '{service_admin,senior_associate,associate}', false),
  ('valuations', 'valuation_client',  'create',  '{service_admin,senior_associate,associate}', false),
  ('valuations', 'valuation_client',  'update',  '{service_admin,senior_associate,associate}', false),
  ('valuations', 'valuation_client',  'delete',  '{service_admin}', false),
  -- Valuation org settings
  ('valuations', 'valuation_org',     'read',    '{service_admin,senior_associate}', false),
  ('valuations', 'valuation_org',     'update',  '{service_admin}', false),
  -- Valuation invoices
  ('valuations', 'valuation_invoice', 'list',    '{service_admin,senior_associate,finance_officer}', false),
  ('valuations', 'valuation_invoice', 'read',    '{service_admin,senior_associate,finance_officer}', false),
  ('valuations', 'valuation_invoice', 'create',  '{service_admin,finance_officer}', false),
  ('valuations', 'valuation_invoice', 'update',  '{service_admin,finance_officer}', false),
  ('valuations', 'valuation_invoice', 'delete',  '{service_admin}', false)
ON CONFLICT (service_key, resource_type, action) DO NOTHING;

-- -------------------------------------------------------
-- Seed: CRM policies
-- -------------------------------------------------------
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership) VALUES
  -- Deals
  ('crm', 'crm_deal',     'list',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_deal',     'read',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_deal',     'create',  '{service_admin,sales_manager,sales_agent}', false),
  ('crm', 'crm_deal',     'update',  '{service_admin,sales_manager,sales_agent}', true),
  ('crm', 'crm_deal',     'delete',  '{service_admin,sales_manager}', false),
  -- Contacts
  ('crm', 'crm_contact',  'list',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_contact',  'read',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_contact',  'create',  '{service_admin,sales_manager,sales_agent}', false),
  ('crm', 'crm_contact',  'update',  '{service_admin,sales_manager,sales_agent}', false),
  ('crm', 'crm_contact',  'delete',  '{service_admin,sales_manager}', false),
  -- Pipelines
  ('crm', 'crm_pipeline', 'list',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_pipeline', 'read',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_pipeline', 'create',  '{service_admin}', false),
  ('crm', 'crm_pipeline', 'update',  '{service_admin}', false),
  ('crm', 'crm_pipeline', 'delete',  '{service_admin}', false),
  -- Activities
  ('crm', 'crm_activity', 'list',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_activity', 'read',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_activity', 'create',  '{service_admin,sales_manager,sales_agent}', false),
  ('crm', 'crm_activity', 'update',  '{service_admin,sales_manager,sales_agent}', true),
  ('crm', 'crm_activity', 'delete',  '{service_admin,sales_manager}', false),
  -- Leads
  ('crm', 'crm_lead',     'list',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_lead',     'read',    '{service_admin,sales_manager,sales_agent,viewer}', false),
  ('crm', 'crm_lead',     'create',  '{service_admin,sales_manager,sales_agent}', false),
  ('crm', 'crm_lead',     'update',  '{service_admin,sales_manager,sales_agent}', true),
  ('crm', 'crm_lead',     'delete',  '{service_admin,sales_manager}', false)
ON CONFLICT (service_key, resource_type, action) DO NOTHING;

-- -------------------------------------------------------
-- Seed: Projects policies
-- -------------------------------------------------------
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership) VALUES
  -- Projects
  ('projects', 'project',      'list',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'project',      'read',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'project',      'create',  '{service_admin,project_manager}', false),
  ('projects', 'project',      'update',  '{service_admin,project_manager}', false),
  ('projects', 'project',      'delete',  '{service_admin}', false),
  -- Milestones
  ('projects', 'milestone',    'list',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'milestone',    'read',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'milestone',    'create',  '{service_admin,project_manager}', false),
  ('projects', 'milestone',    'update',  '{service_admin,project_manager}', false),
  ('projects', 'milestone',    'delete',  '{service_admin,project_manager}', false),
  -- RFIs
  ('projects', 'rfi',          'list',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'rfi',          'read',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'rfi',          'create',  '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'rfi',          'update',  '{service_admin,project_manager,site_supervisor}', false),
  -- Submittals
  ('projects', 'submittal',    'list',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'submittal',    'read',    '{service_admin,project_manager,site_supervisor,quantity_surveyor,viewer}', false),
  ('projects', 'submittal',    'create',  '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'submittal',    'update',  '{service_admin,project_manager}', false),
  -- Change orders
  ('projects', 'change_order', 'list',    '{service_admin,project_manager,quantity_surveyor,viewer}', false),
  ('projects', 'change_order', 'read',    '{service_admin,project_manager,quantity_surveyor,viewer}', false),
  ('projects', 'change_order', 'create',  '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'change_order', 'update',  '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'change_order', 'approve', '{service_admin,quantity_surveyor}', false),
  -- Governance / workflows
  ('projects', 'governance',   'list',    '{service_admin,project_manager,viewer}', false),
  ('projects', 'governance',   'read',    '{service_admin,project_manager,viewer}', false),
  ('projects', 'governance',   'create',  '{service_admin,project_manager}', false),
  ('projects', 'governance',   'update',  '{service_admin,project_manager}', false),
  ('projects', 'workflow',     'list',    '{service_admin,project_manager,viewer}', false),
  ('projects', 'workflow',     'read',    '{service_admin,project_manager,viewer}', false),
  ('projects', 'workflow',     'create',  '{service_admin,project_manager}', false),
  ('projects', 'workflow',     'update',  '{service_admin,project_manager}', false),
  -- Procurement / budget
  ('projects', 'procurement',  'list',    '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'procurement',  'read',    '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'procurement',  'create',  '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'procurement',  'update',  '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'budget',       'list',    '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'budget',       'read',    '{service_admin,project_manager,quantity_surveyor}', false),
  ('projects', 'budget',       'create',  '{service_admin,quantity_surveyor}', false),
  ('projects', 'budget',       'update',  '{service_admin,quantity_surveyor}', false),
  -- Construction / site diaries
  ('projects', 'construction', 'list',    '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'construction', 'read',    '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'construction', 'create',  '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'construction', 'update',  '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'site_diary',   'list',    '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'site_diary',   'read',    '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'site_diary',   'create',  '{service_admin,project_manager,site_supervisor}', false),
  ('projects', 'site_diary',   'update',  '{service_admin,project_manager,site_supervisor}', false)
ON CONFLICT (service_key, resource_type, action) DO NOTHING;

-- -------------------------------------------------------
-- Seed: Property Management policies
-- -------------------------------------------------------
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership) VALUES
  -- Properties / property management
  ('property_management', 'property_management', 'list',    '{service_admin,property_manager,leasing_agent,maintenance_coordinator,accounts_officer,viewer}', false),
  ('property_management', 'property_management', 'read',    '{service_admin,property_manager,leasing_agent,maintenance_coordinator,accounts_officer,viewer}', false),
  ('property_management', 'property_management', 'create',  '{service_admin,property_manager}', false),
  ('property_management', 'property_management', 'update',  '{service_admin,property_manager}', false),
  ('property_management', 'property_management', 'delete',  '{service_admin}', false),
  -- Tenancies
  ('property_management', 'tenancy',             'list',    '{service_admin,property_manager,leasing_agent,maintenance_coordinator,accounts_officer,viewer}', false),
  ('property_management', 'tenancy',             'read',    '{service_admin,property_manager,leasing_agent,maintenance_coordinator,accounts_officer,viewer}', false),
  ('property_management', 'tenancy',             'create',  '{service_admin,property_manager,leasing_agent}', false),
  ('property_management', 'tenancy',             'update',  '{service_admin,property_manager,leasing_agent}', false),
  ('property_management', 'tenancy',             'delete',  '{service_admin,property_manager}', false),
  -- Maintenance
  ('property_management', 'maintenance',         'list',    '{service_admin,property_manager,maintenance_coordinator,viewer}', false),
  ('property_management', 'maintenance',         'read',    '{service_admin,property_manager,maintenance_coordinator,viewer}', false),
  ('property_management', 'maintenance',         'create',  '{service_admin,property_manager,maintenance_coordinator}', false),
  ('property_management', 'maintenance',         'update',  '{service_admin,property_manager,maintenance_coordinator}', false),
  ('property_management', 'maintenance',         'delete',  '{service_admin,property_manager}', false),
  -- Utilities
  ('property_management', 'utility',             'list',    '{service_admin,property_manager,accounts_officer}', false),
  ('property_management', 'utility',             'read',    '{service_admin,property_manager,accounts_officer}', false),
  ('property_management', 'utility',             'create',  '{service_admin,property_manager,accounts_officer}', false),
  ('property_management', 'utility',             'update',  '{service_admin,property_manager,accounts_officer}', false)
ON CONFLICT (service_key, resource_type, action) DO NOTHING;

-- -------------------------------------------------------
-- Seed: Analytics policies
-- -------------------------------------------------------
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership) VALUES
  ('analytics', 'analytics',            'list',    '{service_admin,analyst,viewer}', false),
  ('analytics', 'analytics',            'read',    '{service_admin,analyst,viewer}', false),
  ('analytics', 'analytics',            'create',  '{service_admin,analyst}', false),
  ('analytics', 'analytics',            'export',  '{service_admin,analyst}', false),
  ('analytics', 'market_intelligence',  'list',    '{service_admin,analyst,viewer}', false),
  ('analytics', 'market_intelligence',  'read',    '{service_admin,analyst,viewer}', false),
  ('analytics', 'portfolio',            'list',    '{service_admin,analyst,viewer}', false),
  ('analytics', 'portfolio',            'read',    '{service_admin,analyst,viewer}', false)
ON CONFLICT (service_key, resource_type, action) DO NOTHING;

-- ============================================================
-- 5. Add service_key and service_role to unified_invitations
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unified_invitations' AND column_name = 'service_key'
  ) THEN
    ALTER TABLE unified_invitations ADD COLUMN service_key VARCHAR(50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unified_invitations' AND column_name = 'service_role'
  ) THEN
    ALTER TABLE unified_invitations ADD COLUMN service_role customer_service_role DEFAULT 'service_admin';
  END IF;
END $$;

COMMIT;
