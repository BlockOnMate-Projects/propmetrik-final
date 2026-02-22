'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Brain,
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  BarChart3,
  Target,
  Shield,
  Layers,
  Gauge,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface DashboardSummary {
  ml_service_status: string
  model_version: string
  total_predictions_30d: number
  avg_confidence: number
  active_drift_alerts: number
}

interface ModelPerformanceMetrics {
  model_version: string
  metric_date: string
  mae: number
  rmse: number
  mape: number
  r2: number
  median_error: number
  p90_error: number
  within_10_pct: number
  within_20_pct: number
  total_predictions: number
  sample_size: number
}

interface PerformanceTrend {
  metric_name: string
  data_points: Array<{ date: string; value: number }>
  trend_direction: 'improving' | 'degrading' | 'stable'
  change_rate: number
}

interface ConfidenceDistribution {
  period: string
  total_predictions: number
  high_confidence: number
  medium_confidence: number
  low_confidence: number
  mean_confidence: number
  median_confidence: number
  histogram: Array<{ bin: string; count: number; percentage: number }>
}

interface DriftDetectionResult {
  detection_date: string
  drift_detected: boolean
  drift_type?: string
  drift_severity: string
  metrics: Record<string, any>
  recommendation: string
  retrain_required: boolean
}

interface EnsembleAnalytics {
  model_version: string
  weights: Array<{
    model_name: string
    weight: number
    contribution_pct: number
    individual_mae: number
    individual_r2: number
  }>
  ensemble_mae: number
  ensemble_r2: number
  improvement_over_best_single: number
  diversity_index: number
  correlation_matrix: Record<string, Record<string, number>>
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/ml'

async function fetchData<T>(endpoint: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { signal })
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
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
  color = 'text-white',
}: {
  label: string
  value: string
  subtext?: string
  icon: any
  color?: string
}) {
  return (
    <div className="text-center py-1">
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon className={cn('w-3.5 h-3.5', color)} />
        <span className="font-mono text-[10px] text-zinc-500">{label}</span>
      </div>
      <div className={cn('font-mono text-2xl', color)}>{value}</div>
      {subtext && <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{subtext}</div>}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    none: 'text-green-400 bg-green-500/10 border-green-500/20',
    low: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    high: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  }
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 font-mono text-[9px] border rounded',
        colors[severity] || 'text-zinc-400 border-zinc-700'
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
        isImproving ? 'text-green-400' : isDegrading ? 'text-red-400' : 'text-zinc-400'
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

function MiniSparkline({ data, height = 32 }: { data: number[]; height?: number }) {
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
      <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
    </svg>
  )
}

function ConfidenceBar({ high, medium, low }: { high: number; medium: number; low: number }) {
  const total = high + medium + low || 1
  const hPct = (high / total) * 100
  const mPct = (medium / total) * 100
  const lPct = (low / total) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 rounded overflow-hidden border border-zinc-700">
        <div className="bg-green-500/80" style={{ width: `${hPct}%` }} />
        <div className="bg-amber-500/80" style={{ width: `${mPct}%` }} />
        <div className="bg-red-500/80" style={{ width: `${lPct}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[9px]">
        <span className="text-green-400">HIGH {hPct.toFixed(0)}%</span>
        <span className="text-amber-400">MED {mPct.toFixed(0)}%</span>
        <span className="text-red-400">LOW {lPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function MLAnalyticsDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [performance, setPerformance] = useState<ModelPerformanceMetrics | null>(null)
  const [trend, setTrend] = useState<PerformanceTrend | null>(null)
  const [confidence, setConfidence] = useState<ConfidenceDistribution | null>(null)
  const [drift, setDrift] = useState<DriftDetectionResult | null>(null)
  const [ensemble, setEnsemble] = useState<EnsembleAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [summaryData, perfData, trendData, confData, driftData, ensembleData] = await Promise.all([
      fetchData<DashboardSummary>('/dashboard', signal),
      fetchData<ModelPerformanceMetrics>('/performance', signal),
      fetchData<PerformanceTrend>('/performance/trend', signal),
      fetchData<ConfidenceDistribution>('/confidence', signal),
      fetchData<DriftDetectionResult>('/monitoring/drift', signal),
      fetchData<EnsembleAnalytics>('/ensemble', signal),
    ])
    if (signal?.aborted) return
    setSummary(summaryData)
    setPerformance(perfData)
    setTrend(trendData)
    setConfidence(confData)
    setDrift(driftData)
    setEnsemble(ensembleData)
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadData(controller.signal)
    return () => controller.abort()
  }, [loadData])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-72" />
          <div className="grid grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-zinc-800/50 rounded border border-zinc-800" />
            ))}
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8 h-64 bg-zinc-800/50 rounded border border-zinc-800" />
            <div className="col-span-4 h-64 bg-zinc-800/50 rounded border border-zinc-800" />
          </div>
        </div>
      </div>
    )
  }

  const trendPoints = trend?.data_points?.map((d) => d.value) || []

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-amber-500" />
            ML MODEL ANALYTICS
          </h1>
          <p className="font-mono text-[10px] text-zinc-500">
            AVM Performance, Confidence, Drift Detection & Ensemble Monitoring — Section 8
          </p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  summary.ml_service_status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                )}
              />
              <span className="text-zinc-400">
                ML SERVICE {summary.ml_service_status?.toUpperCase() || 'UNKNOWN'}
              </span>
              <span className="text-zinc-600 mx-1">|</span>
              <span className="text-zinc-400">v{summary.model_version}</span>
            </div>
          )}
          <button
            onClick={() => loadData()}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-zinc-400 border border-zinc-700 hover:border-amber-500/50 hover:text-amber-500 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            REFRESH
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <Panel title="MAE">
          <MetricCard
            label="MEAN ABSOLUTE ERROR"
            value={performance ? `GH₵${performance.mae.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
            subtext={performance ? `RMSE: GH₵${performance.rmse.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : undefined}
            icon={Target}
            color="text-blue-400"
          />
        </Panel>

        <Panel title="MAPE">
          <MetricCard
            label="MEAN ABS % ERROR"
            value={performance ? `${performance.mape.toFixed(2)}%` : '—'}
            subtext={performance ? `Median: ${performance.median_error.toFixed(2)}%` : undefined}
            icon={BarChart3}
            color="text-cyan-400"
          />
        </Panel>

        <Panel title="R² SCORE">
          <MetricCard
            label="EXPLAINED VARIANCE"
            value={performance ? performance.r2.toFixed(4) : '—'}
            subtext={performance ? `P90 Error: ${performance.p90_error.toFixed(1)}%` : undefined}
            icon={TrendingUp}
            color="text-green-400"
          />
        </Panel>

        <Panel title="±10% ACCURACY">
          <MetricCard
            label="WITHIN 10%"
            value={performance ? `${performance.within_10_pct.toFixed(1)}%` : '—'}
            subtext={performance ? `±20%: ${performance.within_20_pct.toFixed(1)}%` : undefined}
            icon={CheckCircle2}
            color="text-amber-400"
          />
        </Panel>

        <Panel title="CONFIDENCE">
          <MetricCard
            label="AVG CONFIDENCE"
            value={summary ? `${(summary.avg_confidence * 100).toFixed(1)}%` : '—'}
            subtext={confidence ? `${confidence.total_predictions.toLocaleString()} predictions` : undefined}
            icon={Gauge}
            color="text-purple-400"
          />
        </Panel>

        <Panel title="DRIFT STATUS">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              {drift?.drift_detected ? (
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-green-400" />
              )}
              <span className="font-mono text-[10px] text-zinc-500">MODEL HEALTH</span>
            </div>
            <div className="font-mono text-lg">
              <SeverityBadge severity={drift?.drift_severity || 'none'} />
            </div>
            {drift?.retrain_required && (
              <div className="font-mono text-[9px] text-red-400 mt-1">RETRAIN REQUIRED</div>
            )}
          </div>
        </Panel>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Performance Trend */}
        <Panel title="PERFORMANCE TREND" className="col-span-8">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-400">
                {trend?.metric_name?.toUpperCase() || 'MAPE'} OVER TIME
              </span>
              {trend && <TrendIndicator direction={trend.trend_direction} rate={trend.change_rate} />}
            </div>
            <MiniSparkline data={trendPoints} height={120} />
            {trend?.data_points && trend.data_points.length > 0 && (
              <div className="flex justify-between font-mono text-[9px] text-zinc-600">
                <span>{trend.data_points[0]?.date}</span>
                <span>{trend.data_points[trend.data_points.length - 1]?.date}</span>
              </div>
            )}
          </div>
        </Panel>

        {/* Confidence Distribution */}
        <Panel title="CONFIDENCE DISTRIBUTION" className="col-span-4">
          <div className="space-y-3">
            {confidence && (
              <>
                <ConfidenceBar
                  high={confidence.high_confidence}
                  medium={confidence.medium_confidence}
                  low={confidence.low_confidence}
                />
                <div className="space-y-1.5">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-zinc-500">MEAN</span>
                    <span className="text-white">{(confidence.mean_confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-zinc-500">MEDIAN</span>
                    <span className="text-white">{(confidence.median_confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-zinc-500">TOTAL</span>
                    <span className="text-white">{confidence.total_predictions.toLocaleString()}</span>
                  </div>
                </div>
                {confidence.histogram.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-mono text-[9px] text-zinc-500">HISTOGRAM</div>
                    <div className="flex items-end gap-0.5 h-12">
                      {confidence.histogram.map((bin, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div
                            className="w-full bg-amber-500/70 rounded-sm min-h-[2px]"
                            style={{ height: `${Math.max(bin.percentage * 2, 2)}px` }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between font-mono text-[8px] text-zinc-600">
                      <span>{confidence.histogram[0]?.bin}</span>
                      <span>{confidence.histogram[confidence.histogram.length - 1]?.bin}</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {!confidence && <div className="font-mono text-[10px] text-zinc-600 text-center py-4">No data</div>}
          </div>
        </Panel>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Ensemble Composition */}
        <Panel title="ENSEMBLE MODEL COMPOSITION" className="col-span-5">
          {ensemble ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {ensemble.weights.map((w) => (
                  <div key={w.model_name} className="space-y-0.5">
                    <div className="flex justify-between font-mono text-[10px]">
                      <span className="text-zinc-300">{w.model_name}</span>
                      <span className="text-amber-400">{(w.weight * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-500/70 rounded"
                        style={{ width: `${w.contribution_pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[9px] text-zinc-600">
                      <span>MAE: GH₵{w.individual_mae.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span>R²: {w.individual_r2.toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-800 pt-2 space-y-1">
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">ENSEMBLE MAE</span>
                  <span className="text-green-400">GH₵{ensemble.ensemble_mae.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">ENSEMBLE R²</span>
                  <span className="text-green-400">{ensemble.ensemble_r2.toFixed(4)}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">IMPROVEMENT</span>
                  <span className="text-green-400">+{ensemble.improvement_over_best_single.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">DIVERSITY INDEX</span>
                  <span className="text-white">{ensemble.diversity_index.toFixed(3)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-zinc-600 text-center py-4">No ensemble data</div>
          )}
        </Panel>

        {/* Drift Details */}
        <Panel title="DRIFT DETECTION" className="col-span-4">
          {drift ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">STATUS</span>
                  <SeverityBadge severity={drift.drift_severity} />
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">DETECTED</span>
                  <span className={drift.drift_detected ? 'text-orange-400' : 'text-green-400'}>
                    {drift.drift_detected ? 'YES' : 'NO'}
                  </span>
                </div>
                {drift.drift_type && (
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-zinc-500">TYPE</span>
                    <span className="text-white">{drift.drift_type.toUpperCase()}</span>
                  </div>
                )}
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">RETRAIN</span>
                  <span className={drift.retrain_required ? 'text-red-400' : 'text-green-400'}>
                    {drift.retrain_required ? 'REQUIRED' : 'NOT NEEDED'}
                  </span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">DATE</span>
                  <span className="text-zinc-300">{drift.detection_date}</span>
                </div>
              </div>
              {drift.recommendation && (
                <div className="border-t border-zinc-800 pt-2">
                  <div className="font-mono text-[9px] text-zinc-500 mb-1">RECOMMENDATION</div>
                  <div className="font-mono text-[10px] text-zinc-300 leading-relaxed">
                    {drift.recommendation}
                  </div>
                </div>
              )}
              {drift.metrics && Object.keys(drift.metrics).length > 0 && (
                <div className="border-t border-zinc-800 pt-2 space-y-1">
                  <div className="font-mono text-[9px] text-zinc-500">DRIFT METRICS</div>
                  {Object.entries(drift.metrics).map(([key, val]) => (
                    <div key={key} className="flex justify-between font-mono text-[10px]">
                      <span className="text-zinc-500">{key.replace(/_/g, ' ').toUpperCase()}</span>
                      <span className="text-white">{typeof val === 'number' ? val.toFixed(4) : String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="font-mono text-[10px] text-zinc-600 text-center py-4">No drift data</div>
          )}
        </Panel>

        {/* Quick Navigation */}
        <Panel title="DETAILED VIEWS" className="col-span-3">
          <div className="space-y-2">
            {[
              {
                href: '/dashboard/analytics/ml/features',
                label: 'FEATURE IMPORTANCE',
                desc: 'SHAP values & rankings',
                icon: Layers,
                color: 'text-blue-400',
              },
              {
                href: '/dashboard/analytics/ml/monitoring',
                label: 'MODEL MONITORING',
                desc: 'Drift & segment analysis',
                icon: Shield,
                color: 'text-purple-400',
              },
              {
                href: '/dashboard/analytics/ml/forecasting',
                label: 'PRICE FORECASTING',
                desc: 'Regional forecasts',
                icon: TrendingUp,
                color: 'text-green-400',
              },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="flex items-center gap-3 p-2 border border-zinc-800 hover:border-amber-500/30 hover:bg-zinc-800/30 transition-colors group cursor-pointer">
                  <item.icon className={cn('w-4 h-4', item.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-white group-hover:text-amber-400 transition-colors">
                      {item.label}
                    </div>
                    <div className="font-mono text-[9px] text-zinc-600">{item.desc}</div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-amber-500 transition-colors" />
                </div>
              </Link>
            ))}

            {/* Prediction Stats */}
            {summary && (
              <div className="border-t border-zinc-800 pt-2 mt-3 space-y-1">
                <div className="font-mono text-[9px] text-zinc-500">30-DAY STATS</div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">PREDICTIONS</span>
                  <span className="text-white">{summary.total_predictions_30d.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">AVG CONFIDENCE</span>
                  <span className="text-white">{(summary.avg_confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-zinc-500">DRIFT ALERTS</span>
                  <span className={summary.active_drift_alerts > 0 ? 'text-orange-400' : 'text-green-400'}>
                    {summary.active_drift_alerts}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Performance Segments Summary */}
      {performance && (
        <Panel title="MODEL PERFORMANCE SUMMARY">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="font-mono text-[10px] text-zinc-500 text-left py-1.5 px-2">METRIC</th>
                  <th className="font-mono text-[10px] text-zinc-500 text-right py-1.5 px-2">VALUE</th>
                  <th className="font-mono text-[10px] text-zinc-500 text-right py-1.5 px-2">TARGET</th>
                  <th className="font-mono text-[10px] text-zinc-500 text-right py-1.5 px-2">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { metric: 'MAE', value: `GH₵${performance.mae.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, target: '< GH₵50,000', pass: performance.mae < 50000 },
                  { metric: 'MAPE', value: `${performance.mape.toFixed(2)}%`, target: '< 15%', pass: performance.mape < 15 },
                  { metric: 'RMSE', value: `GH₵${performance.rmse.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, target: '< GH₵75,000', pass: performance.rmse < 75000 },
                  { metric: 'R² Score', value: performance.r2.toFixed(4), target: '> 0.85', pass: performance.r2 > 0.85 },
                  { metric: '±10% Accuracy', value: `${performance.within_10_pct.toFixed(1)}%`, target: '> 70%', pass: performance.within_10_pct > 70 },
                  { metric: '±20% Accuracy', value: `${performance.within_20_pct.toFixed(1)}%`, target: '> 90%', pass: performance.within_20_pct > 90 },
                  { metric: 'Sample Size', value: performance.sample_size.toLocaleString(), target: '> 100', pass: performance.sample_size > 100 },
                ].map((row) => (
                  <tr key={row.metric} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="font-mono text-[10px] text-zinc-300 py-1.5 px-2">{row.metric}</td>
                    <td className="font-mono text-[10px] text-white text-right py-1.5 px-2">{row.value}</td>
                    <td className="font-mono text-[10px] text-zinc-500 text-right py-1.5 px-2">{row.target}</td>
                    <td className="text-right py-1.5 px-2">
                      {row.pass ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-400 inline" />
                      )}
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
