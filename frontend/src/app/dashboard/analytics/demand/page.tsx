'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  Users,
  TrendingUp,
  Briefcase,
  RefreshCw,
  Trophy,
  AlertTriangle,
  Info,
} from 'lucide-react'
import RegionalHeatmap from '@/components/analytics/RegionalHeatmap'

// =====================================================
// TYPES
// =====================================================

interface RHDSScore {
  region: string
  rhds_score: number | null
  pop_growth_component: number | null
  employment_component: number | null
  earnings_component: number | null
  migration_component: number | null
  migration_active: boolean
  pop_growth_20to40_pct: number | null
  total_pop_current: number | null
  total_pop_2030: number | null
}

interface PopulationRow {
  region: string
  base_working_age: number | null
  horizon_working_age: number | null
  base_total: number | null
  horizon_total: number | null
  growth_pct: number | null
}

interface EmploymentRow {
  region: string
  formal_employment_pct: number | null
  unemployment_rate: number | null
}

interface PovertyRow {
  region: string
  mpi_incidence: number | null
  mpi_intensity: number | null
  mpi_m0: number | null
  top_contributor: string | null
}

interface DemandData {
  rhds: RHDSScore[]
  population: PopulationRow[]
  employment: EmploymentRow[]
  poverty: PovertyRow[]
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

function regionLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

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

/** Horizontal bar row for ranked comparisons. */
function BarRow({
  label,
  value,
  max,
  suffix = '',
  color = 'bg-amber-500',
  onClick,
  active,
  secondary,
}: {
  label: string
  value: number | null
  max: number
  suffix?: string
  color?: string
  onClick?: () => void
  active?: boolean
  secondary?: string
}) {
  const pct = value !== null && max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-1 py-1 text-left transition-colors',
        onClick && 'hover:bg-muted/40',
        active && 'bg-muted/60',
      )}
    >
      <span className="w-28 shrink-0 font-mono text-[11px] text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-3 bg-muted/40 relative overflow-hidden">
        <div className={cn('h-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-foreground">
        {value !== null ? `${value.toFixed(1)}${suffix}` : '—'}
      </span>
      {secondary && <span className="w-14 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{secondary}</span>}
    </button>
  )
}

function ComponentBar({ label, value }: { label: string; value: number | null }) {
  const pct = value !== null ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 font-mono text-[10px] text-muted-foreground">{label}</span>
      <div className="flex-1 h-2.5 bg-muted/40 relative overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-[10px] text-foreground">
        {value !== null ? value.toFixed(0) : '—'}
      </span>
    </div>
  )
}

// =====================================================
// PAGE
// =====================================================

export default function HousingDemandPage() {
  const [data, setData] = useState<DemandData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    const d = await fetchData<DemandData>('/demand', signal)
    if (d) {
      setData(d)
      if (!selectedRegion && d.rhds.length > 0) setSelectedRegion(d.rhds[0].region)
    }
    setLoading(false)
  }, [selectedRegion])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const recompute = async () => {
    setRefreshing(true)
    try {
      await authedFetch(`${API_BASE}/demand/recompute`, { method: 'POST' })
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 font-mono text-sm text-muted-foreground">Loading housing demand analytics…</div>
    )
  }

  if (!data || data.rhds.length === 0) {
    return (
      <div className="p-6">
        <Panel title="REGIONAL HOUSING DEMAND">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            No demand data yet. The PHC 2021 population/employment census must sync first.
          </div>
        </Panel>
      </div>
    )
  }

  const rhds = data.rhds
  const migrationActive = rhds.some((r) => r.migration_active)
  const maxRhds = Math.max(...rhds.map((r) => r.rhds_score ?? 0), 1)
  const top5 = rhds.slice(0, 5)

  const popSorted = [...data.population].sort((a, b) => (b.growth_pct ?? -999) - (a.growth_pct ?? -999))
  const maxPopGrowth = Math.max(...popSorted.map((p) => p.growth_pct ?? 0), 1)
  const empSorted = [...data.employment].sort((a, b) => (b.formal_employment_pct ?? -1) - (a.formal_employment_pct ?? -1))
  const maxFormal = Math.max(...empSorted.map((e) => e.formal_employment_pct ?? 0), 1)

  const selected = rhds.find((r) => r.region === selectedRegion) ?? rhds[0]
  const selectedPop = data.population.find((p) => p.region === selected.region)

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-lg text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            REGIONAL HOUSING DEMAND
          </h1>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
            RHDS composite from PHC 2021 population projections, employment structure &amp; real household earnings
          </p>
        </div>
        <button
          type="button"
          onClick={recompute}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-card/50 hover:bg-muted/50 font-mono text-[11px] text-muted-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          RECOMPUTE
        </button>
      </div>

      {/* Row 1: Heatmap + Top 5 */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <Panel title="REGIONAL DEMAND SCORE (RHDS)" className="col-span-12 lg:col-span-5">
          <RegionalHeatmap
            data={rhds
              .filter((r) => r.rhds_score !== null)
              .map((r) => ({ region: r.region, value: r.rhds_score as number, label: regionLabel(r.region) }))}
            metric="RHDS"
            colorScale="green-red"
            onRegionClick={(region) => setSelectedRegion(region)}
            selectedRegion={selectedRegion}
            valueFormat={(v) => v.toFixed(0)}
          />
        </Panel>

        <Panel
          title="TOP 5 HIGH-DEMAND REGIONS"
          className="col-span-12 lg:col-span-7"
          actions={<Trophy className="w-3 h-3 text-amber-500" />}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 pb-1 border-b border-border font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
              <span className="w-6">#</span>
              <span className="flex-1">Region</span>
              <span className="w-14 text-right">RHDS</span>
              <span className="w-24 text-right">Pop 20–40 growth</span>
            </div>
            {top5.map((r, i) => (
              <button
                key={r.region}
                type="button"
                onClick={() => setSelectedRegion(r.region)}
                className={cn(
                  'w-full flex items-center gap-2 px-1 py-1.5 text-left hover:bg-muted/40',
                  selectedRegion === r.region && 'bg-muted/60',
                )}
              >
                <span className="w-6 font-mono text-[11px] text-amber-500">{i + 1}</span>
                <span className="flex-1 font-mono text-xs text-foreground">{regionLabel(r.region)}</span>
                <span className="w-14 text-right font-mono text-xs text-foreground">{r.rhds_score?.toFixed(1) ?? '—'}</span>
                <span className="w-24 text-right font-mono text-xs text-green-600 dark:text-green-400">
                  {r.pop_growth_20to40_pct !== null ? `+${r.pop_growth_20to40_pct.toFixed(1)}%` : '—'}
                </span>
              </button>
            ))}
            {!migrationActive && (
              <div className="mt-2 flex items-start gap-1.5 px-1 pt-2 border-t border-border">
                <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                <span className="font-mono text-[9px] text-muted-foreground leading-relaxed">
                  Migration flow factor pending GLSS7 inter-regional matrix (Slice 4); RHDS currently weights
                  population growth, employment &amp; earnings.
                </span>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Row 2: Population cohort + Employment */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <Panel
          title="POPULATION 20–40 COHORT GROWTH (2021 → 2030)"
          className="col-span-12 lg:col-span-6"
          actions={<TrendingUp className="w-3 h-3 text-amber-500" />}
        >
          <div className="space-y-0.5">
            {popSorted.map((p) => (
              <BarRow
                key={p.region}
                label={regionLabel(p.region)}
                value={p.growth_pct}
                max={maxPopGrowth}
                suffix="%"
                color="bg-green-500"
                onClick={() => setSelectedRegion(p.region)}
                active={selectedRegion === p.region}
                secondary={p.horizon_working_age ? `${(p.horizon_working_age / 1e6).toFixed(1)}M` : undefined}
              />
            ))}
            <div className="pt-1 mt-1 border-t border-border font-mono text-[9px] text-muted-foreground">
              Bar = 20–40 cohort growth to 2030 · right = projected 2030 cohort (millions)
            </div>
          </div>
        </Panel>

        <Panel
          title="FORMAL EMPLOYMENT RATE BY REGION"
          className="col-span-12 lg:col-span-6"
          actions={<Briefcase className="w-3 h-3 text-amber-500" />}
        >
          <div className="space-y-0.5">
            {empSorted.map((e) => (
              <BarRow
                key={e.region}
                label={regionLabel(e.region)}
                value={e.formal_employment_pct}
                max={maxFormal}
                suffix="%"
                color="bg-blue-500"
                onClick={() => setSelectedRegion(e.region)}
                active={selectedRegion === e.region}
                secondary={e.unemployment_rate !== null ? `${e.unemployment_rate.toFixed(0)}% u` : undefined}
              />
            ))}
            <div className="pt-1 mt-1 border-t border-border font-mono text-[9px] text-muted-foreground">
              Bar = formal employment share (PHC 2021) · right = unemployment rate
            </div>
          </div>
        </Panel>
      </div>

      {/* Row 3: Selected region decomposition */}
      <Panel title={`DEMAND SCORE COMPONENTS — ${regionLabel(selected.region).toUpperCase()}`}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-7 space-y-2">
            <ComponentBar label="Population growth" value={selected.pop_growth_component} />
            <ComponentBar label="Employment" value={selected.employment_component} />
            <ComponentBar label="Earnings" value={selected.earnings_component} />
            <ComponentBar label="Migration" value={migrationActive ? selected.migration_component : null} />
            <div className="pt-1 mt-1 border-t border-border font-mono text-[9px] text-muted-foreground">
              Components are min–max normalised across regions (0–100). Higher = stronger relative demand signal.
            </div>
          </div>
          <div className="col-span-12 md:col-span-5 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">RHDS composite</span>
              <span className="text-amber-500 text-sm">{selected.rhds_score?.toFixed(1) ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">20–40 cohort growth</span>
              <span className="text-foreground">
                {selected.pop_growth_20to40_pct !== null ? `+${selected.pop_growth_20to40_pct.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total population 2030</span>
              <span className="text-foreground">
                {selectedPop?.horizon_total ? selectedPop.horizon_total.toLocaleString() : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Formal employment</span>
              <span className="text-foreground">
                {(() => {
                  const e = data.employment.find((x) => x.region === selected.region)
                  return e?.formal_employment_pct !== null && e?.formal_employment_pct !== undefined
                    ? `${e.formal_employment_pct.toFixed(1)}%` : '—'
                })()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Poverty (MPI M0)</span>
              <span className="text-foreground">
                {(() => {
                  const p = data.poverty.find((x) => x.region === selected.region)
                  return p?.mpi_m0 !== null && p?.mpi_m0 !== undefined ? p.mpi_m0.toFixed(3) : '—'
                })()}
              </span>
            </div>
          </div>
        </div>
      </Panel>

      <div className="mt-3 font-mono text-[9px] text-muted-foreground">
        Source: Ghana Statistical Service — 2021 Population &amp; Housing Census (population projections, employment
        sector, multidimensional poverty) + AHIES/BoG household earnings. Refreshed annually.
      </div>
    </div>
  )
}
