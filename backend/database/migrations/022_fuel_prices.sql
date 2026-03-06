-- =====================================================
-- Migration: 022_fuel_prices.sql
-- Purpose: Store fuel prices from NPA for transport cost calculations
-- Author: PropMetrik Data Hub
-- Date: 2025-01-XX
-- =====================================================

-- =====================================================
-- FUEL PRICES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS fuel_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fuel_type VARCHAR(20) NOT NULL CHECK (fuel_type IN ('diesel', 'petrol', 'lpg')),
    price_ghs DECIMAL(10,2) NOT NULL CHECK (price_ghs > 0),
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source VARCHAR(100) NOT NULL DEFAULT 'npa.gov.gh',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate entries for same fuel type on same date
    UNIQUE(fuel_type, effective_date)
);

-- Index for quick lookups by fuel type and date
CREATE INDEX IF NOT EXISTS idx_fuel_prices_type_date 
ON fuel_prices(fuel_type, effective_date DESC);

-- =====================================================
-- SEED INITIAL FUEL PRICES (Current Ghana prices as of Dec 2024)
-- These will be updated by the NPA scraper
-- =====================================================

INSERT INTO fuel_prices (fuel_type, price_ghs, effective_date, source)
VALUES 
    ('diesel', 15.50, CURRENT_DATE, 'npa.gov.gh (initial seed)'),
    ('petrol', 15.20, CURRENT_DATE, 'npa.gov.gh (initial seed)'),
    ('lpg', 14.00, CURRENT_DATE, 'npa.gov.gh (initial seed)')
ON CONFLICT (fuel_type, effective_date) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE fuel_prices IS 'Stores historical fuel prices from NPA for transport cost calculations in construction';
COMMENT ON COLUMN fuel_prices.fuel_type IS 'Type of fuel: diesel (for trucks/heavy equipment), petrol, or lpg';
COMMENT ON COLUMN fuel_prices.price_ghs IS 'Price per liter in Ghana Cedis';
COMMENT ON COLUMN fuel_prices.effective_date IS 'Date when this price became effective';
COMMENT ON COLUMN fuel_prices.source IS 'Data source (typically npa.gov.gh)';
