
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
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { propertyManagementApi } from '@/lib/property-management-api'
import { WorkOrder, WorkOrderStatus } from '@/types/property-management'

export default function MaintenancePage() {
    const router = useRouter()
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
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

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white font-mono">MAINTENANCE</h1>
                    <p className="text-sm text-zinc-500 font-mono">Track work orders and repair requests</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:text-amber-500 hover:border-amber-900 bg-black font-mono text-xs uppercase">
                        <Filter className="mr-2 h-3 w-3" />
                        Filter
                    </Button>
                    <Link href="/dashboard/property-management/maintenance/new">
                        <Button className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs uppercase">
                            <Plus className="mr-2 h-3 w-3" />
                            New Work Order
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Open Requests</CardTitle>
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">{isLoading ? '-' : openRequests}</div>
                    </CardContent>
                </Card>
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">In Progress</CardTitle>
                        <Clock className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">{isLoading ? '-' : inProgress}</div>
                    </CardContent>
                </Card>
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Critical / High</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">{isLoading ? '-' : criticalTickets}</div>
                    </CardContent>
                </Card>
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Solve Rate</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-zinc-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">82%</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs / Filter Nav */}
            <div className="flex items-center space-x-2">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
                    <TabsList className="bg-zinc-900 border border-zinc-800">
                        <TabsTrigger value="all" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">All</TabsTrigger>
                        <TabsTrigger value="active" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">Active</TabsTrigger>
                        <TabsTrigger value="completed" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">Completed</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Main Table Card */}
            <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Work Orders</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-3 w-3 text-zinc-500" />
                            <Input placeholder="SEARCH TICKETS..." className="pl-8 bg-black border-zinc-800 text-zinc-300 focus:border-amber-500 font-mono text-xs uppercase h-8" />
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
                                <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">ID</TableHead>
                                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Status</TableHead>
                                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Priority</TableHead>
                                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Issue / Property</TableHead>
                                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Category</TableHead>
                                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Assigned To</TableHead>
                                    <TableHead className="text-right text-zinc-500 font-mono text-[10px] uppercase">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {workOrders.length === 0 ? (
                                    <TableRow className="border-zinc-800">
                                        <TableCell colSpan={7} className="text-center py-8 text-zinc-500 font-mono">
                                            No work orders found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    workOrders.map((wo) => (
                                        <TableRow key={wo.id} className="border-zinc-800 hover:bg-zinc-900/50 group cursor-pointer" onClick={() => router.push(`/dashboard/property-management/maintenance/${wo.id}`)}>
                                            <TableCell>
                                                <span className="font-mono text-xs text-zinc-500 group-hover:text-amber-500 transition-colors">
                                                    {wo.id.substring(0, 8).toUpperCase()}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={`
                                                        text-[10px] font-mono uppercase
                                                        ${wo.status === WorkOrderStatus.COMPLETED ? 'border-green-900 text-green-500 bg-green-900/10' : ''}
                                                        ${wo.status === WorkOrderStatus.IN_PROGRESS ? 'border-amber-900 text-amber-500 bg-amber-900/10' : ''}
                                                        ${wo.status === WorkOrderStatus.OPEN ? 'border-blue-900 text-blue-500 bg-blue-900/10' : ''}
                                                        ${wo.status === WorkOrderStatus.CANCELLED ? 'border-red-900 text-red-500 bg-red-900/10' : ''}
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
                                                    ${wo.priority === 'low' ? 'text-blue-400' : ''}
                                                `}>
                                                    {(wo.priority === 'critical' || wo.priority === 'high') && <AlertCircle className="h-3 w-3" />}
                                                    {wo.priority}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium text-zinc-200 text-xs font-mono uppercase">{wo.title}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono">{wo.propertyId.substring(0, 8)}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-[10px] text-zinc-400 font-mono uppercase">{wo.category}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-[10px] text-zinc-400 font-mono">
                                                    {wo.assignedVendorId ? wo.assignedVendorId.substring(0, 8) : 'UNASSIGNED'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-6 w-6 p-0 text-zinc-500 hover:text-white">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreVertical className="h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="bg-black border-zinc-800 text-zinc-300">
                                                        <DropdownMenuLabel className="text-xs font-mono uppercase text-zinc-500">Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem className="hover:bg-zinc-900 focus:bg-zinc-900 cursor-pointer text-xs font-mono" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/property-management/maintenance/${wo.id}`) }}>
                                                            View details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="hover:bg-zinc-900 focus:bg-zinc-900 cursor-pointer text-xs font-mono" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/property-management/maintenance/${wo.id}`) }}>
                                                            Update Status
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-zinc-800" />
                                                        <DropdownMenuItem className="text-amber-500 hover:bg-zinc-900 focus:bg-zinc-900 cursor-pointer text-xs font-mono" onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (confirm('Close this ticket?')) {
                                                                try {
                                                                    await propertyManagementApi.updateWorkOrder(wo.id, { status: WorkOrderStatus.COMPLETED } as any);
                                                                    setWorkOrders(prev => prev.map(w => w.id === wo.id ? { ...w, status: WorkOrderStatus.COMPLETED } : w));
                                                                } catch (err: any) { alert(err.message || 'Failed to close ticket'); }
                                                            }
                                                        }}>
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
