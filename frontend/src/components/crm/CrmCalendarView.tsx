'use client';

/**
 * CRM Calendar View
 *
 * A monthly calendar displaying deal close dates, task due dates,
 * and activities. Supports month navigation and event detail popover.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
    ChevronLeft, ChevronRight, Calendar as CalIcon,
    Target, CheckSquare, Clock, Circle,
} from 'lucide-react';
import { dealsApi, tasksApi } from '@/lib/crm-api';

// ─── Types ──────────────────────────────────────────

interface CalendarEvent {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD
    type: 'deal_close' | 'task_due' | 'task_overdue';
    meta?: Record<string, unknown>;
}

interface CrmCalendarViewProps {
    className?: string;
}

// ─── Helpers ────────────────────────────────────────

function getDaysInMonth(year: number, month: number): Date[] {
    const days: Date[] = [];
    const date = new Date(year, month, 1);
    while (date.getMonth() === month) {
        days.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function pad(n: number) { return n.toString().padStart(2, '0'); }

function fmtDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    deal_close: { icon: <Target className="w-3 h-3" />, color: 'bg-primary text-primary-foreground', label: 'Deal Close' },
    task_due: { icon: <CheckSquare className="w-3 h-3" />, color: 'bg-info text-white', label: 'Task Due' },
    task_overdue: { icon: <Clock className="w-3 h-3" />, color: 'bg-destructive text-white', label: 'Overdue Task' },
};

// ─── Component ──────────────────────────────────────

export function CrmCalendarView({ className }: CrmCalendarViewProps) {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    // Fetch deals & tasks for the visible month
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const evts: CalendarEvent[] = [];
            try {
                // Deals with expected close dates in this month
                const firstDay = `${year}-${pad(month + 1)}-01`;
                const lastDay = fmtDate(new Date(year, month + 1, 0));

                const [dealsRes, tasksRes] = await Promise.all([
                    dealsApi.getAll({ limit: 200 }),
                    tasksApi.getAll({ limit: 200, due_from: firstDay, due_to: lastDay }),
                ]);

                // Deals → close date events
                const deals = dealsRes?.data || dealsRes || [];
                if (Array.isArray(deals)) {
                    for (const d of deals) {
                        const closeDate = (d as any).expected_close_date || (d as any).close_date;
                        if (closeDate) {
                            const dateStr = closeDate.substring(0, 10);
                            if (dateStr >= firstDay && dateStr <= lastDay) {
                                evts.push({
                                    id: `deal-${(d as any).id}`,
                                    title: (d as any).title || 'Untitled Deal',
                                    date: dateStr,
                                    type: 'deal_close',
                                    meta: { value: (d as any).value, stage: (d as any).stage_name },
                                });
                            }
                        }
                    }
                }

                // Tasks → due date events
                const tasks = tasksRes?.data || tasksRes || [];
                if (Array.isArray(tasks)) {
                    const todayStr = fmtDate(today);
                    for (const t of tasks) {
                        const dueDate = (t as any).due_date;
                        if (dueDate) {
                            const dateStr = dueDate.substring(0, 10);
                            const isOverdue = dateStr < todayStr && (t as any).status !== 'completed';
                            evts.push({
                                id: `task-${(t as any).id}`,
                                title: (t as any).title || 'Untitled Task',
                                date: dateStr,
                                type: isOverdue ? 'task_overdue' : 'task_due',
                                meta: { priority: (t as any).priority, status: (t as any).status },
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('Calendar fetch error:', err);
            }
            if (!cancelled) {
                setEvents(evts);
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [year, month]);

    const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
    const startDow = days[0]?.getDay() || 0;
    const todayStr = fmtDate(today);

    const eventsByDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        for (const e of events) {
            (map[e.date] ??= []).push(e);
        }
        return map;
    }, [events]);

    const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

    const goPrev = useCallback(() => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    }, [month]);

    const goNext = useCallback(() => {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    }, [month]);

    const monthLabel = new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    return (
        <div className={cn('space-y-4', className)}>
            {/* Month navigation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CalIcon className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">{monthLabel}</h2>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-muted">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
                        className="px-2 py-1 text-xs rounded-lg hover:bg-muted text-muted-foreground"
                    >
                        Today
                    </button>
                    <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-muted">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3">
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn('w-2.5 h-2.5 rounded-full', cfg.color)} />
                        {cfg.label}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 border-b border-border">
                    {WEEKDAYS.map(d => (
                        <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7">
                    {/* Empty cells for offset */}
                    {Array.from({ length: startDow }).map((_, i) => (
                        <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border bg-muted/20" />
                    ))}

                    {days.map(day => {
                        const dateStr = fmtDate(day);
                        const dayEvents = eventsByDate[dateStr] || [];
                        const isToday = dateStr === todayStr;
                        const isSelected = dateStr === selectedDate;

                        return (
                            <div
                                key={dateStr}
                                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                className={cn(
                                    'min-h-[80px] p-1.5 border-b border-r border-border cursor-pointer hover:bg-muted/30 transition-colors',
                                    isSelected && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
                                )}
                            >
                                <div className={cn(
                                    'w-6 h-6 flex items-center justify-center rounded-full text-xs mb-1',
                                    isToday ? 'bg-primary text-primary-foreground font-bold' : 'text-foreground',
                                )}>
                                    {day.getDate()}
                                </div>
                                <div className="space-y-0.5">
                                    {dayEvents.slice(0, 3).map(evt => {
                                        const cfg = TYPE_CONFIG[evt.type];
                                        return (
                                            <div
                                                key={evt.id}
                                                className={cn('flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] truncate', cfg.color)}
                                                title={evt.title}
                                            >
                                                {cfg.icon}
                                                <span className="truncate">{evt.title}</span>
                                            </div>
                                        );
                                    })}
                                    {dayEvents.length > 3 && (
                                        <span className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Selected date detail */}
            {selectedDate && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="font-medium text-sm mb-3">
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
                            weekday: 'long', month: 'long', day: 'numeric',
                        })}
                    </h3>
                    {selectedEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No events on this date.</p>
                    ) : (
                        <div className="space-y-2">
                            {selectedEvents.map(evt => {
                                const cfg = TYPE_CONFIG[evt.type];
                                return (
                                    <div key={evt.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
                                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', cfg.color)}>
                                            {cfg.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{evt.title}</p>
                                            <p className="text-xs text-muted-foreground">{cfg.label}</p>
                                            {evt.meta?.value != null && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Value: ${Number(evt.meta.value as number).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        <Circle className={cn('w-2 h-2 mt-2 flex-shrink-0', `fill-current ${cfg.color.split(' ')[0].replace('bg-', 'text-')}`)} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center py-4">
                    <div className="animate-spin w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full" />
                </div>
            )}
        </div>
    );
}

export default CrmCalendarView;
