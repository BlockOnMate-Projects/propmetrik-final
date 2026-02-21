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
            <div className={cn("border border-zinc-800/50 bg-zinc-950/50 rounded-xl p-8 text-center", className)}>
                <p className="text-zinc-500 font-mono text-sm mb-4">No tasks in the Work Breakdown Structure.</p>
                <Button onClick={onAddPhase} variant="outline" className="border-zinc-700 bg-zinc-900">
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Phase
                </Button>
            </div>
        )
    }

    return (
        <Card className={cn("border-zinc-800/50 bg-zinc-950/50 backdrop-blur-sm overflow-hidden", className)}>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-900/50 border-b border-zinc-800/50 font-sans text-xs uppercase text-zinc-500 tracking-wider">
                        <tr>
                            <th className="px-4 py-3 w-10"></th>
                            <th className="px-4 py-3 min-w-[200px]">Phase / Task Name</th>
                            <th className="px-4 py-3 w-32">Start Date</th>
                            <th className="px-4 py-3 w-32">End Date</th>
                            <th className="px-4 py-3 w-24">Progress</th>
                            <th className="px-4 py-3 w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {data.phases.map((phase) => (
                            <tr
                                key={phase.id}
                                className={cn(
                                    "hover:bg-zinc-800/30 transition-colors group",
                                    editingId === phase.id ? "bg-zinc-800/20" : ""
                                )}
                                onClick={() => setEditingId(phase.id)}
                            >
                                <td className="px-4 py-3">
                                    <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                                </td>
                                <td className="px-4 py-3">
                                    {editingId === phase.id ? (
                                        <Input
                                            value={phase.name}
                                            autoFocus
                                            onBlur={() => setEditingId(null)}
                                            onChange={(e) => onUpdatePhase?.({ ...phase, name: e.target.value })}
                                            className="h-8 bg-zinc-900 border-zinc-700 font-mono text-sm"
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: phase.color || '#6b7280' }} />
                                            <span className="font-sans font-medium text-zinc-200">{phase.name}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                                    {format(new Date(phase.startDate), 'MMM dd, yyyy')}
                                </td>
                                <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                                    {format(new Date(phase.endDate), 'MMM dd, yyyy')}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${phase.progress}%` }} />
                                        </div>
                                        <span className="font-mono text-[10px] text-zinc-500">{phase.progress}%</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
            <div className="p-3 border-t border-zinc-800/50 bg-zinc-900/30">
                <Button onClick={onAddPhase} variant="ghost" size="sm" className="text-zinc-400 hover:text-white font-sans text-xs">
                    <Plus className="w-3 h-3 mr-2" />
                    Add Phase
                </Button>
            </div>
        </Card>
    )
}
