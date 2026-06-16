'use client'

import { useEffect, useState, useCallback } from 'react'
import { Building2, Search, RefreshCw, Users, MapPin, Trash2, ArrowDownCircle } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'
import { ConfirmModal } from '@/components/admin/ConfirmModal'


interface Organization {
  id: string
  name: string
  slug: string
  country: string
  city: string
  user_count: number
  subscription_tier: string
  created_at: string
  is_active: boolean
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Organization | null>(null)
  const [pendingFree, setPendingFree] = useState<Organization | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/admin/organizations?search=${encodeURIComponent(search)}`)
      if (res.ok) {
        const data = (await res.json()) as { data: Organization[] }
        setOrgs(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setBusy(true); setActionError(null)
    try {
      const res = await authedFetch(`/api/admin/organizations/${pendingDelete.id}`, { method: 'DELETE' })
      if (res.ok) { setPendingDelete(null); await fetchOrgs() }
      else {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setActionError(j.error || `Delete failed (${res.status})`)
      }
    } catch { setActionError('Network error') } finally { setBusy(false) }
  }

  const confirmSetFree = async () => {
    if (!pendingFree) return
    setBusy(true); setActionError(null)
    try {
      const res = await authedFetch(`/api/admin/organizations/${pendingFree.id}/set-free`, { method: 'POST' })
      if (res.ok) { setPendingFree(null); await fetchOrgs() }
      else {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setActionError(j.error || `Action failed (${res.status})`)
      }
    } catch { setActionError('Network error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800">
            <Building2 className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">ORGANIZATIONS</h1>
            <p className="font-mono text-xs text-muted-foreground">Manage platform organizations</p>
          </div>
        </div>
        <button onClick={fetchOrgs} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-card border border-border font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="border border-border bg-card/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Organization</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Location</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Users</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Tier</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">Loading...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">No organizations found</td></tr>
            ) : (
              orgs.map((org) => (
                <tr key={org.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-foreground">{org.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{org.slug}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {org.city}, {org.country}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {org.user_count}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-amber-600 dark:text-amber-400 uppercase">{org.subscription_tier}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] ${org.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-800' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-800'}`}>
                      {org.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {org.subscription_tier !== 'free' && (
                        <button
                          onClick={() => { setActionError(null); setPendingFree(org) }}
                          title="Downgrade to free"
                          className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-transparent hover:border-amber-800 transition-colors"
                        >
                          <ArrowDownCircle className="w-3 h-3" /> SET FREE
                        </button>
                      )}
                      <button
                        onClick={() => { setActionError(null); setPendingDelete(org) }}
                        title="Delete organization"
                        className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-transparent hover:border-red-800 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> DELETE
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete organization"
        message={
          <>
            Permanently delete <span className="text-foreground font-bold">{pendingDelete?.name}</span> and
            <span className="text-foreground"> all {pendingDelete?.user_count} member account(s)</span> (platform + Keycloak),
            plus its subscriptions, invoices, and payments. This cannot be undone.
          </>
        }
        confirmWord={pendingDelete?.name}
        confirmLabel="Delete organization"
        busy={busy}
        error={actionError}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmModal
        open={!!pendingFree}
        title="Downgrade to free"
        danger={false}
        message={
          <>
            Cancel <span className="text-foreground font-bold">{pendingFree?.name}</span>&apos;s paid subscription and move it to the
            <span className="text-foreground"> free</span> tier? Member accounts and data are kept — only billing changes.
          </>
        }
        confirmLabel="Set to free"
        busy={busy}
        error={actionError}
        onConfirm={confirmSetFree}
        onClose={() => setPendingFree(null)}
      />
    </div>
  )
}
