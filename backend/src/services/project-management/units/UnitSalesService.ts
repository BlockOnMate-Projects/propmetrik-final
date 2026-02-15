/**
 * Unit Sales Service
 * Phase 3.12 - Split from unitService
 * 
 * Handles unit sales lifecycle operations:
 * - Reservation
 * - Contract signing
 * - Sale completion
 * - Handover
 * - Cancellation
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { eventBus } from '../events';
import {
  ProjectUnit,
  UnitStatus,
  ReserveUnitInput,
  ContractUnitInput,
  UNIT_STATUS_TRANSITIONS,
  mapRowToUnit
} from './types';

class UnitSalesService extends BaseService {
  constructor() {
    super('UnitSalesService');
  }

  // --------------------------------------------------------------------------
  // STATUS VALIDATION
  // --------------------------------------------------------------------------

  /**
   * Check if a status transition is valid
   */
  isValidTransition(currentStatus: UnitStatus, newStatus: UnitStatus): boolean {
    const allowed = UNIT_STATUS_TRANSITIONS[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  /**
   * Get allowed transitions from current status
   */
  getAllowedTransitions(currentStatus: UnitStatus): UnitStatus[] {
    return UNIT_STATUS_TRANSITIONS[currentStatus] || [];
  }

  // --------------------------------------------------------------------------
  // RESERVATION
  // --------------------------------------------------------------------------

  /**
   * Reserve a unit for a buyer
   */
  async reserve(id: string, input: ReserveUnitInput): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit) {
      this.log('error', `Unit ${id} not found for reservation`);
      return null;
    }
    
    if (unit.status !== 'available') {
      this.log('warn', `Cannot reserve unit ${id} - status is ${unit.status}, not available`);
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'reserved',
           buyer_id = $2,
           buyer_name = $3,
           buyer_phone = $4,
           buyer_email = $5,
           reserved_at = NOW(),
           reserved_by = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, input.buyerId, input.buyerName, input.buyerPhone, input.buyerEmail, input.reservedBy]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const updatedUnit = mapRowToUnit(result.rows[0]);
    
    // Emit event
    eventBus.emit('unit.reserved' as any, {
      unitId: id,
      projectId: updatedUnit.projectId,
      buyerName: input.buyerName,
      buyerPhone: input.buyerPhone
    });
    
    this.log('info', `Reserved unit ${updatedUnit.unitNumber} for ${input.buyerName}`);
    
    // Auto-create deal if enabled
    if (input.autoCreateDeal) {
      await this.createDealForUnit(updatedUnit);
    }
    
    return updatedUnit;
  }

  /**
   * Cancel a reservation and return unit to available
   */
  async cancelReservation(id: string, reason?: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || unit.status !== 'reserved') {
      this.log('warn', `Cannot cancel reservation for unit ${id} - not reserved`);
      return null;
    }
    
    const noteAddition = reason ? `Reservation cancelled: ${reason}` : 'Reservation cancelled';
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'available',
           buyer_id = NULL,
           buyer_name = NULL,
           buyer_phone = NULL,
           buyer_email = NULL,
           reserved_at = NULL,
           reserved_by = NULL,
           internal_notes = COALESCE(internal_notes || E'\n', '') || $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, noteAddition]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const updatedUnit = mapRowToUnit(result.rows[0]);
    
    // Emit event
    eventBus.emit('unit.reservation_cancelled' as any, {
      unitId: id,
      projectId: updatedUnit.projectId,
      reason
    });
    
    this.log('info', `Cancelled reservation for unit ${updatedUnit.unitNumber}`);
    
    return updatedUnit;
  }

  // --------------------------------------------------------------------------
  // CONTRACT
  // --------------------------------------------------------------------------

  /**
   * Move unit to under contract status
   */
  async moveToContract(id: string, input: ContractUnitInput): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || !['available', 'reserved'].includes(unit.status)) {
      this.log('warn', `Cannot move unit ${id} to contract - invalid status ${unit?.status}`);
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'under_contract',
           sale_price = $2,
           contract_date = $3,
           deal_id = COALESCE($4, deal_id),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, input.salePrice, input.contractDate, input.dealId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const updatedUnit = mapRowToUnit(result.rows[0]);
    
    // Emit event
    eventBus.emit('unit.under_contract' as any, {
      unitId: id,
      projectId: updatedUnit.projectId,
      salePrice: input.salePrice,
      contractDate: input.contractDate
    });
    
    this.log('info', `Unit ${updatedUnit.unitNumber} moved to under contract`);
    
    return updatedUnit;
  }

  // --------------------------------------------------------------------------
  // SALE COMPLETION
  // --------------------------------------------------------------------------

  /**
   * Mark unit as sold
   */
  async markAsSold(id: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || !['reserved', 'under_contract'].includes(unit.status)) {
      this.log('warn', `Cannot mark unit ${id} as sold - invalid status ${unit?.status}`);
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'sold',
           payment_percentage = 100,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const updatedUnit = mapRowToUnit(result.rows[0]);
    
    // Emit event
    eventBus.emit('unit.sold' as any, {
      unitId: id,
      projectId: updatedUnit.projectId,
      buyerName: updatedUnit.buyerName,
      salePrice: updatedUnit.salePrice
    });
    
    this.log('info', `Unit ${updatedUnit.unitNumber} marked as sold`);
    
    return updatedUnit;
  }

  // --------------------------------------------------------------------------
  // HANDOVER
  // --------------------------------------------------------------------------

  /**
   * Complete handover to buyer
   */
  async handover(id: string, handoverDate: Date): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || unit.status !== 'sold') {
      this.log('warn', `Cannot handover unit ${id} - not sold`);
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'handed_over',
           handover_date = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, handoverDate]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const updatedUnit = mapRowToUnit(result.rows[0]);
    
    // Emit event
    eventBus.emit('unit.handed_over' as any, {
      unitId: id,
      projectId: updatedUnit.projectId,
      buyerName: updatedUnit.buyerName,
      handoverDate
    });
    
    this.log('info', `Unit ${updatedUnit.unitNumber} handed over`);
    
    return updatedUnit;
  }

  // --------------------------------------------------------------------------
  // HOLD MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Put unit on hold
   */
  async putOnHold(id: string, reason?: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || !this.isValidTransition(unit.status, 'on_hold')) {
      this.log('warn', `Cannot put unit ${id} on hold from status ${unit?.status}`);
      return null;
    }
    
    const noteAddition = reason ? `Put on hold: ${reason}` : 'Put on hold';
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'on_hold',
           internal_notes = COALESCE(internal_notes || E'\n', '') || $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, noteAddition]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  /**
   * Release unit from hold back to available
   */
  async releaseFromHold(id: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || unit.status !== 'on_hold') {
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'available',
           internal_notes = COALESCE(internal_notes || E'\n', '') || 'Released from hold',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  // --------------------------------------------------------------------------
  // NOT FOR SALE
  // --------------------------------------------------------------------------

  /**
   * Mark unit as not for sale
   */
  async markNotForSale(id: string, reason?: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || !this.isValidTransition(unit.status, 'not_for_sale')) {
      return null;
    }
    
    const noteAddition = reason ? `Marked not for sale: ${reason}` : 'Marked not for sale';
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'not_for_sale',
           internal_notes = COALESCE(internal_notes || E'\n', '') || $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, noteAddition]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  /**
   * Return to available for sale
   */
  async returnToMarket(id: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(id);
    if (!unit || unit.status !== 'not_for_sale') {
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'available',
           internal_notes = COALESCE(internal_notes || E'\n', '') || 'Returned to market',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  // --------------------------------------------------------------------------
  // CRM INTEGRATION
  // --------------------------------------------------------------------------

  /**
   * Create CRM deal for unit
   */
  private async createDealForUnit(unit: ProjectUnit): Promise<string | null> {
    try {
      // Get project to check settings
      const projectResult = await pool.query(
        `SELECT auto_create_deals, default_pipeline_id, name 
         FROM development_projects WHERE id = $1`,
        [unit.projectId]
      );
      
      if (projectResult.rows.length === 0 || !projectResult.rows[0].auto_create_deals) {
        return null;
      }
      
      const project = projectResult.rows[0];
      
      // Create deal via CRM
      // This would typically call the deal service
      this.log('info', `Would create deal for unit ${unit.unitNumber} in project ${project.name}`);
      
      return null; // Return deal ID when implemented
    } catch (error) {
      this.log('error', `Error creating deal for unit: ${error}`);
      return null;
    }
  }

  /**
   * Link unit to CRM deal
   */
  async linkDeal(unitId: string, dealId: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units SET deal_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [unitId, dealId]
    );
    
    if (result.rows.length > 0) {
      this.log('info', `Linked unit ${unitId} to deal ${dealId}`);
      return mapRowToUnit(result.rows[0]);
    }
    
    return null;
  }

  /**
   * Unlink unit from CRM deal
   */
  async unlinkDeal(unitId: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units SET deal_id = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [unitId]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
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

export const unitSalesService = new UnitSalesService();
