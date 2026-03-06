-- Migration: Add location_accuracy column to properties and crm_properties
-- This column stores the accuracy/confidence level of geocoded coordinates
-- Values: 'digital_address', 'rooftop', 'landmark', 'city', 'approximate', 'city_level'

-- Add location_accuracy to crm_properties
ALTER TABLE crm_properties 
ADD COLUMN IF NOT EXISTS location_accuracy VARCHAR(50);

-- Add location_accuracy to properties table (all partitions)
DO $$
DECLARE
    partition_name TEXT;
BEGIN
    FOR partition_name IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'properties_%'
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS location_accuracy VARCHAR(50)', partition_name);
    END LOOP;
END $$;

-- Add index on location_accuracy for filtering
CREATE INDEX IF NOT EXISTS idx_crm_properties_location_accuracy 
ON crm_properties(location_accuracy) 
WHERE location_accuracy IS NOT NULL;

COMMENT ON COLUMN crm_properties.location_accuracy IS 'Geocoding accuracy level: digital_address, rooftop, landmark, city, approximate, city_level';
