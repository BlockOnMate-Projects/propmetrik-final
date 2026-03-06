-- Migration: 084_integration_tables.sql
-- Phase 4 Sprint 8: External Integration Tables
-- Mobile money payments, bank transfers, compliance checks

-- ==============================================
-- MOBILE MONEY PAYMENTS TABLE
-- ==============================================

CREATE TYPE mobile_money_provider AS ENUM (
    'mtn_momo',
    'vodafone_cash',
    'airteltigo_money'
);

CREATE TYPE mobile_money_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'refunded'
);

CREATE TABLE mobile_money_payments (
    id VARCHAR(50) PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    project_id UUID REFERENCES development_projects(id),
    invoice_id UUID REFERENCES project_invoices(id),
    
    -- Provider details
    provider mobile_money_provider NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    
    -- Amount
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
    
    -- References
    reference VARCHAR(100) NOT NULL,
    external_reference VARCHAR(100),
    description TEXT,
    
    -- Status
    status mobile_money_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    initiated_by UUID REFERENCES users(id),
    
    CONSTRAINT mobile_money_unique_ref UNIQUE (reference)
);

CREATE INDEX idx_mobile_money_org ON mobile_money_payments(organization_id);
CREATE INDEX idx_mobile_money_project ON mobile_money_payments(project_id);
CREATE INDEX idx_mobile_money_invoice ON mobile_money_payments(invoice_id);
CREATE INDEX idx_mobile_money_status ON mobile_money_payments(status);
CREATE INDEX idx_mobile_money_phone ON mobile_money_payments(phone_number);
CREATE INDEX idx_mobile_money_external ON mobile_money_payments(external_reference);

-- ==============================================
-- BANK TRANSFERS TABLE
-- ==============================================

CREATE TYPE bank_transfer_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'reversed'
);

CREATE TABLE bank_transfers (
    id VARCHAR(50) PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    project_id UUID REFERENCES development_projects(id),
    invoice_id UUID REFERENCES project_invoices(id),
    vendor_id UUID REFERENCES vendors(id),
    
    -- Bank details
    bank_code VARCHAR(10) NOT NULL,
    bank_name VARCHAR(100),
    account_number VARCHAR(20) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    swift_code VARCHAR(11),
    
    -- Amount
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
    fee DECIMAL(10, 2) DEFAULT 0,
    
    -- References
    reference VARCHAR(100) NOT NULL,
    external_reference VARCHAR(100),
    narration TEXT,
    
    -- Status
    status bank_transfer_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    initiated_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT bank_transfer_unique_ref UNIQUE (reference)
);

CREATE INDEX idx_bank_transfer_org ON bank_transfers(organization_id);
CREATE INDEX idx_bank_transfer_project ON bank_transfers(project_id);
CREATE INDEX idx_bank_transfer_vendor ON bank_transfers(vendor_id);
CREATE INDEX idx_bank_transfer_status ON bank_transfers(status);
CREATE INDEX idx_bank_transfer_external ON bank_transfers(external_reference);

-- ==============================================
-- GHANA BANKS REFERENCE TABLE
-- ==============================================

CREATE TABLE ghana_banks (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    swift_code VARCHAR(11),
    sort_code VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    logo_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Ghana banks
INSERT INTO ghana_banks (code, name, swift_code, is_active) VALUES
    ('GCB', 'GCB Bank Limited', 'GHCBGHAC', true),
    ('EBG', 'Ecobank Ghana Limited', 'EABORUGH', true),
    ('ABG', 'Absa Bank Ghana Limited', 'BABORUGH', true),
    ('SCB', 'Standard Chartered Bank Ghana', 'SCBLGHAC', true),
    ('SBG', 'Stanbic Bank Ghana Limited', 'SBICGHAC', true),
    ('FBN', 'FBN Bank Ghana Limited', 'FABORUGH', true),
    ('CBG', 'Consolidated Bank Ghana', 'CBGHGHAC', true),
    ('ZBG', 'Zenith Bank Ghana', 'ZEBLGHAC', true),
    ('UBA', 'United Bank for Africa Ghana', 'UNAFGHAC', true),
    ('ADB', 'Agricultural Development Bank', 'AABORUGH', true),
    ('CAL', 'CAL Bank Limited', 'CAABORUGH', true),
    ('FBL', 'Fidelity Bank Ghana', 'FABORUGH', true),
    ('GTB', 'Guaranty Trust Bank Ghana', 'GTBIGHAC', true),
    ('PBL', 'Prudential Bank Limited', 'PRUDGHAC', true),
    ('RBG', 'Republic Bank Ghana', 'HABORUGH', true),
    ('NIB', 'National Investment Bank', 'NIBORGHAC', true),
    ('SBL', 'Societe Generale Ghana', 'SGGHGHAC', true),
    ('UMB', 'Universal Merchant Bank', 'UMBORGHAC', true),
    ('ARB', 'ARB Apex Bank', NULL, true);

-- ==============================================
-- VENDOR COMPLIANCE CHECKS
-- ==============================================

CREATE TYPE compliance_status AS ENUM (
    'compliant',
    'non_compliant',
    'pending',
    'partial'
);

CREATE TABLE vendor_compliance_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    
    -- TIN Verification
    tin_result JSONB,
    
    -- SSNIT Verification
    ssnit_result JSONB,
    
    -- Overall assessment
    overall_status compliance_status NOT NULL,
    issues TEXT[],
    
    -- Timestamps
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    checked_by UUID REFERENCES users(id),
    
    -- Next check due
    next_check_due TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_compliance_vendor ON vendor_compliance_checks(vendor_id);
CREATE INDEX idx_compliance_status ON vendor_compliance_checks(overall_status);
CREATE INDEX idx_compliance_checked ON vendor_compliance_checks(checked_at DESC);

-- ==============================================
-- PAYMENT WEBHOOKS LOG
-- ==============================================

CREATE TABLE payment_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    
    -- Payload
    payload JSONB NOT NULL,
    headers JSONB,
    
    -- Processing
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_result JSONB,
    
    -- Error handling
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Timestamps
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_provider ON payment_webhooks(provider);
CREATE INDEX idx_webhook_event ON payment_webhooks(event_type);
CREATE INDEX idx_webhook_processed ON payment_webhooks(processed);
CREATE INDEX idx_webhook_received ON payment_webhooks(received_at DESC);

-- ==============================================
-- INTEGRATION API KEYS (for external systems)
-- ==============================================

CREATE TABLE integration_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Key details
    key_name VARCHAR(100) NOT NULL,
    api_key_hash VARCHAR(64) NOT NULL,
    api_key_prefix VARCHAR(10) NOT NULL, -- First 10 chars for identification
    
    -- Permissions
    scopes TEXT[] NOT NULL DEFAULT '{}',
    
    -- Rate limiting
    rate_limit_per_minute INT DEFAULT 60,
    rate_limit_per_day INT DEFAULT 10000,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INT DEFAULT 0,
    
    -- Expiry
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    
    CONSTRAINT api_key_unique_per_org UNIQUE (organization_id, key_name)
);

CREATE INDEX idx_api_key_org ON integration_api_keys(organization_id);
CREATE INDEX idx_api_key_prefix ON integration_api_keys(api_key_prefix);
CREATE INDEX idx_api_key_active ON integration_api_keys(is_active) WHERE is_active = true;

-- ==============================================
-- ADD PAYMENT FIELDS TO EXISTING TABLES
-- ==============================================

-- Add mobile money fields to vendors table
ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS mobile_money_primary mobile_money_provider,
    ADD COLUMN IF NOT EXISTS mobile_money_number_primary VARCHAR(20);

-- Add payment tracking to invoices
ALTER TABLE project_invoices
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50),
    ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payment_fee DECIMAL(10, 2) DEFAULT 0;

-- ==============================================
-- PAYMENT RECONCILIATION
-- ==============================================

CREATE TABLE payment_reconciliation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    
    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Totals
    expected_collections DECIMAL(15, 2) DEFAULT 0,
    actual_collections DECIMAL(15, 2) DEFAULT 0,
    expected_disbursements DECIMAL(15, 2) DEFAULT 0,
    actual_disbursements DECIMAL(15, 2) DEFAULT 0,
    
    -- Fees
    total_fees DECIMAL(10, 2) DEFAULT 0,
    
    -- Breakdown by method
    by_payment_method JSONB,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    reconciled_at TIMESTAMP WITH TIME ZONE,
    reconciled_by UUID REFERENCES users(id),
    
    -- Discrepancies
    discrepancies JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT reconciliation_period UNIQUE (organization_id, period_start, period_end)
);

CREATE INDEX idx_reconciliation_org ON payment_reconciliation(organization_id);
CREATE INDEX idx_reconciliation_period ON payment_reconciliation(period_start, period_end);

-- ==============================================
-- COMMENTS
-- ==============================================

COMMENT ON TABLE mobile_money_payments IS 'Track all mobile money transactions (MTN MoMo, Vodafone Cash, AirtelTigo)';
COMMENT ON TABLE bank_transfers IS 'Track all bank transfer disbursements';
COMMENT ON TABLE ghana_banks IS 'Reference table for Ghana banks with SWIFT codes';
COMMENT ON TABLE vendor_compliance_checks IS 'Track vendor TIN and SSNIT verification results';
COMMENT ON TABLE payment_webhooks IS 'Log all payment provider webhook callbacks';
COMMENT ON TABLE integration_api_keys IS 'API keys for external system integrations';
COMMENT ON TABLE payment_reconciliation IS 'Monthly/weekly payment reconciliation records';
