'use client';

/**
 * Unified Calendar Dashboard
 * Shows project milestones, deadlines, and CRM events
 * Dark-themed to match PropMetrik terminal aesthetic
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Milestone as MilestoneIcon,
  Target,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flag,
  Loader2,
  X,
  FolderKanban,
  Filter,
} from 'lucide-react';
import { projectsApi, milestonesApi, type Milestone, type Project } from '@/lib/pm-portal-api';

// =====================================================
// Types
// =====================================================

interface CalendarMilestone extends Milestone {
  project_name?: string;
  project_number?: string;
  project_status?: string;
}

type FilterMode = 'all' | 'milestones' | 'deadlines' | 'overdue';

// =====================================================
// Status Colors
// =====================================================

const milestoneStatusColors: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  pending:      { dot: 'bg-zinc-400',   bg: 'bg-zinc-800/60', text: 'text-zinc-300', border: 'border-zinc-700' },
  in_progress:  { dot: 'bg-blue-400',   bg: 'bg-blue-900/30', text: 'text-blue-300', border: 'border-blue-800' },
  completed:    { dot: 'bg-emerald-400', bg: 'bg-emerald-900/30', text: 'text-emerald-300', border: 'border-emerald-800' },
  missed:       { dot: 'bg-red-400',    bg: 'bg-red-900/30', text: 'text-red-300', border: 'border-red-800' },
  rescheduled:  { dot: 'bg-amber-400',  bg: 'bg-amber-900/30', text: 'text-amber-300', border: 'border-amber-800' },
  blocked:      { dot: 'bg-orange-400', bg: 'bg-orange-900/30', text: 'text-orange-300', border: 'border-orange-800' },
};

const projectColors = [
  'bg-amber-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500',
  'bg-teal-500', 'bg-orange-500',
];

// =====================================================
// Main Calendar Page
// =====================================================

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [milestones, setMilestones] = useState<CalendarMilestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMilestone, setSelectedMilestone] = useState<CalendarMilestone | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // --------------------------------------------------
  // Fetch projects + milestones
  // --------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get all projects
      const projectsRes = await projectsApi.getAll({ limit: 100 });
      const allProjects = projectsRes.data || [];
      setProjects(allProjects);

      // Fetch milestones for each active project in parallel
      const activeProjects = allProjects.filter(p =>
        !['completed', 'cancelled', 'archived', 'sold_out'].includes(p.status)
      );

      const milestoneResults = await Promise.allSettled(
        activeProjects.map(async (proj) => {
          try {
            const ms = await milestonesApi.getAll(proj.id, { includeCompleted: true });
            return (ms || []).map((m: Milestone) => ({
              ...m,
              project_name: proj.project_name || proj.name || 'Unknown Project',
              project_number: proj.project_number || '',
              project_status: proj.status,
            }));
          } catch {
            return [];
          }
        })
      );

      const allMilestones: CalendarMilestone[] = milestoneResults
        .filter((r) => r.status === 'fulfilled')
        .flatMap(r => (r as PromiseFulfilledResult<CalendarMilestone[]>).value);

      setMilestones(allMilestones);
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --------------------------------------------------
  // Calendar grid computation
  // --------------------------------------------------
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);

    const days: Date[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentDate]);

  // --------------------------------------------------
  // Filter milestones
  // --------------------------------------------------
  const filteredMilestones = useMemo(() => {
    let result = milestones;
    if (filterMode === 'milestones') {
      result = milestones.filter(m => m.status !== 'completed');
    } else if (filterMode === 'deadlines') {
      result = milestones.filter(m => m.due_date && m.status !== 'completed');
    } else if (filterMode === 'overdue') {
      result = milestones.filter(m =>
        m.due_date && isBefore(new Date(m.due_date), new Date()) && m.status !== 'completed'
      );
    }
    return result;
  }, [milestones, filterMode]);

  // Get milestones for a specific date
  const getMilestonesForDay = (date: Date): CalendarMilestone[] => {
    return filteredMilestones.filter(m => {
      if (!m.due_date) return false;
      return isSameDay(new Date(m.due_date), date);
    });
  };

  // Project color map
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p, i) => {
      map.set(p.id, projectColors[i % projectColors.length]);
    });
    return map;
  }, [projects]);

  // Stats
  const stats = useMemo(() => {
    const total = milestones.length;
    const upcoming = milestones.filter(m => m.status !== 'completed' && m.due_date).length;
    const overdue = milestones.filter(m =>
      m.due_date && isBefore(new Date(m.due_date), new Date()) && m.status !== 'completed'
    ).length;
    const completed = milestones.filter(m => m.status === 'completed').length;
    return { total, upcoming, overdue, completed };
  }, [milestones]);

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------
  const goToPrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  // --------------------------------------------------
  // Day events for sidebar
  // --------------------------------------------------
  const selectedDayMilestones = selectedDate ? getMilestonesForDay(selectedDate) : [];

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-black p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-amber-500" />
            Project Calendar
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Milestones and deadlines across all active projects
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Target className="h-3.5 w-3.5 text-amber-500" />
            <span>{stats.total} total</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-400">
            <Clock className="h-3.5 w-3.5" />
            <span>{stats.upcoming} upcoming</span>
          </div>
          {stats.overdue > 0 && (
            <div className="flex items-center gap-1.5 text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{stats.overdue} overdue</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{stats.completed} done</span>
          </div>
        </div>
      </div>

      {/* Calendar Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-white min-w-[200px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={goToToday}
            className="ml-2 px-3 py-1 text-xs font-mono bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors"
          >
            Today
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
          {([
            { key: 'all', label: 'All' },
            { key: 'milestones', label: 'Active' },
            { key: 'overdue', label: 'Overdue' },
          ] as { key: FilterMode; label: string }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilterMode(f.key)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                filterMode === f.key
                  ? 'bg-amber-600 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <span className="ml-3 text-zinc-400">Loading milestones...</span>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Calendar Grid */}
          <div className="flex-1">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-mono text-zinc-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-zinc-800/50 rounded-lg overflow-hidden border border-zinc-800">
              {calendarDays.map((day, i) => {
                const dayMilestones = getMilestonesForDay(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const today = isToday(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    className={`min-h-[100px] p-1.5 cursor-pointer transition-colors ${
                      isCurrentMonth ? 'bg-zinc-900' : 'bg-zinc-950'
                    } ${isSelected ? 'ring-1 ring-amber-500/50' : ''} hover:bg-zinc-800/80`}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-mono w-6 h-6 flex items-center justify-center rounded-full ${
                          today
                            ? 'bg-amber-600 text-white font-bold'
                            : isCurrentMonth
                            ? 'text-zinc-300'
                            : 'text-zinc-600'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                      {dayMilestones.length > 0 && (
                        <span className="text-[9px] font-mono text-zinc-500">
                          {dayMilestones.length}
                        </span>
                      )}
                    </div>

                    {/* Milestone pills */}
                    <div className="space-y-0.5">
                      {dayMilestones.slice(0, 3).map((ms) => {
                        const colors = milestoneStatusColors[ms.status] || milestoneStatusColors.pending;
                        const projColor = projectColorMap.get(ms.project_id) || 'bg-zinc-500';
                        const isOverdue = ms.due_date && isBefore(new Date(ms.due_date), new Date()) && ms.status !== 'completed';

                        return (
                          <button
                            key={ms.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedMilestone(ms); }}
                            className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate border flex items-center gap-1 transition-colors hover:opacity-90 ${
                              isOverdue ? 'bg-red-900/30 border-red-800 text-red-300' : `${colors.bg} ${colors.border} ${colors.text}`
                            }`}
                            title={`${ms.project_name}: ${ms.name}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${projColor}`} />
                            <span className="truncate">{ms.name}</span>
                          </button>
                        );
                      })}
                      {dayMilestones.length > 3 && (
                        <div className="text-[9px] text-zinc-500 font-mono pl-1">
                          +{dayMilestones.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Project Legend */}
            <div className="mt-4 flex flex-wrap gap-3">
              {projects
                .filter(p => !['completed', 'cancelled', 'archived', 'sold_out'].includes(p.status))
                .slice(0, 10)
                .map(proj => {
                  const color = projectColorMap.get(proj.id) || 'bg-zinc-500';
                  return (
                    <div key={proj.id} className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span>{proj.project_name || proj.name}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Right Sidebar — Selected Day or Milestone Details */}
          <div className="w-72 flex-shrink-0">
            {selectedMilestone ? (
              <MilestoneDetailCard
                milestone={selectedMilestone}
                onClose={() => setSelectedMilestone(null)}
                projectColor={projectColorMap.get(selectedMilestone.project_id) || 'bg-zinc-500'}
              />
            ) : selectedDate ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-1">
                  {format(selectedDate, 'EEEE, MMM d')}
                </h3>
                {selectedDayMilestones.length === 0 ? (
                  <p className="text-xs text-zinc-500 mt-3">No milestones on this day</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedDayMilestones.map(ms => {
                      const colors = milestoneStatusColors[ms.status] || milestoneStatusColors.pending;
                      const projColor = projectColorMap.get(ms.project_id) || 'bg-zinc-500';
                      return (
                        <button
                          key={ms.id}
                          onClick={() => setSelectedMilestone(ms)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-colors hover:opacity-90 ${colors.bg} ${colors.border}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`w-2 h-2 rounded-full ${projColor}`} />
                            <span className="text-[10px] text-zinc-500 font-mono truncate">
                              {ms.project_name}
                            </span>
                          </div>
                          <p className={`text-xs font-medium ${colors.text}`}>{ms.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] capitalize ${colors.text}`}>
                              {ms.status.replace('_', ' ')}
                            </span>
                            {ms.progress !== undefined && ms.progress > 0 && (
                              <span className="text-[10px] text-zinc-500">{ms.progress}%</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Upcoming Milestones</h3>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {milestones
                    .filter(m => m.due_date && m.status !== 'completed' && !isBefore(new Date(m.due_date), new Date()))
                    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
                    .slice(0, 10)
                    .map(ms => {
                      const projColor = projectColorMap.get(ms.project_id) || 'bg-zinc-500';
                      return (
                        <button
                          key={ms.id}
                          onClick={() => setSelectedMilestone(ms)}
                          className="w-full text-left p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`w-2 h-2 rounded-full ${projColor}`} />
                            <span className="text-[10px] text-zinc-500 truncate">{ms.project_name}</span>
                          </div>
                          <p className="text-xs text-zinc-200 font-medium truncate">{ms.name}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {format(new Date(ms.due_date!), 'MMM d, yyyy')}
                          </p>
                        </button>
                      );
                    })}
                  {milestones.filter(m => m.due_date && m.status !== 'completed').length === 0 && (
                    <p className="text-xs text-zinc-500">No upcoming milestones</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// Milestone Detail Card
// =====================================================

function MilestoneDetailCard({
  milestone,
  onClose,
  projectColor,
}: {
  milestone: CalendarMilestone;
  onClose: () => void;
  projectColor: string;
}) {
  const colors = milestoneStatusColors[milestone.status] || milestoneStatusColors.pending;
  const isOverdue = milestone.due_date && isBefore(new Date(milestone.due_date), new Date()) && milestone.status !== 'completed';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className={`p-3 border-b ${isOverdue ? 'border-red-800 bg-red-900/20' : 'border-zinc-800'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${projectColor}`} />
            <span className="text-[10px] font-mono text-zinc-400 truncate">
              {milestone.project_number || milestone.project_name}
            </span>
          </div>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-white">{milestone.name}</h3>
        {milestone.phase_name && (
          <p className="text-[10px] text-zinc-500 mt-0.5">Phase: {milestone.phase_name}</p>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium capitalize ${colors.bg} ${colors.text} border ${colors.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
            {milestone.status.replace('_', ' ')}
          </span>
          {isOverdue && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400 border border-red-800">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </span>
          )}
        </div>

        {/* Due Date */}
        {milestone.due_date && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Due: {format(new Date(milestone.due_date), 'EEEE, MMM d, yyyy')}</span>
          </div>
        )}

        {/* Completed Date */}
        {milestone.completed_date && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Completed: {format(new Date(milestone.completed_date), 'MMM d, yyyy')}</span>
          </div>
        )}

        {/* Progress */}
        {milestone.progress !== undefined && milestone.progress > 0 && (
          <div>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
              <span>Progress</span>
              <span>{milestone.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{ width: `${milestone.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Description */}
        {milestone.description && (
          <div>
            <p className="text-[10px] text-zinc-500 mb-0.5">Description</p>
            <p className="text-xs text-zinc-300">{milestone.description}</p>
          </div>
        )}

        {/* Project Link */}
        <div className="pt-2 border-t border-zinc-800">
          <a
            href={`/dashboard/projects/${milestone.project_id}`}
            className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>View {milestone.project_name}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
