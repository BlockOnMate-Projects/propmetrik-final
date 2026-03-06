-- ============================================================================
-- Migration 133: Multi-Sided Payment System v2
-- 
-- Upgrades the payment system to support:
-- 1. Unified payment accounts (landlords, deal managers, project managers)
-- 2. Transaction ledger with complete fee tracking
-- 3. Configurable fee rules per payment type
-- 4. Audit trail for all payment routing decisions
--
-- Created: 2026-02-12
-- ============================================================================

-- ============================================================================
-- 1. PAYMENT ACCOUNTS (Generalized from pm_payment_accounts)
--    Supports landlord orgs, deal managers, project managers
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE payment_entity_type AS ENUM (
        'organization',      -- Property management org (landlord)
        'deal_manager',      -- CRM deal manager (user)
        'project_manager'    -- Construction project manager (user)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE settlement_type AS ENUM (
        'bank',
        'mobile_money'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Polymorphic owner
    entity_type payment_entity_type NOT NULL,
    entity_id UUID NOT NULL,                 -- org id, user id, etc.

    -- Paystack subaccount
    paystack_subaccount_code VARCHAR(100) UNIQUE,
    account_number VARCHAR(50),
    bank_code VARCHAR(20),
    bank_name VARCHAR(100),
    account_name VARCHAR(255),
    settlement_method settlement_type DEFAULT 'bank',

    -- Mobile money fields (Ghana)
    momo_provider VARCHAR(20),               -- 'mtn' | 'vodafone' | 'airteltigo'
    momo_number VARCHAR(20),

    -- Fee configuration (per-entity override, nullable = use global default)
    platform_fee_percentage NUMERIC(5,4),    -- e.g. 0.0100 for 1%
    platform_fee_flat NUMERIC(10,2),         -- e.g. 25.00 GHS

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verification_method VARCHAR(50),         -- 'bank_resolve' | 'manual'

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,

    UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_entity
    ON payment_accounts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_subaccount
    ON payment_accounts(paystack_subaccount_code);

-- ============================================================================
-- 2. FEE CONFIGURATIONS (Admin-managed, per payment type)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE fee_mode AS ENUM (
        'percentage',     -- Flat percentage of principal
        'flat',           -- Fixed amount regardless of principal
        'max_of'          -- max(percentage, flat) — e.g. max(1%, GH₵25)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_type_enum AS ENUM (
        'rent',
        'deal',
        'project',
        'subscription'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fee_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_type payment_type_enum NOT NULL,

    -- Scope (null = global default)
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Fee rules
    fee_mode fee_mode NOT NULL DEFAULT 'max_of',
    percentage_rate NUMERIC(7,4) NOT NULL DEFAULT 0.0100,    -- 1% = 0.0100
    flat_amount NUMERIC(10,2) NOT NULL DEFAULT 25.00,        -- GH₵25
    currency VARCHAR(3) DEFAULT 'GHS',

    -- Caps
    min_fee NUMERIC(10,2),
    max_fee NUMERIC(10,2),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_until DATE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID,

    -- Only one active config per (payment_type, organization_id) combination
    UNIQUE NULLS NOT DISTINCT (payment_type, organization_id, is_active)
);

CREATE INDEX IF NOT EXISTS idx_fee_configurations_type
    ON fee_configurations(payment_type, is_active);

-- ============================================================================
-- 3. PAYMENT TRANSACTIONS LEDGER (Universal across all payment types)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE payment_transaction_status AS ENUM (
        'pending',
        'success',
        'failed',
        'refunded',
        'abandoned'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    reference VARCHAR(100) UNIQUE NOT NULL,
    paystack_reference VARCHAR(100),

    -- Classification
    payment_type payment_type_enum NOT NULL,

    -- Parties
    payer_type VARCHAR(30),                  -- 'tenant' | 'buyer' | 'client' | 'subscriber'
    payer_id UUID,
    payer_email VARCHAR(255),
    recipient_type VARCHAR(30),              -- 'organization' | 'deal_manager' | 'project_manager' | 'platform'
    recipient_id UUID,
    subaccount_code VARCHAR(100),

    -- Amounts (all in base currency subunits — pesewas)
    gross_amount INTEGER NOT NULL,           -- Total charged to payer (principal + service fee)
    principal_amount INTEGER NOT NULL,       -- Amount intended for recipient
    service_fee INTEGER NOT NULL DEFAULT 0,  -- PropMetrik's fee (pesewas)
    paystack_fee INTEGER,                    -- Paystack processing fee (from verification)
    net_settlement INTEGER,                  -- What recipient actually receives
    currency VARCHAR(3) DEFAULT 'GHS',

    -- Fee calculation details
    fee_mode VARCHAR(20),                    -- Which rule was applied
    fee_percentage_applied NUMERIC(7,4),
    fee_flat_applied NUMERIC(10,2),

    -- Status
    status payment_transaction_status DEFAULT 'pending',
    paystack_status VARCHAR(30),
    channel VARCHAR(30),                     -- 'card' | 'mobile_money'
    provider VARCHAR(30),                    -- 'mtn' | 'vodafone' | bank name

    -- Domain link (polymorphic reference to domain-specific record)
    domain_record_type VARCHAR(30),          -- 'rent_payment' | 'deal_payment' | 'project_payment'
    domain_record_id UUID,

    -- Metadata
    metadata JSONB,

    -- Settlement tracking
    settled_at TIMESTAMPTZ,
    settlement_reference VARCHAR(100),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    webhook_received_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference
    ON payment_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_paystack_ref
    ON payment_transactions(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_type
    ON payment_transactions(payment_type, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payer
    ON payment_transactions(payer_type, payer_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_recipient
    ON payment_transactions(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created
    ON payment_transactions(created_at DESC);

-- ============================================================================
-- 4. PAYMENT ACCOUNT AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_account_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_account_id UUID REFERENCES payment_accounts(id) ON DELETE CASCADE,
    action VARCHAR(30) NOT NULL,             -- 'created' | 'updated' | 'deactivated'
    changed_by UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_account_audit_account
    ON payment_account_audit_log(payment_account_id, created_at DESC);

-- ============================================================================
-- 5. SEED DEFAULT FEE CONFIGURATIONS
-- ============================================================================

-- Rent: max(1%, GH₵25)
INSERT INTO fee_configurations (payment_type, fee_mode, percentage_rate, flat_amount, currency)
VALUES ('rent', 'max_of', 0.0100, 25.00, 'GHS')
ON CONFLICT DO NOTHING;

-- Deal management: 0.25%
INSERT INTO fee_configurations (payment_type, fee_mode, percentage_rate, flat_amount, currency)
VALUES ('deal', 'percentage', 0.0025, 0.00, 'GHS')
ON CONFLICT DO NOTHING;

-- Project management: 0.25%
INSERT INTO fee_configurations (payment_type, fee_mode, percentage_rate, flat_amount, currency)
VALUES ('project', 'percentage', 0.0025, 0.00, 'GHS')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. MIGRATE EXISTING pm_payment_accounts DATA INTO payment_accounts
-- ============================================================================

INSERT INTO payment_accounts (
    entity_type,
    entity_id,
    paystack_subaccount_code,
    account_number,
    bank_code,
    bank_name,
    account_name,
    settlement_method,
    platform_fee_percentage,
    platform_fee_flat,
    is_active,
    is_verified,
    verified_at,
    created_at,
    updated_at
)
SELECT
    'organization'::payment_entity_type,
    pma.organization_id,
    pma.paystack_subaccount_code,
    pma.paystack_account_number,
    pma.paystack_bank_code,
    pma.paystack_bank_name,
    pma.paystack_account_name,
    'bank'::settlement_type,
    pma.platform_fee_percentage / 100.0,  -- Convert from 2.0 → 0.0200
    pma.platform_fee_flat,
    pma.is_active,
    pma.verified_at IS NOT NULL,
    pma.verified_at,
    pma.created_at,
    pma.updated_at
FROM pm_payment_accounts pma
WHERE NOT EXISTS (
    SELECT 1 FROM payment_accounts pa
    WHERE pa.entity_type = 'organization'
      AND pa.entity_id = pma.organization_id
)
ON CONFLICT (paystack_subaccount_code) DO NOTHING;

-- ============================================================================
-- 7. UPDATE pm_payment_accounts DEFAULTS
--    Change default fee from 2% to 1% with GH₵25 flat
-- ============================================================================

ALTER TABLE pm_payment_accounts
    ALTER COLUMN platform_fee_percentage SET DEFAULT 1.00;

ALTER TABLE pm_payment_accounts
    ALTER COLUMN platform_fee_flat SET DEFAULT 25.00;
