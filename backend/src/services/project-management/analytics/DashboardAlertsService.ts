/**
 * Dashboard Alerts Service
 * 
 * Phase 3.1: Split dashboardAnalyticsService
 * 
 * Provides alert management for dashboards:
 * - Active alerts by severity
 * - Alert acknowledgment
 * - Alert resolution
 * - Alert snoozing
 * - Alert generation from health metrics
 * 
 * @module services/project-management/analytics/DashboardAlertsService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { UUID } from '../types';
import { eventBus } from '../events/EventBus';

// =============================================================================
// TYPES
// =============================================================================

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed' | 'snoozed';
export type AlertCategory = 
  | 'budget'
  | 'schedule'
  | 'quality'
  | 'risk'
  | 'compliance'
  | 'resource'
  | 'safety'
  | 'contract'
  | 'approval'
  | 'system';

export interface Alert {
  id: UUID;
  projectId?: UUID;
  projectName?: string;
  organizationId: UUID;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  source: string;
  sourceId?: UUID;
  actionUrl?: string;
  acknowledgedBy?: UUID;
  acknowledgedAt?: Date;
  resolvedBy?: UUID;
  resolvedAt?: Date;
  snoozedUntil?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertFilters {
  organizationId: UUID;
  projectIds?: UUID[];
  severities?: AlertSeverity[];
  categories?: AlertCategory[];
  statuses?: AlertStatus[];
  limit?: number;
  offset?: number;
}

export interface AlertSummary {
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Record<AlertCategory, number>;
  byStatus: Record<AlertStatus, number>;
}

export interface AlertInput {
  projectId?: UUID;
  organizationId: UUID;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;
  sourceId?: UUID;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class DashboardAlertsServiceImpl extends BaseService {
  constructor() {
    super('DashboardAlertsService');
  }

  /**
   * Get active alerts for dashboard.
   */
  async getActiveAlerts(filters: AlertFilters): Promise<{ alerts: Alert[]; summary: AlertSummary }> {
    const { conditions, params } = this.buildFilterConditions(filters);
    
    // Get alerts
    const alertsResult = await this.query(
      `SELECT 
         a.*,
         p.name as project_name
       FROM pm_dashboard_alerts a
       LEFT JOIN development_projects p ON p.id = a.project_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY 
         CASE a.severity 
           WHEN 'critical' THEN 1 
           WHEN 'high' THEN 2 
           WHEN 'medium' THEN 3 
           WHEN 'low' THEN 4 
           ELSE 5 
         END,
         a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit || 50, filters.offset || 0]
    );

    // Get summary
    const summaryResult = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE severity = 'critical') as critical,
         COUNT(*) FILTER (WHERE severity = 'high') as high,
         COUNT(*) FILTER (WHERE severity = 'medium') as medium,
         COUNT(*) FILTER (WHERE severity = 'low') as low,
         COUNT(*) FILTER (WHERE severity = 'info') as info,
         COUNT(*) FILTER (WHERE status = 'active') as active,
         COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
         COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
         COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed,
         COUNT(*) FILTER (WHERE status = 'snoozed') as snoozed
       FROM pm_dashboard_alerts a
       WHERE organization_id = $1 AND (status = 'active' OR status = 'acknowledged')`,
      [filters.organizationId]
    );

    const alerts = alertsResult.rows.map(this.mapAlertRow);
    const row = summaryResult.rows[0];

    const summary: AlertSummary = {
      total: parseInt(row.total),
      bySeverity: {
        critical: parseInt(row.critical),
        high: parseInt(row.high),
        medium: parseInt(row.medium),
        low: parseInt(row.low),
        info: parseInt(row.info),
      },
      byCategory: await this.getCategoryCounts(filters.organizationId),
      byStatus: {
        active: parseInt(row.active),
        acknowledged: parseInt(row.acknowledged),
        resolved: parseInt(row.resolved),
        dismissed: parseInt(row.dismissed),
        snoozed: parseInt(row.snoozed),
      },
    };

    return { alerts, summary };
  }

  /**
   * Create a new alert.
   */
  async createAlert(input: AlertInput): Promise<Alert> {
    // Check for duplicate active alert
    const existing = await this.query(
      `SELECT id FROM pm_dashboard_alerts
       WHERE organization_id = $1 
         AND source = $2 
         AND source_id = $3 
         AND status = 'active'
       LIMIT 1`,
      [input.organizationId, input.source, input.sourceId]
    );

    if (existing.rows.length > 0) {
      // Update existing alert timestamp
      const updateResult = await this.query(
        `UPDATE pm_dashboard_alerts 
         SET updated_at = NOW(), message = $1
         WHERE id = $2
         RETURNING *`,
        [input.message, existing.rows[0].id]
      );
      return this.mapAlertRow(updateResult.rows[0]);
    }

    const result = await this.query(
      `INSERT INTO pm_dashboard_alerts (
         project_id, organization_id, category, severity, status,
         title, message, source, source_id, action_url, metadata
       ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.projectId,
        input.organizationId,
        input.category,
        input.severity,
        input.title,
        input.message,
        input.source,
        input.sourceId,
        input.actionUrl,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    const alert = this.mapAlertRow(result.rows[0]);

    // Emit event for critical alerts
    if (alert.severity === 'critical') {
      eventBus.emit('alert.critical.created', { alert });
    }

    return alert;
  }

  /**
   * Acknowledge an alert.
   */
  async acknowledgeAlert(alertId: UUID, userId: UUID): Promise<Alert> {
    const result = await this.query(
      `UPDATE pm_dashboard_alerts
       SET status = 'acknowledged',
           acknowledged_by = $2,
           acknowledged_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId, userId]
    );

    if (!result.rows.length) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const alert = this.mapAlertRow(result.rows[0]);
    eventBus.emit('alert.acknowledged', { alert, acknowledgedBy: userId });

    return alert;
  }

  /**
   * Resolve an alert.
   */
  async resolveAlert(
    alertId: UUID, 
    userId: UUID, 
    resolution?: string
  ): Promise<Alert> {
    const result = await this.query(
      `UPDATE pm_dashboard_alerts
       SET status = 'resolved',
           resolved_by = $2,
           resolved_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || 
             jsonb_build_object('resolution', $3),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId, userId, resolution]
    );

    if (!result.rows.length) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const alert = this.mapAlertRow(result.rows[0]);
    eventBus.emit('alert.resolved', { alert, resolvedBy: userId, resolution });

    return alert;
  }

  /**
   * Dismiss an alert (user action to hide).
   */
  async dismissAlert(alertId: UUID, userId: UUID): Promise<Alert> {
    const result = await this.query(
      `UPDATE pm_dashboard_alerts
       SET status = 'dismissed',
           metadata = COALESCE(metadata, '{}'::jsonb) || 
             jsonb_build_object('dismissedBy', $2::text, 'dismissedAt', NOW()::text),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId, userId]
    );

    if (!result.rows.length) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    return this.mapAlertRow(result.rows[0]);
  }

  /**
   * Snooze an alert for specified duration.
   */
  async snoozeAlert(
    alertId: UUID, 
    userId: UUID, 
    snoozeUntil: Date
  ): Promise<Alert> {
    const result = await this.query(
      `UPDATE pm_dashboard_alerts
       SET status = 'snoozed',
           snoozed_until = $2,
           metadata = COALESCE(metadata, '{}'::jsonb) || 
             jsonb_build_object('snoozedBy', $3::text),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId, snoozeUntil, userId]
    );

    if (!result.rows.length) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    return this.mapAlertRow(result.rows[0]);
  }

  /**
   * Reactivate snoozed alerts that have passed their snooze time.
   */
  async reactivateSnoozedAlerts(): Promise<number> {
    const result = await this.query(
      `UPDATE pm_dashboard_alerts
       SET status = 'active',
           snoozed_until = NULL,
           updated_at = NOW()
       WHERE status = 'snoozed' AND snoozed_until <= NOW()
       RETURNING id`
    );

    return result.rows.length;
  }

  /**
   * Get alerts for a specific project.
   */
  async getProjectAlerts(
    projectId: UUID, 
    options: { includeResolved?: boolean } = {}
  ): Promise<Alert[]> {
    const statusFilter = options.includeResolved 
      ? '' 
      : `AND status IN ('active', 'acknowledged')`;

    const result = await this.query(
      `SELECT a.*, p.name as project_name
       FROM pm_dashboard_alerts a
       LEFT JOIN development_projects p ON p.id = a.project_id
       WHERE a.project_id = $1 ${statusFilter}
       ORDER BY a.created_at DESC`,
      [projectId]
    );

    return result.rows.map(this.mapAlertRow);
  }

  /**
   * Generate alerts from health metrics.
   */
  async generateAlertsFromHealth(
    projectId: UUID,
    organizationId: UUID,
    healthData: {
      costHealth?: { score: number; details: string };
      scheduleHealth?: { score: number; details: string };
      qualityHealth?: { score: number; details: string };
      riskHealth?: { score: number; details: string };
    }
  ): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Cost alert
    if (healthData.costHealth && healthData.costHealth.score < 60) {
      const severity = healthData.costHealth.score < 40 ? 'critical' : 'high';
      const alert = await this.createAlert({
        projectId,
        organizationId,
        category: 'budget',
        severity,
        title: 'Budget Overrun Risk',
        message: healthData.costHealth.details,
        source: 'health_check',
        sourceId: projectId,
      });
      alerts.push(alert);
    }

    // Schedule alert
    if (healthData.scheduleHealth && healthData.scheduleHealth.score < 60) {
      const severity = healthData.scheduleHealth.score < 40 ? 'critical' : 'high';
      const alert = await this.createAlert({
        projectId,
        organizationId,
        category: 'schedule',
        severity,
        title: 'Schedule Delay Risk',
        message: healthData.scheduleHealth.details,
        source: 'health_check',
        sourceId: projectId,
      });
      alerts.push(alert);
    }

    // Quality alert
    if (healthData.qualityHealth && healthData.qualityHealth.score < 70) {
      const severity = healthData.qualityHealth.score < 50 ? 'critical' : 'high';
      const alert = await this.createAlert({
        projectId,
        organizationId,
        category: 'quality',
        severity,
        title: 'Quality Issues Detected',
        message: healthData.qualityHealth.details,
        source: 'health_check',
        sourceId: projectId,
      });
      alerts.push(alert);
    }

    // Risk alert
    if (healthData.riskHealth && healthData.riskHealth.score < 60) {
      const severity = healthData.riskHealth.score < 40 ? 'critical' : 'high';
      const alert = await this.createAlert({
        projectId,
        organizationId,
        category: 'risk',
        severity,
        title: 'High Risk Exposure',
        message: healthData.riskHealth.details,
        source: 'health_check',
        sourceId: projectId,
      });
      alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Bulk acknowledge alerts.
   */
  async bulkAcknowledge(alertIds: UUID[], userId: UUID): Promise<number> {
    const result = await this.query(
      `UPDATE pm_dashboard_alerts
       SET status = 'acknowledged',
           acknowledged_by = $2,
           acknowledged_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($1) AND status = 'active'
       RETURNING id`,
      [alertIds, userId]
    );

    return result.rows.length;
  }

  /**
   * Delete old resolved/dismissed alerts.
   */
  async cleanupOldAlerts(daysToKeep: number = 90): Promise<number> {
    const result = await this.query(
      `DELETE FROM pm_dashboard_alerts
       WHERE status IN ('resolved', 'dismissed')
         AND updated_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`
    );

    return result.rows.length;
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  private buildFilterConditions(filters: AlertFilters): { conditions: string[]; params: any[] } {
    const conditions: string[] = ['a.organization_id = $1'];
    const params: any[] = [filters.organizationId];
    let paramIndex = 2;

    if (filters.projectIds?.length) {
      conditions.push(`a.project_id = ANY($${paramIndex++})`);
      params.push(filters.projectIds);
    }

    if (filters.severities?.length) {
      conditions.push(`a.severity = ANY($${paramIndex++})`);
      params.push(filters.severities);
    }

    if (filters.categories?.length) {
      conditions.push(`a.category = ANY($${paramIndex++})`);
      params.push(filters.categories);
    }

    if (filters.statuses?.length) {
      conditions.push(`a.status = ANY($${paramIndex++})`);
      params.push(filters.statuses);
    } else {
      // Default: only active and acknowledged
      conditions.push(`a.status IN ('active', 'acknowledged')`);
    }

    return { conditions, params };
  }

  private async getCategoryCounts(organizationId: UUID): Promise<Record<AlertCategory, number>> {
    const result = await this.query(
      `SELECT category, COUNT(*) as count
       FROM pm_dashboard_alerts
       WHERE organization_id = $1 AND status IN ('active', 'acknowledged')
       GROUP BY category`,
      [organizationId]
    );

    const counts: Record<AlertCategory, number> = {
      budget: 0,
      schedule: 0,
      quality: 0,
      risk: 0,
      compliance: 0,
      resource: 0,
      safety: 0,
      contract: 0,
      approval: 0,
      system: 0,
    };

    result.rows.forEach(row => {
      if (row.category in counts) {
        counts[row.category as AlertCategory] = parseInt(row.count);
      }
    });

    return counts;
  }

  private mapAlertRow(row: any): Alert {
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      organizationId: row.organization_id,
      category: row.category,
      severity: row.severity,
      status: row.status,
      title: row.title,
      message: row.message,
      source: row.source,
      sourceId: row.source_id,
      actionUrl: row.action_url,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until) : undefined,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const dashboardAlertsService = new DashboardAlertsServiceImpl();
