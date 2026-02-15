/**
 * Budget Analytics Service
 * Phase 4 Sprint 7 - Enhanced Budget Module
 * 
 * CONSUMES existing Data Hub services - NO duplication:
 * - fxFeedService: Real-time and historical FX rates
 * - economicDataService: Historical exchange rates
 * - constructionCostService: Material prices and cost indices
 * 
 * Features:
 * - Multi-currency budget tracking
 * - Exchange rate locking
 * - Variance analysis with FX impact
 * - Budget forecasting using construction cost trends
 * - Burn rate calculations
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { fxFeedService } from '../data-hub/scrapers/fxFeedService';
import { economicDataService } from '../data-hub/economicDataService';
import { constructionCostService } from '../data-hub/constructionCostService';
import { projectService } from './projectService';
import { projectCostService } from './projectCostService';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface MulticurrencyBudget {
  projectId: string;
  totalGHS: number;
  conversions: Record<string, CurrencyConversion>;
  asOf: Date;
}

export interface CurrencyConversion {
  currency: string;
  amount: number;
  rate: number;
  source: string;
  lastUpdated: Date;
}

export interface BudgetVarianceAnalysis {
  projectId: string;
  budgetGHS: number;
  spentGHS: number;
  remainingGHS: number;
  budgetVariance: number;
  budgetVariancePercent: number;
  fxVariance: number | null;
  fxVariancePercent: number | null;
  fxImpactGHS: number | null;
  projectedOverrun: number | null;
  rateSource: string;
  asOf: Date;
}

export interface BudgetForecast {
  projectId: string;
  originalBudget: number;
  currentSpent: number;
  remainingBudget: number;
  projectedTotal: number;
  projectedVariance: number;
  inflationFactor: number;
  costIndexValue: number;
  monthsRemaining: number;
  burnRateDaily: number;
  burnRateWeekly: number;
  estimatedCompletionDate: Date | null;
  dataSource: string;
  confidence: number;
}

export interface ExchangeRateLock {
  id: string;
  projectId: string;
  organizationId: string;
  fromCurrency: string;
  toCurrency: string;
  lockedRate: number;
  rateAtLock: number;
  rateSource: string;
  lockedBy: string;
  lockedAt: Date;
  lockReason: string | null;
  validFrom: Date;
  validUntil: Date | null;
  budgetAmountLocked: number | null;
  isActive: boolean;
  currentMarketRate: number | null;
  variancePercent: number | null;
  varianceImpactGHS: number | null;
}

export interface LockExchangeRateInput {
  projectId: string;
  organizationId: string;
  fromCurrency: string;
  toCurrency?: string;
  lockedRate?: number; // If not provided, uses current market rate
  lockReason?: string;
  validFrom?: Date;
  validUntil?: Date;
  budgetAmountLocked?: number;
  lockedBy: string;
}

export interface BudgetAlert {
  id: string;
  projectId: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  thresholdValue: number | null;
  currentValue: number | null;
  varianceAmount: number | null;
  isActive: boolean;
  isAcknowledged: boolean;
  createdAt: Date;
}

export interface BudgetSnapshot {
  id: string;
  projectId: string;
  snapshotDate: Date;
  snapshotType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'manual';
  totalBudget: number;
  totalCommitted: number;
  totalActual: number;
  totalVariance: number;
  projectedFinalCost: number | null;
  burnRateDaily: number | null;
  costPerformanceIndex: number | null;
  exchangeRates: Record<string, number>;
  categoryBreakdown: Record<string, { budget: number; actual: number }>;
}

export interface BudgetTrendData {
  dates: Date[];
  budget: number[];
  actual: number[];
  committed: number[];
  projected: number[];
}

// ============================================================================
// BUDGET ANALYTICS SERVICE
// ============================================================================

class BudgetAnalyticsService {
  
  // ==========================================================================
  // MULTI-CURRENCY BUDGET
  // ==========================================================================
  
  /**
   * Get budget with multi-currency conversions
   * Uses fxFeedService.getCurrentRate() - already has ForexRate-API + Yahoo fallback
   */
  async getBudgetWithConversions(
    projectId: string,
    currencies: string[] = ['USD', 'GBP', 'EUR']
  ): Promise<MulticurrencyBudget> {
    try {
      // Get project budget summary
      const budgetSummary = await projectCostService.getBudgetSummary(projectId);
      const totalGHS = budgetSummary.total_actual || 0;
      
      const conversions: Record<string, CurrencyConversion> = {};
      
      for (const currency of currencies) {
        try {
          // Use existing fxFeedService - DO NOT recreate FX logic
          const rateData = await fxFeedService.getCurrentRate(currency);
          conversions[currency] = {
            currency,
            amount: rateData.rate > 0 ? totalGHS / rateData.rate : 0,
            rate: rateData.rate,
            source: rateData.source,
            lastUpdated: new Date(),
          };
        } catch (error) {
          logger.warn(`Failed to get rate for ${currency}`, { error });
          // Use fallback static rate
          const fallbackRates: Record<string, number> = {
            USD: 15.50,
            GBP: 19.50,
            EUR: 16.80,
            CNY: 2.15,
          };
          conversions[currency] = {
            currency,
            amount: fallbackRates[currency] ? totalGHS / fallbackRates[currency] : 0,
            rate: fallbackRates[currency] || 0,
            source: 'Static Fallback',
            lastUpdated: new Date(),
          };
        }
      }
      
      return {
        projectId,
        totalGHS,
        conversions,
        asOf: new Date(),
      };
    } catch (error) {
      logger.error('Error getting budget with conversions', { projectId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // VARIANCE ANALYSIS
  // ==========================================================================
  
  /**
   * Calculate variance including FX impact
   * Uses economicDataService for historical rates
   */
  async calculateVariance(projectId: string): Promise<BudgetVarianceAnalysis> {
    try {
      const project = await (projectService as any).getById(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      
      const budgetSummary = await projectCostService.getBudgetSummary(projectId);
      
      const budgetGHS = project.total_budget || 0;
      const spentGHS = budgetSummary.total_actual || 0;
      const remainingGHS = budgetGHS - spentGHS;
      
      // Get current rate
      const currentRateData = await fxFeedService.getCurrentRate('USD');
      
      // Try to get historical rate at project start
      let fxVariance: number | null = null;
      let fxVariancePercent: number | null = null;
      let fxImpactGHS: number | null = null;
      
      if (project.planned_start_date) {
        try {
          const historicalRate = await economicDataService.getExchangeRate(
            'USD',
            project.planned_start_date as any
          );
          
          if (historicalRate && historicalRate.rate) {
            fxVariancePercent = ((currentRateData.rate - historicalRate.rate) / historicalRate.rate) * 100;
            fxImpactGHS = (budgetGHS / historicalRate.rate) * (currentRateData.rate - historicalRate.rate);
            fxVariance = currentRateData.rate - historicalRate.rate;
          }
        } catch (error) {
          logger.warn('Could not get historical exchange rate', { projectId, error });
        }
      }
      
      const budgetVariance = spentGHS - budgetGHS;
      const budgetVariancePercent = budgetGHS > 0 ? (budgetVariance / budgetGHS) * 100 : 0;
      
      // Calculate projected overrun based on progress
      let projectedOverrun: number | null = null;
      if (project.overall_progress && project.overall_progress > 0 && project.overall_progress < 100) {
        const projectedTotal = spentGHS / (project.overall_progress / 100);
        projectedOverrun = projectedTotal - budgetGHS;
      }
      
      return {
        projectId,
        budgetGHS,
        spentGHS,
        remainingGHS,
        budgetVariance,
        budgetVariancePercent,
        fxVariance,
        fxVariancePercent,
        fxImpactGHS,
        projectedOverrun,
        rateSource: currentRateData.source,
        asOf: new Date(),
      };
    } catch (error) {
      logger.error('Error calculating variance', { projectId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // BUDGET FORECASTING
  // ==========================================================================
  
  /**
   * Forecast budget using construction cost trends
   * Uses constructionCostService for regional cost indices
   */
  async forecastBudget(projectId: string): Promise<BudgetForecast> {
    try {
      const project = await (projectService as any).getById(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      
      const region = project.region || 'greater_accra';
      const budgetSummary = await projectCostService.getBudgetSummary(projectId);
      
      // Get construction cost index from EXISTING constructionCostService
      let costIndex: { index_value: number } | null = null;
      let avgMaterialInflation = 0;
      
      try {
        costIndex = await (constructionCostService as any).getCostIndex(region as any);
        const materialTrends = await (constructionCostService as any).getMaterialPrices(
          region as any,
          90
        );
        avgMaterialInflation = this.calculateInflationRate(materialTrends);
      } catch (error) {
        logger.warn('Could not get construction cost data, using defaults', { error });
      }
      
      const originalBudget = project.total_budget || 0;
      const currentSpent = budgetSummary.total_actual || 0;
      const remainingBudget = originalBudget - currentSpent;
      const monthsRemaining = this.getMonthsRemaining(project.planned_completion_date);
      
      // Calculate burn rate
      const daysElapsed = this.getDaysElapsed(project.actual_start_date || project.planned_start_date);
      const burnRateDaily = daysElapsed > 0 ? currentSpent / daysElapsed : 0;
      const burnRateWeekly = burnRateDaily * 7;
      
      // Calculate projected inflation impact
      const projectedInflationImpact = remainingBudget * (avgMaterialInflation / 100) * monthsRemaining;
      const projectedTotal = originalBudget + projectedInflationImpact;
      
      // Estimate completion date based on burn rate
      let estimatedCompletionDate: Date | null = null;
      if (burnRateDaily > 0 && remainingBudget > 0) {
        const daysToComplete = remainingBudget / burnRateDaily;
        estimatedCompletionDate = new Date();
        estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + daysToComplete);
      }
      
      // Calculate confidence based on data availability
      let confidence = 0.5; // Base confidence
      if (costIndex) confidence += 0.2;
      if (daysElapsed > 30) confidence += 0.15;
      if (project.overall_progress && project.overall_progress > 20) confidence += 0.15;
      
      return {
        projectId,
        originalBudget,
        currentSpent,
        remainingBudget,
        projectedTotal,
        projectedVariance: projectedTotal - originalBudget,
        inflationFactor: avgMaterialInflation,
        costIndexValue: costIndex?.index_value || 1.0,
        monthsRemaining,
        burnRateDaily,
        burnRateWeekly,
        estimatedCompletionDate,
        dataSource: 'constructionCostService',
        confidence,
      };
    } catch (error) {
      logger.error('Error forecasting budget', { projectId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // EXCHANGE RATE LOCKING
  // ==========================================================================
  
  /**
   * Lock exchange rate for budget planning
   */
  async lockExchangeRate(input: LockExchangeRateInput): Promise<ExchangeRateLock> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get current market rate if not provided
      let lockedRate = input.lockedRate;
      let rateSource = 'Manual Entry';
      
      if (!lockedRate) {
        const currentRate = await fxFeedService.getCurrentRate(input.fromCurrency);
        lockedRate = currentRate.rate;
        rateSource = currentRate.source;
      }
      
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO exchange_rate_locks (
          id, project_id, organization_id, from_currency, to_currency,
          locked_rate, rate_at_lock, rate_source, locked_by, lock_reason,
          valid_from, valid_until, budget_amount_locked, is_active,
          current_market_rate
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $6
        )
        RETURNING *`,
        [
          id,
          input.projectId,
          input.organizationId,
          input.fromCurrency,
          input.toCurrency || 'GHS',
          lockedRate,
          lockedRate,
          rateSource,
          input.lockedBy,
          input.lockReason || null,
          input.validFrom || new Date(),
          input.validUntil || null,
          input.budgetAmountLocked || null,
        ]
      );
      
      await client.query('COMMIT');
      
      return this.mapExchangeRateLock(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error locking exchange rate', { input, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get active exchange rate locks for a project
   */
  async getActiveRateLocks(projectId: string): Promise<ExchangeRateLock[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM exchange_rate_locks
         WHERE project_id = $1 AND is_active = true
         ORDER BY locked_at DESC`,
        [projectId]
      );
      
      // Update current market rates
      const locks = await Promise.all(
        result.rows.map(async (row) => {
          try {
            const currentRate = await fxFeedService.getCurrentRate(row.from_currency);
            const variancePercent = ((currentRate.rate - row.locked_rate) / row.locked_rate) * 100;
            const varianceImpact = row.budget_amount_locked
              ? (row.budget_amount_locked / row.locked_rate) * (currentRate.rate - row.locked_rate)
              : null;
            
            return this.mapExchangeRateLock({
              ...row,
              current_market_rate: currentRate.rate,
              variance_percent: variancePercent,
              variance_impact_ghs: varianceImpact,
            });
          } catch {
            return this.mapExchangeRateLock(row);
          }
        })
      );
      
      return locks;
    } catch (error) {
      logger.error('Error getting rate locks', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Release an exchange rate lock
   */
  async releaseRateLock(lockId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE exchange_rate_locks 
         SET is_active = false, updated_at = NOW()
         WHERE id = $1`,
        [lockId]
      );
    } catch (error) {
      logger.error('Error releasing rate lock', { lockId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // BUDGET SNAPSHOTS
  // ==========================================================================
  
  /**
   * Create a budget snapshot for historical tracking
   */
  async createSnapshot(
    projectId: string,
    organizationId: string,
    snapshotType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'manual' = 'manual',
    createdBy?: string
  ): Promise<BudgetSnapshot> {
    try {
      const budgetSummary = await projectCostService.getBudgetSummary(projectId);
      const forecast = await this.forecastBudget(projectId);
      
      // Get exchange rates
      const exchangeRates: Record<string, number> = {};
      for (const currency of ['USD', 'GBP', 'EUR']) {
        try {
          const rate = await fxFeedService.getCurrentRate(currency);
          exchangeRates[currency] = rate.rate;
        } catch {
          // Skip if rate unavailable
        }
      }
      
      // Get category breakdown
      const costs = await projectCostService.getByProject(projectId);
      const categoryBreakdown: Record<string, { budget: number; actual: number }> = {};
      
      for (const cost of costs) {
        const category = cost.category || 'other';
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = { budget: 0, actual: 0 };
        }
        categoryBreakdown[category].budget += cost.original_budget || 0;
        categoryBreakdown[category].actual += cost.actual_costs || 0;
      }
      
      const id = uuidv4();
      const result = await pool.query(
        `INSERT INTO budget_snapshots (
          id, project_id, organization_id, snapshot_date, snapshot_type,
          total_budget, total_committed, total_actual, total_pending, total_variance,
          projected_final_cost, contingency_remaining, exchange_rates,
          category_breakdown, burn_rate_daily, burn_rate_weekly,
          cost_performance_index, created_by
        ) VALUES (
          $1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT (project_id, snapshot_date, snapshot_type) 
        DO UPDATE SET
          total_budget = EXCLUDED.total_budget,
          total_committed = EXCLUDED.total_committed,
          total_actual = EXCLUDED.total_actual,
          total_variance = EXCLUDED.total_variance,
          projected_final_cost = EXCLUDED.projected_final_cost,
          exchange_rates = EXCLUDED.exchange_rates,
          category_breakdown = EXCLUDED.category_breakdown,
          burn_rate_daily = EXCLUDED.burn_rate_daily
        RETURNING *`,
        [
          id,
          projectId,
          organizationId,
          snapshotType,
          budgetSummary.total_revised_budget || 0,
          budgetSummary.total_committed || 0,
          budgetSummary.total_actual || 0,
          budgetSummary.total_pending || 0,
          (budgetSummary.total_actual || 0) - (budgetSummary.total_revised_budget || 0),
          forecast.projectedTotal,
          null, // contingency_remaining
          JSON.stringify(exchangeRates),
          JSON.stringify(categoryBreakdown),
          forecast.burnRateDaily,
          forecast.burnRateWeekly,
          this.calculateCPI(budgetSummary),
          createdBy,
        ]
      );
      
      return this.mapBudgetSnapshot(result.rows[0]);
    } catch (error) {
      logger.error('Error creating snapshot', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Get budget trend data over time
   */
  async getBudgetTrend(
    projectId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<BudgetTrendData> {
    try {
      const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      const end = endDate || new Date();
      
      const result = await pool.query(
        `SELECT snapshot_date, total_budget, total_actual, total_committed, 
                projected_final_cost
         FROM budget_snapshots
         WHERE project_id = $1 AND snapshot_date BETWEEN $2 AND $3
         ORDER BY snapshot_date ASC`,
        [projectId, start, end]
      );
      
      return {
        dates: result.rows.map(r => r.snapshot_date),
        budget: result.rows.map(r => parseFloat(r.total_budget) || 0),
        actual: result.rows.map(r => parseFloat(r.total_actual) || 0),
        committed: result.rows.map(r => parseFloat(r.total_committed) || 0),
        projected: result.rows.map(r => parseFloat(r.projected_final_cost) || 0),
      };
    } catch (error) {
      logger.error('Error getting budget trend', { projectId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // ALERT INTEGRATION
  // ==========================================================================
  
  /**
   * Check budget thresholds and generate alerts
   */
  async checkBudgetThresholds(projectId: string, organizationId: string): Promise<BudgetAlert[]> {
    try {
      const variance = await this.calculateVariance(projectId);
      const alerts: BudgetAlert[] = [];
      
      // Get alert rules
      const rulesResult = await pool.query(
        `SELECT * FROM budget_alert_rules 
         WHERE (organization_id = $1 OR organization_id = '00000000-0000-0000-0000-000000000000')
           AND (project_id = $2 OR project_id IS NULL)
           AND is_active = true
         ORDER BY priority`,
        [organizationId, projectId]
      );
      
      for (const rule of rulesResult.rows) {
        let shouldAlert = false;
        let currentValue = 0;
        
        switch (rule.threshold_type) {
          case 'percentage_of_budget':
            currentValue = variance.budgetGHS > 0
              ? (variance.spentGHS / variance.budgetGHS) * 100
              : 0;
            shouldAlert = this.evaluateCondition(currentValue, rule.comparison_operator, rule.threshold_value);
            break;
            
          case 'percentage_change':
            if (variance.fxVariancePercent !== null) {
              currentValue = Math.abs(variance.fxVariancePercent);
              shouldAlert = this.evaluateCondition(currentValue, rule.comparison_operator, rule.threshold_value);
            }
            break;
        }
        
        if (shouldAlert) {
          // Check if similar alert exists recently
          const existingAlert = await pool.query(
            `SELECT id FROM budget_alerts
             WHERE project_id = $1 AND alert_type = $2 AND is_active = true
               AND created_at > NOW() - INTERVAL '${rule.cooldown_hours || 24} hours'`,
            [projectId, rule.alert_type]
          );
          
          if (existingAlert.rows.length === 0) {
            const alertId = uuidv4();
            await pool.query(
              `INSERT INTO budget_alerts (
                id, project_id, organization_id, alert_type, severity,
                threshold_type, threshold_value, current_value,
                threshold_percent, current_percent,
                title, message, is_active
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
              [
                alertId,
                projectId,
                organizationId,
                rule.alert_type,
                rule.severity,
                rule.threshold_type,
                rule.threshold_value,
                currentValue,
                rule.threshold_value,
                currentValue,
                rule.name,
                this.generateAlertMessage(rule, currentValue, variance),
              ]
            );
            
            alerts.push({
              id: alertId,
              projectId,
              alertType: rule.alert_type,
              severity: rule.severity,
              title: rule.name,
              message: this.generateAlertMessage(rule, currentValue, variance),
              thresholdValue: rule.threshold_value,
              currentValue,
              varianceAmount: variance.budgetVariance,
              isActive: true,
              isAcknowledged: false,
              createdAt: new Date(),
            });
          }
        }
      }
      
      return alerts;
    } catch (error) {
      logger.error('Error checking budget thresholds', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Get active alerts for a project
   */
  async getActiveAlerts(projectId: string): Promise<BudgetAlert[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM budget_alerts
         WHERE project_id = $1 AND is_active = true
         ORDER BY severity DESC, created_at DESC`,
        [projectId]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        alertType: row.alert_type,
        severity: row.severity,
        title: row.title,
        message: row.message,
        thresholdValue: row.threshold_value,
        currentValue: row.current_value,
        varianceAmount: row.variance_amount,
        isActive: row.is_active,
        isAcknowledged: row.is_acknowledged,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Error getting active alerts', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE budget_alerts 
         SET is_acknowledged = true, acknowledged_by = $2, acknowledged_at = NOW()
         WHERE id = $1`,
        [alertId, acknowledgedBy]
      );
    } catch (error) {
      logger.error('Error acknowledging alert', { alertId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  
  private calculateInflationRate(trends: any[]): number {
    if (!trends || trends.length < 2) return 0;
    
    const sortedTrends = trends.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    const firstPrice = sortedTrends[0]?.price || sortedTrends[0]?.price_ghs || 0;
    const lastPrice = sortedTrends[sortedTrends.length - 1]?.price || 
                      sortedTrends[sortedTrends.length - 1]?.price_ghs || 0;
    
    if (firstPrice === 0) return 0;
    
    const periodDays = (new Date(sortedTrends[sortedTrends.length - 1].date).getTime() - 
                       new Date(sortedTrends[0].date).getTime()) / (1000 * 60 * 60 * 24);
    
    const periodMonths = periodDays / 30;
    if (periodMonths === 0) return 0;
    
    const totalChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    return totalChange / periodMonths; // Monthly rate
  }
  
  private getMonthsRemaining(endDate?: Date | null): number {
    if (!endDate) return 6; // Default assumption
    
    const now = new Date();
    const end = new Date(endDate);
    
    const monthsDiff = (end.getFullYear() - now.getFullYear()) * 12 + 
                       (end.getMonth() - now.getMonth());
    
    return Math.max(0, monthsDiff);
  }
  
  private getDaysElapsed(startDate?: Date | null): number {
    if (!startDate) return 0;
    
    const now = new Date();
    const start = new Date(startDate);
    
    return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  private calculateCPI(budgetSummary: any): number {
    // Cost Performance Index = Earned Value / Actual Cost
    // Simplified: Budget / Actual (where < 1 means over budget)
    const budget = budgetSummary.total_revised_budget || 0;
    const actual = budgetSummary.total_actual || 0;
    
    if (actual === 0) return 1;
    return budget / actual;
  }
  
  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '=': return value === threshold;
      case '!=': return value !== threshold;
      case '>': return value > threshold;
      case '>=': return value >= threshold;
      case '<': return value < threshold;
      case '<=': return value <= threshold;
      default: return false;
    }
  }
  
  private generateAlertMessage(rule: any, currentValue: number, variance: any): string {
    const percent = currentValue.toFixed(1);
    
    switch (rule.alert_type) {
      case 'threshold_warning':
        return `Budget consumption is at ${percent}% (threshold: ${rule.threshold_value}%). ` +
               `Spent: GHS ${variance.spentGHS.toLocaleString()} of GHS ${variance.budgetGHS.toLocaleString()}.`;
      case 'overrun':
        return `Budget has been exceeded by ${(currentValue - 100).toFixed(1)}%. ` +
               `Overrun amount: GHS ${Math.abs(variance.budgetVariance).toLocaleString()}.`;
      case 'fx_variance':
        return `Exchange rate has moved ${percent}% from locked rate. ` +
               `Potential impact: GHS ${(variance.fxImpactGHS || 0).toLocaleString()}.`;
      default:
        return `Alert triggered: ${rule.name}. Current value: ${currentValue}.`;
    }
  }
  
  private mapExchangeRateLock(row: any): ExchangeRateLock {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      fromCurrency: row.from_currency,
      toCurrency: row.to_currency,
      lockedRate: parseFloat(row.locked_rate),
      rateAtLock: parseFloat(row.rate_at_lock),
      rateSource: row.rate_source,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at,
      lockReason: row.lock_reason,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      budgetAmountLocked: row.budget_amount_locked ? parseFloat(row.budget_amount_locked) : null,
      isActive: row.is_active,
      currentMarketRate: row.current_market_rate ? parseFloat(row.current_market_rate) : null,
      variancePercent: row.variance_percent ? parseFloat(row.variance_percent) : null,
      varianceImpactGHS: row.variance_impact_ghs ? parseFloat(row.variance_impact_ghs) : null,
    };
  }
  
  private mapBudgetSnapshot(row: any): BudgetSnapshot {
    return {
      id: row.id,
      projectId: row.project_id,
      snapshotDate: row.snapshot_date,
      snapshotType: row.snapshot_type,
      totalBudget: parseFloat(row.total_budget),
      totalCommitted: parseFloat(row.total_committed),
      totalActual: parseFloat(row.total_actual),
      totalVariance: parseFloat(row.total_variance),
      projectedFinalCost: row.projected_final_cost ? parseFloat(row.projected_final_cost) : null,
      burnRateDaily: row.burn_rate_daily ? parseFloat(row.burn_rate_daily) : null,
      costPerformanceIndex: row.cost_performance_index ? parseFloat(row.cost_performance_index) : null,
      exchangeRates: row.exchange_rates || {},
      categoryBreakdown: row.category_breakdown || {},
    };
  }
}

// Export singleton
export const budgetAnalyticsService = new BudgetAnalyticsService();
export default budgetAnalyticsService;
