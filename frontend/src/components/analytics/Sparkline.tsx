'use client'

import { cn } from '@/lib/utils'

/**
 * Minimal dependency-free SVG sparkline for small inline trend displays
 * (e.g. GSS lending-rate history on the affordability page). Renders nothing
 * when there are fewer than two finite points.
 */
export default function Sparkline({
  data,
  width = 120,
  height = 28,
  className,
  strokeClassName = 'stroke-amber-500',
  fillClassName = 'fill-amber-500/10',
}: {
  data: Array<number | null | undefined>
  width?: number
  height?: number
  className?: string
  strokeClassName?: string
  fillClassName?: string
}) {
  const points = data.filter((d): d is number => typeof d === 'number' && isFinite(d))
  if (points.length < 2) {
    return <span className={cn('font-mono text-[10px] text-muted-foreground', className)}>—</span>
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const stepX = width / (points.length - 1)
  const pad = 2

  const coords = points.map((v, i) => {
    const x = i * stepX
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return [x, y] as const
  })

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('overflow-visible', className)}
      role="img"
      aria-label="trend sparkline"
    >
      <path d={area} className={fillClassName} stroke="none" />
      <path d={line} className={strokeClassName} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
