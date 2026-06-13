'use client'

import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Flag,
  ChevronRight,
  Loader2,
  MapPin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format, differenceInDays, isToday, isTomorrow, isThisWeek, isPast } from 'date-fns'

// =====================================================
// TYPES
// =====================================================
export interface ProjectMilestone {
  id: string
  project_id: string
  phase_id?: string
  name: string
  description?: string
  target_date: string
  actual_date?: string
  status: 'pending' | 'completed' | 'missed' | 'rescheduled'
  milestone_type?: string
  is_ghana_specific: boolean
  phase_name?: string
  project_name?: string
  created_at: string
  updated_at: string
}

interface MilestonesWidgetProps {
  milestones: ProjectMilestone[]
  isLoading?: boolean
  onMilestoneClick?: (milestone: ProjectMilestone) => void
  onViewAll?: () => void
  maxVisible?: number
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================
const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Pending',
  },
  completed: {
    icon: CheckCircle,
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-600 dark:text-green-400',
    label: 'Completed',
  },
  missed: {
    icon: XCircle,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    label: 'Missed',
  },
  rescheduled: {
    icon: AlertTriangle,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Rescheduled',
  },
}

const TYPE_LABELS: Record<string, string> = {
  permit: 'Permit',
  inspection: 'Inspection',
  payment: 'Payment',
  handover: 'Handover',
  construction: 'Construction',
  legal: 'Legal',
}

// =====================================================
// MILESTONE ITEM COMPONENT
// =====================================================
function MilestoneItem({
  milestone,
  onClick,
}: {
  milestone: ProjectMilestone
  onClick?: (milestone: ProjectMilestone) => void
}) {
  const config = STATUS_CONFIG[milestone.status]
  const StatusIcon = config.icon
  const targetDate = new Date(milestone.target_date)
  const daysUntil = differenceInDays(targetDate, new Date())
  const isOverdue = milestone.status === 'pending' && isPast(targetDate) && !isToday(targetDate)

  // Date formatting
  const getDateLabel = () => {
    if (isToday(targetDate)) return 'Today'
    if (isTomorrow(targetDate)) return 'Tomorrow'
    if (isThisWeek(targetDate)) return format(targetDate, 'EEEE')
    return format(targetDate, 'MMM d')
  }

  const getUrgencyLabel = () => {
    if (isOverdue) return `${Math.abs(daysUntil)} days overdue`
    if (daysUntil === 0) return 'Due today'
    if (daysUntil === 1) return 'Due tomorrow'
    if (daysUntil <= 7) return `${daysUntil} days left`
    return format(targetDate, 'MMM d, yyyy')
  }

  return (
    <div
      onClick={() => onClick?.(milestone)}
      className={cn(
        "flex items-start gap-3 p-3 border rounded transition-colors",
        isOverdue ? 'bg-red-500/5 border-red-500/30' : config.bg,
        isOverdue ? '' : config.border,
        onClick && "cursor-pointer hover:bg-muted/50"
      )}
    >
      {/* Status icon */}
      <div className={cn(
        "p-1.5 rounded-full shrink-0",
        isOverdue ? 'bg-red-500/20' : config.bg
      )}>
        <StatusIcon className={cn(
          "h-4 w-4",
          isOverdue ? 'text-red-600 dark:text-red-400' : config.text
        )} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Project and phase */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[10px] text-muted-foreground truncate">
            {milestone.project_name}
          </span>
          {milestone.phase_name && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="font-mono text-[10px] text-muted-foreground truncate">
                {milestone.phase_name}
              </span>
            </>
          )}
        </div>

        {/* Milestone name */}
        <p className="font-mono text-xs text-zinc-200 leading-snug">
          {milestone.name}
        </p>

        {/* Tags */}
        <div className="flex items-center gap-2 mt-1.5">
          {milestone.milestone_type && (
            <Badge 
              variant="secondary" 
              className="text-[9px] h-4 px-1.5 bg-muted text-muted-foreground"
            >
              {TYPE_LABELS[milestone.milestone_type] || milestone.milestone_type}
            </Badge>
          )}
          {milestone.is_ghana_specific && (
            <Badge 
              variant="secondary" 
              className="text-[9px] h-4 px-1.5 bg-amber-500/20 text-amber-600 dark:text-amber-400"
            >
              <MapPin className="h-2.5 w-2.5 mr-0.5" />
              Ghana
            </Badge>
          )}
        </div>
      </div>

      {/* Date */}
      <div className="text-right shrink-0">
        <div className={cn(
          "font-mono text-xs font-medium",
          isOverdue ? 'text-red-600 dark:text-red-400' : 
          daysUntil <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
        )}>
          {getDateLabel()}
        </div>
        <div className={cn(
          "font-mono text-[10px]",
          isOverdue ? 'text-red-600 dark:text-red-400/70' : 'text-muted-foreground'
        )}>
          {getUrgencyLabel()}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// GROUP BY DATE COMPONENT
// =====================================================
function MilestoneGroup({
  label,
  milestones,
  onMilestoneClick,
}: {
  label: string
  milestones: ProjectMilestone[]
  onMilestoneClick?: (milestone: ProjectMilestone) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className="flex-1 h-px bg-muted" />
      </div>
      <div className="space-y-2">
        {milestones.map((milestone) => (
          <MilestoneItem
            key={milestone.id}
            milestone={milestone}
            onClick={onMilestoneClick}
          />
        ))}
      </div>
    </div>
  )
}

// =====================================================
// MAIN MILESTONES WIDGET COMPONENT
// =====================================================
export function MilestonesWidget({
  milestones,
  isLoading = false,
  onMilestoneClick,
  onViewAll,
  maxVisible = 10,
  className,
}: MilestonesWidgetProps) {
  // Group milestones by urgency
  const grouped = useMemo(() => {
    const overdue: ProjectMilestone[] = []
    const today: ProjectMilestone[] = []
    const thisWeek: ProjectMilestone[] = []
    const later: ProjectMilestone[] = []

    const visibleMilestones = milestones.slice(0, maxVisible)

    visibleMilestones.forEach((milestone) => {
      if (milestone.status !== 'pending') return

      const targetDate = new Date(milestone.target_date)
      const now = new Date()

      if (isPast(targetDate) && !isToday(targetDate)) {
        overdue.push(milestone)
      } else if (isToday(targetDate)) {
        today.push(milestone)
      } else if (isThisWeek(targetDate)) {
        thisWeek.push(milestone)
      } else {
        later.push(milestone)
      }
    })

    return { overdue, today, thisWeek, later }
  }, [milestones, maxVisible])

  const totalCount = milestones.filter(m => m.status === 'pending').length

  return (
    <div className={cn("border border-border bg-card/50", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            UPCOMING MILESTONES
          </span>
          {totalCount > 0 && (
            <Badge variant="secondary" className="bg-zinc-700 text-muted-foreground text-[10px]">
              {totalCount}
            </Badge>
          )}
        </div>
        
        {onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-xs text-muted-foreground hover:text-muted-foreground h-7"
          >
            View All
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mb-2 opacity-50" />
            <span className="font-mono text-xs">No upcoming milestones</span>
            <span className="font-mono text-[10px]">All milestones are complete</span>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.overdue.length > 0 && (
              <MilestoneGroup
                label="Overdue"
                milestones={grouped.overdue}
                onMilestoneClick={onMilestoneClick}
              />
            )}
            
            {grouped.today.length > 0 && (
              <MilestoneGroup
                label="Today"
                milestones={grouped.today}
                onMilestoneClick={onMilestoneClick}
              />
            )}
            
            {grouped.thisWeek.length > 0 && (
              <MilestoneGroup
                label="This Week"
                milestones={grouped.thisWeek}
                onMilestoneClick={onMilestoneClick}
              />
            )}
            
            {grouped.later.length > 0 && (
              <MilestoneGroup
                label="Later"
                milestones={grouped.later}
                onMilestoneClick={onMilestoneClick}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer - show count of hidden */}
      {milestones.length > maxVisible && (
        <div className="px-4 py-2 border-t border-border text-center">
          <Button
            variant="ghost"
            className="text-xs text-muted-foreground hover:text-muted-foreground"
            onClick={onViewAll}
          >
            +{milestones.length - maxVisible} more milestones
          </Button>
        </div>
      )}
    </div>
  )
}

export default MilestonesWidget
