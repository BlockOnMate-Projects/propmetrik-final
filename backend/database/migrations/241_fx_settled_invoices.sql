-- 241_fx_settled_invoices.sql
-- Extend the FX-settled-payments model (migration 240) to the invoice-based
-- services: VALUATION and PROJECT invoices can be denominated in a foreign
-- currency (e.g. USD) but are charged in their GHS equivalent at a live, locked
-- rate via Paystack. These columns record the GHS actually charged + the exact
-- rate used, alongside the invoice's native total/currency (unchanged).
--
-- Deal/project *direct* payments already record FX on payment_transactions (240).
-- Idempotent: safe to re-run.

ALTER TABLE valuation_invoices
    ADD COLUMN IF NOT EXISTS charged_amount_ghs NUMERIC(14,2),   -- GHS actually charged via gateway
    ADD COLUMN IF NOT EXISTS fx_rate            NUMERIC(14,6),   -- GHS per 1 native unit at charge time
    ADD COLUMN IF NOT EXISTS fx_source          VARCHAR(80),     -- live rate provenance
    ADD COLUMN IF NOT EXISTS fx_locked_at       TIMESTAMPTZ;     -- when the rate was locked

COMMENT ON COLUMN valuation_invoices.charged_amount_ghs IS 'GHS charged via gateway when the invoice currency is non-GHS; total_amount/currency stay native';
COMMENT ON COLUMN valuation_invoices.fx_rate            IS 'Live GHS-per-native-unit rate locked at charge time (non-GHS invoices)';

ALTER TABLE project_invoices
    ADD COLUMN IF NOT EXISTS charged_amount_ghs NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS fx_rate            NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS fx_source          VARCHAR(80),
    ADD COLUMN IF NOT EXISTS fx_locked_at       TIMESTAMPTZ;

COMMENT ON COLUMN project_invoices.charged_amount_ghs IS 'GHS charged via gateway when the invoice currency is non-GHS; total/currency stay native';
COMMENT ON COLUMN project_invoices.fx_rate            IS 'Live GHS-per-native-unit rate locked at charge time (non-GHS invoices)';
