'use client'

import React, { useEffect, useState } from 'react'
import {
    Activity,
    Search,
    Filter,
    Calendar,
    User,
    Building2,
    FileText,
    Wrench,
    Users,
    DollarSign,
    RefreshCw,
    Loader2,
    ChevronRight,
    Clock,
    Eye,
    Plus,
    Edit,
    Trash2,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { propertyManagementApi } from '@/lib/property-management-api'

interface AuditLog {
    id: string;
    action: string;
    resource: string;
    resource_id: string;
    user_id: string;
    user_email?: string;
    user_name?: string;
    changes: any;
    metadata: any;
    ip_address?: string;
    user_agent?: string;
    created_at: string;
}

interface AuditSummary {
    total_actions: number;
    by_action: Array<{ action: string; count: number }>;
    by_resource: Array<{ resource: string; count: number }>;
    by_user: Array<{ user_id: string; user_email: string; count: number }>;
    recent_activity: Array<{ date: string; count: number }>;
}

const actionIcons: Record<string, React.ReactNode> = {
    CREATE: <Plus className="h-4 w-4 text-green-500" />,
    UPDATE: <Edit className="h-4 w-4 text-amber-500" />,
    DELETE: <Trash2 className="h-4 w-4 text-red-500" />,
    VIEW: <Eye className="h-4 w-4 text-blue-500" />,
    LOGIN: <ArrowUpRight className="h-4 w-4 text-green-500" />,
    LOGOUT: <ArrowDownRight className="h-4 w-4 text-muted-foreground" />,
}

const resourceIcons: Record<string, React.ReactNode> = {
    PROPERTY: <Building2 className="h-4 w-4 text-amber-500" />,
    TENANT: <Users className="h-4 w-4 text-blue-500" />,
    TENANCY: <FileText className="h-4 w-4 text-purple-500" />,
    WORK_ORDER: <Wrench className="h-4 w-4 text-orange-500" />,
    PAYMENT: <DollarSign className="h-4 w-4 text-green-500" />,
    DOCUMENT: <FileText className="h-4 w-4 text-muted-foreground" />,
    VENDOR: <User className="h-4 w-4 text-cyan-500" />,
}

const actionColors: Record<string, string> = {
    CREATE: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-800',
    UPDATE: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-800',
    DELETE: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-800',
    VIEW: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-800',
    LOGIN: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-800',
    LOGOUT: 'bg-zinc-500/20 text-muted-foreground border-border',
    APPROVE: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-800',
    REJECT: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-800',
    STATUS_CHANGE: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-800',
    ASSIGN: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-800',
}

export default function AuditTrailPage() {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [summary, setSummary] = useState<AuditSummary | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Filters
    const [actionFilter, setActionFilter] = useState<string>('all')
    const [resourceFilter, setResourceFilter] = useState<string>('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [startDate, setStartDate] = useState(() => {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        return d.toISOString().split('T')[0]
    })
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

    // Pagination
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const loadData = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const [logsResponse, summaryResponse] = await Promise.all([
                propertyManagementApi.getAuditLogs({
                    page,
                    limit: 25,
                    action: actionFilter === 'all' ? undefined : actionFilter,
                    resource: resourceFilter === 'all' ? undefined : resourceFilter,
                    startDate,
                    endDate
                }),
                propertyManagementApi.getAuditSummary(7)
            ])

            setLogs(logsResponse.data || logsResponse || [])
            setTotalPages(logsResponse.totalPages || 1)
            setSummary(summaryResponse)
        } catch (err) {
            console.error('Failed to load audit data:', err)
            setError('Failed to load audit trail. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [page, actionFilter, resourceFilter, startDate, endDate])

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleString('en-GH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`
        return formatDate(dateStr)
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">AUDIT TRAIL</h1>
                    <p className="text-sm text-muted-foreground font-mono">Activity logging and change tracking</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={loadData}
                        className="border-border text-muted-foreground hover:text-amber-500 hover:border-amber-900 bg-background font-mono text-xs uppercase"
                    >
                        <RefreshCw className="mr-2 h-3 w-3" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Actions</CardTitle>
                        <Activity className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">
                            {isLoading ? '-' : summary?.total_actions || 0}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono uppercase">Last 7 days</p>
                    </CardContent>
                </Card>

                {summary?.by_action?.slice(0, 3).map((item, i) => (
                    <Card key={i} className="bg-background border border-border">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">{item.action}</CardTitle>
                            {actionIcons[item.action] || <Activity className="h-4 w-4 text-muted-foreground" />}
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-foreground font-mono">{item.count}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <Card className="bg-background border border-border">
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground font-mono uppercase">Filters:</span>
                        </div>

                        <Select value={actionFilter} onValueChange={setActionFilter}>
                            <SelectTrigger className="w-36 bg-card border-border text-muted-foreground font-mono text-xs">
                                <SelectValue placeholder="Action" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                <SelectItem value="all" className="font-mono text-xs">All Actions</SelectItem>
                                <SelectItem value="CREATE" className="font-mono text-xs">Create</SelectItem>
                                <SelectItem value="UPDATE" className="font-mono text-xs">Update</SelectItem>
                                <SelectItem value="DELETE" className="font-mono text-xs">Delete</SelectItem>
                                <SelectItem value="VIEW" className="font-mono text-xs">View</SelectItem>
                                <SelectItem value="LOGIN" className="font-mono text-xs">Login</SelectItem>
                                <SelectItem value="LOGOUT" className="font-mono text-xs">Logout</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={resourceFilter} onValueChange={setResourceFilter}>
                            <SelectTrigger className="w-36 bg-card border-border text-muted-foreground font-mono text-xs">
                                <SelectValue placeholder="Resource" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                <SelectItem value="all" className="font-mono text-xs">All Resources</SelectItem>
                                <SelectItem value="PROPERTY" className="font-mono text-xs">Properties</SelectItem>
                                <SelectItem value="TENANT" className="font-mono text-xs">Tenants</SelectItem>
                                <SelectItem value="TENANCY" className="font-mono text-xs">Tenancies</SelectItem>
                                <SelectItem value="WORK_ORDER" className="font-mono text-xs">Work Orders</SelectItem>
                                <SelectItem value="PAYMENT" className="font-mono text-xs">Payments</SelectItem>
                                <SelectItem value="DOCUMENT" className="font-mono text-xs">Documents</SelectItem>
                                <SelectItem value="VENDOR" className="font-mono text-xs">Vendors</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2 bg-card border border-border rounded px-2 py-1">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-32 bg-transparent border-0 text-xs text-muted-foreground font-mono"
                            />
                            <span className="text-muted-foreground">to</span>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-32 bg-transparent border-0 text-xs text-muted-foreground font-mono"
                            />
                        </div>

                        {(actionFilter !== 'all' || resourceFilter !== 'all') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setActionFilter('all'); setResourceFilter('all'); }}
                                className="text-amber-500 hover:text-amber-400 font-mono text-xs"
                            >
                                Clear Filters
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Error State */}
            {error && (
                <Card className="bg-red-950/30 border border-red-800">
                    <CardContent className="flex items-center gap-3 py-4">
                        <Activity className="h-5 w-5 text-red-500" />
                        <p className="text-red-600 dark:text-red-400 font-mono text-sm">{error}</p>
                        <Button variant="link" onClick={loadData} className="text-amber-500 ml-auto">
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
            )}

            {/* Activity Log Table */}
            {!isLoading && !error && (
                <Card className="bg-background border border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono uppercase text-amber-500 flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            Activity Log
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-card">
                                    <TableHead className="text-muted-foreground font-mono text-xs uppercase w-32">Time</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-xs uppercase">Action</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-xs uppercase">Resource</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-xs uppercase">User</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-xs uppercase">Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map((log) => (
                                    <TableRow key={log.id} className="border-border hover:bg-card/50">
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatTimeAgo(log.created_at)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`font-mono text-xs ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
                                                {actionIcons[log.action]}
                                                <span className="ml-1">{log.action}</span>
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {resourceIcons[log.resource] || <FileText className="h-4 w-4 text-muted-foreground" />}
                                                <span className="font-mono text-xs text-foreground">{log.resource}</span>
                                                {log.resource_id && (
                                                    <span className="font-mono text-[10px] text-muted-foreground">#{log.resource_id.slice(0, 8)}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <User className="h-3 w-3 text-muted-foreground" />
                                                <span className="font-mono text-xs text-muted-foreground">{log.user_email || log.user_id?.slice(0, 8) || 'System'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {log.changes && Object.keys(log.changes).length > 0 && (
                                                <div className="font-mono text-[10px] text-muted-foreground max-w-xs truncate">
                                                    {Object.keys(log.changes).join(', ')} changed
                                                </div>
                                            )}
                                            {log.metadata?.description && (
                                                <div className="font-mono text-[10px] text-muted-foreground max-w-xs truncate">
                                                    {log.metadata.description}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {logs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-12 font-mono">
                                            <Activity className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                                            No activity found for the selected filters
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                                <span className="text-xs text-muted-foreground font-mono">
                                    Page {page} of {totalPages}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="border-border text-muted-foreground font-mono text-xs"
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="border-border text-muted-foreground font-mono text-xs"
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Resource Activity Summary */}
            {!isLoading && !error && summary && (
                <div className="grid gap-4 md:grid-cols-2">
                    <Card className="bg-background border border-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Activity by Resource</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {summary.by_resource?.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {resourceIcons[item.resource] || <FileText className="h-4 w-4 text-muted-foreground" />}
                                            <span className="font-mono text-xs text-foreground">{item.resource}</span>
                                        </div>
                                        <Badge variant="secondary" className="font-mono text-xs bg-card text-muted-foreground">
                                            {item.count}
                                        </Badge>
                                    </div>
                                ))}
                                {(!summary.by_resource || summary.by_resource.length === 0) && (
                                    <p className="text-muted-foreground text-xs font-mono text-center py-4">No activity data</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-background border border-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Top Users</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {summary.by_user?.slice(0, 5).map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-mono text-xs text-foreground">{item.user_email || item.user_id?.slice(0, 12)}</span>
                                        </div>
                                        <Badge variant="secondary" className="font-mono text-xs bg-card text-muted-foreground">
                                            {item.count} actions
                                        </Badge>
                                    </div>
                                ))}
                                {(!summary.by_user || summary.by_user.length === 0) && (
                                    <p className="text-muted-foreground text-xs font-mono text-center py-4">No user activity data</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
