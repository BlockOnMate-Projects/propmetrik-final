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
import { ganttApi, type ProjectBaseline } from '@/lib/projects-api'
import { GanttChart, GanttData, GanttPhase, GanttMilestone } from './GanttChart'

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
        isLoading={isLoading}
        onPhaseClick={handlePhaseClick}
        onMilestoneClick={handleMilestoneClick}
        showBaseline={showBaseline}
        showDependencies={showDependencies}
        showMilestones={showMilestones}
      />
    </div>
  )
}

export default ProjectGantt
