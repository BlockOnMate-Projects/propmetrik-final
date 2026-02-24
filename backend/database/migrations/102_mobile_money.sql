-- ============================================================================
-- Migration 102: Mobile Money Transactions
-- 
-- Phase 4.3: Ghana Mobile Money Integration
-- 
-- This migration creates tables for:
-- 1. Mobile money transactions (MTN, Vodafone, AirtelTigo)
-- 2. Provider accounts
-- 3. Transaction fees tracking
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------

-- Mobile money providers
DO $$ BEGIN
    CREATE TYPE momo_provider AS ENUM (
        'mtn',
        'vodafone',
        'airteltigo'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction types
DO $$ BEGIN
    CREATE TYPE momo_transaction_type AS ENUM (
        'disbursement',
        'collection',
        'reversal'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction status
DO $$ BEGIN
    CREATE TYPE momo_transaction_status AS ENUM (
        'pending',
        'processing',
        'successful',
        'failed',
        'reversed',
        'timeout'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. MOBILE MONEY TRANSACTIONS TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pm_mobile_money_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES development_projects(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL,
    
    -- Transaction details
    provider momo_provider NOT NULL,
    transaction_type momo_transaction_type NOT NULL,
    external_transaction_id VARCHAR(100), -- Provider's transaction ID
    
    -- Amount (in Ghana Cedis)
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GHS',
    fee DECIMAL(12, 2),
    
    -- Parties
    sender_phone_number VARCHAR(15) NOT NULL,
    sender_name VARCHAR(255),
    recipient_phone_number VARCHAR(15) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    
    -- Reference
    reference VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50), -- 'petty_cash', 'labor_payment', 'material', etc.
    
    -- Status
    status momo_transaction_status DEFAULT 'pending',
    failure_reason TEXT,
    
    -- Linked entities
    petty_cash_id UUID REFERENCES project_petty_cash_ledger(id) ON DELETE SET NULL,
    expense_log_id UUID,
    invoice_id UUID,
    
    -- Timestamps
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    initiated_by UUID NOT NULL,
    approved_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. PROVIDER ACCOUNTS (For organizations)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pm_mobile_money_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- Provider details
    provider momo_provider NOT NULL,
    account_number VARCHAR(15) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    
    -- API credentials (encrypted)
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    webhook_secret_encrypted TEXT,
    
    -- Configuration
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false,
    daily_limit DECIMAL(12, 2) DEFAULT 50000.00,
    transaction_limit DECIMAL(12, 2) DEFAULT 10000.00,
    
    -- Balance tracking
    last_known_balance DECIMAL(12, 2),
    balance_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_org_provider_account UNIQUE (organization_id, provider, account_number)
);

-- ----------------------------------------------------------------------------
-- 4. TRANSACTION FEES CONFIGURATION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pm_mobile_money_fee_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider momo_provider NOT NULL,
    
    -- Fee brackets
    min_amount DECIMAL(12, 2) NOT NULL,
    max_amount DECIMAL(12, 2) NOT NULL,
    fee_type VARCHAR(20) DEFAULT 'percentage', -- 'percentage', 'flat', 'tiered'
    fee_value DECIMAL(8, 4) NOT NULL, -- Percentage or flat amount
    min_fee DECIMAL(12, 2),
    max_fee DECIMAL(12, 2),
    
    -- Validity
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. INDEXES
-- ----------------------------------------------------------------------------

-- Transactions
CREATE INDEX IF NOT EXISTS idx_momo_tx_project ON pm_mobile_money_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_momo_tx_org ON pm_mobile_money_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_momo_tx_provider ON pm_mobile_money_transactions(provider);
CREATE INDEX IF NOT EXISTS idx_momo_tx_status ON pm_mobile_money_transactions(status);
CREATE INDEX IF NOT EXISTS idx_momo_tx_initiated ON pm_mobile_money_transactions(initiated_at);
CREATE INDEX IF NOT EXISTS idx_momo_tx_reference ON pm_mobile_money_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_momo_tx_external ON pm_mobile_money_transactions(external_transaction_id);
CREATE INDEX IF NOT EXISTS idx_momo_tx_petty_cash ON pm_mobile_money_transactions(petty_cash_id);

-- Accounts
CREATE INDEX IF NOT EXISTS idx_momo_accounts_org ON pm_mobile_money_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_momo_accounts_provider ON pm_mobile_money_accounts(provider);

-- Fee config
CREATE INDEX IF NOT EXISTS idx_momo_fees_provider ON pm_mobile_money_fee_config(provider);
CREATE INDEX IF NOT EXISTS idx_momo_fees_effective ON pm_mobile_money_fee_config(effective_from, effective_to);

-- ----------------------------------------------------------------------------
-- 6. INSERT DEFAULT FEE CONFIGURATION
-- ----------------------------------------------------------------------------

INSERT INTO pm_mobile_money_fee_config (provider, min_amount, max_amount, fee_type, fee_value, min_fee, max_fee, effective_from)
VALUES 
    -- MTN MoMo fees (approximate)
    ('mtn', 0.00, 50.00, 'flat', 0.00, NULL, NULL, '2024-01-01'),
    ('mtn', 50.01, 100.00, 'flat', 1.00, NULL, NULL, '2024-01-01'),
    ('mtn', 100.01, 500.00, 'percentage', 1.00, NULL, 10.00, '2024-01-01'),
    ('mtn', 500.01, 1000000.00, 'percentage', 1.00, NULL, 100.00, '2024-01-01'),
    
    -- Vodafone Cash fees (approximate)
    ('vodafone', 0.00, 50.00, 'flat', 0.00, NULL, NULL, '2024-01-01'),
    ('vodafone', 50.01, 100.00, 'flat', 1.00, NULL, NULL, '2024-01-01'),
    ('vodafone', 100.01, 500.00, 'percentage', 0.80, NULL, 8.00, '2024-01-01'),
    ('vodafone', 500.01, 1000000.00, 'percentage', 0.80, NULL, 80.00, '2024-01-01'),
    
    -- AirtelTigo fees (approximate)
    ('airteltigo', 0.00, 50.00, 'flat', 0.00, NULL, NULL, '2024-01-01'),
    ('airteltigo', 50.01, 100.00, 'flat', 0.80, NULL, NULL, '2024-01-01'),
    ('airteltigo', 100.01, 500.00, 'percentage', 0.75, NULL, 7.50, '2024-01-01'),
    ('airteltigo', 500.01, 1000000.00, 'percentage', 0.75, NULL, 75.00, '2024-01-01')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. COMMENTS
-- ----------------------------------------------------------------------------

COMMENT ON TABLE pm_mobile_money_transactions IS 
    'Mobile money transactions for MTN MoMo, Vodafone Cash, AirtelTigo payments';

COMMENT ON TABLE pm_mobile_money_accounts IS 
    'Organization mobile money accounts with API credentials';

COMMENT ON TABLE pm_mobile_money_fee_config IS 
    'Provider fee configuration by amount brackets';
