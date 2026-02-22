'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  Building2,
  Hammer,
  Users,
  MapPin,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Package,
  Truck,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface CCISummary {
  national_index: number
  baseline_date: string
  components: {
    materials: { value: number; weight: number; change_mom: number; change_yoy: number }
    labor: { value: number; weight: number; change_mom: number; change_yoy: number }
    overhead: { value: number; weight: number; change_mom: number; change_yoy: number }
  }
  regional_indices: Record<string, number>
  historical_trend: Array<{ date: string; value: number }>
}

interface RegionalCost {
  region: string
  multiplier: number
  distance_from_port_km: number
  transport_factor: number
  infrastructure_score: number
  cost_components: { materials: number; labor: number; transport: number }
  trend_6m: number
  trend_12m: number
}

interface MaterialPrice {
  category: string
  sub_category: string | null
  unit_price: number
  currency: string
  unit: string | null
  local_pct: number | null
  import_pct: number | null
  price_volatility: string | null
  change_mom: number | null
  change_yoy: number | null
}

interface MaterialSummary {
  category: string
  items: MaterialPrice[]
  avg_change_yoy: number
  volatility: string
}

interface LaborRate {
  category: string
  skill_level: string
  daily_rate: number
  monthly_rate: number | null
  yoy_change: number | null
  supply_status: string | null
}

interface AlertData {
  id: string
  severity: 'info' | 'warning' | 'critical'
  category: string
  title: string
  message: string
  region: string | null
  created_at: string
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/platform'

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

function MiniBarChart({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((val, i) => (
        <div
          key={i}
          className={cn('w-1.5 rounded-sm', positive ? 'bg-green-500/80' : 'bg-red-500/80')}
          style={{ height: `${Math.max(((val - min) / range) * 100, 4)}%` }}
        />
      ))}
    </div>
  )
}

function ChangeIndicator({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-zinc-600">—</span>
  const positive = value >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-mono text-xs', positive ? 'text-green-400' : 'text-red-400')}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {positive ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  )
}

function VolatilityBadge({ level }: { level: string | null }) {
  if (!level) return null
  const colors: Record<string, string> = {
    low: 'text-green-400 bg-green-500/10 border-green-500/20',
    medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    high: 'text-red-400 bg-red-500/10 border-red-500/20',
  }
  return (
    <span className={cn('px-1.5 py-0.5 font-mono text-[9px] border rounded', colors[level] || 'text-zinc-400 border-zinc-700')}>
      {level.toUpperCase()}
    </span>
  )
}

function SupplyBadge({ status }: { status: string | null }) {
  if (!status) return null
  const colors: Record<string, string> = {
    adequate: 'text-green-400 bg-green-500/10 border-green-500/20',
    moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    shortage: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  }
  return (
    <span className={cn('px-1.5 py-0.5 font-mono text-[9px] border rounded', colors[status] || 'text-zinc-400 border-zinc-700')}>
      {status.toUpperCase()}
    </span>
  )
}

function formatRegion(region: string): string {
  return region
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function ConstructionAnalyticsPage() {
  const [cci, setCci] = useState<CCISummary | null>(null)
  const [regional, setRegional] = useState<RegionalCost[]>([])
  const [materials, setMaterials] = useState<MaterialSummary[]>([])
  const [labor, setLabor] = useState<LaborRate[]>([])
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [cciData, regionalData, materialsData, laborData, alertsData] = await Promise.all([
      fetchData<CCISummary>('/construction/index', signal),
      fetchData<RegionalCost[]>('/construction/regional', signal),
      fetchData<MaterialSummary[]>('/construction/materials/summary', signal),
      fetchData<LaborRate[]>('/construction/labor', signal),
      fetchData<{ recent: AlertData[] }>('/alerts/summary?limit=5', signal),
    ])
    if (signal?.aborted) return
    setCci(cciData)
    setRegional(regionalData || [])
    setMaterials(materialsData || [])
    setLabor(laborData || [])
    setAlerts(alertsData?.recent?.filter((a) => a.category === 'construction') || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    loadData(ac.signal)
    return () => ac.abort()
  }, [loadData])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-64" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
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

  const trendData = cci?.historical_trend?.map((t) => t.value) || []
  const trendPositive = cci ? (cci.components.materials.change_yoy >= 0) : true

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-white flex items-center gap-2">
            <Hammer className="w-5 h-5 text-amber-500" />
            CONSTRUCTION COST INDEX
          </h1>
          <p className="font-mono text-[10px] text-zinc-500">
            Ghana Construction & Labour Cost Analytics — Section 1
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-zinc-400 border border-zinc-700 hover:border-amber-500/50 hover:text-amber-500 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          REFRESH
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Panel title="NATIONAL CCI">
          <div className="text-center">
            <div className="font-mono text-3xl text-white">
              {cci ? cci.national_index.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
            </div>
            <div className="mt-1">
              <ChangeIndicator value={cci?.components.materials.change_yoy ?? null} suffix="% YoY" />
            </div>
            <div className="mt-2">
              <MiniBarChart data={trendData} positive={trendPositive} />
            </div>
          </div>
        </Panel>

        <Panel title="MATERIALS INDEX">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-mono text-[10px] text-zinc-500">{((cci?.components.materials.weight ?? 0.55) * 100).toFixed(0)}% WEIGHT</span>
            </div>
            <div className="font-mono text-2xl text-white">
              {cci?.components.materials.value?.toFixed(2) ?? '—'}
            </div>
            <ChangeIndicator value={cci?.components.materials.change_mom ?? null} suffix="% MoM" />
          </div>
        </Panel>

        <Panel title="LABOR INDEX">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="w-3.5 h-3.5 text-green-400" />
              <span className="font-mono text-[10px] text-zinc-500">{((cci?.components.labor.weight ?? 0.35) * 100).toFixed(0)}% WEIGHT</span>
            </div>
            <div className="font-mono text-2xl text-white">
              {cci?.components.labor.value?.toFixed(2) ?? '—'}
            </div>
            <ChangeIndicator value={cci?.components.labor.change_mom ?? null} suffix="% MoM" />
          </div>
        </Panel>

        <Panel title="OVERHEAD INDEX">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Building2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-mono text-[10px] text-zinc-500">{((cci?.components.overhead.weight ?? 0.10) * 100).toFixed(0)}% WEIGHT</span>
            </div>
            <div className="font-mono text-2xl text-white">
              {cci?.components.overhead.value?.toFixed(2) ?? '—'}
            </div>
            <ChangeIndicator value={cci?.components.overhead.change_mom ?? null} suffix="% MoM" />
          </div>
        </Panel>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Regional Cost Comparison */}
        <Panel title="REGIONAL COST COMPARISON" className="col-span-8">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2">REGION</th>
                <th className="text-right pb-2">MULTIPLIER</th>
                <th className="text-right pb-2">MATERIALS</th>
                <th className="text-right pb-2">LABOR</th>
                <th className="text-right pb-2">TRANSPORT</th>
                <th className="text-right pb-2">INFRA SCORE</th>
                <th className="text-right pb-2">12M TREND</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {regional.map((r) => (
                <tr key={r.region} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 text-white flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-zinc-500" />
                    {formatRegion(r.region)}
                  </td>
                  <td className={cn('py-2 text-right', r.multiplier >= 1.0 ? 'text-amber-400' : 'text-zinc-300')}>
                    {r.multiplier.toFixed(2)}x
                  </td>
                  <td className="py-2 text-right text-zinc-300">₵{r.cost_components.materials.toLocaleString()}</td>
                  <td className="py-2 text-right text-zinc-300">₵{r.cost_components.labor.toLocaleString()}</td>
                  <td className="py-2 text-right text-zinc-300">₵{r.cost_components.transport.toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', r.infrastructure_score >= 70 ? 'bg-green-500' : r.infrastructure_score >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                          style={{ width: `${r.infrastructure_score}%` }}
                        />
                      </div>
                      <span className="text-zinc-400">{r.infrastructure_score}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <ChangeIndicator value={r.trend_12m} />
                  </td>
                </tr>
              ))}
              {regional.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-600 font-mono text-xs">
                    No regional data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        {/* CCI Trend */}
        <Panel title="CCI HISTORICAL TREND" className="col-span-4">
          <div className="space-y-1">
            {cci?.historical_trend?.slice(-12).map((point, i) => {
              const max = Math.max(...(cci?.historical_trend?.map((p) => p.value) || [1]))
              const pct = (point.value / max) * 100
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 font-mono text-[9px] text-zinc-500 shrink-0">
                    {new Date(point.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                  </span>
                  <div className="flex-1 h-3 bg-zinc-800 rounded-sm overflow-hidden">
                    <div className="h-full bg-amber-500/70 rounded-sm" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right font-mono text-[10px] text-zinc-300">
                    {point.value.toFixed(1)}
                  </span>
                </div>
              )
            })}
            {(!cci?.historical_trend || cci.historical_trend.length === 0) && (
              <div className="h-48 flex items-center justify-center text-zinc-600 font-mono text-xs">
                No historical data
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Materials & Labor */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Material Prices */}
        <Panel title="MATERIAL COST ANALYTICS" className="col-span-7">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2">MATERIAL</th>
                <th className="text-right pb-2">PRICE</th>
                <th className="text-right pb-2">LOCAL %</th>
                <th className="text-right pb-2">IMPORT %</th>
                <th className="text-right pb-2">VOLATILITY</th>
                <th className="text-right pb-2">YoY</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {materials.flatMap((group) =>
                group.items.map((item, idx) => (
                  <tr key={`${group.category}-${idx}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-1.5">
                      <div className="text-white">{item.sub_category || item.category}</div>
                      {idx === 0 && (
                        <div className="text-[9px] text-zinc-600 uppercase">{group.category}</div>
                      )}
                    </td>
                    <td className="py-1.5 text-right text-green-400">
                      ₵{item.unit_price.toLocaleString()}{item.unit ? `/${item.unit}` : ''}
                    </td>
                    <td className="py-1.5 text-right text-zinc-400">{item.local_pct ?? '—'}%</td>
                    <td className="py-1.5 text-right text-zinc-400">{item.import_pct ?? '—'}%</td>
                    <td className="py-1.5 text-right">
                      <VolatilityBadge level={item.price_volatility} />
                    </td>
                    <td className="py-1.5 text-right">
                      <ChangeIndicator value={item.change_yoy} />
                    </td>
                  </tr>
                )),
              )}
              {materials.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-600 font-mono text-xs">
                    No material data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        {/* Labor Rates */}
        <Panel title="LABOR MARKET ANALYTICS" className="col-span-5">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2">TRADE</th>
                <th className="text-left pb-2">LEVEL</th>
                <th className="text-right pb-2">DAILY</th>
                <th className="text-right pb-2">MONTHLY</th>
                <th className="text-right pb-2">YoY</th>
                <th className="text-right pb-2">SUPPLY</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {labor.map((r, i) => (
                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-1.5 text-white capitalize">{r.category}</td>
                  <td className="py-1.5 text-zinc-400 capitalize">{r.skill_level.replace('_', ' ')}</td>
                  <td className="py-1.5 text-right text-zinc-300">₵{r.daily_rate.toLocaleString()}</td>
                  <td className="py-1.5 text-right text-zinc-300">
                    {r.monthly_rate ? `₵${r.monthly_rate.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-1.5 text-right">
                    <ChangeIndicator value={r.yoy_change} />
                  </td>
                  <td className="py-1.5 text-right">
                    <SupplyBadge status={r.supply_status} />
                  </td>
                </tr>
              ))}
              {labor.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-600 font-mono text-xs">
                    No labor data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Panel title="CONSTRUCTION ALERTS" className="mb-4">
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
                    alert.severity === 'critical' ? 'text-red-400' : alert.severity === 'warning' ? 'text-amber-400' : 'text-blue-400',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-white">{alert.title}</div>
                  <div className="font-mono text-[10px] text-zinc-400 mt-0.5">{alert.message}</div>
                </div>
                <span className="font-mono text-[9px] text-zinc-600 shrink-0">
                  {new Date(alert.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
