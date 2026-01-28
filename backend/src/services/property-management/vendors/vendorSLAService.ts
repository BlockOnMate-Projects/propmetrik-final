/**
 * Vendor SLA Tracking Service
 * 
 * Monitors vendor performance against Service Level Agreements:
 * - Response time SLA (time to acknowledge)
 * - Resolution time SLA (time to complete)
 * - Quality metrics (rework rate, customer satisfaction)
 * - Automatic vendor scoring and alerts
 */

import { pool } from '../../../database';
import { logger } from '../../../utils/logger';
import { realtimeEmitter } from '../../../../shared-services/realtime';

// ============================================================================
// TYPES
// ============================================================================

export interface VendorSLA {
  id: string;
  vendorId: string;
  category: string;
  priority: 'emergency' | 'urgent' | 'normal' | 'low';
  responseTimeHours: number;
  resolutionTimeHours: number;
  penaltyPercentage: number;
  bonusPercentage: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
}

export interface SLABreach {
  id: string;
  workOrderId: string;
  vendorId: string;
  slaId: string;
  breachType: 'response' | 'resolution';
  expectedTime: Date;
  actualTime: Date | null;
  delayHours: number;
  penaltyAmount: number;
  status: 'pending' | 'acknowledged' | 'waived' | 'applied';
  notes: string | null;
  createdAt: Date;
}

export interface VendorPerformanceMetrics {
  vendorId: string;
  vendorName: string;
  category: string;
  period: { start: Date; end: Date };
  
  // Volume metrics
  totalWorkOrders: number;
  completedWorkOrders: number;
  inProgressWorkOrders: number;
  
  // SLA compliance
  responseSlaMet: number;
  responseSlaMissed: number;
  responseComplianceRate: number;
  resolutionSlaMet: number;
  resolutionSlaMissed: number;
  resolutionComplianceRate: number;
  
  // Time metrics
  avgResponseTimeHours: number;
  avgResolutionTimeHours: number;
  medianResolutionTimeHours: number;
  
  // Quality metrics
  reworkRate: number;
  customerSatisfactionAvg: number;
  customerSatisfactionCount: number;
  
  // Financial metrics
  totalBilled: number;
  totalPenalties: number;
  totalBonuses: number;
  netPayable: number;
  
  // Score
  overallScore: number;
  scoreBreakdown: {
    slaCompliance: number;
    responseTime: number;
    quality: number;
    customerSatisfaction: number;
  };
}

export interface SLAAlert {
  type: 'warning' | 'breach' | 'critical';
  vendorId: string;
  workOrderId: string;
  message: string;
  expectedDeadline: Date;
  hoursRemaining: number;
}

// Default SLA configurations by priority
const DEFAULT_SLA_CONFIG: Record<string, { responseHours: number; resolutionHours: number }> = {
  emergency: { responseHours: 1, resolutionHours: 4 },
  urgent: { responseHours: 4, resolutionHours: 24 },
  normal: { responseHours: 24, resolutionHours: 72 },
  low: { responseHours: 48, resolutionHours: 168 }, // 7 days
};

// ============================================================================
// SLA MANAGEMENT
// ============================================================================

export async function createVendorSLA(sla: Omit<VendorSLA, 'id' | 'isActive'>): Promise<VendorSLA> {
  const result = await pool.query(`
    INSERT INTO pm_vendor_slas (
      vendor_id, category, priority, 
      response_time_hours, resolution_time_hours,
      penalty_percentage, bonus_percentage,
      effective_from, effective_to, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    RETURNING *
  `, [
    sla.vendorId,
    sla.category,
    sla.priority,
    sla.responseTimeHours,
    sla.resolutionTimeHours,
    sla.penaltyPercentage,
    sla.bonusPercentage,
    sla.effectiveFrom,
    sla.effectiveTo,
  ]);

  logger.info('Created vendor SLA', { vendorId: sla.vendorId, category: sla.category });
  return mapSLARow(result.rows[0]);
}

export async function getVendorSLA(
  vendorId: string,
  category: string,
  priority: string
): Promise<VendorSLA | null> {
  const result = await pool.query(`
    SELECT * FROM pm_vendor_slas
    WHERE vendor_id = $1
      AND category = $2
      AND priority = $3
      AND is_active = true
      AND effective_from <= CURRENT_DATE
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    ORDER BY effective_from DESC
    LIMIT 1
  `, [vendorId, category, priority]);

  if (result.rows.length === 0) {
    // Return default SLA if vendor-specific not found
    return null;
  }

  return mapSLARow(result.rows[0]);
}

export async function updateVendorSLA(
  slaId: string,
  updates: Partial<VendorSLA>
): Promise<VendorSLA> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.responseTimeHours !== undefined) {
    fields.push(`response_time_hours = $${paramIndex++}`);
    values.push(updates.responseTimeHours);
  }
  if (updates.resolutionTimeHours !== undefined) {
    fields.push(`resolution_time_hours = $${paramIndex++}`);
    values.push(updates.resolutionTimeHours);
  }
  if (updates.penaltyPercentage !== undefined) {
    fields.push(`penalty_percentage = $${paramIndex++}`);
    values.push(updates.penaltyPercentage);
  }
  if (updates.bonusPercentage !== undefined) {
    fields.push(`bonus_percentage = $${paramIndex++}`);
    values.push(updates.bonusPercentage);
  }
  if (updates.effectiveTo !== undefined) {
    fields.push(`effective_to = $${paramIndex++}`);
    values.push(updates.effectiveTo);
  }
  if (updates.isActive !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(updates.isActive);
  }

  fields.push(`updated_at = NOW()`);
  values.push(slaId);

  const result = await pool.query(`
    UPDATE pm_vendor_slas
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, values);

  return mapSLARow(result.rows[0]);
}

// ============================================================================
// SLA MONITORING
// ============================================================================

export async function checkWorkOrderSLA(workOrderId: string): Promise<SLAAlert[]> {
  const alerts: SLAAlert[] = [];

  const result = await pool.query(`
    SELECT 
      wo.id,
      wo.vendor_id,
      wo.status,
      wo.created_at,
      wo.assigned_at,
      wo.acknowledged_at,
      wo.completed_at,
      wo.quoted_amount,
      mr.priority,
      mr.category,
      v.company_name as vendor_name,
      sla.response_time_hours,
      sla.resolution_time_hours,
      sla.penalty_percentage
    FROM pm_work_orders wo
    JOIN pm_maintenance_requests mr ON wo.maintenance_request_id = mr.id
    JOIN pm_vendors v ON wo.vendor_id = v.id
    LEFT JOIN pm_vendor_slas sla ON 
      sla.vendor_id = wo.vendor_id 
      AND sla.category = mr.category
      AND sla.priority = mr.priority
      AND sla.is_active = true
    WHERE wo.id = $1
  `, [workOrderId]);

  if (result.rows.length === 0) {
    return alerts;
  }

  const wo = result.rows[0];
  const now = new Date();
  
  // Get SLA times (use defaults if no custom SLA)
  const slaConfig = DEFAULT_SLA_CONFIG[wo.priority] || DEFAULT_SLA_CONFIG.normal;
  const responseTimeHours = wo.response_time_hours || slaConfig.responseHours;
  const resolutionTimeHours = wo.resolution_time_hours || slaConfig.resolutionHours;

  // Check response SLA (if not yet acknowledged)
  if (!wo.acknowledged_at && wo.status === 'assigned') {
    const assignedAt = new Date(wo.assigned_at);
    const responseDeadline = new Date(assignedAt.getTime() + responseTimeHours * 60 * 60 * 1000);
    const hoursRemaining = (responseDeadline.getTime() - now.getTime()) / (60 * 60 * 1000);

    if (hoursRemaining < 0) {
      alerts.push({
        type: 'breach',
        vendorId: wo.vendor_id,
        workOrderId: wo.id,
        message: `Response SLA breached by ${Math.abs(hoursRemaining).toFixed(1)} hours`,
        expectedDeadline: responseDeadline,
        hoursRemaining,
      });
    } else if (hoursRemaining < responseTimeHours * 0.25) {
      alerts.push({
        type: 'critical',
        vendorId: wo.vendor_id,
        workOrderId: wo.id,
        message: `Response SLA deadline in ${hoursRemaining.toFixed(1)} hours`,
        expectedDeadline: responseDeadline,
        hoursRemaining,
      });
    } else if (hoursRemaining < responseTimeHours * 0.5) {
      alerts.push({
        type: 'warning',
        vendorId: wo.vendor_id,
        workOrderId: wo.id,
        message: `Response SLA deadline approaching (${hoursRemaining.toFixed(1)} hours)`,
        expectedDeadline: responseDeadline,
        hoursRemaining,
      });
    }
  }

  // Check resolution SLA (if not yet completed)
  if (!wo.completed_at && ['assigned', 'in_progress'].includes(wo.status)) {
    const startTime = new Date(wo.acknowledged_at || wo.assigned_at);
    const resolutionDeadline = new Date(startTime.getTime() + resolutionTimeHours * 60 * 60 * 1000);
    const hoursRemaining = (resolutionDeadline.getTime() - now.getTime()) / (60 * 60 * 1000);

    if (hoursRemaining < 0) {
      alerts.push({
        type: 'breach',
        vendorId: wo.vendor_id,
        workOrderId: wo.id,
        message: `Resolution SLA breached by ${Math.abs(hoursRemaining).toFixed(1)} hours`,
        expectedDeadline: resolutionDeadline,
        hoursRemaining,
      });
    } else if (hoursRemaining < resolutionTimeHours * 0.25) {
      alerts.push({
        type: 'critical',
        vendorId: wo.vendor_id,
        workOrderId: wo.id,
        message: `Resolution SLA deadline in ${hoursRemaining.toFixed(1)} hours`,
        expectedDeadline: resolutionDeadline,
        hoursRemaining,
      });
    } else if (hoursRemaining < resolutionTimeHours * 0.5) {
      alerts.push({
        type: 'warning',
        vendorId: wo.vendor_id,
        workOrderId: wo.id,
        message: `Resolution SLA deadline approaching (${hoursRemaining.toFixed(1)} hours)`,
        expectedDeadline: resolutionDeadline,
        hoursRemaining,
      });
    }
  }

  return alerts;
}

export async function recordSLABreach(
  workOrderId: string,
  breachType: 'response' | 'resolution'
): Promise<SLABreach> {
  const woResult = await pool.query(`
    SELECT 
      wo.*,
      mr.priority,
      mr.category,
      sla.id as sla_id,
      sla.response_time_hours,
      sla.resolution_time_hours,
      sla.penalty_percentage
    FROM pm_work_orders wo
    JOIN pm_maintenance_requests mr ON wo.maintenance_request_id = mr.id
    LEFT JOIN pm_vendor_slas sla ON 
      sla.vendor_id = wo.vendor_id 
      AND sla.category = mr.category
      AND sla.priority = mr.priority
      AND sla.is_active = true
    WHERE wo.id = $1
  `, [workOrderId]);

  if (woResult.rows.length === 0) {
    throw new Error('Work order not found');
  }

  const wo = woResult.rows[0];
  const now = new Date();
  
  // Calculate expected time and delay
  const slaConfig = DEFAULT_SLA_CONFIG[wo.priority] || DEFAULT_SLA_CONFIG.normal;
  let expectedTime: Date;
  let actualTime: Date | null;
  let slaHours: number;

  if (breachType === 'response') {
    slaHours = wo.response_time_hours || slaConfig.responseHours;
    expectedTime = new Date(new Date(wo.assigned_at).getTime() + slaHours * 60 * 60 * 1000);
    actualTime = wo.acknowledged_at ? new Date(wo.acknowledged_at) : null;
  } else {
    slaHours = wo.resolution_time_hours || slaConfig.resolutionHours;
    const startTime = wo.acknowledged_at || wo.assigned_at;
    expectedTime = new Date(new Date(startTime).getTime() + slaHours * 60 * 60 * 1000);
    actualTime = wo.completed_at ? new Date(wo.completed_at) : null;
  }

  const compareTime = actualTime || now;
  const delayHours = Math.max(0, (compareTime.getTime() - expectedTime.getTime()) / (60 * 60 * 1000));
  
  // Calculate penalty (percentage of quoted amount per hour of delay, capped at 20%)
  const penaltyPercentage = wo.penalty_percentage || 2;
  const penaltyAmount = Math.min(
    wo.quoted_amount * 0.20,
    (wo.quoted_amount * (penaltyPercentage / 100)) * delayHours
  );

  const result = await pool.query(`
    INSERT INTO pm_sla_breaches (
      work_order_id, vendor_id, sla_id, breach_type,
      expected_time, actual_time, delay_hours, penalty_amount, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    RETURNING *
  `, [
    workOrderId,
    wo.vendor_id,
    wo.sla_id,
    breachType,
    expectedTime,
    actualTime,
    delayHours,
    penaltyAmount,
  ]);

  const breach = mapBreachRow(result.rows[0]);

  // Emit real-time event
  realtimeEmitter.emit('sla:breach', {
    breach,
    workOrderId,
    vendorId: wo.vendor_id,
  });

  logger.warn('SLA breach recorded', { 
    workOrderId, 
    breachType, 
    delayHours: delayHours.toFixed(1),
    penaltyAmount 
  });

  return breach;
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

export async function getVendorPerformanceMetrics(
  vendorId: string,
  startDate: Date,
  endDate: Date
): Promise<VendorPerformanceMetrics> {
  // Get vendor info
  const vendorResult = await pool.query(`
    SELECT id, company_name, category FROM pm_vendors WHERE id = $1
  `, [vendorId]);

  if (vendorResult.rows.length === 0) {
    throw new Error('Vendor not found');
  }

  const vendor = vendorResult.rows[0];

  // Get work order statistics
  const woStatsResult = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status IN ('assigned', 'in_progress')) as in_progress,
      
      -- Response SLA
      COUNT(*) FILTER (
        WHERE acknowledged_at IS NOT NULL 
        AND acknowledged_at <= assigned_at + INTERVAL '1 hour' * COALESCE(
          (SELECT response_time_hours FROM pm_vendor_slas sla 
           JOIN pm_maintenance_requests mr ON mr.id = work_order.maintenance_request_id
           WHERE sla.vendor_id = $1 AND sla.priority = mr.priority LIMIT 1), 
          24
        )
      ) as response_sla_met,
      COUNT(*) FILTER (
        WHERE acknowledged_at IS NOT NULL 
        AND acknowledged_at > assigned_at + INTERVAL '1 hour' * 24
      ) as response_sla_missed,
      
      -- Resolution SLA  
      COUNT(*) FILTER (
        WHERE completed_at IS NOT NULL 
        AND completed_at <= COALESCE(acknowledged_at, assigned_at) + INTERVAL '1 hour' * 72
      ) as resolution_sla_met,
      COUNT(*) FILTER (
        WHERE completed_at IS NOT NULL 
        AND completed_at > COALESCE(acknowledged_at, assigned_at) + INTERVAL '1 hour' * 72
      ) as resolution_sla_missed,
      
      -- Time metrics
      AVG(EXTRACT(EPOCH FROM (acknowledged_at - assigned_at)) / 3600) as avg_response_hours,
      AVG(EXTRACT(EPOCH FROM (completed_at - COALESCE(acknowledged_at, assigned_at))) / 3600) as avg_resolution_hours,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (completed_at - COALESCE(acknowledged_at, assigned_at))) / 3600
      ) as median_resolution_hours,
      
      -- Financial
      SUM(quoted_amount) as total_billed
      
    FROM pm_work_orders work_order
    WHERE vendor_id = $1
      AND created_at BETWEEN $2 AND $3
  `, [vendorId, startDate, endDate]);

  const stats = woStatsResult.rows[0];

  // Get rework rate (work orders that required reopening)
  const reworkResult = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE reopen_count > 0) as reworks,
      COUNT(*) as total
    FROM pm_work_orders
    WHERE vendor_id = $1
      AND status = 'completed'
      AND completed_at BETWEEN $2 AND $3
  `, [vendorId, startDate, endDate]);

  const reworkStats = reworkResult.rows[0];

  // Get customer satisfaction
  const satisfactionResult = await pool.query(`
    SELECT 
      AVG(rating) as avg_rating,
      COUNT(*) as rating_count
    FROM pm_vendor_ratings
    WHERE vendor_id = $1
      AND created_at BETWEEN $2 AND $3
  `, [vendorId, startDate, endDate]);

  const satisfaction = satisfactionResult.rows[0];

  // Get penalties and bonuses
  const financialResult = await pool.query(`
    SELECT 
      COALESCE(SUM(penalty_amount) FILTER (WHERE status = 'applied'), 0) as total_penalties,
      0 as total_bonuses -- Bonus calculation would be based on early completion
    FROM pm_sla_breaches
    WHERE vendor_id = $1
      AND created_at BETWEEN $2 AND $3
  `, [vendorId, startDate, endDate]);

  const financials = financialResult.rows[0];

  // Calculate compliance rates
  const responseTotal = (parseInt(stats.response_sla_met) || 0) + (parseInt(stats.response_sla_missed) || 0);
  const resolutionTotal = (parseInt(stats.resolution_sla_met) || 0) + (parseInt(stats.resolution_sla_missed) || 0);
  
  const responseComplianceRate = responseTotal > 0 
    ? (parseInt(stats.response_sla_met) || 0) / responseTotal 
    : 1;
  const resolutionComplianceRate = resolutionTotal > 0 
    ? (parseInt(stats.resolution_sla_met) || 0) / resolutionTotal 
    : 1;

  // Calculate rework rate
  const reworkRate = parseInt(reworkStats.total) > 0
    ? parseInt(reworkStats.reworks) / parseInt(reworkStats.total)
    : 0;

  // Calculate overall score (weighted average)
  const scoreBreakdown = {
    slaCompliance: ((responseComplianceRate + resolutionComplianceRate) / 2) * 100,
    responseTime: Math.max(0, 100 - (parseFloat(stats.avg_response_hours) || 0) * 2),
    quality: (1 - reworkRate) * 100,
    customerSatisfaction: ((parseFloat(satisfaction.avg_rating) || 4) / 5) * 100,
  };

  const overallScore = (
    scoreBreakdown.slaCompliance * 0.35 +
    scoreBreakdown.responseTime * 0.2 +
    scoreBreakdown.quality * 0.25 +
    scoreBreakdown.customerSatisfaction * 0.2
  );

  return {
    vendorId,
    vendorName: vendor.company_name,
    category: vendor.category,
    period: { start: startDate, end: endDate },
    
    totalWorkOrders: parseInt(stats.total) || 0,
    completedWorkOrders: parseInt(stats.completed) || 0,
    inProgressWorkOrders: parseInt(stats.in_progress) || 0,
    
    responseSlaMet: parseInt(stats.response_sla_met) || 0,
    responseSlaMissed: parseInt(stats.response_sla_missed) || 0,
    responseComplianceRate,
    resolutionSlaMet: parseInt(stats.resolution_sla_met) || 0,
    resolutionSlaMissed: parseInt(stats.resolution_sla_missed) || 0,
    resolutionComplianceRate,
    
    avgResponseTimeHours: parseFloat(stats.avg_response_hours) || 0,
    avgResolutionTimeHours: parseFloat(stats.avg_resolution_hours) || 0,
    medianResolutionTimeHours: parseFloat(stats.median_resolution_hours) || 0,
    
    reworkRate,
    customerSatisfactionAvg: parseFloat(satisfaction.avg_rating) || 0,
    customerSatisfactionCount: parseInt(satisfaction.rating_count) || 0,
    
    totalBilled: parseFloat(stats.total_billed) || 0,
    totalPenalties: parseFloat(financials.total_penalties) || 0,
    totalBonuses: parseFloat(financials.total_bonuses) || 0,
    netPayable: (parseFloat(stats.total_billed) || 0) - (parseFloat(financials.total_penalties) || 0),
    
    overallScore,
    scoreBreakdown,
  };
}

export async function getVendorLeaderboard(
  organizationId: string,
  category?: string
): Promise<VendorPerformanceMetrics[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3); // Last 3 months

  const vendorsResult = await pool.query(`
    SELECT id FROM pm_vendors
    WHERE organization_id = $1
      AND status = 'active'
      ${category ? 'AND category = $2' : ''}
    ORDER BY average_rating DESC NULLS LAST
    LIMIT 20
  `, category ? [organizationId, category] : [organizationId]);

  const metrics: VendorPerformanceMetrics[] = [];

  for (const vendor of vendorsResult.rows) {
    try {
      const vendorMetrics = await getVendorPerformanceMetrics(
        vendor.id,
        startDate,
        endDate
      );
      metrics.push(vendorMetrics);
    } catch (error) {
      logger.error('Error getting vendor metrics', { vendorId: vendor.id, error });
    }
  }

  // Sort by overall score
  return metrics.sort((a, b) => b.overallScore - a.overallScore);
}

// ============================================================================
// SCHEDULED SLA CHECKS
// ============================================================================

export async function runSLAMonitoringCheck(organizationId: string): Promise<{
  checked: number;
  warnings: number;
  breaches: number;
  alerts: SLAAlert[];
}> {
  const alerts: SLAAlert[] = [];
  let checked = 0;
  let warnings = 0;
  let breaches = 0;

  // Get all active work orders
  const result = await pool.query(`
    SELECT wo.id
    FROM pm_work_orders wo
    JOIN pm_vendors v ON wo.vendor_id = v.id
    WHERE v.organization_id = $1
      AND wo.status IN ('assigned', 'in_progress')
  `, [organizationId]);

  for (const row of result.rows) {
    checked++;
    const woAlerts = await checkWorkOrderSLA(row.id);
    
    for (const alert of woAlerts) {
      alerts.push(alert);
      
      if (alert.type === 'breach') {
        breaches++;
        // Record the breach
        await recordSLABreach(row.id, 
          alert.message.includes('Response') ? 'response' : 'resolution'
        );
      } else {
        warnings++;
      }
    }
  }

  logger.info('SLA monitoring check completed', { 
    organizationId, 
    checked, 
    warnings, 
    breaches 
  });

  return { checked, warnings, breaches, alerts };
}

// ============================================================================
// HELPERS
// ============================================================================

function mapSLARow(row: any): VendorSLA {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    category: row.category,
    priority: row.priority,
    responseTimeHours: parseFloat(row.response_time_hours),
    resolutionTimeHours: parseFloat(row.resolution_time_hours),
    penaltyPercentage: parseFloat(row.penalty_percentage),
    bonusPercentage: parseFloat(row.bonus_percentage),
    effectiveFrom: new Date(row.effective_from),
    effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
    isActive: row.is_active,
  };
}

function mapBreachRow(row: any): SLABreach {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    vendorId: row.vendor_id,
    slaId: row.sla_id,
    breachType: row.breach_type,
    expectedTime: new Date(row.expected_time),
    actualTime: row.actual_time ? new Date(row.actual_time) : null,
    delayHours: parseFloat(row.delay_hours),
    penaltyAmount: parseFloat(row.penalty_amount),
    status: row.status,
    notes: row.notes,
    createdAt: new Date(row.created_at),
  };
}

export default {
  createVendorSLA,
  getVendorSLA,
  updateVendorSLA,
  checkWorkOrderSLA,
  recordSLABreach,
  getVendorPerformanceMetrics,
  getVendorLeaderboard,
  runSLAMonitoringCheck,
};
