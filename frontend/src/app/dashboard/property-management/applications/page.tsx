'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import Link from 'next/link'
import {
    FileText,
    Search,
    Filter,
    Plus,
    Loader2,
    Phone,
    Mail,
    MoreHorizontal,
    Eye,
    CheckCircle2,
    XCircle,
    Clock,
    Building2,
    Calendar,
    TrendingUp,
    UserCheck,
    UserX,
    PlayCircle,
    X,
    ClipboardList,
    Send,
    Link2,
    Trash2,
    AlertTriangle
} from 'lucide-react'
import { propertyManagementApi, Application, ApplicationStatus, ApplicationStats, ApplicationLink } from '@/lib/property-management-api'
import { format } from 'date-fns'

export default function ApplicationsPage() {
    const router = useRouter()
    const [applications, setApplications] = useState<Application[]>([])
    const [stats, setStats] = useState<ApplicationStats | null>(null)
    const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    
    // Filter state
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [propertyFilter, setPropertyFilter] = useState<string>('all')
    
    // Action dialogs
    const [selectedApp, setSelectedApp] = useState<Application | null>(null)
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
    const [rejectionReason, setRejectionReason] = useState('')
    const [approvalNotes, setApprovalNotes] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    
    // Link generation
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
    const [linkPropertyId, setLinkPropertyId] = useState('')
    const [linkMaxUses, setLinkMaxUses] = useState('')
    const [linkExpiryDays, setLinkExpiryDays] = useState('30')
    const [generatedLink, setGeneratedLink] = useState<ApplicationLink | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setIsLoading(true)
            const [appsRes, statsRes, propsRes] = await Promise.all([
                propertyManagementApi.getApplications({ limit: 100, sortBy: 'created_at', sortOrder: 'desc' }),
                propertyManagementApi.getApplicationStats(),
                propertyManagementApi.getProperties({ limit: 100 })
            ])
            
            setApplications(appsRes.data || [])
            setStats(statsRes)
            
            const propsData = Array.isArray(propsRes) ? propsRes : propsRes.data || []
            setProperties(propsData.map((p: any) => ({ id: p.id, name: p.title || p.addressStreet || 'Unnamed Property' })))
        } catch (err) {
            console.error('Failed to load applications:', err)
            setError('Failed to load applications. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    // Filtered applications
    const filteredApplications = useMemo(() => {
        return applications.filter(app => {
            const matchesSearch = searchQuery === '' || 
                app.applicantFullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                app.applicantEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                app.applicantPhone?.includes(searchQuery) ||
                app.propertyName?.toLowerCase().includes(searchQuery.toLowerCase())
            
            const matchesStatus = statusFilter === 'all' || app.status === statusFilter
            const matchesProperty = propertyFilter === 'all' || app.propertyId === propertyFilter
            
            return matchesSearch && matchesStatus && matchesProperty
        })
    }, [applications, searchQuery, statusFilter, propertyFilter])

    const getStatusBadge = (status: ApplicationStatus) => {
        const config: Record<ApplicationStatus, { color: string; icon: React.ReactNode; label: string }> = {
            [ApplicationStatus.DRAFT]: { 
                color: 'border-border text-muted-foreground bg-muted/20', 
                icon: <Clock className="h-3 w-3" />, 
                label: 'Draft' 
            },
            [ApplicationStatus.SUBMITTED]: { 
                color: 'border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20', 
                icon: <Send className="h-3 w-3" />, 
                label: 'Submitted' 
            },
            [ApplicationStatus.UNDER_REVIEW]: { 
                color: 'border-amber-900 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20', 
                icon: <Eye className="h-3 w-3" />, 
                label: 'Under Review' 
            },
            [ApplicationStatus.APPROVED]: { 
                color: 'border-green-900 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20', 
                icon: <CheckCircle2 className="h-3 w-3" />, 
                label: 'Approved' 
            },
            [ApplicationStatus.REJECTED]: { 
                color: 'border-red-900 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20', 
                icon: <XCircle className="h-3 w-3" />, 
                label: 'Rejected' 
            },
            [ApplicationStatus.WITHDRAWN]: { 
                color: 'border-border text-muted-foreground bg-muted/20', 
                icon: <X className="h-3 w-3" />, 
                label: 'Withdrawn' 
            },
            [ApplicationStatus.LEASE_GENERATED]: {
                color: 'border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20',
                icon: <FileText className="h-3 w-3" />,
                label: 'Lease Generated'
            },
            [ApplicationStatus.LEASE_SIGNED]: {
                color: 'border-teal-900 text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/20',
                icon: <CheckCircle2 className="h-3 w-3" />,
                label: 'Lease Signed'
            },
            [ApplicationStatus.EXPIRED]: {
                color: 'border-border text-muted-foreground bg-muted/20',
                icon: <Clock className="h-3 w-3" />,
                label: 'Expired'
            }
        }
        const { color, icon, label } = config[status] || config[ApplicationStatus.DRAFT]
        return (
            <Badge variant="outline" className={`${color} gap-1`}>
                {icon} {label}
            </Badge>
        )
    }

    // Actions
    const handleStartReview = async (app: Application) => {
        try {
            setIsProcessing(true)
            await propertyManagementApi.startReviewApplication(app.id)
            await loadData()
        } catch (err) {
            console.error('Failed to start review:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleApprove = async () => {
        if (!selectedApp) return
        try {
            setIsProcessing(true)
            await propertyManagementApi.approveApplication(selectedApp.id, approvalNotes || undefined)
            setIsReviewDialogOpen(false)
            setApprovalNotes('')
            setSelectedApp(null)
            await loadData()
        } catch (err) {
            console.error('Failed to approve:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleReject = async () => {
        if (!selectedApp || !rejectionReason.trim()) return
        try {
            setIsProcessing(true)
            await propertyManagementApi.rejectApplication(selectedApp.id, rejectionReason)
            setIsRejectDialogOpen(false)
            setRejectionReason('')
            setSelectedApp(null)
            await loadData()
        } catch (err) {
            console.error('Failed to reject:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleConvertToTenant = async (app: Application) => {
        try {
            setIsProcessing(true)
            const result = await propertyManagementApi.convertApplicationToTenant(app.id)
            router.push(`/dashboard/property-management/tenants/${result.tenantId}`)
        } catch (err) {
            console.error('Failed to convert:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleDelete = async () => {
        if (!selectedApp) return
        try {
            setIsProcessing(true)
            await propertyManagementApi.deleteApplication(selectedApp.id)
            setIsDeleteDialogOpen(false)
            setSelectedApp(null)
            await loadData()
        } catch (err) {
            console.error('Failed to delete application:', err)
            setError('Failed to delete application. Please try again.')
        } finally {
            setIsProcessing(false)
        }
    }

    const handleGenerateLink = async () => {
        if (!linkPropertyId) return
        try {
            setIsProcessing(true)
            const link = await propertyManagementApi.createApplicationLink({
                propertyId: linkPropertyId,
                maxUses: linkMaxUses ? parseInt(linkMaxUses) : undefined,
                expiresInDays: parseInt(linkExpiryDays) || 30
            })
            setGeneratedLink(link)
        } catch (err) {
            console.error('Failed to generate link:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const copyLink = () => {
        if (generatedLink) {
            // Tenant portal is now integrated into the main app at /tenant/*
            const tenantPortalUrl = process.env.NEXT_PUBLIC_TENANT_PORTAL_URL || window.location.origin
            const url = `${tenantPortalUrl}/tenant/apply/${generatedLink.token}`
            navigator.clipboard.writeText(url)
        }
    }

    const clearFilters = () => {
        setStatusFilter('all')
        setPropertyFilter('all')
        setSearchQuery('')
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono uppercase">Applications</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage tenant applications and onboarding workflow
                    </p>
                </div>
                <Button 
                    onClick={() => setIsLinkDialogOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    <Link2 className="h-4 w-4 mr-2" />
                    Generate Application Link
                </Button>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Card className="bg-card/50 border-border">
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-muted-foreground text-sm">Total</p>
                                    <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                                </div>
                                <ClipboardList className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 border-border">
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-muted-foreground text-sm">Submitted</p>
                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.byStatus[ApplicationStatus.SUBMITTED] || 0}</p>
                                </div>
                                <Send className="h-8 w-8 text-blue-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 border-border">
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-muted-foreground text-sm">Under Review</p>
                                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.byStatus[ApplicationStatus.UNDER_REVIEW] || 0}</p>
                                </div>
                                <Eye className="h-8 w-8 text-amber-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 border-border">
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-muted-foreground text-sm">Approved</p>
                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.byStatus[ApplicationStatus.APPROVED] || 0}</p>
                                </div>
                                <CheckCircle2 className="h-8 w-8 text-green-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 border-border">
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-muted-foreground text-sm">Approval Rate</p>
                                    <p className="text-2xl font-bold text-foreground">{stats.approvalRate.toFixed(0)}%</p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Search and Filters */}
            <Card className="bg-card/50 border-border">
                <CardContent className="pt-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email, phone, or property..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-muted border-border text-foreground"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px] bg-muted border-border text-foreground">
                                <SelectValue placeholder="All Statuses" />
                            </SelectTrigger>
                            <SelectContent className="bg-muted border-border text-foreground">
                                <SelectItem value="all" className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">All Statuses</SelectItem>
                                <SelectItem value={ApplicationStatus.SUBMITTED} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">Submitted</SelectItem>
                                <SelectItem value={ApplicationStatus.UNDER_REVIEW} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">Under Review</SelectItem>
                                <SelectItem value={ApplicationStatus.APPROVED} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">Approved</SelectItem>
                                <SelectItem value={ApplicationStatus.REJECTED} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">Rejected</SelectItem>
                                <SelectItem value={ApplicationStatus.DRAFT} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">Draft</SelectItem>
                                <SelectItem value={ApplicationStatus.LEASE_GENERATED} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">Lease Generated</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                            <SelectTrigger className="w-[200px] bg-muted border-border text-foreground">
                                <SelectValue placeholder="All Properties" />
                            </SelectTrigger>
                            <SelectContent className="bg-muted border-border text-foreground">
                                <SelectItem value="all" className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">All Properties</SelectItem>
                                {properties.map(p => (
                                    <SelectItem key={p.id} value={p.id} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {(statusFilter !== 'all' || propertyFilter !== 'all' || searchQuery) && (
                            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                                <X className="h-4 w-4 mr-2" />
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Applications Table */}
            <Card className="bg-card/50 border-border">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                                <TableHead className="text-muted-foreground">Applicant</TableHead>
                                <TableHead className="text-muted-foreground">Property</TableHead>
                                <TableHead className="text-muted-foreground">Status</TableHead>
                                <TableHead className="text-muted-foreground">Submitted</TableHead>
                                <TableHead className="text-muted-foreground">Move-in Date</TableHead>
                                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredApplications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                                        {searchQuery || statusFilter !== 'all' || propertyFilter !== 'all'
                                            ? 'No applications match your filters'
                                            : 'No applications yet. Generate an application link to get started.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredApplications.map(app => (
                                    <TableRow key={app.id} className="border-border hover:bg-muted/50">
                                        <TableCell>
                                            <div>
                                                <Link 
                                                    href={`/dashboard/property-management/applications/${app.id}`}
                                                    className="font-medium text-foreground hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                                                >
                                                    {app.applicantFullName}
                                                </Link>
                                                {app.tenantId && (
                                                    <Badge variant="outline" className="ml-2 text-xs border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20">
                                                        <UserCheck className="h-3 w-3 mr-1" />
                                                        Tenant
                                                    </Badge>
                                                )}
                                                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Mail className="h-3 w-3" />
                                                        {app.applicantEmail}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />
                                                        {app.applicantPhone || '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-foreground">{app.propertyName || 'Unknown Property'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(app.status)}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {app.submittedAt 
                                                ? format(new Date(app.submittedAt), 'MMM d, yyyy')
                                                : '-'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {app.desiredMoveInDate 
                                                ? format(new Date(app.desiredMoveInDate), 'MMM d, yyyy')
                                                : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="bg-muted border-border">
                                                    <DropdownMenuItem 
                                                        className="cursor-pointer"
                                                        onClick={() => router.push(`/dashboard/property-management/applications/${app.id}`)}
                                                    >
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        View Details
                                                    </DropdownMenuItem>
                                                    
                                                    {app.status === ApplicationStatus.SUBMITTED && (
                                                        <DropdownMenuItem 
                                                            className="cursor-pointer"
                                                            onClick={() => handleStartReview(app)}
                                                        >
                                                            <PlayCircle className="h-4 w-4 mr-2" />
                                                            Start Review
                                                        </DropdownMenuItem>
                                                    )}
                                                    
                                                    {app.status === ApplicationStatus.UNDER_REVIEW && (
                                                        <>
                                                            <DropdownMenuSeparator className="bg-zinc-700" />
                                                            <DropdownMenuItem 
                                                                className="cursor-pointer text-green-600 dark:text-green-400"
                                                                onClick={() => {
                                                                    setSelectedApp(app)
                                                                    setIsReviewDialogOpen(true)
                                                                }}
                                                            >
                                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                                                Approve
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem 
                                                                className="cursor-pointer text-red-600 dark:text-red-400"
                                                                onClick={() => {
                                                                    setSelectedApp(app)
                                                                    setIsRejectDialogOpen(true)
                                                                }}
                                                            >
                                                                <XCircle className="h-4 w-4 mr-2" />
                                                                Reject
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    
                                                    {app.status === ApplicationStatus.APPROVED && !app.tenantId && (
                                                        <>
                                                            <DropdownMenuSeparator className="bg-zinc-700" />
                                                            <DropdownMenuItem 
                                                                className="cursor-pointer text-emerald-600 dark:text-emerald-400"
                                                                onClick={() => handleConvertToTenant(app)}
                                                            >
                                                                <UserCheck className="h-4 w-4 mr-2" />
                                                                Convert to Tenant
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    
                                                    {app.tenantId && (
                                                        <>
                                                            <DropdownMenuSeparator className="bg-zinc-700" />
                                                            <DropdownMenuItem
                                                                className="cursor-pointer text-emerald-600 dark:text-emerald-400"
                                                                onClick={() => router.push(`/dashboard/property-management/tenants/${app.tenantId}`)}
                                                            >
                                                                <UserCheck className="h-4 w-4 mr-2" />
                                                                View Tenant Record
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}

                                                    <DropdownMenuSeparator className="bg-zinc-700" />
                                                    <DropdownMenuItem
                                                        className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-400"
                                                        onClick={() => {
                                                            setSelectedApp(app)
                                                            setIsDeleteDialogOpen(true)
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete Application
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Approve Dialog */}
            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Approve Application</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Approve application from {selectedApp?.applicantFullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-muted-foreground">Approval Notes (Optional)</Label>
                            <Textarea
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                placeholder="Add any notes about this approval..."
                                className="bg-muted border-border text-foreground mt-2"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsReviewDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleApprove}
                            disabled={isProcessing}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Approve Application
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Reject Application</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Reject application from {selectedApp?.applicantFullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-muted-foreground">Rejection Reason (Required)</Label>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Enter the reason for rejection..."
                                className="bg-muted border-border text-foreground mt-2"
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsRejectDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleReject}
                            disabled={isProcessing || !rejectionReason.trim()}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Reject Application
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Delete Application
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Delete the application from <span className="text-foreground font-medium">{selectedApp?.applicantFullName}</span>? This removes it from your applications list. It does not delete any tenant record already created from it.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDelete}
                            disabled={isProcessing}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Delete Application
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Generate Link Dialog */}
            <Dialog open={isLinkDialogOpen} onOpenChange={(open) => {
                setIsLinkDialogOpen(open)
                if (!open) {
                    setGeneratedLink(null)
                    setLinkPropertyId('')
                    setLinkMaxUses('')
                    setLinkExpiryDays('30')
                }
            }}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Generate Application Link</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Create a link that tenants can use to apply for a property
                        </DialogDescription>
                    </DialogHeader>
                    
                    {!generatedLink ? (
                        <>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-muted-foreground">Property</Label>
                                    <Select value={linkPropertyId} onValueChange={setLinkPropertyId}>
                                        <SelectTrigger className="bg-muted border-border text-foreground mt-2">
                                            <SelectValue placeholder="Select a property" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-muted border-border text-foreground">
                                            {properties.map(p => (
                                                <SelectItem key={p.id} value={p.id} className="text-foreground hover:bg-zinc-700 focus:bg-zinc-700 focus:text-foreground">{p.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-muted-foreground">Max Uses (Optional)</Label>
                                        <Input
                                            type="number"
                                            value={linkMaxUses}
                                            onChange={(e) => setLinkMaxUses(e.target.value)}
                                            placeholder="Unlimited"
                                            className="bg-muted border-border text-foreground mt-2"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Expires In (Days)</Label>
                                        <Input
                                            type="number"
                                            value={linkExpiryDays}
                                            onChange={(e) => setLinkExpiryDays(e.target.value)}
                                            placeholder="30"
                                            className="bg-muted border-border text-foreground mt-2"
                                        />
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsLinkDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleGenerateLink}
                                    disabled={isProcessing || !linkPropertyId}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Generate Link
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground mb-2">Application Link (Tenant Portal)</p>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            readOnly
                                            value={`${process.env.NEXT_PUBLIC_TENANT_PORTAL_URL || window.location.origin}/tenant/apply/${generatedLink.token}`}
                                            className="bg-card border-border text-foreground font-mono text-sm"
                                        />
                                        <Button onClick={copyLink} variant="outline" className="shrink-0">
                                            Copy
                                        </Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Expires</p>
                                        <p className="text-foreground">{format(new Date(generatedLink.expiresAt), 'MMM d, yyyy')}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Max Uses</p>
                                        <p className="text-foreground">{generatedLink.maxUses || 'Unlimited'}</p>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={() => setIsLinkDialogOpen(false)}>
                                    Done
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
