'use client'

import React, { useEffect, useState } from 'react'
import {
    BarChart3,
    FileText,
    TrendingUp,
    Users,
    Building2,
    Wrench,
    DollarSign,
    Calendar,
    Download,
    RefreshCw,
    Loader2,
    AlertCircle,
    CheckCircle2,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { propertyManagementApi } from '@/lib/property-management-api'
import { EnterpriseNav } from '@/components/layout/EnterpriseNav'

interface AgedReceivable {
    tenantId: string;
    tenantName: string;
    propertyId: string;
    propertyTitle: string;
    totalOwed: number;
    current: number;
    days30to60: number;
    days60to90: number;
    over90Days: number;
    lastPaymentDate: string;
    lastPaymentAmount: number;
}

interface VacancyData {
    propertyId: string;
    propertyTitle: string;
    propertyType: string;
    region: string;
    monthlyRent: number;
    vacantSince: string | null;
    daysVacant: number;
    lostRevenue: number;
    status: string;
}

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
    roi: number;
    capRate: number;
}

interface TenantTurnover {
    period: string;
    moveIns: number;
    moveOuts: number;
    netChange: number;
    turnoverRate: number;
    averageTenancyLength: number;
}

interface MaintenanceAnalytics {
    totalWorkOrders: number;
    openOrders: number;
    completedOrders: number;
    averageResolutionTime: number;
    totalCost: number;
    costByCategory: Record<string, number>;
    vendorPerformance: Array<{ vendorId: string; vendorName: string; completedJobs: number; averageRating: number; totalCost: number }>;
}

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState('aged-receivables')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Report data states
    const [agedReceivables, setAgedReceivables] = useState<{ summary: any; data: AgedReceivable[] }>({ summary: null, data: [] })
    const [vacancyData, setVacancyData] = useState<{ summary: any; data: VacancyData[] }>({ summary: null, data: [] })
    const [performanceData, setPerformanceData] = useState<PropertyPerformance[]>([])
    const [turnoverData, setTurnoverData] = useState<TenantTurnover[]>([])
    const [maintenanceData, setMaintenanceData] = useState<MaintenanceAnalytics | null>(null)

    // Date filters
    const [startDate, setStartDate] = useState(() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 3)
        return d.toISOString().split('T')[0]
    })
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

    const loadReport = async (tab: string) => {
        setIsLoading(true)
        setError(null)
        try {
            switch (tab) {
                case 'aged-receivables':
                    const arData = await propertyManagementApi.getAgedReceivablesReport()
                    setAgedReceivables({ data: arData.data || [], summary: arData.summary || {} })
                    break
                case 'vacancy':
                    const vacData = await propertyManagementApi.getVacancyReport()
                    setVacancyData({ data: vacData.data || [], summary: vacData.summary || {} })
                    break
                case 'performance':
                    const perfData = await propertyManagementApi.getPropertyPerformanceReport({ startDate, endDate })
                    // API returns array directly
                    setPerformanceData(Array.isArray(perfData) ? perfData : perfData.data || [])
                    break
                case 'turnover':
                    const toData = await propertyManagementApi.getTenantTurnoverReport({ startDate, endDate })
                    // API returns array directly
                    setTurnoverData(Array.isArray(toData) ? toData : toData.data || [])
                    break
                case 'maintenance':
                    const maintData = await propertyManagementApi.getMaintenanceAnalyticsReport({ startDate, endDate })
                    setMaintenanceData(maintData)
                    break
            }
        } catch (err) {
            console.error(`Failed to load ${tab} report:`, err)
            setError(`Failed to load report. Please try again.`)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadReport(activeTab)
    }, [activeTab, startDate, endDate])

    const formatCurrency = (value: number) => `₵${(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
    const formatPercent = (value: number) => `${(value || 0).toFixed(1)}%`

    return (
        <div className="space-y-6">
            {/* Enterprise Navigation */}
            <EnterpriseNav />

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white font-mono">REPORTS</h1>
                    <p className="text-sm text-zinc-500 font-mono">Enterprise analytics and reporting</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded px-2 py-1">
                        <Calendar className="h-4 w-4 text-zinc-500" />
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-32 bg-transparent border-0 text-xs text-zinc-400 font-mono"
                        />
                        <span className="text-zinc-600">to</span>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-32 bg-transparent border-0 text-xs text-zinc-400 font-mono"
                        />
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => loadReport(activeTab)}
                        className="border-zinc-800 text-zinc-400 hover:text-amber-500 hover:border-amber-900 bg-black font-mono text-xs uppercase"
                    >
                        <RefreshCw className="mr-2 h-3 w-3" />
                        Refresh
                    </Button>
                    <Button className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs uppercase">
                        <Download className="mr-2 h-3 w-3" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Report Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-zinc-900 border border-zinc-800 w-full justify-start overflow-x-auto">
                    <TabsTrigger value="aged-receivables" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <DollarSign className="mr-2 h-3 w-3" />
                        Aged Receivables
                    </TabsTrigger>
                    <TabsTrigger value="vacancy" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <Building2 className="mr-2 h-3 w-3" />
                        Vacancy
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <TrendingUp className="mr-2 h-3 w-3" />
                        Performance
                    </TabsTrigger>
                    <TabsTrigger value="turnover" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <Users className="mr-2 h-3 w-3" />
                        Tenant Turnover
                    </TabsTrigger>
                    <TabsTrigger value="maintenance" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <Wrench className="mr-2 h-3 w-3" />
                        Maintenance
                    </TabsTrigger>
                </TabsList>

                {/* Error State */}
                {error && (
                    <Card className="bg-red-950/30 border border-red-800 mt-4">
                        <CardContent className="flex items-center gap-3 py-4">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <p className="text-red-400 font-mono text-sm">{error}</p>
                            <Button variant="link" onClick={() => loadReport(activeTab)} className="text-amber-500 ml-auto">
                                Retry
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                    </div>
                )}

                {/* Aged Receivables Report */}
                {!isLoading && !error && (
                    <TabsContent value="aged-receivables" className="mt-4 space-y-4">
                        {/* Summary Cards */}
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Outstanding</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(agedReceivables.summary?.totalOutstanding || 0)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-green-500">Current (0-30)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(agedReceivables.summary?.current || 0)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-yellow-500">Overdue (31-60)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(agedReceivables.summary?.days30to60 || 0)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-red-500">Critical (90+)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(agedReceivables.summary?.over90Days || 0)}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Details Table */}
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Receivables by Tenant</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800 hover:bg-zinc-900">
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase">Tenant</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase">Property</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Current</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">31-60</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">61-90</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">90+</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {agedReceivables.data?.map((row, i) => (
                                            <TableRow key={i} className="border-zinc-800 hover:bg-zinc-900/50">
                                                <TableCell className="font-mono text-sm text-white">{row.tenantName}</TableCell>
                                                <TableCell className="font-mono text-xs text-zinc-400">{row.propertyTitle}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-green-400">{formatCurrency(row.current)}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-yellow-400">{formatCurrency(row.days30to60)}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-orange-400">{formatCurrency(row.days60to90)}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-red-400">{formatCurrency(row.over90Days)}</TableCell>
                                                <TableCell className="font-mono text-sm text-right text-white font-bold">{formatCurrency(row.totalOwed)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {(!agedReceivables.data || agedReceivables.data.length === 0) && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-zinc-500 py-8 font-mono">
                                                    No outstanding receivables
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Vacancy Report */}
                {!isLoading && !error && (
                    <TabsContent value="vacancy" className="mt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Properties</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{vacancyData.data?.length || 0}</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-green-500">Active</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {vacancyData.data?.filter(p => p.status === 'active').length || 0}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-red-500">Vacant Units</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{vacancyData.summary?.totalVacantUnits || 0}</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Vacancy Rate</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{formatPercent(vacancyData.summary?.vacancyRate)}</div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="bg-black border border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Property Vacancy Status</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800">
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase">Property</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase">Type</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Monthly Rent</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-center">Days Vacant</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Lost Revenue</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-center">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {vacancyData.data?.map((prop, i) => (
                                            <TableRow key={i} className="border-zinc-800 hover:bg-zinc-900/50">
                                                <TableCell className="font-mono text-sm text-white">{prop.propertyTitle}</TableCell>
                                                <TableCell className="font-mono text-xs text-zinc-400">{prop.propertyType?.replace(/_/g, ' ')}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-zinc-400">{formatCurrency(prop.monthlyRent)}</TableCell>
                                                <TableCell className="font-mono text-xs text-center text-zinc-400">{prop.daysVacant}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-red-400">{formatCurrency(prop.lostRevenue)}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={prop.status === 'active' ? 'default' : 'destructive'} className="font-mono text-xs">
                                                        {prop.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(!vacancyData.data || vacancyData.data.length === 0) && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-zinc-500 py-8 font-mono">
                                                    No vacancy data available
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Performance Report */}
                {!isLoading && !error && (
                    <TabsContent value="performance" className="mt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-green-500">Total Income</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(performanceData.reduce((sum, p) => sum + (p.totalIncome || 0), 0))}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-red-500">Total Expenses</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(performanceData.reduce((sum, p) => sum + (p.totalExpenses || 0), 0))}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Net Operating Income</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(performanceData.reduce((sum, p) => sum + (p.netOperatingIncome || 0), 0))}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Properties</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{performanceData.length}</div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="bg-black border border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Performance by Property</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800">
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase">Property</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Income</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Expenses</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">NOI</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Avg Rent</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {performanceData.map((prop, i) => (
                                            <TableRow key={i} className="border-zinc-800 hover:bg-zinc-900/50">
                                                <TableCell className="font-mono text-sm text-white">{prop.propertyTitle}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-green-400">{formatCurrency(prop.totalIncome)}</TableCell>
                                                <TableCell className="font-mono text-xs text-right text-red-400">{formatCurrency(prop.totalExpenses)}</TableCell>
                                                <TableCell className="font-mono text-sm text-right text-amber-400 font-bold">{formatCurrency(prop.netOperatingIncome)}</TableCell>
                                                <TableCell className="font-mono text-xs text-right">{formatCurrency(prop.averageRent)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {performanceData.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-zinc-500 py-8 font-mono">
                                                    No performance data available
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Tenant Turnover Report */}
                {!isLoading && !error && (
                    <TabsContent value="turnover" className="mt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-green-500">Total Move-Ins</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono flex items-center">
                                        {turnoverData.reduce((sum, t) => sum + (t.moveIns || 0), 0)}
                                        <ArrowUpRight className="h-5 w-5 text-green-500 ml-2" />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-red-500">Total Move-Outs</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono flex items-center">
                                        {turnoverData.reduce((sum, t) => sum + (t.moveOuts || 0), 0)}
                                        <ArrowDownRight className="h-5 w-5 text-red-500 ml-2" />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Net Change</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">
                                        {turnoverData.reduce((sum, t) => sum + (t.netChange || 0), 0)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Periods</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{turnoverData.length}</div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="bg-black border border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Turnover by Period</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800">
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase">Period</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-center">Move-Ins</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-center">Move-Outs</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-center">Net Change</TableHead>
                                            <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Turnover Rate</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {turnoverData.map((period, i) => (
                                            <TableRow key={i} className="border-zinc-800 hover:bg-zinc-900/50">
                                                <TableCell className="font-mono text-sm text-white">{period.period}</TableCell>
                                                <TableCell className="font-mono text-xs text-center text-green-400">{period.moveIns}</TableCell>
                                                <TableCell className="font-mono text-xs text-center text-red-400">{period.moveOuts}</TableCell>
                                                <TableCell className="font-mono text-xs text-center text-zinc-400">{period.netChange}</TableCell>
                                                <TableCell className="font-mono text-sm text-right">
                                                    <Badge variant={period.turnoverRate > 30 ? 'destructive' : 'default'} className="font-mono">
                                                        {formatPercent(period.turnoverRate)}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {turnoverData.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-zinc-500 py-8 font-mono">
                                                    No turnover data available
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Maintenance Analytics Report */}
                {!isLoading && !error && (
                    <TabsContent value="maintenance" className="mt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Work Orders</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{maintenanceData?.totalWorkOrders || 0}</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-yellow-500">Open</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{maintenanceData?.openOrders || 0}</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-green-500">Completed</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{maintenanceData?.completedOrders || 0}</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Cost</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white font-mono">{formatCurrency(maintenanceData?.totalCost || 0)}</div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Card className="bg-black border border-zinc-800">
                                <CardHeader>
                                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Cost By Category</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-zinc-800">
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase">Category</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Cost</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {maintenanceData?.costByCategory && Object.entries(maintenanceData.costByCategory).map(([cat, cost], i) => (
                                                <TableRow key={i} className="border-zinc-800 hover:bg-zinc-900/50">
                                                    <TableCell className="font-mono text-sm text-white capitalize">{cat?.replace(/_/g, ' ')}</TableCell>
                                                    <TableCell className="font-mono text-xs text-right text-amber-400">{formatCurrency(cost as number)}</TableCell>
                                                </TableRow>
                                            ))}
                                            {(!maintenanceData?.costByCategory || Object.keys(maintenanceData.costByCategory).length === 0) && (
                                                <TableRow>
                                                    <TableCell colSpan={2} className="text-center text-zinc-500 py-4 font-mono">
                                                        No data
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            <Card className="bg-black border border-zinc-800">
                                <CardHeader>
                                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Vendor Performance</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-zinc-800">
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase">Vendor</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase text-center">Jobs</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase text-center">Rating</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Cost</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {maintenanceData?.vendorPerformance?.map((vendor, i) => (
                                                <TableRow key={i} className="border-zinc-800 hover:bg-zinc-900/50">
                                                    <TableCell className="font-mono text-sm text-white">{vendor.vendorName}</TableCell>
                                                    <TableCell className="font-mono text-xs text-center text-zinc-400">{vendor.completedJobs}</TableCell>
                                                    <TableCell className="font-mono text-xs text-center">
                                                        <Badge variant="default" className="font-mono">
                                                            {vendor.averageRating?.toFixed(1) || '-'}★
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-right text-amber-400">{formatCurrency(vendor.totalCost)}</TableCell>
                                                </TableRow>
                                            ))}
                                            {(!maintenanceData?.vendorPerformance || maintenanceData.vendorPerformance.length === 0) && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center text-zinc-500 py-4 font-mono">
                                                        No data
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
}
