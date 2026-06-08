-- Migration 231: Multi-unit property layout support
-- Description: Adds per-unit floor tracking and a building-level unit rollup so that
--              multi-unit buildings can store accurate per-unit specs (e.g. 3A, 3B on
--              floor 3) instead of cloning the building-level specs onto every unit.

-- floor_number: which floor an individual unit sits on (NULL for single properties / buildings)
ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS floor_number INTEGER;

-- total_units: for a parent "building" row, the number of child units it contains (NULL otherwise)
ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS total_units INTEGER;

-- Speed up "list the units on floor N of building X" lookups
CREATE INDEX IF NOT EXISTS idx_properties_parent_floor
    ON properties(parent_property_id, floor_number);
