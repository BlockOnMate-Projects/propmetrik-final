-- =====================================================
-- Migration 132: Utility Charges / Tenant Billing
-- =====================================================
-- Enables landlords to submit utility bills against tenancies
-- and auto-apply charges to rent schedules.
-- =====================================================

-- Status enum for utility charges
DO $$ BEGIN
    CREATE TYPE utility_charge_status_enum AS ENUM (
        'pending',      -- Submitted by landlord, not yet applied to schedule
        'applied',      -- Applied to a rent schedule period
        'paid',         -- Tenant has paid (via rent schedule)
        'waived',       -- Landlord waived the charge
        'disputed'      -- Tenant disputed the charge
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Utility type enum (matches lease generation utility IDs)
DO $$ BEGIN
    CREATE TYPE utility_type_enum AS ENUM (
        'electricity',
        'water',
        'gas',
        'internet',
        'waste',
        'security',
        'sewage',
        'maintenance',
        'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- UTILITY CHARGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS utility_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relations
    tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Charge details
    utility_type utility_type_enum NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency currency_enum DEFAULT 'GHS',
    description TEXT,

    -- Evidence (optional uploaded document)
    evidence_document_id UUID REFERENCES property_management_documents(id) ON DELETE SET NULL,

    -- Application to rent schedule
    status utility_charge_status_enum DEFAULT 'pending',
    applied_to_schedule_id UUID REFERENCES rent_schedules(id) ON DELETE SET NULL,
    applied_at TIMESTAMPTZ,

    -- Dispute tracking
    dispute_reason TEXT,
    dispute_resolved_at TIMESTAMPTZ,
    dispute_resolution TEXT,

    -- Audit
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utility_charges_tenancy ON utility_charges(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_utility_charges_org ON utility_charges(organization_id);
CREATE INDEX IF NOT EXISTS idx_utility_charges_status ON utility_charges(status);
CREATE INDEX IF NOT EXISTS idx_utility_charges_schedule ON utility_charges(applied_to_schedule_id) WHERE applied_to_schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_utility_charges_billing_period ON utility_charges(billing_period_start, billing_period_end);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_utility_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_utility_charges_updated_at ON utility_charges;
CREATE TRIGGER trg_utility_charges_updated_at
    BEFORE UPDATE ON utility_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_utility_charges_updated_at();

-- Add utility_charges_total column to rent_schedules for tracking
-- This is separate from expected_amount which is base rent
ALTER TABLE rent_schedules ADD COLUMN IF NOT EXISTS utility_charges_total NUMERIC(12,2) DEFAULT 0;

-- Update the generated column to include utility charges in outstanding calculation
-- Note: expected_amount stays as base rent, but we track total with utilities
COMMENT ON COLUMN rent_schedules.utility_charges_total IS 'Sum of applied utility charges for this period';
