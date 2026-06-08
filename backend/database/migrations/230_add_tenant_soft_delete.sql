-- Add soft delete support for property-management tenants.
-- Inactive tenants remain valid records; removed tenants are hidden by deleted_at.

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_not_deleted
ON tenants(organization_id, status)
WHERE deleted_at IS NULL;