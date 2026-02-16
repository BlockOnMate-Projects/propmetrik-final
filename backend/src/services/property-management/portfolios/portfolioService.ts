
import db from '../../../database';
import {
    PortfolioMetrics,
    PortfolioValue,
    PortfolioComposition,
    LeasePortfolioSummary,
    IncomeCategory,
    ExpenseCategory,
    TenantStatus,
    TenancyStatus,
    WorkOrderStatus,
    PaymentStatus
} from '../../../types/property-management.types';

export class PortfolioService {
    /**
     * Get high-level portfolio metrics for dashboard
     */
    async getOverview(organizationId: string): Promise<PortfolioMetrics> {
        const queries = {
            properties: `SELECT COUNT(*) as count FROM properties WHERE organization_id = $1`,
            propertiesLastMonth: `SELECT COUNT(*) as count FROM properties WHERE organization_id = $1 AND created_at < DATE_TRUNC('month', CURRENT_DATE)`,
            tenants: `SELECT COUNT(*) as count FROM tenants WHERE organization_id = $1 AND status = 'active'`,
            tenancies: `SELECT COUNT(*) as count FROM tenancies WHERE organization_id = $1 AND status = 'active'`,
            workOrders: `SELECT COUNT(*) as count FROM maintenance_work_orders WHERE organization_id = $1 AND status IN ('open', 'assigned', 'in_progress')`,
            incomeCurrentMonth: `
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM property_financial_records 
                WHERE organization_id = $1 
                AND record_type = 'income'
                AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
            `,
            incomeLastMonth: `
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM property_financial_records 
                WHERE organization_id = $1 
                AND record_type = 'income'
                AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                AND transaction_date < DATE_TRUNC('month', CURRENT_DATE)
            `,
            overduePayments: `
                SELECT COUNT(*) as count 
                FROM tenancies t
                JOIN rent_payments p ON t.id = p.tenancy_id
                WHERE t.organization_id = $1 
                AND p.status = 'pending' 
                AND p.payment_date < CURRENT_DATE
            `,
            totalValue: `
                SELECT COALESCE(SUM(price), 0) as total,
                       COALESCE((
                           SELECT SUM(fr.amount) FROM property_financial_records fr
                           JOIN properties p2 ON fr.property_id = p2.id
                           WHERE p2.organization_id = $1
                             AND fr.record_type = 'income'
                             AND fr.transaction_date >= (CURRENT_DATE - INTERVAL '12 months')
                       ), 0) as annual_income
                FROM properties WHERE organization_id = $1`
        };

        const [
            propRes, propLastMonthRes, tenantRes, tenancyRes, woRes, incomeRes, incomeLastMonthRes, overdueRes, valueRes
        ] = await Promise.all([
            db.query(queries.properties, [organizationId]),
            db.query(queries.propertiesLastMonth, [organizationId]),
            db.query(queries.tenants, [organizationId]),
            db.query(queries.tenancies, [organizationId]),
            db.query(queries.workOrders, [organizationId]),
            db.query(queries.incomeCurrentMonth, [organizationId]),
            db.query(queries.incomeLastMonth, [organizationId]),
            db.query(queries.overduePayments, [organizationId]),
            db.query(queries.totalValue, [organizationId])
        ]);

        const totalProperties = parseInt(propRes.rows[0].count);
        const propertiesLastMonth = parseInt(propLastMonthRes.rows[0].count);
        const propertyGrowth = propertiesLastMonth > 0 ? ((totalProperties - propertiesLastMonth) / propertiesLastMonth) * 100 : 0;

        const activeTenancies = parseInt(tenancyRes.rows[0].count);
        const occupancyRate = totalProperties > 0 ? (activeTenancies / totalProperties) * 100 : 0;

        const currentIncome = parseFloat(incomeRes.rows[0].total);
        const lastMonthIncome = parseFloat(incomeLastMonthRes.rows[0].total);
        const incomeTrend = lastMonthIncome > 0 ? ((currentIncome - lastMonthIncome) / lastMonthIncome) * 100 : 0;

        const purchasePrice = parseFloat(valueRes.rows[0].total);
        const annualIncome = parseFloat(valueRes.rows[0].annual_income || 0);
        const incomeBasedValue = annualIncome > 0 ? annualIncome / 0.07 : 0; // 7% cap rate
        const totalValue = parseFloat(Math.max(incomeBasedValue, purchasePrice).toFixed(2));

        return {
            totalProperties,
            propertyGrowth: parseFloat(propertyGrowth.toFixed(1)),
            occupancyRate: parseFloat(occupancyRate.toFixed(1)),
            occupancyTrend: 0.5, // Placeholder for snapshot comparison
            monthlyIncome: currentIncome,
            incomeTrend: parseFloat(incomeTrend.toFixed(1)),
            totalValue,
            valueTrend: 2.4, // Placeholder
            totalTenants: parseInt(tenantRes.rows[0].count),
            activeTenancies,
            pendingWorkOrders: parseInt(woRes.rows[0].count),
            overduePayments: parseInt(overdueRes.rows[0].count),
            collectionRate: 94.2 // Placeholder
        };
    }

    /**
     * Get portfolio composition breakdown
     */
    async getPortfolioComposition(organizationId: string): Promise<PortfolioComposition> {
        const queries = {
            byType: `
                SELECT property_type as type, COUNT(*) as count, SUM(price) as value 
                FROM properties 
                WHERE organization_id = $1 
                GROUP BY property_type
            `,
            byRegion: `
                SELECT region, COUNT(*) as count, SUM(price) as value 
                FROM properties 
                WHERE organization_id = $1 
                GROUP BY region
            `,
            byStatus: `
                SELECT status, COUNT(*) as count, SUM(price) as value 
                FROM properties 
                WHERE organization_id = $1 
                GROUP BY status
            `
        };

        const [typeRes, regionRes, statusRes] = await Promise.all([
            db.query(queries.byType, [organizationId]),
            db.query(queries.byRegion, [organizationId]),
            db.query(queries.byStatus, [organizationId])
        ]);

        return {
            byType: typeRes.rows.map(r => ({ type: r.type, count: parseInt(r.count), value: parseFloat(r.value || 0) })),
            byRegion: regionRes.rows.map(r => ({ region: r.region, count: parseInt(r.count), value: parseFloat(r.value || 0) })),
            byStatus: statusRes.rows.map(r => ({ status: r.status, count: parseInt(r.count), value: parseFloat(r.value || 0) }))
        };
    }

    /**
     * Get global lease portfolio summary
     */
    async getLeasePortfolioSummary(organizationId: string): Promise<LeasePortfolioSummary> {
        const queries = {
            counts: `
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'active') as active_leases,
                    COUNT(*) as total_leases,
                    COALESCE(SUM(monthly_rent), 0) as total_revenue
                FROM tenancies 
                WHERE organization_id = $1
            `,
            totalUnits: `SELECT COUNT(*) as count FROM properties WHERE organization_id = $1`,
            expiringSoon: `
                SELECT 
                    COUNT(*) FILTER (WHERE lease_end_date <= CURRENT_DATE + INTERVAL '30 days' AND status = 'active') as within_30,
                    COUNT(*) FILTER (WHERE lease_end_date <= CURRENT_DATE + INTERVAL '60 days' AND status = 'active') as within_60,
                    COUNT(*) FILTER (WHERE lease_end_date <= CURRENT_DATE + INTERVAL '90 days' AND status = 'active') as within_90
                FROM tenancies 
                WHERE organization_id = $1
            `
        };

        const [countsRes, unitsRes, expiringRes] = await Promise.all([
            db.query(queries.counts, [organizationId]),
            db.query(queries.totalUnits, [organizationId]),
            db.query(queries.expiringSoon, [organizationId])
        ]);

        const totalUnits = parseInt(unitsRes.rows[0].count);
        const activeLeases = parseInt(countsRes.rows[0].active_leases);
        const occupancyRate = totalUnits > 0 ? (activeLeases / totalUnits) * 100 : 0;

        return {
            globalOccupancyRate: parseFloat(occupancyRate.toFixed(1)),
            activeLeases,
            totalUnits,
            expiringSoon: {
                within30Days: parseInt(expiringRes.rows[0].within_30),
                within60Days: parseInt(expiringRes.rows[0].within_60),
                within90Days: parseInt(expiringRes.rows[0].within_90)
            },
            totalMonthlyRevenue: parseFloat(countsRes.rows[0].total_revenue),
            revenueCurrency: 'GHS'
        };
    }

    /**
     * Get detailed portfolio value statistics
     * Uses income capitalization: estimated market value = Annual Income / market cap rate
     * Falls back to price column when no income data exists
     */
    async getPortfolioValue(organizationId: string): Promise<PortfolioValue> {
        // Get purchase/listing price sum
        const priceQuery = `
            SELECT COALESCE(SUM(price), 0) as total_price
            FROM properties 
            WHERE organization_id = $1
        `;
        const priceResult = await db.query(priceQuery, [organizationId]);
        const purchaseValue = parseFloat(priceResult.rows[0].total_price || 0);

        // Calculate income-based valuation from actual rental data
        const incomeQuery = `
            SELECT COALESCE(SUM(fr.amount), 0) as annual_income
            FROM property_financial_records fr
            JOIN properties p ON fr.property_id = p.id
            WHERE p.organization_id = $1
              AND fr.record_type = 'income'
              AND fr.transaction_date >= (CURRENT_DATE - INTERVAL '12 months')
        `;
        const incomeResult = await db.query(incomeQuery, [organizationId]);
        const annualIncome = parseFloat(incomeResult.rows[0].annual_income || 0);

        // Use a market cap rate (7% is typical for residential in Ghana) to derive market value
        const marketCapRate = 0.07;
        const incomeBasedValue = annualIncome > 0 ? annualIncome / marketCapRate : 0;

        // Use the higher of income-based or purchase value
        const totalValue = Math.max(incomeBasedValue, purchaseValue);
        const appreciationAmount = totalValue - purchaseValue;
        const appreciationPercentage = purchaseValue > 0 
            ? parseFloat(((appreciationAmount / purchaseValue) * 100).toFixed(1))
            : 0;

        return {
            totalValue: parseFloat(totalValue.toFixed(2)),
            currentMarketValue: parseFloat(incomeBasedValue.toFixed(2)),
            purchaseValue,
            appreciationAmount: parseFloat(appreciationAmount.toFixed(2)),
            appreciationPercentage,
            lastUpdated: new Date(),
            valuationConfidence: annualIncome > 0 ? 85 : 50
        };
    }

    /**
     * Get occupancy trends (last 6 months)
     */
    async getOccupancyTrends(organizationId: string): Promise<{ month: string, rate: number }[]> {
        // Dummy data for visual charts until historical snapshotting is implemented
        return [
            { month: 'Jul', rate: 82 },
            { month: 'Aug', rate: 84 },
            { month: 'Sep', rate: 85 },
            { month: 'Oct', rate: 88 },
            { month: 'Nov', rate: 91 },
            { month: 'Dec', rate: occupancyRatePlaceholderValue(92.5) },
        ];
    }
}

function occupancyRatePlaceholderValue(val: number) { return val; }

export const portfolioService = new PortfolioService();
