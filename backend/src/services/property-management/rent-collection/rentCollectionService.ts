/**
 * RentCollectionService
 * Phase 4.3: Rent Collection & Payment Service
 * 
 * Handles payment recording, invoicing, reminders, and collection tracking
 * 
 * @module services/property-management/rent-collection
 */

import { Pool } from 'pg';
import { pool } from '../../../database';
import {
    RentPayment,
    CreateRentPaymentDto,
    PaymentMethod,
    PaymentStatus,
    PaginationParams,
    PaginatedResponse
} from '../../../types/property-management.types';

/**
 * Service for managing rent collection and payments
 */
export class RentCollectionService {
    private db: Pool;

    constructor(database?: Pool) {
        this.db = database || pool;
    }

    /**
     * Record a rent payment
     * @param organizationId - Organization ID
     * @param data - Payment data
     * @param userId - User recording the payment
     * @returns Created payment record
     */
    async recordPayment(
        organizationId: string,
        data: CreateRentPaymentDto,
        userId?: string
    ): Promise<RentPayment> {
        // Verify tenancy belongs to organization
        const tenancyCheck = await this.db.query(
            `SELECT id, monthly_rent FROM tenancies WHERE id = $1 AND organization_id = $2`,
            [data.tenancyId, organizationId]
        );

        if (tenancyCheck.rows.length === 0) {
            throw new Error('Tenancy not found');
        }

        const query = `
      INSERT INTO rent_payments (
        tenancy_id,
        payment_amount,
        currency,
        payment_date,
        payment_method,
        mobile_money_reference,
        mobile_money_number,
        bank_reference,
        bank_name,
        period_start_date,
        period_end_date,
        late_fees,
        other_charges,
        status,
        notes,
        recorded_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      RETURNING *
    `;

        const values = [
            data.tenancyId,
            data.paymentAmount,
            data.currency || 'GHS',
            new Date(data.paymentDate),
            data.paymentMethod,
            data.mobileMoneyReference || null,
            data.mobileMoneyNumber || null,
            data.bankReference || null,
            data.bankName || null,
            new Date(data.periodStartDate),
            new Date(data.periodEndDate),
            data.lateFees || 0,
            JSON.stringify(data.otherCharges || []),
            PaymentStatus.COMPLETED,
            data.notes || null,
            userId || null
        ];

        const result = await this.db.query(query, values);

        // Create financial record for this payment
        await this.createFinancialRecordForPayment(
            result.rows[0],
            tenancyCheck.rows[0],
            userId
        );

        return this.mapRowToPayment(result.rows[0]);
    }

    /**
     * Get payment by ID
     */
    async getPaymentById(
        paymentId: string,
        organizationId: string
    ): Promise<RentPayment | null> {
        const query = `
      SELECT rp.*, t.organization_id
      FROM rent_payments rp
      JOIN tenancies t ON rp.tenancy_id = t.id
      WHERE rp.id = $1 AND t.organization_id = $2
    `;

        const result = await this.db.query(query, [paymentId, organizationId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToPayment(result.rows[0]);
    }

    /**
     * Get payment history for a tenancy
     */
    async getPaymentHistory(
        tenancyId: string,
        organizationId: string,
        pagination: PaginationParams = {}
    ): Promise<PaginatedResponse<RentPayment>> {
        const { page = 1, limit = 20, sortBy = 'payment_date', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        // Verify access
        const accessCheck = await this.db.query(
            `SELECT id FROM tenancies WHERE id = $1 AND organization_id = $2`,
            [tenancyId, organizationId]
        );

        if (accessCheck.rows.length === 0) {
            throw new Error('Tenancy not found');
        }

        const countResult = await this.db.query(
            `SELECT COUNT(*) FROM rent_payments WHERE tenancy_id = $1`,
            [tenancyId]
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const allowedSortFields = ['payment_date', 'payment_amount', 'status'];
        const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'payment_date';
        const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

        const dataQuery = `
      SELECT * FROM rent_payments
      WHERE tenancy_id = $1
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT $2 OFFSET $3
    `;

        const dataResult = await this.db.query(dataQuery, [tenancyId, limit, offset]);
        const payments = dataResult.rows.map(row => this.mapRowToPayment(row));

        const totalPages = Math.ceil(total / limit);

        return {
            data: payments,
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrevious: page > 1
        };
    }

    /**
     * Get defaulting tenants (tenants with overdue payments)
     */
    async getDefaultingTenants(
        organizationId: string,
        overdueThreshold: number = 30
    ): Promise<DefaultingTenant[]> {
        const query = `
      WITH expected_payments AS (
        SELECT 
          t.id as tenancy_id,
          t.tenant_id,
          t.property_id,
          t.monthly_rent,
          t.lease_start_date,
          t.lease_end_date,
          tn.full_name as tenant_name,
          tn.phone_primary as tenant_phone,
          tn.email as tenant_email,
          p.title as property_title,
          COALESCE(
            (SELECT SUM(payment_amount) FROM rent_payments WHERE tenancy_id = t.id AND status = 'completed'),
            0
          ) as total_paid,
          (
            EXTRACT(YEAR FROM AGE(LEAST(CURRENT_DATE, t.lease_end_date), t.lease_start_date)) * 12 +
            EXTRACT(MONTH FROM AGE(LEAST(CURRENT_DATE, t.lease_end_date), t.lease_start_date)) + 1
          ) * t.monthly_rent as expected_amount
        FROM tenancies t
        JOIN tenants tn ON t.tenant_id = tn.id
        JOIN properties p ON t.property_id = p.id
        WHERE t.organization_id = $1 AND t.status = 'active'
      )
      SELECT *,
        expected_amount - total_paid as amount_owed,
        CEIL((expected_amount - total_paid) / monthly_rent) * 30 as days_overdue
      FROM expected_payments
      WHERE expected_amount - total_paid > 0
      AND CEIL((expected_amount - total_paid) / monthly_rent) * 30 >= $2
      ORDER BY (expected_amount - total_paid) DESC
    `;

        const result = await this.db.query(query, [organizationId, overdueThreshold]);

        return result.rows.map(row => ({
            tenancyId: row.tenancy_id,
            tenantId: row.tenant_id,
            propertyId: row.property_id,
            tenantName: row.tenant_name,
            tenantPhone: row.tenant_phone,
            tenantEmail: row.tenant_email,
            propertyTitle: row.property_title,
            monthlyRent: parseFloat(row.monthly_rent),
            totalPaid: parseFloat(row.total_paid),
            expectedAmount: parseFloat(row.expected_amount),
            amountOwed: parseFloat(row.amount_owed),
            daysOverdue: parseInt(row.days_overdue, 10)
        }));
    }

    /**
     * Generate rent collection report
     */
    async getCollectionReport(
        organizationId: string,
        startDate: string,
        endDate: string
    ): Promise<CollectionReport> {
        const query = `
      SELECT 
        COUNT(*) as total_payments,
        SUM(rp.payment_amount) as total_collected,
        SUM(rp.late_fees) as total_late_fees,
        COUNT(CASE WHEN rp.status = 'completed' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN rp.status = 'failed' THEN 1 END) as failed_payments,
        rp.payment_method::text as payment_method,
        SUM(CASE WHEN rp.payment_method::text LIKE 'mobile_money%' THEN rp.payment_amount ELSE 0 END) as mobile_money_total,
        SUM(CASE WHEN rp.payment_method::text IN ('bank_transfer', 'bank_deposit') THEN rp.payment_amount ELSE 0 END) as bank_total,
        SUM(CASE WHEN rp.payment_method::text = 'cash' THEN rp.payment_amount ELSE 0 END) as cash_total
      FROM rent_payments rp
      JOIN tenancies t ON rp.tenancy_id = t.id
      WHERE t.organization_id = $1
        AND rp.payment_date >= $2
        AND rp.payment_date <= $3
      GROUP BY rp.payment_method
    `;

        const result = await this.db.query(query, [organizationId, startDate, endDate]);

        // Aggregate results
        let totalCollected = 0;
        let totalLateFees = 0;
        let successfulPayments = 0;
        let failedPayments = 0;
        const byMethod: Record<string, number> = {};

        for (const row of result.rows) {
            totalCollected += parseFloat(row.total_collected) || 0;
            totalLateFees += parseFloat(row.total_late_fees) || 0;
            successfulPayments += parseInt(row.successful_payments, 10) || 0;
            failedPayments += parseInt(row.failed_payments, 10) || 0;
            byMethod[row.payment_method] = parseFloat(row.total_collected) || 0;
        }

        // Get expected rent for the period
        const expectedQuery = `
      SELECT SUM(monthly_rent) as expected_monthly
      FROM tenancies
      WHERE organization_id = $1 AND status = 'active'
    `;
        const expectedResult = await this.db.query(expectedQuery, [organizationId]);
        const expectedMonthly = parseFloat(expectedResult.rows[0]?.expected_monthly) || 0;

        // Calculate months in period
        const start = new Date(startDate);
        const end = new Date(endDate);
        const monthsInPeriod = (end.getFullYear() - start.getFullYear()) * 12 +
            (end.getMonth() - start.getMonth()) + 1;
        const expectedTotal = expectedMonthly * monthsInPeriod;

        const collectionRate = expectedTotal > 0 ? (totalCollected / expectedTotal) * 100 : 0;

        return {
            period: { startDate, endDate },
            totalCollected,
            totalExpected: expectedTotal,
            collectionRate: Math.round(collectionRate * 100) / 100,
            totalLateFees,
            paymentCount: successfulPayments + failedPayments,
            successfulPayments,
            failedPayments,
            byPaymentMethod: byMethod
        };
    }

    /**
     * Generate rent invoice
     */
    async generateInvoice(
        tenancyId: string,
        organizationId: string,
        periodStart: string,
        periodEnd: string
    ): Promise<RentInvoice> {
        const tenancyQuery = `
      SELECT 
        t.*,
        tn.full_name as tenant_name,
        tn.email as tenant_email,
        tn.phone_primary as tenant_phone,
        p.title as property_title,
        p.address_street as property_address
      FROM tenancies t
      JOIN tenants tn ON t.tenant_id = tn.id
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND t.organization_id = $2
    `;

        const tenancyResult = await this.db.query(tenancyQuery, [tenancyId, organizationId]);
        if (tenancyResult.rows.length === 0) {
            throw new Error('Tenancy not found');
        }

        const tenancy = tenancyResult.rows[0];
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

        // Check for any outstanding balance
        const paymentsQuery = `
      SELECT COALESCE(SUM(payment_amount), 0) as total_paid
      FROM rent_payments
      WHERE tenancy_id = $1 
        AND status = 'completed'
        AND period_start_date < $2
    `;
        const paymentsResult = await this.db.query(paymentsQuery, [tenancyId, periodStart]);

        const monthlyRent = parseFloat(tenancy.monthly_rent);
        const previousBalance = 0; // Simplified - could calculate from payment history

        return {
            invoiceNumber,
            tenancyId,
            tenantName: tenancy.tenant_name,
            tenantEmail: tenancy.tenant_email,
            tenantPhone: tenancy.tenant_phone,
            propertyTitle: tenancy.property_title,
            propertyAddress: tenancy.property_address,
            unitNumber: tenancy.unit_number,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            monthlyRent,
            previousBalance,
            lateFees: 0,
            otherCharges: [],
            totalDue: monthlyRent + previousBalance,
            dueDate: new Date(periodStart),
            generatedAt: new Date()
        };
    }

    // =====================================================
    // PRIVATE HELPER METHODS
    // =====================================================

    private mapRowToPayment(row: Record<string, unknown>): RentPayment {
        return {
            id: row.id as string,
            receiptNumber: row.receipt_number as string,
            tenancyId: row.tenancy_id as string,
            paymentAmount: parseFloat(row.payment_amount as string),
            currency: row.currency as string,
            paymentDate: row.payment_date as Date,
            paymentMethod: row.payment_method as PaymentMethod,
            mobileMoneyReference: row.mobile_money_reference as string | undefined,
            mobileMoneyNumber: row.mobile_money_number as string | undefined,
            bankReference: row.bank_reference as string | undefined,
            bankName: row.bank_name as string | undefined,
            periodStartDate: row.period_start_date as Date,
            periodEndDate: row.period_end_date as Date,
            lateFees: parseFloat(row.late_fees as string) || 0,
            otherCharges: (row.other_charges as OtherCharge[]) || [],
            status: row.status as PaymentStatus,
            notes: row.notes as string | undefined,
            recordedBy: row.recorded_by as string | undefined,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date
        };
    }

    private async createFinancialRecordForPayment(
        payment: Record<string, unknown>,
        tenancy: Record<string, unknown>,
        userId?: string
    ): Promise<void> {
        // Get property_id from tenancy
        const tenancyDetails = await this.db.query(
            `SELECT property_id, organization_id FROM tenancies WHERE id = $1`,
            [payment.tenancy_id]
        );

        if (tenancyDetails.rows.length === 0) return;

        const { property_id, organization_id } = tenancyDetails.rows[0];

        await this.db.query(
            `INSERT INTO property_financial_records (
        property_id, tenancy_id, organization_id, record_type,
        income_category, amount, currency, transaction_date,
        description, payment_method, payment_reference, recorded_by
      ) VALUES ($1, $2, $3, 'income', 'rental_income', $4, $5, $6, $7, $8, $9, $10)`,
            [
                property_id,
                payment.tenancy_id,
                organization_id,
                payment.payment_amount,
                payment.currency,
                payment.payment_date,
                `Rent payment - Receipt ${payment.receipt_number}`,
                payment.payment_method,
                payment.mobile_money_reference || payment.bank_reference,
                userId
            ]
        );
    }
}

// Additional interfaces
import { OtherCharge } from '../../../types/property-management.types';

interface DefaultingTenant {
    tenancyId: string;
    tenantId: string;
    propertyId: string;
    tenantName: string;
    tenantPhone: string;
    tenantEmail?: string;
    propertyTitle: string;
    monthlyRent: number;
    totalPaid: number;
    expectedAmount: number;
    amountOwed: number;
    daysOverdue: number;
}

interface CollectionReport {
    period: { startDate: string; endDate: string };
    totalCollected: number;
    totalExpected: number;
    collectionRate: number;
    totalLateFees: number;
    paymentCount: number;
    successfulPayments: number;
    failedPayments: number;
    byPaymentMethod: Record<string, number>;
}

interface RentInvoice {
    invoiceNumber: string;
    tenancyId: string;
    tenantName: string;
    tenantEmail?: string;
    tenantPhone: string;
    propertyTitle: string;
    propertyAddress: string;
    unitNumber?: string;
    periodStart: Date;
    periodEnd: Date;
    monthlyRent: number;
    previousBalance: number;
    lateFees: number;
    otherCharges: OtherCharge[];
    totalDue: number;
    dueDate: Date;
    generatedAt: Date;
}

// Export singleton instance
export const rentCollectionService = new RentCollectionService();
