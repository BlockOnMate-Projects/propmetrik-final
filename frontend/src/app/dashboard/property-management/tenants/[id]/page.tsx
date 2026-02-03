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
    Eye
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
import { propertyManagementApi } from '@/lib/property-management-api'
import { openLeaseAgreement, LeaseAgreementData } from '@/lib/lease-generator'
import { Tenant, Tenancy, FinancialRecord } from '@/types/property-management'
import { format, differenceInDays, addYears } from 'date-fns'

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

export default function TenantDetailsPage() {
    const router = useRouter()
    const params = useParams()
    const tenantId = params.id as string
    
    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [tenancies, setTenancies] = useState<Tenancy[]>([])
    const [payments, setPayments] = useState<FinancialRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Lease signing status (would come from backend in production)
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

    // Load tenant data
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true)
                const [tenantData, tenanciesRes] = await Promise.all([
                    propertyManagementApi.getTenantById(tenantId),
                    propertyManagementApi.getTenancies({ limit: 50 })
                ])
                setTenant(tenantData)
                
                const allTenancies = Array.isArray(tenanciesRes) ? tenanciesRes : tenanciesRes.data || []
                const tenantTenancies = allTenancies.filter(t => t.tenantId === tenantId)
                setTenancies(tenantTenancies)
                
                // Load payments if there's an active tenancy
                const active = tenantTenancies.find(t => t.status === 'active')
                if (active?.propertyId) {
                    const financials = await propertyManagementApi.getFinancials({ propertyId: active.propertyId, limit: 20 })
                    const data = Array.isArray(financials) ? financials : financials.data || []
                    setPayments(data.filter(f => f.recordType === 'income'))
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
            case 'active': return 'bg-green-900/40 text-green-500 border-green-900'
            case 'expired': return 'bg-red-900/40 text-red-500 border-red-900'
            case 'terminated': return 'bg-zinc-800 text-zinc-400 border-zinc-700'
            case 'pending': case 'pending_verification': return 'bg-amber-900/40 text-amber-500 border-amber-900'
            default: return 'bg-zinc-800 text-zinc-400 border-zinc-700'
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
                <p className="text-zinc-500 font-mono text-xs mt-4 uppercase">Loading tenant profile...</p>
            </div>
        )
    }

    if (error || !tenant) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-500 font-mono text-sm">{error || 'Tenant not found'}</p>
                <Link href="/dashboard/property-management/tenants">
                    <Button variant="outline" className="mt-4 border-zinc-800 text-zinc-400">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Tenants
                    </Button>
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/tenants">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 border-2 border-amber-600">
                            <AvatarFallback className="bg-zinc-900 text-amber-500 font-mono font-bold text-lg">
                                {getInitials(tenant.fullName)}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-white font-mono flex items-center gap-3">
                                {tenant.fullName}
                                <Badge className={getStatusColor(tenant.status)}>
                                    {tenant.status.replace('_', ' ')}
                                </Badge>
                            </h1>
                            <div className="flex items-center gap-3 text-sm text-zinc-500 font-mono">
                                {tenant.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {tenant.email}</span>}
                                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {tenant.phonePrimary}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 font-mono text-xs">
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

            <div className="grid gap-6 md:grid-cols-3">
                {/* Sidebar Info */}
                <div className="space-y-6">
                    {/* Active Lease Summary */}
                    {activeTenancy && (
                        <Card className="bg-gradient-to-br from-amber-950/30 to-zinc-900 border-amber-800/30">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Active Lease</CardTitle>
                                    <Badge className="bg-emerald-600 text-white text-[10px] font-mono">ACTIVE</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Building2 className="h-5 w-5 text-amber-500" />
                                    <div>
                                        <div className="text-white font-mono font-medium">{activeTenancy.property?.title}</div>
                                        <div className="text-zinc-500 text-xs font-mono">{activeTenancy.property?.address}</div>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-zinc-900/50 rounded p-2">
                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">Monthly Rent</div>
                                        <div className="text-amber-500 font-mono font-bold text-lg">
                                            {activeTenancy.rentCurrency} {activeTenancy.monthlyRent?.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900/50 rounded p-2">
                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">Days Left</div>
                                        <div className="text-white font-mono font-bold text-lg">
                                            {leaseProgress?.remaining || 0}
                                        </div>
                                    </div>
                                </div>
                                
                                {leaseProgress && (
                                    <div>
                                        <div className="flex justify-between text-[10px] font-mono text-zinc-500 mb-1">
                                            <span>Lease Progress</span>
                                            <span>{Math.round(leaseProgress.percent)}%</span>
                                        </div>
                                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all ${
                                                    leaseProgress.remaining < 30 ? 'bg-red-500' : 
                                                    leaseProgress.remaining < 90 ? 'bg-amber-500' : 'bg-emerald-500'
                                                }`}
                                                style={{ width: `${leaseProgress.percent}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[10px] font-mono text-zinc-600 mt-1">
                                            <span>{format(new Date(activeTenancy.leaseStartDate), 'dd MMM yyyy')}</span>
                                            <span>{format(new Date(activeTenancy.leaseEndDate), 'dd MMM yyyy')}</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {!activeTenancy && (
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardContent className="py-6 text-center">
                                <Building2 className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                                <p className="text-zinc-500 font-mono text-sm">No Active Lease</p>
                                <p className="text-zinc-600 font-mono text-xs mt-1">Create a new tenancy to get started</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Source Application Link */}
                    {activeTenancy?.applicationId && (
                        <Card className="bg-blue-900/20 border-blue-900/50">
                            <CardContent className="py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-5 w-5 text-blue-400" />
                                        <div>
                                            <div className="text-blue-400 font-mono text-sm font-medium">From Application</div>
                                            <div className="text-zinc-500 text-xs">Tenant created from application</div>
                                        </div>
                                    </div>
                                    <Link href={`/dashboard/property-management/applications/${activeTenancy.applicationId}`}>
                                        <Button variant="outline" size="sm" className="border-blue-800 text-blue-400 hover:bg-blue-900/30">
                                            <Eye className="h-3 w-3 mr-2" />
                                            View Application
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Contact Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 text-sm">
                                <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                    <Phone className="h-4 w-4 text-zinc-400" />
                                </div>
                                <div>
                                    <div className="text-zinc-500 text-[10px] font-mono uppercase">Primary Phone</div>
                                    <div className="text-zinc-200 font-mono">{tenant.phonePrimary}</div>
                                </div>
                            </div>
                            {tenant.email && (
                                <div className="flex items-center gap-3 text-sm">
                                    <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                        <Mail className="h-4 w-4 text-zinc-400" />
                                    </div>
                                    <div>
                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">Email Address</div>
                                        <div className="text-zinc-200 font-mono text-sm">{tenant.email}</div>
                                    </div>
                                </div>
                            )}
                            {tenant.ghanaCardNumber && (
                                <div className="flex items-center gap-3 text-sm">
                                    <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-zinc-400" />
                                    </div>
                                    <div>
                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">Ghana Card</div>
                                        <div className="text-zinc-200 font-mono">{tenant.ghanaCardNumber}</div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Lease Signing Workflow */}
                    {activeTenancy && (
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-mono uppercase text-amber-500">Lease Document</CardTitle>
                                    <Badge className={`text-[10px] font-mono ${
                                        leaseSigningState.status === 'none' ? 'bg-zinc-700 text-zinc-400' :
                                        leaseSigningState.status === 'draft' ? 'bg-blue-900/50 text-blue-400 border-blue-800' :
                                        leaseSigningState.status === 'pending_sign' ? 'bg-amber-900/50 text-amber-400 border-amber-800' :
                                        leaseSigningState.status === 'partially_signed' ? 'bg-amber-900/50 text-amber-400 border-amber-800' :
                                        leaseSigningState.status === 'signed' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800' :
                                        leaseSigningState.status === 'expired' ? 'bg-red-900/50 text-red-400 border-red-800' :
                                        'bg-zinc-700 text-zinc-400'
                                    }`}>
                                        {leaseSigningState.label}
                                    </Badge>
                                </div>
                                <CardDescription className="text-zinc-500 text-xs font-mono mt-1">
                                    {leaseSigningState.description}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {/* Workflow Steps Visual */}
                                <div className="flex items-center justify-between text-[10px] font-mono">
                                    <div className={`flex flex-col items-center ${leaseSigningState.status !== 'none' ? 'text-emerald-500' : 'text-zinc-600'}`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${leaseSigningState.status !== 'none' ? 'bg-emerald-900/50 border border-emerald-700' : 'bg-zinc-800 border border-zinc-700'}`}>
                                            {leaseSigningState.status !== 'none' ? <CheckCircle className="w-3 h-3" /> : '1'}
                                        </div>
                                        <span>Draft</span>
                                    </div>
                                    <div className={`flex-1 h-0.5 mx-2 ${['pending_sign', 'partially_signed', 'signed'].includes(leaseSigningState.status) ? 'bg-emerald-700' : 'bg-zinc-800'}`} />
                                    <div className={`flex flex-col items-center ${['pending_sign', 'partially_signed', 'signed'].includes(leaseSigningState.status) ? 'text-amber-500' : 'text-zinc-600'}`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${['pending_sign', 'partially_signed', 'signed'].includes(leaseSigningState.status) ? 'bg-amber-900/50 border border-amber-700' : 'bg-zinc-800 border border-zinc-700'}`}>
                                            {['signed'].includes(leaseSigningState.status) ? <CheckCircle className="w-3 h-3" /> : '2'}
                                        </div>
                                        <span>Sent</span>
                                    </div>
                                    <div className={`flex-1 h-0.5 mx-2 ${leaseSigningState.status === 'signed' ? 'bg-emerald-700' : 'bg-zinc-800'}`} />
                                    <div className={`flex flex-col items-center ${leaseSigningState.status === 'signed' ? 'text-emerald-500' : 'text-zinc-600'}`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${leaseSigningState.status === 'signed' ? 'bg-emerald-900/50 border border-emerald-700' : 'bg-zinc-800 border border-zinc-700'}`}>
                                            {leaseSigningState.status === 'signed' ? <CheckCircle className="w-3 h-3" /> : '3'}
                                        </div>
                                        <span>Signed</span>
                                    </div>
                                </div>

                                {/* Signers Status (if sent) */}
                                {leaseSigningState.signers && leaseSigningState.signers.length > 0 && (
                                    <div className="bg-zinc-800/50 rounded p-2 space-y-2">
                                        <p className="text-[10px] font-mono text-zinc-500 uppercase">Signers</p>
                                        {leaseSigningState.signers.map((signer, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${signer.signed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                    <span className="text-zinc-300 font-mono">{signer.name}</span>
                                                </div>
                                                <span className={`text-[10px] font-mono ${signer.signed ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {signer.signed ? 'Signed' : 'Pending'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Action Buttons based on status */}
                                <div className="space-y-2 pt-1">
                                    {leaseSigningState.status === 'none' && (
                                        <Button 
                                            className="w-full bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
                                            onClick={() => handleGenerateLease()}
                                        >
                                            <FileText className="h-3 w-3 mr-2" />
                                            Generate Lease Agreement
                                        </Button>
                                    )}
                                    
                                    {leaseSigningState.status === 'draft' && (
                                        <>
                                            <Button 
                                                className="w-full bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
                                                onClick={() => handleGenerateLease()}
                                            >
                                                <Send className="h-3 w-3 mr-2" />
                                                Send for Signing
                                            </Button>
                                            <Button 
                                                variant="outline"
                                                className="w-full border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
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
                                                className="w-full border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
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
                                                className="w-full border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
                                            >
                                                <Download className="h-3 w-3 mr-2" />
                                                Download Signed Lease
                                            </Button>
                                            <Button 
                                                variant="outline"
                                                className="w-full border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
                                                onClick={() => handleGenerateLease()}
                                            >
                                                <Eye className="h-3 w-3 mr-2" />
                                                View Document
                                            </Button>
                                        </>
                                    )}
                                    
                                    {(leaseSigningState.status === 'expired' || leaseSigningState.status === 'voided') && (
                                        <Button 
                                            className="w-full bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
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
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button variant="outline" className="w-full justify-start border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs">
                                <MessageSquare className="h-3 w-3 mr-2" />
                                Send Message
                            </Button>
                            <Button variant="outline" className="w-full justify-start border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs">
                                <CreditCard className="h-3 w-3 mr-2" />
                                Record Payment
                            </Button>
                            {activeTenancy && (
                                <>
                                    <Button 
                                        variant="outline" 
                                        className="w-full justify-start border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
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
                                        className="w-full justify-start border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
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

                {/* Main Content Tabs */}
                <div className="md:col-span-2">
                    <Tabs defaultValue="tenancies" className="w-full">
                        <TabsList className="bg-zinc-900 border border-zinc-800 w-full justify-start h-auto p-1">
                            <TabsTrigger value="tenancies" className="data-[state=active]:bg-amber-600 data-[state=active]:text-black text-zinc-400 font-mono text-xs">
                                Tenancies
                            </TabsTrigger>
                            <TabsTrigger value="payments" className="data-[state=active]:bg-amber-600 data-[state=active]:text-black text-zinc-400 font-mono text-xs">
                                Payments
                            </TabsTrigger>
                            <TabsTrigger value="documents" className="data-[state=active]:bg-amber-600 data-[state=active]:text-black text-zinc-400 font-mono text-xs">
                                Documents
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-4">
                            {/* Tenancies Tab */}
                            <TabsContent value="tenancies">
                                <div className="space-y-4">
                                    {tenancies.length > 0 ? tenancies.map((tenancy) => (
                                        <Card key={tenancy.id} className="bg-zinc-900 border-zinc-800">
                                            <CardHeader className="flex flex-row items-start justify-between pb-2">
                                                <div>
                                                    <CardTitle className="text-base text-white font-mono flex items-center gap-2">
                                                        <Building2 className="h-4 w-4 text-amber-500" />
                                                        {tenancy.property?.title || 'Property'}
                                                    </CardTitle>
                                                    <CardDescription className="text-xs text-zinc-500 font-mono mt-1">
                                                        REF: {tenancy.referenceNumber}
                                                    </CardDescription>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge className={`text-[10px] font-mono uppercase ${getStatusColor(tenancy.status)}`}>
                                                        {tenancy.status}
                                                    </Badge>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0 text-zinc-500 hover:text-white">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800 w-48">
                                                            <DropdownMenuItem 
                                                                className="text-zinc-300 hover:text-white focus:bg-zinc-800 font-mono text-xs cursor-pointer"
                                                                onClick={() => handleGenerateLease(tenancy)}
                                                            >
                                                                <FileText className="h-3 w-3 mr-2" />
                                                                Generate Lease
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem 
                                                                className="text-zinc-300 hover:text-white focus:bg-zinc-800 font-mono text-xs cursor-pointer"
                                                                onClick={() => openEditDialog(tenancy)}
                                                            >
                                                                <Edit2 className="h-3 w-3 mr-2" />
                                                                Edit Terms
                                                            </DropdownMenuItem>
                                                            {tenancy.status === 'active' && (
                                                                <>
                                                                    <DropdownMenuItem 
                                                                        className="text-zinc-300 hover:text-white focus:bg-zinc-800 font-mono text-xs cursor-pointer"
                                                                        onClick={() => openRenewDialog(tenancy)}
                                                                    >
                                                                        <RefreshCw className="h-3 w-3 mr-2" />
                                                                        Renew Lease
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator className="bg-zinc-800" />
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
                                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">Start Date</div>
                                                        <div className="text-white font-mono">{format(new Date(tenancy.leaseStartDate), 'dd MMM yyyy')}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">End Date</div>
                                                        <div className="text-white font-mono">{format(new Date(tenancy.leaseEndDate), 'dd MMM yyyy')}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">Monthly Rent</div>
                                                        <div className="text-white font-mono">
                                                            {tenancy.rentCurrency === 'USD' ? '$' : '₵'}{tenancy.monthlyRent?.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-zinc-500 text-[10px] font-mono uppercase">Frequency</div>
                                                        <div className="text-white font-mono capitalize">{tenancy.paymentFreq || 'Monthly'}</div>
                                                    </div>
                                                </div>
                                                {tenancy.status === 'active' && leaseProgress && tenancy.id === activeTenancy?.id && (
                                                    <div className="mt-4 pt-4 border-t border-zinc-800">
                                                        <div className="flex justify-between text-xs text-zinc-500 font-mono mb-2">
                                                            <span>Lease Progress</span>
                                                            <span>{leaseProgress.remaining} days remaining</span>
                                                        </div>
                                                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
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
                                        <Card className="bg-zinc-900 border-zinc-800">
                                            <CardContent className="py-12 text-center">
                                                <Building2 className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
                                                <p className="text-zinc-500 font-mono text-sm">No tenancies found</p>
                                                <Button className="mt-4 bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs">
                                                    Create Tenancy
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            </TabsContent>

                            {/* Payments Tab */}
                            <TabsContent value="payments">
                                <Card className="bg-zinc-900 border-zinc-800">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Payment History</CardTitle>
                                        <Button variant="ghost" className="text-amber-500 hover:text-amber-400 font-mono text-xs">
                                            Record Payment
                                        </Button>
                                    </CardHeader>
                                    <CardContent>
                                        {payments.length > 0 ? (
                                            <div className="space-y-4">
                                                {payments.map((payment) => (
                                                    <div key={payment.id} className="flex items-center justify-between border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full bg-green-900/20 flex items-center justify-center">
                                                                <CheckCircle className="h-5 w-5 text-green-500" />
                                                            </div>
                                                            <div>
                                                                <div className="text-white font-medium font-mono">{payment.category || 'Rent'}</div>
                                                                <div className="text-xs text-zinc-500 font-mono">{format(new Date(payment.recordDate), 'dd MMM yyyy')}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-white font-medium font-mono">
                                                                {payment.currency === 'USD' ? '$' : '₵'}{payment.amount?.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-12 text-center">
                                                <CreditCard className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
                                                <p className="text-zinc-500 font-mono text-sm">No payments recorded</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Documents Tab */}
                            <TabsContent value="documents">
                                <Card className="bg-zinc-900 border-zinc-800">
                                    <CardHeader>
                                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Document Vault</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid md:grid-cols-2 gap-4">
                                            {tenancies.map((tenancy) => (
                                                <div key={tenancy.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex items-center justify-between group hover:border-zinc-700 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <FileText className="h-6 w-6 text-amber-500" />
                                                        <div>
                                                            <div className="text-sm font-medium text-zinc-300 group-hover:text-white font-mono">
                                                                Tenancy Agreement
                                                            </div>
                                                            <div className="text-xs text-zinc-500 font-mono">
                                                                {tenancy.referenceNumber} • {format(new Date(tenancy.leaseStartDate), 'MMM yyyy')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white">
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-lg p-3 flex items-center justify-center cursor-pointer hover:bg-zinc-900 hover:border-zinc-700 transition-colors">
                                                <div className="text-sm text-zinc-500 flex items-center gap-2 font-mono">
                                                    <Upload className="h-4 w-4" /> Upload Document
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>

            {/* Edit Tenancy Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-amber-500 font-mono uppercase">Edit Tenancy</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-mono text-xs">
                            Update lease terms for {selectedTenancy?.referenceNumber}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Monthly Rent</Label>
                            <Input
                                type="number"
                                value={editForm.monthlyRent}
                                onChange={(e) => setEditForm(prev => ({ ...prev, monthlyRent: parseFloat(e.target.value) || 0 }))}
                                className="bg-black border-zinc-800 text-white font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Lease End Date</Label>
                            <Input
                                type="date"
                                value={editForm.leaseEndDate}
                                onChange={(e) => setEditForm(prev => ({ ...prev, leaseEndDate: e.target.value }))}
                                className="bg-black border-zinc-800 text-white font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Payment Frequency</Label>
                            <Select value={editForm.paymentFreq} onValueChange={(v) => setEditForm(prev => ({ ...prev, paymentFreq: v }))}>
                                <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-zinc-800">
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                    <SelectItem value="annually">Annually</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-zinc-800 text-zinc-400 font-mono text-xs" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                        <Button className="bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs" onClick={handleSaveEdit} disabled={isSavingEdit}>
                            {isSavingEdit ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Terminate Dialog */}
            <AlertDialog open={isTerminateDialogOpen} onOpenChange={setIsTerminateDialogOpen}>
                <AlertDialogContent className="bg-zinc-950 border-zinc-800">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white font-mono uppercase flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Terminate Tenancy
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400 font-mono text-xs">
                            This will end the tenancy <span className="text-amber-500">{selectedTenancy?.referenceNumber}</span>. 
                            The property will be marked as available.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Termination Date</Label>
                            <Input type="date" value={terminateForm.terminationDate} onChange={(e) => setTerminateForm(prev => ({ ...prev, terminationDate: e.target.value }))} className="bg-black border-zinc-800 text-white font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Reason (Optional)</Label>
                            <Textarea placeholder="Reason..." value={terminateForm.reason} onChange={(e) => setTerminateForm(prev => ({ ...prev, reason: e.target.value }))} className="bg-black border-zinc-800 text-white font-mono text-sm resize-none" />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-900 border-zinc-800 text-zinc-400 font-mono text-xs">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleTerminate} disabled={isTerminating} className="bg-red-600 hover:bg-red-500 text-white font-mono text-xs">
                            {isTerminating ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <XCircle className="h-3 w-3 mr-2" />}
                            Terminate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Renew Dialog */}
            <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
                <DialogContent className="bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-amber-500 font-mono uppercase flex items-center gap-2">
                            <RefreshCw className="h-5 w-5" />
                            Renew Lease
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500 font-mono text-xs">
                            Extend the lease for {tenant.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {selectedTenancy && (
                            <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                    <div>
                                        <span className="text-zinc-500">Current End:</span>
                                        <p className="text-white">{format(new Date(selectedTenancy.leaseEndDate), 'dd MMM yyyy')}</p>
                                    </div>
                                    <div>
                                        <span className="text-zinc-500">Current Rent:</span>
                                        <p className="text-white">{selectedTenancy.rentCurrency} {selectedTenancy.monthlyRent?.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Duration</Label>
                            <Select value={renewForm.duration} onValueChange={handleDurationChange}>
                                <SelectTrigger className="bg-black border-zinc-800 text-white font-mono"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-zinc-800">
                                    <SelectItem value="6m">6 Months</SelectItem>
                                    <SelectItem value="1">1 Year</SelectItem>
                                    <SelectItem value="2">2 Years</SelectItem>
                                    <SelectItem value="3">3 Years</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">New End Date</Label>
                            <Input type="date" value={renewForm.newEndDate} onChange={(e) => setRenewForm(prev => ({ ...prev, newEndDate: e.target.value }))} className="bg-black border-zinc-800 text-white font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">New Monthly Rent</Label>
                            <Input type="number" value={renewForm.newMonthlyRent} onChange={(e) => setRenewForm(prev => ({ ...prev, newMonthlyRent: parseFloat(e.target.value) || 0 }))} className="bg-black border-zinc-800 text-white font-mono" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="border-zinc-800 text-zinc-400 font-mono text-xs" onClick={() => setIsRenewDialogOpen(false)}>Cancel</Button>
                        <Button className="bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs" onClick={handleRenew} disabled={isRenewing}>
                            {isRenewing ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                            Renew Lease
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Tenant Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-zinc-950 border-zinc-800">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white font-mono uppercase flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Delete Tenant
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400 font-mono text-xs">
                            Are you sure you want to delete <span className="text-amber-500">{tenant.fullName}</span>? 
                            This will also remove all associated tenancies and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-900 border-zinc-800 text-zinc-400 font-mono text-xs">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteTenant} disabled={isDeleting} className="bg-red-600 hover:bg-red-500 text-white font-mono text-xs">
                            {isDeleting ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Trash2 className="h-3 w-3 mr-2" />}
                            Delete Tenant
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
