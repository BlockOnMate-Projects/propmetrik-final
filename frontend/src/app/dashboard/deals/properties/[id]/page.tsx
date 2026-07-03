'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
    Loader2, ArrowLeft, Plus, MapPin, Home, Building2, LandPlot,
    Users, Phone, Mail, Calendar, FileText, ChevronRight, Clock,
    CheckCircle2, XCircle, AlertCircle, MoreHorizontal, Edit, Trash2, Camera, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

interface PropertyDetail {
    id: string
    property_name: string
    property_type: string
    listing_type: 'sale' | 'rent' | 'lease' | 'rental'
    description?: string
    address: string
    city: string
    region: string
    digital_address?: string
    price: number
    currency: string
    bedrooms?: number
    bathrooms?: number
    area_sqm?: number
    land_size_sqm?: number
    year_built?: number
    status: 'available' | 'active' | 'pending' | 'under_offer' | 'reserved' | 'sold' | 'rented' | 'withdrawn'
    images?: Array<{ id: string; url: string; key?: string; original_name?: string } | string>
    features?: string[]
    owner_name?: string
    owner_contact?: string
    owner_phone?: string
    owner_email?: string
    created_at: string
    updated_at?: string
    // Pipeline tracking fields
    pipeline_id?: string
    current_stage_id?: string
    pipeline_name?: string
    current_stage_name?: string
    current_stage_color?: string
    current_stage_order?: number
    total_stages?: number
    days_in_stage?: number
    stage_entered_at?: string
    // Agent assignment
    assigned_agent_id?: string
    assigned_agent_name?: string
}

interface PropertyDeal {
    id: string
    deal_number: string
    title: string
    deal_type: string
    deal_status: 'active' | 'won' | 'lost' | 'archived' | 'on_hold'
    deal_value: number
    currency: string
    stage_name: string
    stage_color: string
    stage_order: number
    total_stages: number
    assigned_agent_name?: string
    primary_contact_name?: string
    created_at: string
    estimated_close_date?: string
}

interface PipelineStage {
    id: string
    stage_name: string
    stage_order: number
    stage_color: string
    color?: string
    deals: PropertyDeal[]
}

interface PropertyPipelineStage {
    id: string
    stage_name: string
    stage_order: number
    color: string
}

function PropertyPipeline({ deals, stages }: { deals: PropertyDeal[], stages: PipelineStage[] }) {
    // Group deals by stage
    const dealsByStage = stages.map(stage => ({
        ...stage,
        deals: deals.filter(d => d.stage_name === stage.stage_name)
    }))

    if (deals.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 border border-border bg-muted">
                <FileText className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="font-mono text-sm text-foreground mb-2">No Active Deals</h3>
                <p className="font-mono text-[10px] text-muted-foreground mb-4">
                    Create a deal to start tracking this property's sales progress
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Pipeline visualization */}
            <div className="flex gap-1 overflow-x-auto pb-2">
                {stages.map((stage, idx) => {
                    const stageDeals = dealsByStage.find(s => s.stage_name === stage.stage_name)?.deals || []
                    const hasDeals = stageDeals.length > 0
                    
                    return (
                        <div key={stage.id} className="flex items-center">
                            <div 
                                className={cn(
                                    "flex flex-col items-center justify-center min-w-[120px] h-16 px-3 rounded transition-colors",
                                    hasDeals 
                                        ? 'bg-opacity-100' 
                                        : 'bg-opacity-20'
                                )}
                                style={{ 
                                    backgroundColor: hasDeals 
                                        ? stage.stage_color 
                                        : `${stage.stage_color}33` 
                                }}
                            >
                                <span className={cn(
                                    "font-mono text-[9px] font-bold text-center",
                                    hasDeals ? 'text-foreground' : 'text-muted-foreground'
                                )}>
                                    {stage.stage_name}
                                </span>
                                {hasDeals && (
                                    <span className="font-mono text-xs font-bold text-foreground mt-1">
                                        {stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            {idx < stages.length - 1 && (
                                <ChevronRight className="h-5 w-5 text-muted-foreground mx-1 flex-shrink-0" />
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Deals list */}
            <div className="space-y-2">
                {deals.map(deal => (
                    <Link 
                        key={deal.id}
                        href={`/dashboard/deals/${deal.id}`}
                        className="block border border-border bg-card p-4 hover:border-border transition-colors"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                        {deal.deal_number}
                                    </span>
                                    <Badge 
                                        className={cn(
                                            "font-mono text-[9px]",
                                            deal.deal_status === 'active' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                                            deal.deal_status === 'won' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                                            deal.deal_status === 'lost' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                                            'bg-zinc-500/20 text-muted-foreground'
                                        )}
                                    >
                                        {deal.deal_status.toUpperCase()}
                                    </Badge>
                                </div>
                                <h4 className="font-mono text-sm text-foreground mb-2">{deal.title}</h4>
                                <div className="flex items-center gap-4 text-muted-foreground">
                                    <span className="font-mono text-xs">
                                        {formatCurrency(deal.deal_value, deal.currency)}
                                    </span>
                                    {deal.primary_contact_name && (
                                        <span className="font-mono text-[10px]">
                                            <Users className="h-3 w-3 inline mr-1" />
                                            {deal.primary_contact_name}
                                        </span>
                                    )}
                                    {deal.estimated_close_date && (
                                        <span className="font-mono text-[10px]">
                                            <Calendar className="h-3 w-3 inline mr-1" />
                                            {new Date(deal.estimated_close_date).toLocaleDateString('en-GB')}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div 
                                    className="px-3 py-1 rounded font-mono text-[10px] font-bold"
                                    style={{ 
                                        backgroundColor: deal.stage_color,
                                        color: '#000'
                                    }}
                                >
                                    {deal.stage_name}
                                </div>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                    Step {deal.stage_order}/{deal.total_stages}
                                </span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}

export default function PropertyDetailPage() {
    const params = useParams()
    const router = useRouter()
    const propertyId = params.id as string

    const [property, setProperty] = useState<PropertyDetail | null>(null)
    const [deals, setDeals] = useState<PropertyDeal[]>([])
    const [stages, setStages] = useState<PipelineStage[]>([])
    const [propertyStages, setPropertyStages] = useState<PropertyPipelineStage[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isChangingStage, setIsChangingStage] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [agents, setAgents] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
    const [isAssigningAgent, setIsAssigningAgent] = useState(false)

    const handleStageChange = async (stageId: string) => {
        if (!property || isChangingStage) return
        
        try {
            setIsChangingStage(true)
            const response = await authedFetch(`${API_BASE}/crm/properties/${propertyId}/stage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage_id: stageId })
            })
            
            if (response.ok) {
                // Reload property data to get updated stage info
                loadPropertyData()
            }
        } catch (error) {
            console.error('Error updating stage:', error)
        } finally {
            setIsChangingStage(false)
        }
    }

    const loadPropertyData = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)

            // Fetch single property by ID (includes images, description, etc.)
            const propertyRes = await authedFetch(`${API_BASE}/crm/properties/${propertyId}`)
            if (propertyRes.ok) {
                const foundProperty = await propertyRes.json()
                if (foundProperty && foundProperty.id) {
                    setProperty({
                        id: foundProperty.id,
                        property_name: foundProperty.property_name || 'Unnamed Property',
                        property_type: foundProperty.property_type || 'house',
                        listing_type: foundProperty.listing_type || 'sale',
                        description: foundProperty.description,
                        address: foundProperty.address || '',
                        city: foundProperty.city || 'Accra',
                        region: foundProperty.region || 'Greater Accra',
                        digital_address: foundProperty.digital_address,
                        price: parseFloat(foundProperty.price) || 0,
                        currency: foundProperty.currency || 'GHS',
                        bedrooms: foundProperty.bedrooms,
                        bathrooms: foundProperty.bathrooms,
                        area_sqm: foundProperty.area_sqm ? parseFloat(foundProperty.area_sqm) : undefined,
                        land_size_sqm: foundProperty.land_size_sqm,
                        year_built: foundProperty.year_built,
                        status: foundProperty.status || 'active',
                        images: foundProperty.images || [],
                        features: foundProperty.features || [],
                        owner_name: foundProperty.owner_name,
                        owner_contact: foundProperty.owner_phone,
                        owner_phone: foundProperty.owner_phone,
                        owner_email: foundProperty.owner_email,
                        created_at: foundProperty.created_at,
                        updated_at: foundProperty.updated_at,
                        // Pipeline fields
                        pipeline_id: foundProperty.pipeline_id,
                        current_stage_id: foundProperty.current_stage_id,
                        pipeline_name: foundProperty.pipeline_name,
                        current_stage_name: foundProperty.current_stage_name,
                        current_stage_color: foundProperty.current_stage_color,
                        current_stage_order: foundProperty.current_stage_order,
                        total_stages: parseInt(foundProperty.total_stages) || 0,
                        days_in_stage: foundProperty.days_in_stage,
                        stage_entered_at: foundProperty.stage_entered_at,
                        assigned_agent_id: foundProperty.assigned_agent_id,
                        assigned_agent_name: foundProperty.assigned_agent_name,
                    })
                    
                    // Fetch property pipeline stages if the property has a pipeline
                    if (foundProperty.pipeline_id) {
                        fetchPropertyStages(propertyId)
                    }
                } else {
                    throw new Error('Property not found')
                }
            } else {
                throw new Error('Failed to fetch property')
            }

            // Fetch deals for this property
            const dealsRes = await authedFetch(`${API_BASE}/crm/deals?propertyId=${propertyId}`)
            if (dealsRes.ok) {
                const dealsData = await dealsRes.json()
                // Ensure deals is always an array
                const dealsList = Array.isArray(dealsData) ? dealsData :
                                  Array.isArray(dealsData?.data) ? dealsData.data :
                                  Array.isArray(dealsData?.deals) ? dealsData.deals : []
                setDeals(dealsList)
            } else {
                setDeals([])
            }

            // Fetch pipeline stages (use default sales pipeline)
            const pipelinesRes = await authedFetch(`${API_BASE}/crm/pipelines?include_stages=true`)
            if (pipelinesRes.ok) {
                const pipelinesData = await pipelinesRes.json()
                // Ensure pipelinesData is an array
                const pipelines = Array.isArray(pipelinesData) ? pipelinesData : 
                                  Array.isArray(pipelinesData?.pipelines) ? pipelinesData.pipelines : []
                const defaultPipeline = pipelines.find((p: any) => p.is_default) || pipelines[0]
                if (defaultPipeline?.stages && Array.isArray(defaultPipeline.stages)) {
                    setStages(defaultPipeline.stages.map((s: any) => ({
                        id: s.id,
                        stage_name: s.stage_name,
                        stage_order: s.stage_order,
                        stage_color: s.stage_color || s.color || '#71717a',
                        deals: []
                    })))
                }
            }

            // Fetch agents for assignment dropdown
            const agentsRes = await authedFetch(`${API_BASE}/crm/agents`)
            if (agentsRes.ok) {
                const agentsData = await agentsRes.json()
                const agentsList = Array.isArray(agentsData) ? agentsData :
                                   Array.isArray(agentsData?.data) ? agentsData.data :
                                   Array.isArray(agentsData?.agents) ? agentsData.agents : []
                setAgents(agentsList)
            }

        } catch (err) {
            console.error('Failed to load property:', err)
            setError('Failed to load property details')
        } finally {
            setIsLoading(false)
        }
    }, [propertyId])

    const fetchPropertyStages = async (propId: string) => {
        try {
            const response = await authedFetch(`${API_BASE}/crm/properties/${propId}/stages`)
            if (response.ok) {
                const data = await response.json()
                if (data.stages) {
                    setPropertyStages(data.stages)
                }
            }
        } catch (error) {
            console.error('Error fetching property stages:', error)
        }
    }

    useEffect(() => {
        loadPropertyData()
    }, [loadPropertyData])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
        )
    }

    if (error || !property) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400 mb-4" />
                <p className="font-mono text-sm text-red-600 dark:text-red-400 mb-4">{error || 'Property not found'}</p>
                <Button onClick={() => router.back()} variant="outline" className="border-border">
                    Go Back
                </Button>
            </div>
        )
    }

    const statusColors: Record<string, string> = {
        'pending': 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
        'active': 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
        'available': 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
        'under_offer': 'bg-primary/20 text-amber-600 dark:text-amber-400 border-primary/30',
        'reserved': 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
        'sold': 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
        'rented': 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
        'withdrawn': 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
    }

    const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
        'house': Home,
        'apartment': Building2,
        'land': LandPlot,
        'commercial': Building2,
    }
    const Icon = typeIcons[property.property_type] || Home

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="font-mono text-xl text-foreground">{property.property_name}</h1>
                            <Badge className={cn('font-mono text-[9px] border', statusColors[property.status])}>
                                {property.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span className="font-mono text-[10px]">
                                {property.address}, {property.city}, {property.region}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/dashboard/deals/new?propertyId=${property.id}`}>
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs">
                            <Plus className="h-4 w-4 mr-2" />
                            CREATE DEAL
                        </Button>
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="border-border">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border-border">
                            <DropdownMenuItem
                                className="text-foreground cursor-pointer"
                                onClick={() => router.push(`/dashboard/deals/properties/submit?editId=${property.id}`)}
                            >
                                <Edit className="h-4 w-4 mr-2" /> Edit Property
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border" />
                            {/* Status Changes */}
                            {property.status !== 'active' && (
                                <DropdownMenuItem
                                    className="text-green-600 dark:text-green-400 cursor-pointer"
                                    onClick={async () => {
                                        try {
                                            const res = await authedFetch(`${API_BASE}/crm/properties/${property.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ status: 'active' })
                                            })
                                            if (res.ok) loadPropertyData()
                                        } catch { console.error('Failed to update status') }
                                    }}
                                >
                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Active
                                </DropdownMenuItem>
                            )}
                            {property.status !== 'under_offer' && (
                                <DropdownMenuItem
                                    className="text-amber-600 dark:text-amber-400 cursor-pointer"
                                    onClick={async () => {
                                        try {
                                            const res = await authedFetch(`${API_BASE}/crm/properties/${property.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ status: 'under_offer' })
                                            })
                                            if (res.ok) loadPropertyData()
                                        } catch { console.error('Failed to update status') }
                                    }}
                                >
                                    <Clock className="h-4 w-4 mr-2" /> Mark as Under Offer
                                </DropdownMenuItem>
                            )}
                            {property.status !== 'sold' && property.listing_type === 'sale' && (
                                <DropdownMenuItem
                                    className="text-purple-600 dark:text-purple-400 cursor-pointer"
                                    onClick={async () => {
                                        try {
                                            const res = await authedFetch(`${API_BASE}/crm/properties/${property.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ status: 'sold' })
                                            })
                                            if (res.ok) loadPropertyData()
                                        } catch { console.error('Failed to update status') }
                                    }}
                                >
                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Sold
                                </DropdownMenuItem>
                            )}
                            {property.status !== 'withdrawn' && (
                                <DropdownMenuItem
                                    className="text-muted-foreground cursor-pointer"
                                    onClick={async () => {
                                        try {
                                            const res = await authedFetch(`${API_BASE}/crm/properties/${property.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ status: 'withdrawn' })
                                            })
                                            if (res.ok) loadPropertyData()
                                        } catch { console.error('Failed to update status') }
                                    }}
                                >
                                    <XCircle className="h-4 w-4 mr-2" /> Withdraw
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem
                                className="text-red-600 dark:text-red-400 cursor-pointer"
                                onClick={async () => {
                                    if (!confirm('Are you sure you want to delete this property?')) return
                                    try {
                                        const res = await authedFetch(`${API_BASE}/crm/properties/${property.id}`, { method: 'DELETE' })
                                        if (res.ok) {
                                            router.push('/dashboard/deals/properties')
                                        } else {
                                            alert('Failed to delete property')
                                        }
                                    } catch {
                                        alert('Failed to delete property')
                                    }
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Property
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-3 gap-6">
                {/* Left: Property Details */}
                <div className="col-span-1 space-y-4">
                    {/* Image Gallery */}
                    <div className="space-y-2">
                        <div className="aspect-[4/3] bg-muted rounded overflow-hidden relative group">
                            {property.images?.[0] && typeof property.images[0] !== 'string' && property.images[0].url ? (
                                <img
                                    src={(property.images[0] as { url: string }).url}
                                    alt={property.property_name}
                                    className="w-full h-full object-cover"
                                />
                            ) : property.images?.[0] && typeof property.images[0] === 'string' ? (
                                <img 
                                    src={property.images[0]} 
                                    alt={property.property_name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                    <Icon className="h-16 w-16 text-muted-foreground" />
                                    <label className="cursor-pointer">
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={async (e) => {
                                                if (!e.target.files || e.target.files.length === 0) return
                                                const formData = new FormData()
                                                Array.from(e.target.files).forEach(f => formData.append('images', f))
                                                try {
                                                    const res = await authedFetch(`${API_BASE}/crm/properties/${propertyId}/images`, {
                                                        method: 'POST',
                                                        body: formData,
                                                    })
                                                    if (res.ok) loadPropertyData()
                                                } catch (err) {
                                                    console.error('Upload failed:', err)
                                                }
                                            }}
                                        />
                                        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-md text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                                            <Camera className="h-4 w-4" />
                                            Add Photos
                                        </div>
                                    </label>
                                </div>
                            )}
                            {/* Upload overlay on hover if images exist */}
                            {property.images && property.images.length > 0 && (
                                <label className="absolute inset-0 bg-background/0 group-hover:bg-background/30 transition-all flex items-center justify-center cursor-pointer">
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={async (e) => {
                                            if (!e.target.files || e.target.files.length === 0) return
                                            const formData = new FormData()
                                            Array.from(e.target.files).forEach(f => formData.append('images', f))
                                            try {
                                                const res = await authedFetch(`${API_BASE}/crm/properties/${propertyId}/images`, {
                                                    method: 'POST',
                                                    body: formData,
                                                })
                                                if (res.ok) loadPropertyData()
                                            } catch (err) {
                                                console.error('Upload failed:', err)
                                            }
                                        }}
                                    />
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 px-3 py-2 bg-card/90 rounded text-sm font-medium text-foreground">
                                        <Camera className="h-4 w-4" />
                                        Add More Photos
                                    </div>
                                </label>
                            )}
                        </div>
                        {/* Thumbnail strip */}
                        {property.images && property.images.length > 1 && (
                            <div className="flex gap-1 overflow-x-auto pb-1">
                                {property.images.map((img: any, idx: number) => (
                                    <div
                                        key={img.id || idx}
                                        className="relative flex-shrink-0 w-16 h-16 rounded border border-border overflow-hidden group/thumb"
                                    >
                                        <img
                                            src={img.url || img}
                                            alt={`Photo ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                        {img.id && (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation()
                                                    try {
                                                        const res = await authedFetch(`${API_BASE}/crm/properties/${propertyId}/images/${img.id}`, { method: 'DELETE' })
                                                        if (res.ok) loadPropertyData()
                                                    } catch (err) {
                                                        console.error('Delete failed:', err)
                                                    }
                                                }}
                                                className="absolute top-0 right-0 w-5 h-5 bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity text-xs hover:bg-destructive"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Price */}
                    <div className="border border-border bg-card p-4">
                        <div className="font-mono text-[10px] text-muted-foreground mb-1">
                            {property.listing_type === 'rent' ? 'MONTHLY RENT' : 'ASKING PRICE'}
                        </div>
                        <div className="font-mono text-2xl text-primary font-bold">
                            {formatCurrency(property.price, property.currency)}
                        </div>
                    </div>

                    {/* Specs */}
                    <div className="border border-border bg-card p-4 space-y-3">
                        <div className="font-mono text-[10px] text-muted-foreground mb-2">PROPERTY DETAILS</div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="font-mono text-[10px] text-muted-foreground">Type</div>
                                <div className="font-mono text-sm text-foreground capitalize">{property.property_type}</div>
                            </div>
                            <div>
                                <div className="font-mono text-[10px] text-muted-foreground">For</div>
                                <div className="font-mono text-sm text-foreground capitalize">{property.listing_type}</div>
                            </div>
                            {property.bedrooms && (
                                <div>
                                    <div className="font-mono text-[10px] text-muted-foreground">Bedrooms</div>
                                    <div className="font-mono text-sm text-foreground">{property.bedrooms}</div>
                                </div>
                            )}
                            {property.bathrooms && (
                                <div>
                                    <div className="font-mono text-[10px] text-muted-foreground">Bathrooms</div>
                                    <div className="font-mono text-sm text-foreground">{property.bathrooms}</div>
                                </div>
                            )}
                            {property.area_sqm && (
                                <div>
                                    <div className="font-mono text-[10px] text-muted-foreground">Building Area</div>
                                    <div className="font-mono text-sm text-foreground">{property.area_sqm.toLocaleString()} sqm</div>
                                </div>
                            )}
                            {property.land_size_sqm && (
                                <div>
                                    <div className="font-mono text-[10px] text-muted-foreground">Land Size</div>
                                    <div className="font-mono text-sm text-foreground">{property.land_size_sqm.toLocaleString()} sqm</div>
                                </div>
                            )}
                            {property.year_built && (
                                <div>
                                    <div className="font-mono text-[10px] text-muted-foreground">Year Built</div>
                                    <div className="font-mono text-sm text-foreground">{property.year_built}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Owner Info */}
                    {property.owner_name && (
                        <div className="border border-border bg-card p-4">
                            <div className="font-mono text-[10px] text-muted-foreground mb-3">PROPERTY OWNER</div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                                    <Users className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <div className="font-mono text-sm text-foreground">{property.owner_name}</div>
                                    <div className="font-mono text-[10px] text-muted-foreground">Property Owner</div>
                                </div>
                            </div>
                            {property.owner_contact && (
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    <Phone className="h-3 w-3" />
                                    <span className="font-mono text-xs">{property.owner_contact}</span>
                                </div>
                            )}
                            {property.owner_email && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Mail className="h-3 w-3" />
                                    <span className="font-mono text-xs">{property.owner_email}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Assigned Agent */}
                    <div className="border border-border bg-card p-4">
                        <div className="font-mono text-[10px] text-muted-foreground mb-3">ASSIGNED AGENT</div>
                        {property.assigned_agent_name ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                        <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <div className="font-mono text-sm text-foreground">{property.assigned_agent_name}</div>
                                        <div className="font-mono text-[10px] text-muted-foreground">Agent</div>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isAssigningAgent}
                                    onClick={async () => {
                                        try {
                                            setIsAssigningAgent(true)
                                            const res = await authedFetch(`${API_BASE}/crm/properties/${propertyId}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ assigned_agent_id: null })
                                            })
                                            if (res.ok) loadPropertyData()
                                        } catch (err) {
                                            console.error('Failed to unassign agent:', err)
                                        } finally {
                                            setIsAssigningAgent(false)
                                        }
                                    }}
                                    className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <div>
                                <select
                                    className="w-full bg-muted border border-border rounded px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    value=""
                                    disabled={isAssigningAgent || agents.length === 0}
                                    onChange={async (e) => {
                                        const agentId = e.target.value
                                        if (!agentId) return
                                        try {
                                            setIsAssigningAgent(true)
                                            const res = await authedFetch(`${API_BASE}/crm/properties/${propertyId}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ assigned_agent_id: agentId })
                                            })
                                            if (res.ok) loadPropertyData()
                                        } catch (err) {
                                            console.error('Failed to assign agent:', err)
                                        } finally {
                                            setIsAssigningAgent(false)
                                        }
                                    }}
                                >
                                    <option value="">{agents.length === 0 ? 'No agents available' : 'Select an agent...'}</option>
                                    {agents.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.first_name} {a.last_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Pipeline Progress - Property-level tracking */}
                    {property.pipeline_name && (
                        <div className="border border-border bg-card p-4">
                            <div className="font-mono text-[10px] text-muted-foreground mb-3">PIPELINE PROGRESS</div>
                            
                            <div className="mb-3">
                                <div className="font-mono text-[9px] text-muted-foreground mb-1">Pipeline</div>
                                <div className="font-mono text-xs text-foreground">{property.pipeline_name}</div>
                            </div>

                            <div className="mb-3">
                                <div className="font-mono text-[9px] text-muted-foreground mb-1">Current Stage</div>
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: property.current_stage_color || '#F59E0B' }}
                                    />
                                    <span className="font-mono text-sm text-foreground font-medium">
                                        {property.current_stage_name}
                                    </span>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono text-[9px] text-muted-foreground">Progress</span>
                                    <span className="font-mono text-[9px] text-muted-foreground">
                                        {property.current_stage_order}/{property.total_stages}
                                    </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className="h-full rounded-full transition-all"
                                        style={{ 
                                            width: `${property.total_stages ? (property.current_stage_order || 0) / property.total_stages * 100 : 0}%`,
                                            backgroundColor: property.current_stage_color || '#F59E0B'
                                        }}
                                    />
                                </div>
                            </div>

                            {property.days_in_stage !== undefined && property.days_in_stage >= 0 && (
                                <div className="text-muted-foreground font-mono text-[10px] mb-3">
                                    <Clock className="h-3 w-3 inline mr-1" />
                                    {property.days_in_stage} days in current stage
                                </div>
                            )}

                            {/* Stage Selector */}
                            {propertyStages.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-border">
                                    <div className="font-mono text-[9px] text-muted-foreground mb-2">MOVE TO STAGE</div>
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {propertyStages.map(stage => (
                                            <button
                                                key={stage.id}
                                                onClick={() => handleStageChange(stage.id)}
                                                disabled={isChangingStage || stage.id === property.current_stage_id}
                                                className={cn(
                                                    "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded",
                                                    stage.id === property.current_stage_id 
                                                        ? "bg-primary/20 border border-primary/30 cursor-default" 
                                                        : "bg-muted hover:bg-accent border border-border cursor-pointer",
                                                    isChangingStage && "opacity-50 cursor-wait"
                                                )}
                                            >
                                                <div 
                                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: stage.color }}
                                                />
                                                <span className="font-mono text-[10px] text-foreground flex-1 truncate">{stage.stage_name}</span>
                                                {stage.id === property.current_stage_id && (
                                                    <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right: Pipeline & Deals */}
                <div className="col-span-2 space-y-4">
                    <Tabs defaultValue="pipeline" className="w-full">
                        <TabsList className="bg-muted border border-border p-1">
                            <TabsTrigger 
                                value="pipeline" 
                                className="font-mono text-[10px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                DEAL PIPELINE
                            </TabsTrigger>
                            <TabsTrigger 
                                value="activities" 
                                className="font-mono text-[10px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                ACTIVITIES
                            </TabsTrigger>
                            <TabsTrigger 
                                value="documents" 
                                className="font-mono text-[10px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                DOCUMENTS
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="pipeline" className="mt-4">
                            <PropertyPipeline deals={deals} stages={stages} />
                        </TabsContent>

                        <TabsContent value="activities" className="mt-4">
                            <div className="border border-border bg-muted p-8 text-center">
                                <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                                <p className="font-mono text-sm text-muted-foreground">
                                    Activity timeline will show all actions related to this property
                                </p>
                            </div>
                        </TabsContent>

                        <TabsContent value="documents" className="mt-4">
                            <div className="border border-border bg-muted p-8 text-center">
                                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                                <p className="font-mono text-sm text-muted-foreground">
                                    Documents related to this property will appear here
                                </p>
                            </div>
                        </TabsContent>
                    </Tabs>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="border border-border bg-card p-4">
                            <div className="font-mono text-[10px] text-muted-foreground mb-1">TOTAL DEALS</div>
                            <div className="font-mono text-2xl text-foreground">{deals.length}</div>
                        </div>
                        <div className="border border-border bg-card p-4">
                            <div className="font-mono text-[10px] text-muted-foreground mb-1">ACTIVE DEALS</div>
                            <div className="font-mono text-2xl text-blue-600 dark:text-blue-400">
                                {deals.filter(d => d.deal_status === 'active').length}
                            </div>
                        </div>
                        <div className="border border-border bg-card p-4">
                            <div className="font-mono text-[10px] text-muted-foreground mb-1">WON DEALS</div>
                            <div className="font-mono text-2xl text-green-600 dark:text-green-400">
                                {deals.filter(d => d.deal_status === 'won').length}
                            </div>
                        </div>
                        <div className="border border-border bg-card p-4">
                            <div className="font-mono text-[10px] text-muted-foreground mb-1">TOTAL VALUE</div>
                            <div className="font-mono text-lg text-primary">
                                {formatCurrency(
                                    deals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
                                    property.currency
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
