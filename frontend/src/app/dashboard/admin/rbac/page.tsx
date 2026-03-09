'use client'

import { useEffect, useState, useCallback } from 'react'
import { Shield, Search, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, RefreshCw, Filter, Eye, X, Check } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || ''

// All available roles
const ALL_ROLES = [
  'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
  'project_manager', 'valuer', 'finance_manager', 'compliance_officer',
  'agent', 'probationer', 'inspector', 'analyst', 'viewer',
] as const

interface Policy {
  id: string
  policy_name: string
  resource_type: string
  action: string
  allowed_roles: string[]
  require_ownership: boolean
  require_assignment: boolean
  require_same_org: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AuditEntry {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  user_id: string
  user_email: string
  ip_address: string
  metadata: Record<string, any>
  created_at: string
}

type Tab = 'policies' | 'audit'

export default function RbacAdminPage() {
  const [tab, setTab] = useState<Tab>('policies')
  const [policies, setPolicies] = useState<Policy[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterResource, setFilterResource] = useState('')
  const [filterActive, setFilterActive] = useState<string>('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const limit = 25

  // ── Fetch policies ──
  const fetchPolicies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      if (filterResource) params.set('resource_type', filterResource)
      if (filterActive) params.set('is_active', filterActive)

      const res = await authedFetch(`${API}/rbac/policies?${params}`)
      const data = await res.json()
      if (data.success) {
        setPolicies(data.data)
        setTotal(data.pagination?.total || 0)
      }
    } catch (err) {
      console.error('Failed to load policies', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, filterResource, filterActive])

  // ── Fetch audit log ──
  const fetchAudit = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`${API}/rbac/audit?limit=50&page=1`)
      const data = await res.json()
      if (data.success) setAuditLog(data.data)
    } catch (err) {
      console.error('Failed to load audit log', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'policies') fetchPolicies()
    else fetchAudit()
  }, [tab, fetchPolicies, fetchAudit])

  // ── Invalidate RBAC cache ──
  const invalidateCache = async () => {
    await authedFetch(`${API}/rbac/config/invalidate`, { method: 'POST' })
    fetchPolicies()
  }

  // ── Delete / deactivate policy ──
  const deletePolicy = async (id: string) => {
    if (!confirm('Deactivate this policy?')) return
    await authedFetch(`${API}/rbac/policies/${id}`, { method: 'DELETE' })
    fetchPolicies()
  }

  // Unique resource types for filter dropdown
  const resourceTypes = [...new Set(policies.map(p => p.resource_type))].sort()
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white font-mono flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            RBAC POLICY MANAGER
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Manage authorization policies, roles, and view audit trail</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={invalidateCache}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-mono hover:bg-zinc-700 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> INVALIDATE CACHE
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-red-900/30 border border-red-800 text-red-400 text-[10px] font-mono hover:bg-red-900/50 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> NEW POLICY
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {(['policies', 'audit'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[10px] font-mono uppercase tracking-wider border-b-2 ${tab === t ? 'border-red-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            {t === 'policies' ? `Policies (${total})` : 'Audit Log'}
          </button>
        ))}
      </div>

      {tab === 'policies' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search policies..."
                className="w-full bg-zinc-900 border border-zinc-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 font-mono focus:outline-none focus:border-zinc-600"
              />
            </div>
            <select
              value={filterResource}
              onChange={e => { setFilterResource(e.target.value); setPage(1) }}
              className="bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-xs text-white font-mono focus:outline-none"
            >
              <option value="">All Resources</option>
              {resourceTypes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={filterActive}
              onChange={e => { setFilterActive(e.target.value); setPage(1) }}
              className="bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-xs text-white font-mono focus:outline-none"
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          {/* Table */}
          <div className="border border-zinc-800 overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">Policy</th>
                  <th className="px-3 py-2 text-left">Resource</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Roles</th>
                  <th className="px-3 py-2 text-center">Own</th>
                  <th className="px-3 py-2 text-center">Assign</th>
                  <th className="px-3 py-2 text-center">Org</th>
                  <th className="px-3 py-2 text-center">Active</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {loading ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
                ) : policies.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">No policies found</td></tr>
                ) : policies.map(policy => (
                  <tr key={policy.id} className="hover:bg-zinc-900/30">
                    <td className="px-3 py-2 text-white whitespace-nowrap">{policy.policy_name}</td>
                    <td className="px-3 py-2 text-zinc-400">{policy.resource_type}</td>
                    <td className="px-3 py-2 text-zinc-400">{policy.action}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {policy.allowed_roles.slice(0, 4).map(r => (
                          <span key={r} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 text-[9px] rounded">{r}</span>
                        ))}
                        {policy.allowed_roles.length > 4 && (
                          <span className="px-1.5 py-0.5 text-zinc-500 text-[9px]">+{policy.allowed_roles.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">{policy.require_ownership ? <Check className="w-3 h-3 text-green-500 mx-auto" /> : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2 text-center">{policy.require_assignment ? <Check className="w-3 h-3 text-green-500 mx-auto" /> : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2 text-center">{policy.require_same_org ? <Check className="w-3 h-3 text-green-500 mx-auto" /> : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 text-[9px] ${policy.is_active ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {policy.is_active ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditingPolicy(policy)} className="p-1 hover:bg-zinc-800 rounded" title="Edit">
                          <Edit2 className="w-3 h-3 text-zinc-400" />
                        </button>
                        <button onClick={() => deletePolicy(policy.id)} className="p-1 hover:bg-zinc-800 rounded" title="Deactivate">
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
              <span>{total} policies total</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'audit' && (
        <div className="border border-zinc-800 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase tracking-wider">
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Decision</th>
                <th className="px-3 py-2 text-left">Resource</th>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
              ) : auditLog.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No audit entries yet</td></tr>
              ) : auditLog.map(entry => {
                const parts = entry.action.split(':')
                const decision = parts[1] || 'unknown'
                const action = parts[2] || ''
                return (
                  <tr key={entry.id} className="hover:bg-zinc-900/30">
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 text-[9px] ${decision === 'allowed' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {decision.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{entry.entity_type}:{action}</td>
                    <td className="px-3 py-2 text-white">{entry.user_email || entry.user_id?.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-zinc-400">{entry.metadata?.role || '—'}</td>
                    <td className="px-3 py-2 text-zinc-500">{entry.metadata?.reason || '—'}</td>
                    <td className="px-3 py-2 text-zinc-600">{entry.ip_address || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Modal */}
      {(editingPolicy || showCreate) && (
        <PolicyModal
          policy={editingPolicy}
          onClose={() => { setEditingPolicy(null); setShowCreate(false) }}
          onSave={() => { setEditingPolicy(null); setShowCreate(false); fetchPolicies() }}
        />
      )}
    </div>
  )
}

// ── Policy Edit/Create Modal ──
function PolicyModal({ policy, onClose, onSave }: { policy: Policy | null; onClose: () => void; onSave: () => void }) {
  const isNew = !policy
  const [form, setForm] = useState({
    policy_name: policy?.policy_name || '',
    resource_type: policy?.resource_type || '',
    action: policy?.action || '',
    allowed_roles: policy?.allowed_roles || [] as string[],
    require_ownership: policy?.require_ownership || false,
    require_assignment: policy?.require_assignment || false,
    require_same_org: policy?.require_same_org || false,
    is_active: policy?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleRole = (role: string) => {
    setForm(f => ({
      ...f,
      allowed_roles: f.allowed_roles.includes(role)
        ? f.allowed_roles.filter(r => r !== role)
        : [...f.allowed_roles, role],
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const url = isNew ? `${API}/rbac/policies` : `${API}/rbac/policies/${policy!.id}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Failed to save')
        return
      }
      onSave()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white font-mono">{isNew ? 'CREATE POLICY' : 'EDIT POLICY'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded"><X className="w-4 h-4 text-zinc-400" /></button>
        </div>

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 px-3 py-1.5">{error}</p>}

        <div className="space-y-3">
          {isNew && (
            <>
              <div>
                <label className="text-[10px] text-zinc-500 font-mono uppercase">Policy Name</label>
                <input value={form.policy_name} onChange={e => setForm(f => ({ ...f, policy_name: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-zinc-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 font-mono uppercase">Resource Type</label>
                  <input value={form.resource_type} onChange={e => setForm(f => ({ ...f, resource_type: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-mono uppercase">Action</label>
                  <input value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-zinc-500" />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-[10px] text-zinc-500 font-mono uppercase">Allowed Roles</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ALL_ROLES.map(role => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`px-2 py-1 text-[10px] font-mono border ${
                    form.allowed_roles.includes(role)
                      ? 'bg-green-900/30 border-green-700 text-green-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {(['require_ownership', 'require_assignment', 'require_same_org', 'is_active'] as const).map(field => (
              <label key={field} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.checked }))}
                  className="accent-red-500"
                />
                <span className="text-[10px] text-zinc-400 font-mono">{field.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 font-mono hover:text-white">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-red-900/30 border border-red-800 text-red-400 text-xs font-mono hover:bg-red-900/50 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isNew ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
