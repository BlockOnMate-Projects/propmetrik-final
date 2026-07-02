'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  Home,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Banknote,
  Key,
  Building,
  MapPin,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Landmark,
  ChevronRight,
} from 'lucide-react'
import RegionalHeatmap from '@/components/analytics/RegionalHeatmap'
import Sparkline from '@/components/analytics/Sparkline'

// =====================================================
// TYPES
// =====================================================

interface GHAIData {
  region: string
  ghai_composite: number
  ghai_category: string
  mhai: number
  chai: number
  rhai: number
  mortgage_weight: number
  cash_weight: number
  rental_weight: number
  cai: number
  lai: number
  mas: number
  median_property_price: number
  median_household_income: number
  mortgage_rate: number
  median_monthly_rent: number
  trend_direction: string
  change_mom: number
  change_yoy: number
}

interface GHAIHistory {
  calculation_date: string
  ghai_composite: number
  mhai: number
  chai: number
  rhai: number
  ghai_category: string
}

interface AlertData {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  created_at: string
  category?: string
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/platform'

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
// HELPERS
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

function ChangeIndicator({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  const positive = value >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-mono text-xs', positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {positive ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}

function formatRegion(region: string): string {
  return region
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function categoryColor(category: string): string {
  switch (category) {
    case 'affordable':
      return 'text-green-600 dark:text-green-400'
    case 'moderate':
      return 'text-amber-600 dark:text-amber-400'
    case 'unaffordable':
      return 'text-orange-600 dark:text-orange-400'
    case 'severely_unaffordable':
      return 'text-red-600 dark:text-red-400'
    default:
      return 'text-muted-foreground'
  }
}

function categoryBg(category: string): string {
  switch (category) {
    case 'affordable':
      return 'bg-green-500/10 border-green-500/20'
    case 'moderate':
      return 'bg-amber-500/10 border-amber-500/20'
    case 'unaffordable':
      return 'bg-orange-500/10 border-orange-500/20'
    case 'severely_unaffordable':
      return 'bg-red-500/10 border-red-500/20'
    default:
      return 'bg-muted/50 border-border'
  }
}

function categoryLabel(category: string): string {
  return category.replace(/_/g, ' ').toUpperCase()
}

// =====================================================
// SUB-INDEX GAUGE
// =====================================================

function IndexGauge({
  label,
  value,
  icon: Icon,
  iconColor,
  interpretation,
}: {
  label: string
  value: number
  icon: React.ElementType
  iconColor: string
  interpretation: string
}) {
  const pct = Math.min(value, 150) / 150 * 100
  const barColor = value >= 100 ? 'bg-green-500' : value >= 80 ? 'bg-amber-500' : value >= 50 ? 'bg-orange-500' : 'bg-red-500'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="font-mono text-2xl text-foreground">{value.toFixed(1)}</div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <div className="font-mono text-[9px] text-muted-foreground">{interpretation}</div>
    </div>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

interface TenureRow {
  renting_pct: number | null
  owner_occupied_pct: number | null
  perching_pct: number | null
}
interface InterestHistory {
  history: Array<{ period_date: string; rate_pct: number }>
  cycle: 'easing' | 'tightening' | 'stable'
  latest: { period_date: string; rate_pct: number } | null
}

export default function AffordabilityDashboardPage() {
  const [regions, setRegions] = useState<GHAIData[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [history, setHistory] = useState<GHAIHistory[]>([])
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [tenure, setTenure] = useState<Record<string, TenureRow>>({})
  const [interest, setInterest] = useState<InterestHistory | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [regionsData, alertsData, tenureData, interestData] = await Promise.all([
      fetchData<GHAIData[]>('/hai/current', signal),
      fetchData<{ recent: AlertData[] }>('/alerts/summary?limit=5', signal),
      fetchData<Record<string, TenureRow>>('/hai/tenure', signal),
      fetchData<InterestHistory>('/hai/interest-history?months=24', signal),
    ])
    if (signal?.aborted) return
    setRegions(regionsData || [])
    setAlerts(alertsData?.recent?.filter((a) => a.category === 'hai') || [])
    setTenure(tenureData || {})
    setInterest(interestData)
    setLoading(false)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    loadData(ac.signal)
    return () => ac.abort()
  }, [loadData])

  // Load history when region selected
  useEffect(() => {
    if (!selectedRegion) {
      setHistory([])
      return
    }
    fetchData<GHAIHistory[]>(`/hai/history/${selectedRegion}?months=12`).then((data) => {
      setHistory(data || [])
    })
  }, [selectedRegion])

  // Compute national average for header
  const nationalAvg = regions.length > 0
    ? regions.reduce((sum, r) => sum + r.ghai_composite, 0) / regions.length
    : 0
  const nationalCategory =
    nationalAvg >= 100 ? 'affordable' : nationalAvg >= 80 ? 'moderate' : nationalAvg >= 50 ? 'unaffordable' : 'severely_unaffordable'

  const selected = selectedRegion ? regions.find((r) => r.region === selectedRegion) : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-80" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted/50 rounded border border-border" />
            ))}
          </div>
          <div className="h-96 bg-muted/50 rounded border border-border" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <Home className="w-5 h-5 text-amber-500" />
            HOUSING AFFORDABILITY INDEX
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Ghana Housing Affordability Index (GHAI) — Section 2
          </p>
        </div>
        <button
          onClick={() => loadData()}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          REFRESH
        </button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {/* Composite GHAI */}
        <Panel title="COMPOSITE GHAI (NATIONAL AVG)">
          <div className="text-center py-1">
            <div className="font-mono text-3xl text-foreground">{nationalAvg.toFixed(1)}</div>
            <div className={cn('font-mono text-xs mt-1 px-2 py-0.5 inline-block border rounded', categoryBg(nationalCategory))}>
              <span className={categoryColor(nationalCategory)}>
                {categoryLabel(nationalCategory)}
              </span>
            </div>
          </div>
        </Panel>

        {/* MHAI */}
        <Panel title="MORTGAGE HAI (AVG)">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <CreditCard className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="font-mono text-2xl text-foreground">
              {regions.length > 0 ? (regions.reduce((s, r) => s + r.mhai, 0) / regions.length).toFixed(1) : '—'}
            </div>
            <div className="font-mono text-[9px] text-muted-foreground mt-1">FORMAL SECTOR (10-15%)</div>
          </div>
        </Panel>

        {/* CHAI */}
        <Panel title="CASH HAI (AVG)">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Banknote className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            </div>
            <div className="font-mono text-2xl text-foreground">
              {regions.length > 0 ? (regions.reduce((s, r) => s + r.chai, 0) / regions.length).toFixed(1) : '—'}
            </div>
            <div className="font-mono text-[9px] text-muted-foreground mt-1">CASH BUYERS (60%+)</div>
          </div>
        </Panel>

        {/* RHAI */}
        <Panel title="RENTAL HAI (AVG)">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Key className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="font-mono text-2xl text-foreground">
              {regions.length > 0 ? (regions.reduce((s, r) => s + r.rhai, 0) / regions.length).toFixed(1) : '—'}
            </div>
            <div className="font-mono text-[9px] text-muted-foreground mt-1">RENTERS (40%+ HH)</div>
          </div>
        </Panel>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Heatmap */}
        <Panel title="REGIONAL AFFORDABILITY MAP" className="col-span-5">
          <RegionalHeatmap
            data={regions.map((r) => ({
              region: r.region,
              value: r.ghai_composite,
              label: categoryLabel(r.ghai_category),
            }))}
            metric="GHAI"
            colorScale="green-red"
            onRegionClick={(region) => setSelectedRegion(region === selectedRegion ? null : region)}
            selectedRegion={selectedRegion}
            valueFormat={(v) => v.toFixed(1)}
          />
        </Panel>

        {/* Region detail or comparison table */}
        <div className="col-span-7 flex flex-col gap-3">
          {/* Selected Region Detail */}
          {selected ? (
            <Panel
              title={`${formatRegion(selected.region).toUpperCase()} — GHAI DETAIL`}
              actions={
                <button
                  onClick={() => setSelectedRegion(null)}
                  className="font-mono text-[9px] text-muted-foreground hover:text-amber-500"
                >
                  CLOSE
                </button>
              }
            >
              <div className="grid grid-cols-3 gap-4 mb-4">
                <IndexGauge
                  label="MORTGAGE HAI"
                  value={selected.mhai}
                  icon={CreditCard}
                  iconColor="text-purple-600 dark:text-purple-400"
                  interpretation={
                    selected.mhai >= 100 ? 'Median HH qualifies' : selected.mhai >= 50 ? 'Seriously unaffordable' : 'Severely unaffordable'
                  }
                />
                <IndexGauge
                  label="CASH HAI"
                  value={selected.chai}
                  icon={Banknote}
                  iconColor="text-green-600 dark:text-green-400"
                  interpretation={
                    selected.chai >= 100
                      ? '≤10yr savings horizon'
                      : selected.chai >= 70
                        ? '10-14yr savings'
                        : selected.chai >= 50
                          ? '14-20yr savings'
                          : '>20yr savings'
                  }
                />
                <IndexGauge
                  label="RENTAL HAI"
                  value={selected.rhai}
                  icon={Key}
                  iconColor="text-blue-600 dark:text-blue-400"
                  interpretation={
                    selected.rhai >= 100 ? 'Affordable (<30% burden)' : selected.rhai >= 80 ? 'Moderate burden' : 'Severe burden'
                  }
                />
              </div>

              {/* Supplementary Indices */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="border border-border p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Building className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span className="font-mono text-[9px] text-muted-foreground">CAI (CONSTRUCTION)</span>
                  </div>
                  <div className="font-mono text-lg text-foreground">{selected.cai.toFixed(1)}</div>
                </div>
                <div className="border border-border p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-mono text-[9px] text-muted-foreground">LAI (LAND)</span>
                  </div>
                  <div className="font-mono text-lg text-foreground">{selected.lai.toFixed(1)}</div>
                </div>
                <div className="border border-border p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Landmark className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                    <span className="font-mono text-[9px] text-muted-foreground">MAS (MORTGAGE ACCESS)</span>
                  </div>
                  <div className="font-mono text-lg text-foreground">{selected.mas.toFixed(1)}%</div>
                  <div className="font-mono text-[8px] text-muted-foreground mt-0.5">Formal employment % from PHC 2021 census</div>
                </div>
              </div>

              {/* Input data */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Median Property Price</span>
                  <span className="text-muted-foreground">₵{selected.median_property_price.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Median HH Income</span>
                  <span className="text-muted-foreground">₵{selected.median_household_income.toLocaleString()}/yr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mortgage Rate</span>
                  <span className="text-muted-foreground">{(selected.mortgage_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Median Monthly Rent</span>
                  <span className="text-muted-foreground">₵{selected.median_monthly_rent.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Weights (M/C/R)</span>
                  <span className="text-muted-foreground">
                    {(selected.mortgage_weight * 100).toFixed(0)}/{(selected.cash_weight * 100).toFixed(0)}/{(selected.rental_weight * 100).toFixed(0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trend</span>
                  <span className={cn(selected.trend_direction === 'improving' ? 'text-green-600 dark:text-green-400' : selected.trend_direction === 'declining' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                    {selected.trend_direction.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* History */}
              {history.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="font-mono text-[9px] text-muted-foreground mb-2">GHAI TREND (12M)</div>
                  <div className="space-y-1">
                    {history.map((h, i) => {
                      const max = Math.max(...history.map((x) => x.ghai_composite), 1)
                      const pct = (h.ghai_composite / max) * 100
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-16 font-mono text-[9px] text-muted-foreground shrink-0">
                            {new Date(h.calculation_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                          </span>
                          <div className="flex-1 h-2.5 bg-muted rounded-sm overflow-hidden">
                            <div
                              className={cn('h-full rounded-sm', h.ghai_composite >= 80 ? 'bg-green-500/70' : h.ghai_composite >= 50 ? 'bg-amber-500/70' : 'bg-red-500/70')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-[10px] text-muted-foreground">{h.ghai_composite.toFixed(1)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </Panel>
          ) : (
            /* Regional Comparison Table */
            <Panel title="REGIONAL AFFORDABILITY COMPARISON">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                    <th className="text-left pb-2">REGION</th>
                    <th className="text-right pb-2">GHAI</th>
                    <th className="text-left pb-2 pl-3">STATUS</th>
                    <th className="text-right pb-2">MHAI</th>
                    <th className="text-right pb-2">CHAI</th>
                    <th className="text-right pb-2">RHAI</th>
                    <th className="text-right pb-2">MoM</th>
                    <th className="text-right pb-2">YoY</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {regions.map((r) => (
                    <tr
                      key={r.region}
                      className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer"
                      onClick={() => setSelectedRegion(r.region)}
                    >
                      <td className="py-2 text-foreground flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        {formatRegion(r.region)}
                        <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
                      </td>
                      <td className="py-2 text-right font-bold text-foreground">{r.ghai_composite.toFixed(1)}</td>
                      <td className="py-2 pl-3">
                        <span className={cn('font-mono text-[9px] px-1.5 py-0.5 border rounded', categoryBg(r.ghai_category), categoryColor(r.ghai_category))}>
                          {categoryLabel(r.ghai_category)}
                        </span>
                      </td>
                      <td className="py-2 text-right text-purple-600 dark:text-purple-400">{r.mhai.toFixed(1)}</td>
                      <td className="py-2 text-right text-green-600 dark:text-green-400">{r.chai.toFixed(1)}</td>
                      <td className="py-2 text-right text-blue-600 dark:text-blue-400">{r.rhai.toFixed(1)}</td>
                      <td className="py-2 text-right">
                        <ChangeIndicator value={r.change_mom} />
                      </td>
                      <td className="py-2 text-right">
                        <ChangeIndicator value={r.change_yoy} />
                      </td>
                    </tr>
                  ))}
                  {regions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground font-mono text-xs">
                        No affordability data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </div>

      {/* GSS context row — housing tenure (Slice 2) + lending-rate cycle (Slice 1) */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Housing Tenure Profile (PHC 2021) */}
        <Panel
          title="HOUSING TENURE PROFILE (PHC 2021)"
          className="col-span-12 lg:col-span-7"
          actions={<span className="font-mono text-[9px] text-muted-foreground">weights derived from this</span>}
        >
          {Object.keys(tenure).length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="text-[9px] font-mono text-muted-foreground border-b border-border">
                  <th className="text-left pb-1.5">REGION</th>
                  <th className="text-right pb-1.5">% RENTING</th>
                  <th className="text-right pb-1.5">% OWNER-OCCUPIED</th>
                  <th className="text-right pb-1.5">% PERCHING</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px]">
                {Object.entries(tenure)
                  .sort((a, b) => (b[1].renting_pct ?? 0) - (a[1].renting_pct ?? 0))
                  .map(([region, t]) => (
                    <tr
                      key={region}
                      className={cn(
                        'border-b border-border/50 hover:bg-muted/40 cursor-pointer',
                        selectedRegion === region && 'bg-muted/60',
                      )}
                      onClick={() => setSelectedRegion(region === selectedRegion ? null : region)}
                    >
                      <td className="py-1 text-foreground">{formatRegion(region)}</td>
                      <td className="py-1 text-right text-blue-600 dark:text-blue-400">{t.renting_pct !== null ? `${t.renting_pct.toFixed(1)}%` : '—'}</td>
                      <td className="py-1 text-right text-green-600 dark:text-green-400">{t.owner_occupied_pct !== null ? `${t.owner_occupied_pct.toFixed(1)}%` : '—'}</td>
                      <td className="py-1 text-right text-muted-foreground">{t.perching_pct !== null ? `${t.perching_pct.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div className="py-6 text-center font-mono text-xs text-muted-foreground">No PHC 2021 tenure data</div>
          )}
          <div className="pt-2 mt-1 border-t border-border font-mono text-[9px] text-muted-foreground">
            The MHAI / CHAI / RHAI blend weights per region are derived from these PHC 2021 tenure shares (not a fixed national split).
          </div>
        </Panel>

        {/* GSS lending-rate cycle sparkline */}
        <Panel
          title="GSS LENDING RATE"
          className="col-span-12 lg:col-span-5"
          actions={
            interest?.cycle ? (
              <span className={cn(
                'px-1.5 py-0.5 font-mono text-[9px] border rounded uppercase',
                interest.cycle === 'easing' ? 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20'
                  : interest.cycle === 'tightening' ? 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
              )}>
                {interest.cycle}
              </span>
            ) : undefined
          }
        >
          {interest && interest.history.length > 1 ? (
            <div className="flex flex-col items-center justify-center py-2">
              <div className="font-mono text-3xl text-foreground">
                {interest.latest ? `${interest.latest.rate_pct.toFixed(1)}%` : '—'}
              </div>
              <div className="font-mono text-[9px] text-muted-foreground mb-2">avg lending rate (GSS StatsBank)</div>
              <Sparkline
                data={interest.history.map((h) => h.rate_pct)}
                width={240}
                height={40}
                className="w-full"
                strokeClassName="stroke-cyan-500"
                fillClassName="fill-cyan-500/10"
              />
              <div className="font-mono text-[9px] text-muted-foreground mt-1">
                {interest.history.length} months · to {interest.latest ? new Date(interest.latest.period_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center font-mono text-xs text-muted-foreground">No lending-rate history</div>
          )}
        </Panel>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Panel title="AFFORDABILITY ALERTS">
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-3 px-3 py-2 border rounded',
                  alert.severity === 'critical'
                    ? 'border-red-500/30 bg-red-500/5'
                    : alert.severity === 'warning'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-blue-500/30 bg-blue-500/5',
                )}
              >
                <AlertTriangle
                  className={cn(
                    'w-4 h-4 mt-0.5 shrink-0',
                    alert.severity === 'critical' ? 'text-red-600 dark:text-red-400' : alert.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-foreground">{alert.title}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{alert.message}</div>
                </div>
                <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                  {new Date(alert.created_at).toLocaleDateString('en-GB')}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
