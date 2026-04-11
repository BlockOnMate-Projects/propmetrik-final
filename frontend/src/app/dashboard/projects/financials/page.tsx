'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    BarChart3,
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    HardHat,
    Building2,
    Calendar,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Send,
    FileText,
    RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaymentSchedule } from '@/components/projects/budget/PaymentSchedule'
import { revenueApi, RevenueSummary, RevenueTransaction } from '@/lib/budget-api'

function formatCurrency(amount: number, currency = 'GHS'): string {
    const symbols: Record<string, string> = { GHS: 'GH₵', USD: '$', GBP: '£', EUR: '€' }
    const sym = symbols[currency] || `${currency} `
    return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getStatusBadge(status: string) {
    const config: Record<string, { label: string; className: string }> = {
        paid: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        sent: { label: 'Sent', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        pending: { label: 'Pending', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        overdue: { label: 'Overdue', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
        viewed: { label: 'Viewed', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
        approved: { label: 'Approved', className: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
        partially_paid: { label: 'Partial', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
        settled: { label: 'Settled', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        cancelled: { label: 'Cancelled', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
        rejected: { label: 'Rejected', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
        void: { label: 'Void', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
        draft: { label: 'Draft', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
    }
    const c = config[status] || { label: status, className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
    return <Badge variant="outline" className={`text-[10px] font-mono ${c.className}`}>{c.label}</Badge>
}

export default function ProjectsFinancialsPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'payment-schedule'>('overview')
    const [data, setData] = useState<RevenueSummary | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedProject, setSelectedProject] = useState<string>('all')

    const fetchRevenue = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)
            const projectId = selectedProject === 'all' ? undefined : selectedProject
            const result = await revenueApi.getSummary(projectId)
            setData(result)
        } catch (err: any) {
            console.error('Error fetching revenue:', err)
            setError(err?.message || 'Failed to load revenue data')
        } finally {
            setIsLoading(false)
        }
    }, [selectedProject])

    useEffect(() => {
        fetchRevenue()
    }, [fetchRevenue])

    const collectionRate = data && data.totalInvoiced > 0
        ? Math.round((data.totalPaid / data.totalInvoiced) * 100)
        : 0

    const selectedProjectName = selectedProject === 'all'
        ? 'All Projects'
        : data?.projects.find(p => p.id === selectedProject)?.name || 'Project'

    // Use the project/portfolio's native currency, not hardcoded GHS
    const ccy = data?.currency || 'USD'

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
                        PROJECT FINANCIAL CENTER
                    </h1>
                    <p className="text-zinc-500 font-mono text-xs mt-1">
                        Revenue tracking, invoice payments &amp; payment configuration
                    </p>
                </div>
                {activeTab === 'overview' && (
                    <div className="flex items-center gap-3">
                        {/* Project Selector */}
                        <Select value={selectedProject} onValueChange={setSelectedProject}>
                            <SelectTrigger className="w-56 bg-zinc-900 border-zinc-700 text-zinc-300 font-mono text-xs">
                                <Building2 className="h-3.5 w-3.5 mr-1.5 text-zinc-500" />
                                <SelectValue placeholder="All Projects" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    <span className="font-mono text-xs">All Projects (Portfolio)</span>
                                </SelectItem>
                                {(data?.projects || []).map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        <span className="font-mono text-xs">{p.name}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchRevenue}
                            disabled={isLoading}
                            className="border-zinc-700 text-zinc-400 hover:text-white"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                )}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2.5 font-mono text-[11px] tracking-wider border-b-2 transition-colors ${
                        activeTab === 'overview'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    <DollarSign className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Revenue &amp; Payments
                </button>
                <button
                    onClick={() => setActiveTab('payment-schedule')}
                    className={`px-4 py-2.5 font-mono text-[11px] tracking-wider border-b-2 transition-colors ${
                        activeTab === 'payment-schedule'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    <Calendar className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Payment Schedule
                </button>
            </div>

            {/* Tab: Payment Schedule */}
            {activeTab === 'payment-schedule' && (
                <PaymentSchedule
                    projectId={selectedProject === 'all' ? '' : selectedProject}
                />
            )}

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
                <>
                    {isLoading && !data ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                        </div>
                    ) : error ? (
                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="flex flex-col items-center py-12">
                                <AlertTriangle className="h-10 w-10 text-red-400 mb-3" />
                                <p className="text-sm font-mono text-zinc-400">{error}</p>
                                <Button variant="outline" size="sm" className="mt-4" onClick={fetchRevenue}>
                                    Try Again
                                </Button>
                            </CardContent>
                        </Card>
                    ) : data ? (
                        <>
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Total Invoiced */}
                                <Card className="bg-zinc-900/80 border-zinc-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">TOTAL INVOICED</p>
                                                <p className="text-2xl font-mono font-bold text-white mt-1">
                                                    {formatCurrency(data.totalInvoiced, ccy)}
                                                </p>
                                            </div>
                                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                                <FileText className="h-5 w-5 text-amber-500" />
                                            </div>
                                        </div>
                                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                            <Send className="h-3 w-3 mr-1 text-blue-400" />
                                            <span>{data.totalCount} invoices &bull; {selectedProjectName}</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Revenue Collected */}
                                <Card className="bg-zinc-900/80 border-zinc-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">REVENUE COLLECTED</p>
                                                <p className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                                                    {formatCurrency(data.totalPaid, ccy)}
                                                </p>
                                            </div>
                                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                                <Wallet className="h-5 w-5 text-emerald-500" />
                                            </div>
                                        </div>
                                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
                                            <span>{data.paidCount} paid &bull; {collectionRate}% collection rate</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Outstanding / Pending */}
                                <Card className="bg-zinc-900/80 border-zinc-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">OUTSTANDING</p>
                                                <p className="text-2xl font-mono font-bold text-amber-400 mt-1">
                                                    {formatCurrency(data.totalPending, ccy)}
                                                </p>
                                            </div>
                                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                                <Clock className="h-5 w-5 text-amber-500" />
                                            </div>
                                        </div>
                                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                            <Send className="h-3 w-3 mr-1 text-blue-400" />
                                            <span>{data.sentCount} sent &bull; awaiting payment</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Project Budget */}
                                <Card className="bg-zinc-900/80 border-zinc-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">PROJECT BUDGET</p>
                                                <p className="text-2xl font-mono font-bold text-white mt-1">
                                                    {formatCurrency(data.totalBudget, ccy)}
                                                </p>
                                            </div>
                                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                                <Building2 className="h-5 w-5 text-blue-500" />
                                            </div>
                                        </div>
                                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                            <TrendingUp className="h-3 w-3 mr-1 text-emerald-400" />
                                            <span>{data.activeProjectCount} active project{data.activeProjectCount !== 1 ? 's' : ''}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Overdue Alert */}
                            {data.overdueCount > 0 && (
                                <Card className="bg-red-950/30 border-red-900/40">
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-mono text-red-300 font-medium">
                                                {data.overdueCount} Overdue Invoice{data.overdueCount > 1 ? 's' : ''}
                                            </p>
                                            <p className="text-[10px] font-mono text-red-400/70">
                                                {formatCurrency(data.totalOverdue, ccy)} past due — follow up with clients
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Collection Progress */}
                            <Card className="bg-zinc-900/80 border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-mono text-white">COLLECTION PROGRESS</CardTitle>
                                    <CardDescription className="text-[10px] font-mono text-zinc-500">
                                        Revenue collected vs total invoiced
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between text-sm font-mono">
                                            <span className="text-zinc-400">
                                                {formatCurrency(data.totalPaid, ccy)} of {formatCurrency(data.totalInvoiced, ccy)}
                                            </span>
                                            <span className="text-emerald-400 font-bold">{collectionRate}%</span>
                                        </div>
                                        <Progress value={collectionRate} className="h-3" />
                                        <div className="grid grid-cols-3 gap-4 pt-2">
                                            <div className="text-center">
                                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                                                    <span className="text-[10px] font-mono text-zinc-500">COLLECTED</span>
                                                </div>
                                                <p className="text-sm font-mono font-bold text-emerald-400">
                                                    {formatCurrency(data.totalPaid, ccy)}
                                                </p>
                                            </div>
                                            <div className="text-center">
                                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                                                    <span className="text-[10px] font-mono text-zinc-500">PENDING</span>
                                                </div>
                                                <p className="text-sm font-mono font-bold text-amber-400">
                                                    {formatCurrency(data.totalPending, ccy)}
                                                </p>
                                            </div>
                                            <div className="text-center">
                                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                                    <div className="h-2 w-2 rounded-full bg-red-400" />
                                                    <span className="text-[10px] font-mono text-zinc-500">OVERDUE</span>
                                                </div>
                                                <p className="text-sm font-mono font-bold text-red-400">
                                                    {formatCurrency(data.totalOverdue, ccy)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Monthly Revenue Chart (simple bar representation) */}
                            {data.monthlyRevenue.length > 0 && (
                                <Card className="bg-zinc-900/80 border-zinc-800">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-mono text-white">MONTHLY REVENUE (12M)</CardTitle>
                                        <CardDescription className="text-[10px] font-mono text-zinc-500">
                                            Invoiced vs collected by month
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {data.monthlyRevenue.map((m) => {
                                                const maxVal = Math.max(...data.monthlyRevenue.map(r => Math.max(r.invoiced, r.paid)), 1)
                                                const invoicedPct = (m.invoiced / maxVal) * 100
                                                const paidPct = (m.paid / maxVal) * 100
                                                const monthLabel = new Date(m.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
                                                return (
                                                    <div key={m.month} className="flex items-center gap-3">
                                                        <span className="text-[10px] font-mono text-zinc-500 w-14 text-right flex-shrink-0">
                                                            {monthLabel}
                                                        </span>
                                                        <div className="flex-1 space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className="h-2 rounded-full bg-amber-500/40"
                                                                    style={{ width: `${Math.max(invoicedPct, 2)}%` }}
                                                                />
                                                                <span className="text-[9px] font-mono text-zinc-600 flex-shrink-0">
                                                                    {formatCurrency(m.invoiced, ccy)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className="h-2 rounded-full bg-emerald-500"
                                                                    style={{ width: `${Math.max(paidPct, 2)}%` }}
                                                                />
                                                                <span className="text-[9px] font-mono text-zinc-600 flex-shrink-0">
                                                                    {formatCurrency(m.paid, ccy)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            <div className="flex items-center gap-4 pt-2 border-t border-zinc-800">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-2 w-6 rounded-full bg-amber-500/40" />
                                                    <span className="text-[9px] font-mono text-zinc-500">Invoiced</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-2 w-6 rounded-full bg-emerald-500" />
                                                    <span className="text-[9px] font-mono text-zinc-500">Collected</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Recent Transactions */}
                            <Card className="bg-zinc-900/80 border-zinc-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-mono text-white">RECENT TRANSACTIONS</CardTitle>
                                    <CardDescription className="text-[10px] font-mono text-zinc-500">
                                        Latest invoice payments &amp; activity
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {data.recentTransactions.length === 0 ? (
                                        <div className="py-8 text-center">
                                            <FileText className="h-8 w-8 mx-auto text-zinc-700 mb-2" />
                                            <p className="text-xs font-mono text-zinc-600">No transactions yet</p>
                                            <p className="text-[10px] font-mono text-zinc-700 mt-1">
                                                Send invoices to clients to start tracking payments
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {/* Table header */}
                                            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-3 py-2 text-[10px] font-mono text-zinc-600 border-b border-zinc-800">
                                                <span>INVOICE</span>
                                                <span>CLIENT</span>
                                                <span className="text-right">AMOUNT</span>
                                                <span className="text-center">STATUS</span>
                                                <span className="text-right">DATE</span>
                                            </div>
                                            {data.recentTransactions.map((tx) => (
                                                <div
                                                    key={tx.id}
                                                    className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-3 py-2.5 rounded-md hover:bg-zinc-800/50 transition-colors items-center"
                                                >
                                                    <div>
                                                        <p className="text-xs font-mono text-white font-medium">
                                                            {tx.invoiceNumber}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-mono text-zinc-400 truncate">
                                                            {tx.clientName || tx.vendorCompany || '—'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-xs font-mono font-medium ${
                                                            tx.status === 'paid' ? 'text-emerald-400' : 'text-white'
                                                        }`}>
                                                            {formatCurrency(tx.totalAmount, tx.currency)}
                                                        </p>
                                                        {tx.projectName && (
                                                            <p className="text-[9px] font-mono text-zinc-600">
                                                                {tx.projectName}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="text-center">
                                                        {getStatusBadge(tx.status)}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-mono text-zinc-500">
                                                            {formatDate(tx.paidDate || tx.sentAt || tx.createdAt)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    ) : null}
                </>
            )}
        </div>
    )
}
