
'use client'

import React, { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft,
    MapPin,
    Wrench,
    AlertTriangle,
    Clock,
    User,
    CheckCircle2,
    MoreVertical,
    Phone,
    MessageSquare,
    Calendar,
    FileText,
    Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { propertyManagementApi } from '@/lib/property-management-api'
import { WorkOrder, WorkOrderStatus, Vendor } from '@/types/property-management'
import { format } from 'date-fns'

const statusConfig: Record<string, { label: string; className: string }> = {
    open: { label: 'Open', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-500 border-blue-900' },
    assigned: { label: 'Assigned', className: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-500 border-cyan-900' },
    in_progress: { label: 'In Progress', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-500 border-amber-900' },
    pending_approval: { label: 'Pending Approval', className: 'bg-purple-100 dark:bg-purple-900/40 text-purple-500 border-purple-900' },
    completed: { label: 'Completed', className: 'bg-green-100 dark:bg-green-900/40 text-green-500 border-green-900' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 dark:bg-red-900/40 text-red-500 border-red-900' },
}

const priorityConfig: Record<string, { label: string; className: string }> = {
    low: { label: 'Low', className: 'border-border text-muted-foreground' },
    medium: { label: 'Medium', className: 'border-yellow-900 text-yellow-500 bg-yellow-100 dark:bg-yellow-900/10' },
    high: { label: 'High', className: 'border-orange-900 text-orange-500 bg-orange-100 dark:bg-orange-900/10' },
    urgent: { label: 'Urgent', className: 'border-red-900 text-red-500 bg-red-100 dark:bg-red-900/10' },
    critical: { label: 'Critical', className: 'border-red-900 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20' },
}

export default function WorkOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()

    const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null)
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Action states
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [selectedVendorId, setSelectedVendorId] = useState('')
    const [assignDate, setAssignDate] = useState('')
    const [assignTimeStart, setAssignTimeStart] = useState('')
    const [assignTimeEnd, setAssignTimeEnd] = useState('')
    const [showCompleteModal, setShowCompleteModal] = useState(false)
    const [completionNotes, setCompletionNotes] = useState('')
    const [actualCost, setActualCost] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        loadWorkOrder()
        loadVendors()
    }, [id])

    const loadWorkOrder = async () => {
        try {
            setIsLoading(true)
            const data = await propertyManagementApi.getWorkOrderById(id)
            setWorkOrder(data)
        } catch (err: any) {
            setError(err.message || 'Failed to load work order')
        } finally {
            setIsLoading(false)
        }
    }

    const loadVendors = async () => {
        try {
            const result = await propertyManagementApi.getVendors({ limit: 100 })
            const list = Array.isArray(result) ? result : result.data || []
            setVendors(list)
        } catch (err) {
            // Non-critical, vendor list just won't populate
        }
    }

    const handleAssign = async () => {
        if (!selectedVendorId) return
        setActionLoading(true)
        try {
            const updated = await propertyManagementApi.assignWorkOrder(id, selectedVendorId, {
                scheduledDate: assignDate || undefined,
                scheduledTimeStart: assignTimeStart || undefined,
                scheduledTimeEnd: assignTimeEnd || undefined,
            })
            setWorkOrder(updated)
            setShowAssignModal(false)
            setSelectedVendorId('')
            setAssignDate('')
            setAssignTimeStart('')
            setAssignTimeEnd('')
        } catch (err: any) {
            alert(err.message || 'Failed to assign vendor')
        } finally {
            setActionLoading(false)
        }
    }

    const handleComplete = async () => {
        if (!completionNotes || !actualCost) return
        setActionLoading(true)
        try {
            const updated = await propertyManagementApi.completeWorkOrder(id, {
                actualCost: parseFloat(actualCost),
                completionNotes
            })
            setWorkOrder(updated)
            setShowCompleteModal(false)
            setCompletionNotes('')
            setActualCost('')
        } catch (err: any) {
            alert(err.message || 'Failed to complete work order')
        } finally {
            setActionLoading(false)
        }
    }

    const handleStatusChange = async (newStatus: string) => {
        setActionLoading(true)
        try {
            const updated = await propertyManagementApi.updateWorkOrder(id, { status: newStatus as WorkOrderStatus })
            setWorkOrder(updated)
        } catch (err: any) {
            alert(err.message || 'Failed to update status')
        } finally {
            setActionLoading(false)
        }
    }

    const handleCancel = async () => {
        if (!confirm('Are you sure you want to cancel this work order?')) return
        await handleStatusChange(WorkOrderStatus.CANCELLED)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
            </div>
        )
    }

    if (error || !workOrder) {
        return (
            <div className="space-y-4 text-center py-24">
                <p className="text-red-500 font-mono">{error || 'Work order not found'}</p>
                <Link href="/dashboard/property-management/maintenance">
                    <Button variant="outline" className="border-border text-muted-foreground">Back to Maintenance</Button>
                </Link>
            </div>
        )
    }

    const st = statusConfig[workOrder.status] || statusConfig.open
    const pr = priorityConfig[workOrder.priority] || priorityConfig.medium
    const vendorName = workOrder.assignedTo || workOrder.vendor?.businessName || (workOrder.assignedVendorId ? workOrder.assignedVendorId.substring(0, 8) : null)
    const isTerminal = workOrder.status === WorkOrderStatus.COMPLETED || workOrder.status === WorkOrderStatus.CANCELLED

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/maintenance">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
                                {workOrder.referenceNumber || workOrder.id.substring(0, 8).toUpperCase()}
                            </h1>
                            <Badge className={st.className}>{st.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">Maintenance Request Details</p>
                    </div>
                </div>
                {!isTerminal && (
                    <div className="flex items-center gap-2">
                        {!workOrder.assignedVendorId && (
                            <Button
                                variant="outline"
                                className="border-cyan-800 text-cyan-600 dark:text-cyan-400 hover:text-foreground hover:bg-cyan-900/30"
                                onClick={() => setShowAssignModal(true)}
                            >
                                <User className="mr-2 h-4 w-4" />
                                Assign Vendor
                            </Button>
                        )}
                        <Button
                            className="bg-green-600 hover:bg-green-500 text-foreground"
                            onClick={() => setShowCompleteModal(true)}
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Mark Complete
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Left Column: Ticket Info */}
                <div className="md:col-span-2 space-y-6">
                    {/* Summary Card */}
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl font-bold text-foreground mb-1">{workOrder.title}</CardTitle>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <MapPin className="h-3 w-3" />
                                        {workOrder.property?.title || workOrder.propertyId?.substring(0, 8)}
                                    </div>
                                </div>
                                <Badge variant="outline" className={pr.className}>{pr.label} Priority</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {workOrder.description && (
                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed bg-background/50 p-4 rounded-md border border-border">
                                        {workOrder.description}
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground uppercase font-mono">Category</label>
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                                        <Wrench className="h-4 w-4 text-muted-foreground" />
                                        {workOrder.category?.replace(/_/g, ' ').toUpperCase()}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground uppercase font-mono">Reported</label>
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        {workOrder.dateReported
                                            ? format(new Date(workOrder.dateReported), 'dd MMM yyyy')
                                            : workOrder.createdAt
                                            ? format(new Date(workOrder.createdAt), 'dd MMM yyyy')
                                            : '—'}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground uppercase font-mono">Vendor</label>
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        {vendorName || 'Unassigned'}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground uppercase font-mono">Scheduled</label>
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        {workOrder.scheduledDate
                                            ? format(new Date(workOrder.scheduledDate), 'dd MMM yyyy')
                                            : '—'}
                                    </div>
                                </div>
                            </div>

                            {workOrder.estimatedCost && (
                                <div className="pt-2 border-t border-border">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs text-muted-foreground uppercase font-mono">Estimated Cost</label>
                                            <div className="text-muted-foreground text-sm font-medium font-mono">
                                                GHS {Number(workOrder.estimatedCost).toLocaleString()}
                                            </div>
                                        </div>
                                        {workOrder.actualCost && (
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground uppercase font-mono">Actual Cost</label>
                                                <div className="text-muted-foreground text-sm font-medium font-mono">
                                                    GHS {Number(workOrder.actualCost).toLocaleString()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {workOrder.completionNotes && (
                                <div className="pt-2 border-t border-border">
                                    <label className="text-xs text-muted-foreground uppercase font-mono">Completion Notes</label>
                                    <p className="text-sm text-muted-foreground mt-1">{workOrder.completionNotes}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Assign Vendor Panel */}
                    {showAssignModal && (
                        <Card className="bg-card border-cyan-800">
                            <CardHeader>
                                <CardTitle className="text-base text-foreground">Assign Vendor</CardTitle>
                                <CardDescription className="text-muted-foreground font-mono text-xs">
                                    Select a vendor to handle this work order
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                                    <SelectTrigger className="bg-background border-border text-zinc-200">
                                        <SelectValue placeholder="Select a vendor..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        {vendors.map(v => (
                                            <SelectItem key={v.id} value={v.id} className="text-zinc-200 focus:bg-muted focus:text-foreground">
                                                {v.businessName} — {v.contactPerson}
                                            </SelectItem>
                                        ))}
                                        {vendors.length === 0 && (
                                            <SelectItem value="none" disabled className="text-muted-foreground">
                                                No vendors found
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground font-mono text-xs uppercase">Scheduled Visit Date</Label>
                                    <Input
                                        type="date"
                                        value={assignDate}
                                        onChange={e => setAssignDate(e.target.value)}
                                        className="bg-background border-border text-zinc-200"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground font-mono text-xs uppercase">From</Label>
                                        <Input
                                            type="time"
                                            value={assignTimeStart}
                                            onChange={e => setAssignTimeStart(e.target.value)}
                                            className="bg-background border-border text-zinc-200"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground font-mono text-xs uppercase">To</Label>
                                        <Input
                                            type="time"
                                            value={assignTimeEnd}
                                            onChange={e => setAssignTimeEnd(e.target.value)}
                                            className="bg-background border-border text-zinc-200"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">The vendor is notified by email/SMS and the tenant sees who is coming and when.</p>
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" className="text-muted-foreground" onClick={() => { setShowAssignModal(false); setSelectedVendorId('') }}>
                                        Cancel
                                    </Button>
                                    <Button
                                        className="bg-cyan-600 hover:bg-cyan-500 text-foreground"
                                        onClick={handleAssign}
                                        disabled={!selectedVendorId || actionLoading}
                                    >
                                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                        Assign
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Complete Work Order Panel */}
                    {showCompleteModal && (
                        <Card className="bg-card border-green-800">
                            <CardHeader>
                                <CardTitle className="text-base text-foreground">Complete Work Order</CardTitle>
                                <CardDescription className="text-muted-foreground font-mono text-xs">
                                    Enter completion details
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground font-mono text-xs uppercase">Actual Cost (GHS)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={actualCost}
                                        onChange={e => setActualCost(e.target.value)}
                                        className="bg-background border-border text-zinc-200"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground font-mono text-xs uppercase">Completion Notes</Label>
                                    <Textarea
                                        placeholder="Describe the work completed..."
                                        value={completionNotes}
                                        onChange={e => setCompletionNotes(e.target.value)}
                                        className="bg-background border-border text-zinc-200 min-h-[80px]"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" className="text-muted-foreground" onClick={() => { setShowCompleteModal(false); setCompletionNotes(''); setActualCost('') }}>
                                        Cancel
                                    </Button>
                                    <Button
                                        className="bg-green-600 hover:bg-green-500 text-foreground"
                                        onClick={handleComplete}
                                        disabled={!completionNotes || !actualCost || actionLoading}
                                    >
                                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                        Confirm Complete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right Column: Details & Actions */}
                <div className="space-y-6">
                    {/* Vendor Card */}
                    <Card className="bg-card border-border">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-base text-foreground">Assigned Vendor</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {vendorName ? (
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="h-10 w-10 rounded bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 font-bold border border-blue-900/30">
                                        {vendorName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-zinc-200 font-medium">{vendorName}</div>
                                        {workOrder.vendor?.phonePrimary && (
                                            <div className="text-xs text-muted-foreground">{workOrder.vendor.phonePrimary}</div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-4">
                                    <User className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                                    <p className="text-muted-foreground text-sm font-mono">No vendor assigned</p>
                                    {!isTerminal && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-3 border-cyan-800 text-cyan-600 dark:text-cyan-400 hover:text-foreground hover:bg-cyan-900/30"
                                            onClick={() => setShowAssignModal(true)}
                                        >
                                            Assign Vendor
                                        </Button>
                                    )}
                                </div>
                            )}
                            {vendorName && !isTerminal && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-border text-muted-foreground mt-2"
                                    onClick={() => setShowAssignModal(true)}
                                >
                                    Reassign Vendor
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Status Actions */}
                    {!isTerminal && (
                        <Card className="bg-card border-border">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base text-foreground">Update Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Select value={workOrder.status} onValueChange={handleStatusChange}>
                                    <SelectTrigger className="bg-background border-border text-zinc-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        {Object.entries(statusConfig).map(([key, cfg]) => (
                                            <SelectItem key={key} value={key} className="text-zinc-200 focus:bg-muted focus:text-foreground">
                                                {cfg.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Separator className="my-2 bg-muted" />
                                <Button
                                    variant="ghost"
                                    className="w-full text-red-500 hover:text-red-400 hover:bg-red-900/10"
                                    onClick={handleCancel}
                                >
                                    Cancel Ticket
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Completed Badge */}
                    {isTerminal && (
                        <Card className="bg-card border-border">
                            <CardContent className="py-6 text-center">
                                <CheckCircle2 className={`h-10 w-10 mx-auto mb-2 ${workOrder.status === WorkOrderStatus.COMPLETED ? 'text-green-500' : 'text-red-500'}`} />
                                <p className="text-muted-foreground font-mono text-sm">
                                    This work order is <span className="font-bold">{workOrder.status === WorkOrderStatus.COMPLETED ? 'completed' : 'cancelled'}</span>
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
