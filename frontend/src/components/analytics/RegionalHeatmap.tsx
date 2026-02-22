'use client'

import { cn } from '@/lib/utils'

// =====================================================
// Ghana Regional Heatmap Component
//
// SVG-based interactive map of Ghana's 16 regions.
// Color-coded by any numeric metric with drill-down support.
// =====================================================

interface RegionData {
  region: string
  value: number
  label?: string
}

interface RegionalHeatmapProps {
  data: RegionData[]
  metric: string                    // e.g. "GHAI", "CCI Multiplier"
  colorScale?: 'green-red' | 'red-green' | 'blue' | 'amber'
  onRegionClick?: (region: string) => void
  selectedRegion?: string | null
  valueFormat?: (value: number) => string
  className?: string
}

// Region positions (simplified grid layout for Ghana regions)
const REGION_LAYOUT: Record<string, { row: number; col: number; name: string }> = {
  upper_west:   { row: 0, col: 0, name: 'Upper West' },
  upper_east:   { row: 0, col: 1, name: 'Upper East' },
  north_east:   { row: 0, col: 2, name: 'North East' },
  savannah:     { row: 1, col: 0, name: 'Savannah' },
  northern:     { row: 1, col: 1, name: 'Northern' },
  oti:          { row: 1, col: 2, name: 'Oti' },
  bono:         { row: 2, col: 0, name: 'Bono' },
  bono_east:    { row: 2, col: 1, name: 'Bono East' },
  volta:        { row: 2, col: 2, name: 'Volta' },
  ahafo:        { row: 3, col: 0, name: 'Ahafo' },
  ashanti:      { row: 3, col: 1, name: 'Ashanti' },
  eastern:      { row: 3, col: 2, name: 'Eastern' },
  western_north:{ row: 4, col: 0, name: 'Western North' },
  central:      { row: 4, col: 1, name: 'Central' },
  greater_accra:{ row: 4, col: 2, name: 'Greater Accra' },
  western:      { row: 5, col: 0, name: 'Western' },
}

function getColor(
  value: number,
  min: number,
  max: number,
  scale: string,
): string {
  const range = max - min || 1
  const normalized = Math.max(0, Math.min(1, (value - min) / range))

  switch (scale) {
    case 'green-red': {
      // High = green, Low = red (e.g., for affordability — higher is better)
      const r = Math.round(255 * (1 - normalized))
      const g = Math.round(200 * normalized)
      return `rgb(${r}, ${g}, 60)`
    }
    case 'red-green': {
      // High = red, Low = green (e.g., for cost multiplier — higher is worse)
      const r = Math.round(255 * normalized)
      const g = Math.round(200 * (1 - normalized))
      return `rgb(${r}, ${g}, 60)`
    }
    case 'blue': {
      const intensity = Math.round(100 + 155 * normalized)
      return `rgb(30, ${Math.round(50 + 100 * normalized)}, ${intensity})`
    }
    case 'amber':
    default: {
      const intensity = Math.round(80 + 175 * normalized)
      return `rgb(${intensity}, ${Math.round(intensity * 0.7)}, 20)`
    }
  }
}

export default function RegionalHeatmap({
  data,
  metric,
  colorScale = 'green-red',
  onRegionClick,
  selectedRegion,
  valueFormat = (v) => v.toFixed(1),
  className,
}: RegionalHeatmapProps) {
  const dataMap = new Map(data.map((d) => [d.region, d]))
  const values = data.map((d) => d.value)
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 100

  const cellW = 108
  const cellH = 60
  const gap = 4
  const padding = 8

  const maxCol = Math.max(...Object.values(REGION_LAYOUT).map((r) => r.col))
  const maxRow = Math.max(...Object.values(REGION_LAYOUT).map((r) => r.row))
  const svgW = (maxCol + 1) * (cellW + gap) + padding * 2
  const svgH = (maxRow + 1) * (cellH + gap) + padding * 2 + 30

  return (
    <div className={cn('', className)}>
      {/* Legend */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="font-mono text-[9px] text-zinc-500 uppercase">{metric} by Region</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-zinc-600">{min.toFixed(1)}</span>
          <div className="w-20 h-2 rounded-sm" style={{
            background: `linear-gradient(to right, ${getColor(min, min, max, colorScale)}, ${getColor((min + max) / 2, min, max, colorScale)}, ${getColor(max, min, max, colorScale)})`,
          }} />
          <span className="font-mono text-[9px] text-zinc-600">{max.toFixed(1)}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full"
        style={{ maxHeight: '420px' }}
      >
        {Object.entries(REGION_LAYOUT).map(([regionKey, layout]) => {
          const regionData = dataMap.get(regionKey)
          const value = regionData?.value
          const x = padding + layout.col * (cellW + gap)
          const y = padding + layout.row * (cellH + gap)
          const isSelected = selectedRegion === regionKey
          const hasData = value !== undefined

          return (
            <g
              key={regionKey}
              onClick={() => onRegionClick?.(regionKey)}
              className={cn('cursor-pointer', !onRegionClick && 'cursor-default')}
            >
              <rect
                x={x}
                y={y}
                width={cellW}
                height={cellH}
                rx={3}
                fill={hasData ? getColor(value!, min, max, colorScale) : '#27272a'}
                fillOpacity={hasData ? 0.7 : 0.3}
                stroke={isSelected ? '#f59e0b' : '#3f3f46'}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text
                x={x + cellW / 2}
                y={y + 20}
                textAnchor="middle"
                className="font-mono"
                fontSize="9"
                fill={hasData ? '#fff' : '#71717a'}
              >
                {layout.name}
              </text>
              <text
                x={x + cellW / 2}
                y={y + 38}
                textAnchor="middle"
                className="font-mono"
                fontSize="13"
                fontWeight="bold"
                fill={hasData ? '#fff' : '#52525b'}
              >
                {hasData ? valueFormat(value!) : '—'}
              </text>
              {regionData?.label && (
                <text
                  x={x + cellW / 2}
                  y={y + 52}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize="8"
                  fill="#a1a1aa"
                >
                  {regionData.label}
                </text>
              )}
            </g>
          )
        })}

        {/* Title */}
        <text
          x={svgW / 2}
          y={svgH - 8}
          textAnchor="middle"
          className="font-mono"
          fontSize="9"
          fill="#52525b"
        >
          GHANA REGIONAL {metric.toUpperCase()} MAP
        </text>
      </svg>
    </div>
  )
}
