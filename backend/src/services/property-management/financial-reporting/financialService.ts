
import { v4 as uuidv4 } from 'uuid';
import db from '../../../database';
import {
    FinancialRecord,
    CreateFinancialRecordDto,
    FinancialFilters,
    PaginationParams,
    PaginatedResponse,
    CashFlowAnalysis,
    MonthlyFinancials,
    ROIAnalysis
} from '../../../types/property-management.types';
import { AppError } from '../../../middleware/errorHandler';

export class FinancialService {
    /**
     * Record a financial transaction (income or expense)
     */
    async createRecord(organizationId: string, data: CreateFinancialRecordDto, userId: string): Promise<FinancialRecord> {
        const id = uuidv4();

        const query = `
      INSERT INTO property_financial_records (
        id, organization_id, property_id, tenancy_id, work_order_id,
        record_type, income_category, expense_category,
        amount, currency, transaction_date, description,
        payment_method, payment_reference, vendor_id,
        is_tax_deductible, tax_category,
        recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

        const values = [
            id,
            organizationId,
            data.propertyId,
            data.tenancyId || null,
            data.workOrderId || null,
            data.recordType,
            data.incomeCategory || null,
            data.expenseCategory || null,
            data.amount,
            data.currency || 'GHS',
            data.transactionDate,
            data.description || null,
            data.paymentMethod || null,
            data.paymentReference || null,
            data.vendorId || null,
            data.isTaxDeductible || false,
            data.taxCategory || null,
            userId
        ];

        const result = await db.query(query, values);
        const record = this.mapToRecord(result.rows[0]);

        // Track contribution for Data Hub
        try {
            const { ServiceHooks } = await import('../../data-hub/serviceHooks');
            await ServiceHooks.createContribution({
                contributor_id: userId || null,
                organization_id: organizationId,
                contribution_type: record.recordType === 'income' ? 'transaction' : 'comparable',
                source_context: 'property_management',
                source_id: record.id,
                data: {
                    financial_record_id: record.id,
                    property_id: record.propertyId,
                    amount: record.amount,
                    currency: record.currency,
                    record_type: record.recordType,
                    category: record.incomeCategory || record.expenseCategory,
                    transaction_date: record.transactionDate,
                    action: 'financial_record_creation'
                }
            });
        } catch (hookError) {
            console.error('Failed to create financial contribution hook', hookError);
        }

        return record;
    }

    /**
     * List financial records with filters
     */
    async listRecords(
        organizationId: string,
        filters: FinancialFilters,
        pagination: PaginationParams
    ): Promise<PaginatedResponse<FinancialRecord>> {
        const { page = 1, limit = 20, sortBy = 'transaction_date', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        const conditions = [`r.organization_id = $1`];
        const values: any[] = [organizationId];
        let paramIndex = 2;

        if (filters.propertyId) {
            conditions.push(`r.property_id = $${paramIndex}`);
            values.push(filters.propertyId);
            paramIndex++;
        }

        if (filters.recordType) {
            conditions.push(`r.record_type = $${paramIndex}`);
            values.push(filters.recordType);
            paramIndex++;
        }

        if (filters.dateFrom) {
            conditions.push(`r.transaction_date >= $${paramIndex}`);
            values.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            conditions.push(`r.transaction_date <= $${paramIndex}`);
            values.push(filters.dateTo);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total
        const countQuery = `SELECT COUNT(*) FROM property_financial_records r ${whereClause}`;
        const countResult = await db.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Get Data with Vendor Join
        const query = `
      SELECT r.*, 
             v.business_name as vendor_name 
      FROM property_financial_records r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      ${whereClause}
      ORDER BY r.${sortBy} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

        values.push(limit, offset);

        const result = await db.query(query, values);
        const data = result.rows.map(row => {
            const record = this.mapToRecord(row);
            if (row.vendor_id) {
                record.vendor = {
                    id: row.vendor_id,
                    businessName: row.vendor_name
                } as any;
            }
            return record;
        });

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrevious: page > 1
        };
    }

    /**
     * Calculate Cash Flow (P&L) for a period
     */
    async getCashFlowAnalysis(
        organizationId: string,
        propertyId: string | undefined,
        startDate: string,
        endDate: string
    ): Promise<CashFlowAnalysis> {
        // 1. Get Totals
        const query = `
      SELECT 
        record_type, 
        COALESCE(income_category::text, expense_category::text) as category,
        SUM(amount) as total
      FROM property_financial_records
      WHERE organization_id = $1
      AND transaction_date BETWEEN $2 AND $3
      ${propertyId ? 'AND property_id = $4' : ''}
      GROUP BY record_type, category
    `;

        const params: any[] = [organizationId, startDate, endDate];
        if (propertyId) params.push(propertyId);

        const result = await db.query(query, params);

        let totalIncome = 0;
        let totalExpenses = 0;
        const incomeByCategory: Record<string, number> = {};
        const expensesByCategory: Record<string, number> = {};

        result.rows.forEach(row => {
            const amount = parseFloat(row.total);
            if (row.record_type === 'income') {
                totalIncome += amount;
                if (row.category) incomeByCategory[row.category] = amount;
            } else {
                totalExpenses += amount;
                if (row.category) expensesByCategory[row.category] = amount;
            }
        });

        // 2. Get Monthly Breakdown
        const monthlyQuery = `
      SELECT 
        TO_CHAR(transaction_date, 'YYYY-MM') as month,
        SUM(CASE WHEN record_type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN record_type = 'expense' THEN amount ELSE 0 END) as expenses
      FROM property_financial_records
      WHERE organization_id = $1
      AND transaction_date BETWEEN $2 AND $3
      ${propertyId ? 'AND property_id = $4' : ''}
      GROUP BY month
      ORDER BY month ASC
    `;

        const monthlyResult = await db.query(monthlyQuery, params);
        const monthlyBreakdown: MonthlyFinancials[] = monthlyResult.rows.map(row => ({
            month: row.month,
            income: parseFloat(row.income),
            expenses: parseFloat(row.expenses),
            netCashFlow: parseFloat(row.income) - parseFloat(row.expenses)
        }));

        return {
            period: {
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            },
            totalIncome,
            totalExpenses,
            netCashFlow: totalIncome - totalExpenses,
            incomeByCategory: incomeByCategory as any,
            expensesByCategory: expensesByCategory as any,
            monthlyBreakdown
        };
    }

    /**
     * Calculate ROI for a specific property
     */
    async calculateROI(organizationId: string, propertyId: string): Promise<ROIAnalysis> {
        // 1. Get Property Purchase Price / Current Value
        const propRes = await db.query(
            `SELECT price, price_currency FROM properties WHERE id = $1 AND organization_id = $2`,
            [propertyId, organizationId]
        );

        if (propRes.rows.length === 0) throw new AppError('Property not found', 404);
        const purchasePrice = parseFloat(propRes.rows[0].price); // Assuming stored price is purchase price

        // TODO: Ideally fetch current valuation from Valuation module. Using purchase price for now.
        const currentValue = purchasePrice * 1.05; // Dummy 5% appreciation

        // 2. Get All-time Cash Flow
        const cfRes = await db.query(`
        SELECT 
            SUM(CASE WHEN record_type = 'income' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN record_type = 'expense' THEN amount ELSE 0 END) as expenses
        FROM property_financial_records
        WHERE property_id = $1
    `, [propertyId]);

        const totalIncome = parseFloat(cfRes.rows[0].income || '0');
        const totalExpenses = parseFloat(cfRes.rows[0].expenses || '0');
        const netIncome = totalIncome - totalExpenses;
        const capitalGain = currentValue - purchasePrice;
        const totalReturn = netIncome + capitalGain;

        // ROI
        const annualizedROI = purchasePrice > 0 ? (netIncome / purchasePrice) * 100 : 0; // Simplified
        const cashOnCashReturn = purchasePrice > 0 ? (netIncome / purchasePrice) * 100 : 0; // Assuming all cash
        const capRate = currentValue > 0 ? (netIncome / currentValue) * 100 : 0;

        return {
            propertyId,
            purchasePrice,
            currentValue,
            totalIncome,
            totalExpenses,
            netIncome,
            capitalGain,
            totalReturn,
            annualizedROI: parseFloat(annualizedROI.toFixed(2)),
            cashOnCashReturn: parseFloat(cashOnCashReturn.toFixed(2)),
            capRate: parseFloat(capRate.toFixed(2))
        };
    }

    private mapToRecord(row: any): FinancialRecord {
        return {
            id: row.id,
            organizationId: row.organization_id,
            propertyId: row.property_id,
            tenancyId: row.tenancy_id,
            workOrderId: row.work_order_id,
            referenceNumber: row.reference_number,
            recordType: row.record_type,
            incomeCategory: row.income_category,
            expenseCategory: row.expense_category,
            amount: parseFloat(row.amount),
            currency: row.currency,
            transactionDate: row.transaction_date,
            description: row.description,
            paymentMethod: row.payment_method,
            paymentReference: row.payment_reference,
            vendorId: row.vendor_id,
            invoiceUrl: row.invoice_url,
            receiptUrl: row.receipt_url,
            isTaxDeductible: row.is_tax_deductible,
            taxCategory: row.tax_category,
            recordedBy: row.recorded_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const financialService = new FinancialService();
