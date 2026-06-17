
'use client'

import React, { useEffect, useState } from 'react'
import {
    Wrench,
    Search,
    Filter,
    MoreVertical,
    Plus,
    AlertCircle,
    Clock,
    CheckCircle2,
    Calendar,
    Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { propertyManagementApi, type PMWorkOrderStats } from '@/lib/property-management-api'
import { WorkOrder, WorkOrderStatus } from '@/types/property-management'

export default function MaintenancePage() {
    const router = useRouter()
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
    const [stats, setStats] = useState<PMWorkOrderStats | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState('all')

    useEffect(() => {
        const loadWorkOrders = async () => {
            try {
                setIsLoading(true)
                const params: any = { limit: 50 }
                if (activeTab === 'active') {
                    // This is a simplification; 'active' might map to multiple statuses
                    params.status = WorkOrderStatus.IN_PROGRESS
                } else if (activeTab === 'completed') {
                    params.status = WorkOrderStatus.COMPLETED
                }

                const response = await propertyManagementApi.getWorkOrders(params)
                const data = Array.isArray(response) ? response : response.data || []
                setWorkOrders(data)
                // Org-wide aggregates for the header tiles (real solve rate, counts).
                propertyManagementApi.getWorkOrderStats().then(setStats).catch(() => {})
            } catch (err) {
                console.error('Failed to load work orders:', err)
                setError('Failed to load maintenance requests. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }
        loadWorkOrders()
    }, [activeTab])

    const openRequests = workOrders.filter(wo => wo.status === WorkOrderStatus.OPEN).length
    const inProgress = workOrders.filter(wo => wo.status === WorkOrderStatus.IN_PROGRESS).length
    const criticalTickets = workOrders.filter(wo => wo.priority === 'critical' || wo.priority === 'high').length

    // Persist a status change for a work order, with optimistic UI update.
    const setStatus = async (id: string, status: WorkOrderStatus) => {
        const previous = workOrders.find(w => w.id === id)?.status
        setWorkOrders(prev => prev.map(w => (w.id === id ? { ...w, status } : w)))
        try {
            await propertyManagementApi.updateWorkOrder(id, { status } as any)
            // Refresh org-wide tiles (solve rate, counts) after the change persists.
            propertyManagementApi.getWorkOrderStats().then(setStats).catch(() => {})
        } catch (err: any) {
            // revert on failure
            setWorkOrders(prev => prev.map(w => (w.id === id && previous ? { ...w, status: previous } : w)))
            alert(err?.message || 'Failed to update status')
        }
    }

    const STATUS_OPTIONS: { value: WorkOrderStatus; label: string }[] = [
        { value: WorkOrderStatus.OPEN, label: 'Open' },
        { value: WorkOrderStatus.ASSIGNED, label: 'Assigned' },
        { value: WorkOrderStatus.IN_PROGRESS, label: 'In Progress' },
        { value: WorkOrderStatus.PENDING_APPROVAL, label: 'Pending Approval' },
        { value: WorkOrderStatus.COMPLETED, label: 'Completed' },
        { value: WorkOrderStatus.CANCELLED, label: 'Cancelled' },
    ]

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">MAINTENANCE</h1>
                    <p className="text-sm text-muted-foreground font-mono">Track work orders and repair requests</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-border text-muted-foreground hover:text-amber-500 hover:border-amber-900 bg-background font-mono text-xs uppercase">
                        <Filter className="mr-2 h-3 w-3" />
                        Filter
                    </Button>
                    <Link href="/dashboard/property-management/maintenance/new">
                        <Button className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-xs uppercase">
                            <Plus className="mr-2 h-3 w-3" />
                            New Work Order
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Open Requests</CardTitle>
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : (stats?.byStatus.open ?? openRequests)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">In Progress</CardTitle>
                        <Clock className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : (stats?.byStatus.inProgress ?? inProgress)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Critical / High</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '-' : (stats?.criticalHigh ?? criticalTickets)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Solve Rate</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{stats ? `${stats.solveRate}%` : '-'}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs / Filter Nav */}
            <div className="flex items-center space-x-2">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
                    <TabsList className="bg-card border border-border">
                        <TabsTrigger value="all" className="data-[state=active]:bg-background data-[state=active]:text-amber-500 text-muted-foreground font-mono text-xs uppercase">All</TabsTrigger>
                        <TabsTrigger value="active" className="data-[state=active]:bg-background data-[state=active]:text-amber-500 text-muted-foreground font-mono text-xs uppercase">Active</TabsTrigger>
                        <TabsTrigger value="completed" className="data-[state=active]:bg-background data-[state=active]:text-amber-500 text-muted-foreground font-mono text-xs uppercase">Completed</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Main Table Card */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Work Orders</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                            <Input placeholder="SEARCH TICKETS..." className="pl-8 bg-background border-border text-muted-foreground focus:border-amber-500 font-mono text-xs uppercase h-8" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {error && <div className="text-red-500 text-sm font-mono mb-4">{error}</div>}

                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-card/50">
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">ID</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Status</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Priority</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Issue / Property</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Category</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Assigned To</TableHead>
                                    <TableHead className="text-right text-muted-foreground font-mono text-[10px] uppercase">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {workOrders.length === 0 ? (
                                    <TableRow className="border-border">
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                                            No work orders found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    workOrders.map((wo) => (
                                        <TableRow key={wo.id} className="border-border hover:bg-card/50 group cursor-pointer" onClick={() => router.push(`/dashboard/property-management/maintenance/${wo.id}`)}>
                                            <TableCell>
                                                <span className="font-mono text-xs text-muted-foreground group-hover:text-amber-500 transition-colors">
                                                    {wo.id.substring(0, 8).toUpperCase()}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={`
                                                        text-[10px] font-mono uppercase
                                                        ${wo.status === WorkOrderStatus.COMPLETED ? 'border-green-900 text-green-500 bg-green-100 dark:bg-green-900/10' : ''}
                                                        ${wo.status === WorkOrderStatus.IN_PROGRESS ? 'border-amber-900 text-amber-500 bg-amber-100 dark:bg-amber-900/10' : ''}
                                                        ${wo.status === WorkOrderStatus.OPEN ? 'border-blue-900 text-blue-500 bg-blue-100 dark:bg-blue-900/10' : ''}
                                                        ${wo.status === WorkOrderStatus.CANCELLED ? 'border-red-900 text-red-500 bg-red-100 dark:bg-red-900/10' : ''}
                                                    `}
                                                >
                                                    {wo.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className={`
                                                    flex items-center gap-1 font-mono text-[10px] font-bold uppercase
                                                    ${wo.priority === 'critical' ? 'text-red-500' : ''}
                                                    ${wo.priority === 'high' ? 'text-orange-500' : ''}
                                                    ${wo.priority === 'medium' ? 'text-yellow-500' : ''}
                                                    ${wo.priority === 'low' ? 'text-blue-600 dark:text-blue-400' : ''}
                                                `}>
                                                    {(wo.priority === 'critical' || wo.priority === 'high') && <AlertCircle className="h-3 w-3" />}
                                                    {wo.priority}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium text-zinc-200 text-xs font-mono uppercase">{wo.title}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono">{wo.propertyId.substring(0, 8)}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-[10px] text-muted-foreground font-mono uppercase">{wo.category}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-[10px] text-muted-foreground font-mono">
                                                    {wo.assignedVendorId ? wo.assignedVendorId.substring(0, 8) : 'UNASSIGNED'}
                                                </div>
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
                                                        <DropdownMenuItem className="hover:bg-card focus:bg-card cursor-pointer text-xs font-mono" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/property-management/maintenance/${wo.id}`) }}>
                                                            View details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="hover:bg-card focus:bg-card cursor-pointer text-xs font-mono">
                                                                Update Status
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuSubContent className="bg-background border-border text-muted-foreground">
                                                                {STATUS_OPTIONS.map(opt => (
                                                                    <DropdownMenuItem
                                                                        key={opt.value}
                                                                        disabled={wo.status === opt.value}
                                                                        className="hover:bg-card focus:bg-card cursor-pointer text-xs font-mono"
                                                                        onClick={(e) => { e.stopPropagation(); setStatus(wo.id, opt.value) }}
                                                                    >
                                                                        {opt.label}
                                                                        {wo.status === opt.value ? ' ✓' : ''}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuSub>
                                                        <DropdownMenuSeparator className="bg-muted" />
                                                        <DropdownMenuItem
                                                            disabled={wo.status === WorkOrderStatus.COMPLETED}
                                                            className="text-amber-500 hover:bg-card focus:bg-card cursor-pointer text-xs font-mono"
                                                            onClick={(e) => { e.stopPropagation(); setStatus(wo.id, WorkOrderStatus.COMPLETED) }}
                                                        >
                                                            Close Ticket
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
        </div>
    )
}
