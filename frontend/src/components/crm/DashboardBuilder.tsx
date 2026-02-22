'use client'

import React, { useState, useCallback, useEffect } from 'react'
import {
    LayoutGrid,
    Plus,
    X,
    GripVertical,
    BarChart3,
    TrendingUp,
    Users,
    DollarSign,
    Activity,
    Target,
    Loader2,
    Save,
    Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Widget types ───────────────────────────────────
export type WidgetType =
    | 'deal_pipeline_summary'
    | 'revenue_by_month'
    | 'agent_leaderboard'
    | 'contact_growth'
    | 'deal_conversion_rate'
    | 'commission_tracker'
    | 'task_completion'
    | 'top_deals'

const WIDGET_CATALOG: Array<{ type: WidgetType; label: string; icon: React.ComponentType<any>; description: string }> = [
    { type: 'deal_pipeline_summary', label: 'Pipeline Summary', icon: BarChart3, description: 'Active deals by pipeline stage' },
    { type: 'revenue_by_month', label: 'Revenue by Month', icon: TrendingUp, description: 'Monthly revenue trend chart' },
    { type: 'agent_leaderboard', label: 'Agent Leaderboard', icon: Users, description: 'Top performing agents' },
    { type: 'contact_growth', label: 'Contact Growth', icon: Activity, description: 'New contacts over time' },
    { type: 'deal_conversion_rate', label: 'Conversion Rate', icon: Target, description: 'Deal win/loss ratio' },
    { type: 'commission_tracker', label: 'Commission Tracker', icon: DollarSign, description: 'Commission earned vs target' },
    { type: 'task_completion', label: 'Task Completion', icon: Activity, description: 'Tasks completed vs pending' },
    { type: 'top_deals', label: 'Top Deals', icon: DollarSign, description: 'Highest value active deals' },
]

interface DashboardWidget {
    id: string
    type: WidgetType
    title: string
    size: 'sm' | 'md' | 'lg'
    order: number
}

interface DashboardLayout {
    id: string
    name: string
    widgets: DashboardWidget[]
    created_at: string
}

const STORAGE_KEY = 'propmetrik_dashboard_layouts'

function loadLayouts(): DashboardLayout[] {
    if (typeof window === 'undefined') return []
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch { return [] }
}

function persistLayouts(layouts: DashboardLayout[]) {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

// ── Widget placeholder renderer ────────────────────
function WidgetContent({ widget }: { widget: DashboardWidget }) {
    const catalogItem = WIDGET_CATALOG.find(w => w.type === widget.type)
    const Icon = catalogItem?.icon || BarChart3

    return (
        <Card className="h-full border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    {widget.title}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
                <div className="flex items-center justify-center h-24 text-muted-foreground text-xs border border-dashed border-border rounded-md bg-muted/30">
                    {catalogItem?.description || 'Widget content'}
                </div>
            </CardContent>
        </Card>
    )
}

// ── Main component ─────────────────────────────────
interface DashboardBuilderProps {
    onClose?: () => void
}

export function DashboardBuilder({ onClose }: DashboardBuilderProps) {
    const [layouts, setLayouts] = useState<DashboardLayout[]>([])
    const [activeLayoutId, setActiveLayoutId] = useState<string>('')
    const [addWidgetOpen, setAddWidgetOpen] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [newLayoutName, setNewLayoutName] = useState('')

    useEffect(() => {
        const stored = loadLayouts()
        setLayouts(stored)
        if (stored.length > 0) setActiveLayoutId(stored[0].id)
    }, [])

    const activeLayout = layouts.find(l => l.id === activeLayoutId)

    const saveLayouts = useCallback((updated: DashboardLayout[]) => {
        setLayouts(updated)
        persistLayouts(updated)
    }, [])

    const createLayout = () => {
        const name = newLayoutName.trim() || `Dashboard ${layouts.length + 1}`
        const layout: DashboardLayout = {
            id: `dl_${Date.now()}`,
            name,
            widgets: [],
            created_at: new Date().toISOString(),
        }
        const updated = [...layouts, layout]
        saveLayouts(updated)
        setActiveLayoutId(layout.id)
        setNewLayoutName('')
        setEditMode(true)
        toast.success(`Created "${name}"`)
    }

    const addWidget = (type: WidgetType) => {
        if (!activeLayout) return
        const catalogItem = WIDGET_CATALOG.find(w => w.type === type)
        const widget: DashboardWidget = {
            id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            type,
            title: catalogItem?.label || type,
            size: 'md',
            order: activeLayout.widgets.length,
        }
        const updated = layouts.map(l =>
            l.id === activeLayoutId ? { ...l, widgets: [...l.widgets, widget] } : l
        )
        saveLayouts(updated)
        setAddWidgetOpen(false)
    }

    const removeWidget = (widgetId: string) => {
        const updated = layouts.map(l =>
            l.id === activeLayoutId
                ? { ...l, widgets: l.widgets.filter(w => w.id !== widgetId) }
                : l
        )
        saveLayouts(updated)
    }

    const updateWidgetSize = (widgetId: string, size: 'sm' | 'md' | 'lg') => {
        const updated = layouts.map(l =>
            l.id === activeLayoutId
                ? { ...l, widgets: l.widgets.map(w => w.id === widgetId ? { ...w, size } : w) }
                : l
        )
        saveLayouts(updated)
    }

    const deleteLayout = () => {
        if (!activeLayoutId) return
        const updated = layouts.filter(l => l.id !== activeLayoutId)
        saveLayouts(updated)
        setActiveLayoutId(updated[0]?.id || '')
        toast.success('Dashboard deleted')
    }

    const sizeClass = (size: string) => {
        switch (size) {
            case 'sm': return 'col-span-1'
            case 'lg': return 'col-span-3'
            default: return 'col-span-2'
        }
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <LayoutGrid className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Dashboard Builder</h2>
                    {layouts.length > 0 && (
                        <Select value={activeLayoutId} onValueChange={setActiveLayoutId}>
                            <SelectTrigger className="w-48 h-8 text-xs">
                                <SelectValue placeholder="Select dashboard" />
                            </SelectTrigger>
                            <SelectContent>
                                {layouts.map(l => (
                                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {activeLayout && (
                        <>
                            <Button size="sm" variant="outline" onClick={() => setEditMode(!editMode)} className="text-xs">
                                <Settings2 className="h-3 w-3 mr-1" />
                                {editMode ? 'Done' : 'Edit'}
                            </Button>
                            <Button size="sm" onClick={() => setAddWidgetOpen(true)} className="text-xs">
                                <Plus className="h-3 w-3 mr-1" />
                                Add Widget
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Create new dashboard */}
            {layouts.length === 0 && (
                <Card className="border-dashed border-border">
                    <CardContent className="py-12 text-center">
                        <LayoutGrid className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-4">No dashboards yet. Create your first one.</p>
                        <div className="flex items-center gap-2 justify-center max-w-xs mx-auto">
                            <Input
                                value={newLayoutName}
                                onChange={e => setNewLayoutName(e.target.value)}
                                placeholder="Dashboard name"
                                className="text-sm"
                                onKeyDown={e => e.key === 'Enter' && createLayout()}
                            />
                            <Button onClick={createLayout} size="sm">Create</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Widget grid */}
            {activeLayout && (
                <div className="grid grid-cols-3 gap-4">
                    {activeLayout.widgets.map(widget => (
                        <div key={widget.id} className={cn('relative group', sizeClass(widget.size))}>
                            {editMode && (
                                <div className="absolute -top-2 -right-2 z-10 flex gap-1">
                                    <Select
                                        value={widget.size}
                                        onValueChange={(v) => updateWidgetSize(widget.id, v as 'sm' | 'md' | 'lg')}
                                    >
                                        <SelectTrigger className="h-6 w-16 text-[10px] bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sm">SM</SelectItem>
                                            <SelectItem value="md">MD</SelectItem>
                                            <SelectItem value="lg">LG</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => removeWidget(widget.id)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            )}
                            <WidgetContent widget={widget} />
                        </div>
                    ))}
                    {activeLayout.widgets.length === 0 && (
                        <div className="col-span-3 py-12 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                            Click "Add Widget" to build your dashboard
                        </div>
                    )}
                </div>
            )}

            {/* New layout quick action */}
            {layouts.length > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Input
                        value={newLayoutName}
                        onChange={e => setNewLayoutName(e.target.value)}
                        placeholder="New dashboard name..."
                        className="text-xs max-w-xs h-8"
                        onKeyDown={e => e.key === 'Enter' && createLayout()}
                    />
                    <Button size="sm" variant="outline" onClick={createLayout} className="text-xs h-8">
                        <Plus className="h-3 w-3 mr-1" /> New Dashboard
                    </Button>
                    {activeLayout && (
                        <Button size="sm" variant="ghost" onClick={deleteLayout} className="text-xs h-8 text-destructive ml-auto">
                            Delete Dashboard
                        </Button>
                    )}
                </div>
            )}

            {/* Add widget dialog */}
            <Dialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Widget</DialogTitle>
                        <DialogDescription>Choose a widget to add to your dashboard.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-4">
                        {WIDGET_CATALOG.map(w => (
                            <button
                                key={w.type}
                                onClick={() => addWidget(w.type)}
                                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                            >
                                <w.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-foreground">{w.label}</p>
                                    <p className="text-xs text-muted-foreground">{w.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
