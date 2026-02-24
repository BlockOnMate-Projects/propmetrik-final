-- Migration: 007_data_hub_phase2
-- Description: Phase 2 Data Hub - Data sources, ETL jobs, contributions, and contributor profiles
-- Created: 2026-01-05
-- Phase: 2 - Data Hub Implementation

-- =====================================================
-- DATA SOURCE TIER ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_source_tier_enum') THEN
    CREATE TYPE data_source_tier_enum AS ENUM (
      'tier1_government',        -- Lands Commission, GRA, Assemblies
      'tier2_financial',         -- Banks, MFIs
      'tier3_partners',          -- Real estate agencies
      'tier3b_user_generated',   -- User contributions
      'tier4_market_data',       -- Construction costs, economic indicators
      'tier5_public_web'         -- Web scraping
    );
  END IF;
END$$;

-- =====================================================
-- SYNC FREQUENCY ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_frequency_enum') THEN
    CREATE TYPE sync_frequency_enum AS ENUM (
      'realtime',
      'hourly',
      'daily',
      'weekly',
      'monthly',
      'on_demand'
    );
  END IF;
END$$;

-- =====================================================
-- ETL JOB TYPE ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'etl_job_type_enum') THEN
    CREATE TYPE etl_job_type_enum AS ENUM (
      'scrape',
      'api_sync',
      'file_import',
      'contribution',
      'geocoding',
      'enrichment',
      'deduplication',
      'quality_scoring'
    );
  END IF;
END$$;

-- =====================================================
-- ETL JOB STATUS ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'etl_job_status_enum') THEN
    CREATE TYPE etl_job_status_enum AS ENUM (
      'pending',
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled',
      'retrying'
    );
  END IF;
END$$;

-- =====================================================
-- CONTRIBUTOR TYPE ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contributor_type_enum') THEN
    CREATE TYPE contributor_type_enum AS ENUM (
      'valuer',
      'agent',
      'owner',
      'developer',
      'lender',
      'system'
    );
  END IF;
END$$;

-- =====================================================
-- CONTRIBUTION TYPE ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_type_enum') THEN
    CREATE TYPE contribution_type_enum AS ENUM (
      'new_property',
      'comparable',
      'enrichment',
      'correction',
      'verification',
      'photo',
      'document',
      'transaction'
    );
  END IF;
END$$;

-- =====================================================
-- VALIDATION STATUS ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'validation_status_enum') THEN
    CREATE TYPE validation_status_enum AS ENUM (
      'pending',
      'auto_approved',
      'auto_rejected',
      'under_review',
      'approved',
      'rejected',
      'needs_info'
    );
  END IF;
END$$;

-- =====================================================
-- CONTRIBUTOR TIER ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contributor_tier_enum') THEN
    CREATE TYPE contributor_tier_enum AS ENUM (
      'bronze',
      'silver',
      'gold',
      'platinum',
      'expert'
    );
  END IF;
END$$;

-- =====================================================
-- DATA SOURCES TABLE
-- Tracks all external and internal data sources
-- =====================================================
CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source identification
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  tier data_source_tier_enum NOT NULL,
  
  -- Trust and quality scoring
  trust_score DECIMAL(3,2) DEFAULT 0.50 CHECK (trust_score >= 0 AND trust_score <= 1),
  data_quality_score DECIMAL(3,2) DEFAULT 0.50 CHECK (data_quality_score >= 0 AND data_quality_score <= 1),
  
  -- Connection configuration
  api_endpoint VARCHAR(500),
  credentials_ref VARCHAR(100), -- Reference to secrets manager or env var
  auth_type VARCHAR(50), -- 'api_key', 'oauth2', 'basic', 'none'
  
  -- Sync configuration
  sync_frequency sync_frequency_enum DEFAULT 'daily',
  last_sync_at TIMESTAMPTZ,
  last_sync_status etl_job_status_enum,
  next_sync_at TIMESTAMPTZ,
  
  -- Statistics
  total_records_synced BIGINT DEFAULT 0,
  total_properties_added BIGINT DEFAULT 0,
  total_properties_updated BIGINT DEFAULT 0,
  total_errors BIGINT DEFAULT 0,
  
  -- Spider configuration (for web scraping sources)
  spider_config JSONB DEFAULT '{}',
  rate_limit_requests_per_minute INTEGER DEFAULT 10,
  
  -- Regional coverage
  regions_covered region_code_enum[] DEFAULT ARRAY[]::region_code_enum[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_paused BOOLEAN DEFAULT false,
  pause_reason TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_data_sources_tier ON data_sources(tier);
CREATE INDEX idx_data_sources_active ON data_sources(is_active) WHERE is_active = true;
CREATE INDEX idx_data_sources_next_sync ON data_sources(next_sync_at) WHERE is_active = true AND is_paused = false;
CREATE INDEX idx_data_sources_slug ON data_sources(slug);

-- =====================================================
-- ETL JOBS TABLE
-- Tracks all ETL job executions
-- =====================================================
CREATE TABLE etl_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Job identification
  source_id UUID REFERENCES data_sources(id) ON DELETE CASCADE,
  job_type etl_job_type_enum NOT NULL,
  job_name VARCHAR(100),
  
  -- Status tracking
  status etl_job_status_enum DEFAULT 'pending',
  priority INTEGER DEFAULT 0, -- Higher = more priority
  
  -- Progress tracking
  records_total INTEGER DEFAULT 0,
  records_processed INTEGER DEFAULT 0,
  records_successful INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  
  -- Properties affected
  properties_created INTEGER DEFAULT 0,
  properties_updated INTEGER DEFAULT 0,
  properties_deduplicated INTEGER DEFAULT 0,
  
  -- Timing
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Error handling
  error_count INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]',
  last_error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Job configuration
  config JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  
  -- Worker information
  worker_id VARCHAR(100),
  worker_hostname VARCHAR(255),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_etl_jobs_source ON etl_jobs(source_id);
CREATE INDEX idx_etl_jobs_status ON etl_jobs(status);
CREATE INDEX idx_etl_jobs_type ON etl_jobs(job_type);
CREATE INDEX idx_etl_jobs_created ON etl_jobs(created_at);
CREATE INDEX idx_etl_jobs_scheduled ON etl_jobs(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_etl_jobs_running ON etl_jobs(status) WHERE status = 'running';

-- Composite indexes for common queries
CREATE INDEX idx_etl_jobs_source_status ON etl_jobs(source_id, status);
CREATE INDEX idx_etl_jobs_type_status ON etl_jobs(job_type, status);

-- =====================================================
-- ETL JOB LOGS TABLE
-- Detailed logs for each ETL job step
-- =====================================================
CREATE TABLE etl_job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES etl_jobs(id) ON DELETE CASCADE,
  
  -- Log details
  level VARCHAR(20) NOT NULL, -- 'debug', 'info', 'warn', 'error'
  message TEXT NOT NULL,
  step VARCHAR(100),
  
  -- Context
  record_id VARCHAR(255),
  record_data JSONB,
  error_stack TEXT,
  
  -- Timing
  logged_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_etl_job_logs_job ON etl_job_logs(job_id);
CREATE INDEX idx_etl_job_logs_level ON etl_job_logs(level);
CREATE INDEX idx_etl_job_logs_logged ON etl_job_logs(logged_at);

-- Partition by time for efficient cleanup (keep 30 days of logs)
-- Note: Implement cleanup job in application

-- =====================================================
-- CONTRIBUTOR PROFILES TABLE
-- Tracks contributor reputation and statistics
-- =====================================================
CREATE TABLE contributor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tier and reputation
  tier contributor_tier_enum DEFAULT 'bronze',
  reputation_score DECIMAL(3,2) DEFAULT 0.50 CHECK (reputation_score >= 0 AND reputation_score <= 1),
  
  -- Contribution statistics
  total_contributions INTEGER DEFAULT 0,
  accepted_contributions INTEGER DEFAULT 0,
  rejected_contributions INTEGER DEFAULT 0,
  pending_contributions INTEGER DEFAULT 0,
  
  -- Quality metrics
  average_quality_score DECIMAL(3,2) DEFAULT 0.50,
  verification_rate DECIMAL(3,2) DEFAULT 0.00, -- % of contributions later verified
  
  -- Credits system
  credits_balance INTEGER DEFAULT 0,
  credits_lifetime_earned INTEGER DEFAULT 0,
  credits_lifetime_spent INTEGER DEFAULT 0,
  
  -- Professional verification
  is_verified_professional BOOLEAN DEFAULT false,
  professional_type contributor_type_enum,
  license_number VARCHAR(100),
  license_verified_at TIMESTAMPTZ,
  
  -- Regional expertise
  primary_region region_code_enum,
  regions_active region_code_enum[] DEFAULT ARRAY[]::region_code_enum[],
  
  -- Activity tracking
  last_contribution_at TIMESTAMPTZ,
  streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,
  
  -- Metadata
  badges JSONB DEFAULT '[]', -- Array of earned badges
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contributor_profiles_tier ON contributor_profiles(tier);
CREATE INDEX idx_contributor_profiles_reputation ON contributor_profiles(reputation_score);
CREATE INDEX idx_contributor_profiles_verified ON contributor_profiles(is_verified_professional) WHERE is_verified_professional = true;
CREATE INDEX idx_contributor_profiles_region ON contributor_profiles(primary_region);

-- =====================================================
-- CONTRIBUTIONS TABLE
-- Tracks all user contributions to the database
-- =====================================================
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Contributor information
  contributor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contributor_type contributor_type_enum NOT NULL,
  
  -- Contribution details
  contribution_type contribution_type_enum NOT NULL,
  property_id UUID, -- May be null for new property contributions
  property_region region_code_enum,
  
  -- The contributed data
  data JSONB NOT NULL,
  data_hash VARCHAR(64), -- SHA256 hash for duplicate detection
  
  -- Validation
  validation_status validation_status_enum DEFAULT 'pending',
  trust_score DECIMAL(3,2), -- Calculated based on contributor reputation
  quality_score DECIMAL(3,2), -- Data quality score
  
  -- Validation process
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  validation_notes TEXT,
  auto_validation_result JSONB, -- Results from automated validation
  
  -- Application
  is_applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,
  applied_property_id UUID, -- The property this was applied to
  
  -- Credits
  credits_awarded INTEGER DEFAULT 0,
  credits_pending BOOLEAN DEFAULT true,
  
  -- Source tracking
  source_context VARCHAR(100), -- e.g., 'valuation_workflow', 'property_registration', 'mobile_app'
  session_id VARCHAR(100),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contributions_contributor ON contributions(contributor_id);
CREATE INDEX idx_contributions_type ON contributions(contribution_type);
CREATE INDEX idx_contributions_property ON contributions(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX idx_contributions_status ON contributions(validation_status);
CREATE INDEX idx_contributions_pending ON contributions(validation_status) WHERE validation_status = 'pending';
CREATE INDEX idx_contributions_region ON contributions(property_region);
CREATE INDEX idx_contributions_created ON contributions(created_at);
CREATE INDEX idx_contributions_hash ON contributions(data_hash);

-- Composite indexes
CREATE INDEX idx_contributions_contributor_type ON contributions(contributor_id, contribution_type);
CREATE INDEX idx_contributions_status_created ON contributions(validation_status, created_at);

-- =====================================================
-- CONTRIBUTION REVIEWS TABLE
-- Tracks review history for contributions
-- =====================================================
CREATE TABLE contribution_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  
  -- Reviewer
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_auto_review BOOLEAN DEFAULT false,
  
  -- Review details
  previous_status validation_status_enum,
  new_status validation_status_enum NOT NULL,
  review_notes TEXT,
  
  -- Scoring
  quality_score_given DECIMAL(3,2),
  
  -- Timing
  reviewed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contribution_reviews_contribution ON contribution_reviews(contribution_id);
CREATE INDEX idx_contribution_reviews_reviewer ON contribution_reviews(reviewer_id);

-- =====================================================
-- CREDIT TRANSACTIONS TABLE
-- Tracks all credit movements for contributors
-- =====================================================
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Transaction details
  amount INTEGER NOT NULL, -- Positive for earned, negative for spent
  balance_after INTEGER NOT NULL,
  
  -- Transaction type
  transaction_type VARCHAR(50) NOT NULL, -- 'contribution_reward', 'referral', 'redemption', 'adjustment'
  
  -- Related entities
  contribution_id UUID REFERENCES contributions(id) ON DELETE SET NULL,
  
  -- Description
  description TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX idx_credit_transactions_created ON credit_transactions(created_at);

-- =====================================================
-- PROPERTY DUPLICATES TABLE
-- Tracks potential and confirmed duplicate properties
-- =====================================================
CREATE TABLE property_duplicates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- The two properties being compared
  property_id_1 UUID NOT NULL,
  property_region_1 region_code_enum NOT NULL,
  property_id_2 UUID NOT NULL,
  property_region_2 region_code_enum NOT NULL,
  
  -- Similarity scoring
  similarity_score DECIMAL(5,4) NOT NULL, -- 0-1
  address_similarity DECIMAL(5,4),
  location_similarity DECIMAL(5,4),
  features_similarity DECIMAL(5,4),
  image_similarity DECIMAL(5,4),
  
  -- Status
  status VARCHAR(20) DEFAULT 'potential', -- 'potential', 'confirmed', 'rejected', 'merged'
  
  -- Resolution
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  merged_into_id UUID, -- The surviving property after merge
  
  -- Detection
  detected_by VARCHAR(50), -- 'algorithm', 'user_report', 'etl_job'
  detection_job_id UUID REFERENCES etl_jobs(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign keys to partitioned properties table
  FOREIGN KEY (property_id_1, property_region_1) REFERENCES properties(id, region) ON DELETE CASCADE,
  FOREIGN KEY (property_id_2, property_region_2) REFERENCES properties(id, region) ON DELETE CASCADE
);

CREATE INDEX idx_property_duplicates_property1 ON property_duplicates(property_id_1);
CREATE INDEX idx_property_duplicates_property2 ON property_duplicates(property_id_2);
CREATE INDEX idx_property_duplicates_status ON property_duplicates(status);
CREATE INDEX idx_property_duplicates_score ON property_duplicates(similarity_score) WHERE status = 'potential';

-- Unique constraint to prevent duplicate pairs
CREATE UNIQUE INDEX idx_property_duplicates_pair ON property_duplicates(
  LEAST(property_id_1, property_id_2),
  GREATEST(property_id_1, property_id_2)
);

-- =====================================================
-- DATA QUALITY METRICS TABLE
-- Tracks data quality scores over time for properties
-- =====================================================
CREATE TABLE property_quality_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  property_region region_code_enum NOT NULL,
  
  -- Overall score
  overall_score DECIMAL(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Component scores (0-100)
  completeness_score DECIMAL(5,2) DEFAULT 0,    -- How complete is the data
  accuracy_score DECIMAL(5,2) DEFAULT 0,        -- How accurate (verified)
  timeliness_score DECIMAL(5,2) DEFAULT 0,      -- How recent/updated
  consistency_score DECIMAL(5,2) DEFAULT 0,     -- Internal consistency
  uniqueness_score DECIMAL(5,2) DEFAULT 0,      -- Not duplicated
  
  -- Field-level completeness
  fields_total INTEGER DEFAULT 0,
  fields_filled INTEGER DEFAULT 0,
  fields_verified INTEGER DEFAULT 0,
  
  -- Data issues
  issues JSONB DEFAULT '[]', -- Array of quality issues found
  
  -- Last assessment
  assessed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  assessed_by VARCHAR(50), -- 'system', 'manual', job_id
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE CASCADE
);

CREATE INDEX idx_property_quality_property ON property_quality_metrics(property_id);
CREATE INDEX idx_property_quality_score ON property_quality_metrics(overall_score);
CREATE INDEX idx_property_quality_region ON property_quality_metrics(property_region);
CREATE INDEX idx_property_quality_assessed ON property_quality_metrics(assessed_at);

-- Keep only latest score per property (cleanup job in application)

-- =====================================================
-- GEOCODING CACHE TABLE
-- Caches geocoding results to reduce API calls
-- =====================================================
CREATE TABLE geocoding_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Input
  address_input TEXT NOT NULL,
  address_normalized TEXT,
  
  -- Hash for quick lookup
  address_hash VARCHAR(64) NOT NULL UNIQUE,
  
  -- Result
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location GEOMETRY(POINT, 4326),
  
  -- Parsed components
  street_address TEXT,
  neighborhood VARCHAR(100),
  district VARCHAR(100),
  region VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'Ghana',
  
  -- Quality
  confidence DECIMAL(3,2), -- 0-1 confidence in the geocoding result
  match_type VARCHAR(50), -- 'exact', 'interpolated', 'approximate', 'centroid'
  
  -- Provider
  provider VARCHAR(50) NOT NULL, -- 'mapbox', 'google', 'nominatim'
  provider_place_id VARCHAR(255),
  
  -- Usage stats
  hit_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Validity
  expires_at TIMESTAMPTZ,
  is_valid BOOLEAN DEFAULT true,
  
  -- Metadata
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_geocoding_cache_hash ON geocoding_cache(address_hash);
CREATE INDEX idx_geocoding_cache_location ON geocoding_cache USING GIST(location);
CREATE INDEX idx_geocoding_cache_region ON geocoding_cache(region);
CREATE INDEX idx_geocoding_cache_valid ON geocoding_cache(is_valid) WHERE is_valid = true;

-- =====================================================
-- MARKET DATA SNAPSHOTS TABLE
-- Stores periodic market data for analytics
-- =====================================================
CREATE TABLE market_data_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Period
  snapshot_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly'
  
  -- Geographic scope
  region region_code_enum NOT NULL,
  district VARCHAR(100),
  neighborhood VARCHAR(100),
  
  -- Property type
  property_type property_type_enum,
  transaction_type transaction_type_enum,
  
  -- Price metrics
  avg_price_ghs DECIMAL(15, 2),
  median_price_ghs DECIMAL(15, 2),
  min_price_ghs DECIMAL(15, 2),
  max_price_ghs DECIMAL(15, 2),
  price_per_sqm_avg DECIMAL(12, 2),
  
  -- Volume metrics
  total_listings INTEGER DEFAULT 0,
  new_listings INTEGER DEFAULT 0,
  sold_listings INTEGER DEFAULT 0,
  expired_listings INTEGER DEFAULT 0,
  
  -- Time on market
  avg_days_on_market INTEGER,
  median_days_on_market INTEGER,
  
  -- Price changes
  price_change_pct DECIMAL(8, 4), -- Month-over-month change
  price_change_yoy_pct DECIMAL(8, 4), -- Year-over-year change
  
  -- Supply/Demand
  supply_index DECIMAL(5, 2),
  demand_index DECIMAL(5, 2),
  absorption_rate DECIMAL(5, 2),
  
  -- Data quality
  sample_size INTEGER DEFAULT 0,
  confidence_level DECIMAL(3, 2),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint
  UNIQUE(snapshot_date, region, district, neighborhood, property_type, transaction_type)
);

CREATE INDEX idx_market_snapshots_date ON market_data_snapshots(snapshot_date);
CREATE INDEX idx_market_snapshots_region ON market_data_snapshots(region);
CREATE INDEX idx_market_snapshots_type ON market_data_snapshots(property_type);
CREATE INDEX idx_market_snapshots_period ON market_data_snapshots(period_type, snapshot_date);

-- Composite indexes for common queries
CREATE INDEX idx_market_snapshots_region_date ON market_data_snapshots(region, snapshot_date);
CREATE INDEX idx_market_snapshots_full ON market_data_snapshots(region, property_type, transaction_type, snapshot_date);

-- =====================================================
-- CONSTRUCTION COST INDEX TABLE
-- Tracks construction material and labor costs
-- =====================================================
CREATE TABLE construction_cost_index (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Period
  effective_date DATE NOT NULL,
  
  -- Geographic scope
  region region_code_enum NOT NULL,
  
  -- Material costs (GHS per unit)
  cement_price_per_bag DECIMAL(10, 2), -- 50kg bag
  steel_price_per_ton DECIMAL(10, 2),
  sand_price_per_trip DECIMAL(10, 2),
  gravel_price_per_trip DECIMAL(10, 2),
  blocks_price_per_unit DECIMAL(10, 2), -- 6-inch block
  timber_price_per_length DECIMAL(10, 2), -- 2x4 standard
  roofing_price_per_sqm DECIMAL(10, 2),
  paint_price_per_gallon DECIMAL(10, 2),
  
  -- Labor costs (GHS per day)
  mason_daily_rate DECIMAL(10, 2),
  carpenter_daily_rate DECIMAL(10, 2),
  electrician_daily_rate DECIMAL(10, 2),
  plumber_daily_rate DECIMAL(10, 2),
  laborer_daily_rate DECIMAL(10, 2),
  
  -- Index values (base = 100)
  material_index DECIMAL(8, 2) DEFAULT 100,
  labor_index DECIMAL(8, 2) DEFAULT 100,
  overall_index DECIMAL(8, 2) DEFAULT 100,
  
  -- Changes
  material_change_pct DECIMAL(8, 4),
  labor_change_pct DECIMAL(8, 4),
  overall_change_pct DECIMAL(8, 4),
  
  -- Data source
  data_source VARCHAR(100),
  sample_size INTEGER,
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(effective_date, region)
);

CREATE INDEX idx_construction_cost_date ON construction_cost_index(effective_date);
CREATE INDEX idx_construction_cost_region ON construction_cost_index(region);
CREATE INDEX idx_construction_cost_region_date ON construction_cost_index(region, effective_date);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- Note: update_updated_at_column function already exists from earlier migration
-- =====================================================

-- Only create the function if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END$$;

CREATE TRIGGER update_data_sources_updated_at
  BEFORE UPDATE ON data_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_etl_jobs_updated_at
  BEFORE UPDATE ON etl_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contributor_profiles_updated_at
  BEFORE UPDATE ON contributor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contributions_updated_at
  BEFORE UPDATE ON contributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_duplicates_updated_at
  BEFORE UPDATE ON property_duplicates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_geocoding_cache_updated_at
  BEFORE UPDATE ON geocoding_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER FUNCTIONS FOR DATA HUB
-- =====================================================

-- Function to calculate contribution trust score
CREATE OR REPLACE FUNCTION calculate_contribution_trust_score(
  p_contributor_id UUID,
  p_contribution_type contribution_type_enum
)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  v_reputation DECIMAL(3,2);
  v_type_weight DECIMAL(3,2);
  v_trust_score DECIMAL(3,2);
BEGIN
  -- Get contributor reputation
  SELECT COALESCE(reputation_score, 0.50)
  INTO v_reputation
  FROM contributor_profiles
  WHERE user_id = p_contributor_id;
  
  -- If no profile, use default
  IF v_reputation IS NULL THEN
    v_reputation := 0.50;
  END IF;
  
  -- Weight based on contribution type
  v_type_weight := CASE p_contribution_type
    WHEN 'new_property' THEN 0.9  -- Needs more verification
    WHEN 'comparable' THEN 0.8
    WHEN 'enrichment' THEN 0.85
    WHEN 'correction' THEN 0.7   -- Corrections need review
    WHEN 'verification' THEN 0.95 -- High trust for verification
    WHEN 'photo' THEN 0.9
    WHEN 'document' THEN 0.85
    WHEN 'transaction' THEN 0.8
    ELSE 0.75
  END;
  
  -- Calculate trust score
  v_trust_score := v_reputation * v_type_weight;
  
  RETURN LEAST(v_trust_score, 1.0);
END;
$$ LANGUAGE plpgsql;

-- Function to update contributor tier based on contributions
CREATE OR REPLACE FUNCTION update_contributor_tier(p_user_id UUID)
RETURNS contributor_tier_enum AS $$
DECLARE
  v_profile contributor_profiles%ROWTYPE;
  v_new_tier contributor_tier_enum;
BEGIN
  SELECT * INTO v_profile
  FROM contributor_profiles
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN 'bronze';
  END IF;
  
  -- Tier thresholds
  v_new_tier := CASE
    WHEN v_profile.accepted_contributions >= 500 AND v_profile.reputation_score >= 0.95 
         AND v_profile.is_verified_professional THEN 'expert'
    WHEN v_profile.accepted_contributions >= 200 AND v_profile.reputation_score >= 0.85 THEN 'platinum'
    WHEN v_profile.accepted_contributions >= 50 AND v_profile.reputation_score >= 0.75 THEN 'gold'
    WHEN v_profile.accepted_contributions >= 10 AND v_profile.reputation_score >= 0.60 THEN 'silver'
    ELSE 'bronze'
  END;
  
  -- Update if changed
  IF v_new_tier != v_profile.tier THEN
    UPDATE contributor_profiles
    SET tier = v_new_tier
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN v_new_tier;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate property data quality score
CREATE OR REPLACE FUNCTION calculate_property_quality_score(
  p_property_id UUID,
  p_property_region region_code_enum
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_property properties%ROWTYPE;
  v_completeness DECIMAL(5,2);
  v_fields_total INTEGER := 25; -- Total expected fields
  v_fields_filled INTEGER := 0;
  v_score DECIMAL(5,2);
BEGIN
  -- Get property
  SELECT * INTO v_property
  FROM properties
  WHERE id = p_property_id AND region = p_property_region;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Count filled fields
  IF v_property.title IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.description IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.address_line1 IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.city IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.district IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.neighborhood IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.latitude IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.longitude IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.land_area_sqm IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.built_area_sqm IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.bedrooms IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.bathrooms IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  IF v_property.asking_price IS NOT NULL THEN v_fields_filled := v_fields_filled + 1; END IF;
  -- Add more field checks as needed
  
  -- Calculate completeness score (0-100)
  v_completeness := (v_fields_filled::DECIMAL / v_fields_total) * 100;
  
  -- For now, use completeness as the main score
  -- In production, incorporate accuracy, timeliness, etc.
  v_score := v_completeness;
  
  -- Store the quality metrics
  INSERT INTO property_quality_metrics (
    property_id, property_region, overall_score, 
    completeness_score, fields_total, fields_filled
  ) VALUES (
    p_property_id, p_property_region, v_score,
    v_completeness, v_fields_total, v_fields_filled
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED INITIAL DATA SOURCES
-- =====================================================
INSERT INTO data_sources (name, slug, tier, trust_score, sync_frequency, description, is_active)
VALUES
  -- Tier 1: Government
  ('Ghana Lands Commission', 'lands-commission', 'tier1_government', 0.95, 'daily', 
   'Official land title registry and survey data', false),
  ('Ghana Revenue Authority', 'gra', 'tier1_government', 0.90, 'weekly', 
   'Property tax assessment records', false),
  ('Accra Metropolitan Assembly', 'ama', 'tier1_government', 0.85, 'weekly', 
   'Building permits and zoning data for Accra', false),
  
  -- Tier 2: Financial
  ('Ecobank Ghana', 'ecobank', 'tier2_financial', 0.80, 'monthly', 
   'Anonymized mortgage and property collateral data', false),
  ('GCB Bank', 'gcb', 'tier2_financial', 0.80, 'monthly', 
   'Mortgage and property valuation data', false),
  
  -- Tier 3: Partners
  ('Partner Agencies Network', 'agency-network', 'tier3_partners', 0.70, 'daily', 
   'Real estate agency listings via API', false),
  
  -- Tier 3B: User Generated
  ('User Contributions', 'user-contributions', 'tier3b_user_generated', 0.60, 'realtime', 
   'Properties and comparables submitted by platform users', true),
  
  -- Tier 4: Market Data
  ('Construction Cost Surveys', 'construction-costs', 'tier4_market_data', 0.75, 'weekly', 
   'Building material and labor cost tracking', true),
  ('Bank of Ghana Economic Data', 'bog-data', 'tier4_market_data', 0.90, 'monthly', 
   'Economic indicators and exchange rates', false),
  
  -- Tier 5: Web Scraping
  ('Meqasa Properties', 'meqasa', 'tier5_public_web', 0.65, 'daily', 
   'Property listings scraped from meqasa.com', true),
  ('Ghana Property Centre', 'gpc', 'tier5_public_web', 0.65, 'daily', 
   'Property listings from ghanapropertycentre.com', true),
  ('Jiji Ghana Real Estate', 'jiji', 'tier5_public_web', 0.55, 'daily', 
   'Classified listings from jiji.com.gh', true),

  ('Facebook Property Groups', 'facebook-groups', 'tier5_public_web', 0.50, 'daily', 
   'Property listings from Facebook Marketplace and groups', false)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE data_sources IS 'Master list of all data sources feeding into the Data Hub';
COMMENT ON TABLE etl_jobs IS 'Tracking table for all ETL job executions';
COMMENT ON TABLE etl_job_logs IS 'Detailed logs for ETL job steps and errors';
COMMENT ON TABLE contributor_profiles IS 'Contributor reputation and statistics for Tier 3B user contributions';
COMMENT ON TABLE contributions IS 'All property data contributions from platform users';
COMMENT ON TABLE contribution_reviews IS 'Review history for data contributions';
COMMENT ON TABLE credit_transactions IS 'Credit ledger for contributor incentive system';
COMMENT ON TABLE property_duplicates IS 'Potential and confirmed duplicate property pairs';
COMMENT ON TABLE property_quality_metrics IS 'Data quality scores for properties';
COMMENT ON TABLE geocoding_cache IS 'Cache for geocoding API results';
COMMENT ON TABLE market_data_snapshots IS 'Periodic market statistics by region and property type';
COMMENT ON TABLE construction_cost_index IS 'Construction material and labor cost tracking';
