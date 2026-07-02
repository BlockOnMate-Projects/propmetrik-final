'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import Link from 'next/link'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Home,
  RefreshCw,
  ChevronRight,
  DollarSign,
  Layers,
  Thermometer,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface PriceIndexEntry {
  region: string
  property_type: string
  index_value: number | null
  real_index: number | null
  change_yoy: number | null
  median_price: number
  avg_price: number
  transaction_count: number
  // GSS macro overlay (Slice 1) — national context, repeated per row
  mieg_growth_yoy?: number | null
  gdp_growth_context?: string | null
  interest_rate_cycle?: string | null
}

interface PriceIndexHistory {
  period: string
  index_value: number
  change_mom: number
  change_yoy: number
  median_price: number
  transaction_count: number
}

interface MarketActivitySummary {
  region: string
  property_type: string | null
  transaction_count: number
  transaction_value: number
  avg_transaction_value: number
  median_transaction_value: number
  new_listings: number
  active_listings: number
  avg_days_on_market: number
  absorption_rate: number
  inventory_months: number
  avg_discount_pct: number
}

interface SupplyDemandMetrics {
  region: string
  total_supply: number
  new_listings_30d: number
  sold_30d: number
  absorption_rate: number
  inventory_months: number
  avg_days_on_market: number
  market_temperature: string
}

interface PriceDistBucket {
  bucket: string
  count: number
  pct: number
}

interface RecentTransaction {
  id: string
  location: string
  region: string
  property_type: string
  final_price: number
  price_per_sqm: number | null
  transaction_date: string
  transaction_type: string
  bedrooms: number | null
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/market'

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

function MiniBarChart({ data, height = 20 }: { data: number[]; height?: number }) {
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

function temperatureColor(temp: string): string {
  switch (temp) {
    case 'hot':
      return 'text-red-600 dark:text-red-400'
    case 'warm':
      return 'text-amber-600 dark:text-amber-400'
    case 'balanced':
      return 'text-green-600 dark:text-green-400'
    case 'cool':
      return 'text-blue-600 dark:text-blue-400'
    case 'cold':
      return 'text-cyan-600 dark:text-cyan-400'
    default:
      return 'text-muted-foreground'
  }
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function MarketAnalyticsPage() {
  const [priceIndex, setPriceIndex] = useState<PriceIndexEntry[]>([])
  const [priceHistory, setPriceHistory] = useState<PriceIndexHistory[]>([])
  const [activity, setActivity] = useState<MarketActivitySummary[]>([])
  const [supplyDemand, setSupplyDemand] = useState<SupplyDemandMetrics[]>([])
  const [distribution, setDistribution] = useState<PriceDistBucket[]>([])
  const [transactions, setTransactions] = useState<RecentTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [indexData, historyData, activityData, sdData, distData, txnData] = await Promise.all([
      fetchData<PriceIndexEntry[]>('/price-index', signal),
      fetchData<PriceIndexHistory[]>('/price-index/history?months=12', signal),
      fetchData<MarketActivitySummary[]>('/activity/summary', signal),
      fetchData<SupplyDemandMetrics[]>('/supply-demand', signal),
      fetchData<PriceDistBucket[]>('/price-distribution', signal),
      fetchData<RecentTransaction[]>('/recent-transactions?limit=8', signal),
    ])
    if (signal?.aborted) return
    setPriceIndex(indexData || [])
    setPriceHistory(historyData || [])
    setActivity(activityData || [])
    setSupplyDemand(sdData || [])
    setDistribution(distData || [])
    setTransactions(txnData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    loadData(ac.signal)
    return () => ac.abort()
  }, [loadData])

  // Aggregated KPIs
  const totalTxns = activity.reduce((s, a) => s + a.transaction_count, 0)
  const totalValue = activity.reduce((s, a) => s + a.transaction_value, 0)
  const avgPrice = totalTxns > 0 ? totalValue / totalTxns : 0
  const totalActive = activity.reduce((s, a) => s + a.active_listings, 0)
  const totalNew = activity.reduce((s, a) => s + a.new_listings, 0)
  // Average only over regions that have a real YoY (null = insufficient price history, excluded).
  const yoyValues = priceIndex.map((p) => p.change_yoy).filter((v): v is number => v != null)
  const avgYoY = yoyValues.length > 0
    ? yoyValues.reduce((s, v) => s + v, 0) / yoyValues.length
    : null

  // Determine market status from supply/demand
  const topTemp = supplyDemand.length > 0 ? supplyDemand[0].market_temperature : 'balanced'

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-72" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-muted/50 rounded border border-border" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 h-64 bg-muted/50 rounded border border-border" />
            <div className="md:col-span-4 h-64 bg-muted/50 rounded border border-border" />
            <div className="md:col-span-6 h-48 bg-muted/50 rounded border border-border" />
            <div className="md:col-span-6 h-48 bg-muted/50 rounded border border-border" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-mono text-lg sm:text-xl text-foreground">MARKET ANALYTICS</h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Real Estate Market Intelligence & Price Indices
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => loadData()}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-amber-500 border border-border hover:border-border transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> REFRESH
          </button>
          <Link
            href="/dashboard/analytics/market/investments"
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-amber-500 border border-amber-500/30 hover:bg-amber-500/10 transition-colors"
          >
            <TrendingUp className="w-3 h-3" /> INVESTMENT FINDER <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Market Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Panel title="AVG PRICE">
          <div className="text-center">
            <DollarSign className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className="font-mono text-2xl text-foreground">
              {avgPrice > 0 ? formatCurrency(avgPrice) : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">ALL REGIONS</div>
          </div>
        </Panel>
        <Panel title="YoY GROWTH">
          <div className="text-center">
            {avgYoY == null ? (
              <Activity className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            ) : avgYoY >= 0 ? (
              <ArrowUpRight className="w-4 h-4 mx-auto mb-1 text-green-600 dark:text-green-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 mx-auto mb-1 text-red-600 dark:text-red-400" />
            )}
            <div className={cn('font-mono text-2xl', avgYoY == null ? 'text-muted-foreground' : avgYoY >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
              {avgYoY == null ? '—' : `${avgYoY >= 0 ? '+' : ''}${avgYoY.toFixed(1)}%`}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              {avgYoY == null ? 'INSUFFICIENT HISTORY' : 'YEAR OVER YEAR'}
            </div>
          </div>
        </Panel>
        <Panel title="MONTHLY VOLUME">
          <div className="text-center">
            <BarChart3 className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className="font-mono text-2xl text-foreground">
              {totalTxns > 0 ? totalTxns.toLocaleString() : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">TRANSACTIONS</div>
          </div>
        </Panel>
        <Panel title="ACTIVE LISTINGS">
          <div className="text-center">
            <Layers className="w-4 h-4 mx-auto mb-1 text-amber-600 dark:text-amber-400" />
            <div className="font-mono text-2xl text-amber-600 dark:text-amber-400">
              {totalActive > 0 ? totalActive.toLocaleString() : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">ON MARKET</div>
          </div>
        </Panel>
        <Panel title="NEW LISTINGS">
          <div className="text-center">
            <Home className="w-4 h-4 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
            <div className="font-mono text-2xl text-blue-600 dark:text-blue-400">
              {totalNew > 0 ? totalNew.toLocaleString() : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">THIS PERIOD</div>
          </div>
        </Panel>
        <Panel title="MARKET STATUS">
          <div className="text-center">
            <Thermometer className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className={cn('font-mono text-lg', temperatureColor(topTemp))}>
              {topTemp.toUpperCase()}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              {supplyDemand.length > 0
                ? `${supplyDemand[0].inventory_months.toFixed(1)} MO. SUPPLY`
                : 'LOADING'}
            </div>
          </div>
        </Panel>
      </div>

      {/* GSS macro context bar (Slice 1) */}
      {(() => {
        const macro = priceIndex.find((p) => p.mieg_growth_yoy != null || p.gdp_growth_context || p.interest_rate_cycle)
        if (!macro) return null
        const creditSensitive = (macro.interest_rate_cycle || '').toLowerCase().includes('tighten')
        return (
          <div className={cn(
            'flex flex-wrap items-center gap-3 mb-4 px-3 py-2 border font-mono text-[10px]',
            creditSensitive ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/30',
          )}>
            {creditSensitive && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            {macro.mieg_growth_yoy != null && (
              <span className="text-muted-foreground">MIEG (economic activity) YoY <span className="text-foreground">{macro.mieg_growth_yoy >= 0 ? '+' : ''}{macro.mieg_growth_yoy.toFixed(1)}%</span></span>
            )}
            {macro.gdp_growth_context && (
              <span className="text-muted-foreground">GDP <span className="text-foreground">{macro.gdp_growth_context}</span></span>
            )}
            {macro.interest_rate_cycle && (
              <span className="text-muted-foreground">Rate cycle <span className={cn(creditSensitive ? 'text-amber-600 dark:text-amber-400' : 'text-foreground', 'uppercase')}>{macro.interest_rate_cycle}</span></span>
            )}
            <span className="text-muted-foreground/60">Source: GSS StatsBank MIEG/GDP + interest rates</span>
          </div>
        )
      })()}

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Price Index Table */}
        <Panel title="AREA PRICE INDEX" className="md:col-span-8">
          {priceIndex.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                  <th className="text-left pb-2">REGION</th>
                  <th className="text-left pb-2">TYPE</th>
                  <th className="text-right pb-2">AVG PRICE</th>
                  <th className="text-right pb-2">MEDIAN</th>
                  <th className="text-right pb-2">YoY</th>
                  <th className="text-right pb-2" title="CPI-deflated real price index">REAL IDX</th>
                  <th className="text-right pb-2">VOLUME</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {priceIndex.map((item, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                    <td className="py-2 text-foreground">{formatRegion(item.region)}</td>
                    <td className="py-2 text-muted-foreground">{formatPropertyType(item.property_type)}</td>
                    <td className="py-2 text-right text-green-600 dark:text-green-400">{formatCurrency(item.avg_price)}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatCurrency(item.median_price)}</td>
                    <td className={cn('py-2 text-right', item.change_yoy == null ? 'text-muted-foreground' : item.change_yoy >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                      {item.change_yoy == null ? '—' : `${item.change_yoy >= 0 ? '+' : ''}${item.change_yoy.toFixed(1)}%`}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {item.real_index == null ? '—' : item.real_index.toFixed(1)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{item.transaction_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <div className="font-mono text-xs text-muted-foreground">No price index data available</div>
              <div className="font-mono text-[10px] text-muted-foreground mt-1">
                Data aggregates from property transactions
              </div>
            </div>
          )}
        </Panel>

        {/* Recent Transactions */}
        <Panel title="RECENT TRANSACTIONS" className="md:col-span-4">
          {transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((txn) => (
                <div key={txn.id} className="p-2 border border-border/50 hover:border-border">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-mono text-xs text-foreground">{txn.location}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {formatPropertyType(txn.property_type)}
                        {txn.bedrooms ? ` · ${txn.bedrooms} BR` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs text-green-600 dark:text-green-400">{formatCurrency(txn.final_price)}</div>
                      {txn.price_per_sqm && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          GH₵{txn.price_per_sqm.toLocaleString()}/sqm
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-mono text-[10px] text-muted-foreground">{txn.transaction_date}</span>
                    <span className="font-mono text-[9px] text-amber-500/70 uppercase">{txn.transaction_type}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <div className="font-mono text-xs text-muted-foreground">No recent transactions</div>
            </div>
          )}
        </Panel>

        {/* Supply / Demand by Region */}
        <Panel title="SUPPLY & DEMAND BY REGION" className="md:col-span-6">
          {supplyDemand.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                  <th className="text-left pb-2">REGION</th>
                  <th className="text-right pb-2">SUPPLY</th>
                  <th className="text-right pb-2">SOLD 30D</th>
                  <th className="text-right pb-2">INV. MO.</th>
                  <th className="text-right pb-2">DOM</th>
                  <th className="text-right pb-2">TEMP</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {supplyDemand.map((sd, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                    <td className="py-1.5 text-foreground">{formatRegion(sd.region)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{sd.total_supply}</td>
                    <td className="py-1.5 text-right text-green-600 dark:text-green-400">{sd.sold_30d}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{sd.inventory_months.toFixed(1)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{sd.avg_days_on_market.toFixed(0)}d</td>
                    <td className={cn('py-1.5 text-right font-bold', temperatureColor(sd.market_temperature))}>
                      {sd.market_temperature.toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <div className="font-mono text-xs text-muted-foreground">No supply/demand data available</div>
            </div>
          )}
        </Panel>

        {/* Price Distribution */}
        <Panel title="PRICE DISTRIBUTION" className="md:col-span-6">
          {distribution.length > 0 ? (
            <div className="space-y-2">
              {distribution.map((b) => (
                <div key={b.bucket} className="flex items-center gap-3">
                  <div className="w-28 font-mono text-[10px] text-muted-foreground truncate">{b.bucket}</div>
                  <div className="flex-1 h-4 bg-muted relative">
                    <div
                      className="h-full bg-amber-500/80"
                      style={{ width: `${Math.min(b.pct, 100)}%` }}
                    />
                  </div>
                  <div className="w-16 text-right font-mono text-xs text-foreground">
                    {b.pct}% ({b.count})
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <div className="font-mono text-xs text-muted-foreground">No distribution data yet</div>
            </div>
          )}
        </Panel>

        {/* Price Index History (sparkline) */}
        {priceHistory.length > 0 && (
          <Panel title="PRICE INDEX TREND (12 MO)" className="md:col-span-12">
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2">
              {priceHistory.map((h, i) => (
                <div key={i} className="text-center">
                  <div className="font-mono text-[9px] text-muted-foreground mb-1">
                    {h.period.slice(5)}
                  </div>
                  <div className="h-16 bg-muted/50 relative flex items-end justify-center px-0.5">
                    <div
                      className="w-full bg-amber-500/70 rounded-sm"
                      style={{
                        height: `${Math.max(
                          (h.median_price /
                            Math.max(...priceHistory.map((p) => p.median_price), 1)) *
                            100,
                          4
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground mt-1">
                    {h.transaction_count}
                  </div>
                  {h.change_mom !== 0 && (
                    <div
                      className={cn(
                        'font-mono text-[8px]',
                        h.change_mom >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {h.change_mom >= 0 ? '+' : ''}
                      {h.change_mom.toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Market Activity Table */}
        {activity.length > 0 && (
          <Panel title="MARKET ACTIVITY BY REGION" className="md:col-span-12">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                    <th className="text-left pb-2">REGION</th>
                    <th className="text-left pb-2">TYPE</th>
                    <th className="text-right pb-2">TXNS</th>
                    <th className="text-right pb-2">TOTAL VALUE</th>
                    <th className="text-right pb-2">AVG PRICE</th>
                    <th className="text-right pb-2">ACTIVE</th>
                    <th className="text-right pb-2">NEW</th>
                    <th className="text-right pb-2">AVG DOM</th>
                    <th className="text-right pb-2">DISCOUNT</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {activity.map((a, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                      <td className="py-1.5 text-foreground">{formatRegion(a.region)}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {a.property_type ? formatPropertyType(a.property_type) : 'All'}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">{a.transaction_count}</td>
                      <td className="py-1.5 text-right text-green-600 dark:text-green-400">{formatCurrency(a.transaction_value)}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{formatCurrency(a.avg_transaction_value)}</td>
                      <td className="py-1.5 text-right text-amber-600 dark:text-amber-400">{a.active_listings}</td>
                      <td className="py-1.5 text-right text-blue-600 dark:text-blue-400">{a.new_listings}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{a.avg_days_on_market.toFixed(0)}d</td>
                      <td className={cn(
                        'py-1.5 text-right',
                        a.avg_discount_pct > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                      )}>
                        {a.avg_discount_pct > 0 ? `-${a.avg_discount_pct.toFixed(1)}%` : '—'}
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
