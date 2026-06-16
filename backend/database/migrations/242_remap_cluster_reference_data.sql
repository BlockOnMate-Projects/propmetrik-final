-- Migration: 242_remap_cluster_reference_data
-- Description: Finish the move from the metro/cluster region scheme to real Ghana regions
--              (see 241_region_based_partitions.sql). Remaps the remaining cluster values
--              in construction/valuation REFERENCE tables to their real-region equivalents,
--              so region-keyed lookups (material prices, labor/equipment rates, cap-rate
--              benchmarks) resolve under the new scheme.
-- Created: 2026-06-15
--
-- Mapping (same as 241): kumasi_metro -> ashanti, western_cluster -> western,
--                        northern_cluster -> northern.
--
-- These are all PLAIN tables (no partition movement) with region region_code_enum, and the
-- target enum values already exist (added in 241). Idempotent: re-running matches 0 rows.
-- The enum values were added by 241, so this only needs UPDATE privilege; it can run via the
-- normal runner once 241 has been applied. It was run live as propmetrik_admin alongside 241.

BEGIN;

UPDATE material_prices            SET region = 'ashanti'  WHERE region = 'kumasi_metro';
UPDATE material_prices            SET region = 'western'  WHERE region = 'western_cluster';
UPDATE material_prices            SET region = 'northern' WHERE region = 'northern_cluster';

UPDATE labor_rates                SET region = 'ashanti'  WHERE region = 'kumasi_metro';
UPDATE labor_rates                SET region = 'western'  WHERE region = 'western_cluster';
UPDATE labor_rates                SET region = 'northern' WHERE region = 'northern_cluster';

UPDATE equipment_rates            SET region = 'ashanti'  WHERE region = 'kumasi_metro';
UPDATE equipment_rates            SET region = 'western'  WHERE region = 'western_cluster';
UPDATE equipment_rates            SET region = 'northern' WHERE region = 'northern_cluster';

UPDATE market_cap_rate_benchmarks SET region = 'ashanti'  WHERE region = 'kumasi_metro';
UPDATE market_cap_rate_benchmarks SET region = 'western'  WHERE region = 'western_cluster';
UPDATE market_cap_rate_benchmarks SET region = 'northern' WHERE region = 'northern_cluster';

COMMIT;
