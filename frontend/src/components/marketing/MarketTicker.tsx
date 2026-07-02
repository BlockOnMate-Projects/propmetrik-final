'use client'

/**
 * Live market-intelligence ticker for the marketing site.
 *
 * A continuously-scrolling strip of headline Ghana indices (property index,
 * GHAI, CCI, MIEG growth, lending rate, NPL) pulled from the PUBLIC ticker
 * endpoint (`/api/ticker`, no auth). Values are real and refresh every 60s;
 * the scroll is a marquee animation, not fabricated tick movement.
 */

import { useEffect, useState } from 'react'

interface Idx {
  key: string
  label: string
  value: number
  unit: string
  change: number | null
  direction: 'up' | 'down' | null
}

function display(i: Idx): string {
  switch (i.unit) {
    case 'GHS':
      return i.value >= 1_000_000 ? `₵${(i.value / 1_000_000).toFixed(1)}M` : `₵${Math.round(i.value / 1000)}K`
    case '/100':
      return `${i.value}/100`
    case '% YoY':
      return `${i.value}% YoY`
    case '%':
      return `${i.value}%`
    default:
      return `${i.value}`
  }
}

function TickerItem({ i }: { i: Idx }) {
  const showChange = i.change != null && i.change !== 0 && i.direction
  return (
    <span className="inline-flex items-center gap-2 px-5 py-1 text-[10px] font-mono border-r border-border/50 shrink-0">
      <span className="text-muted-foreground tracking-wider">{i.label}</span>
      <span className="text-foreground font-semibold tabular-nums">{display(i)}</span>
      {showChange && (
        <span className={i.direction === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
          {i.direction === 'up' ? '▲' : '▼'} {Math.abs(i.change as number)}
        </span>
      )}
    </span>
  )
}

export default function MarketTicker() {
  const [items, setItems] = useState<Idx[]>([])

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/ticker')
        .then((r) => r.json())
        .then((j) => { if (alive && Array.isArray(j?.data?.market_indices)) setItems(j.data.market_indices) })
        .catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (items.length === 0) return null

  // Duplicate the track so the -50% translate loops seamlessly.
  const track = [...items, ...items]
  const durationS = Math.max(items.length * 6, 30)

  return (
    <div className="w-full border-b border-border bg-card/40 overflow-hidden group" aria-label="Live Ghana market indices">
      <div
        className="flex whitespace-nowrap pm-ticker-track"
        style={{ animation: `pm-ticker ${durationS}s linear infinite` }}
      >
        {track.map((i, idx) => <TickerItem key={`${i.key}-${idx}`} i={i} />)}
      </div>
      <style>{`
        @keyframes pm-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .group:hover .pm-ticker-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .pm-ticker-track { animation: none !important; } }
      `}</style>
    </div>
  )
}
