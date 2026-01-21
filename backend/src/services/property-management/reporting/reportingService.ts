/**
 * Property Management Reporting Service
 * Phase 4.5: Enterprise Reporting & Analytics
 * 
 * Provides comprehensive reports for property management operations
 * 
 * @module services/property-management/reporting
 */

import db from '../../../database';
import { logger } from '../../../utils/logger';

export interface AgedReceivable {
    tenantId: string;
    tenantName: string;
    propertyId: string;
    propertyTitle: string;
    tenancyId: string;
    totalOwed: number;
    current: number;      // 0-30 days
    days30to60: number;   // 31-60 days
    days60to90: number;   // 61-90 days
    over90Days: number;   // 90+ days
    lastPaymentDate: Date | null;
    lastPaymentAmount: number | null;
}

export interface VacancyReport {
    propertyId: string;
    propertyTitle: string;
    propertyType: string;
    region: string;
    monthlyRent: number;
    vacantSince: Date | null;
    daysVacant: number;
    lostRevenue: number;
    status: string;
}

export interface PropertyPerformance {
    propertyId: string;
    propertyTitle: string;
    region: string;
    totalIncome: number;
    totalExpenses: number;
    netOperatingIncome: number;
    occupancyRate: number;
    averageRent: number;
    maintenanceCosts: number;
    roi: number;
    capRate: number;
}

export interface TenantTurnover {
    period: string;
    moveIns: number;
    moveOuts: number;
    netChange: number;
    turnoverRate: number;
    averageTenancyLength: number;
}

export interface MaintenanceAnalytics {
    totalWorkOrders: number;
    openOrders: number;
    completedOrders: number;
    averageResolutionTime: number;
    totalCost: number;
    costByCategory: Record<string, number>;
    vendorPerformance: Array<{
        vendorId: string;
        vendorName: string;
        completedJobs: number;
        averageRating: number;
        totalCost: number;
    }>;
}

export class ReportingService {
    /**
     * Generate Aged Receivables Report
     * Shows outstanding rent by aging buckets (0-30, 31-60, 61-90, 90+ days)
     */
    async getAgedReceivablesReport(organizationId: string): Promise<{
        data: AgedReceivable[];
        summary: {
            totalOutstanding: number;
            current: number;
            days30to60: number;
            days60to90: number;
            over90Days: number;
            tenantsWithArrears: number;
        };
    }> {
        const query = `
            WITH payment_summary AS (
                SELECT 
                    t.id as tenancy_id,
                    t.tenant_id,
                    t.property_id,
                    t.monthly_rent,
                    t.lease_start_date,
                    t.lease_end_date,
                    COALESCE(SUM(rp.payment_amount), 0) as total_paid,
                    MAX(rp.payment_date) as last_payment_date,
                    (SELECT payment_amount FROM rent_payments WHERE tenancy_id = t.id ORDER BY payment_date DESC LIMIT 1) as last_payment_amount
                FROM tenancies t
                LEFT JOIN rent_payments rp ON t.id = rp.tenancy_id AND rp.status = 'completed'
                WHERE t.organization_id = $1 AND t.status = 'active'
                GROUP BY t.id
            ),
            expected_rent AS (
                SELECT 
                    ps.*,
                    (
                        EXTRACT(YEAR FROM AGE(LEAST(CURRENT_DATE, ps.lease_end_date), ps.lease_start_date)) * 12 +
                        EXTRACT(MONTH FROM AGE(LEAST(CURRENT_DATE, ps.lease_end_date), ps.lease_start_date)) + 1
                    ) * ps.monthly_rent as expected_amount
                FROM payment_summary ps
            )
            SELECT 
                er.*,
                tn.full_name as tenant_name,
                p.title as property_title,
                er.expected_amount - er.total_paid as total_owed,
                CASE 
                    WHEN er.last_payment_date IS NULL THEN er.expected_amount - er.total_paid
                    WHEN EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) <= 30 THEN er.expected_amount - er.total_paid
                    ELSE 0 
                END as current_amount,
                CASE 
                    WHEN er.last_payment_date IS NOT NULL AND EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) BETWEEN 31 AND 60 
                    THEN er.monthly_rent 
                    ELSE 0 
                END as days_30_60,
                CASE 
                    WHEN er.last_payment_date IS NOT NULL AND EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) BETWEEN 61 AND 90 
                    THEN er.monthly_rent 
                    ELSE 0 
                END as days_60_90,
                CASE 
                    WHEN er.last_payment_date IS NOT NULL AND EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) > 90 
                    THEN er.expected_amount - er.total_paid 
                    ELSE 0 
                END as over_90
            FROM expected_rent er
            JOIN tenants tn ON er.tenant_id = tn.id
            JOIN properties p ON er.property_id = p.id
            WHERE er.expected_amount - er.total_paid > 0
            ORDER BY (er.expected_amount - er.total_paid) DESC
        `;

        const result = await db.query(query, [organizationId]);

        const data: AgedReceivable[] = result.rows.map(row => ({
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            propertyId: row.property_id,
            propertyTitle: row.property_title,
            tenancyId: row.tenancy_id,
            totalOwed: parseFloat(row.total_owed) || 0,
            current: parseFloat(row.current_amount) || 0,
            days30to60: parseFloat(row.days_30_60) || 0,
            days60to90: parseFloat(row.days_60_90) || 0,
            over90Days: parseFloat(row.over_90) || 0,
            lastPaymentDate: row.last_payment_date,
            lastPaymentAmount: row.last_payment_amount ? parseFloat(row.last_payment_amount) : null
        }));

        const summary = data.reduce((acc, item) => ({
            totalOutstanding: acc.totalOutstanding + item.totalOwed,
            current: acc.current + item.current,
            days30to60: acc.days30to60 + item.days30to60,
            days60to90: acc.days60to90 + item.days60to90,
            over90Days: acc.over90Days + item.over90Days,
            tenantsWithArrears: acc.tenantsWithArrears + 1
        }), {
            totalOutstanding: 0,
            current: 0,
            days30to60: 0,
            days60to90: 0,
            over90Days: 0,
            tenantsWithArrears: 0
        });

        return { data, summary };
    }

    /**
     * Generate Vacancy Report
     * Shows all vacant units and lost revenue
     */
    async getVacancyReport(organizationId: string): Promise<{
        data: VacancyReport[];
        summary: {
            totalVacantUnits: number;
            totalPotentialRent: number;
            averageDaysVacant: number;
            vacancyRate: number;
        };
    }> {
        const query = `
            SELECT 
                p.id as property_id,
                p.title as property_title,
                p.property_type,
                p.region,
                p.price as monthly_rent,
                p.status,
                (
                    SELECT MAX(lease_end_date) 
                    FROM tenancies 
                    WHERE property_id = p.id AND status IN ('expired', 'terminated')
                ) as last_tenancy_end,
                CASE 
                    WHEN NOT EXISTS (SELECT 1 FROM tenancies WHERE property_id = p.id AND status = 'active')
                    THEN CURRENT_DATE - COALESCE(
                        (SELECT MAX(lease_end_date) FROM tenancies WHERE property_id = p.id),
                        p.created_at::DATE
                    )
                    ELSE 0
                END as days_vacant
            FROM properties p
            WHERE p.organization_id = $1
            AND p.status NOT IN ('withdrawn', 'sold', 'rented')
            AND NOT EXISTS (
                SELECT 1 FROM tenancies WHERE property_id = p.id AND status = 'active'
            )
            ORDER BY days_vacant DESC
        `;

        const result = await db.query(query, [organizationId]);

        const totalPropertiesQuery = `SELECT COUNT(*) as count FROM properties WHERE organization_id = $1 AND status NOT IN ('withdrawn', 'sold', 'rented')`;
        const totalResult = await db.query(totalPropertiesQuery, [organizationId]);
        const totalProperties = parseInt(totalResult.rows[0].count);

        const data: VacancyReport[] = result.rows.map(row => ({
            propertyId: row.property_id,
            propertyTitle: row.property_title,
            propertyType: row.property_type,
            region: row.region,
            monthlyRent: parseFloat(row.monthly_rent) || 0,
            vacantSince: row.last_tenancy_end,
            daysVacant: parseInt(row.days_vacant) || 0,
            lostRevenue: (parseInt(row.days_vacant) || 0) / 30 * (parseFloat(row.monthly_rent) || 0),
            status: row.status
        }));

        const summary = {
            totalVacantUnits: data.length,
            totalPotentialRent: data.reduce((sum, item) => sum + item.monthlyRent, 0),
            averageDaysVacant: data.length > 0 
                ? Math.round(data.reduce((sum, item) => sum + item.daysVacant, 0) / data.length) 
                : 0,
            vacancyRate: totalProperties > 0 
                ? Math.round((data.length / totalProperties) * 100 * 10) / 10 
                : 0
        };

        return { data, summary };
    }

    /**
     * Generate Property Performance Report
     * Shows financial performance by property
     */
    async getPropertyPerformanceReport(
        organizationId: string,
        startDate: string,
        endDate: string
    ): Promise<PropertyPerformance[]> {
        const query = `
            WITH property_income AS (
                SELECT 
                    p.id as property_id,
                    COALESCE(SUM(CASE WHEN fr.record_type = 'income' THEN fr.amount ELSE 0 END), 0) as total_income,
                    COALESCE(SUM(CASE WHEN fr.record_type = 'expense' THEN fr.amount ELSE 0 END), 0) as total_expenses,
                    COALESCE(SUM(CASE WHEN fr.record_type = 'expense' AND fr.expense_category = 'maintenance_repairs' THEN fr.amount ELSE 0 END), 0) as maintenance_costs
                FROM properties p
                LEFT JOIN property_financial_records fr ON p.id = fr.property_id
                    AND fr.transaction_date BETWEEN $2 AND $3
                WHERE p.organization_id = $1 AND p.status NOT IN ('withdrawn', 'sold', 'rented')
                GROUP BY p.id
            ),
            tenancy_stats AS (
                SELECT 
                    p.id as property_id,
                    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'active') as active_tenancies,
                    AVG(t.monthly_rent) as average_rent
                FROM properties p
                LEFT JOIN tenancies t ON p.id = t.property_id
                WHERE p.organization_id = $1
                GROUP BY p.id
            )
            SELECT 
                p.id as property_id,
                p.title as property_title,
                p.region,
                p.price as property_value,
                pi.total_income,
                pi.total_expenses,
                pi.total_income - pi.total_expenses as noi,
                pi.maintenance_costs,
                ts.average_rent,
                CASE WHEN ts.active_tenancies > 0 THEN 100 ELSE 0 END as occupancy_rate
            FROM properties p
            JOIN property_income pi ON p.id = pi.property_id
            LEFT JOIN tenancy_stats ts ON p.id = ts.property_id
            WHERE p.organization_id = $1 AND p.status NOT IN ('withdrawn', 'sold', 'rented')
            ORDER BY (pi.total_income - pi.total_expenses) DESC
        `;

        const result = await db.query(query, [organizationId, startDate, endDate]);

        return result.rows.map(row => {
            const noi = parseFloat(row.noi) || 0;
            const propertyValue = parseFloat(row.property_value) || 1;
            
            return {
                propertyId: row.property_id,
                propertyTitle: row.property_title,
                region: row.region,
                totalIncome: parseFloat(row.total_income) || 0,
                totalExpenses: parseFloat(row.total_expenses) || 0,
                netOperatingIncome: noi,
                occupancyRate: parseFloat(row.occupancy_rate) || 0,
                averageRent: parseFloat(row.average_rent) || 0,
                maintenanceCosts: parseFloat(row.maintenance_costs) || 0,
                roi: propertyValue > 0 ? Math.round((noi / propertyValue) * 100 * 100) / 100 : 0,
                capRate: propertyValue > 0 ? Math.round((noi / propertyValue) * 100 * 100) / 100 : 0
            };
        });
    }

    /**
     * Generate Tenant Turnover Report
     * Shows move-ins, move-outs, and turnover rates by period
     */
    async getTenantTurnoverReport(
        organizationId: string,
        startDate: string,
        endDate: string
    ): Promise<TenantTurnover[]> {
        const query = `
            WITH monthly_activity AS (
                SELECT 
                    TO_CHAR(date_trunc('month', lease_start_date), 'YYYY-MM') as period,
                    COUNT(*) as move_ins,
                    0 as move_outs
                FROM tenancies
                WHERE organization_id = $1
                AND lease_start_date BETWEEN $2 AND $3
                GROUP BY date_trunc('month', lease_start_date)
                
                UNION ALL
                
                SELECT 
                    TO_CHAR(date_trunc('month', COALESCE(terminated_at, lease_end_date)), 'YYYY-MM') as period,
                    0 as move_ins,
                    COUNT(*) as move_outs
                FROM tenancies
                WHERE organization_id = $1
                AND status IN ('expired', 'terminated')
                AND COALESCE(terminated_at, lease_end_date) BETWEEN $2 AND $3
                GROUP BY date_trunc('month', COALESCE(terminated_at, lease_end_date))
            ),
            aggregated AS (
                SELECT 
                    period,
                    SUM(move_ins) as move_ins,
                    SUM(move_outs) as move_outs
                FROM monthly_activity
                GROUP BY period
            )
            SELECT 
                period,
                move_ins,
                move_outs,
                move_ins - move_outs as net_change
            FROM aggregated
            ORDER BY period
        `;

        const result = await db.query(query, [organizationId, startDate, endDate]);

        // Get average tenancy length
        const avgLengthQuery = `
            SELECT AVG(
                CASE 
                    WHEN status IN ('expired', 'terminated') 
                    THEN EXTRACT(DAY FROM (COALESCE(terminated_at, lease_end_date)::timestamp - lease_start_date::timestamp))
                    ELSE EXTRACT(DAY FROM (CURRENT_DATE::timestamp - lease_start_date::timestamp))
                END
            ) / 30 as avg_months
            FROM tenancies
            WHERE organization_id = $1
        `;
        const avgResult = await db.query(avgLengthQuery, [organizationId]);
        const avgTenancyLength = parseFloat(avgResult.rows[0]?.avg_months) || 0;

        // Get total active tenancies for turnover rate calculation
        const activeQuery = `SELECT COUNT(*) as count FROM tenancies WHERE organization_id = $1 AND status = 'active'`;
        const activeResult = await db.query(activeQuery, [organizationId]);
        const activeCount = parseInt(activeResult.rows[0].count) || 1;

        return result.rows.map(row => ({
            period: row.period,
            moveIns: parseInt(row.move_ins) || 0,
            moveOuts: parseInt(row.move_outs) || 0,
            netChange: parseInt(row.net_change) || 0,
            turnoverRate: Math.round((parseInt(row.move_outs) / activeCount) * 100 * 10) / 10,
            averageTenancyLength: Math.round(avgTenancyLength * 10) / 10
        }));
    }

    /**
     * Generate Maintenance Analytics Report
     */
    async getMaintenanceAnalytics(
        organizationId: string,
        startDate: string,
        endDate: string
    ): Promise<MaintenanceAnalytics> {
        const mainQuery = `
            SELECT 
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE status IN ('open', 'assigned', 'in_progress')) as open_orders,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
                AVG(
                    CASE WHEN completed_at IS NOT NULL 
                    THEN EXTRACT(HOURS FROM (completed_at - created_at)) 
                    END
                ) as avg_resolution_hours,
                COALESCE(SUM(actual_cost), 0) as total_cost
            FROM maintenance_work_orders
            WHERE organization_id = $1
            AND created_at BETWEEN $2 AND $3
        `;

        const categoryQuery = `
            SELECT 
                category,
                COALESCE(SUM(actual_cost), 0) as cost
            FROM maintenance_work_orders
            WHERE organization_id = $1
            AND created_at BETWEEN $2 AND $3
            GROUP BY category
        `;

        const vendorQuery = `
            SELECT 
                v.id as vendor_id,
                v.business_name as vendor_name,
                COUNT(wo.id) as completed_jobs,
                v.average_rating,
                COALESCE(SUM(wo.actual_cost), 0) as total_cost
            FROM vendors v
            LEFT JOIN maintenance_work_orders wo ON v.id = wo.assigned_vendor_id
                AND wo.status = 'completed'
                AND wo.created_at BETWEEN $2 AND $3
            WHERE v.organization_id = $1
            GROUP BY v.id, v.business_name, v.average_rating
            ORDER BY completed_jobs DESC
        `;

        const [mainResult, categoryResult, vendorResult] = await Promise.all([
            db.query(mainQuery, [organizationId, startDate, endDate]),
            db.query(categoryQuery, [organizationId, startDate, endDate]),
            db.query(vendorQuery, [organizationId, startDate, endDate])
        ]);

        const main = mainResult.rows[0];
        const costByCategory: Record<string, number> = {};
        categoryResult.rows.forEach(row => {
            costByCategory[row.category] = parseFloat(row.cost) || 0;
        });

        return {
            totalWorkOrders: parseInt(main.total_orders) || 0,
            openOrders: parseInt(main.open_orders) || 0,
            completedOrders: parseInt(main.completed_orders) || 0,
            averageResolutionTime: Math.round(parseFloat(main.avg_resolution_hours) || 0),
            totalCost: parseFloat(main.total_cost) || 0,
            costByCategory,
            vendorPerformance: vendorResult.rows.map(row => ({
                vendorId: row.vendor_id,
                vendorName: row.vendor_name,
                completedJobs: parseInt(row.completed_jobs) || 0,
                averageRating: parseFloat(row.average_rating) || 0,
                totalCost: parseFloat(row.total_cost) || 0
            }))
        };
    }
}

export const reportingService = new ReportingService();
