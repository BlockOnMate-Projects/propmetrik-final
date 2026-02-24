-- Migration 151: Integrate valuation into centralized fee system
-- Adds 'valuation' to payment_type_enum and seeds fee_configurations at 2.5%
-- Also adds platform_fee tracking column to valuation_invoices

BEGIN;

-- 1. Add 'valuation' to payment_type_enum (centralized enum from migration 133)
DO $$ BEGIN
    ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'valuation';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Enum values require a separate transaction before use
BEGIN;

-- 2. Seed valuation fee configuration into centralized fee_configurations table
-- 2.5% platform fee for valuation services, matching on-chain config (250 basis points)
INSERT INTO fee_configurations (payment_type, fee_mode, percentage_rate, flat_amount, currency)
VALUES ('valuation', 'percentage', 0.0250, 0.00, 'GHS')
ON CONFLICT DO NOTHING;

-- 3. Add platform_fee column to valuation_invoices for tracking
ALTER TABLE valuation_invoices
    ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(12,2) DEFAULT 0;

-- 4. Index for invoices with platform fees
CREATE INDEX IF NOT EXISTS idx_valuation_invoices_platform_fee
    ON valuation_invoices (organization_id, status)
    WHERE platform_fee > 0;

-- 5. Remove standalone platform_fee_rate from valuation_fee_schedules 
--    (now managed centrally via fee_configurations table)
ALTER TABLE valuation_fee_schedules
    DROP COLUMN IF EXISTS platform_fee_rate;

COMMENT ON COLUMN valuation_invoices.platform_fee IS 'PROPMETRIK platform fee — rate sourced from centralized fee_configurations table';

COMMIT;
