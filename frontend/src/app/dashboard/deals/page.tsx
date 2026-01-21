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
    Calendar
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
function Panel({ title, children, className }: { 
    title: string; 
    children: React.ReactNode; 
    className?: string;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-3">{children}</div>
        </div>
    )
}

// =====================================================
// KANBAN CARD
// =====================================================
function KanbanCard({ deal }: { deal: Deal }) {
    return (
        <Link href={`/dashboard/deals/${deal.id}`}>
            <div className="bg-zinc-800/50 border border-zinc-700 p-3 mb-2 hover:border-amber-500/50 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between mb-2">
                    <span className="font-mono text-[10px] text-amber-500">{deal.deal_number}</span>
                    <span className={cn(
                        'font-mono text-[9px] px-1.5 py-0.5',
                        deal.deal_type === 'sale' && 'bg-green-900/50 text-green-400',
                        deal.deal_type === 'rental' && 'bg-blue-900/50 text-blue-400',
                        deal.deal_type === 'development' && 'bg-purple-900/50 text-purple-400'
                    )}>
                        {deal.deal_type?.toUpperCase()}
                    </span>
                </div>
                
                <h4 className="font-mono text-xs text-white mb-2 group-hover:text-amber-500 transition-colors line-clamp-1">
                    {deal.title}
                </h4>

                {deal.primary_contact_name && (
                    <div className="flex items-center gap-1.5 mb-1">
                        <User className="h-3 w-3 text-zinc-500" />
                        <span className="font-mono text-[10px] text-zinc-400 truncate">{deal.primary_contact_name}</span>
                    </div>
                )}

                {deal.property_names && deal.property_names.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-1">
                        <Building2 className="h-3 w-3 text-zinc-500" />
                        <span className="font-mono text-[10px] text-zinc-400 truncate">{deal.property_names[0]}</span>
                    </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-700/50">
                    <span className="font-mono text-xs text-green-400">
                        {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                    </span>
                    {deal.expected_close_date && (
                        <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(deal.expected_close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    )
}

// =====================================================
// KANBAN COLUMN
// =====================================================
function KanbanColumnComponent({ stage, deals, totalValue }: KanbanColumn) {
    return (
        <div className="flex-shrink-0 w-72">
            <div 
                className="sticky top-0 bg-zinc-900 border border-zinc-800 p-2 mb-2 z-10"
                style={{ borderLeftColor: stage.stage_color || '#71717a', borderLeftWidth: '3px' }}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-white tracking-wider">
                            {stage.stage_name}
                        </span>
                        <span className="font-mono text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                            {deals.length}
                        </span>
                    </div>
                </div>
                <div className="font-mono text-[10px] text-green-400 mt-1">
                    {formatCurrency(totalValue, 'GHS')}
                </div>
            </div>
            
            <div className="space-y-0 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                {deals.map((deal) => (
                    <KanbanCard key={deal.id} deal={deal} />
                ))}
                {deals.length === 0 && (
                    <div className="border border-dashed border-zinc-700 p-4 text-center">
                        <span className="font-mono text-[10px] text-zinc-600">No deals</span>
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
                    <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                        <th className="text-left pb-2 w-28">ID</th>
                        <th className="text-left pb-2">TITLE</th>
                        <th className="text-left pb-2">CLIENT</th>
                        <th className="text-left pb-2 w-20">TYPE</th>
                        <th className="text-right pb-2 w-28">VALUE</th>
                        <th className="text-left pb-2 w-32">STAGE</th>
                        <th className="text-left pb-2 w-24">AGENT</th>
                        <th className="text-right pb-2 w-24">UPDATED</th>
                    </tr>
                </thead>
                <tbody className="font-mono text-xs">
                    {deals.map((deal) => (
                        <tr 
                            key={deal.id} 
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                            onClick={() => window.location.href = `/dashboard/deals/${deal.id}`}
                        >
                            <td className="py-2.5 text-amber-500">{deal.deal_number}</td>
                            <td className="py-2.5 text-white">{deal.title}</td>
                            <td className="py-2.5 text-zinc-300">{deal.primary_contact_name || '—'}</td>
                            <td className="py-2.5">
                                <span className={cn(
                                    'px-1.5 py-0.5 text-[10px]',
                                    deal.deal_type === 'sale' && 'bg-green-900/50 text-green-400',
                                    deal.deal_type === 'rental' && 'bg-blue-900/50 text-blue-400',
                                    deal.deal_type === 'development' && 'bg-purple-900/50 text-purple-400'
                                )}>
                                    {deal.deal_type?.toUpperCase()}
                                </span>
                            </td>
                            <td className="py-2.5 text-right text-green-400">
                                {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                            </td>
                            <td className="py-2.5">
                                <span 
                                    className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-300"
                                    style={{ borderLeft: `2px solid ${deal.stage_color || '#71717a'}` }}
                                >
                                    {deal.stage_name}
                                </span>
                            </td>
                            <td className="py-2.5 text-zinc-400">{deal.assigned_agent_name || '—'}</td>
                            <td className="py-2.5 text-right text-zinc-500">
                                {new Date(deal.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {deals.length === 0 && (
                <div className="text-center py-12">
                    <p className="font-mono text-xs text-zinc-500">No deals found</p>
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-xl text-white">DEAL MANAGEMENT</h1>
                    <p className="font-mono text-[10px] text-zinc-500">Sales Pipeline & Transaction Tracking</p>
                </div>
                <Link href="/dashboard/deals/new">
                    <Button className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs">
                        <Plus className="h-4 w-4 mr-2" />
                        NEW DEAL
                    </Button>
                </Link>
            </div>

            {/* Metrics Cards */}
            <div className="grid gap-3 md:grid-cols-5">
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">ACTIVE DEALS</div>
                        <div className="font-mono text-xl text-white">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.activeDeals || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">PIPELINE VALUE</div>
                        <div className="font-mono text-xl text-green-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(metrics?.totalValue || 0, 'GHS')}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">WON THIS MONTH</div>
                        <div className="font-mono text-xl text-amber-500">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.wonDeals || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">WON VALUE</div>
                        <div className="font-mono text-xl text-green-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(metrics?.wonValue || 0, 'GHS')}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">CONVERSION RATE</div>
                        <div className="font-mono text-xl text-white">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `${((metrics?.conversionRate || 0) * 100).toFixed(1)}%`}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & View Toggle */}
            <Panel title="PIPELINE VIEW" className="!p-0">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                    {/* Pipeline Selector */}
                    <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
                        <SelectTrigger className="w-48 bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                            <SelectValue placeholder="Select pipeline" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                            {pipelines.map((pipeline) => (
                                <SelectItem 
                                    key={pipeline.id} 
                                    value={pipeline.id}
                                    className="font-mono text-xs text-white hover:bg-zinc-800"
                                >
                                    {pipeline.pipeline_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                        <Input
                            placeholder="Search deals..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 bg-zinc-800 border-zinc-700 text-white font-mono text-xs h-9"
                        />
                    </div>

                    <div className="flex-1" />

                    {/* View Toggle */}
                    <div className="flex items-center border border-zinc-700 rounded">
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={cn(
                                'p-2 transition-colors',
                                viewMode === 'kanban' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
                            )}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={cn(
                                'p-2 transition-colors',
                                viewMode === 'list' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
                            )}
                        >
                            <List className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </Panel>

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
                <Panel title="ALL DEALS">
                    <DealsTable deals={filteredDeals} isLoading={isLoading} />
                </Panel>
            )}
        </div>
    )
}
