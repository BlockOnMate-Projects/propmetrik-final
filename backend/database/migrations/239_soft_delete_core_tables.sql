-- Migration 239: soft-delete foundation for core & financial tables.
-- Adds deleted_at to tables that lacked it (tenants already has it via 230).
-- Endpoints/read-paths must filter `deleted_at IS NULL` and set deleted_at on delete.
-- `vendors` is fully converted in code (teamService); the others are staged here and
-- converted endpoint-by-endpoint (see docs/CODEBASE_AUDIT.md for the per-table plan).
-- Idempotent.

ALTER TABLE properties              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE vendors                 ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE maintenance_work_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE rent_payments           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE deals                   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- NOTE: the project-management domain has no single `projects` parent table (many project_*
-- tables); its soft-delete is staged for a dedicated pass (see docs/CODEBASE_AUDIT.md).

-- Partial indexes so the common "active rows" reads stay fast.
CREATE INDEX IF NOT EXISTS idx_properties_active              ON properties (organization_id)              WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_active                ON vendors (organization_id)                 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_active            ON maintenance_work_orders (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rent_payments_active          ON rent_payments (tenancy_id)                WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_active                  ON deals (organization_id)                   WHERE deleted_at IS NULL;

-- RETENTION POLICY (to be enforced by a scheduled job, NOT in-band deletes):
--   * Financial records (rent_payments, invoices) and audit_logs: retain indefinitely / per
--     statutory minimum; never hard-delete.
--   * Soft-deleted operational rows (properties, vendors, work_orders, deals, projects):
--     may be archived after a defined retention window (e.g. 7 years) by an out-of-band,
--     audited archival process — not by application DELETE endpoints.
