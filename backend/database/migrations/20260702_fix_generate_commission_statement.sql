-- Fix generate_commission_statement(): it referenced two columns/tables that
-- don't match the real schema, so statement generation threw
-- "column d.reference_number does not exist" for every call:
--   • deals has no `reference_number` → the human reference is `deal_number`
--   • deal.property_ids point at `crm_properties` (the CRM mirror), not `properties`
--     (the valuation hub) — so the address join matched nothing.
-- Everything else (summary math, statement upsert, line-item insert) is unchanged.
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.generate_commission_statement(
    p_organization_id uuid,
    p_agent_id uuid,
    p_period_start date,
    p_period_end date
) RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
    v_statement_id UUID;
    v_statement_number VARCHAR(50);
    v_summary RECORD;
BEGIN
    v_statement_number := 'STMT-' || TO_CHAR(p_period_start, 'YYYYMM') || '-' ||
                          SUBSTRING(p_agent_id::TEXT, 1, 8);

    SELECT
        COUNT(DISTINCT cr.deal_id) AS total_deals,
        COALESCE(SUM(cr.deal_value), 0) AS total_deal_value,
        COALESCE(SUM(cr.gross_commission), 0) AS gross_commission,
        COALESCE(SUM(CASE WHEN cr.is_clawback THEN cr.agent_share ELSE 0 END), 0) AS clawbacks,
        COALESCE(SUM(CASE WHEN cr.source_type = 'bonus' THEN cr.agent_share ELSE 0 END), 0) AS bonuses
    INTO v_summary
    FROM commission_records cr
    WHERE cr.organization_id = p_organization_id
      AND cr.agent_id = p_agent_id
      AND cr.deal_close_date BETWEEN p_period_start AND p_period_end
      AND cr.status IN ('pending', 'approved');

    INSERT INTO commission_statements (
        organization_id, agent_id, statement_number, period_start, period_end,
        total_deals, total_deal_value, gross_commission, clawbacks, bonuses, net_commission
    ) VALUES (
        p_organization_id, p_agent_id, v_statement_number, p_period_start, p_period_end,
        v_summary.total_deals, v_summary.total_deal_value, v_summary.gross_commission,
        v_summary.clawbacks, v_summary.bonuses,
        v_summary.gross_commission - v_summary.clawbacks + v_summary.bonuses
    )
    ON CONFLICT (organization_id, agent_id, period_start, period_end)
    DO UPDATE SET
        total_deals = EXCLUDED.total_deals,
        total_deal_value = EXCLUDED.total_deal_value,
        gross_commission = EXCLUDED.gross_commission,
        clawbacks = EXCLUDED.clawbacks,
        bonuses = EXCLUDED.bonuses,
        net_commission = EXCLUDED.net_commission,
        updated_at = NOW()
    RETURNING id INTO v_statement_id;

    INSERT INTO statement_line_items (
        statement_id, commission_record_id, deal_reference, property_address,
        deal_close_date, deal_value, commission_amount
    )
    SELECT
        v_statement_id,
        cr.id,
        d.deal_number,                                   -- was d.reference_number
        p.address_street,
        cr.deal_close_date,
        cr.deal_value,
        cr.agent_share
    FROM commission_records cr
    JOIN deals d ON cr.deal_id = d.id
    LEFT JOIN crm_properties p ON p.id = ANY(d.property_ids)   -- was properties
    WHERE cr.organization_id = p_organization_id
      AND cr.agent_id = p_agent_id
      AND cr.deal_close_date BETWEEN p_period_start AND p_period_end
    ON CONFLICT (statement_id, commission_record_id) DO NOTHING;

    RETURN v_statement_id;
END;
$function$;
