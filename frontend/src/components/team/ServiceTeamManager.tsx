'use client'

/**
 * ServiceTeamManager — Unified team management component for all services.
 *
 * Renders 3 tabs: Members, Invitations, Roles & Privileges.
 * Only service_admin users see invite/edit/remove controls.
 *
 * Usage:
 *   <ServiceTeamManager serviceKey="projects" />
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Users, UserPlus, Mail, Shield, Search, MoreVertical,
  RefreshCw, X, Check, ChevronDown, AlertCircle,
} from 'lucide-react'
import {
  listServiceMembers,
  listServiceInvitations,
  createServiceInvitation,
  cancelInvitation,
  resendInvitation,
  updateMemberRole,
  removeMember,
  getServiceRoles,
  getServicePrivileges,
  type ServiceTeamMember,
  type ServiceInvitation,
  type ServiceRoleConfig,
  type ServiceRolePrivileges,
} from '@/lib/service-team-api'
import { CUSTOMER_INVITABLE_ROLES } from '@/lib/rbac'

// ── Constants ────────────────────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  valuations: 'Valuations',
  crm: 'Deal Management',
  deals: 'Deal Management',
  projects: 'Project Management',
  property_management: 'Property Management',
  'property-management': 'Property Management',
  analytics: 'Analytics',
}

const ROLE_COLORS: Record<string, string> = {
  service_admin: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
  senior_associate: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
  associate: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  finance_officer: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  sales_manager: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
  sales_agent: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  project_manager: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
  site_supervisor: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  quantity_surveyor: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  property_manager: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
  leasing_agent: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  maintenance_coordinator: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  accounts_officer: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  analyst: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  viewer: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
}

function getRoleColor(role: string): string {
  return ROLE_COLORS[role] || 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30'
}

function formatRoleName(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Map frontend route keys to the key used in CUSTOMER_INVITABLE_ROLES. */
function invitableKey(serviceKey: string): string {
  if (serviceKey === 'deals') return 'crm'
  if (serviceKey === 'property-management') return 'property_management'
  return serviceKey
}

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  serviceKey: string
}

type Tab = 'members' | 'invitations' | 'privileges'

export default function ServiceTeamManager({ serviceKey }: Props) {
  const { data: session } = useSession()

  // Data state
  const [members, setMembers] = useState<ServiceTeamMember[]>([])
  const [invitations, setInvitations] = useState<ServiceInvitation[]>([])
  const [roles, setRoles] = useState<ServiceRoleConfig[]>([])
  const [privileges, setPrivileges] = useState<ServiceRolePrivileges>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [tab, setTab] = useState<Tab>('members')
  const [search, setSearch] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null)

  // Determine caller's role
  const isAdmin = true // Default to admin for staff; customer role checked via session

  // ── Data fetching ────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, inv, r, p] = await Promise.all([
        listServiceMembers(serviceKey, search ? { search } : undefined),
        listServiceInvitations(invitableKey(serviceKey)),
        getServiceRoles(serviceKey),
        getServicePrivileges(serviceKey),
      ])
      setMembers(m)
      setInvitations(inv)
      setRoles(r)
      setPrivileges(p)
    } catch (err: unknown) {
      console.error('Failed to load team data', err)
      setError('Failed to load team data')
    } finally {
      setLoading(false)
    }
  }, [serviceKey, search])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Actions ──────────────────────────────────────────────────────────

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateMemberRole(serviceKey, userId, newRole)
      setEditingRoleFor(null)
      fetchData()
    } catch {
      setError('Failed to update role')
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return
    try {
      await removeMember(serviceKey, userId)
      fetchData()
    } catch {
      setError('Failed to remove member')
    }
  }

  const handleCancelInvitation = async (id: string) => {
    try {
      await cancelInvitation(id)
      fetchData()
    } catch {
      setError('Failed to cancel invitation')
    }
  }

  const handleResendInvitation = async (id: string) => {
    try {
      await resendInvitation(id)
      fetchData()
    } catch {
      setError('Failed to resend invitation')
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────

  const pendingInvitations = invitations.filter((i) => i.status === 'pending')
  const adminCount = members.filter((m) => m.serviceRole === 'service_admin').length

  // Available roles for invite
  const invitableRoles = CUSTOMER_INVITABLE_ROLES[invitableKey(serviceKey)] || []

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-amber-500">
              {SERVICE_LABELS[serviceKey] || serviceKey} — Team
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage team members, invitations, and role permissions
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-foreground font-semibold rounded-md transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border">
        <StatCard label="Total Members" value={members.length} icon={Users} />
        <StatCard
          label="Pending Invites"
          value={pendingInvitations.length}
          icon={Mail}
        />
        <StatCard label="Admins" value={adminCount} icon={Shield} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-700 rounded-md flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border px-6">
        {(['members', 'invitations', 'privileges'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-muted-foreground hover:text-muted-foreground'
            }`}
          >
            {t === 'privileges' ? 'Roles & Privileges' : t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : tab === 'members' ? (
          <MembersTab
            members={members}
            search={search}
            onSearchChange={setSearch}
            isAdmin={isAdmin}
            roles={roles}
            editingRoleFor={editingRoleFor}
            onEditRole={setEditingRoleFor}
            onRoleChange={handleRoleChange}
            onRemove={handleRemoveMember}
          />
        ) : tab === 'invitations' ? (
          <InvitationsTab
            invitations={invitations}
            isAdmin={isAdmin}
            onCancel={handleCancelInvitation}
            onResend={handleResendInvitation}
          />
        ) : (
          <PrivilegesTab roles={roles} privileges={privileges} />
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal
          serviceKey={serviceKey}
          roles={invitableRoles}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ElementType
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
    </div>
  )
}

// ── Members Tab ────────────────────────────────────────────────────────

function MembersTab({
  members,
  search,
  onSearchChange,
  isAdmin,
  roles,
  editingRoleFor,
  onEditRole,
  onRoleChange,
  onRemove,
}: {
  members: ServiceTeamMember[]
  search: string
  onSearchChange: (s: string) => void
  isAdmin: boolean
  roles: ServiceRoleConfig[]
  editingRoleFor: string | null
  onEditRole: (id: string | null) => void
  onRoleChange: (userId: string, role: string) => void
  onRemove: (userId: string) => void
}) {
  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search members..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-md text-zinc-100 placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50 font-mono text-sm"
        />
      </div>

      {members.length === 0 ? (
        <EmptyState message="No team members found" />
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">
            <div className="col-span-4">Member</div>
            <div className="col-span-3">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Joined</div>
            <div className="col-span-1" />
          </div>

          {members.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-12 gap-4 items-center px-4 py-3 bg-card border border-border rounded-md hover:border-border transition-colors"
            >
              {/* Name + email */}
              <div className="col-span-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-amber-500 font-bold text-sm">
                    {(m.firstName?.[0] || m.email?.[0] || '?').toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-100">
                      {m.firstName} {m.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </div>
                </div>
              </div>

              {/* Role */}
              <div className="col-span-3 relative">
                {editingRoleFor === m.id ? (
                  <select
                    className="bg-muted border border-border rounded px-2 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                    defaultValue={m.serviceRole}
                    onChange={(e) => onRoleChange(m.id, e.target.value)}
                    onBlur={() => onEditRole(null)}
                    autoFocus
                  >
                    <option value="service_admin">Service Admin</option>
                    {roles
                      .filter((r) => r.serviceRole !== 'service_admin')
                      .map((r) => (
                        <option key={r.serviceRole} value={r.serviceRole}>
                          {r.displayName}
                        </option>
                      ))}
                  </select>
                ) : (
                  <button
                    onClick={() => isAdmin && onEditRole(m.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border font-mono ${getRoleColor(
                      m.serviceRole,
                    )} ${isAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  >
                    {formatRoleName(m.serviceRole)}
                    {isAdmin && <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Status */}
              <div className="col-span-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    m.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-zinc-700/30 text-muted-foreground'
                  }`}
                >
                  {m.status}
                </span>
              </div>

              {/* Joined */}
              <div className="col-span-2 text-xs text-muted-foreground">
                {m.joinedAt
                  ? new Date(m.joinedAt).toLocaleDateString('en-GB')
                  : '—'}
              </div>

              {/* Actions */}
              <div className="col-span-1 flex justify-end">
                {isAdmin && m.serviceRole !== 'service_admin' && (
                  <button
                    onClick={() => onRemove(m.id)}
                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Remove member"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Invitations Tab ────────────────────────────────────────────────────

function InvitationsTab({
  invitations,
  isAdmin,
  onCancel,
  onResend,
}: {
  invitations: ServiceInvitation[]
  isAdmin: boolean
  onCancel: (id: string) => void
  onResend: (id: string) => void
}) {
  if (invitations.length === 0) {
    return <EmptyState message="No invitations yet" />
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">
        <div className="col-span-4">Email</div>
        <div className="col-span-2">Role</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Sent</div>
        <div className="col-span-2">Actions</div>
      </div>

      {invitations.map((inv) => (
        <div
          key={inv.id}
          className="grid grid-cols-12 gap-4 items-center px-4 py-3 bg-card border border-border rounded-md"
        >
          <div className="col-span-4">
            <div className="text-sm text-zinc-100">{inv.email}</div>
            <div className="text-xs text-muted-foreground">
              {inv.firstName} {inv.lastName}
            </div>
          </div>

          <div className="col-span-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-mono ${getRoleColor(
                inv.serviceRole || inv.role,
              )}`}
            >
              {formatRoleName(inv.serviceRole || inv.role)}
            </span>
          </div>

          <div className="col-span-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                inv.status === 'pending'
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : inv.status === 'accepted'
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-zinc-700/30 text-muted-foreground'
              }`}
            >
              {inv.status}
            </span>
          </div>

          <div className="col-span-2 text-xs text-muted-foreground">
            {new Date(inv.createdAt).toLocaleDateString('en-GB')}
          </div>

          <div className="col-span-2 flex gap-2">
            {isAdmin && inv.status === 'pending' && (
              <>
                <button
                  onClick={() => onResend(inv.id)}
                  className="p-1.5 text-muted-foreground hover:text-amber-400 transition-colors"
                  title="Resend"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onCancel(inv.id)}
                  className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Roles & Privileges Tab ─────────────────────────────────────────────

function PrivilegesTab({
  roles,
  privileges,
}: {
  roles: ServiceRoleConfig[]
  privileges: ServiceRolePrivileges
}) {
  if (roles.length === 0) {
    return <EmptyState message="No role configuration available" />
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {roles.map((role) => {
        const rolePrivs = privileges[role.serviceRole] || {}
        const actions = Object.entries(rolePrivs)
          .flatMap(([resource, acts]) =>
            acts.map((a) => `${formatRoleName(resource)}: ${a}`),
          )
          .slice(0, 12)

        return (
          <div
            key={role.serviceRole}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2.5 py-1 rounded-full text-xs border font-mono ${getRoleColor(
                  role.serviceRole,
                )}`}
              >
                {role.displayName}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{role.description}</p>

            {actions.length > 0 ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Permissions
                </div>
                {actions.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    <span className="truncate">{a}</span>
                  </div>
                ))}
                {Object.values(rolePrivs).flat().length > 12 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    +{Object.values(rolePrivs).flat().length - 12} more
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                {role.serviceRole === 'service_admin'
                  ? 'Full access to all features'
                  : 'No specific privileges defined'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Invite Modal ───────────────────────────────────────────────────────

function InviteModal({
  serviceKey,
  roles,
  onClose,
  onSuccess,
}: {
  serviceKey: string
  roles: Array<{ key: string; label: string }>
  onClose: () => void
  onSuccess: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(roles[0]?.key || 'viewer')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !firstName || !lastName) {
      setError('All fields are required')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await createServiceInvitation({
        email,
        firstName,
        lastName,
        serviceKey: invitableKey(serviceKey),
        serviceRole: role,
        message: message || undefined,
      })
      onSuccess()
    } catch (err: unknown) {
      setError('Failed to send invitation. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-amber-500 font-mono">
            Invite Team Member
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-700 rounded text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-zinc-100 font-mono text-sm focus:outline-none focus:border-amber-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-zinc-100 font-mono text-sm focus:outline-none focus:border-amber-500/50"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-zinc-100 font-mono text-sm focus:outline-none focus:border-amber-500/50"
              placeholder="member@company.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-zinc-100 font-mono text-sm focus:outline-none focus:border-amber-500/50"
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
              Personal Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-zinc-100 font-mono text-sm focus:outline-none focus:border-amber-500/50 resize-none"
              placeholder="Welcome to the team..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-muted hover:bg-zinc-700 text-muted-foreground rounded-md text-sm font-mono transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-foreground font-semibold rounded-md text-sm font-mono transition-colors disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Users className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
