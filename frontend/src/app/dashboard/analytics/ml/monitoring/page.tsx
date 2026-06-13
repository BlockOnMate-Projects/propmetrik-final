'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  TrendingUp,
  Eye,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface DriftDetectionResult {
  detection_date: string
  drift_detected: boolean
  drift_type?: string
  drift_severity: string
  metrics: Record<string, any>
  recommendation: string
  retrain_required: boolean
}

interface FeatureDrift {
  feature_name: string
  psi: number
  ks_statistic: number
  drift_detected: boolean
  severity: string
  baseline_mean?: number
  current_mean?: number
  change_pct?: number
}

interface SegmentPerformance {
  segment_name: string
  segment_type: string
  mae: number
  mape: number
  r2: number
  sample_size: number
  within_10_pct: number
}

interface PerformanceTrend {
  metric_name: string
  data_points: Array<{ date: string; value: number }>
  trend_direction: 'improving' | 'degrading' | 'stable'
  change_rate: number
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/ml'

async function fetchData<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await authedFetch(`${API_BASE}${endpoint}`)
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  } catch {
    return null
  }
}

// =====================================================
// SHARED COMPONENTS
// =====================================================

function Panel({
  title,
  children,
  className,
  actions,
}: {
  title: string
  children: React.ReactNode
  className?: string
  actions?: React.ReactNode
}) {
  return (
    <div className={cn('border border-border bg-card/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    none: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20',
    low: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
    medium: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    high: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
    critical: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
  }
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 font-mono text-[9px] border rounded',
        colors[severity] || 'text-muted-foreground border-border'
      )}
    >
      {severity.toUpperCase()}
    </span>
  )
}

function TrendIndicator({ direction, rate }: { direction: string; rate: number }) {
  const isImproving = direction === 'improving'
  const isDegrading = direction === 'degrading'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-xs',
        isImproving ? 'text-green-600 dark:text-green-400' : isDegrading ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
      )}
    >
      {isImproving ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : isDegrading ? (
        <ArrowDownRight className="w-3 h-3" />
      ) : (
        <Activity className="w-3 h-3" />
      )}
      {direction.toUpperCase()} {rate !== 0 && `(${rate > 0 ? '+' : ''}${rate.toFixed(2)}%)`}
    </span>
  )
}

function MiniSparkline({ data, height = 32, color = '#f59e0b' }: { data: number[]; height?: number; color?: string }) {
  if (!data.length) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 100
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

function PSIBar({ value }: { value: number }) {
  // PSI: <0.1 no drift, 0.1-0.2 moderate, >0.2 significant
  const severity = value < 0.1 ? 'none' : value < 0.2 ? 'medium' : 'high'
  const colors: Record<string, string> = {
    none: 'bg-green-500/70',
    medium: 'bg-amber-500/70',
    high: 'bg-red-500/70',
  }
  const maxPSI = 0.5
  const pct = Math.min((value / maxPSI) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
        <div className={cn('h-full rounded', colors[severity])} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground w-12 text-right tabular-nums">{value.toFixed(4)}</span>
    </div>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function ModelMonitoringPage() {
  const [drift, setDrift] = useState<DriftDetectionResult | null>(null)
  const [featureDrift, setFeatureDrift] = useState<FeatureDrift[]>([])
  const [segments, setSegments] = useState<SegmentPerformance[]>([])
  const [trend, setTrend] = useState<PerformanceTrend | null>(null)
  const [selectedMetric, setSelectedMetric] = useState('mape')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [driftData, featureDriftData, segData, trendData] = await Promise.all([
      fetchData<DriftDetectionResult>('/monitoring/drift'),
      fetchData<{ features: FeatureDrift[]; count: number }>('/monitoring/drift/features'),
      fetchData<{ segments: SegmentPerformance[]; count: number }>('/performance/segments'),
      fetchData<PerformanceTrend>(`/performance/trend?metric_name=${selectedMetric}`),
    ])
    setDrift(driftData)
    setFeatureDrift(featureDriftData?.features || [])
    setSegments(segData?.segments || [])
    setTrend(trendData)
    setLoading(false)
  }, [selectedMetric])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadTrend = useCallback(async (metric: string) => {
    setSelectedMetric(metric)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-72" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted/50 rounded border border-border" />
            ))}
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8 h-64 bg-muted/50 rounded border border-border" />
            <div className="col-span-4 h-64 bg-muted/50 rounded border border-border" />
          </div>
        </div>
      </div>
    )
  }

  const driftedFeatures = featureDrift.filter((f) => f.drift_detected)
  const trendPoints = trend?.data_points?.map((d) => d.value) || []

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            MODEL MONITORING & DRIFT DETECTION
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Concept drift, data drift, per-feature analysis & segment performance — Section 8.4
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          REFRESH
        </button>
      </div>

      {/* Drift Status KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Panel title="DRIFT STATUS">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              {drift?.drift_detected ? (
                <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              )}
            </div>
            <div className="font-mono text-lg">
              <SeverityBadge severity={drift?.drift_severity || 'none'} />
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              {drift?.detection_date || '—'}
            </div>
          </div>
        </Panel>

        <Panel title="DRIFTED FEATURES">
          <div className="text-center py-1">
            <div className="font-mono text-3xl text-foreground">
              {driftedFeatures.length}
              <span className="text-muted-foreground text-lg"> / {featureDrift.length}</span>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">FEATURES WITH DRIFT</div>
          </div>
        </Panel>

        <Panel title="RETRAIN STATUS">
          <div className="text-center py-1">
            <div className="font-mono text-lg mt-1">
              {drift?.retrain_required ? (
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  REQUIRED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  NOT NEEDED
                </span>
              )}
            </div>
            {drift?.drift_type && (
              <div className="font-mono text-[10px] text-muted-foreground mt-1">
                TYPE: {drift.drift_type.toUpperCase()}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="PERFORMANCE TREND">
          <div className="text-center py-1">
            {trend ? (
              <>
                <TrendIndicator direction={trend.trend_direction} rate={trend.change_rate} />
                <div className="mt-1">
                  <MiniSparkline
                    data={trendPoints}
                    height={24}
                    color={trend.trend_direction === 'improving' ? '#22c55e' : trend.trend_direction === 'degrading' ? '#ef4444' : '#f59e0b'}
                  />
                </div>
              </>
            ) : (
              <div className="font-mono text-[10px] text-muted-foreground">No trend data</div>
            )}
          </div>
        </Panel>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Per-Feature Drift Table */}
        <Panel title="PER-FEATURE DATA DRIFT" className="col-span-8">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">FEATURE</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">PSI</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">KS STAT</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">CHANGE %</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-center py-1.5 px-2">DRIFT</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-center py-1.5 px-2">SEVERITY</th>
                </tr>
              </thead>
              <tbody>
                {featureDrift
                  .sort((a, b) => b.psi - a.psi)
                  .map((f) => (
                    <tr key={f.feature_name} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        {f.feature_name.replace(/_/g, ' ')}
                      </td>
                      <td className="py-1.5 px-2 w-40">
                        <PSIBar value={f.psi} />
                      </td>
                      <td className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2 tabular-nums">
                        {f.ks_statistic.toFixed(4)}
                      </td>
                      <td className="font-mono text-[10px] text-right py-1.5 px-2 tabular-nums">
                        {f.change_pct !== undefined ? (
                          <span className={f.change_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {f.change_pct >= 0 ? '+' : ''}{f.change_pct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-center py-1.5 px-2">
                        {f.drift_detected ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 inline" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" />
                        )}
                      </td>
                      <td className="text-center py-1.5 px-2">
                        <SeverityBadge severity={f.severity} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {featureDrift.length === 0 && (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-6">No feature drift data</div>
          )}
        </Panel>

        {/* Drift Recommendation & Metrics */}
        <Panel title="DRIFT ANALYSIS" className="col-span-4">
          {drift ? (
            <div className="space-y-3">
              <div>
                <div className="font-mono text-[9px] text-muted-foreground mb-1">RECOMMENDATION</div>
                <div className="font-mono text-[10px] text-muted-foreground leading-relaxed p-2 border border-border bg-card">
                  {drift.recommendation}
                </div>
              </div>

              {drift.metrics && Object.keys(drift.metrics).length > 0 && (
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground mb-1">AGGREGATE METRICS</div>
                  <div className="space-y-1">
                    {Object.entries(drift.metrics).map(([key, val]) => (
                      <div key={key} className="flex justify-between font-mono text-[10px]">
                        <span className="text-muted-foreground">{key.replace(/_/g, ' ').toUpperCase()}</span>
                        <span className="text-foreground tabular-nums">
                          {typeof val === 'number' ? val.toFixed(4) : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PSI Thresholds Reference */}
              <div className="border-t border-border pt-2">
                <div className="font-mono text-[9px] text-muted-foreground mb-1">PSI REFERENCE</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <div className="w-3 h-2 bg-green-500/70 rounded" />
                    <span className="text-muted-foreground">&lt; 0.1</span>
                    <span className="text-muted-foreground">No drift</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <div className="w-3 h-2 bg-amber-500/70 rounded" />
                    <span className="text-muted-foreground">0.1 – 0.2</span>
                    <span className="text-muted-foreground">Moderate drift</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <div className="w-3 h-2 bg-red-500/70 rounded" />
                    <span className="text-muted-foreground">&gt; 0.2</span>
                    <span className="text-muted-foreground">Significant drift</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-6">No drift data</div>
          )}
        </Panel>
      </div>

      {/* Performance Trend */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        <Panel
          title="PERFORMANCE METRIC TREND"
          className="col-span-8"
          actions={
            <div className="flex items-center gap-1.5">
              {['mape', 'mae', 'r2', 'rmse'].map((m) => (
                <button
                  key={m}
                  onClick={() => loadTrend(m)}
                  className={cn(
                    'px-1.5 py-0.5 font-mono text-[9px] border rounded transition-colors',
                    selectedMetric === m
                      ? 'text-amber-600 dark:text-amber-400 border-amber-500/50 bg-amber-500/10'
                      : 'text-muted-foreground border-border hover:border-zinc-600'
                  )}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          }
        >
          <div className="space-y-2">
            {trend && trendPoints.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {trend.metric_name.toUpperCase()} OVER TIME
                  </span>
                  <TrendIndicator direction={trend.trend_direction} rate={trend.change_rate} />
                </div>
                <MiniSparkline data={trendPoints} height={100} />
                <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                  <span>{trend.data_points[0]?.date}</span>
                  <span>{trend.data_points[trend.data_points.length - 1]?.date}</span>
                </div>
              </>
            ) : (
              <div className="font-mono text-[10px] text-muted-foreground text-center py-8">No trend data</div>
            )}
          </div>
        </Panel>

        {/* Segment Quick Stats */}
        <Panel title="SEGMENTS OVERVIEW" className="col-span-4">
          <div className="space-y-2">
            {segments.length > 0 ? (
              segments.slice(0, 8).map((seg) => (
                <div key={`${seg.segment_type}-${seg.segment_name}`} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground truncate">
                      {seg.segment_name.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">{seg.segment_type}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[9px]">
                    <span className="text-muted-foreground">MAPE: <span className="text-foreground">{seg.mape.toFixed(1)}%</span></span>
                    <span className="text-muted-foreground">R²: <span className="text-foreground">{seg.r2.toFixed(3)}</span></span>
                    <span className="text-muted-foreground">n={seg.sample_size}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="font-mono text-[10px] text-muted-foreground text-center py-6">No segment data</div>
            )}
          </div>
        </Panel>
      </div>

      {/* Segment Performance Table */}
      {segments.length > 0 && (
        <Panel title="SEGMENT PERFORMANCE BREAKDOWN">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">SEGMENT</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">TYPE</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">MAE</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">MAPE</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">R²</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">±10%</th>
                  <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">SAMPLE</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => (
                  <tr
                    key={`${seg.segment_type}-${seg.segment_name}`}
                    className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                  >
                    <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                      {seg.segment_name.replace(/_/g, ' ')}
                    </td>
                    <td className="py-1.5 px-2">
                      <span className="px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground border border-border rounded">
                        {seg.segment_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="font-mono text-[10px] text-foreground text-right py-1.5 px-2 tabular-nums">
                      GH₵{seg.mae.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="font-mono text-[10px] text-foreground text-right py-1.5 px-2 tabular-nums">
                      {seg.mape.toFixed(2)}%
                    </td>
                    <td className={cn(
                      'font-mono text-[10px] text-right py-1.5 px-2 tabular-nums',
                      seg.r2 > 0.85 ? 'text-green-600 dark:text-green-400' : seg.r2 > 0.7 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {seg.r2.toFixed(4)}
                    </td>
                    <td className="font-mono text-[10px] text-foreground text-right py-1.5 px-2 tabular-nums">
                      {seg.within_10_pct.toFixed(1)}%
                    </td>
                    <td className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2 tabular-nums">
                      {seg.sample_size.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
