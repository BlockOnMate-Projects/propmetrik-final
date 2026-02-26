-- Seed: Ghana neighborhoods and initial data
-- Description: Seed data for Ghana market regions and neighborhoods
-- This seed is idempotent (can be run multiple times safely)

-- =====================================================
-- GREATER ACCRA NEIGHBORHOODS
-- =====================================================
INSERT INTO neighborhoods (name, slug, region, district, city, amenities, characteristics)
VALUES
  -- Accra Central
  ('Osu', 'osu', 'greater_accra', 'Accra Metropolitan', 'Accra', 
   '["restaurants", "nightlife", "shopping", "banks", "hospitals"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "upper-middle", "development_stage": "mature"}'::jsonb),
  
  ('Cantonments', 'cantonments', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["embassies", "international_schools", "hospitals", "parks"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "high", "development_stage": "mature"}'::jsonb),
  
  ('East Legon', 'east-legon', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["shopping_malls", "restaurants", "schools", "hospitals", "banks"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "high", "development_stage": "mature"}'::jsonb),
  
  ('Airport Residential', 'airport-residential', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["airport", "hotels", "embassies", "restaurants"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "high", "development_stage": "mature"}'::jsonb),
  
  ('Labone', 'labone', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["restaurants", "parks", "schools", "shopping"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "upper-middle", "development_stage": "mature"}'::jsonb),
  
  ('Ridge', 'ridge', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["hospitals", "government_offices", "embassies"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "high", "development_stage": "mature"}'::jsonb),
  
  ('Roman Ridge', 'roman-ridge', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["schools", "parks", "shopping"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "high", "development_stage": "mature"}'::jsonb),
  
  ('Dzorwulu', 'dzorwulu', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["shopping_malls", "restaurants", "banks", "hospitals"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "upper-middle", "development_stage": "mature"}'::jsonb),
  
  ('Abelemkpe', 'abelemkpe', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["schools", "hospitals", "markets"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Tesano', 'tesano', 'greater_accra', 'Accra Metropolitan', 'Accra',
   '["markets", "schools", "churches"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "mature"}'::jsonb),

  -- Tema
  ('Tema Community 1', 'tema-community-1', 'greater_accra', 'Tema Metropolitan', 'Tema',
   '["port", "industrial", "markets", "schools"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Tema Community 25', 'tema-community-25', 'greater_accra', 'Tema Metropolitan', 'Tema',
   '["schools", "markets", "parks"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "upper-middle", "development_stage": "developing"}'::jsonb),
  
  ('Sakumono', 'sakumono', 'greater_accra', 'Tema Metropolitan', 'Tema',
   '["beach", "schools", "markets"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "developing"}'::jsonb),

  -- Spintex
  ('Spintex Road', 'spintex-road', 'greater_accra', 'Tema West', 'Accra',
   '["shopping_malls", "restaurants", "hotels", "offices"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "upper-middle", "development_stage": "developing"}'::jsonb),
  
  ('Baatsona', 'baatsona', 'greater_accra', 'Tema West', 'Accra',
   '["markets", "schools", "offices"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "developing"}'::jsonb),

  -- Madina/Legon Area
  ('Madina', 'madina', 'greater_accra', 'La-Nkwantanang-Madina', 'Accra',
   '["markets", "schools", "hospitals", "transport_hub"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Legon', 'legon', 'greater_accra', 'La-Nkwantanang-Madina', 'Accra',
   '["university", "research_centers", "botanical_gardens"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "upper-middle", "development_stage": "mature"}'::jsonb),
  
  ('Adenta', 'adenta', 'greater_accra', 'Adentan', 'Accra',
   '["schools", "markets", "hospitals"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "developing"}'::jsonb),

  -- Kasoa/Awutu Senya
  ('Kasoa', 'kasoa', 'greater_accra', 'Awutu Senya East', 'Kasoa',
   '["markets", "transport_hub", "schools"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "lower-middle", "development_stage": "rapidly_developing"}'::jsonb)
ON CONFLICT (slug, region) DO UPDATE SET
  amenities = EXCLUDED.amenities,
  characteristics = EXCLUDED.characteristics,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- KUMASI METRO NEIGHBORHOODS
-- =====================================================
INSERT INTO neighborhoods (name, slug, region, district, city, amenities, characteristics)
VALUES
  ('Adum', 'adum', 'kumasi_metro', 'Kumasi Metropolitan', 'Kumasi',
   '["central_market", "banks", "commercial_hub", "transport"]'::jsonb,
   '{"property_type_mix": "commercial", "income_level": "mixed", "development_stage": "mature"}'::jsonb),
  
  ('Nhyiaeso', 'nhyiaeso', 'kumasi_metro', 'Kumasi Metropolitan', 'Kumasi',
   '["schools", "residential", "markets"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "upper-middle", "development_stage": "mature"}'::jsonb),
  
  ('Santasi', 'santasi', 'kumasi_metro', 'Kumasi Metropolitan', 'Kumasi',
   '["schools", "markets", "hospitals"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Asokwa', 'asokwa', 'kumasi_metro', 'Kumasi Metropolitan', 'Kumasi',
   '["industrial", "markets", "schools"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Ahodwo', 'ahodwo', 'kumasi_metro', 'Kumasi Metropolitan', 'Kumasi',
   '["residential", "schools", "shopping"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "high", "development_stage": "mature"}'::jsonb),
  
  ('Danyame', 'danyame', 'kumasi_metro', 'Kumasi Metropolitan', 'Kumasi',
   '["residential", "schools"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "upper-middle", "development_stage": "mature"}'::jsonb),
  
  ('KNUST Campus', 'knust-campus', 'kumasi_metro', 'Oforikrom', 'Kumasi',
   '["university", "research", "students"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Tech Junction', 'tech-junction', 'kumasi_metro', 'Oforikrom', 'Kumasi',
   '["commercial", "transport_hub", "markets"]'::jsonb,
   '{"property_type_mix": "commercial", "income_level": "middle", "development_stage": "mature"}'::jsonb)
ON CONFLICT (slug, region) DO UPDATE SET
  amenities = EXCLUDED.amenities,
  characteristics = EXCLUDED.characteristics,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- EASTERN REGION NEIGHBORHOODS
-- =====================================================
INSERT INTO neighborhoods (name, slug, region, district, city, amenities, characteristics)
VALUES
  ('Koforidua Central', 'koforidua-central', 'eastern', 'New Juaben', 'Koforidua',
   '["markets", "banks", "government_offices", "hospitals"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Effiduase', 'effiduase', 'eastern', 'New Juaben', 'Koforidua',
   '["residential", "schools", "markets"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "developing"}'::jsonb),
  
  ('Nkawkaw', 'nkawkaw', 'eastern', 'Kwahu West', 'Nkawkaw',
   '["transport_hub", "markets", "schools"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "developing"}'::jsonb)
ON CONFLICT (slug, region) DO UPDATE SET
  amenities = EXCLUDED.amenities,
  characteristics = EXCLUDED.characteristics,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- WESTERN CLUSTER NEIGHBORHOODS
-- =====================================================
INSERT INTO neighborhoods (name, slug, region, district, city, amenities, characteristics)
VALUES
  ('Takoradi CBD', 'takoradi-cbd', 'western_cluster', 'Sekondi-Takoradi', 'Takoradi',
   '["port", "markets", "banks", "commercial"]'::jsonb,
   '{"property_type_mix": "commercial", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('Beach Road', 'beach-road', 'western_cluster', 'Sekondi-Takoradi', 'Takoradi',
   '["beach", "hotels", "restaurants", "residential"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "upper-middle", "development_stage": "developing"}'::jsonb),
  
  ('Anaji', 'anaji', 'western_cluster', 'Sekondi-Takoradi', 'Takoradi',
   '["shopping_mall", "schools", "residential"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "upper-middle", "development_stage": "mature"}'::jsonb),
  
  ('Sekondi', 'sekondi', 'western_cluster', 'Sekondi-Takoradi', 'Sekondi',
   '["historic", "port", "markets"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  -- Cape Coast
  ('Cape Coast Central', 'cape-coast-central', 'western_cluster', 'Cape Coast Metropolitan', 'Cape Coast',
   '["castle", "tourism", "university", "markets"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "mature"}'::jsonb),
  
  ('UCC Campus Area', 'ucc-campus-area', 'western_cluster', 'Cape Coast Metropolitan', 'Cape Coast',
   '["university", "students", "residential"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "developing"}'::jsonb)
ON CONFLICT (slug, region) DO UPDATE SET
  amenities = EXCLUDED.amenities,
  characteristics = EXCLUDED.characteristics,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- NORTHERN CLUSTER NEIGHBORHOODS
-- =====================================================
INSERT INTO neighborhoods (name, slug, region, district, city, amenities, characteristics)
VALUES
  ('Tamale Central', 'tamale-central', 'northern_cluster', 'Tamale Metropolitan', 'Tamale',
   '["markets", "banks", "hospitals", "government_offices"]'::jsonb,
   '{"property_type_mix": "mixed", "income_level": "middle", "development_stage": "developing"}'::jsonb),
  
  ('Lamashegu', 'lamashegu', 'northern_cluster', 'Tamale Metropolitan', 'Tamale',
   '["residential", "markets", "schools"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "developing"}'::jsonb),
  
  ('Kalpohin', 'kalpohin', 'northern_cluster', 'Tamale Metropolitan', 'Tamale',
   '["residential", "schools"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "upper-middle", "development_stage": "developing"}'::jsonb),
  
  ('Vittin', 'vittin', 'northern_cluster', 'Tamale Metropolitan', 'Tamale',
   '["residential", "markets"]'::jsonb,
   '{"property_type_mix": "residential", "income_level": "middle", "development_stage": "developing"}'::jsonb)
ON CONFLICT (slug, region) DO UPDATE SET
  amenities = EXCLUDED.amenities,
  characteristics = EXCLUDED.characteristics,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- UPDATE NEIGHBORHOOD STATISTICS
-- =====================================================
-- This would typically be run by a scheduled job to keep stats current
-- For now, set initial values
UPDATE neighborhoods SET
  property_count = 0,
  avg_price_sale = NULL,
  avg_price_rental = NULL,
  avg_price_per_sqm = NULL
WHERE property_count IS NULL;
