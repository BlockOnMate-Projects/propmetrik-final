'use client'

import { TerminalPanel, AnalyticsChart, DataMetricCard } from '@/components/ui/terminal'
import { DataAnalyticsPanel } from '@/components/data-hub/DataAnalyticsPanel'
import {
    Zap,
    Clock,
    Activity,
    AlertTriangle,
    TrendingUp,
    Server,
    Database,
    HardDrive,
} from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataHubPerformanceApi } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts'

export default function PerformancePage() {
    const [mounted, setMounted] = useState(false)
    const [timeRange, setTimeRange] = useState('24h')

    useEffect(() => {
        setMounted(true)
    }, [])

    const { data: ingestionSpeed } = useQuery({
        queryKey: ['performance-ingestion'],
        queryFn: () => dataHubPerformanceApi.getIngestionSpeed(),
    })

    const { data: processingTime } = useQuery({
        queryKey: ['performance-processing'],
        queryFn: () => dataHubPerformanceApi.getProcessingTime(),
    })

    const { data: queueDepth } = useQuery({
        queryKey: ['performance-queues'],
        queryFn: () => dataHubPerformanceApi.getQueueDepth(),
    })

    const { data: resourceUtilization } = useQuery({
        queryKey: ['performance-resources'],
        queryFn: () => dataHubPerformanceApi.getResourceUtilization(),
    })

    const { data: bottleneckData } = useQuery({
        queryKey: ['performance-bottlenecks'],
        queryFn: () => dataHubPerformanceApi.getBottlenecks(),
    })

    const { data: slaData } = useQuery({
        queryKey: ['performance-sla'],
        queryFn: () => dataHubPerformanceApi.getSlaMetrics(),
    })

    // Fallbacks
    const ingestionSpeedData = useMemo(() => ingestionSpeed?.data || [], [ingestionSpeed])
    const processingTimeData = useMemo(() => processingTime?.data || [], [processingTime])
    const queueDepthData = useMemo(() => queueDepth?.data || [], [queueDepth])
    const resourceData = useMemo(() => resourceUtilization?.data || [], [resourceUtilization])
    const bottlenecks = useMemo(() => bottleneckData?.data || [], [bottleneckData])
    const slaMetrics = useMemo(() => slaData?.data || [], [slaData])

    // Summary metrics
    const currentIngestionRate = useMemo(() => {
        if (!ingestionSpeedData.length) return 0
        return ingestionSpeedData[ingestionSpeedData.length - 1].recordsPerSec
    }, [ingestionSpeedData])

    const avgProcessingTime = useMemo(() => {
        if (!processingTimeData.length) return 0
        return Math.round(processingTimeData.reduce((acc, curr) => acc + curr.avgTime, 0) / processingTimeData.length)
    }, [processingTimeData])

    const totalQueueDepth = useMemo(() => {
        if (!queueDepthData.length) return 0
        const latest = queueDepthData[queueDepthData.length - 1]
        return latest.pending + latest.processing
    }, [queueDepthData])

    const currentCpu = useMemo(() => {
        const cpu = resourceData.find(r => r.resource === 'CPU')
        return cpu ? cpu.current : 0
    }, [resourceData])

    return (
        <div className="min-h-screen bg-background text-foreground p-4 pb-10">
            {/* Header */}
            <div className="mb-6">
                <h1 className="font-mono text-2xl text-amber-500 tracking-wider">PERFORMANCE METRICS DASHBOARD</h1>
                <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    REAL-TIME PERFORMANCE MONITORING • BOTTLENECK DETECTION • SLA TRACKING
                </p>
            </div>

            {/* Key Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <DataMetricCard
                    title="Ingestion Rate"
                    value={formatNumber(currentIngestionRate)}
                    subtitle="Records/second"
                    trend={12.5}
                    icon={Zap}
                    color="blue"
                    status="live"
                />

                <DataMetricCard
                    title="Avg Processing Time"
                    value={`${avgProcessingTime}ms`}
                    subtitle="Per job"
                    trend={-8.3}
                    trendLabel="improvement"
                    icon={Clock}
                    color="green"
                />

                <DataMetricCard
                    title="Queue Depth"
                    value={formatNumber(totalQueueDepth)}
                    subtitle="Pending jobs"
                    trend={-15.2}
                    icon={Activity}
                    color="purple"
                />

                <DataMetricCard
                    title="CPU Utilization"
                    value={`${currentCpu}%`}
                    subtitle="Current load"
                    icon={Server}
                    color="amber"
                />
            </div>

            {/* Ingestion Speed & Queue Depth */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <DataAnalyticsPanel
                    title="Ingestion Speed Metrics"
                    timeRange={timeRange}
                    onTimeRangeChange={setTimeRange}
                >
                    <AnalyticsChart title="Records Per Second" height={300}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={ingestionSpeedData}>
                                <defs>
                                    <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                    dataKey="hour"
                                    stroke="#71717a"
                                    style={{ fontSize: '10px', fontFamily: 'monospace' }}
                                />
                                <YAxis
                                    stroke="#71717a"
                                    style={{ fontSize: '10px', fontFamily: 'monospace' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid #27272a',
                                        fontFamily: 'monospace',
                                        fontSize: '11px'
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="recordsPerSec"
                                    stroke="#3b82f6"
                                    fillOpacity={1}
                                    fill="url(#colorSpeed)"
                                    name="Records/sec"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </AnalyticsChart>
                </DataAnalyticsPanel>

                <DataAnalyticsPanel title="Queue Depth Monitoring">
                    <AnalyticsChart title="Job Queue Status" height={300}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={queueDepthData.slice(-24)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                    dataKey="time"
                                    stroke="#71717a"
                                    tickFormatter={(val) => {
                                        if (!mounted) return ''
                                        return timeRange === '24h' ? val :
                                            new Date(val).toLocaleDateString([], { month: 'short', day: 'numeric' })
                                    }}
                                    style={{ fontSize: '10px', fontFamily: 'monospace' }}
                                />
                                <YAxis
                                    stroke="#71717a"
                                    style={{ fontSize: '10px', fontFamily: 'monospace' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid #27272a',
                                        fontFamily: 'monospace',
                                        fontSize: '11px'
                                    }}
                                />
                                <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px' }} />
                                <Line type="monotone" dataKey="pending" stroke="#f59e0b" name="Pending" strokeWidth={2} />
                                <Line type="monotone" dataKey="processing" stroke="#3b82f6" name="Processing" />
                                <Line type="monotone" dataKey="completed" stroke="#10b981" name="Completed" />
                            </LineChart>
                        </ResponsiveContainer>
                    </AnalyticsChart>
                </DataAnalyticsPanel>
            </div>

            {/* Processing Time Analytics */}
            <div className="mb-6">
                <TerminalPanel title="Processing Time by Job Type">
                    <AnalyticsChart title="Average, P95, and P99 Latencies" height={300}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={processingTimeData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                    dataKey="jobType"
                                    stroke="#71717a"
                                    style={{ fontSize: '10px', fontFamily: 'monospace' }}
                                />
                                <YAxis
                                    stroke="#71717a"
                                    style={{ fontSize: '10px', fontFamily: 'monospace' }}
                                    label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft', style: { fontSize: '10px', fontFamily: 'monospace', fill: '#71717a' } }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid #27272a',
                                        fontFamily: 'monospace',
                                        fontSize: '11px'
                                    }}
                                />
                                <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px' }} />
                                <Bar dataKey="avgTime" fill="#3b82f6" name="Average" />
                                <Bar dataKey="p95" fill="#f59e0b" name="P95" />
                                <Bar dataKey="p99" fill="#ef4444" name="P99" />
                            </BarChart>
                        </ResponsiveContainer>
                    </AnalyticsChart>
                </TerminalPanel>
            </div>

            {/* Resource Utilization & Bottlenecks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Resource Utilization */}
                <TerminalPanel title="Resource Utilization">
                    <div className="space-y-4">
                        {resourceData.map((resource) => (
                            <div key={resource.resource} className="p-3 bg-muted/30 border border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="font-mono text-sm text-foreground">{resource.resource}</div>
                                    <div className="font-mono text-xs text-muted-foreground">
                                        Current: {resource.current}% | Avg: {resource.average}% | Peak: {resource.peak}%
                                    </div>
                                </div>
                                <div className="h-2 bg-zinc-700 overflow-hidden">
                                    <div
                                        className={`h-full ${resource.current >= 80 ? 'bg-red-500' :
                                            resource.current >= 60 ? 'bg-yellow-500' : 'bg-green-500'
                                            }`}
                                        style={{ width: `${resource.current}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>

                {/* Bottleneck Detection */}
                <TerminalPanel title="Detected Bottlenecks">
                    <div className="space-y-3">
                        {bottlenecks.map((bottleneck, idx) => (
                            <div
                                key={idx}
                                className={`p-3 border ${bottleneck.severity === 'high' ? 'bg-red-100 dark:bg-red-900/20 border-red-500/30' :
                                    bottleneck.severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-500/30' :
                                        'bg-blue-100 dark:bg-blue-900/20 border-blue-500/30'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className={`w-4 h-4 ${bottleneck.severity === 'high' ? 'text-red-600 dark:text-red-400' :
                                            bottleneck.severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'
                                            }`} />
                                        <div className="font-mono text-sm text-foreground">{bottleneck.component}</div>
                                    </div>
                                    <span className={`px-2 py-1 font-mono text-[10px] uppercase ${bottleneck.severity === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                                        bottleneck.severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                                            'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                        }`}>
                                        {bottleneck.severity}
                                    </span>
                                </div>
                                <div className="font-mono text-[10px] text-muted-foreground mb-1">
                                    Impact: {bottleneck.impact}
                                </div>
                                <div className="font-mono text-[10px] text-green-600 dark:text-green-400">
                                    → {bottleneck.recommendation}
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            </div>

            {/* SLA Compliance */}
            <TerminalPanel title="SLA Compliance Tracking">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {slaMetrics.map((sla) => (
                        <div key={sla.metric} className="p-4 bg-muted/30 border border-border">
                            <div className="font-mono text-[10px] text-muted-foreground mb-2">{sla.metric}</div>
                            <div className="flex items-baseline gap-2 mb-2">
                                <div className={`font-mono text-2xl ${sla.status === 'met' ? 'text-green-600 dark:text-green-400' :
                                    sla.status === 'at-risk' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                                    }`}>
                                    {sla.actual}%
                                </div>
                                <div className="font-mono text-xs text-muted-foreground">/ {sla.target}%</div>
                            </div>
                            <div className={`px-2 py-1 font-mono text-[10px] uppercase text-center ${sla.status === 'met' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                sla.status === 'at-risk' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                                    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                }`}>
                                {sla.status.replace('-', ' ')}
                            </div>
                        </div>
                    ))}
                </div>
            </TerminalPanel>
        </div>
    )
}
