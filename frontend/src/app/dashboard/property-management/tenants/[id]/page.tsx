'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    MapPin,
    Phone,
    Mail,
    Briefcase,
    Calendar,
    CreditCard,
    FileText,
    Clock,
    Edit2,
    Trash2,
    MoreVertical,
    Loader2,
    AlertCircle,
    Building2,
    RefreshCw,
    XCircle,
    CheckCircle,
    Download,
    Upload,
    MessageSquare,
    AlertTriangle,
    User,
    Send,
    Eye,
    Wrench
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { propertyManagementApi, UtilityCharge, UtilityType, RentScheduleItem, CreateUtilityChargeDto } from '@/lib/property-management-api'
import { openLeaseAgreement, LeaseAgreementData } from '@/lib/lease-generator'
import { Tenant, Tenancy, FinancialRecord, WorkOrder, PropertyDocumentType, VaultDocument } from '@/types/property-management'
import { format, differenceInDays, addYears } from 'date-fns'
import { Zap, Droplets, Flame, Wifi, Trash, Shield, Plus } from 'lucide-react'

const API_HOST = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') || 'http://localhost:4000'

/** Resolve a stored fileUrl/storage key to a working download URL through the backend */
function resolveFileUrl(fileUrl?: string): string | undefined {
    if (!fileUrl) return undefined
    if (fileUrl.startsWith('http')) return fileUrl
    if (fileUrl.startsWith('/api/v1/')) return `/api/${fileUrl.slice('/api/v1/'.length)}`
    if (fileUrl.startsWith('/api/')) return fileUrl
    return `${API_HOST}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`
}

// Lease signing workflow states
type LeaseSigningStatus = 'none' | 'draft' | 'pending_sign' | 'partially_signed' | 'signed' | 'expired' | 'voided'

interface LeaseSigningState {
    status: LeaseSigningStatus
    label: string
    description: string
    color: string
    signers?: { name: string; email: string; signed: boolean }[]
    sentAt?: Date
    completedAt?: Date
}

const deriveLeaseSigningState = (tenancy?: Tenancy | null): LeaseSigningState => {
    if (!tenancy) {
        return {
            status: 'none',
            label: 'No Lease Document',
            description: 'Generate a lease agreement to get started',
            color: 'zinc'
        }
    }

    const leaseStatus = (tenancy.leaseStatus || '').toLowerCase()
    const esignStatus = (tenancy.esignStatus || '').toLowerCase()
    const hasDraft = Boolean(tenancy.leaseDocumentUrl)
    const hasSigned = Boolean(tenancy.leaseSignedUrl) || esignStatus === 'completed' || ['countersigned', 'active', 'tenant_signed'].includes(leaseStatus)

    if (hasSigned) {
        return {
            status: 'signed',
            label: 'Signed',
            description: 'Lease is fully signed and available in Documents',
            color: 'emerald',
            completedAt: tenancy.esignCompletedAt ? new Date(tenancy.esignCompletedAt) : undefined
        }
    }

    if (tenancy.status === 'pending_signature' || esignStatus === 'pending' || leaseStatus === 'sent_to_tenant') {
        return {
            status: 'pending_sign',
            label: 'Awaiting Signature',
            description: 'Lease has been sent and is awaiting signatures',
            color: 'amber',
            sentAt: tenancy.leaseSentAt ? new Date(tenancy.leaseSentAt) : undefined
        }
    }

    if (hasDraft) {
        return {
            status: 'draft',
            label: 'Draft',
            description: 'Lease draft generated and ready to send',
            color: 'blue'
        }
    }

    return {
        status: 'none',
        label: 'No Lease Document',
        description: 'Generate a lease agreement to get started',
        color: 'zinc'
    }
}

export default function TenantDetailsPage() {
    const router = useRouter()
    const params = useParams()
    const tenantId = params.id as string

    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [tenancies, setTenancies] = useState<Tenancy[]>([])
    const [payments, setPayments] = useState<FinancialRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Lease signing status
    const [leaseSigningState, setLeaseSigningState] = useState<LeaseSigningState>({
        status: 'none',
        label: 'No Lease Document',
        description: 'Generate a lease agreement to get started',
        color: 'zinc'
    })

    // Active tenancy for quick access
    const activeTenancy = useMemo(() => {
        return tenancies.find(t => t.status === 'active')
    }, [tenancies])

    useEffect(() => {
        setLeaseSigningState(deriveLeaseSigningState(activeTenancy || null))
    }, [activeTenancy])

    // Lease progress for active tenancy
    const leaseProgress = useMemo(() => {
        if (!activeTenancy) return null
        const start = new Date(activeTenancy.leaseStartDate)
        const end = new Date(activeTenancy.leaseEndDate)
        const now = new Date()
        const total = differenceInDays(end, start)
        const remaining = Math.max(0, differenceInDays(end, now))
        const percent = Math.min(100, Math.max(0, ((total - remaining) / total) * 100))
        return { percent, remaining, total }
    }, [activeTenancy])

    // Edit tenancy dialog
    const [selectedTenancy, setSelectedTenancy] = useState<Tenancy | null>(null)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [editForm, setEditForm] = useState({ monthlyRent: 0, leaseEndDate: '', paymentFreq: 'monthly' })
    const [isSavingEdit, setIsSavingEdit] = useState(false)

    // Terminate dialog
    const [isTerminateDialogOpen, setIsTerminateDialogOpen] = useState(false)
    const [terminateForm, setTerminateForm] = useState({ terminationDate: format(new Date(), 'yyyy-MM-dd'), reason: '' })
    const [isTerminating, setIsTerminating] = useState(false)

    // Renew dialog
    const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false)
    const [renewForm, setRenewForm] = useState({ newEndDate: '', newMonthlyRent: 0, duration: '1' })
    const [isRenewing, setIsRenewing] = useState(false)

    // Delete tenant dialog
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isInvitingPortal, setIsInvitingPortal] = useState(false)
    const [portalInviteMessage, setPortalInviteMessage] = useState<string | null>(null)
    const [portalInviteLink, setPortalInviteLink] = useState<string | null>(null)
    const [maintenanceRequests, setMaintenanceRequests] = useState<WorkOrder[]>([])
    const [tenantDocuments, setTenantDocuments] = useState<VaultDocument[]>([])
    // Resolved lease documents (signed/unsigned) keyed by tenancy id — fileUrl is backend-served
    const [leaseDocsByTenancy, setLeaseDocsByTenancy] = useState<Record<string, VaultDocument>>({})

    // Document upload dialog
    const [isUploadDocumentOpen, setIsUploadDocumentOpen] = useState(false)
    const [isUploadingDocument, setIsUploadingDocument] = useState(false)
    const [documentFile, setDocumentFile] = useState<File | null>(null)
    const [documentForm, setDocumentForm] = useState({
        documentType: PropertyDocumentType.TENANT_AGREEMENTS,
        title: '',
        description: ''
    })

    // Utility charges state
    const [utilityCharges, setUtilityCharges] = useState<UtilityCharge[]>([])
    const [rentSchedules, setRentSchedules] = useState<RentScheduleItem[]>([])
    const [isAddChargeOpen, setIsAddChargeOpen] = useState(false)
    const [isSubmittingCharge, setIsSubmittingCharge] = useState(false)
    const [chargeForm, setChargeForm] = useState({
        utilityType: 'electricity' as UtilityType,
        billingPeriodStart: '',
        billingPeriodEnd: '',
        amount: '',
        description: ''
    })

    // Load tenant data
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true)
                const [tenantData, tenanciesRes] = await Promise.all([
                    propertyManagementApi.getTenantById(tenantId),
                    propertyManagementApi.getTenancies({ tenantId, limit: 50 })
                ])
                setTenant(tenantData)

                const allTenancies = Array.isArray(tenanciesRes) ? tenanciesRes : tenanciesRes.data || []
                const tenantTenancies = allTenancies
                setTenancies(tenantTenancies)

                // Fetch resolved lease documents (signed/unsigned) per tenancy. The vault endpoint
                // converts stored S3/MinIO keys into working download URLs — the raw lease_signed_url
                // on the tenancy is an unresolved storage key that won't open directly.
                Promise.all(
                    tenantTenancies.map(t =>
                        propertyManagementApi.getVaultDocuments({ tenancyId: t.id, limit: 10 })
                            .then(res => {
                                const docs = res.data || []
                                const doc = docs.find(d => d.source === 'signed_lease') || docs.find(d => d.source === 'lease')
                                return doc ? { tenancyId: t.id, doc } : null
                            })
                            .catch(() => null)
                    )
                ).then(results => {
                    const map: Record<string, VaultDocument> = {}
                    for (const r of results) { if (r) map[r.tenancyId] = r.doc }
                    setLeaseDocsByTenancy(map)
                })

                // Load payments if there's an active tenancy
                const active = tenantTenancies.find(t => t.status === 'active')
                if (active?.propertyId) {
                    const [financials, workOrders, vaultDocs] = await Promise.all([
                        propertyManagementApi.getFinancials({ propertyId: active.propertyId, limit: 20 }),
                        propertyManagementApi.getWorkOrders({ propertyId: active.propertyId, limit: 50 }),
                        propertyManagementApi.getVaultDocuments({ tenancyId: active.id, source: 'upload', category: 'tenant', limit: 50 })
                    ])
                    const data = Array.isArray(financials) ? financials : financials.data || []
                    setPayments(data.filter(f => f.recordType === 'income'))
                    setTenantDocuments(vaultDocs.data || [])

                    // Filter work orders to this tenant's tenancy
                    const allWO = Array.isArray(workOrders) ? workOrders : workOrders.data || []
                    setMaintenanceRequests(allWO.filter(wo => wo.tenancyId === active.id))

                    // Load utility charges
                    try {
                        const [chargesRes, schedulesRes] = await Promise.all([
                            propertyManagementApi.getUtilityCharges(active.id),
                            propertyManagementApi.getRentSchedules(active.id)
                        ])
                        setUtilityCharges(chargesRes.charges || [])
                        setRentSchedules(schedulesRes.schedules || [])
                    } catch { /* utility charges may not be available yet */ }
                } else {
                    setTenantDocuments([])
                }
            } catch (err) {
                console.error('Failed to load tenant:', err)
                setError('Failed to load tenant details')
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [tenantId])

    const getInitials = (name: string) => {
        return name.split(' ').map(p => p.charAt(0)).join('').toUpperCase().substring(0, 2)
    }

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'active': return 'bg-green-100 dark:bg-green-900/40 text-green-500 border-green-900'
            case 'expired': return 'bg-red-100 dark:bg-red-900/40 text-red-500 border-red-900'
            case 'terminated': return 'bg-muted text-muted-foreground border-border'
            case 'pending': case 'pending_verification': return 'bg-amber-100 dark:bg-amber-900/40 text-amber-500 border-amber-900'
            default: return 'bg-muted text-muted-foreground border-border'
        }
    }

    // Open edit dialog for a tenancy
    const openEditDialog = (tenancy: Tenancy) => {
        setSelectedTenancy(tenancy)
        setEditForm({
            monthlyRent: tenancy.monthlyRent || 0,
            leaseEndDate: format(new Date(tenancy.leaseEndDate), 'yyyy-MM-dd'),
            paymentFreq: tenancy.paymentFreq || 'monthly'
        })
        setIsEditDialogOpen(true)
    }

    // Open terminate dialog
    const openTerminateDialog = (tenancy: Tenancy) => {
        setSelectedTenancy(tenancy)
        setTerminateForm({ terminationDate: format(new Date(), 'yyyy-MM-dd'), reason: '' })
        setIsTerminateDialogOpen(true)
    }

    // Open renew dialog
    const openRenewDialog = (tenancy: Tenancy) => {
        setSelectedTenancy(tenancy)
        const currentEnd = new Date(tenancy.leaseEndDate)
        setRenewForm({
            newEndDate: format(addYears(currentEnd, 1), 'yyyy-MM-dd'),
            newMonthlyRent: tenancy.monthlyRent || 0,
            duration: '1'
        })
        setIsRenewDialogOpen(true)
    }

    // Handle edit save
    const handleSaveEdit = async () => {
        if (!selectedTenancy) return
        try {
            setIsSavingEdit(true)
            await propertyManagementApi.updateTenancy(selectedTenancy.id, {
                monthlyRent: editForm.monthlyRent,
                leaseEndDate: editForm.leaseEndDate,
                paymentFreq: editForm.paymentFreq as any
            })
            // Reload tenancies
            const res = await propertyManagementApi.getTenancies({ limit: 50 })
            const all = Array.isArray(res) ? res : res.data || []
            setTenancies(all.filter(t => t.tenantId === tenantId))
            setIsEditDialogOpen(false)
        } catch (err) {
            console.error('Failed to update tenancy:', err)
        } finally {
            setIsSavingEdit(false)
        }
    }

    // Handle terminate
    const handleTerminate = async () => {
        if (!selectedTenancy) return
        try {
            setIsTerminating(true)
            await propertyManagementApi.terminateTenancy(selectedTenancy.id, terminateForm.terminationDate, terminateForm.reason)
            // Reload tenancies
            const res = await propertyManagementApi.getTenancies({ limit: 50 })
            const all = Array.isArray(res) ? res : res.data || []
            setTenancies(all.filter(t => t.tenantId === tenantId))
            setIsTerminateDialogOpen(false)
        } catch (err) {
            console.error('Failed to terminate:', err)
        } finally {
            setIsTerminating(false)
        }
    }

    // Handle renew
    const handleRenew = async () => {
        if (!selectedTenancy) return
        try {
            setIsRenewing(true)
            await propertyManagementApi.renewTenancy(selectedTenancy.id, renewForm.newEndDate, renewForm.newMonthlyRent)
            // Reload tenancies
            const res = await propertyManagementApi.getTenancies({ limit: 50 })
            const all = Array.isArray(res) ? res : res.data || []
            setTenancies(all.filter(t => t.tenantId === tenantId))
            setIsRenewDialogOpen(false)
        } catch (err) {
            console.error('Failed to renew:', err)
        } finally {
            setIsRenewing(false)
        }
    }

    // Update renew form when duration changes
    const handleDurationChange = (duration: string) => {
        if (!selectedTenancy) return
        const currentEnd = new Date(selectedTenancy.leaseEndDate)
        let newEnd: Date
        switch (duration) {
            case '6m': newEnd = new Date(currentEnd); newEnd.setMonth(newEnd.getMonth() + 6); break
            case '2': newEnd = addYears(currentEnd, 2); break
            case '3': newEnd = addYears(currentEnd, 3); break
            default: newEnd = addYears(currentEnd, 1)
        }
        setRenewForm(prev => ({ ...prev, duration, newEndDate: format(newEnd, 'yyyy-MM-dd') }))
    }

    // Handle delete tenant
    const handleDeleteTenant = async () => {
        try {
            setIsDeleting(true)
            // await propertyManagementApi.deleteTenant(tenantId)
            router.push('/dashboard/property-management/tenants')
        } catch (err) {
            console.error('Failed to delete tenant:', err)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleInviteToPortal = async () => {
        try {
            setIsInvitingPortal(true)
            setPortalInviteMessage(null)
            setPortalInviteLink(null)

            const tenantPortalLoginUrl = `${process.env.NEXT_PUBLIC_TENANT_PORTAL_URL || window.location.origin}/tenant-login`
            const result = await propertyManagementApi.inviteTenantPortal(tenantId, tenantPortalLoginUrl)

            setPortalInviteMessage(
                result?.emailSent
                    ? 'Access invite emailed to the tenant. They click the set-password link in the email, create their password, then land on the tenant portal. The setup link is below if you need to share it directly.'
                    : 'Tenant account provisioned, but the invite email could not be delivered. Share the setup link below with the tenant directly.'
            )
            setPortalInviteLink(result?.onboardingUrl || tenantPortalLoginUrl)
        } catch (err: any) {
            setPortalInviteMessage(err?.message || 'Failed to send tenant portal invite')
        } finally {
            setIsInvitingPortal(false)
        }
    }

    const handleUploadTenantDocument = async () => {
        if (!activeTenancy?.propertyId || !documentFile) return

        try {
            setIsUploadingDocument(true)
            await propertyManagementApi.uploadDocument({
                file: documentFile,
                propertyId: activeTenancy.propertyId,
                tenancyId: activeTenancy.id,
                documentType: documentForm.documentType,
                title: documentForm.title.trim() || documentFile.name,
                description: documentForm.description.trim() || undefined
            })

            const vaultDocs = await propertyManagementApi.getVaultDocuments({
                tenancyId: activeTenancy.id,
                source: 'upload',
                category: 'tenant',
                limit: 50
            })
            setTenantDocuments(vaultDocs.data || [])
            setDocumentFile(null)
            setDocumentForm({ documentType: PropertyDocumentType.TENANT_AGREEMENTS, title: '', description: '' })
            setIsUploadDocumentOpen(false)
        } catch (err) {
            console.error('Failed to upload tenant document:', err)
            setError(err instanceof Error ? err.message : 'Failed to upload tenant document')
        } finally {
            setIsUploadingDocument(false)
        }
    }

    // Resolve a working URL for a tenancy's lease document — prefers the backend-served vault doc,
    // falls back to resolving the raw stored URL on the tenancy.
    const getLeaseDocUrl = (tenancy?: Tenancy | null): string | undefined => {
        if (!tenancy) return undefined
        const vaultUrl = resolveFileUrl(leaseDocsByTenancy[tenancy.id]?.fileUrl)
        if (vaultUrl) return vaultUrl
        return resolveFileUrl(tenancy.leaseSignedUrl || tenancy.leaseDocumentUrl)
    }

    const openLeaseDocument = (tenancy?: Tenancy | null) => {
        const url = getLeaseDocUrl(tenancy)
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
    }

    // Handle generate lease agreement - navigates to e-sign page
    const handleGenerateLease = (tenancy?: Tenancy) => {
        const targetTenancy = tenancy || activeTenancy
        if (!tenant || !targetTenancy) {
            alert('No active tenancy found to generate lease')
            return
        }

        // Navigate to the tenancy/lease detail page for document management
        router.push(`/dashboard/property-management/leases/${targetTenancy.id}`)
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                <p className="text-muted-foreground font-mono text-xs mt-4 uppercase">Loading tenant profile...</p>
            </div>
        )
    }

    if (error || !tenant) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-500 font-mono text-sm">{error || 'Tenant not found'}</p>
                <Link href="/dashboard/property-management/tenants">
                    <Button variant="outline" className="mt-4 border-border text-muted-foreground">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Tenants
                    </Button>
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/tenants">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 border-2 border-amber-600">
                            <AvatarFallback className="bg-card text-amber-500 font-mono font-bold text-lg">
                                {getInitials(tenant.fullName)}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono flex items-center gap-3">
                                {tenant.fullName}
                                <Badge className={getStatusColor(tenant.status)}>
                                    {tenant.status.replace('_', ' ')}
                                </Badge>
                            </h1>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
                                {tenant.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {tenant.email}</span>}
                                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {tenant.phonePrimary}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="border-amber-800 text-amber-500 hover:bg-amber-950/30 font-mono text-xs"
                        onClick={handleInviteToPortal}
                        disabled={isInvitingPortal || !tenant.email}
                    >
                        {isInvitingPortal ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                            <Send className="mr-2 h-3 w-3" />
                        )}
                        Send Access Invite (Email)
                    </Button>
                    <Button variant="outline" className="border-border text-muted-foreground hover:text-foreground hover:bg-muted font-mono text-xs">
                        <Edit2 className="mr-2 h-3 w-3" />
                        Edit Profile
                    </Button>
                    <Button
                        variant="outline"
                        className="border-red-900 text-red-500 hover:bg-red-950/30 font-mono text-xs"
                        onClick={() => setIsDeleteDialogOpen(true)}
                    >
                        <Trash2 className="mr-2 h-3 w-3" />
                        Delete
                    </Button>
                </div>
            </div>

            {portalInviteMessage && (
                <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs font-mono text-amber-600 dark:text-amber-400 space-y-1">
                    <div>{portalInviteMessage}</div>
                    {portalInviteLink && (
                        <a
                            href={portalInviteLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block break-all text-cyan-600 dark:text-cyan-400 underline hover:text-cyan-300"
                        >
                            {portalInviteLink}
                        </a>
                    )}
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-12">
                {/* Sidebar Info */}
                <div className="space-y-6 md:col-span-4 md:order-2">
                    {/* Active Lease Summary */}
                    {activeTenancy && (
                        <Card className="bg-gradient-to-br from-amber-950/30 to-zinc-900 border-amber-800/30">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Active Lease</CardTitle>
                                    <Badge className="bg-emerald-600 text-foreground text-[10px] font-mono">ACTIVE</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Building2 className="h-5 w-5 text-amber-500" />
                                    <div>
                                        <div className="text-foreground font-mono font-medium">{activeTenancy.property?.title}</div>
                                        <div className="text-muted-foreground text-xs font-mono">{activeTenancy.property?.address}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-card/50 rounded p-2">
                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">Monthly Rent</div>
                                        <div className="text-amber-500 font-mono font-bold text-lg">
                                            {activeTenancy.rentCurrency} {activeTenancy.monthlyRent?.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="bg-card/50 rounded p-2">
                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">Days Left</div>
                                        <div className="text-foreground font-mono font-bold text-lg">
                                            {leaseProgress?.remaining || 0}
                                        </div>
                                    </div>
                                </div>

                                {leaseProgress && (
                                    <div>
                                        <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                                            <span>Lease Progress</span>
                                            <span>{Math.round(leaseProgress.percent)}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all ${leaseProgress.remaining < 30 ? 'bg-red-500' :
                                                    leaseProgress.remaining < 90 ? 'bg-amber-500' : 'bg-emerald-500'
                                                    }`}
                                                style={{ width: `${leaseProgress.percent}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                                            <span>{format(new Date(activeTenancy.leaseStartDate), 'dd MMM yyyy')}</span>
                                            <span>{format(new Date(activeTenancy.leaseEndDate), 'dd MMM yyyy')}</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {!activeTenancy && (
                        <Card className="bg-card border-border">
                            <CardContent className="py-6 text-center">
                                <Building2 className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                                <p className="text-muted-foreground font-mono text-sm">No Active Lease</p>
                                <p className="text-muted-foreground font-mono text-xs mt-1">Create a new tenancy to get started</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Source Application Link */}
                    {activeTenancy?.applicationId && (
                        <Card className="bg-blue-100 dark:bg-blue-900/20 border-blue-900/50">
                            <CardContent className="py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                        <div>
                                            <div className="text-blue-600 dark:text-blue-400 font-mono text-sm font-medium">From Application</div>
                                            <div className="text-muted-foreground text-xs">Tenant created from application</div>
                                        </div>
                                    </div>
                                    <Link href={`/dashboard/property-management/applications/${activeTenancy.applicationId}`}>
                                        <Button variant="outline" size="sm" className="border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-900/30">
                                            <Eye className="h-3 w-3 mr-2" />
                                            View Application
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Contact Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 text-sm">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-[10px] font-mono uppercase">Primary Phone</div>
                                    <div className="text-zinc-200 font-mono">{tenant.phonePrimary}</div>
                                </div>
                            </div>
                            {tenant.email && (
                                <div className="flex items-center gap-3 text-sm">
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">Email Address</div>
                                        <div className="text-zinc-200 font-mono text-sm">{tenant.email}</div>
                                    </div>
                                </div>
                            )}
                            {tenant.ghanaCardNumber && (
                                <div className="flex items-center gap-3 text-sm">
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">Ghana Card</div>
                                        <div className="text-zinc-200 font-mono">{tenant.ghanaCardNumber}</div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>

                {/* Main Content Tabs */}
                <div className="md:col-span-8 md:order-1">
                    <Tabs defaultValue="tenancies" className="w-full">
                        <TabsList className="grid grid-cols-3 sm:grid-cols-5 bg-card border border-border w-full h-auto p-1">
                            <TabsTrigger value="tenancies" className="w-full data-[state=active]:bg-amber-600 data-[state=active]:text-foreground text-muted-foreground font-mono text-xs">
                                Tenancies
                            </TabsTrigger>
                            <TabsTrigger value="utilities" className="w-full data-[state=active]:bg-amber-600 data-[state=active]:text-foreground text-muted-foreground font-mono text-xs">
                                Utilities
                            </TabsTrigger>
                            <TabsTrigger value="payments" className="w-full data-[state=active]:bg-amber-600 data-[state=active]:text-foreground text-muted-foreground font-mono text-xs">
                                Payments
                            </TabsTrigger>
                            <TabsTrigger value="maintenance" className="w-full data-[state=active]:bg-amber-600 data-[state=active]:text-foreground text-muted-foreground font-mono text-xs">
                                Maintenance
                            </TabsTrigger>
                            <TabsTrigger value="documents" className="w-full data-[state=active]:bg-amber-600 data-[state=active]:text-foreground text-muted-foreground font-mono text-xs">
                                Documents
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-4">
                            {/* Tenancies Tab */}
                            <TabsContent value="tenancies">
                                <div className="space-y-4">
                                    {tenancies.length > 0 ? tenancies.map((tenancy) => (
                                        <Card key={tenancy.id} className="bg-card border-border">
                                            <CardHeader className="flex flex-row items-start justify-between pb-2">
                                                <div>
                                                    <CardTitle className="text-base text-foreground font-mono flex items-center gap-2">
                                                        <Building2 className="h-4 w-4 text-amber-500" />
                                                        {tenancy.property?.title || 'Property'}
                                                    </CardTitle>
                                                    <CardDescription className="text-xs text-muted-foreground font-mono mt-1">
                                                        REF: {tenancy.referenceNumber}
                                                    </CardDescription>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge className={`text-[10px] font-mono uppercase ${getStatusColor(tenancy.status)}`}>
                                                        {tenancy.status}
                                                    </Badge>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="bg-background border-border w-48">
                                                            <DropdownMenuItem
                                                                className="text-muted-foreground hover:text-foreground focus:bg-muted font-mono text-xs cursor-pointer"
                                                                onClick={() => handleGenerateLease(tenancy)}
                                                            >
                                                                <FileText className="h-3 w-3 mr-2" />
                                                                Generate Lease
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="text-muted-foreground hover:text-foreground focus:bg-muted font-mono text-xs cursor-pointer"
                                                                onClick={() => openEditDialog(tenancy)}
                                                            >
                                                                <Edit2 className="h-3 w-3 mr-2" />
                                                                Edit Terms
                                                            </DropdownMenuItem>
                                                            {tenancy.status === 'active' && (
                                                                <>
                                                                    <DropdownMenuItem
                                                                        className="text-muted-foreground hover:text-foreground focus:bg-muted font-mono text-xs cursor-pointer"
                                                                        onClick={() => openRenewDialog(tenancy)}
                                                                    >
                                                                        <RefreshCw className="h-3 w-3 mr-2" />
                                                                        Renew Lease
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator className="bg-muted" />
                                                                    <DropdownMenuItem
                                                                        className="text-red-500 hover:text-red-400 focus:bg-red-950/30 font-mono text-xs cursor-pointer"
                                                                        onClick={() => openTerminateDialog(tenancy)}
                                                                    >
                                                                        <XCircle className="h-3 w-3 mr-2" />
                                                                        Terminate
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                    <div>
                                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">Start Date</div>
                                                        <div className="text-foreground font-mono">{format(new Date(tenancy.leaseStartDate), 'dd MMM yyyy')}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">End Date</div>
                                                        <div className="text-foreground font-mono">{format(new Date(tenancy.leaseEndDate), 'dd MMM yyyy')}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">Monthly Rent</div>
                                                        <div className="text-foreground font-mono">
                                                            {tenancy.rentCurrency === 'USD' ? '$' : '₵'}{tenancy.monthlyRent?.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-muted-foreground text-[10px] font-mono uppercase">Frequency</div>
                                                        <div className="text-foreground font-mono capitalize">{tenancy.paymentFreq || 'Monthly'}</div>
                                                    </div>
                                                </div>
                                                {tenancy.status === 'active' && leaseProgress && tenancy.id === activeTenancy?.id && (
                                                    <div className="mt-4 pt-4 border-t border-border">
                                                        <div className="flex justify-between text-xs text-muted-foreground font-mono mb-2">
                                                            <span>Lease Progress</span>
                                                            <span>{leaseProgress.remaining} days remaining</span>
                                                        </div>
                                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-amber-500 rounded-full transition-all"
                                                                style={{ width: `${leaseProgress.percent}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    )) : (
                                        <Card className="bg-card border-border">
                                            <CardContent className="py-12 text-center">
                                                <Building2 className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
                                                <p className="text-muted-foreground font-mono text-sm">No tenancies found</p>
                                                <Button className="mt-4 bg-amber-600 hover:bg-amber-500 text-foreground font-mono text-xs">
                                                    Create Tenancy
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            </TabsContent>


                            {/* Utility Charges Tab */}
                            <TabsContent value="utilities">
                                <Card className="bg-card border-border">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Utility Charges</CardTitle>
                                            <CardDescription className="text-xs text-muted-foreground font-mono">Bill tenant for utilities — auto-applied to rent schedule</CardDescription>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="bg-amber-600 hover:bg-amber-500 text-foreground font-mono text-xs"
                                            onClick={() => setIsAddChargeOpen(true)}
                                            disabled={!activeTenancy}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> Add Charge
                                        </Button>
                                    </CardHeader>
                                    <CardContent>
                                        {utilityCharges.length > 0 ? (
                                            <div className="space-y-3">
                                                {utilityCharges.map((charge) => {
                                                    const utilIcons: Record<string, React.ReactNode> = {
                                                        electricity: <Zap className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />,
                                                        water: <Droplets className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
                                                        gas: <Flame className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
                                                        internet: <Wifi className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />,
                                                        waste: <Trash className="h-4 w-4 text-green-600 dark:text-green-400" />,
                                                        security: <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />,
                                                    }
                                                    const statusColors: Record<string, string> = {
                                                        pending: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-900',
                                                        applied: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-900',
                                                        paid: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 border-green-900',
                                                        waived: 'bg-muted text-muted-foreground border-border',
                                                        disputed: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-900',
                                                    }
                                                    return (
                                                        <div key={charge.id} className="bg-background border border-border rounded-lg p-4 flex items-center justify-between group hover:border-border transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                                                                    {utilIcons[charge.utility_type] || <Zap className="h-4 w-4 text-muted-foreground" />}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-medium text-muted-foreground font-mono capitalize">
                                                                        {charge.utility_type.replace('_', ' ')}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground font-mono">
                                                                        {format(new Date(charge.billing_period_start), 'dd MMM')} – {format(new Date(charge.billing_period_end), 'dd MMM yyyy')}
                                                                        {charge.description && ` • ${charge.description}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-sm font-bold text-foreground font-mono">
                                                                    {charge.currency} {parseFloat(charge.amount).toFixed(2)}
                                                                </span>
                                                                <Badge className={`text-[10px] font-mono ${statusColors[charge.status] || statusColors.pending}`}>
                                                                    {charge.status}
                                                                </Badge>
                                                                {charge.status === 'pending' && (
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                                                                <MoreVertical className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end" className="bg-card border-border">
                                                                            {rentSchedules
                                                                                .filter(s => s.status !== 'paid' && s.status !== 'waived')
                                                                                .slice(0, 6)
                                                                                .map(schedule => (
                                                                                    <DropdownMenuItem
                                                                                        key={schedule.id}
                                                                                        className="text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer"
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                await propertyManagementApi.applyUtilityCharge(charge.id, schedule.id)
                                                                                                // Refresh data
                                                                                                const [chargesRes, schedulesRes] = await Promise.all([
                                                                                                    propertyManagementApi.getUtilityCharges(activeTenancy!.id),
                                                                                                    propertyManagementApi.getRentSchedules(activeTenancy!.id)
                                                                                                ])
                                                                                                setUtilityCharges(chargesRes.charges || [])
                                                                                                setRentSchedules(schedulesRes.schedules || [])
                                                                                            } catch (err) { console.error('Failed to apply charge', err) }
                                                                                        }}
                                                                                    >
                                                                                        Apply to Period {schedule.period_number} ({format(new Date(schedule.period_start_date), 'MMM yyyy')})
                                                                                    </DropdownMenuItem>
                                                                                ))}
                                                                            <DropdownMenuSeparator className="bg-muted" />
                                                                            <DropdownMenuItem
                                                                                className="text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer"
                                                                                onClick={async () => {
                                                                                    try {
                                                                                        await propertyManagementApi.updateUtilityCharge(charge.id, { status: 'waived' } as any)
                                                                                        const res = await propertyManagementApi.getUtilityCharges(activeTenancy!.id)
                                                                                        setUtilityCharges(res.charges || [])
                                                                                    } catch { }
                                                                                }}
                                                                            >
                                                                                Waive Charge
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem
                                                                                className="text-xs font-mono text-red-600 dark:text-red-400 hover:text-red-300 cursor-pointer"
                                                                                onClick={async () => {
                                                                                    try {
                                                                                        await propertyManagementApi.deleteUtilityCharge(charge.id)
                                                                                        setUtilityCharges(prev => prev.filter(c => c.id !== charge.id))
                                                                                    } catch { }
                                                                                }}
                                                                            >
                                                                                Delete
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                )}
                                                                {charge.status === 'applied' && charge.schedule_period_number && (
                                                                    <span className="text-[10px] text-muted-foreground font-mono">
                                                                        → Period {charge.schedule_period_number}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                                {/* Summary */}
                                                <div className="border-t border-border pt-3 mt-2 flex justify-between items-center">
                                                    <span className="text-xs text-muted-foreground font-mono">{utilityCharges.length} charge{utilityCharges.length !== 1 ? 's' : ''}</span>
                                                    <span className="text-sm font-bold text-amber-500 font-mono">
                                                        Total: GHS {utilityCharges.reduce((sum, c) => sum + parseFloat(c.amount), 0).toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="py-12 text-center">
                                                <Zap className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
                                                <p className="text-muted-foreground font-mono text-sm">No utility charges yet</p>
                                                <p className="text-muted-foreground font-mono text-xs mt-1">Add a utility charge to bill the tenant</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="payments">
                                <Card className="bg-card border-border">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Payment History</CardTitle>
                                        <Badge variant="outline" className="border-green-900 text-green-500 font-mono text-[10px]">
                                            Auto-synced from Tenant Portal
                                        </Badge>
                                    </CardHeader>
                                    <CardContent>
                                        {payments.length > 0 ? (
                                            <div className="space-y-4">
                                                {payments.map((payment) => (
                                                    <div key={payment.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                                                                <CheckCircle className="h-5 w-5 text-green-500" />
                                                            </div>
                                                            <div>
                                                                <div className="text-foreground font-medium font-mono">{payment.category || 'Rent'}</div>
                                                                <div className="text-xs text-muted-foreground font-mono">{payment.transactionDate || payment.createdAt ? format(new Date(payment.transactionDate || payment.createdAt), 'dd MMM yyyy') : '—'}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-foreground font-medium font-mono">
                                                                {payment.currency === 'USD' ? '$' : '₵'}{payment.amount?.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-12 text-center">
                                                <CreditCard className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
                                                <p className="text-muted-foreground font-mono text-sm">No payments recorded</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Maintenance Tab */}
                            <TabsContent value="maintenance">
                                <Card className="bg-card border-border">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Maintenance Requests</CardTitle>
                                        <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px]">
                                            {maintenanceRequests.length} request{maintenanceRequests.length !== 1 ? 's' : ''}
                                        </Badge>
                                    </CardHeader>
                                    <CardContent>
                                        {maintenanceRequests.length > 0 ? (
                                            <div className="space-y-4">
                                                {maintenanceRequests.map((wo) => (
                                                    <Link key={wo.id} href={`/dashboard/property-management/maintenance/${wo.id}`}>
                                                        <div className="bg-background border border-border rounded-lg p-4 hover:border-amber-800 transition-colors cursor-pointer">
                                                            <div className="flex items-start justify-between mb-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                                                                        <Wrench className="h-5 w-5 text-amber-500" />
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-foreground font-medium font-mono text-sm">{wo.title}</div>
                                                                        <div className="text-xs text-muted-foreground font-mono">{wo.referenceNumber}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline" className={`font-mono text-[10px] ${wo.priority === 'critical' ? 'border-red-900 text-red-500' :
                                                                        wo.priority === 'high' ? 'border-orange-900 text-orange-500' :
                                                                            wo.priority === 'medium' ? 'border-amber-900 text-amber-500' :
                                                                                'border-border text-muted-foreground'
                                                                        }`}>
                                                                        {wo.priority}
                                                                    </Badge>
                                                                    <Badge variant="outline" className={`font-mono text-[10px] ${wo.status === 'open' ? 'border-cyan-900 text-cyan-500' :
                                                                        wo.status === 'in_progress' ? 'border-blue-900 text-blue-500' :
                                                                            wo.status === 'completed' ? 'border-green-900 text-green-500' :
                                                                                wo.status === 'cancelled' ? 'border-red-900 text-red-500' :
                                                                                    'border-border text-muted-foreground'
                                                                        }`}>
                                                                        {wo.status?.replace(/_/g, ' ')}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                            {wo.description && (
                                                                <p className="text-xs text-muted-foreground font-mono mb-3 line-clamp-2">{wo.description}</p>
                                                            )}
                                                            <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-mono">
                                                                <span className="capitalize">{wo.category?.replace(/_/g, ' ')}</span>
                                                                {wo.scheduledDate && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>Scheduled: {format(new Date(wo.scheduledDate), 'dd MMM yyyy')}</span>
                                                                    </>
                                                                )}
                                                                {wo.createdAt && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>Reported: {format(new Date(wo.createdAt), 'dd MMM yyyy')}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-12 text-center">
                                                <Wrench className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
                                                <p className="text-muted-foreground font-mono text-sm">No maintenance requests from tenant</p>
                                                <p className="text-muted-foreground font-mono text-xs mt-1">Requests submitted via the tenant portal will appear here</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Documents Tab */}
                            <TabsContent value="documents">
                                <Card className="bg-card border-border">
                                    <CardHeader>
                                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Document Vault</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid md:grid-cols-2 gap-4">
                                            {tenancies.map((tenancy) => (
                                                <div key={tenancy.id} className="bg-background border border-border rounded-lg p-3 flex items-center justify-between group hover:border-border transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <FileText className="h-6 w-6 text-amber-500" />
                                                        <div>
                                                            <div className="text-sm font-medium text-muted-foreground group-hover:text-foreground font-mono">
                                                                {tenancy.leaseSignedUrl ? 'Signed Lease Agreement' : 'Tenancy Agreement'}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground font-mono">
                                                                {tenancy.referenceNumber} • {format(new Date(tenancy.leaseStartDate), 'MMM yyyy')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                        disabled={!getLeaseDocUrl(tenancy)}
                                                        onClick={() => openLeaseDocument(tenancy)}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            {tenantDocuments.map((document) => (
                                                <div key={document.id} className="bg-background border border-border rounded-lg p-3 flex items-center justify-between group hover:border-border transition-colors">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-muted-foreground group-hover:text-foreground font-mono truncate">
                                                                {document.title}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground font-mono truncate">
                                                                {document.documentType.replace(/_/g, ' ')} • {document.fileName}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0"
                                                        onClick={() => window.open(document.fileUrl, '_blank', 'noopener,noreferrer')}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                className="bg-background border border-dashed border-border rounded-lg p-3 flex items-center justify-center cursor-pointer hover:bg-card hover:border-border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                disabled={!activeTenancy}
                                                onClick={() => setIsUploadDocumentOpen(true)}
                                            >
                                                <div className="text-sm text-muted-foreground flex items-center gap-2 font-mono">
                                                    <Upload className="h-4 w-4" /> Upload Document
                                                </div>
                                            </button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>

                    <div className="mt-6 grid gap-6 xl:grid-cols-2">
                        {/* Lease Signing Workflow */}
                        {activeTenancy && (
                            <Card className="bg-card border-border">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Lease Document</CardTitle>
                                        <Badge className={`text-[10px] font-mono ${leaseSigningState.status === 'none' ? 'bg-zinc-700 text-muted-foreground' :
                                            leaseSigningState.status === 'draft' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-800' :
                                                leaseSigningState.status === 'pending_sign' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800' :
                                                    leaseSigningState.status === 'partially_signed' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800' :
                                                        leaseSigningState.status === 'signed' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 border-emerald-800' :
                                                            leaseSigningState.status === 'expired' ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border-red-800' :
                                                                'bg-zinc-700 text-muted-foreground'
                                            }`}>
                                            {leaseSigningState.label}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-muted-foreground text-xs font-mono mt-1">
                                        {leaseSigningState.description}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center justify-between text-[10px] font-mono">
                                        <div className={`flex flex-col items-center ${leaseSigningState.status !== 'none' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${leaseSigningState.status !== 'none' ? 'bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-700' : 'bg-muted border border-border'}`}>
                                                {leaseSigningState.status !== 'none' ? <CheckCircle className="w-3 h-3" /> : '1'}
                                            </div>
                                            <span>Draft</span>
                                        </div>
                                        <div className={`flex-1 h-0.5 mx-2 ${['pending_sign', 'partially_signed', 'signed'].includes(leaseSigningState.status) ? 'bg-emerald-700' : 'bg-muted'}`} />
                                        <div className={`flex flex-col items-center ${['pending_sign', 'partially_signed', 'signed'].includes(leaseSigningState.status) ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${['pending_sign', 'partially_signed', 'signed'].includes(leaseSigningState.status) ? 'bg-amber-100 dark:bg-amber-900/50 border border-amber-700' : 'bg-muted border border-border'}`}>
                                                {['signed'].includes(leaseSigningState.status) ? <CheckCircle className="w-3 h-3" /> : '2'}
                                            </div>
                                            <span>Sent</span>
                                        </div>
                                        <div className={`flex-1 h-0.5 mx-2 ${leaseSigningState.status === 'signed' ? 'bg-emerald-700' : 'bg-muted'}`} />
                                        <div className={`flex flex-col items-center ${leaseSigningState.status === 'signed' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${leaseSigningState.status === 'signed' ? 'bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-700' : 'bg-muted border border-border'}`}>
                                                {leaseSigningState.status === 'signed' ? <CheckCircle className="w-3 h-3" /> : '3'}
                                            </div>
                                            <span>Signed</span>
                                        </div>
                                    </div>

                                    {leaseSigningState.signers && leaseSigningState.signers.length > 0 && (
                                        <div className="bg-muted/50 rounded p-2 space-y-2">
                                            <p className="text-[10px] font-mono text-muted-foreground uppercase">Signers</p>
                                            {leaseSigningState.signers.map((signer, i) => (
                                                <div key={i} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${signer.signed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                        <span className="text-muted-foreground font-mono">{signer.name}</span>
                                                    </div>
                                                    <span className={`text-[10px] font-mono ${signer.signed ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                        {signer.signed ? 'Signed' : 'Pending'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="space-y-2 pt-1">
                                        {leaseSigningState.status === 'none' && (
                                            <Button
                                                className="w-full bg-amber-600 hover:bg-amber-700 text-foreground font-mono text-xs"
                                                onClick={() => handleGenerateLease()}
                                            >
                                                <FileText className="h-3 w-3 mr-2" />
                                                Generate Lease Agreement
                                            </Button>
                                        )}

                                        {leaseSigningState.status === 'draft' && (
                                            <>
                                                <Button
                                                    className="w-full bg-amber-600 hover:bg-amber-700 text-foreground font-mono text-xs"
                                                    onClick={() => handleGenerateLease()}
                                                >
                                                    <Send className="h-3 w-3 mr-2" />
                                                    Send for Signing
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                                    onClick={() => handleGenerateLease()}
                                                >
                                                    <Edit2 className="h-3 w-3 mr-2" />
                                                    Edit Draft
                                                </Button>
                                            </>
                                        )}

                                        {(leaseSigningState.status === 'pending_sign' || leaseSigningState.status === 'partially_signed') && (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-amber-800 text-amber-500 hover:bg-amber-950/30 font-mono text-xs"
                                                >
                                                    <Send className="h-3 w-3 mr-2" />
                                                    Send Reminder
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                                    onClick={() => handleGenerateLease()}
                                                >
                                                    <Eye className="h-3 w-3 mr-2" />
                                                    View Document
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-red-900/50 text-red-500 hover:bg-red-950/30 font-mono text-xs"
                                                    onClick={() => setLeaseSigningState({
                                                        status: 'voided',
                                                        label: 'Voided',
                                                        description: 'This signing request was cancelled',
                                                        color: 'red'
                                                    })}
                                                >
                                                    <XCircle className="h-3 w-3 mr-2" />
                                                    Void Request
                                                </Button>
                                            </>
                                        )}

                                        {leaseSigningState.status === 'signed' && (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                                    disabled={!getLeaseDocUrl(activeTenancy)}
                                                    onClick={() => openLeaseDocument(activeTenancy)}
                                                >
                                                    <Download className="h-3 w-3 mr-2" />
                                                    Download Signed Lease
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                                    disabled={!getLeaseDocUrl(activeTenancy)}
                                                    onClick={() => openLeaseDocument(activeTenancy)}
                                                >
                                                    <Eye className="h-3 w-3 mr-2" />
                                                    View Document
                                                </Button>
                                            </>
                                        )}

                                        {(leaseSigningState.status === 'expired' || leaseSigningState.status === 'voided') && (
                                            <Button
                                                className="w-full bg-amber-600 hover:bg-amber-700 text-foreground font-mono text-xs"
                                                onClick={() => {
                                                    setLeaseSigningState({
                                                        status: 'none',
                                                        label: 'No Lease Document',
                                                        description: 'Generate a lease agreement to get started',
                                                        color: 'zinc'
                                                    })
                                                }}
                                            >
                                                <FileText className="h-3 w-3 mr-2" />
                                                Create New Lease
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Quick Actions */}
                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Button
                                    variant="outline"
                                    onClick={() => router.push(`/dashboard/property-management/messages?tenantId=${tenantId}`)}
                                    className="w-full justify-start border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                >
                                    <MessageSquare className="h-3 w-3 mr-2" />
                                    Send Message
                                </Button>

                                {activeTenancy && (
                                    <>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                            onClick={() => {
                                                setSelectedTenancy(activeTenancy)
                                                setRenewForm({
                                                    duration: '1',
                                                    newEndDate: format(addYears(new Date(activeTenancy.leaseEndDate), 1), 'yyyy-MM-dd'),
                                                    newMonthlyRent: activeTenancy.monthlyRent
                                                })
                                                setIsRenewDialogOpen(true)
                                            }}
                                        >
                                            <RefreshCw className="h-3 w-3 mr-2" />
                                            Renew Lease
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                                            onClick={() => {
                                                setSelectedTenancy(activeTenancy)
                                                setEditForm({
                                                    monthlyRent: activeTenancy.monthlyRent,
                                                    leaseEndDate: format(new Date(activeTenancy.leaseEndDate), 'yyyy-MM-dd'),
                                                    paymentFreq: activeTenancy.paymentFreq || 'monthly'
                                                })
                                                setIsEditDialogOpen(true)
                                            }}
                                        >
                                            <Edit2 className="h-3 w-3 mr-2" />
                                            Edit Lease / Increase Rent
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start border-red-900/50 text-red-500 hover:bg-red-950/30 font-mono text-xs"
                                            onClick={() => {
                                                setSelectedTenancy(activeTenancy)
                                                setIsTerminateDialogOpen(true)
                                            }}
                                        >
                                            <XCircle className="h-3 w-3 mr-2" />
                                            Terminate Lease
                                        </Button>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            <Dialog open={isUploadDocumentOpen} onOpenChange={setIsUploadDocumentOpen}>
                <DialogContent className="bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-amber-500 uppercase">Upload Tenant Document</DialogTitle>
                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                            Add identity, proof of address, or supporting files to this tenant vault.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Document Type</Label>
                            <Select
                                value={documentForm.documentType}
                                onValueChange={(value) => setDocumentForm(prev => ({ ...prev, documentType: value as PropertyDocumentType }))}
                            >
                                <SelectTrigger className="bg-background border-border text-muted-foreground font-mono text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value={PropertyDocumentType.TENANT_AGREEMENTS}>Tenant ID / Ghana Card</SelectItem>
                                    <SelectItem value={PropertyDocumentType.UTILITY_BILLS}>Proof of Address</SelectItem>
                                    <SelectItem value={PropertyDocumentType.CORRESPONDENCE}>Correspondence</SelectItem>
                                    <SelectItem value={PropertyDocumentType.OTHER}>Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Title</Label>
                            <Input
                                value={documentForm.title}
                                onChange={(event) => setDocumentForm(prev => ({ ...prev, title: event.target.value }))}
                                placeholder="Ghana Card - Cedyn"
                                className="bg-background border-border text-muted-foreground font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">File</Label>
                            <Input
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                                className="bg-background border-border text-muted-foreground font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Notes</Label>
                            <Textarea
                                value={documentForm.description}
                                onChange={(event) => setDocumentForm(prev => ({ ...prev, description: event.target.value }))}
                                placeholder="Optional notes for this document"
                                className="bg-background border-border text-muted-foreground font-mono text-xs min-h-20"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="border-border text-muted-foreground font-mono text-xs"
                            onClick={() => setIsUploadDocumentOpen(false)}
                            disabled={isUploadingDocument}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-700 text-foreground font-mono text-xs"
                            onClick={handleUploadTenantDocument}
                            disabled={isUploadingDocument || !documentFile || !activeTenancy}
                        >
                            {isUploadingDocument ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Upload className="h-3 w-3 mr-2" />}
                            Upload Document
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Tenancy Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="bg-background border-border">
                    <DialogHeader>
                        <DialogTitle className="text-amber-500 font-mono uppercase">Edit Tenancy</DialogTitle>
                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                            Update lease terms for {selectedTenancy?.referenceNumber}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Monthly Rent</Label>
                            <Input
                                type="number"
                                value={editForm.monthlyRent}
                                onChange={(e) => setEditForm(prev => ({ ...prev, monthlyRent: parseFloat(e.target.value) || 0 }))}
                                className="bg-background border-border text-foreground font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Lease End Date</Label>
                            <Input
                                type="date"
                                value={editForm.leaseEndDate}
                                onChange={(e) => setEditForm(prev => ({ ...prev, leaseEndDate: e.target.value }))}
                                className="bg-background border-border text-foreground font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Payment Frequency</Label>
                            <Select value={editForm.paymentFreq} onValueChange={(v) => setEditForm(prev => ({ ...prev, paymentFreq: v }))}>
                                <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-background border-border">
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                    <SelectItem value="annually">Annually</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-border text-muted-foreground font-mono text-xs" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                        <Button className="bg-amber-600 hover:bg-amber-500 text-foreground font-mono text-xs" onClick={handleSaveEdit} disabled={isSavingEdit}>
                            {isSavingEdit ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Terminate Dialog */}
            <AlertDialog open={isTerminateDialogOpen} onOpenChange={setIsTerminateDialogOpen}>
                <AlertDialogContent className="bg-background border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground font-mono uppercase flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Terminate Tenancy
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
                            This will end the tenancy <span className="text-amber-500">{selectedTenancy?.referenceNumber}</span>.
                            The property will be marked as available.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Termination Date</Label>
                            <Input type="date" value={terminateForm.terminationDate} onChange={(e) => setTerminateForm(prev => ({ ...prev, terminationDate: e.target.value }))} className="bg-background border-border text-foreground font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Reason (Optional)</Label>
                            <Textarea placeholder="Reason..." value={terminateForm.reason} onChange={(e) => setTerminateForm(prev => ({ ...prev, reason: e.target.value }))} className="bg-background border-border text-foreground font-mono text-sm resize-none" />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-card border-border text-muted-foreground font-mono text-xs">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleTerminate} disabled={isTerminating} className="bg-red-600 hover:bg-red-500 text-foreground font-mono text-xs">
                            {isTerminating ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <XCircle className="h-3 w-3 mr-2" />}
                            Terminate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Renew Dialog */}
            <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
                <DialogContent className="bg-background border-border">
                    <DialogHeader>
                        <DialogTitle className="text-amber-500 font-mono uppercase flex items-center gap-2">
                            <RefreshCw className="h-5 w-5" />
                            Renew Lease
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                            Extend the lease for {tenant.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {selectedTenancy && (
                            <div className="p-3 bg-card rounded-lg border border-border">
                                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                    <div>
                                        <span className="text-muted-foreground">Current End:</span>
                                        <p className="text-foreground">{format(new Date(selectedTenancy.leaseEndDate), 'dd MMM yyyy')}</p>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Current Rent:</span>
                                        <p className="text-foreground">{selectedTenancy.rentCurrency} {selectedTenancy.monthlyRent?.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Duration</Label>
                            <Select value={renewForm.duration} onValueChange={handleDurationChange}>
                                <SelectTrigger className="bg-background border-border text-foreground font-mono"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-background border-border">
                                    <SelectItem value="6m">6 Months</SelectItem>
                                    <SelectItem value="1">1 Year</SelectItem>
                                    <SelectItem value="2">2 Years</SelectItem>
                                    <SelectItem value="3">3 Years</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">New End Date</Label>
                            <Input type="date" value={renewForm.newEndDate} onChange={(e) => setRenewForm(prev => ({ ...prev, newEndDate: e.target.value }))} className="bg-background border-border text-foreground font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">New Monthly Rent</Label>
                            <Input type="number" value={renewForm.newMonthlyRent} onChange={(e) => setRenewForm(prev => ({ ...prev, newMonthlyRent: parseFloat(e.target.value) || 0 }))} className="bg-background border-border text-foreground font-mono" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-border text-muted-foreground font-mono text-xs" onClick={() => setIsRenewDialogOpen(false)}>Cancel</Button>
                        <Button className="bg-amber-600 hover:bg-amber-500 text-foreground font-mono text-xs" onClick={handleRenew} disabled={isRenewing}>
                            {isRenewing ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                            Renew Lease
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Tenant Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-background border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground font-mono uppercase flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Delete Tenant
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
                            Are you sure you want to delete <span className="text-amber-500">{tenant.fullName}</span>?
                            This will also remove all associated tenancies and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-card border-border text-muted-foreground font-mono text-xs">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteTenant} disabled={isDeleting} className="bg-red-600 hover:bg-red-500 text-foreground font-mono text-xs">
                            {isDeleting ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Trash2 className="h-3 w-3 mr-2" />}
                            Delete Tenant
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Add Utility Charge Dialog */}
            <Dialog open={isAddChargeOpen} onOpenChange={setIsAddChargeOpen}>
                <DialogContent className="bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-amber-500">Add Utility Charge</DialogTitle>
                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                            Bill the tenant for a utility cost. Upload evidence in the Documents tab.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="text-xs font-mono text-muted-foreground">Utility Type</Label>
                            <Select value={chargeForm.utilityType} onValueChange={(v) => setChargeForm(f => ({ ...f, utilityType: v as UtilityType }))}>
                                <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    {[
                                        { value: 'electricity', label: 'Electricity' },
                                        { value: 'water', label: 'Water' },
                                        { value: 'gas', label: 'Gas' },
                                        { value: 'internet', label: 'Internet / Cable' },
                                        { value: 'waste', label: 'Waste Collection' },
                                        { value: 'security', label: 'Security' },
                                        { value: 'sewage', label: 'Sewage' },
                                        { value: 'maintenance', label: 'Common Area Maintenance' },
                                        { value: 'other', label: 'Other' },
                                    ].map(opt => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-muted-foreground font-mono text-sm">{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs font-mono text-muted-foreground">Period Start</Label>
                                <Input
                                    type="date"
                                    value={chargeForm.billingPeriodStart}
                                    onChange={e => setChargeForm(f => ({ ...f, billingPeriodStart: e.target.value }))}
                                    className="bg-background border-border text-foreground font-mono text-sm mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs font-mono text-muted-foreground">Period End</Label>
                                <Input
                                    type="date"
                                    value={chargeForm.billingPeriodEnd}
                                    onChange={e => setChargeForm(f => ({ ...f, billingPeriodEnd: e.target.value }))}
                                    className="bg-background border-border text-foreground font-mono text-sm mt-1"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs font-mono text-muted-foreground">Amount (GHS)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={chargeForm.amount}
                                onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))}
                                placeholder="0.00"
                                className="bg-background border-border text-foreground font-mono text-sm mt-1"
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-mono text-muted-foreground">Description (optional)</Label>
                            <Textarea
                                value={chargeForm.description}
                                onChange={e => setChargeForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="e.g. ECG bill for January 2026"
                                className="bg-background border-border text-foreground font-mono text-sm mt-1 resize-none"
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsAddChargeOpen(false)} className="text-muted-foreground font-mono text-xs">Cancel</Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-500 text-foreground font-mono text-xs"
                            disabled={!chargeForm.billingPeriodStart || !chargeForm.billingPeriodEnd || !chargeForm.amount || isSubmittingCharge}
                            onClick={async () => {
                                if (!activeTenancy) return
                                setIsSubmittingCharge(true)
                                try {
                                    await propertyManagementApi.createUtilityCharge(activeTenancy.id, {
                                        utilityType: chargeForm.utilityType,
                                        billingPeriodStart: chargeForm.billingPeriodStart,
                                        billingPeriodEnd: chargeForm.billingPeriodEnd,
                                        amount: parseFloat(chargeForm.amount),
                                        description: chargeForm.description || undefined
                                    })
                                    const res = await propertyManagementApi.getUtilityCharges(activeTenancy.id)
                                    setUtilityCharges(res.charges || [])
                                    setIsAddChargeOpen(false)
                                    setChargeForm({ utilityType: 'electricity', billingPeriodStart: '', billingPeriodEnd: '', amount: '', description: '' })
                                } catch (err) { console.error('Failed to create charge', err) }
                                finally { setIsSubmittingCharge(false) }
                            }}
                        >
                            {isSubmittingCharge ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Plus className="h-3 w-3 mr-2" />}
                            Add Charge
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
