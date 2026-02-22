'use client'

import { useState, useEffect } from 'react'
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Clock,
    DollarSign,
    MapPin,
    Activity,
    Calendar,
    Loader2,
    RefreshCw,
    Users,
    Building2,
    AlertTriangle,
    ChevronDown,
    CheckCircle2,
    Timer,
    UserCheck,
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

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
    type: string
    valuationsCount: number
    totalBilled: number
}

interface FirmAnalytics {
    period: string
    revenue: { total: number; outstanding: number; overdue: number; paid_count: number; pending_count: number; overdue_count: number }
    throughput: { total: number; completed: number; in_progress: number; draft: number; avg_turnaround_days: number }
    valuers: { id: string; name: string; role: string; valuations: number; completed: number; avg_turnaround_days: number }[]
    clients: { total: number; active: number; new: number }
    monthly_trend: { month: string; valuations: number; completed: number; revenue: number }[]
    property_types: { type: string; count: number }[]
}

async function apiFetch(path: string) {
    const headers = getHeaders()
    const res = await fetch(`${API_BASE}/enterprise${path}`, { headers })
    if (!res.ok) return null
    return res.json()
}

// Fallback data shown when API returns no results
const FALLBACK_REGIONS = [
    { region: 'Greater Accra', count: 0, percentage: 0 },
    { region: 'Ashanti', count: 0, percentage: 0 },
    { region: 'Western', count: 0, percentage: 0 },
    { region: 'Central', count: 0, percentage: 0 },
    { region: 'Eastern', count: 0, percentage: 0 },
]

const FALLBACK_METHODS = [
    { method: 'Comparison', count: 0, percentage: 0 },
    { method: 'Income', count: 0, percentage: 0 },
    { method: 'Cost', count: 0, percentage: 0 },
    { method: 'DRC', count: 0, percentage: 0 },
    { method: 'Residual', count: 0, percentage: 0 },
]

function formatCurrency(amount: number): string {
    if (amount >= 1000000) return `GHS ${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `GHS ${(amount / 1000).toFixed(0)}K`
    return `GHS ${amount.toFixed(0)}`
}

export default function AnalyticsPage() {
    const [mounted, setMounted] = useState(false)
    const [loading, setLoading] = useState(true)
    const [summary, setSummary] = useState<InvoiceSummary | null>(null)
    const [clients, setClients] = useState<Client[]>([])
    const [totalValuations, setTotalValuations] = useState(0)
    const [regions, setRegions] = useState(FALLBACK_REGIONS)
    const [methods, setMethods] = useState(FALLBACK_METHODS)
    const [propertyTypes, setPropertyTypes] = useState<{ type: string; count: number; color: string }[]>([])
    const [activeTab, setActiveTab] = useState<'overview' | 'firm'>('overview')
    const [firmData, setFirmData] = useState<FirmAnalytics | null>(null)
    const [firmPeriod, setFirmPeriod] = useState('30d')
    const [firmLoading, setFirmLoading] = useState(false)

    useEffect(() => { setMounted(true); fetchAnalytics() }, [])

    useEffect(() => {
        if (activeTab === 'firm') fetchFirmAnalytics()
    }, [activeTab, firmPeriod])

    const fetchFirmAnalytics = async () => {
        setFirmLoading(true)
        try {
            const data = await apiFetch(`/analytics?period=${firmPeriod}`)
            if (data) setFirmData(data)
        } catch (err) {
            console.error('Failed to fetch firm analytics', err)
        } finally {
            setFirmLoading(false)
        }
    }

    const fetchAnalytics = async () => {
        setLoading(true)
        const headers = getHeaders()
        try {
            const [summaryRes, clientsRes, valuationsRes] = await Promise.all([
                fetch(`${API_BASE}/valuation-invoices/summary`, { headers }).catch(() => null),
                fetch(`${API_BASE}/valuation-clients?limit=200`, { headers }).catch(() => null),
                fetch(`${API_BASE}/valuations?limit=500`, { headers }).catch(() => null),
            ])

            if (summaryRes?.ok) {
                const data = await summaryRes.json()
                setSummary(data.data || null)
            }

            if (clientsRes?.ok) {
                const data = await clientsRes.json()
                setClients(data.clients || [])
            }

            if (valuationsRes?.ok) {
                const data = await valuationsRes.json()
                const vals = data.valuations || []
                setTotalValuations(vals.length)

                // Compute region breakdown from real valuations
                const regionMap: Record<string, number> = {}
                const methodMap: Record<string, number> = {}
                const typeMap: Record<string, number> = {}

                vals.forEach((v: any) => {
                    const reg = v.region || v.propertyRegion || 'Unknown'
                    regionMap[reg] = (regionMap[reg] || 0) + 1
                    const method = v.valuationType || v.primaryMethod || 'Unknown'
                    methodMap[method] = (methodMap[method] || 0) + 1
                    const ptype = v.propertyType || 'Unknown'
                    typeMap[ptype] = (typeMap[ptype] || 0) + 1
                })

                const total = vals.length || 1
                const regionArr = Object.entries(regionMap)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([region, count]) => ({ region: region.replace(/_/g, ' '), count, percentage: Math.round((count / total) * 100) }))
                if (regionArr.length > 0) setRegions(regionArr)

                const methodArr = Object.entries(methodMap)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([method, count]) => ({ method: method.replace(/_/g, ' '), count, percentage: Math.round((count / total) * 100) }))
                if (methodArr.length > 0) setMethods(methodArr)

                const typeColors = ['text-green-400 bg-green-500/10', 'text-blue-400 bg-blue-500/10', 'text-purple-400 bg-purple-500/10', 'text-amber-400 bg-amber-500/10', 'text-emerald-400 bg-emerald-500/10']
                const typeArr = Object.entries(typeMap)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([type, count], idx) => ({ type: type.replace(/_/g, ' '), count, color: typeColors[idx % typeColors.length] }))
                if (typeArr.length > 0) setPropertyTypes(typeArr)
            }
        } catch (err) {
            console.error('Failed to fetch analytics', err)
        } finally {
            setLoading(false)
        }
    }

    const totalBilled = clients.reduce((s, c) => s + (c.totalBilled || 0), 0)
    const avgBilled = clients.length > 0 ? totalBilled / clients.length : 0
    const corporateCount = clients.filter(c => c.type === 'corporate').length
    const maxPtCount = propertyTypes.length > 0 ? Math.max(...propertyTypes.map(p => p.count)) : 1

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="font-mono text-xl text-white flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-amber-500" />
                        VALUATION ANALYTICS
                    </h1>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">
                        Performance metrics • Regional breakdown • Revenue tracking
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchAnalytics} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors">
                        <RefreshCw className={`w-3 h-3 ${loading || firmLoading ? 'animate-spin' : ''}`} />
                        REFRESH
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2 font-mono text-xs border-b-2 transition-colors ${activeTab === 'overview' ? 'text-amber-500 border-amber-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                >
                    <BarChart3 className="w-3 h-3 inline mr-2" />OVERVIEW
                </button>
                <button
                    onClick={() => setActiveTab('firm')}
                    className={`px-4 py-2 font-mono text-xs border-b-2 transition-colors ${activeTab === 'firm' ? 'text-amber-500 border-amber-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                >
                    <Building2 className="w-3 h-3 inline mr-2" />FIRM PERFORMANCE
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                    <span className="ml-3 font-mono text-xs text-zinc-500">Loading analytics...</span>
                </div>
            ) : activeTab === 'overview' ? (
            <>

            {/* KPI Row */}
            <div className="grid grid-cols-5 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL VALUATIONS</div>
                    <div className="font-mono text-2xl text-white">{totalValuations}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">all time</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL CLIENTS</div>
                    <div className="font-mono text-2xl text-amber-500">{clients.length}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{corporateCount} corporate</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">INVOICES</div>
                    <div className="font-mono text-2xl text-blue-400">{summary?.invoiceCount || 0}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{summary?.paidCount || 0} paid</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL INVOICED</div>
                    <div className="font-mono text-2xl text-green-400">{formatCurrency(summary?.totalInvoiced || 0)}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">OUTSTANDING</div>
                    <div className="font-mono text-2xl text-red-400">{formatCurrency(summary?.totalOutstanding || 0)}</div>
                    <div className="flex items-center gap-1 mt-1">
                        {(summary?.overdueCount || 0) > 0 && <>
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            <span className="font-mono text-[10px] text-red-400">{summary?.overdueCount} overdue</span>
                        </>}
                    </div>
                </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL PAID</div>
                    <div className="font-mono text-xl text-green-400">{formatCurrency(summary?.totalPaid || 0)}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">OVERDUE AMOUNT</div>
                    <div className="font-mono text-xl text-red-400">{formatCurrency(summary?.totalOverdue || 0)}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">COLLECTION RATE</div>
                    <div className="font-mono text-xl text-blue-400">
                        {summary && summary.totalInvoiced > 0 ? `${((summary.totalPaid / summary.totalInvoiced) * 100).toFixed(1)}%` : '—'}
                    </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">AVG PER CLIENT</div>
                    <div className="font-mono text-xl text-amber-400">{formatCurrency(avgBilled)}</div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Top Clients */}
                <div className="bg-zinc-900 border border-zinc-800 p-4 col-span-2">
                    <div className="font-mono text-[10px] text-zinc-500 mb-4 flex items-center gap-2">
                        <Users className="w-3 h-3" />
                        TOP CLIENTS BY BILLED AMOUNT
                    </div>
                    {clients.length === 0 ? (
                        <div className="text-center py-6">
                            <Users className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                            <p className="font-mono text-xs text-zinc-500">No client data available</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                    <th className="text-left pb-2">CLIENT</th>
                                    <th className="text-right pb-2">VALUATIONS</th>
                                    <th className="text-right pb-2">BILLED</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                                {clients.sort((a, b) => (b.totalBilled || 0) - (a.totalBilled || 0)).slice(0, 8).map(c => (
                                    <tr key={c.id} className="border-b border-zinc-800/50">
                                        <td className="py-2 text-white">{c.name}</td>
                                        <td className="py-2 text-right text-zinc-400">{c.valuationsCount || 0}</td>
                                        <td className="py-2 text-right text-amber-400 font-bold">{formatCurrency(c.totalBilled || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Property Types */}
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-4 flex items-center gap-2">
                        <MapPin className="w-3 h-3" />
                        PROPERTY TYPES
                    </div>
                    {propertyTypes.length === 0 ? (
                        <div className="text-center py-6">
                            <MapPin className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                            <p className="font-mono text-xs text-zinc-500">No data yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {propertyTypes.map((pt, idx) => (
                                <div key={idx}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-xs text-zinc-300 capitalize">{pt.type}</span>
                                        <span className="font-mono text-[10px] text-zinc-500">{pt.count}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-zinc-800 rounded-full">
                                        <div
                                            className={`h-full rounded-full ${pt.color.includes('green') ? 'bg-green-500' : pt.color.includes('blue') ? 'bg-blue-500' : pt.color.includes('purple') ? 'bg-purple-500' : pt.color.includes('amber') ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${(pt.count / maxPtCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Regional Breakdown */}
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-4 flex items-center gap-2">
                        <MapPin className="w-3 h-3" />
                        TOP REGIONS
                    </div>
                    <table className="w-full">
                        <thead>
                            <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                <th className="text-left pb-2">REGION</th>
                                <th className="text-right pb-2">COUNT</th>
                                <th className="text-right pb-2 w-24">SHARE</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                            {regions.map((r, idx) => (
                                <tr key={idx} className="border-b border-zinc-800/50">
                                    <td className="py-2 text-white capitalize">{r.region}</td>
                                    <td className="py-2 text-right text-zinc-400">{r.count}</td>
                                    <td className="py-2 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="w-12 h-1.5 bg-zinc-800 rounded-full">
                                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${r.percentage}%` }} />
                                            </div>
                                            <span className="text-zinc-500 text-[10px] w-8 text-right">{r.percentage}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Method Breakdown */}
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-4 flex items-center gap-2">
                        <BarChart3 className="w-3 h-3" />
                        VALUATION METHODS
                    </div>
                    <table className="w-full">
                        <thead>
                            <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                <th className="text-left pb-2">METHOD</th>
                                <th className="text-right pb-2">COUNT</th>
                                <th className="text-right pb-2 w-24">SHARE</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                            {methods.map((m, idx) => (
                                <tr key={idx} className="border-b border-zinc-800/50">
                                    <td className="py-2 text-white capitalize">{m.method}</td>
                                    <td className="py-2 text-right text-zinc-400">{m.count}</td>
                                    <td className="py-2 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="w-12 h-1.5 bg-zinc-800 rounded-full">
                                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${m.percentage}%` }} />
                                            </div>
                                            <span className="text-zinc-500 text-[10px] w-8 text-right">{m.percentage}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            ) : (
            /* ═══════════════ FIRM PERFORMANCE TAB ═══════════════ */
            <>
            {firmLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                    <span className="ml-3 font-mono text-xs text-zinc-500">Loading firm analytics...</span>
                </div>
            ) : firmData ? (
            <>
            {/* Period Selector */}
            <div className="flex items-center gap-2 mb-6">
                <span className="font-mono text-[10px] text-zinc-500">PERIOD:</span>
                {['7d', '30d', '90d', '1y'].map(p => (
                    <button
                        key={p}
                        onClick={() => setFirmPeriod(p)}
                        className={`px-3 py-1.5 font-mono text-xs transition-colors ${firmPeriod === p ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'}`}
                    >
                        {p === '7d' ? '7 DAYS' : p === '30d' ? '30 DAYS' : p === '90d' ? '90 DAYS' : '1 YEAR'}
                    </button>
                ))}
            </div>

            {/* Revenue KPI Row */}
            <div className="grid grid-cols-6 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">REVENUE</div>
                    <div className="font-mono text-2xl text-green-400">{formatCurrency(firmData.revenue.total)}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{firmData.revenue.paid_count} paid</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">OUTSTANDING</div>
                    <div className="font-mono text-2xl text-amber-400">{formatCurrency(firmData.revenue.outstanding)}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{firmData.revenue.pending_count} pending</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">OVERDUE</div>
                    <div className="font-mono text-2xl text-red-400">{formatCurrency(firmData.revenue.overdue)}</div>
                    {firmData.revenue.overdue_count > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            <span className="font-mono text-[10px] text-red-400">{firmData.revenue.overdue_count}</span>
                        </div>
                    )}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">VALUATIONS</div>
                    <div className="font-mono text-2xl text-white">{firmData.throughput.total}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">{firmData.throughput.completed} completed</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">AVG TURNAROUND</div>
                    <div className="font-mono text-2xl text-blue-400">{firmData.throughput.avg_turnaround_days}d</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">completion time</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">ACTIVE CLIENTS</div>
                    <div className="font-mono text-2xl text-amber-500">{firmData.clients.active}</div>
                    <div className="font-mono text-[10px] text-zinc-600 mt-1">
                        {firmData.clients.new > 0 && <span className="text-green-400">+{firmData.clients.new} new</span>}
                    </div>
                </div>
            </div>

            {/* Throughput Breakdown */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                        <div className="font-mono text-lg text-white">{firmData.throughput.completed}</div>
                        <div className="font-mono text-[10px] text-zinc-500">COMPLETED</div>
                    </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <div className="font-mono text-lg text-white">{firmData.throughput.in_progress}</div>
                        <div className="font-mono text-[10px] text-zinc-500">IN PROGRESS</div>
                    </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-500/10 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                        <div className="font-mono text-lg text-white">{firmData.throughput.draft}</div>
                        <div className="font-mono text-[10px] text-zinc-500">DRAFT</div>
                    </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <div className="font-mono text-lg text-white">{firmData.clients.total}</div>
                        <div className="font-mono text-[10px] text-zinc-500">TOTAL CLIENTS</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Valuer Productivity */}
                <div className="bg-zinc-900 border border-zinc-800 p-4 col-span-2">
                    <div className="font-mono text-[10px] text-zinc-500 mb-4 flex items-center gap-2">
                        <UserCheck className="w-3 h-3" />
                        VALUER PRODUCTIVITY
                    </div>
                    {firmData.valuers.length === 0 ? (
                        <div className="text-center py-6">
                            <Users className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                            <p className="font-mono text-xs text-zinc-500">No valuer data for this period</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                                    <th className="text-left pb-2">VALUER</th>
                                    <th className="text-left pb-2">ROLE</th>
                                    <th className="text-right pb-2">ASSIGNED</th>
                                    <th className="text-right pb-2">COMPLETED</th>
                                    <th className="text-right pb-2">AVG DAYS</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                                {firmData.valuers.map(v => (
                                    <tr key={v.id} className="border-b border-zinc-800/50">
                                        <td className="py-2 text-white">{v.name || 'Unknown'}</td>
                                        <td className="py-2 text-zinc-400 capitalize">{v.role.replace(/_/g, ' ')}</td>
                                        <td className="py-2 text-right text-zinc-300">{v.valuations}</td>
                                        <td className="py-2 text-right text-green-400 font-bold">{v.completed}</td>
                                        <td className="py-2 text-right text-blue-400">{v.avg_turnaround_days > 0 ? `${v.avg_turnaround_days}d` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Monthly Trend */}
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" />
                        MONTHLY TREND
                    </div>
                    {firmData.monthly_trend.length === 0 ? (
                        <div className="text-center py-6">
                            <TrendingUp className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                            <p className="font-mono text-xs text-zinc-500">No trend data yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {firmData.monthly_trend.map((m, idx) => {
                                const maxVal = Math.max(...firmData.monthly_trend.map(t => t.valuations)) || 1
                                const month = new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                                return (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-mono text-xs text-zinc-300">{month}</span>
                                            <span className="font-mono text-[10px] text-zinc-500">{m.valuations} val · {formatCurrency(m.revenue)}</span>
                                        </div>
                                        <div className="w-full h-2 bg-zinc-800 rounded-full flex gap-0.5">
                                            <div
                                                className="h-full bg-green-500 rounded-l-full"
                                                style={{ width: `${(m.completed / maxVal) * 100}%` }}
                                            />
                                            <div
                                                className="h-full bg-amber-500 rounded-r-full"
                                                style={{ width: `${((m.valuations - m.completed) / maxVal) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                            <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    <span className="font-mono text-[10px] text-zinc-500">Completed</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                                    <span className="font-mono text-[10px] text-zinc-500">Pending</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Property Type Distribution (firm-level) */}
            {firmData.property_types.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-4 flex items-center gap-2">
                        <MapPin className="w-3 h-3" />
                        PROPERTY TYPE DISTRIBUTION ({firmPeriod.toUpperCase()})
                    </div>
                    <div className="grid grid-cols-5 gap-3">
                        {firmData.property_types.map((pt, idx) => {
                            const maxCount = Math.max(...firmData.property_types.map(p => p.count)) || 1
                            const colors = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-rose-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-orange-500']
                            return (
                                <div key={idx} className="text-center">
                                    <div className="font-mono text-lg text-white">{pt.count}</div>
                                    <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-1 mb-2">
                                        <div className={`h-full rounded-full ${colors[idx % colors.length]}`} style={{ width: `${(pt.count / maxCount) * 100}%` }} />
                                    </div>
                                    <div className="font-mono text-[10px] text-zinc-500 capitalize">{(pt.type || 'Unknown').replace(/_/g, ' ')}</div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
            </>
            ) : (
                <div className="text-center py-20">
                    <Building2 className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                    <p className="font-mono text-sm text-zinc-500">No firm analytics data available</p>
                    <p className="font-mono text-[10px] text-zinc-600 mt-1">Ensure the enterprise API is configured</p>
                </div>
            )}
            </>
            )}
        </div>
    )
}