-- Migration: 015_contribution_workflow.sql
-- Description: Adds tables for contribution workflow, credits system, and reputation management
-- Created: 2026-01-08

BEGIN;

-- =====================================================
-- CONTRIBUTOR PROFILES
-- =====================================================

CREATE TABLE IF NOT EXISTS contributor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Credits
    total_credits INTEGER NOT NULL DEFAULT 0,
    available_credits INTEGER NOT NULL DEFAULT 0,
    spent_credits INTEGER NOT NULL DEFAULT 0,
    
    -- Reputation
    reputation_score DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    contribution_count INTEGER NOT NULL DEFAULT 0,
    validation_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    
    -- Tier
    tier VARCHAR(20) NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_contributor_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_contributor_profiles_user_id ON contributor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_contributor_profiles_tier ON contributor_profiles(tier);
CREATE INDEX IF NOT EXISTS idx_contributor_profiles_reputation ON contributor_profiles(reputation_score DESC);

-- =====================================================
-- CONTRIBUTOR CREDITS LEDGER
-- =====================================================

CREATE TABLE IF NOT EXISTS contributor_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Transaction
    credits INTEGER NOT NULL,
    balance_after INTEGER,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earned', 'spent', 'adjustment', 'bonus', 'expired')),
    
    -- Source
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    description TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_contributor_credits_user_id ON contributor_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_contributor_credits_created_at ON contributor_credits(created_at DESC);
-- Fix: ensure table exists before creating index on specific columns
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contributor_credits' AND column_name = 'source_type') THEN
        CREATE INDEX IF NOT EXISTS idx_contributor_credits_source ON contributor_credits(source_type, source_id);
    END IF;
END $$;

-- =====================================================
-- ACHIEVEMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS achievements (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    
    -- Criteria
    criteria_type VARCHAR(50) NOT NULL,
    criteria_value INTEGER NOT NULL,
    
    -- Rewards
    bonus_credits INTEGER NOT NULL DEFAULT 0,
    badge_icon VARCHAR(100),
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert default achievements
INSERT INTO achievements (id, name, description, criteria_type, criteria_value, bonus_credits, badge_icon) VALUES
('first_contribution', 'First Steps', 'Made your first property contribution', 'contribution_count', 1, 50, 'trophy'),
('contributor_10', 'Regular Contributor', 'Contributed 10 properties', 'contribution_count', 10, 100, 'star'),
('contributor_50', 'Expert Contributor', 'Contributed 50 properties', 'contribution_count', 50, 500, 'medal'),
('contributor_100', 'Master Contributor', 'Contributed 100 properties', 'contribution_count', 100, 1000, 'crown'),
('accuracy_90', 'Data Champion', 'Maintained 90%+ validation rate', 'validation_rate', 90, 200, 'check-circle'),
('silver_tier', 'Rising Star', 'Reached Silver tier', 'tier', 1, 100, 'trending-up'),
('gold_tier', 'Gold Standard', 'Reached Gold tier', 'tier', 2, 300, 'award'),
('platinum_tier', 'Platinum Elite', 'Reached Platinum tier', 'tier', 3, 1000, 'diamond'),
('local_expert', 'Local Expert', 'Contributed 20 properties in one region', 'regional_count', 20, 250, 'map-pin'),
('verified_pro', 'Verified Professional', 'Verified as a real estate professional', 'professional_verified', 1, 500, 'verified')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- USER ACHIEVEMENTS (UNLOCKED)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(id),
    
    -- Unlock details
    unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    credits_awarded INTEGER NOT NULL DEFAULT 0,
    
    CONSTRAINT unique_user_achievement UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked_at ON user_achievements(unlocked_at DESC);

-- =====================================================
-- CONTRIBUTION PROMPTS
-- =====================================================

CREATE TABLE IF NOT EXISTS contribution_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    valuation_id UUID REFERENCES valuations(id),
    property_id UUID,
    property_region region_code_enum,
    FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region),
    
    -- Prompt details
    prompt_type VARCHAR(50) NOT NULL CHECK (prompt_type IN ('comparable', 'property_update', 'transaction', 'market_data')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Search criteria (JSON)
    search_criteria JSONB NOT NULL DEFAULT '{}',
    
    -- Rewards
    base_reward_credits INTEGER NOT NULL DEFAULT 50,
    max_bonus_credits INTEGER NOT NULL DEFAULT 50,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'expired', 'cancelled')),
    fulfilled_by UUID REFERENCES users(id),
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Region targeting
    region VARCHAR(50),
    district VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_contribution_prompts_status ON contribution_prompts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contribution_prompts_region ON contribution_prompts(region, district);
CREATE INDEX IF NOT EXISTS idx_contribution_prompts_expires ON contribution_prompts(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contribution_prompts_valuation ON contribution_prompts(valuation_id);

-- =====================================================
-- CONTRIBUTION SUBMISSIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS contribution_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id UUID REFERENCES contribution_prompts(id),
    contributor_id UUID NOT NULL REFERENCES users(id),
    
    -- Submitted data
    data JSONB NOT NULL,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('personal_knowledge', 'transaction_party', 'professional', 'public_record')),
    attestation BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Documents
    proof_documents TEXT[],
    
    -- Validation
    validation_score DECIMAL(5,2),
    validation_notes TEXT,
    validated_by UUID REFERENCES users(id),
    validated_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'approved', 'rejected')),
    rejection_reason TEXT,
    
    -- Result
    property_id UUID,
    property_region region_code_enum,
    FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region),
    credits_awarded INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_contribution_submissions_prompt ON contribution_submissions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_contribution_submissions_contributor ON contribution_submissions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contribution_submissions_status ON contribution_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contribution_submissions_created ON contribution_submissions(created_at DESC);

-- =====================================================
-- GAP ANALYSIS LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS gap_analysis_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valuation_id UUID NOT NULL REFERENCES valuations(id),
    property_id UUID NOT NULL,
    property_region region_code_enum NOT NULL,
    FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region),
    
    -- Gap details
    has_gap BOOLEAN NOT NULL,
    gap_severity VARCHAR(20) NOT NULL CHECK (gap_severity IN ('none', 'minor', 'moderate', 'severe')),
    gap_reasons JSONB NOT NULL DEFAULT '[]',
    
    -- Comparables info
    required_comparables INTEGER NOT NULL,
    available_comparables INTEGER NOT NULL,
    
    -- Missing data
    missing_data_points JSONB NOT NULL DEFAULT '[]',
    
    -- Impact
    confidence_impact DECIMAL(5,2) NOT NULL,
    
    -- Resolution
    prompt_id UUID REFERENCES contribution_prompts(id),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_analysis_logs_valuation ON gap_analysis_logs(valuation_id);
CREATE INDEX IF NOT EXISTS idx_gap_analysis_logs_severity ON gap_analysis_logs(gap_severity) WHERE gap_severity != 'none';
CREATE INDEX IF NOT EXISTS idx_gap_analysis_logs_unresolved ON gap_analysis_logs(created_at) WHERE resolved = FALSE;

-- =====================================================
-- CREDIT SPENDING RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS credit_spending_rules (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Cost
    credit_cost INTEGER NOT NULL,
    
    -- Limits
    daily_limit INTEGER,
    monthly_limit INTEGER,
    
    -- Eligibility
    min_tier VARCHAR(20) DEFAULT 'bronze',
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert default spending rules
INSERT INTO credit_spending_rules (id, name, description, credit_cost, min_tier) VALUES
('unlock_valuation_report', 'Unlock Full Valuation Report', 'Access detailed professional valuation report', 100, 'bronze'),
('comparable_search', 'Comparable Property Search', 'Search for comparable properties in any region', 25, 'bronze'),
('market_data_export', 'Export Market Data', 'Download market analytics data', 50, 'silver'),
('priority_support', 'Priority Support', 'Get priority customer support', 200, 'gold'),
('api_access', 'API Access', 'Access to PropMetrik API', 500, 'platinum')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update contributor tier based on reputation
CREATE OR REPLACE FUNCTION update_contributor_tier()
RETURNS TRIGGER AS $$
BEGIN
    NEW.tier := CASE 
        WHEN NEW.reputation_score >= 90 THEN 'platinum'
        WHEN NEW.reputation_score >= 75 THEN 'gold'
        WHEN NEW.reputation_score >= 50 THEN 'silver'
        ELSE 'bronze'
    END;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_contributor_tier
    BEFORE UPDATE ON contributor_profiles
    FOR EACH ROW
    WHEN (OLD.reputation_score IS DISTINCT FROM NEW.reputation_score)
    EXECUTE FUNCTION update_contributor_tier();

-- Function to check and unlock achievements
CREATE OR REPLACE FUNCTION check_achievements()
RETURNS TRIGGER AS $$
DECLARE
    achievement RECORD;
    should_unlock BOOLEAN;
BEGIN
    FOR achievement IN SELECT * FROM achievements WHERE is_active = TRUE LOOP
        should_unlock := FALSE;
        
        CASE achievement.criteria_type
            WHEN 'contribution_count' THEN
                should_unlock := NEW.contribution_count >= achievement.criteria_value;
            WHEN 'validation_rate' THEN
                should_unlock := NEW.validation_rate * 100 >= achievement.criteria_value;
            WHEN 'tier' THEN
                should_unlock := CASE NEW.tier
                    WHEN 'platinum' THEN achievement.criteria_value <= 3
                    WHEN 'gold' THEN achievement.criteria_value <= 2
                    WHEN 'silver' THEN achievement.criteria_value <= 1
                    ELSE FALSE
                END;
            ELSE
                should_unlock := FALSE;
        END CASE;
        
        IF should_unlock THEN
            INSERT INTO user_achievements (user_id, achievement_id, credits_awarded)
            VALUES (NEW.user_id, achievement.id, achievement.bonus_credits)
            ON CONFLICT (user_id, achievement_id) DO NOTHING;
            
            -- Award bonus credits if newly unlocked
            IF FOUND THEN
                UPDATE contributor_profiles 
                SET total_credits = total_credits + achievement.bonus_credits,
                    available_credits = available_credits + achievement.bonus_credits
                WHERE user_id = NEW.user_id;
            END IF;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_achievements
    AFTER UPDATE ON contributor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_achievements();

-- Function to expire old prompts
CREATE OR REPLACE FUNCTION expire_old_prompts()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE contribution_prompts
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS
-- =====================================================

-- Leaderboard view
CREATE OR REPLACE VIEW contributor_leaderboard AS
SELECT 
    cp.user_id,
    u.email,
    u.first_name,
    u.last_name,
    cp.total_credits,
    cp.reputation_score,
    cp.contribution_count,
    cp.validation_rate,
    cp.tier,
    (SELECT COUNT(*) FROM user_achievements WHERE user_id = cp.user_id) as achievement_count,
    RANK() OVER (ORDER BY cp.total_credits DESC) as rank_by_credits,
    RANK() OVER (ORDER BY cp.contribution_count DESC) as rank_by_contributions
FROM contributor_profiles cp
JOIN users u ON u.id = cp.user_id
WHERE cp.contribution_count > 0
ORDER BY cp.total_credits DESC;

-- Active prompts by region
CREATE OR REPLACE VIEW active_prompts_by_region AS
SELECT 
    region,
    COUNT(*) as prompt_count,
    SUM(base_reward_credits) as total_rewards_available,
    MIN(expires_at) as earliest_expiry
FROM contribution_prompts
WHERE status = 'active'
GROUP BY region;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE contributor_profiles IS 'User profiles for the contribution system including credits and reputation';
COMMENT ON TABLE contributor_credits IS 'Ledger tracking all credit transactions for contributors';
COMMENT ON TABLE achievements IS 'Available achievements that contributors can unlock';
COMMENT ON TABLE user_achievements IS 'Achievements unlocked by specific users';
COMMENT ON TABLE contribution_prompts IS 'Prompts requesting specific property data contributions';
COMMENT ON TABLE contribution_submissions IS 'Submitted contributions from users';
COMMENT ON TABLE gap_analysis_logs IS 'Logs of gap analysis performed during valuations';
COMMENT ON TABLE credit_spending_rules IS 'Rules for how credits can be spent';

COMMIT;
