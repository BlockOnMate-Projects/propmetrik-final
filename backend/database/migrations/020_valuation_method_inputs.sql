-- Migration: 020_valuation_method_inputs.sql
-- Purpose: Store user inputs for each valuation method
-- Date: 2026-01-10

-- ============================================================================
-- VALUATION METHOD INPUTS TABLE
-- Stores the user's inputs for each valuation method (cost, income, DRC, etc.)
-- These are INPUTS to the calculation, not the calculation results
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_method_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  method_type VARCHAR(50) NOT NULL, -- 'cost_approach', 'income_approach', 'drc_method', 'profits_method', 'residual_method'
  
  -- All inputs stored as JSONB for flexibility
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Calculation results (cached from Python backend)
  calculated_value DECIMAL(15,2),
  calculation_result JSONB,
  calculation_date TIMESTAMP WITH TIME ZONE,
  
  -- Confidence and status
  confidence_score DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'calculated', 'locked'
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One record per method per valuation
  UNIQUE(valuation_id, method_type)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_method_inputs_valuation ON valuation_method_inputs(valuation_id);
CREATE INDEX IF NOT EXISTS idx_method_inputs_type ON valuation_method_inputs(method_type);

-- ============================================================================
-- COST APPROACH INPUT SCHEMA (for reference)
-- ============================================================================
-- {
--   "land_value": 0,
--   "plot_size_sqm": 0,
--   "construction_quality": "standard",
--   "construction_rate_per_sqm": 5000,
--   "gross_floor_area_sqm": 200,
--   "components": [
--     { "id": "...", "name": "Main Building", "area": 150, "ratePerSqm": 5000, "total": 750000 }
--   ],
--   "soft_costs_percent": 10,
--   "siteworks_amount": 0,
--   "entrepreneurial_profit_percent": 15,
--   "physical_depreciation_percent": 0,
--   "functional_obsolescence_percent": 0,
--   "external_obsolescence_percent": 0,
--   "year_built": 2020,
--   "effective_age_years": 0,
--   "remaining_economic_life_years": 60
-- }

-- ============================================================================
-- INCOME APPROACH INPUT SCHEMA (for reference)
-- ============================================================================
-- {
--   "income_streams": [
--     { "id": "...", "name": "Retail Shop", "type": "rental", "monthly_rent": 5000, "units": 1 }
--   ],
--   "gross_potential_income": 60000,
--   "vacancy_rate_percent": 5,
--   "collection_loss_percent": 2,
--   "expenses": {
--     "management": 5,
--     "maintenance": 3,
--     "insurance": 1,
--     "taxes": 2,
--     "utilities": 0,
--     "other": 1
--   },
--   "cap_rate_percent": 8,
--   "dcf": {
--     "projection_years": 10,
--     "discount_rate": 12,
--     "terminal_cap_rate": 9,
--     "rent_growth_rate": 3
--   }
-- }

-- ============================================================================
-- DRC METHOD INPUT SCHEMA (for reference)
-- ============================================================================
-- {
--   "replacement_cost_new": 0,
--   "physical_depreciation_percent": 0,
--   "functional_obsolescence_percent": 0,
--   "external_obsolescence_percent": 0,
--   "land_value": 0,
--   "special_factors": [],
--   "mea_analysis": {
--     "modern_equivalent_description": "",
--     "cost_adjustment_factor": 1.0
--   }
-- }

-- ============================================================================
-- PROFITS METHOD INPUT SCHEMA (for reference)
-- ============================================================================
-- {
--   "gross_receipts": 0,
--   "cost_of_goods_sold_percent": 40,
--   "operating_expenses": {},
--   "working_capital_required": 0,
--   "reasonable_operator_profit_percent": 15,
--   "years_purchase": 10,
--   "cap_rate_percent": 10
-- }

-- ============================================================================
-- RESIDUAL METHOD INPUT SCHEMA (for reference)
-- ============================================================================
-- {
--   "gross_development_value": 0,
--   "development_costs": {
--     "construction": 0,
--     "professional_fees_percent": 10,
--     "finance_cost_percent": 12,
--     "marketing_percent": 3,
--     "contingency_percent": 5
--   },
--   "developer_profit_percent": 20,
--   "development_period_months": 24,
--   "planning_status": "approved"
-- }

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_method_inputs TO propmetrik_app;
