-- Migration: 063_sales_targets.sql
-- Description: Phase 5.7 Week 1 - Sales Targets & Performance Management
-- HubSpot-inspired targets with cascading goals, pacing indicators, and gamification

-- ============================================================================
-- SALES TARGETS TABLE
-- Supports org → team → individual cascading with multiple target types
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- Target assignment (NULL agent_id = org/team level target)
    -- Note: crm_agents table may not exist, so FK is deferred
    agent_id UUID,
    team_id UUID, -- For team-level targets (future team table)
    parent_target_id UUID REFERENCES sales_targets(id) ON DELETE SET NULL, -- Cascading
    
    -- Target definition
    target_name VARCHAR(200) NOT NULL,
    target_type VARCHAR(50) NOT NULL, -- revenue, deal_count, activities, conversion_rate
    target_period VARCHAR(20) NOT NULL, -- weekly, monthly, quarterly, yearly
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Target values
    target_value DECIMAL(15,2) NOT NULL,
    stretch_target DECIMAL(15,2), -- 110-120% stretch goal for high performers
    minimum_threshold DECIMAL(15,2), -- Minimum acceptable (e.g., 80% of target)
    
    -- Current progress (updated via trigger or service)
    achieved_value DECIMAL(15,2) DEFAULT 0,
    achievement_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Pacing indicators
    pacing_status VARCHAR(20) DEFAULT 'on_track', -- on_track, behind, ahead, at_risk, achieved
    days_remaining INTEGER,
    projected_achievement DECIMAL(15,2), -- Based on current pace
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, achieved, missed, cancelled
    
    -- Notifications sent
    notified_50_percent BOOLEAN DEFAULT FALSE,
    notified_75_percent BOOLEAN DEFAULT FALSE,
    notified_100_percent BOOLEAN DEFAULT FALSE,
    notified_stretch BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_targets_org ON sales_targets(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_agent ON sales_targets(agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_period ON sales_targets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_sales_targets_status ON sales_targets(status);
CREATE INDEX IF NOT EXISTS idx_sales_targets_type ON sales_targets(target_type);
CREATE INDEX IF NOT EXISTS idx_sales_targets_pacing ON sales_targets(pacing_status);

-- ============================================================================
-- TARGET CHECKPOINTS TABLE
-- For tracking progress at specific intervals (weekly in monthly targets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS target_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL REFERENCES sales_targets(id) ON DELETE CASCADE,
    
    checkpoint_date DATE NOT NULL,
    checkpoint_number INTEGER NOT NULL, -- 1, 2, 3, etc.
    
    -- Expected vs actual at this checkpoint
    expected_value DECIMAL(15,2) NOT NULL,
    actual_value DECIMAL(15,2) NOT NULL,
    variance DECIMAL(15,2) GENERATED ALWAYS AS (actual_value - expected_value) STORED,
    variance_percentage DECIMAL(5,2),
    
    -- Status at checkpoint
    pacing_status VARCHAR(20), -- on_track, behind, ahead
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_target_checkpoints_target ON target_checkpoints(target_id);
CREATE INDEX IF NOT EXISTS idx_target_checkpoints_date ON target_checkpoints(checkpoint_date);

-- ============================================================================
-- AGENT ACHIEVEMENTS TABLE
-- Gamification: badges, streaks, milestones
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL,  -- FK deferred: crm_agents may not exist
    
    -- Achievement details
    achievement_type VARCHAR(50) NOT NULL, -- See types below
    achievement_name VARCHAR(200) NOT NULL,
    achievement_description TEXT,
    
    -- Achievement data
    achievement_date DATE NOT NULL,
    metadata JSONB DEFAULT '{}', -- Additional context (deal_id, target_id, etc.)
    
    -- Badge info
    badge_icon VARCHAR(50), -- Icon name for frontend
    badge_color VARCHAR(20), -- Color theme
    points_earned INTEGER DEFAULT 0, -- Gamification points
    
    -- Visibility
    is_public BOOLEAN DEFAULT TRUE, -- Show on leaderboard
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Achievement types:
-- target_achieved: Hit a target
-- target_stretch: Hit stretch target
-- first_deal: First deal closed
-- deal_streak_3: 3 deals in a row
-- deal_streak_5: 5 deals in a row
-- deal_streak_10: 10 deals in a row
-- revenue_milestone_100k: Hit 100K revenue
-- revenue_milestone_500k: Hit 500K revenue
-- revenue_milestone_1m: Hit 1M revenue
-- conversion_champion: Highest conversion rate
-- fast_closer: Closed deal in record time
-- top_performer_month: #1 in month
-- top_performer_quarter: #1 in quarter
-- consistent_achiever: Hit target 3+ months in a row

CREATE INDEX IF NOT EXISTS idx_agent_achievements_org ON agent_achievements(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_achievements_agent ON agent_achievements(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_achievements_type ON agent_achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_agent_achievements_date ON agent_achievements(achievement_date DESC);

-- ============================================================================
-- ACHIEVEMENT BADGES REFERENCE TABLE
-- Define available badges and their criteria
-- ============================================================================

CREATE TABLE IF NOT EXISTS achievement_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, -- NULL for system badges
    
    badge_key VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'target_achieved', 'deal_streak_5'
    badge_name VARCHAR(100) NOT NULL,
    badge_description TEXT,
    
    -- Badge appearance
    icon VARCHAR(50) NOT NULL, -- Lucide icon name
    color VARCHAR(20) NOT NULL, -- amber, green, blue, purple, etc.
    tier VARCHAR(20) DEFAULT 'bronze', -- bronze, silver, gold, platinum, diamond
    
    -- Criteria
    criteria_type VARCHAR(50) NOT NULL, -- target_hit, streak, milestone, ranking
    criteria_config JSONB DEFAULT '{}', -- Type-specific criteria
    
    -- Points
    points INTEGER DEFAULT 10,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default badges
INSERT INTO achievement_badges (badge_key, badge_name, badge_description, icon, color, tier, criteria_type, criteria_config, points) VALUES
    ('first_deal', 'First Deal', 'Closed your first deal!', 'Star', 'amber', 'bronze', 'milestone', '{"deals_closed": 1}', 10),
    ('target_achieved', 'Target Achieved', 'Hit your target!', 'Target', 'green', 'silver', 'target_hit', '{"percentage": 100}', 25),
    ('target_stretch', 'Stretch Goal', 'Exceeded stretch target!', 'Trophy', 'purple', 'gold', 'target_hit', '{"stretch": true}', 50),
    ('deal_streak_3', 'Hot Streak', '3 deals in a row!', 'Flame', 'orange', 'bronze', 'streak', '{"count": 3}', 15),
    ('deal_streak_5', 'On Fire', '5 deals in a row!', 'Zap', 'amber', 'silver', 'streak', '{"count": 5}', 30),
    ('deal_streak_10', 'Unstoppable', '10 deals in a row!', 'Crown', 'purple', 'gold', 'streak', '{"count": 10}', 75),
    ('revenue_100k', 'Rising Star', 'Closed GHS 100K+ in revenue', 'TrendingUp', 'blue', 'bronze', 'milestone', '{"revenue": 100000}', 20),
    ('revenue_500k', 'High Roller', 'Closed GHS 500K+ in revenue', 'Gem', 'blue', 'silver', 'milestone', '{"revenue": 500000}', 50),
    ('revenue_1m', 'Million Maker', 'Closed GHS 1M+ in revenue', 'Diamond', 'purple', 'gold', 'milestone', '{"revenue": 1000000}', 100),
    ('top_performer_month', 'Top Performer', '#1 agent this month', 'Medal', 'gold', 'gold', 'ranking', '{"rank": 1, "period": "month"}', 50),
    ('consistent_achiever', 'Consistent Achiever', 'Hit target 3+ months in a row', 'Award', 'green', 'silver', 'streak', '{"target_streak": 3}', 40),
    ('fast_closer', 'Speed Demon', 'Closed deal in under 7 days', 'Clock', 'cyan', 'bronze', 'milestone', '{"days": 7}', 15),
    ('conversion_champion', 'Conversion King', 'Highest conversion rate this month', 'Crown', 'amber', 'silver', 'ranking', '{"metric": "conversion_rate", "rank": 1}', 35)
ON CONFLICT (badge_key) DO NOTHING;

-- ============================================================================
-- AGENT STREAKS TABLE
-- Track current streaks for gamification
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL,  -- FK deferred: crm_agents may not exist
    
    streak_type VARCHAR(50) NOT NULL, -- deal_close, target_hit, daily_activity
    
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    streak_started_at DATE,
    
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(organization_id, agent_id, streak_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_streaks_agent ON agent_streaks(agent_id);

-- ============================================================================
-- LEADERBOARD VIEW
-- Real-time agent rankings for gamification
-- Note: Only created if crm_agents table exists
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_agents') THEN
        EXECUTE $view$
        CREATE OR REPLACE VIEW v_agent_leaderboard AS
        SELECT 
            a.id AS agent_id,
            a.organization_id,
            a.full_name,
            a.email,
            a.avatar_url,
            a.title,
            
            -- Current period stats
            COALESCE(SUM(d.deal_value) FILTER (WHERE d.status = 'won' AND d.closed_at >= date_trunc('month', CURRENT_DATE)), 0) AS mtd_revenue,
            COUNT(d.id) FILTER (WHERE d.status = 'won' AND d.closed_at >= date_trunc('month', CURRENT_DATE)) AS mtd_deals,
            COALESCE(SUM(d.deal_value) FILTER (WHERE d.status = 'won' AND d.closed_at >= date_trunc('quarter', CURRENT_DATE)), 0) AS qtd_revenue,
            COUNT(d.id) FILTER (WHERE d.status = 'won' AND d.closed_at >= date_trunc('quarter', CURRENT_DATE)) AS qtd_deals,
            COALESCE(SUM(d.deal_value) FILTER (WHERE d.status = 'won' AND d.closed_at >= date_trunc('year', CURRENT_DATE)), 0) AS ytd_revenue,
            COUNT(d.id) FILTER (WHERE d.status = 'won' AND d.closed_at >= date_trunc('year', CURRENT_DATE)) AS ytd_deals,
            
            -- Achievement count
            (SELECT COUNT(*) FROM agent_achievements aa WHERE aa.agent_id = a.id) AS total_achievements,
            (SELECT COALESCE(SUM(aa.points_earned), 0) FROM agent_achievements aa WHERE aa.agent_id = a.id) AS total_points,
            
            -- Current streak
            (SELECT COALESCE(current_streak, 0) FROM agent_streaks s WHERE s.agent_id = a.id AND s.streak_type = 'deal_close' LIMIT 1) AS deal_streak,
            
            -- Target achievement (current month)
            (SELECT achievement_percentage FROM sales_targets st 
             WHERE st.agent_id = a.id 
               AND st.target_type = 'revenue' 
               AND st.period_start <= CURRENT_DATE 
               AND st.period_end >= CURRENT_DATE
               AND st.status = 'active'
             LIMIT 1) AS current_target_percentage,
            
            -- Ranking (computed per query)
            ROW_NUMBER() OVER (PARTITION BY a.organization_id ORDER BY 
                COALESCE(SUM(d.deal_value) FILTER (WHERE d.status = 'won' AND d.closed_at >= date_trunc('month', CURRENT_DATE)), 0) DESC
            ) AS mtd_rank

        FROM crm_agents a
        LEFT JOIN deals d ON d.assigned_agent_id = a.id
        WHERE a.is_active = TRUE
        GROUP BY a.id
        $view$;
    END IF;
END $$;

-- ============================================================================
-- TARGET PROGRESS UPDATE FUNCTION
-- Called by trigger or cron to update target progress
-- ============================================================================

CREATE OR REPLACE FUNCTION update_target_progress(p_target_id UUID)
RETURNS void AS $$
DECLARE
    v_target RECORD;
    v_achieved DECIMAL(15,2);
    v_total_days INTEGER;
    v_elapsed_days INTEGER;
    v_expected_progress DECIMAL(5,2);
    v_actual_progress DECIMAL(5,2);
BEGIN
    -- Get target details
    SELECT * INTO v_target FROM sales_targets WHERE id = p_target_id;
    
    IF NOT FOUND THEN RETURN; END IF;
    
    -- Calculate achieved value based on target type
    IF v_target.target_type = 'revenue' THEN
        SELECT COALESCE(SUM(d.deal_value), 0) INTO v_achieved
        FROM deals d
        WHERE d.assigned_agent_id = v_target.agent_id
          AND d.status = 'won'
          AND d.closed_at >= v_target.period_start
          AND d.closed_at <= v_target.period_end;
          
    ELSIF v_target.target_type = 'deal_count' THEN
        SELECT COUNT(*) INTO v_achieved
        FROM deals d
        WHERE d.assigned_agent_id = v_target.agent_id
          AND d.status = 'won'
          AND d.closed_at >= v_target.period_start
          AND d.closed_at <= v_target.period_end;
          
    ELSIF v_target.target_type = 'activities' THEN
        SELECT COUNT(*) INTO v_achieved
        FROM deal_activities da
        JOIN deals d ON d.id = da.deal_id
        WHERE d.assigned_agent_id = v_target.agent_id
          AND da.created_at >= v_target.period_start
          AND da.created_at <= v_target.period_end;
    END IF;
    
    -- Calculate progress
    v_total_days := v_target.period_end - v_target.period_start + 1;
    v_elapsed_days := GREATEST(CURRENT_DATE - v_target.period_start, 0);
    v_expected_progress := (v_elapsed_days::DECIMAL / v_total_days) * 100;
    v_actual_progress := CASE WHEN v_target.target_value > 0 
                         THEN (v_achieved / v_target.target_value) * 100 
                         ELSE 0 END;
    
    -- Update target
    UPDATE sales_targets SET
        achieved_value = v_achieved,
        achievement_percentage = v_actual_progress,
        days_remaining = GREATEST(v_target.period_end - CURRENT_DATE, 0),
        projected_achievement = CASE 
            WHEN v_elapsed_days > 0 THEN (v_achieved / v_elapsed_days) * v_total_days
            ELSE 0 
        END,
        pacing_status = CASE
            WHEN v_actual_progress >= 100 THEN 'achieved'
            WHEN v_actual_progress >= v_expected_progress * 1.1 THEN 'ahead'
            WHEN v_actual_progress >= v_expected_progress * 0.9 THEN 'on_track'
            WHEN v_actual_progress >= v_expected_progress * 0.7 THEN 'at_risk'
            ELSE 'behind'
        END,
        status = CASE
            WHEN v_actual_progress >= 100 AND v_target.status = 'active' THEN 'achieved'
            WHEN CURRENT_DATE > v_target.period_end AND v_actual_progress < 100 THEN 'missed'
            ELSE v_target.status
        END,
        updated_at = NOW()
    WHERE id = p_target_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Update target progress when deal closes
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_update_agent_targets()
RETURNS TRIGGER AS $$
BEGIN
    -- Update all active targets for this agent
    IF NEW.status = 'won' AND (OLD.status IS NULL OR OLD.status != 'won') THEN
        PERFORM update_target_progress(st.id)
        FROM sales_targets st
        WHERE st.agent_id = NEW.assigned_agent_id
          AND st.status = 'active'
          AND st.period_start <= CURRENT_DATE
          AND st.period_end >= CURRENT_DATE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on deals table only if status column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'deals' AND column_name = 'status'
    ) THEN
        DROP TRIGGER IF EXISTS trg_deal_update_targets ON deals;
        CREATE TRIGGER trg_deal_update_targets
            AFTER UPDATE OF status ON deals
            FOR EACH ROW
            EXECUTE FUNCTION trigger_update_agent_targets();
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sales_targets IS 'Sales targets with cascading support (org → team → individual)';
COMMENT ON TABLE target_checkpoints IS 'Progress tracking at regular intervals within a target period';
COMMENT ON TABLE agent_achievements IS 'Gamification badges and achievements earned by agents';
COMMENT ON TABLE achievement_badges IS 'Reference table defining available achievement badges';
COMMENT ON TABLE agent_streaks IS 'Tracks current and longest streaks for gamification';
-- View comment only if view exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_agent_leaderboard') THEN
        COMMENT ON VIEW v_agent_leaderboard IS 'Real-time agent rankings with performance metrics';
    END IF;
END $$;
COMMENT ON FUNCTION update_target_progress IS 'Updates target achievement based on current data';
