-- Migration: 034_floor_plan_images.sql
-- Description: Add image storage for floor plans to display in report appendices
-- Author: PropMetrik Engineering
-- Date: 2025-01-27

-- ============================================================================
-- 1. ADD IMAGE COLUMNS TO FLOOR PLANS TABLE
-- ============================================================================

-- Add image_url column to store the MinIO path for the rendered floor plan PNG
ALTER TABLE valuation_floor_plans
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add image metadata columns
ALTER TABLE valuation_floor_plans
ADD COLUMN IF NOT EXISTS image_generated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE valuation_floor_plans
ADD COLUMN IF NOT EXISTS image_width INTEGER;

ALTER TABLE valuation_floor_plans
ADD COLUMN IF NOT EXISTS image_height INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN valuation_floor_plans.image_url IS 'MinIO path to the rendered floor plan PNG image (e.g., minio://propmetrik-floor-plans/valuation-id/floor-0.png)';
COMMENT ON COLUMN valuation_floor_plans.image_generated_at IS 'Timestamp when the image was last generated/updated';
COMMENT ON COLUMN valuation_floor_plans.image_width IS 'Width of the generated image in pixels';
COMMENT ON COLUMN valuation_floor_plans.image_height IS 'Height of the generated image in pixels';

-- ============================================================================
-- 2. CREATE INDEX FOR EFFICIENT LOOKUPS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_floor_plans_image_url 
ON valuation_floor_plans(image_url) 
WHERE image_url IS NOT NULL;

-- ============================================================================
-- 3. VERIFY CHANGES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 034_floor_plan_images.sql completed successfully';
  RAISE NOTICE 'Added columns: image_url, image_generated_at, image_width, image_height to valuation_floor_plans';
END $$;
