'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  ArrowLeft,
  RefreshCw,
  Home,
  Activity,
  TrendingUp,
  BarChart3,
  DollarSign,
  Percent,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface RentalSummary {
  region: string
  property_type: string
  avg_rent_monthly: number
  median_rent_monthly: number
  avg_rent_per_sqm: number
  rental_transaction_count: number
  gross_yield_pct: number
  vacancy_rate_pct: number
  rent_by_bedrooms: Record<string, number>
}

interface RentalYieldDetail {
  region: string
  property_type: string
  gross_yield: number
  net_yield: number
  cap_rate: number
  avg_property_value: number
  avg_annual_rent: number
  vacancy_rate: number
  rent_growth_rate: number
}

interface RentalTrend {
  period: string
  avg_rent: number
  median_rent: number
  count: number
}

interface RentalBenchmark {
  area_name: string
  property_type: string
  listing_count: number
  avg_rent_monthly: number
  median_rent_monthly: number
  avg_rent_per_sqm: number
  vacancy_rate_estimate: number | null
  rent_by_bedrooms: Record<string, number>
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/market'

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
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
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

function formatPropertyType(pt: string): string {
  return pt
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function RentalAnalyticsPage() {
  const [summary, setSummary] = useState<RentalSummary[]>([])
  const [yields, setYields] = useState<RentalYieldDetail[]>([])
  const [trends, setTrends] = useState<RentalTrend[]>([])
  const [benchmarks, setBenchmarks] = useState<RentalBenchmark[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [sumData, yieldData, trendData, benchData] = await Promise.all([
      fetchData<RentalSummary[]>('/rental/summary'),
      fetchData<RentalYieldDetail[]>('/rental/yields'),
      fetchData<RentalTrend[]>('/rental/trends?months=12'),
      fetchData<RentalBenchmark[]>('/rental/benchmarks'),
    ])
    setSummary(sumData || [])
    setYields(yieldData || [])
    setTrends(trendData || [])
    setBenchmarks(benchData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Aggregate KPIs
  const totalRentals = summary.reduce((s, r) => s + r.rental_transaction_count, 0)
  const avgRent =
    summary.length > 0
      ? summary.reduce((s, r) => s + r.avg_rent_monthly, 0) / summary.length
      : 0
  const avgYield =
    yields.length > 0
      ? yields.reduce((s, y) => s + y.gross_yield, 0) / yields.length
      : 0
  const avgVacancy =
    yields.length > 0
      ? yields.reduce((s, y) => s + y.vacancy_rate, 0) / yields.length
      : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-72" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-zinc-800/50 rounded border border-zinc-800" />
            ))}
          </div>
          <div className="h-64 bg-zinc-800/50 rounded border border-zinc-800" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/analytics"
            className="flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-zinc-500 hover:text-amber-500 border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> MARKET
          </Link>
          <div>
            <h1 className="font-mono text-xl text-white">RENTAL ANALYTICS</h1>
            <p className="font-mono text-[10px] text-zinc-500">
              Rental Yields, Benchmarks & Market Trends
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-zinc-400 hover:text-amber-500 border border-zinc-800 hover:border-zinc-700 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Panel title="TOTAL RENTALS">
          <div className="text-center">
            <Home className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className="font-mono text-2xl text-white">
              {totalRentals > 0 ? totalRentals.toLocaleString() : '—'}
            </div>
            <div className="font-mono text-[10px] text-zinc-500 mt-1">TRANSACTIONS</div>
          </div>
        </Panel>
        <Panel title="AVG RENT / MONTH">
          <div className="text-center">
            <DollarSign className="w-4 h-4 mx-auto mb-1 text-green-400" />
            <div className="font-mono text-2xl text-green-400">
              {avgRent > 0 ? formatCurrency(avgRent) : '—'}
            </div>
            <div className="font-mono text-[10px] text-zinc-500 mt-1">ALL TYPES</div>
          </div>
        </Panel>
        <Panel title="AVG GROSS YIELD">
          <div className="text-center">
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-amber-400" />
            <div className="font-mono text-2xl text-amber-400">
              {avgYield > 0 ? `${avgYield.toFixed(2)}%` : '—'}
            </div>
            <div className="font-mono text-[10px] text-zinc-500 mt-1">ANNUAL</div>
          </div>
        </Panel>
        <Panel title="AVG VACANCY">
          <div className="text-center">
            <Percent className="w-4 h-4 mx-auto mb-1 text-blue-400" />
            <div className="font-mono text-2xl text-blue-400">
              {avgVacancy > 0 ? `${(avgVacancy * 100).toFixed(1)}%` : '—'}
            </div>
            <div className="font-mono text-[10px] text-zinc-500 mt-1">ESTIMATED</div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* Rental Summary Table */}
        <Panel title="RENTAL MARKET SUMMARY" className="col-span-12">
          {summary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                    <th className="text-left pb-2">REGION</th>
                    <th className="text-left pb-2">TYPE</th>
                    <th className="text-right pb-2">AVG RENT</th>
                    <th className="text-right pb-2">MEDIAN</th>
                    <th className="text-right pb-2">₵/SQM</th>
                    <th className="text-right pb-2">TXNS</th>
                    <th className="text-right pb-2">YIELD</th>
                    <th className="text-right pb-2">VACANCY</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {summary.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1.5 text-white">{formatRegion(r.region)}</td>
                      <td className="py-1.5 text-zinc-400">{formatPropertyType(r.property_type)}</td>
                      <td className="py-1.5 text-right text-green-400">
                        {r.avg_rent_monthly > 0 ? formatCurrency(r.avg_rent_monthly) : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-300">
                        {r.median_rent_monthly > 0 ? formatCurrency(r.median_rent_monthly) : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-400">
                        {r.avg_rent_per_sqm > 0 ? `GH₵${r.avg_rent_per_sqm.toFixed(0)}` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-300">{r.rental_transaction_count}</td>
                      <td className="py-1.5 text-right text-amber-400">
                        {r.gross_yield_pct > 0 ? `${r.gross_yield_pct.toFixed(2)}%` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-400">
                        {r.vacancy_rate_pct > 0 ? `${(r.vacancy_rate_pct * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-5 h-5 mx-auto mb-2 text-zinc-600" />
              <div className="font-mono text-xs text-zinc-500">No rental data available</div>
            </div>
          )}
        </Panel>

        {/* Yield Analysis */}
        {yields.length > 0 && (
          <Panel title="YIELD ANALYSIS BY REGION" className="col-span-7">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                    <th className="text-left pb-2">REGION</th>
                    <th className="text-left pb-2">TYPE</th>
                    <th className="text-right pb-2">GROSS</th>
                    <th className="text-right pb-2">NET</th>
                    <th className="text-right pb-2">CAP</th>
                    <th className="text-right pb-2">GROWTH</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {yields.map((y, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1.5 text-white">{formatRegion(y.region)}</td>
                      <td className="py-1.5 text-zinc-400">{formatPropertyType(y.property_type)}</td>
                      <td className="py-1.5 text-right text-green-400">
                        {y.gross_yield > 0 ? `${y.gross_yield.toFixed(2)}%` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-300">
                        {y.net_yield > 0 ? `${y.net_yield.toFixed(2)}%` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-amber-400">
                        {y.cap_rate > 0 ? `${y.cap_rate.toFixed(2)}%` : '—'}
                      </td>
                      <td className={cn(
                        'py-1.5 text-right',
                        y.rent_growth_rate >= 0 ? 'text-green-400' : 'text-red-400'
                      )}>
                        {y.rent_growth_rate !== 0
                          ? `${y.rent_growth_rate >= 0 ? '+' : ''}${y.rent_growth_rate.toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* Rental Trends */}
        {trends.length > 0 && (
          <Panel title="RENTAL PRICE TREND (12 MO)" className={yields.length > 0 ? 'col-span-5' : 'col-span-12'}>
            <div className="grid grid-cols-12 gap-1">
              {trends.map((t, i) => (
                <div key={i} className="text-center">
                  <div className="font-mono text-[8px] text-zinc-600 mb-1">{t.period.slice(5)}</div>
                  <div className="h-16 bg-zinc-800/50 relative flex items-end justify-center">
                    <div
                      className="w-full bg-green-500/60 rounded-sm"
                      style={{
                        height: `${Math.max(
                          (t.avg_rent / Math.max(...trends.map((tr) => tr.avg_rent), 1)) * 100,
                          4
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="font-mono text-[8px] text-zinc-500 mt-0.5">{t.count}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Benchmarks */}
        {benchmarks.length > 0 && (
          <Panel title="RENTAL BENCHMARKS" className="col-span-12">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                    <th className="text-left pb-2">AREA</th>
                    <th className="text-left pb-2">TYPE</th>
                    <th className="text-right pb-2">LISTINGS</th>
                    <th className="text-right pb-2">AVG RENT</th>
                    <th className="text-right pb-2">MEDIAN</th>
                    <th className="text-right pb-2">₵/SQM</th>
                    <th className="text-right pb-2">VACANCY</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {benchmarks.map((b, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1.5 text-white">{formatRegion(b.area_name)}</td>
                      <td className="py-1.5 text-zinc-400">{formatPropertyType(b.property_type)}</td>
                      <td className="py-1.5 text-right text-zinc-300">{b.listing_count}</td>
                      <td className="py-1.5 text-right text-green-400">
                        {b.avg_rent_monthly > 0 ? formatCurrency(b.avg_rent_monthly) : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-300">
                        {b.median_rent_monthly > 0 ? formatCurrency(b.median_rent_monthly) : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-400">
                        {b.avg_rent_per_sqm > 0 ? `GH₵${b.avg_rent_per_sqm.toFixed(0)}` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-zinc-400">
                        {b.vacancy_rate_estimate != null ? `${(b.vacancy_rate_estimate * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
