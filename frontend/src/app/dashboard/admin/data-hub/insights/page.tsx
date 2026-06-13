'use client'

import { TerminalPanel, DataMetricCard, AnalyticsChart } from '@/components/ui/terminal'
import { DataAnalyticsPanel } from '@/components/data-hub/DataAnalyticsPanel'
import {
    Lightbulb,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    Zap,
    Brain,
    Target,
    MessageSquare,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataInsightsApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'

export default function InsightsPage() {
    const [timeRange, setTimeRange] = useState('24h')

    // Fetch insights data
    const { data: insightsResponse, isLoading } = useQuery({
        queryKey: ['data-insights'],
        queryFn: () => dataInsightsApi.getInsights()
    })

    // AI-generated insights
    const insights = useMemo(() => {
        if (!insightsResponse?.data?.insights) return []
        return insightsResponse.data.insights.map(i => ({
            id: i.id,
            type: i.type,
            severity: i.severity,
            title: i.title,
            description: i.description,
            confidence: i.confidence,
            recommendation: i.recommendation,
            impact: i.impact,
            timestamp: formatRelativeTime(i.timestamp),
        }))
    }, [insightsResponse])

    // Predictive analytics
    const predictions = useMemo(() => {
        if (!insightsResponse?.data?.predictions) return []
        return insightsResponse.data.predictions
    }, [insightsResponse])

    const patterns = useMemo(() => {
        if (!insightsResponse?.data?.patterns) return []
        return insightsResponse.data.patterns
    }, [insightsResponse])

    const recommendations = useMemo(() => {
        if (!insightsResponse?.data?.recommendations) return []
        return insightsResponse.data.recommendations
    }, [insightsResponse])

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'high': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 border-red-500/30'
            case 'medium': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20 border-yellow-500/30'
            case 'low': return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 border-blue-500/30'
            default: return 'text-muted-foreground bg-muted/20 border-border/30'
        }
    }

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'trend': return <TrendingUp className="w-4 h-4" />
            case 'anomaly': return <AlertTriangle className="w-4 h-4" />
            case 'opportunity': return <Target className="w-4 h-4" />
            case 'quality': return <CheckCircle className="w-4 h-4" />
            default: return <Lightbulb className="w-4 h-4" />
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-4 pb-10">
            {/* Header */}
            <div className="mb-6">
                <h1 className="font-mono text-2xl text-amber-500 tracking-wider">AI-POWERED INSIGHTS DASHBOARD</h1>
                <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    AUTOMATED INSIGHTS • PREDICTIVE ANALYTICS • PATTERN RECOGNITION • SMART RECOMMENDATIONS
                </p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <DataMetricCard
                    title="Active Insights"
                    value={insights.length}
                    subtitle="Requiring attention"
                    icon={Lightbulb}
                    color="amber"
                />

                <DataMetricCard
                    title="Avg Confidence"
                    value={insights.length > 0
                        ? `${Math.round(insights.reduce((acc, i) => acc + i.confidence, 0) / insights.length)}%`
                        : '—'
                    }
                    subtitle="Across active insights"
                    icon={Brain}
                    color="purple"
                />

                <DataMetricCard
                    title="Patterns Detected"
                    value={patterns.length}
                    subtitle="Recurring patterns"
                    icon={Zap}
                    color="blue"
                />

                <DataMetricCard
                    title="Recommendations"
                    value={recommendations.length}
                    subtitle="Actionable items"
                    icon={Target}
                    color="green"
                />
            </div>

            {/* AI-Generated Insights */}
            <div className="mb-6">
                <TerminalPanel title="AI-Generated Insights">
                    <div className="space-y-3">
                        {insights.length === 0 && <div className="text-muted-foreground text-sm p-4">No active insights detected.</div>}
                        {insights.map((insight) => (
                            <div key={insight.id} className={`p-4 border ${getSeverityColor(insight.severity)}`}>
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        {getTypeIcon(insight.type)}
                                        <div>
                                            <div className="font-mono text-sm text-foreground mb-1">{insight.title}</div>
                                            <div className="font-mono text-[10px] text-muted-foreground">
                                                {insight.type.toUpperCase()} • {insight.timestamp}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 border font-mono text-[10px] ${getSeverityColor(insight.severity)}`}>
                                            {insight.severity.toUpperCase()}
                                        </span>
                                        <span className="px-2 py-1 bg-muted text-muted-foreground font-mono text-[10px]">
                                            {insight.confidence}% confidence
                                        </span>
                                    </div>
                                </div>

                                <p className="font-mono text-xs text-muted-foreground mb-3">
                                    {insight.description}
                                </p>

                                <div className="p-3 bg-card/50 border border-border">
                                    <div className="font-mono text-[10px] text-green-600 dark:text-green-400 mb-1">RECOMMENDATION:</div>
                                    <div className="font-mono text-xs text-muted-foreground">{insight.recommendation}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            </div>

            {/* Predictive Analytics */}
            <div className="mb-6">
                <TerminalPanel title="Predictive Analytics">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {predictions.length === 0 && <div className="text-muted-foreground text-sm p-4 col-span-4">No predictions available.</div>}
                        {predictions.map((pred) => (
                            <div key={pred.metric} className="p-4 bg-muted/30 border border-border">
                                <div className="font-mono text-[10px] text-muted-foreground mb-2">{pred.metric}</div>

                                <div className="mb-3">
                                    <div className="font-mono text-xs text-muted-foreground">Current</div>
                                    <div className="font-mono text-2xl text-foreground">{pred.current.toLocaleString()}</div>
                                </div>

                                <div className="space-y-2 mb-3">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[10px] text-muted-foreground">7-day forecast</span>
                                        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{pred.predicted7d.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[10px] text-muted-foreground">30-day forecast</span>
                                        <span className="font-mono text-xs text-purple-600 dark:text-purple-400">{pred.predicted30d.toLocaleString()}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[9px] text-muted-foreground">Confidence: {pred.confidence}%</span>
                                    <TrendingUp className={`w-3 h-3 ${pred.trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            </div>

            {/* Pattern Recognition & Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pattern Recognition */}
                <TerminalPanel title="Detected Patterns">
                    <div className="space-y-3">
                        {patterns.length === 0 && <div className="text-muted-foreground text-sm p-4">No patterns detected yet.</div>}
                        {patterns.map((pattern: any, idx: number) => (
                            <div key={idx} className="p-3 bg-muted/30 border border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="font-mono text-sm text-foreground">{pattern.pattern}</div>
                                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-mono text-[10px]">
                                        {pattern.confidence}% confidence
                                    </span>
                                </div>
                                <p className="font-mono text-[10px] text-muted-foreground mb-2">
                                    {pattern.description}
                                </p>
                                <div className="font-mono text-[9px] text-muted-foreground">
                                    Observed {pattern.occurrences} times
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>

                {/* Recommendations */}
                <TerminalPanel title="Smart Recommendations">
                    <div className="space-y-3">
                        {recommendations.length === 0 && <div className="text-muted-foreground text-sm p-4">No recommendations available.</div>}
                        {recommendations.map((rec: any, idx: number) => (
                            <div key={idx} className="p-3 bg-muted/30 border border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 font-mono text-[10px] ${rec.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                                            rec.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                                                'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                            }`}>
                                            {rec.priority.toUpperCase()}
                                        </span>
                                        <span className="font-mono text-[10px] text-muted-foreground">{rec.category}</span>
                                    </div>
                                    <span className="px-2 py-1 bg-zinc-700 text-muted-foreground font-mono text-[10px]">
                                        {rec.effort} effort
                                    </span>
                                </div>
                                <div className="font-mono text-sm text-foreground mb-2">{rec.action}</div>
                                <div className="font-mono text-[10px] text-green-600 dark:text-green-400">
                                    Expected: {rec.expectedImpact}
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            </div>
        </div>
    )
}
