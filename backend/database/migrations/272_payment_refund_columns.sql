-- Migration 272: refund tracking on payment_transactions
--
-- The ledger's status enum already had 'refunded' (migration 133) but nothing ever
-- wrote it — there was no refund path at all. This adds the columns the refund handler
-- (services/property-management/payment/refundService.ts) needs to initiate, track, and
-- reconcile a Paystack refund (which completes asynchronously via the refund.processed
-- webhook).
--
-- refund_status lifecycle: NULL → pending (claimed) → processing (submitted to Paystack)
--                          → processed (webhook confirmed) | failed (retryable).
-- refund_status is also the idempotency guard: a refund can only be initiated when it is
-- NULL or 'failed', so a double-submit cannot issue two refunds for one transaction.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS); safe to re-run.

ALTER TABLE payment_transactions
    ADD COLUMN IF NOT EXISTS refunded_amount     BIGINT,        -- pesewas actually refunded (full or partial)
    ADD COLUMN IF NOT EXISTS refund_reference    VARCHAR(100),  -- Paystack refund id/reference
    ADD COLUMN IF NOT EXISTS refund_status       VARCHAR(20),   -- pending | processing | processed | failed
    ADD COLUMN IF NOT EXISTS refund_reason       TEXT,
    ADD COLUMN IF NOT EXISTS refunded_at         TIMESTAMPTZ,   -- when Paystack confirmed the refund
    ADD COLUMN IF NOT EXISTS refund_initiated_by UUID,          -- staff user who initiated (maker)
    ADD COLUMN IF NOT EXISTS refund_initiated_at TIMESTAMPTZ;

-- Reconciliation of in-flight refunds (skips the common NULL + terminal 'processed' rows).
CREATE INDEX IF NOT EXISTS idx_payment_tx_refund_status
    ON payment_transactions (refund_status)
    WHERE refund_status IS NOT NULL AND refund_status <> 'processed';
