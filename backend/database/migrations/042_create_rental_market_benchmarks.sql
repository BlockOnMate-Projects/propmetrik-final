-- Migration: Create rental_market_benchmarks table
-- Date: 2026-01-12
-- Purpose: Store computed rental market statistics from Data Hub listings

-- Create the benchmarks table
CREATE TABLE IF NOT EXISTS rental_market_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_name VARCHAR(100) NOT NULL,
  area_type VARCHAR(20) NOT NULL DEFAULT 'district', -- 'district', 'city', 'region'
  property_type VARCHAR(50), -- NULL means all property types combined
  
  -- Computed statistics (all in GHS, converted from USD at compute time)
  listing_count INTEGER NOT NULL,
  avg_rent_monthly DECIMAL(12, 2),
  median_rent_monthly DECIMAL(12, 2),
  min_rent_monthly DECIMAL(12, 2),
  max_rent_monthly DECIMAL(12, 2),
  
  -- Per sqm metrics (for size-based estimation)
  avg_rent_per_sqm DECIMAL(8, 2),
  median_rent_per_sqm DECIMAL(8, 2),
  
  -- Breakdown by bedrooms: {"1": {"avg": 3500, "median": 3200, "count": 15}, "2": {...}}
  rent_by_bedrooms JSONB,
  
  -- Market health indicators
  vacancy_rate_estimate DECIMAL(5, 2), -- Estimated from listing duration/turnover
  avg_days_on_market INTEGER,
  
  -- Data provenance
  data_source VARCHAR(50) DEFAULT 'computed', -- 'computed', 'manual', 'research'
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_start_date DATE, -- Oldest listing included in computation
  data_end_date DATE,   -- Newest listing included in computation
  
  -- Prevent duplicate entries
  UNIQUE(area_name, area_type, property_type)
);

-- Index for fast lookups by area
CREATE INDEX IF NOT EXISTS idx_rental_benchmarks_area 
ON rental_market_benchmarks(area_name, area_type);

-- Index for filtering by property type
CREATE INDEX IF NOT EXISTS idx_rental_benchmarks_property_type 
ON rental_market_benchmarks(property_type) WHERE property_type IS NOT NULL;

-- Add table comment
COMMENT ON TABLE rental_market_benchmarks IS 
'Computed rental market benchmarks from Data Hub listings. 
Refreshed periodically via compute_rental_benchmarks function.
Used as fallback when insufficient rental comparables found.';

-- Column comments
COMMENT ON COLUMN rental_market_benchmarks.area_type IS 'Hierarchy level: district (most specific), city, region';
COMMENT ON COLUMN rental_market_benchmarks.rent_by_bedrooms IS 'JSONB with bedroom count as key and stats object as value';
COMMENT ON COLUMN rental_market_benchmarks.vacancy_rate_estimate IS 'Estimated vacancy based on listing turnover patterns';
