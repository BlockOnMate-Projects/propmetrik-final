/**
 * RentScheduleService
 * Phase 4.x: Auto-generated Rent Schedules
 * 
 * Handles automatic creation of rent periods from tenancy agreements,
 * arrears calculation, and linking payments to scheduled periods
 * 
 * @module services/property-management/rent-collection
 */

import { Pool } from 'pg';
import { pool } from '../../../database';
import { logger } from '../../../utils/logger';

// Rent Schedule Status
export enum RentScheduleStatus {
    UPCOMING = 'upcoming',
    DUE = 'due',
    PARTIALLY_PAID = 'partially_paid',
    PAID = 'paid',
    OVERDUE = 'overdue',
    WAIVED = 'waived'
}

// Interfaces
export interface RentSchedule {
    id: string;
    tenancyId: string;
    organizationId: string;
    periodNumber: number;
    periodStartDate: Date;
    periodEndDate: Date;
    dueDate: Date;
    expectedAmount: number;
    currency: string;
    amountPaid: number;
    amountOutstanding: number;
    lateFeeApplied: number;
    lateFeeWaived: boolean;
    status: RentScheduleStatus;
    daysOverdue: number;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
    // Joined data
    tenancy?: any;
    payments?: RentSchedulePayment[];
}

export interface RentSchedulePayment {
    id: string;
    rentScheduleId: string;
    rentPaymentId: string;
    amountApplied: number;
    appliedAt: Date;
}

export interface ArrearsCalculation {
    tenancyId: string;
    totalExpected: number;
    totalPaid: number;
    totalOutstanding: number;
    totalLateFees: number;
    currency: string;
    overdueSchedules: RentSchedule[];
    dueSchedules: RentSchedule[];
    currentPeriod?: RentSchedule;
}

export interface GenerateScheduleOptions {
    tenancyId: string;
    organizationId: string;
    startDate?: Date; // Override start date
    endDate?: Date;   // Override end date
    forceRegenerate?: boolean; // Delete existing and regenerate
}

export class RentScheduleService {
    private db: Pool;

    constructor(database?: Pool) {
        this.db = database || pool;
    }

    /**
     * Generate rent schedules from a tenancy
     * Creates monthly rent periods from lease start to end date
     */
    async generateFromTenancy(options: GenerateScheduleOptions): Promise<RentSchedule[]> {
        const { tenancyId, organizationId, forceRegenerate = false } = options;

        // Get tenancy details
        const tenancyResult = await this.db.query(
            `SELECT * FROM tenancies WHERE id = $1 AND organization_id = $2`,
            [tenancyId, organizationId]
        );

        if (tenancyResult.rows.length === 0) {
            throw new Error('Tenancy not found');
        }

        const tenancy = tenancyResult.rows[0];
        const startDate = options.startDate || new Date(tenancy.lease_start_date);
        const endDate = options.endDate || new Date(tenancy.lease_end_date);
        const monthlyRent = parseFloat(tenancy.monthly_rent);
        const currency = tenancy.rent_currency || 'GHS';
        const rentDueDay = tenancy.rent_due_day || 1;

        // Check for existing schedules
        const existingSchedules = await this.db.query(
            `SELECT COUNT(*) FROM rent_schedules WHERE tenancy_id = $1`,
            [tenancyId]
        );

        if (parseInt(existingSchedules.rows[0].count, 10) > 0) {
            if (!forceRegenerate) {
                throw new Error('Rent schedules already exist for this tenancy. Use forceRegenerate to recreate.');
            }

            // Delete existing schedules (cascade will handle junction table)
            await this.db.query(
                `DELETE FROM rent_schedules WHERE tenancy_id = $1`,
                [tenancyId]
            );
            logger.info(`Deleted existing rent schedules for tenancy ${tenancyId}`);
        }

        // Generate periods
        const schedules: RentSchedule[] = [];
        let periodNumber = 1;
        let currentPeriodStart = new Date(startDate);

        while (currentPeriodStart < endDate) {
            // Calculate period end (last day of the month or lease end)
            const periodEnd = new Date(currentPeriodStart);
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            periodEnd.setDate(0); // Last day of current month

            // Don't exceed lease end date
            const actualPeriodEnd = periodEnd > endDate ? new Date(endDate) : periodEnd;

            // Due date is the rent_due_day of the period month
            const dueDate = new Date(currentPeriodStart);
            dueDate.setDate(rentDueDay);

            // Insert rent schedule
            const insertResult = await this.db.query(
                `INSERT INTO rent_schedules (
                    tenancy_id,
                    organization_id,
                    period_number,
                    period_start_date,
                    period_end_date,
                    due_date,
                    expected_amount,
                    currency,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [
                    tenancyId,
                    organizationId,
                    periodNumber,
                    currentPeriodStart,
                    actualPeriodEnd,
                    dueDate,
                    monthlyRent,
                    currency,
                    RentScheduleStatus.UPCOMING
                ]
            );

            schedules.push(this.mapRowToSchedule(insertResult.rows[0]));

            // Move to next period
            currentPeriodStart = new Date(actualPeriodEnd);
            currentPeriodStart.setDate(currentPeriodStart.getDate() + 1);
            periodNumber++;
        }

        logger.info(`Generated ${schedules.length} rent schedules for tenancy ${tenancyId}`);

        // Update statuses based on current date
        await this.updateScheduleStatuses(tenancyId);

        return schedules;
    }

    /**
     * Get all rent schedules for a tenancy
     */
    async getByTenancy(
        tenancyId: string,
        organizationId: string
    ): Promise<RentSchedule[]> {
        const result = await this.db.query(
            `SELECT rs.*, 
                    t.monthly_rent, t.property_id, t.tenant_id
             FROM rent_schedules rs
             JOIN tenancies t ON rs.tenancy_id = t.id
             WHERE rs.tenancy_id = $1 AND rs.organization_id = $2
             ORDER BY rs.period_number ASC`,
            [tenancyId, organizationId]
        );

        return result.rows.map(row => this.mapRowToSchedule(row));
    }

    /**
     * Get a specific rent schedule by ID
     */
    async getById(
        scheduleId: string,
        organizationId: string
    ): Promise<RentSchedule | null> {
        const result = await this.db.query(
            `SELECT rs.*, 
                    t.monthly_rent, t.property_id, t.tenant_id
             FROM rent_schedules rs
             JOIN tenancies t ON rs.tenancy_id = t.id
             WHERE rs.id = $1 AND rs.organization_id = $2`,
            [scheduleId, organizationId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const schedule = this.mapRowToSchedule(result.rows[0]);

        // Get linked payments
        const paymentsResult = await this.db.query(
            `SELECT rsp.*, rp.payment_amount, rp.payment_date, rp.payment_method, rp.receipt_number
             FROM rent_schedule_payments rsp
             JOIN rent_payments rp ON rsp.rent_payment_id = rp.id
             WHERE rsp.rent_schedule_id = $1
             ORDER BY rsp.applied_at ASC`,
            [scheduleId]
        );

        schedule.payments = paymentsResult.rows.map(row => ({
            id: row.id,
            rentScheduleId: row.rent_schedule_id,
            rentPaymentId: row.rent_payment_id,
            amountApplied: parseFloat(row.amount_applied),
            appliedAt: new Date(row.applied_at)
        }));

        return schedule;
    }

    /**
     * Calculate arrears for a tenancy
     */
    async calculateArrears(
        tenancyId: string,
        organizationId: string
    ): Promise<ArrearsCalculation> {
        // First, ensure statuses are up to date
        await this.updateScheduleStatuses(tenancyId);

        const schedules = await this.getByTenancy(tenancyId, organizationId);
        
        if (schedules.length === 0) {
            // No schedules - try to generate them
            const tenancy = await this.db.query(
                `SELECT * FROM tenancies WHERE id = $1 AND organization_id = $2`,
                [tenancyId, organizationId]
            );

            if (tenancy.rows.length > 0) {
                await this.generateFromTenancy({ tenancyId, organizationId });
                return this.calculateArrears(tenancyId, organizationId);
            }

            throw new Error('Tenancy not found or no rent schedules generated');
        }

        const today = new Date();
        const overdueSchedules = schedules.filter(s => s.status === RentScheduleStatus.OVERDUE);
        const dueSchedules = schedules.filter(s => s.status === RentScheduleStatus.DUE);
        const currentPeriod = schedules.find(s => 
            today >= s.periodStartDate && today <= s.periodEndDate
        );

        const totalExpected = schedules
            .filter(s => new Date(s.dueDate) <= today)
            .reduce((sum, s) => sum + s.expectedAmount, 0);

        const totalPaid = schedules.reduce((sum, s) => sum + s.amountPaid, 0);
        const totalOutstanding = schedules.reduce((sum, s) => sum + s.amountOutstanding, 0);
        const totalLateFees = schedules.reduce((sum, s) => sum + s.lateFeeApplied, 0);

        return {
            tenancyId,
            totalExpected,
            totalPaid,
            totalOutstanding,
            totalLateFees,
            currency: schedules[0]?.currency || 'GHS',
            overdueSchedules,
            dueSchedules,
            currentPeriod
        };
    }

    /**
     * Apply a payment to rent schedules
     * Automatically allocates to oldest outstanding periods first (FIFO)
     */
    async applyPayment(
        paymentId: string,
        organizationId: string
    ): Promise<RentSchedulePayment[]> {
        // Get the payment
        const paymentResult = await this.db.query(
            `SELECT rp.*, t.organization_id
             FROM rent_payments rp
             JOIN tenancies t ON rp.tenancy_id = t.id
             WHERE rp.id = $1`,
            [paymentId]
        );

        if (paymentResult.rows.length === 0) {
            throw new Error('Payment not found');
        }

        const payment = paymentResult.rows[0];
        
        if (payment.organization_id !== organizationId) {
            throw new Error('Payment does not belong to this organization');
        }

        let remainingAmount = parseFloat(payment.payment_amount);
        const appliedPayments: RentSchedulePayment[] = [];

        // Get outstanding schedules for this tenancy, ordered by due date (FIFO)
        const schedulesResult = await this.db.query(
            `SELECT * FROM rent_schedules
             WHERE tenancy_id = $1
             AND status IN ($2, $3, $4)
             ORDER BY due_date ASC`,
            [payment.tenancy_id, RentScheduleStatus.DUE, RentScheduleStatus.OVERDUE, RentScheduleStatus.PARTIALLY_PAID]
        );

        for (const schedule of schedulesResult.rows) {
            if (remainingAmount <= 0) break;

            const outstanding = parseFloat(schedule.expected_amount) - parseFloat(schedule.amount_paid || 0);
            if (outstanding <= 0) continue;

            const amountToApply = Math.min(remainingAmount, outstanding);

            // Insert payment application
            const insertResult = await this.db.query(
                `INSERT INTO rent_schedule_payments (rent_schedule_id, rent_payment_id, amount_applied)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [schedule.id, paymentId, amountToApply]
            );

            // Update schedule amount_paid
            const newAmountPaid = parseFloat(schedule.amount_paid || 0) + amountToApply;
            const newStatus = newAmountPaid >= parseFloat(schedule.expected_amount)
                ? RentScheduleStatus.PAID
                : RentScheduleStatus.PARTIALLY_PAID;

            await this.db.query(
                `UPDATE rent_schedules
                 SET amount_paid = $1, status = $2, updated_at = NOW()
                 WHERE id = $3`,
                [newAmountPaid, newStatus, schedule.id]
            );

            appliedPayments.push({
                id: insertResult.rows[0].id,
                rentScheduleId: schedule.id,
                rentPaymentId: paymentId,
                amountApplied: amountToApply,
                appliedAt: new Date(insertResult.rows[0].applied_at)
            });

            remainingAmount -= amountToApply;
        }

        logger.info(`Applied payment ${paymentId} to ${appliedPayments.length} schedules`);

        return appliedPayments;
    }

    /**
     * Update schedule statuses based on current date
     * Should be run periodically (e.g., daily cron job)
     */
    async updateScheduleStatuses(tenancyId?: string): Promise<number> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let query = `
            UPDATE rent_schedules
            SET 
                status = CASE
                    WHEN amount_paid >= expected_amount THEN 'paid'::rent_schedule_status_enum
                    WHEN due_date < $1 AND amount_paid < expected_amount THEN 'overdue'::rent_schedule_status_enum
                    WHEN due_date = $1 AND amount_paid < expected_amount THEN 'due'::rent_schedule_status_enum
                    WHEN due_date > $1 THEN 'upcoming'::rent_schedule_status_enum
                    WHEN amount_paid > 0 AND amount_paid < expected_amount THEN 'partially_paid'::rent_schedule_status_enum
                    ELSE status
                END,
                days_overdue = CASE
                    WHEN due_date < $1 AND amount_paid < expected_amount THEN ($1::date - due_date::date)
                    ELSE 0
                END,
                updated_at = NOW()
            WHERE status != 'paid' AND status != 'waived'
        `;

        const params: any[] = [today];

        if (tenancyId) {
            query += ` AND tenancy_id = $2`;
            params.push(tenancyId);
        }

        const result = await this.db.query(query, params);

        return result.rowCount || 0;
    }

    /**
     * Apply late fees to overdue schedules
     * Should be run after grace period ends
     */
    async applyLateFees(tenancyId: string, organizationId: string): Promise<number> {
        // Get tenancy late fee settings
        const tenancyResult = await this.db.query(
            `SELECT late_fee_amount, late_fee_grace_days
             FROM tenancies
             WHERE id = $1 AND organization_id = $2`,
            [tenancyId, organizationId]
        );

        if (tenancyResult.rows.length === 0) {
            throw new Error('Tenancy not found');
        }

        const { late_fee_amount, late_fee_grace_days } = tenancyResult.rows[0];
        const lateFee = parseFloat(late_fee_amount || 0);
        const graceDays = parseInt(late_fee_grace_days || 7, 10);

        if (lateFee <= 0) {
            return 0;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Apply late fees to overdue schedules past grace period that don't have fees yet
        const result = await this.db.query(
            `UPDATE rent_schedules
             SET late_fee_applied = $1,
                 expected_amount = expected_amount + $1,
                 updated_at = NOW()
             WHERE tenancy_id = $2
             AND status = 'overdue'
             AND days_overdue > $3
             AND late_fee_applied = 0
             AND late_fee_waived = FALSE`,
            [lateFee, tenancyId, graceDays]
        );

        logger.info(`Applied late fees to ${result.rowCount} schedules for tenancy ${tenancyId}`);

        return result.rowCount || 0;
    }

    /**
     * Waive late fees for a specific schedule
     */
    async waiveLateFee(
        scheduleId: string,
        organizationId: string,
        notes?: string
    ): Promise<RentSchedule> {
        const schedule = await this.getById(scheduleId, organizationId);
        if (!schedule) {
            throw new Error('Schedule not found');
        }

        await this.db.query(
            `UPDATE rent_schedules
             SET late_fee_waived = TRUE,
                 expected_amount = expected_amount - late_fee_applied,
                 notes = COALESCE(notes || E'\n', '') || $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [`Late fee waived: ${notes || 'No reason provided'}`, scheduleId]
        );

        return (await this.getById(scheduleId, organizationId))!;
    }

    /**
     * Get overdue summary for an organization
     */
    async getOverdueSummary(organizationId: string): Promise<{
        totalOverdue: number;
        totalTenancies: number;
        byTenancy: Array<{
            tenancyId: string;
            tenantName: string;
            propertyTitle: string;
            overdueAmount: number;
            oldestOverdueDays: number;
        }>;
    }> {
        const result = await this.db.query(
            `SELECT 
                rs.tenancy_id,
                tn.full_name as tenant_name,
                p.title as property_title,
                SUM(rs.amount_outstanding) as overdue_amount,
                MAX(rs.days_overdue) as oldest_overdue_days
             FROM rent_schedules rs
             JOIN tenancies t ON rs.tenancy_id = t.id
             JOIN tenants tn ON t.tenant_id = tn.id
             JOIN properties p ON t.property_id = p.id
             WHERE rs.organization_id = $1
             AND rs.status = 'overdue'
             GROUP BY rs.tenancy_id, tn.full_name, p.title
             ORDER BY overdue_amount DESC`,
            [organizationId]
        );

        const byTenancy = result.rows.map(row => ({
            tenancyId: row.tenancy_id,
            tenantName: row.tenant_name,
            propertyTitle: row.property_title,
            overdueAmount: parseFloat(row.overdue_amount || 0),
            oldestOverdueDays: parseInt(row.oldest_overdue_days || 0, 10)
        }));

        return {
            totalOverdue: byTenancy.reduce((sum, t) => sum + t.overdueAmount, 0),
            totalTenancies: byTenancy.length,
            byTenancy
        };
    }

    /**
     * Map database row to RentSchedule object
     */
    private mapRowToSchedule(row: any): RentSchedule {
        return {
            id: row.id,
            tenancyId: row.tenancy_id,
            organizationId: row.organization_id,
            periodNumber: parseInt(row.period_number, 10),
            periodStartDate: new Date(row.period_start_date),
            periodEndDate: new Date(row.period_end_date),
            dueDate: new Date(row.due_date),
            expectedAmount: parseFloat(row.expected_amount),
            currency: row.currency || 'GHS',
            amountPaid: parseFloat(row.amount_paid || 0),
            amountOutstanding: parseFloat(row.amount_outstanding || row.expected_amount),
            lateFeeApplied: parseFloat(row.late_fee_applied || 0),
            lateFeeWaived: row.late_fee_waived || false,
            status: row.status as RentScheduleStatus,
            daysOverdue: parseInt(row.days_overdue || 0, 10),
            notes: row.notes,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }
}

// Singleton export
export const rentScheduleService = new RentScheduleService();
