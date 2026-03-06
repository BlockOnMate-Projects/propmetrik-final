-- Migration: 023_fix_hierarchy_fk
-- Description: Fix Foreign Key for partitioned properties table (requires composite key)
-- Created: 2026-01-17

-- Since properties is partitioned by region, PK is (id, region).
-- FK must reference (id, region).
-- We assume parent and child are in the same region (same building).

DO $$
BEGIN
    -- Drop old constraint if exists (standard name)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_parent_property_id_fkey') THEN
        ALTER TABLE properties DROP CONSTRAINT properties_parent_property_id_fkey;
    END IF;
END $$;

-- Add new composite foreign key
ALTER TABLE properties
ADD CONSTRAINT properties_parent_property_id_fkey
FOREIGN KEY (parent_property_id, region)
REFERENCES properties(id, region)
ON DELETE CASCADE;
