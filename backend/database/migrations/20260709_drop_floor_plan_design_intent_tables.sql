-- ============================================================================
-- Drop abandoned floor-plan design-intent / Blender track (migrations 027-030)
-- ============================================================================
-- The LLM design-intent → Blender geometry pipeline was never shipped: its
-- POST routes returned 501 and no live code wrote to these tables. Verified
-- empty in production (all row counts = 0) on 2026-07-09 before dropping.
-- The live floor plan feature (valuation_floor_plans, valuation_floor_plan_rooms,
-- Konva canvas_json + MinIO PNG) is unaffected.

-- Dependents first (audit_log FKs geometry_versions + design_intents;
-- design_intents FKs geometry_versions; migration_errors FKs migrations)
DROP TABLE IF EXISTS valuation_floor_plan_audit_log CASCADE;
DROP TABLE IF EXISTS valuation_floor_plan_design_intents CASCADE;
DROP TABLE IF EXISTS valuation_floor_plan_geometry_versions CASCADE;
DROP TABLE IF EXISTS floor_plan_migration_errors CASCADE;
DROP TABLE IF EXISTS floor_plan_migrations CASCADE;
DROP TABLE IF EXISTS feature_flag_overrides CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS geometry_cache_stats CASCADE;

-- Migration-027 scaffolding columns on the live table (all NULL in prod;
-- only consumer was the broken scripts/migrate-floor-plans.ts, now deleted)
ALTER TABLE valuation_floor_plans
  DROP COLUMN IF EXISTS migration_status,
  DROP COLUMN IF EXISTS migration_error,
  DROP COLUMN IF EXISTS migrated_at,
  DROP COLUMN IF EXISTS legacy_canvas_json,
  DROP COLUMN IF EXISTS migration_metadata;
