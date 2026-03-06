-- Add document image and capture metadata to esign_envelopes
-- This ensures consistent field positioning between capture and display

-- Add columns for storing the pre-rendered document image and capture dimensions
ALTER TABLE esign_envelopes 
ADD COLUMN IF NOT EXISTS document_image_url TEXT,           -- Base64 data URL of the rendered document image
ADD COLUMN IF NOT EXISTS capture_width INTEGER DEFAULT 1224, -- Width in pixels (default: 816 * 1.5 scale)
ADD COLUMN IF NOT EXISTS capture_height INTEGER;             -- Height in pixels of the captured document

-- Add comments for documentation
COMMENT ON COLUMN esign_envelopes.document_image_url IS 'Pre-rendered document image (base64 data URL) for consistent field positioning';
COMMENT ON COLUMN esign_envelopes.capture_width IS 'Width in pixels of the captured document image (field positions are in this coordinate space)';
COMMENT ON COLUMN esign_envelopes.capture_height IS 'Height in pixels of the captured document image';
