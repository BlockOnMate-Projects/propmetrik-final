-- Migration: 005_audit_and_analytics
-- Description: Audit logs, analytics tables, and system configuration
-- Created: 2024-01-15

-- =====================================================
-- AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Action Details
  action VARCHAR(100) NOT NULL, -- create, update, delete, view, export, etc.
  entity_type VARCHAR(100) NOT NULL, -- property, user, organization, etc.
  entity_id UUID,
  
  -- Actor
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Request Context
  request_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  
  -- Change Details
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Partition audit_logs by month for performance
-- Note: In production, create monthly partitions automatically

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);

-- =====================================================
-- PROPERTY VIEW LOGS TABLE
-- For analytics and popular property tracking
-- =====================================================
CREATE TABLE property_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  property_region region_code_enum NOT NULL,
  
  -- Viewer
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(100),
  
  -- Context
  source VARCHAR(50), -- search, direct, recommendation, social
  referrer VARCHAR(500),
  
  -- Device info
  device_type VARCHAR(20), -- mobile, tablet, desktop
  browser VARCHAR(50),
  os VARCHAR(50),
  
  -- Location
  viewer_ip INET,
  viewer_city VARCHAR(100),
  viewer_region VARCHAR(100),
  viewer_country VARCHAR(50) DEFAULT 'GH',
  
  -- Engagement
  view_duration_seconds INTEGER,
  scroll_depth_percent INTEGER,
  clicked_contact BOOLEAN DEFAULT FALSE,
  clicked_gallery BOOLEAN DEFAULT FALSE,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE CASCADE
);

CREATE INDEX idx_property_views_property ON property_views(property_id);
CREATE INDEX idx_property_views_user ON property_views(user_id);
CREATE INDEX idx_property_views_created ON property_views(created_at);
CREATE INDEX idx_property_views_session ON property_views(session_id);

-- =====================================================
-- SEARCH LOGS TABLE
-- For search analytics and relevance tuning
-- =====================================================
CREATE TABLE search_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Search Query
  query_text TEXT,
  filters JSONB DEFAULT '{}',
  
  -- Results
  result_count INTEGER,
  result_ids UUID[],
  
  -- User
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(100),
  
  -- Context
  source VARCHAR(50), -- web, mobile, api
  device_type VARCHAR(20),
  
  -- Engagement
  clicked_result_ids UUID[],
  clicked_positions INTEGER[],
  
  -- Performance
  response_time_ms INTEGER,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_search_logs_user ON search_logs(user_id);
CREATE INDEX idx_search_logs_created ON search_logs(created_at);
CREATE INDEX idx_search_logs_session ON search_logs(session_id);

-- =====================================================
-- MARKET INDICATORS TABLE
-- Aggregated market data for analytics
-- =====================================================
CREATE TABLE market_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Time Period
  period_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, quarterly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Geography
  region region_code_enum,
  city VARCHAR(100),
  neighborhood_id UUID REFERENCES neighborhoods(id) ON DELETE SET NULL,
  
  -- Property Type
  property_type property_type_enum,
  transaction_type transaction_type_enum,
  
  -- Volume Metrics
  listing_count INTEGER,
  new_listings INTEGER,
  sold_count INTEGER,
  rental_count INTEGER,
  
  -- Price Metrics (in GHS)
  avg_price DECIMAL(15, 2),
  median_price DECIMAL(15, 2),
  min_price DECIMAL(15, 2),
  max_price DECIMAL(15, 2),
  price_per_sqm_avg DECIMAL(12, 2),
  
  -- Price Changes
  price_change_percent DECIMAL(8, 4),
  price_change_yoy_percent DECIMAL(8, 4),
  
  -- Days on Market
  avg_days_on_market INTEGER,
  median_days_on_market INTEGER,
  
  -- Inventory Metrics
  months_of_inventory DECIMAL(5, 2),
  absorption_rate DECIMAL(8, 4),
  
  -- Demand Metrics
  total_views INTEGER,
  total_inquiries INTEGER,
  inquiry_to_view_ratio DECIMAL(8, 4),
  
  -- Index Values (base = 100)
  price_index DECIMAL(10, 4),
  volume_index DECIMAL(10, 4),
  demand_index DECIMAL(10, 4),
  
  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  data_points_count INTEGER,
  confidence_score DECIMAL(5, 2),
  
  UNIQUE(period_type, period_start, region, city, property_type, transaction_type)
);

CREATE INDEX idx_market_indicators_period ON market_indicators(period_type, period_start);
CREATE INDEX idx_market_indicators_region ON market_indicators(region);
CREATE INDEX idx_market_indicators_city ON market_indicators(city);
CREATE INDEX idx_market_indicators_type ON market_indicators(property_type, transaction_type);

-- =====================================================
-- SYSTEM CONFIGURATION TABLE
-- =====================================================
CREATE TABLE system_config (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'general',
  is_secret BOOLEAN DEFAULT FALSE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_system_config_category ON system_config(category);

-- =====================================================
-- API KEYS TABLE
-- =====================================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Key Details
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL, -- SHA-256 hash of the key
  key_prefix VARCHAR(10) NOT NULL, -- First 8 chars for identification
  
  -- Permissions
  scopes TEXT[] DEFAULT '{}',
  rate_limit INTEGER DEFAULT 1000, -- requests per hour
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  
  -- Validity
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT api_keys_owner CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Content
  type VARCHAR(50) NOT NULL, -- property_alert, inquiry, system, etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Reference
  entity_type VARCHAR(100),
  entity_id UUID,
  action_url VARCHAR(500),
  
  -- Delivery
  channels TEXT[] DEFAULT '{"in_app"}', -- in_app, email, sms, push
  delivered_via TEXT[] DEFAULT '{}',
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Priority
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INITIAL SYSTEM CONFIGURATION
-- =====================================================
INSERT INTO system_config (key, value, description, category) VALUES
('app.name', '"Propmetrik"', 'Application name', 'general'),
('app.version', '"1.0.0"', 'Application version', 'general'),
('app.country', '"GH"', 'Primary country of operation', 'general'),
('app.currency', '"GHS"', 'Default currency', 'general'),
('app.default_region', '"greater_accra"', 'Default region for new users', 'general'),

-- Data quality thresholds
('data.quality_threshold', '70', 'Minimum data quality score for publication', 'data'),
('data.completeness_threshold', '60', 'Minimum completeness score for publication', 'data'),

-- Pricing tiers for sources
('source.tier1_weight', '1.0', 'Weight for tier 1 (government) sources', 'data'),
('source.tier2_weight', '0.9', 'Weight for tier 2 (financial) sources', 'data'),
('source.tier3_weight', '0.7', 'Weight for tier 3 (partner) sources', 'data'),
('source.tier4_weight', '0.5', 'Weight for tier 4 (user) sources', 'data'),
('source.tier5_weight', '0.3', 'Weight for tier 5 (web) sources', 'data'),

-- Listing settings
('listing.max_images', '20', 'Maximum images per listing', 'listing'),
('listing.max_documents', '10', 'Maximum documents per listing', 'listing'),
('listing.expiry_days', '90', 'Default listing expiry in days', 'listing'),

-- Rate limiting
('rate_limit.default', '100', 'Default requests per minute', 'security'),
('rate_limit.search', '30', 'Search requests per minute', 'security'),
('rate_limit.auth', '10', 'Auth requests per minute', 'security'),

-- Ghana-specific settings
('ghana.regions', '["greater_accra", "kumasi_metro", "eastern", "western_cluster", "northern_cluster"]', 'Active regions', 'ghana'),
('ghana.currency_code', '"GHS"', 'Ghana Cedi currency code', 'ghana'),
('ghana.phone_prefix', '"+233"', 'Ghana phone prefix', 'ghana'),
('ghana.gps_address_regex', '"^[A-Z]{2}-\\d{3,4}-\\d{4}$"', 'Ghana Post GPS address format', 'ghana');
