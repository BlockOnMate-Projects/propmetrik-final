-- Migration: 20260702_financial_fk_restrict
-- Description: Change 6 FINANCIAL foreign keys from ON DELETE SET NULL → ON DELETE RESTRICT
--   so deleting a parent org/user/client/valuation can no longer SILENTLY ORPHAN a money
--   record (invoice / subscription / valuation invoice). RESTRICT blocks the parent delete
--   while dependent financial rows exist — the app must archive/reassign them first.
-- Safe: RESTRICT does not validate existing rows (only affects future deletes). Columns stay
--   nullable (an unlinked invoice is still legal). Idempotent (DROP IF EXISTS + re-ADD).
-- NB non-financial SET NULL links (invoices.subscription_id, *.granted_by_id, utility_charges
--   links) are intentionally left nullable-on-delete.
-- Created: 2026-07-02

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_organization_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_organization_id_fkey;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE valuation_invoices DROP CONSTRAINT IF EXISTS valuation_invoices_client_id_fkey;
ALTER TABLE valuation_invoices ADD CONSTRAINT valuation_invoices_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES valuation_clients(id) ON DELETE RESTRICT;

ALTER TABLE valuation_invoices DROP CONSTRAINT IF EXISTS valuation_invoices_valuation_id_fkey;
ALTER TABLE valuation_invoices ADD CONSTRAINT valuation_invoices_valuation_id_fkey
  FOREIGN KEY (valuation_id) REFERENCES valuations(id) ON DELETE RESTRICT;
