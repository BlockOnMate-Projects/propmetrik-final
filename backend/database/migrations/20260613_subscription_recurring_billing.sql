-- Subscription recurring billing: store the reusable Paystack card authorization
-- and dunning state so a cron job can auto-charge each period.
-- Idempotent — safe to re-run.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_authorization_code VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_card_last4 VARCHAR(8);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_card_brand VARCHAR(40);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(30);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_email VARCHAR(255);

-- Dunning / retry state
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- The renewal job scans by (status, current_period_end); a partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal
  ON subscriptions (status, current_period_end)
  WHERE status IN ('active', 'past_due');
