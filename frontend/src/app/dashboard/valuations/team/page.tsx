'use client'

import { useState, useEffect } from 'react'
import {
    Users,
    Mail,
    UserPlus,
    Shield,
    Clock,
    MoreHorizontal,
    Send,
    XCircle,
    RefreshCw,
    Search,
    Loader2,
    Check,
    ChevronDown,
} from 'lucide-react'

// Types
interface OrgMember {
    id: string
    email: string
    firstName: string
    lastName: string
    displayName: string
    role: string
    status: string
    createdAt: string
    lastLoginAt: string | null
}

interface OrgInvitation {
    id: string
    email: string
    role: string
    status: 'pending' | 'accepted' | 'revoked' | 'expired'
    invitedByName?: string
    expiresAt: string
    createdAt: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

const ROLE_LABELS: Record<string, string> = {
    super_admin: 'SUPER ADMIN',
    firm_principal: 'FIRM PRINCIPAL',
    admin: 'ADMIN',
    senior_valuer: 'SENIOR VALUER',
    manager: 'MANAGER',
    valuer: 'VALUER',
    finance_manager: 'FINANCE MANAGER',
    compliance_officer: 'COMPLIANCE OFFICER',
    agent: 'AGENT',
    probationer: 'PROBATIONER',
    inspector: 'INSPECTOR',
    analyst: 'ANALYST',
    viewer: 'VIEWER',
}

const ROLE_COLORS: Record<string, string> = {
    super_admin: 'text-red-400 bg-red-500/10 border-red-500/20',
    firm_principal: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    admin: 'text-red-400 bg-red-500/10 border-red-500/20',
    senior_valuer: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    manager: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    valuer: 'text-green-400 bg-green-500/10 border-green-500/20',
    finance_manager: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    compliance_officer: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    agent: 'text-green-400 bg-green-500/10 border-green-500/20',
    probationer: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    inspector: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    analyst: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    viewer: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
}

// Roles grouped by category for the invite dropdown
const INVITABLE_ROLES = [
    // Valuation roles
    { value: 'firm_principal', label: 'Firm Principal — Director, signs reports, full authority' },
    { value: 'senior_valuer', label: 'Senior Valuer — Lead valuer, QA reviewer' },
    { value: 'valuer', label: 'Valuer — Conducts independent valuations' },
    { value: 'probationer', label: 'Probationer — Trainee valuer (supervised)' },
    { value: 'inspector', label: 'Inspector — Field inspections only' },
    // Operations roles
    { value: 'finance_manager', label: 'Finance Manager — Invoices, payouts, fee config' },
    { value: 'compliance_officer', label: 'Compliance Officer — Audit trails, QA oversight' },
    // General roles
    { value: 'admin', label: 'Admin — Full org access' },
    { value: 'manager', label: 'Manager — Team management + full data access' },
    { value: 'agent', label: 'Agent — Legacy: same access as valuer' },
    { value: 'analyst', label: 'Analyst — Read-only analytics' },
    { value: 'viewer', label: 'Viewer — Read-only basic' },
]

// Roles that count as "leadership" for stats
const LEADERSHIP_ROLES = ['super_admin', 'admin', 'manager', 'firm_principal'];
// Roles that count as "valuers" for stats
const VALUER_ROLES = ['valuer', 'senior_valuer', 'agent', 'probationer', 'inspector'];

export default function TeamPage() {
    const [members, setMembers] = useState<OrgMember[]>([])
    const [invitations, setInvitations] = useState<OrgInvitation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [inviteFirstName, setInviteFirstName] = useState('')
    const [inviteLastName, setInviteLastName] = useState('')
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('valuer')
    const [inviteMessage, setInviteMessage] = useState('')
    const [inviting, setInviting] = useState(false)
    const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members')
    const [editRoleId, setEditRoleId] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    // Fetch data
    const fetchData = async () => {
        try {
            setLoading(true)
            setError(null)

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-organization-id': 'default',
                'x-user-id': 'default',
            }

            // Try to get auth from localStorage
            if (typeof window !== 'undefined') {
                const token = localStorage.getItem('token')
                if (token) headers['Authorization'] = `Bearer ${token}`
                const orgId = localStorage.getItem('organizationId')
                if (orgId) headers['x-organization-id'] = orgId
                const userId = localStorage.getItem('userId')
                if (userId) headers['x-user-id'] = userId
            }

            const [membersRes, invitationsRes] = await Promise.all([
                fetch(`${API_BASE}/valuation-org/members`, { headers }),
                fetch(`${API_BASE}/valuation-org/invitations`, { headers }),
            ])

            if (membersRes.ok) {
                const membersData = await membersRes.json()
                setMembers(membersData.data || [])
            }

            if (invitationsRes.ok) {
                const invData = await invitationsRes.json()
                setInvitations(invData.data || [])
            }
        } catch (err) {
            setError('Failed to load team data')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    // Send invitation
    const handleInvite = async () => {
        if (!inviteEmail) return
        setInviting(true)

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-organization-id': 'default',
                'x-user-id': 'default',
            }

            if (typeof window !== 'undefined') {
                const token = localStorage.getItem('token')
                if (token) headers['Authorization'] = `Bearer ${token}`
                const orgId = localStorage.getItem('organizationId')
                if (orgId) headers['x-organization-id'] = orgId
                const userId = localStorage.getItem('userId')
                if (userId) headers['x-user-id'] = userId
            }

            const res = await fetch(`${API_BASE}/valuation-org/invitations`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    email: inviteEmail,
                    role: inviteRole,
                    firstName: inviteFirstName || undefined,
                    lastName: inviteLastName || undefined,
                    message: inviteMessage || undefined,
                }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to send invitation')
            }

            setShowInviteModal(false)
            setInviteFirstName('')
            setInviteLastName('')
            setInviteEmail('')
            setInviteRole('valuer')
            setInviteMessage('')
            fetchData()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setInviting(false)
        }
    }

    // Revoke invitation
    const handleRevoke = async (id: string) => {
        if (!confirm('Revoke this invitation?')) return

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-organization-id': 'default',
                'x-user-id': 'default',
            }

            if (typeof window !== 'undefined') {
                const token = localStorage.getItem('token')
                if (token) headers['Authorization'] = `Bearer ${token}`
            }

            await fetch(`${API_BASE}/valuation-org/invitations/${id}`, {
                method: 'DELETE',
                headers,
            })

            fetchData()
        } catch (err) {
            alert('Failed to revoke invitation')
        }
    }

    // Update member role
    const handleRoleUpdate = async (userId: string, newRole: string) => {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-organization-id': 'default',
                'x-user-id': 'default',
            }

            if (typeof window !== 'undefined') {
                const token = localStorage.getItem('token')
                if (token) headers['Authorization'] = `Bearer ${token}`
                const orgId = localStorage.getItem('organizationId')
                if (orgId) headers['x-organization-id'] = orgId
            }

            await fetch(`${API_BASE}/valuation-org/members/${userId}/role`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ role: newRole }),
            })

            setEditRoleId(null)
            fetchData()
        } catch (err) {
            alert('Failed to update role')
        }
    }

    // Remove member
    const handleRemoveMember = async (userId: string, name: string) => {
        if (!confirm(`Remove ${name} from the organization?`)) return

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-organization-id': 'default',
                'x-user-id': 'default',
            }

            if (typeof window !== 'undefined') {
                const token = localStorage.getItem('token')
                if (token) headers['Authorization'] = `Bearer ${token}`
                const orgId = localStorage.getItem('organizationId')
                if (orgId) headers['x-organization-id'] = orgId
            }

            await fetch(`${API_BASE}/valuation-org/members/${userId}`, {
                method: 'DELETE',
                headers,
            })

            fetchData()
        } catch (err) {
            alert('Failed to remove member')
        }
    }

    // Filter members
    const filteredMembers = members.filter(m =>
        !searchQuery ||
        m.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const pendingInvitations = invitations.filter(i => i.status === 'pending')

    const timestamp = mounted ? new Date().toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit',
    }) : '--:--'

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="font-mono text-xl text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-amber-500" />
                        TEAM MANAGEMENT
                    </h1>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">
                        Organization Members & Access Control • <span className="text-amber-500">{timestamp}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchData()}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" />
                        REFRESH
                    </button>
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
                    >
                        <UserPlus className="w-3 h-3" />
                        INVITE MEMBER
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL MEMBERS</div>
                    <div className="font-mono text-2xl text-white">{members.length}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">PENDING INVITATIONS</div>
                    <div className="font-mono text-2xl text-amber-500">{pendingInvitations.length}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">LEADERSHIP</div>
                    <div className="font-mono text-2xl text-blue-400">
                        {members.filter(m => LEADERSHIP_ROLES.includes(m.role)).length}
                    </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">VALUERS</div>
                    <div className="font-mono text-2xl text-green-400">
                        {members.filter(m => VALUER_ROLES.includes(m.role)).length}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 mb-4 border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('members')}
                    className={`font-mono text-xs pb-3 px-1 border-b-2 transition-colors ${activeTab === 'members'
                        ? 'text-amber-500 border-amber-500'
                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                        }`}
                >
                    MEMBERS ({members.length})
                </button>
                <button
                    onClick={() => setActiveTab('invitations')}
                    className={`font-mono text-xs pb-3 px-1 border-b-2 transition-colors ${activeTab === 'invitations'
                        ? 'text-amber-500 border-amber-500'
                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                        }`}
                >
                    INVITATIONS ({pendingInvitations.length})
                </button>
            </div>

            {/* Search */}
            <div className="mb-4">
                <div className="relative w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search members..."
                        className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                    />
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                    <span className="ml-3 font-mono text-xs text-zinc-500">Loading team data...</span>
                </div>
            ) : error ? (
                <div className="bg-red-500/10 border border-red-500/20 p-4 text-center">
                    <p className="font-mono text-xs text-red-400">{error}</p>
                    <button onClick={fetchData} className="font-mono text-xs text-amber-500 mt-2 hover:text-amber-400">
                        RETRY
                    </button>
                </div>
            ) : activeTab === 'members' ? (
                /* Members Table */
                <div className="bg-zinc-900 border border-zinc-800">
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            ORGANIZATION MEMBERS
                        </div>
                        <div className="font-mono text-[10px] text-zinc-500">{filteredMembers.length} records</div>
                    </div>

                    {filteredMembers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                            <Users className="w-8 h-8 mb-3 text-zinc-700" />
                            <div className="font-mono text-xs mb-2">No members found</div>
                            <button
                                onClick={() => setShowInviteModal(true)}
                                className="font-mono text-xs text-amber-500 hover:text-amber-400"
                            >
                                Invite your first team member →
                            </button>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                    <th className="text-left py-2 px-4">MEMBER</th>
                                    <th className="text-left py-2 px-4">EMAIL</th>
                                    <th className="text-left py-2 px-4">ROLE</th>
                                    <th className="text-left py-2 px-4">STATUS</th>
                                    <th className="text-right py-2 px-4">JOINED</th>
                                    <th className="text-center py-2 px-4 w-24">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                                {filteredMembers.map((member) => (
                                    <tr key={member.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-amber-500 font-mono text-xs font-bold">
                                                    {(member.firstName?.[0] || member.email[0]).toUpperCase()}
                                                </div>
                                                <span className="text-white">
                                                    {member.displayName || `${member.firstName} ${member.lastName}`}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-zinc-400">{member.email}</td>
                                        <td className="py-3 px-4">
                                            {editRoleId === member.id ? (
                                                <select
                                                    value={member.role}
                                                    onChange={(e) => handleRoleUpdate(member.id, e.target.value)}
                                                    onBlur={() => setEditRoleId(null)}
                                                    autoFocus
                                                    className="bg-zinc-800 text-white font-mono text-xs border border-zinc-700 px-2 py-1 focus:outline-none focus:border-amber-500"
                                                >
                                                    {INVITABLE_ROLES.map(r => (
                                                        <option key={r.value} value={r.value}>{ROLE_LABELS[r.value] || r.value}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <button
                                                    onClick={() => setEditRoleId(member.id)}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border rounded ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer
                                                        }`}
                                                >
                                                    <Shield className="w-2.5 h-2.5" />
                                                    {ROLE_LABELS[member.role] || member.role.toUpperCase()}
                                                    <ChevronDown className="w-2.5 h-2.5 opacity-50" />
                                                </button>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded ${member.status === 'active'
                                                ? 'text-green-400 bg-green-500/10'
                                                : 'text-zinc-400 bg-zinc-500/10'
                                                }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${member.status === 'active' ? 'bg-green-400' : 'bg-zinc-500'
                                                    }`} />
                                                {member.status?.toUpperCase() || 'ACTIVE'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right text-zinc-500">
                                            {mounted && member.createdAt ? new Date(member.createdAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <button
                                                onClick={() => handleRemoveMember(member.id, member.displayName || member.email)}
                                                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                                title="Remove member"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : (
                /* Invitations Table */
                <div className="bg-zinc-900 border border-zinc-800">
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-2">
                            <Mail className="w-3 h-3" />
                            PENDING INVITATIONS
                        </div>
                        <div className="font-mono text-[10px] text-zinc-500">{pendingInvitations.length} pending</div>
                    </div>

                    {pendingInvitations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                            <Mail className="w-8 h-8 mb-3 text-zinc-700" />
                            <div className="font-mono text-xs">No pending invitations</div>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                    <th className="text-left py-2 px-4">EMAIL</th>
                                    <th className="text-left py-2 px-4">ROLE</th>
                                    <th className="text-left py-2 px-4">INVITED BY</th>
                                    <th className="text-left py-2 px-4">STATUS</th>
                                    <th className="text-right py-2 px-4">EXPIRES</th>
                                    <th className="text-center py-2 px-4 w-24">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                                {pendingInvitations.map((inv) => (
                                    <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                        <td className="py-3 px-4 text-white">{inv.email}</td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border rounded ${ROLE_COLORS[inv.role] || ROLE_COLORS.viewer
                                                }`}>
                                                {ROLE_LABELS[inv.role] || inv.role.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-zinc-400">{inv.invitedByName || '—'}</td>
                                        <td className="py-3 px-4">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-amber-400 bg-amber-500/10 rounded">
                                                <Clock className="w-2.5 h-2.5" />
                                                PENDING
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right text-zinc-500">
                                            {mounted && inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <button
                                                onClick={() => handleRevoke(inv.id)}
                                                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                                title="Revoke invitation"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-zinc-900 border border-zinc-700 w-[480px] max-w-[90vw]">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                            <h2 className="font-mono text-sm text-white flex items-center gap-2">
                                <UserPlus className="w-4 h-4 text-amber-500" />
                                INVITE TEAM MEMBER
                            </h2>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="text-zinc-500 hover:text-white transition-colors"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="px-6 py-4 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">FIRST NAME *</label>
                                    <input
                                        type="text"
                                        value={inviteFirstName}
                                        onChange={(e) => setInviteFirstName(e.target.value)}
                                        placeholder="Jane"
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">LAST NAME</label>
                                    <input
                                        type="text"
                                        value={inviteLastName}
                                        onChange={(e) => setInviteLastName(e.target.value)}
                                        placeholder="Mensah"
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">EMAIL ADDRESS *</label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="colleague@company.com"
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                                />
                            </div>

                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">ROLE *</label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                >
                                    {INVITABLE_ROLES.map((r) => (
                                        <option key={r.value} value={r.value}>
                                            {r.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">PERSONAL MESSAGE (OPTIONAL)</label>
                                <textarea
                                    value={inviteMessage}
                                    onChange={(e) => setInviteMessage(e.target.value)}
                                    placeholder="Welcome to the team..."
                                    rows={3}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
                                />
                            </div>

                            <div className="bg-zinc-800/50 border border-zinc-700/50 px-3 py-2 mt-2">
                                <p className="font-mono text-[10px] text-zinc-400">
                                    <Shield className="w-3 h-3 inline mr-1 text-amber-500" />
                                    Role-based access controls determine what each team member can see and do. <strong className="text-white">Finance</strong> is restricted to Finance Manager, Admin, and Firm Principal roles. <strong className="text-white">Report signing</strong> requires Firm Principal or Senior Valuer.
                                </p>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="px-4 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleInvite}
                                disabled={!inviteEmail || !inviteFirstName || inviting}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {inviting ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Send className="w-3 h-3" />
                                )}
                                {inviting ? 'SENDING...' : 'SEND INVITATION'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
