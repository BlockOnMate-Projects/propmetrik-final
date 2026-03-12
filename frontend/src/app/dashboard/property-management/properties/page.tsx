'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import {
    Building2, Search, Filter, Plus, Home, MapPin, Loader2, BedDouble, Bath, Square,
    MoreVertical, Eye, Edit, Trash2, X, CheckCircle, AlertCircle, Warehouse, DollarSign, SlidersHorizontal
} from 'lucide-react'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Property } from '@/types/property-management'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TYPE_LABELS: Record<string, string> = {
    'residential_house': 'Residential', 'apartment_flat': 'Apartment', 'commercial_office': 'Commercial',
    'industrial': 'Industrial', 'land': 'Land', 'mixed_use': 'Mixed Use'
}

export default function PropertiesPage() {
    const [properties, setProperties] = useState<Property[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [showFilterSheet, setShowFilterSheet] = useState(false)
    const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    useEffect(() => { loadProperties() }, [])

    const loadProperties = async () => {
        try {
            setIsLoading(true)
            const response = await propertyManagementApi.getProperties({ limit: 100 })
            const data = Array.isArray(response) ? response : response.data || []
            setProperties(data)
        } catch (err) {
            console.error('Failed to load properties:', err)
            setError('Failed to load properties. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const filteredProperties = useMemo(() => {
        return properties.filter(property => {
            const searchMatch = searchTerm === '' ||
                property.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                property.addressCity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                property.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase())
            const statusMatch = statusFilter === 'all' || property.status === statusFilter
            const typeMatch = typeFilter === 'all' || property.propertyType === typeFilter
            return searchMatch && statusMatch && typeMatch
        })
    }, [properties, searchTerm, statusFilter, typeFilter])

    const handleDeleteProperty = async () => {
        if (!propertyToDelete) return
        setIsDeleting(true)
        try {
            await propertyManagementApi.deleteProperty(propertyToDelete.id)
            setShowDeleteDialog(false)
            setPropertyToDelete(null)
            setSuccessMessage('Property deleted successfully!')
            setTimeout(() => setSuccessMessage(null), 3000)
            loadProperties()
        } catch (err) {
            console.error('Failed to delete property:', err)
            setError('Failed to delete property. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); setTypeFilter('all') }
    const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all'

    const totalProperties = properties.length
    const residentialCount = properties.filter(p => p.propertyType === 'residential_house' || p.propertyType === 'apartment_flat').length
    const commercialCount = properties.filter(p => p.propertyType === 'commercial_office' || p.propertyType === 'industrial').length
    const activeCount = properties.filter(p => p.status === 'active').length
    const totalValue = properties.reduce((sum, p) => sum + (p.price || 0), 0)

    const formatCurrency = (val: number, currency: string = 'GHS') => {
        return new Intl.NumberFormat('en-GH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val)
    }

    return (
        <div className="space-y-6">
            {successMessage && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span className="text-emerald-400 font-mono text-sm">{successMessage}</span>
                </div>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-5 w-5 text-primary" />
                        <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono uppercase">Property Assets</h1>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className={`border-border hover:text-primary hover:border-primary/50 bg-card font-mono text-xs uppercase ${hasActiveFilters ? 'text-primary border-primary' : 'text-muted-foreground'}`} onClick={() => setShowFilterSheet(true)}>
                        <SlidersHorizontal className="mr-2 h-3 w-3" />Filter
                        {hasActiveFilters && <Badge className="ml-2 bg-primary text-primary-foreground text-[9px] h-4 px-1">Active</Badge>}
                    </Button>
                    <Link href="/dashboard/property-management/properties/new">
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold font-mono text-xs uppercase"><Plus className="mr-2 h-3 w-3" />Add Property</Button>
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                <Card className="bg-card border-border"><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-mono text-muted-foreground uppercase">Total Assets</p><h2 className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : totalProperties}</h2></div><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-primary" /></div></div></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-mono text-muted-foreground uppercase">Residential</p><h2 className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : residentialCount}</h2></div><div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center"><Home className="h-5 w-5 text-sky-500" /></div></div></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-mono text-muted-foreground uppercase">Commercial</p><h2 className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : commercialCount}</h2></div><div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-violet-500" /></div></div></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-mono text-muted-foreground uppercase">Active</p><h2 className="text-2xl font-bold text-emerald-500 font-mono">{isLoading ? '-' : activeCount}</h2></div><div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-500" /></div></div></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-mono text-muted-foreground uppercase">Total Value</p><h2 className="text-lg font-bold text-primary font-mono">{isLoading ? '-' : formatCurrency(totalValue)}</h2></div><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-primary" /></div></div></CardContent></Card>
            </div>

            <Card className="bg-card border-border">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <CardTitle className="text-sm font-mono uppercase text-primary">Asset Registry</CardTitle>
                            {hasActiveFilters && <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary h-6 px-2" onClick={clearFilters}><X className="h-3 w-3 mr-1" />Clear filters</Button>}
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input placeholder="Search properties..." className="pl-9 bg-background border-border text-foreground focus:border-primary font-mono text-xs h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            {searchTerm && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchTerm('')}><X className="h-3 w-3" /></button>}
                        </div>
                    </div>
                    {(searchTerm || hasActiveFilters) && <p className="text-[10px] text-zinc-500 font-mono mt-2">Showing {filteredProperties.length} of {properties.length} properties</p>}
                </CardHeader>
                <CardContent>
                    {error && <div className="text-red-500 text-sm font-mono mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-amber-600 animate-spin" /></div>
                    ) : (
                        <div className="space-y-3">
                            {filteredProperties.map((property) => (
                                <div key={property.id} className="p-4 border border-border bg-card/30 rounded-lg hover:bg-card transition-colors group">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <Link href={`/dashboard/property-management/properties/${property.id}`} className="flex flex-1 items-start gap-4 cursor-pointer">
                                            <div className="h-14 w-14 bg-secondary rounded-lg border border-border flex items-center justify-center text-muted-foreground group-hover:border-primary/50 group-hover:bg-primary/10 transition-colors flex-shrink-0">
                                                <Building2 className="h-6 w-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-foreground font-mono group-hover:text-primary transition-colors truncate">{property.title}</h3>
                                                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground flex-shrink-0">{TYPE_LABELS[property.propertyType] || property.propertyType}</Badge>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                                    <span className="truncate">{property.addressCity}, {property.region?.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                                                    {property.bedrooms && <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" /> {property.bedrooms} Beds</span>}
                                                    {property.bathrooms && <span className="flex items-center gap-1"><Bath className="h-3 w-3" /> {property.bathrooms} Baths</span>}
                                                    {property.totalAreaSqm && <span className="flex items-center gap-1"><Square className="h-3 w-3" /> {property.totalAreaSqm} m²</span>}
                                                </div>
                                            </div>
                                        </Link>
                                        <div className="flex items-center gap-3 ml-auto">
                                            <div className="text-right mr-2">
                                                <p className="text-sm font-bold text-primary font-mono">{formatCurrency(property.price, property.priceCurrency || 'GHS')}</p>
                                                <p className="text-[9px] text-muted-foreground font-mono">{property.referenceNumber}</p>
                                            </div>
                                            <Badge variant="outline" className={`text-[10px] font-mono uppercase ${property.status === 'active' ? 'border-emerald-900 text-emerald-500 bg-emerald-900/10' : property.status === 'vacant' ? 'border-primary/50 text-primary bg-primary/10' : property.status === 'maintenance' ? 'border-destructive/50 text-destructive bg-destructive/10' : 'border-border text-muted-foreground'}`}>{property.status}</Badge>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="bg-card border-border text-foreground">
                                                    <DropdownMenuLabel className="text-xs font-mono uppercase text-muted-foreground">Actions</DropdownMenuLabel>
                                                    <Link href={`/dashboard/property-management/properties/${property.id}`}><DropdownMenuItem className="hover:bg-secondary focus:bg-secondary cursor-pointer text-xs font-mono"><Eye className="h-3 w-3 mr-2" />View Details</DropdownMenuItem></Link>
                                                    <Link href={`/dashboard/property-management/properties/${property.id}/edit`}><DropdownMenuItem className="hover:bg-secondary focus:bg-secondary cursor-pointer text-xs font-mono"><Edit className="h-3 w-3 mr-2" />Edit Property</DropdownMenuItem></Link>
                                                    <DropdownMenuSeparator className="bg-border" />
                                                    <DropdownMenuItem className="text-destructive hover:bg-secondary focus:bg-secondary cursor-pointer text-xs font-mono" onClick={() => { setPropertyToDelete(property); setShowDeleteDialog(true) }}><Trash2 className="h-3 w-3 mr-2" />Delete Property</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {filteredProperties.length === 0 && (
                                <div className="text-center py-12 border border-dashed border-border rounded-lg">
                                    <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <p className="text-muted-foreground font-mono text-sm mb-2">{searchTerm || hasActiveFilters ? 'No properties match your criteria' : 'No properties found'}</p>
                                    {(searchTerm || hasActiveFilters) ? <Button variant="outline" size="sm" className="border-border text-muted-foreground hover:text-primary font-mono text-xs mt-2" onClick={clearFilters}>Clear filters</Button> : <Link href="/dashboard/property-management/properties/new"><Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs mt-2"><Plus className="h-3 w-3 mr-1" />Add First Property</Button></Link>}
                                </div>
                            )}
                        </div>
                    )}
                    {filteredProperties.length > 0 && (
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-800">
                            <p className="text-[10px] font-mono text-zinc-500">Showing {filteredProperties.length} of {properties.length} properties</p>
                            <p className="text-[10px] font-mono text-zinc-500">Total Value: <span className="text-amber-500 font-bold">{formatCurrency(filteredProperties.reduce((sum, p) => sum + (p.price || 0), 0))}</span></p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-mono uppercase text-red-500 flex items-center gap-2"><AlertCircle className="h-5 w-5" />Delete Property</DialogTitle>
                        <DialogDescription className="text-zinc-400 font-mono text-xs">Are you sure you want to delete <span className="text-white font-bold">{propertyToDelete?.title}</span>? This will permanently remove the property and all associated data.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" className="border-zinc-700 text-zinc-400 hover:text-white font-mono text-xs" onClick={() => { setShowDeleteDialog(false); setPropertyToDelete(null) }}>Cancel</Button>
                        <Button variant="destructive" className="bg-red-600 hover:bg-red-500 font-mono text-xs" onClick={handleDeleteProperty} disabled={isDeleting}>{isDeleting ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Deleting...</> : <><Trash2 className="h-3 w-3 mr-2" />Delete Property</>}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
                <SheetContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SheetHeader>
                        <SheetTitle className="font-mono uppercase text-amber-500">Filter Properties</SheetTitle>
                        <SheetDescription className="text-zinc-500 font-mono text-xs">Narrow down your property list by status or type.</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-6 py-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-zinc-400">Status</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
                                <SelectContent className="bg-black border-zinc-800">
                                    <SelectItem value="all" className="text-zinc-300 font-mono text-xs">All statuses</SelectItem>
                                    <SelectItem value="active" className="text-zinc-300 font-mono text-xs">Active</SelectItem>
                                    <SelectItem value="vacant" className="text-zinc-300 font-mono text-xs">Vacant</SelectItem>
                                    <SelectItem value="maintenance" className="text-zinc-300 font-mono text-xs">Maintenance</SelectItem>
                                    <SelectItem value="inactive" className="text-zinc-300 font-mono text-xs">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-zinc-400">Property Type</Label>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                                <SelectContent className="bg-black border-zinc-800">
                                    <SelectItem value="all" className="text-zinc-300 font-mono text-xs">All types</SelectItem>
                                    <SelectItem value="residential_house" className="text-zinc-300 font-mono text-xs">Residential House</SelectItem>
                                    <SelectItem value="apartment_flat" className="text-zinc-300 font-mono text-xs">Apartment / Flat</SelectItem>
                                    <SelectItem value="commercial_office" className="text-zinc-300 font-mono text-xs">Commercial Office</SelectItem>
                                    <SelectItem value="industrial" className="text-zinc-300 font-mono text-xs">Industrial</SelectItem>
                                    <SelectItem value="land" className="text-zinc-300 font-mono text-xs">Land</SelectItem>
                                    <SelectItem value="mixed_use" className="text-zinc-300 font-mono text-xs">Mixed Use</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="pt-4 flex gap-2">
                            <Button variant="outline" className="flex-1 border-zinc-700 text-zinc-400 hover:text-white font-mono text-xs" onClick={() => { clearFilters(); setShowFilterSheet(false) }}>Clear Filters</Button>
                            <Button className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold font-mono text-xs" onClick={() => setShowFilterSheet(false)}>Apply Filters</Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
