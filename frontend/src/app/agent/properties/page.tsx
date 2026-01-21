'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Building2,
    MapPin,
    Ruler,
    DollarSign,
    Search,
    Loader2,
    ExternalLink,
    ChevronRight,
    Home,
    Warehouse
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface Property {
    id: string
    property_name: string
    property_type: string
    address: string
    city: string
    region: string
    land_size_acres: number
    listing_price: number
    currency: string
    bedrooms: number
    bathrooms: number
    deal_id: string
    deal_title: string
}

function formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount)
}

function getPropertyIcon(type: string) {
    switch (type?.toLowerCase()) {
        case 'residential':
        case 'house':
            return <Home className="h-5 w-5" />
        case 'commercial':
        case 'office':
            return <Building2 className="h-5 w-5" />
        case 'industrial':
        case 'warehouse':
            return <Warehouse className="h-5 w-5" />
        default:
            return <Building2 className="h-5 w-5" />
    }
}

export default function AgentPropertiesPage() {
    const router = useRouter()
    const [properties, setProperties] = useState<Property[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [propertyTypeFilter, setPropertyTypeFilter] = useState('')

    useEffect(() => {
        const loadProperties = async () => {
            try {
                const storedContext = localStorage.getItem('agentContext')
                if (!storedContext) {
                    router.push('/agent/login')
                    return
                }

                const context = JSON.parse(storedContext)
                
                // Fetch agent's deals to get property IDs
                const dealsRes = await fetch(`${API_BASE}/crm/deals?assigned_agent=${context.agentId}&limit=100`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Id': context.userId,
                        'X-Organization-Id': context.orgId
                    }
                })

                if (dealsRes.ok) {
                    const dealsResponse = await dealsRes.json()
                    const deals = dealsResponse.data || dealsResponse || []
                    
                    // Collect all unique property IDs from deals
                    const propertyIds = new Set<string>()
                    const dealMap = new Map<string, { id: string; title: string }>()
                    
                    if (Array.isArray(deals)) {
                        deals.forEach((deal: any) => {
                            if (deal.property_ids && Array.isArray(deal.property_ids)) {
                                deal.property_ids.forEach((propId: string) => {
                                    propertyIds.add(propId)
                                    if (!dealMap.has(propId)) {
                                        dealMap.set(propId, { id: deal.id, title: deal.title })
                                    }
                                })
                            }
                        })
                    }

                    // Fetch each property
                    const fetchedProperties: Property[] = []
                    for (const propId of Array.from(propertyIds)) {
                        try {
                            const propRes = await fetch(`${API_BASE}/crm/properties/${propId}`, {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-User-Id': context.userId,
                                    'X-Organization-Id': context.orgId
                                }
                            })
                            if (propRes.ok) {
                                const prop = await propRes.json()
                                const dealInfo = dealMap.get(propId)
                                fetchedProperties.push({
                                    id: prop.id,
                                    property_name: prop.property_name || prop.title || 'Unnamed Property',
                                    property_type: prop.property_type,
                                    address: prop.address,
                                    city: prop.city,
                                    region: prop.region,
                                    land_size_acres: prop.land_size_sqm ? prop.land_size_sqm / 4047 : 0,
                                    listing_price: prop.price || 0,
                                    currency: prop.currency || 'GHS',
                                    bedrooms: prop.bedrooms,
                                    bathrooms: prop.bathrooms,
                                    deal_id: dealInfo?.id || '',
                                    deal_title: dealInfo?.title || ''
                                })
                            }
                        } catch (err) {
                            console.error(`Failed to fetch property ${propId}:`, err)
                        }
                    }
                    
                    setProperties(fetchedProperties)
                }
            } catch (err) {
                console.error('Failed to load properties:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadProperties()
    }, [router])

    const filteredProperties = properties.filter(property => {
        const matchesSearch = !searchTerm || 
            property.property_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            property.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            property.city?.toLowerCase().includes(searchTerm.toLowerCase())
        
        const matchesType = !propertyTypeFilter || 
            property.property_type?.toLowerCase() === propertyTypeFilter.toLowerCase()
        
        return matchesSearch && matchesType
    })

    const propertyTypes = Array.from(new Set(properties.map(p => p.property_type).filter(Boolean)))

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
                    <h1 className="font-mono text-lg text-white">MY PROPERTIES</h1>
                    <p className="font-mono text-xs text-zinc-500">Properties linked to your deals</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Search properties..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-zinc-900 border-zinc-800 text-white font-mono text-xs"
                    />
                </div>
                <select
                    value={propertyTypeFilter}
                    onChange={(e) => setPropertyTypeFilter(e.target.value)}
                    className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-xs min-w-[150px]"
                >
                    <option value="">All Types</option>
                    {propertyTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">TOTAL PROPERTIES</div>
                    <div className="font-mono text-xl text-white">{properties.length}</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">TOTAL VALUE</div>
                    <div className="font-mono text-xl text-green-400">
                        {formatCurrency(properties.reduce((sum, p) => sum + (p.listing_price || 0), 0))}
                    </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">PROPERTY TYPES</div>
                    <div className="font-mono text-xl text-white">{propertyTypes.length}</div>
                </div>
            </div>

            {/* Property Grid */}
            {filteredProperties.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-zinc-700 rounded">
                    <Building2 className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                    <p className="font-mono text-sm text-zinc-500">No properties found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProperties.map((property) => (
                        <div 
                            key={property.id}
                            className="border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors"
                        >
                            {/* Property Header */}
                            <div className="p-4 border-b border-zinc-800">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="w-10 h-10 bg-amber-500/10 flex items-center justify-center text-amber-500">
                                        {getPropertyIcon(property.property_type)}
                                    </div>
                                    {property.property_type && (
                                        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400">
                                            {property.property_type.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-mono text-sm text-white truncate">{property.property_name}</h3>
                            </div>

                            {/* Property Details */}
                            <div className="p-4 space-y-2">
                                {property.address && (
                                    <div className="flex items-start gap-2">
                                        <MapPin className="h-3 w-3 text-zinc-500 mt-0.5" />
                                        <span className="font-mono text-[10px] text-zinc-400">
                                            {[property.address, property.city, property.region].filter(Boolean).join(', ')}
                                        </span>
                                    </div>
                                )}
                                {property.land_size_acres && (
                                    <div className="flex items-center gap-2">
                                        <Ruler className="h-3 w-3 text-zinc-500" />
                                        <span className="font-mono text-[10px] text-zinc-400">
                                            {property.land_size_acres} acres
                                        </span>
                                    </div>
                                )}
                                {property.listing_price && (
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-3 w-3 text-green-500" />
                                        <span className="font-mono text-sm text-green-400">
                                            {formatCurrency(property.listing_price, property.currency)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Linked Deal */}
                            <div className="px-4 pb-4">
                                <Link 
                                    href={`/agent/deals/${property.deal_id}`}
                                    className="flex items-center justify-between p-2 bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors group"
                                >
                                    <span className="font-mono text-[10px] text-zinc-400 truncate">
                                        {property.deal_title}
                                    </span>
                                    <ChevronRight className="h-3 w-3 text-zinc-500 group-hover:text-amber-500" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
