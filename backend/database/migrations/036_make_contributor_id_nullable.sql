ALTER TABLE contributions ALTER COLUMN contributor_id DROP NOT NULL;

-- Add unique index for vendors to support ON CONFLICT seeding
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_business_org_unique ON vendors(business_name, organization_id);
