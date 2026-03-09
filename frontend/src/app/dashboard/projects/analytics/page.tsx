'use client'

import React, { useState, useEffect } from 'react'
import {
    BarChart3,
    TrendingUp,
    DollarSign,
    AlertTriangle,
    Loader2,
    CheckCircle,
    Clock,
    ShieldAlert,
    Activity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { dashboardApi, PortfolioMetrics, TimelineStatus, BudgetOverview } from '@/lib/projects-api'
import { formatCurrency } from '@/lib/utils'

export default function ProjectsAnalyticsPage() {
    const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null)
    const [timeline, setTimeline] = useState<TimelineStatus | null>(null)
    const [budget, setBudget] = useState<BudgetOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)
            setError(null)
            const [metricsRes, timelineRes, budgetRes] = await Promise.allSettled([
                dashboardApi.getPortfolioMetrics(),
                dashboardApi.getTimelineStatus(),
                dashboardApi.getBudgetOverview(),
            ])
            if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value)
            if (timelineRes.status === 'fulfilled') setTimeline(timelineRes.value)
            if (budgetRes.status === 'fulfilled') setBudget(budgetRes.value)
        } catch (err: any) {
            console.error('Failed to load analytics:', err)
            setError(err.message || 'Failed to load analytics data')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <AlertTriangle className="h-10 w-10 text-red-500" />
                <p className="text-sm font-mono text-zinc-400">{error}</p>
                <Button
                    onClick={loadData}
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                    Retry
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
                    PROJECT ANALYTICS
                </h1>
                <p className="text-zinc-500 font-mono text-xs mt-1">
                    Portfolio performance, timelines &amp; budget insights
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">TOTAL PROJECTS</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">
                                    {metrics?.totalProjects ?? 0}
                                </p>
                            </div>
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <BarChart3 className="h-5 w-5 text-amber-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <TrendingUp className="h-3 w-3 mr-1 text-emerald-400" />
                            <span>{metrics?.monthOverMonthChange ? `${metrics.monthOverMonthChange > 0 ? '+' : ''}${metrics.monthOverMonthChange.toFixed(1)}%` : 'No change'} MoM</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">AVG PROGRESS</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">
                                    {metrics?.avgProgress?.toFixed(1) ?? 0}%
                                </p>
                            </div>
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <Activity className="h-5 w-5 text-emerald-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>Portfolio average</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">BUDGET UTILIZATION</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">
                                    {metrics?.budgetUtilization?.toFixed(1) ?? 0}%
                                </p>
                            </div>
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <DollarSign className="h-5 w-5 text-blue-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>
                                {metrics?.totalSpent ? formatCurrency(metrics.totalSpent.amount) : 'GH₵0'} of{' '}
                                {metrics?.totalBudget ? formatCurrency(metrics.totalBudget.amount) : 'GH₵0'}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">AT RISK</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">
                                    {metrics?.projectsAtRisk ?? 0}
                                </p>
                            </div>
                            <div className="p-2 bg-red-500/10 rounded-lg">
                                <ShieldAlert className="h-5 w-5 text-red-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>Projects needing attention</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Timeline Status */}
            <Card className="bg-zinc-900/80 border-zinc-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-white">TIMELINE STATUS</CardTitle>
                    <CardDescription className="text-[10px] font-mono text-zinc-500">
                        Project schedule performance breakdown
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                                <span className="text-[10px] font-mono text-emerald-400 tracking-wider">ON TRACK</span>
                            </div>
                            <p className="text-2xl font-mono font-bold text-white">{timeline?.onTrack ?? 0}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="h-4 w-4 text-amber-500" />
                                <span className="text-[10px] font-mono text-amber-400 tracking-wider">DELAYED</span>
                            </div>
                            <p className="text-2xl font-mono font-bold text-white">{timeline?.delayed ?? 0}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                <span className="text-[10px] font-mono text-red-400 tracking-wider">AT RISK</span>
                            </div>
                            <p className="text-2xl font-mono font-bold text-white">{timeline?.atRisk ?? 0}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="h-4 w-4 text-blue-500" />
                                <span className="text-[10px] font-mono text-blue-400 tracking-wider">COMPLETED</span>
                            </div>
                            <p className="text-2xl font-mono font-bold text-white">{timeline?.completed ?? 0}</p>
                        </div>
                    </div>
                    {timeline?.averageDelayDays !== undefined && timeline.averageDelayDays > 0 && (
                        <p className="text-[10px] font-mono text-zinc-500 mt-3">
                            Average delay: <span className="text-amber-400">{timeline.averageDelayDays} days</span>
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Budget Overview */}
            <Card className="bg-zinc-900/80 border-zinc-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-white">BUDGET BY CATEGORY</CardTitle>
                    <CardDescription className="text-[10px] font-mono text-zinc-500">
                        Budgeted vs. spent across cost categories
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {budget?.categories && budget.categories.length > 0 ? (
                        <div className="space-y-3">
                            {budget.categories.map((cat, idx) => (
                                <div key={idx}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-mono text-zinc-400">{cat.category}</span>
                                        <span className="text-[10px] font-mono text-zinc-500">
                                            {formatCurrency(cat.spent)} / {formatCurrency(cat.budgeted)}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                cat.percentage > 90 ? 'bg-red-500' : cat.percentage > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            <div className="pt-3 border-t border-zinc-800 flex justify-between">
                                <span className="text-xs font-mono text-zinc-400">Total</span>
                                <span className="text-xs font-mono text-white">
                                    {formatCurrency(budget.totalSpent)} / {formatCurrency(budget.totalBudget)}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="py-8 text-center">
                            <BarChart3 className="h-10 w-10 mx-auto mb-2 text-zinc-700 opacity-50" />
                            <p className="text-xs font-mono text-zinc-600">Budget data will populate with project costs</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Projects by Status */}
            {metrics?.projectsByStatus && Object.keys(metrics.projectsByStatus).length > 0 && (
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-mono text-white">PROJECTS BY STATUS</CardTitle>
                        <CardDescription className="text-[10px] font-mono text-zinc-500">
                            Distribution across project lifecycle
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            {Object.entries(metrics.projectsByStatus).map(([status, count]) => (
                                <div key={status} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-center">
                                    <p className="text-lg font-mono font-bold text-white">{count}</p>
                                    <p className="text-[10px] font-mono text-zinc-500 tracking-wider mt-1">
                                        {status.toUpperCase().replace(/_/g, ' ')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
