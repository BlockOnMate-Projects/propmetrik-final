'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Heart,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  DollarSign,
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Building2,
  Zap,
  Shield,
} from 'lucide-react'

/* ────────────── Types ────────────── */
interface Customer {
  id: string
  name: string
  plan: string
  tier: string
  status: string
  health: 'healthy' | 'at_risk' | 'churned' | 'new'
  properties: number
  valuations: number
  users: number
  api_calls_30d: number
  renewal_date: string | null
  joined: string
}

interface HealthSummary {
  total: number
  healthy: number
  at_risk: number
  churned: number
  new_accounts: number
}

interface SubMetrics {
  active: number
  cancelled: number
  past_due: number
  trialing: number
  total: number
  mrr_ghs: number
}

interface CustomerMetrics {
  subscriptions: SubMetrics
  plan_breakdown: { plan_name: string; tier: string; subscribers: number }[]
  recent_events: { event_type: string; subscription_id: string; metadata: any; created_at: string }[]
}

const HEALTH_CONFIG = {
  healthy: { label: 'HEALTHY', color: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-800', icon: CheckCircle },
  at_risk: { label: 'AT RISK', color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-800', icon: AlertTriangle },
  churned: { label: 'CHURNED', color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-800', icon: XCircle },
  new: { label: 'NEW', color: 'text-cyan-400', bg: 'bg-cyan-900/30', border: 'border-cyan-800', icon: Clock },
}

/* ────────────── Helper ────────────── */
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })
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

function HealthBadge({ health }: { health: 'healthy' | 'at_risk' | 'churned' | 'new' }) {
  const cfg = HEALTH_CONFIG[health]
  return (
    <span className={`px-2 py-0.5 text-[9px] font-mono font-bold ${cfg.bg} ${cfg.color} ${cfg.border} border rounded`}>
      {cfg.label}
    </span>
  )
}

/* ────────────── Main Page ────────────── */

export default function CustomerSuccessPage() {
  const [healthData, setHealthData] = useState<{ summary: HealthSummary; customers: Customer[] } | null>(null)
  const [metrics, setMetrics] = useState<CustomerMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [healthFilter, setHealthFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [healthRes, metricsRes] = await Promise.all([
        fetch('/api/admin/platform/customers/health'),
        fetch('/api/admin/platform/customers/metrics'),
      ])
      if (healthRes.ok) {
        const hj = await healthRes.json()
        if (hj.data) setHealthData(hj.data)
      }
      if (metricsRes.ok) {
        const mj = await metricsRes.json()
        if (mj.data) setMetrics(mj.data)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const summary = healthData?.summary || { total: 0, healthy: 0, at_risk: 0, churned: 0, new_accounts: 0 }
  const subs = metrics?.subscriptions || { active: 0, cancelled: 0, past_due: 0, trialing: 0, total: 0, mrr_ghs: 0 }

  // Filter customers
  const customers = (healthData?.customers || []).filter((c) => {
    if (healthFilter !== 'all' && c.health !== healthFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Heart className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-bold text-white font-mono">CUSTOMER SUCCESS</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1 ml-9">Monitor customer health, subscriptions, and engagement</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1 text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-800 hover:border-red-600 transition-colors disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-3 h-3 animate-spin inline" /> : 'REFRESH'}
        </button>
      </div>

      {/* Health Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Healthy Customers"
          value={summary.healthy}
          sub={`${summary.total > 0 ? Math.round((summary.healthy / summary.total) * 100) : 0}% of total`}
          icon={CheckCircle}
          color="text-green-400"
        />
        <KPICard
          title="At Risk"
          value={summary.at_risk}
          sub="Low engagement or usage"
          icon={AlertTriangle}
          color="text-amber-400"
        />
        <KPICard
          title="New Accounts"
          value={summary.new_accounts}
          sub="Pending activation"
          icon={Users}
          color="text-cyan-400"
        />
        <KPICard
          title="MRR (GHS)"
          value={`₵${Math.round(subs.mrr_ghs).toLocaleString()}`}
          sub={`${subs.active} active subscriptions`}
          icon={DollarSign}
          color="text-green-400"
        />
      </div>

      {/* Subscription + Plan Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Pipeline */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <h2 className="text-sm font-bold text-white font-mono mb-4">SUBSCRIPTION PIPELINE</h2>
          <div className="space-y-3">
            {[
              { label: 'Active', count: subs.active, color: 'bg-green-500', total: subs.total },
              { label: 'Trialing', count: subs.trialing, color: 'bg-cyan-500', total: subs.total },
              { label: 'Past Due', count: subs.past_due, color: 'bg-amber-500', total: subs.total },
              { label: 'Cancelled', count: subs.cancelled, color: 'bg-red-500', total: subs.total },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-400 w-20">{row.label}</span>
                <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${row.color} rounded-full transition-all`}
                    style={{ width: `${row.total > 0 ? (row.count / row.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-white w-8 text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plan Breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <h2 className="text-sm font-bold text-white font-mono mb-4">PLAN DISTRIBUTION</h2>
          {(metrics?.plan_breakdown || []).length > 0 ? (
            <div className="space-y-2">
              {(metrics?.plan_breakdown || []).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs font-mono text-white">{p.plan_name || 'Unknown Plan'}</span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase">{p.tier}</span>
                  </div>
                  <span className="text-sm font-bold font-mono text-amber-400">{p.subscribers}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 text-center py-8">No subscription plans active</p>
          )}
        </div>
      </div>

      {/* Recent Subscription Events */}
      {(metrics?.recent_events || []).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <h2 className="text-sm font-bold text-white font-mono mb-3">RECENT EVENTS</h2>
          <div className="space-y-1">
            {(metrics?.recent_events || []).slice(0, 10).map((ev, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-zinc-800 last:border-0">
                <Activity className="w-3.5 h-3.5 text-zinc-600" />
                <span className="text-xs font-mono text-amber-400">{ev.event_type}</span>
                <span className="text-[10px] text-zinc-500 flex-1">{ev.subscription_id?.slice(0, 8)}...</span>
                <span className="text-[10px] text-zinc-500 font-mono">{fmtDate(ev.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Health Table */}
      <div className="bg-zinc-900 border border-zinc-800">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white font-mono">CUSTOMER HEALTH</h2>
            <span className="text-[10px] font-mono text-zinc-500">{customers.length} organizations</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search organizations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-zinc-800 border border-zinc-700 text-xs font-mono text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none"
              />
            </div>
            <div className="flex gap-1">
              {['all', 'healthy', 'at_risk', 'churned', 'new'].map((f) => (
                <button
                  key={f}
                  onClick={() => setHealthFilter(f)}
                  className={`px-2 py-1 text-[10px] font-mono transition-colors ${
                    healthFilter === f ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {f === 'at_risk' ? 'AT RISK' : f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-2 text-left font-mono text-zinc-500 text-[10px] uppercase">Organization</th>
                <th className="px-4 py-2 text-left font-mono text-zinc-500 text-[10px] uppercase">Health</th>
                <th className="px-4 py-2 text-left font-mono text-zinc-500 text-[10px] uppercase">Plan</th>
                <th className="px-4 py-2 text-right font-mono text-zinc-500 text-[10px] uppercase">Users</th>
                <th className="px-4 py-2 text-right font-mono text-zinc-500 text-[10px] uppercase">Properties</th>
                <th className="px-4 py-2 text-right font-mono text-zinc-500 text-[10px] uppercase">Valuations</th>
                <th className="px-4 py-2 text-right font-mono text-zinc-500 text-[10px] uppercase">API Calls (30d)</th>
                <th className="px-4 py-2 text-right font-mono text-zinc-500 text-[10px] uppercase">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.length > 0 ? customers.map((c) => (
                <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-zinc-600" />
                      <span className="font-mono text-white">{c.name || 'Unnamed Org'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><HealthBadge health={c.health} /></td>
                  <td className="px-4 py-2.5 font-mono text-zinc-300">{c.plan}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{c.users}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{c.properties.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{c.valuations}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className={c.api_calls_30d > 100 ? 'text-green-400' : c.api_calls_30d > 0 ? 'text-amber-400' : 'text-zinc-600'}>
                      {c.api_calls_30d.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-500 text-[10px]">{fmtDate(c.joined)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-zinc-500 font-mono">
                    No organizations found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
