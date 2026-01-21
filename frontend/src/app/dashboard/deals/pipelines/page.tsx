'use client'

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
    Loader2,
    Plus,
    Edit,
    Trash2,
    ArrowUp,
    ArrowDown,
    GripVertical,
    Settings2
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { pipelinesApi } from '@/lib/crm-api'
import type { DealPipeline, DealStage } from '@/types/crm'
import { DealType } from '@/types/crm'

function Panel({ title, children, actions, className }: { 
    title: string; 
    children: React.ReactNode; 
    actions?: React.ReactNode;
    className?: string 
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
                {actions}
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

const STAGE_COLORS = [
    { label: 'Gray', value: '#71717a' },
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Green', value: '#22c55e' },
    { label: 'Yellow', value: '#eab308' },
    { label: 'Orange', value: '#f97316' },
    { label: 'Red', value: '#ef4444' },
    { label: 'Purple', value: '#a855f7' },
    { label: 'Pink', value: '#ec4899' },
    { label: 'Amber', value: '#f59e0b' },
]

function StageRow({ stage, onMove, onEdit, onDelete, isFirst, isLast }: { 
    stage: DealStage; 
    onMove: (direction: 'up' | 'down') => void;
    onEdit: () => void;
    onDelete: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    return (
        <div className="flex items-center gap-3 p-3 bg-zinc-800/30 border border-zinc-700/50 group hover:bg-zinc-800/50">
            <GripVertical className="h-4 w-4 text-zinc-600 cursor-grab" />
            <div 
                className="w-4 h-4 rounded-sm flex-shrink-0" 
                style={{ backgroundColor: stage.stage_color || '#71717a' }}
            />
            <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-white">{stage.stage_name}</div>
                <div className="font-mono text-[10px] text-zinc-500">
                    {stage.deal_count || 0} deals · {stage.probability}% probability
                </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMove('up')}
                    disabled={isFirst}
                    className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                >
                    <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMove('down')}
                    disabled={isLast}
                    className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                >
                    <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onEdit}
                    className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                >
                    <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

function PipelineCard({ 
    pipeline, 
    isSelected,
    onClick,
    onEdit,
    onDelete 
}: { 
    pipeline: DealPipeline; 
    isSelected: boolean;
    onClick: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const stageCount = pipeline.stages?.length || 0
    const dealCount = pipeline.stages?.reduce((acc, s) => acc + (s.deal_count || 0), 0) || 0

    return (
        <Card 
            className={cn(
                'bg-black border-zinc-800 cursor-pointer transition-all',
                isSelected ? 'ring-1 ring-amber-500 border-amber-500' : 'hover:border-zinc-700'
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="font-mono text-sm text-white flex items-center gap-2">
                            {pipeline.pipeline_name}
                            {pipeline.is_default && (
                                <span className="font-mono text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    DEFAULT
                                </span>
                            )}
                        </div>
                        <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                            {(pipeline.pipeline_type || 'sale').toUpperCase()}
                        </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onEdit}
                            className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                        >
                            <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                        {!pipeline.is_default && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onDelete}
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex gap-4">
                    <div>
                        <div className="font-mono text-lg text-white">{stageCount}</div>
                        <div className="font-mono text-[10px] text-zinc-500">STAGES</div>
                    </div>
                    <div>
                        <div className="font-mono text-lg text-white">{dealCount}</div>
                        <div className="font-mono text-[10px] text-zinc-500">DEALS</div>
                    </div>
                </div>
                {pipeline.stages && pipeline.stages.length > 0 && (
                    <div className="flex mt-3 h-2 overflow-hidden rounded">
                        {pipeline.stages.map((stage, idx) => (
                            <div
                                key={idx}
                                className="flex-1 first:rounded-l last:rounded-r"
                                style={{ backgroundColor: stage.stage_color || '#71717a' }}
                                title={stage.stage_name}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default function PipelinesPage() {
    const [pipelines, setPipelines] = useState<DealPipeline[]>([])
    const [selectedPipeline, setSelectedPipeline] = useState<DealPipeline | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Dialog states
    const [showPipelineDialog, setShowPipelineDialog] = useState(false)
    const [showStageDialog, setShowStageDialog] = useState(false)
    const [editingPipeline, setEditingPipeline] = useState<DealPipeline | null>(null)
    const [editingStage, setEditingStage] = useState<DealStage | null>(null)
    
    // Form states
    const [pipelineName, setPipelineName] = useState('')
    const [pipelineDealType, setPipelineDealType] = useState<DealType>(DealType.SALE)
    const [pipelineIsDefault, setPipelineIsDefault] = useState(false)
    const [stageName, setStageName] = useState('')
    const [stageColor, setStageColor] = useState('#71717a')
    const [stageProbability, setStageProbability] = useState('0')
    const [isSaving, setIsSaving] = useState(false)

    const loadPipelines = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const data = await pipelinesApi.getAll(true)
            setPipelines(data)
            if (!selectedPipeline && data.length > 0) {
                setSelectedPipeline(data.find(p => p.is_default) || data[0])
            }
        } catch (err) {
            console.error('Failed to load pipelines:', err)
            setError('Failed to load pipelines')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadPipelines()
    }, [])

    const openPipelineDialog = (pipeline?: DealPipeline) => {
        if (pipeline) {
            setEditingPipeline(pipeline)
            setPipelineName(pipeline.pipeline_name)
            setPipelineDealType(pipeline.pipeline_type)
            setPipelineIsDefault(pipeline.is_default)
        } else {
            setEditingPipeline(null)
            setPipelineName('')
            setPipelineDealType(DealType.SALE)
            setPipelineIsDefault(false)
        }
        setShowPipelineDialog(true)
    }

    const handleSavePipeline = async () => {
        try {
            setIsSaving(true)
            if (editingPipeline) {
                await pipelinesApi.update(editingPipeline.id, {
                    pipeline_name: pipelineName,
                    pipeline_type: pipelineDealType,
                    is_default: pipelineIsDefault
                })
            } else {
                await pipelinesApi.create({
                    pipeline_name: pipelineName,
                    pipeline_type: pipelineDealType,
                    is_default: pipelineIsDefault
                })
            }
            setShowPipelineDialog(false)
            await loadPipelines()
        } catch (err) {
            console.error('Failed to save pipeline:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeletePipeline = async (id: string) => {
        if (!confirm('Are you sure you want to delete this pipeline?')) return
        try {
            await pipelinesApi.delete(id)
            if (selectedPipeline?.id === id) {
                setSelectedPipeline(null)
            }
            await loadPipelines()
        } catch (err) {
            console.error('Failed to delete pipeline:', err)
        }
    }

    const openStageDialog = (stage?: DealStage) => {
        if (stage) {
            setEditingStage(stage)
            setStageName(stage.stage_name)
            setStageColor(stage.stage_color || '#71717a')
            setStageProbability(String(stage.probability || 0))
        } else {
            setEditingStage(null)
            setStageName('')
            setStageColor('#71717a')
            setStageProbability('0')
        }
        setShowStageDialog(true)
    }

    const handleSaveStage = async () => {
        if (!selectedPipeline) return
        try {
            setIsSaving(true)
            if (editingStage) {
                await pipelinesApi.updateStage(selectedPipeline.id, editingStage.id, {
                    stage_name: stageName,
                    stage_color: stageColor,
                    probability: parseInt(stageProbability)
                })
            } else {
                const sortOrder = (selectedPipeline.stages?.length || 0) + 1
                await pipelinesApi.createStage(selectedPipeline.id, {
                    stage_name: stageName,
                    stage_color: stageColor,
                    probability: parseInt(stageProbability),
                    sort_order: sortOrder
                })
            }
            setShowStageDialog(false)
            await loadPipelines()
            // Refresh selected pipeline
            const updated = pipelines.find(p => p.id === selectedPipeline.id)
            if (updated) setSelectedPipeline(updated)
        } catch (err) {
            console.error('Failed to save stage:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteStage = async (stageId: string) => {
        if (!selectedPipeline) return
        if (!confirm('Are you sure you want to delete this stage?')) return
        try {
            await pipelinesApi.deleteStage(selectedPipeline.id, stageId)
            await loadPipelines()
        } catch (err) {
            console.error('Failed to delete stage:', err)
        }
    }

    const handleMoveStage = async (stageId: string, direction: 'up' | 'down') => {
        if (!selectedPipeline?.stages) return
        const stages = [...selectedPipeline.stages]
        const idx = stages.findIndex(s => s.id === stageId)
        if (idx === -1) return
        
        const newIdx = direction === 'up' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= stages.length) return

        // Swap stages
        const stageIds = stages.map(s => s.id)
        ;[stageIds[idx], stageIds[newIdx]] = [stageIds[newIdx], stageIds[idx]]

        try {
            await pipelinesApi.reorderStages(selectedPipeline.id, stageIds)
            await loadPipelines()
        } catch (err) {
            console.error('Failed to reorder stages:', err)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-20">
                <p className="font-mono text-sm text-red-400">{error}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-xl text-white">PIPELINES</h1>
                    <p className="font-mono text-[10px] text-zinc-500">Configure deal stages and workflows</p>
                </div>
                <Button
                    onClick={() => openPipelineDialog()}
                    className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                >
                    <Plus className="h-4 w-4 mr-1.5" />
                    NEW PIPELINE
                </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {/* Pipeline List */}
                <div className="space-y-3">
                    {pipelines.length === 0 ? (
                        <Card className="bg-black border-zinc-800">
                            <CardContent className="p-6 text-center">
                                <p className="font-mono text-xs text-zinc-500">No pipelines configured</p>
                                <Button
                                    onClick={() => openPipelineDialog()}
                                    variant="outline"
                                    className="mt-3 font-mono text-xs border-zinc-700 text-zinc-300"
                                >
                                    Create First Pipeline
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        pipelines.map((pipeline) => (
                            <PipelineCard
                                key={pipeline.id}
                                pipeline={pipeline}
                                isSelected={selectedPipeline?.id === pipeline.id}
                                onClick={() => setSelectedPipeline(pipeline)}
                                onEdit={() => openPipelineDialog(pipeline)}
                                onDelete={() => handleDeletePipeline(pipeline.id)}
                            />
                        ))
                    )}
                </div>

                {/* Selected Pipeline Stages */}
                <div className="lg:col-span-2">
                    {selectedPipeline ? (
                        <Panel
                            title={`${selectedPipeline.pipeline_name.toUpperCase()} STAGES`}
                            actions={
                                <Button
                                    onClick={() => openStageDialog()}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-amber-500 hover:text-amber-400 font-mono text-[10px]"
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    ADD STAGE
                                </Button>
                            }
                        >
                            {!selectedPipeline.stages || selectedPipeline.stages.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="font-mono text-xs text-zinc-500 mb-3">No stages configured</p>
                                    <Button
                                        onClick={() => openStageDialog()}
                                        variant="outline"
                                        className="font-mono text-xs border-zinc-700 text-zinc-300"
                                    >
                                        Add First Stage
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {selectedPipeline.stages.map((stage, idx) => (
                                        <StageRow
                                            key={stage.id}
                                            stage={stage}
                                            isFirst={idx === 0}
                                            isLast={idx === selectedPipeline.stages!.length - 1}
                                            onMove={(dir) => handleMoveStage(stage.id, dir)}
                                            onEdit={() => openStageDialog(stage)}
                                            onDelete={() => handleDeleteStage(stage.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </Panel>
                    ) : (
                        <Panel title="STAGES">
                            <div className="text-center py-12">
                                <p className="font-mono text-xs text-zinc-500">
                                    Select a pipeline to view and configure stages
                                </p>
                            </div>
                        </Panel>
                    )}
                </div>
            </div>

            {/* Pipeline Dialog */}
            <Dialog open={showPipelineDialog} onOpenChange={setShowPipelineDialog}>
                <DialogContent className="bg-zinc-900 border-zinc-700">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-white">
                            {editingPipeline ? 'EDIT PIPELINE' : 'NEW PIPELINE'}
                        </DialogTitle>
                        <DialogDescription className="font-mono text-xs text-zinc-500">
                            {editingPipeline ? 'Update pipeline settings' : 'Create a new deal pipeline'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-1.5 block">PIPELINE NAME</label>
                            <Input
                                value={pipelineName}
                                onChange={(e) => setPipelineName(e.target.value)}
                                placeholder="e.g., Sales Pipeline"
                                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-1.5 block">DEAL TYPE</label>
                            <Select value={pipelineDealType} onValueChange={(v) => setPipelineDealType(v as DealType)}>
                                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-700">
                                    <SelectItem value="sale" className="font-mono text-sm text-white">Sale</SelectItem>
                                    <SelectItem value="rental" className="font-mono text-sm text-white">Rental</SelectItem>
                                    <SelectItem value="development" className="font-mono text-sm text-white">Development</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="isDefault"
                                checked={pipelineIsDefault}
                                onCheckedChange={(v) => setPipelineIsDefault(v as boolean)}
                                className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                            />
                            <label htmlFor="isDefault" className="font-mono text-xs text-zinc-300">
                                Set as default pipeline for this deal type
                            </label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowPipelineDialog(false)}
                            className="border-zinc-700 text-zinc-300 font-mono text-xs"
                        >
                            CANCEL
                        </Button>
                        <Button
                            onClick={handleSavePipeline}
                            disabled={!pipelineName || isSaving}
                            className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingPipeline ? 'UPDATE' : 'CREATE'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Stage Dialog */}
            <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
                <DialogContent className="bg-zinc-900 border-zinc-700">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-white">
                            {editingStage ? 'EDIT STAGE' : 'NEW STAGE'}
                        </DialogTitle>
                        <DialogDescription className="font-mono text-xs text-zinc-500">
                            {editingStage ? 'Update stage settings' : 'Add a new stage to the pipeline'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-1.5 block">STAGE NAME</label>
                            <Input
                                value={stageName}
                                onChange={(e) => setStageName(e.target.value)}
                                placeholder="e.g., Initial Contact"
                                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-1.5 block">COLOR</label>
                            <div className="flex flex-wrap gap-2">
                                {STAGE_COLORS.map((color) => (
                                    <button
                                        key={color.value}
                                        type="button"
                                        onClick={() => setStageColor(color.value)}
                                        className={cn(
                                            'w-8 h-8 rounded transition-all',
                                            stageColor === color.value && 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900'
                                        )}
                                        style={{ backgroundColor: color.value }}
                                        title={color.label}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-1.5 block">
                                WIN PROBABILITY (%)
                            </label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                value={stageProbability}
                                onChange={(e) => setStageProbability(e.target.value)}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm w-24"
                            />
                            <p className="font-mono text-[10px] text-zinc-600 mt-1">
                                Used for revenue forecasting calculations
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowStageDialog(false)}
                            className="border-zinc-700 text-zinc-300 font-mono text-xs"
                        >
                            CANCEL
                        </Button>
                        <Button
                            onClick={handleSaveStage}
                            disabled={!stageName || isSaving}
                            className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingStage ? 'UPDATE' : 'CREATE'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
