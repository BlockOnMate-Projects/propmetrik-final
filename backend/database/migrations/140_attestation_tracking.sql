-- Migration 140: Add attestation tracking columns to nowpayments_payments
-- These columns track the on-chain attestation of off-chain (NOWPayments) payments
-- for audit/compliance purposes.

ALTER TABLE nowpayments_payments
  ADD COLUMN IF NOT EXISTS attestation_hash     TEXT,
  ADD COLUMN IF NOT EXISTS attestation_tx_hash  TEXT,
  ADD COLUMN IF NOT EXISTS attestation_status   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attestation_error    TEXT,
  ADD COLUMN IF NOT EXISTS attested_at          TIMESTAMPTZ;

-- Index for quick lookup of unattested finished payments (for retry/recovery)
CREATE INDEX IF NOT EXISTS idx_nowpayments_attestation_pending
  ON nowpayments_payments (status, attestation_status)
  WHERE status = 'finished' AND (attestation_status IS NULL OR attestation_status = 'failed');

COMMENT ON COLUMN nowpayments_payments.attestation_hash IS 'keccak256 hash of full payment data, stored on-chain for verification';
COMMENT ON COLUMN nowpayments_payments.attestation_tx_hash IS 'Polygon tx hash of the recordOffChainPayment() call';
COMMENT ON COLUMN nowpayments_payments.attestation_status IS 'success | failed | null (not yet attempted)';
COMMENT ON COLUMN nowpayments_payments.attestation_error IS 'Error message if attestation failed';
COMMENT ON COLUMN nowpayments_payments.attested_at IS 'When the attestation transaction was confirmed on-chain';
