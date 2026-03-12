'use client'

import React, { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    Home,
    User,
    Calendar,
    CreditCard,
    FileText,
    AlertTriangle,
    CheckCircle,
    MoreVertical,
    Download,
    Loader2,
    Phone,
    Mail,
    Edit3,
    XCircle,
    RefreshCw,
    CalendarDays,
    DollarSign,
    Building2,
    Clock,
    AlertCircle,
    Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
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
import { propertyManagementApi } from '@/lib/property-management-api'
import { Tenancy, FinancialRecord } from '@/types/property-management'
import { format, differenceInDays, addYears } from 'date-fns'

export default function LeaseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [tenancy, setTenancy] = useState<Tenancy | null>(null)
    const [payments, setPayments] = useState<FinancialRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Edit dialog state
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [editForm, setEditForm] = useState({
        monthlyRent: 0,
        leaseEndDate: '',
        paymentFreq: 'monthly'
    })
    const [isSavingEdit, setIsSavingEdit] = useState(false)
    
    // Terminate dialog state
    const [isTerminateDialogOpen, setIsTerminateDialogOpen] = useState(false)
    const [terminateForm, setTerminateForm] = useState({
        terminationDate: format(new Date(), 'yyyy-MM-dd'),
        reason: ''
    })
    const [isTerminating, setIsTerminating] = useState(false)
    
    // Renew dialog state
    const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false)
    const [renewForm, setRenewForm] = useState({
        newEndDate: '',
        newMonthlyRent: 0,
        duration: '1'
    })
    const [isRenewing, setIsRenewing] = useState(false)

    // Load tenancy data
    useEffect(() => {
        const loadTenancy = async () => {
            try {
                setIsLoading(true)
                const data = await propertyManagementApi.getTenancyById(id)
                setTenancy(data)
                
                // Set edit form defaults
                setEditForm({
                    monthlyRent: data.monthlyRent || 0,
                    leaseEndDate: data.leaseEndDate ? format(new Date(data.leaseEndDate), 'yyyy-MM-dd') : '',
                    paymentFreq: data.paymentFreq || 'monthly'
                })
                
                // Set renew form defaults
                const currentEnd = new Date(data.leaseEndDate)
                setRenewForm({
                    newEndDate: format(addYears(currentEnd, 1), 'yyyy-MM-dd'),
                    newMonthlyRent: data.monthlyRent || 0,
                    duration: '1'
                })
                
                // Load payments for this property
                if (data.propertyId) {
                    const financials = await propertyManagementApi.getFinancials({ 
                        propertyId: data.propertyId,
                        limit: 20 
                    })
                    const paymentsData = Array.isArray(financials) ? financials : financials.data || []
                    setPayments(paymentsData.filter(f => f.recordType === 'income'))
                }
            } catch (err) {
                console.error('Failed to load tenancy:', err)
                setError('Failed to load lease details. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }
        loadTenancy()
    }, [id])

    // Calculate lease progress
    const leaseProgress = useMemo(() => {
        if (!tenancy) return { percent: 0, remaining: 0, total: 0 }
        const start = new Date(tenancy.leaseStartDate)
        const end = new Date(tenancy.leaseEndDate)
        const now = new Date()
        const total = differenceInDays(end, start)
        const elapsed = differenceInDays(now, start)
        const remaining = differenceInDays(end, now)
        const percent = Math.min(100, Math.max(0, (elapsed / total) * 100))
        return { percent, remaining: Math.max(0, remaining), total }
    }, [tenancy])

    // Get initials
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
    }

    // Handle edit
    const handleEdit = async () => {
        if (!tenancy) return
        try {
            setIsSavingEdit(true)
            await propertyManagementApi.updateTenancy(tenancy.id, {
                monthlyRent: editForm.monthlyRent,
                leaseEndDate: editForm.leaseEndDate,
                paymentFreq: editForm.paymentFreq as any
            })
            // Reload tenancy
            const updated = await propertyManagementApi.getTenancyById(id)
            setTenancy(updated)
            setIsEditDialogOpen(false)
        } catch (err) {
            console.error('Failed to update tenancy:', err)
        } finally {
            setIsSavingEdit(false)
        }
    }

    // Handle terminate
    const handleTerminate = async () => {
        if (!tenancy) return
        try {
            setIsTerminating(true)
            await propertyManagementApi.terminateTenancy(
                tenancy.id, 
                terminateForm.terminationDate,
                terminateForm.reason
            )
            router.push('/dashboard/property-management/leases')
        } catch (err) {
            console.error('Failed to terminate tenancy:', err)
        } finally {
            setIsTerminating(false)
        }
    }

    // Handle renew
    const handleRenew = async () => {
        if (!tenancy) return
        try {
            setIsRenewing(true)
            await propertyManagementApi.renewTenancy(
                tenancy.id,
                renewForm.newEndDate,
                renewForm.newMonthlyRent
            )
            // Reload tenancy
            const updated = await propertyManagementApi.getTenancyById(id)
            setTenancy(updated)
            setIsRenewDialogOpen(false)
        } catch (err) {
            console.error('Failed to renew tenancy:', err)
        } finally {
            setIsRenewing(false)
        }
    }

    // Update renew form when duration changes
    const handleDurationChange = (duration: string) => {
        if (!tenancy) return
        const currentEnd = new Date(tenancy.leaseEndDate)
        let newEnd: Date
        switch (duration) {
            case '6m':
                newEnd = new Date(currentEnd)
                newEnd.setMonth(newEnd.getMonth() + 6)
                break
            case '2':
                newEnd = addYears(currentEnd, 2)
                break
            case '3':
                newEnd = addYears(currentEnd, 3)
                break
            default:
                newEnd = addYears(currentEnd, 1)
        }
        setRenewForm(prev => ({
            ...prev,
            duration,
            newEndDate: format(newEnd, 'yyyy-MM-dd')
        }))
    }

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'active': return 'bg-green-900/40 text-green-500 border-green-900'
            case 'expired': return 'bg-red-900/40 text-red-500 border-red-900'
            case 'terminated': return 'bg-zinc-800 text-zinc-400 border-zinc-700'
            case 'pending': return 'bg-amber-900/40 text-amber-500 border-amber-900'
            default: return 'bg-zinc-800 text-zinc-400 border-zinc-700'
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                <p className="text-zinc-500 font-mono text-xs mt-4 uppercase">Loading lease details...</p>
            </div>
        )
    }

    if (error || !tenancy) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-500 font-mono text-sm">{error || 'Lease not found'}</p>
                <Link href="/dashboard/property-management/leases">
                    <Button variant="outline" className="mt-4 border-zinc-800 text-zinc-400">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Leases
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
                    <Link href="/dashboard/property-management/leases">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
                                {tenancy.referenceNumber}
                            </h1>
                            <Badge className={getStatusColor(tenancy.status)}>
                                {tenancy.status}
                            </Badge>
                        </div>
                        <p className="text-sm text-zinc-500 font-mono">Lease Agreement Details</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 font-mono text-xs"
                        onClick={() => setIsEditDialogOpen(true)}
                    >
                        <Edit3 className="h-3 w-3 mr-2" />
                        Edit
                    </Button>
                    <Button 
                        variant="outline" 
                        className="border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-900 hover:bg-red-950/30 font-mono text-xs"
                        onClick={() => setIsTerminateDialogOpen(true)}
                        disabled={tenancy.status === 'terminated' || tenancy.status === 'expired'}
                    >
                        <XCircle className="h-3 w-3 mr-2" />
                        Terminate
                    </Button>
                    <Button 
                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold font-mono text-xs"
                        onClick={() => setIsRenewDialogOpen(true)}
                    >
                        <RefreshCw className="h-3 w-3 mr-2" />
                        Renew Lease
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Left Column: Property & Tenant Summary */}
                <div className="space-y-6">
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Property</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                                    <Building2 className="h-5 w-5 text-amber-500" />
                                </div>
                                <div>
                                    <div className="text-zinc-200 font-medium font-mono">{tenancy.property?.title || 'Property'}</div>
                                    <div className="text-zinc-500 text-xs font-mono">{(tenancy.property as any)?.unitNumber || ''}</div>
                                </div>
                            </div>
                            <div className="text-sm text-zinc-400 font-mono">
                                {tenancy.property?.address || ''}
                            </div>
                            {tenancy.propertyId && (
                                <Link href={`/dashboard/property-management/properties/${tenancy.propertyId}`}>
                                    <Button variant="outline" size="sm" className="w-full border-zinc-700 text-zinc-300 font-mono text-xs">
                                        View Property
                                    </Button>
                                </Link>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Tenant</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border-2 border-zinc-700">
                                    <AvatarFallback className="bg-zinc-800 text-amber-500 font-mono font-bold">
                                        {tenancy.tenant ? getInitials(tenancy.tenant.fullName) : 'TN'}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="text-zinc-200 font-medium font-mono">{tenancy.tenant?.fullName || 'Tenant'}</div>
                                    <div className="text-zinc-500 text-xs font-mono">{tenancy.tenantId?.substring(0, 12)}...</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {tenancy.tenant?.email && (
                                    <div className="flex items-center text-sm text-zinc-400 gap-2 font-mono">
                                        <Mail className="h-3 w-3 text-zinc-600" /> {tenancy.tenant.email}
                                    </div>
                                )}
                                {tenancy.tenant?.phonePrimary && (
                                    <div className="flex items-center text-sm text-zinc-400 gap-2 font-mono">
                                        <Phone className="h-3 w-3 text-zinc-600" /> {tenancy.tenant.phonePrimary}
                                    </div>
                                )}
                            </div>
                            {tenancy.tenantId && (
                                <Link href={`/dashboard/property-management/tenants/${tenancy.tenantId}`}>
                                    <Button variant="outline" size="sm" className="w-full border-zinc-700 text-zinc-300 font-mono text-xs">
                                        View Tenant Profile
                                    </Button>
                                </Link>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Detailed Tabs/Cards */}
                <div className="md:col-span-2 space-y-6">
                    {/* Key Terms */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Lease Terms</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="space-y-1">
                                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Start Date</div>
                                    <div className="text-white font-medium font-mono">
                                        {format(new Date(tenancy.leaseStartDate), 'yyyy-MM-dd')}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">End Date</div>
                                    <div className="text-white font-medium font-mono">
                                        {format(new Date(tenancy.leaseEndDate), 'yyyy-MM-dd')}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Rent Amount</div>
                                    <div className="text-white font-medium font-mono">
                                        {tenancy.rentCurrency === 'USD' ? '$' : '₵'}{tenancy.monthlyRent?.toLocaleString()}
                                    </div>
                                    <div className="text-zinc-500 text-[10px] font-mono capitalize">{tenancy.paymentFreq || 'Monthly'}</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Security Deposit</div>
                                    <div className="text-white font-medium font-mono">
                                        {tenancy.rentCurrency === 'USD' ? '$' : '₵'}{tenancy.securityDeposit?.toLocaleString() || tenancy.monthlyRent?.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-400 font-mono text-xs">Lease Progress</span>
                                    <span className="text-zinc-400 font-mono text-xs">{leaseProgress.remaining} Days remaining</span>
                                </div>
                                <Progress value={leaseProgress.percent} className="h-2 bg-zinc-800" />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Payments */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Payment History</CardTitle>
                            <Button variant="ghost" size="sm" className="text-amber-500 hover:text-amber-400 hover:bg-amber-950/30 font-mono text-xs">
                                Record Payment
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {payments.length > 0 ? (
                                <div className="space-y-4">
                                    {payments.map((payment) => (
                                        <div key={payment.id} className="flex items-center justify-between border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-green-900/20 flex items-center justify-center">
                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                </div>
                                                <div>
                                                    <div className="text-zinc-200 font-medium text-sm font-mono">{payment.category || 'Rent'}</div>
                                                    <div className="text-zinc-500 text-xs font-mono">
                                                        {format(new Date(payment.recordDate), 'yyyy-MM-dd')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-white font-medium text-sm font-mono">
                                                    {payment.currency === 'USD' ? '$' : '₵'}{payment.amount?.toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 border border-dashed border-zinc-800 rounded-lg">
                                    <CreditCard className="h-8 w-8 text-zinc-800 mx-auto mb-2" />
                                    <p className="text-zinc-500 font-mono text-xs">No payments recorded yet</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Documents */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Documents</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex items-center justify-between group hover:border-zinc-700 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-6 w-6 text-amber-500" />
                                        <div>
                                            <div className="text-sm font-medium text-zinc-300 group-hover:text-white font-mono">Tenancy Agreement</div>
                                            <div className="text-xs text-zinc-500 font-mono">
                                                {format(new Date(tenancy.leaseStartDate), 'dd MMM yyyy')}
                                            </div>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white">
                                        <Download className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-lg p-3 flex items-center justify-center cursor-pointer hover:bg-zinc-900 hover:border-zinc-700 transition-colors">
                                    <div className="text-sm text-zinc-500 flex items-center gap-2 font-mono">
                                        <Upload className="h-4 w-4" /> Upload Document
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-amber-500 font-mono uppercase">Edit Lease</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-mono text-xs">
                            Update lease terms for {tenancy.referenceNumber}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Monthly Rent ({tenancy.rentCurrency})</Label>
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
                            <Select 
                                value={editForm.paymentFreq} 
                                onValueChange={(v) => setEditForm(prev => ({ ...prev, paymentFreq: v }))}
                            >
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
                        <Button
                            variant="outline"
                            className="border-zinc-800 text-zinc-400 font-mono text-xs"
                            onClick={() => setIsEditDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs"
                            onClick={handleEdit}
                            disabled={isSavingEdit}
                        >
                            {isSavingEdit ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
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
                            Terminate Lease
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400 font-mono text-xs">
                            This will end the tenancy agreement for <span className="text-amber-500">{tenancy.referenceNumber}</span>. 
                            The tenant will be notified and the property will be marked as available.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Termination Date</Label>
                            <Input
                                type="date"
                                value={terminateForm.terminationDate}
                                onChange={(e) => setTerminateForm(prev => ({ ...prev, terminationDate: e.target.value }))}
                                className="bg-black border-zinc-800 text-white font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Reason (Optional)</Label>
                            <Textarea
                                placeholder="Reason for termination..."
                                value={terminateForm.reason}
                                onChange={(e) => setTerminateForm(prev => ({ ...prev, reason: e.target.value }))}
                                className="bg-black border-zinc-800 text-white font-mono text-sm resize-none"
                            />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white font-mono text-xs uppercase">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleTerminate}
                            disabled={isTerminating}
                            className="bg-red-600 hover:bg-red-500 text-white font-mono text-xs uppercase"
                        >
                            {isTerminating ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Terminating...
                                </>
                            ) : (
                                <>
                                    <XCircle className="h-3 w-3 mr-2" />
                                    Terminate Lease
                                </>
                            )}
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
                            Extend the lease for {tenancy.tenant?.fullName || 'this tenant'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                <div>
                                    <span className="text-zinc-500">Current End Date:</span>
                                    <p className="text-white">{format(new Date(tenancy.leaseEndDate), 'dd MMM yyyy')}</p>
                                </div>
                                <div>
                                    <span className="text-zinc-500">Current Rent:</span>
                                    <p className="text-white">{tenancy.rentCurrency} {tenancy.monthlyRent?.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Renewal Duration</Label>
                            <Select value={renewForm.duration} onValueChange={handleDurationChange}>
                                <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                    <SelectValue />
                                </SelectTrigger>
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
                            <Input
                                type="date"
                                value={renewForm.newEndDate}
                                onChange={(e) => setRenewForm(prev => ({ ...prev, newEndDate: e.target.value }))}
                                className="bg-black border-zinc-800 text-white font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-zinc-500">New Monthly Rent ({tenancy.rentCurrency})</Label>
                            <Input
                                type="number"
                                value={renewForm.newMonthlyRent}
                                onChange={(e) => setRenewForm(prev => ({ ...prev, newMonthlyRent: parseFloat(e.target.value) || 0 }))}
                                className="bg-black border-zinc-800 text-white font-mono"
                            />
                            <p className="text-[10px] text-zinc-600 font-mono">Leave unchanged for same rent amount</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="border-zinc-800 text-zinc-400 font-mono text-xs"
                            onClick={() => setIsRenewDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs"
                            onClick={handleRenew}
                            disabled={isRenewing}
                        >
                            {isRenewing ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Renewing...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-3 w-3 mr-2" />
                                    Renew Lease
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
