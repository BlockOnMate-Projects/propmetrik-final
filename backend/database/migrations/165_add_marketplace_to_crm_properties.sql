-- Migration: Add marketplace and geospatial columns to CRM properties table
-- Date: 2026-02-21
-- Description: Add marketplace_enabled, permanent_link_token, and PostGIS geometry columns to crm_properties

-- Add marketplace columns
ALTER TABLE crm_properties 
ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS permanent_link_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS marketplace_listed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS marketplace_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketplace_clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255),
ADD COLUMN IF NOT EXISTS geocoding_accuracy VARCHAR(50);

-- Ensure lat/lng columns exist
ALTER TABLE crm_properties 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- Add PostGIS geometry column
SELECT AddGeometryColumn('public', 'crm_properties', 'geom', 4326, 'POINT', 2);

-- Populate geom from lat/lng
UPDATE crm_properties 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geom IS NULL;

-- Generate permanent tokens
UPDATE crm_properties
SET permanent_link_token = md5(uuid_generate_v4()::text || clock_timestamp()::text)
WHERE permanent_link_token IS NULL;

-- Set marketplace_listed_at for existing properties
UPDATE crm_properties
SET marketplace_listed_at = created_at
WHERE marketplace_enabled = TRUE AND marketplace_listed_at IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crm_properties_marketplace 
ON crm_properties(marketplace_enabled, marketplace_listed_at DESC) 
WHERE marketplace_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_crm_properties_geom_gist 
ON crm_properties USING GIST(geom)
WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_properties_coordinates 
ON crm_properties(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_properties_location 
ON crm_properties(region, address_city, neighborhood)
WHERE marketplace_enabled = TRUE;

-- Create index for permanent_link_token (unique values enforced by application)
CREATE INDEX IF NOT EXISTS idx_crm_properties_permanent_link_token 
ON crm_properties(permanent_link_token)
WHERE permanent_link_token IS NOT NULL;

-- Add trigger to auto-update geom
CREATE OR REPLACE FUNCTION update_crm_properties_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_properties_geom_update ON crm_properties;
CREATE TRIGGER crm_properties_geom_update
BEFORE INSERT OR UPDATE OF latitude, longitude ON crm_properties
FOR EACH ROW
EXECUTE FUNCTION update_crm_properties_geom();

-- Add comments
COMMENT ON COLUMN crm_properties.marketplace_enabled IS 'Whether property is listed on public marketplace';
COMMENT ON COLUMN crm_properties.permanent_link_token IS 'Permanent token for marketplace application links';
COMMENT ON COLUMN crm_properties.geom IS 'PostGIS geometry column for geospatial queries';
