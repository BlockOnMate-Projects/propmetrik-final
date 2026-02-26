-- Seed: Ghana Neighborhood Premiums
-- Description: Location premium factors for Greater Accra and other regions
-- Source: PropMetrik market research, GhIS guidance, professional practice
-- 
-- Premium Factor Interpretation:
--   1.30 = 30% premium (e.g., Airport Residential)
--   1.00 = Baseline (e.g., Achimota)
--   0.85 = 15% discount (e.g., Madina)
--
-- This seed is idempotent (can be run multiple times safely)

-- =====================================================
-- GREATER ACCRA - PRIME+ NEIGHBORHOODS (1.25-1.35)
-- Top 5% of market, highest desirability
-- =====================================================
INSERT INTO neighborhood_premiums 
  (neighborhood, region, city, district, premium_factor, residential_premium, commercial_premium, land_premium, market_tier, development_stage, income_level, data_confidence, notes)
VALUES
  ('Airport Residential', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.30, 1.30, 1.35, 1.40, 'prime_plus', 'mature', 'high', 'high', 
   'Most premium residential area. Near Kotoka Airport, diplomatic missions, high-end hotels.'),
  
  ('Cantonments', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.28, 1.28, 1.25, 1.35, 'prime_plus', 'mature', 'high', 'high',
   'Diplomatic enclave. Embassies, international schools, secure gated compounds.'),
  
  ('Ridge', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.25, 1.25, 1.30, 1.35, 'prime_plus', 'mature', 'high', 'high',
   'Historic premium area. Government institutions, hospitals, low-density residential.')
ON CONFLICT (neighborhood, region) 
DO UPDATE SET 
  premium_factor = EXCLUDED.premium_factor,
  residential_premium = EXCLUDED.residential_premium,
  commercial_premium = EXCLUDED.commercial_premium,
  land_premium = EXCLUDED.land_premium,
  market_tier = EXCLUDED.market_tier,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- GREATER ACCRA - PRIME NEIGHBORHOODS (1.15-1.25)
-- Top 15% of market, highly desirable
-- =====================================================
INSERT INTO neighborhood_premiums 
  (neighborhood, region, city, district, premium_factor, residential_premium, commercial_premium, land_premium, market_tier, development_stage, income_level, data_confidence, notes)
VALUES
  ('Roman Ridge', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.22, 1.22, 1.20, 1.28, 'prime', 'mature', 'high', 'high',
   'High-end residential. Large compounds, established families, quiet streets.'),
  
  ('East Legon', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.20, 1.20, 1.22, 1.25, 'prime', 'mature', 'high', 'high',
   'Popular upscale area. A&C Mall, American House, diverse property mix.'),
  
  ('Labone', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.18, 1.18, 1.20, 1.22, 'prime', 'mature', 'upper-middle', 'high',
   'Established residential. Close to Osu, good amenities, mature neighborhood.'),
  
  ('Osu', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.15, 1.12, 1.25, 1.20, 'prime', 'mature', 'upper-middle', 'high',
   'Commercial/residential mix. Oxford Street, nightlife, retail hub. Commercial premium higher.'),
  
  ('Switchback Road', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.18, 1.18, 1.15, 1.20, 'prime', 'mature', 'high', 'medium',
   'Quiet residential enclave near Cantonments.'),
  
  ('Ringway Estates', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.15, 1.15, 1.18, 1.18, 'prime', 'mature', 'upper-middle', 'medium',
   'Well-planned estate near Osu and Ring Road.')
ON CONFLICT (neighborhood, region) 
DO UPDATE SET 
  premium_factor = EXCLUDED.premium_factor,
  residential_premium = EXCLUDED.residential_premium,
  commercial_premium = EXCLUDED.commercial_premium,
  land_premium = EXCLUDED.land_premium,
  market_tier = EXCLUDED.market_tier,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- GREATER ACCRA - PRIME MINUS NEIGHBORHOODS (1.05-1.15)
-- Good locations with some trade-offs
-- =====================================================
INSERT INTO neighborhood_premiums 
  (neighborhood, region, city, district, premium_factor, residential_premium, commercial_premium, land_premium, market_tier, development_stage, income_level, data_confidence, notes)
VALUES
  ('Dzorwulu', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.12, 1.12, 1.15, 1.15, 'prime_minus', 'mature', 'upper-middle', 'high',
   'Growing middle-class area. Good amenities, improving infrastructure.'),
  
  ('Abelemkpe', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.10, 1.10, 1.12, 1.12, 'prime_minus', 'mature', 'upper-middle', 'medium',
   'Near Ghana Broadcasting, good access, established.'),
  
  ('North Ridge', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.12, 1.12, 1.15, 1.15, 'prime_minus', 'mature', 'upper-middle', 'medium',
   'Adjacent to Ridge, government area, institutional.'),
  
  ('Tesano', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.08, 1.08, 1.10, 1.10, 'prime_minus', 'mature', 'middle', 'high',
   'Residential area, good schools, middle-class families.'),
  
  ('Adjiringanor', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.10, 1.10, 1.08, 1.12, 'prime_minus', 'developing', 'upper-middle', 'medium',
   'Extension of East Legon, newer developments, growing.'),
  
  ('Asylum Down', 'greater_accra', 'Accra', 'Accra Metropolitan', 1.05, 1.05, 1.10, 1.08, 'prime_minus', 'mature', 'middle', 'medium',
   'Central location, mixed use, accessible.')
ON CONFLICT (neighborhood, region) 
DO UPDATE SET 
  premium_factor = EXCLUDED.premium_factor,
  residential_premium = EXCLUDED.residential_premium,
  commercial_premium = EXCLUDED.commercial_premium,
  land_premium = EXCLUDED.land_premium,
  market_tier = EXCLUDED.market_tier,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- GREATER ACCRA - SECONDARY NEIGHBORHOODS (0.95-1.05)
-- Baseline areas, middle market
-- =====================================================
INSERT INTO neighborhood_premiums 
  (neighborhood, region, city, district, premium_factor, residential_premium, commercial_premium, land_premium, market_tier, development_stage, income_level, data_confidence, notes)
VALUES
  ('Achimota', 'greater_accra', 'Accra', 'Ga East', 1.00, 1.00, 1.00, 1.00, 'secondary', 'mature', 'middle', 'high',
   'BASELINE AREA. University, golf club, established residential.'),
  
  ('Dansoman', 'greater_accra', 'Accra', 'Ablekuma West', 0.98, 0.98, 1.00, 0.95, 'secondary', 'mature', 'middle', 'high',
   'Densely populated, strong community, commercial activity.'),
  
  ('Spintex Road', 'greater_accra', 'Tema', 'Tema Metropolitan', 1.02, 1.00, 1.08, 1.05, 'secondary', 'developing', 'upper-middle', 'high',
   'Fast-developing commercial corridor, new estates.'),
  
  ('Sakumono', 'greater_accra', 'Tema', 'Tema Metropolitan', 0.98, 0.98, 0.95, 0.98, 'secondary', 'mature', 'middle', 'medium',
   'Established residential, near Tema, beach access.'),
  
  ('Teshie-Nungua', 'greater_accra', 'Accra', 'Ledzokuku-Krowor', 0.95, 0.95, 0.92, 0.90, 'secondary', 'mature', 'middle', 'medium',
   'Coastal communities, high density, local markets.'),
  
  ('Adenta', 'greater_accra', 'Accra', 'Adentan Municipal', 0.95, 0.95, 0.92, 0.95, 'secondary', 'developing', 'middle', 'high',
   'Suburban growth area, affordable housing, traffic challenges.'),
  
  ('Madina', 'greater_accra', 'Accra', 'Ga East', 0.92, 0.92, 0.95, 0.90, 'secondary', 'mature', 'lower-middle', 'high',
   'High density, commercial hub, university area.'),
  
  ('Dome', 'greater_accra', 'Accra', 'Ga East', 0.95, 0.95, 0.92, 0.95, 'secondary', 'developing', 'middle', 'medium',
   'Growing residential, improving amenities.')
ON CONFLICT (neighborhood, region) 
DO UPDATE SET 
  premium_factor = EXCLUDED.premium_factor,
  residential_premium = EXCLUDED.residential_premium,
  commercial_premium = EXCLUDED.commercial_premium,
  land_premium = EXCLUDED.land_premium,
  market_tier = EXCLUDED.market_tier,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- GREATER ACCRA - TERTIARY NEIGHBORHOODS (0.80-0.95)
-- Developing areas, lower income
-- =====================================================
INSERT INTO neighborhood_premiums 
  (neighborhood, region, city, district, premium_factor, residential_premium, commercial_premium, land_premium, market_tier, development_stage, income_level, data_confidence, notes)
VALUES
  ('Tema Community 1', 'greater_accra', 'Tema', 'Tema Metropolitan', 0.90, 0.90, 0.92, 0.88, 'tertiary', 'mature', 'middle', 'high',
   'Industrial port city, planned community, affordable housing.'),
  
  ('Tema Community 25', 'greater_accra', 'Tema', 'Tema Metropolitan', 0.88, 0.88, 0.85, 0.90, 'tertiary', 'developing', 'lower-middle', 'medium',
   'Newer Tema extension, developing infrastructure.'),
  
  ('Kasoa', 'greater_accra', 'Kasoa', 'Awutu Senya East', 0.82, 0.82, 0.85, 0.80, 'tertiary', 'developing', 'lower-middle', 'high',
   'Rapid growth, affordable, traffic congestion issues.'),
  
  ('Ashaiman', 'greater_accra', 'Ashaiman', 'Ashaiman Municipal', 0.80, 0.80, 0.82, 0.78, 'tertiary', 'mature', 'low', 'high',
   'Industrial workers area, high density, affordable.'),
  
  ('Lashibi', 'greater_accra', 'Tema', 'Tema Metropolitan', 0.88, 0.88, 0.85, 0.90, 'tertiary', 'developing', 'lower-middle', 'medium',
   'Near Spintex, affordable alternative, growing.'),
  
  ('Agbogba', 'greater_accra', 'Accra', 'Ga East', 0.88, 0.88, 0.85, 0.90, 'tertiary', 'developing', 'middle', 'medium',
   'Northern Accra, affordable, improving access.'),
  
  ('Pokuase', 'greater_accra', 'Accra', 'Ga West', 0.85, 0.85, 0.82, 0.88, 'tertiary', 'emerging', 'lower-middle', 'medium',
   'Outer Accra, new developments, interchange area.')
ON CONFLICT (neighborhood, region) 
DO UPDATE SET 
  premium_factor = EXCLUDED.premium_factor,
  residential_premium = EXCLUDED.residential_premium,
  commercial_premium = EXCLUDED.commercial_premium,
  land_premium = EXCLUDED.land_premium,
  market_tier = EXCLUDED.market_tier,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- ASHANTI REGION
-- =====================================================
INSERT INTO neighborhood_premiums 
  (neighborhood, region, city, district, premium_factor, residential_premium, commercial_premium, land_premium, market_tier, development_stage, income_level, data_confidence, notes)
VALUES
  ('Nhyiaeso', 'ashanti', 'Kumasi', 'Kumasi Metropolitan', 1.15, 1.15, 1.12, 1.18, 'prime', 'mature', 'high', 'medium',
   'Premium Kumasi residential, near cultural sites.'),
  
  ('Ahodwo', 'ashanti', 'Kumasi', 'Kumasi Metropolitan', 1.12, 1.12, 1.10, 1.15, 'prime', 'mature', 'high', 'medium',
   'High-end residential, good amenities.'),
  
  ('Danyame', 'ashanti', 'Kumasi', 'Kumasi Metropolitan', 1.08, 1.08, 1.05, 1.10, 'prime_minus', 'mature', 'upper-middle', 'medium',
   'Established residential area.'),
  
  ('Adum', 'ashanti', 'Kumasi', 'Kumasi Metropolitan', 1.00, 0.95, 1.15, 1.05, 'secondary', 'mature', 'middle', 'medium',
   'Central business district, commercial hub.'),
  
  ('Bantama', 'ashanti', 'Kumasi', 'Kumasi Metropolitan', 0.92, 0.92, 0.95, 0.90, 'secondary', 'mature', 'lower-middle', 'medium',
   'Dense urban area, market activities.'),
  
  ('Suame', 'ashanti', 'Kumasi', 'Kumasi Metropolitan', 0.85, 0.82, 0.92, 0.80, 'tertiary', 'mature', 'lower-middle', 'medium',
   'Industrial area, magazine cluster.')
ON CONFLICT (neighborhood, region) 
DO UPDATE SET 
  premium_factor = EXCLUDED.premium_factor,
  residential_premium = EXCLUDED.residential_premium,
  commercial_premium = EXCLUDED.commercial_premium,
  land_premium = EXCLUDED.land_premium,
  market_tier = EXCLUDED.market_tier,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- TENURE RISK ADJUSTMENTS
-- Ghana-specific land tenure risks per GhIS guidance
-- =====================================================
INSERT INTO tenure_risk_adjustments 
  (tenure_type, tenure_label, risk_adjustment_pct, risk_level, description, documentation_required, typical_issues)
VALUES
  ('freehold', 'Freehold (Registered)', 0, 'low', 
   'Outright ownership registered at Lands Commission. Highest security of tenure.',
   ARRAY['Land Title Certificate', 'Site Plan', 'Indenture'],
   ARRAY['Ensure registration is complete', 'Check for encumbrances']),
  
  ('leasehold_99', 'Leasehold (99+ years)', -3, 'low',
   'Long leasehold with substantial remaining term. Minimal risk.',
   ARRAY['Lease Agreement', 'Ground Rent Receipts', 'Site Plan'],
   ARRAY['Verify remaining term', 'Check ground rent status']),
  
  ('leasehold_50_99', 'Leasehold (50-99 years)', -8, 'medium',
   'Medium-term leasehold. Some term uncertainty.',
   ARRAY['Lease Agreement', 'Ground Rent Receipts', 'Site Plan'],
   ARRAY['Term renewal conditions', 'Ground rent escalation']),
  
  ('leasehold_under_50', 'Leasehold (Under 50 years)', -15, 'medium-high',
   'Short leasehold with limited remaining term. Affects mortgageability.',
   ARRAY['Lease Agreement', 'Ground Rent Receipts', 'Site Plan'],
   ARRAY['Renewal uncertainty', 'Limited financing options']),
  
  ('stool_land_documented', 'Stool Land (Documented)', -12, 'medium',
   'Traditional stool land with proper documentation from chief and Lands Commission.',
   ARRAY['Allocation Letter from Stool', 'Site Plan', 'Concurrence from Lands Commission'],
   ARRAY['Chieftaincy disputes', 'Multiple allocations', 'Succession issues']),
  
  ('stool_land_undocumented', 'Stool Land (Undocumented)', -25, 'high',
   'Traditional stool land without proper documentation. High dispute risk.',
   ARRAY['Verbal agreement only', 'No formal documentation'],
   ARRAY['No legal protection', 'High dispute risk', 'Cannot be mortgaged']),
  
  ('family_land_documented', 'Family Land (Documented)', -18, 'high',
   'Family-owned land with documentation but inherent succession risks.',
   ARRAY['Family Agreement', 'Statutory Declaration', 'Site Plan'],
   ARRAY['Family disputes', 'Multiple claimants', 'Succession challenges']),
  
  ('family_land_undocumented', 'Family Land (Undocumented)', -30, 'very_high',
   'Family land without proper documentation. Very high risk.',
   ARRAY['Verbal agreement', 'No formal documentation'],
   ARRAY['No legal protection', 'Very high dispute risk', 'Cannot be financed']),
  
  ('government_lease', 'Government Lease', -5, 'low',
   'Lease from government (Lands Commission). Generally secure.',
   ARRAY['Government Lease', 'Site Plan', 'Ground Rent Receipts'],
   ARRAY['Renewal conditions', 'Development conditions']),
  
  ('customary_freehold', 'Customary Freehold', -10, 'medium',
   'Customary land grant that has been converted to freehold.',
   ARRAY['Customary Grant', 'Conversion Documents', 'Land Certificate'],
   ARRAY['Historical claims', 'Documentation gaps'])
ON CONFLICT (tenure_type) 
DO UPDATE SET 
  tenure_label = EXCLUDED.tenure_label,
  risk_adjustment_pct = EXCLUDED.risk_adjustment_pct,
  risk_level = EXCLUDED.risk_level,
  description = EXCLUDED.description,
  documentation_required = EXCLUDED.documentation_required,
  typical_issues = EXCLUDED.typical_issues,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Verify data was loaded correctly
DO $$
DECLARE
  premium_count INTEGER;
  tenure_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO premium_count FROM neighborhood_premiums;
  SELECT COUNT(*) INTO tenure_count FROM tenure_risk_adjustments;
  
  RAISE NOTICE 'Loaded % neighborhood premiums', premium_count;
  RAISE NOTICE 'Loaded % tenure risk adjustments', tenure_count;
END $$;
