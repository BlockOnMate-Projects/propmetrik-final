-- Migration: 004_transactions_and_sources
-- Description: Property transactions, data sources, and related tables
-- Created: 2024-01-15

-- =====================================================
-- PROPERTY TRANSACTIONS TABLE
-- Records all property sales, rentals, and leases
-- =====================================================
CREATE TABLE property_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  property_region region_code_enum NOT NULL, -- For partition-aware queries
  
  -- Transaction Details
  reference_number VARCHAR(50) UNIQUE,
  transaction_type transaction_type_enum NOT NULL,
  transaction_date DATE NOT NULL,
  
  -- Pricing
  asking_price DECIMAL(15, 2),
  final_price DECIMAL(15, 2) NOT NULL,
  price_currency currency_enum DEFAULT 'GHS',
  price_per_sqm DECIMAL(12, 2),
  
  -- For Rentals/Leases
  rental_period VARCHAR(20),
  lease_duration_months INTEGER,
  lease_start_date DATE,
  lease_end_date DATE,
  
  -- Parties involved
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agency_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Commission
  commission_rate DECIMAL(5, 2),
  commission_amount DECIMAL(15, 2),
  
  -- Property details at time of transaction (denormalized)
  property_type property_type_enum,
  property_address TEXT,
  property_city VARCHAR(100),
  property_area_sqm DECIMAL(12, 2),
  bedrooms INTEGER,
  bathrooms INTEGER,
  
  -- Location for spatial queries (PostGIS - enable when available)
  -- location GEOMETRY(POINT, 4326),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Data Source
  data_source source_type_enum DEFAULT 'manual_entry',
  source_reference VARCHAR(255),
  confidence_score DECIMAL(5, 2), -- 0-100
  
  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key to partitioned properties table
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE SET NULL
);

CREATE INDEX idx_transactions_property ON property_transactions(property_id);
CREATE INDEX idx_transactions_date ON property_transactions(transaction_date);
CREATE INDEX idx_transactions_type ON property_transactions(transaction_type);
CREATE INDEX idx_transactions_region ON property_transactions(property_region);
CREATE INDEX idx_transactions_city ON property_transactions(property_city);
CREATE INDEX idx_transactions_price ON property_transactions(final_price);
-- Spatial index (PostGIS - enable when available)
-- CREATE INDEX idx_transactions_location ON property_transactions USING GIST(location);
CREATE INDEX idx_transactions_lat_lng ON property_transactions(latitude, longitude);
CREATE INDEX idx_transactions_verified ON property_transactions(is_verified);

-- Composite indexes for analytics
CREATE INDEX idx_transactions_region_date ON property_transactions(property_region, transaction_date);
CREATE INDEX idx_transactions_type_date ON property_transactions(transaction_type, transaction_date);
CREATE INDEX idx_transactions_city_date ON property_transactions(property_city, transaction_date);

-- =====================================================
-- PROPERTY DATA SOURCES TABLE
-- Tracks all data sources for properties
-- =====================================================
CREATE TABLE property_data_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  property_region region_code_enum NOT NULL,
  
  -- Source Details
  source_type source_type_enum NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  source_reference VARCHAR(255),
  source_url VARCHAR(500),
  
  -- Data provided by this source
  data_fields JSONB NOT NULL, -- List of fields this source provides data for
  raw_data JSONB, -- Original data from source
  
  -- Quality metrics
  reliability_score DECIMAL(5, 2), -- 0-100 based on source tier
  freshness_score DECIMAL(5, 2), -- 0-100 based on data age
  completeness_score DECIMAL(5, 2), -- 0-100 based on fields provided
  
  -- Timestamps
  data_collected_at TIMESTAMPTZ NOT NULL,
  data_valid_until TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  
  -- Status
  is_primary_source BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE CASCADE
);

CREATE INDEX idx_data_sources_property ON property_data_sources(property_id);
CREATE INDEX idx_data_sources_type ON property_data_sources(source_type);
CREATE INDEX idx_data_sources_collected ON property_data_sources(data_collected_at);
CREATE INDEX idx_data_sources_primary ON property_data_sources(property_id, is_primary_source) WHERE is_primary_source = TRUE;

-- =====================================================
-- PROPERTY IMAGES TABLE
-- =====================================================
CREATE TABLE property_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  property_region region_code_enum NOT NULL,
  
  -- File Details
  original_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  medium_url VARCHAR(500),
  large_url VARCHAR(500),
  
  -- Metadata
  filename VARCHAR(255),
  mime_type VARCHAR(50),
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  
  -- Classification
  image_type VARCHAR(50) DEFAULT 'interior', -- exterior, interior, floor_plan, aerial, etc.
  caption VARCHAR(500),
  alt_text VARCHAR(255),
  
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  
  -- AI/ML metadata
  ai_tags JSONB DEFAULT '[]',
  ai_description TEXT,
  
  -- Status
  is_approved BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE CASCADE
);

CREATE INDEX idx_property_images_property ON property_images(property_id);
CREATE INDEX idx_property_images_primary ON property_images(property_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX idx_property_images_type ON property_images(image_type);

-- =====================================================
-- PROPERTY DOCUMENTS TABLE
-- =====================================================
CREATE TABLE property_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  property_region region_code_enum NOT NULL,
  
  -- Document Details
  document_type document_type_enum NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- File Information
  file_url VARCHAR(500) NOT NULL,
  filename VARCHAR(255),
  mime_type VARCHAR(50),
  file_size INTEGER,
  
  -- Verification
  verification_status verification_status_enum DEFAULT 'unverified',
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verification_notes TEXT,
  
  -- Validity
  issue_date DATE,
  expiry_date DATE,
  issuing_authority VARCHAR(255),
  document_number VARCHAR(100),
  
  -- Access Control
  is_public BOOLEAN DEFAULT FALSE,
  access_roles JSONB DEFAULT '["admin", "owner"]',
  
  -- OCR and Extraction
  ocr_text TEXT,
  extracted_data JSONB DEFAULT '{}',
  
  -- Timestamps
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE CASCADE
);

CREATE INDEX idx_property_documents_property ON property_documents(property_id);
CREATE INDEX idx_property_documents_type ON property_documents(document_type);
CREATE INDEX idx_property_documents_verification ON property_documents(verification_status);
CREATE INDEX idx_property_documents_expiry ON property_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- =====================================================
-- PROPERTY INQUIRIES TABLE
-- =====================================================
CREATE TABLE property_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  property_region region_code_enum NOT NULL,
  
  -- Inquiry Details
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  message TEXT NOT NULL,
  
  -- Classification
  inquiry_type VARCHAR(50) DEFAULT 'general', -- general, viewing, price, availability
  preferred_contact VARCHAR(20) DEFAULT 'email', -- email, phone, whatsapp
  
  -- Status
  status VARCHAR(20) DEFAULT 'new', -- new, contacted, qualified, converted, closed
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Lead scoring
  lead_score INTEGER, -- 0-100
  
  -- Metadata
  source VARCHAR(100), -- website, mobile_app, api
  utm_params JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE CASCADE
);

CREATE INDEX idx_inquiries_property ON property_inquiries(property_id);
CREATE INDEX idx_inquiries_user ON property_inquiries(user_id);
CREATE INDEX idx_inquiries_status ON property_inquiries(status);
CREATE INDEX idx_inquiries_created ON property_inquiries(created_at);

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_property_transactions_updated_at
  BEFORE UPDATE ON property_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_data_sources_updated_at
  BEFORE UPDATE ON property_data_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_documents_updated_at
  BEFORE UPDATE ON property_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_inquiries_updated_at
  BEFORE UPDATE ON property_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTION TO UPDATE PROPERTY STATS
-- =====================================================
CREATE OR REPLACE FUNCTION update_property_inquiry_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE properties 
    SET inquiry_count = inquiry_count + 1 
    WHERE id = NEW.property_id AND region = NEW.property_region;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inquiry_count_trigger
  AFTER INSERT ON property_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_property_inquiry_count();

-- Transaction reference number generation
CREATE OR REPLACE FUNCTION generate_transaction_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_number IS NULL THEN
    NEW.reference_number := 'TX-' || 
      TO_CHAR(NEW.transaction_date, 'YYYYMMDD') || '-' ||
      LPAD((
        SELECT COUNT(*) + 1 FROM property_transactions 
        WHERE DATE_TRUNC('day', transaction_date) = DATE_TRUNC('day', NEW.transaction_date)
      )::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_transaction_reference_trigger
  BEFORE INSERT ON property_transactions
  FOR EACH ROW
  EXECUTE FUNCTION generate_transaction_reference();
