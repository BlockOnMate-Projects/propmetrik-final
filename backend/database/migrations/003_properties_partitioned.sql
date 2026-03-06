-- Migration: 003_properties_partitioned
-- Description: Properties table with regional partitioning for Ghana market
-- Created: 2024-01-15
-- Note: PostGIS geometry columns commented out. Using lat/lng until PostGIS is available.

-- =====================================================
-- NEIGHBORHOODS TABLE (for location hierarchy)
-- =====================================================
CREATE TABLE neighborhoods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  region region_code_enum NOT NULL,
  district VARCHAR(100),
  city VARCHAR(100) NOT NULL,
  
  -- Boundaries (PostGIS geometry - enable when available)
  -- boundary GEOMETRY(POLYGON, 4326),
  -- center_point GEOMETRY(POINT, 4326),
  
  -- Basic lat/lng for center point
  center_latitude DECIMAL(10, 8),
  center_longitude DECIMAL(11, 8),
  
  -- Statistics (denormalized for performance)
  property_count INTEGER DEFAULT 0,
  avg_price_sale DECIMAL(15, 2),
  avg_price_rental DECIMAL(15, 2),
  avg_price_per_sqm DECIMAL(15, 2),
  
  -- Amenities and characteristics
  amenities JSONB DEFAULT '[]',
  characteristics JSONB DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(slug, region)
);

CREATE INDEX idx_neighborhoods_region ON neighborhoods(region);
CREATE INDEX idx_neighborhoods_city ON neighborhoods(city);

-- =====================================================
-- PROPERTIES TABLE (Partitioned by region)
-- =====================================================
CREATE TABLE properties (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  reference_number VARCHAR(50) NOT NULL,
  
  -- Ownership and management
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Location - Core (for partitioning)
  region region_code_enum NOT NULL,
  
  -- Location - Detailed
  neighborhood_id UUID REFERENCES neighborhoods(id) ON DELETE SET NULL,
  address_street VARCHAR(255),
  address_city VARCHAR(100) NOT NULL,
  address_district VARCHAR(100),
  address_postal_code VARCHAR(20),
  digital_address VARCHAR(20), -- Ghana Post GPS
  landmark VARCHAR(255),
  
  -- Geolocation (PostGIS geometry commented - enable when available)
  -- location GEOMETRY(POINT, 4326),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_verified BOOLEAN DEFAULT FALSE,
  location_accuracy INTEGER, -- meters
  
  -- Property Classification
  property_type property_type_enum NOT NULL,
  property_sub_type VARCHAR(100),
  transaction_type transaction_type_enum NOT NULL,
  
  -- Listing Details
  title VARCHAR(500) NOT NULL,
  description TEXT,
  features JSONB DEFAULT '[]',
  amenities JSONB DEFAULT '[]',
  
  -- Physical Attributes
  bedrooms INTEGER,
  bathrooms INTEGER,
  floors INTEGER DEFAULT 1,
  total_area_sqm DECIMAL(12, 2),
  land_area_sqm DECIMAL(12, 2),
  built_area_sqm DECIMAL(12, 2),
  plot_size_acres DECIMAL(10, 4),
  year_built INTEGER,
  condition property_condition_enum,
  
  -- Pricing
  price DECIMAL(15, 2) NOT NULL,
  price_currency currency_enum DEFAULT 'GHS',
  price_per_sqm DECIMAL(12, 2),
  is_negotiable BOOLEAN DEFAULT TRUE,
  price_history JSONB DEFAULT '[]',
  
  -- For Rentals
  rental_period VARCHAR(20), -- monthly, yearly
  security_deposit DECIMAL(15, 2),
  advance_months INTEGER,
  
  -- Status
  status listing_status_enum DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  sold_price DECIMAL(15, 2),
  
  -- Verification
  verification_status verification_status_enum DEFAULT 'unverified',
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verification_notes TEXT,
  
  -- Data Quality
  data_source source_type_enum DEFAULT 'manual_entry',
  data_quality_score DECIMAL(5, 2), -- 0-100
  completeness_score DECIMAL(5, 2), -- 0-100
  
  -- Media
  primary_image_url VARCHAR(500),
  image_urls JSONB DEFAULT '[]',
  video_url VARCHAR(500),
  virtual_tour_url VARCHAR(500),
  floor_plan_url VARCHAR(500),
  
  -- SEO and Search
  slug VARCHAR(500),
  tags JSONB DEFAULT '[]',
  search_vector TSVECTOR,
  
  -- Analytics
  view_count INTEGER DEFAULT 0,
  inquiry_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  external_id VARCHAR(255), -- For imported data
  external_source VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Partition key
  PRIMARY KEY (id, region),
  
  -- Unique constraint must include partition key
  UNIQUE (reference_number, region)
) PARTITION BY LIST (region);

-- =====================================================
-- CREATE PARTITIONS FOR EACH REGION
-- =====================================================
CREATE TABLE properties_greater_accra PARTITION OF properties
  FOR VALUES IN ('greater_accra');

CREATE TABLE properties_kumasi_metro PARTITION OF properties
  FOR VALUES IN ('kumasi_metro');

CREATE TABLE properties_eastern PARTITION OF properties
  FOR VALUES IN ('eastern');

CREATE TABLE properties_western_cluster PARTITION OF properties
  FOR VALUES IN ('western_cluster');

CREATE TABLE properties_northern_cluster PARTITION OF properties
  FOR VALUES IN ('northern_cluster');

-- =====================================================
-- INDEXES ON PARTITIONED TABLE
-- =====================================================
-- These will be created on each partition automatically

-- Spatial index (PostGIS - enable when available)
-- CREATE INDEX idx_properties_location ON properties USING GIST(location);

-- Lat/lng indexes for non-PostGIS queries
CREATE INDEX idx_properties_lat ON properties(latitude);
CREATE INDEX idx_properties_lng ON properties(longitude);
CREATE INDEX idx_properties_lat_lng ON properties(latitude, longitude);

-- Property search indexes
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_properties_transaction ON properties(transaction_type);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_price ON properties(price);
CREATE INDEX idx_properties_city ON properties(address_city);
CREATE INDEX idx_properties_neighborhood ON properties(neighborhood_id);

-- Owner/Organization indexes
CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_organization ON properties(organization_id);

-- Full-text search index
CREATE INDEX idx_properties_search ON properties USING GIN(search_vector);

-- Composite indexes for common queries
CREATE INDEX idx_properties_region_type_status ON properties(region, property_type, status);
CREATE INDEX idx_properties_region_city_price ON properties(region, address_city, price);
CREATE INDEX idx_properties_status_published ON properties(status, published_at) WHERE status = 'active';

-- Verification index
CREATE INDEX idx_properties_verification ON properties(verification_status) WHERE verification_status != 'verified';

-- =====================================================
-- FUNCTION TO UPDATE SEARCH VECTOR
-- =====================================================
CREATE OR REPLACE FUNCTION properties_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.address_city, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.address_street, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.landmark, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.digital_address, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_search_vector
  BEFORE INSERT OR UPDATE ON properties
  FOR EACH ROW
  EXECUTE FUNCTION properties_search_vector_update();

CREATE TRIGGER update_neighborhoods_updated_at
  BEFORE UPDATE ON neighborhoods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTION TO GENERATE REFERENCE NUMBER
-- =====================================================
CREATE OR REPLACE FUNCTION generate_property_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_number IS NULL THEN
    NEW.reference_number := 'PM-' || 
      UPPER(LEFT(NEW.region::TEXT, 2)) || '-' ||
      TO_CHAR(CURRENT_DATE, 'YYMM') || '-' ||
      LPAD((
        SELECT COUNT(*) + 1 FROM properties 
        WHERE region = NEW.region 
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      )::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_property_reference_trigger
  BEFORE INSERT ON properties
  FOR EACH ROW
  EXECUTE FUNCTION generate_property_reference();
