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
import { getGhsRateMap, ghsValueSql, ghsHistoricalValueSql } from '../utils/currencyFx';

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
        // Outstanding receivables are a current monetary asset, so they are remeasured at
        // the live rate (IAS 21), normalized per tenancy by its rent currency.
        const fx = await getGhsRateMap();
        const owedGhs = ghsValueSql('er.expected_amount - er.total_paid', 'er.rent_currency', fx);
        const rentRowGhs = ghsValueSql('er.monthly_rent', 'er.rent_currency', fx);
        const query = `
            WITH payment_summary AS (
                SELECT
                    t.id as tenancy_id,
                    t.tenant_id,
                    t.property_id,
                    t.monthly_rent,
                    t.rent_currency,
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
                    COALESCE(
                        (SELECT SUM(rs.expected_amount) 
                         FROM rent_schedules rs 
                         WHERE rs.tenancy_id = ps.tenancy_id 
                           AND rs.period_start_date <= CURRENT_DATE),
                        (
                            EXTRACT(YEAR FROM AGE(LEAST(CURRENT_DATE, ps.lease_end_date), ps.lease_start_date)) * 12 +
                            EXTRACT(MONTH FROM AGE(LEAST(CURRENT_DATE, ps.lease_end_date), ps.lease_start_date)) + 1
                        ) * ps.monthly_rent
                    ) as expected_amount
                FROM payment_summary ps
            )
            SELECT
                er.*,
                tn.full_name as tenant_name,
                p.title as property_title,
                ${owedGhs} as total_owed,
                CASE
                    WHEN er.last_payment_date IS NULL THEN ${owedGhs}
                    WHEN EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) <= 30 THEN ${owedGhs}
                    ELSE 0
                END as current_amount,
                CASE
                    WHEN er.last_payment_date IS NOT NULL AND EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) BETWEEN 31 AND 60
                    THEN ${rentRowGhs}
                    ELSE 0
                END as days_30_60,
                CASE
                    WHEN er.last_payment_date IS NOT NULL AND EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) BETWEEN 61 AND 90
                    THEN ${rentRowGhs}
                    ELSE 0
                END as days_60_90,
                CASE
                    WHEN er.last_payment_date IS NOT NULL AND EXTRACT(DAY FROM (CURRENT_DATE - er.last_payment_date)) > 90
                    THEN ${owedGhs}
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
        // Projected rent is a present-day figure -> live rate, by the property's currency.
        const fx = await getGhsRateMap();
        const query = `
            SELECT
                p.id as property_id,
                p.title as property_title,
                p.property_type,
                p.region,
                ${ghsValueSql('p.price', 'p.price_currency', fx)} as monthly_rent,
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
        // Normalize per-record amounts and per-property value/rent to GHS so the report
        // (and the portfolio totals the frontend derives from it) never mix currencies.
        // Realized income/expense -> rate as of the record's transaction date; property
        // value and current rent are present-day figures -> live rate.
        const fx = await getGhsRateMap();
        const frGhs = ghsHistoricalValueSql('fr.amount', 'fr.currency', 'fr.transaction_date', fx);
        const priceGhs = ghsValueSql('p.price', 'p.price_currency', fx);
        const rentGhs = ghsValueSql('t.monthly_rent', 't.rent_currency', fx);
        const query = `
            WITH property_income AS (
                SELECT
                    p.id as property_id,
                    COALESCE(SUM(CASE WHEN fr.record_type = 'income' THEN ${frGhs} ELSE 0 END), 0) as total_income,
                    COALESCE(SUM(CASE WHEN fr.record_type = 'expense' THEN ${frGhs} ELSE 0 END), 0) as total_expenses,
                    COALESCE(SUM(CASE WHEN fr.record_type = 'expense' AND fr.expense_category = 'maintenance_repairs' THEN ${frGhs} ELSE 0 END), 0) as maintenance_costs
                FROM properties p
                LEFT JOIN property_financial_records fr ON p.id = fr.property_id
                    AND fr.transaction_date BETWEEN $2 AND $3
                WHERE p.organization_id = $1 AND p.status NOT IN ('withdrawn', 'sold', 'rented')
                GROUP BY p.id
            ),
            utility_expenses AS (
                SELECT 
                    t.property_id,
                    COALESCE(SUM(uc.amount), 0) as utility_total
                FROM utility_charges uc
                JOIN tenancies t ON uc.tenancy_id = t.id
                LEFT JOIN rent_schedules rs ON rs.id = uc.applied_to_schedule_id
                WHERE uc.organization_id = $1
                  AND uc.status IN ('applied', 'paid')
                  AND COALESCE(rs.period_start_date, uc.billing_period_start) <= $3::date
                  AND COALESCE(rs.period_start_date, uc.billing_period_start) >= $2::date
                GROUP BY t.property_id
            ),
            tenancy_stats AS (
                SELECT 
                    p.id as property_id,
                    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'active') as active_tenancies,
                    AVG(${rentGhs}) as average_rent
                FROM properties p
                LEFT JOIN tenancies t ON p.id = t.property_id
                WHERE p.organization_id = $1
                GROUP BY p.id
            )
            SELECT
                p.id as property_id,
                p.title as property_title,
                p.region,
                ${priceGhs} as property_value,
                pi.total_income,
                pi.total_expenses + COALESCE(ue.utility_total, 0) as total_expenses,
                pi.total_income - (pi.total_expenses + COALESCE(ue.utility_total, 0)) as noi,
                pi.maintenance_costs,
                COALESCE(ue.utility_total, 0) as utility_costs,
                ts.average_rent,
                CASE WHEN ts.active_tenancies > 0 THEN 100 ELSE 0 END as occupancy_rate
            FROM properties p
            JOIN property_income pi ON p.id = pi.property_id
            LEFT JOIN utility_expenses ue ON p.id = ue.property_id
            LEFT JOIN tenancy_stats ts ON p.id = ts.property_id
            WHERE p.organization_id = $1 AND p.status NOT IN ('withdrawn', 'sold', 'rented')
            ORDER BY (pi.total_income - (pi.total_expenses + COALESCE(ue.utility_total, 0))) DESC
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
     * Building-level performance: one row per ACTIVE top-level property (building or
     * standalone), with the financials of its units rolled up. This is the "individual
     * property" drill-down — e.g. a 12-unit building shows as a single property whose
     * income/expenses aggregate across all its units. Excludes withdrawn/sold rows.
     */
    async getBuildingPerformanceReport(
        organizationId: string,
        startDate: string,
        endDate: string
    ): Promise<{
        buildings: Array<{ id: string; title: string; region: string; units: number; occupied: number; income: number; expenses: number; noi: number; occupancyRate: number }>;
        propertyCount: number;
        unitCount: number;
        monthly: Array<{ month: string; income: number; expenses: number; net: number }>;
        totals: { income: number; expenses: number; net: number };
        byType: Array<{ type: string; value: number }>;
        byRegion: Array<{ region: string; count: number; value: number }>;
    }> {
        const fx = await getGhsRateMap();
        const frGhs = ghsHistoricalValueSql('fr.amount', 'fr.currency', 'fr.transaction_date', fx);
        const priceGhs = ghsValueSql('p.price', 'p.price_currency', fx);
        const query = `
            WITH buildings AS (
                SELECT p.id, p.title, p.region,
                    (SELECT COUNT(*) FROM properties u WHERE u.parent_property_id = p.id AND u.status NOT IN ('withdrawn', 'sold')) AS unit_count
                FROM properties p
                WHERE p.organization_id = $1 AND p.parent_property_id IS NULL AND p.status NOT IN ('withdrawn', 'sold')
            ),
            fin AS (
                SELECT COALESCE(p.parent_property_id, p.id) AS bid,
                    SUM(CASE WHEN fr.record_type = 'income' THEN ${frGhs} ELSE 0 END) AS income,
                    SUM(CASE WHEN fr.record_type = 'expense' THEN ${frGhs} ELSE 0 END) AS expenses
                FROM properties p
                JOIN property_financial_records fr ON fr.property_id = p.id AND fr.transaction_date BETWEEN $2 AND $3
                WHERE p.organization_id = $1
                GROUP BY COALESCE(p.parent_property_id, p.id)
            ),
            occ AS (
                SELECT COALESCE(p.parent_property_id, p.id) AS bid,
                    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tenancies t WHERE t.property_id = p.id AND t.status = 'active')) AS occupied
                FROM properties p
                WHERE p.organization_id = $1 AND p.status NOT IN ('withdrawn', 'sold')
                    AND (p.parent_property_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM properties c WHERE c.parent_property_id = p.id))
                GROUP BY COALESCE(p.parent_property_id, p.id)
            )
            SELECT b.id, b.title, b.region, b.unit_count,
                COALESCE(f.income, 0) AS income,
                COALESCE(f.expenses, 0) AS expenses,
                COALESCE(o.occupied, 0) AS occupied
            FROM buildings b
            LEFT JOIN fin f ON f.bid = b.id
            LEFT JOIN occ o ON o.bid = b.id
            ORDER BY (COALESCE(f.income, 0) - COALESCE(f.expenses, 0)) DESC, COALESCE(f.income, 0) DESC
        `;
        const res = await db.query(query, [organizationId, startDate, endDate]);
        const buildings = res.rows.map(r => {
            const units = parseInt(r.unit_count) || 0;
            const denom = units > 0 ? units : 1;
            const income = parseFloat(r.income) || 0;
            const expenses = parseFloat(r.expenses) || 0;
            const occupied = parseInt(r.occupied) || 0;
            return {
                id: r.id, title: r.title, region: r.region, units, occupied, income, expenses,
                noi: income - expenses,
                occupancyRate: Math.min(100, (occupied / denom) * 100),
            };
        });

        const countRes = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE parent_property_id IS NULL AND status NOT IN ('withdrawn', 'sold')) AS properties,
                COUNT(*) FILTER (WHERE status NOT IN ('withdrawn', 'sold')
                    AND (parent_property_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM properties c WHERE c.parent_property_id = properties.id))) AS units
            FROM properties
            WHERE organization_id = $1
        `, [organizationId]);

        // Monthly cash flow scoped to the SAME active buildings, so the cash-flow chart and
        // the drill-down totals reconcile (no income from withdrawn/test properties leaking in).
        const monthlyRes = await db.query(`
            SELECT TO_CHAR(fr.transaction_date, 'YYYY-MM') AS month,
                SUM(CASE WHEN fr.record_type = 'income' THEN ${frGhs} ELSE 0 END) AS income,
                SUM(CASE WHEN fr.record_type = 'expense' THEN ${frGhs} ELSE 0 END) AS expenses
            FROM property_financial_records fr
            JOIN properties p ON p.id = fr.property_id
            JOIN properties b ON b.id = COALESCE(p.parent_property_id, p.id)
            WHERE p.organization_id = $1
                AND fr.transaction_date BETWEEN $2 AND $3
                AND b.parent_property_id IS NULL AND b.status NOT IN ('withdrawn', 'sold')
            GROUP BY month
            ORDER BY month
        `, [organizationId, startDate, endDate]);

        const monthly = monthlyRes.rows.map(r => {
            const income = parseFloat(r.income) || 0;
            const expenses = parseFloat(r.expenses) || 0;
            return { month: r.month, income, expenses, net: income - expenses };
        });
        const totals = monthly.reduce((a, m) => ({ income: a.income + m.income, expenses: a.expenses + m.expenses, net: a.net + m.net }), { income: 0, expenses: 0, net: 0 });

        // Composition over ACTIVE rentable units (leaves) only, so the by-type/by-region
        // breakdown reconciles with the active property/unit counts above.
        const compRes = await db.query(`
            SELECT p.property_type AS type, p.region,
                COUNT(*) AS cnt,
                SUM(${priceGhs}) AS value
            FROM properties p
            WHERE p.organization_id = $1 AND p.status NOT IN ('withdrawn', 'sold')
                AND (p.parent_property_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM properties c WHERE c.parent_property_id = p.id))
            GROUP BY p.property_type, p.region
        `, [organizationId]);
        const typeMap: Record<string, number> = {};
        const regionMap: Record<string, { count: number; value: number }> = {};
        for (const r of compRes.rows) {
            const v = parseFloat(r.value) || 0;
            const c = parseInt(r.cnt) || 0;
            typeMap[r.type] = (typeMap[r.type] || 0) + v;
            if (!regionMap[r.region]) regionMap[r.region] = { count: 0, value: 0 };
            regionMap[r.region].count += c;
            regionMap[r.region].value += v;
        }
        const byType = Object.entries(typeMap).map(([type, value]) => ({ type, value }));
        const byRegion = Object.entries(regionMap).map(([region, o]) => ({ region, count: o.count, value: o.value }));

        return {
            buildings,
            propertyCount: parseInt(countRes.rows[0]?.properties) || buildings.length,
            unitCount: parseInt(countRes.rows[0]?.units) || 0,
            monthly,
            totals,
            byType,
            byRegion,
        };
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
                AND status IN ('active', 'expired', 'terminated', 'renewed')
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
            ),
            active_by_period AS (
                SELECT
                    a.period,
                    COUNT(DISTINCT t.id) as active_tenancies
                FROM aggregated a
                LEFT JOIN tenancies t ON t.organization_id = $1
                    AND t.status IN ('active', 'expired', 'terminated', 'renewed')
                    AND t.lease_start_date <= (to_date(a.period, 'YYYY-MM') + INTERVAL '1 month - 1 day')::date
                    AND COALESCE(t.terminated_at::date, t.lease_end_date) >= to_date(a.period, 'YYYY-MM')
                GROUP BY a.period
            )
            SELECT 
                a.period,
                a.move_ins,
                a.move_outs,
                a.move_ins - a.move_outs as net_change,
                COALESCE(NULLIF(abp.active_tenancies, 0), a.move_ins + a.move_outs, 1) as turnover_base
            FROM aggregated a
            LEFT JOIN active_by_period abp ON abp.period = a.period
            ORDER BY a.period
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
            turnoverRate: Math.round(((parseInt(row.move_outs) || 0) / (parseInt(row.turnover_base) || 1)) * 100 * 10) / 10,
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
