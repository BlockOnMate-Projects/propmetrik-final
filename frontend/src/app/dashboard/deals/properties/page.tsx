'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn, formatCurrency } from '@/lib/utils'
import { 
    Loader2, Plus, Search, MapPin, Home, Building2, LandPlot,
    ChevronRight, MoreHorizontal, Eye, FileText, Users, TrendingUp, Edit
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

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
        'pending': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
        'active': 'bg-green-500/20 text-green-400 border-green-500/30',
        'under_offer': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        'sold': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        'rented': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        'withdrawn': 'bg-red-500/20 text-red-400 border-red-500/30',
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
        <div 
            onClick={handleCardClick}
            className="border border-zinc-800 bg-zinc-900/50 hover:border-amber-500/50 hover:bg-zinc-900 transition-all cursor-pointer group"
        >
            {/* Property Image */}
            <div className="aspect-[16/10] bg-zinc-800 relative">
                {property.images?.[0] ? (
                    <img 
                        src={property.images[0]} 
                        alt={property.property_name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Icon className="h-12 w-12 text-zinc-600 group-hover:text-zinc-500 transition-colors" />
                    </div>
                )}
                {/* Status badge */}
                <div className="absolute top-2 right-2">
                    <Badge className={cn('font-mono text-[9px] border', statusColors[property.status] || statusColors['active'])}>
                        {property.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                </div>
                {/* Listing type badge */}
                <div className="absolute top-2 left-2">
                    <Badge className="font-mono text-[9px] bg-black/70 text-white border-0">
                        FOR {(property.listing_type === 'rental' ? 'RENT' : property.listing_type).toUpperCase()}
                    </Badge>
                </div>
                {/* Deal count indicator */}
                {(property.active_deals ?? 0) > 0 && (
                    <div className="absolute bottom-2 left-2">
                        <Badge className="font-mono text-[9px] bg-amber-500 text-black border-0">
                            {property.active_deals} ACTIVE DEAL{(property.active_deals ?? 0) > 1 ? 'S' : ''}
                        </Badge>
                    </div>
                )}
            </div>

            {/* Property Info */}
            <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="font-mono text-sm text-white font-medium truncate flex-1 group-hover:text-amber-500 transition-colors">
                        {property.property_name}
                    </h3>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-4 w-4 text-zinc-500" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                            <DropdownMenuItem asChild className="text-zinc-300 hover:text-white">
                                <Link href={`/dashboard/deals/properties/${property.id}`}>
                                    <Eye className="h-4 w-4 mr-2" /> View Details
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="text-zinc-300 hover:text-white">
                                <Link href={`/dashboard/deals/properties/${property.id}?edit=true`}>
                                    <Edit className="h-4 w-4 mr-2" /> Edit Property
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); onViewDeals(property.id) }}
                                className="text-zinc-300 hover:text-white"
                            >
                                <FileText className="h-4 w-4 mr-2" /> View Deals
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-zinc-800" />
                            <DropdownMenuItem asChild className="text-amber-500 hover:text-amber-400">
                                <Link href={`/dashboard/deals/new?propertyId=${property.id}`}>
                                    <Plus className="h-4 w-4 mr-2" /> Create Deal
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-1 text-zinc-500 mb-3">
                    <MapPin className="h-3 w-3" />
                    <span className="font-mono text-[10px] truncate">
                        {property.city}, {property.region?.replace('_', ' ')}
                    </span>
                </div>

                <div className="flex items-baseline gap-1 mb-3">
                    <span className="font-mono text-lg text-amber-500 font-bold">
                        {formatCurrency(property.price, property.currency)}
                    </span>
                    {(property.listing_type === 'rent' || property.listing_type === 'rental') && (
                        <span className="font-mono text-[10px] text-zinc-500">/month</span>
                    )}
                </div>

                {/* Property specs */}
                <div className="flex items-center gap-4 text-zinc-400 mb-3">
                    {property.bedrooms && (
                        <span className="font-mono text-[10px]">{property.bedrooms} BED</span>
                    )}
                    {property.bathrooms && (
                        <span className="font-mono text-[10px]">{property.bathrooms} BATH</span>
                    )}
                    {property.area_sqm && (
                        <span className="font-mono text-[10px]">{Number(property.area_sqm).toLocaleString()} SQM</span>
                    )}
                </div>

                {/* Owner info */}
                {property.owner_name && (
                    <div className="pt-3 border-t border-zinc-800 flex items-center gap-2 mb-3">
                        <Users className="h-3 w-3 text-zinc-500" />
                        <span className="font-mono text-[10px] text-zinc-400">
                            Owner: {property.owner_name}
                        </span>
                    </div>
                )}

                {/* Pipeline Stage Indicator */}
                {property.current_stage_name && (
                    <div className="pt-3 border-t border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[9px] text-zinc-500">PIPELINE STAGE</span>
                            <span className="font-mono text-[9px] text-zinc-500">
                                {property.current_stage_order}/{property.total_stages}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div 
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: property.current_stage_color || '#F59E0B' }}
                            />
                            <span className="font-mono text-xs text-white font-medium truncate">
                                {property.current_stage_name}
                            </span>
                            {property.days_in_stage !== undefined && property.days_in_stage > 0 && (
                                <span className="font-mono text-[9px] text-zinc-500 ml-auto">
                                    {property.days_in_stage}d
                                </span>
                            )}
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
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

                {/* Quick action - removed as card is now clickable */}
            </div>
        </div>
    )
}

export default function CRMPropertiesPage() {
    const [properties, setProperties] = useState<CRMProperty[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
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

            const response = await fetch(`${API_BASE}/crm/properties?${params}`)
            if (!response.ok) {
                // Fallback to property management if CRM properties not available
                const pmResponse = await fetch(`${API_BASE}/property-management/properties?${params}`)
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-xl text-white">Properties</h1>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">
                        MANAGE CLIENT PROPERTIES AND TRACK DEAL PROGRESS
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/deals/properties/submit">
                        <Button className="bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs">
                            <Plus className="h-4 w-4 mr-2" />
                            SUBMIT PROPERTY
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL PROPERTIES</div>
                    <div className="font-mono text-2xl text-white">{stats.total}</div>
                </div>
                <div className="border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">AVAILABLE</div>
                    <div className="font-mono text-2xl text-green-400">{stats.available}</div>
                </div>
                <div className="border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">UNDER OFFER</div>
                    <div className="font-mono text-2xl text-amber-400">{stats.under_offer}</div>
                </div>
                <div className="border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">WITH ACTIVE DEALS</div>
                    <div className="font-mono text-2xl text-blue-400">{stats.with_active_deals}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Search properties..."
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="pl-10 bg-zinc-900 border-zinc-800 text-white font-mono text-xs"
                    />
                </div>
                
                <Select
                    value={filters.listing_type}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, listing_type: v }))}
                >
                    <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300 font-mono text-xs">
                        <SelectValue placeholder="Listing Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="font-mono text-xs">All Types</SelectItem>
                        <SelectItem value="sale" className="font-mono text-xs">For Sale</SelectItem>
                        <SelectItem value="rent" className="font-mono text-xs">For Rent</SelectItem>
                        <SelectItem value="lease" className="font-mono text-xs">For Lease</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.property_type}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, property_type: v }))}
                >
                    <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300 font-mono text-xs">
                        <SelectValue placeholder="Property Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="font-mono text-xs">All Properties</SelectItem>
                        <SelectItem value="house" className="font-mono text-xs">House</SelectItem>
                        <SelectItem value="apartment" className="font-mono text-xs">Apartment</SelectItem>
                        <SelectItem value="land" className="font-mono text-xs">Land</SelectItem>
                        <SelectItem value="commercial" className="font-mono text-xs">Commercial</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.status}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}
                >
                    <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300 font-mono text-xs">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="font-mono text-xs">All Status</SelectItem>
                        <SelectItem value="available" className="font-mono text-xs">Available</SelectItem>
                        <SelectItem value="under_offer" className="font-mono text-xs">Under Offer</SelectItem>
                        <SelectItem value="reserved" className="font-mono text-xs">Reserved</SelectItem>
                        <SelectItem value="sold" className="font-mono text-xs">Sold</SelectItem>
                        <SelectItem value="rented" className="font-mono text-xs">Rented</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.region}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, region: v }))}
                >
                    <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800 text-zinc-300 font-mono text-xs">
                        <SelectValue placeholder="Region" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="font-mono text-xs">All Regions</SelectItem>
                        <SelectItem value="Greater Accra" className="font-mono text-xs">Greater Accra</SelectItem>
                        <SelectItem value="Ashanti" className="font-mono text-xs">Ashanti</SelectItem>
                        <SelectItem value="Western" className="font-mono text-xs">Western</SelectItem>
                        <SelectItem value="Central" className="font-mono text-xs">Central</SelectItem>
                        <SelectItem value="Eastern" className="font-mono text-xs">Eastern</SelectItem>
                        <SelectItem value="Volta" className="font-mono text-xs">Volta</SelectItem>
                        <SelectItem value="Northern" className="font-mono text-xs">Northern</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <p className="font-mono text-sm text-red-400 mb-4">{error}</p>
                    <Button 
                        onClick={loadProperties} 
                        variant="outline"
                        className="border-zinc-700 text-zinc-300"
                    >
                        Retry
                    </Button>
                </div>
            ) : properties.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border border-zinc-800 bg-zinc-900/30">
                    <Home className="h-12 w-12 text-zinc-600 mb-4" />
                    <h3 className="font-mono text-lg text-white mb-2">No Properties Found</h3>
                    <p className="font-mono text-[10px] text-zinc-500 mb-6">
                        {filters.search || filters.listing_type !== 'all' || filters.property_type !== 'all'
                            ? 'Try adjusting your filters'
                            : 'Start by submitting a client property'}
                    </p>
                    <Link href="/dashboard/deals/properties/submit">
                        <Button className="bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs">
                            <Plus className="h-4 w-4 mr-2" />
                            SUBMIT PROPERTY
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {properties.map(property => (
                        <PropertyCard 
                            key={property.id} 
                            property={property}
                            onViewDeals={handleViewDeals}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
