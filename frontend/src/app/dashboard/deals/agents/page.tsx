'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import {
    Plus,
    Search,
    Loader2,
    User,
    Phone,
    Mail,
    Star,
    Briefcase,
    TrendingUp,
    Users,
    DollarSign,
    Filter,
    MoreVertical
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { agentsApi } from '@/lib/crm-api'
import type { Agent, AgentStats, PaginatedResponse } from '@/types/crm'
import { AgentStatus, AgentSpecialization } from '@/types/crm'

// =====================================================
// PANEL COMPONENT
// =====================================================
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

// =====================================================
// STAT CARD COMPONENT
// =====================================================
function StatCard({ 
    label, 
    value, 
    icon: Icon, 
    trend 
}: { 
    label: string; 
    value: string | number; 
    icon: React.ElementType;
    trend?: string;
}) {
    return (
        <div className="bg-zinc-800/50 border border-zinc-700 p-4">
            <div className="flex items-start justify-between">
                <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
                    <p className="font-mono text-2xl font-bold text-white mt-1">{value}</p>
                    {trend && (
                        <p className="font-mono text-[10px] text-green-400 mt-1">{trend}</p>
                    )}
                </div>
                <div className="p-2 bg-amber-500/10 rounded">
                    <Icon className="h-5 w-5 text-amber-500" />
                </div>
            </div>
        </div>
    )
}

// =====================================================
// AGENT CARD
// =====================================================

// Helper to parse PostgreSQL array format to JS array
function parsePostgresArray(value: any): string[] {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
        // Handle PostgreSQL array format: {value1,value2}
        if (value.startsWith('{') && value.endsWith('}')) {
            return value.slice(1, -1).split(',').filter(Boolean)
        }
        // Handle JSON string
        try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    return []
}

function AgentCard({ agent }: { agent: Agent }) {
    const getStatusColor = (status: AgentStatus) => {
        switch (status) {
            case AgentStatus.ACTIVE: return 'bg-green-900/50 text-green-400'
            case AgentStatus.INACTIVE: return 'bg-zinc-700/50 text-zinc-400'
            case AgentStatus.SUSPENDED: return 'bg-red-900/50 text-red-400'
            case AgentStatus.PENDING_APPROVAL: return 'bg-yellow-900/50 text-yellow-400'
            default: return 'bg-zinc-700/50 text-zinc-400'
        }
    }

    const formatSpecialization = (spec: AgentSpecialization) => {
        return spec.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }

    return (
        <Link href={`/dashboard/deals/agents/${agent.id}`}>
            <div className="bg-zinc-800/50 border border-zinc-700 p-4 hover:border-amber-500/50 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        {agent.avatar_url ? (
                            <img 
                                src={agent.avatar_url} 
                                alt={agent.display_name} 
                                className="w-12 h-12 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center">
                                <User className="h-6 w-6 text-amber-500" />
                            </div>
                        )}
                        <div>
                            <h4 className="font-mono text-sm text-white group-hover:text-amber-500 transition-colors">
                                {agent.display_name || `${agent.first_name} ${agent.last_name}`}
                            </h4>
                            {agent.license_number && (
                                <p className="font-mono text-[10px] text-zinc-500">License: {agent.license_number}</p>
                            )}
                        </div>
                    </div>
                    <span className={cn('font-mono text-[9px] px-1.5 py-0.5', getStatusColor(agent.status))}>
                        {agent.status?.toUpperCase()}
                    </span>
                </div>

                {/* Specializations */}
                <div className="flex flex-wrap gap-1 mb-3">
                    {parsePostgresArray(agent.specializations).slice(0, 2).map((spec, index) => (
                        <span 
                            key={index}
                            className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-700/50 text-zinc-300"
                        >
                            {formatSpecialization(spec as AgentSpecialization)}
                        </span>
                    ))}
                    {parsePostgresArray(agent.specializations).length > 2 && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-700/50 text-zinc-400">
                            +{parsePostgresArray(agent.specializations).length - 2} more
                        </span>
                    )}
                </div>

                {/* Contact Info */}
                <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 text-zinc-500" />
                        <span className="font-mono text-[10px] text-zinc-400">{agent.phone_primary}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-zinc-500" />
                        <span className="font-mono text-[10px] text-zinc-400 truncate">{agent.email}</span>
                    </div>
                </div>

                {/* Performance Metrics */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-700">
                    <div className="text-center">
                        <p className="font-mono text-xs text-white font-bold">{agent.current_active_deals || 0}</p>
                        <p className="font-mono text-[9px] text-zinc-500">Active Deals</p>
                    </div>
                    <div className="text-center">
                        <p className="font-mono text-xs text-white font-bold">{agent.total_deals_closed || 0}</p>
                        <p className="font-mono text-[9px] text-zinc-500">Closed</p>
                    </div>
                    <div className="text-center flex items-center justify-center gap-0.5">
                        <Star className="h-3 w-3 text-yellow-500" />
                        <p className="font-mono text-xs text-white font-bold">
                            {agent.customer_rating ? Number(agent.customer_rating).toFixed(1) : '—'}
                        </p>
                    </div>
                </div>
            </div>
        </Link>
    )
}

// =====================================================
// MAIN PAGE
// =====================================================
export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([])
    const [stats, setStats] = useState<AgentStats | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Filters
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [specializationFilter, setSpecializationFilter] = useState<string>('all')

    useEffect(() => {
        loadData()
    }, [statusFilter, specializationFilter])

    const loadData = async () => {
        try {
            setIsLoading(true)
            setError(null)

            const filters: any = {}
            if (statusFilter !== 'all') filters.status = statusFilter
            if (specializationFilter !== 'all') filters.specialization = specializationFilter

            const [agentsResult, statsResult] = await Promise.all([
                agentsApi.getAll(filters),
                agentsApi.getStats()
            ])

            setAgents(agentsResult.data || [])
            setStats(statsResult)
        } catch (err: any) {
            console.error('Failed to load agents:', err)
            setError(err.message || 'Failed to load agents')
        } finally {
            setIsLoading(false)
        }
    }

    const filteredAgents = agents.filter(agent => {
        if (!search) return true
        const searchLower = search.toLowerCase()
        return (
            agent.first_name?.toLowerCase().includes(searchLower) ||
            agent.last_name?.toLowerCase().includes(searchLower) ||
            agent.email?.toLowerCase().includes(searchLower) ||
            agent.display_name?.toLowerCase().includes(searchLower)
        )
    })

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="font-mono text-lg font-bold text-white">AGENTS</h2>
                    <p className="font-mono text-[10px] text-zinc-500">
                        Manage your real estate agents and their performance
                    </p>
                </div>
                <Link href="/dashboard/deals/agents/new">
                    <Button className="bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs">
                        <Plus className="h-4 w-4 mr-1" />
                        ADD AGENT
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <StatCard
                        label="Total Agents"
                        value={stats.total_agents}
                        icon={Users}
                    />
                    <StatCard
                        label="Active Agents"
                        value={stats.active_agents}
                        icon={User}
                    />
                    <StatCard
                        label="Deals This Month"
                        value={stats.total_deals_this_month}
                        icon={Briefcase}
                    />
                    <StatCard
                        label="Volume This Month"
                        value={formatCurrency(stats.total_volume_this_month)}
                        icon={DollarSign}
                    />
                </div>
            )}

            {/* Filters */}
            <Panel title="FILTERS">
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            <Input
                                placeholder="Search agents..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8 bg-zinc-800 border-zinc-700 font-mono text-sm"
                            />
                        </div>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[150px] bg-zinc-800 border-zinc-700 font-mono text-xs">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                            <SelectItem value="pending_approval">Pending</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={specializationFilter} onValueChange={setSpecializationFilter}>
                        <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700 font-mono text-xs">
                            <SelectValue placeholder="Specialization" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Specializations</SelectItem>
                            <SelectItem value="residential_sales">Residential Sales</SelectItem>
                            <SelectItem value="commercial_sales">Commercial Sales</SelectItem>
                            <SelectItem value="residential_rentals">Residential Rentals</SelectItem>
                            <SelectItem value="commercial_rentals">Commercial Rentals</SelectItem>
                            <SelectItem value="land_sales">Land Sales</SelectItem>
                            <SelectItem value="property_management">Property Management</SelectItem>
                            <SelectItem value="investment_advisory">Investment Advisory</SelectItem>
                            <SelectItem value="valuation">Valuation</SelectItem>
                            <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </Panel>

            {/* Loading State */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="p-4 bg-red-900/20 border border-red-800 text-red-400 font-mono text-xs">
                    {error}
                </div>
            )}

            {/* Agents Grid */}
            {!isLoading && !error && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAgents.length === 0 ? (
                        <div className="col-span-full text-center py-12">
                            <User className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                            <p className="font-mono text-sm text-zinc-500">No agents found</p>
                            <p className="font-mono text-[10px] text-zinc-600 mt-1">
                                Add your first agent to get started
                            </p>
                            <Link href="/dashboard/deals/agents/new">
                                <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs">
                                    <Plus className="h-4 w-4 mr-1" />
                                    ADD AGENT
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        filteredAgents.map(agent => (
                            <AgentCard key={agent.id} agent={agent} />
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
