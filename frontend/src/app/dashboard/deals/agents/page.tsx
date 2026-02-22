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
    MoreVertical,
    UserCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { EmptyState } from '@/components/crm/EmptyState'

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
        <Card className="border-border shadow-sm">
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
                        {trend && (
                            <p className="text-xs text-green-400 mt-1">{trend}</p>
                        )}
                    </div>
                    <div className="p-2 bg-primary/10 rounded">
                        <Icon className="h-5 w-5 text-primary" />
                    </div>
                </div>
            </CardContent>
        </Card>
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
            case AgentStatus.INACTIVE: return 'bg-muted text-muted-foreground'
            case AgentStatus.SUSPENDED: return 'bg-red-900/50 text-red-400'
            case AgentStatus.PENDING_APPROVAL: return 'bg-yellow-900/50 text-yellow-400'
            default: return 'bg-muted text-muted-foreground'
        }
    }

    const formatSpecialization = (spec: AgentSpecialization) => {
        return spec.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }

    return (
        <Link href={`/dashboard/deals/agents/${agent.id}`}>
            <Card className="border-border hover:border-primary/50 transition-colors cursor-pointer group shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                            {agent.avatar_url ? (
                                <img 
                                    src={agent.avatar_url} 
                                    alt={agent.display_name} 
                                    className="w-12 h-12 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                                    <User className="h-6 w-6 text-primary" />
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                    {agent.display_name || `${agent.first_name} ${agent.last_name}`}
                                </h4>
                                {agent.license_number && (
                                    <p className="text-xs text-muted-foreground">License: {agent.license_number}</p>
                                )}
                            </div>
                        </div>
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', getStatusColor(agent.status))}>
                            {agent.status?.toUpperCase()}
                        </span>
                    </div>

                    {/* Specializations */}
                    <div className="flex flex-wrap gap-1 mb-3">
                        {parsePostgresArray(agent.specializations).slice(0, 2).map((spec, index) => (
                            <span 
                                key={index}
                                className="text-[10px] font-medium px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
                            >
                                {formatSpecialization(spec as AgentSpecialization)}
                            </span>
                        ))}
                        {parsePostgresArray(agent.specializations).length > 2 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                                +{parsePostgresArray(agent.specializations).length - 2} more
                            </span>
                        )}
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-1.5 mb-3">
                        <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{agent.phone_primary}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">{agent.email}</span>
                        </div>
                    </div>

                    {/* Performance Metrics */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                        <div className="text-center">
                            <p className="text-xs text-foreground font-bold">{agent.current_active_deals || 0}</p>
                            <p className="text-[10px] text-muted-foreground">Active Deals</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-foreground font-bold">{agent.total_deals_closed || 0}</p>
                            <p className="text-[10px] text-muted-foreground">Closed</p>
                        </div>
                        <div className="text-center flex items-center justify-center gap-0.5">
                            <Star className="h-3 w-3 text-yellow-500" />
                            <p className="text-xs text-foreground font-bold">
                                {agent.customer_rating ? Number(agent.customer_rating).toFixed(1) : '—'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
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
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Agents</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage your real estate agents and their performance
                    </p>
                </div>
                <Link href="/dashboard/deals/agents/new">
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Agent
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
            <Card className="border-border shadow-sm">
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search agents..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8 text-sm"
                                />
                            </div>
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[150px] h-9 text-sm">
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
                            <SelectTrigger className="w-[180px] h-9 text-sm">
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
                </CardContent>
            </Card>

            {/* Loading State */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="p-4 bg-red-900/20 border border-red-800 text-red-400 text-xs rounded-md">
                    {error}
                </div>
            )}

            {/* Agents Grid */}
            {!isLoading && !error && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAgents.length === 0 ? (
                        <div className="col-span-full">
                            <EmptyState
                                icon={UserCircle}
                                title="No agents yet"
                                description="Add real estate agents to manage deal assignments and track performance."
                                actions={[{ label: 'Add Agent', href: '/dashboard/deals/agents/new', icon: Plus }]}
                            />
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
