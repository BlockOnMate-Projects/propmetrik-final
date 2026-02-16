
'use client'

import React, { useEffect, useState, useMemo } from 'react'
import {
    Building2,
    Users,
    Wallet,
    AlertCircle,
    TrendingUp,
    TrendingDown,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
    Loader2,
    Wrench,
    Clock,
    FileText,
    PieChart as PieChartIcon,
    BarChart3,
    CalendarClock,
    CheckCircle2,
    CircleDot,
    ShieldAlert,
    Plus,
    ClipboardList,
    Home,
    Receipt,
    UserPlus,
    Mail,
    Eye
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { propertyManagementApi } from '@/lib/property-management-api'
import { PortfolioMetrics, PortfolioComposition, LeasePortfolioSummary } from '@/types/property-management'
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts'

// ─── Types ───────────────────────────────────────────────
interface WorkOrderStats {
    total: number
    byStatus: Record<string, number>
    urgentPending: number
    totalCosts: number
    avgResolutionDays: number
    byCategory: Record<string, number>
}

interface CashFlowData {
    totalIncome: number
    totalExpenses: number
    netCashFlow: number
    incomeByCategory: Record<string, number>
    expensesByCategory: Record<string, number>
    monthlyBreakdown: {
        month: string
        income: number
        expenses: number
        netCashFlow: number
        expectedRent: number
    }[]
}

interface ApplicationStats {
    total: number
    byStatus: Record<string, number>
    submittedThisMonth: number
    approvalRate: number
}

interface AgedReceivables {
    data: any[]
    summary: {
        totalOutstanding: number
        current: number
        days30to60: number
        days60to90: number
        over90Days: number
        tenantsWithArrears: number
    }
}

interface DashboardData {
    metrics: PortfolioMetrics | null
    composition: PortfolioComposition | null
    leases: LeasePortfolioSummary | null
    workOrders: WorkOrderStats | null
    cashFlow: CashFlowData | null
    applications: ApplicationStats | null
    receivables: AgedReceivables | null
}

// ─── Helpers ─────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtCurrency = (n: number) => `₵${fmt(n)}`
const monthLabel = (m: string) => {
    const [y, mo] = m.split('-')
    const d = new Date(Number(y), Number(mo) - 1)
    return d.toLocaleString('en', { month: 'short' })
}

const CHART_COLORS = ['#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#06b6d4', '#ec4899']

// ─── Component ───────────────────────────────────────────
export default function PropertyManagementDashboard() {
    const [data, setData] = useState<DashboardData>({
        metrics: null,
        composition: null,
        leases: null,
        workOrders: null,
        cashFlow: null,
        applications: null,
        receivables: null,
    })
    const [portfolioFinancials, setPortfolioFinancials] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                setIsLoading(true)
                // Current year cash flow
                const now = new Date()
                const year = now.getFullYear()
                const startDate = `${year}-01-01`
                const endDate = `${year}-12-31`
                // Also try next year if we're late in the year or have future leases
                const nextYear = year + 1
                const startDateNext = `${nextYear}-01-01`
                const endDateNext = `${nextYear}-12-31`

                const [metrics, composition, leases, workOrders, cashFlowCurrent, cashFlowNext, applications, receivables, portfolioFin] = await Promise.all([
                    propertyManagementApi.getPortfolioOverview().catch(() => null),
                    propertyManagementApi.getPortfolioComposition().catch(() => null),
                    propertyManagementApi.getLeasePortfolioSummary().catch(() => null),
                    propertyManagementApi.getWorkOrderStats().catch(() => null),
                    propertyManagementApi.getCashFlow({ startDate, endDate }).catch(() => null),
                    propertyManagementApi.getCashFlow({ startDate: startDateNext, endDate: endDateNext }).catch(() => null),
                    propertyManagementApi.getApplicationStats().catch(() => null),
                    propertyManagementApi.getAgedReceivablesReport().catch(() => null),
                    propertyManagementApi.getPortfolioFinancialSummary().catch(() => null),
                ])

                // Pick whichever year has data
                const cashFlow = (cashFlowCurrent?.totalIncome > 0 || cashFlowCurrent?.totalExpenses > 0)
                    ? cashFlowCurrent
                    : cashFlowNext

                setData({ metrics, composition, leases, workOrders, cashFlow, applications, receivables })
                setPortfolioFinancials(portfolioFin)
            } catch (err) {
                console.error('Dashboard load error:', err)
                setError('Failed to load dashboard data.')
            } finally {
                setIsLoading(false)
            }
        }
        load()
    }, [])

    // ─── Derived data ────────────────────────────────────
    const revenueChartData = useMemo(() => {
        if (!data.cashFlow?.monthlyBreakdown?.length) return []
        return data.cashFlow.monthlyBreakdown.map(m => ({
            month: monthLabel(m.month),
            'Actual Income': m.income,
            'Expected Rent': m.expectedRent || 0,
            'Expenses': m.expenses,
            'Net Cash Flow': m.netCashFlow,
        }))
    }, [data.cashFlow])

    const compositionChartData = useMemo(() => {
        if (!data.composition?.byType?.length) return []
        return data.composition.byType.map(t => ({
            name: t.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            value: t.count,
        }))
    }, [data.composition])

    const workOrderChartData = useMemo(() => {
        if (!data.workOrders?.byCategory) return []
        return Object.entries(data.workOrders.byCategory).map(([cat, count]) => ({
            name: cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            count,
        }))
    }, [data.workOrders])

    const { metrics, leases, workOrders, applications, receivables, cashFlow } = data
    const collectionRate = metrics?.collectionRate ?? 0

    if (error) {
        return (
            <div className="p-8 text-center text-red-500 font-mono">
                {error}
                <Button variant="link" onClick={() => window.location.reload()} className="block mx-auto mt-2 text-amber-500">Retry</Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* ─── Row 1: Primary KPI Cards ─────────────── */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Total Properties"
                    value={metrics?.totalProperties}
                    icon={Building2}
                    loading={isLoading}
                    subtitle={metrics?.propertyGrowth !== undefined
                        ? `${metrics.propertyGrowth >= 0 ? '+' : ''}${metrics.propertyGrowth}% growth`
                        : 'Portfolio'}
                    trend={metrics?.propertyGrowth}
                />
                <KPICard
                    title="Occupancy Rate"
                    value={metrics?.occupancyRate !== undefined ? `${metrics.occupancyRate}%` : undefined}
                    icon={Users}
                    loading={isLoading}
                    subtitle={`${metrics?.activeTenancies ?? 0} active ${(metrics?.activeTenancies ?? 0) === 1 ? 'tenancy' : 'tenancies'}`}
                    trend={metrics?.occupancyTrend}
                    highlight={metrics?.occupancyRate === 100}
                />
                <KPICard
                    title="Monthly Income"
                    value={metrics?.monthlyIncome !== undefined ? fmtCurrency(metrics.monthlyIncome) : undefined}
                    icon={Wallet}
                    loading={isLoading}
                    subtitle={`Collection: ${collectionRate}%`}
                    trend={metrics?.incomeTrend}
                    progressValue={collectionRate}
                />
                <KPICard
                    title="Overdue Payments"
                    value={metrics?.overduePayments}
                    icon={AlertCircle}
                    loading={isLoading}
                    subtitle={receivables?.summary?.totalOutstanding
                        ? `${fmtCurrency(receivables.summary.totalOutstanding)} outstanding`
                        : 'All current'}
                    alert={metrics?.overduePayments ? metrics.overduePayments > 0 : false}
                />
            </div>

            {/* ─── Row 2: Secondary KPI Cards ───────────── */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Pending Work Orders"
                    value={workOrders?.byStatus?.open}
                    icon={Wrench}
                    loading={isLoading}
                    subtitle={workOrders ? `${workOrders.total} total, ${workOrders.urgentPending} urgent` : ''}
                    alert={workOrders?.urgentPending ? workOrders.urgentPending > 0 : false}
                />
                <KPICard
                    title="Lease Expiring (90d)"
                    value={leases?.expiringSoon
                        ? (leases.expiringSoon.within30Days + leases.expiringSoon.within60Days + leases.expiringSoon.within90Days)
                        : undefined}
                    icon={CalendarClock}
                    loading={isLoading}
                    subtitle={leases?.expiringSoon?.within30Days
                        ? `${leases.expiringSoon.within30Days} within 30 days`
                        : 'No upcoming expirations'}
                    alert={leases?.expiringSoon?.within30Days ? leases.expiringSoon.within30Days > 0 : false}
                />
                <KPICard
                    title="Applications"
                    value={applications?.submittedThisMonth}
                    icon={FileText}
                    loading={isLoading}
                    subtitle={`${applications?.total ?? 0} total applications`}
                />
                <KPICard
                    title="Avg Resolution"
                    value={workOrders?.avgResolutionDays !== undefined
                        ? `${workOrders.avgResolutionDays.toFixed(1)}d`
                        : undefined}
                    icon={Clock}
                    loading={isLoading}
                    subtitle="Work order turnaround"
                />
            </div>

            {/* ─── Row 2.5: Portfolio Financial Analytics ── */}
            {portfolioFinancials && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <Card className="bg-black border border-zinc-800">
                        <CardContent className="p-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Portfolio NOI</p>
                            <p className={`text-xl font-bold font-mono ${(portfolioFinancials.portfolioNOI ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmtCurrency(portfolioFinancials.portfolioNOI ?? 0)}
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Net Operating Income</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-black border border-zinc-800">
                        <CardContent className="p-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Wtd. Cap Rate</p>
                            <p className="text-xl font-bold text-amber-400 font-mono">
                                {(portfolioFinancials.weightedCapRate ?? 0).toFixed(2)}%
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Weighted Capitalization</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-black border border-zinc-800">
                        <CardContent className="p-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Avg Occupancy</p>
                            <p className={`text-xl font-bold font-mono ${(portfolioFinancials.averageOccupancy ?? 0) >= 90 ? 'text-green-400' : (portfolioFinancials.averageOccupancy ?? 0) >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                                {(portfolioFinancials.averageOccupancy ?? 0).toFixed(0)}%
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Portfolio Average</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-black border border-zinc-800">
                        <CardContent className="p-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Monthly Income</p>
                            <p className="text-xl font-bold text-green-400 font-mono">
                                {fmtCurrency(portfolioFinancials.totalMonthlyIncome ?? 0)}
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Gross Monthly</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-black border border-zinc-800">
                        <CardContent className="p-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Net Monthly</p>
                            <p className={`text-xl font-bold font-mono ${(portfolioFinancials.netMonthlyCashFlow ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmtCurrency(portfolioFinancials.netMonthlyCashFlow ?? 0)}
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">After Expenses</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─── Row 3: Revenue Chart + Receivables ───── */}
            <div className="grid gap-6 lg:grid-cols-7">
                {/* Revenue Performance Chart */}
                <Card className="lg:col-span-4 bg-black border border-zinc-800">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Revenue Performance</CardTitle>
                                <CardDescription className="text-[10px] font-mono text-zinc-600 uppercase mt-1">
                                    {cashFlow ? `YTD: ${fmtCurrency(cashFlow.totalIncome)} income · ${fmtCurrency(cashFlow.totalExpenses)} expenses` : 'Loading...'}
                                </CardDescription>
                            </div>
                            <Link href="/dashboard/property-management/financials">
                                <Button variant="ghost" size="sm" className="text-[10px] font-mono text-amber-600 hover:text-amber-500 uppercase">
                                    Details <ArrowUpRight className="h-3 w-3 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-[280px] flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                            </div>
                        ) : revenueChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={revenueChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradExpected" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }} axisLine={{ stroke: '#27272a' }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₵${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #27272a', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
                                        labelStyle={{ color: '#f59e0b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: 10 }}
                                        formatter={(value: number, name: string) => [fmtCurrency(value), name]}
                                    />
                                    <Area type="monotone" dataKey="Expected Rent" stroke="#f59e0b" strokeDasharray="5 5" fill="url(#gradExpected)" strokeWidth={1.5} />
                                    <Area type="monotone" dataKey="Actual Income" stroke="#22c55e" fill="url(#gradIncome)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="Expenses" stroke="#ef4444" fill="none" strokeWidth={1.5} strokeDasharray="3 3" />
                                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[280px] flex items-center justify-center border border-dashed border-zinc-800 bg-zinc-950/30 rounded">
                                <div className="text-center space-y-2">
                                    <TrendingUp className="h-8 w-8 text-amber-900/50 mx-auto" />
                                    <p className="text-xs text-zinc-600 font-mono uppercase">No revenue data yet</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Aged Receivables + Lease Alerts */}
                <Card className="lg:col-span-3 bg-black border border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Financial Health</CardTitle>
                        <CardDescription className="text-[10px] font-mono text-zinc-600 uppercase">Receivables & lease status</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                            </div>
                        ) : (
                            <>
                                {/* Net Cash Flow Summary */}
                                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Net Cash Flow (YTD)</p>
                                    <p className={`text-xl font-bold font-mono ${(cashFlow?.netCashFlow ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {cashFlow ? fmtCurrency(cashFlow.netCashFlow) : '₵0'}
                                    </p>
                                    <div className="flex gap-4 mt-2">
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-2 w-2 rounded-full bg-green-500" />
                                            <span className="text-[10px] font-mono text-zinc-400">Income {cashFlow ? fmtCurrency(cashFlow.totalIncome) : '₵0'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-2 w-2 rounded-full bg-red-500" />
                                            <span className="text-[10px] font-mono text-zinc-400">Expenses {cashFlow ? fmtCurrency(cashFlow.totalExpenses) : '₵0'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Receivables Aging */}
                                <div>
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Receivables Aging</p>
                                    <div className="space-y-2">
                                        {[
                                            { label: 'Current', amount: receivables?.summary?.current ?? 0, color: 'bg-green-500' },
                                            { label: '30–60 days', amount: receivables?.summary?.days30to60 ?? 0, color: 'bg-amber-500' },
                                            { label: '60–90 days', amount: receivables?.summary?.days60to90 ?? 0, color: 'bg-orange-500' },
                                            { label: '90+ days', amount: receivables?.summary?.over90Days ?? 0, color: 'bg-red-500' },
                                        ].map(b => {
                                            const total = receivables?.summary?.totalOutstanding || 1
                                            const pct = total > 0 ? (b.amount / total) * 100 : 0
                                            return (
                                                <div key={b.label} className="flex items-center gap-3">
                                                    <span className="text-[10px] font-mono text-zinc-500 w-20">{b.label}</span>
                                                    <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.max(pct, b.amount > 0 ? 5 : 0)}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-mono text-zinc-400 w-16 text-right">{fmtCurrency(b.amount)}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Lease Expiry Alerts */}
                                <div>
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Lease Expiry Alerts</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { days: '30d', count: leases?.expiringSoon?.within30Days ?? 0, urgent: true },
                                            { days: '60d', count: leases?.expiringSoon?.within60Days ?? 0, urgent: false },
                                            { days: '90d', count: leases?.expiringSoon?.within90Days ?? 0, urgent: false },
                                        ].map(e => (
                                            <div key={e.days} className={`p-2 rounded border text-center ${e.count > 0 && e.urgent ? 'border-red-900 bg-red-950/30' : 'border-zinc-800 bg-zinc-950'}`}>
                                                <p className={`text-lg font-bold font-mono ${e.count > 0 && e.urgent ? 'text-red-400' : 'text-zinc-300'}`}>
                                                    {e.count}
                                                </p>
                                                <p className="text-[9px] font-mono text-zinc-500 uppercase">Within {e.days}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ─── Row 4: Work Orders + Composition + Applications ─ */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Work Orders by Category */}
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Maintenance</CardTitle>
                            <Link href="/dashboard/property-management/maintenance">
                                <Button variant="ghost" size="sm" className="text-[10px] font-mono text-amber-600 hover:text-amber-500 uppercase">
                                    View <ArrowUpRight className="h-3 w-3 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-[200px] flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                            </div>
                        ) : workOrders ? (
                            <div className="space-y-4">
                                {/* Status Summary */}
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: 'Open', count: workOrders.byStatus.open ?? 0, icon: CircleDot, color: 'text-amber-400' },
                                        { label: 'In Progress', count: workOrders.byStatus.inProgress ?? 0, icon: Activity, color: 'text-blue-400' },
                                        { label: 'Completed', count: workOrders.byStatus.completed ?? 0, icon: CheckCircle2, color: 'text-green-400' },
                                        { label: 'Urgent', count: workOrders.urgentPending, icon: ShieldAlert, color: 'text-red-400' },
                                    ].map(s => (
                                        <div key={s.label} className="flex items-center gap-2 p-2 rounded bg-zinc-950 border border-zinc-800">
                                            <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                                            <div>
                                                <p className="text-sm font-bold font-mono text-white">{s.count}</p>
                                                <p className="text-[9px] font-mono text-zinc-500 uppercase">{s.label}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Category Breakdown */}
                                {workOrderChartData.length > 0 && (
                                    <ResponsiveContainer width="100%" height={140}>
                                        <BarChart data={workOrderChartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                                            <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa', fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={70} />
                                            <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #27272a', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }} />
                                            <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={16} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-600 font-mono text-center py-8">No maintenance data</p>
                        )}
                    </CardContent>
                </Card>

                {/* Portfolio Composition */}
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Portfolio Mix</CardTitle>
                            <Link href="/dashboard/property-management/properties">
                                <Button variant="ghost" size="sm" className="text-[10px] font-mono text-amber-600 hover:text-amber-500 uppercase">
                                    View <ArrowUpRight className="h-3 w-3 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-[200px] flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                            </div>
                        ) : compositionChartData.length > 0 ? (
                            <div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <PieChart>
                                        <Pie
                                            data={compositionChartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={45}
                                            outerRadius={70}
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {compositionChartData.map((_, i) => (
                                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #27272a', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="flex flex-wrap gap-2 mt-1 justify-center">
                                    {compositionChartData.map((item, i) => (
                                        <div key={item.name} className="flex items-center gap-1.5">
                                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                            <span className="text-[10px] font-mono text-zinc-400">{item.name} ({item.value})</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Region breakdown */}
                                {data.composition?.byRegion && data.composition.byRegion.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-zinc-800">
                                        <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">By Region</p>
                                        {data.composition.byRegion.map(r => (
                                            <div key={r.region} className="flex items-center justify-between py-1">
                                                <span className="text-[10px] font-mono text-zinc-400">{r.region.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                                                <Badge variant="outline" className="text-[9px] font-mono">{r.count}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-[200px] flex items-center justify-center">
                                <div className="text-center space-y-2">
                                    <PieChartIcon className="h-8 w-8 text-amber-900/50 mx-auto" />
                                    <p className="text-xs text-zinc-600 font-mono uppercase">No properties yet</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Applications & Activity */}
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Applications & Activity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isLoading ? (
                            <div className="h-[200px] flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                            </div>
                        ) : (
                            <>
                                {/* Application Pipeline */}
                                <div>
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Application Pipeline</p>
                                    {applications?.byStatus && Object.keys(applications.byStatus).length > 0 ? (
                                        <div className="space-y-1.5">
                                            {Object.entries(applications.byStatus).map(([status, count]) => (
                                                <div key={status} className="flex items-center justify-between py-1 px-2 rounded bg-zinc-950 border border-zinc-800">
                                                    <span className="text-[10px] font-mono text-zinc-400">{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                                                    <Badge variant="outline" className="text-[9px] font-mono">{count}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] font-mono text-zinc-600 text-center py-2">No applications</p>
                                    )}
                                </div>

                                {/* Key Metrics */}
                                <div className="pt-2 border-t border-zinc-800">
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Portfolio Snapshot</p>
                                    <div className="space-y-2">
                                        {[
                                            { label: 'Total Tenants', value: metrics?.totalTenants ?? 0 },
                                            { label: 'Active Leases', value: leases?.activeLeases ?? 0 },
                                            { label: 'Total Units', value: leases?.totalUnits ?? 0 },
                                            { label: 'Monthly Rent Roll', value: fmtCurrency(leases?.totalMonthlyRevenue ?? 0) },
                                        ].map(item => (
                                            <div key={item.label} className="flex items-center justify-between">
                                                <span className="text-[10px] font-mono text-zinc-500">{item.label}</span>
                                                <span className="text-xs font-mono text-white font-medium">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Collection Rate Gauge */}
                                <div className="pt-2 border-t border-zinc-800">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Collection Rate</span>
                                        <span className={`text-xs font-mono font-bold ${collectionRate >= 90 ? 'text-green-400' : collectionRate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {collectionRate}%
                                        </span>
                                    </div>
                                    <Progress
                                        value={collectionRate}
                                        className="h-2 bg-zinc-900"
                                        indicatorClassName={collectionRate >= 90 ? 'bg-green-500' : collectionRate >= 70 ? 'bg-amber-500' : 'bg-red-500'}
                                    />
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ─── Row 5: Quick Actions ─────────────────── */}
            <Card className="bg-black border border-zinc-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                        {[
                            { label: 'Add Property', href: '/dashboard/property-management/properties/new', icon: Plus },
                            { label: 'Register Tenant', href: '/dashboard/property-management/tenants/new', icon: UserPlus },
                            { label: 'Create Lease', href: '/dashboard/property-management/tenants', icon: ClipboardList },
                            { label: 'New Work Order', href: '/dashboard/property-management/maintenance', icon: Wrench },
                            { label: 'Record Payment', href: '/dashboard/property-management/financials', icon: Receipt },
                            { label: 'View Reports', href: '/dashboard/property-management/financials', icon: BarChart3 },
                        ].map((action) => (
                            <Link key={action.label} href={action.href}>
                                <Button
                                    variant="outline"
                                    className="w-full h-16 bg-zinc-950 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-amber-500 hover:border-amber-900 group transition-all"
                                >
                                    <div className="flex flex-col items-center gap-1.5">
                                        <action.icon className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                                        <span className="text-[10px] font-mono uppercase leading-tight">{action.label}</span>
                                    </div>
                                </Button>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

// ─── KPI Card Component ─────────────────────────────────
function KPICard({
    title,
    value,
    icon: Icon,
    loading,
    subtitle,
    trend,
    alert,
    highlight,
    progressValue,
}: {
    title: string
    value: number | string | undefined
    icon: React.ElementType
    loading: boolean
    subtitle?: string
    trend?: number
    alert?: boolean
    highlight?: boolean
    progressValue?: number
}) {
    return (
        <Card className={`bg-black border ${alert ? 'border-red-900/50' : 'border-zinc-800'}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-amber-500">{title}</CardTitle>
                <Icon className={`h-4 w-4 ${alert ? 'text-red-500' : 'text-amber-600'}`} />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-white font-mono">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin inline text-amber-600" /> : (value ?? 0)}
                </div>
                {subtitle && (
                    <div className="flex items-center gap-1 mt-1">
                        {trend !== undefined && trend !== 0 && (
                            trend > 0
                                ? <ArrowUpRight className="h-3 w-3 text-green-500" />
                                : <ArrowDownRight className="h-3 w-3 text-red-500" />
                        )}
                        {highlight && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                        <p className={`text-[10px] font-mono uppercase ${alert ? 'text-red-400' : trend && trend > 0 ? 'text-green-500' : 'text-zinc-500'}`}>
                            {subtitle}
                        </p>
                    </div>
                )}
                {progressValue !== undefined && (
                    <Progress
                        value={progressValue}
                        className="h-1 mt-2 bg-zinc-900"
                        indicatorClassName={progressValue >= 90 ? 'bg-green-500' : progressValue >= 70 ? 'bg-amber-500' : 'bg-red-500'}
                    />
                )}
            </CardContent>
        </Card>
    )
}
