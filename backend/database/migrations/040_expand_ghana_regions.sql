-- Migration: 024_expand_ghana_regions
-- Description: Add all 16 regions of Ghana to region_code_enum and create partitions
-- Created: 2026-01-17
-- NOTE: Enum modifications require superuser. Skip if running as app user.
--       Run these ALTER TYPE commands manually as database superuser when needed.

-- 1. Add new values to region_code_enum (REQUIRES SUPERUSER)
-- These are commented out because the app user doesn't own the enum type.
-- Run as superuser:
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'ahafo';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'ashanti';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'bono';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'bono_east';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'central';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'north_east';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'northern';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'oti';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'savannah';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'upper_east';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'upper_west';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'volta';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'western';
-- ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'western_north';

-- 2. Create partitions for new regions (will work once enum values exist)
-- Note: 'greater_accra', 'kumasi_metro', 'eastern', 'western_cluster', 'northern_cluster' already exist.
-- Partitions are commented out until enum values are added by superuser.
-- CREATE TABLE IF NOT EXISTS properties_ahafo PARTITION OF properties FOR VALUES IN ('ahafo');
-- CREATE TABLE IF NOT EXISTS properties_ashanti PARTITION OF properties FOR VALUES IN ('ashanti');
-- etc.

-- This migration is now a placeholder. The app works with the existing 5 regions.
-- When you need the new regions, run the ALTER TYPE commands as superuser first.
SELECT 1; -- No-op to ensure migration runs successfully
