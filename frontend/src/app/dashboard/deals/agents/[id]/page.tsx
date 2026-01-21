'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import {
    ArrowLeft,
    Loader2,
    Edit,
    Phone,
    Mail,
    MapPin,
    Calendar,
    TrendingUp,
    Users,
    Briefcase,
    Award,
    Star,
    DollarSign,
    FileText,
    Clock,
    CheckCircle,
    XCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { agentsApi, dealsApi, contactsApi } from '@/lib/crm-api'
import type { Agent, Deal, Contact } from '@/types/crm'
import { AgentStatus } from '@/types/crm'

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

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({ title, icon: Icon, children, className, action }: { 
    title: string;
    icon?: React.ElementType;
    children: React.ReactNode; 
    className?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-3 w-3 text-amber-500" />}
                    <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
                </div>
                {action}
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

// =====================================================
// STAT CARD COMPONENT
// =====================================================
function StatCard({ label, value, icon: Icon, trend, trendUp }: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    trend?: string;
    trendUp?: boolean;
}) {
    return (
        <div className="bg-zinc-800/50 border border-zinc-700 p-3 rounded">
            <div className="flex items-center justify-between mb-2">
                <Icon className="h-4 w-4 text-amber-500" />
                {trend && (
                    <span className={cn(
                        "font-mono text-[10px]",
                        trendUp ? "text-green-400" : "text-red-400"
                    )}>
                        {trend}
                    </span>
                )}
            </div>
            <div className="font-mono text-xl text-white">{value}</div>
            <div className="font-mono text-[10px] text-zinc-500 uppercase">{label}</div>
        </div>
    )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function AgentProfilePage() {
    const router = useRouter()
    const params = useParams()
    const agentId = params.id as string

    const [agent, setAgent] = useState<Agent | null>(null)
    const [deals, setDeals] = useState<Deal[]>([])
    const [contacts, setContacts] = useState<Contact[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('overview')

    // Load agent data
    useEffect(() => {
        const loadAgent = async () => {
            try {
                setIsLoading(true)
                const [agentData, dealsData, contactsData] = await Promise.all([
                    agentsApi.getById(agentId),
                    agentsApi.getDeals(agentId),
                    agentsApi.getContacts(agentId)
                ])

                setAgent(agentData)
                setDeals(dealsData || [])
                setContacts(contactsData || [])
            } catch (err) {
                console.error('Failed to load agent:', err)
            } finally {
                setIsLoading(false)
            }
        }

        if (agentId) {
            loadAgent()
        }
    }, [agentId])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    if (!agent) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <XCircle className="h-12 w-12 text-red-500" />
                <p className="font-mono text-zinc-400">Agent not found</p>
                <Button 
                    variant="outline"
                    onClick={() => router.back()}
                    className="border-zinc-700 text-zinc-300"
                >
                    Go Back
                </Button>
            </div>
        )
    }

    const statusColors: Record<string, string> = {
        active: 'bg-green-500/20 text-green-400 border-green-500/30',
        inactive: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
        suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
        pending_approval: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        className="text-zinc-400 hover:text-white mt-1"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-black font-mono text-xl font-bold">
                            {agent.first_name?.[0]}{agent.last_name?.[0]}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="font-mono text-xl text-white">
                                    {agent.first_name} {agent.last_name}
                                </h1>
                                <Badge className={cn(
                                    "font-mono text-[10px] border",
                                    statusColors[agent.status] || statusColors.inactive
                                )}>
                                    {agent.status?.toUpperCase()}
                                </Badge>
                            </div>
                            <p className="font-mono text-xs text-zinc-500 mt-1">
                                {agent.license_number && `License: ${agent.license_number}`}
                                {agent.years_experience && ` • ${agent.years_experience} years experience`}
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                                {agent.email && (
                                    <a href={`mailto:${agent.email}`} className="flex items-center gap-1 text-zinc-400 hover:text-amber-500 transition-colors">
                                        <Mail className="h-3 w-3" />
                                        <span className="font-mono text-[10px]">{agent.email}</span>
                                    </a>
                                )}
                                {agent.phone_primary && (
                                    <a href={`tel:${agent.phone_primary}`} className="flex items-center gap-1 text-zinc-400 hover:text-amber-500 transition-colors">
                                        <Phone className="h-3 w-3" />
                                        <span className="font-mono text-[10px]">{agent.phone_primary}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <Button 
                    onClick={() => router.push(`/dashboard/deals/agents/${agentId}/edit`)}
                    className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                >
                    <Edit className="h-4 w-4 mr-2" />
                    EDIT AGENT
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-3">
                <StatCard 
                    label="Total Deals" 
                    value={agent.total_deals_closed || 0} 
                    icon={Briefcase}
                />
                <StatCard 
                    label="Sales Volume" 
                    value={formatCurrency(agent.total_sales_volume || 0, 'GHS')} 
                    icon={DollarSign}
                />
                <StatCard 
                    label="Avg. Deal Size" 
                    value={formatCurrency(agent.average_deal_value || 0, 'GHS')} 
                    icon={TrendingUp}
                />
                <StatCard 
                    label="Active Deals" 
                    value={agent.current_active_deals || 0} 
                    icon={Users}
                />
                <StatCard 
                    label="Rating" 
                    value={agent.customer_rating ? `${Number(agent.customer_rating).toFixed(1)}/5` : 'N/A'} 
                    icon={Star}
                />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-zinc-800/50 border border-zinc-700 p-1">
                    <TabsTrigger 
                        value="overview" 
                        className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black"
                    >
                        Overview
                    </TabsTrigger>
                    <TabsTrigger 
                        value="deals" 
                        className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black"
                    >
                        Deals ({deals.length})
                    </TabsTrigger>
                    <TabsTrigger 
                        value="contacts" 
                        className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black"
                    >
                        Contacts ({contacts.length})
                    </TabsTrigger>
                    <TabsTrigger 
                        value="performance" 
                        className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black"
                    >
                        Performance
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Bio & Specializations */}
                        <Panel title="ABOUT" icon={FileText}>
                            {agent.bio ? (
                                <p className="font-mono text-xs text-zinc-300 leading-relaxed">
                                    {agent.bio}
                                </p>
                            ) : (
                                <p className="font-mono text-xs text-zinc-500 italic">No bio provided</p>
                            )}
                            
                            {parsePostgresArray(agent.specializations).length > 0 && (
                                <div className="mt-4">
                                    <p className="font-mono text-[10px] text-zinc-500 mb-2">SPECIALIZATIONS</p>
                                    <div className="flex flex-wrap gap-1">
                                        {parsePostgresArray(agent.specializations).map((spec) => (
                                            <Badge 
                                                key={spec} 
                                                variant="outline"
                                                className="font-mono text-[10px] border-amber-500/30 text-amber-500"
                                            >
                                                {spec.replace(/_/g, ' ')}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Panel>

                        {/* Regions */}
                        <Panel title="REGIONS COVERED" icon={MapPin}>
                            {parsePostgresArray(agent.regions_covered).length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {parsePostgresArray(agent.regions_covered).map((region) => (
                                        <Badge 
                                            key={region} 
                                            variant="outline"
                                            className="font-mono text-[10px] border-zinc-600 text-zinc-400"
                                        >
                                            {region}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="font-mono text-xs text-zinc-500 italic">No regions specified</p>
                            )}
                        </Panel>

                        {/* Commission Settings */}
                        <Panel title="COMMISSION SETTINGS" icon={DollarSign}>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="font-mono text-[10px] text-zinc-500">DEFAULT RATE</p>
                                    <p className="font-mono text-lg text-white">
                                        {agent.default_commission_rate || 5}%
                                    </p>
                                </div>
                                <div>
                                    <p className="font-mono text-[10px] text-zinc-500">AGENT SPLIT</p>
                                    <p className="font-mono text-lg text-white">
                                        {agent.commission_split_rate || 60}%
                                    </p>
                                </div>
                            </div>
                        </Panel>

                        {/* License Info */}
                        <Panel title="LICENSE & CREDENTIALS" icon={Award}>
                            <div className="space-y-3">
                                {agent.license_number ? (
                                    <>
                                        <div>
                                            <p className="font-mono text-[10px] text-zinc-500">LICENSE NUMBER</p>
                                            <p className="font-mono text-sm text-white">{agent.license_number}</p>
                                        </div>
                                        {agent.license_expiry && (
                                            <div>
                                                <p className="font-mono text-[10px] text-zinc-500">EXPIRY DATE</p>
                                                <p className="font-mono text-sm text-white">
                                                    {formatDate(agent.license_expiry)}
                                                </p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <p className="font-mono text-xs text-zinc-500 italic">No license on file</p>
                                )}
                                {agent.ghana_real_estate_board_id && (
                                    <div>
                                        <p className="font-mono text-[10px] text-zinc-500">GREB ID</p>
                                        <p className="font-mono text-sm text-white">{agent.ghana_real_estate_board_id}</p>
                                    </div>
                                )}
                            </div>
                        </Panel>
                    </div>
                </TabsContent>

                {/* Deals Tab */}
                <TabsContent value="deals" className="mt-4">
                    <Panel title="ASSIGNED DEALS" icon={Briefcase}>
                        {deals.length === 0 ? (
                            <div className="text-center py-8">
                                <Briefcase className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                                <p className="font-mono text-xs text-zinc-500">No deals assigned yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {deals.map((deal) => (
                                    <button
                                        key={deal.id}
                                        onClick={() => router.push(`/dashboard/deals/${deal.id}`)}
                                        className="w-full flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors text-left"
                                    >
                                        <div>
                                            <p className="font-mono text-xs text-white">{deal.title}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="outline" className="font-mono text-[10px]">
                                                    {deal.deal_type}
                                                </Badge>
                                                <span className="font-mono text-[10px] text-zinc-500">
                                                    {deal.deal_status}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-mono text-xs text-amber-500">
                                                {formatCurrency(deal.deal_value || 0, 'GHS')}
                                            </p>
                                            <p className="font-mono text-[10px] text-zinc-500">
                                                {deal.created_at && formatDate(deal.created_at)}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Panel>
                </TabsContent>

                {/* Contacts Tab */}
                <TabsContent value="contacts" className="mt-4">
                    <Panel title="ASSIGNED CONTACTS" icon={Users}>
                        {contacts.length === 0 ? (
                            <div className="text-center py-8">
                                <Users className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                                <p className="font-mono text-xs text-zinc-500">No contacts assigned yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {contacts.map((contact) => (
                                    <button
                                        key={contact.id}
                                        onClick={() => router.push(`/dashboard/deals/contacts/${contact.id}`)}
                                        className="w-full flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                                                <span className="font-mono text-xs text-white">
                                                    {contact.first_name?.[0]}{contact.last_name?.[0]}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-mono text-xs text-white">
                                                    {contact.first_name} {contact.last_name}
                                                </p>
                                                <p className="font-mono text-[10px] text-zinc-500">
                                                    {contact.email || contact.phone_primary}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                {contact.contact_type?.replace(/_/g, ' ')}
                                            </Badge>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Panel>
                </TabsContent>

                {/* Performance Tab */}
                <TabsContent value="performance" className="mt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <Panel title="CONVERSION RATE" icon={TrendingUp}>
                            <div className="text-center py-4">
                                <p className="font-mono text-3xl text-amber-500">
                                    {agent.total_deals_closed > 0 ? 'Active' : 'N/A'}
                                </p>
                                <p className="font-mono text-[10px] text-zinc-500 mt-1">Leads to Deals</p>
                            </div>
                        </Panel>

                        <Panel title="AVG. DAYS TO CLOSE" icon={Clock}>
                            <div className="text-center py-4">
                                <p className="font-mono text-3xl text-white">
                                    {agent.average_days_to_close || 'N/A'}
                                </p>
                                <p className="font-mono text-[10px] text-zinc-500 mt-1">Days</p>
                            </div>
                        </Panel>

                        <Panel title="CUSTOMER RATING" icon={Star}>
                            <div className="text-center py-4">
                                <div className="flex items-center justify-center gap-1">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <Star 
                                            key={star}
                                            className={cn(
                                                "h-5 w-5",
                                                star <= Number(agent.customer_rating || 0) 
                                                    ? "text-amber-500 fill-amber-500"
                                                    : "text-zinc-600"
                                            )}
                                        />
                                    ))}
                                </div>
                                <p className="font-mono text-[10px] text-zinc-500 mt-2">
                                    {agent.rating_count || 0} reviews
                                </p>
                            </div>
                        </Panel>
                    </div>

                    <Panel title="MONTHLY PERFORMANCE" icon={TrendingUp}>
                        <div className="text-center py-8">
                            <TrendingUp className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                            <p className="font-mono text-xs text-zinc-500">Performance charts coming soon</p>
                        </div>
                    </Panel>
                </TabsContent>
            </Tabs>
        </div>
    )
}
