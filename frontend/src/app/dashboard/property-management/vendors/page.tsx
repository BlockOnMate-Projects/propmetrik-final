
'use client'

import React, { useEffect, useState, useMemo } from 'react'
import {
    Users,
    Search,
    Filter,
    MoreVertical,
    Plus,
    Star,
    Phone,
    Wrench,
    Hammer,
    ShieldCheck,
    Zap,
    Droplets,
    Paintbrush,
    Loader2,
    X,
    Mail,
    MapPin,
    Building2,
    FileText,
    Trash2,
    Eye,
    CheckCircle,
    AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Vendor, MaintenanceCategory, VendorStatus } from '@/types/property-management'

const getServiceIcon = (categories: MaintenanceCategory[] | undefined | null) => {
    // Just use the first category for the icon
    const cats = Array.isArray(categories) ? categories : [];
    const category = cats[0] || 'OTHER';
    switch (category) {
        case MaintenanceCategory.PLUMBING: return <Droplets className="h-4 w-4 text-blue-500" />;
        case MaintenanceCategory.ELECTRICAL: return <Zap className="h-4 w-4 text-yellow-500" />;
        case MaintenanceCategory.SECURITY: return <ShieldCheck className="h-4 w-4 text-green-500" />;
        case MaintenanceCategory.PAINTING: return <Paintbrush className="h-4 w-4 text-pink-500" />;
        default: return <Wrench className="h-4 w-4 text-muted-foreground" />;
    }
}

export default function VendorsPage() {
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Search and Filter
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [showFilterSheet, setShowFilterSheet] = useState(false)
    
    // Add Vendor Dialog
    const [showAddDialog, setShowAddDialog] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [newVendor, setNewVendor] = useState({
        businessName: '',
        contactPerson: '',
        email: '',
        phonePrimary: '',
        address: '',
        serviceCategories: [] as string[],
        notes: ''
    })
    
    // View Details Sheet
    const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
    const [showDetailsSheet, setShowDetailsSheet] = useState(false)
    
    // Delete Confirmation
    const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    
    // Success/Error Messages
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    useEffect(() => {
        loadVendors()
    }, [])
    
    const loadVendors = async () => {
        try {
            setIsLoading(true)
            const response = await propertyManagementApi.getVendors({ limit: 50 })
            const data = Array.isArray(response) ? response : response.data || []
            setVendors(data)
        } catch (err) {
            console.error('Failed to load vendors:', err)
            setError('Failed to load vendors. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }
    
    // Filter vendors based on search and filters
    const filteredVendors = useMemo(() => {
        return vendors.filter(vendor => {
            // Search filter
            const searchMatch = searchTerm === '' || 
                vendor.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                vendor.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                vendor.email?.toLowerCase().includes(searchTerm.toLowerCase())
            
            // Status filter
            const statusMatch = statusFilter === 'all' || vendor.status === statusFilter
            
            // Category filter
            const cats = Array.isArray(vendor.serviceCategories) ? vendor.serviceCategories : []
            const categoryMatch = categoryFilter === 'all' || cats.includes(categoryFilter as MaintenanceCategory)
            
            return searchMatch && statusMatch && categoryMatch
        })
    }, [vendors, searchTerm, statusFilter, categoryFilter])
    
    // Handle Add Vendor
    const handleAddVendor = async () => {
        if (!newVendor.businessName || !newVendor.contactPerson || !newVendor.phonePrimary) {
            setError('Please fill in all required fields')
            return
        }
        
        setIsSubmitting(true)
        try {
            await propertyManagementApi.createVendor({
                businessName: newVendor.businessName,
                contactPerson: newVendor.contactPerson,
                email: newVendor.email,
                phonePrimary: newVendor.phonePrimary,
                address: newVendor.address,
                serviceCategories: newVendor.serviceCategories as MaintenanceCategory[],
                notes: newVendor.notes,
                status: VendorStatus.ACTIVE
            })
            
            setShowAddDialog(false)
            setNewVendor({
                businessName: '',
                contactPerson: '',
                email: '',
                phonePrimary: '',
                address: '',
                serviceCategories: [],
                notes: ''
            })
            setSuccessMessage('Vendor added successfully!')
            setTimeout(() => setSuccessMessage(null), 3000)
            loadVendors()
        } catch (err) {
            console.error('Failed to add vendor:', err)
            setError('Failed to add vendor. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }
    
    // Handle Delete Vendor
    const handleDeleteVendor = async () => {
        if (!vendorToDelete) return
        
        setIsDeleting(true)
        try {
            await propertyManagementApi.deleteVendor(vendorToDelete.id)
            setShowDeleteDialog(false)
            setVendorToDelete(null)
            setSuccessMessage('Vendor removed successfully!')
            setTimeout(() => setSuccessMessage(null), 3000)
            loadVendors()
        } catch (err) {
            console.error('Failed to delete vendor:', err)
            setError('Failed to remove vendor. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }
    
    // View Vendor Details
    const handleViewDetails = (vendor: Vendor) => {
        setSelectedVendor(vendor)
        setShowDetailsSheet(true)
    }
    
    // Clear Filters
    const clearFilters = () => {
        setSearchTerm('')
        setStatusFilter('all')
        setCategoryFilter('all')
    }
    
    const hasActiveFilters = statusFilter !== 'all' || categoryFilter !== 'all'

    // Calculating stats from loaded data
    const totalVendors = vendors.length
    const preferredVendors = vendors.filter(v => v.status === 'active').length
    const totalJobs = vendors.reduce((acc, curr) => acc + (curr.totalJobsCompleted || 0), 0)
    const avgRating = vendors.length > 0
        ? (vendors.reduce((acc, curr) => acc + (curr.averageRating || 0), 0) / vendors.length).toFixed(1)
        : '0.0'
    
    // Get unique categories from all vendors
    const allCategories = useMemo(() => {
        const cats = new Set<string>()
        vendors.forEach(v => {
            const vCats = Array.isArray(v.serviceCategories) ? v.serviceCategories : []
            vCats.forEach(c => cats.add(c))
        })
        return Array.from(cats)
    }, [vendors])

    return (
        <div className="space-y-6">
            {/* Success Message */}
            {successMessage && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">{successMessage}</span>
                </div>
            )}
            
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">VENDOR DIRECTORY</h1>
                    <p className="text-sm text-muted-foreground font-mono">Manage service providers and contractors</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        className={`border-border hover:text-amber-500 hover:border-amber-900 bg-card font-mono text-xs uppercase ${hasActiveFilters ? 'text-amber-500 border-amber-900' : 'text-muted-foreground'}`}
                        onClick={() => setShowFilterSheet(true)}
                    >
                        <Filter className="mr-2 h-3 w-3" />
                        Filter
                        {hasActiveFilters && <Badge className="ml-2 bg-amber-600 text-foreground text-[9px] h-4 px-1">Active</Badge>}
                    </Button>
                    <Button 
                        className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-xs uppercase"
                        onClick={() => setShowAddDialog(true)}
                    >
                        <Plus className="mr-2 h-3 w-3" />
                        Add Vendor
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Vendors</CardTitle>
                        <Users className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : totalVendors}</div>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Active</CardTitle>
                        <Star className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : preferredVendors}</div>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Jobs Completed</CardTitle>
                        <Hammer className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : totalJobs}</div>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Avg Rating</CardTitle>
                        <Star className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : avgRating}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Table Card */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Vendor List</CardTitle>
                            {hasActiveFilters && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-xs text-muted-foreground hover:text-amber-500 h-6 px-2"
                                    onClick={clearFilters}
                                >
                                    <X className="h-3 w-3 mr-1" />
                                    Clear filters
                                </Button>
                            )}
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                            <Input 
                                placeholder="SEARCH VENDORS..." 
                                className="pl-8 bg-background border-border text-muted-foreground focus:border-amber-500 font-mono text-xs uppercase h-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button 
                                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                                    onClick={() => setSearchTerm('')}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    </div>
                    {(searchTerm || hasActiveFilters) && (
                        <p className="text-[10px] text-muted-foreground font-mono mt-2">
                            Showing {filteredVendors.length} of {vendors.length} vendors
                        </p>
                    )}
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="text-red-500 text-sm font-mono mb-4 text-center">{error}</div>
                    )}

                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-card/50">
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Business</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Contact</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Categories</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Status</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase text-right">Rating</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase text-right">Total Jobs</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredVendors.length === 0 ? (
                                    <TableRow className="border-border">
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <div className="flex flex-col items-center gap-3">
                                                <Users className="h-8 w-8 text-zinc-700" />
                                                <p className="text-muted-foreground font-mono text-sm">
                                                    {searchTerm || hasActiveFilters ? 'No vendors match your search criteria' : 'No vendors found'}
                                                </p>
                                                {(searchTerm || hasActiveFilters) && (
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="border-border text-muted-foreground hover:text-amber-500 font-mono text-xs"
                                                        onClick={clearFilters}
                                                    >
                                                        Clear filters
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredVendors.map((vendor) => (
                                        <TableRow key={vendor.id} className="border-border hover:bg-card/50 group">
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-8 w-8 rounded bg-background border border-border flex items-center justify-center shrink-0">
                                                        {getServiceIcon(vendor.serviceCategories)}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-zinc-200 text-xs font-mono uppercase">{vendor.businessName}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">{vendor.id}</div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                                        <Users className="h-3 w-3" /> {vendor.contactPerson}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                                        <Phone className="h-3 w-3" /> {vendor.phonePrimary}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {(Array.isArray(vendor.serviceCategories) ? vendor.serviceCategories : []).map((cat, i) => (
                                                        <Badge key={i} variant="outline" className="border-border text-muted-foreground text-[10px] font-mono">
                                                            {cat}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={`
                            text-[10px] font-mono
                            ${vendor.status === 'active' ? 'border-green-900 text-green-500 bg-green-100 dark:bg-green-900/10' : ''}
                            ${vendor.status === 'inactive' ? 'border-border text-muted-foreground bg-muted/20' : ''}
                            ${vendor.status === 'suspended' ? 'border-red-900 text-red-500 bg-red-100 dark:bg-red-900/10' : ''}
                            ${vendor.status === 'pending_verification' ? 'border-amber-900 text-amber-500 bg-amber-100 dark:bg-amber-900/10' : ''}
                          `}
                                                >
                                                    {vendor.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1 text-amber-500">
                                                    <span className="text-xs font-mono font-bold">{vendor.averageRating}</span>
                                                    <Star className="h-3 w-3 fill-amber-500" />
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="text-xs text-muted-foreground font-mono">{vendor.totalJobsCompleted}</div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreVertical className="h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="bg-background border-border text-muted-foreground">
                                                        <DropdownMenuLabel className="text-xs font-mono uppercase text-muted-foreground">Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem 
                                                            className="hover:bg-card focus:bg-card cursor-pointer text-xs font-mono"
                                                            onClick={() => handleViewDetails(vendor)}
                                                        >
                                                            <Eye className="h-3 w-3 mr-2" />
                                                            View details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem 
                                                            className="hover:bg-card focus:bg-card cursor-pointer text-xs font-mono"
                                                            onClick={() => handleViewDetails(vendor)}
                                                        >
                                                            <FileText className="h-3 w-3 mr-2" />
                                                            View Invoices
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-muted" />
                                                        <DropdownMenuItem 
                                                            className="text-red-500 hover:bg-card focus:bg-card cursor-pointer text-xs font-mono"
                                                            onClick={() => {
                                                                setVendorToDelete(vendor)
                                                                setShowDeleteDialog(true)
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3 mr-2" />
                                                            Remove Vendor
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
            
            {/* Add Vendor Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="bg-card border-border text-foreground max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-mono uppercase text-amber-500">Add New Vendor</DialogTitle>
                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                            Add a new service provider or contractor to your vendor directory.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-muted-foreground">Business Name *</Label>
                                <Input
                                    placeholder="Enter business name"
                                    className="bg-background border-border text-foreground font-mono text-xs"
                                    value={newVendor.businessName}
                                    onChange={(e) => setNewVendor({ ...newVendor, businessName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-muted-foreground">Contact Person *</Label>
                                <Input
                                    placeholder="Full name"
                                    className="bg-background border-border text-foreground font-mono text-xs"
                                    value={newVendor.contactPerson}
                                    onChange={(e) => setNewVendor({ ...newVendor, contactPerson: e.target.value })}
                                />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-muted-foreground">Email</Label>
                                <Input
                                    type="email"
                                    placeholder="email@example.com"
                                    className="bg-background border-border text-foreground font-mono text-xs"
                                    value={newVendor.email}
                                    onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-muted-foreground">Phone Number *</Label>
                                <Input
                                    placeholder="+233 XX XXX XXXX"
                                    className="bg-background border-border text-foreground font-mono text-xs"
                                    value={newVendor.phonePrimary}
                                    onChange={(e) => setNewVendor({ ...newVendor, phonePrimary: e.target.value })}
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-muted-foreground">Address</Label>
                            <Input
                                placeholder="Business address"
                                className="bg-background border-border text-foreground font-mono text-xs"
                                value={newVendor.address}
                                onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-muted-foreground">Service Categories</Label>
                            <div className="flex flex-wrap gap-2">
                                {Object.values(MaintenanceCategory).map((cat) => (
                                    <Badge
                                        key={cat}
                                        variant="outline"
                                        className={`cursor-pointer text-[10px] font-mono transition-colors ${
                                            newVendor.serviceCategories.includes(cat)
                                                ? 'bg-amber-600 border-amber-600 text-foreground'
                                                : 'border-border text-muted-foreground hover:border-amber-600'
                                        }`}
                                        onClick={() => {
                                            const cats = newVendor.serviceCategories.includes(cat)
                                                ? newVendor.serviceCategories.filter(c => c !== cat)
                                                : [...newVendor.serviceCategories, cat]
                                            setNewVendor({ ...newVendor, serviceCategories: cats })
                                        }}
                                    >
                                        {cat}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-muted-foreground">Notes</Label>
                            <Textarea
                                placeholder="Additional notes about this vendor..."
                                className="bg-background border-border text-foreground font-mono text-xs min-h-[80px]"
                                value={newVendor.notes}
                                onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                            />
                        </div>
                    </div>
                    
                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                            onClick={() => setShowAddDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-xs"
                            onClick={handleAddVendor}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                <>
                                    <Plus className="h-3 w-3 mr-2" />
                                    Add Vendor
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent className="bg-card border-border text-foreground max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-mono uppercase text-red-500 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Remove Vendor
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                            Are you sure you want to remove <span className="text-foreground font-bold">{vendorToDelete?.businessName}</span> from your vendor directory? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <DialogFooter className="mt-4">
                        <Button
                            variant="outline"
                            className="border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                            onClick={() => {
                                setShowDeleteDialog(false)
                                setVendorToDelete(null)
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-500 font-mono text-xs"
                            onClick={handleDeleteVendor}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-3 w-3 mr-2" />
                                    Remove Vendor
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* Filter Sheet */}
            <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
                <SheetContent className="bg-card border-border text-foreground">
                    <SheetHeader>
                        <SheetTitle className="font-mono uppercase text-amber-500">Filter Vendors</SheetTitle>
                        <SheetDescription className="text-muted-foreground font-mono text-xs">
                            Narrow down your vendor list by status or service category.
                        </SheetDescription>
                    </SheetHeader>
                    
                    <div className="space-y-6 py-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-muted-foreground">Status</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="bg-background border-border text-foreground font-mono text-xs">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent className="bg-background border-border">
                                    <SelectItem value="all" className="text-muted-foreground font-mono text-xs">All statuses</SelectItem>
                                    <SelectItem value="active" className="text-muted-foreground font-mono text-xs">Active</SelectItem>
                                    <SelectItem value="inactive" className="text-muted-foreground font-mono text-xs">Inactive</SelectItem>
                                    <SelectItem value="suspended" className="text-muted-foreground font-mono text-xs">Suspended</SelectItem>
                                    <SelectItem value="pending_verification" className="text-muted-foreground font-mono text-xs">Pending Verification</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-muted-foreground">Service Category</Label>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="bg-background border-border text-foreground font-mono text-xs">
                                    <SelectValue placeholder="All categories" />
                                </SelectTrigger>
                                <SelectContent className="bg-background border-border">
                                    <SelectItem value="all" className="text-muted-foreground font-mono text-xs">All categories</SelectItem>
                                    {Object.values(MaintenanceCategory).map((cat) => (
                                        <SelectItem key={cat} value={cat} className="text-muted-foreground font-mono text-xs">
                                            {cat}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="pt-4 flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1 border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                onClick={() => {
                                    clearFilters()
                                    setShowFilterSheet(false)
                                }}
                            >
                                Clear Filters
                            </Button>
                            <Button
                                className="flex-1 bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-xs"
                                onClick={() => setShowFilterSheet(false)}
                            >
                                Apply Filters
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
            
            {/* Vendor Details Sheet */}
            <Sheet open={showDetailsSheet} onOpenChange={setShowDetailsSheet}>
                <SheetContent className="bg-card border-border text-foreground w-[500px] sm:max-w-[500px]">
                    <SheetHeader>
                        <SheetTitle className="font-mono uppercase text-amber-500 flex items-center gap-2">
                            {selectedVendor && getServiceIcon(selectedVendor.serviceCategories)}
                            {selectedVendor?.businessName}
                        </SheetTitle>
                        <SheetDescription className="text-muted-foreground font-mono text-xs">
                            Vendor details and performance metrics
                        </SheetDescription>
                    </SheetHeader>
                    
                    {selectedVendor && (
                        <div className="space-y-6 py-6">
                            {/* Status Badge */}
                            <div className="flex items-center gap-2">
                                <Badge
                                    variant="outline"
                                    className={`text-xs font-mono ${
                                        selectedVendor.status === 'active' ? 'border-green-900 text-green-500 bg-green-100 dark:bg-green-900/10' :
                                        selectedVendor.status === 'inactive' ? 'border-border text-muted-foreground bg-muted/20' :
                                        selectedVendor.status === 'suspended' ? 'border-red-900 text-red-500 bg-red-100 dark:bg-red-900/10' :
                                        'border-amber-900 text-amber-500 bg-amber-100 dark:bg-amber-900/10'
                                    }`}
                                >
                                    {selectedVendor.status}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-mono">ID: {selectedVendor.id}</span>
                            </div>
                            
                            {/* Contact Information */}
                            <div className="space-y-3 p-4 bg-background/40 rounded-lg border border-border">
                                <h4 className="text-xs font-mono uppercase text-muted-foreground">Contact Information</h4>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{selectedVendor.contactPerson}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{selectedVendor.phonePrimary}</span>
                                    </div>
                                    {selectedVendor.email && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">{selectedVendor.email}</span>
                                        </div>
                                    )}
                                    {selectedVendor.address && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">{selectedVendor.address}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Service Categories */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-mono uppercase text-muted-foreground">Service Categories</h4>
                                <div className="flex flex-wrap gap-2">
                                    {(Array.isArray(selectedVendor.serviceCategories) ? selectedVendor.serviceCategories : []).map((cat, i) => (
                                        <Badge key={i} variant="outline" className="border-amber-900/50 text-amber-500 text-xs font-mono">
                                            {cat}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Performance Metrics */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-background/40 rounded-lg border border-border text-center">
                                    <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
                                        <Star className="h-4 w-4 fill-amber-500" />
                                        <span className="text-xl font-bold font-mono">{selectedVendor.averageRating || 0}</span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Avg Rating</p>
                                </div>
                                <div className="p-4 bg-background/40 rounded-lg border border-border text-center">
                                    <span className="text-xl font-bold font-mono text-foreground">{selectedVendor.totalJobsCompleted || 0}</span>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Jobs Completed</p>
                                </div>
                            </div>
                            
                            {/* Notes */}
                            {selectedVendor.notes && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-mono uppercase text-muted-foreground">Notes</h4>
                                    <p className="text-sm text-muted-foreground font-mono">{selectedVendor.notes}</p>
                                </div>
                            )}
                            
                            {/* Actions */}
                            <div className="pt-4 flex gap-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                    onClick={() => setShowDetailsSheet(false)}
                                >
                                    Close
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-foreground border border-red-900 font-mono text-xs"
                                    onClick={() => {
                                        setShowDetailsSheet(false)
                                        setVendorToDelete(selectedVendor)
                                        setShowDeleteDialog(true)
                                    }}
                                >
                                    <Trash2 className="h-3 w-3 mr-2" />
                                    Remove
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}
