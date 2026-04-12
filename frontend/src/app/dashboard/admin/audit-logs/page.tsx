'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, RefreshCw, Search, Filter } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || ''

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

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (search) params.set('search', search)
      if (actionFilter) params.set('action', actionFilter)
      const res = await authedFetch(`${API}/api/v1/admin/audit-logs?${params}`)
      if (res.ok) {
        const data = (await res.json()) as { data: AuditLog[] }
        setLogs(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search, actionFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-900/30 border border-red-800">
            <FileText className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-white font-bold tracking-wide">AUDIT LOGS</h1>
            <p className="font-mono text-xs text-zinc-500">Platform activity audit trail</p>
          </div>
        </div>
        <button onClick={fetchLogs} className="p-2 text-zinc-400 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-white focus:border-red-500 focus:outline-none appearance-none"
          >
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
          </select>
        </div>
      </div>

      <div className="border border-zinc-800 bg-zinc-900/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Timestamp</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Action</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Resource</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">No audit logs found</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white">{log.user_email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] border ${
                      log.action === 'delete' ? 'bg-red-900/30 text-red-400 border-red-800' :
                      log.action === 'create' ? 'bg-green-900/30 text-green-400 border-green-800' :
                      'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}>
                      {log.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-zinc-400">{log.resource_type}:{log.resource_id}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">{log.ip_address}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
