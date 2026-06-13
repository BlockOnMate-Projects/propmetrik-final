-- 240_fx_settled_payments.sql
-- Dual-currency settlement for fiat payments.
--
-- Some properties are listed/leased in a foreign currency (e.g. USD) but the
-- Ghana payment gateway (Paystack) can only settle GHS. We therefore charge the
-- GHS equivalent at a LIVE, locked FX rate while preserving the original
-- obligation in its native currency for reconciliation against the (native)
-- rent schedule. These columns record both sides + the exact rate used, so every
-- cross-currency charge is fully traceable.
--
-- Idempotent: safe to re-run.

-- 1. payment_transactions ledger: the charged amounts (gross/principal/service_fee,
--    currency) already hold the GHS that actually moved. Add the obligation side.
ALTER TABLE payment_transactions
    ADD COLUMN IF NOT EXISTS obligation_currency VARCHAR(3),       -- native listing currency, e.g. 'USD'
    ADD COLUMN IF NOT EXISTS obligation_amount  NUMERIC(14,2),     -- principal owed in native currency (e.g. 1000.00)
    ADD COLUMN IF NOT EXISTS fx_rate            NUMERIC(14,6),     -- GHS per 1 native unit at charge time
    ADD COLUMN IF NOT EXISTS fx_source          VARCHAR(80),       -- rate provenance, e.g. 'data-hub:ForexRate-API'
    ADD COLUMN IF NOT EXISTS fx_locked_at       TIMESTAMPTZ;       -- when the rate was locked

COMMENT ON COLUMN payment_transactions.obligation_currency IS 'Native currency of the obligation when it differs from the GHS settlement currency (fiat FX payments)';
COMMENT ON COLUMN payment_transactions.obligation_amount   IS 'Principal owed in the native currency; the GHS charged is in principal_amount/gross_amount (fiat FX payments)';
COMMENT ON COLUMN payment_transactions.fx_rate             IS 'Live GHS-per-native-unit rate locked at charge time (fiat FX payments)';
COMMENT ON COLUMN payment_transactions.fx_source           IS 'Provenance of the locked FX rate, e.g. data-hub:ForexRate-API (fiat FX payments)';
COMMENT ON COLUMN payment_transactions.fx_locked_at        IS 'Timestamp the FX rate was fetched/locked for this charge (fiat FX payments)';

-- 2. rent_payments: payment_amount/currency stay in the NATIVE obligation currency
--    (so they reconcile against the native rent schedule). Record the GHS collected
--    + the locked rate for the money-moved audit.
ALTER TABLE rent_payments
    ADD COLUMN IF NOT EXISTS charged_amount_ghs NUMERIC(14,2),     -- GHS actually charged via gateway
    ADD COLUMN IF NOT EXISTS fx_rate            NUMERIC(14,6),     -- GHS per 1 native unit at charge time
    ADD COLUMN IF NOT EXISTS fx_source          VARCHAR(80),       -- rate provenance
    ADD COLUMN IF NOT EXISTS fx_locked_at       TIMESTAMPTZ;       -- when the rate was locked

COMMENT ON COLUMN rent_payments.charged_amount_ghs IS 'GHS actually collected via the gateway when the rent currency is non-GHS; payment_amount/currency remain in the native currency';
COMMENT ON COLUMN rent_payments.fx_rate            IS 'Live GHS-per-native-unit rate locked at charge time (non-GHS rent only)';
COMMENT ON COLUMN rent_payments.fx_source          IS 'Provenance of the locked FX rate (non-GHS rent only)';
COMMENT ON COLUMN rent_payments.fx_locked_at       IS 'Timestamp the FX rate was fetched/locked for this charge (non-GHS rent only)';
