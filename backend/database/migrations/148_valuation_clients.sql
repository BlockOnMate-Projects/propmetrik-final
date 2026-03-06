-- Migration: 148_valuation_clients
-- Description: Client management registry for reuse in valuations and invoices
-- Created: 2026-02-17

-- =====================================================
-- CLIENT REGISTRY
-- =====================================================

DO $$ BEGIN
    CREATE TYPE client_type_enum AS ENUM (
        'individual',
        'corporate',
        'government'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS valuation_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    type client_type_enum NOT NULL DEFAULT 'individual',
    
    -- Contact
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    
    -- Business details
    company_name VARCHAR(255),
    tin_number VARCHAR(50),
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    
    -- Ensure uniqueness of email per org (optional, but good for data integrity)
    -- UNIQUE(organization_id, email) -- Commented out to allow duplicates if needed, but recommended
    
    -- Search improvements
    CONSTRAINT chk_client_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_val_clients_org ON valuation_clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_val_clients_name ON valuation_clients(name);
CREATE INDEX IF NOT EXISTS idx_val_clients_email ON valuation_clients(email);

-- =====================================================
-- LINK INVOICES TO CLIENTS
-- =====================================================

ALTER TABLE valuation_invoices
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES valuation_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_val_invoices_client_id ON valuation_invoices(client_id);
