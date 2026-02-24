-- =====================================================
-- Migration 019: Add workflow tracking columns to valuations
-- Adds current_step and other workflow fields
-- =====================================================

-- Add current_step column for workflow tracking
ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 1;

-- Add methods_applied array for selected valuation methods
ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS methods_applied TEXT[] DEFAULT '{}';

-- Add method_weights for custom weighting
ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS method_weights JSONB DEFAULT '{}';

-- Add final_value_ghs for explicit currency value
ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS final_value_ghs DECIMAL(15,2);

-- Update existing records to have final_value_ghs = estimated_value
UPDATE valuations 
SET final_value_ghs = estimated_value 
WHERE final_value_ghs IS NULL AND estimated_value IS NOT NULL;

-- Add index for workflow queries
CREATE INDEX IF NOT EXISTS idx_valuations_current_step ON valuations(current_step);

-- Comment on columns
COMMENT ON COLUMN valuations.current_step IS 'Current workflow step (1-9): 1=Property Setup, 2=HBU, 3=Methods, 4=Comparables, 5=Market, 6=Cost, 7=Income, 8=Reconciliation, 9=Report';
COMMENT ON COLUMN valuations.methods_applied IS 'Array of selected valuation methods: sales_comparison, cost_approach, income_approach, etc.';
COMMENT ON COLUMN valuations.method_weights IS 'Custom weights for each method in reconciliation';
COMMENT ON COLUMN valuations.final_value_ghs IS 'Final reconciled value in Ghana Cedis';
