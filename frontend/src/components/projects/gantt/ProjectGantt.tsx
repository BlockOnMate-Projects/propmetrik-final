'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
  Layers,
  Settings2,
  History,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ganttApi, phasesApi, type ProjectBaseline } from '@/lib/projects-api'
import { type ProjectPhase } from '@/types/projects'
import { GanttChart, GanttData, GanttPhase, GanttMilestone } from './GanttChart'
import { WorkBreakdownStructure } from '../WorkBreakdownStructure'

// =====================================================
// TYPES
// =====================================================
interface ProjectGanttProps {
  projectId: string
  className?: string
  onPhaseEdit?: (phase: GanttPhase) => void
  onMilestoneEdit?: (milestone: GanttMilestone) => void
}

// =====================================================
// VIEW OPTIONS COMPONENT
// =====================================================
function ViewOptions({
  showBaseline,
  onShowBaselineChange,
  showDependencies,
  onShowDependenciesChange,
  showMilestones,
  onShowMilestonesChange,
}: {
  showBaseline: boolean
  onShowBaselineChange: (v: boolean) => void
  showDependencies: boolean
  onShowDependenciesChange: (v: boolean) => void
  showMilestones: boolean
  onShowMilestonesChange: (v: boolean) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          View
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 bg-zinc-900 border-zinc-700" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="baseline" className="text-xs text-zinc-300">
              Show Baseline
            </Label>
            <Switch
              id="baseline"
              checked={showBaseline}
              onCheckedChange={onShowBaselineChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="dependencies" className="text-xs text-zinc-300">
              Show Dependencies
            </Label>
            <Switch
              id="dependencies"
              checked={showDependencies}
              onCheckedChange={onShowDependenciesChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="milestones" className="text-xs text-zinc-300">
              Show Milestones
            </Label>
            <Switch
              id="milestones"
              checked={showMilestones}
              onCheckedChange={onShowMilestonesChange}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// =====================================================
// BASELINE MANAGER COMPONENT
// =====================================================
function BaselineManager({
  projectId,
  currentBaseline,
  onBaselineCreated,
}: {
  projectId: string
  currentBaseline?: ProjectBaseline
  onBaselineCreated: () => void
}) {
  const queryClient = useQueryClient()

  const { data: baselines, isLoading } = useQuery({
    queryKey: ['gantt', projectId, 'baselines'],
    queryFn: () => ganttApi.getBaselines(projectId).catch(() => []),
    retry: false,
  })

  const createBaselineMutation = useMutation({
    mutationFn: (data: { name: string }) =>
      ganttApi.createBaseline(projectId, data.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gantt', projectId] })
      onBaselineCreated()
    },
  })

  const handleCreateBaseline = () => {
    const name = `Baseline ${new Date().toLocaleDateString()}`
    createBaselineMutation.mutate({ name })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <History className="h-3.5 w-3.5" />
          Baselines
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-zinc-900 border-zinc-700" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-400">Saved Baselines</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleCreateBaseline}
              disabled={createBaselineMutation.isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Save Current
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : baselines && baselines.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {baselines.map((baseline: ProjectBaseline) => (
                <div
                  key={baseline.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded text-xs",
                    currentBaseline?.id === baseline.id
                      ? "bg-amber-500/20 border border-amber-500/30"
                      : "hover:bg-zinc-800"
                  )}
                >
                  <div>
                    <span className="text-zinc-300">{baseline.name}</span>
                    <span className="text-zinc-500 text-[10px] block">
                      {new Date(baseline.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 text-center py-4">
              No baselines saved yet
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// =====================================================
// CRITICAL PATH SUMMARY
// =====================================================
function CriticalPathSummary({
  criticalPath,
  phases,
}: {
  criticalPath: string[]
  phases: GanttPhase[]
}) {
  const criticalPhases = useMemo(() => {
    return criticalPath
      .map(id => phases.find(p => p.id === id))
      .filter(Boolean) as GanttPhase[]
  }, [criticalPath, phases])

  if (criticalPhases.length === 0) return null

  const totalDays = criticalPhases.reduce((acc, phase) => {
    const start = new Date(phase.startDate)
    const end = new Date(phase.endDate)
    return acc + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }, 0)

  return (
    <Card className="bg-red-500/5 border-red-500/20">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs text-red-400 font-mono flex items-center gap-1.5">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          Critical Path ({totalDays} days)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        <div className="flex flex-wrap gap-1">
          {criticalPhases.map((phase, i) => (
            <React.Fragment key={phase.id}>
              <span className="font-mono text-[10px] text-red-300 bg-red-500/20 px-1.5 py-0.5 rounded">
                {phase.name}
              </span>
              {i < criticalPhases.length - 1 && (
                <span className="text-red-500 text-[10px]">→</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// MAIN PROJECT GANTT COMPONENT
// =====================================================
export function ProjectGantt({
  projectId,
  className,
  onPhaseEdit,
  onMilestoneEdit,
}: ProjectGanttProps) {
  const [showBaseline, setShowBaseline] = useState(false)
  const [showDependencies, setShowDependencies] = useState(true)
  const [showMilestones, setShowMilestones] = useState(true)
  const [activeTab, setActiveTab] = useState('timeline')
  const queryClient = useQueryClient()

  // Fetch Gantt data
  const { data: ganttData, isLoading, error, refetch } = useQuery({
    queryKey: ['gantt', projectId],
    queryFn: () => ganttApi.getData(projectId),
    staleTime: 30000,
  })

  // Fetch critical path - handle errors gracefully
  const { data: criticalPathData } = useQuery({
    queryKey: ['gantt', projectId, 'critical-path'],
    queryFn: () => ganttApi.calculateCriticalPath(projectId).catch(() => ({ criticalPath: [] })),
    enabled: !!ganttData,
    retry: false,
  })

  // Transform API response to GanttData format
  const chartData: GanttData | null = useMemo(() => {
    if (!ganttData) return null

    // Calculate total duration if not provided
    let totalDurationDays = ganttData.totalDurationDays
    if (!totalDurationDays && ganttData.startDate && ganttData.endDate) {
      const start = new Date(ganttData.startDate)
      const end = new Date(ganttData.endDate)
      totalDurationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    }

    return {
      phases: ganttData.phases || [],
      milestones: ganttData.milestones || [],
      dependencies: ganttData.dependencies || [],
      criticalPath: criticalPathData?.criticalPath || ganttData.criticalPath || [],
      startDate: ganttData.startDate,
      endDate: ganttData.endDate,
      totalDurationDays: totalDurationDays || 30, // Default to 30 days
      hasBaseline: ganttData.hasBaseline || false,
    }
  }, [ganttData, criticalPathData])

  const updatePhaseMutation = useMutation({
    mutationFn: (data: { phaseId: string; updates: Partial<ProjectPhase> }) =>
      phasesApi.update(data.phaseId, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gantt', projectId] })
      refetch()
    },
  })

  // Add Phase Mutation
  const addPhaseMutation = useMutation({
    mutationFn: (newPhase: Partial<ProjectPhase>) => phasesApi.create(projectId, newPhase),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gantt', projectId] })
      refetch()
    },
  })

  // Delete Phase Mutation
  const deletePhaseMutation = useMutation({
    mutationFn: (phaseId: string) => phasesApi.delete(phaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gantt', projectId] })
      refetch()
    },
  })

  const handleAddPhase = () => {
    // Generate default dates
    let start_date = new Date()
    if (chartData && chartData.phases.length > 0) {
      // Start after the last phase
      const dates = chartData.phases.map((p: any) => new Date(p.endDate).getTime())
      start_date = new Date(Math.max(...dates))
      start_date.setDate(start_date.getDate() + 1)
    } else if (chartData?.startDate) {
      start_date = new Date(chartData.startDate)
    }

    const end_date = new Date(start_date)
    end_date.setDate(end_date.getDate() + 14) // Default 2 weeks

    addPhaseMutation.mutate({
      phase_name: `New Phase ${chartData ? chartData.phases.length + 1 : 1}`,
      planned_start_date: start_date.toISOString(),
      planned_end_date: end_date.toISOString(),
      progress_percentage: 0,
    })
  }

  const handleDeletePhase = (phaseId: string) => {
    if (confirm("Are you sure you want to delete this phase?")) {
      deletePhaseMutation.mutate(phaseId)
    }
  }

  const handlePhaseDragEnd = (phaseId: string, newStart: string, newEnd: string) => {
    updatePhaseMutation.mutate({
      phaseId,
      updates: {
        planned_start_date: newStart,
        planned_end_date: newEnd,
      },
    })
  }

  const handlePhaseClick = (phase: GanttPhase) => {
    onPhaseEdit?.(phase)
  }

  const handleMilestoneClick = (milestone: GanttMilestone) => {
    onMilestoneEdit?.(milestone)
  }

  const handleBaselineCreated = () => {
    refetch()
  }

  if (error) {
    return (
      <div className={cn("border border-zinc-800 bg-zinc-900/50 p-8", className)}>
        <div className="flex flex-col items-center justify-center text-center">
          <span className="text-red-400 font-mono text-sm mb-2">
            Failed to load timeline
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm text-zinc-300">Project Timeline</h3>

        <div className="flex items-center gap-2">
          <ViewOptions
            showBaseline={showBaseline}
            onShowBaselineChange={setShowBaseline}
            showDependencies={showDependencies}
            onShowDependenciesChange={setShowDependencies}
            showMilestones={showMilestones}
            onShowMilestonesChange={setShowMilestones}
          />

          <BaselineManager
            projectId={projectId}
            onBaselineCreated={handleBaselineCreated}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-zinc-800/50 border border-zinc-700 h-9 p-0.5">
          <TabsTrigger value="timeline" className="font-mono text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-amber-500">
            Timeline View
          </TabsTrigger>
          <TabsTrigger value="wbs" className="font-mono text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-amber-500">
            WBS (Spreadsheet)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-3 mt-0">
          {/* Critical Path Summary */}
          {chartData && chartData.criticalPath.length > 0 && (
            <CriticalPathSummary
              criticalPath={chartData.criticalPath}
              phases={chartData.phases}
            />
          )}

          {/* Gantt Chart */}
          <GanttChart
            data={chartData}
            isLoading={isLoading || updatePhaseMutation.isPending}
            onPhaseClick={handlePhaseClick}
            onMilestoneClick={handleMilestoneClick}
            onPhaseDragEnd={handlePhaseDragEnd}
            showBaseline={showBaseline}
            showDependencies={showDependencies}
            showMilestones={showMilestones}
          />
        </TabsContent>

        <TabsContent value="wbs" className="mt-0">
          <WorkBreakdownStructure
            data={chartData}
            onUpdatePhase={(phase) => {
              updatePhaseMutation.mutate({
                phaseId: phase.id,
                updates: {
                  phase_name: phase.name,
                  planned_start_date: phase.startDate,
                  planned_end_date: phase.endDate,
                  progress_percentage: phase.progress
                }
              })
            }}
            onAddPhase={handleAddPhase}
            onDeletePhase={handleDeletePhase}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default ProjectGantt
