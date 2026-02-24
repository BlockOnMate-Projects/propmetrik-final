-- Seed Data: Construction Costs for Ghana
-- Description: Sample construction materials, labor rates, and equipment prices across Ghana's 5 regions
-- Created: 2026-01-06
-- Purpose: Provide realistic test data for construction cost module

-- Clear existing data
TRUNCATE TABLE material_prices, labor_rates, equipment_rates, construction_cost_indices CASCADE;

-- =====================================================
-- MATERIAL PRICES SEED DATA
-- Realistic prices as of January 2026 across Ghana's regions
-- Using actual table structure: category, material_name, price_ghs, unit, region, effective_date, source_type
-- =====================================================

INSERT INTO material_prices (
  category, material_name, brand, specification, 
  price_ghs, unit, region, supplier_type, supplier_name,
  effective_date, source_type, notes
) VALUES

-- CEMENT PRICES
('cement', 'Portland Cement (50kg bag)', 'GHACEM', 'Grade 42.5N, 50kg bag', 68.50, 'bag', 'greater_accra', 'retail', 'Melcom Hardware', '2026-01-01', 'survey', 'Accra retail price'),
('cement', 'Portland Cement (50kg bag)', 'GHACEM', 'Grade 42.5N, 50kg bag', 65.00, 'bag', 'kumasi_metro', 'retail', 'Palace Hardware', '2026-01-01', 'survey', 'Kumasi retail price'),
('cement', 'Portland Cement (50kg bag)', 'GHACEM', 'Grade 42.5N, 50kg bag', 64.00, 'bag', 'eastern', 'retail', 'Eastern Hardware', '2026-01-01', 'survey', 'Eastern region retail'),
('cement', 'Portland Cement (50kg bag)', 'GHACEM', 'Grade 42.5N, 50kg bag', 66.00, 'bag', 'western_cluster', 'retail', 'Western Supply Co', '2026-01-01', 'survey', 'Western region retail'),
('cement', 'Portland Cement (50kg bag)', 'GHACEM', 'Grade 42.5N, 50kg bag', 62.00, 'bag', 'northern_cluster', 'retail', 'Northern Hardware', '2026-01-01', 'survey', 'Northern region retail'),

-- Wholesale cement prices (lower)
('cement', 'Portland Cement (50kg bag)', 'GHACEM', 'Grade 42.5N, 50kg bag', 58.50, 'bag', 'greater_accra', 'wholesale', 'Tema Cement Depot', '2026-01-01', 'supplier_quote', 'Wholesale price 100+ bags'),
('cement', 'Portland Cement (50kg bag)', 'GHACEM', 'Grade 42.5N, 50kg bag', 56.00, 'bag', 'kumasi_metro', 'wholesale', 'Kumasi Builders Depot', '2026-01-01', 'supplier_quote', 'Wholesale price 100+ bags'),

-- STEEL PRICES (12mm TMT bars)
('steel', 'TMT Steel Bar 12mm', 'ARIK Steel', '12mm diameter, 12m length', 185.00, 'length', 'greater_accra', 'retail', 'Steel House Accra', '2026-01-01', 'survey', '12-meter TMT bar'),
('steel', 'TMT Steel Bar 12mm', 'ARIK Steel', '12mm diameter, 12m length', 175.00, 'length', 'kumasi_metro', 'retail', 'Kumasi Steel Works', '2026-01-01', 'survey', '12-meter TMT bar'),
('steel', 'TMT Steel Bar 12mm', 'ARIK Steel', '12mm diameter, 12m length', 172.00, 'length', 'eastern', 'retail', 'Eastern Steel', '2026-01-01', 'survey', '12-meter TMT bar'),
('steel', 'TMT Steel Bar 12mm', 'ARIK Steel', '12mm diameter, 12m length', 178.00, 'length', 'western_cluster', 'retail', 'Western Steel Ltd', '2026-01-01', 'survey', '12-meter TMT bar'),
('steel', 'TMT Steel Bar 12mm', 'ARIK Steel', '12mm diameter, 12m length', 168.00, 'length', 'northern_cluster', 'retail', 'Northern Iron Works', '2026-01-01', 'survey', '12-meter TMT bar'),

-- BLOCKS
('blocks', 'Sandcrete Blocks 6 inch', 'Local Production', '6 inch hollow blocks', 3.80, 'piece', 'greater_accra', 'manufacturer', 'Accra Block Factory', '2026-01-01', 'supplier_quote', 'Standard 6-inch hollow'),
('blocks', 'Sandcrete Blocks 6 inch', 'Local Production', '6 inch hollow blocks', 3.20, 'piece', 'kumasi_metro', 'manufacturer', 'Ashanti Blocks Ltd', '2026-01-01', 'supplier_quote', 'Standard 6-inch hollow'),
('blocks', 'Sandcrete Blocks 6 inch', 'Local Production', '6 inch hollow blocks', 3.00, 'piece', 'eastern', 'manufacturer', 'Eastern Block Works', '2026-01-01', 'supplier_quote', 'Standard 6-inch hollow'),
('blocks', 'Sandcrete Blocks 6 inch', 'Local Production', '6 inch hollow blocks', 3.20, 'piece', 'western_cluster', 'manufacturer', 'Western Blocks Co', '2026-01-01', 'supplier_quote', 'Standard 6-inch hollow'),
('blocks', 'Sandcrete Blocks 6 inch', 'Local Production', '6 inch hollow blocks', 2.80, 'piece', 'northern_cluster', 'manufacturer', 'Northern Block Factory', '2026-01-01', 'supplier_quote', 'Standard 6-inch hollow'),

-- SAND (Sharp sand for construction)
('sand', 'Sharp Sand', 'Local Quarry', 'Sharp sand for concrete/mortar', 450.00, 'trip', 'greater_accra', 'wholesale', 'Tema Quarry', '2026-01-01', 'market_check', 'Tipper truck load ~8 cubic meters'),
('sand', 'Sharp Sand', 'Local Quarry', 'Sharp sand for concrete/mortar', 380.00, 'trip', 'kumasi_metro', 'wholesale', 'Kumasi Sand Depot', '2026-01-01', 'market_check', 'Tipper truck load ~8 cubic meters'),
('sand', 'Sharp Sand', 'Local Quarry', 'Sharp sand for concrete/mortar', 350.00, 'trip', 'eastern', 'wholesale', 'Eastern Quarries', '2026-01-01', 'market_check', 'Tipper truck load ~8 cubic meters'),
('sand', 'Sharp Sand', 'Local Quarry', 'Sharp sand for concrete/mortar', 420.00, 'trip', 'western_cluster', 'wholesale', 'Western Sand Co', '2026-01-01', 'market_check', 'Tipper truck load ~8 cubic meters'),
('sand', 'Sharp Sand', 'Local Quarry', 'Sharp sand for concrete/mortar', 320.00, 'trip', 'northern_cluster', 'wholesale', 'Northern Quarries', '2026-01-01', 'market_check', 'Tipper truck load ~8 cubic meters'),

-- GRAVEL/STONES
('gravel', 'Granite Chippings (19mm)', 'Local Quarry', '19mm granite aggregate', 520.00, 'trip', 'greater_accra', 'wholesale', 'Tema Stone Quarry', '2026-01-01', 'market_check', 'Tipper truck load'),
('gravel', 'Granite Chippings (19mm)', 'Local Quarry', '19mm granite aggregate', 420.00, 'trip', 'kumasi_metro', 'wholesale', 'Kumasi Quarries', '2026-01-01', 'market_check', 'Tipper truck load'),

-- TIMBER
('timber', 'Wawa Timber 2x4', 'Local Sawmill', '2 inch x 4 inch x 12 feet', 28.50, 'length', 'greater_accra', 'retail', 'Timber Market Accra', '2026-01-01', 'market_check', '12-foot length'),
('timber', 'Wawa Timber 2x4', 'Local Sawmill', '2 inch x 4 inch x 12 feet', 25.00, 'length', 'kumasi_metro', 'retail', 'Kumasi Wood Market', '2026-01-01', 'market_check', '12-foot length'),
('timber', 'Mahogany Timber 2x4', 'Local Sawmill', '2 inch x 4 inch x 12 feet', 45.00, 'length', 'eastern', 'retail', 'Eastern Timber', '2026-01-01', 'market_check', '12-foot length premium wood'),

-- ROOFING MATERIALS
('roofing', 'Aluminum Roofing Sheet', 'ALUSAL', '0.55mm gauge, 12ft length', 95.00, 'piece', 'greater_accra', 'retail', 'Roofing House Accra', '2026-01-01', 'supplier_quote', '12-foot aluminum sheet'),
('roofing', 'Aluminum Roofing Sheet', 'ALUSAL', '0.55mm gauge, 12ft length', 88.00, 'piece', 'kumasi_metro', 'retail', 'Ashanti Roofing', '2026-01-01', 'supplier_quote', '12-foot aluminum sheet'),
('roofing', 'Long Span Aluminum', 'ALUSAL', '0.55mm gauge, 12ft length', 105.00, 'piece', 'greater_accra', 'retail', 'Premium Roofing', '2026-01-01', 'supplier_quote', '12-foot long span'),

-- TILES  
('tiles', 'Floor Tiles 60x60cm', 'Royal Ceramics', 'Polished porcelain 60x60', 58.00, 'sqm', 'greater_accra', 'retail', 'Tile World Accra', '2026-01-01', 'survey', 'Premium floor tiles'),
('tiles', 'Floor Tiles 60x60cm', 'Royal Ceramics', 'Polished porcelain 60x60', 52.00, 'sqm', 'kumasi_metro', 'retail', 'Kumasi Ceramics', '2026-01-01', 'survey', 'Premium floor tiles'),

-- PAINT
('paint', 'Emulsion Paint 20L', 'KANSAI Paint', 'Interior matt emulsion 20L', 420.00, 'piece', 'greater_accra', 'retail', 'Paint Palace', '2026-01-01', 'supplier_quote', '20-liter bucket'),
('paint', 'Emulsion Paint 20L', 'KANSAI Paint', 'Interior matt emulsion 20L', 395.00, 'piece', 'kumasi_metro', 'retail', 'Kumasi Paint Shop', '2026-01-01', 'supplier_quote', '20-liter bucket'),

-- ELECTRICAL ITEMS
('electrical', 'Electric Cable 2.5mm', 'CABLELINE', '2.5mm single core copper', 12.50, 'length', 'greater_accra', 'retail', 'Electrical House', '2026-01-01', 'survey', 'Per meter'),
('electrical', 'Electric Cable 2.5mm', 'CABLELINE', '2.5mm single core copper', 11.80, 'length', 'kumasi_metro', 'retail', 'Kumasi Electrical', '2026-01-01', 'survey', 'Per meter'),

-- PLUMBING
('plumbing', 'PVC Pipe 4 inch', 'PRINCE Pipes', '4 inch PVC pipe 6m length', 85.00, 'length', 'greater_accra', 'retail', 'Plumbing Supplies', '2026-01-01', 'supplier_quote', '6-meter length'),
('plumbing', 'PVC Pipe 4 inch', 'PRINCE Pipes', '4 inch PVC pipe 6m length', 78.00, 'length', 'kumasi_metro', 'retail', 'Ashanti Plumbing', '2026-01-01', 'supplier_quote', '6-meter length');

-- =====================================================
-- LABOR RATES SEED DATA
-- Daily rates for construction workers across regions
-- Using actual table structure: category, role_name, daily_rate_ghs, region, effective_date, source_type
-- =====================================================

INSERT INTO labor_rates (
  category, role_name, skill_level, daily_rate_ghs, region, effective_date, source_type, notes
) VALUES

-- MASONS
('mason', 'Block Mason', 'journeyman', 180.00, 'greater_accra', '2026-01-01', 'survey', 'Experienced mason, block/concrete work'),
('mason', 'Block Mason', 'journeyman', 150.00, 'kumasi_metro', '2026-01-01', 'survey', 'Experienced mason, block/concrete work'),
('mason', 'Block Mason', 'journeyman', 140.00, 'eastern', '2026-01-01', 'survey', 'Experienced mason, block/concrete work'),
('mason', 'Block Mason', 'journeyman', 145.00, 'western_cluster', '2026-01-01', 'survey', 'Experienced mason, block/concrete work'),
('mason', 'Block Mason', 'journeyman', 130.00, 'northern_cluster', '2026-01-01', 'survey', 'Experienced mason, block/concrete work'),

-- Master masons (higher rates)
('mason', 'Master Mason', 'master', 250.00, 'greater_accra', '2026-01-01', 'survey', 'Master mason, can supervise others'),
('mason', 'Master Mason', 'master', 200.00, 'kumasi_metro', '2026-01-01', 'survey', 'Master mason, can supervise others'),

-- CARPENTERS
('carpenter', 'General Carpenter', 'journeyman', 200.00, 'greater_accra', '2026-01-01', 'survey', 'Skilled carpenter, roofing/doors'),
('carpenter', 'General Carpenter', 'journeyman', 170.00, 'kumasi_metro', '2026-01-01', 'survey', 'Skilled carpenter, roofing/doors'),
('carpenter', 'General Carpenter', 'journeyman', 160.00, 'eastern', '2026-01-01', 'survey', 'Skilled carpenter, roofing/doors'),
('carpenter', 'General Carpenter', 'journeyman', 165.00, 'western_cluster', '2026-01-01', 'survey', 'Skilled carpenter, roofing/doors'),
('carpenter', 'General Carpenter', 'journeyman', 150.00, 'northern_cluster', '2026-01-01', 'survey', 'Skilled carpenter, roofing/doors'),

-- PLUMBERS
('plumber', 'Licensed Plumber', 'journeyman', 220.00, 'greater_accra', '2026-01-01', 'survey', 'Licensed plumber'),
('plumber', 'Licensed Plumber', 'journeyman', 180.00, 'kumasi_metro', '2026-01-01', 'survey', 'Licensed plumber'),
('plumber', 'Licensed Plumber', 'journeyman', 170.00, 'eastern', '2026-01-01', 'survey', 'Licensed plumber'),

-- ELECTRICIANS  
('electrician', 'Licensed Electrician', 'journeyman', 240.00, 'greater_accra', '2026-01-01', 'survey', 'Licensed electrician'),
('electrician', 'Licensed Electrician', 'journeyman', 200.00, 'kumasi_metro', '2026-01-01', 'survey', 'Licensed electrician'),
('electrician', 'Licensed Electrician', 'journeyman', 190.00, 'eastern', '2026-01-01', 'survey', 'Licensed electrician'),

-- GENERAL LABORERS
('general_laborer', 'General Laborer', 'apprentice', 80.00, 'greater_accra', '2026-01-01', 'survey', 'General construction laborer'),
('general_laborer', 'General Laborer', 'apprentice', 70.00, 'kumasi_metro', '2026-01-01', 'survey', 'General construction laborer'),
('general_laborer', 'General Laborer', 'apprentice', 65.00, 'eastern', '2026-01-01', 'survey', 'General construction laborer'),
('general_laborer', 'General Laborer', 'apprentice', 68.00, 'western_cluster', '2026-01-01', 'survey', 'General construction laborer'),
('general_laborer', 'General Laborer', 'apprentice', 60.00, 'northern_cluster', '2026-01-01', 'survey', 'General construction laborer'),

-- PAINTERS
('painter', 'House Painter', 'journeyman', 160.00, 'greater_accra', '2026-01-01', 'survey', 'House painting specialist'),
('painter', 'House Painter', 'journeyman', 140.00, 'kumasi_metro', '2026-01-01', 'survey', 'House painting specialist'),
('painter', 'House Painter', 'journeyman', 130.00, 'eastern', '2026-01-01', 'survey', 'House painting specialist'),

-- TILERS
('tiler', 'Floor Tiler', 'journeyman', 190.00, 'greater_accra', '2026-01-01', 'survey', 'Floor and wall tiling specialist'),
('tiler', 'Floor Tiler', 'journeyman', 160.00, 'kumasi_metro', '2026-01-01', 'survey', 'Floor and wall tiling specialist'),

-- STEEL FIXERS
('steel_fixer', 'Steel Fixer', 'journeyman', 210.00, 'greater_accra', '2026-01-01', 'survey', 'Reinforcement steel specialist'),
('steel_fixer', 'Steel Fixer', 'journeyman', 180.00, 'kumasi_metro', '2026-01-01', 'survey', 'Reinforcement steel specialist'),

-- FOREMEN
('foreman', 'Site Foreman', 'master', 350.00, 'greater_accra', '2026-01-01', 'survey', 'Site foreman, supervises 10+ workers'),
('foreman', 'Site Foreman', 'master', 300.00, 'kumasi_metro', '2026-01-01', 'survey', 'Site foreman, supervises 10+ workers');

-- =====================================================
-- EQUIPMENT RATES SEED DATA  
-- Construction equipment rental rates
-- Using actual table structure: equipment_type, model, daily_rate_ghs, region, effective_date, source_type
-- =====================================================

INSERT INTO equipment_rates (
  equipment_type, model, capacity, daily_rate_ghs, includes_operator, includes_fuel,
  region, effective_date, source_type, notes
) VALUES

-- EXCAVATORS
('Excavator', 'CAT 320', '20-ton', 1200.00, true, false, 'greater_accra', '2026-01-01', 'supplier_quote', '20-ton excavator with operator'),
('Excavator', 'CAT 320', '20-ton', 1000.00, true, false, 'kumasi_metro', '2026-01-01', 'supplier_quote', '20-ton excavator with operator'),

-- CONCRETE MIXERS
('Concrete Mixer', '500L Diesel', '500L', 180.00, false, false, 'greater_accra', '2026-01-01', 'market_check', '500L diesel concrete mixer'),
('Concrete Mixer', '500L Diesel', '500L', 150.00, false, false, 'kumasi_metro', '2026-01-01', 'market_check', '500L diesel concrete mixer'),
('Concrete Mixer', '500L Diesel', '500L', 140.00, false, false, 'eastern', '2026-01-01', 'market_check', '500L diesel concrete mixer'),

-- COMPACTORS
('Compactor', 'Plate Compactor', 'Standard', 120.00, false, true, 'greater_accra', '2026-01-01', 'supplier_quote', 'Soil compaction equipment'),
('Compactor', 'Plate Compactor', 'Standard', 100.00, false, true, 'kumasi_metro', '2026-01-01', 'supplier_quote', 'Soil compaction equipment'),

-- GENERATORS
('Generator', '15kVA Diesel', '15kVA', 200.00, false, false, 'greater_accra', '2026-01-01', 'supplier_quote', 'Construction site power'),
('Generator', '15kVA Diesel', '15kVA', 180.00, false, false, 'kumasi_metro', '2026-01-01', 'supplier_quote', 'Construction site power'),

-- TIPPER TRUCKS
('Truck', 'Tipper 15 Ton', '15 Ton', 800.00, true, true, 'greater_accra', '2026-01-01', 'supplier_quote', 'Material transport with driver and fuel'),
('Truck', 'Tipper 15 Ton', '15 Ton', 700.00, true, true, 'kumasi_metro', '2026-01-01', 'supplier_quote', 'Material transport with driver and fuel');