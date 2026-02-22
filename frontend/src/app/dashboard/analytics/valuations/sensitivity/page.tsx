'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Activity,
  RefreshCw,
  ChevronLeft,
  AlertTriangle,
  Ruler,
  Home,
  BarChart3,
  ShieldCheck,
  Layers,
  CheckCircle,
  XCircle,
  Search,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface SensitivitySummary {
  total_analyses: number
  by_type: Array<{
    analysis_type: string
    count: number
    avg_range_pct: number
  }>
  overall_avg_range_pct: number
  avg_var_5pct: number
}

interface FloorPlanSummary {
  total_plans: number
  total_rooms: number
  avg_gfa: number
  median_gfa: number
  avg_nia: number
  avg_efficiency_ratio: number
  avg_bedrooms: number
  avg_bathrooms: number
  compliance_rate: number
}

interface RegionalFloorPlan {
  region: string
  plan_count: number
  avg_gfa: number
  median_gfa: number
  avg_nia: number
  avg_efficiency_ratio: number
  compliance_rate: number
}

interface RoomAnalytics {
  room_type: string
  count: number
  avg_area: number
  min_area: number
  max_area: number
  median_area: number
  meets_code_pct: number
  min_standard_area: number | null
}

interface GFABucket {
  bucket: string
  count: number
  pct: number
}

interface ComplianceViolation {
  room_type: string
  violation_count: number
  total_count: number
  violation_pct: number
}

interface SensitivityAnalysis {
  id: string
  valuation_id: string
  analysis_type: string
  valuation_method: string
  base_case_value: number
  best_case_value: number
  worst_case_value: number
  value_at_risk_5pct: number | null
  config: Record<string, unknown>
  results: Record<string, unknown>
  status: string
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/valuations'

async function fetchData<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`)
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

function formatLabel(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function ComplianceBadge({ rate }: { rate: number }) {
  const color =
    rate >= 90
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : rate >= 70
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-red-400 bg-red-500/10 border-red-500/20'
  return (
    <span className={cn('px-1.5 py-0.5 font-mono text-[9px] border rounded', color)}>
      {rate.toFixed(0)}%
    </span>
  )
}

function AnalysisTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    single_variable: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    two_variable: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    tornado: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    monte_carlo: 'text-green-400 bg-green-500/10 border-green-500/20',
  }
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 font-mono text-[9px] border rounded',
        colors[type] || 'text-zinc-400 border-zinc-700',
      )}
    >
      {formatLabel(type)}
    </span>
  )
}

// =====================================================
// SUB-SECTIONS
// =====================================================

function SensitivitySection() {
  const [summary, setSummary] = useState<SensitivitySummary | null>(null)
  const [lookupId, setLookupId] = useState('')
  const [lookupResults, setLookupResults] = useState<SensitivityAnalysis[] | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const data = await fetchData<SensitivitySummary>('/sensitivity-summary?months=12')
      setSummary(data)
      setLoading(false)
    })()
  }, [])

  const handleLookup = useCallback(async () => {
    if (!lookupId.trim()) return
    setLookupLoading(true)
    const data = await fetchData<SensitivityAnalysis[]>(`/sensitivity/${lookupId.trim()}`)
    setLookupResults(data || [])
    setLookupLoading(false)
  }, [lookupId])

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800/50 rounded border border-zinc-800" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <Panel title="TOTAL ANALYSES">
          <div className="text-center">
            <Activity className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className="font-mono text-2xl text-white">{summary?.total_analyses ?? 0}</div>
          </div>
        </Panel>
        <Panel title="AVG RANGE ±%">
          <div className="text-center">
            <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-orange-400" />
            <div className="font-mono text-2xl text-white">
              {summary ? `±${summary.overall_avg_range_pct.toFixed(1)}%` : '—'}
            </div>
          </div>
        </Panel>
        <Panel title="AVG VaR (5%)">
          <div className="text-center">
            <ShieldCheck className="w-4 h-4 mx-auto mb-1 text-red-400" />
            <div className="font-mono text-2xl text-white">
              {summary ? formatCurrency(summary.avg_var_5pct) : '—'}
            </div>
          </div>
        </Panel>
        <Panel title="ANALYSIS TYPES">
          <div className="text-center">
            <Layers className="w-4 h-4 mx-auto mb-1 text-blue-400" />
            <div className="font-mono text-2xl text-white">{summary?.by_type?.length ?? 0}</div>
          </div>
        </Panel>
      </div>

      {/* Analysis Type Breakdown */}
      {summary?.by_type && summary.by_type.length > 0 && (
        <Panel title="BY ANALYSIS TYPE">
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[10px]">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left py-1 pr-4">TYPE</th>
                  <th className="text-right py-1 px-2">COUNT</th>
                  <th className="text-right py-1 px-2">AVG RANGE ±%</th>
                  <th className="text-left py-1 px-4">DISTRIBUTION</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_type
                  .sort((a, b) => b.count - a.count)
                  .map((t) => {
                    const maxC = Math.max(...summary.by_type.map((x) => x.count), 1)
                    return (
                      <tr key={t.analysis_type} className="border-b border-zinc-800/50">
                        <td className="py-1.5 pr-4">
                          <AnalysisTypeBadge type={t.analysis_type} />
                        </td>
                        <td className="text-right py-1.5 px-2 text-zinc-300">{t.count}</td>
                        <td className="text-right py-1.5 px-2">
                          <span
                            className={cn(
                              'font-mono text-[9px]',
                              t.avg_range_pct < 15
                                ? 'text-green-400'
                                : t.avg_range_pct < 30
                                  ? 'text-amber-400'
                                  : 'text-red-400',
                            )}
                          >
                            ±{t.avg_range_pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-1.5 px-4 w-40">
                          <div className="h-2.5 bg-zinc-800 rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-amber-500/60 rounded-sm"
                              style={{ width: `${(t.count / maxC) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Valuation Lookup */}
      <Panel title="VALUATION SENSITIVITY LOOKUP">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            placeholder="Enter valuation ID..."
            className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono text-[10px] px-3 py-1.5 focus:border-amber-500/50 outline-none placeholder:text-zinc-600"
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading || !lookupId.trim()}
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[10px] text-zinc-400 border border-zinc-700 hover:border-amber-500/50 hover:text-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Search className="w-3 h-3" />
            LOOKUP
          </button>
        </div>

        {lookupLoading && (
          <div className="animate-pulse h-16 bg-zinc-800/30 rounded" />
        )}

        {lookupResults !== null && !lookupLoading && (
          lookupResults.length > 0 ? (
            <div className="space-y-2">
              {lookupResults.map((sa) => {
                const rangePct =
                  sa.base_case_value > 0
                    ? (((sa.best_case_value - sa.worst_case_value) / sa.base_case_value) * 100).toFixed(1)
                    : '—'
                return (
                  <div
                    key={sa.id}
                    className="border border-zinc-800 bg-zinc-800/20 p-2"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AnalysisTypeBadge type={sa.analysis_type} />
                        <span className="font-mono text-[9px] text-zinc-400">
                          {formatLabel(sa.valuation_method)}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'font-mono text-[9px] px-1.5 py-0.5 border rounded',
                          sa.status === 'completed'
                            ? 'text-green-400 border-green-500/20'
                            : 'text-zinc-400 border-zinc-700',
                        )}
                      >
                        {sa.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Tornado-style bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between font-mono text-[8px] text-zinc-500 mb-0.5">
                        <span>WORST: {formatCurrency(sa.worst_case_value)}</span>
                        <span>BASE: {formatCurrency(sa.base_case_value)}</span>
                        <span>BEST: {formatCurrency(sa.best_case_value)}</span>
                      </div>
                      <div className="relative h-5 bg-zinc-800 rounded-sm overflow-hidden">
                        {/* Range from worst to best relative to a full span */}
                        {sa.best_case_value > 0 && (
                          <>
                            {/* Worst → Base */}
                            <div
                              className="absolute top-0 h-full bg-red-500/40"
                              style={{
                                left: `${((sa.worst_case_value / sa.best_case_value) * 100).toFixed(1)}%`,
                                width: `${(((sa.base_case_value - sa.worst_case_value) / sa.best_case_value) * 100).toFixed(1)}%`,
                              }}
                            />
                            {/* Base → Best */}
                            <div
                              className="absolute top-0 h-full bg-green-500/40"
                              style={{
                                left: `${((sa.base_case_value / sa.best_case_value) * 100).toFixed(1)}%`,
                                width: `${(((sa.best_case_value - sa.base_case_value) / sa.best_case_value) * 100).toFixed(1)}%`,
                              }}
                            />
                            {/* Base case marker */}
                            <div
                              className="absolute top-0 h-full w-0.5 bg-white"
                              style={{ left: `${((sa.base_case_value / sa.best_case_value) * 100).toFixed(1)}%` }}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-[8px] text-zinc-500">
                      <span>Range: ±{rangePct}%</span>
                      {sa.value_at_risk_5pct && <span>VaR 5%: {formatCurrency(sa.value_at_risk_5pct)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-12 flex items-center justify-center font-mono text-[10px] text-zinc-600">
              No sensitivity analyses found for this valuation
            </div>
          )
        )}
      </Panel>
    </div>
  )
}

function FloorPlanSection() {
  const [summary, setSummary] = useState<FloorPlanSummary | null>(null)
  const [regional, setRegional] = useState<RegionalFloorPlan[]>([])
  const [rooms, setRooms] = useState<RoomAnalytics[]>([])
  const [distribution, setDistribution] = useState<GFABucket[]>([])
  const [violations, setViolations] = useState<ComplianceViolation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [s, r, rm, d, v] = await Promise.all([
        fetchData<FloorPlanSummary>('/floor-plans/summary'),
        fetchData<RegionalFloorPlan[]>('/floor-plans/by-region'),
        fetchData<RoomAnalytics[]>('/floor-plans/rooms'),
        fetchData<GFABucket[]>('/floor-plans/distribution'),
        fetchData<ComplianceViolation[]>('/floor-plans/compliance'),
      ])
      setSummary(s)
      setRegional(r || [])
      setRooms(rm || [])
      setDistribution(d || [])
      setViolations(v || [])
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800/50 rounded border border-zinc-800" />
          ))}
        </div>
        <div className="h-48 bg-zinc-800/50 rounded border border-zinc-800" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <Panel title="TOTAL PLANS">
          <div className="text-center">
            <Home className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className="font-mono text-2xl text-white">{summary?.total_plans ?? 0}</div>
            <div className="font-mono text-[9px] text-zinc-500">{summary?.total_rooms ?? 0} rooms</div>
          </div>
        </Panel>
        <Panel title="AVG GFA">
          <div className="text-center">
            <Ruler className="w-4 h-4 mx-auto mb-1 text-blue-400" />
            <div className="font-mono text-2xl text-white">
              {summary ? `${summary.avg_gfa.toFixed(0)}m²` : '—'}
            </div>
            <div className="font-mono text-[9px] text-zinc-500">
              Med: {summary ? `${summary.median_gfa.toFixed(0)}m²` : '—'}
            </div>
          </div>
        </Panel>
        <Panel title="AVG NIA">
          <div className="text-center">
            <Layers className="w-4 h-4 mx-auto mb-1 text-purple-400" />
            <div className="font-mono text-2xl text-white">
              {summary ? `${summary.avg_nia.toFixed(0)}m²` : '—'}
            </div>
          </div>
        </Panel>
        <Panel title="EFFICIENCY">
          <div className="text-center">
            <BarChart3 className="w-4 h-4 mx-auto mb-1 text-green-400" />
            <div className="font-mono text-2xl text-white">
              {summary ? `${(summary.avg_efficiency_ratio * 100).toFixed(1)}%` : '—'}
            </div>
          </div>
        </Panel>
        <Panel title="CODE COMPLIANCE">
          <div className="text-center">
            <ShieldCheck className="w-4 h-4 mx-auto mb-1 text-green-400" />
            <div className="font-mono text-2xl text-white">
              {summary ? `${summary.compliance_rate.toFixed(0)}%` : '—'}
            </div>
            <div className="font-mono text-[9px] text-zinc-500">Ghana Building Code</div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* GFA Distribution */}
        <Panel title="GFA DISTRIBUTION (m²)" className="col-span-5">
          {distribution.length > 0 ? (
            <div className="space-y-1">
              {distribution.map((b) => {
                const maxPct = Math.max(...distribution.map((x) => x.pct), 1)
                return (
                  <div key={b.bucket} className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-zinc-400 w-16">{b.bucket}</span>
                    <div className="flex-1 h-3 bg-zinc-800 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-blue-500/60 rounded-sm"
                        style={{ width: `${(b.pct / maxPct) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[9px] text-zinc-300 w-8 text-right">{b.count}</span>
                    <span className="font-mono text-[8px] text-zinc-500 w-10 text-right">
                      {b.pct.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center font-mono text-[10px] text-zinc-600">
              No distribution data
            </div>
          )}
        </Panel>

        {/* Regional Floor Plans */}
        <Panel title="BY REGION" className="col-span-7">
          {regional.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left py-1 pr-4">REGION</th>
                    <th className="text-right py-1 px-2">PLANS</th>
                    <th className="text-right py-1 px-2">AVG GFA</th>
                    <th className="text-right py-1 px-2">AVG NIA</th>
                    <th className="text-right py-1 px-2">EFFICIENCY</th>
                    <th className="text-right py-1 px-2">COMPLIANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {regional
                    .sort((a, b) => b.plan_count - a.plan_count)
                    .map((r) => (
                      <tr key={r.region} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-1.5 pr-4 text-zinc-300">{formatRegion(r.region)}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-300">{r.plan_count}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-400">{r.avg_gfa.toFixed(0)}m²</td>
                        <td className="text-right py-1.5 px-2 text-zinc-400">{r.avg_nia.toFixed(0)}m²</td>
                        <td className="text-right py-1.5 px-2 text-zinc-400">
                          {(r.avg_efficiency_ratio * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-1.5 px-2">
                          <ComplianceBadge rate={r.compliance_rate} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center font-mono text-[10px] text-zinc-600">
              No regional data
            </div>
          )}
        </Panel>
      </div>

      {/* Room Analytics + Compliance Violations */}
      <div className="grid grid-cols-12 gap-3">
        {/* Room Analytics */}
        <Panel title="ROOM SIZE ANALYTICS" className="col-span-8">
          {rooms.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left py-1 pr-4">ROOM TYPE</th>
                    <th className="text-right py-1 px-2">COUNT</th>
                    <th className="text-right py-1 px-2">AVG m²</th>
                    <th className="text-right py-1 px-2">MIN m²</th>
                    <th className="text-right py-1 px-2">MAX m²</th>
                    <th className="text-right py-1 px-2">MEDIAN m²</th>
                    <th className="text-right py-1 px-2">STD m²</th>
                    <th className="text-right py-1 px-2">% MEETS CODE</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms
                    .sort((a, b) => b.count - a.count)
                    .map((r) => (
                      <tr key={r.room_type} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-1.5 pr-4 text-zinc-300">{formatLabel(r.room_type)}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-400">{r.count}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-300">{r.avg_area.toFixed(1)}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-500">{r.min_area.toFixed(1)}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-500">{r.max_area.toFixed(1)}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-400">{r.median_area.toFixed(1)}</td>
                        <td className="text-right py-1.5 px-2 text-zinc-500">
                          {r.min_standard_area != null ? r.min_standard_area.toFixed(1) : '—'}
                        </td>
                        <td className="text-right py-1.5 px-2">
                          <ComplianceBadge rate={r.meets_code_pct} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center font-mono text-[10px] text-zinc-600">
              No room data available
            </div>
          )}
        </Panel>

        {/* Compliance Violations */}
        <Panel title="CODE VIOLATIONS" className="col-span-4">
          {violations.length > 0 ? (
            <div className="space-y-2">
              {violations
                .sort((a, b) => b.violation_pct - a.violation_pct)
                .map((v) => (
                  <div key={v.room_type} className="border-b border-zinc-800/50 pb-2 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] text-zinc-300">{formatLabel(v.room_type)}</span>
                      <span
                        className={cn(
                          'font-mono text-[9px]',
                          v.violation_pct > 20 ? 'text-red-400' : v.violation_pct > 10 ? 'text-amber-400' : 'text-green-400',
                        )}
                      >
                        {v.violation_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-sm overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-sm',
                          v.violation_pct > 20 ? 'bg-red-500/60' : v.violation_pct > 10 ? 'bg-amber-500/60' : 'bg-green-500/60',
                        )}
                        style={{ width: `${Math.min(v.violation_pct, 100)}%` }}
                      />
                    </div>
                    <div className="font-mono text-[8px] text-zinc-600 mt-0.5">
                      {v.violation_count} of {v.total_count} below code minimum
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center font-mono text-[10px] text-zinc-600">
              <div className="text-center">
                <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
                <span>No violations found</span>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

type ActiveTab = 'sensitivity' | 'floor-plans'

export default function SensitivityPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sensitivity')

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/analytics/valuations"
              className="font-mono text-[10px] text-zinc-500 hover:text-amber-500 transition-colors flex items-center gap-0.5"
            >
              <ChevronLeft className="w-3 h-3" />
              VALUATIONS
            </Link>
          </div>
          <h1 className="font-mono text-xl text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" />
            SENSITIVITY & FLOOR PLANS
          </h1>
          <p className="font-mono text-[10px] text-zinc-500">
            Sensitivity Analysis & Floor Plan Analytics — Sections 3.5, 3.6
          </p>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => setActiveTab('sensitivity')}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 font-mono text-[10px] border transition-colors',
            activeTab === 'sensitivity'
              ? 'text-amber-500 border-amber-500/50 bg-amber-500/10'
              : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600',
          )}
        >
          <Activity className="w-3 h-3" />
          SENSITIVITY ANALYSIS
        </button>
        <button
          onClick={() => setActiveTab('floor-plans')}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 font-mono text-[10px] border transition-colors',
            activeTab === 'floor-plans'
              ? 'text-amber-500 border-amber-500/50 bg-amber-500/10'
              : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600',
          )}
        >
          <Ruler className="w-3 h-3" />
          FLOOR PLANS
        </button>
      </div>

      {/* Content */}
      {activeTab === 'sensitivity' ? <SensitivitySection /> : <FloorPlanSection />}
    </div>
  )
}
