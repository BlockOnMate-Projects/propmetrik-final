/**
 * Project Cost Service
 * Phase 5.8 Week 2 - Budget & Cost Management
 * Competitive Inspiration: Procore (budget tracking)
 * 
 * Handles:
 * - Cost line item CRUD
 * - Budget vs actual tracking
 * - Committed cost management
 * - Invoice and payment workflow
 * - Budget summary calculations
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import { BaseService } from '../../../shared-services/base/BaseService';
import { eventBus, ProjectEventType } from './events';

// ============================================================================
// TYPES
// ============================================================================

export type CostCategory = 
  | 'land_acquisition'
  | 'permits_approvals'
  | 'design_engineering'
  | 'site_preparation'
  | 'foundation'
  | 'structural'
  | 'roofing'
  | 'mep'
  | 'exterior_finishing'
  | 'interior_finishing'
  | 'landscaping'
  | 'amenities'
  | 'contingency'
  | 'professional_fees'
  | 'insurance'
  | 'marketing_sales'
  | 'legal'
  | 'financing_costs'
  | 'other';

export type CostStatus = 
  | 'draft'
  | 'committed'
  | 'invoiced'
  | 'approved'
  | 'paid'
  | 'disputed'
  | 'cancelled';

export interface ProjectCost {
  id: string;
  project_id: string;
  organization_id: string;
  
  cost_code?: string;
  description: string;
  category: CostCategory;
  phase_id?: string;
  
  contractor_id?: string;
  contractor_assignment_id?: string;
  
  // Procore-style budget columns
  original_budget: number;
  budget_modifications: number;
  revised_budget: number;
  committed_costs: number;
  pending_costs: number;
  projected_costs: number;
  actual_costs: number;
  variance: number;
  
  status: CostStatus;
  
  invoice_number?: string;
  invoice_date?: Date;
  invoice_due_date?: Date;
  invoice_document_url?: string;
  
  payment_date?: Date;
  payment_reference?: string;
  payment_method?: string;
  
  approved_by?: string;
  approved_at?: Date;
  paid_by?: string;
  paid_at?: Date;
  
  notes?: string;
  
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCostInput {
  project_id: string;
  organization_id: string;
  
  cost_code?: string;
  description: string;
  category: CostCategory;
  phase_id?: string;
  
  contractor_id?: string;
  contractor_assignment_id?: string;
  
  original_budget?: number;
  committed_costs?: number;
  
  notes?: string;
  
  created_by?: string;
}

export interface UpdateCostInput {
  cost_code?: string;
  description?: string;
  category?: CostCategory;
  phase_id?: string;
  
  contractor_id?: string;
  contractor_assignment_id?: string;
  
  original_budget?: number;
  budget_modifications?: number;
  committed_costs?: number;
  pending_costs?: number;
  projected_costs?: number;
  actual_costs?: number;
  
  status?: CostStatus;
  
  invoice_number?: string;
  invoice_date?: Date;
  invoice_due_date?: Date;
  invoice_document_url?: string;
  
  notes?: string;
  
  updated_by?: string;
}

export interface BudgetSummary {
  project_id: string;
  total_original_budget: number;
  total_budget_modifications: number;
  total_revised_budget: number;
  total_committed: number;
  total_pending: number;
  total_projected: number;
  total_actual: number;
  total_variance: number;
  percent_spent: number;
  percent_committed: number;
  by_category: Record<CostCategory, CategoryBudget>;
}

export interface CategoryBudget {
  original_budget: number;
  revised_budget: number;
  committed: number;
  actual: number;
  projected: number;
  variance: number;
  item_count: number;
}

export interface CostFilters {
  project_id: string;
  category?: CostCategory | CostCategory[];
  status?: CostStatus | CostStatus[];
  phase_id?: string;
  contractor_id?: string;
  search?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProjectCostService extends BaseService {
  constructor() {
    super('ProjectCostService');
  }

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  async create(input: CreateCostInput): Promise<ProjectCost> {
    const originalBudget = input.original_budget || 0;
    const committed = input.committed_costs || 0;
    
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO project_costs (
        id, project_id, organization_id,
        cost_code, description, category, phase_id,
        contractor_id, contractor_assignment_id,
        original_budget, revised_budget, committed_costs, projected_costs,
        status, notes, created_by
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9,
        $10, $10, $11, $12,
        'draft', $13, $14
      ) RETURNING *`,
      [
        id, input.project_id, input.organization_id,
        input.cost_code, input.description, input.category, input.phase_id,
        input.contractor_id, input.contractor_assignment_id,
        originalBudget, committed, Math.max(originalBudget, committed),
        input.notes, input.created_by
      ]
    );
    
    return this.mapRow(result.rows[0]);
  }

  async createFromTemplate(
    projectId: string,
    organizationId: string,
    createdBy?: string
  ): Promise<ProjectCost[]> {
    // Get cost code templates
    const templates = await pool.query(
      `SELECT * FROM cost_code_templates 
       WHERE (organization_id = $1 OR is_system = true) AND is_active = true
       ORDER BY code`,
      [organizationId]
    );
    
    const costs: ProjectCost[] = [];
    
    for (const template of templates.rows) {
      const cost = await this.create({
        project_id: projectId,
        organization_id: organizationId,
        cost_code: template.code,
        description: template.name,
        category: template.category,
        original_budget: 0,
        created_by: createdBy
      });
      costs.push(cost);
    }
    
    return costs;
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  async getById(id: string): Promise<ProjectCost | null> {
    const result = await pool.query(
      'SELECT * FROM project_costs WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  async getByProject(projectId: string): Promise<ProjectCost[]> {
    const result = await pool.query(
      `SELECT * FROM project_costs 
       WHERE project_id = $1 
       ORDER BY cost_code ASC, created_at ASC`,
      [projectId]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }

  async getAll(filters: CostFilters): Promise<ProjectCost[]> {
    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [filters.project_id];
    let paramIndex = 2;
    
    if (filters.category) {
      if (Array.isArray(filters.category)) {
        conditions.push(`category = ANY($${paramIndex})`);
        params.push(filters.category);
      } else {
        conditions.push(`category = $${paramIndex}`);
        params.push(filters.category);
      }
      paramIndex++;
    }
    
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status = ANY($${paramIndex})`);
        params.push(filters.status);
      } else {
        conditions.push(`status = $${paramIndex}`);
        params.push(filters.status);
      }
      paramIndex++;
    }
    
    if (filters.phase_id) {
      conditions.push(`phase_id = $${paramIndex}`);
      params.push(filters.phase_id);
      paramIndex++;
    }
    
    if (filters.contractor_id) {
      conditions.push(`contractor_id = $${paramIndex}`);
      params.push(filters.contractor_id);
      paramIndex++;
    }
    
    if (filters.search) {
      conditions.push(`(description ILIKE $${paramIndex} OR cost_code ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }
    
    const whereClause = conditions.join(' AND ');
    
    const result = await pool.query(
      `SELECT * FROM project_costs 
       WHERE ${whereClause}
       ORDER BY cost_code ASC, created_at ASC`,
      params
    );
    
    return result.rows.map(row => this.mapRow(row));
  }

  async getBudgetSummary(projectId: string): Promise<BudgetSummary> {
    // Get totals
    const totalsResult = await pool.query(
      `SELECT 
        COALESCE(SUM(original_budget), 0) as total_original,
        COALESCE(SUM(budget_modifications), 0) as total_modifications,
        COALESCE(SUM(revised_budget), 0) as total_revised,
        COALESCE(SUM(committed_costs), 0) as total_committed,
        COALESCE(SUM(pending_costs), 0) as total_pending,
        COALESCE(SUM(projected_costs), 0) as total_projected,
        COALESCE(SUM(actual_costs), 0) as total_actual,
        COALESCE(SUM(variance), 0) as total_variance
       FROM project_costs
       WHERE project_id = $1`,
      [projectId]
    );
    
    const totals = totalsResult.rows[0];
    
    // Get by category
    const categoryResult = await pool.query(
      `SELECT 
        category,
        COALESCE(SUM(original_budget), 0) as original_budget,
        COALESCE(SUM(revised_budget), 0) as revised_budget,
        COALESCE(SUM(committed_costs), 0) as committed,
        COALESCE(SUM(actual_costs), 0) as actual,
        COALESCE(SUM(projected_costs), 0) as projected,
        COALESCE(SUM(variance), 0) as variance,
        COUNT(*) as item_count
       FROM project_costs
       WHERE project_id = $1
       GROUP BY category`,
      [projectId]
    );
    
    const byCategory: Record<string, CategoryBudget> = {};
    categoryResult.rows.forEach(row => {
      byCategory[row.category] = {
        original_budget: parseFloat(row.original_budget),
        revised_budget: parseFloat(row.revised_budget),
        committed: parseFloat(row.committed),
        actual: parseFloat(row.actual),
        projected: parseFloat(row.projected),
        variance: parseFloat(row.variance),
        item_count: parseInt(row.item_count, 10)
      };
    });
    
    const totalRevised = parseFloat(totals.total_revised) || 1;
    
    return {
      project_id: projectId,
      total_original_budget: parseFloat(totals.total_original),
      total_budget_modifications: parseFloat(totals.total_modifications),
      total_revised_budget: parseFloat(totals.total_revised),
      total_committed: parseFloat(totals.total_committed),
      total_pending: parseFloat(totals.total_pending),
      total_projected: parseFloat(totals.total_projected),
      total_actual: parseFloat(totals.total_actual),
      total_variance: parseFloat(totals.total_variance),
      percent_spent: (parseFloat(totals.total_actual) / totalRevised) * 100,
      percent_committed: (parseFloat(totals.total_committed) / totalRevised) * 100,
      by_category: byCategory as Record<CostCategory, CategoryBudget>
    };
  }

  async getCostCodes(organizationId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM cost_code_templates 
       WHERE (organization_id = $1 OR is_system = true) AND is_active = true
       ORDER BY code`,
      [organizationId]
    );
    
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  async update(id: string, input: UpdateCostInput): Promise<ProjectCost | null> {
    const current = await this.getById(id);
    if (!current) return null;
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    const updateFields = Object.entries(input).filter(([_, value]) => value !== undefined);
    
    for (const [key, value] of updateFields) {
      updates.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return current;
    }
    
    // Recalculate derived fields
    const newOriginal = input.original_budget ?? current.original_budget;
    const newModifications = input.budget_modifications ?? current.budget_modifications;
    const newCommitted = input.committed_costs ?? current.committed_costs;
    const newActual = input.actual_costs ?? current.actual_costs;
    const newProjected = input.projected_costs ?? Math.max(newOriginal + newModifications, newCommitted, newActual);
    
    updates.push(`revised_budget = $${paramIndex}`);
    params.push(newOriginal + newModifications);
    paramIndex++;
    
    updates.push(`projected_costs = $${paramIndex}`);
    params.push(newProjected);
    paramIndex++;
    
    updates.push(`variance = $${paramIndex}`);
    params.push((newOriginal + newModifications) - newProjected);
    paramIndex++;
    
    updates.push(`updated_at = NOW()`);
    params.push(id);
    
    const result = await pool.query(
      `UPDATE project_costs 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async recordInvoice(
    id: string,
    invoiceNumber: string,
    invoiceDate: Date,
    dueDate: Date,
    amount: number,
    documentUrl?: string
  ): Promise<ProjectCost | null> {
    const result = await pool.query(
      `UPDATE project_costs 
       SET status = 'invoiced',
           invoice_number = $2,
           invoice_date = $3,
           invoice_due_date = $4,
           actual_costs = $5,
           invoice_document_url = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, invoiceNumber, invoiceDate, dueDate, amount, documentUrl]
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async approveForPayment(id: string, approvedBy: string): Promise<ProjectCost | null> {
    const result = await pool.query(
      `UPDATE project_costs 
       SET status = 'approved',
           approved_by = $2,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'invoiced'
       RETURNING *`,
      [id, approvedBy]
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async recordPayment(
    id: string,
    paymentReference: string,
    paymentMethod: string,
    paidBy: string
  ): Promise<ProjectCost | null> {
    const result = await pool.query(
      `UPDATE project_costs 
       SET status = 'paid',
           payment_date = CURRENT_DATE,
           payment_reference = $2,
           payment_method = $3,
           paid_by = $4,
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'approved'
       RETURNING *`,
      [id, paymentReference, paymentMethod, paidBy]
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async bulkApprove(ids: string[], approvedBy: string): Promise<number> {
    const result = await pool.query(
      `UPDATE project_costs 
       SET status = 'approved',
           approved_by = $2,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($1) AND status = 'invoiced'
       RETURNING id`,
      [ids, approvedBy]
    );
    
    return result.rows.length;
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  async delete(id: string): Promise<boolean> {
    const cost = await this.getById(id);
    if (!cost || cost.status !== 'draft') {
      return false; // Can only delete drafts
    }
    
    const result = await pool.query(
      'DELETE FROM project_costs WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  protected mapRow(row: any): ProjectCost {
    return {
      id: row.id,
      project_id: row.project_id,
      organization_id: row.organization_id,
      
      cost_code: row.cost_code,
      description: row.description,
      category: row.category,
      phase_id: row.phase_id,
      
      contractor_id: row.contractor_id,
      contractor_assignment_id: row.contractor_assignment_id,
      
      original_budget: parseFloat(row.original_budget) || 0,
      budget_modifications: parseFloat(row.budget_modifications) || 0,
      revised_budget: parseFloat(row.revised_budget) || 0,
      committed_costs: parseFloat(row.committed_costs) || 0,
      pending_costs: parseFloat(row.pending_costs) || 0,
      projected_costs: parseFloat(row.projected_costs) || 0,
      actual_costs: parseFloat(row.actual_costs) || 0,
      variance: parseFloat(row.variance) || 0,
      
      status: row.status,
      
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      invoice_due_date: row.invoice_due_date,
      invoice_document_url: row.invoice_document_url,
      
      payment_date: row.payment_date,
      payment_reference: row.payment_reference,
      payment_method: row.payment_method,
      
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      paid_by: row.paid_by,
      paid_at: row.paid_at,
      
      notes: row.notes,
      
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const projectCostService = new ProjectCostService();
export default projectCostService;
