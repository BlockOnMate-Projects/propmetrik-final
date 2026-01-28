/**
 * RFI Stats Service
 * Phase 3.13 - Split from rfiService
 * 
 * Handles RFI statistics and analytics:
 * - Project RFI statistics
 * - Performance metrics
 * - Trend analysis
 */

import { pool } from '../../../database';
import { BaseService } from '../BaseService';
import {
  RfiStats,
  RfiStatus,
  RfiPriority,
  RfiCategory
} from './types';

class RfiStatsService extends BaseService {
  constructor() {
    super('RfiStatsService');
  }

  // --------------------------------------------------------------------------
  // PROJECT STATISTICS
  // --------------------------------------------------------------------------

  /**
   * Get comprehensive RFI statistics for a project
   */
  async getStats(projectId: string): Promise<RfiStats> {
    const result = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'pending_response') AS pending_response,
        COUNT(*) FILTER (WHERE status = 'answered') AS answered,
        COUNT(*) FILTER (WHERE status = 'closed') AS closed,
        COUNT(*) FILTER (WHERE status = 'void') AS void,
        COUNT(*) FILTER (WHERE priority = 'low') AS priority_low,
        COUNT(*) FILTER (WHERE priority = 'normal') AS priority_normal,
        COUNT(*) FILTER (WHERE priority = 'high') AS priority_high,
        COUNT(*) FILTER (WHERE priority = 'critical') AS priority_critical,
        COUNT(*) FILTER (WHERE status IN ('open', 'pending_response') AND due_date < CURRENT_DATE) AS overdue,
        AVG(EXTRACT(DAY FROM (responded_at - created_at))) FILTER (WHERE responded_at IS NOT NULL) AS avg_response_days,
        COUNT(*) FILTER (WHERE closed_at >= CURRENT_DATE - INTERVAL '7 days') AS closed_this_week
      FROM rfis
      WHERE project_id = $1
    `, [projectId]);

    const row = result.rows[0];

    // Get category counts
    const categoryResult = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
      GROUP BY category
    `, [projectId]);

    const byCategory: Record<string, number> = {};
    categoryResult.rows.forEach(r => {
      byCategory[r.category] = parseInt(r.count, 10);
    });

    return {
      total: parseInt(row.total, 10),
      byStatus: {
        draft: parseInt(row.draft, 10),
        open: parseInt(row.open, 10),
        pending_response: parseInt(row.pending_response, 10),
        answered: parseInt(row.answered, 10),
        closed: parseInt(row.closed, 10),
        void: parseInt(row.void, 10)
      },
      byPriority: {
        low: parseInt(row.priority_low, 10),
        normal: parseInt(row.priority_normal, 10),
        high: parseInt(row.priority_high, 10),
        critical: parseInt(row.priority_critical, 10)
      },
      byCategory,
      overdue: parseInt(row.overdue, 10),
      avgResponseDays: parseFloat(row.avg_response_days) || 0,
      pendingResponse: parseInt(row.pending_response, 10),
      closedThisWeek: parseInt(row.closed_this_week, 10)
    };
  }

  /**
   * Get counts by status
   */
  async getCountsByStatus(projectId: string): Promise<Record<RfiStatus, number>> {
    const result = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
      GROUP BY status
    `, [projectId]);

    const counts: Record<RfiStatus, number> = {
      draft: 0,
      open: 0,
      pending_response: 0,
      answered: 0,
      closed: 0,
      void: 0
    };

    result.rows.forEach(r => {
      counts[r.status as RfiStatus] = parseInt(r.count, 10);
    });

    return counts;
  }

  /**
   * Get counts by priority
   */
  async getCountsByPriority(projectId: string): Promise<Record<RfiPriority, number>> {
    const result = await pool.query(`
      SELECT priority, COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
      GROUP BY priority
    `, [projectId]);

    const counts: Record<RfiPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      critical: 0
    };

    result.rows.forEach(r => {
      counts[r.priority as RfiPriority] = parseInt(r.count, 10);
    });

    return counts;
  }

  /**
   * Get counts by category
   */
  async getCountsByCategory(projectId: string): Promise<Record<string, number>> {
    const result = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
      GROUP BY category
      ORDER BY count DESC
    `, [projectId]);

    const counts: Record<string, number> = {};
    result.rows.forEach(r => {
      counts[r.category] = parseInt(r.count, 10);
    });

    return counts;
  }

  // --------------------------------------------------------------------------
  // PERFORMANCE METRICS
  // --------------------------------------------------------------------------

  /**
   * Get overdue RFI count
   */
  async getOverdueCount(projectId: string): Promise<number> {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
        AND status IN ('open', 'pending_response')
        AND due_date < CURRENT_DATE
    `, [projectId]);

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get average response time in days
   */
  async getAverageResponseTime(projectId: string): Promise<number> {
    const result = await pool.query(`
      SELECT AVG(EXTRACT(DAY FROM (responded_at - created_at))) as avg_days
      FROM rfis
      WHERE project_id = $1 AND responded_at IS NOT NULL
    `, [projectId]);

    return parseFloat(result.rows[0].avg_days) || 0;
  }

  /**
   * Get response time by assignee
   */
  async getResponseTimeByAssignee(projectId: string): Promise<{ userId: string; userName: string; avgDays: number; count: number }[]> {
    const result = await pool.query(`
      SELECT 
        r.assigned_to as user_id,
        u.full_name as user_name,
        AVG(EXTRACT(DAY FROM (r.responded_at - r.created_at))) as avg_days,
        COUNT(*) as count
      FROM rfis r
      LEFT JOIN users u ON r.assigned_to = u.id
      WHERE r.project_id = $1 
        AND r.responded_at IS NOT NULL
        AND r.assigned_to IS NOT NULL
      GROUP BY r.assigned_to, u.full_name
      ORDER BY avg_days ASC
    `, [projectId]);

    return result.rows.map(r => ({
      userId: r.user_id,
      userName: r.user_name,
      avgDays: parseFloat(r.avg_days) || 0,
      count: parseInt(r.count, 10)
    }));
  }

  /**
   * Get RFI activity by phase
   */
  async getStatsByPhase(projectId: string): Promise<{ phaseId: string; phaseName: string; total: number; open: number; closed: number }[]> {
    const result = await pool.query(`
      SELECT 
        r.phase_id,
        ph.name as phase_name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE r.status IN ('open', 'pending_response')) as open,
        COUNT(*) FILTER (WHERE r.status = 'closed') as closed
      FROM rfis r
      LEFT JOIN project_phases ph ON r.phase_id = ph.id
      WHERE r.project_id = $1 AND r.phase_id IS NOT NULL
      GROUP BY r.phase_id, ph.name
      ORDER BY ph.name
    `, [projectId]);

    return result.rows.map(r => ({
      phaseId: r.phase_id,
      phaseName: r.phase_name || 'Unknown Phase',
      total: parseInt(r.total, 10),
      open: parseInt(r.open, 10),
      closed: parseInt(r.closed, 10)
    }));
  }

  // --------------------------------------------------------------------------
  // TREND ANALYSIS
  // --------------------------------------------------------------------------

  /**
   * Get RFI creation trend by month
   */
  async getCreationTrend(projectId: string, months: number = 12): Promise<{ month: string; count: number }[]> {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
        AND created_at >= NOW() - INTERVAL '${months} months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `, [projectId]);

    return result.rows.map(r => ({
      month: r.month,
      count: parseInt(r.count, 10)
    }));
  }

  /**
   * Get closure trend by month
   */
  async getClosureTrend(projectId: string, months: number = 12): Promise<{ month: string; count: number }[]> {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(closed_at, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
        AND closed_at IS NOT NULL
        AND closed_at >= NOW() - INTERVAL '${months} months'
      GROUP BY TO_CHAR(closed_at, 'YYYY-MM')
      ORDER BY month
    `, [projectId]);

    return result.rows.map(r => ({
      month: r.month,
      count: parseInt(r.count, 10)
    }));
  }

  /**
   * Get weekly RFI summary
   */
  async getWeeklySummary(projectId: string): Promise<{
    created: number;
    closed: number;
    overdue: number;
    pending: number;
    avgResponseDays: number;
  }> {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as created,
        COUNT(*) FILTER (WHERE closed_at >= CURRENT_DATE - INTERVAL '7 days') as closed,
        COUNT(*) FILTER (WHERE status IN ('open', 'pending_response') AND due_date < CURRENT_DATE) as overdue,
        COUNT(*) FILTER (WHERE status IN ('open', 'pending_response')) as pending,
        AVG(EXTRACT(DAY FROM (responded_at - created_at))) FILTER (
          WHERE responded_at IS NOT NULL 
          AND responded_at >= CURRENT_DATE - INTERVAL '7 days'
        ) as avg_response_days
      FROM rfis
      WHERE project_id = $1
    `, [projectId]);

    const row = result.rows[0];

    return {
      created: parseInt(row.created, 10),
      closed: parseInt(row.closed, 10),
      overdue: parseInt(row.overdue, 10),
      pending: parseInt(row.pending, 10),
      avgResponseDays: parseFloat(row.avg_response_days) || 0
    };
  }

  // --------------------------------------------------------------------------
  // COST & SCHEDULE IMPACT
  // --------------------------------------------------------------------------

  /**
   * Get total cost impact for project RFIs
   */
  async getTotalCostImpact(projectId: string): Promise<{ currency: string; amount: number }[]> {
    const result = await pool.query(`
      SELECT 
        cost_impact_currency as currency,
        SUM(cost_impact) as amount
      FROM rfis
      WHERE project_id = $1 AND cost_impact IS NOT NULL
      GROUP BY cost_impact_currency
    `, [projectId]);

    return result.rows.map(r => ({
      currency: r.currency,
      amount: parseFloat(r.amount)
    }));
  }

  /**
   * Get total schedule impact in days
   */
  async getTotalScheduleImpact(projectId: string): Promise<number> {
    const result = await pool.query(`
      SELECT COALESCE(SUM(schedule_impact_days), 0) as total_days
      FROM rfis
      WHERE project_id = $1 AND schedule_impact_days IS NOT NULL
    `, [projectId]);

    return parseInt(result.rows[0].total_days, 10);
  }

  /**
   * Get RFIs with highest impact
   */
  async getHighImpactRfis(projectId: string, limit: number = 10): Promise<{
    id: string;
    rfiNumber: string;
    subject: string;
    costImpact?: number;
    scheduleImpactDays?: number;
  }[]> {
    const result = await pool.query(`
      SELECT id, rfi_number, subject, cost_impact, schedule_impact_days
      FROM rfis
      WHERE project_id = $1
        AND (cost_impact IS NOT NULL OR schedule_impact_days IS NOT NULL)
      ORDER BY 
        COALESCE(cost_impact, 0) DESC,
        COALESCE(schedule_impact_days, 0) DESC
      LIMIT $2
    `, [projectId, limit]);

    return result.rows.map(r => ({
      id: r.id,
      rfiNumber: r.rfi_number,
      subject: r.subject,
      costImpact: r.cost_impact ? parseFloat(r.cost_impact) : undefined,
      scheduleImpactDays: r.schedule_impact_days
    }));
  }
}

export const rfiStatsService = new RfiStatsService();
