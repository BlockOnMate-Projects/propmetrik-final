-- ============================================================================
-- Migration 027: Add building_area_sqm to valuation_reconciliations
-- ============================================================================
-- This column is needed to store the gross floor area used in the reconciliation
-- for per-sqm value calculations

ALTER TABLE valuation_reconciliations 
ADD COLUMN IF NOT EXISTS building_area_sqm DECIMAL(12,2);

COMMENT ON COLUMN valuation_reconciliations.building_area_sqm IS 'Gross floor area in square meters for per-sqm calculations';
