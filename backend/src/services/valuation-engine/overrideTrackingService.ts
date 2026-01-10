/**
 * Override Tracking Service
 * Track user overrides of system defaults with reasons and generate disclaimers
 * 
 * Features:
 * - Record overrides with mandatory justification
 * - Calculate deviation metrics
 * - Flag overrides requiring approval
 * - Generate report disclaimers
 * - Audit trail maintenance
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type OverrideCategory = 
  | 'measurement'
  | 'cost_input'
  | 'market_data'
  | 'adjustment'
  | 'cap_rate'
  | 'method_weight'
  | 'comparable_weight'
  | 'depreciation'
  | 'rent_rate';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface UserOverride {
  id: string;
  valuation_id: string;
  category: OverrideCategory;
  field_path: string;
  field_label: string;
  system_default_value: any;
  user_override_value: any;
  value_unit?: string;
  deviation_percentage?: number;
  deviation_absolute?: number;
  reason: string;
  supporting_evidence?: string;
  evidence_document_id?: string;
  requires_approval: boolean;
  approval_status: ApprovalStatus;
  approved_by?: string;
  approved_at?: Date;
  approval_notes?: string;
  include_in_report: boolean;
  disclaimer_text?: string;
  overridden_by: string;
  overridden_at: Date;
  created_at: Date;
}

export interface CreateOverrideInput {
  valuation_id: string;
  category: OverrideCategory;
  field_path: string;
  field_label: string;
  system_default_value: any;
  user_override_value: any;
  value_unit?: string;
  reason: string;
  supporting_evidence?: string;
  evidence_document_id?: string;
  include_in_report?: boolean;
  overridden_by: string;
}

export interface ApproveOverrideInput {
  approved_by: string;
  approval_notes?: string;
}

export interface OverrideSummary {
  total_overrides: number;
  by_category: Record<OverrideCategory, number>;
  pending_approval: number;
  high_deviation_count: number;
  disclaimers: string[];
}

export interface ApprovalThreshold {
  category: OverrideCategory;
  deviation_threshold_percent: number;
  absolute_threshold?: number;
  always_require_approval?: boolean;
}

// ============================================================================
// OVERRIDE TRACKING SERVICE
// ============================================================================

class OverrideTrackingService {
  
  // Default approval thresholds by category
  private readonly APPROVAL_THRESHOLDS: Record<OverrideCategory, ApprovalThreshold> = {
    measurement: { category: 'measurement', deviation_threshold_percent: 10 },
    cost_input: { category: 'cost_input', deviation_threshold_percent: 15 },
    market_data: { category: 'market_data', deviation_threshold_percent: 20 },
    adjustment: { category: 'adjustment', deviation_threshold_percent: 25 },
    cap_rate: { category: 'cap_rate', deviation_threshold_percent: 15, absolute_threshold: 0.02 },
    method_weight: { category: 'method_weight', deviation_threshold_percent: 20 },
    comparable_weight: { category: 'comparable_weight', deviation_threshold_percent: 30 },
    depreciation: { category: 'depreciation', deviation_threshold_percent: 20 },
    rent_rate: { category: 'rent_rate', deviation_threshold_percent: 15 }
  };

  // --------------------------------------------------------------------------
  // CRUD OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Record a new override
   */
  async create(input: CreateOverrideInput): Promise<UserOverride> {
    const id = uuidv4();
    
    // Calculate deviation
    const { deviationPercentage, deviationAbsolute } = this.calculateDeviation(
      input.system_default_value,
      input.user_override_value
    );
    
    // Determine if approval required
    const requiresApproval = this.checkRequiresApproval(
      input.category,
      deviationPercentage,
      deviationAbsolute
    );
    
    // Generate disclaimer text
    const disclaimerText = this.generateDisclaimer(input, deviationPercentage);
    
    const query = `
      INSERT INTO valuation_user_overrides (
        id, valuation_id, category, field_path, field_label,
        system_default_value, user_override_value, value_unit,
        deviation_percentage, deviation_absolute,
        reason, supporting_evidence, evidence_document_id,
        requires_approval, approval_status,
        include_in_report, disclaimer_text,
        overridden_by, overridden_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
      )
      RETURNING *
    `;
    
    const values = [
      id,
      input.valuation_id,
      input.category,
      input.field_path,
      input.field_label,
      JSON.stringify(input.system_default_value),
      JSON.stringify(input.user_override_value),
      input.value_unit || null,
      deviationPercentage,
      deviationAbsolute,
      input.reason,
      input.supporting_evidence || null,
      input.evidence_document_id || null,
      requiresApproval,
      requiresApproval ? 'pending' : 'approved',
      input.include_in_report ?? true,
      disclaimerText,
      input.overridden_by
    ];
    
    const result = await pool.query(query, values);
    return this.mapRowToOverride(result.rows[0]);
  }

  /**
   * Get override by ID
   */
  async getById(id: string): Promise<UserOverride | null> {
    const query = 'SELECT * FROM valuation_user_overrides WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    return this.mapRowToOverride(result.rows[0]);
  }

  /**
   * Get all overrides for a valuation
   */
  async getByValuationId(valuationId: string): Promise<UserOverride[]> {
    const query = `
      SELECT * FROM valuation_user_overrides 
      WHERE valuation_id = $1 
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query, [valuationId]);
    return result.rows.map(this.mapRowToOverride);
  }

  /**
   * Get overrides by category
   */
  async getByCategory(valuationId: string, category: OverrideCategory): Promise<UserOverride[]> {
    const query = `
      SELECT * FROM valuation_user_overrides 
      WHERE valuation_id = $1 AND category = $2
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query, [valuationId, category]);
    return result.rows.map(this.mapRowToOverride);
  }

  /**
   * Get pending approval overrides
   */
  async getPendingApproval(valuationId?: string): Promise<UserOverride[]> {
    let query = `
      SELECT * FROM valuation_user_overrides 
      WHERE requires_approval = true AND approval_status = 'pending'
    `;
    const params: any[] = [];
    
    if (valuationId) {
      query += ' AND valuation_id = $1';
      params.push(valuationId);
    }
    
    query += ' ORDER BY created_at ASC';
    
    const result = await pool.query(query, params);
    return result.rows.map(this.mapRowToOverride);
  }

  /**
   * Update an override (only if not yet approved/rejected)
   */
  async update(id: string, updates: Partial<CreateOverrideInput>): Promise<UserOverride | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.approval_status !== 'pending') {
      throw new Error('Cannot update an override that has been approved or rejected');
    }

    // Recalculate deviation if values changed
    let deviationPercentage: number | null | undefined = existing.deviation_percentage;
    let deviationAbsolute: number | null | undefined = existing.deviation_absolute;
    
    if (updates.user_override_value !== undefined || updates.system_default_value !== undefined) {
      const systemValue = updates.system_default_value ?? existing.system_default_value;
      const userValue = updates.user_override_value ?? existing.user_override_value;
      const deviation = this.calculateDeviation(systemValue, userValue);
      deviationPercentage = deviation.deviationPercentage;
      deviationAbsolute = deviation.deviationAbsolute;
    }

    const query = `
      UPDATE valuation_user_overrides SET
        user_override_value = COALESCE($2, user_override_value),
        reason = COALESCE($3, reason),
        supporting_evidence = COALESCE($4, supporting_evidence),
        deviation_percentage = $5,
        deviation_absolute = $6,
        include_in_report = COALESCE($7, include_in_report)
      WHERE id = $1
      RETURNING *
    `;

    const values = [
      id,
      updates.user_override_value ? JSON.stringify(updates.user_override_value) : null,
      updates.reason || null,
      updates.supporting_evidence || null,
      deviationPercentage ?? null,
      deviationAbsolute ?? null,
      updates.include_in_report
    ];

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return null;
    return this.mapRowToOverride(result.rows[0]);
  }

  /**
   * Delete an override
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    if (existing.approval_status !== 'pending') {
      throw new Error('Cannot delete an override that has been approved or rejected');
    }

    const query = 'DELETE FROM valuation_user_overrides WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // APPROVAL WORKFLOW
  // --------------------------------------------------------------------------

  /**
   * Approve an override
   */
  async approve(id: string, input: ApproveOverrideInput): Promise<UserOverride | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (!existing.requires_approval) {
      throw new Error('Override does not require approval');
    }
    if (existing.approval_status !== 'pending') {
      throw new Error('Override has already been processed');
    }

    const query = `
      UPDATE valuation_user_overrides SET
        approval_status = 'approved',
        approved_by = $2,
        approved_at = NOW(),
        approval_notes = $3
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      input.approved_by,
      input.approval_notes || null
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToOverride(result.rows[0]);
  }

  /**
   * Reject an override
   */
  async reject(id: string, input: ApproveOverrideInput): Promise<UserOverride | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (!existing.requires_approval) {
      throw new Error('Override does not require approval');
    }
    if (existing.approval_status !== 'pending') {
      throw new Error('Override has already been processed');
    }

    const query = `
      UPDATE valuation_user_overrides SET
        approval_status = 'rejected',
        approved_by = $2,
        approved_at = NOW(),
        approval_notes = $3
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      input.approved_by,
      input.approval_notes || 'Override rejected'
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToOverride(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // DEVIATION CALCULATIONS
  // --------------------------------------------------------------------------

  /**
   * Calculate deviation between system default and user override
   */
  calculateDeviation(
    systemValue: any,
    userValue: any
  ): { deviationPercentage: number | null; deviationAbsolute: number | null } {
    // Handle numeric values
    const sysNum = this.extractNumericValue(systemValue);
    const userNum = this.extractNumericValue(userValue);
    
    if (sysNum !== null && userNum !== null) {
      const absolute = userNum - sysNum;
      const percentage = sysNum !== 0 ? ((userNum - sysNum) / Math.abs(sysNum)) * 100 : null;
      
      return {
        deviationPercentage: percentage !== null ? Math.round(percentage * 100) / 100 : null,
        deviationAbsolute: Math.round(absolute * 10000) / 10000
      };
    }
    
    return { deviationPercentage: null, deviationAbsolute: null };
  }

  /**
   * Extract numeric value from various formats
   */
  private extractNumericValue(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
      return isNaN(parsed) ? null : parsed;
    }
    if (typeof value === 'object' && value !== null) {
      // Try common numeric property names
      const numericProps = ['value', 'amount', 'rate', 'percentage', 'weight'];
      for (const prop of numericProps) {
        if (typeof value[prop] === 'number') return value[prop];
      }
    }
    return null;
  }

  /**
   * Check if override requires approval based on deviation
   */
  checkRequiresApproval(
    category: OverrideCategory,
    deviationPercentage: number | null,
    deviationAbsolute: number | null
  ): boolean {
    const threshold = this.APPROVAL_THRESHOLDS[category];
    if (!threshold) return false;
    
    if (threshold.always_require_approval) return true;
    
    // Check percentage threshold
    if (deviationPercentage !== null && 
        Math.abs(deviationPercentage) >= threshold.deviation_threshold_percent) {
      return true;
    }
    
    // Check absolute threshold
    if (threshold.absolute_threshold !== undefined && 
        deviationAbsolute !== null &&
        Math.abs(deviationAbsolute) >= threshold.absolute_threshold) {
      return true;
    }
    
    return false;
  }

  // --------------------------------------------------------------------------
  // DISCLAIMER GENERATION
  // --------------------------------------------------------------------------

  /**
   * Generate disclaimer text for an override
   */
  generateDisclaimer(input: CreateOverrideInput, deviationPercentage: number | null): string {
    const deviation = deviationPercentage !== null 
      ? `(${deviationPercentage > 0 ? '+' : ''}${deviationPercentage.toFixed(1)}% from system default)` 
      : '';
    
    return `The ${input.field_label} has been manually adjusted ${deviation}. ` +
      `Valuer's justification: "${input.reason}"`;
  }

  /**
   * Generate all disclaimers for a valuation report
   */
  async generateReportDisclaimers(valuationId: string): Promise<string[]> {
    const overrides = await this.getByValuationId(valuationId);
    
    const disclaimers: string[] = [];
    
    // Filter to only approved overrides that should be in report
    const reportableOverrides = overrides.filter(o => 
      o.include_in_report && 
      (o.approval_status === 'approved' || !o.requires_approval)
    );
    
    if (reportableOverrides.length === 0) return disclaimers;
    
    // Group by category for organized disclaimers
    const byCategory = this.groupByCategory(reportableOverrides);
    
    for (const [category, categoryOverrides] of Object.entries(byCategory)) {
      const categoryLabel = this.getCategoryLabel(category as OverrideCategory);
      
      if (categoryOverrides.length === 1) {
        const o = categoryOverrides[0];
        disclaimers.push(o.disclaimer_text || this.generateDisclaimer({
          valuation_id: o.valuation_id,
          category: o.category,
          field_path: o.field_path,
          field_label: o.field_label,
          system_default_value: o.system_default_value,
          user_override_value: o.user_override_value,
          reason: o.reason,
          overridden_by: o.overridden_by
        }, o.deviation_percentage ?? null));
      } else {
        // Consolidated disclaimer for multiple overrides in same category
        const fieldLabels = categoryOverrides.map(o => o.field_label).join(', ');
        disclaimers.push(
          `Multiple ${categoryLabel} values have been manually adjusted (${fieldLabels}). ` +
          `Individual justifications are documented in the valuation workfile.`
        );
      }
    }
    
    return disclaimers;
  }

  /**
   * Generate RICS-compliant material uncertainty statement
   */
  async generateMaterialUncertaintyStatement(valuationId: string): Promise<string | null> {
    const overrides = await this.getByValuationId(valuationId);
    
    // Check for high-impact overrides
    const highImpactCategories: OverrideCategory[] = ['cap_rate', 'method_weight', 'market_data'];
    const highImpactOverrides = overrides.filter(o => 
      highImpactCategories.includes(o.category) &&
      o.deviation_percentage !== undefined &&
      o.deviation_percentage !== null &&
      Math.abs(o.deviation_percentage) >= 10
    );
    
    if (highImpactOverrides.length === 0) return null;
    
    return `In accordance with RICS Valuation Standards, the valuer has made material adjustments ` +
      `to the following inputs: ${highImpactOverrides.map(o => o.field_label).join(', ')}. ` +
      `These adjustments reflect the valuer's professional judgment based on market evidence and ` +
      `local knowledge. The reported value may differ materially from the result that would be ` +
      `obtained using unadjusted system defaults.`;
  }

  // --------------------------------------------------------------------------
  // SUMMARY & REPORTING
  // --------------------------------------------------------------------------

  /**
   * Get override summary for a valuation
   */
  async getSummary(valuationId: string): Promise<OverrideSummary> {
    const overrides = await this.getByValuationId(valuationId);
    const disclaimers = await this.generateReportDisclaimers(valuationId);
    
    const byCategory: Record<OverrideCategory, number> = {
      measurement: 0,
      cost_input: 0,
      market_data: 0,
      adjustment: 0,
      cap_rate: 0,
      method_weight: 0,
      comparable_weight: 0,
      depreciation: 0,
      rent_rate: 0
    };
    
    let pendingApproval = 0;
    let highDeviationCount = 0;
    
    for (const override of overrides) {
      byCategory[override.category] = (byCategory[override.category] || 0) + 1;
      
      if (override.requires_approval && override.approval_status === 'pending') {
        pendingApproval++;
      }
      
      if (override.deviation_percentage !== undefined && override.deviation_percentage !== null && Math.abs(override.deviation_percentage) >= 20) {
        highDeviationCount++;
      }
    }
    
    return {
      total_overrides: overrides.length,
      by_category: byCategory,
      pending_approval: pendingApproval,
      high_deviation_count: highDeviationCount,
      disclaimers
    };
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private groupByCategory(overrides: UserOverride[]): Record<string, UserOverride[]> {
    return overrides.reduce((acc, override) => {
      if (!acc[override.category]) {
        acc[override.category] = [];
      }
      acc[override.category].push(override);
      return acc;
    }, {} as Record<string, UserOverride[]>);
  }

  private getCategoryLabel(category: OverrideCategory): string {
    const labels: Record<OverrideCategory, string> = {
      measurement: 'measurement',
      cost_input: 'cost input',
      market_data: 'market data',
      adjustment: 'adjustment',
      cap_rate: 'capitalization rate',
      method_weight: 'method weighting',
      comparable_weight: 'comparable weighting',
      depreciation: 'depreciation',
      rent_rate: 'rental rate'
    };
    return labels[category] || category;
  }

  private mapRowToOverride(row: any): UserOverride {
    return {
      id: row.id,
      valuation_id: row.valuation_id,
      category: row.category,
      field_path: row.field_path,
      field_label: row.field_label,
      system_default_value: typeof row.system_default_value === 'string' 
        ? JSON.parse(row.system_default_value) 
        : row.system_default_value,
      user_override_value: typeof row.user_override_value === 'string' 
        ? JSON.parse(row.user_override_value) 
        : row.user_override_value,
      value_unit: row.value_unit,
      deviation_percentage: row.deviation_percentage ? parseFloat(row.deviation_percentage) : undefined,
      deviation_absolute: row.deviation_absolute ? parseFloat(row.deviation_absolute) : undefined,
      reason: row.reason,
      supporting_evidence: row.supporting_evidence,
      evidence_document_id: row.evidence_document_id,
      requires_approval: row.requires_approval,
      approval_status: row.approval_status,
      approved_by: row.approved_by,
      approved_at: row.approved_at ? new Date(row.approved_at) : undefined,
      approval_notes: row.approval_notes,
      include_in_report: row.include_in_report,
      disclaimer_text: row.disclaimer_text,
      overridden_by: row.overridden_by,
      overridden_at: new Date(row.overridden_at),
      created_at: new Date(row.created_at)
    };
  }
}

// Export singleton instance
export const overrideTrackingService = new OverrideTrackingService();
export default overrideTrackingService;
