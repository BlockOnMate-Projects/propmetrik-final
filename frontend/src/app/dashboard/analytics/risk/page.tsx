'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  AlertTriangle,
  Droplets,
  Scale,
  MapPin,
  RefreshCw,
  Shield,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  ChevronDown,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface FloodRiskScore {
  score: number
  level: string
  nearby_incidents: number
  nearest_incident_distance_m: number | null
  neighborhood_risk: number
  risk_factors: string[]
  zone_type?: string
  avg_severity?: number
  recommendation?: string
}

interface FloodIncident {
  id: string
  source: string
  incident_date: string
  description: string
  severity: string
  severity_score: number
  neighborhood: string
  city: string
  latitude: number
  longitude: number
}

interface LitigationCase {
  id: string
  case_reference: string
  dispute_type: string
  status: string
  region: string
  city: string
  neighborhood: string
  filing_date: string
  risk_score: number
  involves_landguard: boolean
  parties_involved: string
  description: string
}

interface LitigationHotspot {
  neighborhood: string
  city: string
  region: string
  total_cases: number
  active_cases: number
  avg_risk_score: number
  landguard_cases: number
  common_dispute_type: string
}

interface LitigationTrend {
  month: string
  case_count: number
  landguard_count: number
}

// =====================================================
// API
// =====================================================

async function fetchFlood<T>(endpoint: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await authedFetch(`/api/flood-risk${endpoint}`, { signal })
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  } catch {
    return null
  }
}

async function fetchLitigation<T>(endpoint: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await authedFetch(`/api/litigation${endpoint}`, { signal })
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

function RiskBadge({ score }: { score: number }) {
  const level =
    score >= 75 ? { label: 'CRITICAL', color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20' } :
    score >= 50 ? { label: 'HIGH', color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20' } :
    score >= 25 ? { label: 'MODERATE', color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' } :
    { label: 'LOW', color: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20' }
  return (
    <span className={cn('px-1.5 py-0.5 font-mono text-[9px] border rounded', level.color)}>
      {level.label} ({score})
    </span>
  )
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    moderate: 'bg-amber-500',
    low: 'bg-green-500',
    minor: 'bg-blue-500',
  }
  return <span className={cn('inline-block w-2 h-2 rounded-full', colors[severity] || 'bg-zinc-500')} />
}

function MiniSparkline({ data, height = 32 }: { data: number[]; height?: number }) {
  const clean = data.map((v) => (typeof v === 'number' && isFinite(v) ? v : 0))
  if (clean.length < 2) return null
  const max = Math.max(...clean)
  const min = Math.min(...clean)
  const range = max - min || 1
  const w = 100
  const denom = Math.max(1, clean.length - 1)
  const points = clean
    .map((v, i) => {
      const x = (i / denom) * w
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
    </svg>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function RiskAnalyticsPage() {
  // Flood data
  const [floodScore, setFloodScore] = useState<FloodRiskScore | null>(null)
  const [incidents, setIncidents] = useState<FloodIncident[]>([])
  // Litigation data
  const [cases, setCases] = useState<LitigationCase[]>([])
  const [hotspots, setHotspots] = useState<LitigationHotspot[]>([])
  const [trends, setTrends] = useState<LitigationTrend[]>([])
  const [caseTotal, setCaseTotal] = useState(0)
  // UI state
  const [loading, setLoading] = useState(true)
  const [selectedCity, setSelectedCity] = useState('Accra')
  const [showCityDropdown, setShowCityDropdown] = useState(false)

  const cities = ['Accra', 'Kumasi', 'Takoradi', 'Tamale', 'Cape Coast', 'Ho', 'Sunyani']

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [
      scoreData,
      incidentData,
      caseData,
      hotspotData,
      trendData,
    ] = await Promise.all([
      fetchFlood<FloodRiskScore>(`/score?lat=5.6037&lng=-0.1870&radius=2000`, signal),
      fetchFlood<FloodIncident[]>(`/incidents?city=${selectedCity}&limit=50`, signal),
      fetchLitigation<LitigationCase[]>(`/cases?city=${selectedCity}&limit=50`, signal),
      fetchLitigation<LitigationHotspot[]>(`/hotspots?city=${selectedCity}`, signal),
      fetchLitigation<LitigationTrend[]>(`/trends?city=${selectedCity}&months=12`, signal),
    ])
    if (signal?.aborted) return

    setFloodScore(scoreData)
    setIncidents(incidentData || [])

    // Litigation cases response wraps in pagination
    if (Array.isArray(caseData)) {
      setCases(caseData)
      setCaseTotal(caseData.length)
    } else if (caseData && typeof caseData === 'object') {
      const cd = caseData as any
      setCases(cd.cases || cd || [])
      setCaseTotal(cd.total || cd.cases?.length || 0)
    }

    setHotspots(hotspotData || [])
    setTrends(trendData || [])
    setLoading(false)
  }, [selectedCity])

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
            <div className="col-span-7 h-72 bg-muted/50 rounded border border-border" />
            <div className="col-span-5 h-72 bg-muted/50 rounded border border-border" />
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8 h-64 bg-muted/50 rounded border border-border" />
            <div className="col-span-4 h-64 bg-muted/50 rounded border border-border" />
          </div>
        </div>
      </div>
    )
  }

  const activeHotspots = hotspots.filter(h => h.active_cases > 0)
  const totalActiveCases = cases.filter(c => c.status === 'active' || c.status === 'pending').length
  const landguardCases = cases.filter(c => c.involves_landguard).length
  const avgRisk = hotspots.length > 0
    ? Math.round(hotspots.reduce((s, h) => s + (Number(h.avg_risk_score) || 0), 0) / hotspots.length)
    : 0
  const trendPoints = trends.map(t => t.case_count)

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            RISK ANALYTICS
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Climate & Flood Risk · Land Litigation Monitoring · NADMO Data Integration — Section 9.1
          </p>
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
        <Panel title="FLOOD RISK SCORE">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Droplets className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-mono text-[10px] text-muted-foreground">HYPER-LOCAL</span>
            </div>
            <div className="font-mono text-2xl text-blue-600 dark:text-blue-400">
              {floodScore ? floodScore.score : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {floodScore ? floodScore.level.toUpperCase() : 'NO DATA'}
            </div>
          </div>
        </Panel>

        <Panel title="INCIDENTS NEARBY">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Flame className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span className="font-mono text-[10px] text-muted-foreground">WITHIN 2KM</span>
            </div>
            <div className="font-mono text-2xl text-orange-600 dark:text-orange-400">
              {floodScore?.nearby_incidents ?? incidents.length}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {incidents.filter(i => i.severity === 'major' || i.severity === 'catastrophic').length} SEVERE
            </div>
          </div>
        </Panel>

        <Panel title="LITIGATION CASES">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Scale className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span className="font-mono text-[10px] text-muted-foreground">TOTAL</span>
            </div>
            <div className="font-mono text-2xl text-purple-600 dark:text-purple-400">
              {caseTotal}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {totalActiveCases} ACTIVE
            </div>
          </div>
        </Panel>

        <Panel title="LANDGUARD CASES">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span className="font-mono text-[10px] text-muted-foreground">DISPUTES</span>
            </div>
            <div className="font-mono text-2xl text-red-600 dark:text-red-400">
              {landguardCases}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {caseTotal > 0 ? Math.round((landguardCases / caseTotal) * 100) : 0}% OF TOTAL
            </div>
          </div>
        </Panel>

        <Panel title="AVG RISK SCORE">
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Activity className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-mono text-[10px] text-muted-foreground">HOTSPOT AVG</span>
            </div>
            <div className="font-mono text-2xl text-amber-600 dark:text-amber-400">
              {avgRisk}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {activeHotspots.length} HOTSPOTS
            </div>
          </div>
        </Panel>
      </div>

      {/* Main Grid — Hotspots + Trends */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Litigation Hotspots Table */}
        <Panel title="LITIGATION HOTSPOTS" className="col-span-7">
          {hotspots.length > 0 ? (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">NEIGHBORHOOD</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">CASES</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">ACTIVE</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">LANDGUARD</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">RISK</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">TYPE</th>
                  </tr>
                </thead>
                <tbody>
                  {hotspots.map((h, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        {h.neighborhood || h.city}
                      </td>
                      <td className="font-mono text-[10px] text-foreground text-right py-1.5 px-2">{h.total_cases}</td>
                      <td className="font-mono text-[10px] text-amber-600 dark:text-amber-400 text-right py-1.5 px-2">{h.active_cases}</td>
                      <td className="font-mono text-[10px] text-red-600 dark:text-red-400 text-right py-1.5 px-2">{h.landguard_cases}</td>
                      <td className="text-right py-1.5 px-2">
                        <RiskBadge score={Math.round(h.avg_risk_score)} />
                      </td>
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        {(h.common_dispute_type || '—').toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-8">
              No litigation hotspots for {selectedCity}
            </div>
          )}
        </Panel>

        {/* Case Trend */}
        <Panel title="LITIGATION TREND (12M)" className="col-span-5">
          {trends.length > 0 ? (
            <div className="space-y-3">
              <MiniSparkline data={trendPoints} height={100} />
              <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                <span>{trends[0]?.month}</span>
                <span>{trends[trends.length - 1]?.month}</span>
              </div>
              <div className="space-y-1.5 border-t border-border pt-2">
                {trends.slice(-3).reverse().map((t, i) => (
                  <div key={i} className="flex justify-between font-mono text-[10px]">
                    <span className="text-muted-foreground">{t.month}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{t.case_count} TOTAL</span>
                      <span className="text-red-600 dark:text-red-400">{t.landguard_count} LANDGUARD</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-8">
              No trend data available
            </div>
          )}
        </Panel>
      </div>

      {/* Bottom Grid — Flood Incidents + Recent Cases */}
      <div className="grid grid-cols-12 gap-3">
        {/* Flood Incidents */}
        <Panel title="FLOOD INCIDENTS" className="col-span-5">
          {incidents.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {incidents.slice(0, 15).map((inc, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border/50">
                  <SeverityDot severity={inc.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground truncate">
                        {inc.neighborhood || inc.city}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                        {inc.incident_date ? new Date(inc.incident_date).toLocaleDateString('en-GB') : '—'}
                      </span>
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground truncate">
                      {inc.description || `${inc.severity} severity flood incident`}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        'font-mono text-[8px] px-1 py-0.5 border rounded',
                        inc.severity === 'critical' ? 'text-red-600 dark:text-red-400 border-red-500/20' :
                        inc.severity === 'high' ? 'text-orange-600 dark:text-orange-400 border-orange-500/20' :
                        inc.severity === 'moderate' ? 'text-amber-600 dark:text-amber-400 border-amber-500/20' :
                        'text-green-600 dark:text-green-400 border-green-500/20'
                      )}>
                        {inc.severity.toUpperCase()}
                      </span>
                      <span className="font-mono text-[8px] text-muted-foreground">
                        {inc.source.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground text-center py-8">
              No flood incidents recorded for {selectedCity}
            </div>
          )}
        </Panel>

        {/* Recent Litigation Cases */}
        <Panel title="RECENT LITIGATION CASES" className="col-span-7">
          {cases.length > 0 ? (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">REFERENCE</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">TYPE</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-left py-1.5 px-2">AREA</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-right py-1.5 px-2">RISK</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-center py-1.5 px-2">STATUS</th>
                    <th className="font-mono text-[10px] text-muted-foreground text-center py-1.5 px-2">GUARD</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.slice(0, 15).map((c, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2 truncate max-w-[120px]">
                        {c.case_reference || `CASE-${(i + 1).toString().padStart(4, '0')}`}
                      </td>
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        {(c.dispute_type || '—').toUpperCase().slice(0, 15)}
                      </td>
                      <td className="font-mono text-[10px] text-muted-foreground py-1.5 px-2">
                        {c.neighborhood || c.city}
                      </td>
                      <td className="text-right py-1.5 px-2">
                        <RiskBadge score={c.risk_score || 0} />
                      </td>
                      <td className="text-center py-1.5 px-2">
                        <span className={cn(
                          'font-mono text-[9px] px-1.5 py-0.5 border rounded',
                          c.status === 'active' ? 'text-amber-600 dark:text-amber-400 border-amber-500/20' :
                          c.status === 'resolved' ? 'text-green-600 dark:text-green-400 border-green-500/20' :
                          'text-muted-foreground border-border'
                        )}>
                          {(c.status || 'UNKNOWN').toUpperCase()}
                        </span>
                      </td>
                      <td className="text-center py-1.5 px-2">
                        {c.involves_landguard ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 inline" />
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
              No litigation cases for {selectedCity}
            </div>
          )}
        </Panel>
      </div>

      {/* Flood Risk Assessment Detail */}
      {floodScore && (
        <div className="mt-4">
          <Panel title="FLOOD RISK ASSESSMENT DETAIL">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <div className="font-mono text-[9px] text-muted-foreground">ZONE TYPE</div>
                <div className={cn(
                  'font-mono text-sm',
                  floodScore.zone_type === 'critical' ? 'text-red-600 dark:text-red-400' :
                  floodScore.zone_type === 'prone' ? 'text-orange-600 dark:text-orange-400' :
                  'text-green-600 dark:text-green-400'
                )}>
                  {floodScore.zone_type?.toUpperCase()}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="font-mono text-[9px] text-muted-foreground">NEAREST INCIDENT</div>
                <div className="font-mono text-sm text-foreground">
                  {floodScore.nearest_incident_distance_m
                    ? `${Math.round(floodScore.nearest_incident_distance_m)}m`
                    : '—'}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="font-mono text-[9px] text-muted-foreground">AVG SEVERITY</div>
                <div className="font-mono text-sm text-foreground">
                  {floodScore.avg_severity?.toFixed(1) ?? '—'}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="font-mono text-[9px] text-muted-foreground">RECOMMENDATION</div>
                <div className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                  {floodScore.recommendation || 'No specific recommendation'}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
