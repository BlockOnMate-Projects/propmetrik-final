-- Migration: 052_crm_properties_standalone
-- Description: Standalone CRM Properties table for Deals module
-- Purpose: Keep CRM/Deals service independent from Property Management service
-- Created: 2026-01-21

-- =====================================================
-- CRM PROPERTIES TABLE (Independent from Property Management)
-- =====================================================
-- This table stores property listings submitted through the CRM/Deals module
-- It is separate from the 'properties' table used by Property Management
-- This allows clients to use Deals without Property Management and vice versa

CREATE TABLE IF NOT EXISTS crm_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Reference
  reference_number VARCHAR(50) NOT NULL,
  
  -- Property Details
  title VARCHAR(500) NOT NULL,
  description TEXT,
  property_type VARCHAR(100) NOT NULL DEFAULT 'residential',
  transaction_type VARCHAR(50) NOT NULL DEFAULT 'sale', -- sale, rental, lease
  
  -- Location
  address_street VARCHAR(255),
  address_city VARCHAR(100) NOT NULL DEFAULT 'Accra',
  region VARCHAR(100) NOT NULL DEFAULT 'greater_accra',
  digital_address VARCHAR(50), -- Ghana Post GPS (e.g., GA-123-4567)
  landmark VARCHAR(255),
  
  -- Coordinates
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Pricing
  price DECIMAL(15, 2),
  price_currency VARCHAR(10) DEFAULT 'GHS',
  price_negotiable BOOLEAN DEFAULT TRUE,
  
  -- Specifications
  bedrooms INTEGER,
  bathrooms INTEGER,
  total_area_sqm DECIMAL(15, 2),
  land_area_sqm DECIMAL(15, 2),
  floors INTEGER DEFAULT 1,
  year_built INTEGER,
  
  -- Features
  features JSONB DEFAULT '[]',
  amenities JSONB DEFAULT '[]',
  
  -- Owner/Seller Information (for CRM tracking)
  owner_name VARCHAR(255),
  owner_phone VARCHAR(50),
  owner_email VARCHAR(255),
  owner_type VARCHAR(50), -- individual, corporate, developer
  
  -- CRM-specific fields
  listing_agent_id UUID, -- CRM user who listed this
  lead_source VARCHAR(100), -- where this property came from
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, under_offer, sold, rented, withdrawn, expired
  status_changed_at TIMESTAMP,
  
  -- Deal linkage
  active_deal_id UUID, -- Current active deal for this property
  total_deals INTEGER DEFAULT 0,
  
  -- Media
  images JSONB DEFAULT '[]',
  documents JSONB DEFAULT '[]',
  virtual_tour_url VARCHAR(500),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Audit
  created_by UUID,
  updated_by UUID
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_crm_properties_org ON crm_properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_properties_status ON crm_properties(status);
CREATE INDEX IF NOT EXISTS idx_crm_properties_type ON crm_properties(property_type);
CREATE INDEX IF NOT EXISTS idx_crm_properties_transaction ON crm_properties(transaction_type);
CREATE INDEX IF NOT EXISTS idx_crm_properties_region ON crm_properties(region);
CREATE INDEX IF NOT EXISTS idx_crm_properties_city ON crm_properties(address_city);
CREATE INDEX IF NOT EXISTS idx_crm_properties_price ON crm_properties(price);
CREATE INDEX IF NOT EXISTS idx_crm_properties_created ON crm_properties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_properties_ref ON crm_properties(reference_number);

-- Full text search
CREATE INDEX IF NOT EXISTS idx_crm_properties_title_search ON crm_properties USING gin(to_tsvector('english', title));

-- =====================================================
-- CRM PROPERTY VIEWINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS crm_property_viewings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  crm_property_id UUID REFERENCES crm_properties(id) ON DELETE CASCADE,
  deal_id UUID, -- Optional link to deal
  contact_id UUID, -- Who is viewing
  
  -- Scheduling
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  
  -- Outcome
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  outcome VARCHAR(100), -- interested, not_interested, considering, follow_up
  feedback TEXT,
  
  -- Agent
  agent_id UUID,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_viewings_property ON crm_property_viewings(crm_property_id);
CREATE INDEX IF NOT EXISTS idx_crm_viewings_scheduled ON crm_property_viewings(scheduled_at);

-- =====================================================
-- SEED CRM PROPERTIES FOR TESTING
-- =====================================================

-- Get or create a default organization for testing
DO $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Try to get existing organization
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  
  -- If no organization exists, create one
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (id, name, slug)
    VALUES (gen_random_uuid(), 'PropMetrik CRM Demo', 'propmetrik-crm-demo')
    RETURNING id INTO v_org_id;
  END IF;

  -- Insert CRM-specific test properties (different from Property Management data)
  INSERT INTO crm_properties (
    organization_id, reference_number, title, description, property_type, transaction_type,
    address_street, address_city, region, digital_address, price, price_currency,
    bedrooms, bathrooms, total_area_sqm, land_area_sqm, status, features, owner_name, owner_phone
  ) VALUES
  -- Sale Properties
  (v_org_id, 'CRM-2026-0001', '4-Bedroom Executive Mansion in Trasacco Valley',
   'Stunning executive mansion with premium finishes, private pool, and lush gardens. Perfect for discerning buyers seeking luxury living in Accra premier neighborhood.',
   'residential', 'sale', 'Trasacco Valley Estate', 'Accra', 'greater_accra', 'GA-456-7890',
   2850000, 'USD', 4, 5, 650.00, 1200.00, 'active',
   '["Swimming Pool", "Garden", "Boys Quarters", "Garage for 3 cars", "Generator", "Security Post"]',
   'Kwame Mensah', '+233-20-555-1234'),
   
  (v_org_id, 'CRM-2026-0002', 'Modern 3-Bedroom Apartment in Airport City',
   'Contemporary apartment in the heart of Airport City. Walking distance to shopping malls and restaurants. Ideal for young professionals or expats.',
   'apartment', 'sale', 'Airport City Complex', 'Accra', 'greater_accra', 'GA-234-5678',
   385000, 'USD', 3, 3, 180.00, NULL, 'active',
   '["Air Conditioning", "Fitted Kitchen", "24/7 Security", "Gym Access", "Underground Parking"]',
   'Akua Sarpong', '+233-24-777-5678'),
   
  (v_org_id, 'CRM-2026-0003', 'Prime Commercial Plot in Tema Industrial Area',
   'Strategic commercial land in Tema Heavy Industrial Area. Perfect for manufacturing or warehousing. All utilities available.',
   'commercial_land', 'sale', 'Heavy Industrial Area', 'Tema', 'greater_accra', 'TM-100-2000',
   950000, 'USD', NULL, NULL, NULL, 5000.00, 'active',
   '["Electricity Available", "Water Connected", "Paved Road Access", "Title Clear"]',
   'Industrial Holdings Ltd', '+233-30-222-3333'),
   
  (v_org_id, 'CRM-2026-0004', 'Beachfront Villa in Ada Foah',
   'Exclusive beachfront property with direct ocean access. Ideal for resort development or private luxury retreat.',
   'villa', 'sale', 'Songor Lagoon Road', 'Ada', 'greater_accra', 'AD-050-1000',
   1200000, 'USD', 5, 6, 450.00, 2500.00, 'under_offer',
   '["Beach Access", "Boat Dock", "Staff Quarters", "Solar Power", "Bore Hole"]',
   'Nana Ama Tetteh', '+233-27-888-9999'),
   
  (v_org_id, 'CRM-2026-0005', 'Affordable 2-Bedroom House in Kasoa',
   'Brand new 2-bedroom house in a gated community. Perfect starter home for young families. Ready for immediate occupancy.',
   'residential', 'sale', 'Millennium City Estate', 'Kasoa', 'central_region', 'CP-300-4000',
   95000, 'USD', 2, 2, 85.00, 150.00, 'active',
   '["Gated Community", "Water Tank", "Tiled Floors", "Security"]',
   'Kofi Antwi', '+233-55-444-3333'),

  -- Rental Properties
  (v_org_id, 'CRM-2026-0006', 'Luxury Serviced Apartment in Ridge',
   'Fully furnished executive apartment with hotel-like amenities. Perfect for corporate executives on short or long-term assignments.',
   'apartment', 'rental', 'The Gardens Residences, Ridge', 'Accra', 'greater_accra', 'GA-111-2222',
   4500, 'USD', 2, 2, 120.00, NULL, 'active',
   '["Fully Furnished", "Housekeeping", "Concierge", "Pool", "Gym", "Restaurant"]',
   'Ridge Properties Ltd', '+233-30-277-8888'),
   
  (v_org_id, 'CRM-2026-0007', 'Office Space in Accra Financial Centre',
   'Premium Grade A office space in the heart of the financial district. High-speed internet and modern facilities included.',
   'office', 'rental', 'Independence Avenue', 'Accra', 'greater_accra', 'GA-222-3333',
   8500, 'USD', NULL, NULL, 350.00, NULL, 'active',
   '["Fiber Internet", "Conference Rooms", "Reception", "Parking", "24/7 Access", "Backup Power"]',
   'AFC Management', '+233-30-266-5555'),
   
  (v_org_id, 'CRM-2026-0008', 'Warehouse in Spintex Industrial Area',
   'Large warehouse suitable for distribution or manufacturing. Loading bays and ample parking available.',
   'warehouse', 'rental', 'Spintex Road', 'Accra', 'greater_accra', 'GA-333-4444',
   12000, 'USD', NULL, NULL, 1500.00, 2000.00, 'active',
   '["Loading Bays", "Heavy Vehicle Access", "Security", "Office Space", "Electricity 3-Phase"]',
   'Spintex Developments', '+233-30-281-2222'),
   
  (v_org_id, 'CRM-2026-0009', '3-Bedroom Family Home in East Legon',
   'Well-maintained family home in quiet East Legon neighborhood. Close to international schools and shopping.',
   'residential', 'rental', 'Platinum Street, East Legon', 'Accra', 'greater_accra', 'GA-444-5555',
   3500, 'USD', 3, 3, 200.00, 450.00, 'active',
   '["Garden", "Garage", "Boys Quarters", "CCTV", "Generator"]',
   'Mrs. Adwoa Boateng', '+233-24-555-6666'),
   
  (v_org_id, 'CRM-2026-0010', 'Retail Shop in Osu Oxford Street',
   'Prime retail location on bustling Oxford Street. High foot traffic, perfect for fashion or food business.',
   'retail', 'rental', 'Oxford Street', 'Accra', 'greater_accra', 'GA-555-6666',
   5000, 'USD', NULL, NULL, 80.00, NULL, 'active',
   '["Street Frontage", "Display Windows", "Storage Room", "Toilet", "AC Ready"]',
   'Osu Properties', '+233-20-333-4444'),

  -- Development/Investment Properties
  (v_org_id, 'CRM-2026-0011', '5-Acre Development Land in Aburi',
   'Prime development land with panoramic mountain views. Perfect for resort, residential estate, or agricultural project.',
   'land', 'sale', 'Aburi Mountains', 'Aburi', 'eastern_region', 'ER-100-2000',
   450000, 'USD', NULL, NULL, NULL, 20234.00, 'pending',
   '["Mountain View", "Road Access", "Electricity Nearby", "Clear Title"]',
   'Akuapem Lands Ltd', '+233-26-777-8888'),
   
  (v_org_id, 'CRM-2026-0012', 'Hotel Development Site in Kumasi',
   'Strategic hotel development site near Kumasi Airport. Ideal for business hotel or serviced apartments.',
   'commercial_land', 'sale', 'Airport Road', 'Kumasi', 'ashanti_region', 'AH-200-3000',
   780000, 'USD', NULL, NULL, NULL, 8000.00, 'active',
   '["Airport Proximity", "Main Road Frontage", "Utilities Available", "Zoning Approved"]',
   'Ashanti Developers', '+233-32-201-5555'),
   
  (v_org_id, 'CRM-2026-0013', 'Luxury Townhouse Development in Labone',
   'Off-plan 4-bedroom townhouse in exclusive Labone development. Premium finishes, rooftop terrace, and smart home features.',
   'townhouse', 'sale', 'Labone Crescent', 'Accra', 'greater_accra', 'GA-666-7777',
   495000, 'USD', 4, 4, 280.00, 200.00, 'active',
   '["Smart Home", "Rooftop Terrace", "2-Car Garage", "Guest Suite", "Home Office"]',
   'Labone Heights Dev', '+233-30-275-1111'),
   
  (v_org_id, 'CRM-2026-0014', 'Mixed-Use Building in Circle',
   'Income-generating property with retail on ground floor and apartments above. Strong rental history.',
   'mixed_use', 'sale', 'Kwame Nkrumah Circle', 'Accra', 'greater_accra', 'GA-777-8888',
   1850000, 'USD', NULL, NULL, 1200.00, 600.00, 'active',
   '["Rental Income", "Prime Location", "High Foot Traffic", "Multiple Units"]',
   'Circle Investments', '+233-20-111-2222'),
   
  (v_org_id, 'CRM-2026-0015', 'Diaspora Investment Package - 3 Units',
   'Package of 3 rental units in Tema Community 25. Perfect diaspora investment with property management included.',
   'residential', 'sale', 'Tema Community 25', 'Tema', 'greater_accra', 'TM-400-5000',
   285000, 'USD', 6, 6, 270.00, 800.00, 'active',
   '["3 Separate Units", "All Rented", "Management Included", "8% Yield"]',
   'Diaspora Homes Ltd', '+233-55-222-3333')
  ON CONFLICT DO NOTHING;
  
  -- Update stats
  UPDATE crm_properties SET total_deals = 2, active_deal_id = NULL WHERE reference_number = 'CRM-2026-0004';
  
END $$;

-- =====================================================
-- UPDATE FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION update_crm_properties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_properties_updated_at ON crm_properties;
CREATE TRIGGER trg_crm_properties_updated_at
  BEFORE UPDATE ON crm_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_properties_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE crm_properties IS 'Standalone properties table for CRM/Deals module - independent from Property Management';
COMMENT ON COLUMN crm_properties.status IS 'pending: awaiting approval, active: listed for deals, under_offer: has active negotiation, sold/rented: deal completed, withdrawn: removed by owner, expired: listing expired';
COMMENT ON COLUMN crm_properties.transaction_type IS 'sale: for purchase, rental: for rent, lease: long-term commercial lease';
