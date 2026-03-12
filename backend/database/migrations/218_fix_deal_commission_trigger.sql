-- Fix create_commission_on_deal_close trigger function
-- The original function referenced legacy column names:
--   NEW.stage → should be NEW.deal_status (checking for 'won' not 'closed_won')
--   NEW.value → should be NEW.deal_value
--   NEW.owner_id → should be NEW.assigned_agent
--
-- IMPORTANT: This must be run as propmetrik_admin (the function owner).
-- Cannot be run as propmetrik_app — will get "permission denied" error.
-- After running, re-enable the trigger: ALTER TABLE deals ENABLE TRIGGER trigger_deal_commission;

CREATE OR REPLACE FUNCTION create_commission_on_deal_close()
RETURNS TRIGGER AS $$
DECLARE
    v_calc RECORD;
    v_agent_id UUID;
    v_deal_value DECIMAL;
BEGIN
    -- Only trigger when deal status changes to won
    IF NEW.deal_status = 'won' AND (OLD.deal_status IS NULL OR OLD.deal_status != 'won') THEN

        -- Get deal value
        v_deal_value := COALESCE(NEW.deal_value, 0);
        IF v_deal_value = 0 THEN
            RETURN NEW;
        END IF;

        -- Get primary agent
        v_agent_id := NEW.assigned_agent;

        IF v_agent_id IS NOT NULL THEN
            -- Calculate commission
            SELECT * INTO v_calc
            FROM calculate_deal_commission(NEW.id, v_agent_id, v_deal_value, NEW.organization_id);

            -- Insert commission record
            INSERT INTO commission_records (
                organization_id, deal_id, agent_id, source_type,
                deal_value, commission_rate, split_percentage,
                gross_commission, agent_share, company_share,
                deal_close_date, accrual_date
            ) VALUES (
                NEW.organization_id, NEW.id, v_agent_id, 'deal_close',
                v_deal_value, v_calc.commission_rate, 100,
                v_calc.gross_commission, v_calc.agent_share, v_calc.company_share,
                COALESCE(NEW.actual_close_date, CURRENT_DATE), CURRENT_DATE
            )
            ON CONFLICT (deal_id, agent_id, source_type) DO UPDATE SET
                deal_value = EXCLUDED.deal_value,
                commission_rate = EXCLUDED.commission_rate,
                gross_commission = EXCLUDED.gross_commission,
                agent_share = EXCLUDED.agent_share,
                company_share = EXCLUDED.company_share,
                updated_at = NOW();
        END IF;

        -- Handle co-agent splits
        INSERT INTO commission_records (
            organization_id, deal_id, agent_id, source_type,
            deal_value, commission_rate, split_percentage,
            gross_commission, agent_share, company_share,
            deal_close_date, accrual_date
        )
        SELECT
            NEW.organization_id, NEW.id, cs.agent_id,
            CASE cs.role WHEN 'referral' THEN 'referral' ELSE 'deal_close' END,
            v_deal_value, 0.03, cs.split_percentage,
            v_deal_value * 0.03,
            (v_deal_value * 0.03) * (cs.split_percentage / 100),
            0,
            COALESCE(NEW.closed_at, CURRENT_DATE), CURRENT_DATE
        FROM commission_splits cs
        WHERE cs.deal_id = NEW.id
          AND cs.agent_id != v_agent_id
        ON CONFLICT (deal_id, agent_id, source_type) DO NOTHING;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
