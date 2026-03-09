'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import Link from 'next/link'
import {
  Award,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  Users,
  Building2,
  Clock,
  ShieldCheck,
  Target,
  BarChart3,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface LeaderboardEntry {
  rank: number
  valuer_id: string
  valuer_name: string
  organization: string | null
  total_valuations: number
  avg_confidence: number
  avg_turnaround_days: number
  avg_value: number
  override_rate: number
}

interface ValuerDetail {
  valuer_id: string
  valuer_name: string
  organization: string | null
  total_valuations: number
  completed_valuations: number
  avg_value: number
  median_value: number
  avg_confidence: number
  avg_turnaround_days: number
  override_rate: number
  peer_percentiles: {
    volume_pctile: number
    confidence_pctile: number
    speed_pctile: number
    value_pctile: number
  }
  by_property_type: Array<{
    property_type: string
    count: number
    avg_value: number
    avg_confidence: number
  }>
  by_region: Array<{
    region: string
    count: number
    avg_value: number
    avg_confidence: number
  }>
}

type SortField = 'volume' | 'quality' | 'speed' | 'value'

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/valuations'

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
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const color =
    value >= 0.8
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : value >= 0.6
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-red-400 bg-red-500/10 border-red-500/20'
  return (
    <span className={cn('px-1.5 py-0.5 font-mono text-[9px] border rounded', color)}>
      {(value * 100).toFixed(0)}%
    </span>
  )
}

function PercentileBar({ value, label }: { value: number; label: string }) {
  const pct = Math.min(value * 100, 100)
  const color =
    pct >= 75
      ? 'bg-green-500/70'
      : pct >= 50
        ? 'bg-amber-500/70'
        : pct >= 25
          ? 'bg-orange-500/70'
          : 'bg-red-500/70'
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-mono text-[9px] text-zinc-500">{label}</span>
        <span className="font-mono text-[9px] text-zinc-400">P{pct.toFixed(0)}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-sm overflow-hidden">
        <div className={cn('h-full rounded-sm', color)} style={{ width: `${pct}%` }} />
      </div>
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

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function ValuerLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [selectedValuer, setSelectedValuer] = useState<ValuerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortField>('volume')
  const [months, setMonths] = useState(12)
  const [region, setRegion] = useState('')

  const loadLeaderboard = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      sortBy,
      months: String(months),
      limit: '50',
    })
    if (region) params.set('region', region)

    const data = await fetchData<LeaderboardEntry[]>(`/valuers/leaderboard?${params}`)
    setLeaderboard(data || [])
    setLoading(false)
  }, [sortBy, months, region])

  useEffect(() => {
    loadLeaderboard()
  }, [loadLeaderboard])

  const loadValuerDetail = useCallback(async (valuerId: string) => {
    setDetailLoading(true)
    const data = await fetchData<ValuerDetail>(`/valuers/${valuerId}?months=${months}`)
    setSelectedValuer(data)
    setDetailLoading(false)
  }, [months])

  const sortOptions: { key: SortField; label: string; icon: React.ElementType }[] = [
    { key: 'volume', label: 'VOLUME', icon: BarChart3 },
    { key: 'quality', label: 'QUALITY', icon: ShieldCheck },
    { key: 'speed', label: 'SPEED', icon: Clock },
    { key: 'value', label: 'VALUE', icon: Target },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-72" />
          <div className="h-96 bg-zinc-800/50 rounded border border-zinc-800" />
        </div>
      </div>
    )
  }

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
            <Award className="w-5 h-5 text-amber-500" />
            VALUER LEADERBOARD
          </h1>
          <p className="font-mono text-[10px] text-zinc-500">
            Performance Ranking & Benchmarking — Section 3.3
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period filter */}
          <select
            value={months}
            onChange={(e) => setMonths(parseInt(e.target.value, 10))}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono text-[10px] px-2 py-1.5 focus:border-amber-500/50 outline-none"
          >
            <option value={3}>3 MONTHS</option>
            <option value={6}>6 MONTHS</option>
            <option value={12}>12 MONTHS</option>
            <option value={24}>24 MONTHS</option>
          </select>
          <button
            onClick={loadLeaderboard}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-zinc-400 border border-zinc-700 hover:border-amber-500/50 hover:text-amber-500 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            REFRESH
          </button>
        </div>
      </div>

      {/* Sort Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {sortOptions.map((opt) => {
          const Icon = opt.icon
          const active = sortBy === opt.key
          return (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 font-mono text-[10px] border transition-colors',
                active
                  ? 'text-amber-500 border-amber-500/50 bg-amber-500/10'
                  : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600',
              )}
            >
              <Icon className="w-3 h-3" />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-3">
        {/* Leaderboard Table */}
        <Panel title={`RANKINGS — SORTED BY ${sortBy.toUpperCase()}`} className={selectedValuer ? 'col-span-7' : 'col-span-12'}>
          {leaderboard.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left py-1 w-8">#</th>
                    <th className="text-left py-1 pr-4">VALUER</th>
                    <th className="text-right py-1 px-2">VALUATIONS</th>
                    <th className="text-right py-1 px-2">AVG CONF</th>
                    <th className="text-right py-1 px-2">AVG DAYS</th>
                    <th className="text-right py-1 px-2">AVG VALUE</th>
                    <th className="text-right py-1 px-2">OVERRIDE</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((v) => {
                    const isSelected = selectedValuer?.valuer_id === v.valuer_id
                    return (
                      <tr
                        key={v.valuer_id}
                        onClick={() => loadValuerDetail(v.valuer_id)}
                        className={cn(
                          'border-b border-zinc-800/50 cursor-pointer transition-colors',
                          isSelected ? 'bg-amber-500/10' : 'hover:bg-zinc-800/30',
                        )}
                      >
                        <td className="py-1.5 text-amber-500 font-bold">{v.rank}</td>
                        <td className="py-1.5 pr-4">
                          <div className="text-zinc-300 truncate max-w-[200px]">{v.valuer_name}</div>
                          {v.organization && (
                            <div className="text-[8px] text-zinc-600 truncate">{v.organization}</div>
                          )}
                        </td>
                        <td className="text-right py-1.5 px-2 text-zinc-300">{v.total_valuations}</td>
                        <td className="text-right py-1.5 px-2">
                          <ConfidenceBadge value={v.avg_confidence} />
                        </td>
                        <td className="text-right py-1.5 px-2 text-zinc-400">
                          {v.avg_turnaround_days > 0 ? `${v.avg_turnaround_days.toFixed(1)}d` : '—'}
                        </td>
                        <td className="text-right py-1.5 px-2 text-zinc-300">
                          {formatCurrency(v.avg_value)}
                        </td>
                        <td className="text-right py-1.5 px-2">
                          <span
                            className={cn(
                              'font-mono text-[9px]',
                              v.override_rate < 10
                                ? 'text-green-400'
                                : v.override_rate < 25
                                  ? 'text-amber-400'
                                  : 'text-red-400',
                            )}
                          >
                            {v.override_rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center font-mono text-[10px] text-zinc-600">
              No valuer data available for the selected period
            </div>
          )}
        </Panel>

        {/* Valuer Detail Sidebar */}
        {selectedValuer && (
          <div className="col-span-5 space-y-3">
            {/* Profile Header */}
            <Panel
              title="VALUER DETAIL"
              actions={
                <button
                  onClick={() => setSelectedValuer(null)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              }
            >
              {detailLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-5 bg-zinc-800 rounded w-48" />
                  <div className="h-3 bg-zinc-800 rounded w-32" />
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-amber-500" />
                    <span className="font-mono text-sm text-white">{selectedValuer.valuer_name}</span>
                  </div>
                  {selectedValuer.organization && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <Building2 className="w-3 h-3 text-zinc-500" />
                      <span className="font-mono text-[10px] text-zinc-400">{selectedValuer.organization}</span>
                    </div>
                  )}

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-800/30 p-2 border border-zinc-800">
                      <div className="font-mono text-[8px] text-zinc-500">TOTAL</div>
                      <div className="font-mono text-lg text-white">{selectedValuer.total_valuations}</div>
                      <div className="font-mono text-[8px] text-zinc-500">{selectedValuer.completed_valuations} completed</div>
                    </div>
                    <div className="bg-zinc-800/30 p-2 border border-zinc-800">
                      <div className="font-mono text-[8px] text-zinc-500">AVG CONFIDENCE</div>
                      <div className="font-mono text-lg text-white">
                        {(selectedValuer.avg_confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-zinc-800/30 p-2 border border-zinc-800">
                      <div className="font-mono text-[8px] text-zinc-500">AVG TURNAROUND</div>
                      <div className="font-mono text-lg text-white">
                        {selectedValuer.avg_turnaround_days > 0
                          ? `${selectedValuer.avg_turnaround_days.toFixed(1)}d`
                          : '—'}
                      </div>
                    </div>
                    <div className="bg-zinc-800/30 p-2 border border-zinc-800">
                      <div className="font-mono text-[8px] text-zinc-500">MEDIAN VALUE</div>
                      <div className="font-mono text-lg text-white">
                        {formatCurrency(selectedValuer.median_value)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            {/* Peer Percentiles */}
            {selectedValuer.peer_percentiles && !detailLoading && (
              <Panel title="PEER PERCENTILES">
                <div className="space-y-2">
                  <PercentileBar value={selectedValuer.peer_percentiles.volume_pctile} label="VOLUME" />
                  <PercentileBar value={selectedValuer.peer_percentiles.confidence_pctile} label="CONFIDENCE" />
                  <PercentileBar value={selectedValuer.peer_percentiles.speed_pctile} label="SPEED" />
                  <PercentileBar value={selectedValuer.peer_percentiles.value_pctile} label="VALUE" />
                </div>
              </Panel>
            )}

            {/* By Property Type */}
            {selectedValuer.by_property_type && selectedValuer.by_property_type.length > 0 && !detailLoading && (
              <Panel title="BY PROPERTY TYPE">
                <div className="space-y-1.5">
                  {selectedValuer.by_property_type
                    .sort((a, b) => b.count - a.count)
                    .map((pt) => (
                      <div key={pt.property_type} className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-zinc-400 w-24 truncate">
                          {formatLabel(pt.property_type)}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-300 w-8 text-right">{pt.count}</span>
                        <span className="font-mono text-[9px] text-zinc-500 w-16 text-right">
                          {formatCurrency(pt.avg_value)}
                        </span>
                        <ConfidenceBadge value={pt.avg_confidence} />
                      </div>
                    ))}
                </div>
              </Panel>
            )}

            {/* By Region */}
            {selectedValuer.by_region && selectedValuer.by_region.length > 0 && !detailLoading && (
              <Panel title="BY REGION">
                <div className="space-y-1.5">
                  {selectedValuer.by_region
                    .sort((a, b) => b.count - a.count)
                    .map((r) => {
                      const maxC = Math.max(...selectedValuer.by_region.map((x) => x.count), 1)
                      return (
                        <div key={r.region} className="flex items-center gap-2">
                          <span className="font-mono text-[9px] text-zinc-400 w-24 truncate">
                            {formatRegion(r.region)}
                          </span>
                          <div className="flex-1 h-2.5 bg-zinc-800 rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-amber-500/60 rounded-sm"
                              style={{ width: `${(r.count / maxC) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-[9px] text-zinc-300 w-6 text-right">{r.count}</span>
                        </div>
                      )
                    })}
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
