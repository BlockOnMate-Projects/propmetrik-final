/**
 * Advanced Analytics Service
 * Cohort analysis, win/loss, funnel metrics
 * Phase 5.12: Advanced Analytics & Mobile
 */

import { pool } from '../../src/database';
import { logger } from '../../src/utils/logger';

// Types
export interface CohortData {
  cohort: string;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  activeDeals: number;
  winRate: number;
  totalValue: number;
  avgDealSize: number;
  avgCycleTime: number;
}

export interface WinLossAnalysis {
  period: string;
  won: { count: number; value: number };
  lost: { count: number; value: number };
  winRate: number;
  topWinReasons: Array<{ reason: string; count: number }>;
  topLossReasons: Array<{ reason: string; count: number }>;
  avgTimeToWin: number;
  avgTimeToLoss: number;
}

export interface FunnelStage {
  stageId: string;
  stageName: string;
  stageOrder: number;
  dealsCount: number;
  dealsValue: number;
  conversionRate: number;
  avgTimeInStage: number;
  dropoffRate: number;
}

export interface DealVelocityMetrics {
  avgCycleTime: number;
  medianCycleTime: number;
  avgTimePerStage: Record<string, number>;
  velocityTrend: Array<{ period: string; avgCycleTime: number }>;
}

export interface LeadSourceAnalysis {
  source: string;
  dealsCount: number;
  wonDeals: number;
  lostDeals: number;
  winRate: number;
  totalValue: number;
  avgDealSize: number;
  roi?: number;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  dealsWon: number;
  dealsLost: number;
  winRate: number;
  totalValue: number;
  avgDealSize: number;
  avgCycleTime: number;
  activitiesCount: number;
  tasksCompleted: number;
  targetProgress?: number;
}

class AdvancedAnalyticsService {
  
  /**
   * Get cohort analysis by lead source, time period, or custom grouping
   */
  async getCohortAnalysis(
    organizationId: string,
    groupBy: 'month' | 'quarter' | 'source' | 'agent' = 'month',
    pipelineId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CohortData[]> {
    let groupColumn: string;
    let groupLabel: string;
    
    switch (groupBy) {
      case 'quarter':
        groupColumn = "TO_CHAR(d.created_at, 'YYYY-Q' || CEIL(EXTRACT(MONTH FROM d.created_at)/3))";
        groupLabel = 'Quarter';
        break;
      case 'source':
        groupColumn = "COALESCE(d.lead_source, 'Unknown')";
        groupLabel = 'Source';
        break;
      case 'agent':
        groupColumn = 'd.assigned_agent::text';
        groupLabel = 'Agent';
        break;
      default:
        groupColumn = "TO_CHAR(d.created_at, 'YYYY-MM')";
        groupLabel = 'Month';
    }
    
    let query = `
      WITH cohort_deals AS (
        SELECT 
          ${groupColumn} as cohort,
          d.id,
          d.deal_value as value,
          d.deal_status as status,
          d.created_at,
          d.actual_close_date as closed_at,
          EXTRACT(EPOCH FROM (COALESCE(d.actual_close_date, NOW()) - d.created_at)) / 86400 as cycle_days
        FROM deals d
        WHERE d.organization_id = $1
          AND d.deleted_at IS NULL
    `;
    
    const params: unknown[] = [organizationId];
    let paramIndex = 2;
    
    if (pipelineId) {
      query += ` AND d.pipeline_id = $${paramIndex++}`;
      params.push(pipelineId);
    }
    if (startDate) {
      query += ` AND d.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND d.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }
    
    query += `
      )
      SELECT 
        cohort,
        COUNT(*) as total_deals,
        COUNT(*) FILTER (WHERE status = 'won') as won_deals,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_deals,
        COUNT(*) FILTER (WHERE status NOT IN ('won', 'lost')) as active_deals,
        ROUND(COUNT(*) FILTER (WHERE status = 'won')::numeric / NULLIF(COUNT(*) FILTER (WHERE status IN ('won', 'lost')), 0) * 100, 2) as win_rate,
        COALESCE(SUM(value), 0) as total_value,
        ROUND(COALESCE(AVG(value), 0), 2) as avg_deal_size,
        ROUND(COALESCE(AVG(cycle_days) FILTER (WHERE status IN ('won', 'lost')), 0), 1) as avg_cycle_time
      FROM cohort_deals
      GROUP BY cohort
      ORDER BY cohort DESC
    `;
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      cohort: row.cohort,
      totalDeals: parseInt(row.total_deals),
      wonDeals: parseInt(row.won_deals),
      lostDeals: parseInt(row.lost_deals),
      activeDeals: parseInt(row.active_deals),
      winRate: parseFloat(row.win_rate) || 0,
      totalValue: parseFloat(row.total_value),
      avgDealSize: parseFloat(row.avg_deal_size),
      avgCycleTime: parseFloat(row.avg_cycle_time),
    }));
  }
  
  /**
   * Get win/loss analysis with reasons
   */
  async getWinLossAnalysis(
    organizationId: string,
    period: 'week' | 'month' | 'quarter' | 'year' = 'month',
    pipelineId?: string
  ): Promise<WinLossAnalysis[]> {
    let periodFormat: string;
    switch (period) {
      case 'week':
        periodFormat = 'YYYY-WW';
        break;
      case 'quarter':
        periodFormat = '"Q"Q YYYY';
        break;
      case 'year':
        periodFormat = 'YYYY';
        break;
      default:
        periodFormat = 'YYYY-MM';
    }
    
    let query = `
      WITH period_deals AS (
        SELECT 
          TO_CHAR(actual_close_date, '${periodFormat}') as period,
          deal_status as status,
          deal_value as value,
          EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400 as cycle_days,
          custom_fields->>'lost_reason' as lost_reason
        FROM deals
        WHERE organization_id = $1
          AND deleted_at IS NULL
          AND actual_close_date IS NOT NULL
          AND deal_status IN ('won', 'lost')
    `;
    
    const params: unknown[] = [organizationId];
    let paramIndex = 2;
    
    if (pipelineId) {
      query += ` AND pipeline_id = $${paramIndex++}`;
      params.push(pipelineId);
    }
    
    query += `
      ),
      period_summary AS (
        SELECT 
          period,
          COUNT(*) FILTER (WHERE status = 'won') as won_count,
          COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0) as won_value,
          COUNT(*) FILTER (WHERE status = 'lost') as lost_count,
          COALESCE(SUM(value) FILTER (WHERE status = 'lost'), 0) as lost_value,
          ROUND(AVG(cycle_days) FILTER (WHERE status = 'won'), 1) as avg_time_to_win,
          ROUND(AVG(cycle_days) FILTER (WHERE status = 'lost'), 1) as avg_time_to_loss
        FROM period_deals
        GROUP BY period
      )
      SELECT 
        period,
        won_count,
        won_value,
        lost_count,
        lost_value,
        ROUND(won_count::numeric / NULLIF(won_count + lost_count, 0) * 100, 2) as win_rate,
        COALESCE(avg_time_to_win, 0) as avg_time_to_win,
        COALESCE(avg_time_to_loss, 0) as avg_time_to_loss
      FROM period_summary
      ORDER BY period DESC
      LIMIT 12
    `;
    
    const result = await pool.query(query, params);
    
    // Get top loss reasons
    const lossReasonsResult = await pool.query(`
      SELECT custom_fields->>'lost_reason' as lost_reason, COUNT(*) as count
      FROM deals
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND deal_status = 'lost'
        AND custom_fields->>'lost_reason' IS NOT NULL
      GROUP BY custom_fields->>'lost_reason'
      ORDER BY count DESC
      LIMIT 5
    `, [organizationId]);
    
    const topLossReasons = lossReasonsResult.rows.map(r => ({
      reason: r.lost_reason,
      count: parseInt(r.count),
    }));
    
    return result.rows.map(row => ({
      period: row.period,
      won: {
        count: parseInt(row.won_count),
        value: parseFloat(row.won_value),
      },
      lost: {
        count: parseInt(row.lost_count),
        value: parseFloat(row.lost_value),
      },
      winRate: parseFloat(row.win_rate) || 0,
      topWinReasons: [], // Would need a win_reason field
      topLossReasons,
      avgTimeToWin: parseFloat(row.avg_time_to_win),
      avgTimeToLoss: parseFloat(row.avg_time_to_loss),
    }));
  }
  
  /**
   * Get sales funnel analysis
   */
  async getFunnelAnalysis(
    organizationId: string,
    pipelineId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<FunnelStage[]> {
    let query = `
      WITH stage_metrics AS (
        SELECT 
          s.id as stage_id,
          s.stage_name as stage_name,
          s.stage_order as stage_order,
          COUNT(d.id) as deals_count,
          COALESCE(SUM(d.deal_value), 0) as deals_value,
          AVG(d.stage_duration) as avg_time_in_stage
        FROM deal_stages s
        LEFT JOIN deals d ON d.stage_id = s.id AND d.organization_id = $1 AND d.deleted_at IS NULL
    `;
    
    const params: unknown[] = [organizationId, pipelineId];
    let paramIndex = 3;
    
    if (startDate) {
      query += ` AND d.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND d.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }
    
    query += `
        WHERE s.pipeline_id = $2
        GROUP BY s.id, s.stage_name, s.stage_order
        ORDER BY s.stage_order
      ),
      with_totals AS (
        SELECT 
          *,
          FIRST_VALUE(deals_count) OVER (ORDER BY stage_order) as first_stage_count,
          LAG(deals_count) OVER (ORDER BY stage_order) as prev_stage_count
        FROM stage_metrics
      )
      SELECT 
        stage_id,
        stage_name,
        stage_order,
        deals_count,
        deals_value,
        ROUND(COALESCE(avg_time_in_stage, 0), 1) as avg_time_in_stage,
        ROUND(deals_count::numeric / NULLIF(first_stage_count, 0) * 100, 2) as conversion_rate,
        CASE 
          WHEN prev_stage_count IS NOT NULL AND prev_stage_count > 0
          THEN ROUND((prev_stage_count - deals_count)::numeric / prev_stage_count * 100, 2)
          ELSE 0
        END as dropoff_rate
      FROM with_totals
      ORDER BY stage_order
    `;
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      stageId: row.stage_id,
      stageName: row.stage_name,
      stageOrder: parseInt(row.stage_order),
      dealsCount: parseInt(row.deals_count),
      dealsValue: parseFloat(row.deals_value),
      conversionRate: parseFloat(row.conversion_rate) || 0,
      avgTimeInStage: parseFloat(row.avg_time_in_stage),
      dropoffRate: parseFloat(row.dropoff_rate),
    }));
  }
  
  /**
   * Get deal velocity metrics
   */
  async getDealVelocity(
    organizationId: string,
    pipelineId?: string
  ): Promise<DealVelocityMetrics> {
    let baseQuery = `
      SELECT 
        EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400 as cycle_days
      FROM deals
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND deal_status = 'won'
        AND actual_close_date IS NOT NULL
    `;
    
    const params: unknown[] = [organizationId];
    if (pipelineId) {
      baseQuery += ` AND pipeline_id = $2`;
      params.push(pipelineId);
    }
    
    // Get average and median cycle time
    const cycleResult = await pool.query(`
      WITH cycle_data AS (${baseQuery})
      SELECT 
        ROUND(AVG(cycle_days)::numeric, 1) as avg_cycle,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cycle_days)::numeric, 1) as median_cycle
      FROM cycle_data
    `, params);
    
    // Get velocity trend over time
    const trendResult = await pool.query(`
      SELECT 
        TO_CHAR(actual_close_date, 'YYYY-MM') as period,
        ROUND(AVG(EXTRACT(EPOCH FROM (actual_close_date - created_at)) / 86400), 1) as avg_cycle
      FROM deals
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND deal_status = 'won'
        AND actual_close_date IS NOT NULL
        AND actual_close_date >= NOW() - INTERVAL '12 months'
      ${pipelineId ? 'AND pipeline_id = $2' : ''}
      GROUP BY TO_CHAR(actual_close_date, 'YYYY-MM')
      ORDER BY period DESC
      LIMIT 12
    `, params);
    
    return {
      avgCycleTime: parseFloat(cycleResult.rows[0]?.avg_cycle) || 0,
      medianCycleTime: parseFloat(cycleResult.rows[0]?.median_cycle) || 0,
      avgTimePerStage: {},
      velocityTrend: trendResult.rows.map(r => ({
        period: r.period,
        avgCycleTime: parseFloat(r.avg_cycle),
      })),
    };
  }
  
  /**
   * Get lead source analysis
   */
  async getLeadSourceAnalysis(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<LeadSourceAnalysis[]> {
    let query = `
      SELECT 
        COALESCE(lead_source::text, 'Unknown') as source,
        COUNT(*) as deals_count,
        COUNT(*) FILTER (WHERE deal_status = 'won') as won_deals,
        COUNT(*) FILTER (WHERE deal_status = 'lost') as lost_deals,
        ROUND(
          COUNT(*) FILTER (WHERE deal_status = 'won')::numeric / 
          NULLIF(COUNT(*) FILTER (WHERE deal_status IN ('won', 'lost')), 0) * 100, 2
        ) as win_rate,
        COALESCE(SUM(deal_value), 0) as total_value,
        ROUND(COALESCE(AVG(deal_value), 0), 2) as avg_deal_size
      FROM deals
      WHERE organization_id = $1
        AND deleted_at IS NULL
    `;
    
    const params: unknown[] = [organizationId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }
    
    query += `
      GROUP BY lead_source
      ORDER BY deals_count DESC
    `;
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      source: row.source,
      dealsCount: parseInt(row.deals_count),
      wonDeals: parseInt(row.won_deals),
      lostDeals: parseInt(row.lost_deals),
      winRate: parseFloat(row.win_rate) || 0,
      totalValue: parseFloat(row.total_value),
      avgDealSize: parseFloat(row.avg_deal_size),
    }));
  }
  
  /**
   * Get agent performance leaderboard
   */
  async getAgentPerformance(
    organizationId: string,
    period: 'week' | 'month' | 'quarter' | 'year' = 'month'
  ): Promise<AgentPerformance[]> {
    let dateFilter = '';
    switch (period) {
      case 'week':
        dateFilter = "AND d.actual_close_date >= NOW() - INTERVAL '7 days'";
        break;
      case 'quarter':
        dateFilter = "AND d.actual_close_date >= DATE_TRUNC('quarter', NOW())";
        break;
      case 'year':
        dateFilter = "AND d.actual_close_date >= DATE_TRUNC('year', NOW())";
        break;
      default:
        dateFilter = "AND d.actual_close_date >= DATE_TRUNC('month', NOW())";
    }
    
    const result = await pool.query(`
      WITH agent_deals AS (
        SELECT 
          d.assigned_agent as agent_id,
          COUNT(*) FILTER (WHERE d.deal_status = 'won') as deals_won,
          COUNT(*) FILTER (WHERE d.deal_status = 'lost') as deals_lost,
          COALESCE(SUM(d.deal_value) FILTER (WHERE d.deal_status = 'won'), 0) as total_value,
          ROUND(
            COUNT(*) FILTER (WHERE d.deal_status = 'won')::numeric / 
            NULLIF(COUNT(*) FILTER (WHERE d.deal_status IN ('won', 'lost')), 0) * 100, 2
          ) as win_rate,
          ROUND(AVG(d.deal_value) FILTER (WHERE d.deal_status = 'won'), 2) as avg_deal_size,
          ROUND(AVG(EXTRACT(EPOCH FROM (d.actual_close_date - d.created_at)) / 86400) FILTER (WHERE d.deal_status = 'won'), 1) as avg_cycle
        FROM deals d
        WHERE d.organization_id = $1
          AND d.deleted_at IS NULL
          ${dateFilter}
        GROUP BY d.assigned_agent
      ),
      agent_activities AS (
        SELECT 
          a.user_id as agent_id,
          COUNT(*) as activities_count
        FROM deal_activities a
        JOIN deals d2 ON d2.id = a.deal_id AND d2.organization_id = $1
        WHERE a.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY a.user_id
      ),
      agent_tasks AS (
        SELECT 
          t.assigned_to as agent_id,
          COUNT(*) FILTER (WHERE t.task_status = 'completed') as tasks_completed
        FROM tasks t
        WHERE t.organization_id = $1
          AND t.deleted_at IS NULL
          AND t.completed_at >= NOW() - INTERVAL '30 days'
        GROUP BY t.assigned_to
      )
      SELECT 
        ad.agent_id,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') as agent_name,
        ad.deals_won,
        ad.deals_lost,
        ad.win_rate,
        ad.total_value,
        ad.avg_deal_size,
        ad.avg_cycle as avg_cycle_time,
        COALESCE(aa.activities_count, 0) as activities_count,
        COALESCE(at.tasks_completed, 0) as tasks_completed
      FROM agent_deals ad
      LEFT JOIN users u ON ad.agent_id = u.id
      LEFT JOIN agent_activities aa ON ad.agent_id = aa.agent_id
      LEFT JOIN agent_tasks at ON ad.agent_id = at.agent_id
      ORDER BY ad.total_value DESC
    `, [organizationId]);
    
    return result.rows.map(row => ({
      agentId: row.agent_id,
      agentName: row.agent_name,
      dealsWon: parseInt(row.deals_won),
      dealsLost: parseInt(row.deals_lost),
      winRate: parseFloat(row.win_rate) || 0,
      totalValue: parseFloat(row.total_value),
      avgDealSize: parseFloat(row.avg_deal_size) || 0,
      avgCycleTime: parseFloat(row.avg_cycle_time) || 0,
      activitiesCount: parseInt(row.activities_count),
      tasksCompleted: parseInt(row.tasks_completed),
    }));
  }
  
  /**
   * Get dashboard summary for analytics
   */
  async getDashboardSummary(
    organizationId: string
  ): Promise<{
    thisMonth: { deals: number; value: number; winRate: number };
    lastMonth: { deals: number; value: number; winRate: number };
    pipeline: { totalDeals: number; totalValue: number };
    trend: 'up' | 'down' | 'stable';
  }> {
    const result = await pool.query(`
      WITH monthly_stats AS (
        SELECT 
          DATE_TRUNC('month', actual_close_date) as month,
          COUNT(*) FILTER (WHERE deal_status = 'won') as won_deals,
          COALESCE(SUM(deal_value) FILTER (WHERE deal_status = 'won'), 0) as won_value,
          ROUND(
            COUNT(*) FILTER (WHERE deal_status = 'won')::numeric / 
            NULLIF(COUNT(*) FILTER (WHERE deal_status IN ('won', 'lost')), 0) * 100, 2
          ) as win_rate
        FROM deals
        WHERE organization_id = $1
          AND deleted_at IS NULL
          AND actual_close_date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
        GROUP BY DATE_TRUNC('month', actual_close_date)
      ),
      pipeline_stats AS (
        SELECT 
          COUNT(*) as total_deals,
          COALESCE(SUM(deal_value), 0) as total_value
        FROM deals
        WHERE organization_id = $1
          AND deleted_at IS NULL
          AND deal_status NOT IN ('won', 'lost')
      )
      SELECT 
        (SELECT COALESCE(won_deals, 0) FROM monthly_stats WHERE month = DATE_TRUNC('month', NOW())) as this_month_deals,
        (SELECT COALESCE(won_value, 0) FROM monthly_stats WHERE month = DATE_TRUNC('month', NOW())) as this_month_value,
        (SELECT COALESCE(win_rate, 0) FROM monthly_stats WHERE month = DATE_TRUNC('month', NOW())) as this_month_win_rate,
        (SELECT COALESCE(won_deals, 0) FROM monthly_stats WHERE month = DATE_TRUNC('month', NOW()) - INTERVAL '1 month') as last_month_deals,
        (SELECT COALESCE(won_value, 0) FROM monthly_stats WHERE month = DATE_TRUNC('month', NOW()) - INTERVAL '1 month') as last_month_value,
        (SELECT COALESCE(win_rate, 0) FROM monthly_stats WHERE month = DATE_TRUNC('month', NOW()) - INTERVAL '1 month') as last_month_win_rate,
        ps.total_deals as pipeline_deals,
        ps.total_value as pipeline_value
      FROM pipeline_stats ps
    `, [organizationId]);
    
    const row = result.rows[0] || {};
    const thisMonthValue = parseFloat(row.this_month_value) || 0;
    const lastMonthValue = parseFloat(row.last_month_value) || 0;
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (thisMonthValue > lastMonthValue * 1.1) trend = 'up';
    else if (thisMonthValue < lastMonthValue * 0.9) trend = 'down';
    
    return {
      thisMonth: {
        deals: parseInt(row.this_month_deals) || 0,
        value: thisMonthValue,
        winRate: parseFloat(row.this_month_win_rate) || 0,
      },
      lastMonth: {
        deals: parseInt(row.last_month_deals) || 0,
        value: lastMonthValue,
        winRate: parseFloat(row.last_month_win_rate) || 0,
      },
      pipeline: {
        totalDeals: parseInt(row.pipeline_deals) || 0,
        totalValue: parseFloat(row.pipeline_value) || 0,
      },
      trend,
    };
  }
}

export const advancedAnalyticsService = new AdvancedAnalyticsService();
export default advancedAnalyticsService;
