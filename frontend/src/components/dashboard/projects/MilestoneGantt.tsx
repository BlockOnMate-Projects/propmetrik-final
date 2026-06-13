'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ZoomIn,
  ZoomOut,
  Download,
  RotateCcw,
  Flag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlayCircle,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays, parseISO, isPast, addDays } from 'date-fns';
import { Gantt, Task, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { Milestone, MilestoneStatus } from '@/lib/pm-portal-api';

// =====================================================
// TYPES
// =====================================================
interface MilestoneGanttProps {
  milestones: Milestone[];
  className?: string;
  onMilestoneClick?: (milestone: Milestone) => void;
}

type ZoomLevel = 'day' | 'week' | 'month';

// =====================================================
// CONSTANTS
// =====================================================
const STATUS_COLORS: Record<string, { bar: string; progress: string; label: string }> = {
  pending:     { bar: '#71717a', progress: '#a1a1aa', label: 'Pending' },
  not_started: { bar: '#71717a', progress: '#a1a1aa', label: 'Not Started' },
  in_progress: { bar: '#3b82f6', progress: '#60a5fa', label: 'In Progress' },
  completed:   { bar: '#22c55e', progress: '#4ade80', label: 'Completed' },
  overdue:     { bar: '#ef4444', progress: '#f87171', label: 'Overdue' },
  cancelled:   { bar: '#52525b', progress: '#71717a', label: 'Cancelled' },
};

const ZOOM_MAP: Record<ZoomLevel, ViewMode> = {
  day: ViewMode.Day,
  week: ViewMode.Week,
  month: ViewMode.Month,
};

// =====================================================
// HELPERS
// =====================================================
function safeDate(v: string | Date | undefined): Date {
  if (!v) return new Date();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getEffectiveStatus(milestone: Milestone): string {
  if (milestone.status === 'completed' || milestone.status === 'cancelled') return milestone.status;
  if (milestone.due_date && isPast(parseISO(milestone.due_date))) return 'overdue';
  return milestone.status || 'pending';
}

// =====================================================
// CUSTOM TOOLTIP
// =====================================================
function MilestoneTooltip({ task }: { task: Task; fontSize: string; fontFamily: string }) {
  const ms = (task as any).__milestone as Milestone | undefined;
  const effectiveStatus = ms ? getEffectiveStatus(ms) : 'pending';
  const colors = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.pending;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl min-w-[220px] max-w-[320px]">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: colors.bar }}
        />
        <p className="font-mono text-xs font-medium text-zinc-100 truncate">{task.name}</p>
      </div>

      {ms?.phase_name && (
        <p className="font-mono text-[10px] text-muted-foreground mb-1.5">
          Phase: {ms.phase_name}
        </p>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px]">
          <Calendar className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">
            {format(task.start, 'MMM d')} &ndash; {format(task.end, 'MMM d, yyyy')}
          </span>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          Duration: {differenceInDays(task.end, task.start) + 1} days
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${task.progress}%`, backgroundColor: colors.progress }}
          />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{task.progress}%</span>
      </div>

      {/* Status badge */}
      <div className="mt-2">
        <Badge
          variant="outline"
          className="text-[9px] border-0 px-1.5 py-0"
          style={{ backgroundColor: `${colors.bar}30`, color: colors.progress }}
        >
          {colors.label}
        </Badge>
      </div>

      {ms?.description && (
        <p className="font-mono text-[10px] text-muted-foreground mt-2 line-clamp-2">
          {ms.description}
        </p>
      )}

      {ms?.subphase_count && ms.subphase_count > 0 && (
        <p className="font-mono text-[10px] text-amber-500/80 mt-1">
          {ms.subphase_count} sub-task{ms.subphase_count !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// =====================================================
// MAIN MILESTONE GANTT COMPONENT
// =====================================================
export function MilestoneGantt({
  milestones,
  className,
  onMilestoneClick,
}: MilestoneGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');

  // Build milestone lookup
  const milestoneMap = useMemo(() => {
    const m = new Map<string, Milestone>();
    milestones.forEach(ms => m.set(ms.id, ms));
    return m;
  }, [milestones]);

  // Group milestones by phase for project-type grouping bars
  const phaseGroups = useMemo(() => {
    const groups = new Map<string, { name: string; milestones: Milestone[] }>();
    const ungrouped: Milestone[] = [];

    milestones.forEach(ms => {
      if (ms.phase_id && ms.phase_name) {
        const existing = groups.get(ms.phase_id);
        if (existing) {
          existing.milestones.push(ms);
        } else {
          groups.set(ms.phase_id, { name: ms.phase_name, milestones: [ms] });
        }
      } else {
        ungrouped.push(ms);
      }
    });

    return { groups, ungrouped };
  }, [milestones]);

  // Convert milestones → gantt-task-react Task[]
  const tasks: Task[] = useMemo(() => {
    if (milestones.length === 0) return [];

    const items: Task[] = [];
    const today = new Date();

    // Helper: create a task from a milestone
    const createMilestoneTask = (ms: Milestone, projectId?: string): Task => {
      const effectiveStatus = getEffectiveStatus(ms);
      const colors = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.pending;

      // Calculate start and end dates
      // Use created_at as start, due_date as end
      // If no due_date, project 30 days from created_at
      const start = safeDate(ms.created_at);
      const end = ms.due_date ? safeDate(ms.due_date) : addDays(start, 30);

      // Ensure end is after start
      const finalEnd = end.getTime() <= start.getTime() ? addDays(start, 1) : end;

      const t: Task & { __milestone?: Milestone } = {
        id: ms.id,
        name: ms.name,
        type: 'task',
        start,
        end: finalEnd,
        progress: ms.progress || (effectiveStatus === 'completed' ? 100 : 0),
        dependencies: projectId ? [projectId] : [],
        styles: {
          backgroundColor: `${colors.bar}50`,
          backgroundSelectedColor: `${colors.bar}80`,
          progressColor: colors.bar,
          progressSelectedColor: colors.progress,
        },
        isDisabled: true,
        project: projectId,
      };
      (t as any).__milestone = ms;
      return t;
    };

    // Add phase group headers as "project" bars
    phaseGroups.groups.forEach((group, phaseId) => {
      // Determine phase date range from its milestones
      const allDates: Date[] = [];
      group.milestones.forEach(ms => {
        allDates.push(safeDate(ms.created_at));
        if (ms.due_date) allDates.push(safeDate(ms.due_date));
      });

      const phaseStart = allDates.length > 0
        ? new Date(Math.min(...allDates.map(d => d.getTime())))
        : today;
      const phaseEnd = allDates.length > 0
        ? new Date(Math.max(...allDates.map(d => d.getTime())))
        : addDays(today, 30);

      // Ensure end > start
      const finalPhaseEnd = phaseEnd.getTime() <= phaseStart.getTime()
        ? addDays(phaseStart, 1)
        : phaseEnd;

      // Calculate average progress
      const avgProgress = Math.round(
        group.milestones.reduce((sum, ms) => {
          const effStatus = getEffectiveStatus(ms);
          return sum + (ms.progress || (effStatus === 'completed' ? 100 : 0));
        }, 0) / group.milestones.length
      );

      // Phase header bar
      items.push({
        id: `phase-${phaseId}`,
        name: group.name,
        type: 'project',
        start: phaseStart,
        end: finalPhaseEnd,
        progress: avgProgress,
        dependencies: [],
        hideChildren: false,
        styles: {
          backgroundColor: '#f59e0b30',
          backgroundSelectedColor: '#f59e0b50',
          progressColor: '#f59e0b',
          progressSelectedColor: '#fbbf24',
        },
        isDisabled: true,
      });

      // Add milestones under phase
      group.milestones.forEach(ms => {
        items.push(createMilestoneTask(ms, `phase-${phaseId}`));
      });
    });

    // Add ungrouped milestones
    if (phaseGroups.ungrouped.length > 0) {
      // If there are also grouped milestones, add a "General" group header
      if (phaseGroups.groups.size > 0) {
        const ungroupedDates: Date[] = [];
        phaseGroups.ungrouped.forEach(ms => {
          ungroupedDates.push(safeDate(ms.created_at));
          if (ms.due_date) ungroupedDates.push(safeDate(ms.due_date));
        });

        const gStart = ungroupedDates.length > 0
          ? new Date(Math.min(...ungroupedDates.map(d => d.getTime())))
          : today;
        const gEnd = ungroupedDates.length > 0
          ? new Date(Math.max(...ungroupedDates.map(d => d.getTime())))
          : addDays(today, 30);

        items.push({
          id: 'phase-general',
          name: 'General',
          type: 'project',
          start: gStart,
          end: gEnd.getTime() <= gStart.getTime() ? addDays(gStart, 1) : gEnd,
          progress: 0,
          dependencies: [],
          hideChildren: false,
          styles: {
            backgroundColor: '#71717a30',
            backgroundSelectedColor: '#71717a50',
            progressColor: '#71717a',
            progressSelectedColor: '#a1a1aa',
          },
          isDisabled: true,
        });

        phaseGroups.ungrouped.forEach(ms => {
          items.push(createMilestoneTask(ms, 'phase-general'));
        });
      } else {
        // Only ungrouped milestones — no project headers needed
        phaseGroups.ungrouped.forEach(ms => {
          items.push(createMilestoneTask(ms));
        });
      }
    }

    return items;
  }, [milestones, phaseGroups]);

  // Column width varies by zoom
  const columnWidth = useMemo(() => {
    switch (zoomLevel) {
      case 'day': return 50;
      case 'week': return 180;
      case 'month': return 250;
    }
  }, [zoomLevel]);

  // Event handlers
  const handleClick = useCallback((task: Task) => {
    if (task.id.startsWith('phase-')) return; // Ignore phase header clicks
    const ms = milestoneMap.get(task.id);
    if (ms && onMilestoneClick) onMilestoneClick(ms);
  }, [milestoneMap, onMilestoneClick]);

  const handleZoom = (direction: 'in' | 'out') => {
    const levels: ZoomLevel[] = ['month', 'week', 'day'];
    const current = levels.indexOf(zoomLevel);
    if (direction === 'in' && current < levels.length - 1) {
      setZoomLevel(levels[current + 1]);
    } else if (direction === 'out' && current > 0) {
      setZoomLevel(levels[current - 1]);
    }
  };

  // Stats
  const stats = useMemo(() => {
    return {
      total: milestones.length,
      completed: milestones.filter(m => m.status === 'completed').length,
      inProgress: milestones.filter(m => m.status === 'in_progress').length,
      overdue: milestones.filter(m => getEffectiveStatus(m) === 'overdue').length,
    };
  }, [milestones]);

  // ── Empty state ──
  if (milestones.length === 0 || tasks.length === 0) {
    return (
      <div className={cn('border border-border bg-card/50 p-4', className)}>
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Flag className="h-8 w-8 mb-2 opacity-50" />
          <span className="font-mono text-sm">No milestones to chart</span>
          <span className="font-mono text-xs text-muted-foreground mt-1">
            Create milestones with dates to see the Gantt chart
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border border-border bg-card/50 overflow-hidden rounded-lg', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-amber-500 tracking-wider font-semibold">
            MILESTONE GANTT
          </span>
          <div className="hidden sm:flex items-center gap-2 ml-2">
            {stats.completed > 0 && (
              <Badge variant="outline" className="text-[9px] border-0 bg-green-500/15 text-green-600 dark:text-green-400 px-1.5 py-0">
                {stats.completed} done
              </Badge>
            )}
            {stats.inProgress > 0 && (
              <Badge variant="outline" className="text-[9px] border-0 bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0">
                {stats.inProgress} active
              </Badge>
            )}
            {stats.overdue > 0 && (
              <Badge variant="outline" className="text-[9px] border-0 bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0">
                {stats.overdue} overdue
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('out')}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground w-12 text-center capitalize">
            {zoomLevel}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('in')}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (containerRef.current) {
                import('html2canvas').then(({ default: html2canvas }) => {
                  html2canvas(containerRef.current!, { backgroundColor: '#18181b', scale: 2 }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = `milestone-gantt-${format(new Date(), 'yyyy-MM-dd')}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                  });
                }).catch(() => {});
              }
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Gantt chart */}
      <div ref={containerRef} className="milestone-gantt-dark">
        <Gantt
          tasks={tasks}
          viewMode={ZOOM_MAP[zoomLevel]}
          onClick={handleClick}
          listCellWidth=""
          columnWidth={columnWidth}
          ganttHeight={Math.max(tasks.length * 42 + 60, 280)}
          rowHeight={42}
          headerHeight={50}
          barFill={65}
          barCornerRadius={4}
          arrowColor="#52525b"
          todayColor="rgba(245, 158, 11, 0.12)"
          fontSize="11px"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          TooltipContent={MilestoneTooltip as any}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-t border-border bg-card">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: '#71717a' }} />
          <span className="font-mono text-[10px] text-muted-foreground">Pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
          <span className="font-mono text-[10px] text-muted-foreground">In Progress</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: '#22c55e' }} />
          <span className="font-mono text-[10px] text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
          <span className="font-mono text-[10px] text-muted-foreground">Overdue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-amber-500" />
          <span className="font-mono text-[10px] text-muted-foreground">Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
          <span className="font-mono text-[10px] text-muted-foreground">Phase Group</span>
        </div>
      </div>

      {/* Light chart area — keep text BLACK for readability */}
      <style jsx global>{`
        .milestone-gantt-dark svg text {
          fill: #1a1a1a !important;
          font-weight: 500 !important;
        }
        .milestone-gantt-dark svg line {
          stroke: #e4e4e7 !important;
        }
      `}</style>
    </div>
  );
}

export default MilestoneGantt;
