'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  RefreshCw,
  Home,
  MapPin,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Percent,
  ChevronDown,
  Star,
  Bed,
} from 'lucide-react'

// =====================================================
// HELPERS
// =====================================================

/** Safely coerce any value (string from PG, null, undefined) to a number */
function num(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// =====================================================
// TYPES
// =====================================================

interface ShortStayMetric {
  platform: string
  neighborhood: string
  city: string
  property_type: string
  metric_month: string
  total_listings: number
  booked_nights: number
  total_nights: number
  occupancy_rate: number
  adr_usd: number
  revpar_usd: number
  min_price_usd: number
  max_price_usd: number
  median_price_usd: number
}

interface NeighborhoodBenchmark {
  neighborhood: string
  avg_occupancy_rate: number
  avg_adr_usd: number
  avg_revpar_usd: number
  total_active_listings: number
  data_freshness?: string
  investment_grade?: string
}

interface OccupancyTrend {
  month: string
  metric_month?: string
  occupancy_rate: number
  adr_usd: number
  revpar_usd?: number
}

interface InvestmentOpportunity {
  neighborhood: string
  avg_revpar_usd: number
  active_listings: number
  opportunity_score?: number
  investment_grade?: string
  avg_occupancy_rate?: number
  avg_adr_usd?: number
}

interface TourismContext {
  region: string | null
  tourism_demand_type: 'business' | 'leisure' | 'mixed' | null
  domestic_overnight_visitors: number | null
  visitor_share_pct: number | null
  mieg_services_yoy: number | null
  revpar_mieg_correlation: number | null
  correlation_months: number
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/short-stay'

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

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
  color = 'text-foreground',
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
        <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className={cn('font-mono text-2xl', color)}>{value}</div>
      {subtext && <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{subtext}</div>}
    </div>
  )
}

function GradeBadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    high: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20',
    medium: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    low: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
  }
  return (
    <span className={cn(
      'px-1.5 py-0.5 font-mono text-[9px] border rounded',
      colors[grade.toLowerCase()] || 'text-muted-foreground border-border'
    )}>
      {grade.toUpperCase()}
    </span>
  )
}

function MiniSparkline({ data, height = 32, color = '#f59e0b' }: { data: number[]; height?: number; color?: string }) {
  if (data.length < 2) return null
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

function OccupancyBar({ rate }: { rate: number }) {
  const clamped = Math.min(Math.max(rate, 0), 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
        <div
          className={cn(
            'h-full rounded',
            clamped >= 70 ? 'bg-green-500/80' : clamped >= 40 ? 'bg-amber-500/80' : 'bg-red-500/80'
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground w-10 text-right">{clamped.toFixed(0)}%</span>
    </div>
  )
}

/** Tourism-demand-type pill (Slice 4): business=navy, leisure=green, mixed=amber. */
function TourismTypeBadge({ type }: { type: 'business' | 'leisure' | 'mixed' }) {
  const style = {
    business: 'text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/30',
    leisure: 'text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/30',
    mixed: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  }[type]
  return (
    <span className={cn('px-1.5 py-0.5 font-mono text-[9px] border rounded uppercase tracking-wider', style)}>
      {type}-driven
    </span>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function ShortStayAnalyticsPage() {
  const [metrics, setMetrics] = useState<ShortStayMetric[]>([])
  const [benchmarks, setBenchmarks] = useState<NeighborhoodBenchmark[]>([])
  const [trends, setTrends] = useState<OccupancyTrend[]>([])
  const [opportunities, setOpportunities] = useState<InvestmentOpportunity[]>([])
  const [tourism, setTourism] = useState<TourismContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCity, setSelectedCity] = useState('Accra')
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('Osu')
  const [showCityDropdown, setShowCityDropdown] = useState(false)

  const cities = ['Accra', 'Kumasi', 'Takoradi', 'Cape Coast', 'Tamale']
  const neighborhoods = ['Osu', 'Cantonments', 'East Legon', 'Airport Residential', 'Labone', 'Ridge', 'Roman Ridge']

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [rawMetrics, rawBench, rawTrend, rawOppo, tourismData] = await Promise.all([
      fetchData<any[]>(`/metrics?city=${selectedCity}&limit=24`, signal),
      fetchData<any[]>(`/benchmarks?city=${selectedCity}`, signal),
      fetchData<any[]>(`/trends/${encodeURIComponent(selectedNeighborhood)}?months=12`, signal),
      fetchData<any[]>(`/investment-opportunities?city=${selectedCity}`, signal),
      fetchData<TourismContext>(`/tourism-context?city=${selectedCity}`, signal),
    ])
    if (signal?.aborted) return

    // The API returns avg_daily_rate / avg_revpar / avg_occupancy_rate (0–1 fraction) /
    // listing_count; normalise to the shape this page renders (adr_usd / revpar_usd /
    // occupancy_rate as a 0–100 percent / total_listings). Without this the fields read
    // undefined → 0 everywhere.
    const pct = (v: any) => num(v) * 100
    const metricsData: ShortStayMetric[] = (rawMetrics || []).map((m: any) => ({
      platform: m.platform,
      neighborhood: m.neighborhood,
      city: m.city,
      property_type: m.property_type,
      metric_month: m.month ?? m.metric_month,
      total_listings: num(m.listing_count ?? m.total_listings),
      booked_nights: num(m.booked_nights),
      total_nights: num(m.total_nights),
      occupancy_rate: pct(m.avg_occupancy_rate ?? m.occupancy_rate),
      adr_usd: num(m.avg_daily_rate ?? m.adr_usd),
      revpar_usd: num(m.avg_revpar ?? m.revpar_usd),
      min_price_usd: num(m.min_price_usd),
      max_price_usd: num(m.max_price_usd),
      median_price_usd: num(m.median_price_usd),
    }))
    const benchmarkData: NeighborhoodBenchmark[] = (rawBench || []).map((b: any) => ({
      neighborhood: b.neighborhood,
      avg_occupancy_rate: pct(b.avg_occupancy_rate),
      avg_adr_usd: num(b.avg_daily_rate ?? b.avg_adr_usd),
      avg_revpar_usd: num(b.avg_revpar ?? b.avg_revpar_usd),
      total_active_listings: num(b.listing_count ?? b.total_active_listings),
    }))
    const trendData: OccupancyTrend[] = (rawTrend || []).map((t: any) => ({
      month: t.month ?? t.metric_month,
      occupancy_rate: pct(t.avg_occupancy_rate ?? t.occupancy_rate),
      adr_usd: num(t.avg_daily_rate ?? t.adr_usd),
      revpar_usd: num(t.avg_revpar ?? t.revpar_usd),
    })).reverse() // API returns DESC; chart wants chronological
    const oppoData: InvestmentOpportunity[] = (rawOppo || []).map((o: any) => ({
      neighborhood: o.neighborhood,
      avg_revpar_usd: num(o.avg_revpar ?? o.avg_revpar_usd),
      active_listings: num(o.listing_count ?? o.active_listings),
      avg_occupancy_rate: pct(o.avg_occupancy_rate),
      avg_adr_usd: num(o.avg_daily_rate ?? o.avg_adr_usd),
      investment_grade: o.investment_grade,
    }))

    setMetrics(metricsData)
    setBenchmarks(benchmarkData)
    setTrends(trendData)
    setOpportunities(oppoData)
    setTourism(tourismData || null)
    setLoading(false)
  }, [selectedCity, selectedNeighborhood])

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
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-muted/50 rounded border border-border" />
            ))}
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8 h-64 bg-muted/50 rounded border border-border" />
            <div className="col-span-4 h-64 bg-muted/50 rounded border border-border" />
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6 h-72 bg-muted/50 rounded border border-border" />
            <div className="col-span-6 h-72 bg-muted/50 rounded border border-border" />
          </div>
        </div>
      </div>
    )
  }

  // Compute aggregate KPIs. Price metrics (ADR/RevPAR/median) average only over
  // months that actually have priced nights (adr > 0) — including empty months as
  // $0 would wrongly crush the headline rate. Occupancy averages all months.
  const latestMetrics = metrics.length > 0 ? metrics : []
  const mean = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0)
  const pricedRevpar = latestMetrics.map(m => num(m.revpar_usd)).filter(v => v > 0)
  const pricedAdr = latestMetrics.map(m => num(m.adr_usd)).filter(v => v > 0)
  const pricedMedian = latestMetrics.map(m => num(m.median_price_usd)).filter(v => v > 0)
  const avgRevpar = mean(pricedRevpar)
  const avgAdr = mean(pricedAdr)
  const avgOccupancy = mean(latestMetrics.map(m => num(m.occupancy_rate)))
  // Total active listings = max distinct listings observed in any month (not a sum
  // across months, which would multiply-count the same listings).
  const totalListings = latestMetrics.reduce((mx, m) => Math.max(mx, num(m.total_listings)), 0)
  const avgMedianPrice = mean(pricedMedian)

  const occupancyTrendPoints = trends.map(t => num(t.occupancy_rate))
  const adrTrendPoints = trends.map(t => num(t.adr_usd))

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-500" />
            SHORT-STAY & TOURISM ANALYTICS
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            RevPAR · ADR · Occupancy · Investment Arbitrage — AirDNA-style Insights — Section 9.2
          </p>
          {tourism?.tourism_demand_type && (
            <div className="mt-1.5 flex items-center gap-2">
              <TourismTypeBadge type={tourism.tourism_demand_type} />
              {tourism.visitor_share_pct !== null && (
                <span className="font-mono text-[9px] text-muted-foreground">
                  {tourism.visitor_share_pct.toFixed(1)}% of national domestic overnight tourism
                  {tourism.domestic_overnight_visitors !== null &&
                    ` (${(tourism.domestic_overnight_visitors / 1e6).toFixed(2)}M visitors, GLSS7)`}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* City Selector */}
          <div className="relative">
            <button
              onClick={() => setShowCityDropdown(!showCityDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 transition-colors"
            >
              <MapPin className="w-3 h-3 text-amber-500" />
              {selectedCity.toUpperCase()}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showCityDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border shadow-lg">
                {cities.map(city => (
                  <button
                    key={city}
                    onClick={() => { setSelectedCity(city); setShowCityDropdown(false) }}
                    className={cn(
                      'block w-full text-left px-3 py-1.5 font-mono text-[10px] transition-colors',
                      city === selectedCity ? 'text-amber-500 bg-muted' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {city.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
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
      <div className="grid grid-cols-5 gap-3 mb-4">
        <Panel title="RevPAR">
          <MetricCard
            label="REV PER ROOM"
            value={avgRevpar > 0 ? `$${avgRevpar.toFixed(0)}` : '—'}
            subtext="USD / AVAILABLE NIGHT"
            icon={DollarSign}
            color="text-green-600 dark:text-green-400"
          />
        </Panel>

        <Panel title="ADR">
          <MetricCard
            label="AVG DAILY RATE"
            value={avgAdr > 0 ? `$${avgAdr.toFixed(0)}` : '—'}
            subtext={avgMedianPrice > 0 ? `MEDIAN: $${avgMedianPrice.toFixed(0)}` : undefined}
            icon={BarChart3}
            color="text-blue-600 dark:text-blue-400"
          />
        </Panel>

        <Panel title="OCCUPANCY">
          <MetricCard
            label="AVG OCCUPANCY"
            value={avgOccupancy > 0 ? `${avgOccupancy.toFixed(1)}%` : '—'}
            subtext="ACROSS ALL NEIGHBORHOODS"
            icon={Percent}
            color="text-amber-600 dark:text-amber-400"
          />
        </Panel>

        <Panel title="LISTINGS">
          <MetricCard
            label="TOTAL ACTIVE"
            value={totalListings > 0 ? totalListings.toLocaleString() : '—'}
            subtext={`IN ${selectedCity.toUpperCase()}`}
            icon={Home}
            color="text-purple-600 dark:text-purple-400"
          />
        </Panel>

        <Panel title="PRICE RANGE">
          <MetricCard
            label="MIN — MAX"
            value={(() => {
              const mins = latestMetrics.map(m => num(m.min_price_usd)).filter(v => v > 0)
              const maxs = latestMetrics.map(m => num(m.max_price_usd)).filter(v => v > 0)
              return mins.length && maxs.length ? `$${Math.min(...mins)}–$${Math.max(...maxs)}` : '—'
            })()}
            subtext="USD / NIGHT"
            icon={Activity}
            color="text-cyan-600 dark:text-cyan-400"
          />
        </Panel>
      </div>

      {/* Neighborhood Benchmarks + Trends */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Benchmark Table */}
        <Panel title="NEIGHBORHOOD BENCHMARKS" className="col-span-7">
          {benchmarks.length > 0 ? (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">NEIGHBORHOOD</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">OCCUPANCY</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">ADR</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">RevPAR</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">LISTINGS</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-center py-1.5 px-2">GRADE</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((b, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer',
                        b.neighborhood === selectedNeighborhood && 'bg-muted/30'
                      )}
                      onClick={() => setSelectedNeighborhood(b.neighborhood)}
                    >
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        <div className="flex items-center gap-1.5">
                          {b.neighborhood === selectedNeighborhood && (
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                          )}
                          {b.neighborhood}
                        </div>
                      </td>
                      <td className="py-1.5 px-2">
                        <OccupancyBar rate={num(b.avg_occupancy_rate)} />
                      </td>
                      <td className="font-mono text-[10px] text-foreground text-right py-1.5 px-2">
                        ${num(b.avg_adr_usd).toFixed(0)}
                      </td>
                      <td className="font-mono text-[10px] text-green-600 dark:text-green-400 text-right py-1.5 px-2">
                        ${num(b.avg_revpar_usd).toFixed(0)}
                      </td>
                      <td className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">
                        {b.total_active_listings ?? '—'}
                      </td>
                      <td className="text-center py-1.5 px-2">
                        {b.investment_grade ? (
                          <GradeBadge grade={b.investment_grade} />
                        ) : (
                          <span className="font-mono text-[9px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-8">
              No benchmark data for {selectedCity}
            </div>
          )}
        </Panel>

        {/* Occupancy Trend Chart */}
        <Panel
          title={`TRENDS: ${selectedNeighborhood.toUpperCase()}`}
          className="col-span-5"
          actions={
            <div className="flex gap-1">
              {neighborhoods.slice(0, 4).map(n => (
                <button
                  key={n}
                  onClick={() => setSelectedNeighborhood(n)}
                  className={cn(
                    'px-1.5 py-0.5 font-mono text-[8px] border rounded transition-colors',
                    n === selectedNeighborhood
                      ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
                      : 'text-muted-foreground border-border hover:text-muted-foreground'
                  )}
                >
                  {n.slice(0, 3).toUpperCase()}
                </button>
              ))}
            </div>
          }
        >
          {trends.length > 0 ? (
            <div className="space-y-3">
              <div>
                <div className="font-mono text-[9px] text-muted-foreground mb-1">OCCUPANCY RATE</div>
                <MiniSparkline data={occupancyTrendPoints} height={60} color="#22c55e" />
              </div>
              <div>
                <div className="font-mono text-[9px] text-muted-foreground mb-1">ADR (USD)</div>
                <MiniSparkline data={adrTrendPoints} height={60} color="#3b82f6" />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                <span>{trends[0]?.month || trends[0]?.metric_month}</span>
                <span>{trends[trends.length - 1]?.month || trends[trends.length - 1]?.metric_month}</span>
              </div>
              {/* Latest values */}
              <div className="grid grid-cols-3 gap-2 border-t border-border pt-2">
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground">LATEST OCC</div>
                  <div className="font-mono text-sm text-green-600 dark:text-green-400">
                    {num(trends[trends.length - 1]?.occupancy_rate).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground">LATEST ADR</div>
                  <div className="font-mono text-sm text-blue-600 dark:text-blue-400">
                    ${num(trends[trends.length - 1]?.adr_usd).toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground">LATEST RevPAR</div>
                  <div className="font-mono text-sm text-amber-600 dark:text-amber-400">
                    ${num(trends[trends.length - 1]?.revpar_usd).toFixed(0)}
                  </div>
                </div>
              </div>
              {/* MIEG Services macro context (Slice 4) */}
              {tourism?.mieg_services_yoy !== null && tourism?.mieg_services_yoy !== undefined && (
                <div className="mt-2 pt-2 border-t border-border font-mono text-[9px] text-muted-foreground leading-relaxed">
                  Macro context: MIEG Services sub-index{' '}
                  <span className={cn(tourism.mieg_services_yoy >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                    {tourism.mieg_services_yoy >= 0 ? '+' : ''}{tourism.mieg_services_yoy.toFixed(1)}% YoY
                  </span>
                  {tourism.revpar_mieg_correlation !== null
                    ? ` · RevPAR ↔ Services correlation r=${tourism.revpar_mieg_correlation.toFixed(2)} (${tourism.correlation_months} mo)`
                    : ` · RevPAR↔Services correlation pending (needs ≥6 overlapping months; ${tourism.correlation_months} available)`}
                </div>
              )}
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-8">
              No trend data for {selectedNeighborhood}
            </div>
          )}
        </Panel>
      </div>

      {/* Investment Opportunities + Metrics Detail */}
      <div className="grid grid-cols-12 gap-3">
        {/* Investment Opportunities */}
        <Panel title="INVESTMENT OPPORTUNITIES" className="col-span-6">
          {opportunities.length > 0 ? (
            <div className="space-y-2">
              {opportunities.slice(0, 10).map((opp, i) => (
                <div key={i} className="flex items-center gap-3 p-2 border border-border hover:border-amber-500/30 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    <span className={cn(
                      'font-mono text-lg font-bold',
                      num(opp.opportunity_score) >= 70 ? 'text-green-600 dark:text-green-400' :
                      num(opp.opportunity_score) >= 40 ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    )}>
                      {num(opp.opportunity_score).toFixed(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-foreground">{opp.neighborhood}</span>
                      {opp.investment_grade && <GradeBadge grade={opp.investment_grade} />}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="font-mono text-[9px] text-green-600 dark:text-green-400">
                        RevPAR: ${num(opp.avg_revpar_usd).toFixed(0)}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {opp.active_listings ?? 0} LISTINGS
                      </span>
                      {opp.avg_occupancy_rate != null && (
                        <span className="font-mono text-[9px] text-blue-600 dark:text-blue-400">
                          OCC: {num(opp.avg_occupancy_rate).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Opportunity Score Bar */}
                  <div className="w-20">
                    <div className="w-full h-1.5 bg-muted rounded overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded',
                          num(opp.opportunity_score) >= 70 ? 'bg-green-500/80' :
                          num(opp.opportunity_score) >= 40 ? 'bg-amber-500/80' :
                          'bg-red-500/80'
                        )}
                        style={{ width: `${num(opp.opportunity_score)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-8">
              No investment opportunities identified for {selectedCity}
            </div>
          )}
        </Panel>

        {/* Metrics by Platform/Property Type */}
        <Panel title="METRICS BREAKDOWN" className="col-span-6">
          {metrics.length > 0 ? (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">AREA</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">PLATFORM</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">TYPE</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">OCC%</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">ADR</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">RevPAR</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">#</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.slice(0, 20).map((m, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">{m.neighborhood}</td>
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        <span className={cn(
                          'px-1 py-0.5 border rounded text-[8px]',
                          m.platform === 'airbnb' ? 'text-pink-600 dark:text-pink-400 border-pink-500/20' :
                          m.platform === 'booking' ? 'text-blue-600 dark:text-blue-400 border-blue-500/20' :
                          'text-muted-foreground border-border'
                        )}>
                          {(m.platform || 'ALL').toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        {(m.property_type || '—').slice(0, 10).toUpperCase()}
                      </td>
                      <td className="font-mono text-[10px] text-right py-1.5 px-2">
                        <span className={cn(
                          num(m.occupancy_rate) >= 70 ? 'text-green-600 dark:text-green-400' :
                          num(m.occupancy_rate) >= 40 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400'
                        )}>
                          {num(m.occupancy_rate).toFixed(1)}%
                        </span>
                      </td>
                      <td className="font-mono text-[10px] text-foreground text-right py-1.5 px-2">
                        ${num(m.adr_usd).toFixed(0)}
                      </td>
                      <td className="font-mono text-[10px] text-green-600 dark:text-green-400 text-right py-1.5 px-2">
                        ${num(m.revpar_usd).toFixed(0)}
                      </td>
                      <td className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">
                        {m.total_listings ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-8">
              No metrics data for {selectedCity}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
