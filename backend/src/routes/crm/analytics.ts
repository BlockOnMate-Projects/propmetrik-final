/**
 * CRM Analytics Routes
 * 
 * Handles pipeline analytics, deal metrics, agent performance,
 * revenue forecasting, leaderboard, deal velocity, loss analysis,
 * revenue trends, funnel conversion, period comparison, and export.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, asyncHandler, getUserId } from './helpers';
import db from '../../database';

const router = Router();

// ──────────────────────────────────────────────
// Pipeline Analytics
// ──────────────────────────────────────────────

router.get('/analytics/pipeline', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const pipelineId = req.query.pipelineId as string;
    if (!pipelineId) {
        return res.status(400).json({ error: 'pipelineId is required' });
    }

    const analyticsQuery = `
        WITH stage_metrics AS (
            SELECT 
                ds.id as stage_id,
                ds.stage_name as stage_name,
                ds.stage_order,
                COUNT(DISTINCT d.id) as deal_count,
                COALESCE(SUM(d.deal_value), 0) as total_value
            FROM deal_stages ds
            LEFT JOIN deals d ON d.stage_id = ds.id 
                AND d.deleted_at IS NULL
                AND d.organization_id = $1
            WHERE ds.pipeline_id = $2 AND ds.is_active = true
            GROUP BY ds.id, ds.stage_name, ds.stage_order
            ORDER BY ds.stage_order
        ),
        conversion_metrics AS (
            SELECT 
                COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END) as won_deals,
                COUNT(CASE WHEN d.deal_status = 'lost' THEN 1 END) as lost_deals,
                COUNT(*) as total_deals,
                COALESCE(SUM(CASE WHEN d.deal_status = 'won' THEN d.deal_value END), 0) as won_value
            FROM deals d
            WHERE d.pipeline_id = $2 AND d.organization_id = $1 AND d.deleted_at IS NULL
        )
        SELECT 
            json_build_object(
                'stages', (SELECT json_agg(row_to_json(stage_metrics.*)) FROM stage_metrics),
                'conversion', (SELECT row_to_json(conversion_metrics.*) FROM conversion_metrics)
            ) as analytics
    `;

    const result = await db.query(analyticsQuery, [organizationId, pipelineId]);
    res.json(result.rows[0]?.analytics || { stages: [], conversion: {} });
}));

// ──────────────────────────────────────────────
// Deal Metrics
// ──────────────────────────────────────────────

router.get('/analytics/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const dealType = req.query.deal_type as string;
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;

    let whereClause = 'd.organization_id = $1 AND d.deleted_at IS NULL';
    const params: any[] = [organizationId];

    if (dealType) {
        params.push(dealType);
        whereClause += ` AND d.deal_type = $${params.length}`;
    }
    if (dateFrom) {
        params.push(dateFrom);
        whereClause += ` AND d.created_at >= $${params.length}`;
    }
    if (dateTo) {
        params.push(dateTo);
        whereClause += ` AND d.created_at <= $${params.length}`;
    }

    const query = `
        SELECT 
            COUNT(*) as "totalDeals",
            COALESCE(SUM(deal_value), 0) as "totalValue",
            COALESCE(SUM(CASE WHEN deal_status = 'won' THEN deal_value ELSE 0 END), 0) as "wonValue",
            COALESCE(SUM(CASE WHEN deal_status = 'lost' THEN deal_value ELSE 0 END), 0) as "lostValue",
            COUNT(CASE WHEN deal_status = 'won' THEN 1 END) as "wonDeals",
            COUNT(CASE WHEN deal_status = 'lost' THEN 1 END) as "lostDeals",
            CASE 
                WHEN COUNT(*) > 0 
                THEN COUNT(CASE WHEN deal_status = 'won' THEN 1 END)::float / 
                     NULLIF(COUNT(CASE WHEN deal_status IN ('won', 'lost') THEN 1 END), 0)
                ELSE 0 
            END as "conversionRate"
        FROM deals d WHERE ${whereClause}
    `;

    const result = await db.query(query, params);
    res.json(result.rows[0] || { totalDeals: 0, totalValue: 0, wonValue: 0, lostValue: 0, conversionRate: 0 });
}));

// ──────────────────────────────────────────────
// Agent Performance
// ──────────────────────────────────────────────

router.get('/analytics/agents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const query = `
        SELECT 
            d.assigned_agent as user_id,
            COALESCE(u.first_name || ' ' || u.last_name, 'Unassigned') as name,
            COUNT(d.id) as total_deals,
            COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END) as won_deals,
            COALESCE(SUM(d.deal_value), 0) as pipeline_value,
            COALESCE(SUM(CASE WHEN d.deal_status = 'won' THEN d.deal_value END), 0) as won_value,
            CASE 
                WHEN COUNT(CASE WHEN d.deal_status IN ('won', 'lost') THEN 1 END) > 0
                THEN ROUND((COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END)::numeric / 
                     COUNT(CASE WHEN d.deal_status IN ('won', 'lost') THEN 1 END)) * 100, 1)
                ELSE 0 
            END as win_rate
        FROM deals d
        LEFT JOIN users u ON u.id = d.assigned_agent
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
        GROUP BY d.assigned_agent, u.first_name, u.last_name
        ORDER BY won_value DESC
        LIMIT 20
    `;

    const result = await db.query(query, [organizationId]);
    res.json(result.rows);
}));

// ──────────────────────────────────────────────
// Revenue Forecast
// ──────────────────────────────────────────────

router.get('/analytics/revenue-forecast', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

    const query = `
        WITH stage_forecasts AS (
            SELECT 
                ds.stage_name,
                COALESCE(SUM(d.deal_value), 0) as value,
                COALESCE(ds.probability, 50) as probability
            FROM deals d
            JOIN deal_stages ds ON d.stage_id = ds.id
            WHERE d.organization_id = $1 
              AND d.deleted_at IS NULL 
              AND d.deal_status = 'active'
            GROUP BY ds.stage_name, ds.probability
        )
        SELECT 
            json_build_object(
                'current_month', COALESCE((
                    SELECT SUM(deal_value) 
                    FROM deals 
                    WHERE organization_id = $1 
                      AND deal_status = 'won' 
                      AND actual_close_date >= $2 
                      AND actual_close_date < $3
                ), 0),
                'next_month', COALESCE((
                    SELECT SUM(deal_value * COALESCE(ds.probability, 50) / 100.0)
                    FROM deals d
                    JOIN deal_stages ds ON d.stage_id = ds.id
                    WHERE d.organization_id = $1 
                      AND d.deal_status = 'active'
                      AND d.estimated_close_date >= $3 
                      AND d.estimated_close_date <= $4
                ), 0),
                'quarter', COALESCE((
                    SELECT SUM(deal_value * COALESCE(ds.probability, 50) / 100.0)
                    FROM deals d
                    JOIN deal_stages ds ON d.stage_id = ds.id
                    WHERE d.organization_id = $1 
                      AND d.deal_status = 'active'
                      AND d.estimated_close_date <= $5
                ), 0),
                'by_stage', COALESCE((SELECT json_agg(row_to_json(stage_forecasts.*)) FROM stage_forecasts), '[]'::json)
            ) as forecast
    `;

    const result = await db.query(query, [
        organizationId, 
        currentMonthStart, 
        nextMonthStart, 
        nextMonthEnd,
        quarterEnd
    ]);
    res.json(result.rows[0]?.forecast || { current_month: 0, next_month: 0, quarter: 0, by_stage: [] });
}));

// ──────────────────────────────────────────────
// Leaderboard
// ──────────────────────────────────────────────

router.get('/analytics/leaderboard', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const period = req.query.period as string || 'month';
    let dateFrom: Date;
    const now = new Date();
    
    switch (period) {
        case 'week':
            dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'quarter':
            dateFrom = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            break;
        case 'year':
            dateFrom = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const query = `
        SELECT 
            d.assigned_agent as user_id,
            u.first_name || ' ' || u.last_name as user_name,
            COUNT(d.id) as deals_closed,
            COALESCE(SUM(d.deal_value), 0) as total_value,
            COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END) as deals_won
        FROM deals d
        LEFT JOIN users u ON u.id = d.assigned_agent
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
            AND d.actual_close_date >= $2 AND d.deal_status IN ('won', 'lost')
        GROUP BY d.assigned_agent, u.first_name, u.last_name
        ORDER BY total_value DESC LIMIT 20
    `;

    const result = await db.query(query, [organizationId, dateFrom]);
    res.json({ period, dateRange: { from: dateFrom, to: now }, leaderboard: result.rows });
}));

// ──────────────────────────────────────────────
// Revenue Trend (Time Series)
// ──────────────────────────────────────────────

router.get('/analytics/revenue-trend', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const months = parseInt(req.query.months as string) || 12;

    const query = `
        WITH months AS (
            SELECT generate_series(
                date_trunc('month', NOW() - interval '1 month' * ($2 - 1)),
                date_trunc('month', NOW()),
                '1 month'::interval
            )::date as month_start
        ),
        monthly_data AS (
            SELECT 
                date_trunc('month', COALESCE(d.actual_close_date, d.created_at))::date as period,
                COUNT(*) FILTER (WHERE d.deal_status = 'won') as won_count,
                COUNT(*) FILTER (WHERE d.deal_status = 'lost') as lost_count,
                COUNT(*) as deal_count,
                COALESCE(SUM(d.deal_value) FILTER (WHERE d.deal_status = 'won'), 0) as won_value,
                COALESCE(SUM(d.deal_value) FILTER (WHERE d.deal_status = 'lost'), 0) as lost_value,
                COALESCE(SUM(d.deal_value) FILTER (WHERE d.deal_status = 'active'), 0) as new_pipeline
            FROM deals d
            WHERE d.organization_id = $1 AND d.deleted_at IS NULL
                AND COALESCE(d.actual_close_date, d.created_at) >= date_trunc('month', NOW() - interval '1 month' * ($2 - 1))
            GROUP BY period
        )
        SELECT 
            to_char(m.month_start, 'YYYY-MM') as period,
            to_char(m.month_start, 'Mon YYYY') as period_label,
            COALESCE(md.won_value, 0)::numeric as won_value,
            COALESCE(md.lost_value, 0)::numeric as lost_value,
            COALESCE(md.new_pipeline, 0)::numeric as new_pipeline,
            COALESCE(md.deal_count, 0)::int as deal_count,
            COALESCE(md.won_count, 0)::int as won_count,
            COALESCE(md.lost_count, 0)::int as lost_count
        FROM months m
        LEFT JOIN monthly_data md ON md.period = m.month_start
        ORDER BY m.month_start
    `;

    const result = await db.query(query, [organizationId, months]);
    const data = result.rows;
    const totalWon = data.reduce((s: number, r: any) => s + Number(r.won_value), 0);
    const totalLost = data.reduce((s: number, r: any) => s + Number(r.lost_value), 0);

    res.json({
        data,
        total_won: totalWon,
        total_lost: totalLost,
        avg_monthly_won: data.length > 0 ? totalWon / data.length : 0
    });
}));

// ──────────────────────────────────────────────
// Deal Velocity / Cycle Time
// ──────────────────────────────────────────────

router.get('/analytics/velocity', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const pipelineId = req.query.pipelineId as string;

    // Overall velocity for closed deals
    const overallQuery = `
        SELECT 
            AVG(EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400)::numeric(10,1) as avg_days,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400
            )::numeric(10,1) as median_days
        FROM deals
        WHERE organization_id = $1 AND deleted_at IS NULL
            AND deal_status IN ('won', 'lost') AND actual_close_date IS NOT NULL
    `;
    const overallResult = await db.query(overallQuery, [organizationId]);

    // Velocity by stage (using stage_changed_at and deal_activities for transitions)
    let stageParams: any[] = [organizationId];
    let stageWhere = '';
    if (pipelineId) {
        stageParams.push(pipelineId);
        stageWhere = `AND d.pipeline_id = $${stageParams.length}`;
    }

    const stageQuery = `
        WITH stage_times AS (
            SELECT 
                ds.stage_name as stage_name,
                ds.stage_color as stage_color,
                EXTRACT(EPOCH FROM (
                    COALESCE(
                        LEAD(da.created_at) OVER (PARTITION BY da.deal_id ORDER BY da.created_at),
                        CASE WHEN d.deal_status IN ('won','lost') THEN d.actual_close_date ELSE NOW() END
                    ) - da.created_at
                )) / 86400 as days_in_stage,
                d.id as deal_id
            FROM deal_activities da
            JOIN deals d ON d.id = da.deal_id AND d.deleted_at IS NULL AND d.organization_id = $1 ${stageWhere}
            JOIN deal_stages ds ON da.new_value::jsonb->>'stageId' = ds.id::text
            WHERE da.activity_type = 'stage_change'
        )
        SELECT 
            stage_name,
            stage_color,
            AVG(days_in_stage)::numeric(10,1) as avg_days,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_in_stage)::numeric(10,1) as median_days,
            MIN(days_in_stage)::numeric(10,1) as min_days,
            MAX(days_in_stage)::numeric(10,1) as max_days,
            COUNT(DISTINCT deal_id)::int as deal_count
        FROM stage_times
        WHERE days_in_stage IS NOT NULL AND days_in_stage >= 0
        GROUP BY stage_name, stage_color
        ORDER BY avg_days DESC
    `;
    
    let stageResult;
    try {
        stageResult = await db.query(stageQuery, stageParams);
    } catch {
        // Fallback: simpler query using days_in_pipeline
        stageResult = { rows: [] };
    }

    // Velocity by deal type
    const typeQuery = `
        SELECT 
            deal_type,
            AVG(EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400)::numeric(10,1) as avg_days,
            COUNT(*)::int as deal_count
        FROM deals
        WHERE organization_id = $1 AND deleted_at IS NULL
            AND deal_status = 'won' AND actual_close_date IS NOT NULL
        GROUP BY deal_type
        ORDER BY avg_days
    `;
    const typeResult = await db.query(typeQuery, [organizationId]);

    // Velocity trend (monthly avg close time)
    const trendQuery = `
        SELECT 
            to_char(date_trunc('month', actual_close_date), 'YYYY-MM') as period,
            AVG(EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400)::numeric(10,1) as avg_days,
            COUNT(*)::int as deal_count
        FROM deals
        WHERE organization_id = $1 AND deleted_at IS NULL
            AND deal_status = 'won' AND actual_close_date IS NOT NULL
            AND actual_close_date >= NOW() - interval '12 months'
        GROUP BY date_trunc('month', actual_close_date)
        ORDER BY period
    `;
    const trendResult = await db.query(trendQuery, [organizationId]);

    res.json({
        overall_avg_days: Number(overallResult.rows[0]?.avg_days) || 0,
        overall_median_days: Number(overallResult.rows[0]?.median_days) || 0,
        by_stage: stageResult.rows,
        by_deal_type: typeResult.rows,
        trend: trendResult.rows,
    });
}));

// ──────────────────────────────────────────────
// Loss Reason Analysis
// ──────────────────────────────────────────────

router.get('/analytics/loss-reasons', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;

    let dateWhere = '';
    const params: any[] = [organizationId];
    if (dateFrom) { params.push(dateFrom); dateWhere += ` AND d.actual_close_date >= $${params.length}`; }
    if (dateTo) { params.push(dateTo); dateWhere += ` AND d.actual_close_date <= $${params.length}`; }

    // By reason
    const reasonQuery = `
        WITH lost_deals AS (
            SELECT 
                COALESCE(LOWER(TRIM(d.custom_fields->>'close_reason')), 'other') as reason,
                COUNT(*)::int as count,
                COALESCE(SUM(d.deal_value), 0)::numeric as total_value
            FROM deals d
            WHERE d.organization_id = $1 AND d.deleted_at IS NULL
                AND d.deal_status = 'lost' ${dateWhere}
            GROUP BY reason
        ),
        total AS (SELECT COALESCE(SUM(count), 0) as total_count, COALESCE(SUM(total_value), 0) as total_value FROM lost_deals)
        SELECT 
            ld.reason,
            ld.count,
            ld.total_value,
            CASE WHEN t.total_count > 0 THEN ROUND((ld.count::numeric / t.total_count) * 100, 1) ELSE 0 END as percentage
        FROM lost_deals ld, total t
        ORDER BY ld.count DESC
    `;
    const reasonResult = await db.query(reasonQuery, params);

    // By stage where lost
    const stageQuery = `
        SELECT 
            ds.stage_name as stage_name,
            COUNT(*)::int as lost_count,
            COALESCE(SUM(d.deal_value), 0)::numeric as lost_value
        FROM deals d
        JOIN deal_stages ds ON d.stage_id = ds.id
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
            AND d.deal_status = 'lost' ${dateWhere}
        GROUP BY ds.stage_name
        ORDER BY lost_count DESC
    `;
    const stageResult = await db.query(stageQuery, params);

    // Loss trend (monthly)
    const trendQuery = `
        SELECT 
            to_char(date_trunc('month', d.actual_close_date), 'YYYY-MM') as period,
            COUNT(*)::int as lost_count,
            COALESCE(SUM(d.deal_value), 0)::numeric as lost_value
        FROM deals d
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
            AND d.deal_status = 'lost' AND d.actual_close_date IS NOT NULL
            AND d.actual_close_date >= NOW() - interval '12 months'
        GROUP BY date_trunc('month', d.actual_close_date)
        ORDER BY period
    `;
    const trendResult = await db.query(trendQuery, [organizationId]);

    const totalLost = reasonResult.rows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const totalLostValue = reasonResult.rows.reduce((s: number, r: any) => s + Number(r.total_value), 0);

    res.json({
        total_lost: totalLost,
        total_lost_value: totalLostValue,
        by_reason: reasonResult.rows,
        by_stage: stageResult.rows,
        trend: trendResult.rows,
    });
}));

// ──────────────────────────────────────────────
// Pipeline Funnel (enhanced)
// ──────────────────────────────────────────────

router.get('/analytics/funnel', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const pipelineId = req.query.pipelineId as string;
    if (!pipelineId) {
        return res.status(400).json({ error: 'pipelineId is required' });
    }

    const query = `
        WITH stage_data AS (
            SELECT 
                ds.id as stage_id,
                ds.stage_name as stage_name,
                ds.stage_color as stage_color,
                ds.stage_order,
                COUNT(DISTINCT d.id)::int as deal_count,
                COALESCE(SUM(d.deal_value), 0)::numeric as total_value
            FROM deal_stages ds
            LEFT JOIN deals d ON d.stage_id = ds.id 
                AND d.deleted_at IS NULL 
                AND d.organization_id = $1
                AND d.deal_status = 'active'
            WHERE ds.pipeline_id = $2 AND ds.is_active = true
            GROUP BY ds.id, ds.stage_name, ds.stage_color, ds.stage_order
            ORDER BY ds.stage_order
        ),
        -- Count deals that ever passed through each stage
        stage_flow AS (
            SELECT 
                ds.id as stage_id,
                COUNT(DISTINCT da.deal_id)::int as passed_through
            FROM deal_stages ds
            LEFT JOIN deal_activities da ON da.new_value::text LIKE '%' || ds.id::text || '%'
                AND da.activity_type = 'stage_change'
            LEFT JOIN deals d ON d.id = da.deal_id AND d.organization_id = $1 AND d.deleted_at IS NULL
            WHERE ds.pipeline_id = $2 AND ds.is_active = true
            GROUP BY ds.id
        )
        SELECT 
            sd.*,
            COALESCE(sf.passed_through, sd.deal_count) as cumulative_deals
        FROM stage_data sd
        LEFT JOIN stage_flow sf ON sf.stage_id = sd.stage_id
        ORDER BY sd.stage_order
    `;

    const result = await db.query(query, [organizationId, pipelineId]);
    const stages = result.rows;

    // Calculate conversion rates between stages
    const enrichedStages = stages.map((stage: any, idx: number) => {
        const prevCount = idx > 0 ? stages[idx - 1].cumulative_deals : stage.cumulative_deals;
        return {
            ...stage,
            conversion_rate: prevCount > 0 ? Math.round((stage.cumulative_deals / prevCount) * 100 * 10) / 10 : 100,
            avg_time_days: 0, // Would need stage transition data
        };
    });

    const firstCount = enrichedStages[0]?.cumulative_deals || 0;
    const wonCount = await db.query(
        `SELECT COUNT(*)::int as c FROM deals WHERE pipeline_id = $1 AND organization_id = $2 AND deal_status = 'won' AND deleted_at IS NULL`,
        [pipelineId, organizationId]
    );

    res.json({
        pipeline_id: pipelineId,
        stages: enrichedStages,
        overall_conversion: firstCount > 0 ? Math.round((wonCount.rows[0].c / firstCount) * 100 * 10) / 10 : 0,
    });
}));

// ──────────────────────────────────────────────
// Period Comparison (This Month vs Last Month)
// ──────────────────────────────────────────────

router.get('/analytics/comparison', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const period = req.query.period as string || 'month';
    const now = new Date();
    let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;
    let currentLabel: string, previousLabel: string;

    switch (period) {
        case 'week': {
            const dayOfWeek = now.getDay();
            currentStart = new Date(now);
            currentStart.setDate(now.getDate() - dayOfWeek);
            currentStart.setHours(0, 0, 0, 0);
            currentEnd = now;
            previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 7);
            previousEnd = new Date(currentStart);
            previousEnd.setMilliseconds(-1);
            currentLabel = 'This Week';
            previousLabel = 'Last Week';
            break;
        }
        case 'quarter': {
            const qStart = Math.floor(now.getMonth() / 3) * 3;
            currentStart = new Date(now.getFullYear(), qStart, 1);
            currentEnd = now;
            previousStart = new Date(now.getFullYear(), qStart - 3, 1);
            previousEnd = new Date(now.getFullYear(), qStart, 0, 23, 59, 59, 999);
            currentLabel = `Q${Math.floor(qStart / 3) + 1} ${now.getFullYear()}`;
            previousLabel = `Q${Math.floor((qStart - 3) / 3) + 1} ${qStart >= 3 ? now.getFullYear() : now.getFullYear() - 1}`;
            break;
        }
        default: { // month
            currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
            currentEnd = now;
            previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            currentLabel = `${months[now.getMonth()]} ${now.getFullYear()}`;
            const pm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            previousLabel = `${months[pm]} ${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}`;
            break;
        }
    }

    const metricsQuery = `
        SELECT 
            COUNT(*) FILTER (WHERE created_at >= $2 AND created_at <= $3)::int as deals_created,
            COUNT(*) FILTER (WHERE deal_status = 'won' AND actual_close_date >= $2 AND actual_close_date <= $3)::int as deals_won,
            COUNT(*) FILTER (WHERE deal_status = 'lost' AND actual_close_date >= $2 AND actual_close_date <= $3)::int as deals_lost,
            COALESCE(SUM(deal_value) FILTER (WHERE deal_status = 'won' AND actual_close_date >= $2 AND actual_close_date <= $3), 0)::numeric as revenue_won,
            COALESCE(SUM(deal_value) FILTER (WHERE deal_status = 'lost' AND actual_close_date >= $2 AND actual_close_date <= $3), 0)::numeric as revenue_lost,
            COALESCE(SUM(deal_value) FILTER (WHERE deal_status = 'active' AND created_at >= $2 AND created_at <= $3), 0)::numeric as pipeline_value,
            COALESCE(AVG(deal_value) FILTER (WHERE deal_status = 'won' AND actual_close_date >= $2 AND actual_close_date <= $3), 0)::numeric as avg_deal_value,
            CASE 
                WHEN COUNT(*) FILTER (WHERE deal_status IN ('won','lost') AND actual_close_date >= $2 AND actual_close_date <= $3) > 0
                THEN (COUNT(*) FILTER (WHERE deal_status = 'won' AND actual_close_date >= $2 AND actual_close_date <= $3)::numeric /
                      COUNT(*) FILTER (WHERE deal_status IN ('won','lost') AND actual_close_date >= $2 AND actual_close_date <= $3)) * 100
                ELSE 0
            END::numeric(10,1) as conversion_rate,
            COALESCE(AVG(EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400) 
                FILTER (WHERE deal_status = 'won' AND actual_close_date >= $2 AND actual_close_date <= $3), 0)::numeric(10,1) as avg_cycle_days
        FROM deals
        WHERE organization_id = $1 AND deleted_at IS NULL
    `;

    const [currentResult, previousResult] = await Promise.all([
        db.query(metricsQuery, [organizationId, currentStart, currentEnd]),
        db.query(metricsQuery, [organizationId, previousStart, previousEnd]),
    ]);

    const current = currentResult.rows[0];
    const previous = previousResult.rows[0];

    const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100 * 10) / 10;

    res.json({
        current: { ...current, label: currentLabel },
        previous: { ...previous, label: previousLabel },
        changes: {
            deals_created: pctChange(Number(current.deals_created), Number(previous.deals_created)),
            deals_won: pctChange(Number(current.deals_won), Number(previous.deals_won)),
            deals_lost: pctChange(Number(current.deals_lost), Number(previous.deals_lost)),
            revenue_won: pctChange(Number(current.revenue_won), Number(previous.revenue_won)),
            revenue_lost: pctChange(Number(current.revenue_lost), Number(previous.revenue_lost)),
            pipeline_value: pctChange(Number(current.pipeline_value), Number(previous.pipeline_value)),
            avg_deal_value: pctChange(Number(current.avg_deal_value), Number(previous.avg_deal_value)),
            conversion_rate: Number((Number(current.conversion_rate) - Number(previous.conversion_rate)).toFixed(1)),
            avg_cycle_days: pctChange(Number(current.avg_cycle_days), Number(previous.avg_cycle_days)),
        },
    });
}));

// ──────────────────────────────────────────────
// Export Analytics Data (CSV / Excel / PDF)
// ──────────────────────────────────────────────

router.get('/analytics/export', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const format = req.query.format as string || 'csv';
    const type = req.query.type as string || 'deals';
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;

    let whereClause = 'd.organization_id = $1 AND d.deleted_at IS NULL';
    const params: any[] = [organizationId];
    if (dateFrom) { params.push(dateFrom); whereClause += ` AND d.created_at >= $${params.length}`; }
    if (dateTo) { params.push(dateTo); whereClause += ` AND d.created_at <= $${params.length}`; }

    let query: string;
    let filename: string;

    switch (type) {
        case 'deals':
            query = `
                SELECT 
                    d.deal_number, d.title, d.deal_type, d.deal_status,
                    d.deal_value, d.currency, d.close_probability,
                    ds.stage_name as stage_name,
                    c.first_name || ' ' || c.last_name as contact_name,
                    COALESCE(u.first_name || ' ' || u.last_name, 'Unassigned') as agent_name,
                    d.estimated_close_date, d.actual_close_date, d.custom_fields->>'close_reason' as close_reason,
                    d.created_at, d.days_in_pipeline
                FROM deals d
                LEFT JOIN deal_stages ds ON d.stage_id = ds.id
                LEFT JOIN contacts c ON d.primary_contact_id = c.id
                LEFT JOIN users u ON d.assigned_agent = u.id
                WHERE ${whereClause}
                ORDER BY d.created_at DESC
            `;
            filename = `deals-export-${new Date().toISOString().split('T')[0]}`;
            break;
        case 'agents':
            query = `
                SELECT 
                    COALESCE(u.first_name || ' ' || u.last_name, 'Unassigned') as agent_name,
                    COUNT(d.id) as total_deals,
                    COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END) as won_deals,
                    COUNT(CASE WHEN d.deal_status = 'lost' THEN 1 END) as lost_deals,
                    COALESCE(SUM(d.deal_value), 0) as pipeline_value,
                    COALESCE(SUM(CASE WHEN d.deal_status = 'won' THEN d.deal_value END), 0) as won_value,
                    CASE 
                        WHEN COUNT(CASE WHEN d.deal_status IN ('won','lost') THEN 1 END) > 0
                        THEN ROUND((COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END)::numeric /
                             COUNT(CASE WHEN d.deal_status IN ('won','lost') THEN 1 END)) * 100, 1)
                        ELSE 0
                    END as win_rate
                FROM deals d
                LEFT JOIN users u ON d.assigned_agent = u.id
                WHERE ${whereClause}
                GROUP BY u.first_name, u.last_name
                ORDER BY won_value DESC
            `;
            filename = `agent-performance-${new Date().toISOString().split('T')[0]}`;
            break;
        default:
            return res.status(400).json({ error: 'Invalid export type' });
    }

    const result = await db.query(query, params);

    if (format === 'csv') {
        if (result.rows.length === 0) {
            return res.status(200).send('No data');
        }
        const headers = Object.keys(result.rows[0]);
        const csvRows = [
            headers.join(','),
            ...result.rows.map((row: any) =>
                headers.map(h => {
                    const val = row[h];
                    if (val === null || val === undefined) return '';
                    const str = String(val);
                    return str.includes(',') || str.includes('"') || str.includes('\n')
                        ? `"${str.replace(/"/g, '""')}"` : str;
                }).join(',')
            )
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send(csvRows);
    }

    if (format === 'excel') {
        try {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet(type === 'agents' ? 'Agent Performance' : 'Deals');

            if (result.rows.length > 0) {
                const headers = Object.keys(result.rows[0]);
                sheet.addRow(headers.map(h => h.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())));
                // Style header row
                sheet.getRow(1).font = { bold: true };
                sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

                result.rows.forEach((row: any) => {
                    sheet.addRow(headers.map(h => row[h]));
                });

                // Auto-size columns
                headers.forEach((_h: string, i: number) => {
                    sheet.getColumn(i + 1).width = 18;
                });
            }

            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            return res.send(Buffer.from(buffer));
        } catch (err) {
            console.error('Excel export error:', err);
            return res.status(500).json({ error: 'Excel export failed. ExcelJS may not be available.' });
        }
    }

    // Default: JSON
    res.json(result.rows);
}));

// ──────────────────────────────────────────────
// Scheduled Reports CRUD
// ──────────────────────────────────────────────

router.get('/analytics/scheduled-reports', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const query = `
        SELECT * FROM crm_scheduled_reports 
        WHERE organization_id = $1 AND deleted_at IS NULL 
        ORDER BY created_at DESC
    `;

    try {
        const result = await db.query(query, [organizationId]);
        res.json(result.rows);
    } catch {
        // Table may not exist yet — return empty
        res.json([]);
    }
}));

router.post('/analytics/scheduled-reports', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { report_type, frequency, format, recipients, pipeline_id } = req.body;

    if (!report_type || !frequency || !format || !recipients?.length) {
        return res.status(400).json({ error: 'Missing required fields: report_type, frequency, format, recipients' });
    }

    // Calculate next send time
    const now = new Date();
    let nextSend: Date;
    switch (frequency) {
        case 'daily': nextSend = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8); break;
        case 'weekly': {
            nextSend = new Date(now);
            nextSend.setDate(now.getDate() + (7 - now.getDay()) + 1); // Next Monday
            nextSend.setHours(8, 0, 0, 0);
            break;
        }
        default: { // monthly
            nextSend = new Date(now.getFullYear(), now.getMonth() + 1, 1, 8);
            break;
        }
    }

    const query = `
        INSERT INTO crm_scheduled_reports (
            organization_id, report_type, frequency, format, recipients, pipeline_id,
            is_active, next_send_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
        RETURNING *
    `;

    // Table created by migration 219_crm_runtime_tables.sql
    const result = await db.query(query, [
        organizationId, report_type, frequency, format, recipients, pipeline_id || null, nextSend, userId
    ]);
    res.status(201).json(result.rows[0]);
}));

router.delete('/analytics/scheduled-reports/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    try {
        await db.query(
            `UPDATE crm_scheduled_reports SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2`,
            [req.params.id, organizationId]
        );
    } catch {
        // Table doesn't exist — ignore
    }
    res.status(204).send();
}));

export default router;
