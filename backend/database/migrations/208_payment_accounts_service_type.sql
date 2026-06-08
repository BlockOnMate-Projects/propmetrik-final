-- Migration 208: Add service_type to payment_accounts for per-service isolation
-- Each organization can have separate payment accounts per service
-- (valuation, project_management, property_management, deals)
-- Each service gets its own Paystack subaccount when the user configures it.

-- 1. Add service_type column with default for existing rows
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) NOT NULL DEFAULT 'property_management';

-- 2. Drop old unique constraint (entity_type, entity_id)
ALTER TABLE payment_accounts
  DROP CONSTRAINT IF EXISTS payment_accounts_entity_type_entity_id_key;

-- 3. Add new unique constraint that includes service_type (idempotent — drop first if present)
ALTER TABLE payment_accounts
  DROP CONSTRAINT IF EXISTS payment_accounts_entity_service_unique;
ALTER TABLE payment_accounts
  ADD CONSTRAINT payment_accounts_entity_service_unique
  UNIQUE (entity_id, entity_type, service_type);

-- 4. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_accounts_service_lookup
  ON payment_accounts (entity_id, entity_type, service_type, is_active);

-- NOTE: Existing rows default to service_type='property_management'.
-- Other services (valuation, project_management, deals) will create
-- their own rows with independent Paystack subaccounts when the user
-- configures payment settings for each service.
