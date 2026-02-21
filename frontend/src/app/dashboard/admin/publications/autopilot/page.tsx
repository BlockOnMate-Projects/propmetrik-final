'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Bot,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  Eye,
  ThumbsUp,
  Trash2,
  Activity,
  Calendar,
  Settings2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────

interface AutopilotHealth {
  globalEnabled: boolean
  scheduler: { isRunning: boolean; jobCount: number; jobs: string[] }
  last24h: { published: number; deferred: number; failed: number; running: number }
  settings: { confidenceFloor: number; maxDailyPublications: number; maxDailyFlashes: number }
}

interface Schedule {
  id: string
  publication_type: string
  product: string
  edition: string
  region: string | null
  cron_expression: string
  enabled: boolean
  template_id: string
  recent_published?: number
  recent_failed?: number
  updated_at: string
}

interface Run {
  id: string
  publication_type: string
  product: string
  edition: string
  region: string | null
  status: 'running' | 'published' | 'deferred' | 'failed'
  started_at: string
  completed_at: string | null
  confidence_score: number | null
  publication_id: string | null
  publication_title: string | null
  publication_slug: string | null
  publication_status: string | null
  trigger_type: string
  error_message: string | null
}

interface DeferredItem {
  id: string
  title: string
  slug: string
  publication_type: string
  product: string
  edition: string
  region: string | null
  excerpt: string
  confidence_score: number
  deferred_reason: string | null
  run_id: string
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || '/api'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/autopilot${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

function statusColor(s: string) {
  switch (s) {
    case 'published': return 'text-emerald-400'
    case 'deferred': return 'text-amber-400'
    case 'failed': return 'text-red-400'
    case 'running': return 'text-blue-400'
    default: return 'text-zinc-400'
  }
}

function statusIcon(s: string) {
  switch (s) {
    case 'published': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    case 'deferred': return <Clock className="w-3.5 h-3.5 text-amber-400" />
    case 'failed': return <XCircle className="w-3.5 h-3.5 text-red-400" />
    case 'running': return <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
    default: return <Activity className="w-3.5 h-3.5 text-zinc-400" />
  }
}

function timeAgo(dateStr: string) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// ── Components ───────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-mono uppercase tracking-wider mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        {label}
      </div>
      <div className="text-2xl font-semibold text-white font-mono">{value}</div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function AutopilotPage() {
  const [health, setHealth] = useState<AutopilotHealth | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [deferred, setDeferred] = useState<DeferredItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'schedules' | 'runs' | 'deferred'>('overview')
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null)
  const [runningSchedule, setRunningSchedule] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [h, s, r, d] = await Promise.all([
        apiFetch<{ health: AutopilotHealth }>('/health'),
        apiFetch<{ schedules: Schedule[] }>('/schedules'),
        apiFetch<{ runs: Run[] }>('/runs?limit=30'),
        apiFetch<{ deferred: DeferredItem[] }>('/deferred'),
      ])
      setHealth(h.health)
      setSchedules(s.schedules)
      setRuns(r.runs)
      setDeferred(d.deferred)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30_000) // auto-refresh every 30s
    return () => clearInterval(interval)
  }, [fetchAll])

  // ── Actions ──────────────────────

  const toggleGlobal = async () => {
    if (!health) return
    const action = health.globalEnabled ? '/pause' : '/resume'
    await apiFetch(action, { method: 'POST' })
    await fetchAll()
  }

  const triggerRun = async (type: string, edition?: string, region?: string) => {
    const scheduleKey = `${type}-${edition || 'any'}-${region || 'all'}`
    setRunningSchedule(scheduleKey)
    try {
      const params = new URLSearchParams()
      if (edition) params.set('edition', edition)
      if (region) params.set('region', region)
      const qs = params.toString() ? `?${params}` : ''
      await apiFetch(`/run/${type}${qs}`, { method: 'POST' })
      await fetchAll()
    } catch (e) {
      setError(`Failed to trigger run: ${(e as Error).message}`)
    } finally {
      setRunningSchedule(null)
    }
  }

  const approveDeferred = async (pubId: string) => {
    try {
      await apiFetch(`/deferred/${pubId}/approve`, { method: 'POST' })
      await fetchAll()
    } catch (e) {
      setError(`Failed to approve: ${(e as Error).message}`)
    }
  }

  const rejectDeferred = async (pubId: string) => {
    try {
      await apiFetch(`/deferred/${pubId}`, { method: 'DELETE' })
      await fetchAll()
    } catch (e) {
      setError(`Failed to reject: ${(e as Error).message}`)
    }
  }

  // ── Loading / Error ──────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 text-red-400 animate-spin" />
        <span className="ml-2 text-zinc-400 text-sm">Loading autopilot status…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-red-300 text-sm">{error}</p>
        <button onClick={fetchAll} className="mt-3 text-xs text-red-400 hover:text-red-300 underline">
          Retry
        </button>
      </div>
    )
  }

  // ── Render ─────────────────────

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'schedules', label: 'Schedules', icon: Calendar },
    { key: 'runs', label: 'Run History', icon: Zap },
    { key: 'deferred', label: `Deferred (${deferred.length})`, icon: Eye },
  ] as const

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 text-red-400 animate-spin" />
        <span className="ml-2 text-zinc-400 text-sm">Loading autopilot status…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6" suppressHydrationWarning>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Autopilot Pipeline</h1>
            <p className="text-xs text-zinc-500">Autonomous publication generation & scheduling</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAll}
            className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={toggleGlobal}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-mono tracking-wide transition ${
              health?.globalEnabled
                ? 'bg-red-900/30 border border-red-700 text-red-300 hover:bg-red-900/50'
                : 'bg-emerald-900/30 border border-emerald-700 text-emerald-300 hover:bg-emerald-900/50'
            }`}
          >
            {health?.globalEnabled ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause Autopilot
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Activate Autopilot
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Status Bar ── */}
      {health && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono ${
          health.globalEnabled
            ? 'bg-emerald-950/30 border border-emerald-900/30 text-emerald-400'
            : 'bg-zinc-900/50 border border-zinc-800 text-zinc-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${health.globalEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          {health.globalEnabled
            ? `ACTIVE — ${health.scheduler.jobCount} cron jobs running`
            : 'PAUSED — no automated publications'
          }
          <span className="ml-auto text-zinc-600">
            24h: {health.last24h.published} published · {health.last24h.deferred} deferred · {health.last24h.failed} failed
          </span>
        </div>
      )}

      {/* ── Metric Cards ── */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Published (24h)" value={health.last24h.published} icon={CheckCircle2} color="text-emerald-400" />
          <MetricCard label="Deferred" value={deferred.length} icon={Clock} color="text-amber-400" />
          <MetricCard label="Failed (24h)" value={health.last24h.failed} icon={XCircle} color="text-red-400" />
          <MetricCard label="Confidence Floor" value={`${((health.settings.confidenceFloor || 0.7) * 100).toFixed(0)}%`} icon={Settings2} color="text-blue-400" />
        </div>
      )}

      {/* ── Sub-tabs ── */}
      <div className="flex gap-0 border-b border-zinc-800">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono tracking-wide transition border-b-2 -mb-px ${
                isActive
                  ? 'border-red-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-red-400' : 'text-zinc-600'}`} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab Content ── */}
      <div className="min-h-[400px]">
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider">Active Schedules</h2>
            <div className="grid gap-3">
              {schedules.filter(s => s.enabled).map(schedule => (
                <div
                  key={schedule.id}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-4"
                >
                  <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">
                      {schedule.product.replace(/_/g, ' ')} · {schedule.edition}
                      {schedule.region && (
                        <span className="text-zinc-500 ml-2 text-xs">({schedule.region})</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                      {schedule.cron_expression === 'EVENT_DRIVEN'
                        ? 'Anomaly-triggered'
                        : `Cron: ${schedule.cron_expression}`
                      }
                      {' · '}Template: {schedule.template_id}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-emerald-400">{schedule.recent_published ?? 0} published</div>
                    <div className="text-red-400">{schedule.recent_failed ?? 0} failed</div>
                    <div className="text-zinc-600 text-[10px]">30d</div>
                  </div>
                  <button
                    onClick={() => triggerRun(schedule.product, schedule.edition, schedule.region || undefined)}
                    disabled={runningSchedule === `${schedule.product}-${schedule.edition || 'any'}-${schedule.region || 'all'}`}
                    className={`p-2 rounded-md border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition ${runningSchedule === `${schedule.product}-${schedule.edition || 'any'}-${schedule.region || 'all'}` ? 'opacity-50 cursor-wait' : ''}`}
                    title="Trigger manual run"
                  >
                    {runningSchedule === `${schedule.product}-${schedule.edition || 'any'}-${schedule.region || 'all'}` ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
              {schedules.filter(s => s.enabled).length === 0 && (
                <div className="text-center text-zinc-600 text-sm py-8">No active schedules</div>
              )}
            </div>
          </div>
        )}

        {/* SCHEDULES */}
        {activeTab === 'schedules' && (
          <div className="space-y-3">
            {schedules.map(schedule => (
              <div
                key={schedule.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpandedSchedule(expandedSchedule === schedule.id ? null : schedule.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/30 transition text-left"
                >
                  {expandedSchedule === schedule.id
                    ? <ChevronDown className="w-4 h-4 text-zinc-500" />
                    : <ChevronRight className="w-4 h-4 text-zinc-500" />
                  }
                  <div className={`w-2 h-2 rounded-full ${schedule.enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <span className="text-sm text-white flex-1">
                    {schedule.product.replace(/_/g, ' ')} · {schedule.edition}
                    {schedule.region && <span className="text-zinc-500 ml-1 text-xs">({schedule.region})</span>}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">{schedule.cron_expression}</span>
                </button>
                {expandedSchedule === schedule.id && (
                  <div className="border-t border-zinc-800 p-4 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-zinc-400">
                      <div>Template: <span className="text-white">{schedule.template_id}</span></div>
                      <div>Enabled: <span className={schedule.enabled ? 'text-emerald-400' : 'text-red-400'}>{schedule.enabled ? 'Yes' : 'No'}</span></div>
                      <div>Last updated: <span className="text-zinc-300">{schedule.updated_at ? timeAgo(schedule.updated_at) : 'never'}</span></div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => triggerRun(schedule.product, schedule.edition, schedule.region || undefined)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-900/30 border border-red-800 text-red-300 hover:bg-red-900/50 text-xs"
                      >
                        <Play className="w-3 h-3" /> Run Now
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* RUNS */}
        {activeTab === 'runs' && (
          <div className="space-y-2">
            {runs.map(run => (
              <div
                key={run.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-3"
              >
                {statusIcon(run.status)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">
                    {run.publication_id ? (
                      <Link
                        href={`/dashboard/admin/publications/${run.publication_id}`}
                        className="hover:text-red-400 transition-colors hover:underline"
                      >
                        {run.publication_title || `${(run.product || run.publication_type).replace(/_/g, ' ')} ${run.edition || ''} run`}
                      </Link>
                    ) : (
                      run.publication_title || `${(run.product || run.publication_type).replace(/_/g, ' ')} ${run.edition || ''} run`
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                    {run.trigger_type || 'scheduled'}
                    {run.region && ` · ${run.region}`}
                    {' · '}{timeAgo(run.started_at)}
                    {run.confidence_score != null && (
                      <span className="ml-2 text-zinc-400">
                        Confidence: {(run.confidence_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {run.publication_slug && run.publication_status === 'published' && (
                    <div className="text-[10px] font-mono mt-1">
                      <Link
                        href={`/insights/${run.publication_slug}`}
                        className="text-emerald-500 hover:text-emerald-400 hover:underline"
                        target="_blank"
                      >
                        propmetrik.com/insights/{run.publication_slug}
                      </Link>
                    </div>
                  )}
                </div>
                <span className={`text-xs font-mono uppercase ${statusColor(run.status)}`}>
                  {run.status}
                </span>
              </div>
            ))}
            {runs.length === 0 && (
              <div className="text-center text-zinc-600 text-sm py-12">No runs yet</div>
            )}
          </div>
        )}

        {/* DEFERRED */}
        {activeTab === 'deferred' && (
          <div className="space-y-3">
            {deferred.map(item => (
              <div
                key={item.id}
                className="bg-zinc-900/50 border border-amber-900/30 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/admin/publications/${item.id}`}
                      className="text-sm text-white font-medium hover:text-red-400 transition-colors hover:underline"
                    >
                      {item.title}
                    </Link>
                    <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{item.excerpt}</div>
                    {item.deferred_reason && (
                      <div className="text-[10px] text-amber-500/80 mt-1 line-clamp-1">⚠ {item.deferred_reason}</div>
                    )}
                    <div className="text-[10px] text-zinc-600 font-mono mt-2">
                      {(item.product || item.publication_type).replace(/_/g, ' ')}{item.edition ? ` · ${item.edition}` : ''}
                      {item.region && ` · ${item.region}`}
                      {' · '}Confidence: <span className="text-amber-400">{(item.confidence_score * 100).toFixed(0)}%</span>
                      {' · '}{timeAgo(item.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={`/dashboard/admin/publications/${item.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-800/60 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
                      title="View & edit publication"
                    >
                      <Eye className="w-3 h-3" /> View
                    </Link>
                    <button
                      onClick={() => approveDeferred(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-900/30 border border-emerald-800 text-emerald-300 hover:bg-emerald-900/50 text-xs"
                      title="Approve and publish"
                    >
                      <ThumbsUp className="w-3 h-3" /> Approve
                    </button>
                    <button
                      onClick={() => rejectDeferred(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-900/30 border border-red-800 text-red-300 hover:bg-red-900/50 text-xs"
                      title="Reject and discard"
                    >
                      <Trash2 className="w-3 h-3" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {deferred.length === 0 && (
              <div className="text-center text-zinc-600 text-sm py-12">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-zinc-700" />
                No publications awaiting review
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
