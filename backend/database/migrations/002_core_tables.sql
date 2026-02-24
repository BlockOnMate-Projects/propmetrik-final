-- Migration: 002_core_tables
-- Description: Core system tables - users, organizations, and related entities
-- Created: 2024-01-15

-- =====================================================
-- ORGANIZATIONS TABLE
-- =====================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  type organization_type_enum NOT NULL,
  
  -- Contact information
  email VARCHAR(255),
  phone VARCHAR(50),
  website VARCHAR(255),
  
  -- Address
  address_street VARCHAR(255),
  address_city VARCHAR(100),
  address_region region_code_enum,
  address_postal_code VARCHAR(20),
  address_digital_address VARCHAR(20), -- Ghana Post GPS address
  
  -- Business details
  registration_number VARCHAR(100),
  tin_number VARCHAR(50), -- Tax Identification Number
  license_number VARCHAR(100),
  license_expiry DATE,
  
  -- Branding
  logo_url VARCHAR(500),
  banner_url VARCHAR(500),
  description TEXT,
  
  -- Settings
  settings JSONB DEFAULT '{}',
  
  -- Status
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_type ON organizations(type);
CREATE INDEX idx_organizations_region ON organizations(address_region);
CREATE INDEX idx_organizations_active ON organizations(is_active) WHERE is_active = TRUE;

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keycloak_id VARCHAR(255) UNIQUE NOT NULL, -- Links to Keycloak user ID
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Profile
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  display_name VARCHAR(255),
  avatar_url VARCHAR(500),
  
  -- Status
  status user_status_enum DEFAULT 'pending_verification',
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  
  -- Settings
  preferred_region region_code_enum,
  notification_settings JSONB DEFAULT '{"email": true, "sms": true, "push": true}',
  
  -- Subscription/Plan
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  
  -- Activity tracking
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_keycloak_id ON users(keycloak_id);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_region ON users(preferred_region);

-- =====================================================
-- USER ROLES TABLE (Application-level roles)
-- =====================================================
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  
  UNIQUE(user_id, role, organization_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_org ON user_roles(organization_id);

-- =====================================================
-- SAVED SEARCHES TABLE
-- =====================================================
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Search criteria
  criteria JSONB NOT NULL,
  
  -- Alert settings
  alert_enabled BOOLEAN DEFAULT FALSE,
  alert_frequency VARCHAR(20) DEFAULT 'daily', -- daily, weekly, instant
  last_alert_sent_at TIMESTAMPTZ,
  
  -- Usage tracking
  search_count INTEGER DEFAULT 0,
  last_searched_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX idx_saved_searches_alert ON saved_searches(alert_enabled, alert_frequency);

-- =====================================================
-- USER FAVORITES TABLE
-- =====================================================
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL, -- Will reference properties table
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, property_id)
);

CREATE INDEX idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_user_favorites_property ON user_favorites(property_id);

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_searches_updated_at
  BEFORE UPDATE ON saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
