'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
  Flag, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Calendar
} from 'lucide-react';
import { format, parseISO, differenceInDays, isPast, isToday, addDays } from 'date-fns';
import { Milestone, MilestoneStatus } from '@/lib/pm-portal-api';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MilestoneTimelineProps {
  milestones: Milestone[];
  className?: string;
  onMilestoneClick?: (milestone: Milestone) => void;
}

const statusConfig: Record<string, { color: string; bgColor: string; borderColor: string }> = {
  pending: { color: 'text-muted-foreground', bgColor: 'bg-zinc-500', borderColor: 'border-zinc-500' },
  in_progress: { color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500', borderColor: 'border-blue-500' },
  completed: { color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-500', borderColor: 'border-green-500' },
  overdue: { color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-500', borderColor: 'border-red-500' },
  cancelled: { color: 'text-muted-foreground', bgColor: 'bg-zinc-600', borderColor: 'border-zinc-600' },
};

export function MilestoneTimeline({ milestones, className, onMilestoneClick }: MilestoneTimelineProps) {
  // Sort milestones by date
  const sortedMilestones = useMemo(() => {
    return [...milestones]
      .filter(m => m.due_date)
      .sort((a, b) => {
        const dateA = new Date(a.due_date || '');
        const dateB = new Date(b.due_date || '');
        return dateA.getTime() - dateB.getTime();
      });
  }, [milestones]);

  // Calculate timeline range
  const timelineRange = useMemo(() => {
    if (sortedMilestones.length === 0) {
      const today = new Date();
      return {
        start: today,
        end: addDays(today, 30),
        totalDays: 30,
      };
    }

    const dates = sortedMilestones.map(m => new Date(m.due_date || ''));
    const today = new Date();
    
    // Include today in the range
    dates.push(today);
    
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Add padding
    const paddedStart = addDays(minDate, -7);
    const paddedEnd = addDays(maxDate, 14);
    const totalDays = differenceInDays(paddedEnd, paddedStart) || 30;

    return {
      start: paddedStart,
      end: paddedEnd,
      totalDays,
    };
  }, [sortedMilestones]);

  // Get position for a date on the timeline
  const getPosition = (dateStr: string) => {
    const date = parseISO(dateStr);
    const daysSinceStart = differenceInDays(date, timelineRange.start);
    return (daysSinceStart / timelineRange.totalDays) * 100;
  };

  // Generate month markers
  const monthMarkers = useMemo(() => {
    const markers: { date: Date; label: string; position: number }[] = [];
    let current = new Date(timelineRange.start);
    current.setDate(1); // Start of month
    
    while (current <= timelineRange.end) {
      const position = (differenceInDays(current, timelineRange.start) / timelineRange.totalDays) * 100;
      if (position >= 0 && position <= 100) {
        markers.push({
          date: new Date(current),
          label: format(current, 'MMM yyyy'),
          position,
        });
      }
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    return markers;
  }, [timelineRange]);

  // Today marker position
  const todayPosition = useMemo(() => {
    const today = new Date();
    const daysSinceStart = differenceInDays(today, timelineRange.start);
    const position = (daysSinceStart / timelineRange.totalDays) * 100;
    return position >= 0 && position <= 100 ? position : null;
  }, [timelineRange]);

  if (milestones.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
        <Flag className="h-12 w-12 text-zinc-700 mb-4" />
        <p className="text-muted-foreground text-sm">No milestones to display</p>
        <p className="text-muted-foreground text-xs mt-1">Create milestones to see them on the timeline</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("relative", className)}>
        {/* Header with legend */}
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-sm font-medium text-muted-foreground">Milestone Timeline</h4>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-zinc-500" />
              <span className="text-muted-foreground">Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Overdue</span>
            </div>
          </div>
        </div>

        {/* Timeline container */}
        <div className="relative bg-card/50 rounded-lg border border-border p-4">
          {/* Month markers */}
          <div className="relative h-6 mb-2 border-b border-border">
            {monthMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute top-0 flex flex-col items-start"
                style={{ left: `${marker.position}%` }}
              >
                <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                  {marker.label}
                </span>
                <div className="w-px h-full bg-muted absolute top-6" />
              </div>
            ))}
          </div>

          {/* Timeline track */}
          <div className="relative h-16 bg-muted/30 rounded">
            {/* Grid lines */}
            {monthMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-muted"
                style={{ left: `${marker.position}%` }}
              />
            ))}

            {/* Today marker */}
            {todayPosition !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
                style={{ left: `${todayPosition}%` }}
              >
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-amber-500 text-foreground text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                  TODAY
                </div>
              </div>
            )}

            {/* Milestone markers */}
            {sortedMilestones.map((milestone, index) => {
              const dateStr = milestone.due_date || '';
              if (!dateStr) return null;
              
              const position = getPosition(dateStr);
              if (position < 0 || position > 100) return null;

              const date = parseISO(dateStr);
              const isOverdue = isPast(date) && milestone.status !== 'completed' && milestone.status !== 'cancelled';
              const effectiveStatus = isOverdue ? 'overdue' : (milestone.status || 'pending');
              const config = statusConfig[effectiveStatus] || statusConfig.pending;

              // Stagger vertical position to avoid overlap
              const verticalOffset = (index % 3) * 16 + 8;

              return (
                <Tooltip key={milestone.id}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "absolute transform -translate-x-1/2 cursor-pointer transition-all hover:scale-125 z-20",
                        "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900 rounded"
                      )}
                      style={{ 
                        left: `${position}%`,
                        top: `${verticalOffset}px`
                      }}
                      onClick={() => onMilestoneClick?.(milestone)}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        config.bgColor,
                        "border-border"
                      )}>
                        {milestone.status === 'completed' ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-foreground" />
                        ) : isOverdue ? (
                          <AlertTriangle className="w-2.5 h-2.5 text-foreground" />
                        ) : (
                          <Flag className="w-2 h-2 text-foreground" />
                        )}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="top" 
                    className="bg-muted border-border text-foreground max-w-xs"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{milestone.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{format(date, 'MMM d, yyyy')}</span>
                        {isOverdue && (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            ({differenceInDays(new Date(), date)} days overdue)
                          </span>
                        )}
                      </div>
                      {milestone.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{milestone.description}</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Milestone list below timeline */}
          <div className="mt-6 space-y-2">
            {sortedMilestones.map((milestone) => {
              const dateStr = milestone.due_date || '';
              if (!dateStr) return null;
              
              const date = parseISO(dateStr);
              const isOverdue = isPast(date) && milestone.status !== 'completed' && milestone.status !== 'cancelled';
              const effectiveStatus = isOverdue ? 'overdue' : (milestone.status || 'pending');
              const config = statusConfig[effectiveStatus] || statusConfig.pending;

              return (
                <button
                  key={milestone.id}
                  className="w-full flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                  onClick={() => onMilestoneClick?.(milestone)}
                >
                  <div className={cn(
                    "w-3 h-3 rounded-full shrink-0",
                    config.bgColor
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{milestone.name}</p>
                  </div>
                  <div className={cn("text-xs shrink-0", config.color)}>
                    {format(date, 'MMM d')}
                    {isOverdue && <span className="ml-1 text-red-600 dark:text-red-400">(overdue)</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default MilestoneTimeline;
