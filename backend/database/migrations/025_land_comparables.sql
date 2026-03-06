-- Migration: 025_land_comparables.sql
-- Purpose: Store land comparable sales analysis for Cost Approach land valuation
-- Date: 2026-01-10

-- ============================================================================
-- VALUATION LAND COMPARABLES TABLE
-- Stores land comparable properties with scores, adjustments, and analysis
-- Used by LandComparableSalesService for automated land valuation
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_land_comparables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
    -- Note: No FK constraint on comparable_property_id because properties is a partitioned table
    comparable_property_id UUID, -- References properties(id) but without FK due to partitioning
    
    -- ==========================================================================
    -- SALE DATA
    -- ==========================================================================
    sale_price_ghs DECIMAL(15, 2) NOT NULL,
    sale_date DATE NOT NULL,
    land_area_sqm DECIMAL(12, 2) NOT NULL,
    price_per_sqm DECIMAL(12, 2) NOT NULL,
    
    -- ==========================================================================
    -- LOCATION
    -- ==========================================================================
    region VARCHAR(50) NOT NULL,
    district VARCHAR(100),
    locality VARCHAR(200),
    neighborhood VARCHAR(200),
    distance_km DECIMAL(8, 3),
    coordinates JSONB, -- {"lat": float, "lng": float}
    
    -- ==========================================================================
    -- LAND CHARACTERISTICS
    -- ==========================================================================
    zoning VARCHAR(50), -- 'residential', 'commercial', 'industrial', 'mixed_use', 'agricultural'
    tenure_type VARCHAR(50), -- 'freehold', 'leasehold', 'stool_land', 'family_land', 'government_land'
    lease_years_remaining INTEGER,
    has_road_access BOOLEAN,
    road_type VARCHAR(50), -- 'paved', 'unpaved', 'no_road'
    has_electricity BOOLEAN,
    has_water BOOLEAN,
    has_sewage BOOLEAN,
    topography VARCHAR(50), -- 'flat', 'gentle_slope', 'moderate_slope', 'steep', 'irregular'
    shape VARCHAR(50), -- 'regular', 'irregular', 'corner_lot', 'flag_lot'
    frontage_meters DECIMAL(8, 2),
    development_potential VARCHAR(50), -- 'high', 'medium', 'low', 'none'
    flood_risk VARCHAR(20), -- 'none', 'low', 'medium', 'high'
    
    -- ==========================================================================
    -- SCORING (0.000 - 1.000 scale)
    -- ==========================================================================
    overall_score DECIMAL(5, 4) NOT NULL,
    location_score DECIMAL(5, 4) NOT NULL,
    size_score DECIMAL(5, 4) NOT NULL,
    zoning_score DECIMAL(5, 4) NOT NULL,
    infrastructure_score DECIMAL(5, 4) NOT NULL,
    time_score DECIMAL(5, 4) NOT NULL,
    data_quality_score DECIMAL(5, 4) NOT NULL,
    
    -- Scoring weights used (for audit trail)
    scoring_weights JSONB DEFAULT '{"location": 0.30, "size": 0.20, "zoning": 0.15, "infrastructure": 0.15, "time": 0.10, "data_quality": 0.10}'::jsonb,
    
    -- ==========================================================================
    -- ADJUSTMENTS
    -- ==========================================================================
    -- Array of adjustment objects: [{type, amount_ghs, percentage, confidence, methodology, assumptions}]
    adjustments JSONB DEFAULT '[]'::jsonb,
    
    -- Summary values
    total_adjustment_ghs DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_adjustment_pct DECIMAL(8, 5) NOT NULL DEFAULT 0,
    adjusted_price_ghs DECIMAL(15, 2) NOT NULL,
    adjusted_price_per_sqm DECIMAL(12, 2) NOT NULL,
    
    -- ==========================================================================
    -- WEIGHTING AND OUTLIER DETECTION
    -- ==========================================================================
    weight_in_valuation DECIMAL(5, 4) NOT NULL DEFAULT 0,
    is_outlier BOOLEAN DEFAULT FALSE,
    outlier_reason TEXT,
    outlier_detection_method VARCHAR(50), -- 'iqr', 'z_score', 'both'
    
    -- IQR outlier detection values
    iqr_lower_bound DECIMAL(15, 2),
    iqr_upper_bound DECIMAL(15, 2),
    
    -- Modified Z-Score values
    modified_z_score DECIMAL(8, 4),
    z_score_threshold DECIMAL(5, 2) DEFAULT 3.5,
    
    -- ==========================================================================
    -- METADATA
    -- ==========================================================================
    source_type VARCHAR(50) NOT NULL DEFAULT 'database', -- 'database', 'manual', 'scraped', 'api_import'
    source_reference VARCHAR(255),
    source_url TEXT,
    
    -- Manual entry fields
    is_manual_entry BOOLEAN DEFAULT FALSE,
    entered_by UUID REFERENCES users(id),
    
    -- Verification
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Exclusion (if user chooses to exclude)
    is_excluded BOOLEAN DEFAULT FALSE,
    excluded_by UUID REFERENCES users(id),
    exclusion_reason TEXT,
    
    -- Display order (for UI)
    display_order INTEGER DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary lookup index
CREATE INDEX IF NOT EXISTS idx_land_comp_valuation 
    ON valuation_land_comparables(valuation_id);

-- For finding comparables by region
CREATE INDEX IF NOT EXISTS idx_land_comp_region 
    ON valuation_land_comparables(region);

-- For time-based filtering
CREATE INDEX IF NOT EXISTS idx_land_comp_sale_date 
    ON valuation_land_comparables(sale_date DESC);

-- For filtering outliers
CREATE INDEX IF NOT EXISTS idx_land_comp_outlier 
    ON valuation_land_comparables(is_outlier) 
    WHERE is_outlier = TRUE;

-- For filtering by score
CREATE INDEX IF NOT EXISTS idx_land_comp_score 
    ON valuation_land_comparables(overall_score DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_land_comp_valuation_active 
    ON valuation_land_comparables(valuation_id, is_outlier, is_excluded) 
    WHERE is_outlier = FALSE AND is_excluded = FALSE;

-- GIN index for JSONB adjustments (for querying adjustment types)
CREATE INDEX IF NOT EXISTS idx_land_comp_adjustments 
    ON valuation_land_comparables USING GIN(adjustments);

-- ============================================================================
-- VALUATION LAND VALUE RECONCILIATION TABLE
-- Stores the reconciled land value from multiple methods
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_land_value_reconciliation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
    
    -- ==========================================================================
    -- METHOD RESULTS
    -- ==========================================================================
    comparable_method_result JSONB, -- {success, indicated_value, confidence_score, comparables_used, ...}
    residual_method_result JSONB,   -- {success, indicated_value, confidence_score, gdv, costs, ...}
    user_entered_result JSONB,      -- {success, indicated_value, justification}
    
    -- ==========================================================================
    -- RECONCILIATION
    -- ==========================================================================
    methods_used TEXT[] DEFAULT '{}',
    methods_failed TEXT[] DEFAULT '{}',
    
    -- Weights
    method_weights JSONB DEFAULT '{}'::jsonb, -- {"comparable_land_sales": 0.45, "residual_gdv": 0.35, ...}
    weight_redistribution_applied BOOLEAN DEFAULT FALSE,
    original_weights JSONB, -- For audit trail when weights are redistributed
    
    -- Outlier detection at method level
    method_outlier_detected BOOLEAN DEFAULT FALSE,
    method_outlier_info JSONB, -- {outlier_method, outlier_value, median_value, deviation_pct, message}
    
    -- ==========================================================================
    -- FINAL VALUES
    -- ==========================================================================
    final_land_value DECIMAL(15, 2) NOT NULL,
    final_land_value_per_sqm DECIMAL(12, 2) NOT NULL,
    land_area_sqm DECIMAL(12, 2) NOT NULL,
    
    -- Confidence
    confidence_score DECIMAL(5, 4) NOT NULL,
    confidence_level VARCHAR(20), -- 'high', 'moderate', 'low'
    
    -- Primary method (highest weight)
    primary_method VARCHAR(50) NOT NULL,
    
    -- ==========================================================================
    -- DISCLOSURE
    -- ==========================================================================
    disclosure_required BOOLEAN DEFAULT FALSE,
    disclosure_text TEXT,
    
    -- ==========================================================================
    -- METADATA
    -- ==========================================================================
    property_use_case VARCHAR(50) DEFAULT 'developed_property', -- 'developed_property', 'vacant_land', 'development_site'
    calculation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculation_version VARCHAR(20) DEFAULT '1.0',
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One reconciliation per valuation
    UNIQUE(valuation_id)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_land_reconciliation_valuation 
    ON valuation_land_value_reconciliation(valuation_id);

-- ============================================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_land_comparables_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_land_comparables_updated ON valuation_land_comparables;
CREATE TRIGGER trg_land_comparables_updated
    BEFORE UPDATE ON valuation_land_comparables
    FOR EACH ROW
    EXECUTE FUNCTION update_land_comparables_timestamp();

DROP TRIGGER IF EXISTS trg_land_reconciliation_updated ON valuation_land_value_reconciliation;
CREATE TRIGGER trg_land_reconciliation_updated
    BEFORE UPDATE ON valuation_land_value_reconciliation
    FOR EACH ROW
    EXECUTE FUNCTION update_land_comparables_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE valuation_land_comparables IS 
    'Stores land comparable properties with automated scoring, adjustments, and outlier detection for Cost Approach land valuation';

COMMENT ON TABLE valuation_land_value_reconciliation IS 
    'Stores reconciled land value from multiple methods (comparable sales, residual, user-entered) with weight redistribution';

COMMENT ON COLUMN valuation_land_comparables.overall_score IS 
    'Weighted score from 6 factors: location (30%), size (20%), zoning (15%), infrastructure (15%), time (10%), data_quality (10%)';

COMMENT ON COLUMN valuation_land_comparables.is_outlier IS 
    'TRUE if value flagged by BOTH IQR and Modified Z-Score methods (conservative approach)';

COMMENT ON COLUMN valuation_land_comparables.modified_z_score IS 
    'Modified Z-Score using MAD (Median Absolute Deviation), more robust than standard Z-score';

COMMENT ON COLUMN valuation_land_value_reconciliation.method_weights IS 
    'Active weights after redistribution from failed methods. Default: comparable_land_sales=0.45, residual_gdv=0.35, user_entered=0.20';
