-- Migration: Add Geocoding Quality Indicators
-- Version: 013
-- Description: Add columns to track coordinate source and geocoding confidence for properties

-- Add coordinates_source column to track where coordinates came from
-- Values: 'original' | 'ghana_post_gps' | 'street_landmark' | 'neighborhood' | 'city' | 'geocoded'
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS coordinates_source VARCHAR(30);

-- Add geocoding_confidence column to track confidence score (0-1)
-- 1.0 = original from listing, 0.95 = Ghana Post GPS, 0.75 = street/landmark, 0.5 = neighborhood, 0.25 = city
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS geocoding_confidence DECIMAL(3,2);

-- Add nearby_landmarks column to store extracted landmarks for geocoding fallback
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS nearby_landmarks TEXT[];

-- Add street_name column for extracted street names
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS street_name VARCHAR(255);

-- Create index on coordinates_source for filtering
CREATE INDEX IF NOT EXISTS idx_properties_coordinates_source 
ON properties(coordinates_source);

-- Create index on geocoding_confidence for quality filtering
CREATE INDEX IF NOT EXISTS idx_properties_geocoding_confidence 
ON properties(geocoding_confidence);

-- Add comment to document the columns
COMMENT ON COLUMN properties.coordinates_source IS 'Source of coordinates: original, ghana_post_gps, street_landmark, neighborhood, city, or geocoded';
COMMENT ON COLUMN properties.geocoding_confidence IS 'Confidence score for geocoding (0-1). Higher = more accurate location';
COMMENT ON COLUMN properties.nearby_landmarks IS 'Array of nearby landmark names extracted from listing for geocoding';
COMMENT ON COLUMN properties.street_name IS 'Street name extracted from listing address';

-- Update existing properties with default values based on current location_accuracy
UPDATE properties 
SET 
    coordinates_source = CASE 
        WHEN location_verified = true THEN 'original'
        WHEN digital_address IS NOT NULL THEN 'ghana_post_gps'
        WHEN location_accuracy >= 0.9 THEN 'geocoded'
        WHEN location_accuracy >= 0.7 THEN 'street_landmark'
        WHEN location_accuracy >= 0.5 THEN 'neighborhood'
        ELSE 'city'
    END,
    geocoding_confidence = COALESCE(location_accuracy, 0.5)
WHERE coordinates_source IS NULL;
