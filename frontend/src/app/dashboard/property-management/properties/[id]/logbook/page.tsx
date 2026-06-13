'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    History,
    ArrowLeft,
    Plus,
    Building2,
    Users,
    Wrench,
    DollarSign,
    FileText,
    CheckCircle2,
    Clock,
    Filter,
    Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { propertyManagementApi } from '@/lib/property-management-api'
import {
    Property,
    Tenancy,
    WorkOrder,
    FinancialRecord
} from '@/types/property-management'
import { format, compareDesc } from 'date-fns'

interface LogEntry {
    id: string
    date: Date
    type: 'creation' | 'tenancy' | 'maintenance' | 'financial' | 'document'
    title: string
    description: string
    status?: string
    metadata?: any
}

export default function AssetLogbookPage() {
    const params = useParams()
    const router = useRouter()
    const propertyId = params.id as string

    const [property, setProperty] = useState<Property | null>(null)
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadLogData = async () => {
            try {
                setIsLoading(true)
                const [
                    propRes,
                    tenanciesRes,
                    workOrdersRes,
                    financialsRes
                ] = await Promise.all([
                    propertyManagementApi.getPropertyById(propertyId),
                    propertyManagementApi.getTenancies({ propertyId }),
                    propertyManagementApi.getWorkOrders({ propertyId, limit: 100 }),
                    propertyManagementApi.getFinancials({ propertyId, limit: 100 })
                ])

                setProperty(propRes)

                const entries: LogEntry[] = []

                // 1. Property Creation
                entries.push({
                    id: 'creation-' + propRes.id,
                    date: new Date(propRes.createdAt),
                    type: 'creation',
                    title: 'Asset Initialized',
                    description: `Property "${propRes.title}" was registered in the PROPMETRIK Terminal with reference ${propRes.referenceNumber}.`
                })

                // 2. Tenancies
                const tenancyData = Array.isArray(tenanciesRes) ? tenanciesRes : tenanciesRes.data || []
                tenancyData.forEach((t: Tenancy) => {
                    entries.push({
                        id: 'tenancy-' + t.id,
                        date: new Date(t.leaseStartDate),
                        type: 'tenancy',
                        title: 'Occupancy Commenced',
                        description: `Lease Agreement ${t.referenceNumber} activated for tenant ${t.tenant?.fullName || 'Occupant'}.`,
                        status: t.status
                    })
                })

                // 3. Work Orders
                const maintenanceData = Array.isArray(workOrdersRes) ? workOrdersRes : workOrdersRes.data || []
                maintenanceData.forEach((w: WorkOrder) => {
                    entries.push({
                        id: 'maint-' + w.id,
                        date: new Date(w.createdAt),
                        type: 'maintenance',
                        title: 'Maintenance Logged: ' + w.title,
                        description: `Maintenance request filed under category "${w.category}" with priority ${w.priority}.`,
                        status: w.status
                    })
                })

                // 4. Financials
                const financialData = Array.isArray(financialsRes) ? financialsRes : financialsRes.data || []
                financialData.forEach((f: FinancialRecord) => {
                    entries.push({
                        id: 'fin-' + f.id,
                        date: new Date(f.transactionDate),
                        type: 'financial',
                        title: `${f.recordType === 'income' ? 'Revenue Inflow' : 'Operational Overhead'}`,
                        description: `${f.category.replace('_', ' ')} recorded: ${f.currency} ${f.amount.toLocaleString()}.`,
                        status: f.status
                    })
                })

                // Sort by date descending
                entries.sort((a, b) => compareDesc(a.date, b.date))
                setLogs(entries)

            } catch (err) {
                console.error('Failed to load logbook data:', err)
            } finally {
                setIsLoading(false)
            }
        }

        if (propertyId) loadLogData()
    }, [propertyId])

    const getIcon = (type: string) => {
        switch (type) {
            case 'creation': return <Building2 className="h-4 w-4 text-amber-500" />
            case 'tenancy': return <Users className="h-4 w-4 text-blue-500" />
            case 'maintenance': return <Wrench className="h-4 w-4 text-purple-500" />
            case 'financial': return <DollarSign className="h-4 w-4 text-green-500" />
            default: return <FileText className="h-4 w-4 text-muted-foreground" />
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
                <p className="text-muted-foreground font-mono text-xs uppercase">Reconstructing Asset History...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        BACK TO ASSET
                    </Button>
                    <div className="h-4 w-px bg-muted" />
                    <h1 className="text-sm font-mono text-foreground uppercase tracking-widest flex items-center gap-2">
                        <History className="h-4 w-4 text-amber-500" />
                        Asset Logbook: {property?.title}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-border text-muted-foreground font-mono text-[10px] uppercase">
                        <Filter className="h-3 w-3 mr-2" />
                        Filter Log
                    </Button>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-[10px] uppercase">
                        <Plus className="h-3 w-3 mr-2" />
                        Manual Entry
                    </Button>
                </div>
            </div>

            {/* Timeline */}
            <Card className="bg-background border-border overflow-hidden relative">
                <div className="absolute left-12 top-0 bottom-0 w-px bg-muted hidden md:block" />

                <CardContent className="p-0">
                    <div className="divide-y divide-zinc-900">
                        {logs.map((log) => (
                            <div key={log.id} className="relative p-6 flex items-start gap-8 hover:bg-card/50 transition-colors group">
                                {/* Date Column */}
                                <div className="w-24 shrink-0 pt-1 hidden md:block text-right">
                                    <p className="text-[10px] font-bold text-muted-foreground font-mono uppercase leading-relaxed">
                                        {format(log.date, 'dd MMM')}
                                        <br />
                                        <span className="text-muted-foreground font-normal">{format(log.date, 'yyyy')}</span>
                                    </p>
                                </div>

                                {/* Icon Bubble */}
                                <div className="h-10 w-10 shrink-0 bg-background border border-border rounded-lg flex items-center justify-center relative z-10 group-hover:border-amber-900 transition-colors">
                                    {getIcon(log.type)}
                                </div>

                                {/* Content */}
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-foreground font-mono uppercase group-hover:text-amber-500 transition-colors tracking-tight">
                                            {log.title}
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            {log.status && (
                                                <Badge variant="outline" className="text-[8px] font-mono border-border text-muted-foreground uppercase h-4 px-1">
                                                    {log.status}
                                                </Badge>
                                            )}
                                            <Clock className="h-3 w-3 text-zinc-700" />
                                            <span className="text-[9px] font-mono text-muted-foreground">{format(log.date, 'HH:mm')}</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono leading-relaxed max-w-2xl">
                                        {log.description}
                                    </p>
                                </div>
                            </div>
                        ))}

                        {logs.length === 0 && (
                            <div className="p-20 text-center">
                                <History className="h-12 w-12 text-zinc-900 mx-auto mb-4" />
                                <p className="text-zinc-700 font-mono text-xs uppercase">No historical data recorded for this asset telemetry.</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
