'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    Plus,
    LayoutGrid,
    List,
    Search,
    Loader2,
    Building2,
    User,
    Calendar,
    LineChart
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { dealsApi, pipelinesApi } from '@/lib/crm-api'
import type { Deal, DealPipeline, DealStage, KanbanColumn, DealMetrics } from '@/types/crm'
import { DealStatus } from '@/types/crm'
import { formatCurrency } from '@/lib/utils'

// =====================================================
// PANEL COMPONENT (Matches existing design)
// =====================================================
// =====================================================
// PANEL COMPONENT (Replaced with Card for Modern Look)
// =====================================================
// Using standard Card component directly instead of custom Panel


// =====================================================
// KANBAN CARD
// =====================================================
function KanbanCard({ deal }: { deal: Deal }) {
    return (
        <Link href={`/dashboard/deals/${deal.id}`}>
            <Card className="mb-2 p-3 hover:border-primary/50 transition-colors cursor-pointer group bg-card border-border shadow-sm">
                <div className="flex items-start justify-between mb-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{deal.deal_number}</span>
                    <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        deal.deal_type === 'sale' && 'bg-green-500/10 text-green-500',
                        deal.deal_type === 'rental' && 'bg-blue-500/10 text-blue-500',
                        deal.deal_type === 'development' && 'bg-purple-500/10 text-purple-500'
                    )}>
                        {deal.deal_type?.toUpperCase()}
                    </span>
                </div>

                {deal.has_valuation && (
                    <div className="flex items-center gap-1 mb-2">
                        <LineChart className="h-3 w-3 text-primary" />
                        <span className="text-[10px] font-medium text-primary">Valuation Ready</span>
                    </div>
                )}

                <h4 className="text-sm font-medium text-card-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {deal.title}
                </h4>

                {deal.primary_contact_name && (
                    <div className="flex items-center gap-1.5 mb-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground truncate">{deal.primary_contact_name}</span>
                    </div>
                )}

                {deal.property_names && deal.property_names.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground truncate">{deal.property_names[0]}</span>
                    </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                    <span className="font-mono text-xs font-medium text-foreground">
                        {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                    </span>
                    {deal.expected_close_date && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(deal.expected_close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                    )}
                </div>
            </Card>
        </Link>
    )
}

// =====================================================
// KANBAN COLUMN
// =====================================================
function KanbanColumnComponent({ stage, deals, totalValue }: KanbanColumn) {
    return (
        <div className="flex-shrink-0 w-80">
            <div
                className="sticky top-0 bg-background/95 backdrop-blur z-10 p-3 mb-2 flex items-center justify-between rounded-lg border border-border"
                style={{ borderTopColor: stage.stage_color || '#71717a', borderTopWidth: '3px' }}
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                        {stage.stage_name}
                    </span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {deals.length}
                    </span>
                </div>
                <div className="font-mono text-xs font-medium text-muted-foreground">
                    {formatCurrency(totalValue, 'GHS')}
                </div>
            </div>

            <div className="space-y-0 h-[calc(100vh-280px)] overflow-y-auto pr-2 custom-scrollbar">
                {deals.map((deal) => (
                    <KanbanCard key={deal.id} deal={deal} />
                ))}
                {deals.length === 0 && (
                    <div className="h-24 flex items-center justify-center border-2 border-dashed border-muted rounded-lg">
                        <span className="text-xs text-muted-foreground">No deals</span>
                    </div>
                )}
            </div>
        </div>
    )
}

// =====================================================
// TABLE VIEW
// =====================================================
function DealsTable({ deals, isLoading }: { deals: Deal[]; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="text-xs font-medium text-muted-foreground border-b border-border">
                        <th className="text-left pb-3 pl-4 w-28">ID</th>
                        <th className="text-left pb-3">Title</th>
                        <th className="text-left pb-3">Client</th>
                        <th className="text-left pb-3 w-20">Type</th>
                        <th className="text-right pb-3 w-28">Value</th>
                        <th className="text-left pb-3 pl-4 w-32">Stage</th>
                        <th className="text-left pb-3 w-24">Agent</th>
                        <th className="text-right pb-3 pr-4 w-24">Updated</th>
                    </tr>
                </thead>
                <tbody className="text-sm">
                    {deals.map((deal) => (
                        <tr
                            key={deal.id}
                            className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => window.location.href = `/dashboard/deals/${deal.id}`}
                        >
                            <td className="py-3 pl-4 font-mono text-xs text-muted-foreground">{deal.deal_number}</td>
                            <td className="py-3 font-medium text-foreground">{deal.title}</td>
                            <td className="py-3 text-muted-foreground">{deal.primary_contact_name || '—'}</td>
                            <td className="py-3">
                                <span className={cn(
                                    'px-2 py-0.5 text-[10px] rounded-full font-medium',
                                    deal.deal_type === 'sale' && 'bg-green-500/10 text-green-500',
                                    deal.deal_type === 'rental' && 'bg-blue-500/10 text-blue-500',
                                    deal.deal_type === 'development' && 'bg-purple-500/10 text-purple-500'
                                )}>
                                    {deal.deal_type?.toUpperCase()}
                                </span>
                            </td>
                            <td className="py-3 text-right font-mono text-xs text-foreground">
                                {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                            </td>
                            <td className="py-3 pl-4">
                                <span
                                    className="px-2 py-0.5 text-[10px] rounded-full bg-muted text-foreground border border-border"
                                    style={{ borderColor: deal.stage_color || '#71717a' }}
                                >
                                    {deal.stage_name}
                                </span>
                            </td>
                            <td className="py-3 text-muted-foreground">{deal.assigned_agent_name || '—'}</td>
                            <td className="py-3 pr-4 text-right text-xs text-muted-foreground">
                                {new Date(deal.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {deals.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-sm text-muted-foreground">No deals found</p>
                </div>
            )}
        </div>
    )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function DealsPage() {
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
    const [pipelines, setPipelines] = useState<DealPipeline[]>([])
    const [selectedPipeline, setSelectedPipeline] = useState<string>('')
    const [kanbanData, setKanbanData] = useState<KanbanColumn[]>([])
    const [deals, setDeals] = useState<Deal[]>([])
    const [metrics, setMetrics] = useState<DealMetrics | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Load pipelines
    useEffect(() => {
        const loadPipelines = async () => {
            try {
                const data = await pipelinesApi.getAll(true)
                setPipelines(data)
                const defaultPipeline = data.find(p => p.is_default) || data[0]
                if (defaultPipeline) {
                    setSelectedPipeline(defaultPipeline.id)
                }
            } catch (err) {
                console.error('Failed to load pipelines:', err)
            }
        }
        loadPipelines()
    }, [])

    // Load deals and kanban data
    useEffect(() => {
        if (!selectedPipeline) return

        const loadData = async () => {
            try {
                setIsLoading(true)
                setError(null)

                const [kanban, metricsData] = await Promise.all([
                    dealsApi.getKanban(selectedPipeline),
                    dealsApi.getMetrics()
                ])

                // Ensure kanban is always an array
                const kanbanArray = Array.isArray(kanban) ? kanban : []
                setKanbanData(kanbanArray)
                setMetrics(metricsData)
                const allDeals = kanbanArray.flatMap(col => col.deals || [])
                setDeals(allDeals)
            } catch (err) {
                console.error('Failed to load deals:', err)
                setError('Failed to load deals. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [selectedPipeline])

    // Filter deals by search
    const filteredDeals = deals.filter(deal => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        return (
            deal.title?.toLowerCase().includes(search) ||
            deal.deal_number?.toLowerCase().includes(search) ||
            deal.primary_contact_name?.toLowerCase().includes(search)
        )
    })

    const filteredKanban = (kanbanData || []).map(col => ({
        ...col,
        deals: (col.deals || []).filter(deal => {
            if (!searchTerm) return true
            const search = searchTerm.toLowerCase()
            return (
                deal.title?.toLowerCase().includes(search) ||
                deal.deal_number?.toLowerCase().includes(search) ||
                deal.primary_contact_name?.toLowerCase().includes(search)
            )
        })
    }))

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deals</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage your sales pipeline and track opportunities.</p>
                </div>
                <Link href="/dashboard/deals/new">
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Deal
                    </Button>
                </Link>
            </div>

            {/* Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-5">
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Active Deals</div>
                        <div className="text-2xl font-bold text-foreground">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.activeDeals || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Pipeline Value</div>
                        <div className="text-2xl font-bold text-primary">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(metrics?.totalValue || 0, 'GHS')}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Won (Month)</div>
                        <div className="text-2xl font-bold text-green-500">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.wonDeals || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Won Value</div>
                        <div className="text-2xl font-bold text-green-500">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(metrics?.wonValue || 0, 'GHS')}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Conversion</div>
                        <div className="text-2xl font-bold text-foreground">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `${((metrics?.conversionRate || 0) * 100).toFixed(1)}%`}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & View Toggle */}
            <Card className="border-border bg-card shadow-sm">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                    {/* Pipeline Selector */}
                    <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
                        <SelectTrigger className="w-[200px] h-9">
                            <SelectValue placeholder="Select pipeline" />
                        </SelectTrigger>
                        <SelectContent>
                            {pipelines.map((pipeline) => (
                                <SelectItem
                                    key={pipeline.id}
                                    value={pipeline.id}
                                >
                                    {pipeline.pipeline_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Search */}
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search deals..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>

                    <div className="flex-1" />

                    {/* View Toggle */}
                    <div className="flex items-center border border-border rounded-md bg-muted/50 p-0.5">
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={cn(
                                'p-1.5 rounded-sm transition-all',
                                viewMode === 'kanban' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={cn(
                                'p-1.5 rounded-sm transition-all',
                                viewMode === 'list' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <List className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </Card>

            {/* Error State */}
            {error && (
                <div className="border border-red-900 bg-red-900/20 p-4 text-center">
                    <p className="font-mono text-xs text-red-400">{error}</p>
                    <Button
                        variant="link"
                        onClick={() => window.location.reload()}
                        className="text-amber-500 mt-2"
                    >
                        Retry
                    </Button>
                </div>
            )}

            {/* Kanban View */}
            {viewMode === 'kanban' && !error && (
                <div className="overflow-x-auto pb-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                        </div>
                    ) : (
                        <div className="flex gap-3 min-w-max">
                            {filteredKanban.map((column) => (
                                <KanbanColumnComponent
                                    key={column.stage.id}
                                    stage={column.stage}
                                    deals={column.deals}
                                    totalValue={column.totalValue}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* List View */}
            {viewMode === 'list' && !error && (
                <Card className="border-border bg-card shadow-sm">
                    <div className="p-4 border-b border-border">
                        <h3 className="text-sm font-medium text-foreground">All Deals</h3>
                    </div>
                    <DealsTable deals={filteredDeals} isLoading={isLoading} />
                </Card>
            )}
        </div>
    )
}
