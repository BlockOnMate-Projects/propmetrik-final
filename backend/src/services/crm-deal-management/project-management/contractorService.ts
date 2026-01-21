/**
 * Contractor Service
 * Phase 5.8 Week 2 - Contractor Management
 * Competitive Inspiration: Procore, Buildertrend
 * 
 * Handles:
 * - Contractor CRUD and approval
 * - Project assignments
 * - Performance tracking
 * - Payment information (bank/MoMo for Ghana)
 */

import { pool } from '../../../database';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type ContractorStatus = 
  | 'pending'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'inactive';

export interface Contractor {
  id: string;
  organization_id: string;
  
  company_name: string;
  trade?: string;
  license_number?: string;
  tax_id?: string;
  
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  region?: string;
  
  bank_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
  momo_number?: string;
  
  status: ContractorStatus;
  rating?: number;
  total_projects: number;
  total_contract_value: number;
  
  insurance_provider?: string;
  insurance_policy_number?: string;
  insurance_expiry_date?: Date;
  
  documents: ContractorDocument[];
  
  notes?: string;
  
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ContractorDocument {
  type: string;
  url: string;
  name?: string;
  expiry?: string;
}

export interface ContractorAssignment {
  id: string;
  project_id: string;
  contractor_id: string;
  organization_id: string;
  
  role?: string;
  scope_of_work?: string;
  
  contract_number?: string;
  contract_value: number;
  contract_start_date?: Date;
  contract_end_date?: Date;
  contract_document_url?: string;
  
  work_completed_percentage: number;
  amount_billed: number;
  amount_paid: number;
  retention_held: number;
  retention_percentage: number;
  
  is_active: boolean;
  start_date?: Date;
  completion_date?: Date;
  
  notes?: string;
  
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContractorInput {
  organization_id: string;
  
  company_name: string;
  trade?: string;
  license_number?: string;
  tax_id?: string;
  
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  region?: string;
  
  bank_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
  momo_number?: string;
  
  insurance_provider?: string;
  insurance_policy_number?: string;
  insurance_expiry_date?: Date;
  
  notes?: string;
  
  created_by?: string;
}

export interface UpdateContractorInput {
  company_name?: string;
  trade?: string;
  license_number?: string;
  tax_id?: string;
  
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  region?: string;
  
  bank_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
  momo_number?: string;
  
  status?: ContractorStatus;
  rating?: number;
  
  insurance_provider?: string;
  insurance_policy_number?: string;
  insurance_expiry_date?: Date;
  
  notes?: string;
  
  updated_by?: string;
}

export interface CreateAssignmentInput {
  project_id: string;
  contractor_id: string;
  organization_id: string;
  
  role?: string;
  scope_of_work?: string;
  
  contract_number?: string;
  contract_value?: number;
  contract_start_date?: Date;
  contract_end_date?: Date;
  contract_document_url?: string;
  
  retention_percentage?: number;
  
  start_date?: Date;
  
  notes?: string;
  
  created_by?: string;
}

export interface ContractorPerformance {
  contractor_id: string;
  company_name: string;
  trade?: string;
  status: ContractorStatus;
  rating?: number;
  active_projects: number;
  total_contract_value: number;
  total_billed: number;
  total_paid: number;
  avg_completion: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ContractorService {
  // --------------------------------------------------------------------------
  // CONTRACTOR CRUD
  // --------------------------------------------------------------------------

  async create(input: CreateContractorInput): Promise<Contractor> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO project_contractors (
        id, organization_id,
        company_name, trade, license_number, tax_id,
        contact_name, phone, email, address, city, region,
        bank_name, bank_account_number, bank_branch, momo_number,
        insurance_provider, insurance_policy_number, insurance_expiry_date,
        notes, created_by,
        status
      ) VALUES (
        $1, $2,
        $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21,
        'pending'
      ) RETURNING *`,
      [
        id, input.organization_id,
        input.company_name, input.trade, input.license_number, input.tax_id,
        input.contact_name, input.phone, input.email, input.address, input.city, input.region,
        input.bank_name, input.bank_account_number, input.bank_branch, input.momo_number,
        input.insurance_provider, input.insurance_policy_number, input.insurance_expiry_date,
        input.notes, input.created_by
      ]
    );
    
    return this.mapContractorRow(result.rows[0]);
  }

  async getById(id: string): Promise<Contractor | null> {
    const result = await pool.query(
      'SELECT * FROM project_contractors WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapContractorRow(result.rows[0]);
  }

  async getAll(
    organizationId: string,
    status?: ContractorStatus,
    trade?: string,
    search?: string
  ): Promise<Contractor[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];
    let paramIndex = 2;
    
    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    
    if (trade) {
      conditions.push(`trade = $${paramIndex}`);
      params.push(trade);
      paramIndex++;
    }
    
    if (search) {
      conditions.push(`(company_name ILIKE $${paramIndex} OR contact_name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const whereClause = conditions.join(' AND ');
    
    const result = await pool.query(
      `SELECT * FROM project_contractors 
       WHERE ${whereClause}
       ORDER BY company_name ASC`,
      params
    );
    
    return result.rows.map(row => this.mapContractorRow(row));
  }

  async update(id: string, input: UpdateContractorInput): Promise<Contractor | null> {
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
      return this.getById(id);
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id);
    
    const result = await pool.query(
      `UPDATE project_contractors 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );
    
    return result.rows.length > 0 ? this.mapContractorRow(result.rows[0]) : null;
  }

  async approve(id: string, updatedBy?: string): Promise<Contractor | null> {
    return this.update(id, { status: 'approved', updated_by: updatedBy });
  }

  async activate(id: string, updatedBy?: string): Promise<Contractor | null> {
    return this.update(id, { status: 'active', updated_by: updatedBy });
  }

  async suspend(id: string, updatedBy?: string): Promise<Contractor | null> {
    return this.update(id, { status: 'suspended', updated_by: updatedBy });
  }

  async addDocument(id: string, document: ContractorDocument): Promise<Contractor | null> {
    const contractor = await this.getById(id);
    if (!contractor) return null;
    
    const documents = [...contractor.documents, document];
    
    const result = await pool.query(
      `UPDATE project_contractors SET documents = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(documents), id]
    );
    
    return this.mapContractorRow(result.rows[0]);
  }

  async rate(id: string, rating: number, updatedBy?: string): Promise<Contractor | null> {
    if (rating < 0 || rating > 5) {
      throw new Error('Rating must be between 0 and 5');
    }
    return this.update(id, { rating, updated_by: updatedBy });
  }

  async delete(id: string): Promise<boolean> {
    // Check if contractor has any assignments
    const assignmentsResult = await pool.query(
      'SELECT COUNT(*) FROM project_contractor_assignments WHERE contractor_id = $1',
      [id]
    );
    
    if (parseInt(assignmentsResult.rows[0].count, 10) > 0) {
      throw new Error('Cannot delete contractor with project assignments');
    }
    
    const result = await pool.query(
      'DELETE FROM project_contractors WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // ASSIGNMENTS
  // --------------------------------------------------------------------------

  async createAssignment(input: CreateAssignmentInput): Promise<ContractorAssignment> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO project_contractor_assignments (
        id, project_id, contractor_id, organization_id,
        role, scope_of_work,
        contract_number, contract_value, contract_start_date, contract_end_date, contract_document_url,
        retention_percentage,
        start_date,
        notes, created_by,
        is_active
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8, $9, $10, $11,
        $12,
        $13,
        $14, $15,
        true
      ) RETURNING *`,
      [
        id, input.project_id, input.contractor_id, input.organization_id,
        input.role, input.scope_of_work,
        input.contract_number, input.contract_value || 0, input.contract_start_date, input.contract_end_date, input.contract_document_url,
        input.retention_percentage || 5,
        input.start_date,
        input.notes, input.created_by
      ]
    );
    
    // Update contractor stats
    await this.updateContractorStats(input.contractor_id);
    
    return this.mapAssignmentRow(result.rows[0]);
  }

  async getAssignment(id: string): Promise<ContractorAssignment | null> {
    const result = await pool.query(
      'SELECT * FROM project_contractor_assignments WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapAssignmentRow(result.rows[0]);
  }

  async getProjectAssignments(projectId: string): Promise<(ContractorAssignment & { contractor: Contractor })[]> {
    const result = await pool.query(
      `SELECT 
        a.*,
        c.company_name, c.trade, c.contact_name, c.phone, c.email, c.status as contractor_status, c.rating
       FROM project_contractor_assignments a
       JOIN project_contractors c ON c.id = a.contractor_id
       WHERE a.project_id = $1
       ORDER BY a.created_at ASC`,
      [projectId]
    );
    
    return result.rows.map(row => ({
      ...this.mapAssignmentRow(row),
      contractor: {
        id: row.contractor_id,
        organization_id: row.organization_id,
        company_name: row.company_name,
        trade: row.trade,
        contact_name: row.contact_name,
        phone: row.phone,
        email: row.email,
        status: row.contractor_status,
        rating: row.rating ? parseFloat(row.rating) : undefined,
        total_projects: 0,
        total_contract_value: 0,
        documents: [],
        created_at: row.created_at,
        updated_at: row.updated_at
      } as Contractor
    }));
  }

  async getContractorAssignments(contractorId: string): Promise<ContractorAssignment[]> {
    const result = await pool.query(
      `SELECT * FROM project_contractor_assignments 
       WHERE contractor_id = $1
       ORDER BY created_at DESC`,
      [contractorId]
    );
    
    return result.rows.map(row => this.mapAssignmentRow(row));
  }

  async updateAssignment(
    id: string,
    updates: Partial<{
      role: string;
      scope_of_work: string;
      contract_value: number;
      contract_document_url: string;
      work_completed_percentage: number;
      amount_billed: number;
      amount_paid: number;
      is_active: boolean;
      completion_date: Date;
      notes: string;
    }>
  ): Promise<ContractorAssignment | null> {
    const updateParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        updateParts.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }
    
    if (updateParts.length === 0) {
      return this.getAssignment(id);
    }
    
    // Calculate retention
    if (updates.amount_billed !== undefined) {
      const assignment = await this.getAssignment(id);
      if (assignment) {
        const retention = updates.amount_billed * (assignment.retention_percentage / 100);
        updateParts.push(`retention_held = $${paramIndex}`);
        params.push(retention);
        paramIndex++;
      }
    }
    
    updateParts.push(`updated_at = NOW()`);
    params.push(id);
    
    const result = await pool.query(
      `UPDATE project_contractor_assignments 
       SET ${updateParts.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );
    
    if (result.rows.length > 0) {
      // Update contractor stats
      await this.updateContractorStats(result.rows[0].contractor_id);
      return this.mapAssignmentRow(result.rows[0]);
    }
    
    return null;
  }

  async recordBilling(id: string, amount: number): Promise<ContractorAssignment | null> {
    const assignment = await this.getAssignment(id);
    if (!assignment) return null;
    
    const newBilled = assignment.amount_billed + amount;
    return this.updateAssignment(id, { amount_billed: newBilled });
  }

  async recordPayment(id: string, amount: number): Promise<ContractorAssignment | null> {
    const assignment = await this.getAssignment(id);
    if (!assignment) return null;
    
    const newPaid = assignment.amount_paid + amount;
    return this.updateAssignment(id, { amount_paid: newPaid });
  }

  async updateProgress(id: string, percentage: number): Promise<ContractorAssignment | null> {
    return this.updateAssignment(id, { 
      work_completed_percentage: Math.min(100, Math.max(0, percentage))
    });
  }

  async completeAssignment(id: string): Promise<ContractorAssignment | null> {
    return this.updateAssignment(id, {
      work_completed_percentage: 100,
      completion_date: new Date(),
      is_active: false
    });
  }

  // --------------------------------------------------------------------------
  // PERFORMANCE
  // --------------------------------------------------------------------------

  async getPerformance(organizationId: string): Promise<ContractorPerformance[]> {
    const result = await pool.query(
      'SELECT * FROM v_contractor_performance WHERE organization_id = $1 ORDER BY total_contract_value DESC',
      [organizationId]
    );
    
    return result.rows.map(row => ({
      contractor_id: row.contractor_id,
      company_name: row.company_name,
      trade: row.trade,
      status: row.status,
      rating: row.rating ? parseFloat(row.rating) : undefined,
      active_projects: parseInt(row.active_projects, 10),
      total_contract_value: parseFloat(row.total_contract_value) || 0,
      total_billed: parseFloat(row.total_billed) || 0,
      total_paid: parseFloat(row.total_paid) || 0,
      avg_completion: parseFloat(row.avg_completion) || 0
    }));
  }

  async getTrades(organizationId: string): Promise<string[]> {
    const result = await pool.query(
      `SELECT DISTINCT trade FROM project_contractors 
       WHERE organization_id = $1 AND trade IS NOT NULL
       ORDER BY trade`,
      [organizationId]
    );
    
    return result.rows.map(row => row.trade);
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private async updateContractorStats(contractorId: string): Promise<void> {
    await pool.query(
      `UPDATE project_contractors
       SET 
        total_projects = (
          SELECT COUNT(DISTINCT project_id) FROM project_contractor_assignments WHERE contractor_id = $1
        ),
        total_contract_value = (
          SELECT COALESCE(SUM(contract_value), 0) FROM project_contractor_assignments WHERE contractor_id = $1
        ),
        updated_at = NOW()
       WHERE id = $1`,
      [contractorId]
    );
  }

  private mapContractorRow(row: any): Contractor {
    return {
      id: row.id,
      organization_id: row.organization_id,
      
      company_name: row.company_name,
      trade: row.trade,
      license_number: row.license_number,
      tax_id: row.tax_id,
      
      contact_name: row.contact_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      region: row.region,
      
      bank_name: row.bank_name,
      bank_account_number: row.bank_account_number,
      bank_branch: row.bank_branch,
      momo_number: row.momo_number,
      
      status: row.status,
      rating: row.rating ? parseFloat(row.rating) : undefined,
      total_projects: row.total_projects || 0,
      total_contract_value: parseFloat(row.total_contract_value) || 0,
      
      insurance_provider: row.insurance_provider,
      insurance_policy_number: row.insurance_policy_number,
      insurance_expiry_date: row.insurance_expiry_date,
      
      documents: row.documents || [],
      
      notes: row.notes,
      
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapAssignmentRow(row: any): ContractorAssignment {
    return {
      id: row.id,
      project_id: row.project_id,
      contractor_id: row.contractor_id,
      organization_id: row.organization_id,
      
      role: row.role,
      scope_of_work: row.scope_of_work,
      
      contract_number: row.contract_number,
      contract_value: parseFloat(row.contract_value) || 0,
      contract_start_date: row.contract_start_date,
      contract_end_date: row.contract_end_date,
      contract_document_url: row.contract_document_url,
      
      work_completed_percentage: parseFloat(row.work_completed_percentage) || 0,
      amount_billed: parseFloat(row.amount_billed) || 0,
      amount_paid: parseFloat(row.amount_paid) || 0,
      retention_held: parseFloat(row.retention_held) || 0,
      retention_percentage: parseFloat(row.retention_percentage) || 5,
      
      is_active: row.is_active,
      start_date: row.start_date,
      completion_date: row.completion_date,
      
      notes: row.notes,
      
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const contractorService = new ContractorService();
export default contractorService;
