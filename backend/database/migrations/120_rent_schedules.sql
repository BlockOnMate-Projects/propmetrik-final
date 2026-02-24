-- Migration: 120_rent_schedules
-- Description: Rent schedule table for auto-generated rent periods from tenancies
-- Created: 2026-01-27
-- Phase: 4.x Production Readiness

-- =====================================================
-- RENT SCHEDULE STATUS ENUM
-- =====================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rent_schedule_status_enum') THEN
        CREATE TYPE rent_schedule_status_enum AS ENUM (
          'upcoming',
          'due',
          'partially_paid',
          'paid',
          'overdue',
          'waived'
        );
    END IF;
END $$;

-- =====================================================
-- RENT SCHEDULES TABLE
-- Auto-generated rent periods from tenancy agreements
-- =====================================================
CREATE TABLE IF NOT EXISTS rent_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relations
  tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Period details
  period_number INTEGER NOT NULL, -- 1, 2, 3... for the tenancy
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  due_date DATE NOT NULL,
  
  -- Expected amounts
  expected_amount NUMERIC(12,2) NOT NULL,
  currency currency_enum DEFAULT 'GHS',
  
  -- Payment tracking
  amount_paid NUMERIC(12,2) DEFAULT 0,
  amount_outstanding NUMERIC(12,2) GENERATED ALWAYS AS (expected_amount - amount_paid) STORED,
  
  -- Late fees
  late_fee_applied NUMERIC(10,2) DEFAULT 0,
  late_fee_waived BOOLEAN DEFAULT FALSE,
  
  -- Status
  status rent_schedule_status_enum DEFAULT 'upcoming',
  days_overdue INTEGER DEFAULT 0,
  
  -- Linked payments (many payments can apply to one schedule)
  -- payment_ids tracked via rent_schedule_payments junction table
  
  -- Notes
  notes TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- RENT SCHEDULE PAYMENTS JUNCTION TABLE
-- Links rent_payments to rent_schedules (many-to-many)
-- =====================================================
CREATE TABLE IF NOT EXISTS rent_schedule_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rent_schedule_id UUID NOT NULL REFERENCES rent_schedules(id) ON DELETE CASCADE,
  rent_payment_id UUID NOT NULL REFERENCES rent_payments(id) ON DELETE CASCADE,
  amount_applied NUMERIC(12,2) NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(rent_schedule_id, rent_payment_id)
);

-- =====================================================
-- PROPERTY MANAGER PAYMENT ACCOUNTS
-- Paystack sub-accounts for property managers
-- =====================================================
CREATE TABLE IF NOT EXISTS pm_payment_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Paystack sub-account details
  paystack_subaccount_code VARCHAR(100) UNIQUE,
  paystack_account_number VARCHAR(50),
  paystack_bank_code VARCHAR(20),
  paystack_bank_name VARCHAR(100),
  paystack_account_name VARCHAR(255),
  paystack_percentage_charge NUMERIC(5,2) DEFAULT 100.00, -- 100% goes to PM by default
  
  -- Platform fees (PropMetrik's cut)
  platform_fee_percentage NUMERIC(5,2) DEFAULT 2.00, -- 2% platform fee
  platform_fee_flat NUMERIC(10,2) DEFAULT 0, -- Optional flat fee
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(organization_id)
);

-- =====================================================
-- TENANT SESSIONS TABLE
-- For tenant portal authentication (magic link / OTP)
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Session token
  session_token VARCHAR(255) NOT NULL UNIQUE,
  
  -- Authentication method used
  auth_method VARCHAR(50) NOT NULL, -- 'magic_link', 'otp_sms', 'otp_email'
  
  -- Device/browser info
  user_agent TEXT,
  ip_address INET,
  
  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TENANT AUTH TOKENS TABLE
-- For magic links and OTP codes
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_auth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- For new tenant registration (by phone/email)
  phone VARCHAR(20),
  email VARCHAR(255),
  
  -- Token details
  token_type VARCHAR(50) NOT NULL, -- 'magic_link', 'otp'
  token_hash VARCHAR(255) NOT NULL, -- Hashed token/code
  
  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Usage tracking
  used_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_rent_schedules_tenancy ON rent_schedules(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_organization ON rent_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_status ON rent_schedules(status);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_due_date ON rent_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_period ON rent_schedules(period_start_date, period_end_date);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_overdue ON rent_schedules(status) WHERE status = 'overdue';

CREATE INDEX IF NOT EXISTS idx_rent_schedule_payments_schedule ON rent_schedule_payments(rent_schedule_id);
CREATE INDEX IF NOT EXISTS idx_rent_schedule_payments_payment ON rent_schedule_payments(rent_payment_id);

CREATE INDEX IF NOT EXISTS idx_pm_payment_accounts_org ON pm_payment_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_payment_accounts_subaccount ON pm_payment_accounts(paystack_subaccount_code);

CREATE INDEX IF NOT EXISTS idx_tenant_sessions_tenant ON tenant_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_token ON tenant_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_active ON tenant_sessions(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_tenant_auth_tokens_tenant ON tenant_auth_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_auth_tokens_phone ON tenant_auth_tokens(phone);
CREATE INDEX IF NOT EXISTS idx_tenant_auth_tokens_email ON tenant_auth_tokens(email);

-- =====================================================
-- TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS update_rent_schedules_updated_at ON rent_schedules;
CREATE TRIGGER update_rent_schedules_updated_at
  BEFORE UPDATE ON rent_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pm_payment_accounts_updated_at ON pm_payment_accounts;
CREATE TRIGGER update_pm_payment_accounts_updated_at
  BEFORE UPDATE ON pm_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE rent_schedules IS 'Auto-generated rent periods from tenancy agreements with payment tracking';
COMMENT ON TABLE rent_schedule_payments IS 'Junction table linking rent payments to scheduled periods';
COMMENT ON TABLE pm_payment_accounts IS 'Paystack sub-accounts for property managers to receive rent directly';
COMMENT ON TABLE tenant_sessions IS 'Tenant portal authentication sessions';
COMMENT ON TABLE tenant_auth_tokens IS 'Magic link and OTP tokens for tenant authentication';
