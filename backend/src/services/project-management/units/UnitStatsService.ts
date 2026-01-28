/**
 * Unit Stats Service
 * Phase 3.12 - Split from unitService
 * 
 * Handles unit statistics and payment tracking:
 * - Project unit statistics
 * - Sales performance metrics
 * - Payment recording
 * - Financial summaries
 */

import { pool } from '../../../database';
import { BaseService } from '../BaseService';
import { eventBus } from '../events';
import {
  ProjectUnit,
  UnitStats,
  UnitStatus,
  mapRowToUnit
} from './types';

class UnitStatsService extends BaseService {
  constructor() {
    super('UnitStatsService');
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  /**
   * Get comprehensive unit statistics for a project
   */
  async getStats(projectId: string): Promise<UnitStats> {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_units,
        COUNT(*) FILTER (WHERE status = 'available') as available,
        COUNT(*) FILTER (WHERE status = 'reserved') as reserved,
        COUNT(*) FILTER (WHERE status = 'under_contract') as under_contract,
        COUNT(*) FILTER (WHERE status = 'sold') as sold,
        COUNT(*) FILTER (WHERE status = 'handed_over') as handed_over,
        COUNT(*) FILTER (WHERE status = 'rented') as rented,
        COUNT(*) FILTER (WHERE status = 'not_for_sale') as not_for_sale,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold,
        COALESCE(SUM(list_price), 0) as total_list_value,
        COALESCE(SUM(sale_price) FILTER (WHERE status IN ('sold', 'handed_over')), 0) as total_sold_value,
        COALESCE(SUM(total_paid), 0) as total_collected,
        COALESCE(AVG(price_per_sqm) FILTER (WHERE price_per_sqm > 0), 0) as avg_price_per_sqm
       FROM project_units 
       WHERE project_id = $1`,
      [projectId]
    );
    
    const row = result.rows[0];
    
    // Get by type
    const typeResult = await pool.query(
      `SELECT unit_type, COUNT(*) as count FROM project_units WHERE project_id = $1 GROUP BY unit_type`,
      [projectId]
    );
    const byType: Record<string, number> = {};
    typeResult.rows.forEach(r => {
      byType[r.unit_type] = parseInt(r.count, 10);
    });
    
    // Get by building
    const buildingResult = await pool.query(
      `SELECT building, COUNT(*) as count FROM project_units WHERE project_id = $1 AND building IS NOT NULL GROUP BY building`,
      [projectId]
    );
    const byBuilding: Record<string, number> = {};
    buildingResult.rows.forEach(r => {
      byBuilding[r.building] = parseInt(r.count, 10);
    });
    
    return {
      totalUnits: parseInt(row.total_units, 10),
      byStatus: {
        available: parseInt(row.available, 10),
        reserved: parseInt(row.reserved, 10),
        under_contract: parseInt(row.under_contract, 10),
        sold: parseInt(row.sold, 10),
        handed_over: parseInt(row.handed_over, 10),
        rented: parseInt(row.rented, 10),
        not_for_sale: parseInt(row.not_for_sale, 10),
        on_hold: parseInt(row.on_hold, 10)
      },
      byType,
      byBuilding,
      totalListValue: parseFloat(row.total_list_value),
      totalSoldValue: parseFloat(row.total_sold_value),
      totalCollected: parseFloat(row.total_collected),
      avgPricePerSqm: parseFloat(row.avg_price_per_sqm)
    };
  }

  /**
   * Get unit count by status for a project
   */
  async getCountsByStatus(projectId: string): Promise<Record<UnitStatus, number>> {
    const result = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM project_units 
       WHERE project_id = $1 
       GROUP BY status`,
      [projectId]
    );
    
    const counts: Record<UnitStatus, number> = {
      available: 0,
      reserved: 0,
      under_contract: 0,
      sold: 0,
      handed_over: 0,
      rented: 0,
      not_for_sale: 0,
      on_hold: 0
    };
    
    result.rows.forEach(r => {
      counts[r.status as UnitStatus] = parseInt(r.count, 10);
    });
    
    return counts;
  }

  /**
   * Get sales velocity (units sold per month)
   */
  async getSalesVelocity(projectId: string, months: number = 12): Promise<{ month: string; count: number; value: number }[]> {
    const result = await pool.query(
      `SELECT 
        TO_CHAR(contract_date, 'YYYY-MM') as month,
        COUNT(*) as count,
        COALESCE(SUM(sale_price), 0) as value
       FROM project_units
       WHERE project_id = $1 
         AND status IN ('sold', 'handed_over', 'under_contract')
         AND contract_date >= NOW() - INTERVAL '${months} months'
       GROUP BY TO_CHAR(contract_date, 'YYYY-MM')
       ORDER BY month`,
      [projectId]
    );
    
    return result.rows.map(r => ({
      month: r.month,
      count: parseInt(r.count, 10),
      value: parseFloat(r.value)
    }));
  }

  /**
   * Get top performing unit types
   */
  async getTopUnitTypes(projectId: string): Promise<{ unitType: string; sold: number; revenue: number }[]> {
    const result = await pool.query(
      `SELECT 
        unit_type,
        COUNT(*) FILTER (WHERE status IN ('sold', 'handed_over')) as sold,
        COALESCE(SUM(sale_price) FILTER (WHERE status IN ('sold', 'handed_over')), 0) as revenue
       FROM project_units
       WHERE project_id = $1
       GROUP BY unit_type
       ORDER BY revenue DESC`,
      [projectId]
    );
    
    return result.rows.map(r => ({
      unitType: r.unit_type,
      sold: parseInt(r.sold, 10),
      revenue: parseFloat(r.revenue)
    }));
  }

  /**
   * Get building performance
   */
  async getBuildingPerformance(projectId: string): Promise<{ building: string; total: number; sold: number; soldPercentage: number }[]> {
    const result = await pool.query(
      `SELECT 
        building,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('sold', 'handed_over', 'under_contract')) as sold
       FROM project_units
       WHERE project_id = $1 AND building IS NOT NULL
       GROUP BY building
       ORDER BY building`,
      [projectId]
    );
    
    return result.rows.map(r => {
      const total = parseInt(r.total, 10);
      const sold = parseInt(r.sold, 10);
      return {
        building: r.building,
        total,
        sold,
        soldPercentage: total > 0 ? (sold / total) * 100 : 0
      };
    });
  }

  /**
   * Get average days to sell
   */
  async getAverageDaysToSell(projectId: string): Promise<number> {
    const result = await pool.query(
      `SELECT AVG(EXTRACT(DAY FROM (contract_date - created_at))) as avg_days
       FROM project_units
       WHERE project_id = $1 
         AND contract_date IS NOT NULL
         AND status IN ('sold', 'handed_over', 'under_contract')`,
      [projectId]
    );
    
    return parseFloat(result.rows[0].avg_days) || 0;
  }

  // --------------------------------------------------------------------------
  // PAYMENT TRACKING
  // --------------------------------------------------------------------------

  /**
   * Record a payment for a unit
   */
  async recordPayment(unitId: string, amount: number, paymentRef?: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(unitId);
    if (!unit) {
      this.log('error', `Unit ${unitId} not found for payment`);
      return null;
    }
    
    const newTotalPaid = unit.totalPaid + amount;
    const salePrice = unit.salePrice || unit.listPrice || 0;
    const percentage = salePrice > 0 ? (newTotalPaid / salePrice) * 100 : 0;
    
    const result = await pool.query(
      `UPDATE project_units 
       SET total_paid = $1,
           payment_percentage = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newTotalPaid, Math.min(percentage, 100), unitId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const updatedUnit = mapRowToUnit(result.rows[0]);
    
    // Emit event
    eventBus.emit({
      type: 'unit.payment_received',
      payload: {
        unitId,
        projectId: updatedUnit.projectId,
        amount,
        totalPaid: newTotalPaid,
        paymentPercentage: updatedUnit.paymentPercentage,
        paymentRef
      },
      timestamp: new Date()
    });
    
    this.log('info', `Recorded payment of ${amount} for unit ${updatedUnit.unitNumber}`);
    
    return updatedUnit;
  }

  /**
   * Get payment summary for a project
   */
  async getPaymentSummary(projectId: string): Promise<{
    totalExpected: number;
    totalCollected: number;
    collectionRate: number;
    unitsWithOutstandingBalance: number;
  }> {
    const result = await pool.query(
      `SELECT 
        COALESCE(SUM(COALESCE(sale_price, list_price)), 0) as total_expected,
        COALESCE(SUM(total_paid), 0) as total_collected,
        COUNT(*) FILTER (WHERE total_paid < COALESCE(sale_price, list_price, 0) AND status IN ('sold', 'under_contract', 'handed_over')) as units_with_balance
       FROM project_units
       WHERE project_id = $1 AND status IN ('sold', 'under_contract', 'handed_over')`,
      [projectId]
    );
    
    const row = result.rows[0];
    const totalExpected = parseFloat(row.total_expected);
    const totalCollected = parseFloat(row.total_collected);
    
    return {
      totalExpected,
      totalCollected,
      collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
      unitsWithOutstandingBalance: parseInt(row.units_with_balance, 10)
    };
  }

  /**
   * Get units with outstanding balance
   */
  async getUnitsWithOutstandingBalance(projectId: string): Promise<ProjectUnit[]> {
    const result = await pool.query(
      `SELECT * FROM project_units
       WHERE project_id = $1 
         AND status IN ('sold', 'under_contract')
         AND total_paid < COALESCE(sale_price, list_price, 0)
       ORDER BY (COALESCE(sale_price, list_price, 0) - total_paid) DESC`,
      [projectId]
    );
    
    return result.rows.map(row => mapRowToUnit(row));
  }

  /**
   * Get recently sold units
   */
  async getRecentSales(projectId: string, limit: number = 10): Promise<ProjectUnit[]> {
    const result = await pool.query(
      `SELECT * FROM project_units
       WHERE project_id = $1 AND status IN ('sold', 'handed_over')
       ORDER BY contract_date DESC NULLS LAST
       LIMIT $2`,
      [projectId, limit]
    );
    
    return result.rows.map(row => mapRowToUnit(row));
  }

  /**
   * Get units pending handover
   */
  async getPendingHandovers(projectId: string): Promise<ProjectUnit[]> {
    const result = await pool.query(
      `SELECT * FROM project_units
       WHERE project_id = $1 AND status = 'sold'
       ORDER BY contract_date ASC`,
      [projectId]
    );
    
    return result.rows.map(row => mapRowToUnit(row));
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private async getUnitById(id: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      'SELECT * FROM project_units WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToUnit(result.rows[0]);
  }
}

export const unitStatsService = new UnitStatsService();
