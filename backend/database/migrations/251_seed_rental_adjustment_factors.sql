-- 251_seed_rental_adjustment_factors.sql
-- Seed the market-rent comparison adjustment factors into valuation_adjustment_factors,
-- so the rental valuation engine reads them from config instead of hardcoding constants.
-- Global defaults (region NULL, property_type NULL); region/type-specific rows can be added later
-- and the engine will prefer the most specific match. Idempotent via NOT EXISTS guards.

INSERT INTO valuation_adjustment_factors
  (id, region, property_type, adjustment_category, adjustment_factor,
   base_adjustment_percent, unit, min_value, max_value,
   calculation_method, source_type, source_reference, confidence_level,
   effective_date, is_active, created_at)
SELECT gen_random_uuid(), NULL, NULL, 'rental_market', f.factor,
       f.pct, f.unit, f.min_v, f.max_v,
       'per_unit_difference', 'platform_default',
       'PropMetrik rental valuation methodology (GhIS market-rent comparison)', 0.70,
       CURRENT_DATE, TRUE, NOW()
FROM (VALUES
  -- factor,        %/unit, unit,            min cap %, max cap %
  ('bedrooms',       3.0,   'per_bedroom',   -15.0, 15.0),
  ('bathrooms',      2.0,   'per_bathroom',  -10.0, 10.0),
  ('furnishing',     8.0,   'per_level',     -16.0, 16.0),
  ('age',            0.3,   'per_year',      -10.0, 10.0),
  ('size',           0.0,   'per_sqm_basis', -25.0, 25.0)
) AS f(factor, pct, unit, min_v, max_v)
WHERE NOT EXISTS (
  SELECT 1 FROM valuation_adjustment_factors v
  WHERE v.adjustment_category = 'rental_market'
    AND v.adjustment_factor = f.factor
    AND v.region IS NULL AND v.property_type IS NULL
    AND v.source_type = 'platform_default'
);
