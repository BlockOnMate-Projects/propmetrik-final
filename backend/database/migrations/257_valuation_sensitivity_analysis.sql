-- 257_valuation_sensitivity_analysis.sql
-- Stores the reconciliation Sensitivity Analysis (RICS VPS 3 uncertainty disclosure) the valuer
-- reviewed, so it can be evidenced in the signed report. Populated from the reconciliation page
-- (real per-method engine re-runs); read by reportTemplateService into the Valuation Process section.
-- Idempotent.

ALTER TABLE valuations
  ADD COLUMN IF NOT EXISTS sensitivity_analysis JSONB;
