'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { authedFetch } from '@/lib/authed-fetch'
import {
    Building2,
    Plus,
    Search,
    Phone,
    Mail,
    MapPin,
    FileText,
    Edit2,
    Loader2,
    XCircle,
    RefreshCw,
    User,
    Clock,
    Trash2,
    Send,
    Eye,
    ChevronRight,
    Paperclip,
    Receipt,
    Check,
    AlertTriangle,
} from 'lucide-react'

interface Client {
    id: string
    name: string
    companyName: string | null
    email: string | null
    phone: string | null
    address: string | null
    type: 'individual' | 'corporate' | 'government'
    tinNumber: string | null
    notes: string | null
    valuationsCount: number
    totalBilled: number
    lastActiveAt: string | null
    createdAt: string
}

interface ClientInvoice {
    id: string
    invoiceNumber: string
    status: string
    totalAmount: number
    feeModel: string
    invoiceDate: string
    dueDate: string | null
    paidAt: string | null
    paidAmount: number | null
    createdAt: string
}

interface ClientValuation {
    id: string
    valuationType: string
    valuationPurpose: string
    status: string
    estimatedValue: number | null
    confidenceScore: number | null
    propertyAddress: string | null
    propertyType: string | null
    createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
    draft: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    sent: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    paid: 'text-green-400 bg-green-500/10 border-green-500/20',
    overdue: 'text-red-400 bg-red-500/10 border-red-500/20',
    cancelled: 'text-zinc-500 bg-zinc-600/10 border-zinc-600/20',
    in_progress: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    completed: 'text-green-400 bg-green-500/10 border-green-500/20',
    approved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

const TYPE_STYLES: Record<string, { label: string; color: string }> = {
    individual: { label: 'INDIVIDUAL', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    corporate: { label: 'CORPORATE', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
    government: { label: 'GOVERNMENT', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
}

function formatCurrency(amount: number): string {
    return `GHS ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
    }
}

export default function ClientsPage() {
    const searchParams = useSearchParams()
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
    const [typeFilter, setTypeFilter] = useState('all')
    const [mounted, setMounted] = useState(false)

    // Modal state
    const [showModal, setShowModal] = useState(false)
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [formData, setFormData] = useState({
        name: '',
        type: 'individual',
        email: '',
        phone: '',
        companyName: '',
        address: '',
        tinNumber: '',
        notes: ''
    })
    const [saving, setSaving] = useState(false)

    // Detail panel state
    const [selectedClient, setSelectedClient] = useState<Client | null>(null)
    const [showDetail, setShowDetail] = useState(false)
    const [detailTab, setDetailTab] = useState<'overview' | 'invoices' | 'valuations'>('overview')
    const [clientInvoices, setClientInvoices] = useState<ClientInvoice[]>([])
    const [clientValuations, setClientValuations] = useState<ClientValuation[]>([])
    const [loadingDetail, setLoadingDetail] = useState(false)

    // Email compose state
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [emailData, setEmailData] = useState({ to: '', subject: '', body: '' })
    const [emailAttachment, setEmailAttachment] = useState<File | null>(null)
    const [sendingEmail, setSendingEmail] = useState(false)
    const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => { setMounted(true); fetchClients() }, [])

    const fetchClients = async () => {
        try {
            setLoading(true)
            const res = await authedFetch(`${API_BASE}/valuation-clients`, { headers: getHeaders() })
            if (res.ok) {
                const data = await res.json()
                setClients(data.clients || [])
            }
        } catch (err) {
            console.error('Failed to fetch clients', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!formData.name) return
        setSaving(true)
        try {
            const url = editingClient
                ? `${API_BASE}/valuation-clients/${editingClient.id}`
                : `${API_BASE}/valuation-clients`

            const method = editingClient ? 'PUT' : 'POST'

            const res = await authedFetch(url, {
                method,
                headers: getHeaders(),
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                setShowModal(false)
                fetchClients()
                resetForm()
            } else {
                alert('Failed to save client')
            }
        } catch (err) {
            console.error('Save failed', err)
            alert('An error occurred')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this client?')) return
        try {
            const res = await authedFetch(`${API_BASE}/valuation-clients/${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            })
            if (res.ok) {
                fetchClients()
                if (selectedClient?.id === id) {
                    setShowDetail(false)
                    setSelectedClient(null)
                }
            } else {
                const data = await res.json()
                alert(data.error || 'Failed to delete client')
            }
        } catch (err) {
            alert('An error occurred')
        }
    }

    const openEditModal = (client: Client) => {
        setEditingClient(client)
        setFormData({
            name: client.name,
            type: client.type,
            email: client.email || '',
            phone: client.phone || '',
            companyName: client.companyName || '',
            address: client.address || '',
            tinNumber: client.tinNumber || '',
            notes: client.notes || ''
        })
        setShowModal(true)
    }

    const openAddModal = () => {
        resetForm()
        setShowModal(true)
    }

    const resetForm = () => {
        setEditingClient(null)
        setFormData({
            name: '', type: 'individual', email: '', phone: '',
            companyName: '', address: '', tinNumber: '', notes: ''
        })
    }

    // Open client detail panel
    const openClientDetail = async (client: Client) => {
        setSelectedClient(client)
        setShowDetail(true)
        setDetailTab('overview')
        setLoadingDetail(true)
        try {
            const [invoicesRes, valuationsRes] = await Promise.all([
                authedFetch(`${API_BASE}/valuation-clients/${client.id}/invoices`, { headers: getHeaders() }),
                authedFetch(`${API_BASE}/valuation-clients/${client.id}/valuations`, { headers: getHeaders() }),
            ])
            if (invoicesRes.ok) {
                const data = await invoicesRes.json()
                setClientInvoices(data.invoices || [])
            }
            if (valuationsRes.ok) {
                const data = await valuationsRes.json()
                setClientValuations(data.valuations || [])
            }
        } catch (err) {
            console.error('Failed to load client details', err)
        } finally {
            setLoadingDetail(false)
        }
    }

    // Open email compose
    const openEmailCompose = (client: Client) => {
        setEmailData({
            to: client.email || '',
            subject: `PROPMETRIK — ${client.name}`,
            body: `Dear ${client.name},\n\n\n\nBest regards,\nPROPMETRIK Valuation Services`,
        })
        setEmailAttachment(null)
        setEmailStatus(null)
        setShowEmailModal(true)
    }

    // Send email via backend API
    const handleSendEmail = async () => {
        if (!emailData.to || !selectedClient) return
        setSendingEmail(true)
        setEmailStatus(null)
        try {
            const res = await authedFetch(`${API_BASE}/valuation-clients/${selectedClient.id}/send-email`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    to: emailData.to,
                    subject: emailData.subject,
                    body: emailData.body,
                }),
            })
            const data = await res.json()
            if (res.ok && data.success) {
                setEmailStatus({ type: 'success', message: 'Email sent successfully!' })
                setTimeout(() => setShowEmailModal(false), 1500)
            } else {
                setEmailStatus({ type: 'error', message: data.error || 'Failed to send email' })
            }
        } catch (err) {
            setEmailStatus({ type: 'error', message: 'Network error — could not send email' })
        } finally {
            setSendingEmail(false)
        }
    }

    const filteredClients = clients.filter(c => {
        if (typeFilter !== 'all' && c.type !== typeFilter) return false
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            return c.name.toLowerCase().includes(q) ||
                c.companyName?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q)
        }
        return true
    })

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="font-mono text-xl text-white flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-amber-500" />
                        CLIENT MANAGEMENT
                    </h1>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">
                        Valuation clients • Contact directory • Billing history
                    </p>
                </div>
                <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
                >
                    <Plus className="w-3 h-3" />
                    ADD CLIENT
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL CLIENTS</div>
                    <div className="font-mono text-2xl text-white">{clients.length}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">CORPORATE</div>
                    <div className="font-mono text-2xl text-green-400">{clients.filter(c => c.type === 'corporate').length}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">INDIVIDUAL</div>
                    <div className="font-mono text-2xl text-blue-400">{clients.filter(c => c.type === 'individual').length}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL BILLED</div>
                    <div className="font-mono text-2xl text-amber-500">{formatCurrency(clients.reduce((s, c) => s + (c.totalBilled || 0), 0))}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {['all', 'corporate', 'individual', 'government'].map(t => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`px-3 py-1.5 font-mono text-[10px] transition-colors border ${typeFilter === t
                                ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
                                : 'text-zinc-500 border-zinc-800 hover:text-zinc-300'
                                }`}
                        >
                            {t.toUpperCase()}
                        </button>
                    ))}
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search clients..."
                        className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                    />
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex gap-4">
                {/* Client Table */}
                <div className={`bg-zinc-900 border border-zinc-800 transition-all ${showDetail ? 'flex-1 min-w-0' : 'w-full'}`}>
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            CLIENT DIRECTORY
                        </div>
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-4">
                            <button onClick={fetchClients} className="hover:text-white transition-colors">
                                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                            <span>{filteredClients.length} records</span>
                        </div>
                    </div>

                    {loading && clients.length === 0 ? (
                        <div className="py-20 flex justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                    <th className="text-left py-2 px-4">CLIENT</th>
                                    <th className="text-left py-2 px-4">TYPE</th>
                                    <th className="text-left py-2 px-4">CONTACT</th>
                                    <th className="text-right py-2 px-4">VALUATIONS</th>
                                    <th className="text-right py-2 px-4">TOTAL BILLED</th>
                                    {!showDetail && <th className="text-right py-2 px-4">LAST ACTIVE</th>}
                                    <th className="text-center py-2 px-4 w-32">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                                {filteredClients.map((client) => {
                                    const style = TYPE_STYLES[client.type] || TYPE_STYLES.individual
                                    const isSelected = selectedClient?.id === client.id
                                    return (
                                        <tr
                                            key={client.id}
                                            className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 group cursor-pointer transition-colors ${isSelected ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}
                                            onClick={() => openClientDetail(client)}
                                        >
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 ${isSelected ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-amber-500'}`}>
                                                        {client.name[0]}
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-medium group-hover:text-amber-500 transition-colors">
                                                            {client.name}
                                                        </div>
                                                        {client.companyName && client.companyName !== client.name && (
                                                            <div className="text-zinc-500 text-[10px]">{client.companyName}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono border rounded ${style.color}`}>
                                                    {style.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="space-y-1">
                                                    {client.email && (
                                                        <div className="flex items-center gap-1.5 text-zinc-400 text-[10px]">
                                                            <Mail className="w-3 h-3" />
                                                            <span className="truncate max-w-[120px]">{client.email}</span>
                                                        </div>
                                                    )}
                                                    {client.phone && (
                                                        <div className="flex items-center gap-1.5 text-zinc-500 text-[10px]">
                                                            <Phone className="w-3 h-3" />
                                                            {client.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right text-white">{client.valuationsCount || 0}</td>
                                            <td className="py-3 px-4 text-right text-amber-400 font-bold">{formatCurrency(client.totalBilled || 0)}</td>
                                            {!showDetail && (
                                                <td className="py-3 px-4 text-right text-zinc-500">
                                                    {mounted && client.lastActiveAt ? new Date(client.lastActiveAt).toLocaleDateString('en-GB') : '—'}
                                                </td>
                                            )}
                                            <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => openClientDetail(client)} className="p-1 text-zinc-500 hover:text-amber-400 transition-colors" title="View Details">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => openEditModal(client)} className="p-1 text-zinc-500 hover:text-white transition-colors" title="Edit Client">
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    {client.email && (
                                                        <button onClick={() => openEmailCompose(client)} className="p-1 text-zinc-500 hover:text-blue-400 transition-colors" title="Send Email">
                                                            <Send className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleDelete(client.id)} className="p-1 text-zinc-500 hover:text-red-400 transition-colors" title="Delete Client">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Client Detail Panel (slide-out) */}
                {showDetail && selectedClient && (
                    <div className="w-full sm:w-[480px] bg-zinc-900 border border-zinc-800 flex flex-col max-h-[calc(100vh-280px)] shrink-0">
                        {/* Panel Header */}
                        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-mono text-sm font-bold">
                                    {selectedClient.name[0]}
                                </div>
                                <div>
                                    <h2 className="font-mono text-sm text-white font-bold">{selectedClient.name}</h2>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono border rounded ${TYPE_STYLES[selectedClient.type]?.color || ''}`}>
                                            {TYPE_STYLES[selectedClient.type]?.label}
                                        </span>
                                        {selectedClient.companyName && selectedClient.companyName !== selectedClient.name && (
                                            <span className="text-zinc-500 text-[10px]">{selectedClient.companyName}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => openEditModal(selectedClient)} className="p-1.5 text-zinc-500 hover:text-white transition-colors" title="Edit">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {selectedClient.email && (
                                    <button onClick={() => openEmailCompose(selectedClient)} className="p-1.5 text-zinc-500 hover:text-blue-400 transition-colors" title="Email">
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button onClick={() => { setShowDetail(false); setSelectedClient(null) }} className="p-1.5 text-zinc-500 hover:text-white transition-colors">
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-zinc-800">
                            {(['overview', 'invoices', 'valuations'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setDetailTab(tab)}
                                    className={`flex-1 py-2 font-mono text-[10px] text-center transition-colors border-b-2 ${detailTab === tab
                                        ? 'text-amber-500 border-amber-500'
                                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                                        }`}
                                >
                                    {tab.toUpperCase()} {tab === 'invoices' ? `(${clientInvoices.length})` : tab === 'valuations' ? `(${clientValuations.length})` : ''}
                                </button>
                            ))}
                        </div>

                        {/* Panel Content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {loadingDetail ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                                </div>
                            ) : detailTab === 'overview' ? (
                                <div className="space-y-4">
                                    {/* Quick Stats */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-black border border-zinc-800 p-3">
                                            <div className="font-mono text-[9px] text-zinc-500 mb-1">VALUATIONS</div>
                                            <div className="font-mono text-xl text-white">{selectedClient.valuationsCount || 0}</div>
                                        </div>
                                        <div className="bg-black border border-zinc-800 p-3">
                                            <div className="font-mono text-[9px] text-zinc-500 mb-1">TOTAL BILLED</div>
                                            <div className="font-mono text-lg text-amber-500">{formatCurrency(selectedClient.totalBilled || 0)}</div>
                                        </div>
                                    </div>

                                    {/* Contact Info */}
                                    <div className="bg-black border border-zinc-800 p-3 space-y-2">
                                        <div className="font-mono text-[10px] text-zinc-500 uppercase mb-2">Contact Information</div>
                                        {selectedClient.email && (
                                            <div className="flex items-center gap-2 text-xs">
                                                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                                                <a href={`mailto:${selectedClient.email}`} className="text-blue-400 hover:text-blue-300 transition-colors">{selectedClient.email}</a>
                                            </div>
                                        )}
                                        {selectedClient.phone && (
                                            <div className="flex items-center gap-2 text-xs">
                                                <Phone className="w-3.5 h-3.5 text-zinc-500" />
                                                <a href={`tel:${selectedClient.phone}`} className="text-zinc-300 hover:text-white transition-colors">{selectedClient.phone}</a>
                                            </div>
                                        )}
                                        {selectedClient.address && (
                                            <div className="flex items-start gap-2 text-xs">
                                                <MapPin className="w-3.5 h-3.5 text-zinc-500 mt-0.5" />
                                                <span className="text-zinc-400">{selectedClient.address}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Company / Tax Info */}
                                    <div className="bg-black border border-zinc-800 p-3 space-y-2">
                                        <div className="font-mono text-[10px] text-zinc-500 uppercase mb-2">Business Details</div>
                                        {selectedClient.companyName && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-zinc-500">Company</span>
                                                <span className="text-white">{selectedClient.companyName}</span>
                                            </div>
                                        )}
                                        {selectedClient.tinNumber && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-zinc-500">TIN</span>
                                                <span className="text-white font-mono">{selectedClient.tinNumber}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-zinc-500">Client Since</span>
                                            <span className="text-white">{mounted ? new Date(selectedClient.createdAt).toLocaleDateString('en-GB') : '—'}</span>
                                        </div>
                                        {selectedClient.lastActiveAt && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-zinc-500">Last Active</span>
                                                <span className="text-white">{mounted ? new Date(selectedClient.lastActiveAt).toLocaleDateString('en-GB') : '—'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Notes */}
                                    {selectedClient.notes && (
                                        <div className="bg-black border border-zinc-800 p-3">
                                            <div className="font-mono text-[10px] text-zinc-500 uppercase mb-2">Notes</div>
                                            <p className="text-xs text-zinc-400 whitespace-pre-wrap">{selectedClient.notes}</p>
                                        </div>
                                    )}

                                    {/* Quick Actions */}
                                    <div className="space-y-2">
                                        <div className="font-mono text-[10px] text-zinc-500 uppercase">Quick Actions</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => openEditModal(selectedClient)} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 font-mono text-[10px] hover:text-white hover:bg-zinc-700 transition-colors">
                                                <Edit2 className="w-3 h-3" /> EDIT CLIENT
                                            </button>
                                            {selectedClient.email && (
                                                <button onClick={() => openEmailCompose(selectedClient)} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 font-mono text-[10px] hover:text-blue-400 hover:bg-zinc-700 transition-colors">
                                                    <Send className="w-3 h-3" /> SEND EMAIL
                                                </button>
                                            )}
                                            <a href={`/dashboard/valuations/finance?client_id=${selectedClient.id}`} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 font-mono text-[10px] hover:text-amber-400 hover:bg-zinc-700 transition-colors">
                                                <Receipt className="w-3 h-3" /> NEW INVOICE
                                            </a>
                                            <a href={`/dashboard/valuations/new?client_id=${selectedClient.id}`} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 font-mono text-[10px] hover:text-green-400 hover:bg-zinc-700 transition-colors">
                                                <Plus className="w-3 h-3" /> NEW VALUATION
                                            </a>
                                        </div>
                                        <button onClick={() => handleDelete(selectedClient.id)} className="flex items-center gap-2 px-3 py-2 w-full bg-zinc-800 text-zinc-500 font-mono text-[10px] hover:text-red-400 hover:bg-zinc-700 transition-colors">
                                            <Trash2 className="w-3 h-3" /> DELETE CLIENT
                                        </button>
                                    </div>
                                </div>
                            ) : detailTab === 'invoices' ? (
                                <div className="space-y-2">
                                    {clientInvoices.length === 0 ? (
                                        <div className="text-center py-8">
                                            <Receipt className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                                            <p className="font-mono text-xs text-zinc-500">No invoices yet</p>
                                            <a href="/dashboard/valuations/finance" className="font-mono text-[10px] text-amber-500 hover:text-amber-400">Create first invoice →</a>
                                        </div>
                                    ) : (
                                        clientInvoices.map(inv => (
                                            <div key={inv.id} className="bg-black border border-zinc-800 p-3 hover:border-zinc-700 transition-colors">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-mono text-xs text-amber-500">{inv.invoiceNumber}</span>
                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono border rounded ${STATUS_COLORS[inv.status] || STATUS_COLORS.draft}`}>
                                                        {inv.status === 'paid' && <Check className="w-2 h-2" />}
                                                        {inv.status === 'overdue' && <AlertTriangle className="w-2 h-2" />}
                                                        {inv.status.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="font-mono text-white text-sm font-bold">{formatCurrency(inv.totalAmount)}</span>
                                                    <span className="font-mono text-[10px] text-zinc-500">{mounted ? new Date(inv.invoiceDate).toLocaleDateString('en-GB') : '—'}</span>
                                                </div>
                                                <div className="font-mono text-[10px] text-zinc-600 mt-1">
                                                    {inv.feeModel === 'percentage_of_value' ? '0.5% of value' : inv.feeModel === 'man_day_rate' ? 'Man-day rate' : 'Flat fee'}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {clientValuations.length === 0 ? (
                                        <div className="text-center py-8">
                                            <FileText className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                                            <p className="font-mono text-xs text-zinc-500">No valuations yet</p>
                                            <a href={`/dashboard/valuations/new?client_id=${selectedClient.id}`} className="font-mono text-[10px] text-amber-500 hover:text-amber-400">Start first valuation →</a>
                                        </div>
                                    ) : (
                                        clientValuations.map(val => (
                                            <a key={val.id} href={`/dashboard/valuations/${val.id}`} className="block bg-black border border-zinc-800 p-3 hover:border-zinc-700 transition-colors group/val">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono border rounded ${STATUS_COLORS[val.status] || STATUS_COLORS.draft}`}>
                                                        {val.status?.toUpperCase().replace(/_/g, ' ')}
                                                    </span>
                                                    <ChevronRight className="w-3 h-3 text-zinc-600 group-hover/val:text-amber-500 transition-colors" />
                                                </div>
                                                {val.propertyAddress && <div className="font-mono text-xs text-white mb-1 truncate">{val.propertyAddress}</div>}
                                                <div className="flex items-center justify-between">
                                                    <span className="font-mono text-[10px] text-zinc-500">{val.valuationType?.replace(/_/g, ' ')} • {val.valuationPurpose?.replace(/_/g, ' ')}</span>
                                                    {val.estimatedValue && <span className="font-mono text-xs text-amber-400 font-bold">{formatCurrency(val.estimatedValue)}</span>}
                                                </div>
                                                <div className="font-mono text-[10px] text-zinc-600 mt-1">
                                                    {mounted ? new Date(val.createdAt).toLocaleDateString('en-GB') : '—'}
                                                    {val.propertyType && ` • ${val.propertyType.replace(/_/g, ' ')}`}
                                                </div>
                                            </a>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {/* Add/Edit Client Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-700 w-[500px] max-w-full shadow-2xl">
                        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                            <h2 className="font-mono text-sm text-white flex items-center gap-2">
                                {editingClient ? <Edit2 className="w-4 h-4 text-amber-500" /> : <Plus className="w-4 h-4 text-amber-500" />}
                                {editingClient ? 'EDIT CLIENT' : 'ADD NEW CLIENT'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white">
                                <XCircle className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">CLIENT NAME *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                    autoFocus
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">TYPE</label>
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                    >
                                        <option value="individual">Individual</option>
                                        <option value="corporate">Corporate</option>
                                        <option value="government">Government</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">TIN NUMBER</label>
                                    <input
                                        type="text"
                                        value={formData.tinNumber}
                                        onChange={e => setFormData({ ...formData, tinNumber: e.target.value })}
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">EMAIL</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">PHONE</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">COMPANY NAME</label>
                                <input
                                    type="text"
                                    value={formData.companyName}
                                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                />
                            </div>
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">ADDRESS</label>
                                <textarea
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50 resize-none"
                                />
                            </div>
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">NOTES</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50 resize-none"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors">
                                CANCEL
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                            >
                                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                                {editingClient ? 'SAVE CHANGES' : 'ADD CLIENT'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Compose Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-700 w-[560px] max-w-full shadow-2xl">
                        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                            <h2 className="font-mono text-sm text-white flex items-center gap-2">
                                <Mail className="w-4 h-4 text-amber-500" />
                                COMPOSE EMAIL
                            </h2>
                            <button onClick={() => setShowEmailModal(false)} className="text-zinc-500 hover:text-white">
                                <XCircle className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">TO</label>
                                <input type="email" value={emailData.to} onChange={e => setEmailData({ ...emailData, to: e.target.value })} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50" />
                            </div>
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">SUBJECT</label>
                                <input type="text" value={emailData.subject} onChange={e => setEmailData({ ...emailData, subject: e.target.value })} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50" />
                            </div>
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">MESSAGE</label>
                                <textarea value={emailData.body} onChange={e => setEmailData({ ...emailData, body: e.target.value })} rows={8} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50 resize-none" />
                            </div>
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">ATTACHMENT (OPTIONAL)</label>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white transition-colors border border-zinc-700">
                                        <Paperclip className="w-3 h-3" />
                                        {emailAttachment ? emailAttachment.name : 'Attach File'}
                                    </button>
                                    {emailAttachment && (
                                        <button onClick={() => setEmailAttachment(null)} className="text-zinc-500 hover:text-red-400"><XCircle className="w-3.5 h-3.5" /></button>
                                    )}
                                    <input ref={fileInputRef} type="file" className="hidden" onChange={e => setEmailAttachment(e.target.files?.[0] || null)} />
                                </div>
                                <p className="font-mono text-[9px] text-zinc-600 mt-1">Note: Attachments are not yet supported via the email service.</p>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
                            <div className="font-mono text-[9px]">
                                {emailStatus ? (
                                    <span className={emailStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}>{emailStatus.message}</span>
                                ) : (
                                    <span className="text-zinc-600">Sends via PROPMETRIK email service</span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors">CANCEL</button>
                                <button onClick={handleSendEmail} disabled={!emailData.to || sendingEmail} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50">
                                    {sendingEmail ? <><Loader2 className="w-3 h-3 animate-spin" /> SENDING...</> : <><Send className="w-3 h-3" /> SEND EMAIL</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}