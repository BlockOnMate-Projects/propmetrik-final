'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
    Loader2, DollarSign, Target, BarChart3, Download, Clock,
    PieChart as PieChartIcon, ArrowLeftRight, Users, TrendingUp, Calendar,
    FileSpreadsheet, FileText, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { analyticsApi } from '@/lib/crm-api'
import { DealType } from '@/types/crm'
import {
    useDealMetrics,
    useAgentPerformance,
    useRevenueForecast,
    useRevenueTrend,
    useDealVelocity,
    useLossReasons,
    useFunnel,
    usePeriodComparison,
} from '@/hooks/crm/use-analytics'
import { usePipelines } from '@/hooks/crm/use-pipelines'
import {
    MetricCard,
    ChartContainer,
    RevenueTrendChart,
    PipelineFunnelChart,
    LossReasonPie,
    VelocityBarChart,
    VelocityTrendChart,
    AgentComparisonChart,
    ComparisonMetric,
} from '@/components/crm/AnalyticsCharts'

// ── Forecast Table (kept from original) ──────────────
function ForecastTable({ data }: { data: Array<{ stage_name: string; value: number; probability: number }> }) {
    return (
        <table className="w-full">
            <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left pb-2">Stage</th>
                    <th className="text-right pb-2">Value</th>
                    <th className="text-right pb-2">Prob.</th>
                    <th className="text-right pb-2">Weighted</th>
                </tr>
            </thead>
            <tbody className="text-sm">
                {data.map((row, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                        <td className="py-2 text-foreground">{row.stage_name}</td>
                        <td className="py-2 text-right text-muted-foreground">{formatCurrency(row.value, 'GHS')}</td>
                        <td className="py-2 text-right text-muted-foreground">{row.probability}%</td>
                        <td className="py-2 text-right text-emerald-500 dark:text-emerald-400">
                            {formatCurrency(row.value * (row.probability / 100), 'GHS')}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// ── Loss by Stage Bar (inline small) ─────────────────
function LossByStageBar({ data }: { data: Array<{ stage_name: string; lost_count: number; lost_value: number }> }) {
    const max = Math.max(...data.map(d => d.lost_count), 1)
    return (
        <div className="space-y-2">
            {data.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 text-right truncate">{s.stage_name}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                        <div
                            className="h-full bg-red-500/80 rounded-full flex items-center px-2"
                            style={{ width: `${(s.lost_count / max) * 100}%` }}
                        >
                            {s.lost_count > 0 && <span className="text-[10px] font-bold text-foreground">{s.lost_count}</span>}
                        </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-20 text-right">{formatCurrency(Number(s.lost_value), 'GHS')}</span>
                </div>
            ))}
        </div>
    )
}

// =====================================================
// MAIN PAGE
// =====================================================

export default function AnalyticsPage() {
    const [dealTypeFilter, setDealTypeFilter] = useState<string>('all')
    const [comparisonPeriod, setComparisonPeriod] = useState<string>('month')
    const [tab, setTab] = useState('overview')

    // Pipeline selection
    const { data: pipelines = [] } = usePipelines()
    const defaultPipeline = useMemo(
        () => pipelines.find((p: any) => p.is_default) || pipelines[0],
        [pipelines]
    )
    const [selectedPipelineId, setSelectedPipelineId] = useState('')
    const pipelineId = selectedPipelineId || defaultPipeline?.id || ''

    // Data hooks
    const dealTypeParam = dealTypeFilter !== 'all' ? dealTypeFilter as DealType : undefined
    const { data: metrics, isLoading: metricsLoading } = useDealMetrics({ deal_type: dealTypeParam })
    const { data: revenueTrend } = useRevenueTrend(12)
    const { data: funnel } = useFunnel(pipelineId || undefined)
    const { data: velocity } = useDealVelocity(pipelineId || undefined)
    const { data: lossReasons } = useLossReasons()
    const { data: comparison } = usePeriodComparison(comparisonPeriod)
    const { data: agentPerformance = [] } = useAgentPerformance()
    const { data: forecast } = useRevenueForecast()

    // Export handler
    const handleExport = useCallback((format: 'csv' | 'excel') => {
        const url = analyticsApi.exportData('deals', format)
        window.open(url, '_blank')
    }, [])

    // ── Loading ──────────────────────────────────────
    if (metricsLoading && !metrics) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* ─── Header ───────────────────────────────── */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
                    <p className="text-sm text-muted-foreground mt-1">Deal performance and revenue insights</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={dealTypeFilter} onValueChange={setDealTypeFilter}>
                        <SelectTrigger className="w-32 h-9 text-sm">
                            <SelectValue placeholder="Deal Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="sale">Sales</SelectItem>
                            <SelectItem value="rental">Rentals</SelectItem>
                            <SelectItem value="development">Development</SelectItem>
                        </SelectContent>
                    </Select>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-1.5">
                                <Download className="h-4 w-4" /> Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleExport('csv')}>
                                <FileText className="h-4 w-4 mr-2" /> Export CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('excel')}>
                                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* ─── Tab Navigation ────────────────────────── */}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid w-full grid-cols-5 h-9">
                    <TabsTrigger value="overview" className="text-xs gap-1">
                        <BarChart3 className="h-3.5 w-3.5" /> Overview
                    </TabsTrigger>
                    <TabsTrigger value="velocity" className="text-xs gap-1">
                        <Clock className="h-3.5 w-3.5" /> Velocity
                    </TabsTrigger>
                    <TabsTrigger value="loss" className="text-xs gap-1">
                        <PieChartIcon className="h-3.5 w-3.5" /> Loss Analysis
                    </TabsTrigger>
                    <TabsTrigger value="comparison" className="text-xs gap-1">
                        <ArrowLeftRight className="h-3.5 w-3.5" /> Comparison
                    </TabsTrigger>
                    <TabsTrigger value="agents" className="text-xs gap-1">
                        <Users className="h-3.5 w-3.5" /> Agents
                    </TabsTrigger>
                </TabsList>

                {/* ─────────────── OVERVIEW TAB ─────────────── */}
                <TabsContent value="overview" className="mt-4 space-y-4">
                    {/* Comparison Metric Cards */}
                    {comparison ? (
                        <div className="grid gap-3 md:grid-cols-4">
                            <MetricCard
                                title="Pipeline Value"
                                value={comparison.current.pipeline_value}
                                format="currency"
                                change={Number(comparison.changes.pipeline_value)}
                                changeLabel="vs last period"
                                icon={DollarSign}
                            />
                            <MetricCard
                                title="Deals Won"
                                value={comparison.current.deals_won}
                                format="number"
                                change={Number(comparison.changes.deals_won)}
                                changeLabel="vs last period"
                                icon={TrendingUp}
                            />
                            <MetricCard
                                title="Revenue Won"
                                value={comparison.current.revenue_won}
                                format="currency"
                                change={Number(comparison.changes.revenue_won)}
                                changeLabel="vs last period"
                                icon={DollarSign}
                            />
                            <MetricCard
                                title="Win Rate"
                                value={comparison.current.conversion_rate}
                                format="percent"
                                change={Number(comparison.changes.conversion_rate)}
                                changeLabel="vs last period"
                                icon={Target}
                            />
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-4">
                            <MetricCard title="Total Deals" value={metrics?.totalDeals || 0} icon={BarChart3} />
                            <MetricCard title="Pipeline Value" value={metrics?.totalValue || 0} format="currency" icon={DollarSign} />
                            <MetricCard title="Won Value" value={metrics?.wonValue || 0} format="currency" icon={TrendingUp} />
                            <MetricCard title="Conversion Rate" value={(metrics?.conversionRate || 0) * 100} format="percent" icon={Target} />
                        </div>
                    )}

                    {/* Revenue Trend + Pipeline Funnel */}
                    <div className="grid gap-4 lg:grid-cols-3">
                        <ChartContainer
                            title="Revenue Trend"
                            subtitle="Won vs lost over past 12 months"
                            className="lg:col-span-2"
                        >
                            {revenueTrend?.data && revenueTrend.data.length > 0 ? (
                                <RevenueTrendChart data={revenueTrend.data} />
                            ) : (
                                <div className="text-center py-12 text-sm text-muted-foreground">No trend data yet</div>
                            )}
                        </ChartContainer>

                        <ChartContainer
                            title="Pipeline Funnel"
                            subtitle={funnel ? `${funnel.overall_conversion}% overall conversion` : ''}
                            action={
                                pipelines.length > 0 && (
                                    <Select value={pipelineId} onValueChange={setSelectedPipelineId}>
                                        <SelectTrigger className="w-40 h-7 text-xs">
                                            <SelectValue placeholder="Pipeline" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {pipelines.map((p: any) => (
                                                <SelectItem key={p.id} value={p.id}>{p.pipeline_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )
                            }
                        >
                            {funnel?.stages ? (
                                <PipelineFunnelChart data={funnel.stages} height={280} />
                            ) : (
                                <div className="text-center py-12 text-sm text-muted-foreground">Select a pipeline</div>
                            )}
                        </ChartContainer>
                    </div>

                    {/* Revenue Forecast */}
                    <ChartContainer title="Revenue Forecast" subtitle="Weighted pipeline projection">
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="text-center p-3 bg-muted border border-border rounded-md">
                                <div className="text-xs text-muted-foreground mb-1">This Month</div>
                                <div className="text-lg font-semibold text-emerald-500 dark:text-emerald-400">
                                    {formatCurrency(forecast?.current_month || 0, 'GHS')}
                                </div>
                            </div>
                            <div className="text-center p-3 bg-muted border border-border rounded-md">
                                <div className="text-xs text-muted-foreground mb-1">Next Month</div>
                                <div className="text-lg font-semibold text-primary">
                                    {formatCurrency(forecast?.next_month || 0, 'GHS')}
                                </div>
                            </div>
                            <div className="text-center p-3 bg-muted border border-border rounded-md">
                                <div className="text-xs text-muted-foreground mb-1">Quarter</div>
                                <div className="text-lg font-semibold text-foreground">
                                    {formatCurrency(forecast?.quarter || 0, 'GHS')}
                                </div>
                            </div>
                        </div>
                        {forecast?.by_stage && forecast.by_stage.length > 0 && (
                            <ForecastTable data={forecast.by_stage} />
                        )}
                    </ChartContainer>
                </TabsContent>

                {/* ──────────── VELOCITY TAB ──────────────── */}
                <TabsContent value="velocity" className="mt-4 space-y-4">
                    {/* Summary cards */}
                    <div className="grid gap-3 md:grid-cols-3">
                        <MetricCard
                            title="Avg Deal Cycle"
                            value={velocity?.overall_avg_days || 0}
                            format="days"
                            icon={Clock}
                        />
                        <MetricCard
                            title="Median Cycle"
                            value={velocity?.overall_median_days || 0}
                            format="days"
                            icon={Clock}
                        />
                        <MetricCard
                            title="Active Deals"
                            value={metrics?.activeDeals || 0}
                            format="number"
                            icon={BarChart3}
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* Time by stage */}
                        <ChartContainer title="Time in Each Stage" subtitle="Average days per pipeline stage">
                            {velocity?.by_stage && velocity.by_stage.length > 0 ? (
                                <VelocityBarChart data={velocity.by_stage} />
                            ) : (
                                <div className="text-center py-12 text-sm text-muted-foreground">No stage velocity data</div>
                            )}
                        </ChartContainer>

                        {/* Velocity trend */}
                        <ChartContainer title="Velocity Trend" subtitle="Monthly average close time">
                            {velocity?.trend && velocity.trend.length > 0 ? (
                                <VelocityTrendChart data={velocity.trend} />
                            ) : (
                                <div className="text-center py-12 text-sm text-muted-foreground">Not enough data</div>
                            )}
                        </ChartContainer>
                    </div>

                    {/* By deal type */}
                    {velocity?.by_deal_type && velocity.by_deal_type.length > 0 && (
                        <ChartContainer title="Cycle Time by Deal Type">
                            <div className="grid gap-3 md:grid-cols-3">
                                {velocity.by_deal_type.map((dt, idx) => (
                                    <div key={idx} className="p-3 rounded-lg bg-muted/50 border border-border">
                                        <p className="text-xs text-muted-foreground capitalize">{dt.deal_type}</p>
                                        <p className="text-lg font-bold text-foreground tabular-nums">{Number(dt.avg_days).toFixed(1)} days</p>
                                        <p className="text-xs text-muted-foreground">{dt.deal_count} deals</p>
                                    </div>
                                ))}
                            </div>
                        </ChartContainer>
                    )}
                </TabsContent>

                {/* ─────────── LOSS ANALYSIS TAB ─────────────  */}
                <TabsContent value="loss" className="mt-4 space-y-4">
                    {/* Summary */}
                    <div className="grid gap-3 md:grid-cols-3">
                        <MetricCard
                            title="Total Lost"
                            value={lossReasons?.total_lost || 0}
                            format="number"
                            icon={AlertTriangle}
                        />
                        <MetricCard
                            title="Lost Value"
                            value={lossReasons?.total_lost_value || 0}
                            format="currency"
                            icon={DollarSign}
                        />
                        <MetricCard
                            title="Loss Rate"
                            value={
                                metrics?.totalDeals
                                    ? ((lossReasons?.total_lost || 0) / metrics.totalDeals * 100)
                                    : 0
                            }
                            format="percent"
                            icon={Target}
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* Pie chart */}
                        <ChartContainer title="Loss Reasons" subtitle="Distribution by reason">
                            {lossReasons?.by_reason && lossReasons.by_reason.length > 0 ? (
                                <LossReasonPie data={lossReasons.by_reason} />
                            ) : (
                                <div className="text-center py-12 text-sm text-muted-foreground">No loss data yet</div>
                            )}
                        </ChartContainer>

                        {/* Lost by stage */}
                        <ChartContainer title="Where Deals Are Lost" subtitle="Deals lost per pipeline stage">
                            {lossReasons?.by_stage && lossReasons.by_stage.length > 0 ? (
                                <LossByStageBar data={lossReasons.by_stage} />
                            ) : (
                                <div className="text-center py-12 text-sm text-muted-foreground">No stage loss data</div>
                            )}
                        </ChartContainer>
                    </div>

                    {/* Loss trend */}
                    {lossReasons?.trend && lossReasons.trend.length > 0 && (
                        <ChartContainer title="Loss Trend" subtitle="Monthly lost deals & value">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-xs text-muted-foreground border-b border-border">
                                            <th className="text-left pb-2">Period</th>
                                            <th className="text-right pb-2">Deals Lost</th>
                                            <th className="text-right pb-2">Value Lost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {lossReasons.trend.map((row, idx) => (
                                            <tr key={idx} className="border-b border-border/50">
                                                <td className="py-2 text-foreground">{row.period}</td>
                                                <td className="py-2 text-right text-red-500">{row.lost_count}</td>
                                                <td className="py-2 text-right text-muted-foreground">{formatCurrency(Number(row.lost_value), 'GHS')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </ChartContainer>
                    )}
                </TabsContent>

                {/* ────────── COMPARISON TAB ──────────────── */}
                <TabsContent value="comparison" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium text-foreground">Period-over-Period Comparison</h2>
                        <Select value={comparisonPeriod} onValueChange={setComparisonPeriod}>
                            <SelectTrigger className="w-36 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="week">Week over Week</SelectItem>
                                <SelectItem value="month">Month over Month</SelectItem>
                                <SelectItem value="quarter">Quarter over Quarter</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {comparison ? (
                        <>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span className="font-medium text-foreground">{comparison.current.label}</span>
                                vs
                                <span>{comparison.previous.label}</span>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                                <ComparisonMetric
                                    label="Deals Created"
                                    current={comparison.current.deals_created}
                                    previous={comparison.previous.deals_created}
                                    change={Number(comparison.changes.deals_created)}
                                />
                                <ComparisonMetric
                                    label="Deals Won"
                                    current={comparison.current.deals_won}
                                    previous={comparison.previous.deals_won}
                                    change={Number(comparison.changes.deals_won)}
                                />
                                <ComparisonMetric
                                    label="Revenue Won"
                                    current={comparison.current.revenue_won}
                                    previous={comparison.previous.revenue_won}
                                    change={Number(comparison.changes.revenue_won)}
                                    format="currency"
                                />
                                <ComparisonMetric
                                    label="Revenue Lost"
                                    current={comparison.current.revenue_lost}
                                    previous={comparison.previous.revenue_lost}
                                    change={Number(comparison.changes.revenue_lost)}
                                    format="currency"
                                    invertColors
                                />
                                <ComparisonMetric
                                    label="Pipeline Value"
                                    current={comparison.current.pipeline_value}
                                    previous={comparison.previous.pipeline_value}
                                    change={Number(comparison.changes.pipeline_value)}
                                    format="currency"
                                />
                                <ComparisonMetric
                                    label="Avg Deal Value"
                                    current={comparison.current.avg_deal_value}
                                    previous={comparison.previous.avg_deal_value}
                                    change={Number(comparison.changes.avg_deal_value)}
                                    format="currency"
                                />
                                <ComparisonMetric
                                    label="Win Rate"
                                    current={comparison.current.conversion_rate}
                                    previous={comparison.previous.conversion_rate}
                                    change={Number(comparison.changes.conversion_rate)}
                                    format="percent"
                                />
                                <ComparisonMetric
                                    label="Avg Cycle Days"
                                    current={comparison.current.avg_cycle_days}
                                    previous={comparison.previous.avg_cycle_days}
                                    change={Number(comparison.changes.avg_cycle_days)}
                                    format="days"
                                    invertColors
                                />
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-sm text-muted-foreground">Loading comparison data...</div>
                    )}
                </TabsContent>

                {/* ─────────── AGENTS TAB ─────────────────── */}
                <TabsContent value="agents" className="mt-4 space-y-4">
                    {/* Visual chart */}
                    {Array.isArray(agentPerformance) && agentPerformance.length > 0 && (
                        <ChartContainer title="Agent Value Comparison" subtitle="Won value & active pipeline by agent">
                            <AgentComparisonChart data={agentPerformance} />
                        </ChartContainer>
                    )}

                    {/* Table */}
                    <Card className="border-border shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-sm font-medium text-foreground mb-4">Agent Performance</p>
                            {!Array.isArray(agentPerformance) || agentPerformance.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">No agent data available</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="text-xs text-muted-foreground border-b border-border">
                                                <th className="text-left pb-2">Agent</th>
                                                <th className="text-right pb-2">Deals</th>
                                                <th className="text-right pb-2">Won</th>
                                                <th className="text-right pb-2">Pipeline Value</th>
                                                <th className="text-right pb-2">Won Value</th>
                                                <th className="text-right pb-2">Win Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {agentPerformance.map((agent: any, idx: number) => (
                                                <tr key={idx} className="border-b border-border/50 hover:bg-muted/50">
                                                    <td className="py-3 text-foreground">{agent.name || 'Unknown'}</td>
                                                    <td className="py-3 text-right text-muted-foreground">{agent.total_deals || 0}</td>
                                                    <td className="py-3 text-right text-emerald-500 dark:text-emerald-400">{agent.won_deals || 0}</td>
                                                    <td className="py-3 text-right text-muted-foreground">{formatCurrency(agent.pipeline_value || 0, 'GHS')}</td>
                                                    <td className="py-3 text-right text-emerald-500 dark:text-emerald-400">{formatCurrency(agent.won_value || 0, 'GHS')}</td>
                                                    <td className="py-3 text-right">
                                                        <span className={cn(
                                                            'px-1.5 py-0.5 rounded text-xs',
                                                            (agent.win_rate || 0) >= 30
                                                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                                                : 'bg-muted text-muted-foreground'
                                                        )}>
                                                            {(agent.win_rate || 0).toFixed(1)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
