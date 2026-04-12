'use client'

import { TerminalPanel, DataQualityIndicator, AnalyticsChart } from '@/components/ui/terminal'
import { DataQualityWidget } from '@/components/data-hub/DataQualityWidget'
import { DataAnalyticsPanel } from '@/components/data-hub/DataAnalyticsPanel'
import {
    AlertTriangle,
    CheckCircle,
    XCircle,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataQualityApi } from '@/lib/api'
import {
    LineChart,
    Line,
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

export default function QualityPage() {
    const [timeRange, setTimeRange] = useState('30d')

    // Quality summary (real breakdown scores)
    const { data: summaryData } = useQuery({
        queryKey: ['quality-summary'],
        queryFn: () => dataQualityApi.getSummary(),
    })

    // Quality trends (real historical data)
    const { data: trendsData } = useQuery({
        queryKey: ['quality-trends', timeRange],
        queryFn: () => dataQualityApi.getTrends(
            timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : timeRange === 'all' ? 365 : 30
        ),
    })

    const { data: validationData } = useQuery({
        queryKey: ['quality-validation'],
        queryFn: () => dataQualityApi.getValidationResults(),
    })

    const { data: completenessData } = useQuery({
        queryKey: ['quality-completeness'],
        queryFn: () => dataQualityApi.getFieldCompleteness(),
    })

    const { data: anomaliesData } = useQuery({
        queryKey: ['quality-anomalies'],
        queryFn: () => dataQualityApi.getAnomalies(20),
    })

    const { data: profilesData } = useQuery({
        queryKey: ['quality-profiles'],
        queryFn: () => dataQualityApi.getDataProfiles(),
    })

    const summary = summaryData?.data
    const currentScore = summary?.overall ?? 0

    // Process trends for chart
    const qualityTrends = useMemo(() => {
        if (!trendsData?.data) return []
        return trendsData.data.map(t => ({
            day: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            overall: t.score,
            completeness: t.completeness,
            accuracy: t.accuracy,
            timeliness: t.timeliness,
            consistency: t.consistency,
        }))
    }, [trendsData])

    const validationResults = useMemo(() => {
        if (!validationData?.data) return []
        return validationData.data
    }, [validationData])

    const fieldCompleteness = useMemo(() => {
        if (!completenessData?.data) return []
        return Object.entries(completenessData.data).map(([field, score]) => ({
            field,
            completeness: score as number,
            required: ['Title', 'Price', 'Location'].includes(field),
        }))
    }, [completenessData])

    const anomalies = useMemo(() => {
        if (!anomaliesData?.data) return []
        return anomaliesData.data
    }, [anomaliesData])

    const dataProfiles = useMemo(() => {
        if (!profilesData?.data) return []
        return profilesData.data
    }, [profilesData])

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'text-red-400 bg-red-900/20 border-red-500/30'
            case 'warning': return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30'
            default: return 'text-zinc-400 bg-zinc-800/20 border-zinc-700/30'
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            {/* Header */}
            <div className="mb-6">
                <h1 className="font-mono text-2xl text-amber-500 tracking-wider">DATA QUALITY COMMAND CENTER</h1>
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                    COMPREHENSIVE QUALITY MONITORING • AUTOMATED VALIDATION • ANOMALY DETECTION
                </p>
            </div>

            {/* Overall Quality Score — using REAL breakdown */}
            <div className="mb-6">
                <DataQualityWidget
                    overallScore={Math.round(currentScore)}
                    breakdown={{
                        completeness: Math.round(summary?.completeness ?? 0),
                        accuracy: Math.round(summary?.accuracy ?? 0),
                        timeliness: Math.round(summary?.timeliness ?? 0),
                        consistency: Math.round(summary?.consistency ?? 0),
                    }}
                    trend={qualityTrends.length > 1
                        ? Number((qualityTrends[qualityTrends.length - 1].overall - qualityTrends[0].overall).toFixed(1))
                        : 0
                    }
                    issues={{
                        critical: anomalies.filter((a: any) => a.severity === 'critical').length,
                        warning: anomalies.filter((a: any) => a.severity === 'warning').length,
                    }}
                    lastUpdated={new Date()}
                />
            </div>

            {/* Quality Trends — real historical data */}
            <div className="mb-6">
                <DataAnalyticsPanel
                    title="Quality Score Trends"
                    timeRange={timeRange}
                    onTimeRangeChange={setTimeRange}
                >
                    <AnalyticsChart title="Quality Metrics Over Time" height={350}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={qualityTrends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis dataKey="day" stroke="#71717a" style={{ fontSize: '10px', fontFamily: 'monospace' }} />
                                <YAxis stroke="#71717a" style={{ fontSize: '10px', fontFamily: 'monospace' }} domain={[0, 100]} />
                                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', fontFamily: 'monospace', fontSize: '11px' }} />
                                <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px' }} />
                                <Line type="monotone" dataKey="overall" stroke="#f59e0b" name="Overall" strokeWidth={2} />
                                <Line type="monotone" dataKey="completeness" stroke="#3b82f6" name="Completeness" />
                                <Line type="monotone" dataKey="accuracy" stroke="#10b981" name="Accuracy" />
                                <Line type="monotone" dataKey="timeliness" stroke="#a855f7" name="Timeliness" />
                                <Line type="monotone" dataKey="consistency" stroke="#ec4899" name="Consistency" />
                            </LineChart>
                        </ResponsiveContainer>
                    </AnalyticsChart>
                </DataAnalyticsPanel>
            </div>

            {/* Validation Results & Field Completeness */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Validation Results */}
                <TerminalPanel title="Validation Rules Status">
                    <div className="space-y-3">
                        {validationResults.length === 0 && (
                            <div className="text-zinc-500 text-sm p-4">All validation rules passed</div>
                        )}
                        {validationResults.map((rule) => (
                            <div key={rule.ruleId} className="p-3 bg-zinc-800/30 border border-zinc-800">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="font-mono text-sm text-white">{rule.name}</div>
                                    <div className={`font-mono text-xs ${rule.status === 'passed' ? 'text-green-400' : 'text-yellow-400'}`}>
                                        {rule.status.toUpperCase()}
                                    </div>
                                </div>
                                <div className="font-mono text-[10px] text-zinc-500 mb-2">{rule.description}</div>
                                <div className="flex items-center gap-4 font-mono text-[10px]">
                                    <div className="flex items-center gap-1">
                                        {rule.status === 'passed'
                                            ? <CheckCircle className="w-3 h-3 text-green-400" />
                                            : <XCircle className="w-3 h-3 text-red-400" />
                                        }
                                        <span className="text-zinc-400">
                                            {rule.affectedCount > 0
                                                ? `${rule.affectedCount.toLocaleString()} affected records`
                                                : 'No issues found'
                                            }
                                        </span>
                                    </div>
                                    <span className={`px-1.5 py-0.5 text-[9px] border ${
                                        rule.impact === 'Critical' ? 'border-red-800 text-red-400 bg-red-900/20' :
                                        rule.impact === 'High' ? 'border-orange-800 text-orange-400 bg-orange-900/20' :
                                        'border-zinc-700 text-zinc-400 bg-zinc-800/20'
                                    }`}>{rule.impact}</span>
                                </div>
                                <div className="mt-2 h-1 bg-zinc-700 overflow-hidden">
                                    <div
                                        className={`h-full ${rule.status === 'passed' ? 'bg-green-500' : 'bg-red-500'}`}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>

                {/* Field Completeness */}
                <TerminalPanel title="Field-Level Completeness Analysis">
                    <div className="space-y-2">
                        {fieldCompleteness.map((field) => (
                            <div key={field.field} className="flex items-center justify-between p-2 bg-zinc-800/30 border border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-white">{field.field}</span>
                                    {field.required && (
                                        <span className="px-1 py-0.5 bg-red-900/30 border border-red-500/30 font-mono text-[9px] text-red-400">
                                            REQUIRED
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-1.5 bg-zinc-700 overflow-hidden">
                                        <div
                                            className={`h-full ${field.completeness >= 95 ? 'bg-green-500' :
                                                field.completeness >= 85 ? 'bg-blue-500' :
                                                    field.completeness >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                                                }`}
                                            style={{ width: `${Math.min(100, field.completeness)}%` }}
                                        />
                                    </div>
                                    <span className="font-mono text-[10px] text-zinc-400 w-10 text-right">
                                        {field.completeness}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            </div>

            {/* Anomaly Detection — with property details */}
            <div className="mb-6">
                <TerminalPanel title="Anomaly Detection & Alerts">
                    <div className="space-y-2">
                        {anomalies.length === 0 && (
                            <div className="text-zinc-500 text-sm p-4">No active anomalies detected</div>
                        )}
                        {anomalies.map((anomaly: any) => (
                            <div key={anomaly.id} className={`p-3 border ${getSeverityColor(anomaly.severity)}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle className={`w-4 h-4 ${anomaly.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'}`} />
                                        <div>
                                            <div className="font-mono text-sm text-white">{anomaly.issue}</div>
                                            <div className="font-mono text-[10px] text-zinc-400">
                                                {anomaly.title
                                                    ? `${(anomaly.title as string).slice(0, 60)}${(anomaly.title as string).length > 60 ? '...' : ''}`
                                                    : 'Untitled property'
                                                }
                                                {anomaly.price != null && (
                                                    <span className="ml-2 text-amber-400">
                                                        GHS {formatNumber(anomaly.price)}
                                                    </span>
                                                )}
                                                {anomaly.city && (
                                                    <span className="ml-2 text-zinc-500">• {anomaly.city}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`px-2 py-1 font-mono text-[10px] uppercase ${getSeverityColor(anomaly.severity)}`}>
                                            {anomaly.severity}
                                        </span>
                                        {anomaly.qualityScore != null && (
                                            <span className="px-2 py-1 bg-zinc-800 font-mono text-[10px] text-zinc-400">
                                                Q:{Math.round(anomaly.qualityScore)}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            </div>

            {/* Data Profiling Statistics */}
            <TerminalPanel title="Data Profiling Statistics">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {dataProfiles.map((profile: any) => (
                        <div key={profile.dataset} className="p-3 bg-zinc-800/30 border border-zinc-800">
                            <div className="font-mono text-[10px] text-zinc-500 mb-1">{profile.dataset}</div>
                            <div className="font-mono text-2xl text-white mb-1">
                                {profile.rowCount.toLocaleString()}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-16 h-1 bg-zinc-700 overflow-hidden">
                                    <div
                                        className={`h-full ${profile.completeness >= 90 ? 'bg-green-500' : profile.completeness >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                        style={{ width: `${Math.min(100, profile.completeness)}%` }}
                                    />
                                </div>
                                <span className="font-mono text-[10px] text-zinc-400">{profile.completeness}% complete</span>
                            </div>
                        </div>
                    ))}
                </div>
            </TerminalPanel>
        </div>
    )
}
