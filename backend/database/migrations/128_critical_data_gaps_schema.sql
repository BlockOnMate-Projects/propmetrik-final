-- =====================================================
-- Migration: 128_critical_data_gaps_schema.sql
-- Description: Create tables for Critical Data Gaps & Acquisition Strategy
-- Created: 2026-01-30
-- 
-- This migration creates tables for:
-- 1. RICS & Valuation Compliance Data
-- 2. Litigation Risk Data
-- 3. Flood Risk Data  
-- 4. Short-Stay/Tourism Metrics
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =====================================================
-- SECTION 1: ENUMS
-- =====================================================

DO $$ BEGIN
    CREATE TYPE rics_compliance_status AS ENUM (
        'pending',
        'compliant',
        'non_compliant',
        'partial_compliant',
        'failed_analysis'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE litigation_status AS ENUM (
        'pending',
        'active',
        'resolved',
        'dismissed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE flood_severity AS ENUM (
        'minor',
        'moderate',
        'severe',
        'catastrophic'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE listing_platform AS ENUM (
        'airbnb',
        'booking_com',
        'vrbo',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- SECTION 2: RICS COMPLIANCE TABLES
-- =====================================================

-- -----------------------------------------------------
-- 2.1: RICS Compliance Data
-- Stores extracted compliance indicators from valuation reports
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS rics_compliance_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to valuation report (if applicable)
    valuation_report_id UUID REFERENCES valuation_reports(id) ON DELETE CASCADE,
    
    -- Document metadata
    document_url TEXT,
    document_name VARCHAR(500),
    document_hash VARCHAR(128),
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Compliance assessment
    compliance_status rics_compliance_status DEFAULT 'pending',
    compliance_score NUMERIC(5,2) CHECK (compliance_score BETWEEN 0 AND 100),
    
    -- VPS (Valuation Practice Statements) compliance
    vps1_terms_of_engagement BOOLEAN DEFAULT FALSE,
    vps2_inspections_investigations BOOLEAN DEFAULT FALSE,
    vps3_reporting BOOLEAN DEFAULT FALSE,
    vps4_bases_of_value BOOLEAN DEFAULT FALSE,
    vps5_valuation_approaches BOOLEAN DEFAULT FALSE,
    
    -- Mandatory disclosures
    has_special_assumptions BOOLEAN DEFAULT FALSE,
    special_assumptions_text TEXT,
    
    has_conflict_of_interest_declaration BOOLEAN DEFAULT FALSE,
    conflict_declaration_text TEXT,
    
    has_liability_cap BOOLEAN DEFAULT FALSE,
    liability_cap_text TEXT,
    
    has_valuer_accreditation BOOLEAN DEFAULT FALSE,
    valuer_accreditation_details TEXT,
    
    has_limitations_on_use BOOLEAN DEFAULT FALSE,
    limitations_text TEXT,
    
    -- Extracted metadata
    extracted_data JSONB DEFAULT '{}',
    missing_disclosures TEXT[],
    
    -- Quality indicators
    document_quality_score NUMERIC(5,2),
    ocr_confidence NUMERIC(5,2),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rics_compliance_valuation ON rics_compliance_data(valuation_report_id);
CREATE INDEX IF NOT EXISTS idx_rics_compliance_status ON rics_compliance_data(compliance_status);
CREATE INDEX IF NOT EXISTS idx_rics_compliance_score ON rics_compliance_data(compliance_score);
CREATE INDEX IF NOT EXISTS idx_rics_compliance_analyzed ON rics_compliance_data(analyzed_at);

COMMENT ON TABLE rics_compliance_data IS 'RICS/IVS compliance analysis results from valuation reports';

-- =====================================================
-- SECTION 3: LITIGATION RISK TABLES
-- =====================================================

-- -----------------------------------------------------
-- 3.1: Litigation Risk Data
-- Land dispute court judgments from legal notices
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS litigation_risk_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source information
    source_name VARCHAR(100) NOT NULL, -- 'Daily Graphic', 'Ghanaian Times', etc.
    source_url TEXT,
    publication_date DATE,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Case information
    case_number VARCHAR(100),
    case_title TEXT,
    court_name VARCHAR(200),
    
    -- Parties
    plaintiff_names TEXT[],
    defendant_names TEXT[],
    
    -- Property/land details
    property_description TEXT,
    land_parcel_id VARCHAR(100),
    land_size_acres NUMERIC(10,2),
    
    -- Location
    raw_address TEXT,
    neighborhood VARCHAR(200),
    city VARCHAR(100),
    region VARCHAR(100),
    
    -- Geocoding
    location GEOGRAPHY(POINT, 4326),
    geocoded_at TIMESTAMP WITH TIME ZONE,
    geocoding_confidence NUMERIC(5,2),
    
    -- Case details
    dispute_type VARCHAR(100), -- 'land ownership', 'boundary dispute', 'landguard', etc.
    status litigation_status DEFAULT 'active',
    judgment_date DATE,
    judgment_summary TEXT,
    
    -- Risk assessment
    risk_score NUMERIC(5,2) CHECK (risk_score BETWEEN 0 AND 100),
    involves_landguard BOOLEAN DEFAULT FALSE,
    involves_violence BOOLEAN DEFAULT FALSE,
    
    -- Extracted data
    extracted_data JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_litigation_source ON litigation_risk_data(source_name);
CREATE INDEX IF NOT EXISTS idx_litigation_status ON litigation_risk_data(status);
CREATE INDEX IF NOT EXISTS idx_litigation_location ON litigation_risk_data USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_litigation_region ON litigation_risk_data(region);
CREATE INDEX IF NOT EXISTS idx_litigation_city ON litigation_risk_data(city);
CREATE INDEX IF NOT EXISTS idx_litigation_neighborhood ON litigation_risk_data(neighborhood);
CREATE INDEX IF NOT EXISTS idx_litigation_publication_date ON litigation_risk_data(publication_date);
CREATE INDEX IF NOT EXISTS idx_litigation_landguard ON litigation_risk_data(involves_landguard);

COMMENT ON TABLE litigation_risk_data IS 'Land litigation and court judgments from legal notice archives';

-- -----------------------------------------------------
-- 3.2: Litigation Hotspots (Materialized View)
-- Aggregates litigation activity by neighborhood
-- -----------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS litigation_hotspots AS
SELECT
    region,
    city,
    neighborhood,
    COUNT(*) as total_cases,
    COUNT(*) FILTER (WHERE status = 'active') as active_cases,
    COUNT(*) FILTER (WHERE involves_landguard = TRUE) as landguard_cases,
    AVG(risk_score) as avg_risk_score,
    MAX(publication_date) as latest_case_date,
    ST_Centroid(ST_Collect(location::geometry))::geography as centroid_location
FROM litigation_risk_data
WHERE location IS NOT NULL
GROUP BY region, city, neighborhood
HAVING COUNT(*) >= 2; -- At least 2 cases to be a hotspot

CREATE UNIQUE INDEX IF NOT EXISTS idx_litigation_hotspots_unique 
    ON litigation_hotspots(region, city, neighborhood);

COMMENT ON MATERIALIZED VIEW litigation_hotspots IS 'Aggregated litigation activity by neighborhood';

-- =====================================================
-- SECTION 4: FLOOD RISK TABLES
-- =====================================================

-- -----------------------------------------------------
-- 4.1: Flood Risk Incidents
-- Historical and real-time flood reports
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS flood_risk_incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source information
    source_type VARCHAR(50) NOT NULL, -- 'nadmo', 'twitter', 'news', 'government_report'
    source_name VARCHAR(200),
    source_url TEXT,
    source_id VARCHAR(200), -- external ID (e.g., Tweet ID)
    
    -- Incident details
    incident_date TIMESTAMP WITH TIME ZONE NOT NULL,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Location
    raw_address TEXT,
    neighborhood VARCHAR(200),
    city VARCHAR(100),
    region VARCHAR(100),
    
    -- Geocoding
    location GEOGRAPHY(POINT, 4326),
    geocoded_at TIMESTAMP WITH TIME ZONE,
    geocoding_confidence NUMERIC(5,2),
    
    -- Severity assessment
    severity flood_severity,
    severity_score NUMERIC(5,2) CHECK (severity_score BETWEEN 0 AND 100),
    
    -- Impact metrics
    estimated_affected_properties INTEGER,
    estimated_affected_people INTEGER,
    estimated_damage_usd NUMERIC(12,2),
    
    -- Description
    incident_description TEXT,
    extracted_keywords TEXT[],
    
    -- Validation
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by VARCHAR(100),
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Weather context
    rainfall_mm NUMERIC(6,2),
    weather_data JSONB DEFAULT '{}',
    
    -- Extracted data
    extracted_data JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flood_source_type ON flood_risk_incidents(source_type);
CREATE INDEX IF NOT EXISTS idx_flood_incident_date ON flood_risk_incidents(incident_date);
CREATE INDEX IF NOT EXISTS idx_flood_location ON flood_risk_incidents USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_flood_region ON flood_risk_incidents(region);
CREATE INDEX IF NOT EXISTS idx_flood_city ON flood_risk_incidents(city);
CREATE INDEX IF NOT EXISTS idx_flood_neighborhood ON flood_risk_incidents(neighborhood);
CREATE INDEX IF NOT EXISTS idx_flood_severity ON flood_risk_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_flood_verified ON flood_risk_incidents(is_verified);

COMMENT ON TABLE flood_risk_incidents IS 'Historical and real-time flood incident reports';

-- -----------------------------------------------------
-- 4.2: Flood Risk Scores (Materialized View)
-- Calculates flood risk scores by neighborhood
-- -----------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS flood_risk_scores AS
SELECT
    region,
    city,
    neighborhood,
    COUNT(*) as total_incidents,
    COUNT(*) FILTER (WHERE incident_date >= NOW() - INTERVAL '1 year') as incidents_last_year,
    COUNT(*) FILTER (WHERE incident_date >= NOW() - INTERVAL '5 years') as incidents_last_5_years,
    COUNT(*) FILTER (WHERE severity IN ('severe', 'catastrophic')) as severe_incidents,
    MAX(incident_date) as last_incident_date,
    
    -- Calculate risk score (0-100)
    LEAST(100, (
        (COUNT(*) FILTER (WHERE incident_date >= NOW() - INTERVAL '1 year') * 15) +
        (COUNT(*) FILTER (WHERE incident_date >= NOW() - INTERVAL '5 years') * 5) +
        (COUNT(*) FILTER (WHERE severity IN ('severe', 'catastrophic')) * 20)
    )) as flood_risk_score,
    
    ST_Centroid(ST_Collect(location::geometry))::geography as centroid_location
FROM flood_risk_incidents
WHERE location IS NOT NULL AND is_verified = TRUE
GROUP BY region, city, neighborhood
HAVING COUNT(*) >= 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flood_risk_scores_unique 
    ON flood_risk_scores(region, city, neighborhood);

COMMENT ON MATERIALIZED VIEW flood_risk_scores IS 'Calculated flood risk scores by neighborhood';

-- =====================================================
-- SECTION 5: SHORT-STAY/TOURISM METRICS TABLES
-- =====================================================

-- -----------------------------------------------------
-- 5.1: Short-Stay Listings
-- Airbnb/Booking.com listing snapshots
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS short_stay_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Platform information
    platform listing_platform NOT NULL,
    external_id VARCHAR(200) NOT NULL, -- Airbnb listing ID, Booking.com ID, etc.
    listing_url TEXT,
    
    -- Property details
    property_name VARCHAR(500),
    property_type VARCHAR(100), -- 'entire_home', 'private_room', 'shared_room'
    
    -- Location
    neighborhood VARCHAR(200),
    city VARCHAR(100),
    region VARCHAR(100),
    
    -- Geocoding
    location GEOGRAPHY(POINT, 4326),
    geocoded_at TIMESTAMP WITH TIME ZONE,
    
    -- Capacity
    bedrooms INTEGER,
    bathrooms INTEGER,
    max_guests INTEGER,
    
    -- Amenities
    amenities TEXT[],
    
    -- Host information
    host_id VARCHAR(200),
    host_name VARCHAR(200),
    host_is_superhost BOOLEAN,
    
    -- Ratings
    rating_average NUMERIC(3,2),
    rating_count INTEGER,
    
    -- Status tracking
    is_active BOOLEAN DEFAULT TRUE,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Extracted data
    extracted_data JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_short_stay_platform ON short_stay_listings(platform);
CREATE INDEX IF NOT EXISTS idx_short_stay_location ON short_stay_listings USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_short_stay_neighborhood ON short_stay_listings(neighborhood);
CREATE INDEX IF NOT EXISTS idx_short_stay_city ON short_stay_listings(city);
CREATE INDEX IF NOT EXISTS idx_short_stay_active ON short_stay_listings(is_active);
CREATE INDEX IF NOT EXISTS idx_short_stay_external_id ON short_stay_listings(external_id);

COMMENT ON TABLE short_stay_listings IS 'Short-stay rental listings from booking platforms';

-- -----------------------------------------------------
-- 5.2: Short-Stay Availability Snapshots
-- Daily availability and pricing snapshots
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS short_stay_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES short_stay_listings(id) ON DELETE CASCADE,
    
    -- Snapshot date
    check_date DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Availability
    is_available BOOLEAN NOT NULL,
    min_nights INTEGER,
    max_nights INTEGER,
    
    -- Pricing
    price_per_night_usd NUMERIC(10,2),
    price_per_night_local NUMERIC(10,2),
    currency VARCHAR(3) DEFAULT 'GHS',
    
    -- Fees
    cleaning_fee_usd NUMERIC(10,2),
    service_fee_usd NUMERIC(10,2),
    
    -- Extracted data
    extracted_data JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (listing_id, check_date, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_short_stay_avail_listing ON short_stay_availability(listing_id);
CREATE INDEX IF NOT EXISTS idx_short_stay_avail_check_date ON short_stay_availability(check_date);
CREATE INDEX IF NOT EXISTS idx_short_stay_avail_snapshot ON short_stay_availability(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_short_stay_avail_available ON short_stay_availability(is_available);

COMMENT ON TABLE short_stay_availability IS 'Daily availability and pricing snapshots for short-stay listings';

-- -----------------------------------------------------
-- 5.3: Short-Stay Metrics (Materialized View)
-- Calculated occupancy and ADR metrics
-- -----------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS short_stay_metrics AS
SELECT
    l.platform,
    l.neighborhood,
    l.city,
    l.property_type,
    
    -- Time period
    DATE_TRUNC('month', a.check_date) as metric_month,
    
    -- Listing count
    COUNT(DISTINCT l.id) as total_listings,
    
    -- Occupancy metrics
    COUNT(*) FILTER (WHERE a.is_available = FALSE) as booked_nights,
    COUNT(*) as total_nights,
    ROUND(
        (COUNT(*) FILTER (WHERE a.is_available = FALSE)::NUMERIC / COUNT(*)::NUMERIC) * 100,
        2
    ) as occupancy_rate,
    
    -- Pricing metrics (ADR - Average Daily Rate)
    AVG(a.price_per_night_usd) FILTER (WHERE a.is_available = FALSE) as adr_usd,
    
    -- RevPAR (Revenue Per Available Room)
    ROUND(
        (
            AVG(a.price_per_night_usd) FILTER (WHERE a.is_available = FALSE) *
            (COUNT(*) FILTER (WHERE a.is_available = FALSE)::NUMERIC / COUNT(*)::NUMERIC)
        ),
        2
    ) as revpar_usd,
    
    -- Price ranges
    MIN(a.price_per_night_usd) as min_price_usd,
    MAX(a.price_per_night_usd) as max_price_usd,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a.price_per_night_usd) as median_price_usd
    
FROM short_stay_listings l
INNER JOIN short_stay_availability a ON l.id = a.listing_id
WHERE a.check_date >= NOW() - INTERVAL '12 months'
GROUP BY l.platform, l.neighborhood, l.city, l.property_type, DATE_TRUNC('month', a.check_date)
HAVING COUNT(*) >= 30; -- At least 30 data points

CREATE INDEX IF NOT EXISTS idx_short_stay_metrics_neighborhood 
    ON short_stay_metrics(neighborhood, metric_month);
CREATE INDEX IF NOT EXISTS idx_short_stay_metrics_platform 
    ON short_stay_metrics(platform, metric_month);

COMMENT ON MATERIALIZED VIEW short_stay_metrics IS 'Calculated occupancy, ADR, and RevPAR metrics for short-stay rentals';

-- =====================================================
-- SECTION 6: TRIGGERS
-- =====================================================

-- Update timestamp trigger function (reuse if exists)
-- Function update_updated_at_column already exists and is owned by another user.
-- Skipping definition to avoid permission errors.
-- CREATE OR REPLACE FUNCTION update_updated_at_column() ...

-- Apply triggers
DROP TRIGGER IF EXISTS rics_compliance_updated ON rics_compliance_data;
CREATE TRIGGER rics_compliance_updated
    BEFORE UPDATE ON rics_compliance_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS litigation_updated ON litigation_risk_data;
CREATE TRIGGER litigation_updated
    BEFORE UPDATE ON litigation_risk_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS flood_updated ON flood_risk_incidents;
CREATE TRIGGER flood_updated
    BEFORE UPDATE ON flood_risk_incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS short_stay_listings_updated ON short_stay_listings;
CREATE TRIGGER short_stay_listings_updated
    BEFORE UPDATE ON short_stay_listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 7: REFRESH FUNCTIONS FOR MATERIALIZED VIEWS
-- =====================================================

-- Function to refresh all critical data gaps materialized views
CREATE OR REPLACE FUNCTION refresh_critical_data_gaps_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY litigation_hotspots;
    REFRESH MATERIALIZED VIEW CONCURRENTLY flood_risk_scores;
    REFRESH MATERIALIZED VIEW CONCURRENTLY short_stay_metrics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_critical_data_gaps_views IS 'Refresh all critical data gaps materialized views';

-- =====================================================
-- SECTION 8: GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to propmetrik_app
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO propmetrik_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO propmetrik_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO propmetrik_app;

-- =====================================================
-- SECTION 9: COMMENTS
-- =====================================================

COMMENT ON COLUMN rics_compliance_data.compliance_score IS 'Overall compliance score 0-100 based on VPS adherence';
COMMENT ON COLUMN litigation_risk_data.risk_score IS 'Litigation risk score 0-100 based on case severity and landguard activity';
COMMENT ON COLUMN flood_risk_incidents.severity_score IS 'Flood severity score 0-100 based on impact metrics';
COMMENT ON COLUMN short_stay_availability.is_available IS 'TRUE if listing is available for booking on check_date';
