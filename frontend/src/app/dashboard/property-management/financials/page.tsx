'use client'

import React, { useEffect, useState } from 'react'
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    Download,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    CreditCard,
    Building,
    Loader2,
    Plus,
    PieChart as PieChartIcon,
    BarChart3,
    Wallet,
    Receipt,
    Bitcoin
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { propertyManagementApi } from '@/lib/property-management-api'
import { cryptoRevenueApi, CryptoRevenueSummary } from '@/lib/property-management-api'
import { FinancialRecord } from '@/types/property-management'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area
} from 'recharts'
import Link from 'next/link'
import PaymentSettings from '@/components/property-management/PaymentSettings'

interface PropertyPerformance {
    propertyId: string;
    propertyTitle: string;
    region: string;
    totalIncome: number;
    totalExpenses: number;
    netOperatingIncome: number;
    occupancyRate: number;
    averageRent: number;
    maintenanceCosts: number;
}

interface AgedReceivablesSummary {
    totalOutstanding: number;
    current: number;
    days30to60: number;
    days60to90: number;
    over90Days: number;
    tenantsWithArrears: number;
}

export default function FinancialsPage() {
    const [records, setRecords] = useState<FinancialRecord[]>([])
    const [propertyPerformance, setPropertyPerformance] = useState<PropertyPerformance[]>([])
    const [receivablesSummary, setReceivablesSummary] = useState<AgedReceivablesSummary | null>(null)
    const [portfolioValue, setPortfolioValue] = useState<number>(0)
    const [monthlyTrendData, setMonthlyTrendData] = useState<{month: string; income: number; expenses: number; expectedRent: number; projectedIncome: number}[]>([])
    const [cryptoRevenue, setCryptoRevenue] = useState<CryptoRevenueSummary | null>(null)
    const [portfolioFinancials, setPortfolioFinancials] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [period, setPeriod] = useState('this_month')
    const [mounted, setMounted] = useState(false)
    const [activeTab, setActiveTab] = useState<'overview' | 'payment-settings'>('overview')

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        const loadFinancials = async () => {
            try {
                setIsLoading(true)
                setError(null)

                // Calculate date range based on period
                const endDate = new Date()
                const startDate = new Date()
                switch (period) {
                    case 'this_month':
                        startDate.setDate(1)
                        break
                    case 'last_month':
                        startDate.setMonth(startDate.getMonth() - 1)
                        startDate.setDate(1)
                        endDate.setDate(0)
                        break
                    case 'this_quarter':
                        startDate.setMonth(Math.floor(startDate.getMonth() / 3) * 3)
                        startDate.setDate(1)
                        break
                    case 'this_year':
                        startDate.setMonth(0)
                        startDate.setDate(1)
                        break
                }

                // Load all financial data in parallel
                const [recordsRes, performanceRes, receivablesRes, portfolioRes, cashFlowRes, portfolioFin] = await Promise.all([
                    propertyManagementApi.getFinancials({
                        limit: 100,
                        dateFrom: startDate.toISOString().split('T')[0],
                        dateTo: endDate.toISOString().split('T')[0]
                    }),
                    propertyManagementApi.getPropertyPerformanceReport({
                        startDate: startDate.toISOString().split('T')[0],
                        endDate: endDate.toISOString().split('T')[0]
                    }),
                    propertyManagementApi.getAgedReceivablesReport(),
                    propertyManagementApi.getPortfolioValue(),
                    propertyManagementApi.getCashFlow({
                        startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
                        endDate: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]
                    }),
                    propertyManagementApi.getPortfolioFinancialSummary().catch(() => null),
                ])

                const recordsData = Array.isArray(recordsRes) ? recordsRes : recordsRes.data || []
                setRecords(recordsData)
                setPropertyPerformance(Array.isArray(performanceRes) ? performanceRes : [])
                setReceivablesSummary(receivablesRes?.summary || null)
                setPortfolioValue(portfolioRes?.totalValue || 0)
                setPortfolioFinancials(portfolioFin)

                // Load crypto revenue separately to avoid interference
                try {
                    const crypto = await cryptoRevenueApi.getSummary()
                    setCryptoRevenue(crypto)
                } catch (err: any) {
                    console.error('[CryptoRevenue] fetch failed:', err)
                }

                // Set real monthly trend data from cash-flow API
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                if (cashFlowRes?.monthlyBreakdown?.length > 0) {
                    const rawData = cashFlowRes.monthlyBreakdown.map((m: any) => {
                        const [year, monthNum] = m.month.split('-')
                        return {
                            month: monthNames[parseInt(monthNum) - 1] || m.month,
                            income: m.income || 0,
                            expenses: m.expenses || 0,
                            expectedRent: m.expectedRent || 0
                        }
                    })
                    // Find last month with actual income to project forward from
                    let lastIncomeIdx = -1
                    rawData.forEach((d: any, i: number) => { if (d.income > 0) lastIncomeIdx = i })
                    
                    setMonthlyTrendData(rawData.map((d: any, i: number) => ({
                        ...d,
                        // Project expected rent forward from the month after last actual income
                        projectedIncome: i > lastIncomeIdx && d.expectedRent > 0 ? d.expectedRent : 0
                    })))
                } else {
                    setMonthlyTrendData([])
                }

            } catch (err) {
                console.error('Failed to load financials:', err)
                setError('Failed to load financial data.')
            } finally {
                setIsLoading(false)
            }
        }
        loadFinancials()
    }, [period])

    // Calculate aggregates from property performance data
    const totalIncome = propertyPerformance.reduce((acc, p) => acc + (p.totalIncome || 0), 0)
    const totalExpenses = propertyPerformance.reduce((acc, p) => acc + (p.totalExpenses || 0), 0)
    const noi = totalIncome - totalExpenses

    // Prepare chart data
    const incomeVsExpenseData = propertyPerformance
        .filter(p => p.totalIncome > 0 || p.totalExpenses > 0)
        .slice(0, 8)
        .map(p => ({
            name: p.propertyTitle?.substring(0, 15) + '...' || 'Property',
            income: p.totalIncome || 0,
            expenses: p.totalExpenses || 0,
            noi: p.netOperatingIncome || 0
        }))

    // Receivables aging for pie chart
    const receivablesData = receivablesSummary ? [
        { name: 'Current', value: receivablesSummary.current || 0, color: '#10b981' },
        { name: '31-60 Days', value: receivablesSummary.days30to60 || 0, color: '#f59e0b' },
        { name: '61-90 Days', value: receivablesSummary.days60to90 || 0, color: '#f97316' },
        { name: '90+ Days', value: receivablesSummary.over90Days || 0, color: '#ef4444' },
    ].filter(r => r.value > 0) : []

    const formatCurrency = (val: number) => `₵${val.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`

    if (!mounted) return null

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white font-mono">FINANCIAL CENTER</h1>
                    <p className="text-sm text-zinc-500 font-mono">Revenue, expenses, receivables & portfolio performance</p>
                </div>
                {activeTab === 'overview' && <div className="flex items-center gap-2">
                        <Select value={period} onValueChange={setPeriod}>
                                <SelectTrigger className="w-[180px] bg-black border-zinc-800 text-zinc-300 font-mono text-xs uppercase h-8">
                                    <Calendar className="mr-2 h-3 w-3" />
                                    <SelectValue placeholder="Select period" />
                                </SelectTrigger>
                                <SelectContent className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs uppercase">
                                    <SelectItem value="this_month">This Month</SelectItem>
                                    <SelectItem value="last_month">Last Month</SelectItem>
                                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                                    <SelectItem value="this_year">This Year</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:text-amber-500 hover:border-amber-900 bg-black font-mono text-xs uppercase">
                                <Download className="mr-2 h-3 w-3" />
                                Export
                            </Button>
                </div>}
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-6 border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                        activeTab === 'overview'
                            ? 'text-white border-b-2 border-amber-500'
                            : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('payment-settings')}
                    className={`pb-2 font-mono text-xs uppercase tracking-wider transition-colors flex items-center gap-2 ${
                        activeTab === 'payment-settings'
                            ? 'text-white border-b-2 border-amber-500'
                            : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    <CreditCard className="h-3 w-3" />
                    Payment Settings
                </button>
            </div>

            {/* Payment Settings Tab */}
            {activeTab === 'payment-settings' && <PaymentSettings />}

            {/* Overview Tab Content */}
            {activeTab === 'overview' && <>
            {/* Loading State */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
                <Card className="bg-red-950/30 border border-red-800">
                    <CardContent className="flex items-center gap-3 py-4">
                        <p className="text-red-400 font-mono text-sm">{error}</p>
                        <Button variant="link" onClick={() => window.location.reload()} className="text-amber-500 ml-auto">
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!isLoading && !error && (
                <>
                    {/* KPI Cards */}
                    <div className="grid gap-4 md:grid-cols-5">
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Revenue</CardTitle>
                                <DollarSign className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-white font-mono">{formatCurrency(totalIncome)}</div>
                                <div className="flex items-center text-[10px] text-green-500 mt-1 font-mono">
                                    <ArrowUpRight className="h-3 w-3 mr-1" /> For period
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Expenses</CardTitle>
                                <CreditCard className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-white font-mono">{formatCurrency(totalExpenses)}</div>
                                <div className="flex items-center text-[10px] text-red-500 mt-1 font-mono">
                                    <ArrowDownRight className="h-3 w-3 mr-1" /> For period
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Net Operating Income</CardTitle>
                                <TrendingUp className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold font-mono ${noi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrency(noi)}
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-1 font-mono">
                                    {noi >= 0 ? 'Positive cash flow' : 'Negative cash flow'}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Outstanding</CardTitle>
                                <Receipt className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-white font-mono">
                                    {formatCurrency(receivablesSummary?.totalOutstanding || 0)}
                                </div>
                                <div className="text-[10px] text-orange-500 mt-1 font-mono">
                                    {receivablesSummary?.tenantsWithArrears || 0} tenants with balance
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Portfolio Value</CardTitle>
                                <Building className="h-4 w-4 text-amber-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-white font-mono">
                                    {portfolioValue >= 1000000 ? `₵${(portfolioValue / 1000000).toFixed(1)}M` : formatCurrency(portfolioValue)}
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-1 font-mono">Latest valuation</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Advanced Financial Analytics */}
                    {portfolioFinancials && (
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="pt-5 pb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase">Portfolio NOI</p>
                                        <Badge variant="outline" className="text-[8px] font-mono border-zinc-700 text-zinc-500">NOI</Badge>
                                    </div>
                                    <p className={`text-xl font-bold font-mono ${(portfolioFinancials.portfolioNOI ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {formatCurrency(portfolioFinancials.portfolioNOI ?? 0)}
                                    </p>
                                    <p className="text-[9px] font-mono text-zinc-600 mt-1">Annual Net Operating Income</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="pt-5 pb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase">Wtd. Cap Rate</p>
                                        <Badge variant="outline" className="text-[8px] font-mono border-zinc-700 text-zinc-500">CAP</Badge>
                                    </div>
                                    <p className="text-xl font-bold text-amber-400 font-mono">
                                        {(portfolioFinancials.weightedCapRate ?? 0).toFixed(2)}%
                                    </p>
                                    <p className="text-[9px] font-mono text-zinc-600 mt-1">Weighted Capitalization Rate</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="pt-5 pb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase">Monthly Income</p>
                                        <Badge variant="outline" className="text-[8px] font-mono border-zinc-700 text-zinc-500">REV</Badge>
                                    </div>
                                    <p className="text-xl font-bold text-green-400 font-mono">
                                        {formatCurrency(portfolioFinancials.totalMonthlyIncome ?? 0)}
                                    </p>
                                    <p className="text-[9px] font-mono text-zinc-600 mt-1">Effective Gross Income / 12</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="pt-5 pb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase">Net Monthly</p>
                                        <Badge variant="outline" className="text-[8px] font-mono border-zinc-700 text-zinc-500">NET</Badge>
                                    </div>
                                    <p className={`text-xl font-bold font-mono ${(portfolioFinancials.netMonthlyCashFlow ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {formatCurrency(portfolioFinancials.netMonthlyCashFlow ?? 0)}
                                    </p>
                                    <p className="text-[9px] font-mono text-zinc-600 mt-1">After Operating Expenses</p>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Crypto Revenue Card */}
                    {cryptoRevenue && cryptoRevenue.totalCryptoPayments > 0 && (
                        <Card className="bg-zinc-950 border border-amber-900/40 shadow-[inset_0_1px_0_rgba(245,158,11,0.08)]">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                                            <Bitcoin className="h-4 w-4 text-amber-500" />
                                        </div>
                                        <CardTitle className="text-sm font-mono uppercase tracking-wider text-amber-500">
                                            Crypto Revenue
                                        </CardTitle>
                                    </div>
                                    {cryptoRevenue.currenciesAccepted.length > 0 && (
                                        <div className="flex items-center gap-1">
                                            {cryptoRevenue.currenciesAccepted.map((c) => (
                                                <Badge key={c} variant="outline" className="border-amber-800/50 text-amber-400 bg-amber-900/10 font-mono text-[9px] uppercase px-1.5 py-0">
                                                    {c}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-lg border border-zinc-800 bg-black/70 p-3">
                                        <p className="text-[10px] text-zinc-400 font-mono uppercase">Crypto Payments</p>
                                        <p className="text-xl font-bold text-white font-mono">{cryptoRevenue.totalCryptoPayments}</p>
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 bg-black/70 p-3">
                                        <p className="text-[10px] text-zinc-400 font-mono uppercase">Total Rent Received</p>
                                        <p className="text-xl font-bold text-green-400 font-mono">{formatCurrency(cryptoRevenue.totalCryptoRentGhs)}</p>
                                    </div>
                                </div>
                                {/* Crypto payment details table */}
                                {cryptoRevenue.payments.length > 0 && (
                                    <div className="mt-4 rounded-lg border border-zinc-800 bg-black/70 overflow-hidden">
                                        <div className="border-b border-zinc-800 px-3 py-2">
                                            <p className="text-[10px] text-zinc-400 font-mono uppercase">Payment Breakdown</p>
                                        </div>
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="border-zinc-800 bg-zinc-950 hover:bg-zinc-950">
                                                    <TableHead className="text-zinc-400 font-mono text-[9px] uppercase">Date</TableHead>
                                                    <TableHead className="text-zinc-400 font-mono text-[9px] uppercase">Reference</TableHead>
                                                    <TableHead className="text-zinc-400 font-mono text-[9px] uppercase">Settled In</TableHead>
                                                    <TableHead className="text-right text-zinc-400 font-mono text-[9px] uppercase">Settlement Amount</TableHead>
                                                    <TableHead className="text-right text-zinc-400 font-mono text-[9px] uppercase">Rent (GHS)</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {cryptoRevenue.payments.map((p) => (
                                                    <TableRow key={p.reference} className="border-zinc-800 hover:bg-zinc-900/70">
                                                        <TableCell className="font-mono text-[10px] text-zinc-300">
                                                            {new Date(p.date).toLocaleDateString('en-GH')}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-[10px] text-white">
                                                            {p.reference.slice(0, 12)}...
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="border-amber-700/40 text-amber-400 bg-amber-900/10 font-mono text-[9px] px-1 py-0">
                                                                {p.settlementCurrency || p.cryptoCurrency || '—'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-[10px] text-zinc-200">
                                                            {p.settlementAmount != null ? `${p.settlementAmount.toFixed(4)} ${p.settlementCurrency || ''}` : '—'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs text-green-400 font-bold">
                                                            {formatCurrency(p.principalGhs)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Charts Section */}
                    <div className="grid gap-6 md:grid-cols-3">
                        {/* Income vs Expenses Chart */}
                        <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Income vs Expenses by Property</CardTitle>
                                <CardDescription className="text-zinc-500 font-mono text-xs">Financial performance breakdown</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {incomeVsExpenseData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={incomeVsExpenseData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} angle={-45} textAnchor="end" height={80} />
                                            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(v) => `₵${(v / 1000).toFixed(0)}k`} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                                                labelStyle={{ color: '#fbbf24', fontFamily: 'monospace' }}
                                                formatter={(value: number) => [`₵${value.toLocaleString()}`, '']}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
                                            <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-[300px] flex items-center justify-center bg-black/50 rounded-lg border border-zinc-800 border-dashed">
                                        <div className="text-center text-zinc-600 font-mono">
                                            <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                            <p>No financial data for this period</p>
                                            <p className="text-[10px]">Record transactions to see chart</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Receivables Aging Pie Chart */}
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Receivables Aging</CardTitle>
                                <CardDescription className="text-zinc-500 font-mono text-xs">Outstanding rent by age</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {receivablesData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <PieChart>
                                            <Pie
                                                data={receivablesData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                paddingAngle={2}
                                                dataKey="value"
                                            >
                                                {receivablesData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#ffffff' }}
                                                itemStyle={{ color: '#ffffff' }}
                                                formatter={(value: number) => [`₵${value.toLocaleString()}`, '']}
                                            />
                                            <Legend
                                                wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
                                                formatter={(value) => <span className="text-white">{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-[250px] flex items-center justify-center">
                                        <div className="text-center text-zinc-600 font-mono">
                                            <PieChartIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                            <p className="text-xs">No outstanding receivables</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Revenue Trend Chart */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Revenue Trend</CardTitle>
                            <CardDescription className="text-zinc-500 font-mono text-xs">Actual & projected income vs expenses</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {monthlyTrendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <AreaChart data={monthlyTrendData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#71717a' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(v) => `₵${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                                            labelStyle={{ color: '#fbbf24', fontFamily: 'monospace' }}
                                            formatter={(value: number, name: string) => [value > 0 ? `₵${value.toLocaleString()}` : '-', name]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
                                        <Area type="monotone" dataKey="expectedRent" name="Expected Rent" stroke="#fbbf24" fill="none" strokeDasharray="6 3" strokeWidth={2} dot={false} />
                                        <Area type="monotone" dataKey="income" name="Actual Income" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2} />
                                        <Area type="monotone" dataKey="projectedIncome" name="Projected Income" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeDasharray="6 3" strokeWidth={2} dot={false} />
                                        <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={1.5} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-[280px] flex items-center justify-center bg-black/50 rounded-lg border border-zinc-800 border-dashed">
                                    <div className="text-center text-zinc-600 font-mono">
                                        <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-xs">No trend data for this period</p>
                                        <p className="text-[10px]">Data builds as transactions are recorded monthly</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Property Performance Table */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Property Financial Performance</CardTitle>
                                    <CardDescription className="text-zinc-500 font-mono text-xs">Income, expenses and NOI by property</CardDescription>
                                </div>
                                <Link href="/dashboard/property-management/reports">
                                    <Button variant="outline" size="sm" className="border-zinc-800 text-zinc-400 hover:text-amber-500 font-mono text-[10px] uppercase h-7">
                                        View Full Report
                                    </Button>
                                </Link>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Property</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Region</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase text-right">Income</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase text-right">Expenses</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase text-right">NOI</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase text-right">Occupancy</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {propertyPerformance.length === 0 ? (
                                        <TableRow className="border-zinc-800">
                                            <TableCell colSpan={6} className="text-center py-8 text-zinc-500 font-mono">
                                                No property performance data available.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        propertyPerformance.slice(0, 10).map((prop) => (
                                            <TableRow key={prop.propertyId} className="border-zinc-800 hover:bg-zinc-900/50">
                                                <TableCell className="font-mono text-sm text-white">
                                                    {prop.propertyTitle?.substring(0, 30) || 'Property'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-mono text-[10px] uppercase">
                                                        {prop.region?.replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-green-400">
                                                    {formatCurrency(prop.totalIncome || 0)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-red-400">
                                                    {formatCurrency(prop.totalExpenses || 0)}
                                                </TableCell>
                                                <TableCell className={`text-right font-mono text-xs font-bold ${(prop.netOperatingIncome || 0) >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                                    {formatCurrency(prop.netOperatingIncome || 0)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-zinc-400">
                                                    {(prop.occupancyRate || 0).toFixed(0)}%
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Recent Transactions Table */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Recent Transactions</CardTitle>
                                    <CardDescription className="text-zinc-500 font-mono text-xs">Latest financial activity</CardDescription>
                                </div>
                                <Button variant="outline" size="sm" className="border-zinc-800 text-zinc-400 hover:text-amber-500 font-mono text-[10px] uppercase h-7">
                                    <Plus className="mr-1 h-3 w-3" /> Add Transaction
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Date</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Description</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Property</TableHead>
                                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Type</TableHead>
                                        <TableHead className="text-right text-zinc-500 font-mono text-[10px] uppercase">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {records.length === 0 ? (
                                        <TableRow className="border-zinc-800">
                                            <TableCell colSpan={5} className="text-center py-8 text-zinc-500 font-mono">
                                                <Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                                <p>No transactions recorded for this period.</p>
                                                <p className="text-[10px] mt-1">Add transactions to track income and expenses.</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        records.slice(0, 10).map((txn) => (
                                            <TableRow key={txn.id} className="border-zinc-800 hover:bg-zinc-900/50">
                                                <TableCell className="font-mono text-xs text-zinc-400">
                                                    {new Date(txn.transactionDate).toLocaleDateString('en-GH')}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-white">
                                                    {txn.description || txn.category?.replace('_', ' ')}
                                                </TableCell>
                                                <TableCell className="font-mono text-[10px] text-zinc-500">
                                                    {txn.propertyId?.substring(0, 8)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={`font-mono text-[10px] ${txn.recordType === 'income'
                                                                ? 'border-green-800 text-green-400 bg-green-900/20'
                                                                : 'border-red-800 text-red-400 bg-red-900/20'
                                                            }`}
                                                    >
                                                        {txn.recordType}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className={`text-right font-mono text-sm font-bold ${txn.recordType === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                    {txn.recordType === 'income' ? '+' : '-'}₵{Math.abs(txn.amount).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            )}
            </>}
        </div>
    )
}
