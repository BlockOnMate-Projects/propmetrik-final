'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
    GitBranch,
    Plus,
    X,
    GripVertical,
    Palette,
    Loader2,
    Save,
    Trash2,
    ChevronRight,
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { pipelinesApi } from '@/lib/crm-api'
import type { DealPipeline, DealStage } from '@/types/crm'
import { toast } from 'sonner'

const STAGE_COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#06b6d4', '#ef4444', '#6366f1',
]

interface PipelineDesignerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave?: () => void
}

export function PipelineDesigner({ open, onOpenChange, onSave }: PipelineDesignerProps) {
    const [pipelines, setPipelines] = useState<DealPipeline[]>([])
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')
    const [stages, setStages] = useState<Array<DealStage & { color?: string }>>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [newStageName, setNewStageName] = useState('')
    const [newStageProbability, setNewStageProbability] = useState('50')

    // Load pipelines
    useEffect(() => {
        if (!open) return
        setLoading(true)
        pipelinesApi.getAll(true)
            .then(data => {
                setPipelines(data)
                if (data.length > 0) {
                    setSelectedPipelineId(data[0].id)
                    setStages(data[0].stages || [])
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [open])

    // Change pipeline selection
    useEffect(() => {
        const pipeline = pipelines.find(p => p.id === selectedPipelineId)
        if (pipeline) {
            setStages(pipeline.stages || [])
        }
    }, [selectedPipelineId, pipelines])

    const addStage = () => {
        if (!newStageName.trim()) return
        const newStage: DealStage & { color?: string } = {
            id: `temp_${Date.now()}`,
            pipeline_id: selectedPipelineId,
            stage_name: newStageName.trim(),
            stage_order: stages.length,
            probability: parseInt(newStageProbability) || 50,
            color: STAGE_COLORS[stages.length % STAGE_COLORS.length],
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }
        setStages(prev => [...prev, newStage])
        setNewStageName('')
        setNewStageProbability('50')
    }

    const removeStage = (idx: number) => {
        setStages(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stage_order: i })))
    }

    const moveStage = (fromIdx: number, direction: 'up' | 'down') => {
        const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1
        if (toIdx < 0 || toIdx >= stages.length) return
        const updated = [...stages]
        const tmp = updated[fromIdx]
        updated[fromIdx] = updated[toIdx]
        updated[toIdx] = tmp
        setStages(updated.map((s, i) => ({ ...s, stage_order: i })))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            // Reorder stages via the API
            await pipelinesApi.reorderStages(
                selectedPipelineId,
                stages.map(s => s.id)
            )
            toast.success('Pipeline stages saved')
            onSave?.()
        } catch (err) {
            console.error('Failed to save pipeline:', err)
            toast.error('Failed to save pipeline')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitBranch className="h-5 w-5 text-primary" />
                        Visual Pipeline Designer
                    </DialogTitle>
                    <DialogDescription>
                        Drag, reorder, and customize pipeline stages.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Pipeline selector */}
                        <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select pipeline" />
                            </SelectTrigger>
                            <SelectContent>
                                {pipelines.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.pipeline_name} ({p.pipeline_type})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Visual stage flow */}
                        <div className="flex items-center gap-1 overflow-x-auto py-4 px-2">
                            {stages.map((stage, i) => (
                                <React.Fragment key={stage.id}>
                                    <div className="flex flex-col items-center min-w-[120px] group">
                                        <div
                                            className={cn(
                                                'w-full rounded-lg border-2 p-3 text-center transition-all',
                                                'border-border bg-card hover:shadow-md'
                                            )}
                                            style={{ borderColor: (stage as any).color || STAGE_COLORS[i % STAGE_COLORS.length] }}
                                        >
                                            <div className="text-xs font-medium text-foreground truncate">{stage.stage_name}</div>
                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                                {stage.probability ?? 50}% prob
                                            </div>
                                            <div className="flex items-center justify-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => moveStage(i, 'up')}
                                                    disabled={i === 0}
                                                >
                                                    <span className="text-[10px]">←</span>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 text-destructive"
                                                    onClick={() => removeStage(i)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => moveStage(i, 'down')}
                                                    disabled={i === stages.length - 1}
                                                >
                                                    <span className="text-[10px]">→</span>
                                                </Button>
                                            </div>
                                        </div>
                                        <span className="text-[9px] text-muted-foreground mt-1">Stage {i + 1}</span>
                                    </div>
                                    {i < stages.length - 1 && (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Add stage */}
                        <div className="flex items-center gap-2 border-t border-border pt-4">
                            <Input
                                value={newStageName}
                                onChange={e => setNewStageName(e.target.value)}
                                placeholder="New stage name..."
                                className="text-sm flex-1"
                                onKeyDown={e => e.key === 'Enter' && addStage()}
                            />
                            <Input
                                type="number"
                                value={newStageProbability}
                                onChange={e => setNewStageProbability(e.target.value)}
                                placeholder="Prob %"
                                className="text-sm w-20"
                                min="0"
                                max="100"
                            />
                            <Button onClick={addStage} size="sm" variant="outline">
                                <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Save Pipeline
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
