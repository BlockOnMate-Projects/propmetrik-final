'use client'

import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, GripVertical, Trash2, CalendarIcon } from 'lucide-react'
import type { GanttData, GanttPhase, GanttMilestone } from './gantt/GanttChart'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface WBSProps {
    data: GanttData | null
    onUpdatePhase?: (phase: GanttPhase) => void
    onAddPhase?: () => void
    onDeletePhase?: (phaseId: string) => void
    className?: string
}

export function WorkBreakdownStructure({
    data,
    onUpdatePhase,
    onAddPhase,
    onDeletePhase,
    className
}: WBSProps) {
    const [editingId, setEditingId] = useState<string | null>(null)

    if (!data || data.phases.length === 0) {
        return (
            <div className={cn("border border-border/50 bg-background/50 rounded-xl p-8 text-center", className)}>
                <p className="text-muted-foreground font-mono text-sm mb-4">No tasks in the Work Breakdown Structure.</p>
                <Button onClick={onAddPhase} variant="outline" className="border-border bg-card">
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Phase
                </Button>
            </div>
        )
    }

    return (
        <Card className={cn("border-border/50 bg-background/50 backdrop-blur-sm overflow-hidden", className)}>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-card/50 border-b border-border/50 font-sans text-xs uppercase text-muted-foreground tracking-wider">
                        <tr>
                            <th className="px-4 py-3 w-10"></th>
                            <th className="px-4 py-3 min-w-[200px]">Phase / Task Name</th>
                            <th className="px-4 py-3 w-32">Start Date</th>
                            <th className="px-4 py-3 w-32">End Date</th>
                            <th className="px-4 py-3 w-24">Progress</th>
                            <th className="px-4 py-3 w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {data.phases.map((phase) => (
                            <tr
                                key={phase.id}
                                className={cn(
                                    "hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors group",
                                    editingId === phase.id ? "bg-muted/20" : ""
                                )}
                                onClick={() => setEditingId(phase.id)}
                            >
                                <td className="px-4 py-3">
                                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                                </td>
                                <td className="px-4 py-3">
                                    {editingId === phase.id ? (
                                        <Input
                                            value={phase.name}
                                            autoFocus
                                            onBlur={() => setEditingId(null)}
                                            onChange={(e) => onUpdatePhase?.({ ...phase, name: e.target.value })}
                                            className="h-8 bg-card border-border font-mono text-sm"
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: phase.color || '#6b7280' }} />
                                            <span className="font-sans font-medium text-zinc-200">{phase.name}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                                    {phase.startDate ? format(new Date(phase.startDate), 'MMM dd, yyyy') : '—'}
                                </td>
                                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                                    {phase.endDate ? format(new Date(phase.endDate), 'MMM dd, yyyy') : '—'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${phase.progress}%` }} />
                                        </div>
                                        <span className="font-mono text-[10px] text-muted-foreground">{phase.progress}%</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDeletePhase?.(phase.id)
                                        }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-3 border-t border-border/50 bg-card/30">
                <Button onClick={onAddPhase} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground font-sans text-xs">
                    <Plus className="w-3 h-3 mr-2" />
                    Add Phase
                </Button>
            </div>
        </Card>
    )
}
