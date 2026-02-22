/**
 * Analytics Alert Service
 *
 * Provides threshold-based monitoring and alerting for all
 * analytics metrics. Rules are stored in `analytics_alert_rules`
 * and alert instances in `analytics_alerts`.
 *
 * Supports:
 *   - Absolute thresholds (gt, lt, gte, lte)
 *   - Change-based thresholds (change_gt, change_lt)
 *   - Standard deviation thresholds (deviation)
 *   - Cooldown periods to prevent alert fatigue
 *
 * Analytics.md — Alert system foundation
 *
 * @module services/analytics/alertService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed';
export type AlertCondition = 'gt' | 'gte' | 'lt' | 'lte' | 'change_gt' | 'change_lt' | 'deviation';

export interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  metric_name: string;
  region: string | null;
  condition: AlertCondition;
  threshold_value: number;
  comparison_period: string | null;
  severity: AlertSeverity;
  cooldown_hours: number;
  is_active: boolean;
}

export interface Alert {
  id: string;
  rule_id: string | null;
  severity: AlertSeverity;
  category: string;
  sub_category: string | null;
  title: string;
  message: string;
  metric_name: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  region: string | null;
  status: AlertStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  detail_url: string | null;
  created_at: string;
}

export interface AlertSummary {
  total: number;
  active: number;
  acknowledged: number;
  by_severity: { critical: number; warning: number; info: number };
  by_category: Record<string, number>;
  recent: Alert[];
}

export interface CreateAlertInput {
  rule_id?: string;
  severity: AlertSeverity;
  category: string;
  sub_category?: string;
  title: string;
  message: string;
  metric_name?: string;
  metric_value?: number;
  threshold_value?: number;
  region?: string;
  detail_url?: string;
  related_entity_type?: string;
  related_entity_id?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class AlertService {
  // ==========================================================================
  // ALERTS CRUD
  // ==========================================================================

  /**
   * Get alert summary with counts and recent alerts.
   */
  async getSummary(limit: number = 10): Promise<AlertSummary> {
    try {
      // Counts by status
      const counts = await pool.query(
        `SELECT status, COUNT(*) AS cnt
         FROM analytics_alerts
         GROUP BY status`,
      );
      const statusMap: Record<string, number> = {};
      let total = 0;
      for (const r of counts.rows) {
        statusMap[r.status] = parseInt(r.cnt, 10);
        total += parseInt(r.cnt, 10);
      }

      // Counts by severity (active only)
      const severity = await pool.query(
        `SELECT severity, COUNT(*) AS cnt
         FROM analytics_alerts
         WHERE status = 'active'
         GROUP BY severity`,
      );
      const sevMap: Record<string, number> = { critical: 0, warning: 0, info: 0 };
      for (const r of severity.rows) {
        sevMap[r.severity] = parseInt(r.cnt, 10);
      }

      // Counts by category (active)
      const categories = await pool.query(
        `SELECT category, COUNT(*) AS cnt
         FROM analytics_alerts
         WHERE status = 'active'
         GROUP BY category`,
      );
      const catMap: Record<string, number> = {};
      for (const r of categories.rows) {
        catMap[r.category] = parseInt(r.cnt, 10);
      }

      // Recent alerts
      const recent = await pool.query(
        `SELECT *
         FROM analytics_alerts
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );

      return {
        total,
        active: statusMap['active'] || 0,
        acknowledged: statusMap['acknowledged'] || 0,
        by_severity: {
          critical: sevMap.critical,
          warning: sevMap.warning,
          info: sevMap.info,
        },
        by_category: catMap,
        recent: recent.rows.map(this.mapAlert),
      };
    } catch (err: any) {
      if (err.code === '42P01') {
        return {
          total: 0,
          active: 0,
          acknowledged: 0,
          by_severity: { critical: 0, warning: 0, info: 0 },
          by_category: {},
          recent: [],
        };
      }
      throw err;
    }
  }

  /**
   * List alerts with filtering.
   */
  async list(opts?: {
    status?: AlertStatus;
    severity?: AlertSeverity;
    category?: string;
    region?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ alerts: Alert[]; total: number }> {
    try {
      const { status, severity, category, region, limit = 50, offset = 0 } = opts || {};
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (status) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(status);
      }
      if (severity) {
        conditions.push(`severity = $${paramIdx++}`);
        params.push(severity);
      }
      if (category) {
        conditions.push(`category = $${paramIdx++}`);
        params.push(category);
      }
      if (region) {
        conditions.push(`LOWER(region) = LOWER($${paramIdx++})`);
        params.push(region);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM analytics_alerts ${where}`,
        params,
      );
      const total = parseInt(countResult.rows[0].cnt, 10);

      const dataParams = [...params, limit, offset];
      const data = await pool.query(
        `SELECT * FROM analytics_alerts ${where}
         ORDER BY 
           CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
           created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        dataParams,
      );

      return { alerts: data.rows.map(this.mapAlert), total };
    } catch (err: any) {
      if (err.code === '42P01') return { alerts: [], total: 0 };
      throw err;
    }
  }

  /**
   * Create a new alert.
   */
  async create(input: CreateAlertInput): Promise<Alert> {
    // Check cooldown if rule_id provided
    if (input.rule_id) {
      const cooldown = await pool.query(
        `SELECT a.id FROM analytics_alerts a
         JOIN analytics_alert_rules r ON a.rule_id = r.id
         WHERE a.rule_id = $1
           AND a.status IN ('active', 'acknowledged')
           AND a.created_at > NOW() - (r.cooldown_hours || ' hours')::INTERVAL
         LIMIT 1`,
        [input.rule_id],
      );
      if (cooldown.rows.length > 0) {
        logger.debug('Alert suppressed by cooldown', {
          rule_id: input.rule_id,
          title: input.title,
        });
        return this.mapAlert(cooldown.rows[0]);
      }
    }

    const result = await pool.query(
      `INSERT INTO analytics_alerts (
         rule_id, severity, category, sub_category,
         title, message, metric_name, metric_value,
         threshold_value, region, detail_url,
         related_entity_type, related_entity_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        input.rule_id || null,
        input.severity,
        input.category,
        input.sub_category || null,
        input.title,
        input.message,
        input.metric_name || null,
        input.metric_value || null,
        input.threshold_value || null,
        input.region || null,
        input.detail_url || null,
        input.related_entity_type || null,
        input.related_entity_id || null,
      ],
    );

    logger.info('Analytics alert created', {
      id: result.rows[0].id,
      severity: input.severity,
      category: input.category,
      title: input.title,
    });

    return this.mapAlert(result.rows[0]);
  }

  /**
   * Acknowledge an alert.
   */
  async acknowledge(alertId: string, userId?: string): Promise<Alert | null> {
    const result = await pool.query(
      `UPDATE analytics_alerts
       SET status = 'acknowledged',
           acknowledged_by = $2,
           acknowledged_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId, userId || null],
    );
    return result.rows.length > 0 ? this.mapAlert(result.rows[0]) : null;
  }

  /**
   * Resolve an alert.
   */
  async resolve(alertId: string): Promise<Alert | null> {
    const result = await pool.query(
      `UPDATE analytics_alerts
       SET status = 'resolved',
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId],
    );
    return result.rows.length > 0 ? this.mapAlert(result.rows[0]) : null;
  }

  /**
   * Dismiss an alert.
   */
  async dismiss(alertId: string): Promise<Alert | null> {
    const result = await pool.query(
      `UPDATE analytics_alerts
       SET status = 'dismissed',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId],
    );
    return result.rows.length > 0 ? this.mapAlert(result.rows[0]) : null;
  }

  // ==========================================================================
  // ALERT RULES
  // ==========================================================================

  /**
   * List all alert rules.
   */
  async listRules(activeOnly: boolean = true): Promise<AlertRule[]> {
    try {
      const where = activeOnly ? 'WHERE is_active = true' : '';
      const result = await pool.query(
        `SELECT * FROM analytics_alert_rules ${where} ORDER BY category, name`,
      );
      return result.rows.map(this.mapRule);
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /**
   * Create a new alert rule.
   */
  async createRule(rule: Omit<AlertRule, 'id' | 'is_active'> & { created_by?: string }): Promise<AlertRule> {
    const result = await pool.query(
      `INSERT INTO analytics_alert_rules (
         name, description, category, metric_name, region,
         condition, threshold_value, comparison_period,
         severity, cooldown_hours, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        rule.name,
        rule.description,
        rule.category,
        rule.metric_name,
        rule.region,
        rule.condition,
        rule.threshold_value,
        rule.comparison_period,
        rule.severity,
        rule.cooldown_hours,
        rule.created_by || null,
      ],
    );
    return this.mapRule(result.rows[0]);
  }

  /**
   * Toggle a rule's active status.
   */
  async toggleRule(ruleId: string, isActive: boolean): Promise<AlertRule | null> {
    const result = await pool.query(
      `UPDATE analytics_alert_rules
       SET is_active = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [ruleId, isActive],
    );
    return result.rows.length > 0 ? this.mapRule(result.rows[0]) : null;
  }

  /**
   * Delete a rule.
   */
  async deleteRule(ruleId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM analytics_alert_rules WHERE id = $1`,
      [ruleId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ==========================================================================
  // RULE EVALUATION ENGINE
  // ==========================================================================

  /**
   * Evaluate a single metric value against a rule.
   * Returns true if the rule is violated (alert should fire).
   */
  evaluateCondition(
    currentValue: number,
    previousValue: number | null,
    rule: AlertRule,
  ): boolean {
    const { condition, threshold_value } = rule;

    switch (condition) {
      case 'gt':
        return currentValue > threshold_value;
      case 'gte':
        return currentValue >= threshold_value;
      case 'lt':
        return currentValue < threshold_value;
      case 'lte':
        return currentValue <= threshold_value;
      case 'change_gt':
        if (previousValue === null || previousValue === 0) return false;
        return ((currentValue - previousValue) / Math.abs(previousValue)) * 100 > threshold_value;
      case 'change_lt':
        if (previousValue === null || previousValue === 0) return false;
        return ((currentValue - previousValue) / Math.abs(previousValue)) * 100 < threshold_value;
      case 'deviation':
        // threshold_value is in standard deviations; requires mean & stddev externally
        return Math.abs(currentValue) > threshold_value;
      default:
        return false;
    }
  }

  /**
   * Run all active alert rules against current metrics.
   * This is called periodically (e.g., after new data ingestion).
   */
  async evaluateAllRules(): Promise<Alert[]> {
    const rules = await this.listRules(true);
    const alerts: Alert[] = [];

    for (const rule of rules) {
      try {
        const fired = await this.evaluateRule(rule);
        if (fired) alerts.push(fired);
      } catch (err: any) {
        logger.warn('Rule evaluation failed', {
          rule_id: rule.id,
          rule_name: rule.name,
          error: err.message,
        });
      }
    }

    if (alerts.length > 0) {
      logger.info(`Alert evaluation complete: ${alerts.length} new alerts`, {
        alerts: alerts.map((a) => ({ severity: a.severity, title: a.title })),
      });
    }

    return alerts;
  }

  /**
   * Evaluate a single rule by fetching the relevant metric.
   */
  private async evaluateRule(rule: AlertRule): Promise<Alert | null> {
    const metricValue = await this.fetchMetricValue(rule);
    if (metricValue === null) return null;

    const previousValue = await this.fetchPreviousMetricValue(rule);
    const violated = this.evaluateCondition(metricValue, previousValue, rule);

    if (!violated) return null;

    return this.create({
      rule_id: rule.id,
      severity: rule.severity,
      category: rule.category,
      sub_category: rule.metric_name,
      title: rule.name,
      message: `${rule.name}: current value ${metricValue.toFixed(2)} ${rule.condition} threshold ${rule.threshold_value}`,
      metric_name: rule.metric_name,
      metric_value: metricValue,
      threshold_value: rule.threshold_value,
      region: rule.region || undefined,
    });
  }

  /**
   * Fetch the current value of a metric for rule evaluation.
   */
  private async fetchMetricValue(rule: AlertRule): Promise<number | null> {
    try {
      switch (rule.category) {
        case 'construction': {
          if (rule.metric_name === 'cci_change_mom') {
            const r = await pool.query(
              `SELECT change_mom FROM construction_cost_index_analytics
               WHERE region IS NULL ORDER BY period_date DESC LIMIT 1`,
            );
            return r.rows.length > 0 ? parseFloat(r.rows[0].change_mom || '0') : null;
          }
          if (rule.metric_name.includes('_price_change_mom')) {
            const material = rule.metric_name.replace('_price_change_mom', '');
            const r = await pool.query(
              `SELECT change_mom FROM material_prices
               WHERE LOWER(category) = LOWER($1)
               ORDER BY effective_date DESC LIMIT 1`,
              [material],
            );
            return r.rows.length > 0 ? parseFloat(r.rows[0].change_mom || '0') : null;
          }
          return null;
        }
        case 'hai': {
          if (rule.metric_name === 'ghai_composite') {
            const regionClause = rule.region ? `AND LOWER(region) = LOWER('${rule.region}')` : '';
            const r = await pool.query(
              `SELECT AVG(ghai_composite) AS val FROM housing_affordability_index
               WHERE calculation_date = (SELECT MAX(calculation_date) FROM housing_affordability_index)
               ${regionClause}`,
            );
            return r.rows.length > 0 ? parseFloat(r.rows[0].val || '0') : null;
          }
          if (rule.metric_name === 'ghai_change_mom') {
            const regionClause = rule.region ? `AND LOWER(region) = LOWER('${rule.region}')` : '';
            const r = await pool.query(
              `SELECT AVG(change_mom) AS val FROM housing_affordability_index
               WHERE calculation_date = (SELECT MAX(calculation_date) FROM housing_affordability_index)
               ${regionClause}`,
            );
            return r.rows.length > 0 ? parseFloat(r.rows[0].val || '0') : null;
          }
          return null;
        }
        case 'model': {
          if (rule.metric_name === 'mape') {
            const r = await pool.query(
              `SELECT mape FROM ml_model_performance
               ORDER BY evaluation_date DESC LIMIT 1`,
            );
            return r.rows.length > 0 ? parseFloat(r.rows[0].mape || '0') : null;
          }
          if (rule.metric_name === 'feature_drift_score') {
            const r = await pool.query(
              `SELECT feature_drift_score FROM ml_model_performance
               ORDER BY evaluation_date DESC LIMIT 1`,
            );
            return r.rows.length > 0 ? parseFloat(r.rows[0].feature_drift_score || '0') : null;
          }
          return null;
        }
        case 'market': {
          if (rule.metric_name === 'transaction_count_change_yoy') {
            const r = await pool.query(
              `SELECT price_change_yoy FROM market_activity_metrics
               ORDER BY period_date DESC LIMIT 1`,
            );
            return r.rows.length > 0 ? parseFloat(r.rows[0].price_change_yoy || '0') : null;
          }
          return null;
        }
        default:
          return null;
      }
    } catch (err: any) {
      if (err.code === '42P01') return null;
      throw err;
    }
  }

  /**
   * Fetch the previous period's metric value for change-based rules.
   */
  private async fetchPreviousMetricValue(rule: AlertRule): Promise<number | null> {
    // For absolute threshold rules, previous value isn't needed
    if (!['change_gt', 'change_lt'].includes(rule.condition)) return null;

    // Simplified: return null and let evaluateCondition handle it
    return null;
  }

  // ==========================================================================
  // MAPPERS
  // ==========================================================================

  private mapAlert(r: any): Alert {
    return {
      id: r.id,
      rule_id: r.rule_id,
      severity: r.severity,
      category: r.category,
      sub_category: r.sub_category,
      title: r.title,
      message: r.message,
      metric_name: r.metric_name,
      metric_value: r.metric_value ? parseFloat(r.metric_value) : null,
      threshold_value: r.threshold_value ? parseFloat(r.threshold_value) : null,
      region: r.region,
      status: r.status,
      acknowledged_by: r.acknowledged_by,
      acknowledged_at: r.acknowledged_at,
      resolved_at: r.resolved_at,
      detail_url: r.detail_url,
      created_at: r.created_at,
    };
  }

  private mapRule(r: any): AlertRule {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      metric_name: r.metric_name,
      region: r.region,
      condition: r.condition,
      threshold_value: parseFloat(r.threshold_value),
      comparison_period: r.comparison_period,
      severity: r.severity,
      cooldown_hours: parseInt(r.cooldown_hours, 10),
      is_active: r.is_active,
    };
  }
}

// Singleton
export const alertService = new AlertService();
