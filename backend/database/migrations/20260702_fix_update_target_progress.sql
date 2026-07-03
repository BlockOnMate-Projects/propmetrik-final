-- Fix update_target_progress(): every column it read from `deals` was wrong for
-- the actual schema, so sales-target attainment silently stayed 0 (or threw):
--   • d.assigned_agent_id  → deals uses `assigned_agent`
--   • d.status = 'won'      → deals uses `deal_status`
--   • d.closed_at           → deals uses `actual_close_date`
-- Progress/pacing math is unchanged. Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.update_target_progress(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    v_target RECORD;
    v_achieved DECIMAL(15,2);
    v_total_days INTEGER;
    v_elapsed_days INTEGER;
    v_expected_progress DECIMAL(5,2);
    v_actual_progress DECIMAL(5,2);
BEGIN
    SELECT * INTO v_target FROM sales_targets WHERE id = p_target_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_target.target_type = 'revenue' THEN
        SELECT COALESCE(SUM(d.deal_value), 0) INTO v_achieved
        FROM deals d
        WHERE d.assigned_agent = v_target.agent_id
          AND d.deal_status = 'won'
          AND d.actual_close_date >= v_target.period_start
          AND d.actual_close_date <= v_target.period_end;

    ELSIF v_target.target_type = 'deal_count' THEN
        SELECT COUNT(*) INTO v_achieved
        FROM deals d
        WHERE d.assigned_agent = v_target.agent_id
          AND d.deal_status = 'won'
          AND d.actual_close_date >= v_target.period_start
          AND d.actual_close_date <= v_target.period_end;

    ELSIF v_target.target_type = 'activities' THEN
        SELECT COUNT(*) INTO v_achieved
        FROM deal_activities da
        JOIN deals d ON d.id = da.deal_id
        WHERE d.assigned_agent = v_target.agent_id
          AND da.created_at >= v_target.period_start
          AND da.created_at <= v_target.period_end;
    END IF;

    v_total_days := v_target.period_end - v_target.period_start + 1;
    v_elapsed_days := GREATEST(CURRENT_DATE - v_target.period_start, 0);
    v_expected_progress := (v_elapsed_days::DECIMAL / v_total_days) * 100;
    v_actual_progress := CASE WHEN v_target.target_value > 0
                         THEN (v_achieved / v_target.target_value) * 100
                         ELSE 0 END;

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
$function$;
