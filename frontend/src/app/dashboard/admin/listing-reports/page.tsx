'use client'

/**
 * Admin Listing Moderation queue — Marketplace Trust & Anti-Fraud, Phase 5 (Gate E).
 * Listings with open community reports or currently suspended; suspend / reinstate.
 */

import { useEffect, useState, useCallback } from 'react'
import { Flag, RefreshCw, ExternalLink, Ban, ShieldCheck, AlertTriangle } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

interface QueueRow {
  property_source: 'pm' | 'crm'
  property_id: string
  organization_id: string
  organization_name?: string | null
  title?: string | null
  token?: string | null
  open_reports: number
  reasons?: string[] | null
  last_reported?: string
  moderation_status: 'active' | 'suspended'
  moderation_reason?: string | null
}

export default function ListingReportsPage() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch('/api/admin/listing-reports')
      if (res.ok) { const d = (await res.json()) as { data: QueueRow[] }; setRows(d.data || []) }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  const act = async (row: QueueRow, action: 'suspend' | 'reinstate') => {
    const key = `${row.property_source}:${row.property_id}`
    setActingId(key); setError(null)
    try {
      const res = await authedFetch(`/api/admin/listings/${row.property_source}/${row.property_id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (res.ok) await fetchQueue()
      else { const j = await res.json().catch(() => ({})) as { error?: string }; setError(j.error || `Action failed (${res.status})`) }
    } catch { setError('Network error') } finally { setActingId(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800"><Flag className="w-5 h-5 text-red-600 dark:text-red-400" /></div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">LISTING MODERATION</h1>
            <p className="font-mono text-xs text-muted-foreground">Reported listings & auto-suspensions (Gate E)</p>
          </div>
        </div>
        <button onClick={fetchQueue} className="p-2 text-muted-foreground hover:text-foreground transition-colors"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {error && <div className="px-4 py-2 bg-red-100 dark:bg-red-900/20 border border-red-800 font-mono text-xs text-red-600 dark:text-red-400">{error}</div>}

      <div className="border border-border bg-card/50 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Listing', 'Organization', 'Open reports', 'Reasons', 'Status', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center font-mono text-sm text-muted-foreground">No reported listings — the marketplace is clean.</td></tr>
            ) : (
              rows.map((row) => {
                const key = `${row.property_source}:${row.property_id}`
                const acting = actingId === key
                return (
                  <tr key={key} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm text-foreground flex items-center gap-1.5">
                        {row.title || '(untitled)'}
                        {row.token && <a href={`/apply/${row.token}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600"><ExternalLink className="w-3 h-3" /></a>}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">{row.property_source}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.organization_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-sm font-bold ${row.open_reports >= 3 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>{row.open_reports}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{(row.reasons || []).join(', ').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] uppercase border ${row.moderation_status === 'suspended' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800'}`}>
                        {row.moderation_status === 'suspended' ? <AlertTriangle className="w-3 h-3" /> : null}{row.moderation_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {row.moderation_status === 'suspended' ? (
                          <button onClick={() => act(row, 'reinstate')} disabled={acting} className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-transparent hover:border-blue-800 transition-colors disabled:opacity-50"><ShieldCheck className="w-3 h-3" /> REINSTATE</button>
                        ) : (
                          <button onClick={() => act(row, 'suspend')} disabled={acting} className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-transparent hover:border-red-800 transition-colors disabled:opacity-50"><Ban className="w-3 h-3" /> SUSPEND</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
