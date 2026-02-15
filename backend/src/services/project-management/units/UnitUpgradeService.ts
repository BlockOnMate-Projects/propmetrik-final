/**
 * Unit Upgrade Service
 * Phase 3.12 - Split from unitService
 * 
 * Handles Buildertrend-style upgrade/selection management:
 * - Add upgrades to units
 * - Remove upgrades
 * - Get upgrade categories
 * - Price recalculation
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { v4 as uuidv4 } from 'uuid';
import {
  ProjectUnit,
  UnitUpgrade,
  UpgradeCategory,
  mapRowToUnit,
  mapUpgradesToDb
} from './types';

class UnitUpgradeService extends BaseService {
  constructor() {
    super('UnitUpgradeService');
  }

  // --------------------------------------------------------------------------
  // UPGRADE MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Add an upgrade to a unit
   */
  async addUpgrade(
    unitId: string, 
    upgrade: Omit<UnitUpgrade, 'id' | 'selectedAt'>
  ): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(unitId);
    if (!unit) {
      this.log('error', `Unit ${unitId} not found for upgrade`);
      return null;
    }
    
    const newUpgrade: UnitUpgrade = {
      id: uuidv4(),
      ...upgrade,
      selectedAt: new Date().toISOString()
    };
    
    const upgrades = [...unit.selectedUpgrades, newUpgrade];
    const totalUpgradeCost = upgrades.reduce((sum, u) => sum + u.price, 0);
    
    const result = await pool.query(
      `UPDATE project_units 
       SET selected_upgrades = $1,
           finishing_upgrade_cost = $2,
           list_price = COALESCE(base_price, list_price) + $2 + parking_cost + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [mapUpgradesToDb(upgrades), totalUpgradeCost, unitId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    this.log('info', `Added upgrade "${upgrade.item}" to unit ${unit.unitNumber}`);
    
    return mapRowToUnit(result.rows[0]);
  }

  /**
   * Add multiple upgrades at once
   */
  async addUpgrades(
    unitId: string,
    upgrades: Array<Omit<UnitUpgrade, 'id' | 'selectedAt'>>
  ): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(unitId);
    if (!unit) {
      return null;
    }
    
    const newUpgrades: UnitUpgrade[] = upgrades.map(u => ({
      id: uuidv4(),
      ...u,
      selectedAt: new Date().toISOString()
    }));
    
    const allUpgrades = [...unit.selectedUpgrades, ...newUpgrades];
    const totalUpgradeCost = allUpgrades.reduce((sum, u) => sum + u.price, 0);
    
    const result = await pool.query(
      `UPDATE project_units 
       SET selected_upgrades = $1,
           finishing_upgrade_cost = $2,
           list_price = COALESCE(base_price, list_price) + $2 + parking_cost + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [mapUpgradesToDb(allUpgrades), totalUpgradeCost, unitId]
    );
    
    this.log('info', `Added ${newUpgrades.length} upgrades to unit ${unit.unitNumber}`);
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  /**
   * Remove an upgrade from a unit
   */
  async removeUpgrade(unitId: string, upgradeId: string): Promise<ProjectUnit | null> {
    const unit = await this.getUnitById(unitId);
    if (!unit) {
      return null;
    }
    
    const removedUpgrade = unit.selectedUpgrades.find(u => u.id === upgradeId);
    const upgrades = unit.selectedUpgrades.filter(u => u.id !== upgradeId);
    const totalUpgradeCost = upgrades.reduce((sum, u) => sum + u.price, 0);
    
    const result = await pool.query(
      `UPDATE project_units 
       SET selected_upgrades = $1,
           finishing_upgrade_cost = $2,
           list_price = COALESCE(base_price, list_price) + $2 + parking_cost + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [mapUpgradesToDb(upgrades), totalUpgradeCost, unitId]
    );
    
    if (removedUpgrade) {
      this.log('info', `Removed upgrade "${removedUpgrade.item}" from unit ${unit.unitNumber}`);
    }
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  /**
   * Clear all upgrades from a unit
   */
  async clearUpgrades(unitId: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units 
       SET selected_upgrades = '[]',
           finishing_upgrade_cost = 0,
           list_price = COALESCE(base_price, list_price) + parking_cost + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [unitId]
    );
    
    if (result.rows.length > 0) {
      this.log('info', `Cleared all upgrades from unit ${unitId}`);
      return mapRowToUnit(result.rows[0]);
    }
    
    return null;
  }

  /**
   * Get upgrades for a unit
   */
  async getUpgrades(unitId: string): Promise<UnitUpgrade[]> {
    const unit = await this.getUnitById(unitId);
    return unit?.selectedUpgrades || [];
  }

  /**
   * Get total upgrade cost for a unit
   */
  async getTotalUpgradeCost(unitId: string): Promise<number> {
    const unit = await this.getUnitById(unitId);
    return unit?.finishingUpgradeCost || 0;
  }

  // --------------------------------------------------------------------------
  // UPGRADE CATEGORIES
  // --------------------------------------------------------------------------

  /**
   * Get standard upgrade categories for Ghana real estate
   */
  getUpgradeCategories(): UpgradeCategory[] {
    return [
      {
        category: 'Kitchen',
        items: [
          { name: 'Granite Countertops', price: 5000, description: 'Premium granite worktops' },
          { name: 'Premium Cabinets', price: 8000, description: 'Solid wood cabinetry' },
          { name: 'Island Upgrade', price: 12000, description: 'Kitchen island with seating' },
          { name: 'Built-in Appliances Package', price: 15000, description: 'Full appliance suite' }
        ]
      },
      {
        category: 'Flooring',
        items: [
          { name: 'Porcelain Tiles (Premium)', price: 3000, description: 'High-grade porcelain' },
          { name: 'Hardwood Flooring', price: 10000, description: 'Engineered hardwood' },
          { name: 'Marble Flooring', price: 20000, description: 'Natural marble' }
        ]
      },
      {
        category: 'Bathroom',
        items: [
          { name: 'Rain Shower System', price: 2500, description: 'Overhead rain shower' },
          { name: 'Jacuzzi Tub', price: 8000, description: 'Whirlpool bath' },
          { name: 'Premium Fixtures Package', price: 5000, description: 'Designer fixtures' }
        ]
      },
      {
        category: 'Electrical',
        items: [
          { name: 'Smart Home Package', price: 15000, description: 'Full home automation' },
          { name: 'Solar Panel System', price: 25000, description: '5kW solar installation' },
          { name: 'Backup Generator Connection', price: 5000, description: 'Generator ready' },
          { name: 'EV Charging Point', price: 3000, description: 'Electric vehicle charger' }
        ]
      },
      {
        category: 'Security',
        items: [
          { name: 'CCTV Package', price: 5000, description: '8-camera system' },
          { name: 'Smart Lock System', price: 3000, description: 'Biometric locks' },
          { name: 'Alarm System', price: 4000, description: 'Full security alarm' }
        ]
      },
      {
        category: 'Outdoor',
        items: [
          { name: 'Balcony Enclosure', price: 8000, description: 'Glass enclosure' },
          { name: 'Private Garden Setup', price: 5000, description: 'Landscaped garden' },
          { name: 'BBQ Area', price: 6000, description: 'Built-in BBQ station' }
        ]
      },
      {
        category: 'Air Conditioning',
        items: [
          { name: 'Split AC Units (per room)', price: 2500, description: 'Inverter AC' },
          { name: 'Central AC System', price: 30000, description: 'Ducted central air' },
          { name: 'Ceiling Fans Package', price: 1500, description: 'Designer ceiling fans' }
        ]
      },
      {
        category: 'Water',
        items: [
          { name: 'Water Heater Upgrade', price: 2000, description: 'Instant water heater' },
          { name: 'Water Filtration System', price: 3000, description: 'Whole-house filter' },
          { name: 'Water Storage Tank', price: 4000, description: 'Elevated poly tank' }
        ]
      }
    ];
  }

  /**
   * Get upgrades by category
   */
  getUpgradesByCategory(category: string): UpgradeCategory | null {
    const categories = this.getUpgradeCategories();
    return categories.find(c => c.category.toLowerCase() === category.toLowerCase()) || null;
  }

  /**
   * Search upgrades across categories
   */
  searchUpgrades(query: string): UpgradeCategory[] {
    const categories = this.getUpgradeCategories();
    const searchLower = query.toLowerCase();
    
    return categories
      .map(cat => ({
        category: cat.category,
        items: cat.items.filter(item => 
          item.name.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower))
        )
      }))
      .filter(cat => cat.items.length > 0);
  }

  // --------------------------------------------------------------------------
  // PRICE CALCULATIONS
  // --------------------------------------------------------------------------

  /**
   * Recalculate list price based on base + upgrades + extras
   */
  async recalculatePrice(unitId: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units 
       SET list_price = COALESCE(base_price, list_price) + finishing_upgrade_cost + parking_cost + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [unitId]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  /**
   * Update parking cost and recalculate price
   */
  async updateParkingCost(unitId: string, cost: number): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units 
       SET parking_cost = $2,
           list_price = COALESCE(base_price, list_price) + finishing_upgrade_cost + $2 + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [unitId, cost]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  /**
   * Update storage cost and recalculate price
   */
  async updateStorageCost(unitId: string, cost: number): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units 
       SET storage_cost = $2,
           list_price = COALESCE(base_price, list_price) + finishing_upgrade_cost + parking_cost + $2 + other_costs,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [unitId, cost]
    );
    
    return result.rows.length > 0 ? mapRowToUnit(result.rows[0]) : null;
  }

  /**
   * Update other costs and recalculate price
   */
  async updateOtherCosts(unitId: string, cost: number): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units 
       SET other_costs = $2,
           list_price = COALESCE(base_price, list_price) + finishing_upgrade_cost + parking_cost + storage_cost + $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [unitId, cost]
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

export const unitUpgradeService = new UnitUpgradeService();
