'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Home,
  Calendar,
  Gauge,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface PriceForecastResponse {
  region: string
  property_type?: string
  forecast_date: string
  short_term: {
    horizon_months: number
    expected_change_pct: number
    direction_probability: number
    confidence_interval: { low: number; high: number }
    current_avg_price?: number
    forecast_avg_price?: number
  }
  long_term: {
    horizon_years: number
    scenarios: { optimistic: number; base: number; pessimistic: number }
    key_assumptions: string[]
  }
  drivers: Array<{
    factor: string
    direction: string
    impact_magnitude: number
    detail: string
  }>
}

// =====================================================
// CONSTANTS
// =====================================================

const REGIONS = [
  'greater_accra',
  'ashanti',
  'western',
  'eastern',
  'central',
  'northern',
  'volta',
  'brong_ahafo',
  'upper_east',
  'upper_west',
]

const PROPERTY_TYPES = [
  { value: '', label: 'ALL TYPES' },
  { value: 'residential', label: 'RESIDENTIAL' },
  { value: 'commercial', label: 'COMMERCIAL' },
  { value: 'industrial', label: 'INDUSTRIAL' },
  { value: 'land', label: 'LAND' },
]

const HORIZONS = [3, 6, 12, 24]

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/ml'

async function fetchForecast(
  region: string,
  propertyType: string,
  horizon: number
): Promise<PriceForecastResponse | null> {
  try {
    const params = new URLSearchParams({ region, horizon: String(horizon) })
    if (propertyType) params.set('property_type', propertyType)
    const res = await authedFetch(`${API_BASE}/forecast?${params}`)
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

function formatRegion(region: string): string {
  return region
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `GH₵${(val / 1_000_000).toFixed(2)}M`
  if (val >= 1_000) return `GH₵${(val / 1_000).toFixed(0)}K`
  return `GH₵${val.toFixed(0)}`
}

function ImpactBar({ magnitude, direction }: { magnitude: number; direction: string }) {
  const isPositive = direction === 'positive' || direction === 'up'
  const pct = Math.min(Math.abs(magnitude) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
        <div
          className={cn(
            'h-full rounded',
            isPositive ? 'bg-green-500/70' : 'bg-red-500/70'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'font-mono text-[10px] w-8 text-right tabular-nums',
          isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        )}
      >
        {(magnitude * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function ScenarioBar({
  pessimistic,
  base,
  optimistic,
}: {
  pessimistic: number
  base: number
  optimistic: number
}) {
  const min = pessimistic
  const max = optimistic
  const range = max - min || 1
  const basePct = ((base - min) / range) * 100

  return (
    <div className="space-y-2">
      <div className="relative h-4 bg-muted rounded overflow-hidden">
        {/* Pessimistic → Optimistic gradient bar */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-gradient-to-r from-red-500/40 via-amber-500/40 to-green-500/40" />
        </div>
        {/* Base marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-card"
          style={{ left: `${basePct}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[9px]">
        <span className="text-red-600 dark:text-red-400">PESSIMISTIC: {pessimistic.toFixed(1)}%</span>
        <span className="text-amber-600 dark:text-amber-400">BASE: {base.toFixed(1)}%</span>
        <span className="text-green-600 dark:text-green-400">OPTIMISTIC: {optimistic.toFixed(1)}%</span>
      </div>
    </div>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function PriceForecastingPage() {
  const [region, setRegion] = useState('greater_accra')
  const [propertyType, setPropertyType] = useState('')
  const [horizon, setHorizon] = useState(6)
  const [forecast, setForecast] = useState<PriceForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const loadForecast = useCallback(async () => {
    setLoading(true)
    const data = await fetchForecast(region, propertyType, horizon)
    setForecast(data)
    setLoading(false)
  }, [region, propertyType, horizon])

  useEffect(() => {
    loadForecast()
  }, [loadForecast])

  // Also load all-region comparison
  const [regionComparison, setRegionComparison] = useState<PriceForecastResponse[]>([])
  const [comparisonLoading, setComparisonLoading] = useState(true)

  useEffect(() => {
    async function loadComparison() {
      setComparisonLoading(true)
      const results = await Promise.all(
        REGIONS.map((r) => fetchForecast(r, propertyType, horizon))
      )
      setRegionComparison(results.filter((r): r is PriceForecastResponse => r !== null))
      setComparisonLoading(false)
    }
    loadComparison()
  }, [propertyType, horizon])

  if (loading && !forecast) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-72" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-muted/50 rounded border border-border" />
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

  const isPositiveChange = (forecast?.short_term.expected_change_pct ?? 0) >= 0

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            PRICE FORECASTING
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Regional price forecasts with confidence intervals & scenario analysis — Section 8.5
          </p>
        </div>
        <button
          onClick={loadForecast}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          REFRESH
        </button>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Region */}
        <div className="border border-border bg-card/50 px-3 py-2">
          <div className="font-mono text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> REGION
          </div>
          <div className="relative">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full bg-transparent font-mono text-[10px] text-foreground appearance-none focus:outline-none cursor-pointer pr-5"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r} className="bg-card">
                  {formatRegion(r)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Property Type */}
        <div className="border border-border bg-card/50 px-3 py-2">
          <div className="font-mono text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
            <Home className="w-3 h-3" /> PROPERTY TYPE
          </div>
          <div className="relative">
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="w-full bg-transparent font-mono text-[10px] text-foreground appearance-none focus:outline-none cursor-pointer pr-5"
            >
              {PROPERTY_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value} className="bg-card">
                  {pt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Horizon */}
        <div className="border border-border bg-card/50 px-3 py-2">
          <div className="font-mono text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> FORECAST HORIZON
          </div>
          <div className="flex gap-2">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={cn(
                  'flex-1 py-0.5 font-mono text-[10px] border rounded transition-colors',
                  horizon === h
                    ? 'text-amber-600 dark:text-amber-400 border-amber-500/50 bg-amber-500/10'
                    : 'text-muted-foreground border-border hover:border-zinc-600'
                )}
              >
                {h}M
              </button>
            ))}
          </div>
        </div>
      </div>

      {forecast ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            <Panel title="EXPECTED CHANGE">
              <div className="text-center py-1">
                <div className={cn('font-mono text-3xl', isPositiveChange ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                  {isPositiveChange ? '+' : ''}
                  {forecast.short_term.expected_change_pct.toFixed(2)}%
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {forecast.short_term.horizon_months} MONTH HORIZON
                </div>
              </div>
            </Panel>

            <Panel title="DIRECTION PROBABILITY">
              <div className="text-center py-1">
                <div className="font-mono text-3xl text-foreground">
                  {(forecast.short_term.direction_probability * 100).toFixed(0)}%
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  CONFIDENCE IN DIRECTION
                </div>
              </div>
            </Panel>

            <Panel title="CURRENT AVG PRICE">
              <div className="text-center py-1">
                <div className="font-mono text-2xl text-foreground">
                  {forecast.short_term.current_avg_price
                    ? formatCurrency(forecast.short_term.current_avg_price)
                    : '—'}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {formatRegion(forecast.region)}
                </div>
              </div>
            </Panel>

            <Panel title="FORECAST AVG PRICE">
              <div className="text-center py-1">
                <div className={cn('font-mono text-2xl', isPositiveChange ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                  {forecast.short_term.forecast_avg_price
                    ? formatCurrency(forecast.short_term.forecast_avg_price)
                    : '—'}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  IN {forecast.short_term.horizon_months} MONTHS
                </div>
              </div>
            </Panel>

            <Panel title="CONFIDENCE INTERVAL">
              <div className="text-center py-1">
                <div className="font-mono text-sm text-foreground">
                  {forecast.short_term.confidence_interval.low.toFixed(1)}% — {forecast.short_term.confidence_interval.high.toFixed(1)}%
                </div>
                <div className="mt-1.5 h-2 bg-muted rounded overflow-hidden relative">
                  {/* Range bar */}
                  <div
                    className="absolute top-0 h-full bg-amber-500/50 rounded"
                    style={{
                      left: `${Math.max(((forecast.short_term.confidence_interval.low + 30) / 60) * 100, 0)}%`,
                      width: `${Math.min(
                        ((forecast.short_term.confidence_interval.high - forecast.short_term.confidence_interval.low) / 60) * 100,
                        100
                      )}%`,
                    }}
                  />
                  {/* Center marker at expected */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-amber-400"
                    style={{
                      left: `${Math.max(((forecast.short_term.expected_change_pct + 30) / 60) * 100, 0)}%`,
                    }}
                  />
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">95% CI</div>
              </div>
            </Panel>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-12 gap-3 mb-4">
            {/* Long-term Scenarios */}
            <Panel title="LONG-TERM SCENARIOS" className="col-span-5">
              <div className="space-y-4">
                <div className="font-mono text-[10px] text-muted-foreground mb-2">
                  {forecast.long_term.horizon_years}-YEAR PRICE CHANGE SCENARIOS
                </div>
                <ScenarioBar
                  pessimistic={forecast.long_term.scenarios.pessimistic}
                  base={forecast.long_term.scenarios.base}
                  optimistic={forecast.long_term.scenarios.optimistic}
                />

                {/* Scenario details */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-red-500/20 bg-red-500/5 p-2 text-center">
                    <div className="font-mono text-[9px] text-red-600 dark:text-red-400 mb-0.5">PESSIMISTIC</div>
                    <div className="font-mono text-lg text-red-600 dark:text-red-400">
                      {forecast.long_term.scenarios.pessimistic > 0 ? '+' : ''}
                      {forecast.long_term.scenarios.pessimistic.toFixed(1)}%
                    </div>
                  </div>
                  <div className="border border-amber-500/20 bg-amber-500/5 p-2 text-center">
                    <div className="font-mono text-[9px] text-amber-600 dark:text-amber-400 mb-0.5">BASE CASE</div>
                    <div className="font-mono text-lg text-amber-600 dark:text-amber-400">
                      {forecast.long_term.scenarios.base > 0 ? '+' : ''}
                      {forecast.long_term.scenarios.base.toFixed(1)}%
                    </div>
                  </div>
                  <div className="border border-green-500/20 bg-green-500/5 p-2 text-center">
                    <div className="font-mono text-[9px] text-green-600 dark:text-green-400 mb-0.5">OPTIMISTIC</div>
                    <div className="font-mono text-lg text-green-600 dark:text-green-400">
                      {forecast.long_term.scenarios.optimistic > 0 ? '+' : ''}
                      {forecast.long_term.scenarios.optimistic.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Key Assumptions */}
                {forecast.long_term.key_assumptions.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <div className="font-mono text-[9px] text-muted-foreground mb-1">KEY ASSUMPTIONS</div>
                    <div className="space-y-1">
                      {forecast.long_term.key_assumptions.map((a, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="font-mono text-[9px] text-amber-500 mt-0.5">•</span>
                          <span className="font-mono text-[10px] text-muted-foreground leading-relaxed">{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            {/* Forecast Drivers */}
            <Panel title="FORECAST DRIVERS" className="col-span-4">
              <div className="space-y-2">
                {forecast.drivers.length > 0 ? (
                  forecast.drivers
                    .sort((a, b) => b.impact_magnitude - a.impact_magnitude)
                    .map((d) => (
                      <div key={d.factor} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {d.direction === 'positive' || d.direction === 'up' ? (
                              <ArrowUpRight className="w-3 h-3 text-green-600 dark:text-green-400" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3 text-red-600 dark:text-red-400" />
                            )}
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {d.factor.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                        <ImpactBar magnitude={d.impact_magnitude} direction={d.direction} />
                        <div className="font-mono text-[9px] text-muted-foreground ml-4 leading-relaxed">
                          {d.detail}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="font-mono text-[10px] text-muted-foreground text-center py-6">No driver data</div>
                )}
              </div>
            </Panel>

            {/* Regional Comparison */}
            <Panel title="REGIONAL COMPARISON" className="col-span-3">
              <div className="space-y-1.5">
                {comparisonLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-4 bg-muted rounded" />
                    ))}
                  </div>
                ) : regionComparison.length > 0 ? (
                  regionComparison
                    .sort((a, b) => b.short_term.expected_change_pct - a.short_term.expected_change_pct)
                    .map((rc) => {
                      const isPos = rc.short_term.expected_change_pct >= 0
                      const isSelected = rc.region === region
                      return (
                        <button
                          key={rc.region}
                          onClick={() => setRegion(rc.region)}
                          className={cn(
                            'w-full flex items-center justify-between py-1 px-1.5 transition-colors text-left',
                            isSelected
                              ? 'bg-amber-500/10 border border-amber-500/30'
                              : 'hover:bg-muted/50 border border-transparent'
                          )}
                        >
                          <span
                            className={cn(
                              'font-mono text-[10px]',
                              isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                            )}
                          >
                            {formatRegion(rc.region)}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[10px] tabular-nums',
                              isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {isPos ? '+' : ''}{rc.short_term.expected_change_pct.toFixed(1)}%
                          </span>
                        </button>
                      )
                    })
                ) : (
                  <div className="font-mono text-[10px] text-muted-foreground text-center py-4">
                    No comparison data
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <Panel title="FORECAST UNAVAILABLE">
          <div className="text-center py-8">
            <AlertTriangle className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <div className="font-mono text-[10px] text-muted-foreground">
              No forecast data available for {formatRegion(region)}.
              <br />
              The ML service may be offline or no data exists for this region.
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
