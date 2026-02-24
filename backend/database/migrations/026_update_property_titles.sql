-- Migration 026: Update generic property titles to use address
-- This fixes existing valuations that have "Subject Property - {city}" as title

-- Update properties that have a generic title pattern but have actual address data
UPDATE properties
SET title = COALESCE(
    NULLIF(address_street, ''),
    NULLIF(digital_address, ''),
    'Property in ' || COALESCE(address_city, 'Unknown Location')
)
WHERE title LIKE 'Subject Property - %'
  AND (address_street IS NOT NULL AND address_street != '')
  OR (digital_address IS NOT NULL AND digital_address != '');

-- Log the update
SELECT 
    'Updated ' || COUNT(*) || ' properties with descriptive titles' AS result
FROM properties
WHERE title NOT LIKE 'Subject Property - %';

COMMENT ON COLUMN properties.title IS 'Property title - defaults to address_street if available, otherwise digital_address, otherwise "Property in {city}"';
