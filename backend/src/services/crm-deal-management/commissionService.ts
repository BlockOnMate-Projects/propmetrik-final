/**
 * Commission Service
 * Phase 5.7 Week 2 - Propertybase-inspired Commission Management
 * 
 * Features:
 * - Commission plan management with tiered structures
 * - Agent commission assignments with custom rates
 * - Commission splits for multi-agent deals
 * - Commission record tracking (pending, approved, paid)
 * - Clawback support
 * - Monthly statement generation
 * - Commission adjustments (bonuses, deductions)
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
// Commission records carry no currency of their own — the share is in the deal's
// currency. Join deals for it and GHS-normalize every summed share.
import { getGhsRateMap, ghsValueSql } from '../property-management/utils/currencyFx';

// Types
export type PlanType = 'standard' | 'tiered' | 'flat' | 'graduated';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'clawback' | 'voided';
export type StatementStatus = 'draft' | 'approved' | 'paid' | 'disputed';
export type AdjustmentType = 'bonus' | 'deduction' | 'correction' | 'advance' | 'repayment';
export type SplitRole = 'primary' | 'co-agent' | 'referral' | 'manager';

export interface CommissionPlan {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    plan_type: PlanType;
    base_rate: number;
    is_default: boolean;
    is_active: boolean;
    effective_from: Date;
    effective_to?: Date;
    created_at: Date;
    tiers?: CommissionTier[];
}

export interface CommissionTier {
    id: string;
    plan_id: string;
    tier_name: string;
    min_value: number;
    max_value?: number;
    commission_rate: number;
    tier_bonus: number;
    tier_order: number;
}

export interface CommissionSplit {
    id: string;
    deal_id: string;
    agent_id: string;
    agent_name?: string;
    role: SplitRole;
    split_percentage: number;
    commission_amount: number;
    notes?: string;
}

export interface CommissionRecord {
    id: string;
    organization_id: string;
    deal_id: string;
    agent_id: string;
    agent_name?: string;
    deal_name?: string;
    property_address?: string;
    source_type: string;
    deal_value: number;
    commission_rate: number;
    split_percentage: number;
    gross_commission: number;
    agent_share: number;
    company_share: number;
    status: CommissionStatus;
    is_clawback: boolean;
    clawback_reason?: string;
    deal_close_date: Date;
    accrual_date: Date;
    approved_at?: Date;
    paid_at?: Date;
    created_at: Date;
}

export interface CommissionStatement {
    id: string;
    organization_id: string;
    agent_id: string;
    agent_name?: string;
    statement_number: string;
    period_start: Date;
    period_end: Date;
    total_deals: number;
    total_deal_value: number;
    gross_commission: number;
    deductions: number;
    clawbacks: number;
    bonuses: number;
    net_commission: number;
    status: StatementStatus;
    payment_method?: string;
    payment_reference?: string;
    paid_at?: Date;
    document_url?: string;
    created_at: Date;
    line_items?: StatementLineItem[];
}

export interface StatementLineItem {
    id: string;
    statement_id: string;
    commission_record_id: string;
    deal_reference?: string;
    property_address?: string;
    deal_close_date: Date;
    deal_value: number;
    commission_amount: number;
}

export interface CommissionAdjustment {
    id: string;
    organization_id: string;
    agent_id: string;
    agent_name?: string;
    statement_id?: string;
    adjustment_type: AdjustmentType;
    amount: number;
    description: string;
    reference_number?: string;
    effective_date: Date;
    status: 'pending' | 'approved' | 'rejected';
    approved_at?: Date;
    created_at: Date;
}

export interface CommissionSummary {
    total_pending: number;
    total_approved: number;
    total_paid: number;
    pending_count: number;
    approved_count: number;
    paid_count: number;
    ytd_commission: number;
    mtd_commission: number;
    avg_deal_commission: number;
}

export interface CalculationResult {
    commission_rate: number;
    gross_commission: number;
    agent_share: number;
    company_share: number;
}

// Commission Service Class
class CommissionService {
    // =====================================================
    // COMMISSION PLANS
    // =====================================================

    async createPlan(data: Partial<CommissionPlan>): Promise<CommissionPlan> {
        const result = await pool.query(
            `INSERT INTO commission_plans (
                organization_id, name, description, plan_type, base_rate,
                is_default, is_active, effective_from, effective_to, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                data.organization_id,
                data.name,
                data.description,
                data.plan_type || 'standard',
                data.base_rate || 0.03,
                data.is_default || false,
                data.is_active !== false,
                data.effective_from || new Date(),
                data.effective_to,
                (data as any).created_by,
            ]
        );
        return result.rows[0];
    }

    async getPlan(id: string, organizationId: string): Promise<CommissionPlan | null> {
        const result = await pool.query(
            `SELECT cp.*,
                json_agg(ct.* ORDER BY ct.tier_order) FILTER (WHERE ct.id IS NOT NULL) AS tiers
            FROM commission_plans cp
            LEFT JOIN commission_tiers ct ON ct.plan_id = cp.id
            WHERE cp.id = $1 AND cp.organization_id = $2
            GROUP BY cp.id`,
            [id, organizationId]
        );
        return result.rows[0] || null;
    }

    async getPlans(organizationId: string, activeOnly = true): Promise<CommissionPlan[]> {
        const result = await pool.query(
            `SELECT cp.*, 
                json_agg(ct.* ORDER BY ct.tier_order) FILTER (WHERE ct.id IS NOT NULL) AS tiers
            FROM commission_plans cp
            LEFT JOIN commission_tiers ct ON ct.plan_id = cp.id
            WHERE cp.organization_id = $1 
              ${activeOnly ? 'AND cp.is_active = TRUE' : ''}
            GROUP BY cp.id
            ORDER BY cp.is_default DESC, cp.name`,
            [organizationId]
        );
        return result.rows;
    }

    async updatePlan(id: string, updates: Partial<CommissionPlan>, organizationId: string): Promise<CommissionPlan | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        const allowedFields = ['name', 'description', 'plan_type', 'base_rate', 'is_default', 'is_active', 'effective_from', 'effective_to'];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value !== undefined) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) return this.getPlan(id, organizationId);

        values.push(id);
        const idParam = paramIndex++;
        values.push(organizationId);
        const orgParam = paramIndex;
        const result = await pool.query(
            `UPDATE commission_plans SET ${fields.join(', ')}, updated_at = NOW()
            WHERE id = $${idParam} AND organization_id = $${orgParam}
            RETURNING *`,
            values
        );
        return result.rows[0] || null;
    }

    async deletePlan(id: string, organizationId: string): Promise<boolean> {
        const result = await pool.query(
            'DELETE FROM commission_plans WHERE id = $1 AND organization_id = $2 RETURNING id',
            [id, organizationId]
        );
        return result.rowCount! > 0;
    }

    // =====================================================
    // COMMISSION TIERS
    // =====================================================

    async addTier(planId: string, tier: Partial<CommissionTier>, organizationId: string): Promise<CommissionTier | null> {
        // Verify the parent plan belongs to the caller's org before inserting a tier
        const planCheck = await pool.query(
            'SELECT id FROM commission_plans WHERE id = $1 AND organization_id = $2',
            [planId, organizationId]
        );
        if (planCheck.rowCount === 0) return null;

        const result = await pool.query(
            `INSERT INTO commission_tiers (
                plan_id, tier_name, min_value, max_value, 
                commission_rate, tier_bonus, tier_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                planId,
                tier.tier_name,
                tier.min_value || 0,
                tier.max_value,
                tier.commission_rate,
                tier.tier_bonus || 0,
                tier.tier_order || 1,
            ]
        );
        return result.rows[0];
    }

    async updateTier(id: string, updates: Partial<CommissionTier>, organizationId: string): Promise<CommissionTier | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && key !== 'id' && key !== 'plan_id') {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) return null;

        values.push(id);
        const idParam = paramIndex++;
        values.push(organizationId);
        const orgParam = paramIndex;
        // commission_tiers has no organization_id → scope via parent plan
        const result = await pool.query(
            `UPDATE commission_tiers ct SET ${fields.join(', ')}
            FROM commission_plans cp
            WHERE ct.id = $${idParam}
              AND cp.id = ct.plan_id
              AND cp.organization_id = $${orgParam}
            RETURNING ct.*`,
            values
        );
        return result.rows[0] || null;
    }

    async deleteTier(id: string, organizationId: string): Promise<boolean> {
        // commission_tiers has no organization_id → scope via parent plan
        const result = await pool.query(
            `DELETE FROM commission_tiers ct
             USING commission_plans cp
             WHERE ct.id = $1
               AND cp.id = ct.plan_id
               AND cp.organization_id = $2
             RETURNING ct.id`,
            [id, organizationId]
        );
        return result.rowCount! > 0;
    }

    // =====================================================
    // AGENT ASSIGNMENTS
    // =====================================================

    async assignAgentToPlan(
        agentId: string,
        planId: string,
        customRate?: number,
        effectiveFrom?: Date,
        createdBy?: string
    ): Promise<any> {
        const result = await pool.query(
            `INSERT INTO agent_commission_assignments (
                agent_id, plan_id, custom_rate, effective_from, created_by
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (agent_id, plan_id, effective_from) 
            DO UPDATE SET custom_rate = $3
            RETURNING *`,
            [agentId, planId, customRate, effectiveFrom || new Date(), createdBy]
        );
        return result.rows[0];
    }

    async getAgentAssignment(agentId: string): Promise<any | null> {
        const result = await pool.query(
            `SELECT aca.*, cp.name AS plan_name, cp.base_rate, cp.plan_type
            FROM agent_commission_assignments aca
            JOIN commission_plans cp ON aca.plan_id = cp.id
            WHERE aca.agent_id = $1
              AND aca.effective_from <= CURRENT_DATE
              AND (aca.effective_to IS NULL OR aca.effective_to >= CURRENT_DATE)
              AND cp.is_active = TRUE
            ORDER BY aca.effective_from DESC
            LIMIT 1`,
            [agentId]
        );
        return result.rows[0] || null;
    }

    // =====================================================
    // COMMISSION SPLITS
    // =====================================================

    async setSplit(
        dealId: string,
        agentId: string,
        role: SplitRole,
        splitPercentage: number,
        notes?: string,
        createdBy?: string
    ): Promise<CommissionSplit> {
        const result = await pool.query(
            `INSERT INTO commission_splits (
                deal_id, agent_id, role, split_percentage, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (deal_id, agent_id)
            DO UPDATE SET 
                role = $3, 
                split_percentage = $4, 
                notes = $5
            RETURNING *`,
            [dealId, agentId, role, splitPercentage, notes, createdBy]
        );
        return result.rows[0];
    }

    async getSplits(dealId: string): Promise<CommissionSplit[]> {
        const result = await pool.query(
            `SELECT cs.*, TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')) AS agent_name
            FROM commission_splits cs
            LEFT JOIN agents a ON cs.agent_id = a.id
            WHERE cs.deal_id = $1
            ORDER BY cs.split_percentage DESC`,
            [dealId]
        );
        return result.rows;
    }

    async deleteSplit(dealId: string, agentId: string): Promise<boolean> {
        const result = await pool.query(
            'DELETE FROM commission_splits WHERE deal_id = $1 AND agent_id = $2 RETURNING id',
            [dealId, agentId]
        );
        return result.rowCount! > 0;
    }

    // =====================================================
    // COMMISSION CALCULATION
    // =====================================================

    async calculateCommission(
        dealId: string,
        agentId: string,
        dealValue: number,
        organizationId: string
    ): Promise<CalculationResult> {
        const result = await pool.query(
            `SELECT * FROM calculate_deal_commission($1, $2, $3, $4)`,
            [dealId, agentId, dealValue, organizationId]
        );
        
        if (result.rows[0]) {
            return {
                commission_rate: parseFloat(result.rows[0].commission_rate),
                gross_commission: parseFloat(result.rows[0].gross_commission),
                agent_share: parseFloat(result.rows[0].agent_share),
                company_share: parseFloat(result.rows[0].company_share),
            };
        }

        // Fallback calculation
        const defaultRate = 0.03;
        const gross = dealValue * defaultRate;
        return {
            commission_rate: defaultRate,
            gross_commission: gross,
            agent_share: gross,
            company_share: 0,
        };
    }

    // =====================================================
    // COMMISSION RECORDS
    // =====================================================

    async createRecord(data: Partial<CommissionRecord>): Promise<CommissionRecord> {
        const result = await pool.query(
            `INSERT INTO commission_records (
                organization_id, deal_id, agent_id, source_type,
                deal_value, commission_rate, split_percentage,
                gross_commission, agent_share, company_share,
                status, deal_close_date, accrual_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                data.organization_id,
                data.deal_id,
                data.agent_id,
                data.source_type || 'deal_close',
                data.deal_value,
                data.commission_rate,
                data.split_percentage || 100,
                data.gross_commission,
                data.agent_share,
                data.company_share || 0,
                data.status || 'pending',
                data.deal_close_date || new Date(),
                data.accrual_date || new Date(),
            ]
        );
        return result.rows[0];
    }

    async getRecord(id: string, organizationId: string): Promise<CommissionRecord | null> {
        const result = await pool.query(
            `SELECT cr.*,
                TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')) AS agent_name,
                d.title AS deal_name,
                (SELECT p.address_street FROM crm_properties p WHERE p.id = ANY(d.property_ids) LIMIT 1) AS property_address
            FROM commission_records cr
            LEFT JOIN agents a ON cr.agent_id = a.id
            LEFT JOIN deals d ON cr.deal_id = d.id
            WHERE cr.id = $1 AND cr.organization_id = $2`,
            [id, organizationId]
        );
        return result.rows[0] || null;
    }

    async getRecords(
        organizationId: string,
        filters?: {
            agent_id?: string;
            status?: CommissionStatus;
            date_from?: Date;
            date_to?: Date;
            source_type?: string;
        },
        limit = 100,
        offset = 0
    ): Promise<{ records: CommissionRecord[]; total: number }> {
        let whereClause = 'WHERE cr.organization_id = $1';
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (filters?.agent_id) {
            whereClause += ` AND cr.agent_id = $${paramIndex++}`;
            params.push(filters.agent_id);
        }
        if (filters?.status) {
            whereClause += ` AND cr.status = $${paramIndex++}`;
            params.push(filters.status);
        }
        if (filters?.date_from) {
            whereClause += ` AND cr.deal_close_date >= $${paramIndex++}`;
            params.push(filters.date_from);
        }
        if (filters?.date_to) {
            whereClause += ` AND cr.deal_close_date <= $${paramIndex++}`;
            params.push(filters.date_to);
        }
        if (filters?.source_type) {
            whereClause += ` AND cr.source_type = $${paramIndex++}`;
            params.push(filters.source_type);
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM commission_records cr ${whereClause}`,
            params
        );

        params.push(limit, offset);
        const result = await pool.query(
            `SELECT cr.*, 
                TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')) AS agent_name,
                d.title AS deal_name,
                (SELECT p.address_street FROM crm_properties p WHERE p.id = ANY(d.property_ids) LIMIT 1) AS property_address
            FROM commission_records cr
            LEFT JOIN agents a ON cr.agent_id = a.id
            LEFT JOIN deals d ON cr.deal_id = d.id
            ${whereClause}
            ORDER BY cr.deal_close_date DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            params
        );

        return {
            records: result.rows,
            total: parseInt(countResult.rows[0].count),
        };
    }

    async getPendingRecords(organizationId: string): Promise<CommissionRecord[]> {
        const result = await pool.query(
            `SELECT * FROM v_pending_commissions
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
            [organizationId]
        );
        return result.rows;
    }

    async approveRecord(id: string, approvedBy: string, organizationId: string): Promise<CommissionRecord | null> {
        const result = await pool.query(
            `UPDATE commission_records
            SET status = 'approved', approved_at = NOW(), approved_by = $2, updated_at = NOW()
            WHERE id = $1 AND status = 'pending' AND organization_id = $3
            RETURNING *`,
            [id, approvedBy, organizationId]
        );
        return result.rows[0] || null;
    }

    async markAsPaid(id: string, organizationId: string): Promise<CommissionRecord | null> {
        const result = await pool.query(
            `UPDATE commission_records
            SET status = 'paid', paid_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'approved' AND organization_id = $2
            RETURNING *`,
            [id, organizationId]
        );
        return result.rows[0] || null;
    }

    async createClawback(
        originalRecordId: string,
        reason: string,
        organizationId: string,
        createdBy?: string
    ): Promise<CommissionRecord | null> {
        // Get original record (org-scoped)
        const original = await this.getRecord(originalRecordId, organizationId);
        if (!original || original.is_clawback) return null;

        // Create clawback record (negative values)
        const result = await pool.query(
            `INSERT INTO commission_records (
                organization_id, deal_id, agent_id, source_type,
                deal_value, commission_rate, split_percentage,
                gross_commission, agent_share, company_share,
                status, is_clawback, original_commission_id, 
                clawback_reason, clawback_date, deal_close_date, accrual_date
            ) VALUES ($1, $2, $3, 'clawback', $4, $5, $6, $7, $8, $9, 'pending', TRUE, $10, $11, CURRENT_DATE, $12, CURRENT_DATE)
            RETURNING *`,
            [
                original.organization_id,
                original.deal_id,
                original.agent_id,
                original.deal_value,
                original.commission_rate,
                original.split_percentage,
                -original.gross_commission,
                -original.agent_share,
                -original.company_share,
                originalRecordId,
                reason,
                original.deal_close_date,
            ]
        );

        // Mark original as clawback
        await pool.query(
            `UPDATE commission_records SET status = 'clawback', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
            [originalRecordId, organizationId]
        );

        return result.rows[0];
    }

    // =====================================================
    // COMMISSION STATEMENTS
    // =====================================================

    async generateStatement(
        organizationId: string,
        agentId: string,
        periodStart: Date,
        periodEnd: Date
    ): Promise<string> {
        const result = await pool.query(
            `SELECT generate_commission_statement($1, $2, $3, $4) AS statement_id`,
            [organizationId, agentId, periodStart, periodEnd]
        );
        return result.rows[0].statement_id;
    }

    async generateBulkStatements(
        organizationId: string,
        periodStart: Date,
        periodEnd: Date
    ): Promise<string[]> {
        // Get all agents with commission records in period
        const agents = await pool.query(
            `SELECT DISTINCT agent_id FROM commission_records
            WHERE organization_id = $1
              AND deal_close_date BETWEEN $2 AND $3
              AND status IN ('pending', 'approved')`,
            [organizationId, periodStart, periodEnd]
        );

        const statementIds: string[] = [];
        for (const agent of agents.rows) {
            const id = await this.generateStatement(
                organizationId,
                agent.agent_id,
                periodStart,
                periodEnd
            );
            statementIds.push(id);
        }
        return statementIds;
    }

    async getStatement(id: string, organizationId: string): Promise<CommissionStatement | null> {
        const result = await pool.query(
            `SELECT cs.*, TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')) AS agent_name
            FROM commission_statements cs
            LEFT JOIN agents a ON cs.agent_id = a.id
            WHERE cs.id = $1 AND cs.organization_id = $2`,
            [id, organizationId]
        );
        
        if (!result.rows[0]) return null;

        // Get line items
        const lineItems = await pool.query(
            `SELECT * FROM statement_line_items WHERE statement_id = $1 ORDER BY deal_close_date DESC`,
            [id]
        );

        return {
            ...result.rows[0],
            line_items: lineItems.rows,
        };
    }

    async getStatements(
        organizationId: string,
        filters?: {
            agent_id?: string;
            status?: StatementStatus;
            period_start?: Date;
            period_end?: Date;
        },
        limit = 50
    ): Promise<CommissionStatement[]> {
        let whereClause = 'WHERE cs.organization_id = $1';
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (filters?.agent_id) {
            whereClause += ` AND cs.agent_id = $${paramIndex++}`;
            params.push(filters.agent_id);
        }
        if (filters?.status) {
            whereClause += ` AND cs.status = $${paramIndex++}`;
            params.push(filters.status);
        }
        if (filters?.period_start) {
            whereClause += ` AND cs.period_start >= $${paramIndex++}`;
            params.push(filters.period_start);
        }
        if (filters?.period_end) {
            whereClause += ` AND cs.period_end <= $${paramIndex++}`;
            params.push(filters.period_end);
        }

        params.push(limit);
        const result = await pool.query(
            `SELECT cs.*, TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')) AS agent_name
            FROM commission_statements cs
            LEFT JOIN agents a ON cs.agent_id = a.id
            ${whereClause}
            ORDER BY cs.period_end DESC
            LIMIT $${paramIndex}`,
            params
        );

        return result.rows;
    }

    async approveStatement(id: string, approvedBy: string, organizationId: string): Promise<CommissionStatement | null> {
        // Approve statement
        const result = await pool.query(
            `UPDATE commission_statements
            SET status = 'approved', approved_at = NOW(), approved_by = $2, updated_at = NOW()
            WHERE id = $1 AND status = 'draft' AND organization_id = $3
            RETURNING *`,
            [id, approvedBy, organizationId]
        );

        if (!result.rows[0]) return null;

        // Approve all linked commission records
        await pool.query(
            `UPDATE commission_records SET status = 'approved', approved_at = NOW(), approved_by = $2
            WHERE id IN (
                SELECT commission_record_id FROM statement_line_items WHERE statement_id = $1
            ) AND status = 'pending'`,
            [id, approvedBy]
        );

        return result.rows[0];
    }

    async markStatementPaid(
        id: string,
        paymentMethod: string,
        paymentReference: string,
        organizationId: string
    ): Promise<CommissionStatement | null> {
        const result = await pool.query(
            `UPDATE commission_statements
            SET status = 'paid', payment_method = $2, payment_reference = $3,
                paid_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'approved' AND organization_id = $4
            RETURNING *`,
            [id, paymentMethod, paymentReference, organizationId]
        );

        if (!result.rows[0]) return null;

        // Mark all linked commission records as paid
        await pool.query(
            `UPDATE commission_records SET status = 'paid', paid_at = NOW()
            WHERE id IN (
                SELECT commission_record_id FROM statement_line_items WHERE statement_id = $1
            ) AND status = 'approved'`,
            [id]
        );

        return result.rows[0];
    }

    // =====================================================
    // ADJUSTMENTS
    // =====================================================

    async createAdjustment(data: Partial<CommissionAdjustment>): Promise<CommissionAdjustment> {
        const result = await pool.query(
            `INSERT INTO commission_adjustments (
                organization_id, agent_id, statement_id, adjustment_type,
                amount, description, reference_number, effective_date, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                data.organization_id,
                data.agent_id,
                data.statement_id,
                data.adjustment_type,
                data.amount,
                data.description,
                data.reference_number,
                data.effective_date || new Date(),
                (data as any).created_by,
            ]
        );
        return result.rows[0];
    }

    async getAdjustments(
        organizationId: string,
        agentId?: string,
        statementId?: string
    ): Promise<CommissionAdjustment[]> {
        let whereClause = 'WHERE ca.organization_id = $1';
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (agentId) {
            whereClause += ` AND ca.agent_id = $${paramIndex++}`;
            params.push(agentId);
        }
        if (statementId) {
            whereClause += ` AND ca.statement_id = $${paramIndex++}`;
            params.push(statementId);
        }

        const result = await pool.query(
            `SELECT ca.*, TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')) AS agent_name
            FROM commission_adjustments ca
            LEFT JOIN agents a ON ca.agent_id = a.id
            ${whereClause}
            ORDER BY ca.effective_date DESC`,
            params
        );

        return result.rows;
    }

    async approveAdjustment(id: string, approvedBy: string, organizationId: string): Promise<CommissionAdjustment | null> {
        const result = await pool.query(
            `UPDATE commission_adjustments
            SET status = 'approved', approved_at = NOW(), approved_by = $2
            WHERE id = $1 AND status = 'pending' AND organization_id = $3
            RETURNING *`,
            [id, approvedBy, organizationId]
        );
        return result.rows[0] || null;
    }

    // =====================================================
    // SUMMARY & REPORTING
    // =====================================================

    async getSummary(organizationId: string, agentId?: string): Promise<CommissionSummary> {
        const agentFilter = agentId ? 'AND cr.agent_id = $2' : '';
        const params = agentId ? [organizationId, agentId] : [organizationId];

        const fx = await getGhsRateMap();
        const shareGhs = ghsValueSql('cr.agent_share', 'd.currency', fx);
        const result = await pool.query(
            `SELECT
                COALESCE(SUM(CASE WHEN cr.status = 'pending' THEN ${shareGhs} ELSE 0 END), 0) AS total_pending,
                COALESCE(SUM(CASE WHEN cr.status = 'approved' THEN ${shareGhs} ELSE 0 END), 0) AS total_approved,
                COALESCE(SUM(CASE WHEN cr.status = 'paid' THEN ${shareGhs} ELSE 0 END), 0) AS total_paid,
                COUNT(CASE WHEN cr.status = 'pending' THEN 1 END) AS pending_count,
                COUNT(CASE WHEN cr.status = 'approved' THEN 1 END) AS approved_count,
                COUNT(CASE WHEN cr.status = 'paid' THEN 1 END) AS paid_count,
                COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM cr.deal_close_date) = EXTRACT(YEAR FROM CURRENT_DATE)
                    THEN ${shareGhs} ELSE 0 END), 0) AS ytd_commission,
                COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM cr.deal_close_date) = EXTRACT(YEAR FROM CURRENT_DATE)
                    AND EXTRACT(MONTH FROM cr.deal_close_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                    THEN ${shareGhs} ELSE 0 END), 0) AS mtd_commission,
                COALESCE(AVG(${shareGhs}), 0) AS avg_deal_commission
            FROM commission_records cr
            LEFT JOIN deals d ON cr.deal_id = d.id
            WHERE cr.organization_id = $1
              AND cr.status != 'voided'
              AND cr.is_clawback = FALSE
              ${agentFilter}`,
            params
        );

        const row = result.rows[0];
        return {
            total_pending: parseFloat(row.total_pending),
            total_approved: parseFloat(row.total_approved),
            total_paid: parseFloat(row.total_paid),
            pending_count: parseInt(row.pending_count),
            approved_count: parseInt(row.approved_count),
            paid_count: parseInt(row.paid_count),
            ytd_commission: parseFloat(row.ytd_commission),
            mtd_commission: parseFloat(row.mtd_commission),
            avg_deal_commission: parseFloat(row.avg_deal_commission),
        };
    }

    async getAgentSummary(agentId: string, period?: 'mtd' | 'qtd' | 'ytd'): Promise<any> {
        let dateFilter = '';
        const now = new Date();

        switch (period) {
            case 'mtd':
                dateFilter = `AND deal_close_date >= DATE_TRUNC('month', CURRENT_DATE)`;
                break;
            case 'qtd':
                dateFilter = `AND deal_close_date >= DATE_TRUNC('quarter', CURRENT_DATE)`;
                break;
            case 'ytd':
                dateFilter = `AND deal_close_date >= DATE_TRUNC('year', CURRENT_DATE)`;
                break;
        }

        const result = await pool.query(
            `SELECT * FROM v_agent_commission_summary
            WHERE agent_id = $1 ${dateFilter}
            ORDER BY month DESC`,
            [agentId]
        );

        return result.rows;
    }

    // =====================================================
    // BULK OPERATIONS
    // =====================================================

    async approvePendingRecords(
        organizationId: string,
        recordIds: string[],
        approvedBy: string
    ): Promise<number> {
        const result = await pool.query(
            `UPDATE commission_records 
            SET status = 'approved', approved_at = NOW(), approved_by = $3, updated_at = NOW()
            WHERE organization_id = $1 
              AND id = ANY($2::uuid[])
              AND status = 'pending'`,
            [organizationId, recordIds, approvedBy]
        );
        return result.rowCount || 0;
    }

    async recalculateCommissions(dealId: string): Promise<void> {
        // Get deal info. NOTE: the deals table uses assigned_agent + deal_value
        // (there is no owner_id/value column — selecting those would throw).
        const deal = await pool.query(
            `SELECT id, organization_id, assigned_agent, deal_value FROM deals WHERE id = $1`,
            [dealId]
        );

        if (!deal.rows[0]) return;

        const { organization_id, assigned_agent, deal_value } = deal.rows[0];
        const value = Number(deal_value) || 0;

        // Recalculate for primary agent
        if (assigned_agent && value > 0) {
            const calc = await this.calculateCommission(dealId, assigned_agent, value, organization_id);

            await pool.query(
                `UPDATE commission_records
                SET commission_rate = $1, gross_commission = $2, agent_share = $3,
                    company_share = $4, updated_at = NOW()
                WHERE deal_id = $5 AND agent_id = $6 AND source_type = 'deal_close'`,
                [calc.commission_rate, calc.gross_commission, calc.agent_share, calc.company_share, dealId, assigned_agent]
            );
        }

        // Recalculate split-agent commission amounts off each agent's own plan
        // (not a hardcoded 3%): full plan commission apportioned by split %.
        const splits = await this.getSplits(dealId);
        for (const split of splits) {
            const calc = await this.calculateCommission(dealId, split.agent_id, value, organization_id);
            const agentShare = calc.gross_commission * ((Number(split.split_percentage) || 0) / 100);

            await pool.query(
                `UPDATE commission_splits SET commission_amount = $1 WHERE id = $2`,
                [agentShare, split.id]
            );
        }
    }

    /**
     * Auto-generate pending commission record(s) the moment a deal is won —
     * the core "I closed → my commission appears" behaviour. Idempotent: a
     * no-op if any deal_close record already exists for the deal (so re-saving
     * a won deal never double-books). Honours multi-agent commission splits;
     * otherwise books 100% to the assigned agent. Each participant's commission
     * is computed from THEIR own plan via calculate_deal_commission, then
     * apportioned by split %. Returns the records created (possibly empty).
     */
    async generateRecordsForWonDeal(
        organizationId: string,
        deal: {
            id: string;
            assigned_agent?: string | null;
            agent_id?: string | null;
            deal_value?: number | string | null;
            actual_close_date?: string | Date | null;
        }
    ): Promise<CommissionRecord[]> {
        const dealId = deal.id;
        const dealValue = Number(deal.deal_value ?? 0);
        if (!dealId || !(dealValue > 0)) return [];

        // Idempotency — never double-book a won deal.
        const existing = await pool.query(
            `SELECT 1 FROM commission_records
             WHERE deal_id = $1 AND organization_id = $2 AND source_type = 'deal_close'
             LIMIT 1`,
            [dealId, organizationId]
        );
        if ((existing.rowCount || 0) > 0) return [];

        // Participants: explicit deal splits, else the assigned agent at 100%.
        const splits = await this.getSplits(dealId);
        const participants: Array<{ agentId: string; splitPct: number }> =
            splits.length > 0
                ? splits
                      .filter(s => s.agent_id)
                      .map(s => ({ agentId: s.agent_id, splitPct: Number(s.split_percentage) || 0 }))
                : (deal.assigned_agent || deal.agent_id
                      ? [{ agentId: (deal.assigned_agent || deal.agent_id) as string, splitPct: 100 }]
                      : []);
        if (participants.length === 0) {
            logger.warn('Won deal has no agent/splits — no commission booked', { dealId, organizationId });
            return [];
        }

        const closeDate = deal.actual_close_date ? new Date(deal.actual_close_date) : new Date();
        const created: CommissionRecord[] = [];
        for (const p of participants) {
            if (!p.agentId || !(p.splitPct > 0)) continue;
            // calculate_deal_commission ALREADY applies this agent's split % from
            // commission_splits (agent_share = gross × split%). Do NOT re-apply the
            // split here or it double-counts — store the engine's figures as-is.
            const calc = await this.calculateCommission(dealId, p.agentId, dealValue, organizationId);
            const rec = await this.createRecord({
                organization_id: organizationId,
                deal_id: dealId,
                agent_id: p.agentId,
                source_type: 'deal_close',
                deal_value: dealValue,
                commission_rate: calc.commission_rate,
                split_percentage: p.splitPct,
                gross_commission: calc.gross_commission,
                agent_share: calc.agent_share,
                company_share: calc.company_share,
                status: 'pending',
                deal_close_date: closeDate,
                accrual_date: closeDate,
            });
            created.push(rec);
        }
        logger.info('Auto-generated commission record(s) for won deal', {
            dealId,
            organizationId,
            count: created.length,
            agents: participants.map(p => p.agentId),
        });
        return created;
    }
}

// Export singleton instance
export const commissionService = new CommissionService();
