-- Migration 154: Comprehensive Subscription & Billing System
-- Supports B2C (individual), B2B (organization), and à la carte module pricing
-- Categories: full_platform, property_management, crm, data_intelligence, project_management
-- super_admin remains platform-level only (PropMetrik org), NOT a subscriber role

-- ============================================================
-- 1. SUBSCRIPTION PLANS
-- Defines all available plans across categories and tiers
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Classification
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'full_platform', 'property_management', 'crm',
        'data_intelligence', 'project_management'
    )),
    tier VARCHAR(50) NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),
    segment VARCHAR(20) NOT NULL DEFAULT 'any' CHECK (segment IN ('b2c', 'b2b', 'any')),

    -- Pricing (GHS primary, USD optional)
    price_monthly_ghs DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_annual_ghs DECIMAL(10,2),
    price_monthly_usd DECIMAL(10,2),
    price_annual_usd DECIMAL(10,2),
    currency VARCHAR(3) NOT NULL DEFAULT 'GHS',

    -- Limits
    max_users INTEGER DEFAULT 1,
    max_properties INTEGER,
    max_api_calls_monthly INTEGER,
    max_valuations_monthly INTEGER,
    max_projects INTEGER,
    storage_gb DECIMAL(5,2) DEFAULT 1,

    -- Display
    target_audience VARCHAR(255),
    features JSONB NOT NULL DEFAULT '[]',
    cta_text VARCHAR(100) DEFAULT 'Get Started',
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT TRUE,

    -- Trial
    trial_days INTEGER DEFAULT 14,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. PLAN MODULES
-- Maps which platform modules are included in each plan
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    module_slug VARCHAR(100) NOT NULL,
    access_level VARCHAR(50) DEFAULT 'full' CHECK (access_level IN ('basic', 'standard', 'full', 'unlimited')),
    usage_limit INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plan_id, module_slug)
);

COMMENT ON TABLE plan_modules IS 'Module slugs: valuation, property_management, crm, data_intelligence, project_management, compliance, reporting, api_access, e_signature, analytics';

-- ============================================================
-- 3. SUBSCRIPTIONS
-- Active subscriptions (org-level for B2B, user-level for B2C)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Subscriber (org for B2B, user for B2C — at least one required)
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Plan
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),

    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'trialing' CHECK (status IN (
        'trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended', 'incomplete'
    )),

    -- Billing
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'annual')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMPTZ NOT NULL,
    trial_ends_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,

    -- Payment
    payment_provider VARCHAR(50) CHECK (payment_provider IN ('paystack', 'bank_transfer', 'manual', 'stripe')),
    payment_provider_subscription_id VARCHAR(255),
    payment_provider_customer_id VARCHAR(255),

    -- Seats
    quantity INTEGER DEFAULT 1,

    -- Keycloak sync
    keycloak_group_id VARCHAR(255),

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Must have org OR user
    CHECK (organization_id IS NOT NULL OR user_id IS NOT NULL)
);

-- ============================================================
-- 4. SUBSCRIPTION ADD-ONS
-- À la carte modules added to a base subscription
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    quantity INTEGER DEFAULT 1,
    price_override DECIMAL(10,2),
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMPTZ,
    UNIQUE(subscription_id, plan_id)
);

-- ============================================================
-- 5. SUBSCRIPTION USAGE
-- Track consumption against plan limits
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    used BIGINT DEFAULT 0,
    limit_value BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subscription_id, metric, period_start)
);

COMMENT ON COLUMN subscription_usage.metric IS 'Metrics: api_calls, properties, users, valuations, reports, projects, storage_mb';

-- ============================================================
-- 6. INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Invoice info
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded', 'void'
    )),

    -- Amounts
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(12,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'GHS',

    -- Period
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,

    -- Payment
    due_date TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    payment_provider_invoice_id VARCHAR(255),

    -- Details
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. INVOICE LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(500) NOT NULL,
    plan_id UUID REFERENCES subscription_plans(id),
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. SUBSCRIPTION EVENTS (Audit Trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    from_plan_id UUID REFERENCES subscription_plans(id),
    to_plan_id UUID REFERENCES subscription_plans(id),
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    actor_id UUID REFERENCES users(id),
    actor_type VARCHAR(20) DEFAULT 'user',
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN subscription_events.event_type IS 'Types: created, activated, upgraded, downgraded, renewed, cancelled, expired, payment_failed, payment_succeeded, trial_started, trial_ended, reactivated';

-- ============================================================
-- 9. EXTEND ORGANIZATIONS TABLE
-- ============================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) DEFAULT 'none';

-- ============================================================
-- 10. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sub_plans_category ON subscription_plans(category);
CREATE INDEX IF NOT EXISTS idx_sub_plans_tier ON subscription_plans(tier);
CREATE INDEX IF NOT EXISTS idx_sub_plans_segment ON subscription_plans(segment);
CREATE INDEX IF NOT EXISTS idx_sub_plans_active_public ON subscription_plans(is_active, is_public);
CREATE INDEX IF NOT EXISTS idx_sub_plans_slug ON subscription_plans(slug);

CREATE INDEX IF NOT EXISTS idx_plan_modules_plan ON plan_modules(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_modules_slug ON plan_modules(module_slug);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period ON subscriptions(current_period_end);

CREATE INDEX IF NOT EXISTS idx_sub_addons_sub ON subscription_addons(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_usage_sub_metric ON subscription_usage(subscription_id, metric);
CREATE INDEX IF NOT EXISTS idx_sub_usage_period ON subscription_usage(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_invoices_sub ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_sub_events_sub ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sub_events_created ON subscription_events(created_at);

-- ============================================================
-- 11. AUTHORIZATION POLICIES
-- ============================================================
INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, description)
VALUES
    ('subscription_plans_read', 'subscription_plans', 'read',
     ARRAY['super_admin','admin','firm_principal']::user_role_enum[],
     'View subscription plan catalog (admin)'),
    ('subscription_plans_manage', 'subscription_plans', 'manage',
     ARRAY['super_admin']::user_role_enum[],
     'Create/update/deactivate subscription plans'),
    ('subscription_read', 'subscription', 'read',
     ARRAY['super_admin','admin','firm_principal','finance_manager']::user_role_enum[],
     'View organization subscription details'),
    ('subscription_manage', 'subscription', 'manage',
     ARRAY['super_admin','admin','firm_principal']::user_role_enum[],
     'Create/update/cancel subscriptions'),
    ('invoice_read', 'invoice', 'read',
     ARRAY['super_admin','admin','firm_principal','finance_manager']::user_role_enum[],
     'View invoices and billing history'),
    ('invoice_manage', 'invoice', 'manage',
     ARRAY['super_admin','finance_manager']::user_role_enum[],
     'Manage invoices, mark paid, issue refunds'),
    ('subscription_usage_read', 'subscription_usage', 'read',
     ARRAY['super_admin','admin','firm_principal','finance_manager','manager']::user_role_enum[],
     'View subscription usage metrics')
ON CONFLICT (policy_name) DO UPDATE SET
    resource_type = EXCLUDED.resource_type,
    action = EXCLUDED.action,
    allowed_roles = EXCLUDED.allowed_roles,
    description = EXCLUDED.description;

-- ============================================================
-- 12. UPDATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_subscription_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscription_plans_updated ON subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_subscription_plans_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_subscription_plans_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_subscription_plans_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_usage_updated ON subscription_usage;
CREATE TRIGGER trg_subscription_usage_updated
    BEFORE UPDATE ON subscription_usage
    FOR EACH ROW EXECUTE FUNCTION update_subscription_plans_updated_at();
