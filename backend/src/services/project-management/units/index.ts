/**
 * Units Module - Barrel Export
 * Phase 3.12 - Split from unitService
 * 
 * Provides modular unit management with:
 * - UnitCrudService: Core CRUD operations
 * - UnitSalesService: Sales lifecycle management
 * - UnitUpgradeService: Buildertrend-style upgrades
 * - UnitStatsService: Statistics and payments
 */

// Types
export * from './types';

// Services
export { unitCrudService } from './UnitCrudService';
export { unitSalesService } from './UnitSalesService';
export { unitUpgradeService } from './UnitUpgradeService';
export { unitStatsService } from './UnitStatsService';

// Re-import for facade
import { unitCrudService } from './UnitCrudService';
import { unitSalesService } from './UnitSalesService';
import { unitUpgradeService } from './UnitUpgradeService';
import { unitStatsService } from './UnitStatsService';
import {
  ProjectUnit,
  CreateUnitInput,
  UpdateUnitInput,
  BulkCreateUnitInput,
  UnitFilters,
  PaginatedUnits,
  UnitAvailability,
  UnitStats,
  UnitStatus,
  ReserveUnitInput,
  ContractUnitInput,
  UnitUpgrade,
  UpgradeCategory
} from './types';

/**
 * Unified facade for all unit operations
 * Provides backward-compatible API
 */
class UnitsFacade {
  // ==========================================================================
  // CRUD OPERATIONS (delegated to UnitCrudService)
  // ==========================================================================

  /**
   * Create a single unit
   */
  async create(input: CreateUnitInput): Promise<ProjectUnit> {
    return unitCrudService.create(input);
  }

  /**
   * Create multiple units based on floor/unit ranges
   */
  async createBulk(input: BulkCreateUnitInput): Promise<ProjectUnit[]> {
    return unitCrudService.createBulk(input);
  }

  /**
   * Get unit by ID
   */
  async getById(id: string): Promise<ProjectUnit | null> {
    return unitCrudService.getById(id);
  }

  /**
   * Get all units for a project
   */
  async getByProject(projectId: string): Promise<ProjectUnit[]> {
    return unitCrudService.getByProject(projectId);
  }

  /**
   * Get units with filtering and pagination
   */
  async getAll(
    filters: UnitFilters,
    page?: number,
    limit?: number
  ): Promise<PaginatedUnits> {
    return unitCrudService.getAll(filters, page, limit);
  }

  /**
   * Get unit availability view
   */
  async getAvailability(projectId: string): Promise<UnitAvailability[]> {
    return unitCrudService.getAvailability(projectId);
  }

  /**
   * Update a unit
   */
  async update(id: string, input: UpdateUnitInput): Promise<ProjectUnit | null> {
    return unitCrudService.update(id, input);
  }

  /**
   * Delete a unit
   */
  async delete(id: string): Promise<boolean> {
    return unitCrudService.delete(id);
  }

  /**
   * Check if unit exists
   */
  async exists(id: string): Promise<boolean> {
    return unitCrudService.exists(id);
  }

  // ==========================================================================
  // SALES OPERATIONS (delegated to UnitSalesService)
  // ==========================================================================

  /**
   * Reserve a unit for a buyer
   */
  async reserve(id: string, input: ReserveUnitInput): Promise<ProjectUnit | null> {
    return unitSalesService.reserve(id, input);
  }

  /**
   * Cancel a reservation
   */
  async cancelReservation(id: string, reason?: string): Promise<ProjectUnit | null> {
    return unitSalesService.cancelReservation(id, reason);
  }

  /**
   * Move unit to under contract
   */
  async moveToContract(id: string, input: ContractUnitInput): Promise<ProjectUnit | null> {
    return unitSalesService.moveToContract(id, input);
  }

  /**
   * Mark unit as sold
   */
  async markAsSold(id: string): Promise<ProjectUnit | null> {
    return unitSalesService.markAsSold(id);
  }

  /**
   * Complete handover
   */
  async handover(id: string, handoverDate: Date): Promise<ProjectUnit | null> {
    return unitSalesService.handover(id, handoverDate);
  }

  /**
   * Put unit on hold
   */
  async putOnHold(id: string, reason?: string): Promise<ProjectUnit | null> {
    return unitSalesService.putOnHold(id, reason);
  }

  /**
   * Release from hold
   */
  async releaseFromHold(id: string): Promise<ProjectUnit | null> {
    return unitSalesService.releaseFromHold(id);
  }

  /**
   * Mark not for sale
   */
  async markNotForSale(id: string, reason?: string): Promise<ProjectUnit | null> {
    return unitSalesService.markNotForSale(id, reason);
  }

  /**
   * Return to market
   */
  async returnToMarket(id: string): Promise<ProjectUnit | null> {
    return unitSalesService.returnToMarket(id);
  }

  /**
   * Check if status transition is valid
   */
  isValidTransition(currentStatus: UnitStatus, newStatus: UnitStatus): boolean {
    return unitSalesService.isValidTransition(currentStatus, newStatus);
  }

  /**
   * Get allowed status transitions
   */
  getAllowedTransitions(currentStatus: UnitStatus): UnitStatus[] {
    return unitSalesService.getAllowedTransitions(currentStatus);
  }

  /**
   * Link unit to CRM deal
   */
  async linkDeal(unitId: string, dealId: string): Promise<ProjectUnit | null> {
    return unitSalesService.linkDeal(unitId, dealId);
  }

  // ==========================================================================
  // UPGRADE OPERATIONS (delegated to UnitUpgradeService)
  // ==========================================================================

  /**
   * Add an upgrade to a unit
   */
  async addUpgrade(
    unitId: string,
    upgrade: Omit<UnitUpgrade, 'id' | 'selectedAt'>
  ): Promise<ProjectUnit | null> {
    return unitUpgradeService.addUpgrade(unitId, upgrade);
  }

  /**
   * Remove an upgrade from a unit
   */
  async removeUpgrade(unitId: string, upgradeId: string): Promise<ProjectUnit | null> {
    return unitUpgradeService.removeUpgrade(unitId, upgradeId);
  }

  /**
   * Get upgrade categories
   */
  getUpgradeCategories(): UpgradeCategory[] {
    return unitUpgradeService.getUpgradeCategories();
  }

  /**
   * Get upgrades for a unit
   */
  async getUpgrades(unitId: string): Promise<UnitUpgrade[]> {
    return unitUpgradeService.getUpgrades(unitId);
  }

  /**
   * Clear all upgrades
   */
  async clearUpgrades(unitId: string): Promise<ProjectUnit | null> {
    return unitUpgradeService.clearUpgrades(unitId);
  }

  /**
   * Update parking cost
   */
  async updateParkingCost(unitId: string, cost: number): Promise<ProjectUnit | null> {
    return unitUpgradeService.updateParkingCost(unitId, cost);
  }

  /**
   * Update storage cost
   */
  async updateStorageCost(unitId: string, cost: number): Promise<ProjectUnit | null> {
    return unitUpgradeService.updateStorageCost(unitId, cost);
  }

  // ==========================================================================
  // STATISTICS & PAYMENTS (delegated to UnitStatsService)
  // ==========================================================================

  /**
   * Get unit statistics
   */
  async getStats(projectId: string): Promise<UnitStats> {
    return unitStatsService.getStats(projectId);
  }

  /**
   * Get counts by status
   */
  async getCountsByStatus(projectId: string): Promise<Record<UnitStatus, number>> {
    return unitStatsService.getCountsByStatus(projectId);
  }

  /**
   * Get sales velocity
   */
  async getSalesVelocity(projectId: string, months?: number) {
    return unitStatsService.getSalesVelocity(projectId, months);
  }

  /**
   * Get top performing unit types
   */
  async getTopUnitTypes(projectId: string) {
    return unitStatsService.getTopUnitTypes(projectId);
  }

  /**
   * Get building performance
   */
  async getBuildingPerformance(projectId: string) {
    return unitStatsService.getBuildingPerformance(projectId);
  }

  /**
   * Record a payment
   */
  async recordPayment(unitId: string, amount: number, paymentRef?: string): Promise<ProjectUnit | null> {
    return unitStatsService.recordPayment(unitId, amount, paymentRef);
  }

  /**
   * Get payment summary
   */
  async getPaymentSummary(projectId: string) {
    return unitStatsService.getPaymentSummary(projectId);
  }

  /**
   * Get units with outstanding balance
   */
  async getUnitsWithOutstandingBalance(projectId: string): Promise<ProjectUnit[]> {
    return unitStatsService.getUnitsWithOutstandingBalance(projectId);
  }

  /**
   * Get recent sales
   */
  async getRecentSales(projectId: string, limit?: number): Promise<ProjectUnit[]> {
    return unitStatsService.getRecentSales(projectId, limit);
  }

  /**
   * Get units pending handover
   */
  async getPendingHandovers(projectId: string): Promise<ProjectUnit[]> {
    return unitStatsService.getPendingHandovers(projectId);
  }
}

// Export singleton facade
export const unitsFacade = new UnitsFacade();

// Default export for backward compatibility patterns
export default unitsFacade;
