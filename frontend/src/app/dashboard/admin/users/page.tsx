'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Search, RefreshCw, Shield, Mail, Building2, Trash2 } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'
import { ConfirmModal } from '@/components/admin/ConfirmModal'


interface User {
  id: string
  email: string
  full_name: string
  role: string
  organization_name: string
  last_login: string
  is_active: boolean
  status?: string
  email_verified?: boolean
  created_at: string
}

// Truthful 3-state: a disabled/suspended account is INACTIVE; an account that
// signed up but has never actually logged in is PENDING; otherwise ACTIVE.
// (Login now advances pending_verification → active, so a signed-in user reads
// ACTIVE. Email verification is tracked separately and doesn't make a live,
// signed-in account "inactive".)
function userState(u: User): 'active' | 'pending' | 'inactive' {
  if (!u.is_active || u.status === 'suspended' || u.status === 'inactive') return 'inactive'
  if (u.status === 'pending_verification') return 'pending'
  return 'active'
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/admin/users?search=${encodeURIComponent(search)}`)
      if (res.ok) {
        const data = (await res.json()) as { data: User[] }
        setUsers(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await authedFetch(`/api/admin/users/${pendingDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setPendingDelete(null)
        await fetchUsers()
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setActionError(j.error || `Delete failed (${res.status})`)
      }
    } catch {
      setActionError('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800">
            <Users className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">USERS</h1>
            <p className="font-mono text-xs text-muted-foreground">Manage platform users</p>
          </div>
        </div>
        <button onClick={fetchUsers} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-card border border-border font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
        />
      </div>

      <div className="border border-border bg-card/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Organization</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Last Login</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">No users found</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-foreground">{user.full_name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" />{user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />{user.organization_name}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] bg-muted text-muted-foreground border border-border">
                      <Shield className="w-3 h-3" />{user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const s = userState(user)
                      const cls = s === 'active'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800'
                        : s === 'pending'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-800'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800'
                      return (
                        <span
                          className={`inline-block px-2 py-0.5 font-mono text-[10px] border ${cls}`}
                          title={s === 'pending' ? 'Account active; email not verified yet' : undefined}
                        >
                          {s === 'active' ? 'ACTIVE' : s === 'pending' ? 'PENDING' : 'INACTIVE'}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setActionError(null); setPendingDelete(user) }}
                      title="Delete user"
                      className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-transparent hover:border-red-800 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> DELETE
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete user"
        message={
          <>
            Permanently delete <span className="text-foreground font-bold">{pendingDelete?.full_name}</span> ({pendingDelete?.email})?
            This removes the platform account <span className="text-foreground">and its Keycloak login</span>. This cannot be undone.
          </>
        }
        confirmWord={pendingDelete?.email}
        confirmLabel="Delete user"
        busy={busy}
        error={actionError}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
