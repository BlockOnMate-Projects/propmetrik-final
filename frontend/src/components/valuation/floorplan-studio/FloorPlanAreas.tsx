'use client'

// ============================================================================
// Measured-areas bridge: surfaces the drawn floor plan's exact GFA / net
// internal area on the valuation method pages, so declared property figures
// can be reconciled against measured reality with one click.
// ============================================================================
import { useEffect, useState } from 'react'
import { floorPlanApi } from '@/lib/valuation-api'

export interface FloorPlanAreas {
  gfa: number
  net: number
  floors: number
}

export function useFloorPlanAreas(valuationId: string | undefined): FloorPlanAreas | null {
  const [areas, setAreas] = useState<FloorPlanAreas | null>(null)
  useEffect(() => {
    if (!valuationId) return
    let alive = true
    floorPlanApi
      .getSummary(valuationId)
      .then((r) => {
        const d = r.data as unknown as {
          total_gross_area_sqm?: number
          total_net_area_sqm?: number
          total_floors?: number
        } | null
        if (alive && r.success && d && typeof d.total_gross_area_sqm === 'number' && d.total_gross_area_sqm > 0) {
          setAreas({
            gfa: Math.round(d.total_gross_area_sqm * 100) / 100,
            net: Math.round((d.total_net_area_sqm ?? 0) * 100) / 100,
            floors: d.total_floors ?? 1,
          })
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [valuationId])
  return areas
}

/**
 * Compact strip showing the measured areas. `basis` picks which figure this
 * method should adopt; `current` + `onApply` enable the one-click adoption
 * (omit them for a purely informational badge).
 */
export function FloorPlanAreasBadge({
  valuationId,
  basis = 'gfa',
  current,
  onApply,
}: {
  valuationId: string | undefined
  basis?: 'gfa' | 'net'
  current?: number
  onApply?: (value: number) => void
}) {
  const areas = useFloorPlanAreas(valuationId)
  if (!areas) return null
  const candidate = basis === 'net' ? areas.net : areas.gfa
  const matches = current != null && Math.abs(candidate - current) <= 0.5
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px]">
      <span className="text-muted-foreground">
        📐 Drawn floor plan: GFA {areas.gfa.toFixed(2)} sqm · Net {areas.net.toFixed(2)} sqm
        {areas.floors > 1 ? ` · ${areas.floors} floors` : ''}
      </span>
      {onApply && !matches && candidate > 0 && (
        <button
          onClick={() => onApply(candidate)}
          className="text-sky-400 underline hover:text-sky-300"
          title={basis === 'net' ? 'Exact net internal (lettable) area from the drawn plan' : 'Exact gross floor area from the drawn plan (IPMS 2)'}
        >
          use {basis === 'net' ? 'net' : 'GFA'} {candidate.toFixed(2)} sqm
        </button>
      )}
      {matches && <span className="text-emerald-500">matches plan</span>}
    </div>
  )
}
