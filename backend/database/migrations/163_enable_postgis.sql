-- Migration: Enable PostGIS for geospatial queries
-- Date: 2026-02-21
-- Description: Enable PostGIS extension for marketplace geospatial features
-- Note: PostGIS must be installed by a superuser / DB owner.
--       This migration simply verifies it is present.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE EXCEPTION 'PostGIS extension is not installed. Ask a DBA to run: CREATE EXTENSION postgis;';
  END IF;
END $$;

-- Verify installation
SELECT PostGIS_Version();
