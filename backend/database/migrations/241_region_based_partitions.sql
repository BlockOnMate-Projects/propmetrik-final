-- Migration: 241_region_based_partitions
-- Description: Convert properties partitioning from the 5-value "metro/cluster" scheme
--              to real Ghana regions. Adds the 14 missing regions to region_code_enum,
--              creates a partition for each, remaps existing cluster data to real regions,
--              and drops the now-empty cluster partitions.
-- Created: 2026-06-15
--
-- WHY THIS EXISTS:
--   The `properties` table is PARTITION BY LIST (region) with region region_code_enum.
--   The enum only had: greater_accra, kumasi_metro, eastern, western_cluster, northern_cluster.
--   The UI offers all 16 real regions, so saving e.g. an "ashanti" property 500'd
--   ("invalid input value for enum / no partition found").
--
-- HOW TO RUN (DO NOT run via `npm run migrate`):
--   The normal runner executes each migration in ONE transaction as `propmetrik_app`.
--   ALTER TYPE ... ADD VALUE requires the enum OWNER (propmetrik_admin) AND its new
--   values cannot be USED in the same transaction they were added. So run manually
--   with autocommit as the admin user, then record it in the `migrations` table:
--
--     psql "$DATABASE_URL_PROPMETRIK_ADMIN" -v ON_ERROR_STOP=1 \
--          -f database/migrations/241_region_based_partitions.sql
--
--   This file is idempotent and safe to re-run.

-- 1) Add the 14 missing real Ghana regions to the enum (autocommit; each is its own txn).
--    greater_accra and eastern already exist as real regions and are kept as-is.
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'ashanti';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'central';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'western';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'volta';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'northern';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'upper_east';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'upper_west';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'bono';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'bono_east';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'ahafo';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'savannah';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'north_east';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'oti';
ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS 'western_north';

-- 2) Structural changes + data remap (atomic). The enum values above are already
--    committed, so they are safe to use inside this transaction.
BEGIN;

-- 2a) Create a partition for each real region (greater_accra / eastern already exist).
CREATE TABLE IF NOT EXISTS properties_ashanti       PARTITION OF properties FOR VALUES IN ('ashanti');
CREATE TABLE IF NOT EXISTS properties_central       PARTITION OF properties FOR VALUES IN ('central');
CREATE TABLE IF NOT EXISTS properties_western       PARTITION OF properties FOR VALUES IN ('western');
CREATE TABLE IF NOT EXISTS properties_volta         PARTITION OF properties FOR VALUES IN ('volta');
CREATE TABLE IF NOT EXISTS properties_northern      PARTITION OF properties FOR VALUES IN ('northern');
CREATE TABLE IF NOT EXISTS properties_upper_east    PARTITION OF properties FOR VALUES IN ('upper_east');
CREATE TABLE IF NOT EXISTS properties_upper_west    PARTITION OF properties FOR VALUES IN ('upper_west');
CREATE TABLE IF NOT EXISTS properties_bono          PARTITION OF properties FOR VALUES IN ('bono');
CREATE TABLE IF NOT EXISTS properties_bono_east     PARTITION OF properties FOR VALUES IN ('bono_east');
CREATE TABLE IF NOT EXISTS properties_ahafo         PARTITION OF properties FOR VALUES IN ('ahafo');
CREATE TABLE IF NOT EXISTS properties_savannah      PARTITION OF properties FOR VALUES IN ('savannah');
CREATE TABLE IF NOT EXISTS properties_north_east    PARTITION OF properties FOR VALUES IN ('north_east');
CREATE TABLE IF NOT EXISTS properties_oti           PARTITION OF properties FOR VALUES IN ('oti');
CREATE TABLE IF NOT EXISTS properties_western_north PARTITION OF properties FOR VALUES IN ('western_north');

-- 2b) Remap existing rows from the cluster partitions to real regions.
--     kumasi_metro -> ashanti  (Kumasi is the Ashanti regional capital; all 128 rows are Ashanti)
--     western_cluster -> western (the single row is Takoradi / Western Region)
--     northern_cluster -> northern (no rows today, kept for completeness)
UPDATE properties SET region = 'ashanti' WHERE region = 'kumasi_metro';
UPDATE properties SET region = 'western' WHERE region = 'western_cluster';
UPDATE properties SET region = 'northern' WHERE region = 'northern_cluster';

-- 2c) Keep denormalized child copies of property_region consistent (plain tables, no FKs).
UPDATE property_data_sources    SET property_region = 'ashanti'  WHERE property_region = 'kumasi_metro';
UPDATE property_data_sources    SET property_region = 'western'  WHERE property_region = 'western_cluster';
UPDATE property_data_sources    SET property_region = 'northern' WHERE property_region = 'northern_cluster';
UPDATE property_quality_metrics SET property_region = 'ashanti'  WHERE property_region = 'kumasi_metro';
UPDATE property_quality_metrics SET property_region = 'western'  WHERE property_region = 'western_cluster';
UPDATE property_quality_metrics SET property_region = 'northern' WHERE property_region = 'northern_cluster';

-- 2d) Drop the now-empty cluster partitions. The enum labels themselves cannot be
--     removed in Postgres, but with no partition and no UI option they are inert.
DROP TABLE IF EXISTS properties_kumasi_metro;
DROP TABLE IF EXISTS properties_western_cluster;
DROP TABLE IF EXISTS properties_northern_cluster;

COMMIT;
