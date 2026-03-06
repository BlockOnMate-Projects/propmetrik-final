-- =====================================================
-- Migration 027: Add rental_market_analysis column to valuations
-- Stores rental comparable analysis data for income approach
-- =====================================================

-- Add rental_market_analysis JSONB column
ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS rental_market_analysis JSONB DEFAULT NULL;

-- Add index for querying by rental analysis presence
CREATE INDEX IF NOT EXISTS idx_valuations_rental_market_analysis 
ON valuations USING GIN (rental_market_analysis jsonb_path_ops)
WHERE rental_market_analysis IS NOT NULL;

-- Comment on column
COMMENT ON COLUMN valuations.rental_market_analysis IS 'Rental comparable analysis data: comparables array, indicated_rent_monthly, indicated_rent_per_sqm, methodology, confidence, search_criteria';

-- Example structure:
-- {
--   "comparables": [
--     {
--       "id": "uuid",
--       "address": "string",
--       "asking_rent": 2500,
--       "adjusted_rent": 2400,
--       "adjustments": { "size": -2, "location": 1, ... },
--       "total_adjustment": -1,
--       "bedrooms": 3,
--       "gfa_sqm": 150,
--       "distance_km": 0.8,
--       "similarity_score": 85
--     }
--   ],
--   "indicated_rent_monthly": 2450,
--   "indicated_rent_per_sqm": 16.33,
--   "methodology": "quality_weighted",
--   "confidence": 82,
--   "comparables_count": 5,
--   "search_criteria": {
--     "radius_km": 3,
--     "max_age_months": 6,
--     "bedrooms_range": [2, 4]
--   },
--   "analyzed_at": "2026-01-12T19:00:00.000Z"
-- }
