'use client'

import { TerminalPanel, AnalyticsChart, DataMetricCard, TierBadge } from '@/components/ui/terminal'
import { DataAnalyticsPanel } from '@/components/data-hub/DataAnalyticsPanel'
import {
    TrendingUp,
    Database,
    Clock,
    MapPin,
    Activity,
    BarChart3,
    PieChart as PieChartIcon,
    LineChart as LineChartIcon,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { dataSourcesApi, etlJobsApi, dataHubAnalyticsApi } from '@/lib/api'
import { useState, useMemo, useEffect } from 'react'
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

const COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#f97316', '#ec4899']

export default function AnalyticsPage() {
    const [mounted, setMounted] = useState(false)
    const [timeRange, setTimeRange] = useState('24h')

    useEffect(() => {
        setMounted(true)
    }, [])

    const { data: sourceStats } = useQuery({
        queryKey: ['data-sources-stats'],
        queryFn: () => dataSourcesApi.getStatsByTier(),
    })

    const { data: jobStats } = useQuery({
        queryKey: ['etl-jobs-stats'],
        queryFn: () => etlJobsApi.getStats(),
    })

    const { data: volumeTrends, isLoading: isLoadingTrends } = useQuery({
        queryKey: ['analytics-trends', timeRange],
        queryFn: () => dataHubAnalyticsApi.getTrends(timeRange as any),
    })

    const { data: sourcePerformance, isLoading: isLoadingPerf } = useQuery({
        queryKey: ['analytics-performance'],
        queryFn: () => dataHubAnalyticsApi.getSourcePerformance(),
    })

    const { data: geographicDist, isLoading: isLoadingGeo } = useQuery({
        queryKey: ['analytics-geographic'],
        queryFn: () => dataHubAnalyticsApi.getGeographicDist(),
    })

    const { data: temporalPatterns, isLoading: isLoadingTemporal } = useQuery({
        queryKey: ['analytics-temporal'],
        queryFn: () => dataHubAnalyticsApi.getTemporalPatterns(),
    })

    const { data: volumeByTier } = useQuery({
        queryKey: ['analytics-volume'],
        queryFn: () => dataHubAnalyticsApi.getVolumeByTier(),
    })

    // Prepare data for charts with fallbacks
    const volumeData = useMemo(() => volumeTrends?.data || [], [volumeTrends])
    const sourcePerformanceData = useMemo(() => sourcePerformance?.data || [], [sourcePerformance])
    const geographicData = useMemo(() => geographicDist?.data || [], [geographicDist])
    const temporalData = useMemo(() => temporalPatterns?.data || [], [temporalPatterns])

    // Summary metrics derived from live data
    const totalVolume = useMemo(() =>
        volumeByTier?.data.reduce((acc, curr) => acc + curr.total_records, 0) || 0
        , [volumeByTier])

    const avgIngestionRate = useMemo(() => {
        if (!volumeData.length) return 0
        const total = volumeData.reduce((acc, curr) => acc + curr.total, 0)
        return Math.round(total / volumeData.length)
    }, [volumeData])

    const regionsCovered = useMemo(() => geographicData.length, [geographicData])

    const avgLatency = useMemo(() => {
        if (!sourcePerformanceData.length) return 0
        const total = sourcePerformanceData.reduce((acc, curr) => acc + curr.speed, 0)
        return Math.round(total / sourcePerformanceData.length)
    }, [sourcePerformanceData])

    // Data for correlation matrix (remains limited for now)
    const correlationData = useMemo(() => [
        { source1: 'Price', source2: 'Location', correlation: 0.85 },
        { source1: 'Price', source2: 'Size', correlation: 0.72 },
        { source1: 'Price', source2: 'Age', correlation: -0.45 },
    ], [])

    const handleExport = (format: 'csv' | 'json' | 'pdf') => {
        console.log(`Exporting analytics data as ${format}`)
        // Implement export logic
    }

    const handleRefresh = () => {
        console.log('Refreshing analytics data')
        // Trigger refetch
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            {/* Header */}
            <div className="mb-6">
                <h1 className="font-mono text-2xl text-amber-500 tracking-wider">DATA ANALYTICS DASHBOARD</h1>
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                    COMPREHENSIVE DATA INSIGHTS • POWERED BY ML ANALYTICS ENGINE
                </p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <DataMetricCard
                    title="Total Data Volume"
                    value={formatNumber(totalVolume)}
                    subtitle="Records ingested"
                    trend={15.3}
                    trendLabel="vs last period"
                    icon={Database}
                    color="blue"
                />

                <DataMetricCard
                    title="Avg Ingestion Rate"
                    value={formatNumber(avgIngestionRate)}
                    subtitle="Records/period"
                    trend={8.7}
                    icon={Activity}
                    color="green"
                />

                <DataMetricCard
                    title="Data Coverage"
                    value={regionsCovered.toString()}
                    subtitle="Regions covered"
                    icon={MapPin}
                    color="purple"
                />

                <DataMetricCard
                    title="Avg Latency"
                    value={`${avgLatency}ms`}
                    subtitle="API response time"
                    trend={-12.5}
                    trendLabel="improvement"
                    icon={Clock}
                    color="amber"
                />
            </div>

            {/* Data Volume Analytics */}
            <div className="mb-6">
                <DataAnalyticsPanel
                    title="Data Volume Trends"
                    onExport={handleExport}
                    onRefresh={handleRefresh}
                    timeRange={timeRange}
                    onTimeRangeChange={setTimeRange}
                >
                    <AnalyticsChart title="Records Ingested by Tier" height={350} timeRange={timeRange}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={volumeData}>
                                <defs>
                                    <linearGradient id="colorTier1" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorTier2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorTier3" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                    dataKey="timestamp"
                                    stroke="#71717a"
                                    tickFormatter={(val) => {
                                        if (!mounted) return ''
                                        return timeRange === '24h'
                                            ? new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : new Date(val).toLocaleDateString([], { month: 'short', day: 'numeric' })
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
                                <Legend
                                    wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px' }}
                                />
                                <Area type="monotone" dataKey="tier1" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTier1)" name="Tier 1" />
                                <Area type="monotone" dataKey="tier2" stroke="#10b981" fillOpacity={1} fill="url(#colorTier2)" name="Tier 2" />
                                <Area type="monotone" dataKey="tier3" stroke="#a855f7" fillOpacity={1} fill="url(#colorTier3)" name="Tier 3" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </AnalyticsChart>
                </DataAnalyticsPanel>
            </div>

            {/* Source Performance & Geographic Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Source Performance */}
                <AnalyticsChart title="Source Performance Analysis">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={sourcePerformanceData}>
                            <PolarGrid stroke="#27272a" />
                            <PolarAngleAxis
                                dataKey="name"
                                stroke="#71717a"
                                style={{ fontSize: '10px', fontFamily: 'monospace' }}
                            />
                            <PolarRadiusAxis
                                stroke="#71717a"
                                style={{ fontSize: '10px', fontFamily: 'monospace' }}
                            />
                            <Radar name="Reliability" dataKey="reliability" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                            <Radar name="Speed" dataKey="speed" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                            <Radar name="Quality" dataKey="quality" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} />
                            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px' }} />
                        </RadarChart>
                    </ResponsiveContainer>
                </AnalyticsChart>

                {/* Geographic Distribution */}
                <AnalyticsChart title="Geographic Data Distribution">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={geographicData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percentage }) => `${name} ${percentage}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="count"
                                nameKey="region"
                            >
                                {geographicData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#18181b',
                                    border: '1px solid #27272a',
                                    fontFamily: 'monospace',
                                    fontSize: '11px'
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </AnalyticsChart>
            </div>

            {/* Data Freshness */}
            <TerminalPanel title="Data Freshness Indicators">
                <div className="space-y-3">
                    {sourcePerformanceData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between p-3 bg-zinc-800/30 border border-zinc-800">
                            <div className="flex items-center gap-3">
                                <Database className="w-4 h-4 text-blue-400" />
                                <div>
                                    <div className="font-mono text-sm text-white">{item.name}</div>
                                    <div className="font-mono text-[10px] text-zinc-500">Reliability Score: {item.reliability}%</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-32 h-2 bg-zinc-700 overflow-hidden">
                                    <div
                                        className={`h-full ${item.quality >= 95 ? 'bg-green-500' :
                                            item.quality >= 85 ? 'bg-blue-500' :
                                                item.quality >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                                            }`}
                                        style={{ width: `${item.quality}%` }}
                                    />
                                </div>
                                <span className="font-mono text-xs text-white w-12 text-right">{item.quality}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </TerminalPanel>

            {/* Correlation Analysis */}
            <div className="mt-6">
                <TerminalPanel title="Cross-Source Correlation Matrix">
                    <div className="grid grid-cols-3 gap-3">
                        {correlationData.map((item, idx) => (
                            <div key={idx} className="p-3 bg-zinc-800/30 border border-zinc-800">
                                <div className="font-mono text-[10px] text-zinc-500 mb-2">
                                    {item.source1} ↔ {item.source2}
                                </div>
                                <div className={`font-mono text-2xl ${Math.abs(item.correlation) >= 0.7 ? 'text-green-400' :
                                    Math.abs(item.correlation) >= 0.4 ? 'text-yellow-400' : 'text-zinc-400'
                                    }`}>
                                    {item.correlation.toFixed(2)}
                                </div>
                                <div className="font-mono text-[9px] text-zinc-600">
                                    {Math.abs(item.correlation) >= 0.7 ? 'Strong' :
                                        Math.abs(item.correlation) >= 0.4 ? 'Moderate' : 'Weak'}
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            </div>
        </div>
    )
}
