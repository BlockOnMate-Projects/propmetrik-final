'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Receipt,
    DollarSign,
    Calculator,
    Send,
    Plus,
    Search,
    RefreshCw,
    Loader2,
    XCircle,
    Eye,
    Check,
    ChevronDown,
    FileText,
    ArrowUpRight,
    Clock,
    AlertTriangle,
    CreditCard,
    Banknote,
    UserPlus,
    Building2,
    Download,
    Printer,
    Settings,
    Wallet,
    Trash2,
} from 'lucide-react'
import PaymentSettings from '@/components/property-management/PaymentSettings'
import { valuationPaymentConfigApi } from '@/lib/valuation-api'

// Types
type FeeModel = 'percentage_of_value' | 'man_day_rate' | 'flat_fee'
type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'

interface LineItem {
    description: string
    quantity: number
    unit: string
    unitPrice: number
    amount: number
}

interface Invoice {
    id: string
    invoiceNumber: string
    clientName: string
    clientEmail: string | null
    feeModel: FeeModel
    subtotal: number
    totalTax: number
    totalAmount: number
    status: InvoiceStatus
    invoiceDate: string
    dueDate: string | null
    paymentLink: string | null
    paidAt: string | null
    paidAmount: number | null
    createdAt: string
}

interface InvoiceSummary {
    totalInvoiced: number
    totalPaid: number
    totalOutstanding: number
    totalOverdue: number
    invoiceCount: number
    paidCount: number
    overdueCount: number
}

interface Client {
    id: string
    name: string
    email: string | null
    phone: string | null
    companyName: string | null
    address: string | null
}

interface FeeCalculation {
    feeModel: FeeModel
    subtotal: number
    vatAmount: number
    nhilAmount: number
    getfundAmount: number
    covidLevyAmount: number
    totalTax: number
    platformFee: number
    totalAmount: number
    lineItems: LineItem[]
    breakdown: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

const STATUS_STYLES: Record<InvoiceStatus, { label: string; color: string }> = {
    draft: { label: 'DRAFT', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
    sent: { label: 'SENT', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    viewed: { label: 'VIEWED', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    paid: { label: 'PAID', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
    overdue: { label: 'OVERDUE', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
    cancelled: { label: 'CANCELLED', color: 'text-zinc-500 bg-zinc-600/10 border-zinc-600/20' },
}

const MWH_RATES: Record<string, { label: string; dailyRate: number }> = {
    project_director: { label: 'Project Director', dailyRate: 2859.80 },
    senior_consultant: { label: 'Senior Consultant', dailyRate: 2757.29 },
    consultant: { label: 'Consultant', dailyRate: 2143.46 },
    assistant_consultant: { label: 'Assistant Consultant', dailyRate: 1733.89 },
    technical_officer: { label: 'Technical Officer', dailyRate: 1426.27 },
    senior_technician: { label: 'Senior Technician', dailyRate: 1222.11 },
    technician: { label: 'Technician', dailyRate: 1018.40 },
    craftsman: { label: 'Craftsman', dailyRate: 814.70 },
    survey_assistant: { label: 'Survey Assistant', dailyRate: 611.00 },
    labourer: { label: 'Labourer', dailyRate: 407.29 },
}

function formatCurrency(amount: number): string {
    return `GHS ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token')
        if (token) headers['Authorization'] = `Bearer ${token}`
    }
    return headers
}

export default function FinancePage() {
    const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices')
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [summary, setSummary] = useState<InvoiceSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [mounted, setMounted] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')

    // Calculator state
    const [showCalc, setShowCalc] = useState(false)
    const [calcModel, setCalcModel] = useState<FeeModel>('percentage_of_value')
    const [calcPropertyValue, setCalcPropertyValue] = useState('')
    const [calcManDays, setCalcManDays] = useState<{ category: string; days: number; rate: number }[]>([
        { category: 'consultant', days: 1, rate: MWH_RATES.consultant.dailyRate },
    ])
    const [calcFlatFee, setCalcFlatFee] = useState('')
    const [calcResult, setCalcResult] = useState<FeeCalculation | null>(null)
    const [calculating, setCalculating] = useState(false)

    // Create invoice state
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newInvoice, setNewInvoice] = useState({
        clientId: '',
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        clientCompany: '',
        clientAddress: '',
        feeModel: 'percentage_of_value' as FeeModel,
        propertyAddress: '',
        propertyValue: '',
        manDays: [{ category: 'consultant', days: 1, rate: MWH_RATES.consultant.dailyRate }] as { category: string; days: number; rate: number }[],
        flatFee: '',
        notes: '',
        dueInDays: '30',
        valuationType: 'market_value',
    })
    const [creating, setCreating] = useState(false)
    const [liveCalc, setLiveCalc] = useState<FeeCalculation | null>(null)
    const [liveCalcLoading, setLiveCalcLoading] = useState(false)

    // Client dropdown state
    const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
    const [clientSearch, setClientSearch] = useState('')
    const clientDropdownRef = useRef<HTMLDivElement>(null)

    // Invoice preview state
    const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
    const [showPreview, setShowPreview] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    // Close client dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
                setClientDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Select client from dropdown
    const selectClient = (client: Client) => {
        setNewInvoice(prev => ({
            ...prev,
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email || '',
            clientPhone: client.phone || '',
            clientCompany: client.companyName || '',
            clientAddress: client.address || '',
            propertyAddress: client.address || prev.propertyAddress,
        }))
        setClientDropdownOpen(false)
        setClientSearch('')
    }

    // Live fee calculation when inputs change
    useEffect(() => {
        const timer = setTimeout(async () => {
            let hasInput = false
            if (newInvoice.feeModel === 'percentage_of_value' && newInvoice.propertyValue && parseFloat(newInvoice.propertyValue) > 0) hasInput = true
            if (newInvoice.feeModel === 'man_day_rate' && newInvoice.manDays.some(d => d.days > 0)) hasInput = true
            if (newInvoice.feeModel === 'flat_fee' && newInvoice.flatFee && parseFloat(newInvoice.flatFee) > 0) hasInput = true

            if (!hasInput || !showCreateModal) { setLiveCalc(null); return }

            setLiveCalcLoading(true)
            try {
                const params = new URLSearchParams()
                params.set('feeModel', newInvoice.feeModel)
                if (newInvoice.feeModel === 'percentage_of_value') params.set('propertyValue', newInvoice.propertyValue)
                if (newInvoice.feeModel === 'man_day_rate') params.set('manDays', JSON.stringify(newInvoice.manDays.filter(d => d.days > 0).map(d => ({ category: d.category, days: d.days, rate: d.rate }))))
                if (newInvoice.feeModel === 'flat_fee') params.set('flatFee', newInvoice.flatFee)
                const res = await fetch(`${API_BASE}/valuation-invoices/fee-calculator?${params.toString()}`, { headers: getHeaders() })
                if (res.ok) { const data = await res.json(); setLiveCalc(data.data) }
            } catch { /* ignore */ } finally { setLiveCalcLoading(false) }
        }, 500)
        return () => clearTimeout(timer)
    }, [newInvoice.feeModel, newInvoice.propertyValue, newInvoice.manDays, newInvoice.flatFee, showCreateModal])

    const filteredDropdownClients = clients.filter(c => {
        if (!clientSearch) return true
        const q = clientSearch.toLowerCase()
        return c.name.toLowerCase().includes(q) || c.companyName?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    })

    // Fetch data
    const fetchData = async () => {
        try {
            setLoading(true)
            const headers = getHeaders()

            const [invoicesRes, summaryRes, clientsRes] = await Promise.all([
                fetch(`${API_BASE}/valuation-invoices?limit=50`, { headers }),
                fetch(`${API_BASE}/valuation-invoices/summary`, { headers }),
                fetch(`${API_BASE}/valuation-clients?limit=100`, { headers }),
            ])

            if (invoicesRes.ok) {
                const data = await invoicesRes.json()
                setInvoices(data.invoices || [])
            }
            if (summaryRes.ok) {
                const data = await summaryRes.json()
                setSummary(data.data || null)
            }
            if (clientsRes.ok) {
                const data = await clientsRes.json()
                setClients(data.clients || [])
            }
        } catch (err) {
            console.error('Failed to load finance data', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    // Calculate fee
    const handleCalculate = async () => {
        setCalculating(true)
        try {
            const params = new URLSearchParams()
            params.set('feeModel', calcModel)
            if (calcModel === 'percentage_of_value' && calcPropertyValue) {
                params.set('propertyValue', calcPropertyValue)
            }
            if (calcModel === 'man_day_rate') {
                params.set('manDays', JSON.stringify(calcManDays.filter(d => d.days > 0).map(d => ({ category: d.category, days: d.days, rate: d.rate }))))
            }
            if (calcModel === 'flat_fee' && calcFlatFee) {
                params.set('flatFee', calcFlatFee)
            }

            const res = await fetch(`${API_BASE}/valuation-invoices/fee-calculator?${params.toString()}`, {
                headers: getHeaders(),
            })

            if (res.ok) {
                const data = await res.json()
                setCalcResult(data.data)
            }
        } catch (err) {
            console.error('Calculation failed', err)
        } finally {
            setCalculating(false)
        }
    }

    // Create invoice
    const handleCreate = async () => {
        if (!newInvoice.clientName) return
        setCreating(true)

        try {
            const lineItems = liveCalc?.lineItems || []

            const body: Record<string, unknown> = {
                clientName: newInvoice.clientName,
                clientEmail: newInvoice.clientEmail || undefined,
                clientPhone: newInvoice.clientPhone || undefined,
                clientCompany: newInvoice.clientCompany || undefined,
                clientAddress: newInvoice.clientAddress || undefined,
                clientId: newInvoice.clientId || undefined,
                feeModel: newInvoice.feeModel,
                propertyAddress: newInvoice.propertyAddress || undefined,
                propertyValue: newInvoice.propertyValue ? parseFloat(newInvoice.propertyValue) : undefined,
                notes: newInvoice.notes || undefined,
                lineItems,
                dueInDays: parseInt(newInvoice.dueInDays) || 30,
                valuationType: newInvoice.valuationType,
            }

            if (newInvoice.feeModel === 'man_day_rate') {
                body.manDays = newInvoice.manDays.filter(d => d.days > 0).map(d => ({ category: d.category, days: d.days, rate: d.rate }))
            }
            if (newInvoice.feeModel === 'flat_fee') {
                body.flatFee = parseFloat(newInvoice.flatFee) || 0
            }

            const res = await fetch(`${API_BASE}/valuation-invoices`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(body),
            })

            if (res.ok) {
                setShowCreateModal(false)
                setNewInvoice({
                    clientId: '', clientName: '', clientEmail: '', clientPhone: '', clientCompany: '', clientAddress: '',
                    feeModel: 'percentage_of_value', propertyAddress: '', propertyValue: '', 
                    manDays: [{ category: 'consultant', days: 1, rate: MWH_RATES.consultant.dailyRate }], flatFee: '', notes: '', dueInDays: '30', valuationType: 'market_value',
                })
                setLiveCalc(null)
                fetchData()
            } else {
                const err = await res.json().catch(() => ({}))
                alert(err.message || 'Failed to create invoice')
            }
        } catch (err) {
            alert('Failed to create invoice')
        } finally {
            setCreating(false)
        }
    }

    // Send invoice
    const handleSend = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/valuation-invoices/${id}/send`, {
                method: 'POST',
                headers: getHeaders(),
            })
            if (res.ok) fetchData()
        } catch (err) {
            alert('Failed to send invoice')
        }
    }

    // Cancel invoice
    const handleCancel = async (id: string) => {
        if (!confirm('Cancel this invoice?')) return
        try {
            await fetch(`${API_BASE}/valuation-invoices/${id}/cancel`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ reason: 'Cancelled by user' }),
            })
            fetchData()
        } catch (err) {
            alert('Failed to cancel invoice')
        }
    }

    // Delete invoice (hard delete — only draft/cancelled)
    const handleDelete = async (id: string) => {
        if (!confirm('Permanently delete this invoice? This cannot be undone.')) return
        try {
            const res = await fetch(`${API_BASE}/valuation-invoices/${id}`, {
                method: 'DELETE',
                headers: getHeaders(),
            })
            if (res.ok) {
                fetchData()
            } else {
                const err = await res.json().catch(() => ({}))
                alert(err.error || 'Failed to delete invoice')
            }
        } catch (err) {
            alert('Failed to delete invoice')
        }
    }

    // Filter invoices
    const filteredInvoices = invoices.filter(inv => {
        if (statusFilter !== 'all' && inv.status !== statusFilter) return false
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            return inv.clientName?.toLowerCase().includes(q) ||
                inv.invoiceNumber?.toLowerCase().includes(q) ||
                inv.clientEmail?.toLowerCase().includes(q)
        }
        return true
    })

    const timestamp = mounted ? new Date().toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit',
    }) : '--:--'

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="font-mono text-xl text-white flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-amber-500" />
                        FINANCE & INVOICING
                    </h1>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">
                        Valuation Fee Calculator • Invoice Management • Payments •{' '}
                        <span className="text-amber-500">{timestamp}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowCalc(!showCalc)}
                        className={`flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${showCalc ? 'bg-amber-500 text-white font-bold' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                            }`}
                    >
                        <Calculator className="w-3 h-3" />
                        FEE CALCULATOR
                    </button>
                    <button
                        onClick={() => fetchData()}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" />
                        REFRESH
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        NEW INVOICE
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 mb-6 border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('invoices')}
                    className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs transition-colors border-b-2 -mb-px ${
                        activeTab === 'invoices'
                            ? 'border-amber-500 text-amber-500 font-bold'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    <Receipt className="w-3.5 h-3.5" />
                    INVOICES
                </button>
                <button
                    onClick={() => setActiveTab('payments')}
                    className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs transition-colors border-b-2 -mb-px ${
                        activeTab === 'payments'
                            ? 'border-amber-500 text-amber-500 font-bold'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    <Wallet className="w-3.5 h-3.5" />
                    PAYMENT SETTINGS
                </button>
            </div>

            {/* Payment Settings Tab */}
            {activeTab === 'payments' && (
                <PaymentSettings
                    paymentApi={valuationPaymentConfigApi}
                    serviceLabel="Valuation Services"
                />
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (<>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL INVOICED</div>
                    <div className="font-mono text-xl text-white">{formatCurrency(summary?.totalInvoiced || 0)}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{summary?.invoiceCount || 0} invoices</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL PAID</div>
                    <div className="font-mono text-xl text-green-400">{formatCurrency(summary?.totalPaid || 0)}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{summary?.paidCount || 0} payments</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">OUTSTANDING</div>
                    <div className="font-mono text-xl text-amber-400">{formatCurrency(summary?.totalOutstanding || 0)}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">OVERDUE</div>
                    <div className="font-mono text-xl text-red-400">{formatCurrency(summary?.totalOverdue || 0)}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{summary?.overdueCount || 0} invoices</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">COLLECTION RATE</div>
                    <div className="font-mono text-xl text-blue-400">
                        {summary && summary.totalInvoiced > 0
                            ? `${((summary.totalPaid / summary.totalInvoiced) * 100).toFixed(1)}%`
                            : '—'}
                    </div>
                </div>
            </div>

            {/* Fee Calculator Panel */}
            {showCalc && (
                <div className="bg-zinc-900 border border-amber-500/30 p-4 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Calculator className="w-4 h-4 text-amber-500" />
                        <h2 className="font-mono text-sm text-white">GHANA VALUATION FEE CALCULATOR</h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: input */}
                        <div className="space-y-4">
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">FEE MODEL</label>
                                <select
                                    value={calcModel}
                                    onChange={(e) => { setCalcModel(e.target.value as FeeModel); setCalcResult(null) }}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                >
                                    <option value="percentage_of_value">Percentage of Value (0.5% GhIS)</option>
                                    <option value="man_day_rate">Man-Day Rate (MWH 2021)</option>
                                    <option value="flat_fee">Flat Fee</option>
                                </select>
                            </div>

                            {calcModel === 'percentage_of_value' && (
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">PROPERTY VALUE (GHS)</label>
                                    <input
                                        type="number"
                                        value={calcPropertyValue}
                                        onChange={(e) => setCalcPropertyValue(e.target.value)}
                                        placeholder="e.g. 500000"
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            )}

                            {calcModel === 'man_day_rate' && (
                                <div className="space-y-2">
                                    <label className="font-mono text-[10px] text-zinc-500 block">PROFESSIONAL SERVICES</label>
                                    {calcManDays.map((item, idx) => (
                                        <div key={idx} className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={item.category}
                                                    onChange={(e) => {
                                                        const next = [...calcManDays]
                                                        next[idx].category = e.target.value
                                                        next[idx].rate = MWH_RATES[e.target.value]?.dailyRate || 0
                                                        setCalcManDays(next)
                                                    }}
                                                    className="flex-1 px-2 py-1.5 bg-black border border-zinc-700 text-white font-mono text-xs"
                                                >
                                                    {Object.entries(MWH_RATES).map(([key, val]) => (
                                                        <option key={key} value={key}>
                                                            {val.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="number"
                                                    min="0.5"
                                                    step="0.5"
                                                    value={item.days}
                                                    onChange={(e) => {
                                                        const next = [...calcManDays]
                                                        next[idx].days = parseFloat(e.target.value) || 0
                                                        setCalcManDays(next)
                                                    }}
                                                    className="w-20 px-2 py-1.5 bg-black border border-zinc-700 text-white font-mono text-xs text-center"
                                                />
                                                <span className="font-mono text-[10px] text-zinc-500">days</span>
                                                {calcManDays.length > 1 && (
                                                    <button
                                                        onClick={() => setCalcManDays(calcManDays.filter((_, i) => i !== idx))}
                                                        className="text-zinc-500 hover:text-red-400"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 ml-0">
                                                <span className="font-mono text-[10px] text-zinc-600 w-16">Rate/day:</span>
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-[10px] text-zinc-500">GHS</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.rate}
                                                        onChange={(e) => {
                                                            const next = [...calcManDays]
                                                            next[idx].rate = parseFloat(e.target.value) || 0
                                                            setCalcManDays(next)
                                                        }}
                                                        className={`w-28 px-2 py-1 bg-black border text-white font-mono text-xs ${item.rate !== MWH_RATES[item.category]?.dailyRate ? 'border-amber-500/50 text-amber-400' : 'border-zinc-700'}`}
                                                    />
                                                    {item.rate !== MWH_RATES[item.category]?.dailyRate && (
                                                        <button
                                                            onClick={() => {
                                                                const next = [...calcManDays]
                                                                next[idx].rate = MWH_RATES[item.category]?.dailyRate || 0
                                                                setCalcManDays(next)
                                                            }}
                                                            className="font-mono text-[9px] text-zinc-500 hover:text-amber-400 underline"
                                                            title="Reset to MWH default"
                                                        >
                                                            reset
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setCalcManDays([...calcManDays, { category: 'technician', days: 1, rate: MWH_RATES.technician.dailyRate }])}
                                        className="font-mono text-[10px] text-amber-500 hover:text-amber-400"
                                    >
                                        + Add professional
                                    </button>
                                </div>
                            )}

                            {calcModel === 'flat_fee' && (
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">FEE AMOUNT (GHS)</label>
                                    <input
                                        type="number"
                                        value={calcFlatFee}
                                        onChange={(e) => setCalcFlatFee(e.target.value)}
                                        placeholder="e.g. 5000"
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            )}

                            <button
                                onClick={handleCalculate}
                                disabled={calculating}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                            >
                                {calculating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calculator className="w-3 h-3" />}
                                CALCULATE
                            </button>
                        </div>

                        {/* Right: result */}
                        <div>
                            {calcResult ? (
                                <div className="bg-black border border-zinc-700 p-4 space-y-3">
                                    <div className="font-mono text-[10px] text-zinc-500 mb-2">{calcResult.breakdown}</div>

                                    {calcResult.lineItems.map((item, idx) => (
                                        <div key={idx} className="flex justify-between font-mono text-xs">
                                            <span className="text-zinc-400 max-w-[70%] truncate">{item.description}</span>
                                            <span className="text-white">{formatCurrency(item.amount)}</span>
                                        </div>
                                    ))}

                                    <div className="border-t border-zinc-800 my-2" />
                                    <div className="flex justify-between font-mono text-xs">
                                        <span className="text-zinc-500">Subtotal</span>
                                        <span className="text-white">{formatCurrency(calcResult.subtotal)}</span>
                                    </div>
                                    {calcResult.platformFee > 0 && (
                                        <div className="flex justify-between font-mono text-[10px]">
                                            <span className="text-zinc-500">Platform Fee (2.5%)</span>
                                            <span className="text-zinc-400">{formatCurrency(calcResult.platformFee)}</span>
                                        </div>
                                    )}
                                    <div className="border-t border-zinc-700 my-2" />
                                    <div className="flex justify-between font-mono text-sm font-bold">
                                        <span className="text-amber-500">TOTAL</span>
                                        <span className="text-amber-500">{formatCurrency(calcResult.totalAmount)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-black border border-zinc-800 p-6 flex flex-col items-center justify-center text-center h-full">
                                    <Calculator className="w-8 h-8 text-zinc-700 mb-3" />
                                    <p className="font-mono text-xs text-zinc-500">
                                        Configure fee model and click <span className="text-amber-500">CALCULATE</span>
                                    </p>
                                    <p className="font-mono text-[10px] text-zinc-600 mt-1">
                                        Supports GhIS 0.5% and MWH 2021 man-day rates
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Filter & Search */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'].map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 font-mono text-[10px] transition-colors border ${statusFilter === s
                                ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
                                : 'text-zinc-500 border-zinc-800 hover:text-zinc-300'
                                }`}
                        >
                            {s.toUpperCase()}
                        </button>
                    ))}
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search invoices..."
                        className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                    />
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-zinc-900 border border-zinc-800">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                    <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        INVOICES
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">{filteredInvoices.length} records</div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                        <span className="ml-3 font-mono text-xs text-zinc-500">Loading invoices...</span>
                    </div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                        <FileText className="w-8 h-8 mb-3 text-zinc-700" />
                        <div className="font-mono text-xs mb-2">No invoices found</div>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="font-mono text-xs text-amber-500 hover:text-amber-400"
                        >
                            Create your first invoice →
                        </button>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                <th className="text-left py-2 px-4">INVOICE #</th>
                                <th className="text-left py-2 px-4">CLIENT</th>
                                <th className="text-left py-2 px-4">MODEL</th>
                                <th className="text-right py-2 px-4">AMOUNT</th>
                                <th className="text-left py-2 px-4">STATUS</th>
                                <th className="text-right py-2 px-4">DATE</th>
                                <th className="text-center py-2 px-4 w-32">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                            {filteredInvoices.map((inv) => {
                                const statusStyle = STATUS_STYLES[inv.status] || STATUS_STYLES.draft
                                return (
                                    <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                        <td className="py-3 px-4">
                                            <button
                                                onClick={() => { setPreviewInvoice(inv); setShowPreview(true) }}
                                                className="text-amber-500 hover:text-amber-300 hover:underline transition-colors text-left"
                                                title="View Invoice"
                                            >
                                                {inv.invoiceNumber}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4">
                                            <button
                                                onClick={() => window.location.href = `/dashboard/valuations/clients?search=${encodeURIComponent(inv.clientName)}`}
                                                className="text-left group"
                                                title="View Client"
                                            >
                                                <div className="text-white group-hover:text-amber-400 transition-colors">{inv.clientName}</div>
                                                {inv.clientEmail && (
                                                    <div className="text-zinc-500 group-hover:text-zinc-400 text-[10px] transition-colors">{inv.clientEmail}</div>
                                                )}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 text-zinc-400">
                                            {inv.feeModel === 'percentage_of_value' ? '0.5%' : inv.feeModel === 'man_day_rate' ? 'MAN-DAY' : 'FLAT'}
                                        </td>
                                        <td className="py-3 px-4 text-right text-white font-bold">
                                            {formatCurrency(inv.totalAmount)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border rounded ${statusStyle.color}`}>
                                                {inv.status === 'paid' && <Check className="w-2.5 h-2.5" />}
                                                {inv.status === 'overdue' && <AlertTriangle className="w-2.5 h-2.5" />}
                                                {inv.status === 'sent' && <Send className="w-2.5 h-2.5" />}
                                                {inv.status === 'draft' && <FileText className="w-2.5 h-2.5" />}
                                                {statusStyle.label}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right text-zinc-500">
                                            {mounted && inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-GB') : '—'}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => { setPreviewInvoice(inv); setShowPreview(true) }}
                                                    className="p-1 text-zinc-500 hover:text-amber-400 transition-colors"
                                                    title="View Invoice"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                {inv.status === 'draft' && (
                                                    <button
                                                        onClick={() => handleSend(inv.id)}
                                                        className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"
                                                        title="Send Invoice"
                                                    >
                                                        <Send className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {(inv.status === 'draft' || inv.status === 'sent') && (
                                                    <button
                                                        onClick={() => handleCancel(inv.id)}
                                                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                                        title="Cancel Invoice"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {inv.paymentLink && inv.status === 'sent' && (
                                                    <a
                                                        href={inv.paymentLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1 text-zinc-500 hover:text-green-400 transition-colors"
                                                        title="Payment Link"
                                                    >
                                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                                    </a>
                                                )}
                                                {inv.status !== 'paid' && (
                                                    <button
                                                        onClick={() => handleDelete(inv.id)}
                                                        className="p-1 text-zinc-500 hover:text-red-500 transition-colors"
                                                        title="Delete Invoice"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            </>)}

            {/* Create Invoice Modal — Professional Two-Panel Layout */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-700 w-[1100px] max-w-[98vw] max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="font-mono text-sm text-white flex items-center gap-2">
                                    <Receipt className="w-4 h-4 text-amber-500" />
                                    CREATE PROFESSIONAL INVOICE
                                </h2>
                                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">GhIS & MWH 2021 compliant • Ghana Revenue Authority tax-ready</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-white">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Two Panel Body */}
                        <div className="flex flex-1 min-h-0">
                            {/* LEFT — Form */}
                            <div className="w-[55%] border-r border-zinc-800 overflow-y-auto p-6 space-y-5">
                                {/* Section: Client */}
                                <div>
                                    <div className="font-mono text-[10px] text-amber-500 tracking-wider mb-3 flex items-center gap-2">
                                        <Building2 className="w-3 h-3" /> CLIENT INFORMATION
                                    </div>
                                    <div className="space-y-3">
                                        <div className="relative" ref={clientDropdownRef}>
                                            <label className="font-mono text-[10px] text-zinc-500 block mb-1">CLIENT *</label>
                                            {newInvoice.clientId ? (
                                                <div className="flex items-center gap-2 px-3 py-2.5 bg-black border border-zinc-700 rounded-sm">
                                                    <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-mono text-xs font-bold shrink-0">
                                                        {newInvoice.clientName[0]}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-mono text-xs text-white truncate">{newInvoice.clientName}</div>
                                                        <div className="font-mono text-[9px] text-zinc-500 truncate">{newInvoice.clientCompany || newInvoice.clientEmail || 'Client'}</div>
                                                    </div>
                                                    <button onClick={() => { setNewInvoice(prev => ({ ...prev, clientId: '', clientName: '', clientEmail: '', clientPhone: '', clientCompany: '', clientAddress: '' })); setClientDropdownOpen(true) }} className="text-zinc-500 hover:text-white p-0.5">
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                                                        <input
                                                            type="text"
                                                            value={clientSearch}
                                                            onChange={e => { setClientSearch(e.target.value); setClientDropdownOpen(true) }}
                                                            onFocus={() => setClientDropdownOpen(true)}
                                                            placeholder="Search or select client..."
                                                            className="w-full pl-8 pr-3 py-2.5 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    {clientDropdownOpen && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 shadow-2xl z-20 max-h-[200px] overflow-y-auto">
                                                            {filteredDropdownClients.map(c => (
                                                                <button key={c.id} onClick={() => selectClient(c)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 text-left transition-colors">
                                                                    <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-amber-500 font-mono text-[10px] font-bold shrink-0">{c.name[0]}</div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-mono text-xs text-white truncate">{c.name}</div>
                                                                        <div className="font-mono text-[9px] text-zinc-500 truncate">{c.companyName && `${c.companyName} • `}{c.email || 'No email'}</div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                            {filteredDropdownClients.length === 0 && <div className="px-3 py-3 text-center"><p className="font-mono text-[10px] text-zinc-500">No matching clients</p></div>}
                                                            <div className="border-t border-zinc-800">
                                                                <button onClick={() => { setClientDropdownOpen(false); setNewInvoice(prev => ({ ...prev, clientName: clientSearch, clientId: '' })) }} className="w-full flex items-center gap-2 px-3 py-2 text-amber-500 hover:bg-zinc-800 transition-colors">
                                                                    <UserPlus className="w-3.5 h-3.5" />
                                                                    <span className="font-mono text-xs">{clientSearch ? `Use "${clientSearch}" as new client` : 'Enter new client name'}</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">EMAIL</label>
                                                <input type="email" value={newInvoice.clientEmail} onChange={(e) => setNewInvoice({ ...newInvoice, clientEmail: e.target.value })} placeholder="client@email.com" className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">PHONE</label>
                                                <input type="tel" value={newInvoice.clientPhone} onChange={(e) => setNewInvoice({ ...newInvoice, clientPhone: e.target.value })} placeholder="+233 XX XXX XXXX" className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">COMPANY</label>
                                                <input type="text" value={newInvoice.clientCompany} onChange={(e) => setNewInvoice({ ...newInvoice, clientCompany: e.target.value })} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">ADDRESS</label>
                                                <input type="text" value={newInvoice.clientAddress} onChange={(e) => setNewInvoice({ ...newInvoice, clientAddress: e.target.value })} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Service */}
                                <div>
                                    <div className="font-mono text-[10px] text-amber-500 tracking-wider mb-3 flex items-center gap-2">
                                        <Calculator className="w-3 h-3" /> SERVICE & FEE DETAILS
                                    </div>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">FEE MODEL *</label>
                                                <select value={newInvoice.feeModel} onChange={(e) => setNewInvoice({ ...newInvoice, feeModel: e.target.value as FeeModel })} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50">
                                                    <option value="percentage_of_value">Percentage of Value (0.5% GhIS)</option>
                                                    <option value="man_day_rate">Man-Day Rate (MWH 2021)</option>
                                                    <option value="flat_fee">Flat Fee</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">VALUATION TYPE</label>
                                                <select value={newInvoice.valuationType} onChange={(e) => setNewInvoice({ ...newInvoice, valuationType: e.target.value })} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50">
                                                    <option value="market_value">Market Value</option>
                                                    <option value="insurance_value">Insurance Valuation</option>
                                                    <option value="rental_value">Rental Valuation</option>
                                                    <option value="mortgage">Mortgage Valuation</option>
                                                    <option value="compensation">Compensation Valuation</option>
                                                    <option value="plant_machinery">Plant & Machinery</option>
                                                </select>
                                            </div>
                                        </div>

                                        {newInvoice.feeModel === 'percentage_of_value' && (
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">PROPERTY VALUE (GHS) *</label>
                                                <input type="number" value={newInvoice.propertyValue} onChange={(e) => setNewInvoice({ ...newInvoice, propertyValue: e.target.value })} placeholder="e.g. 500000" className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                        )}

                                        {newInvoice.feeModel === 'man_day_rate' && (
                                            <div className="space-y-3">
                                                <label className="font-mono text-[10px] text-zinc-500 block">PROFESSIONAL SERVICES</label>
                                                {newInvoice.manDays.map((item, idx) => (
                                                    <div key={idx} className="space-y-1.5 bg-black/50 border border-zinc-800 p-2.5 rounded-sm">
                                                        <div className="flex items-center gap-2">
                                                            <select value={item.category} onChange={(e) => { const next = [...newInvoice.manDays]; next[idx].category = e.target.value; next[idx].rate = MWH_RATES[e.target.value]?.dailyRate || 0; setNewInvoice({ ...newInvoice, manDays: next }) }} className="flex-1 px-2 py-1.5 bg-black border border-zinc-700 text-white font-mono text-xs">
                                                                {Object.entries(MWH_RATES).map(([key, val]) => (<option key={key} value={key}>{val.label}</option>))}
                                                            </select>
                                                            {newInvoice.manDays.length > 1 && (<button onClick={() => setNewInvoice({ ...newInvoice, manDays: newInvoice.manDays.filter((_, i) => i !== idx) })} className="text-zinc-500 hover:text-red-400"><XCircle className="w-3.5 h-3.5" /></button>)}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-mono text-[10px] text-zinc-600">Rate:</span>
                                                                <span className="font-mono text-[10px] text-zinc-500">GHS</span>
                                                                <input type="number" min="0" step="0.01" value={item.rate} onChange={(e) => { const next = [...newInvoice.manDays]; next[idx].rate = parseFloat(e.target.value) || 0; setNewInvoice({ ...newInvoice, manDays: next }) }} className={`w-24 px-2 py-1 bg-black border text-white font-mono text-xs ${item.rate !== MWH_RATES[item.category]?.dailyRate ? 'border-amber-500/50 text-amber-400' : 'border-zinc-700'}`} />
                                                                {item.rate !== MWH_RATES[item.category]?.dailyRate && (
                                                                    <button onClick={() => { const next = [...newInvoice.manDays]; next[idx].rate = MWH_RATES[item.category]?.dailyRate || 0; setNewInvoice({ ...newInvoice, manDays: next }) }} className="font-mono text-[9px] text-zinc-500 hover:text-amber-400 underline" title="Reset to MWH default">reset</button>
                                                                )}
                                                            </div>
                                                            <span className="font-mono text-[10px] text-zinc-600">×</span>
                                                            <input type="number" min="0.5" step="0.5" value={item.days} onChange={(e) => { const next = [...newInvoice.manDays]; next[idx].days = parseFloat(e.target.value) || 0; setNewInvoice({ ...newInvoice, manDays: next }) }} className="w-16 px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs text-center" />
                                                            <span className="font-mono text-[10px] text-zinc-500">days</span>
                                                            <span className="font-mono text-[10px] text-zinc-400 ml-auto">= GHS {((item.rate || 0) * (item.days || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                <button onClick={() => setNewInvoice({ ...newInvoice, manDays: [...newInvoice.manDays, { category: 'technician', days: 1, rate: MWH_RATES.technician.dailyRate }] })} className="font-mono text-[10px] text-amber-500 hover:text-amber-400">+ Add professional</button>
                                            </div>
                                        )}

                                        {newInvoice.feeModel === 'flat_fee' && (
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">FEE AMOUNT (GHS) *</label>
                                                <input type="number" value={newInvoice.flatFee} onChange={(e) => setNewInvoice({ ...newInvoice, flatFee: e.target.value })} placeholder="e.g. 5000" className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50" />
                                            </div>
                                        )}

                                        <div>
                                            <label className="font-mono text-[10px] text-zinc-500 block mb-1">PROPERTY ADDRESS</label>
                                            <input type="text" value={newInvoice.propertyAddress} onChange={(e) => setNewInvoice({ ...newInvoice, propertyAddress: e.target.value })} placeholder="e.g. No. 15 Independence Ave, East Legon, Accra" className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50" />
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Terms */}
                                <div>
                                    <div className="font-mono text-[10px] text-amber-500 tracking-wider mb-3 flex items-center gap-2">
                                        <FileText className="w-3 h-3" /> TERMS & NOTES
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="font-mono text-[10px] text-zinc-500 block mb-1">PAYMENT DUE</label>
                                            <select value={newInvoice.dueInDays} onChange={(e) => setNewInvoice({ ...newInvoice, dueInDays: e.target.value })} className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50">
                                                <option value="7">Net 7 — Due in 7 days</option>
                                                <option value="14">Net 14 — Due in 14 days</option>
                                                <option value="30">Net 30 — Due in 30 days</option>
                                                <option value="45">Net 45 — Due in 45 days</option>
                                                <option value="60">Net 60 — Due in 60 days</option>
                                                <option value="0">Due on Receipt</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="font-mono text-[10px] text-zinc-500 block mb-1">NOTES / SPECIAL INSTRUCTIONS</label>
                                            <textarea value={newInvoice.notes} onChange={(e) => setNewInvoice({ ...newInvoice, notes: e.target.value })} rows={3} placeholder="Additional terms, scope description, or special conditions..." className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT — Live Invoice Preview */}
                            <div className="w-[45%] overflow-y-auto bg-zinc-950 p-5 flex flex-col">
                                <div className="font-mono text-[10px] text-zinc-500 mb-3 tracking-wider">LIVE PREVIEW</div>
                                <div className="bg-white flex-1 shadow-xl border border-zinc-200 overflow-hidden flex flex-col text-zinc-900">
                                    {/* Mini invoice header */}
                                    <div className="bg-black px-5 py-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-amber-500 font-mono text-lg tracking-wider font-bold">PROPMETRIK</div>
                                                <div className="text-zinc-500 font-mono text-[8px] mt-0.5">Professional Valuation Services — Ghana</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono text-white text-xs font-bold">INVOICE</div>
                                                <div className="font-mono text-amber-500 text-[10px]">PM-INV-DRAFT</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bill to */}
                                    <div className="px-5 py-3 border-b border-zinc-200 grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="font-mono text-[8px] text-zinc-400 uppercase mb-1">Bill To</div>
                                            <div className="font-mono text-xs font-bold text-zinc-900">{newInvoice.clientName || 'Client Name'}</div>
                                            {newInvoice.clientCompany && <div className="font-mono text-[9px] text-zinc-600">{newInvoice.clientCompany}</div>}
                                            {newInvoice.clientEmail && <div className="font-mono text-[9px] text-zinc-500">{newInvoice.clientEmail}</div>}
                                            {newInvoice.clientAddress && <div className="font-mono text-[9px] text-zinc-500 mt-0.5">{newInvoice.clientAddress}</div>}
                                        </div>
                                        <div className="text-right space-y-0.5">
                                            <div className="font-mono text-[9px] text-zinc-500">Date: {new Date().toLocaleDateString('en-GB')}</div>
                                            <div className="font-mono text-[9px] text-zinc-500">Due: Net {newInvoice.dueInDays} days</div>
                                            <div className="font-mono text-[9px] text-zinc-500">
                                                Type: {newInvoice.valuationType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                            </div>
                                            {newInvoice.propertyAddress && <div className="font-mono text-[8px] text-zinc-400 mt-1">Property: {newInvoice.propertyAddress}</div>}
                                        </div>
                                    </div>

                                    {/* Line items */}
                                    <div className="px-5 py-3 flex-1">
                                        {liveCalcLoading ? (
                                            <div className="flex items-center justify-center py-6">
                                                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                                                <span className="font-mono text-[10px] text-zinc-400 ml-2">Calculating...</span>
                                            </div>
                                        ) : liveCalc ? (
                                            <>
                                                <table className="w-full mb-3">
                                                    <thead>
                                                        <tr className="text-[8px] font-mono text-zinc-400 uppercase border-b border-zinc-200">
                                                            <th className="text-left py-1.5">Description</th>
                                                            <th className="text-center py-1.5 w-12">Qty</th>
                                                            <th className="text-right py-1.5 w-20">Rate</th>
                                                            <th className="text-right py-1.5 w-24">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="font-mono text-[10px]">
                                                        {liveCalc.lineItems.map((item, idx) => (
                                                            <tr key={idx} className="border-b border-zinc-100">
                                                                <td className="py-1.5 text-zinc-700 pr-2">{item.description}</td>
                                                                <td className="py-1.5 text-center text-zinc-500">{item.quantity}</td>
                                                                <td className="py-1.5 text-right text-zinc-500">{formatCurrency(item.unitPrice)}</td>
                                                                <td className="py-1.5 text-right text-zinc-900 font-medium">{formatCurrency(item.amount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {/* Totals */}
                                                <div className="border-t border-zinc-200 pt-2 space-y-1">
                                                    <div className="flex justify-between font-mono text-[10px]">
                                                        <span className="text-zinc-500">Subtotal</span>
                                                        <span className="text-zinc-700">{formatCurrency(liveCalc.subtotal)}</span>
                                                    </div>
                                                    {liveCalc.platformFee > 0 && (
                                                        <div className="flex justify-between font-mono text-[9px]">
                                                            <span className="text-zinc-400">Platform Fee (2.5%)</span>
                                                            <span className="text-zinc-500">{formatCurrency(liveCalc.platformFee)}</span>
                                                        </div>
                                                    )}
                                                    <div className="border-t border-zinc-300 pt-1.5 mt-1">
                                                        <div className="flex justify-between font-mono text-sm font-bold">
                                                            <span className="text-zinc-900">TOTAL DUE</span>
                                                            <span className="text-zinc-900">{formatCurrency(liveCalc.totalAmount)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                                <Calculator className="w-6 h-6 text-zinc-300 mb-2" />
                                                <p className="font-mono text-[10px] text-zinc-400">Enter fee details on the left</p>
                                                <p className="font-mono text-[9px] text-zinc-300 mt-0.5">Live preview will appear here</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Mini footer */}
                                    <div className="px-5 py-2 bg-zinc-50 border-t border-zinc-200">
                                        <p className="font-mono text-[7px] text-zinc-400 text-center">PROPMETRIK — Blockchain-verified property intelligence • Paystack payments • GRA compliant</p>
                                    </div>
                                </div>

                                {newInvoice.notes && (
                                    <div className="mt-3 px-3 py-2 bg-zinc-900 border border-zinc-800">
                                        <div className="font-mono text-[9px] text-zinc-500 mb-1">Notes:</div>
                                        <div className="font-mono text-[10px] text-zinc-400">{newInvoice.notes}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between shrink-0">
                            <div className="font-mono text-[10px] text-zinc-500">
                                {liveCalc ? (
                                    <span>Total: <strong className="text-amber-500 text-xs">{formatCurrency(liveCalc.totalAmount)}</strong> • {liveCalc.lineItems.length} line item{liveCalc.lineItems.length !== 1 ? 's' : ''}</span>
                                ) : 'Configure fee details to see total'}
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors">CANCEL</button>
                                <button onClick={handleCreate} disabled={!newInvoice.clientName || !liveCalc || creating} className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                    {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                    {creating ? 'CREATING...' : 'CREATE INVOICE'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Professional Invoice Preview Modal */}
            {showPreview && previewInvoice && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 print:bg-white print:p-0">
                    <div className="bg-white w-[720px] max-w-[95vw] max-h-[92vh] overflow-y-auto shadow-2xl print:shadow-none print:max-h-none print:overflow-visible">
                        {/* Invoice Header Band */}
                        <div className="bg-black px-8 py-6 print:py-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h1 className="font-mono text-2xl tracking-widest font-bold">
                                        <span className="text-amber-500">PROP</span><span className="text-white">METRIK</span>
                                    </h1>
                                    <p className="text-zinc-500 font-mono text-[9px] mt-1 tracking-wide">PROFESSIONAL VALUATION SERVICES</p>
                                    <p className="text-zinc-600 font-mono text-[8px] mt-0.5">No. 15 Independence Avenue, Accra • +233 30 277 1234</p>
                                    <p className="text-zinc-600 font-mono text-[8px]">GhIS Reg: GhIS/REG/2024/001 • TIN: C0012345678</p>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-white text-xl font-bold tracking-wider">
                                        {previewInvoice.status === 'paid' ? 'RECEIPT' : 'INVOICE'}
                                    </div>
                                    <div className="font-mono text-amber-500 text-sm mt-1">{previewInvoice.invoiceNumber}</div>
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 mt-2 font-mono text-[9px] font-bold rounded ${
                                        previewInvoice.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                                        previewInvoice.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                                        previewInvoice.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                                        previewInvoice.status === 'cancelled' ? 'bg-zinc-600/20 text-zinc-400' :
                                        'bg-zinc-700/20 text-zinc-400'
                                    }`}>
                                        {previewInvoice.status === 'paid' && <Check className="w-2.5 h-2.5" />}
                                        {previewInvoice.status === 'overdue' && <AlertTriangle className="w-2.5 h-2.5" />}
                                        {previewInvoice.status.toUpperCase()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Amber accent line */}
                        <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />

                        {/* Bill To / Invoice Details */}
                        <div className="px-8 py-5 grid grid-cols-2 gap-8 border-b border-zinc-200">
                            <div>
                                <div className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider mb-2 border-b border-zinc-100 pb-1">Bill To</div>
                                <div className="font-mono text-sm text-zinc-900 font-bold">{previewInvoice.clientName}</div>
                                {previewInvoice.clientEmail && (
                                    <div className="font-mono text-xs text-zinc-600 mt-1">{previewInvoice.clientEmail}</div>
                                )}
                            </div>
                            <div>
                                <div className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider mb-2 border-b border-zinc-100 pb-1">Invoice Details</div>
                                <div className="space-y-1">
                                    <div className="flex justify-between">
                                        <span className="font-mono text-[10px] text-zinc-500">Invoice Date</span>
                                        <span className="font-mono text-xs text-zinc-800 font-medium">{mounted ? new Date(previewInvoice.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                                    </div>
                                    {previewInvoice.dueDate && (
                                        <div className="flex justify-between">
                                            <span className="font-mono text-[10px] text-zinc-500">Due Date</span>
                                            <span className={`font-mono text-xs font-medium ${previewInvoice.status === 'overdue' ? 'text-red-600' : 'text-zinc-800'}`}>{mounted ? new Date(previewInvoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="font-mono text-[10px] text-zinc-500">Fee Model</span>
                                        <span className="font-mono text-xs text-zinc-800 font-medium">
                                            {previewInvoice.feeModel === 'percentage_of_value' ? 'GhIS 0.5%' : previewInvoice.feeModel === 'man_day_rate' ? 'MWH 2021' : 'Flat Fee'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="font-mono text-[10px] text-zinc-500">Currency</span>
                                        <span className="font-mono text-xs text-zinc-800 font-medium">GHS (Ghana Cedi)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Line Items Table */}
                        <div className="px-8 py-5">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b-2 border-zinc-900">
                                        <th className="text-left py-2 font-mono text-[9px] text-zinc-500 uppercase tracking-wider w-1/2">Description</th>
                                        <th className="text-center py-2 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Qty</th>
                                        <th className="text-right py-2 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Unit Price</th>
                                        <th className="text-right py-2 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Amount (GHS)</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-xs">
                                    <tr className="border-b border-zinc-100">
                                        <td className="py-3 text-zinc-800">
                                            <div className="font-medium">Professional Valuation Service</div>
                                            <div className="text-[10px] text-zinc-500 mt-0.5">
                                                {previewInvoice.feeModel === 'percentage_of_value' ? 'Based on 0.5% of property value per GhIS guidelines' :
                                                 previewInvoice.feeModel === 'man_day_rate' ? 'Professional services per MWH 2021 published rates' :
                                                 'Agreed flat fee for valuation services'}
                                            </div>
                                        </td>
                                        <td className="py-3 text-center text-zinc-600">1</td>
                                        <td className="py-3 text-right text-zinc-600">{formatCurrency(previewInvoice.subtotal)}</td>
                                        <td className="py-3 text-right text-zinc-900 font-bold">{formatCurrency(previewInvoice.subtotal)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Section */}
                        <div className="px-8 pb-5">
                            <div className="flex justify-end">
                                <div className="w-full sm:w-72 space-y-1.5">
                                    <div className="flex justify-between font-mono text-xs border-b border-zinc-100 pb-1.5">
                                        <span className="text-zinc-500">Subtotal</span>
                                        <span className="text-zinc-800">{formatCurrency(previewInvoice.subtotal)}</span>
                                    </div>
                                    {(previewInvoice as any).platformFee > 0 && (
                                        <div className="flex justify-between font-mono text-[10px]">
                                            <span className="text-zinc-400">Platform Fee (2.5%)</span>
                                            <span className="text-zinc-600">{formatCurrency((previewInvoice as any).platformFee)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-mono text-base font-bold border-t-2 border-zinc-900 pt-2 mt-1">
                                        <span className="text-zinc-900">{previewInvoice.status === 'paid' ? 'TOTAL PAID' : 'TOTAL DUE'}</span>
                                        <span className="text-zinc-900">{formatCurrency(previewInvoice.totalAmount)}</span>
                                    </div>
                                    {previewInvoice.status === 'paid' && (
                                        <div className="text-center mt-2">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 font-mono text-[10px] text-green-700 font-bold rounded">
                                                <Check className="w-3 h-3" /> PAYMENT RECEIVED
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Payment Confirmation for paid invoices */}
                        {previewInvoice.status === 'paid' && previewInvoice.paidAmount && (
                            <div className="mx-8 mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded">
                                <div className="flex items-start gap-3">
                                    <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                                    <div>
                                        <div className="font-mono text-xs text-green-800 font-bold">Payment Confirmed</div>
                                        <div className="font-mono text-[10px] text-green-700 mt-0.5">
                                            Amount of {formatCurrency(previewInvoice.paidAmount)} received via Paystack
                                            {previewInvoice.paidAt && ` on ${new Date(previewInvoice.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Terms & Notes */}
                        <div className="px-8 pb-4">
                            <div className="bg-zinc-50 border border-zinc-200 rounded p-4">
                                <div className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider mb-2">Terms & Conditions</div>
                                <div className="font-mono text-[10px] text-zinc-600 space-y-1">
                                    <p>1. Payment is due within the stated terms. Late payments may incur a 2% monthly surcharge.</p>
                                    <p>2. This valuation is prepared in accordance with GhIS Standards and RICS Red Book guidelines.</p>
                                    <p>3. All fees are subject to applicable charges as outlined.</p>
                                    <p>4. Payment can be made via Paystack (MoMo, Visa, Mastercard), crypto (USDT/USDC), or direct bank transfer.</p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-black rounded flex items-center justify-center">
                                        <span className="text-amber-500 font-mono text-[8px] font-bold">PM</span>
                                    </div>
                                    <div>
                                        <p className="font-mono text-[8px] text-zinc-500">PROPMETRIK — Blockchain-verified property intelligence</p>
                                        <p className="font-mono text-[7px] text-zinc-400">www.propmetrik.com • valuations@propmetrik.com</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-[8px] text-zinc-400">Invoice generated by PROPMETRIK Platform</p>
                                    <p className="font-mono text-[7px] text-zinc-400">GRA Compliant • Paystack Secured</p>
                                </div>
                            </div>
                        </div>

                        {/* Action Bar — Hidden in print */}
                        <div className="px-8 py-4 bg-black flex items-center justify-between print:hidden">
                            <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-zinc-400 font-mono text-xs hover:text-white transition-colors">
                                CLOSE
                            </button>
                            <div className="flex items-center gap-3">
                                <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <Printer className="w-3 h-3" /> PRINT / PDF
                                </button>
                                <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <Download className="w-3 h-3" /> DOWNLOAD
                                </button>
                                {previewInvoice.status === 'draft' && (
                                    <button onClick={() => { handleSend(previewInvoice.id); setShowPreview(false) }} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors">
                                        <Send className="w-3 h-3" /> SEND TO CLIENT
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}