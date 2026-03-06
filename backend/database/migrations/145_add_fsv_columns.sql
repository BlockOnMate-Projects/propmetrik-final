-- Migration 145: Add FSV (Forced Sale Value) columns to valuations
-- FSV discount % is set by the valuer during reconciliation and flows into the report.
-- Previously hardcoded at 70% (reportDataService) and 80% (reportTemplateService) — now stored in DB.

ALTER TABLE valuations ADD COLUMN IF NOT EXISTS fsv_discount_percent NUMERIC(5,2) DEFAULT 30;
ALTER TABLE valuations ADD COLUMN IF NOT EXISTS force_sale_value NUMERIC(18,2);
ALTER TABLE valuations ADD COLUMN IF NOT EXISTS force_sale_value_usd NUMERIC(18,2);

-- Also add to valuation_reconciliations for audit trail
ALTER TABLE valuation_reconciliations ADD COLUMN IF NOT EXISTS fsv_discount_percent NUMERIC(5,2);
ALTER TABLE valuation_reconciliations ADD COLUMN IF NOT EXISTS force_sale_value NUMERIC(18,2);

-- Backfill: compute FSV from existing final_value_ghs with default 30% discount
UPDATE valuations
SET force_sale_value = ROUND(final_value_ghs * 0.70, 2)
WHERE final_value_ghs IS NOT NULL AND force_sale_value IS NULL;

COMMENT ON COLUMN valuations.fsv_discount_percent IS 'Forced Sale Value discount percentage (e.g. 30 = 30% discount from market value)';
COMMENT ON COLUMN valuations.force_sale_value IS 'Calculated Forced Sale Value in GHS';
COMMENT ON COLUMN valuations.force_sale_value_usd IS 'Calculated Forced Sale Value in USD';
