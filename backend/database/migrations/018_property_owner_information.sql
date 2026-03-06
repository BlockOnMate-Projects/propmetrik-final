-- =====================================================
-- 018_property_owner_information.sql
-- Add Property Owner Information Fields
-- 
-- Adds columns to track property owner contact information
-- for subject properties in valuations.
-- =====================================================

-- Add owner information columns to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS owner_address TEXT,
ADD COLUMN IF NOT EXISTS owner_contact_preference VARCHAR(20) DEFAULT 'email' CHECK (owner_contact_preference IN ('email', 'phone', 'mail', 'any'));

-- Add indexes for searching and filtering
CREATE INDEX IF NOT EXISTS idx_properties_owner_name ON properties(owner_name);
CREATE INDEX IF NOT EXISTS idx_properties_owner_email ON properties(owner_email);

-- Add comments for documentation
COMMENT ON COLUMN properties.owner_name IS 'Full name of the property owner';
COMMENT ON COLUMN properties.owner_email IS 'Primary email address of the property owner';
COMMENT ON COLUMN properties.owner_phone IS 'Primary phone number of the property owner';
COMMENT ON COLUMN properties.owner_address IS 'Mailing/contact address of the property owner (may differ from property address)';
COMMENT ON COLUMN properties.owner_contact_preference IS 'Preferred method of contact: email, phone, mail, or any';

-- Add updated_at trigger update (if properties table doesn't already have one)
-- This ensures the updated_at timestamp is automatically maintained
DO $$
BEGIN
    -- Check if trigger already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_trigger 
        WHERE tgname = 'update_properties_updated_at'
    ) THEN
        -- Create the trigger if it doesn't exist
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS '
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        ' LANGUAGE plpgsql;

        CREATE TRIGGER update_properties_updated_at
        BEFORE UPDATE ON properties
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;