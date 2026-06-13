'use client'

import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn, formatCurrency } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
    Loader2, Plus, Search, MapPin, Home, Building2, LandPlot,
    ChevronRight, MoreHorizontal, Eye, FileText, Users, TrendingUp, Edit, Layers
} from 'lucide-react'

const StackingPlanView = lazy(() => import('@/components/crm/StackingPlanView'))
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/crm/EmptyState'

// API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

// Property types for CRM context
interface CRMProperty {
    id: string
    reference_number?: string
    property_name: string
    property_type: string
    listing_type: 'sale' | 'rent' | 'lease' | 'rental'
    address: string
    city: string
    region: string
    price: number
    currency: string
    bedrooms?: number
    bathrooms?: number
    area_sqm?: number
    status: 'pending' | 'active' | 'under_offer' | 'sold' | 'rented' | 'withdrawn'
    images?: string[]
    owner_name?: string
    owner_phone?: string
    created_at: string
    deal_count?: number
    active_deals?: number
    // Pipeline tracking
    pipeline_id?: string
    current_stage_id?: string
    pipeline_name?: string
    current_stage_name?: string
    current_stage_color?: string
    current_stage_order?: number
    total_stages?: number
    days_in_stage?: number
}

interface PropertyFilters {
    search: string
    listing_type: string
    property_type: string
    status: string
    region: string
}

function PropertyCard({ property, onViewDeals }: { 
    property: CRMProperty
    onViewDeals: (id: string) => void 
}) {
    const router = useRouter()
    
    const statusColors: Record<string, string> = {
        'pending': 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
        'active': 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
        'under_offer': 'bg-primary/20 text-amber-600 dark:text-amber-400 border-primary/30',
        'sold': 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
        'rented': 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
        'withdrawn': 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
    }

    const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
        'residential': Home,
        'house': Home,
        'apartment': Building2,
        'land': LandPlot,
        'commercial': Building2,
        'commercial_land': LandPlot,
        'office': Building2,
        'warehouse': Building2,
        'retail': Building2,
        'villa': Home,
        'townhouse': Home,
        'mixed_use': Building2,
    }
    
    const Icon = typeIcons[property.property_type] || Home

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't navigate if clicking on dropdown or buttons
        if ((e.target as HTMLElement).closest('button, [role="menuitem"]')) {
            return
        }
        router.push(`/dashboard/deals/properties/${property.id}`)
    }

    // Calculate stage progress
    const stageProgress = property.total_stages && property.current_stage_order 
        ? (property.current_stage_order / property.total_stages) * 100 
        : 0

    return (
        <Card 
            onClick={handleCardClick}
            className="border-border bg-card hover:border-primary/50 transition-all cursor-pointer group shadow-sm overflow-hidden"
        >
            {/* Property Image */}
            <div className="aspect-[16/10] bg-muted relative">
                {property.images?.[0] ? (
                    <img 
                        src={property.images[0]} 
                        alt={property.property_name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Icon className="h-12 w-12 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
                    </div>
                )}
                {/* Status badge */}
                <div className="absolute top-2 right-2">
                    <Badge className={cn('text-[10px] font-medium border', statusColors[property.status] || statusColors['active'])}>
                        {property.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                </div>
                {/* Listing type badge */}
                <div className="absolute top-2 left-2">
                    <Badge className="text-[10px] font-medium bg-background/70 text-foreground border-0">
                        For {(property.listing_type === 'rental' ? 'Rent' : property.listing_type.charAt(0).toUpperCase() + property.listing_type.slice(1))}
                    </Badge>
                </div>
                {/* Deal count indicator */}
                {(property.active_deals ?? 0) > 0 && (
                    <div className="absolute bottom-2 left-2">
                        <Badge className="text-[10px] font-medium bg-primary text-primary-foreground border-0">
                            {property.active_deals} Active Deal{(property.active_deals ?? 0) > 1 ? 's' : ''}
                        </Badge>
                    </div>
                )}
            </div>

            {/* Property Info */}
            <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm text-foreground font-medium truncate flex-1 group-hover:text-primary transition-colors">
                        {property.property_name}
                    </h3>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/deals/properties/${property.id}`}>
                                    <Eye className="h-4 w-4 mr-2" /> View Details
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/deals/properties/${property.id}?edit=true`}>
                                    <Edit className="h-4 w-4 mr-2" /> Edit Property
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); onViewDeals(property.id) }}
                            >
                                <FileText className="h-4 w-4 mr-2" /> View Deals
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild className="text-primary">
                                <Link href={`/dashboard/deals/new?propertyId=${property.id}`}>
                                    <Plus className="h-4 w-4 mr-2" /> Create Deal
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-1 text-muted-foreground mb-3">
                    <MapPin className="h-3 w-3" />
                    <span className="text-xs font-medium truncate">
                        {property.city}, {property.region?.replace('_', ' ')}
                    </span>
                </div>

                <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-lg text-primary font-bold">
                        {formatCurrency(property.price, property.currency)}
                    </span>
                    {(property.listing_type === 'rent' || property.listing_type === 'rental') && (
                        <span className="text-xs text-muted-foreground">/month</span>
                    )}
                </div>

                {/* Property specs */}
                <div className="flex items-center gap-4 text-muted-foreground mb-3">
                    {property.bedrooms && (
                        <span className="text-xs font-medium">{property.bedrooms} Bed</span>
                    )}
                    {property.bathrooms && (
                        <span className="text-xs font-medium">{property.bathrooms} Bath</span>
                    )}
                    {property.area_sqm && (
                        <span className="text-xs font-medium">{Number(property.area_sqm).toLocaleString()} sqm</span>
                    )}
                </div>

                {/* Owner info */}
                {property.owner_name && (
                    <div className="pt-3 border-t border-border flex items-center gap-2 mb-3">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                            Owner: {property.owner_name}
                        </span>
                    </div>
                )}

                {/* Pipeline Stage Indicator */}
                {property.current_stage_name && (
                    <div className="pt-3 border-t border-border">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-medium text-muted-foreground">Pipeline Stage</span>
                            <span className="text-[10px] font-medium text-muted-foreground">
                                {property.current_stage_order}/{property.total_stages}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div 
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: property.current_stage_color || '#F59E0B' }}
                            />
                            <span className="text-xs text-foreground font-medium truncate">
                                {property.current_stage_name}
                            </span>
                            {property.days_in_stage !== undefined && property.days_in_stage > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground ml-auto">
                                    {property.days_in_stage}d
                                </span>
                            )}
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                            <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                    width: `${stageProgress}%`,
                                    backgroundColor: property.current_stage_color || '#F59E0B'
                                }}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default function CRMPropertiesPage() {
    const [properties, setProperties] = useState<CRMProperty[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'list' | 'stacking'>('list')
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
    const [filters, setFilters] = useState<PropertyFilters>({
        search: '',
        listing_type: 'all',
        property_type: 'all',
        status: 'all',
        region: 'all',
    })
    const [stats, setStats] = useState({
        total: 0,
        available: 0,
        under_offer: 0,
        with_active_deals: 0,
    })

    const loadProperties = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)

            // Build query params
            const params = new URLSearchParams()
            if (filters.search) params.append('search', filters.search)
            if (filters.listing_type !== 'all') params.append('listing_type', filters.listing_type)
            if (filters.property_type !== 'all') params.append('property_type', filters.property_type)
            if (filters.status !== 'all') params.append('status', filters.status)
            if (filters.region !== 'all') params.append('region', filters.region)
            params.append('include_deals', 'true')

            const response = await authedFetch(`${API_BASE}/crm/properties?${params}`)
            if (!response.ok) {
                // Fallback to property management if CRM properties not available
                const pmResponse = await authedFetch(`${API_BASE}/property-management/properties?${params}`)
                if (!pmResponse.ok) throw new Error('Failed to fetch properties')
                const pmData = await pmResponse.json()
                // Transform PM data to CRM format
                const transformed = (pmData.properties || pmData || []).map((p: any) => ({
                    id: p.id,
                    property_name: p.name || p.property_name || 'Unnamed Property',
                    property_type: p.property_type || 'house',
                    listing_type: p.listing_type || 'sale',
                    address: p.address || '',
                    city: p.city || 'Accra',
                    region: p.region || 'Greater Accra',
                    price: p.price || p.asking_price || 0,
                    currency: p.currency || 'GHS',
                    bedrooms: p.bedrooms,
                    bathrooms: p.bathrooms,
                    area_sqm: p.area_sqm || p.total_area,
                    status: p.status || 'available',
                    images: p.images || [],
                    owner_name: p.owner_name,
                    owner_contact: p.owner_contact,
                    created_at: p.created_at,
                    deal_count: 0,
                    active_deals: 0,
                }))
                setProperties(transformed)
                setStats({
                    total: transformed.length,
                    available: transformed.filter((p: CRMProperty) => p.status === 'active').length,
                    under_offer: transformed.filter((p: CRMProperty) => p.status === 'under_offer').length,
                    with_active_deals: transformed.filter((p: CRMProperty) => (p.active_deals ?? 0) > 0).length,
                })
                return
            }

            const data = await response.json()
            setProperties(data.properties || [])
            setStats(data.stats || {
                total: data.properties?.length || 0,
                available: 0,
                under_offer: 0,
                with_active_deals: 0,
            })
        } catch (err) {
            console.error('Failed to load properties:', err)
            setError('Failed to load properties')
        } finally {
            setIsLoading(false)
        }
    }, [filters])

    useEffect(() => {
        const debounce = setTimeout(() => {
            loadProperties()
        }, 300)
        return () => clearTimeout(debounce)
    }, [loadProperties])

    const handleViewDeals = (propertyId: string) => {
        window.location.href = `/dashboard/deals?propertyId=${propertyId}`
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Properties</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage client properties and track deal progress
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* View toggle */}
                    <div className="flex items-center bg-muted rounded-lg p-0.5">
                        <button
                            onClick={() => setViewMode('list')}
                            className={cn(
                                'px-3 py-1.5 text-xs rounded-md transition-colors',
                                viewMode === 'list'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            List View
                        </button>
                        <button
                            onClick={() => setViewMode('stacking')}
                            className={cn(
                                'px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1',
                                viewMode === 'stacking'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Layers className="h-3 w-3" />
                            Stacking Plan
                        </button>
                    </div>
                    <Link href="/dashboard/deals/properties/submit">
                        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Submit Property
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Total Properties</div>
                        <div className="text-2xl font-bold text-foreground">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Available</div>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.available}</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Under Offer</div>
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.under_offer}</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">With Active Deals</div>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.with_active_deals}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search properties..."
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="pl-10 text-sm"
                    />
                </div>
                
                <Select
                    value={filters.listing_type}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, listing_type: v }))}
                >
                    <SelectTrigger className="w-[140px] text-sm">
                        <SelectValue placeholder="Listing Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-sm">All Types</SelectItem>
                        <SelectItem value="sale" className="text-sm">For Sale</SelectItem>
                        <SelectItem value="rent" className="text-sm">For Rent</SelectItem>
                        <SelectItem value="lease" className="text-sm">For Lease</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.property_type}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, property_type: v }))}
                >
                    <SelectTrigger className="w-[140px] text-sm">
                        <SelectValue placeholder="Property Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-sm">All Properties</SelectItem>
                        <SelectItem value="house" className="text-sm">House</SelectItem>
                        <SelectItem value="apartment" className="text-sm">Apartment</SelectItem>
                        <SelectItem value="land" className="text-sm">Land</SelectItem>
                        <SelectItem value="commercial" className="text-sm">Commercial</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.status}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}
                >
                    <SelectTrigger className="w-[140px] text-sm">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-sm">All Status</SelectItem>
                        <SelectItem value="available" className="text-sm">Available</SelectItem>
                        <SelectItem value="under_offer" className="text-sm">Under Offer</SelectItem>
                        <SelectItem value="reserved" className="text-sm">Reserved</SelectItem>
                        <SelectItem value="sold" className="text-sm">Sold</SelectItem>
                        <SelectItem value="rented" className="text-sm">Rented</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.region}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, region: v }))}
                >
                    <SelectTrigger className="w-[160px] text-sm">
                        <SelectValue placeholder="Region" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-sm">All Regions</SelectItem>
                        <SelectItem value="Greater Accra" className="text-sm">Greater Accra</SelectItem>
                        <SelectItem value="Ashanti" className="text-sm">Ashanti</SelectItem>
                        <SelectItem value="Western" className="text-sm">Western</SelectItem>
                        <SelectItem value="Central" className="text-sm">Central</SelectItem>
                        <SelectItem value="Eastern" className="text-sm">Eastern</SelectItem>
                        <SelectItem value="Volta" className="text-sm">Volta</SelectItem>
                        <SelectItem value="Northern" className="text-sm">Northern</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Stacking Plan View */}
            {viewMode === 'stacking' && (
                <div className="space-y-4">
                    {properties.length > 0 && !selectedPropertyId && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {properties.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPropertyId(p.id)}
                                    className="text-left p-3 rounded-lg border border-border hover:border-primary/50 transition-colors bg-card"
                                >
                                    <p className="text-sm font-medium text-foreground">{p.property_name}</p>
                                    <p className="text-xs text-muted-foreground">{p.city}, {p.region}</p>
                                </button>
                            ))}
                        </div>
                    )}
                    {selectedPropertyId && (
                        <div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedPropertyId(null)}
                                className="mb-3 text-xs"
                            >
                                &larr; Back to property list
                            </Button>
                            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
                                <StackingPlanView propertyId={selectedPropertyId} />
                            </Suspense>
                        </div>
                    )}
                    {properties.length === 0 && !isLoading && (
                        <p className="text-sm text-muted-foreground text-center py-8">No properties to display stacking plan for.</p>
                    )}
                </div>
            )}

            {/* Content */}
            {viewMode === 'list' && isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
            ) : viewMode === 'list' && error ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
                    <Button 
                        onClick={loadProperties} 
                        variant="outline"
                    >
                        Retry
                    </Button>
                </div>
            ) : viewMode === 'list' && properties.length === 0 ? (
                <EmptyState
                    icon={Home}
                    title="No Properties Found"
                    description={
                        filters.search || filters.listing_type !== 'all' || filters.property_type !== 'all'
                            ? 'Try adjusting your filters'
                            : 'Start by submitting a client property'
                    }
                    actions={[
                        {
                            label: 'Submit Property',
                            href: '/dashboard/deals/properties/submit',
                            icon: Plus,
                        }
                    ]}
                />
            ) : viewMode === 'list' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {properties.map(property => (
                        <PropertyCard
                            key={property.id}
                            property={property}
                            onViewDeals={handleViewDeals}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    )
}
