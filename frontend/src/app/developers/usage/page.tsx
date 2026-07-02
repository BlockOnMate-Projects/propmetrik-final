'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  getUsageSummary, getUsageDaily, getUsageByEndpoint, getUsageByKey,
  type UsageSummary, type UsageDailyPoint, type EndpointUsage, type KeyUsage,
} from '@/lib/developer-api'
import { PageHeader, Card, Stat, Spinner, EmptyState } from '../_components'
import { cn } from '@/lib/utils'

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

function shortDate(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function UsagePage() {
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [daily, setDaily] = useState<UsageDailyPoint[]>([])
  const [byEndpoint, setByEndpoint] = useState<EndpointUsage[]>([])
  const [byKey, setByKey] = useState<KeyUsage[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (d: number) => {
    setLoading(true)
    try {
      const [s, dl, be, bk] = await Promise.all([
        getUsageSummary(),
        getUsageDaily(d),
        getUsageByEndpoint(d),
        getUsageByKey(d),
      ])
      setSummary(s); setDaily(dl); setByEndpoint(be); setByKey(bk)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(days) }, [days, load])

  const maxEndpoint = Math.max(1, ...byEndpoint.map((e) => e.count))
  const hasTraffic = daily.some((d) => d.request_count > 0)

  return (
    <div>
      <PageHeader
        title="Usage"
        subtitle="Requests served against your organization's API keys. Metered per request — errors and per-endpoint breakdowns included."
        action={
          <div className="inline-flex border border-border rounded-md overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  days === r.days ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Total requests" value={(summary?.total_requests ?? 0).toLocaleString()} accent />
            <Stat label={`Last ${days} days`} value={(daily.reduce((a, d) => a + d.request_count, 0)).toLocaleString()} />
            <Stat label="Errors" value={(summary?.total_errors ?? 0).toLocaleString()} />
            <Stat label="Error rate" value={`${((summary?.error_rate ?? 0) * 100).toFixed(1)}%`} />
          </div>

          <Card title="Requests over time" className="mb-6">
            {hasTraffic ? (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="req" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" minTickGap={28} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(l) => shortDate(String(l))}
                    />
                    <Area type="monotone" dataKey="request_count" name="Requests" stroke="#f59e0b" strokeWidth={2} fill="url(#req)" />
                    <Area type="monotone" dataKey="error_count" name="Errors" stroke="#ef4444" strokeWidth={1.5} fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState>No requests in this window yet. Make your first API call to see traffic here.</EmptyState>
            )}
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Top endpoints">
              {byEndpoint.length === 0 ? (
                <EmptyState>No endpoint activity.</EmptyState>
              ) : (
                <div className="space-y-2">
                  {byEndpoint.slice(0, 12).map((e) => (
                    <div key={e.endpoint}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <code className="font-mono text-muted-foreground truncate pr-2">{e.endpoint}</code>
                        <span className="text-foreground font-medium tabular-nums shrink-0">{e.count.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-amber-500/70 rounded-full" style={{ width: `${(e.count / maxEndpoint) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Requests by key">
              {byKey.length === 0 ? (
                <EmptyState>No keys yet.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="py-1.5 pr-3 font-medium">Key</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Requests</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byKey.map((k) => (
                        <tr key={k.key_id} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3">
                            <span className={cn('font-medium', k.is_active ? 'text-foreground' : 'text-muted-foreground line-through')}>{k.name}</span>
                            <code className="block text-[10px] font-mono text-muted-foreground">{k.key_prefix}…</code>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-foreground">{k.request_count.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{k.error_count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
