/**
 * Project Integration Service
 * Phase 5.8 Week 5 - Integration & Linking
 * 
 * Handles integration between:
 * - Development projects and deals (sales)
 * - Units and contacts (buyers)
 * - Projects and external systems
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// =====================================================
// TYPES
// =====================================================

export interface ProjectDealLink {
  id: string;
  project_id: string;
  deal_id: string;
  unit_id?: string;
  link_type: 'reservation' | 'sale' | 'lease' | 'custom';
  contact_id: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  deal_value: number;
  deal_status: string;
  linked_at: Date;
  linked_by?: string;
  notes?: string;
}

export interface UnitBuyerInfo {
  unit_id: string;
  unit_number: string;
  buyer_contact_id: string;
  buyer_name: string;
  buyer_email?: string;
  buyer_phone?: string;
  purchase_date?: Date;
  sale_price: number;
  payment_plan_id?: string;
  total_paid: number;
  balance_due: number;
  handover_date?: Date;
  status: string;
}

export interface ProjectExport {
  project: any;
  phases: any[];
  units: any[];
  costs: any[];
  draws: any[];
  contractors: any[];
}

export interface ProjectToPortfolioInput {
  project_id: string;
  portfolio_id: string;
  include_units: boolean;
  as_status: 'active' | 'proposed';
  created_by?: string;
}

// =====================================================
// PROJECT INTEGRATION SERVICE CLASS
// =====================================================

class ProjectIntegrationService {
  private static instance: ProjectIntegrationService;

  private constructor() {}

  public static getInstance(): ProjectIntegrationService {
    if (!ProjectIntegrationService.instance) {
      ProjectIntegrationService.instance = new ProjectIntegrationService();
    }
    return ProjectIntegrationService.instance;
  }

  // =====================================================
  // PROJECT-DEAL LINKING
  // =====================================================

  /**
   * Link a unit sale to a deal
   */
  async linkUnitToDeal(
    unitId: string,
    dealId: string,
    linkType: 'reservation' | 'sale' | 'lease' = 'sale',
    linkedBy?: string
  ): Promise<ProjectDealLink> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get unit info
      const unitResult = await client.query(`
        SELECT pu.*, dp.id as project_id
        FROM project_units pu
        JOIN development_projects dp ON pu.project_id = dp.id
        WHERE pu.id = $1
      `, [unitId]);
      
      if (unitResult.rows.length === 0) {
        throw new Error('Unit not found');
      }
      
      const unit = unitResult.rows[0];
      
      // Get deal info
      const dealResult = await client.query(`
        SELECT d.*, c.full_name, c.email, c.phone, c.id as contact_id
        FROM deals d
        LEFT JOIN contacts c ON d.contact_id = c.id
        WHERE d.id = $1
      `, [dealId]);
      
      if (dealResult.rows.length === 0) {
        throw new Error('Deal not found');
      }
      
      const deal = dealResult.rows[0];
      
      // Create link
      const linkResult = await client.query(`
        INSERT INTO project_deal_links (
          project_id, deal_id, unit_id, link_type,
          contact_id, deal_value, deal_status, linked_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        unit.project_id,
        dealId,
        unitId,
        linkType,
        deal.contact_id,
        deal.deal_value,
        deal.stage,
        linkedBy
      ]);
      
      // Update unit with buyer info
      await client.query(`
        UPDATE project_units
        SET reserved_by_contact_id = $2,
            reservation_date = CASE WHEN $3 = 'reservation' THEN NOW() ELSE reservation_date END,
            contract_date = CASE WHEN $3 = 'sale' THEN NOW() ELSE contract_date END,
            sale_price = $4,
            status = CASE 
              WHEN $3 = 'reservation' THEN 'reserved'
              WHEN $3 = 'sale' THEN 'under_contract'
              ELSE status
            END,
            updated_at = NOW()
        WHERE id = $1
      `, [unitId, deal.contact_id, linkType, deal.deal_value]);
      
      await client.query('COMMIT');
      
      logger.info({ unitId, dealId, linkType }, 'Unit linked to deal');
      
      return {
        id: linkResult.rows[0].id,
        project_id: unit.project_id,
        deal_id: dealId,
        unit_id: unitId,
        link_type: linkType,
        contact_id: deal.contact_id,
        contact_name: deal.full_name,
        contact_email: deal.email,
        contact_phone: deal.phone,
        deal_value: parseFloat(deal.deal_value) || 0,
        deal_status: deal.stage,
        linked_at: linkResult.rows[0].linked_at,
        linked_by: linkedBy,
        notes: linkResult.rows[0].notes,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error, unitId, dealId }, 'Failed to link unit to deal');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all deal links for a project
   */
  async getProjectDeals(projectId: string): Promise<ProjectDealLink[]> {
    const result = await pool.query(`
      SELECT pdl.*,
             c.full_name as contact_name,
             c.email as contact_email,
             c.phone as contact_phone
      FROM project_deal_links pdl
      LEFT JOIN contacts c ON pdl.contact_id = c.id
      WHERE pdl.project_id = $1
      ORDER BY pdl.linked_at DESC
    `, [projectId]);
    
    return result.rows.map(row => ({
      id: row.id,
      project_id: row.project_id,
      deal_id: row.deal_id,
      unit_id: row.unit_id,
      link_type: row.link_type,
      contact_id: row.contact_id,
      contact_name: row.contact_name,
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
      deal_value: parseFloat(row.deal_value) || 0,
      deal_status: row.deal_status,
      linked_at: row.linked_at,
      linked_by: row.linked_by,
      notes: row.notes,
    }));
  }

  /**
   * Unlink a deal from a project
   */
  async unlinkDeal(linkId: string): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get link info
      const linkResult = await client.query(`
        SELECT * FROM project_deal_links WHERE id = $1
      `, [linkId]);
      
      if (linkResult.rows.length === 0) {
        return false;
      }
      
      const link = linkResult.rows[0];
      
      // Remove link
      await client.query(`DELETE FROM project_deal_links WHERE id = $1`, [linkId]);
      
      // Reset unit status if applicable
      if (link.unit_id) {
        await client.query(`
          UPDATE project_units
          SET status = 'available',
              reserved_by_contact_id = NULL,
              reservation_date = NULL,
              contract_date = NULL,
              updated_at = NOW()
          WHERE id = $1
        `, [link.unit_id]);
      }
      
      await client.query('COMMIT');
      
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // UNIT BUYER MANAGEMENT
  // =====================================================

  /**
   * Get buyer info for all sold/reserved units in a project
   */
  async getProjectBuyers(projectId: string): Promise<UnitBuyerInfo[]> {
    const result = await pool.query(`
      SELECT 
        pu.id as unit_id,
        pu.unit_number,
        pu.reserved_by_contact_id as buyer_contact_id,
        c.full_name as buyer_name,
        c.email as buyer_email,
        c.phone as buyer_phone,
        pu.contract_date as purchase_date,
        pu.sale_price,
        bpp.id as payment_plan_id,
        COALESCE(pu.total_paid, 0) as total_paid,
        COALESCE(pu.balance_due, 0) as balance_due,
        pu.handover_date,
        pu.status
      FROM project_units pu
      LEFT JOIN contacts c ON pu.reserved_by_contact_id = c.id
      LEFT JOIN buyer_payment_plans bpp ON bpp.unit_id = pu.id AND bpp.is_active = true
      WHERE pu.project_id = $1 
        AND pu.status IN ('reserved', 'under_contract', 'sold')
      ORDER BY pu.unit_number
    `, [projectId]);
    
    return result.rows.map(row => ({
      unit_id: row.unit_id,
      unit_number: row.unit_number,
      buyer_contact_id: row.buyer_contact_id,
      buyer_name: row.buyer_name || 'Unknown',
      buyer_email: row.buyer_email,
      buyer_phone: row.buyer_phone,
      purchase_date: row.purchase_date,
      sale_price: parseFloat(row.sale_price) || 0,
      payment_plan_id: row.payment_plan_id,
      total_paid: parseFloat(row.total_paid) || 0,
      balance_due: parseFloat(row.balance_due) || 0,
      handover_date: row.handover_date,
      status: row.status,
    }));
  }

  /**
   * Assign buyer to unit
   */
  async assignBuyerToUnit(
    unitId: string,
    contactId: string,
    salePrice: number,
    status: 'reserved' | 'under_contract' | 'sold' = 'reserved'
  ): Promise<void> {
    const now = new Date();
    
    await pool.query(`
      UPDATE project_units
      SET reserved_by_contact_id = $2,
          sale_price = $3,
          status = $4,
          reservation_date = CASE WHEN $4 = 'reserved' THEN $5 ELSE reservation_date END,
          contract_date = CASE WHEN $4 IN ('under_contract', 'sold') THEN $5 ELSE contract_date END,
          balance_due = $3,
          updated_at = NOW()
      WHERE id = $1
    `, [unitId, contactId, salePrice, status, now]);
    
    logger.info({ unitId, contactId, status }, 'Buyer assigned to unit');
  }

  /**
   * Record handover
   */
  async recordHandover(
    unitId: string,
    handoverDate: Date = new Date(),
    notes?: string
  ): Promise<void> {
    await pool.query(`
      UPDATE project_units
      SET status = 'sold',
          handover_date = $2,
          notes = COALESCE(notes || E'\n', '') || 'Handover: ' || COALESCE($3, ''),
          updated_at = NOW()
      WHERE id = $1
    `, [unitId, handoverDate, notes]);
    
    logger.info({ unitId, handoverDate }, 'Unit handover recorded');
  }

  // =====================================================
  // PROJECT EXPORT/IMPORT
  // =====================================================

  /**
   * Export full project data
   */
  async exportProject(projectId: string): Promise<ProjectExport> {
    // Get project
    const projectResult = await pool.query(`
      SELECT * FROM development_projects WHERE id = $1
    `, [projectId]);
    
    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }
    
    // Get phases
    const phasesResult = await pool.query(`
      SELECT * FROM project_phases WHERE project_id = $1 ORDER BY sort_order
    `, [projectId]);
    
    // Get units
    const unitsResult = await pool.query(`
      SELECT * FROM project_units WHERE project_id = $1 ORDER BY unit_number
    `, [projectId]);
    
    // Get costs
    const costsResult = await pool.query(`
      SELECT * FROM project_costs WHERE project_id = $1 ORDER BY created_at
    `, [projectId]);
    
    // Get draws
    const drawsResult = await pool.query(`
      SELECT * FROM draw_requests WHERE project_id = $1 ORDER BY draw_number
    `, [projectId]);
    
    // Get contractor assignments
    const contractorsResult = await pool.query(`
      SELECT ca.*, c.business_name
      FROM contractor_assignments ca
      JOIN contractors c ON ca.contractor_id = c.id
      WHERE ca.project_id = $1
    `, [projectId]);
    
    return {
      project: projectResult.rows[0],
      phases: phasesResult.rows,
      units: unitsResult.rows,
      costs: costsResult.rows,
      draws: drawsResult.rows,
      contractors: contractorsResult.rows,
    };
  }

  /**
   * Generate project report data
   */
  async getProjectReport(projectId: string): Promise<{
    project: any;
    summary: {
      total_units: number;
      sold_units: number;
      available_units: number;
      total_revenue: number;
      total_cost: number;
      gross_margin: number;
      percent_complete: number;
    };
    sales: {
      by_month: { month: string; units: number; value: number }[];
      by_type: { type: string; count: number }[];
    };
    budget: {
      by_category: { category: string; budget: number; actual: number }[];
    };
  }> {
    // Get project
    const projectResult = await pool.query(`
      SELECT * FROM development_projects WHERE id = $1
    `, [projectId]);
    
    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }
    
    const project = projectResult.rows[0];
    
    // Get unit summary
    const unitSummary = await pool.query(`
      SELECT 
        COUNT(*) as total_units,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_units,
        COUNT(CASE WHEN status = 'available' THEN 1 END) as available_units,
        COALESCE(SUM(CASE WHEN status IN ('sold', 'under_contract') THEN sale_price ELSE 0 END), 0) as total_revenue
      FROM project_units
      WHERE project_id = $1
    `, [projectId]);
    
    // Get cost summary
    const costSummary = await pool.query(`
      SELECT COALESCE(SUM(actual_costs), 0) as total_cost
      FROM project_costs
      WHERE project_id = $1
    `, [projectId]);
    
    const totalRevenue = parseFloat(unitSummary.rows[0].total_revenue) || 0;
    const totalCost = parseFloat(costSummary.rows[0].total_cost) || 0;
    
    // Sales by month
    const salesByMonth = await pool.query(`
      SELECT 
        TO_CHAR(contract_date, 'YYYY-MM') as month,
        COUNT(*) as units,
        COALESCE(SUM(sale_price), 0) as value
      FROM project_units
      WHERE project_id = $1 
        AND status IN ('sold', 'under_contract')
        AND contract_date IS NOT NULL
      GROUP BY TO_CHAR(contract_date, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `, [projectId]);
    
    // Sales by unit type
    const salesByType = await pool.query(`
      SELECT 
        unit_type as type,
        COUNT(*) as count
      FROM project_units
      WHERE project_id = $1 AND status IN ('sold', 'under_contract')
      GROUP BY unit_type
    `, [projectId]);
    
    // Budget by category
    const budgetByCategory = await pool.query(`
      SELECT 
        category,
        COALESCE(SUM(original_budget), 0) as budget,
        COALESCE(SUM(actual_costs), 0) as actual
      FROM project_costs
      WHERE project_id = $1
      GROUP BY category
    `, [projectId]);
    
    return {
      project,
      summary: {
        total_units: parseInt(unitSummary.rows[0].total_units) || 0,
        sold_units: parseInt(unitSummary.rows[0].sold_units) || 0,
        available_units: parseInt(unitSummary.rows[0].available_units) || 0,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        gross_margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
        percent_complete: parseFloat(project.overall_progress) || 0,
      },
      sales: {
        by_month: salesByMonth.rows.map(row => ({
          month: row.month,
          units: parseInt(row.units),
          value: parseFloat(row.value),
        })),
        by_type: salesByType.rows.map(row => ({
          type: row.type || 'Unknown',
          count: parseInt(row.count),
        })),
      },
      budget: {
        by_category: budgetByCategory.rows.map(row => ({
          category: row.category,
          budget: parseFloat(row.budget),
          actual: parseFloat(row.actual),
        })),
      },
    };
  }

  // =====================================================
  // PORTFOLIO INTEGRATION
  // =====================================================

  /**
   * Add completed project units to a portfolio
   */
  async addProjectToPortfolio(input: ProjectToPortfolioInput): Promise<number> {
    const client = await pool.connect();
    let addedCount = 0;
    
    try {
      await client.query('BEGIN');
      
      if (input.include_units) {
        // Get sold units with addresses
        const unitsResult = await client.query(`
          SELECT pu.*, dp.project_name, dp.address, dp.city, dp.region
          FROM project_units pu
          JOIN development_projects dp ON pu.project_id = dp.id
          WHERE pu.project_id = $1 AND pu.status = 'sold'
        `, [input.project_id]);
        
        for (const unit of unitsResult.rows) {
          // Create property record for each unit
          await client.query(`
            INSERT INTO properties (
              portfolio_id, property_name, property_type, status,
              address, city, state, country,
              bedrooms, bathrooms, square_footage,
              acquisition_date, purchase_price,
              created_by
            )
            VALUES ($1, $2, 'residential', $3, $4, $5, $6, 'Ghana',
                    $7, $8, $9, $10, $11, $12)
          `, [
            input.portfolio_id,
            `${unit.project_name} - ${unit.unit_number}`,
            input.as_status,
            unit.address,
            unit.city,
            unit.region,
            unit.bedrooms,
            unit.bathrooms,
            unit.square_footage,
            unit.handover_date || new Date(),
            unit.sale_price,
            input.created_by
          ]);
          
          addedCount++;
        }
      } else {
        // Add project as a single property
        const projectResult = await client.query(`
          SELECT * FROM development_projects WHERE id = $1
        `, [input.project_id]);
        
        if (projectResult.rows.length > 0) {
          const project = projectResult.rows[0];
          
          await client.query(`
            INSERT INTO properties (
              portfolio_id, property_name, property_type, status,
              address, city, state, country,
              acquisition_date, purchase_price,
              created_by
            )
            VALUES ($1, $2, 'mixed_use', $3, $4, $5, $6, 'Ghana', $7, $8, $9)
          `, [
            input.portfolio_id,
            project.project_name,
            input.as_status,
            project.address,
            project.city,
            project.region,
            project.actual_start_date || new Date(),
            project.total_cost,
            input.created_by
          ]);
          
          addedCount = 1;
        }
      }
      
      await client.query('COMMIT');
      
      logger.info({ projectId: input.project_id, portfolioId: input.portfolio_id, addedCount }, 'Project added to portfolio');
      
      return addedCount;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error, input }, 'Failed to add project to portfolio');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default ProjectIntegrationService.getInstance();
