'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Zap,
  Globe,
  TrendingUp,
  Building2,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  FileText,
  Activity,
  Users,
  Database,
  ArrowUpRight,
} from 'lucide-react'

/* ────────────── Types ────────────── */
interface UsageSummary {
  api_calls_30d: number
  api_errors_30d: number
  active_organizations: number
  active_subscriptions: number
  total_properties: number
  total_valuations: number
  total_deals: number
  total_users: number
}

interface DailyUsage {
  date: string
  requests: number
  errors: number
}

interface EndpointUsage {
  endpoint: string
  calls: number
}

interface OrgUsage {
  org_name: string
  org_id: string
  total_requests: number
  total_errors: number
  api_keys: number
  first_seen: string
  last_active: string
}

/* ────────────── Components ────────────── */

function KPICard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-white mt-1 font-mono">{value}</p>
          {sub && <p className="text-[10px] text-zinc-500 mt-1">{sub}</p>}
        </div>
        <div className="p-2 bg-zinc-800 rounded">
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  )
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ────────────── Main Page ────────────── */

export default function UsageAnalyticsPage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [daily, setDaily] = useState<DailyUsage[]>([])
  const [endpoints, setEndpoints] = useState<EndpointUsage[]>([])
  const [orgBreakdown, setOrgBreakdown] = useState<OrgUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, dailyRes, epRes, orgRes] = await Promise.all([
        fetch('/api/admin/platform/usage/summary'),
        fetch(`/api/admin/platform/usage/daily?days=${days}`),
        fetch('/api/admin/platform/usage/by-endpoint'),
        fetch('/api/admin/platform/usage/by-org'),
      ])
      if (sumRes.ok) {
        const j = await sumRes.json()
        if (j.data) setSummary(j.data)
      }
      if (dailyRes.ok) {
        const j = await dailyRes.json()
        if (j.data) setDaily(j.data)
      }
      if (epRes.ok) {
        const j = await epRes.json()
        if (j.data) setEndpoints(j.data)
      }
      if (orgRes.ok) {
        const j = await orgRes.json()
        if (j.data) setOrgBreakdown(j.data)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  const s = summary || {
    api_calls_30d: 0, api_errors_30d: 0, active_organizations: 0, active_subscriptions: 0,
    total_properties: 0, total_valuations: 0, total_deals: 0, total_users: 0,
  }

  const errorRate = s.api_calls_30d > 0 ? ((s.api_errors_30d / s.api_calls_30d) * 100).toFixed(2) : '0.00'
  const maxDaily = Math.max(...daily.map((d) => d.requests), 1)
  const maxEp = Math.max(...endpoints.map((e) => parseInt(String(e.calls))), 1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-bold text-white font-mono">USAGE ANALYTICS</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1 ml-9">API consumption, platform metrics, and organization activity</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 60].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-[10px] font-mono transition-colors ${
                days === d ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800'
              }`}
            >
              {d}D
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1 text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-800 hover:border-red-600 transition-colors disabled:opacity-50 ml-2"
          >
            {loading ? <RefreshCw className="w-3 h-3 animate-spin inline" /> : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="API Calls (30d)" value={s.api_calls_30d.toLocaleString()} sub={`${errorRate}% error rate`} icon={Globe} color="text-cyan-400" />
        <KPICard title="Active Orgs" value={s.active_organizations} sub="With content or activity" icon={Building2} color="text-amber-400" />
        <KPICard title="Active Subscriptions" value={s.active_subscriptions} icon={Activity} color="text-green-400" />
        <KPICard title="Total Users" value={s.total_users.toLocaleString()} icon={Users} color="text-purple-400" />
      </div>

      {/* Platform Content Stats */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard title="Properties" value={s.total_properties.toLocaleString()} icon={Database} color="text-green-400" />
        <KPICard title="Valuations" value={s.total_valuations.toLocaleString()} icon={FileText} color="text-amber-400" />
        <KPICard title="Deals" value={s.total_deals.toLocaleString()} icon={ArrowUpRight} color="text-cyan-400" />
      </div>

      {/* Daily Usage Chart (ASCII bar chart style) */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white font-mono">DAILY API VOLUME</h2>
          <span className="text-[10px] font-mono text-zinc-500">Last {days} days</span>
        </div>
        {daily.length > 0 ? (
          <div className="flex items-end gap-[2px] h-32">
            {daily.map((d, i) => {
              const pct = (d.requests / maxDaily) * 100
              const errPct = d.errors > 0 ? Math.max((d.errors / maxDaily) * 100, 2) : 0
              return (
                <div key={i} className="flex-1 flex flex-col justify-end group relative" title={`${d.date}: ${d.requests} requests, ${d.errors} errors`}>
                  <div className="bg-red-500/80 rounded-t-sm transition-all group-hover:bg-red-400" style={{ height: `${Math.max(pct, 1)}%` }} />
                  {errPct > 0 && (
                    <div className="bg-amber-500/60 rounded-b-sm" style={{ height: `${errPct}%` }} />
                  )}
                  {/* Tooltip on hover */}
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-[9px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {d.date.slice(5)}: {d.requests}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-500 font-mono">
            No API usage data available
          </div>
        )}
        <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-zinc-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-sm" /> Requests</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-sm" /> Errors</span>
        </div>
      </div>

      {/* Endpoint + Org breakdown side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Endpoints */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white font-mono">TOP ENDPOINTS</h2>
            <span className="text-[10px] font-mono text-zinc-500">{endpoints.length} tracked</span>
          </div>
          {endpoints.length > 0 ? (
            <div className="space-y-2">
              {endpoints.slice(0, 15).map((ep, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/50 last:border-0">
                  <span className="text-[10px] font-mono text-zinc-600 w-5 text-right">{i + 1}</span>
                  <code className="text-[10px] font-mono text-zinc-300 flex-1 truncate">{ep.endpoint}</code>
                  <MiniBar value={parseInt(String(ep.calls))} max={maxEp} />
                  <span className="text-[10px] font-mono text-amber-400 w-12 text-right">{parseInt(String(ep.calls)).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 text-center py-8 font-mono">No endpoint data available</p>
          )}
        </div>

        {/* Top Organizations */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white font-mono">TOP ORGANIZATIONS</h2>
            <span className="text-[10px] font-mono text-zinc-500">By API volume</span>
          </div>
          {orgBreakdown.length > 0 ? (
            <div className="space-y-2">
              {orgBreakdown.slice(0, 10).map((org, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                  <Building2 className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-white truncate">{org.org_name}</p>
                    <p className="text-[9px] text-zinc-500">{org.api_keys} key{org.api_keys !== 1 ? 's' : ''} • Last active: {org.last_active?.slice(0, 10) || '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-mono text-amber-400">{parseInt(String(org.total_requests)).toLocaleString()}</p>
                    {parseInt(String(org.total_errors)) > 0 && (
                      <p className="text-[9px] font-mono text-red-400">{parseInt(String(org.total_errors))} errors</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 text-center py-8 font-mono">No organization usage data</p>
          )}
        </div>
      </div>

      {/* Error Rate Alert */}
      {parseFloat(errorRate) > 5 && (
        <div className="bg-red-950/30 border border-red-900/50 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-xs font-bold text-red-300 font-mono">HIGH ERROR RATE DETECTED</p>
            <p className="text-[10px] text-zinc-400">
              Error rate of {errorRate}% exceeds the 5% threshold. Check API logs for failing endpoints.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
