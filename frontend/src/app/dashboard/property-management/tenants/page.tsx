'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription
} from '@/components/ui/sheet'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import {
    Users,
    Search,
    Filter,
    Plus,
    Home,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Phone,
    Mail,
    MoreHorizontal,
    Eye,
    FileText,
    MessageSquare,
    Trash2,
    Clock,
    Building2,
    Calendar,
    CreditCard,
    UserCheck,
    UserX,
    Send,
    X,
    AlertTriangle
} from 'lucide-react'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Tenant, TenantStatus, Tenancy } from '@/types/property-management'
import { format } from 'date-fns'

export default function TenantsPage() {
    const router = useRouter()
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [tenancies, setTenancies] = useState<Tenancy[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Filter state
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [statusFilter, setStatusFilter] = useState<string>('all')

    // View details state
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [tenantTenancies, setTenantTenancies] = useState<Tenancy[]>([])
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)

    // Delete state
    const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Message dialog state
    const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false)
    const [messageRecipient, setMessageRecipient] = useState<Tenant | null>(null)
    const [messageContent, setMessageContent] = useState('')
    const [isSendingMessage, setIsSendingMessage] = useState(false)

    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true)
                const [tenantsRes, tenanciesRes] = await Promise.all([
                    propertyManagementApi.getTenants({ limit: 100 }),
                    propertyManagementApi.getTenancies({ limit: 100 })
                ])
                const tenantsData = Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || []
                const tenanciesData = Array.isArray(tenanciesRes) ? tenanciesRes : tenanciesRes.data || []
                setTenants(tenantsData)
                setTenancies(tenanciesData)
            } catch (err) {
                console.error('Failed to load tenants:', err)
                setError('Failed to load tenants. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [])

    // Filtered tenants
    const filteredTenants = useMemo(() => {
        return tenants.filter(tenant => {
            // Search filter
            const matchesSearch = searchQuery === '' ||
                tenant.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tenant.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tenant.phonePrimary?.includes(searchQuery)

            // Status filter
            const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter

            return matchesSearch && matchesStatus
        })
    }, [tenants, searchQuery, statusFilter])

    // Stats
    const stats = useMemo(() => {
        const activeTenants = tenants.filter(t => t.status === TenantStatus.ACTIVE).length
        const pendingTenants = tenants.filter(t => t.status === TenantStatus.PENDING_VERIFICATION).length
        const inactiveTenants = tenants.filter(t => t.status === TenantStatus.INACTIVE).length
        const activeTenancies = tenancies.filter(t => t.status === 'active').length
        const occupancyRate = tenancies.length > 0 ? Math.round((activeTenancies / tenancies.length) * 100) : 0

        return {
            total: tenants.length,
            active: activeTenants,
            pending: pendingTenants,
            inactive: inactiveTenants,
            occupancy: occupancyRate
        }
    }, [tenants, tenancies])

    // Get tenant's active tenancy
    const getTenantTenancy = (tenantId: string) => {
        return tenancies.find(t => t.tenantId === tenantId && t.status === 'active')
    }

    // Get initials from name
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
    }

    // View tenant details - navigate to tenant dashboard page
    const handleViewDetails = (tenant: Tenant) => {
        if (!tenant?.id) {
            console.error('Tenant ID is undefined', tenant)
            return
        }
        router.push(`/dashboard/property-management/tenants/${tenant.id}`)
    }

    // Delete tenant
    const handleDeleteTenant = async () => {
        if (!tenantToDelete) return

        try {
            setIsDeleting(true)
            await propertyManagementApi.deleteTenant(tenantToDelete.id)
            setTenants(prev => prev.filter(t => t.id !== tenantToDelete.id))
            setTenancies(prev => prev.filter(t => t.tenantId !== tenantToDelete.id))
            setTenantToDelete(null)
        } catch (err) {
            console.error('Failed to delete tenant:', err)
            setError(err instanceof Error ? err.message : 'Failed to delete tenant. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    // Send message
    const handleSendMessage = async () => {
        if (!messageRecipient || !messageContent.trim()) return

        try {
            setIsSendingMessage(true)
            // Implement message sending logic here
            // await propertyManagementApi.sendMessage(messageRecipient.id, messageContent)
            console.log('Sending message to:', messageRecipient.fullName, messageContent)
            setIsMessageDialogOpen(false)
            setMessageContent('')
            setMessageRecipient(null)
        } catch (err) {
            console.error('Failed to send message:', err)
        } finally {
            setIsSendingMessage(false)
        }
    }

    const openMessageDialog = (tenant: Tenant) => {
        setMessageRecipient(tenant)
        setIsMessageDialogOpen(true)
    }

    const clearFilters = () => {
        setStatusFilter('all')
        setSearchQuery('')
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'border-green-900 text-green-500 bg-green-100 dark:bg-green-900/10'
            case 'inactive': return 'border-border text-muted-foreground bg-muted/20'
            case 'pending_verification': return 'border-amber-900 text-amber-500 bg-amber-100 dark:bg-amber-900/10'
            case 'blacklisted': return 'border-red-900 text-red-500 bg-red-100 dark:bg-red-900/10'
            default: return 'border-border text-muted-foreground'
        }
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono uppercase">Tenant Directory</h1>
                    <p className="text-sm text-muted-foreground font-mono">Manage residential and commercial tenants across your portfolio</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="border-border text-muted-foreground hover:text-primary hover:border-primary/50 bg-background font-mono text-xs uppercase"
                        onClick={() => setIsFilterOpen(true)}
                    >
                        <Filter className="mr-2 h-3 w-3" />
                        Filter
                        {statusFilter !== 'all' && (
                            <Badge className="ml-2 bg-primary text-primary-foreground text-[9px]">1</Badge>
                        )}
                    </Button>
                    <Link href="/dashboard/property-management/tenants/new">
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold font-mono text-xs uppercase">
                            <Plus className="mr-2 h-3 w-3" />
                            Add Tenant
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-primary">Total Tenants</CardTitle>
                        <Users className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : stats.total}</div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-1">Across all properties</p>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-emerald-500">Active</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : stats.active}</div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-1">With active leases</p>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-primary">Pending</CardTitle>
                        <Clock className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : stats.pending}</div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-1">Awaiting verification</p>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Occupancy Rate</CardTitle>
                        <Home className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : `${stats.occupancy}%`}</div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-1">Portfolio occupancy</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tenant List */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-sm font-mono uppercase text-primary">Tenants</CardTitle>
                            <CardDescription className="text-xs font-mono text-muted-foreground mt-1">
                                {filteredTenants.length} of {tenants.length} tenants
                            </CardDescription>
                        </div>
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email, or phone..."
                                className="pl-9 bg-background border-border text-foreground focus:border-primary font-mono text-xs h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="p-4 bg-red-950/20 border border-red-900 rounded-lg mb-4">
                            <p className="text-red-500 text-sm font-mono">{error}</p>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <p className="text-muted-foreground font-mono text-xs mt-4 uppercase">Loading tenant registry...</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredTenants.map((tenant) => {
                                const activeTenancy = getTenantTenancy(tenant.id)

                                return (
                                    <div
                                        key={tenant.id}
                                        className="flex items-center justify-between p-4 border border-border bg-card/30 rounded-lg hover:bg-card hover:border-border transition-all group cursor-pointer"
                                        onClick={() => handleViewDetails(tenant)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-12 w-12 border-2 border-border group-hover:border-primary/50 transition-colors">
                                                <AvatarFallback className="bg-secondary text-primary font-mono font-bold text-sm">
                                                    {getInitials(tenant.fullName)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="space-y-1">
                                                <div className="font-medium text-foreground font-mono group-hover:text-primary transition-colors">
                                                    {tenant.fullName}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
                                                    {tenant.email && (
                                                        <span className="flex items-center gap-1.5">
                                                            <Mail className="h-3 w-3 text-muted-foreground" />
                                                            {tenant.email}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1.5">
                                                        <Phone className="h-3 w-3 text-muted-foreground" />
                                                        {tenant.phonePrimary}
                                                    </span>
                                                    {activeTenancy && (
                                                        <span className="flex items-center gap-1.5 text-primary">
                                                            <Building2 className="h-3 w-3" />
                                                            {activeTenancy.property?.title || 'Active Lease'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] font-mono uppercase ${getStatusColor(tenant.status)}`}
                                            >
                                                {tenant.status.replace('_', ' ')}
                                            </Badge>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-secondary"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="bg-card border-border w-48" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenuItem
                                                        className="text-foreground hover:bg-secondary focus:bg-secondary font-mono text-xs cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleViewDetails(tenant)
                                                        }}
                                                    >
                                                        <Eye className="h-3 w-3 mr-2" />
                                                        View Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-foreground hover:bg-secondary focus:bg-secondary font-mono text-xs cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            openMessageDialog(tenant)
                                                        }}
                                                    >
                                                        <MessageSquare className="h-3 w-3 mr-2" />
                                                        Send Message
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-border" />
                                                    {activeTenancy && (
                                                        <DropdownMenuItem
                                                            className="text-foreground hover:bg-secondary focus:bg-secondary font-mono text-xs cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                router.push(`/dashboard/property-management/leases/${activeTenancy.id}`)
                                                            }}
                                                        >
                                                            <FileText className="h-3 w-3 mr-2" />
                                                            View Lease
                                                        </DropdownMenuItem>
                                                    )}
                                                    {activeTenancy && (
                                                        <DropdownMenuItem
                                                            className="text-foreground hover:bg-secondary focus:bg-secondary font-mono text-xs cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                router.push(`/dashboard/property-management/leases/${activeTenancy.id}`)
                                                            }}
                                                        >
                                                            <Eye className="h-3 w-3 mr-2" />
                                                            View Lease
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem className="text-foreground hover:bg-secondary focus:bg-secondary font-mono text-xs cursor-pointer">
                                                        <CreditCard className="h-3 w-3 mr-2" />
                                                        Payment History
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-border" />
                                                    <DropdownMenuItem
                                                        className="text-destructive hover:text-destructive focus:text-destructive focus:bg-destructive/10 font-mono text-xs cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setTenantToDelete(tenant)
                                                        }}
                                                    >
                                                        <Trash2 className="h-3 w-3 mr-2" />
                                                        Remove Tenant
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                )
                            })}

                            {filteredTenants.length === 0 && !isLoading && (
                                <div className="text-center py-12 border border-dashed border-border rounded-lg">
                                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <p className="text-muted-foreground font-mono text-sm">No tenants found</p>
                                    {(searchQuery || statusFilter !== 'all') && (
                                        <Button
                                            variant="link"
                                            className="text-primary font-mono text-xs mt-2"
                                            onClick={clearFilters}
                                        >
                                            Clear filters
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Filter Sheet */}
            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <SheetContent className="bg-card border-border w-80">
                    <SheetHeader>
                        <SheetTitle className="text-primary font-mono uppercase">Filter Tenants</SheetTitle>
                        <SheetDescription className="text-muted-foreground font-mono text-xs">
                            Narrow down tenant list
                        </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-6 mt-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Status</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="pending_verification">Pending Verification</SelectItem>
                                    <SelectItem value="blacklisted">Blacklisted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-2 pt-4">
                            <Button
                                variant="outline"
                                className="flex-1 border-border text-muted-foreground font-mono text-xs"
                                onClick={clearFilters}
                            >
                                Clear All
                            </Button>
                            <Button
                                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs"
                                onClick={() => setIsFilterOpen(false)}
                            >
                                Apply Filters
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Tenant Details Sheet */}
            <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <SheetContent className="bg-card border-border w-full sm:max-w-lg overflow-y-auto">
                    {selectedTenant && (
                        <>
                            <SheetHeader>
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-16 w-16 border-2 border-primary">
                                        <AvatarFallback className="bg-secondary text-primary font-mono font-bold text-xl">
                                            {getInitials(selectedTenant.fullName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <SheetTitle className="text-foreground font-mono text-lg">{selectedTenant.fullName}</SheetTitle>
                                        <Badge className={`mt-1 text-[10px] font-mono uppercase ${getStatusColor(selectedTenant.status)}`}>
                                            {selectedTenant.status.replace('_', ' ')}
                                        </Badge>
                                    </div>
                                </div>
                            </SheetHeader>

                            <div className="space-y-6 mt-8">
                                {/* Contact Information */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-mono text-primary uppercase">Contact Information</h3>
                                    <div className="grid gap-3">
                                        <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-[10px] text-muted-foreground font-mono uppercase">Email</p>
                                                <p className="text-sm text-foreground font-mono">{selectedTenant.email || 'Not provided'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-[10px] text-muted-foreground font-mono uppercase">Phone</p>
                                                <p className="text-sm text-foreground font-mono">{selectedTenant.phonePrimary}</p>
                                            </div>
                                        </div>
                                        {selectedTenant.ghanaCardNumber && (
                                            <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                                                <UserCheck className="h-4 w-4 text-muted-foreground" />
                                                <div>
                                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Ghana Card</p>
                                                    <p className="text-sm text-foreground font-mono">{selectedTenant.ghanaCardNumber}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Tenancies */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-mono text-primary uppercase">Lease History</h3>
                                    {isLoadingDetails ? (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="h-6 w-6 text-primary animate-spin" />
                                        </div>
                                    ) : tenantTenancies.length > 0 ? (
                                        <div className="space-y-3">
                                            {tenantTenancies.map((tenancy) => (
                                                <div key={tenancy.id} className="p-4 bg-secondary/30 rounded-lg border border-border">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div>
                                                            <p className="text-sm text-foreground font-mono">{tenancy.property?.title || 'Property'}</p>
                                                            <p className="text-[10px] text-muted-foreground font-mono mt-1">REF: {tenancy.referenceNumber}</p>
                                                        </div>
                                                        <Badge className={`text-[9px] font-mono uppercase ${tenancy.status === 'active' ? 'bg-green-100 dark:bg-green-900/20 text-green-500 border-green-900' :
                                                                tenancy.status === 'expired' ? 'bg-red-100 dark:bg-red-900/20 text-red-500 border-red-900' :
                                                                    'bg-secondary text-muted-foreground border-border'
                                                            }`}>
                                                            {tenancy.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                                                        <div>
                                                            <p className="text-muted-foreground font-mono">Start Date</p>
                                                            <p className="text-foreground font-mono">{format(new Date(tenancy.leaseStartDate), 'dd MMM yyyy')}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground font-mono">End Date</p>
                                                            <p className="text-foreground font-mono">{format(new Date(tenancy.leaseEndDate), 'dd MMM yyyy')}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground font-mono">Monthly Rent</p>
                                                            <p className="text-foreground font-mono">{tenancy.rentCurrency} {tenancy.monthlyRent?.toLocaleString()}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground font-mono">Frequency</p>
                                                            <p className="text-foreground font-mono capitalize">{tenancy.paymentFreq || 'Monthly'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 border border-dashed border-border rounded-lg">
                                            <FileText className="h-8 w-8 text-zinc-800 mx-auto mb-2" />
                                            <p className="text-muted-foreground font-mono text-xs">No lease history</p>
                                        </div>
                                    )}
                                </div>

                                {/* Quick Actions */}
                                <div className="space-y-3 pt-4 border-t border-border">
                                    <h3 className="text-xs font-mono text-amber-500 uppercase">Quick Actions</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button
                                            variant="outline"
                                            className="border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                            onClick={() => {
                                                setIsDetailsOpen(false)
                                                openMessageDialog(selectedTenant)
                                            }}
                                        >
                                            <MessageSquare className="h-3 w-3 mr-2" />
                                            Message
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                        >
                                            <FileText className="h-3 w-3 mr-2" />
                                            New Lease
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                        >
                                            <CreditCard className="h-3 w-3 mr-2" />
                                            Payments
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="border-red-900 text-red-500 hover:bg-red-950/30 font-mono text-xs"
                                            onClick={() => {
                                                setIsDetailsOpen(false)
                                                setTenantToDelete(selectedTenant)
                                            }}
                                        >
                                            <UserX className="h-3 w-3 mr-2" />
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* Send Message Dialog */}
            <Dialog open={isMessageDialogOpen} onOpenChange={setIsMessageDialogOpen}>
                <DialogContent className="bg-background border-border">
                    <DialogHeader>
                        <DialogTitle className="text-amber-500 font-mono uppercase">Send Message</DialogTitle>
                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                            Send a message to {messageRecipient?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
                            <Avatar className="h-10 w-10 border border-border">
                                <AvatarFallback className="bg-muted text-amber-500 font-mono text-sm">
                                    {messageRecipient ? getInitials(messageRecipient.fullName) : ''}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="text-sm text-foreground font-mono">{messageRecipient?.fullName}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{messageRecipient?.email || messageRecipient?.phonePrimary}</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Message</Label>
                            <Textarea
                                placeholder="Type your message..."
                                className="bg-background border-border text-foreground font-mono text-sm resize-none min-h-[120px]"
                                value={messageContent}
                                onChange={(e) => setMessageContent(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="border-border text-muted-foreground font-mono text-xs"
                            onClick={() => setIsMessageDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-500 text-foreground font-mono text-xs"
                            disabled={isSendingMessage || !messageContent.trim()}
                            onClick={handleSendMessage}
                        >
                            {isSendingMessage ? (
                                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            ) : (
                                <Send className="h-3 w-3 mr-2" />
                            )}
                            Send Message
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!tenantToDelete} onOpenChange={() => setTenantToDelete(null)}>
                <AlertDialogContent className="bg-background border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground font-mono uppercase flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Remove Tenant
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
                            Are you sure you want to remove <span className="text-amber-500">{tenantToDelete?.fullName}</span> from your tenant directory?
                            This action will also terminate any active leases associated with this tenant.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground font-mono text-xs uppercase">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteTenant}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-500 text-foreground font-mono text-xs uppercase"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-3 w-3 mr-2" />
                                    Remove Tenant
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
