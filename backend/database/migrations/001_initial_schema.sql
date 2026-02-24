-- Migration: 001_initial_schema
-- Description: Initial database schema setup with extensions and enum types
-- Created: 2024-01-15
-- Note: PostGIS can be enabled later when available. Using lat/lng columns for now.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- PostGIS will be enabled when available on the server:
-- CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- For range indexes

-- =====================================================
-- ENUM TYPES
-- =====================================================

-- Property types specific to Ghana market
CREATE TYPE property_type_enum AS ENUM (
  'residential_house',
  'apartment_flat',
  'commercial_shop',
  'commercial_office',
  'warehouse',
  'land',
  'industrial',
  'mixed_use'
);

-- Property condition
CREATE TYPE property_condition_enum AS ENUM (
  'excellent',
  'good',
  'fair',
  'poor',
  'renovation_required',
  'under_construction'
);

-- Transaction types
CREATE TYPE transaction_type_enum AS ENUM (
  'sale',
  'rental',
  'lease'
);

-- Currency types
CREATE TYPE currency_enum AS ENUM (
  'GHS',
  'USD',
  'EUR',
  'GBP'
);

-- Data source types
CREATE TYPE source_type_enum AS ENUM (
  'tier1_government',
  'tier2_financial',
  'tier3_partner',
  'tier3c_construction',
  'tier4_user',
  'tier5_web',
  'manual_entry',
  'api_import'
);

-- Ghana regions for partitioning
CREATE TYPE region_code_enum AS ENUM (
  'greater_accra',
  'kumasi_metro',
  'eastern',
  'western_cluster',
  'northern_cluster'
);

-- User status
CREATE TYPE user_status_enum AS ENUM (
  'active',
  'inactive',
  'suspended',
  'pending_verification'
);

-- Organization types
CREATE TYPE organization_type_enum AS ENUM (
  'agency',
  'brokerage',
  'developer',
  'property_manager',
  'valuation_firm',
  'financial_institution',
  'government'
);

-- Listing status
CREATE TYPE listing_status_enum AS ENUM (
  'draft',
  'pending_review',
  'active',
  'under_offer',
  'sold',
  'rented',
  'expired',
  'withdrawn'
);

-- Document types
CREATE TYPE document_type_enum AS ENUM (
  'land_title',
  'site_plan',
  'indenture',
  'survey_plan',
  'building_permit',
  'occupancy_certificate',
  'valuation_report',
  'tax_clearance',
  'utility_bill',
  'identity_document',
  'contract',
  'other'
);

-- Verification status
CREATE TYPE verification_status_enum AS ENUM (
  'unverified',
  'pending',
  'verified',
  'rejected',
  'expired'
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate reference numbers
CREATE OR REPLACE FUNCTION generate_reference_number(prefix TEXT)
RETURNS TEXT AS $$
DECLARE
  ref TEXT;
BEGIN
  ref := prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
         UPPER(SUBSTRING(uuid_generate_v4()::TEXT, 1, 8));
  RETURN ref;
END;
$$ LANGUAGE plpgsql;
