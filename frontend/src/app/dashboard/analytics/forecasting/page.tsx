'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  TrendingUp,
  TrendingDown,
  Hammer,
  Home,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  Target,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface CCIForecast {
  region: string | null
  horizon_months: number
  forecast: Array<{
    period_date: string
    predicted_index: number
    lower_bound: number
    upper_bound: number
    confidence: number
  }>
  model_info: {
    method: string
    data_points: number
    r_squared: number
    trend_direction: string
    monthly_change_rate: number
  }
  component_forecasts: {
    materials: Array<{ period_date: string; predicted: number }>
    labor: Array<{ period_date: string; predicted: number }>
    overhead: Array<{ period_date: string; predicted: number }>
  }
}

interface GHAIForecast {
  region: string
  horizon_months: number
  current_ghai: number
  current_category: string
  forecast: Array<{
    period_date: string
    predicted_ghai: number
    lower_bound: number
    upper_bound: number
    predicted_category: string
    confidence: number
  }>
  sub_index_forecasts: {
    mhai: Array<{ period_date: string; predicted: number }>
    chai: Array<{ period_date: string; predicted: number }>
    rhai: Array<{ period_date: string; predicted: number }>
  }
  model_info: {
    method: string
    data_points: number
    r_squared: number
    trend_direction: string
    monthly_change_rate: number
  }
}

// =====================================================
// API
// =====================================================

const PLATFORM_BASE = '/api/analytics/platform'

async function fetchPlatform<T>(endpoint: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await authedFetch(`${PLATFORM_BASE}${endpoint}`, { signal })
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

function TrendBadge({ direction }: { direction: string }) {
  const isUp = direction === 'rising' || direction === 'improving'
  const isDown = direction === 'falling' || direction === 'worsening'
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[9px] border rounded',
      isUp ? 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20' :
      isDown ? 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20' :
      'text-muted-foreground bg-muted border-border'
    )}>
      {isUp ? <ArrowUpRight className="w-2.5 h-2.5" /> :
       isDown ? <ArrowDownRight className="w-2.5 h-2.5" /> :
       <Activity className="w-2.5 h-2.5" />}
      {direction.toUpperCase()}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    affordable: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20',
    moderate: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    unaffordable: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
    severely_unaffordable: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
  }
  return (
    <span className={cn(
      'px-1.5 py-0.5 font-mono text-[9px] border rounded',
      colors[category] || 'text-muted-foreground border-border'
    )}>
      {category.replace(/_/g, ' ').toUpperCase()}
    </span>
  )
}

function ForecastChart({
  forecast,
  height = 140,
  label,
  valuePrefix = '',
  valueSuffix = '',
}: {
  forecast: Array<{
    period_date: string
    predicted: number
    lower?: number
    upper?: number
  }>
  height?: number
  label: string
  valuePrefix?: string
  valueSuffix?: string
}) {
  if (!forecast.length) return null

  const values = forecast.map(f => f.predicted)
  const allValues = [
    ...values,
    ...forecast.filter(f => f.lower != null).map(f => f.lower!),
    ...forecast.filter(f => f.upper != null).map(f => f.upper!),
  ]
  const max = Math.max(...allValues)
  const min = Math.min(...allValues)
  const range = max - min || 1
  const w = 200
  const pad = 4

  const toY = (v: number) => height - ((v - min) / range) * (height - pad * 2) - pad
  const toX = (i: number) => (i / (forecast.length - 1)) * w

  // Confidence band path
  const hasConfidence = forecast.some(f => f.lower != null && f.upper != null)
  let bandPath = ''
  if (hasConfidence) {
    const upper = forecast.map((f, i) => `${toX(i)},${toY(f.upper ?? f.predicted)}`).join(' ')
    const lower = forecast.map((f, i) => `${toX(i)},${toY(f.lower ?? f.predicted)}`).reverse().join(' ')
    bandPath = `${upper} ${lower}`
  }

  const mainLine = forecast.map((f, i) => `${toX(i)},${toY(f.predicted)}`).join(' ')

  return (
    <div className="space-y-1">
      <div className="font-mono text-[9px] text-muted-foreground">{label}</div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {hasConfidence && (
          <polygon points={bandPath} fill="#f59e0b" fillOpacity="0.08" />
        )}
        <polyline points={mainLine} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
        {/* Data points */}
        {forecast.map((f, i) => (
          <circle key={i} cx={toX(i)} cy={toY(f.predicted)} r="2" fill="#f59e0b" />
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{forecast[0]?.period_date}</span>
        <span>{forecast[forecast.length - 1]?.period_date}</span>
      </div>
      {/* Values */}
      <div className="flex justify-between font-mono text-[9px]">
        <span className="text-muted-foreground">START: <span className="text-foreground">{valuePrefix}{forecast[0]?.predicted.toFixed(1)}{valueSuffix}</span></span>
        <span className="text-muted-foreground">END: <span className="text-amber-600 dark:text-amber-400">{valuePrefix}{forecast[forecast.length - 1]?.predicted.toFixed(1)}{valueSuffix}</span></span>
      </div>
    </div>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function ForecastingPage() {
  const [cciForecast, setCciForecast] = useState<CCIForecast | null>(null)
  const [ghaiForecast, setGhaiForecast] = useState<GHAIForecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState('greater_accra')
  const [horizon, setHorizon] = useState(6)
  const [showRegionDropdown, setShowRegionDropdown] = useState(false)

  // Canonical 16 GSS regions (the old 10-region list was pre-2019 and used the
  // retired 'brong_ahafo', now split into Ahafo / Bono / Bono East).
  const regions = [
    'greater_accra', 'ashanti', 'western', 'central', 'eastern', 'volta',
    'northern', 'upper_east', 'upper_west', 'western_north', 'ahafo', 'bono',
    'bono_east', 'oti', 'savannah', 'north_east',
  ]

  const formatRegion = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [cciData, ghaiData] = await Promise.all([
      fetchPlatform<CCIForecast>(`/construction/forecast?region=${selectedRegion}&horizon=${horizon}`, signal),
      fetchPlatform<GHAIForecast>(`/hai/forecast/${selectedRegion}?horizon=${horizon}`, signal),
    ])
    if (signal?.aborted) return
    setCciForecast(cciData)
    setGhaiForecast(ghaiData)
    setLoading(false)
  }, [selectedRegion, horizon])

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
            <div className="col-span-6 h-80 bg-muted/50 rounded border border-border" />
            <div className="col-span-6 h-80 bg-muted/50 rounded border border-border" />
          </div>
        </div>
      </div>
    )
  }

  const cciEndValue = cciForecast?.forecast?.[cciForecast.forecast.length - 1]
  const ghaiEndValue = ghaiForecast?.forecast?.[ghaiForecast.forecast.length - 1]

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            PREDICTIVE FORECASTING
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            CCI & GHAI Forecasting · Weighted Linear Regression · Confidence Intervals — Phase 6
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Horizon selector */}
          <div className="flex gap-1">
            {[3, 6, 12].map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={cn(
                  'px-2 py-1 font-mono text-[10px] border transition-colors',
                  h === horizon
                    ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
                    : 'text-muted-foreground border-border hover:text-muted-foreground'
                )}
              >
                {h}M
              </button>
            ))}
          </div>
          {/* Region selector */}
          <div className="relative">
            <button
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 transition-colors"
            >
              {formatRegion(selectedRegion).toUpperCase()}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showRegionDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border shadow-lg max-h-48 overflow-y-auto">
                {regions.map(r => (
                  <button
                    key={r}
                    onClick={() => { setSelectedRegion(r); setShowRegionDropdown(false) }}
                    className={cn(
                      'block w-full text-left px-3 py-1.5 font-mono text-[10px] transition-colors',
                      r === selectedRegion ? 'text-amber-500 bg-muted' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {formatRegion(r).toUpperCase()}
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
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Panel title="CCI FORECAST">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Hammer className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-mono text-[10px] text-muted-foreground">{horizon}M AHEAD</span>
            </div>
            <div className="font-mono text-2xl text-blue-600 dark:text-blue-400">
              {cciEndValue ? cciEndValue.predicted_index.toFixed(1) : '—'}
            </div>
            {cciForecast?.model_info && (
              <div className="mt-0.5">
                <TrendBadge direction={cciForecast.model_info.trend_direction} />
              </div>
            )}
          </div>
        </Panel>

        <Panel title="CCI CONFIDENCE">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className="font-mono text-[10px] text-muted-foreground">INTERVAL</span>
            </div>
            <div className="font-mono text-lg text-foreground">
              {cciEndValue ? `${cciEndValue.lower_bound.toFixed(0)}–${cciEndValue.upper_bound.toFixed(0)}` : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {cciEndValue ? `${(cciEndValue.confidence * 100).toFixed(0)}% CONF` : ''}
            </div>
          </div>
        </Panel>

        <Panel title="GHAI FORECAST">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Home className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span className="font-mono text-[10px] text-muted-foreground">{horizon}M AHEAD</span>
            </div>
            <div className="font-mono text-2xl text-purple-600 dark:text-purple-400">
              {ghaiEndValue ? ghaiEndValue.predicted_ghai.toFixed(1) : '—'}
            </div>
            {ghaiEndValue && (
              <div className="mt-0.5">
                <CategoryBadge category={ghaiEndValue.predicted_category} />
              </div>
            )}
          </div>
        </Panel>

        <Panel title="MODEL QUALITY">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-mono text-[10px] text-muted-foreground">R² SCORE</span>
            </div>
            <div className="space-y-1 mt-1">
              <div className="flex justify-between font-mono text-[10px]">
                <span className="text-muted-foreground">CCI</span>
                <span className={cn(
                  (cciForecast?.model_info.r_squared ?? 0) >= 0.7 ? 'text-green-600 dark:text-green-400' :
                  (cciForecast?.model_info.r_squared ?? 0) >= 0.4 ? 'text-amber-600 dark:text-amber-400' :
                  'text-red-600 dark:text-red-400'
                )}>
                  {cciForecast?.model_info.r_squared?.toFixed(4) ?? '—'}
                </span>
              </div>
              <div className="flex justify-between font-mono text-[10px]">
                <span className="text-muted-foreground">GHAI</span>
                <span className={cn(
                  (ghaiForecast?.model_info.r_squared ?? 0) >= 0.7 ? 'text-green-600 dark:text-green-400' :
                  (ghaiForecast?.model_info.r_squared ?? 0) >= 0.4 ? 'text-amber-600 dark:text-amber-400' :
                  'text-red-600 dark:text-red-400'
                )}>
                  {ghaiForecast?.model_info.r_squared?.toFixed(4) ?? '—'}
                </span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Forecast Charts */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* CCI Forecast */}
        <Panel title={`CCI FORECAST — ${formatRegion(selectedRegion).toUpperCase()}`} className="col-span-6">
          {cciForecast ? (
            <div className="space-y-4">
              <ForecastChart
                forecast={cciForecast.forecast.map(f => ({
                  period_date: f.period_date,
                  predicted: f.predicted_index,
                  lower: f.lower_bound,
                  upper: f.upper_bound,
                }))}
                height={140}
                label="COMPOSITE INDEX WITH 95% CONFIDENCE BAND"
              />

              {/* Model Info */}
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">METHOD</span>
                  <span className="text-muted-foreground">{cciForecast.model_info.method.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">DATA POINTS</span>
                  <span className="text-foreground">{cciForecast.model_info.data_points}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">MONTHLY CHANGE</span>
                  <span className={cciForecast.model_info.monthly_change_rate >= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                    {cciForecast.model_info.monthly_change_rate >= 0 ? '+' : ''}{cciForecast.model_info.monthly_change_rate.toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">TREND</span>
                  <TrendBadge direction={cciForecast.model_info.trend_direction} />
                </div>
              </div>

              {/* Component forecasts */}
              <div className="border-t border-border pt-2">
                <div className="font-mono text-[9px] text-muted-foreground mb-2">COMPONENT FORECASTS</div>
                <div className="grid grid-cols-3 gap-3">
                  {(['materials', 'labor', 'overhead'] as const).map(comp => {
                    const compData = cciForecast.component_forecasts[comp]
                    return (
                      <div key={comp} className="space-y-1">
                        <div className="font-mono text-[9px] text-muted-foreground">{comp.toUpperCase()}</div>
                        {compData.length > 0 && (
                          <>
                            <div className="font-mono text-sm text-foreground">
                              {compData[compData.length - 1].predicted.toFixed(1)}
                            </div>
                            <div className="font-mono text-[9px] text-muted-foreground">
                              from {compData[0].predicted.toFixed(1)}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Forecast Table */}
              <div className="border-t border-border pt-2">
                <div className="overflow-x-auto max-h-36 overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="font-mono text-[9px] text-muted-foreground text-left py-1 px-1">DATE</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">PREDICTED</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">LOWER</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">UPPER</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">CONF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cciForecast.forecast.map((f, i) => (
                        <tr key={i} className="border-b border-border/30">
                          <td className="font-mono text-[9px] text-muted-foreground py-1 px-1">{f.period_date}</td>
                          <td className="font-mono text-[9px] text-amber-600 dark:text-amber-400 text-right py-1 px-1">{f.predicted_index.toFixed(1)}</td>
                          <td className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">{f.lower_bound.toFixed(1)}</td>
                          <td className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">{f.upper_bound.toFixed(1)}</td>
                          <td className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">{(f.confidence * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <AlertTriangle className="w-6 h-6 text-muted-foreground" />
              <div className="font-mono text-[10px] text-muted-foreground">
                Insufficient CCI data for {formatRegion(selectedRegion)} forecasting
              </div>
              <div className="font-mono text-[9px] text-zinc-700">
                Requires at least 3 monthly data points
              </div>
            </div>
          )}
        </Panel>

        {/* GHAI Forecast */}
        <Panel title={`GHAI FORECAST — ${formatRegion(selectedRegion).toUpperCase()}`} className="col-span-6">
          {ghaiForecast ? (
            <div className="space-y-4">
              {/* Current vs Forecast */}
              <div className="flex items-center justify-between p-2 border border-border rounded">
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground">CURRENT</div>
                  <div className="font-mono text-lg text-foreground">
                    {ghaiForecast.current_ghai.toFixed(1)}
                  </div>
                  <CategoryBadge category={ghaiForecast.current_category} />
                </div>
                <ArrowUpRight className="w-5 h-5 text-muted-foreground" />
                <div className="text-right">
                  <div className="font-mono text-[9px] text-muted-foreground">{horizon}M FORECAST</div>
                  <div className="font-mono text-lg text-amber-600 dark:text-amber-400">
                    {ghaiEndValue?.predicted_ghai.toFixed(1) ?? '—'}
                  </div>
                  {ghaiEndValue && <CategoryBadge category={ghaiEndValue.predicted_category} />}
                </div>
              </div>

              <ForecastChart
                forecast={ghaiForecast.forecast.map(f => ({
                  period_date: f.period_date,
                  predicted: f.predicted_ghai,
                  lower: f.lower_bound,
                  upper: f.upper_bound,
                }))}
                height={120}
                label="COMPOSITE GHAI WITH CONFIDENCE BAND"
              />

              {/* Sub-index forecasts */}
              <div className="border-t border-border pt-2">
                <div className="font-mono text-[9px] text-muted-foreground mb-2">SUB-INDEX FORECASTS</div>
                <div className="grid grid-cols-3 gap-3">
                  {(['mhai', 'chai', 'rhai'] as const).map(idx => {
                    const subData = ghaiForecast.sub_index_forecasts[idx]
                    const labels: Record<string, string> = {
                      mhai: 'MORTGAGE',
                      chai: 'CASH',
                      rhai: 'RENTAL',
                    }
                    const colors: Record<string, string> = {
                      mhai: 'text-blue-600 dark:text-blue-400',
                      chai: 'text-green-600 dark:text-green-400',
                      rhai: 'text-purple-600 dark:text-purple-400',
                    }
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="font-mono text-[9px] text-muted-foreground">{labels[idx]}</div>
                        {subData.length > 0 && (
                          <>
                            <div className={cn('font-mono text-sm', colors[idx])}>
                              {subData[subData.length - 1].predicted.toFixed(1)}
                            </div>
                            <div className="font-mono text-[9px] text-muted-foreground">
                              from {subData[0].predicted.toFixed(1)}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Model Info */}
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">METHOD</span>
                  <span className="text-muted-foreground">{ghaiForecast.model_info.method.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">DATA POINTS</span>
                  <span className="text-foreground">{ghaiForecast.model_info.data_points}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">MONTHLY TREND</span>
                  <TrendBadge direction={ghaiForecast.model_info.trend_direction} />
                </div>
              </div>

              {/* Forecast Table */}
              <div className="border-t border-border pt-2">
                <div className="overflow-x-auto max-h-36 overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="font-mono text-[9px] text-muted-foreground text-left py-1 px-1">DATE</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">GHAI</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">LOWER</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">UPPER</th>
                        <th className="font-mono text-[9px] text-muted-foreground text-left py-1 px-1">CATEGORY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ghaiForecast.forecast.map((f, i) => (
                        <tr key={i} className="border-b border-border/30">
                          <td className="font-mono text-[9px] text-muted-foreground py-1 px-1">{f.period_date}</td>
                          <td className="font-mono text-[9px] text-amber-600 dark:text-amber-400 text-right py-1 px-1">{f.predicted_ghai.toFixed(1)}</td>
                          <td className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">{f.lower_bound.toFixed(1)}</td>
                          <td className="font-mono text-[9px] text-muted-foreground text-right py-1 px-1">{f.upper_bound.toFixed(1)}</td>
                          <td className="py-1 px-1"><CategoryBadge category={f.predicted_category} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <AlertTriangle className="w-6 h-6 text-muted-foreground" />
              <div className="font-mono text-[10px] text-muted-foreground">
                Insufficient GHAI data for {formatRegion(selectedRegion)} forecasting
              </div>
              <div className="font-mono text-[9px] text-zinc-700">
                Requires at least 3 monthly data points
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
