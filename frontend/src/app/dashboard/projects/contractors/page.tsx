'use client'

import React, { useState, useEffect } from 'react'
import {
    Hammer,
    Users,
    Star,
    Clock,
    Loader2,
    AlertTriangle,
    Search,
    Plus,
    CheckCircle,
    XCircle,
    MoreHorizontal,
    X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { contractorsApi } from '@/lib/projects-api'
import { Contractor, ContractorPerformance } from '@/types/projects'

export default function ContractorsPage() {
    const [contractors, setContractors] = useState<Contractor[]>([])
    const [performance, setPerformance] = useState<ContractorPerformance[]>([])
    const [trades, setTrades] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [tradeFilter, setTradeFilter] = useState('')
    const [showCreate, setShowCreate] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({
        company_name: '',
        trade: '',
        contact_name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        region: '',
        license_number: '',
        tax_id: '',
        bank_name: '',
        bank_account_number: '',
        bank_branch: '',
        momo_number: '',
        notes: '',
    })

    useEffect(() => {
        loadData()
    }, [])

    useEffect(() => {
        loadContractors()
    }, [search, tradeFilter])

    const loadData = async () => {
        try {
            setLoading(true)
            setError(null)
            const [contractorsRes, perfRes, tradesRes] = await Promise.allSettled([
                contractorsApi.getAll(),
                contractorsApi.getPerformance(),
                contractorsApi.getTrades(),
            ])
            if (contractorsRes.status === 'fulfilled') setContractors(contractorsRes.value || [])
            if (perfRes.status === 'fulfilled') setPerformance(perfRes.value || [])
            if (tradesRes.status === 'fulfilled') setTrades(tradesRes.value || [])
        } catch (err: any) {
            console.error('Failed to load contractors:', err)
            setError(err.message || 'Failed to load contractors')
        } finally {
            setLoading(false)
        }
    }

    const loadContractors = async () => {
        try {
            const filters: any = {}
            if (search) filters.search = search
            if (tradeFilter) filters.trade = tradeFilter
            const res = await contractorsApi.getAll(filters)
            setContractors(res || [])
        } catch (err: any) {
            console.error('Failed to filter contractors:', err)
        }
    }

    const createContractor = async () => {
        if (!form.company_name.trim()) return
        try {
            setSaving(true)
            await contractorsApi.create({
                company_name: form.company_name,
                trade: form.trade || undefined,
                contact_person: form.contact_name || undefined,
                email: form.email || undefined,
                phone: form.phone || undefined,
                address: form.address || undefined,
                bank_name: form.bank_name || undefined,
                bank_account_number: form.bank_account_number || undefined,
                bank_branch: form.bank_branch || undefined,
                momo_number: form.momo_number || undefined,
                license_number: form.license_number || undefined,
            } as any)
            setShowCreate(false)
            setForm({
                company_name: '', trade: '', contact_name: '', email: '', phone: '',
                address: '', city: '', region: '', license_number: '', tax_id: '',
                bank_name: '', bank_account_number: '', bank_branch: '', momo_number: '', notes: '',
            })
            await loadData()
        } catch (err: any) {
            console.error('Failed to create contractor:', err)
            setError(err.message || 'Failed to create contractor')
        } finally {
            setSaving(false)
        }
    }

    const totalContractors = contractors.length
    const activeContractors = contractors.filter(c => c.status === 'active').length
    const pendingContractors = contractors.filter(c => c.status === 'pending_approval').length
    const avgRating = contractors.length > 0
        ? (contractors.reduce((sum, c) => sum + (c.rating || 0), 0) / contractors.filter(c => c.rating).length) || 0
        : 0

    const statusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] font-mono">Active</Badge>
            case 'pending_approval':
                return <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px] font-mono">Pending</Badge>
            case 'suspended':
                return <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px] font-mono">Suspended</Badge>
            default:
                return <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-[10px] font-mono">{status}</Badge>
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <AlertTriangle className="h-10 w-10 text-red-500" />
                <p className="text-sm font-mono text-zinc-400">{error}</p>
                <Button
                    onClick={loadData}
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                    Retry
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
                        CONTRACTORS
                    </h1>
                    <p className="text-zinc-500 font-mono text-xs mt-1">
                        Manage contractors, trades &amp; performance
                    </p>
                </div>
                <Dialog open={showCreate} onOpenChange={setShowCreate}>
                    <DialogTrigger asChild>
                        <Button
                            className="bg-amber-500 hover:bg-amber-600 text-white font-mono text-xs"
                        >
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Add Contractor
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-white font-mono">NEW CONTRACTOR</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">COMPANY NAME *</Label>
                                    <Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Company name" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">TRADE / SPECIALTY</Label>
                                    <Input value={form.trade} onChange={e => setForm({ ...form, trade: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="e.g. Electrical, Plumbing" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">CONTACT PERSON</Label>
                                    <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Full name" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">EMAIL</Label>
                                    <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="email@company.com" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">PHONE</Label>
                                    <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="+233..." />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">ADDRESS</Label>
                                    <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">CITY</Label>
                                    <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">REGION</Label>
                                    <Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">LICENSE NUMBER</Label>
                                    <Input value={form.license_number} onChange={e => setForm({ ...form, license_number: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">TAX ID / TIN</Label>
                                    <Input value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">BANK NAME</Label>
                                    <Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">ACCOUNT NUMBER</Label>
                                    <Input value={form.bank_account_number} onChange={e => setForm({ ...form, bank_account_number: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-zinc-500">BRANCH</Label>
                                    <Input value={form.bank_branch} onChange={e => setForm({ ...form, bank_branch: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
                                </div>
                            </div>
                            <div>
                                <Label className="text-[10px] font-mono text-zinc-500">MOBILE MONEY (MOMO) NUMBER</Label>
                                <Input value={form.momo_number} onChange={e => setForm({ ...form, momo_number: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="024..." />
                            </div>
                            <div>
                                <Label className="text-[10px] font-mono text-zinc-500">NOTES</Label>
                                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="bg-zinc-800 border-zinc-700 text-white" />
                            </div>
                            <Button onClick={createContractor} disabled={saving || !form.company_name.trim()} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-mono text-xs">
                                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                                CREATE CONTRACTOR
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">TOTAL CONTRACTORS</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{totalContractors}</p>
                            </div>
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Users className="h-5 w-5 text-amber-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>All registered contractors</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">ACTIVE</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{activeContractors}</p>
                            </div>
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <CheckCircle className="h-5 w-5 text-emerald-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>Currently approved &amp; active</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">PENDING APPROVAL</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{pendingContractors}</p>
                            </div>
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Clock className="h-5 w-5 text-amber-400" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>Awaiting review</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">AVG RATING</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{avgRating.toFixed(1)}</p>
                            </div>
                            <div className="p-2 bg-yellow-500/10 rounded-lg">
                                <Star className="h-5 w-5 text-yellow-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>Out of 5.0</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search contractors..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                    />
                </div>
                <select
                    value={tradeFilter}
                    onChange={(e) => setTradeFilter(e.target.value)}
                    className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-amber-500/50"
                >
                    <option value="">All Trades</option>
                    {trades.map(trade => (
                        <option key={trade} value={trade}>{trade}</option>
                    ))}
                </select>
            </div>

            {/* Contractors table */}
            <Card className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-0">
                    {contractors.length === 0 ? (
                        <div className="py-12 text-center">
                            <Hammer className="h-10 w-10 mx-auto mb-2 text-zinc-700 opacity-50" />
                            <p className="text-xs font-mono text-zinc-600">No contractors found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-800">
                                        <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">NAME</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">TRADE</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">STATUS</th>
                                        <th className="text-center px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">RATING</th>
                                        <th className="text-center px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">PROJECTS</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contractors.map((contractor) => (
                                        <tr key={contractor.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-mono text-white">{contractor.company_name}</p>
                                                <p className="text-[10px] font-mono text-zinc-600">{(contractor as any).contact_name || contractor.contact_person}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs font-mono text-zinc-400">{contractor.trade}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                {statusBadge(contractor.status)}
                                            </td>
                                            <td className="text-center px-4 py-3">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Star className="h-3 w-3 text-yellow-500" />
                                                    <span className="text-sm font-mono text-white">
                                                        {contractor.rating?.toFixed(1) ?? '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="text-center px-4 py-3">
                                                <span className="text-sm font-mono text-zinc-400">
                                                    {contractor.total_projects ?? 0}
                                                </span>
                                            </td>
                                            <td className="text-right px-4 py-3">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
