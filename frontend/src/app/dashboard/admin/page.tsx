'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users,
  Building2,
  Activity,
  Server,
  Database,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  Home,
  FileText,
  Shield,
  RefreshCw,
} from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

// ── Types mirror the backend admin endpoints ──────────────────────────────
interface Overview {
  users: { total: number; newThisMonth: number }
  organizations: { total: number; newThisWeek: number }
  activeSessions: number
  properties: { total: number }
  valuations: { total: number; mtd: number }
  dataSources: { total: number; pendingSync: number }
  securityEvents24h: number
  apiUptimeSeconds: number
}

interface SystemHealth {
  api: { status: string; uptime: number; version: string }
  database: { status: string; connections: number; pool_size: number }
  redis: { status: string; memory_used: string }
  storage: { status: string; used: string; total: string }
}

interface ActivityRow {
  id: string
  user_email: string
  event_type: string
  description: string
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtUptime(seconds: number): string {
  if (!seconds || seconds < 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function timeAgo(dateStr: string): string {
  const t = new Date(dateStr).getTime()
  if (isNaN(t)) return ''
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB')
}

const isHealthy = (status: string) =>
  ['operational', 'healthy', 'connected', 'up', 'ok', 'online'].includes((status || '').toLowerCase())
const isUnknown = (status: string) =>
  ['unknown', 'n/a', ''].includes((status || '').toLowerCase())

// Stats card component
function StatCard({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  loading,
}: {
  title: string
  value: string | number
  change?: string
  changeType?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  loading?: boolean
}) {
  return (
    <div className="bg-card border border-border p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{title}</p>
          {loading ? (
            <div className="h-7 w-20 mt-1 bg-muted animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold text-foreground mt-1 font-mono">{value}</p>
          )}
          {change && !loading && (
            <div className="flex items-center gap-1 mt-2">
              {changeType === 'up' && <TrendingUp className="w-3 h-3 text-green-500" />}
              <span className={`text-[10px] font-mono ${
                changeType === 'up' ? 'text-green-500' : 'text-muted-foreground'
              }`}>
                {change}
              </span>
            </div>
          )}
        </div>
        <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded">
          <Icon className="w-5 h-5 text-red-500" />
        </div>
      </div>
    </div>
  )
}

// System status row
function SystemStatusRow({ name, status, detail }: { name: string; status: string; detail?: string }) {
  const healthy = isHealthy(status)
  const unknown = isUnknown(status)
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        {healthy ? <CheckCircle className="w-4 h-4 text-green-500" />
          : unknown ? <HelpCircle className="w-4 h-4 text-muted-foreground" />
          : <AlertTriangle className="w-4 h-4 text-red-500" />}
        <span className="text-xs font-mono text-muted-foreground">{name}</span>
      </div>
      {detail && <span className="text-[10px] font-mono text-muted-foreground">{detail}</span>}
    </div>
  )
}

// Recent activity item
function ActivityItem({ action, user, time, type }: { action: string; user: string; time: string; type: 'create' | 'update' | 'delete' | 'login' }) {
  const colors = {
    create: 'bg-green-500',
    update: 'bg-blue-500',
    delete: 'bg-red-500',
    login: 'bg-amber-500',
  }
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <div className={`w-2 h-2 rounded-full mt-1.5 ${colors[type]}`} />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground capitalize">{action}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-mono text-muted-foreground">{user}</span>
          {time && <><span className="text-[10px] text-muted-foreground">•</span>
          <span className="text-[10px] font-mono text-muted-foreground">{time}</span></>}
        </div>
      </div>
    </div>
  )
}

function activityType(eventType: string): 'create' | 'update' | 'delete' | 'login' {
  const a = (eventType || '').toLowerCase()
  if (a.includes('delete') || a.includes('remove')) return 'delete'
  if (a.includes('login') || a.includes('auth')) return 'login'
  if (a.includes('create') || a.includes('add') || a.includes('insert')) return 'create'
  return 'update'
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [oRes, hRes, aRes] = await Promise.all([
        authedFetch('/api/admin/overview'),
        authedFetch('/api/admin/system/health'),
        authedFetch('/api/admin/activity?limit=6'),
      ])
      if (oRes.ok) setOverview(((await oRes.json()) as { data: Overview }).data)
      if (hRes.ok) setHealth(((await hRes.json()) as { data: SystemHealth }).data)
      if (aRes.ok) setActivity(((await aRes.json()) as { data: ActivityRow[] }).data || [])
    } catch {
      // ignore — cards fall back to "—"
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Overall banner derived from real infra health
  const services = health ? [health.api, health.database, health.redis, health.storage] : []
  const allOk = services.length > 0 && services.every(s => isHealthy(s.status))
  const anyDown = services.some(s => !isHealthy(s.status) && !isUnknown(s.status))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-mono">ADMIN DASHBOARD</h1>
          <p className="text-xs text-muted-foreground mt-1">Platform overview and system metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <span className={`px-3 py-1 text-[10px] font-mono border ${
            anyDown
              ? 'bg-red-100 dark:bg-red-900/30 border-red-800 text-red-600 dark:text-red-400'
              : allOk
                ? 'bg-green-100 dark:bg-green-900/30 border-green-800 text-green-600 dark:text-green-400'
                : 'bg-muted border-border text-muted-foreground'
          }`}>
            {anyDown ? 'DEGRADED' : allOk ? 'ALL SYSTEMS OPERATIONAL' : 'CHECKING…'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={overview ? overview.users.total.toLocaleString() : '—'}
          change={overview && overview.users.newThisMonth > 0 ? `+${overview.users.newThisMonth} this month` : 'This month'}
          changeType={overview && overview.users.newThisMonth > 0 ? 'up' : 'neutral'}
          icon={Users}
          loading={loading}
        />
        <StatCard
          title="Organizations"
          value={overview ? overview.organizations.total.toLocaleString() : '—'}
          change={overview && overview.organizations.newThisWeek > 0 ? `+${overview.organizations.newThisWeek} this week` : 'This week'}
          changeType={overview && overview.organizations.newThisWeek > 0 ? 'up' : 'neutral'}
          icon={Building2}
          loading={loading}
        />
        <StatCard
          title="Active Users (24h)"
          value={overview ? overview.activeSessions.toLocaleString() : '—'}
          change="Logged in last 24h"
          changeType="neutral"
          icon={Activity}
          loading={loading}
        />
        <StatCard
          title="Properties"
          value={overview ? overview.properties.total.toLocaleString() : '—'}
          change="Data assets"
          changeType="neutral"
          icon={Home}
          loading={loading}
        />
      </div>

      {/* Second Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Data Sources"
          value={overview ? overview.dataSources.total.toLocaleString() : '—'}
          change={overview ? `${overview.dataSources.pendingSync} pending sync` : 'Active'}
          changeType="neutral"
          icon={Database}
          loading={loading}
        />
        <StatCard
          title="Valuations (MTD)"
          value={overview ? overview.valuations.mtd.toLocaleString() : '—'}
          change={overview ? `${overview.valuations.total.toLocaleString()} all-time` : 'Month to date'}
          changeType="neutral"
          icon={FileText}
          loading={loading}
        />
        <StatCard
          title="API Uptime"
          value={overview ? fmtUptime(overview.apiUptimeSeconds) : '—'}
          change="Since last restart"
          changeType="neutral"
          icon={Server}
          loading={loading}
        />
        <StatCard
          title="Security Events (24h)"
          value={overview ? overview.securityEvents24h.toLocaleString() : '—'}
          change="Auth failures + deletions"
          changeType="neutral"
          icon={Shield}
          loading={loading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Status */}
        <div className="bg-card border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-foreground font-mono">SYSTEM STATUS</h2>
            <a href="/dashboard/admin/system" className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-300 font-mono">DETAILS →</a>
          </div>
          <div className="space-y-1">
            {health ? (
              <>
                <SystemStatusRow name="API Service" status={health.api.status} detail={health.api.version} />
                <SystemStatusRow name="PostgreSQL Database" status={health.database.status} detail={`${health.database.connections} conn`} />
                <SystemStatusRow name="Redis Cache" status={health.redis.status} detail={health.redis.memory_used} />
                <SystemStatusRow name="Object Storage" status={health.storage.status} detail={health.storage.total !== 'n/a' ? `${health.storage.used}/${health.storage.total} buckets` : undefined} />
              </>
            ) : (
              <p className="text-xs font-mono text-muted-foreground py-4 text-center">
                {loading ? 'Checking services…' : 'Health unavailable'}
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-foreground font-mono">RECENT ACTIVITY</h2>
            <a href="/dashboard/admin/audit-logs" className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-300 font-mono">
              VIEW ALL →
            </a>
          </div>
          <div className="space-y-1">
            {activity.length > 0 ? (
              activity.map((row) => (
                <ActivityItem
                  key={row.id}
                  action={row.description || row.event_type}
                  user={row.user_email}
                  time={timeAgo(row.created_at)}
                  type={activityType(row.event_type)}
                />
              ))
            ) : (
              <p className="text-xs font-mono text-muted-foreground py-4 text-center">
                {loading ? 'Loading activity…' : 'No recent activity'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-card border border-border p-4">
        <h2 className="text-sm font-bold text-foreground font-mono mb-4">QUICK ACTIONS</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { name: 'Add User', href: '/dashboard/admin/users/new' },
            { name: 'Create Org', href: '/dashboard/admin/organizations/new' },
            { name: 'API Docs', href: '/dashboard/admin/api-docs' },
            { name: 'API Keys', href: '/dashboard/admin/api-keys' },
            { name: 'Usage', href: '/dashboard/admin/usage' },
            { name: 'Customers', href: '/dashboard/admin/customer-success' },
            { name: 'Onboarding', href: '/dashboard/admin/onboarding' },
            { name: 'Data Hub', href: '/dashboard/admin/data-hub' },
          ].map((action) => (
            <a
              key={action.name}
              href={action.href}
              className="px-4 py-3 bg-muted hover:bg-red-900/30 border border-border hover:border-red-800 text-center transition-colors"
            >
              <span className="text-xs font-mono text-muted-foreground hover:text-red-300">
                {action.name}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
