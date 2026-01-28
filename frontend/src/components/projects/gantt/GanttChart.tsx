'use client'

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  Flag,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Milestone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { format, differenceInDays, addDays, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, startOfMonth, isWithinInterval, isSameDay } from 'date-fns'
import html2canvas from 'html2canvas'

// =====================================================
// TYPES
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
const PHASE_COLORS: Record<string, string> = {
  planning: '#3b82f6',
  land_acquisition: '#f59e0b',
  pre_construction: '#8b5cf6',
  construction: '#10b981',
  finishing: '#06b6d4',
  handover: '#fbbf24',
  default: '#6b7280',
}

const STATUS_COLORS: Record<string, string> = {
  not_started: '#6b7280',
  in_progress: '#3b82f6',
  completed: '#10b981',
  delayed: '#ef4444',
  blocked: '#dc2626',
}

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 60
const LEFT_PANEL_WIDTH = 250

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function getPhaseColor(phase: GanttPhase): string {
  if (phase.isCriticalPath) return '#ef4444'
  if (phase.color) return phase.color
  return PHASE_COLORS[phase.name.toLowerCase().replace(/\s+/g, '_')] || PHASE_COLORS.default
}

function calculatePosition(date: string, startDate: Date, dayWidth: number): number {
  const d = new Date(date)
  const days = differenceInDays(d, startDate)
  return days * dayWidth
}

function calculateWidth(startDate: string, endDate: string, dayWidth: number): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = differenceInDays(end, start) + 1
  return Math.max(days * dayWidth, dayWidth)
}

// =====================================================
// TIME HEADER COMPONENT
// =====================================================
function TimeHeader({
  startDate,
  endDate,
  zoomLevel,
  dayWidth,
}: {
  startDate: Date
  endDate: Date
  zoomLevel: ZoomLevel
  dayWidth: number
}) {
  const units = useMemo(() => {
    if (zoomLevel === 'day') {
      return eachDayOfInterval({ start: startDate, end: endDate }).map(d => ({
        date: d,
        label: format(d, 'd'),
        subLabel: format(d, 'EEE'),
        width: dayWidth,
      }))
    } else if (zoomLevel === 'week') {
      return eachWeekOfInterval({ start: startDate, end: endDate }).map(d => ({
        date: d,
        label: `W${format(d, 'w')}`,
        subLabel: format(d, 'MMM d'),
        width: dayWidth * 7,
      }))
    } else {
      return eachMonthOfInterval({ start: startDate, end: endDate }).map(d => ({
        date: d,
        label: format(d, 'MMM'),
        subLabel: format(d, 'yyyy'),
        width: dayWidth * 30,
      }))
    }
  }, [startDate, endDate, zoomLevel, dayWidth])

  return (
    <div 
      className="flex border-b border-zinc-700 bg-zinc-900 sticky top-0 z-10"
      style={{ height: HEADER_HEIGHT }}
    >
      {units.map((unit, i) => (
        <div
          key={i}
          className="border-r border-zinc-800 flex flex-col items-center justify-center shrink-0"
          style={{ width: unit.width }}
        >
          <span className="font-mono text-xs text-zinc-400">{unit.label}</span>
          <span className="font-mono text-[10px] text-zinc-600">{unit.subLabel}</span>
        </div>
      ))}
    </div>
  )
}

// =====================================================
// DRAGGABLE PHASE BAR COMPONENT
// =====================================================
function DraggablePhaseBar({
  phase,
  startDate,
  dayWidth,
  showBaseline,
  onClick,
  onDragEnd,
  isEditable = true,
}: {
  phase: GanttPhase
  startDate: Date
  dayWidth: number
  showBaseline: boolean
  onClick?: () => void
  onDragEnd?: (phaseId: string, newStart: string, newEnd: string) => void
  isEditable?: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, startX: 0, originalLeft: 0 })
  const barRef = useRef<HTMLDivElement>(null)

  const left = calculatePosition(phase.startDate, startDate, dayWidth)
  const width = calculateWidth(phase.startDate, phase.endDate, dayWidth)
  const color = getPhaseColor(phase)
  const progressWidth = (phase.progress / 100) * width

  // Calculate new dates from pixel offset
  const calculateNewDates = useCallback((offsetX: number, resizeMode: 'left' | 'right' | null) => {
    const daysMoved = Math.round(offsetX / dayWidth)
    const currentStart = new Date(phase.startDate)
    const currentEnd = new Date(phase.endDate)

    if (resizeMode === 'left') {
      const newStart = addDays(currentStart, daysMoved)
      // Prevent start from going past end
      if (newStart >= currentEnd) return null
      return { start: newStart.toISOString(), end: currentEnd.toISOString() }
    } else if (resizeMode === 'right') {
      const newEnd = addDays(currentEnd, daysMoved)
      // Prevent end from going before start
      if (newEnd <= currentStart) return null
      return { start: currentStart.toISOString(), end: newEnd.toISOString() }
    } else {
      // Moving the whole bar
      return {
        start: addDays(currentStart, daysMoved).toISOString(),
        end: addDays(currentEnd, daysMoved).toISOString(),
      }
    }
  }, [phase.startDate, phase.endDate, dayWidth])

  // Mouse handlers for drag
  const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'move' | 'resize-left' | 'resize-right') => {
    if (!isEditable || !onDragEnd) return
    e.preventDefault()
    e.stopPropagation()

    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return

    setDragOffset({
      x: 0,
      startX: e.clientX,
      originalLeft: left,
    })

    if (mode === 'move') {
      setIsDragging(true)
    } else if (mode === 'resize-left') {
      setIsResizing('left')
    } else if (mode === 'resize-right') {
      setIsResizing('right')
    }
  }, [isEditable, onDragEnd, left])

  // Global mouse move handler
  useEffect(() => {
    if (!isDragging && !isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const offsetX = e.clientX - dragOffset.startX
      setDragOffset(prev => ({ ...prev, x: offsetX }))
    }

    const handleMouseUp = () => {
      if (dragOffset.x !== 0 && onDragEnd) {
        const newDates = calculateNewDates(dragOffset.x, isResizing)
        if (newDates) {
          onDragEnd(phase.id, newDates.start, newDates.end)
        }
      }
      setIsDragging(false)
      setIsResizing(null)
      setDragOffset({ x: 0, startX: 0, originalLeft: 0 })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isResizing, dragOffset.startX, dragOffset.x, onDragEnd, phase.id, calculateNewDates])

  // Calculate display values during drag
  const displayLeft = isDragging ? left + dragOffset.x : (isResizing === 'left' ? left + dragOffset.x : left)
  const displayWidth = isResizing === 'left' 
    ? width - dragOffset.x 
    : isResizing === 'right' 
    ? width + dragOffset.x 
    : width

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={barRef}
            className={cn(
              "absolute h-6 rounded transition-all",
              phase.isCriticalPath && "ring-2 ring-red-500/50",
              (isDragging || isResizing) && "opacity-75 ring-2 ring-amber-500",
              isEditable && onDragEnd ? "cursor-move" : "cursor-pointer"
            )}
            style={{
              left: displayLeft,
              width: Math.max(displayWidth, 20),
              top: (ROW_HEIGHT - 24) / 2,
              backgroundColor: `${color}30`,
              border: `1px solid ${color}`,
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
            onClick={(e) => {
              if (!isDragging && !isResizing && onClick) {
                onClick()
              }
            }}
          >
            {/* Left resize handle */}
            {isEditable && onDragEnd && (
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-l"
                onMouseDown={(e) => handleMouseDown(e, 'resize-left')}
              />
            )}

            {/* Progress fill */}
            <div
              className="h-full rounded-l pointer-events-none"
              style={{
                width: progressWidth,
                backgroundColor: color,
              }}
            />
            
            {/* Phase name */}
            {displayWidth > 60 && (
              <span 
                className="absolute inset-0 flex items-center px-2 font-mono text-[10px] text-white truncate pointer-events-none"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
              >
                {phase.name}
              </span>
            )}

            {/* Right resize handle */}
            {isEditable && onDragEnd && (
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-r"
                onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
              />
            )}

            {/* Critical path indicator */}
            {phase.isCriticalPath && (
              <div className="absolute -top-1 -right-1 pointer-events-none">
                <AlertTriangle className="h-3 w-3 text-red-500" />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-zinc-900 border-zinc-700 p-3">
          <div className="space-y-1">
            <p className="font-mono text-xs font-medium text-zinc-100">{phase.name}</p>
            <p className="font-mono text-[10px] text-zinc-400">
              {format(new Date(phase.startDate), 'MMM d')} - {format(new Date(phase.endDate), 'MMM d, yyyy')}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${phase.progress}%`, backgroundColor: color }}
                />
              </div>
              <span className="font-mono text-[10px] text-zinc-400">{phase.progress}%</span>
            </div>
            {phase.isCriticalPath && (
              <Badge className="bg-red-500/20 text-red-400 text-[9px]">
                Critical Path
              </Badge>
            )}
            {phase.slackDays > 0 && (
              <p className="font-mono text-[10px] text-zinc-500">
                Slack: {phase.slackDays} days
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Baseline indicator */}
      {showBaseline && phase.baselineStartDate && phase.baselineEndDate && (
        <div
          className="absolute h-1 rounded opacity-50"
          style={{
            left: calculatePosition(phase.baselineStartDate, startDate, dayWidth),
            width: calculateWidth(phase.baselineStartDate, phase.baselineEndDate, dayWidth),
            top: ROW_HEIGHT - 4,
            backgroundColor: '#6b7280',
          }}
        />
      )}
    </TooltipProvider>
  )
}

// =====================================================
// MILESTONE MARKER COMPONENT
// =====================================================
function MilestoneMarker({
  milestone,
  startDate,
  dayWidth,
  rowIndex,
  onClick,
}: {
  milestone: GanttMilestone
  startDate: Date
  dayWidth: number
  rowIndex: number
  onClick?: () => void
}) {
  const left = calculatePosition(milestone.date, startDate, dayWidth)
  const isCompleted = milestone.status === 'completed'
  const isMissed = milestone.status === 'missed'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "absolute w-4 h-4 transform rotate-45 cursor-pointer transition-all hover:scale-110",
              isCompleted ? "bg-green-500" : isMissed ? "bg-red-500" : 
              milestone.isGhanaSpecific ? "bg-amber-500" : "bg-blue-500"
            )}
            style={{
              left: left - 8,
              top: rowIndex * ROW_HEIGHT + HEADER_HEIGHT + (ROW_HEIGHT - 16) / 2,
            }}
            onClick={onClick}
          />
        </TooltipTrigger>
        <TooltipContent className="bg-zinc-900 border-zinc-700">
          <p className="font-mono text-xs text-zinc-100">{milestone.name}</p>
          <p className="font-mono text-[10px] text-zinc-400">
            {format(new Date(milestone.date), 'MMM d, yyyy')}
          </p>
          {milestone.isGhanaSpecific && (
            <Badge className="bg-amber-500/20 text-amber-400 text-[9px] mt-1">
              Ghana Specific
            </Badge>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// =====================================================
// DEPENDENCY LINE COMPONENT
// =====================================================
function DependencyLine({
  from,
  to,
  phases,
  startDate,
  dayWidth,
}: {
  from: string
  to: string
  phases: GanttPhase[]
  startDate: Date
  dayWidth: number
}) {
  const fromPhase = phases.find(p => p.id === from)
  const toPhase = phases.find(p => p.id === to)
  
  if (!fromPhase || !toPhase) return null

  const fromIndex = phases.indexOf(fromPhase)
  const toIndex = phases.indexOf(toPhase)
  
  const fromX = calculatePosition(fromPhase.endDate, startDate, dayWidth) + calculateWidth(fromPhase.startDate, fromPhase.endDate, dayWidth)
  const fromY = fromIndex * ROW_HEIGHT + HEADER_HEIGHT + ROW_HEIGHT / 2
  const toX = calculatePosition(toPhase.startDate, startDate, dayWidth)
  const toY = toIndex * ROW_HEIGHT + HEADER_HEIGHT + ROW_HEIGHT / 2

  const midX = (fromX + toX) / 2

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 5 }}>
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="10"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
        </marker>
      </defs>
      <path
        d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
        fill="none"
        stroke="#6b7280"
        strokeWidth="1"
        strokeDasharray="4 2"
        markerEnd="url(#arrowhead)"
      />
    </svg>
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
  const chartRef = useRef<HTMLDivElement>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week')
  const [scrollPosition, setScrollPosition] = useState(0)

  // Calculate day width based on zoom level
  const dayWidth = useMemo(() => {
    switch (zoomLevel) {
      case 'day': return 40
      case 'week': return 15
      case 'month': return 4
    }
  }, [zoomLevel])

  // Parse dates
  const dateRange = useMemo(() => {
    if (!data) return null
    return {
      start: new Date(data.startDate),
      end: new Date(data.endDate),
    }
  }, [data])

  // Export to PNG
  const handleExport = useCallback(async () => {
    if (!chartRef.current) return

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#18181b',
        scale: 2,
      })
      
      const link = document.createElement('a')
      link.download = `gantt-chart-${format(new Date(), 'yyyy-MM-dd')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    }
  }, [])

  // Scroll controls
  const handleScrollLeft = () => {
    setScrollPosition(prev => Math.max(0, prev - 200))
  }

  const handleScrollRight = () => {
    setScrollPosition(prev => prev + 200)
  }

  if (isLoading) {
    return (
      <div className={cn("border border-zinc-800 bg-zinc-900/50 p-4", className)}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      </div>
    )
  }

  if (!data || !dateRange) {
    return (
      <div className={cn("border border-zinc-800 bg-zinc-900/50 p-4", className)}>
        <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
          <Calendar className="h-8 w-8 mb-2 opacity-50" />
          <span className="font-mono text-sm">No timeline data available</span>
        </div>
      </div>
    )
  }

  const totalDurationDays = data.totalDurationDays || 30 // Default to 30 days if not set
  const totalWidth = Math.max(totalDurationDays * dayWidth, 500) // Ensure minimum width
  const totalHeight = HEADER_HEIGHT + data.phases.length * ROW_HEIGHT

  return (
    <div className={cn("border border-zinc-800 bg-zinc-900/50 overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            PROJECT TIMELINE
          </span>
          {data.hasBaseline && showBaseline && (
            <Badge variant="secondary" className="bg-zinc-700 text-zinc-300 text-[10px]">
              Baseline Shown
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Select value={zoomLevel} onValueChange={(v) => setZoomLevel(v as ZoomLevel)}>
            <SelectTrigger className="w-24 h-7 text-xs bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="day" className="text-xs">Day</SelectItem>
              <SelectItem value="week" className="text-xs">Week</SelectItem>
              <SelectItem value="month" className="text-xs">Month</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleScrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleScrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chart container */}
      <div className="flex overflow-hidden">
        {/* Left panel - Phase names */}
        <div 
          className="shrink-0 border-r border-zinc-700 bg-zinc-900"
          style={{ width: LEFT_PANEL_WIDTH }}
        >
          {/* Header */}
          <div 
            className="flex items-center px-3 border-b border-zinc-700 bg-zinc-800"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="font-mono text-xs text-zinc-400">Phases</span>
          </div>
          
          {/* Phase list */}
          {data.phases.map((phase, i) => (
            <div
              key={phase.id}
              className={cn(
                "flex items-center px-3 border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer",
                phase.isCriticalPath && "bg-red-500/5"
              )}
              style={{ height: ROW_HEIGHT }}
              onClick={() => onPhaseClick?.(phase)}
            >
              <div
                className="w-2 h-2 rounded-full mr-2 shrink-0"
                style={{ backgroundColor: getPhaseColor(phase) }}
              />
              <span className="font-mono text-xs text-zinc-300 truncate flex-1">
                {phase.name}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                {phase.progress}%
              </span>
            </div>
          ))}
        </div>

        {/* Right panel - Timeline */}
        <div 
          ref={chartRef}
          className="flex-1 overflow-x-auto"
          style={{ transform: `translateX(-${scrollPosition}px)` }}
        >
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            {/* Time header */}
            <TimeHeader
              startDate={dateRange.start}
              endDate={dateRange.end}
              zoomLevel={zoomLevel}
              dayWidth={dayWidth}
            />

            {/* Grid and bars */}
            <div className="relative" style={{ height: data.phases.length * ROW_HEIGHT }}>
              {/* Grid lines */}
              {data.phases.map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-b border-zinc-800"
                  style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                />
              ))}

              {/* Today line */}
              {isWithinInterval(new Date(), { start: dateRange.start, end: dateRange.end }) && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-20"
                  style={{
                    left: calculatePosition(new Date().toISOString(), dateRange.start, dayWidth),
                  }}
                />
              )}

              {/* Dependencies */}
              {showDependencies && data.dependencies.map((dep, i) => (
                <DependencyLine
                  key={i}
                  from={dep.fromPhaseId}
                  to={dep.toPhaseId}
                  phases={data.phases}
                  startDate={dateRange.start}
                  dayWidth={dayWidth}
                />
              ))}

              {/* Phase bars */}
              {data.phases.map((phase, i) => (
                <div
                  key={phase.id}
                  className="absolute left-0 right-0"
                  style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                >
                  <DraggablePhaseBar
                    phase={phase}
                    startDate={dateRange.start}
                    dayWidth={dayWidth}
                    showBaseline={showBaseline}
                    onClick={() => onPhaseClick?.(phase)}
                    onDragEnd={onPhaseDragEnd}
                    isEditable={!!onPhaseDragEnd}
                  />
                </div>
              ))}

              {/* Milestones */}
              {showMilestones && data.milestones.map((milestone) => {
                const phaseIndex = milestone.phaseId
                  ? data.phases.findIndex(p => p.id === milestone.phaseId)
                  : 0
                
                return (
                  <MilestoneMarker
                    key={milestone.id}
                    milestone={milestone}
                    startDate={dateRange.start}
                    dayWidth={dayWidth}
                    rowIndex={phaseIndex >= 0 ? phaseIndex : 0}
                    onClick={() => onMilestoneClick?.(milestone)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-500 rounded" />
          <span className="font-mono text-[10px] text-zinc-400">Critical Path</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-amber-500 rotate-45" />
          <span className="font-mono text-[10px] text-zinc-400">Ghana Milestone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-blue-500 rotate-45" />
          <span className="font-mono text-[10px] text-zinc-400">Milestone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-amber-500" />
          <span className="font-mono text-[10px] text-zinc-400">Today</span>
        </div>
      </div>
    </div>
  )
}

export default GanttChart
