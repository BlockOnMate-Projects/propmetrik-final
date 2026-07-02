'use client'

/**
 * MigrationFlowMatrix (Slice 4)
 *
 * Region × region heatmap of GSS GLSS7 inter-regional migration flows. Each column
 * (region of current residence) sums to 100% across origin rows; the diagonal is
 * the within-region non-migrant share. Off-diagonal cells shade green with the
 * inflow percentage — darker = larger flow. Highlights where each region's current
 * residents previously lived.
 *
 * GLSS7 uses the pre-2019 10-region classification (includes Brong Ahafo), so this
 * grid shows those regions verbatim.
 */

import { cn } from '@/lib/utils'

interface FlowCell {
  origin: string
  dest: string
  flow_pct: number | null
}

interface MigrationFlowMatrixProps {
  regions: string[]
  flows: FlowCell[]
}

function regionLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Short label for the compact column headers (e.g. "Greater Accra" → "Gt Accra"). */
function shortLabel(key: string): string {
  const full = regionLabel(key)
  return full.replace('Greater Accra', 'Gt Accra').replace('Brong Ahafo', 'Brong A.')
}

export default function MigrationFlowMatrix({ regions, flows }: MigrationFlowMatrixProps) {
  if (!regions.length || !flows.length) {
    return (
      <div className="font-mono text-[10px] text-muted-foreground py-6 text-center">
        GLSS7 migration matrix not yet populated.
      </div>
    )
  }

  // Index flows by "origin|dest" for O(1) cell lookup.
  const byKey = new Map<string, number | null>()
  for (const f of flows) byKey.set(`${f.origin}|${f.dest}`, f.flow_pct)

  // Largest off-diagonal inflow per destination — labels the top source of migrants.
  const topInflow = (dest: string): { origin: string; pct: number } | null => {
    let best: { origin: string; pct: number } | null = null
    for (const origin of regions) {
      if (origin === dest) continue
      const v = byKey.get(`${origin}|${dest}`)
      if (v !== null && v !== undefined && (!best || v > best.pct)) best = { origin, pct: v }
    }
    return best
  }

  // Colour scale for off-diagonal inflow cells (0 → transparent, ≥30% → strong green).
  const cellStyle = (pct: number | null, isDiagonal: boolean): React.CSSProperties => {
    if (pct === null) return {}
    if (isDiagonal) {
      // Diagonal (non-migrants) shaded neutral-slate, intensity by magnitude.
      const a = Math.min(0.5, pct / 200)
      return { backgroundColor: `rgba(100, 116, 139, ${a})` }
    }
    const a = Math.min(0.85, pct / 30)
    return { backgroundColor: `rgba(34, 197, 94, ${a})` }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="border-collapse font-mono text-[9px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-muted-foreground border-b border-border">
                From ↓ / To →
              </th>
              {regions.map((dest) => (
                <th
                  key={dest}
                  className="px-1.5 py-1 text-muted-foreground border-b border-border whitespace-nowrap text-center"
                  title={regionLabel(dest)}
                >
                  {shortLabel(dest)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((origin) => (
              <tr key={origin}>
                <td className="sticky left-0 z-10 bg-card px-2 py-1 text-muted-foreground whitespace-nowrap border-r border-border">
                  {shortLabel(origin)}
                </td>
                {regions.map((dest) => {
                  const pct = byKey.get(`${origin}|${dest}`) ?? null
                  const isDiagonal = origin === dest
                  return (
                    <td
                      key={dest}
                      className={cn(
                        'px-1.5 py-1 text-center tabular-nums border border-border/40',
                        isDiagonal ? 'text-slate-500 dark:text-slate-400' : 'text-foreground',
                      )}
                      style={cellStyle(pct, isDiagonal)}
                      title={`${regionLabel(origin)} → ${regionLabel(dest)}: ${pct !== null ? pct.toFixed(1) + '%' : 'n/a'}`}
                    >
                      {pct !== null ? pct.toFixed(pct >= 10 ? 0 : 1) : '·'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top-source callouts for the largest-inflow destinations. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-muted-foreground">
        {['greater_accra', 'ashanti'].filter((r) => regions.includes(r)).map((dest) => {
          const top = topInflow(dest)
          if (!top) return null
          return (
            <span key={dest}>
              <span className="text-foreground">{regionLabel(dest)}</span>: top external source{' '}
              <span className="text-green-600 dark:text-green-400">
                {regionLabel(top.origin)} ({top.pct.toFixed(1)}%)
              </span>
            </span>
          )
        })}
      </div>

      <div className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
        <span>Inflow %</span>
        <span className="inline-block w-16 h-2 rounded" style={{ background: 'linear-gradient(to right, rgba(34,197,94,0.05), rgba(34,197,94,0.85))' }} />
        <span>higher →</span>
        <span className="ml-2 inline-block w-3 h-2 rounded" style={{ backgroundColor: 'rgba(100,116,139,0.35)' }} />
        <span>diagonal = within-region (non-migrants)</span>
      </div>
    </div>
  )
}
