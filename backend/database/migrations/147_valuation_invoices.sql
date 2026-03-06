-- Migration: 147_valuation_invoices
-- Description: Valuation invoice system with Ghana fee models + Paystack integration
-- Created: 2026-02-17
--
-- Supports:
-- 1. Percentage-of-value fee model (0.5% GhIS standard)
-- 2. Man-day rate model (MWH 2021 schedule)
-- 3. Professional invoice lifecycle: draft → sent → viewed → paid
-- 4. Paystack payment link tracking
-- 5. Branded receipts  

-- =====================================================
-- FEE MODEL ENUM
-- =====================================================

DO $$ BEGIN
    CREATE TYPE valuation_fee_model AS ENUM (
        'percentage_of_value',   -- 0.5% of assessed property value (GhIS)
        'man_day_rate',          -- Daily/hourly professional rates (MWH 2021)
        'flat_fee',              -- Fixed negotiated fee
        'hybrid'                 -- Combination of fee models
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE invoice_status_enum AS ENUM (
        'draft',       -- Being prepared
        'sent',        -- Sent to client (Paystack link generated)
        'viewed',      -- Client opened the invoice
        'paid',        -- Payment confirmed
        'overdue',     -- Past due date unpaid
        'cancelled',   -- Voided
        'partially_paid'  -- Partial payment received
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- VALUATION FEE SCHEDULE (configurable rates)
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_fee_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Fee model rates
    percentage_rate NUMERIC(5,4) NOT NULL DEFAULT 0.005,  -- 0.5% default

    -- Man-day rates (MWH 2021 schedule, in GHC)
    man_day_rates JSONB NOT NULL DEFAULT '{
        "project_director": 2859.80,
        "senior_consultant": 2757.29,
        "consultant": 2143.46,
        "assistant_consultant": 1733.89,
        "technical_officer": 1426.27,
        "senior_technician": 1222.11,
        "technician": 1018.40,
        "craftsman": 814.70,
        "survey_assistant": 611.00,
        "labourer": 407.29
    }'::jsonb,
    
    -- Minimum/maximum fees
    minimum_fee NUMERIC(12,2) DEFAULT 500.00,       -- GHC 500 minimum
    maximum_fee NUMERIC(12,2) DEFAULT NULL,          -- No max by default
    
    -- Tax configuration (Ghana's standard levies)
    vat_rate NUMERIC(5,4) DEFAULT 0.15,               -- 15% VAT (standard)
    nhil_rate NUMERIC(5,4) DEFAULT 0.025,              -- 2.5% NHIL
    getfund_rate NUMERIC(5,4) DEFAULT 0.025,           -- 2.5% GETFund Levy
    covid_levy_rate NUMERIC(5,4) DEFAULT 0.01,         -- 1% COVID Levy
    
    -- Branding
    company_logo_url TEXT,
    company_name TEXT,
    company_address TEXT,
    company_phone TEXT,
    company_email TEXT,
    tin_number VARCHAR(50),                             -- Tax Identification Number
    ghis_registration VARCHAR(50),                      -- Ghana Institution of Surveyors
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(organization_id)
);

-- =====================================================
-- VALUATION INVOICES
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Invoice identification
    invoice_number VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100),
    
    -- Link to valuation (optional - invoice can be standalone)
    valuation_id UUID REFERENCES valuations(id) ON DELETE SET NULL,
    
    -- Client details
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    client_address TEXT,
    client_company VARCHAR(255),
    client_tin VARCHAR(50),
    
    -- Fee model
    fee_model valuation_fee_model NOT NULL DEFAULT 'percentage_of_value',
    
    -- Property details (for percentage model)
    property_address TEXT,
    property_value NUMERIC(15,2),          -- Assessed property value
    
    -- Line items (JSONB array)
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Each item: { description, quantity, unit, unit_price, amount }
    
    -- Financial summary
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    discount_description TEXT,
    
    -- Tax breakdown (Ghana levies)
    vat_amount NUMERIC(12,2) DEFAULT 0,
    nhil_amount NUMERIC(12,2) DEFAULT 0,
    getfund_amount NUMERIC(12,2) DEFAULT 0,
    covid_levy_amount NUMERIC(12,2) DEFAULT 0,
    total_tax NUMERIC(12,2) DEFAULT 0,
    
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
    
    -- Status tracking
    status invoice_status_enum NOT NULL DEFAULT 'draft',
    
    -- Dates
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    
    -- Payment integration (Paystack)
    paystack_reference VARCHAR(255),
    paystack_access_code VARCHAR(255),
    payment_link TEXT,
    payment_channel VARCHAR(50),          -- card, mobile_money, bank_transfer
    
    -- Payment tracking
    paid_at TIMESTAMPTZ,
    paid_amount NUMERIC(12,2),
    payment_reference VARCHAR(255),
    
    -- PDF storage
    invoice_pdf_url TEXT,
    receipt_pdf_url TEXT,
    
    -- Notes
    notes TEXT,
    terms_and_conditions TEXT DEFAULT 'Payment is due within 14 days of invoice date. Late payments may attract interest at the prevailing Bank of Ghana rate.',
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_val_invoices_org ON valuation_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_val_invoices_status ON valuation_invoices(status);
CREATE INDEX IF NOT EXISTS idx_val_invoices_valuation ON valuation_invoices(valuation_id);
CREATE INDEX IF NOT EXISTS idx_val_invoices_client ON valuation_invoices(client_email);
CREATE INDEX IF NOT EXISTS idx_val_invoices_number ON valuation_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_val_invoices_date ON valuation_invoices(invoice_date DESC);

-- =====================================================
-- VALUATION RECEIPTS
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES valuation_invoices(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    receipt_number VARCHAR(50) NOT NULL,
    
    -- Payment details
    amount_paid NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
    payment_method VARCHAR(50),           -- mobile_money, card, bank_transfer, cash
    payment_reference VARCHAR(255),
    payment_channel VARCHAR(100),         -- MTN MoMo, Vodafone Cash, VISA, etc.
    
    -- Paystack data
    paystack_reference VARCHAR(255),
    paystack_transaction_id VARCHAR(255),
    
    -- Receipt PDF
    receipt_pdf_url TEXT,
    
    -- Audit
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_val_receipts_invoice ON valuation_receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_val_receipts_org ON valuation_receipts(organization_id);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE valuation_fee_schedules IS 'Configurable fee rates per organization. Supports GhIS percentage and MWH man-day models.';
COMMENT ON TABLE valuation_invoices IS 'Full invoice lifecycle with Paystack payment integration and Ghana tax compliance.';
COMMENT ON TABLE valuation_receipts IS 'Payment receipts linked to paid invoices with payment method tracking.';
COMMENT ON TYPE valuation_fee_model IS 'Ghana standard valuation charging methods.';
COMMENT ON TYPE invoice_status_enum IS 'Invoice lifecycle status tracking.';
