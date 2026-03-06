-- Migration: Add marketplace and geospatial columns to properties table
-- Date: 2026-02-21
-- Description: Add marketplace_enabled, permanent_link_token, and PostGIS geometry columns

-- Add marketplace columns
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS permanent_link_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS marketplace_listed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS marketplace_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketplace_clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255),
ADD COLUMN IF NOT EXISTS geocoding_accuracy VARCHAR(50);

-- Ensure lat/lng columns exist (should already be there from previous migrations)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- Add PostGIS geometry column for advanced geospatial queries (skip if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'properties' AND column_name = 'geom'
    ) THEN
        PERFORM AddGeometryColumn('public', 'properties', 'geom', 4326, 'POINT', 2);
    END IF;
END $$;

-- Populate geom from lat/lng for existing properties
UPDATE properties 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geom IS NULL;

-- Generate permanent tokens for existing properties that don't have one
-- Using md5 of uuid for random 32-char hex string (alternative to gen_random_bytes)
UPDATE properties
SET permanent_link_token = md5(uuid_generate_v4()::text || clock_timestamp()::text)
WHERE permanent_link_token IS NULL;

-- Set marketplace_listed_at for existing properties
UPDATE properties
SET marketplace_listed_at = created_at
WHERE marketplace_enabled = TRUE AND marketplace_listed_at IS NULL;

-- Create indexes for marketplace queries
CREATE INDEX IF NOT EXISTS idx_properties_marketplace 
ON properties(marketplace_enabled, marketplace_listed_at DESC) 
WHERE marketplace_enabled = TRUE;

-- Create spatial index for geospatial queries (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_properties_geom_gist 
ON properties USING GIST(geom)
WHERE geom IS NOT NULL;

-- Create index for lat/lng (fallback for simpler queries)
CREATE INDEX IF NOT EXISTS idx_properties_coordinates 
ON properties(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for region-based queries
CREATE INDEX IF NOT EXISTS idx_properties_location 
ON properties(region, address_city, neighborhood)
WHERE marketplace_enabled = TRUE;

-- Create unique index for permanent_link_token (includes region for partitioning)
-- Note: Since tokens are globally unique, we enforce this with a trigger
CREATE INDEX IF NOT EXISTS idx_properties_permanent_link_token 
ON properties(permanent_link_token)
WHERE permanent_link_token IS NOT NULL;

-- Add trigger to auto-update geom when lat/lng changes
CREATE OR REPLACE FUNCTION update_properties_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS properties_geom_update ON properties;
CREATE TRIGGER properties_geom_update
BEFORE INSERT OR UPDATE OF latitude, longitude ON properties
FOR EACH ROW
EXECUTE FUNCTION update_properties_geom();

-- Add comments
COMMENT ON COLUMN properties.marketplace_enabled IS 'Whether property is listed on public marketplace';
COMMENT ON COLUMN properties.permanent_link_token IS 'Permanent token for marketplace application links';
COMMENT ON COLUMN properties.geom IS 'PostGIS geometry column for geospatial queries';
COMMENT ON COLUMN properties.neighborhood IS 'Neighborhood/area for filtering';
COMMENT ON COLUMN properties.geocoding_accuracy IS 'Accuracy level: rooftop, street, city, etc.';
