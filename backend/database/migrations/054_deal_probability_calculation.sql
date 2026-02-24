-- =====================================================
-- Update Deal Stage Probabilities & Add Agent Closing Rate
-- Enterprise-grade probability calculation
-- =====================================================

-- Update pipeline stage probabilities with realistic values based on stage
UPDATE deal_stages SET probability = CASE stage_name
    -- Property Sales Pipeline
    WHEN 'New Lead' THEN 10
    WHEN 'Qualified' THEN 20
    WHEN 'Property Shortlist' THEN 30
    WHEN 'Site Visit' THEN 40
    WHEN 'Offer Made' THEN 50
    WHEN 'Negotiation' THEN 60
    WHEN 'Due Diligence' THEN 70
    WHEN 'Contract Signing' THEN 80
    WHEN 'Payment Processing' THEN 90
    WHEN 'Title Transfer' THEN 95
    WHEN 'Closed Won' THEN 100
    WHEN 'Closed Lost' THEN 0
    -- Rental Pipeline
    WHEN 'New Inquiry' THEN 10
    WHEN 'Qualified Tenant' THEN 20
    WHEN 'Property Viewing' THEN 35
    WHEN 'Application Submitted' THEN 50
    WHEN 'Tenant Screening' THEN 60
    WHEN 'Reference Check' THEN 70
    WHEN 'Lease Negotiation' THEN 75
    WHEN 'Advance Payment' THEN 85
    WHEN 'Lease Signing' THEN 95
    WHEN 'Move-In' THEN 100
    WHEN 'Rental Active' THEN 100
    WHEN 'Application Rejected' THEN 0
    ELSE probability
END;

-- Add closing_rate to agents table for historical performance tracking
ALTER TABLE agents ADD COLUMN IF NOT EXISTS closing_rate DECIMAL(5,2) DEFAULT 50.00;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_deals_attempted INTEGER DEFAULT 0;

-- Create function to calculate agent closing rate
CREATE OR REPLACE FUNCTION calculate_agent_closing_rate(agent_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
    won_count INTEGER;
    total_count INTEGER;
    rate DECIMAL;
BEGIN
    -- Count won deals
    SELECT COUNT(*) INTO won_count 
    FROM deals 
    WHERE assigned_agent = agent_uuid 
      AND deal_status = 'won'
      AND deleted_at IS NULL;
    
    -- Count total closed deals (won + lost)
    SELECT COUNT(*) INTO total_count 
    FROM deals 
    WHERE assigned_agent = agent_uuid 
      AND deal_status IN ('won', 'lost')
      AND deleted_at IS NULL;
    
    -- Calculate rate (default 50% if no history)
    IF total_count = 0 THEN
        rate := 50.00;
    ELSE
        rate := (won_count::DECIMAL / total_count::DECIMAL) * 100;
    END IF;
    
    RETURN rate;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate deal probability
-- Formula: (Stage Probability * Agent Closing Rate) / 100
-- This weights the stage probability by the agent's historical performance
CREATE OR REPLACE FUNCTION calculate_deal_probability(
    p_stage_id UUID,
    p_agent_id UUID
)
RETURNS INTEGER AS $$
DECLARE
    stage_prob INTEGER;
    agent_rate DECIMAL;
    final_prob INTEGER;
BEGIN
    -- Get stage probability
    SELECT COALESCE(probability, 50) INTO stage_prob
    FROM deal_stages
    WHERE id = p_stage_id;
    
    -- Get agent closing rate
    agent_rate := calculate_agent_closing_rate(p_agent_id);
    
    -- Calculate weighted probability
    -- Base: stage probability, adjusted by agent performance factor
    -- If agent has 100% closing rate, probability = stage probability
    -- If agent has 50% closing rate, probability = stage probability * 0.75 (midpoint adjustment)
    -- If agent has 0% closing rate, probability = stage probability * 0.5
    final_prob := ROUND(stage_prob * (0.5 + (agent_rate / 200)));
    
    -- Cap at 0-100
    IF final_prob > 100 THEN final_prob := 100; END IF;
    IF final_prob < 0 THEN final_prob := 0; END IF;
    
    RETURN final_prob;
END;
$$ LANGUAGE plpgsql;

-- Update agents with their current closing rates
UPDATE agents a SET 
    closing_rate = calculate_agent_closing_rate(a.id),
    total_deals_attempted = (
        SELECT COUNT(*) FROM deals d 
        WHERE d.assigned_agent = a.id 
        AND d.deal_status IN ('won', 'lost')
        AND d.deleted_at IS NULL
    );

-- Create trigger to update agent closing rate when deal is closed
CREATE OR REPLACE FUNCTION update_agent_closing_rate_on_deal_close()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update when deal status changes to won or lost
    IF NEW.deal_status IN ('won', 'lost') AND 
       (OLD.deal_status IS NULL OR OLD.deal_status NOT IN ('won', 'lost')) THEN
        UPDATE agents 
        SET closing_rate = calculate_agent_closing_rate(NEW.assigned_agent),
            total_deals_attempted = total_deals_attempted + 1,
            total_deals_closed = CASE WHEN NEW.deal_status = 'won' 
                                      THEN total_deals_closed + 1 
                                      ELSE total_deals_closed END
        WHERE id = NEW.assigned_agent;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_agent_closing_rate ON deals;
CREATE TRIGGER trigger_update_agent_closing_rate
    AFTER UPDATE OF deal_status ON deals
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_closing_rate_on_deal_close();

-- Update sample agents with varied closing rates for testing
UPDATE agents SET closing_rate = 78.5, total_deals_attempted = 45 WHERE first_name = 'Kwame';
UPDATE agents SET closing_rate = 82.3, total_deals_attempted = 62 WHERE first_name = 'Abena';
UPDATE agents SET closing_rate = 65.0, total_deals_attempted = 28 WHERE first_name = 'Kofi';
UPDATE agents SET closing_rate = 71.2, total_deals_attempted = 35 WHERE first_name = 'Akua';
UPDATE agents SET closing_rate = 55.0, total_deals_attempted = 12 WHERE first_name = 'Yaw';
