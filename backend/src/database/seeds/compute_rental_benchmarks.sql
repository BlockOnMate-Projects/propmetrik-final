-- Compute Rental Market Benchmarks from Data Hub Properties
-- This script aggregates statistics from actual rental listings
-- Run periodically (e.g., weekly) to refresh benchmarks
-- Date: 2026-01-12

-- Clear existing computed benchmarks (preserve any manual entries)
DELETE FROM rental_market_benchmarks WHERE data_source = 'computed';

-- Insert aggregated benchmarks by district (all property types combined)
INSERT INTO rental_market_benchmarks (
  area_name, area_type, property_type, listing_count,
  avg_rent_monthly, median_rent_monthly, min_rent_monthly, max_rent_monthly,
  avg_rent_per_sqm, rent_by_bedrooms, data_source, computed_at
)
SELECT 
  COALESCE(address_district, address_city, 'Unknown') as area_name,
  CASE WHEN address_district IS NOT NULL THEN 'district' ELSE 'city' END as area_type,
  NULL as property_type,
  COUNT(*) as listing_count,
  ROUND(AVG(CASE WHEN price_currency = 'USD' THEN price * 16.0 ELSE price END)::numeric, 2),
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN price_currency = 'USD' THEN price * 16.0 ELSE price END)::numeric, 2),
  ROUND(MIN(CASE WHEN price_currency = 'USD' THEN price * 16.0 ELSE price END)::numeric, 2),
  ROUND(MAX(CASE WHEN price_currency = 'USD' THEN price * 16.0 ELSE price END)::numeric, 2),
  ROUND(AVG(CASE WHEN built_area_sqm > 0 THEN (CASE WHEN price_currency = 'USD' THEN price * 16.0 ELSE price END) / built_area_sqm ELSE NULL END)::numeric, 2),
  -- Compute rent by bedrooms as JSONB
  (
    SELECT jsonb_object_agg(
      COALESCE(p2.bedrooms, 0)::text,
      jsonb_build_object(
        'count', COUNT(*),
        'avg', ROUND(AVG(CASE WHEN p2.price_currency = 'USD' THEN p2.price * 16.0 ELSE p2.price END)::numeric, 0),
        'median', ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN p2.price_currency = 'USD' THEN p2.price * 16.0 ELSE p2.price END)::numeric, 0)
      )
    )
    FROM properties p2
    WHERE p2.transaction_type = 'rental'
      AND p2.price IS NOT NULL AND p2.price > 0
      AND COALESCE(p2.address_district, p2.address_city, 'Unknown') = COALESCE(p.address_district, p.address_city, 'Unknown')
    GROUP BY COALESCE(p2.bedrooms, 0)
  ),
  'computed', NOW()
FROM properties p
WHERE transaction_type = 'rental' AND price IS NOT NULL AND price > 0
GROUP BY 
  COALESCE(address_district, address_city, 'Unknown'),
  CASE WHEN address_district IS NOT NULL THEN 'district' ELSE 'city' END
HAVING COUNT(*) >= 3
ORDER BY COUNT(*) DESC;

-- Also insert property-type specific benchmarks for major areas
INSERT INTO rental_market_benchmarks (
  area_name,
  area_type,
  property_type,
  listing_count,
  avg_rent_monthly,
  median_rent_monthly,
  min_rent_monthly,
  max_rent_monthly,
  avg_rent_per_sqm,
  data_source,
  computed_at
)
SELECT 
  COALESCE(address_district, address_city, 'Unknown') as area_name,
  'district' as area_type,
  property_type,
  COUNT(*) as listing_count,
  
  ROUND(AVG(
    CASE 
      WHEN price_currency = 'USD' THEN price * 16.0 
      ELSE price 
    END
  )::numeric, 2) as avg_rent_monthly,
  
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY CASE 
      WHEN price_currency = 'USD' THEN price * 16.0 
      ELSE price 
    END
  )::numeric, 2) as median_rent_monthly,
  
  ROUND(MIN(
    CASE 
      WHEN price_currency = 'USD' THEN price * 16.0 
      ELSE price 
    END
  )::numeric, 2) as min_rent_monthly,
  
  ROUND(MAX(
    CASE 
      WHEN price_currency = 'USD' THEN price * 16.0 
      ELSE price 
    END
  )::numeric, 2) as max_rent_monthly,
  
  ROUND(AVG(
    CASE 
      WHEN built_area_sqm > 0 THEN 
        CASE 
          WHEN price_currency = 'USD' THEN price * 16.0 
          ELSE price 
        END / built_area_sqm
      ELSE NULL
    END
  )::numeric, 2) as avg_rent_per_sqm,
  
  'computed' as data_source,
  NOW() as computed_at

FROM properties
WHERE transaction_type = 'rental'
  AND price IS NOT NULL
  AND price > 0
  AND property_type IS NOT NULL
GROUP BY 
  COALESCE(address_district, address_city, 'Unknown'),
  property_type
HAVING COUNT(*) >= 3
ORDER BY COUNT(*) DESC;

-- Output summary
SELECT 
  'Rental Market Benchmarks Computed' as status,
  COUNT(*) as total_benchmarks,
  SUM(listing_count) as total_listings_processed,
  COUNT(DISTINCT area_name) as unique_areas
FROM rental_market_benchmarks 
WHERE data_source = 'computed';
