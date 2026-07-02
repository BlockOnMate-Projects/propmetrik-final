'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import Link from 'next/link'
import {
  FileSearch,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Users,
  ShieldCheck,
  Layers,
  Award,
  Target,
  Activity,
  ChevronRight,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface MarketRelativeRow {
  region: string
  property_type: string | null
  valuations_median: number
  market_median: number
  premium_discount_pct: number
  valuation_count: number
  macro_adjusted_value?: number | null
  pvmaf_multiplier?: number | null
  pvmaf_components?: Record<string, number> | null
}

interface VolumeSummary {
  period: string
  total_count: number
  completed_count: number
  total_value: number
  avg_value: number
  median_value: number
  value_p25: number
  value_p75: number
  by_region: Record<string, { count: number; value: number }>
  by_property_type: Record<string, { count: number; value: number }>
  by_purpose: Record<string, { count: number; value: number }>
  by_method: Record<string, { count: number; avg_confidence: number }>
  by_valuation_type: Record<string, number>
}

interface VolumeHistory {
  period: string
  valuation_count: number
  total_value: number
  avg_value: number
  avg_confidence: number
}

interface MethodPerformance {
  method_name: string
  usage_count: number
  as_primary_count: number
  avg_weight: number
  avg_confidence: number
  min_confidence: number
  max_confidence: number
  avg_value: number
  avg_comparables_used: number | null
  avg_similarity_score: number | null
  avg_adjustment_pct: number | null
}

interface QualityMetrics {
  avg_comparables_per_valuation: number
  median_similarity_score: number
  avg_adjustment_pct: number
  freshness_days_avg: number
  avg_method_spread_pct: number
  override_rate: number
  confidence_distribution: Array<{
    bucket: string
    count: number
  }>
}

interface LeaderboardEntry {
  rank: number
  valuer_id: string
  valuer_name: string
  organization_name: string | null
  total_valuations: number
  avg_confidence: number
  avg_time_to_complete_days: number
  avg_value: number
  override_rate: number
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/valuations'

async function fetchData<T>(endpoint: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await authedFetch(`${API_BASE}${endpoint}`, { signal })
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

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor = 'text-amber-500',
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  iconColor?: string
}) {
  return (
    <Panel title={label}>
      <div className="text-center">
        <Icon className={cn('w-4 h-4 mx-auto mb-1', iconColor)} />
        <div className="font-mono text-2xl text-foreground">{value}</div>
        {sub && <div className="font-mono text-[10px] text-muted-foreground mt-1">{sub}</div>}
      </div>
    </Panel>
  )
}

function MiniBarChart({ data, height = 32 }: { data: number[]; height?: number }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((val, i) => (
        <div
          key={i}
          className="flex-1 bg-amber-500/70 rounded-sm min-w-[3px]"
          style={{ height: `${Math.max((val / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const color =
    value >= 0.8
      ? 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20'
      : value >= 0.6
        ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20'
  return (
    <span className={cn('px-1.5 py-0.5 font-mono text-[9px] border rounded', color)}>
      {(value * 100).toFixed(0)}%
    </span>
  )
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `GH₵${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `GH₵${(val / 1_000).toFixed(0)}K`
  return `GH₵${val.toFixed(0)}`
}

function formatRegion(region: string): string {
  return region
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatMethod(method: string): string {
  return method
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function ValuationAnalyticsPage() {
  const [volume, setVolume] = useState<VolumeSummary | null>(null)
  const [history, setHistory] = useState<VolumeHistory[]>([])
  const [methods, setMethods] = useState<MethodPerformance[]>([])
  const [quality, setQuality] = useState<QualityMetrics | null>(null)
  const [topValuers, setTopValuers] = useState<LeaderboardEntry[]>([])
  const [materialQuality, setMaterialQuality] = useState<Record<string, number | null>>({})
  const [marketRelative, setMarketRelative] = useState<MarketRelativeRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [volumeData, historyData, methodsData, qualityData, valuersData, materialQualityData, marketRelData] = await Promise.all([
      fetchData<VolumeSummary>('/volume/summary?months=12', signal),
      fetchData<VolumeHistory[]>('/volume/history?months=12', signal),
      fetchData<MethodPerformance[]>('/methods/performance?months=12', signal),
      fetchData<QualityMetrics>('/quality?months=12', signal),
      fetchData<LeaderboardEntry[]>('/valuers/leaderboard?limit=5&sortBy=volume', signal),
      fetchData<Record<string, number | null>>('/material-quality', signal),
      fetchData<MarketRelativeRow[]>('/market-relative', signal),
    ])
    if (signal?.aborted) return
    setVolume(volumeData)
    setHistory(historyData || [])
    setMethods(methodsData || [])
    setQuality(qualityData)
    setTopValuers(valuersData || [])
    setMaterialQuality(materialQualityData || {})
    setMarketRelative(marketRelData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadData(controller.signal)
    return () => controller.abort()
  }, [loadData])

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

  const completionRate = volume
    ? ((volume.completed_count / Math.max(volume.total_count, 1)) * 100).toFixed(1)
    : '0'

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-amber-500" />
            VALUATION ANALYTICS
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Portfolio Volume, Method Performance & Quality Metrics — Section 3
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/analytics/valuations/leaderboard"
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors"
          >
            <Award className="w-3 h-3" />
            LEADERBOARD
          </Link>
          <Link
            href="/dashboard/analytics/valuations/sensitivity"
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors"
          >
            <Activity className="w-3 h-3" />
            SENSITIVITY
          </Link>
          <button
            onClick={() => loadData()}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            REFRESH
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <KPICard
          label="TOTAL VALUATIONS"
          value={volume?.total_count?.toLocaleString() ?? '—'}
          sub={`${completionRate}% completed`}
          icon={BarChart3}
        />
        <KPICard
          label="MEDIAN VALUE"
          value={volume ? formatCurrency(volume.median_value) : '—'}
          sub={volume ? `IQR: ${formatCurrency(volume.value_p25)} – ${formatCurrency(volume.value_p75)}` : undefined}
          icon={Layers}
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <KPICard
          label="AVG CONFIDENCE"
          value={volume ? `${((volume.completed_count / Math.max(volume.total_count, 1)) * 100).toFixed(1)}%` : '—'}
          sub={volume ? `${volume.completed_count} completed` : undefined}
          icon={ShieldCheck}
          iconColor="text-green-600 dark:text-green-400"
        />
        <KPICard
          label="OVERRIDE RATE"
          value={quality ? `${(quality.override_rate * 100).toFixed(1)}%` : '—'}
          sub={quality ? `Avg spread: ${quality.avg_method_spread_pct.toFixed(1)}%` : undefined}
          icon={Target}
          iconColor="text-orange-600 dark:text-orange-400"
        />
      </div>

      {/* Volume History + Regional Breakdown */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Volume History Chart */}
        <Panel title="VOLUME HISTORY (12M)" className="col-span-8">
          {history.length > 0 ? (
            <div>
              <div className="flex items-end gap-1 h-40">
                {history.map((h, i) => {
                  const maxCount = Math.max(...history.map((x) => x.valuation_count), 1)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="w-full flex flex-col items-stretch gap-0.5" style={{ height: 130 }}>
                        <div
                          className="bg-amber-500/70 rounded-sm w-full"
                          style={{ height: `${(h.valuation_count / maxCount) * 130}px` }}
                        />
                      </div>
                      <span className="font-mono text-[8px] text-muted-foreground">
                        {h.period.slice(5)}
                      </span>
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-muted border border-border px-2 py-1 rounded z-10 whitespace-nowrap">
                        <div className="font-mono text-[9px] text-muted-foreground">{h.period}</div>
                        <div className="font-mono text-[9px] text-amber-600 dark:text-amber-400">{h.valuation_count} valuations</div>
                        <div className="font-mono text-[9px] text-muted-foreground">Avg: {formatCurrency(h.avg_value)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 justify-end">
                <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
                  <span className="w-2 h-2 bg-amber-500/70 rounded-sm" /> Valuations
                </span>
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
              No volume history data available
            </div>
          )}
        </Panel>

        {/* Regional Breakdown */}
        <Panel title="BY REGION" className="col-span-4">
          {volume?.by_region && Object.keys(volume.by_region).length > 0 ? (
            <>
            <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
              {Object.entries(volume.by_region)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([region, r]) => {
                  const maxCount = Math.max(...Object.values(volume.by_region).map((x) => x.count), 1)
                  const mq = materialQuality[region.toLowerCase().replace(/\s+/g, '_')]
                  return (
                    <div key={region} className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground w-24 truncate">
                        {formatRegion(region)}
                      </span>
                      <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-amber-500/60 rounded-sm"
                          style={{ width: `${(r.count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-[9px] text-muted-foreground w-8 text-right">{r.count}</span>
                      <span
                        className="font-mono text-[9px] text-cyan-600 dark:text-cyan-400 w-9 text-right"
                        title="PHC 2021 district material-quality score (cement-block wall + metal roof + cement/tile floor)"
                      >
                        {mq != null ? `Q${mq.toFixed(0)}` : '—'}
                      </span>
                    </div>
                  )
                })}
            </div>
            <div className="pt-2 mt-1 border-t border-border font-mono text-[8px] text-muted-foreground">
              Q = PHC 2021 district material-quality baseline (0–100). Higher = more cement-block / metal-roof / tiled stock.
            </div>
            </>
          ) : (
            <div className="h-[170px] flex items-center justify-center font-mono text-[10px] text-muted-foreground">
              No regional data
            </div>
          )}
        </Panel>
      </div>

      {/* Method Performance + Quality / Purpose Breakdown */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Method Performance Table */}
        <Panel title="METHOD PERFORMANCE" className="col-span-8">
          {methods.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1 pr-4">METHOD</th>
                    <th className="text-right py-1 px-2">USAGE</th>
                    <th className="text-right py-1 px-2">PRIMARY</th>
                    <th className="text-right py-1 px-2">AVG VALUE</th>
                    <th className="text-right py-1 px-2">AVG CONF</th>
                    <th className="text-right py-1 px-2">RANGE</th>
                    <th className="text-right py-1 px-2">COMPS</th>
                    <th className="text-right py-1 px-2">WEIGHT</th>
                  </tr>
                </thead>
                <tbody>
                  {methods
                    .sort((a, b) => b.usage_count - a.usage_count)
                    .map((m) => {
                      const totalUsage = methods.reduce((s, x) => s + x.usage_count, 0)
                      const pct = totalUsage > 0 ? (m.usage_count / totalUsage) * 100 : 0
                      return (
                      <tr key={m.method_name} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                        <td className="py-1.5 pr-4 text-muted-foreground">{formatMethod(m.method_name)}</td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">{m.usage_count}</td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">{m.as_primary_count} ({pct.toFixed(0)}%)</td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">{formatCurrency(m.avg_value)}</td>
                        <td className="text-right py-1.5 px-2">
                          <ConfidenceBadge value={m.avg_confidence} />
                        </td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground text-[9px]">
                          {(m.min_confidence * 100).toFixed(0)}–{(m.max_confidence * 100).toFixed(0)}%
                        </td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">
                          {m.avg_comparables_used?.toFixed(1) ?? '—'}
                        </td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">
                          {m.avg_weight != null
                            ? `${(m.avg_weight * 100).toFixed(0)}%`
                            : '—'}
                        </td>
                      </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
              No method data available
            </div>
          )}
        </Panel>

        {/* Right Column: Quality + Purpose */}
        <div className="col-span-4 flex flex-col gap-3">
          {/* Quality */}
          <Panel title="QUALITY METRICS">
            {quality ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-muted-foreground">Avg Comparables</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {quality.avg_comparables_per_valuation.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-muted-foreground">Avg Similarity Score</span>
                  <ConfidenceBadge value={quality.median_similarity_score} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-muted-foreground">Avg Adjustment %</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {quality.avg_adjustment_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="border-t border-border pt-2">
                  <span className="font-mono text-[9px] text-muted-foreground block mb-1">CONFIDENCE DISTRIBUTION</span>
                  {quality.confidence_distribution.map((b) => {
                    const maxC = Math.max(...quality.confidence_distribution.map((x) => x.count), 1)
                    return (
                      <div key={b.bucket} className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[8px] text-muted-foreground w-14">{b.bucket}</span>
                        <div className="flex-1 h-2.5 bg-muted rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-green-500/60 rounded-sm"
                            style={{ width: `${(b.count / maxC) * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-[8px] text-muted-foreground w-6 text-right">{b.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
                No quality data
              </div>
            )}
          </Panel>

          {/* Purpose Breakdown */}
          <Panel title="BY PURPOSE">
            {volume?.by_purpose && Object.keys(volume.by_purpose).length > 0 ? (
              <div className="space-y-1">
                {Object.entries(volume.by_purpose)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .slice(0, 8)
                  .map(([purpose, p]) => {
                    const maxC = Math.max(...Object.values(volume.by_purpose).map((x) => x.count), 1)
                    return (
                      <div key={purpose} className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-muted-foreground w-20 truncate">
                          {formatMethod(purpose)}
                        </span>
                        <div className="flex-1 h-2.5 bg-muted rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-blue-500/60 rounded-sm"
                            style={{ width: `${(p.count / maxC) * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-[8px] text-muted-foreground w-6 text-right">{p.count}</span>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="h-16 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
                No purpose data
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Bottom Row: Top Valuers + Property Type Breakdown + Valuation Type */}
      <div className="grid grid-cols-12 gap-3">
        {/* Top Valuers Preview */}
        <Panel
          title="TOP VALUERS"
          className="col-span-5"
          actions={
            <Link
              href="/dashboard/analytics/valuations/leaderboard"
              className="font-mono text-[9px] text-muted-foreground hover:text-amber-500 transition-colors flex items-center gap-0.5"
            >
              VIEW ALL <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          {topValuers.length > 0 ? (
            <div className="space-y-1.5">
              {topValuers.map((v) => (
                <div
                  key={v.valuer_id}
                  className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0"
                >
                  <span className="font-mono text-[10px] text-amber-500 w-5">{v.rank}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                      {v.valuer_name}
                    </div>
                    {v.organization_name && (
                      <div className="font-mono text-[8px] text-muted-foreground truncate">{v.organization_name}</div>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{v.total_valuations}</span>
                  <ConfidenceBadge value={v.avg_confidence} />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
              No valuer data
            </div>
          )}
        </Panel>

        {/* Property Type Breakdown */}
        <Panel title="BY PROPERTY TYPE" className="col-span-4">
          {volume?.by_property_type && Object.keys(volume.by_property_type).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(volume.by_property_type)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([propType, pt]) => {
                  const total = Object.values(volume.by_property_type).reduce((s, x) => s + x.count, 0)
                  const pct = total > 0 ? (pt.count / total) * 100 : 0
                  return (
                    <div key={propType}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {formatMethod(propType)}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {pt.count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-purple-500/60 rounded-sm"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
              No property type data
            </div>
          )}
        </Panel>

        {/* Valuation Type Breakdown */}
        <Panel title="BY VALUATION TYPE" className="col-span-3">
          {volume?.by_valuation_type && Object.keys(volume.by_valuation_type).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(volume.by_valuation_type)
                .sort(([, a], [, b]) => b - a)
                .map(([valType, count]) => {
                  const total = Object.values(volume.by_valuation_type).reduce((s, x) => s + x, 0)
                  const pct = total > 0 ? (count / total) * 100 : 0
                  const colors: Record<string, string> = {
                    full_inspection: 'bg-green-500/60',
                    professional: 'bg-blue-500/60',
                    desktop: 'bg-purple-500/60',
                    drive_by: 'bg-orange-500/60',
                    avm: 'bg-cyan-500/60',
                    hybrid: 'bg-pink-500/60',
                  }
                  return (
                    <div key={valType} className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground w-24 truncate">
                        {formatMethod(valType)}
                      </span>
                      <div className="flex-1 h-2.5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className={cn('h-full rounded-sm', colors[valType] || 'bg-zinc-600')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[8px] text-muted-foreground w-6 text-right">{count}</span>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
              No type data
            </div>
          )}
        </Panel>
      </div>

      {/* Market-relative + PVMAF macro-adjusted value (Slice 5 §7.1) */}
      {marketRelative.length > 0 && (
        <div className="mt-3">
          <Panel title="MARKET-RELATIVE & MACRO-ADJUSTED VALUE (PVMAF)">
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground border-b border-border">
                    <th className="text-left pb-2">REGION</th>
                    <th className="text-left pb-2">TYPE</th>
                    <th className="text-right pb-2">MARKET MEDIAN</th>
                    <th className="text-right pb-2">VALUATIONS</th>
                    <th className="text-right pb-2">PREMIUM</th>
                    <th className="text-right pb-2">PVMAF</th>
                    <th className="text-right pb-2">MACRO-ADJUSTED</th>
                  </tr>
                </thead>
                <tbody>
                  {marketRelative.map((r, i) => {
                    const adjPct = r.pvmaf_multiplier != null ? (r.pvmaf_multiplier - 1) * 100 : null
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 text-foreground">{r.region.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                        <td className="py-1.5 text-muted-foreground">{(r.property_type || '—').replace(/_/g, ' ')}</td>
                        <td className="py-1.5 text-right text-foreground">₵{r.market_median.toLocaleString()}</td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          {r.valuation_count > 0 ? `₵${Math.round(r.valuations_median).toLocaleString()} (${r.valuation_count})` : '—'}
                        </td>
                        <td className="py-1.5 text-right">
                          {r.valuation_count > 0
                            ? <span className={r.premium_discount_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                {r.premium_discount_pct >= 0 ? '+' : ''}{r.premium_discount_pct.toFixed(1)}%
                              </span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-1.5 text-right">
                          {adjPct != null
                            ? <span className={adjPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} title={r.pvmaf_components ? JSON.stringify(r.pvmaf_components) : undefined}>
                                {adjPct >= 0 ? '+' : ''}{adjPct.toFixed(1)}%
                              </span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-1.5 text-right text-cyan-600 dark:text-cyan-400">
                          {r.macro_adjusted_value != null ? `₵${r.macro_adjusted_value.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="pt-2 mt-1 border-t border-border font-mono text-[9px] text-muted-foreground">
                MACRO-ADJUSTED = market median × PVMAF (real CPI/PPI/GDP/interest signals + regional NIQS &amp; completion risk, ±15% clamp).
                PREMIUM compares completed valuations to the property-market median. Market medians from the `properties` sale market.
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
