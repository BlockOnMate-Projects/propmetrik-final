-- Migration: 022_property_hierarchy
-- Description: Add parent_id and unit_number to properties for multi-unit support
-- Created: 2026-01-17

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS parent_property_id UUID,
ADD COLUMN IF NOT EXISTS unit_number VARCHAR(50);

-- Index for finding units of a property
CREATE INDEX IF NOT EXISTS idx_properties_parent ON properties(parent_property_id);
