'use client'

/**
 * Neighbourhood Infrastructure Quality Score (NIQS) — Slice 5 §6.3.
 * Heatmap + component breakdown + bottom-10 + NIQS↔price-per-sqm scatter,
 * all from real PHC 2021 infrastructure + ICT census data.
 */

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import { Zap, RefreshCw, AlertTriangle, Info, Droplets } from 'lucide-react'
import RegionalHeatmap from '@/components/analytics/RegionalHeatmap'

interface NIQSScore {
  region: string
  niqs_score: number | null
  electricity_pct: number | null
  piped_water_pct: number | null
  improved_water_pct: number | null
  toilet_pct: number | null
  waste_collection_pct: number | null
  smartphone_pct: number | null
  weakest_component: string | null
  components_used: number
}
interface AvmContext {
  region: string
  niqs_score: number | null
  avg_price_per_sqm: number | null
  listing_count: number
}
interface InfraData { scores: NIQSScore[]; avm_context: AvmContext[] }

const API_BASE = '/api/analytics/platform'

function regionLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function Panel({ title, children, className, actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
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

/** Stacked component bar: each of the 6 NIQS inputs as a segment scaled by its % access. */
function ComponentStack({ s }: { s: NIQSScore }) {
  const segs: { key: string; label: string; value: number | null; color: string }[] = [
    { key: 'electricity', label: 'Electricity', value: s.electricity_pct, color: 'bg-amber-500' },
    { key: 'piped', label: 'Piped water', value: s.piped_water_pct, color: 'bg-blue-500' },
    { key: 'improved', label: 'Improved water', value: s.improved_water_pct, color: 'bg-cyan-500' },
    { key: 'toilet', label: 'Toilet', value: s.toilet_pct, color: 'bg-green-500' },
    { key: 'waste', label: 'Waste collection', value: s.waste_collection_pct, color: 'bg-purple-500' },
    { key: 'smartphone', label: 'Smartphone', value: s.smartphone_pct, color: 'bg-pink-500' },
  ]
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 font-mono text-[10px] text-foreground truncate">{regionLabel(s.region)}</span>
      <div className="flex-1 flex items-center gap-px h-3">
        {segs.map((seg) => (
          <div
            key={seg.key}
            className={cn('h-full', seg.color)}
            style={{ width: `${Math.max(0, seg.value ?? 0) / 6}%`, opacity: seg.value === null ? 0.15 : 0.85 }}
            title={`${seg.label}: ${seg.value !== null ? seg.value.toFixed(0) + '%' : 'n/a'}`}
          />
        ))}
      </div>
      <span className="w-10 text-right font-mono text-[11px] text-amber-500">{s.niqs_score !== null ? s.niqs_score.toFixed(0) : '—'}</span>
    </div>
  )
}

export default function InfrastructurePage() {
  const [data, setData] = useState<InfraData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await authedFetch(`${API_BASE}/infrastructure/scores`, { signal })
      if (!res.ok) { setData(null); return }
      const json = await res.json()
      setData(json.data ?? null)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [load])

  const recompute = async () => {
    setRefreshing(true)
    try {
      await authedFetch(`${API_BASE}/infrastructure/recompute`, { method: 'POST' })
      await load()
    } finally { setRefreshing(false) }
  }

  if (loading) return <div className="p-6 font-mono text-sm text-muted-foreground">Loading infrastructure analytics…</div>
  if (!data || data.scores.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4" /> No infrastructure scores yet. Try recompute.
        </div>
      </div>
    )
  }

  const scores = data.scores
  const ranked = [...scores].filter(s => s.niqs_score !== null).sort((a, b) => (b.niqs_score ?? 0) - (a.niqs_score ?? 0))
  const bottom10 = [...ranked].reverse().slice(0, 10)
  const heatmapData = scores.filter(s => s.niqs_score !== null).map(s => ({ region: s.region, value: s.niqs_score as number }))

  // AVM premium context: median price-per-sqm for high-NIQS vs low-NIQS regions.
  const avmValid = data.avm_context.filter(a => a.niqs_score !== null && a.avg_price_per_sqm !== null)
  const high = avmValid.filter(a => (a.niqs_score ?? 0) >= 55)
  const low = avmValid.filter(a => (a.niqs_score ?? 0) < 55)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0)
  const highAvg = avg(high.map(a => a.avg_price_per_sqm as number))
  const lowAvg = avg(low.map(a => a.avg_price_per_sqm as number))
  const premiumPct = lowAvg > 0 ? ((highAvg / lowAvg - 1) * 100) : null
  const maxSqm = Math.max(1, ...avmValid.map(a => a.avg_price_per_sqm as number))

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" /> NEIGHBOURHOOD INFRASTRUCTURE QUALITY (NIQS)
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Electricity · Water · Sanitation · ICT — 0–100 composite from Ghana Statistical Service PHC 2021
          </p>
        </div>
        <button
          onClick={recompute}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} /> RECOMPUTE
        </button>
      </div>

      {/* Row 1: Heatmap + component breakdown */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <Panel title="NIQS HEATMAP (higher = better infrastructure)" className="col-span-12 lg:col-span-5" actions={<Zap className="w-3 h-3 text-amber-500" />}>
          <RegionalHeatmap data={heatmapData} metric="NIQS" colorScale="blue" valueFormat={(v) => v.toFixed(0)} />
        </Panel>

        <Panel title="COMPONENT BREAKDOWN BY REGION" className="col-span-12 lg:col-span-7" actions={<Droplets className="w-3 h-3 text-amber-500" />}>
          <div className="space-y-1">
            {ranked.map((s) => <ComponentStack key={s.region} s={s} />)}
            <div className="pt-2 mt-1 border-t border-border flex flex-wrap gap-x-3 gap-y-1 font-mono text-[8px] text-muted-foreground">
              <span><span className="inline-block w-2 h-2 bg-amber-500 mr-1" />Electricity</span>
              <span><span className="inline-block w-2 h-2 bg-blue-500 mr-1" />Piped water</span>
              <span><span className="inline-block w-2 h-2 bg-cyan-500 mr-1" />Improved water</span>
              <span><span className="inline-block w-2 h-2 bg-green-500 mr-1" />Toilet</span>
              <span><span className="inline-block w-2 h-2 bg-purple-500 mr-1" />Waste</span>
              <span><span className="inline-block w-2 h-2 bg-pink-500 mr-1" />Smartphone</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Row 2: Bottom 10 + AVM premium scatter */}
      <div className="grid grid-cols-12 gap-3">
        <Panel title="LOWEST-INFRASTRUCTURE REGIONS" className="col-span-12 lg:col-span-5">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-[9px]">
                <th className="text-left py-1">REGION</th>
                <th className="text-right py-1">NIQS</th>
                <th className="text-left py-1 pl-3">WEAKEST</th>
              </tr>
            </thead>
            <tbody>
              {bottom10.map((s) => (
                <tr key={s.region} className="border-b border-border/50">
                  <td className="py-1 text-foreground">{regionLabel(s.region)}</td>
                  <td className="py-1 text-right text-red-600 dark:text-red-400">{s.niqs_score?.toFixed(1)}</td>
                  <td className="py-1 pl-3 text-muted-foreground">{s.weakest_component ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="AVM PREMIUM CONTEXT — NIQS vs PRICE/SQM" className="col-span-12 lg:col-span-7">
          {avmValid.length > 0 ? (
            <div className="space-y-1">
              {[...avmValid].sort((a, b) => (b.niqs_score ?? 0) - (a.niqs_score ?? 0)).map((a) => (
                <div key={a.region} className="flex items-center gap-2">
                  <span className="w-24 font-mono text-[10px] text-foreground truncate">{regionLabel(a.region)}</span>
                  <span className="w-8 text-right font-mono text-[10px] text-amber-500">{a.niqs_score?.toFixed(0)}</span>
                  <div className="flex-1 h-2.5 bg-muted/40 relative overflow-hidden">
                    <div className="h-full bg-cyan-500/70" style={{ width: `${((a.avg_price_per_sqm ?? 0) / maxSqm) * 100}%` }} />
                  </div>
                  <span className="w-20 text-right font-mono text-[10px] text-muted-foreground">
                    {a.avg_price_per_sqm !== null ? `₵${a.avg_price_per_sqm.toLocaleString()}/m²` : '—'}
                  </span>
                </div>
              ))}
              {premiumPct !== null && (
                <div className="pt-2 mt-1 border-t border-border flex items-start gap-1.5">
                  <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="font-mono text-[9px] text-muted-foreground leading-relaxed">
                    Regions with NIQS ≥ 55 carry a median price-per-sqm{' '}
                    <span className={premiumPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {premiumPct >= 0 ? '+' : ''}{premiumPct.toFixed(0)}%
                    </span>{' '}
                    vs. lower-infrastructure regions (real `properties` price data).
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="font-mono text-[10px] text-muted-foreground py-6 text-center">
              No property price-per-sqm data to correlate against NIQS yet.
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-3 font-mono text-[9px] text-muted-foreground">
        Source: Ghana Statistical Service — 2021 Population &amp; Housing Census (electricity, water, sanitation) + ICT
        module (smartphone ownership). NIQS = 0.25·electricity + 0.20·piped + 0.15·improved-water + 0.15·toilet +
        0.15·waste + 0.10·smartphone (weights re-normalised over available components). Recomputed annually.
      </div>
    </div>
  )
}
