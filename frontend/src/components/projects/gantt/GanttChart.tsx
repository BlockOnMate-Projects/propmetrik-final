'use client'

import React, { useState, useMemo, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  ZoomIn,
  ZoomOut,
  Download,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { format, differenceInDays } from 'date-fns'
import { Gantt, Task, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'

// =====================================================
// TYPES (preserved for backward compatibility)
// =====================================================
export interface GanttPhase {
  id: string
  name: string
  startDate: string
  endDate: string
  progress: number
  status: string
  isCriticalPath: boolean
  slackDays: number
  dependencyIds: string[]
  baselineStartDate?: string
  baselineEndDate?: string
  color?: string
}

export interface GanttMilestone {
  id: string
  phaseId?: string
  name: string
  date: string
  status: string
  type?: string
  isGhanaSpecific: boolean
}

export interface GanttDependency {
  fromPhaseId: string
  toPhaseId: string
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
}

export interface GanttData {
  phases: GanttPhase[]
  milestones: GanttMilestone[]
  dependencies: GanttDependency[]
  criticalPath: string[]
  startDate: string
  endDate: string
  totalDurationDays: number
  hasBaseline: boolean
}

interface GanttChartProps {
  data: GanttData | null
  isLoading?: boolean
  onPhaseClick?: (phase: GanttPhase) => void
  onMilestoneClick?: (milestone: GanttMilestone) => void
  onPhaseDragEnd?: (phaseId: string, newStart: string, newEnd: string) => void
  showBaseline?: boolean
  showDependencies?: boolean
  showMilestones?: boolean
  className?: string
}

type ZoomLevel = 'day' | 'week' | 'month'

// =====================================================
// CONSTANTS
// =====================================================
// CONSTANTS
// =====================================================
const PHASE_COLORS: Record<string, string> = {
  planning: '#3b82f6',
  land_acquisition: '#f59e0b',
  pre_construction: '#8b5cf6',
  construction: '#10b981',
  finishing: '#06b6d4',
  handover: '#fbbf24',
  default: '#6b7280',
}

const ZOOM_MAP: Record<ZoomLevel, ViewMode> = {
  day: ViewMode.Day,
  week: ViewMode.Week,
  month: ViewMode.Month,
}

// =====================================================
// HELPERS
// =====================================================
function getPhaseColor(phase: GanttPhase): string {
  if (phase.isCriticalPath) return '#ef4444'
  if (phase.color) return phase.color
  return PHASE_COLORS[phase.name.toLowerCase().replace(/\s+/g, '_')] || PHASE_COLORS.default
}

function safeDate(v: string | Date): Date {
  const d = new Date(v)
  return isNaN(d.getTime()) ? new Date() : d
}

// =====================================================
// CUSTOM TOOLTIP
// =====================================================
function CustomTooltip({ task, fontSize, fontFamily }: {
  task: Task
  fontSize: string
  fontFamily: string
}) {
  const phase = (task as any).__phase as GanttPhase | undefined
  const milestone = (task as any).__milestone as GanttMilestone | undefined

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl min-w-[200px]">
      <p className="font-mono text-xs font-medium text-zinc-100 mb-1">{task.name}</p>
      {task.type !== 'milestone' && (
        <>
          <p className="font-mono text-[10px] text-zinc-200">
            {format(task.start, 'MMM d')} – {format(task.end, 'MMM d, yyyy')}
          </p>
          <p className="font-mono text-[10px] text-zinc-200">
            Duration: {differenceInDays(task.end, task.start) + 1} days
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-zinc-200">{task.progress}%</span>
          </div>
          {phase?.isCriticalPath && (
            <Badge variant="outline" className="mt-1 bg-red-500/20 text-red-400 text-[9px] border-0">
              Critical Path
            </Badge>
          )}
          {phase && phase.slackDays > 0 && (
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
              Slack: {phase.slackDays} days
            </p>
          )}
        </>
      )}
      {task.type === 'milestone' && (
        <p className="font-mono text-[10px] text-zinc-200">
          {format(task.start, 'MMM d, yyyy')}
        </p>
      )}
      {milestone?.isGhanaSpecific && (
        <Badge variant="outline" className="mt-1 bg-amber-500/20 text-amber-400 text-[9px] border-0">
          Ghana Specific
        </Badge>
      )}
    </div>
  )
}

// =====================================================
// MAIN GANTT CHART COMPONENT
// =====================================================
export function GanttChart({
  data,
  isLoading = false,
  onPhaseClick,
  onMilestoneClick,
  onPhaseDragEnd,
  showBaseline = false,
  showDependencies = true,
  showMilestones = true,
  className,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week')

  // Build a lookup from phase ID → GanttPhase for click callbacks
  const phaseMap = useMemo(() => {
    const m = new Map<string, GanttPhase>()
    data?.phases.forEach(p => m.set(p.id, p))
    return m
  }, [data])

  const milestoneMap = useMemo(() => {
    const m = new Map<string, GanttMilestone>()
    data?.milestones.forEach(ms => m.set(ms.id, ms))
    return m
  }, [data])

  // Build dependency map: toPhaseId → [fromPhaseId, …]
  const depsByTarget = useMemo(() => {
    const m = new Map<string, string[]>()
    if (!showDependencies) return m
    data?.dependencies.forEach(d => {
      const list = m.get(d.toPhaseId) || []
      list.push(d.fromPhaseId)
      m.set(d.toPhaseId, list)
    })
    return m
  }, [data, showDependencies])

  // Convert our data model → gantt-task-react Task[]
  const tasks: Task[] = useMemo(() => {
    if (!data) return []

    const items: Task[] = []

    // Phases → tasks
    data.phases.forEach(phase => {
      const color = getPhaseColor(phase)
      const t: Task & { __phase?: GanttPhase } = {
        id: phase.id,
        name: phase.name,
        type: 'task',
        start: safeDate(phase.startDate),
        end: safeDate(phase.endDate),
        progress: phase.progress,
        dependencies: depsByTarget.get(phase.id) || [],
        styles: {
          backgroundColor: `${color}60`,
          backgroundSelectedColor: `${color}90`,
          progressColor: color,
          progressSelectedColor: color,
        },
        isDisabled: !onPhaseDragEnd,
      }
      // Stash the original phase for tooltip / click handling
      ;(t as any).__phase = phase
      items.push(t)
    })

    // Milestones → zero-duration tasks
    if (showMilestones) {
      data.milestones.forEach(ms => {
        const d = safeDate(ms.date)
        const isCompleted = ms.status === 'completed'
        const msColor = isCompleted
          ? '#10b981'
          : ms.isGhanaSpecific
            ? '#f59e0b'
            : '#3b82f6'

        const t: Task & { __milestone?: GanttMilestone } = {
          id: `ms-${ms.id}`,
          name: ms.name,
          type: 'milestone',
          start: d,
          end: d,
          progress: isCompleted ? 100 : 0,
          dependencies: ms.phaseId ? [ms.phaseId] : [],
          styles: {
            backgroundColor: msColor,
            backgroundSelectedColor: msColor,
            progressColor: msColor,
            progressSelectedColor: msColor,
          },
          isDisabled: true,
        }
        ;(t as any).__milestone = ms
        items.push(t)
      })
    }

    // Baseline phases as separate "project" bars (ghost bars below)
    if (showBaseline) {
      data.phases
        .filter(p => p.baselineStartDate && p.baselineEndDate)
        .forEach(phase => {
          items.push({
            id: `bl-${phase.id}`,
            name: `${phase.name} (baseline)`,
            type: 'project',
            start: safeDate(phase.baselineStartDate!),
            end: safeDate(phase.baselineEndDate!),
            progress: 0,
            dependencies: [],
            styles: {
              backgroundColor: '#52525b40',
              backgroundSelectedColor: '#52525b60',
              progressColor: '#52525b',
              progressSelectedColor: '#52525b',
            },
            isDisabled: true,
            hideChildren: true,
          })
        })
    }

    return items
  }, [data, depsByTarget, showMilestones, showBaseline, onPhaseDragEnd])

  // Column width varies by zoom
  const columnWidth = useMemo(() => {
    switch (zoomLevel) {
      case 'day': return 50
      case 'week': return 180
      case 'month': return 250
    }
  }, [zoomLevel])

  // Event handlers
  const handleDateChange = useCallback((task: Task) => {
    if (!onPhaseDragEnd) return
    if (task.type === 'milestone') return
    if (task.id.startsWith('bl-') || task.id.startsWith('ms-')) return

    onPhaseDragEnd(
      task.id,
      task.start.toISOString(),
      task.end.toISOString(),
    )
  }, [onPhaseDragEnd])

  const handleClick = useCallback((task: Task) => {
    if (task.id.startsWith('ms-')) {
      const ms = milestoneMap.get(task.id.replace('ms-', ''))
      if (ms && onMilestoneClick) onMilestoneClick(ms)
    } else if (!task.id.startsWith('bl-')) {
      const phase = phaseMap.get(task.id)
      if (phase && onPhaseClick) onPhaseClick(phase)
    }
  }, [phaseMap, milestoneMap, onPhaseClick, onMilestoneClick])

  const handleZoom = (direction: 'in' | 'out') => {
    const levels: ZoomLevel[] = ['month', 'week', 'day']
    const current = levels.indexOf(zoomLevel)
    if (direction === 'in' && current < levels.length - 1) {
      setZoomLevel(levels[current + 1])
    } else if (direction === 'out' && current > 0) {
      setZoomLevel(levels[current - 1])
    }
  }

  // ── Render ──
  if (isLoading) {
    return (
      <div className={cn("border border-zinc-800 bg-zinc-900/50 p-4", className)}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      </div>
    )
  }

  if (!data || tasks.length === 0) {
    return (
      <div className={cn("border border-zinc-800 bg-zinc-900/50 p-4", className)}>
        <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
          <RotateCcw className="h-8 w-8 mb-2 opacity-50" />
          <span className="font-mono text-sm">No timeline data available</span>
          <span className="font-mono text-xs text-zinc-600 mt-1">
            Add phases to see the Gantt chart
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("border border-zinc-800 bg-zinc-900/50 overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            PROJECT TIMELINE
          </span>
          {data.hasBaseline && showBaseline && (
            <Badge variant="secondary" className="bg-zinc-700 text-zinc-300 text-[10px]">
              Baseline Shown
            </Badge>
          )}
          {data.criticalPath.length > 0 && (
            <Badge variant="outline" className="bg-red-900/30 text-red-400 text-[10px] border-0">
              Critical Path: {data.criticalPath.length} phases
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('out')}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="font-mono text-[10px] text-zinc-200 w-12 text-center capitalize">
            {zoomLevel}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('in')}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
            // Export via html2canvas
            if (containerRef.current) {
              import('html2canvas').then(({ default: html2canvas }) => {
                html2canvas(containerRef.current!, { backgroundColor: '#18181b', scale: 2 }).then(canvas => {
                  const link = document.createElement('a')
                  link.download = `gantt-${format(new Date(), 'yyyy-MM-dd')}.png`
                  link.href = canvas.toDataURL('image/png')
                  link.click()
                })
              }).catch(() => {})
            }
          }}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Gantt chart */}
      <div ref={containerRef} className="gantt-dark-theme">
        <Gantt
          tasks={tasks}
          viewMode={ZOOM_MAP[zoomLevel]}
          onDateChange={handleDateChange}
          onClick={handleClick}
          listCellWidth=""
          columnWidth={columnWidth}
          ganttHeight={Math.max(tasks.length * 40 + 50, 300)}
          rowHeight={40}
          headerHeight={50}
          barFill={60}
          barCornerRadius={4}
          arrowColor="#52525b"
          todayColor="rgba(245, 158, 11, 0.15)"
          fontSize="11px"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          TooltipContent={CustomTooltip as any}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-500 rounded" />
          <span className="font-mono text-[10px] text-zinc-200">Critical Path</span>
        </div>
        {showMilestones && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-amber-500 rotate-45" />
              <span className="font-mono text-[10px] text-zinc-200">Ghana Milestone</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-blue-500 rotate-45" />
              <span className="font-mono text-[10px] text-zinc-200">Milestone</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-amber-500" />
          <span className="font-mono text-[10px] text-zinc-200">Today</span>
        </div>
        {showBaseline && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 bg-zinc-500 rounded" />
            <span className="font-mono text-[10px] text-zinc-200">Baseline</span>
          </div>
        )}
      </div>

      {/* Light chart area — keep text BLACK for readability */}
      <style jsx global>{`
        .gantt-dark-theme svg text {
          fill: #1a1a1a !important;
          font-weight: 500 !important;
        }
        .gantt-dark-theme svg line {
          stroke: #e4e4e7 !important;
        }
      `}</style>
    </div>
  )
}

export default GanttChart