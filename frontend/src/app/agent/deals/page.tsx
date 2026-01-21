'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    Search,
    Filter,
    ChevronRight,
    Loader2,
    Briefcase,
    Calendar,
    DollarSign,
    User,
    Building2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface Deal {
    id: string
    deal_number: string
    title: string
    deal_type: string
    deal_status: string
    deal_value: number
    currency: string
    close_probability: number
    stage_id: string
    stage_name: string
    stage_color: string
    pipeline_name: string
    primary_contact_id: string
    primary_contact_name: string
    expected_close_date: string
    estimated_close_date: string
    created_at: string
    updated_at: string
    days_in_stage: number
}

// Helper to format currency
function formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount)
}

// Panel component
function Panel({ title, children, className }: { 
    title: string; 
    children: React.ReactNode; 
    className?: string;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-3">{children}</div>
        </div>
    )
}

export default function AgentDealsPage() {
    const [isLoading, setIsLoading] = useState(true)
    const [deals, setDeals] = useState<Deal[]>([])
    const [filteredDeals, setFilteredDeals] = useState<Deal[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [agentContext, setAgentContext] = useState<any>(null)

    useEffect(() => {
        const loadDeals = async () => {
            try {
                const storedContext = localStorage.getItem('agentContext')
                if (!storedContext) return

                const context = JSON.parse(storedContext)
                setAgentContext(context)

                const headers = {
                    'Content-Type': 'application/json',
                    'X-User-Id': context.userId,
                    'X-Organization-Id': context.orgId
                }

                // Fetch agent's deals
                const res = await fetch(
                    `${API_BASE}/crm/deals?assigned_agent=${context.agentId}&limit=100`,
                    { headers }
                )

                if (res.ok) {
                    const data = await res.json()
                    setDeals(data.data || [])
                    setFilteredDeals(data.data || [])
                }
            } catch (err) {
                console.error('Failed to load deals:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadDeals()
    }, [])

    // Filter deals based on search and status
    useEffect(() => {
        let filtered = [...deals]

        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(d =>
                d.title.toLowerCase().includes(query) ||
                d.deal_number?.toLowerCase().includes(query) ||
                d.primary_contact_name?.toLowerCase().includes(query)
            )
        }

        if (statusFilter !== 'all') {
            filtered = filtered.filter(d => d.deal_status === statusFilter)
        }

        setFilteredDeals(filtered)
    }, [searchQuery, statusFilter, deals])

    // Group deals by status
    const dealsByStatus = {
        active: filteredDeals.filter(d => d.deal_status === 'active'),
        won: filteredDeals.filter(d => d.deal_status === 'won'),
        lost: filteredDeals.filter(d => d.deal_status === 'lost'),
        on_hold: filteredDeals.filter(d => d.deal_status === 'on_hold')
    }

    // Calculate totals
    const totalValue = filteredDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0)
    const activeValue = dealsByStatus.active.reduce((sum, d) => sum + (d.deal_value || 0), 0)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-xl text-white">My Deals</h1>
                    <p className="font-mono text-xs text-zinc-500 mt-1">
                        {deals.length} deals assigned to you
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900/50 border border-zinc-800 p-4">
                    <div className="font-mono text-2xl text-white">{dealsByStatus.active.length}</div>
                    <div className="font-mono text-[10px] text-blue-400 mt-1">ACTIVE</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4">
                    <div className="font-mono text-2xl text-green-400">{dealsByStatus.won.length}</div>
                    <div className="font-mono text-[10px] text-zinc-500 mt-1">WON</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4">
                    <div className="font-mono text-lg text-green-400">{formatCurrency(activeValue)}</div>
                    <div className="font-mono text-[10px] text-zinc-500 mt-1">PIPELINE VALUE</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4">
                    <div className="font-mono text-lg text-amber-400">{formatCurrency(totalValue)}</div>
                    <div className="font-mono text-[10px] text-zinc-500 mt-1">TOTAL VALUE</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Search deals..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-zinc-900 border-zinc-800 text-white font-mono text-sm"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-white font-mono text-sm">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="all" className="font-mono text-xs">All Status</SelectItem>
                        <SelectItem value="active" className="font-mono text-xs">Active</SelectItem>
                        <SelectItem value="won" className="font-mono text-xs">Won</SelectItem>
                        <SelectItem value="lost" className="font-mono text-xs">Lost</SelectItem>
                        <SelectItem value="on_hold" className="font-mono text-xs">On Hold</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Deals List */}
            <Panel title={`DEALS (${filteredDeals.length})`}>
                {filteredDeals.length === 0 ? (
                    <div className="text-center py-12">
                        <Briefcase className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                        <p className="font-mono text-sm text-zinc-400">No deals found</p>
                        <p className="font-mono text-xs text-zinc-600 mt-1">
                            {deals.length === 0 
                                ? "Deals assigned to you will appear here"
                                : "Try adjusting your search or filters"
                            }
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredDeals.map((deal) => (
                            <Link key={deal.id} href={`/agent/deals/${deal.id}`}>
                                <div className="flex items-center gap-4 p-4 bg-zinc-800/30 border border-zinc-700 hover:border-amber-500/50 transition-colors cursor-pointer">
                                    {/* Deal Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-[10px] text-amber-500">
                                                {deal.deal_number}
                                            </span>
                                            <span className={cn(
                                                'font-mono text-[9px] px-1.5 py-0.5',
                                                deal.deal_status === 'active' && 'bg-blue-900/50 text-blue-400',
                                                deal.deal_status === 'won' && 'bg-green-900/50 text-green-400',
                                                deal.deal_status === 'lost' && 'bg-red-900/50 text-red-400',
                                                deal.deal_status === 'on_hold' && 'bg-yellow-900/50 text-yellow-400'
                                            )}>
                                                {deal.deal_status?.toUpperCase()}
                                            </span>
                                            <span className={cn(
                                                'font-mono text-[9px] px-1.5 py-0.5',
                                                deal.deal_type === 'sale' && 'bg-green-900/30 text-green-500',
                                                deal.deal_type === 'rental' && 'bg-blue-900/30 text-blue-500'
                                            )}>
                                                {deal.deal_type?.toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="font-mono text-sm text-white truncate">{deal.title}</p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <span 
                                                className="font-mono text-[9px] px-1.5 py-0.5"
                                                style={{ 
                                                    backgroundColor: `${deal.stage_color}20`,
                                                    color: deal.stage_color
                                                }}
                                            >
                                                {deal.stage_name}
                                            </span>
                                            {deal.primary_contact_name && (
                                                <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                                                    <User className="h-3 w-3" />
                                                    {deal.primary_contact_name}
                                                </span>
                                            )}
                                            {deal.expected_close_date && (
                                                <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(deal.expected_close_date).toLocaleDateString('en-GB', {
                                                        day: 'numeric',
                                                        month: 'short'
                                                    })}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Deal Value */}
                                    <div className="text-right">
                                        <p className="font-mono text-lg text-green-400">
                                            {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency) : '—'}
                                        </p>
                                        <p className="font-mono text-[10px] text-zinc-500">
                                            {deal.close_probability}% probability
                                        </p>
                                    </div>

                                    <ChevronRight className="h-5 w-5 text-zinc-600" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </Panel>
        </div>
    )
}
