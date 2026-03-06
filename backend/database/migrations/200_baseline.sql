-- ============================================================
-- 001_baseline.sql — Baseline migration
-- ============================================================
-- This migration marks the existing database schema as the
-- baseline. It does NOT recreate the schema — it simply
-- creates the migrations tracking table and marks this file
-- as executed.
--
-- The production database already has all 484+ tables.
-- Future migrations (002_*, 003_*, …) should contain
-- incremental DDL only.
--
-- To export the full current schema for documentation,
-- upgrade pg_dump to match the server (PostgreSQL 15) and run:
--   pg_dump --schema-only --no-owner --no-privileges \
--     -h pg.cedynhq.com -p 5434 -U propmetrik_app propmetrik \
--     > database/schema-snapshot.sql
-- ============================================================

-- Ensure migrations table exists (idempotent — migrate.ts also creates it)
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(64) NOT NULL
);

-- Note: uuid-ossp extension already enabled by DBA. Skip CREATE EXTENSION to avoid permission issues.

-- Verify key tables exist (canary check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    RAISE EXCEPTION 'Baseline validation failed: users table does not exist. This migration should only run against an existing database.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
    RAISE EXCEPTION 'Baseline validation failed: organizations table does not exist.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    RAISE EXCEPTION 'Baseline validation failed: projects table does not exist.';
  END IF;
END $$;

SELECT 'Baseline migration validated — 484+ tables present' AS status;
