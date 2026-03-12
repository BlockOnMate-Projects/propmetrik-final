'use client'

import React, { useEffect, useState, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import {
    Loader2,
    Plus,
    Edit,
    Trash2,
    ArrowUp,
    ArrowDown,
    GripVertical,
    Settings2,
    GitBranch,
} from 'lucide-react'

const PipelineDesigner = lazy(() => import('@/components/crm/PipelineDesigner').then(m => ({ default: m.PipelineDesigner })))
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
import { EmptyState } from '@/components/crm/EmptyState'

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
        <div className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-md group hover:bg-muted/50">
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
            <div 
                className="w-4 h-4 rounded-sm flex-shrink-0" 
                style={{ backgroundColor: stage.stage_color || '#71717a' }}
            />
            <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground font-medium">{stage.stage_name}</div>
                <div className="text-xs text-muted-foreground">
                    {stage.deal_count || 0} deals · {stage.probability}% probability
                </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMove('up')}
                    disabled={isFirst}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                >
                    <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMove('down')}
                    disabled={isLast}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                >
                    <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onEdit}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                >
                    <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
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
                'cursor-pointer transition-all shadow-sm',
                isSelected ? 'ring-1 ring-primary border-primary' : 'hover:border-border/80'
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="text-sm text-foreground font-medium flex items-center gap-2">
                            {pipeline.pipeline_name}
                            {pipeline.is_default && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30 rounded">
                                    Default
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                            {(pipeline.pipeline_type || 'sale').charAt(0).toUpperCase() + (pipeline.pipeline_type || 'sale').slice(1)}
                        </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onEdit}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                        {!pipeline.is_default && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onDelete}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex gap-4">
                    <div>
                        <div className="text-lg font-semibold text-foreground">{stageCount}</div>
                        <div className="text-xs text-muted-foreground">Stages</div>
                    </div>
                    <div>
                        <div className="text-lg font-semibold text-foreground">{dealCount}</div>
                        <div className="text-xs text-muted-foreground">Deals</div>
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
    const [designerOpen, setDesignerOpen] = useState(false)
    
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
                    stage_order: sortOrder
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
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-20">
                <p className="text-sm text-red-400">{error}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pipelines</h1>
                    <p className="text-sm text-muted-foreground mt-1">Configure deal stages and workflows</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setDesignerOpen(true)}
                        className="text-sm h-9 px-4"
                    >
                        <GitBranch className="h-4 w-4 mr-1.5" />
                        Visual Designer
                    </Button>
                    <Button
                        onClick={() => openPipelineDialog()}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm"
                    >
                        <Plus className="h-4 w-4 mr-1.5" />
                        New Pipeline
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {/* Pipeline List */}
                <div className="space-y-3">
                    {pipelines.length === 0 ? (
                        <Card className="shadow-sm">
                            <CardContent className="p-6 text-center">
                                <p className="text-sm text-muted-foreground">No pipelines configured</p>
                                <Button
                                    onClick={() => openPipelineDialog()}
                                    variant="outline"
                                    className="mt-3 text-sm"
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
                        <Card className="shadow-sm">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                <span className="text-xs font-medium text-primary">{selectedPipeline.pipeline_name} Stages</span>
                                <Button
                                    onClick={() => openStageDialog()}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-primary hover:text-primary/80 text-xs font-medium"
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Stage
                                </Button>
                            </div>
                            <CardContent className="p-4">
                                {!selectedPipeline.stages || selectedPipeline.stages.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-sm text-muted-foreground mb-3">No stages configured</p>
                                        <Button
                                            onClick={() => openStageDialog()}
                                            variant="outline"
                                            className="text-sm"
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
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="shadow-sm">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                <span className="text-xs font-medium text-primary">Stages</span>
                            </div>
                            <CardContent className="p-4">
                                <div className="text-center py-12">
                                    <p className="text-sm text-muted-foreground">
                                        Select a pipeline to view and configure stages
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Visual Pipeline Designer */}
            <Suspense fallback={null}>
                <PipelineDesigner
                    open={designerOpen}
                    onOpenChange={setDesignerOpen}
                    onSave={() => loadPipelines()}
                />
            </Suspense>

            {/* Pipeline Dialog */}
            <Dialog open={showPipelineDialog} onOpenChange={setShowPipelineDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingPipeline ? 'Edit Pipeline' : 'New Pipeline'}
                        </DialogTitle>
                        <DialogDescription className="text-sm">
                            {editingPipeline ? 'Update pipeline settings' : 'Create a new deal pipeline'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pipeline Name</label>
                            <Input
                                value={pipelineName}
                                onChange={(e) => setPipelineName(e.target.value)}
                                placeholder="e.g., Sales Pipeline"
                                className="text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Deal Type</label>
                            <Select value={pipelineDealType} onValueChange={(v) => setPipelineDealType(v as DealType)}>
                                <SelectTrigger className="text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sale" className="text-sm">Sale</SelectItem>
                                    <SelectItem value="rental" className="text-sm">Rental</SelectItem>
                                    <SelectItem value="development" className="text-sm">Development</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="isDefault"
                                checked={pipelineIsDefault}
                                onCheckedChange={(v) => setPipelineIsDefault(v as boolean)}
                            />
                            <label htmlFor="isDefault" className="text-sm">
                                Set as default pipeline for this deal type
                            </label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowPipelineDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSavePipeline}
                            disabled={!pipelineName || isSaving}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingPipeline ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Stage Dialog */}
            <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingStage ? 'Edit Stage' : 'New Stage'}
                        </DialogTitle>
                        <DialogDescription className="text-sm">
                            {editingStage ? 'Update stage settings' : 'Add a new stage to the pipeline'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Stage Name</label>
                            <Input
                                value={stageName}
                                onChange={(e) => setStageName(e.target.value)}
                                placeholder="e.g., Initial Contact"
                                className="text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</label>
                            <div className="flex flex-wrap gap-2">
                                {STAGE_COLORS.map((color) => (
                                    <button
                                        key={color.value}
                                        type="button"
                                        onClick={() => setStageColor(color.value)}
                                        className={cn(
                                            'w-8 h-8 rounded transition-all',
                                            stageColor === color.value && 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                                        )}
                                        style={{ backgroundColor: color.value }}
                                        title={color.label}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                Win Probability (%)
                            </label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                value={stageProbability}
                                onChange={(e) => setStageProbability(e.target.value)}
                                className="text-sm w-24"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Used for revenue forecasting calculations
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowStageDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveStage}
                            disabled={!stageName || isSaving}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingStage ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
