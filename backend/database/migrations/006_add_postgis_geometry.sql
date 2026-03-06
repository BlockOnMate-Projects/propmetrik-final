-- Migration: 006_add_postgis_geometry
-- Description: Add PostGIS geometry columns now that extension is available
-- Created: 2026-01-05

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =====================================================
-- ADD GEOMETRY COLUMNS TO NEIGHBORHOODS
-- =====================================================

-- Add boundary polygon column
ALTER TABLE neighborhoods 
ADD COLUMN IF NOT EXISTS boundary GEOMETRY(POLYGON, 4326);

-- Add center point geometry column
ALTER TABLE neighborhoods 
ADD COLUMN IF NOT EXISTS center_point GEOMETRY(POINT, 4326);

-- Populate center_point from existing lat/lng if available
UPDATE neighborhoods 
SET center_point = ST_SetSRID(ST_MakePoint(center_longitude, center_latitude), 4326)
WHERE center_latitude IS NOT NULL 
  AND center_longitude IS NOT NULL 
  AND center_point IS NULL;

-- Create spatial indexes for neighborhoods
CREATE INDEX IF NOT EXISTS idx_neighborhoods_boundary 
ON neighborhoods USING GIST(boundary);

CREATE INDEX IF NOT EXISTS idx_neighborhoods_center 
ON neighborhoods USING GIST(center_point);

-- =====================================================
-- ADD GEOMETRY COLUMNS TO PROPERTIES
-- =====================================================

-- Add location geometry column to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS location GEOMETRY(POINT, 4326);

-- Populate location from existing lat/lng
UPDATE properties 
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL 
  AND location IS NULL;

-- Create spatial index for properties
-- Note: For partitioned tables, indexes are created on each partition
CREATE INDEX IF NOT EXISTS idx_properties_location 
ON properties USING GIST(location);

-- =====================================================
-- ADD GEOMETRY COLUMNS TO TRANSACTIONS
-- =====================================================

-- Add location geometry column to transactions
ALTER TABLE property_transactions 
ADD COLUMN IF NOT EXISTS location GEOMETRY(POINT, 4326);

-- Populate location from existing lat/lng
UPDATE property_transactions 
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL 
  AND location IS NULL;

-- Create spatial index for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_location 
ON property_transactions USING GIST(location);

-- =====================================================
-- CREATE SPATIAL HELPER FUNCTIONS
-- =====================================================

-- Function to find properties within a radius (in meters)
CREATE OR REPLACE FUNCTION find_properties_within_radius(
  center_lat DECIMAL,
  center_lng DECIMAL,
  radius_meters INTEGER,
  region_filter region_code_enum DEFAULT NULL
)
RETURNS TABLE (
  property_id UUID,
  property_region region_code_enum,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.region,
    ST_Distance(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
    ) as distance_meters
  FROM properties p
  WHERE p.location IS NOT NULL
    AND ST_DWithin(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_meters
    )
    AND (region_filter IS NULL OR p.region = region_filter)
  ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

-- Function to find neighborhood by point
CREATE OR REPLACE FUNCTION find_neighborhood_by_point(
  lat DECIMAL,
  lng DECIMAL
)
RETURNS UUID AS $$
DECLARE
  neighborhood_id UUID;
BEGIN
  SELECT id INTO neighborhood_id
  FROM neighborhoods
  WHERE ST_Contains(
    boundary,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  )
  LIMIT 1;
  
  RETURN neighborhood_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate distance between two properties
CREATE OR REPLACE FUNCTION calculate_property_distance(
  property1_id UUID,
  property1_region region_code_enum,
  property2_id UUID,
  property2_region region_code_enum
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  distance DOUBLE PRECISION;
BEGIN
  SELECT ST_Distance(p1.location::geography, p2.location::geography)
  INTO distance
  FROM properties p1, properties p2
  WHERE p1.id = property1_id AND p1.region = property1_region
    AND p2.id = property2_id AND p2.region = property2_region;
  
  RETURN distance;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CREATE TRIGGER TO AUTO-POPULATE GEOMETRY
-- =====================================================

-- Function to auto-populate location geometry on insert/update
CREATE OR REPLACE FUNCTION populate_location_geometry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to properties (will apply to all partitions)
DROP TRIGGER IF EXISTS trg_populate_property_location ON properties;
CREATE TRIGGER trg_populate_property_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON properties
FOR EACH ROW
EXECUTE FUNCTION populate_location_geometry();

-- Apply trigger to transactions
DROP TRIGGER IF EXISTS trg_populate_transaction_location ON property_transactions;
CREATE TRIGGER trg_populate_transaction_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON property_transactions
FOR EACH ROW
EXECUTE FUNCTION populate_location_geometry();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN neighborhoods.boundary IS 'PostGIS polygon representing neighborhood boundaries (SRID 4326)';
COMMENT ON COLUMN neighborhoods.center_point IS 'PostGIS point representing neighborhood center (SRID 4326)';
COMMENT ON COLUMN properties.location IS 'PostGIS point for property location (SRID 4326), auto-populated from lat/lng';
COMMENT ON COLUMN property_transactions.location IS 'PostGIS point for transaction location (SRID 4326)';

COMMENT ON FUNCTION find_properties_within_radius IS 'Find all properties within a given radius (meters) from a center point';
COMMENT ON FUNCTION find_neighborhood_by_point IS 'Find the neighborhood that contains a given point';
COMMENT ON FUNCTION calculate_property_distance IS 'Calculate distance in meters between two properties';
