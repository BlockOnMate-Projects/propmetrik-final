'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, RefreshCw, Search, Filter, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

interface AuditLog {
  id: string
  user_email: string
  action: string
  resource_type: string
  resource_id: string
  ip_address: string
  details: string
  created_at: string
}

const PAGE_SIZE = 50

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)

  // shared query params for both list + export
  const filterParams = useCallback(() => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (actionFilter) p.set('action', actionFilter)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p
  }, [search, actionFilter, from, to])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = filterParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(offset))
      const res = await authedFetch(`/api/admin/audit-logs?${params}`)
      if (res.ok) {
        const data = (await res.json()) as { data: AuditLog[]; total: number }
        setLogs(data.data || [])
        setTotal(data.total ?? 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [filterParams, offset])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // changing a filter resets to the first page
  const resetAnd = (fn: () => void) => { fn(); setOffset(0) }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await authedFetch(`/api/admin/audit-logs/export?${filterParams()}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = offset + logs.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800">
            <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">AUDIT LOGS</h1>
            <p className="font-mono text-xs text-muted-foreground">Immutable platform activity trail · retained indefinitely</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={exporting || total === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] text-foreground bg-card border border-border hover:border-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? 'EXPORTING…' : 'EXPORT CSV'}
          </button>
          <button onClick={fetchLogs} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search user / resource…"
            value={search}
            onChange={(e) => resetAnd(() => setSearch(e.target.value))}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={actionFilter}
            onChange={(e) => resetAnd(() => setActionFilter(e.target.value))}
            className="pl-10 pr-4 py-2 bg-card border border-border font-mono text-sm text-foreground focus:border-red-500 focus:outline-none appearance-none"
          >
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="font-mono text-[10px] text-muted-foreground uppercase">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => resetAnd(() => setFrom(e.target.value))}
            className="px-2 py-2 bg-card border border-border font-mono text-xs text-foreground focus:border-red-500 focus:outline-none [color-scheme:dark]"
          />
          <label className="font-mono text-[10px] text-muted-foreground uppercase">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => resetAnd(() => setTo(e.target.value))}
            className="px-2 py-2 bg-card border border-border font-mono text-xs text-foreground focus:border-red-500 focus:outline-none [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="border border-border bg-card/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Timestamp</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Action</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Resource</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">No audit logs found</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{log.user_email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] border ${
                      log.action === 'delete' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800' :
                      log.action === 'create' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800' :
                      'bg-muted text-muted-foreground border-border'
                    }`}>
                      {log.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{log.resource_type}:{log.resource_id}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{log.ip_address}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>{rangeStart}–{rangeEnd} of {total.toLocaleString()}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-border text-foreground hover:border-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={rangeEnd >= total || loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-border text-foreground hover:border-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
