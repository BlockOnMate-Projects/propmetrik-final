-- Migration: Add weighting_rationale column to valuations table
-- This stores the surveyor's rationale for the method weights applied
-- e.g. "Sales Comparison given 60% weight due to strong market data availability"

ALTER TABLE valuations 
  ADD COLUMN IF NOT EXISTS weighting_rationale TEXT;

-- Backfill from valuation_reconciliations.reconciliation_narrative where available
UPDATE valuations v
SET weighting_rationale = vr.reconciliation_narrative
FROM valuation_reconciliations vr
WHERE vr.valuation_id = v.id
  AND v.weighting_rationale IS NULL
  AND vr.reconciliation_narrative IS NOT NULL
  AND vr.reconciliation_narrative != '';
