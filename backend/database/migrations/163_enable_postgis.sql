-- Migration: Enable PostGIS for geospatial queries
-- Date: 2026-02-21
-- Description: Enable PostGIS extension for marketplace geospatial features

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify installation
SELECT PostGIS_Version();

-- Add comment
COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';
