-- Migration: Add crypto_preferred_token column to payment_accounts
-- Supports auto-conversion feature where recipients can specify
-- which ERC20 token they prefer to receive payments in.

ALTER TABLE payment_accounts
ADD COLUMN IF NOT EXISTS crypto_preferred_token VARCHAR(42), -- ERC20 address
ADD COLUMN IF NOT EXISTS crypto_preferred_token_set_at TIMESTAMPTZ;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_payment_accounts_preferred_token
ON payment_accounts (crypto_preferred_token)
WHERE crypto_preferred_token IS NOT NULL;

COMMENT ON COLUMN payment_accounts.crypto_preferred_token IS
  'Preferred ERC20 token address for auto-conversion. NULL = no preference (receive payment token as-is).';
