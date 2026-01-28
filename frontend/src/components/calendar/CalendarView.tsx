'use client';

/**
 * Calendar View Component
 * Full calendar for tasks, activities, and viewings
 * Phase 5.11: Real-time & Calendar Features
 */

import { useState, useEffect, useMemo } from 'react';
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
  parseISO,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Eye,
  Phone,
  Video,
  CheckCircle,
} from 'lucide-react';
import { calendarApi, CalendarEvent, useRealtime, RealtimeEventType } from '@/lib/realtime-api';

interface CalendarViewProps {
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCreateEvent?: (date: Date) => void;
  filterUserId?: string;
  filterDealId?: string;
  className?: string;
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

const eventTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  viewing: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  meeting: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  task: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  reminder: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  follow_up: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  deadline: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
};

const eventTypeIcons: Record<string, React.ReactNode> = {
  viewing: <Eye className="h-3 w-3" />,
  meeting: <Video className="h-3 w-3" />,
  task: <CheckCircle className="h-3 w-3" />,
  reminder: <Clock className="h-3 w-3" />,
  follow_up: <Phone className="h-3 w-3" />,
  deadline: <CalendarIcon className="h-3 w-3" />,
};

export function CalendarView({
  onEventClick,
  onDateClick,
  onCreateEvent,
  filterUserId,
  filterDealId,
  className = '',
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    switch (viewMode) {
      case 'month': {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          start: startOfWeek(monthStart),
          end: endOfWeek(monthEnd),
        };
      }
      case 'week': {
        return {
          start: startOfWeek(currentDate),
          end: endOfWeek(currentDate),
        };
      }
      case 'day':
      case 'agenda': {
        return {
          start: currentDate,
          end: addDays(currentDate, viewMode === 'agenda' ? 14 : 1),
        };
      }
    }
  }, [currentDate, viewMode]);
  
  // Fetch events
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const data = await calendarApi.getEvents(dateRange.start, dateRange.end, {
          userId: filterUserId,
          dealId: filterDealId,
        });
        setEvents(data);
      } catch (error) {
        console.error('Failed to fetch calendar events', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvents();
  }, [dateRange.start, dateRange.end, filterUserId, filterDealId]);
  
  // Listen for real-time updates
  useRealtime(
    [
      RealtimeEventType.CALENDAR_EVENT_CREATED,
      RealtimeEventType.CALENDAR_EVENT_UPDATED,
      RealtimeEventType.CALENDAR_EVENT_DELETED,
    ],
    (event) => {
      const eventData = event.payload as unknown as CalendarEvent;
      
      if (event.type === RealtimeEventType.CALENDAR_EVENT_CREATED) {
        setEvents(prev => [...prev, eventData]);
      } else if (event.type === RealtimeEventType.CALENDAR_EVENT_UPDATED) {
        setEvents(prev =>
          prev.map(e => (e.id === event.entityId ? { ...e, ...eventData } : e))
        );
      } else if (event.type === RealtimeEventType.CALENDAR_EVENT_DELETED) {
        setEvents(prev => prev.filter(e => e.id !== event.entityId));
      }
    }
  );
  
  // Get events for a specific day
  const getEventsForDay = (date: Date): CalendarEvent[] => {
    return events.filter(event => {
      const eventStart = new Date(event.startTime);
      return isSameDay(eventStart, date);
    });
  };
  
  // Navigation
  const navigatePrev = () => {
    switch (viewMode) {
      case 'month':
        setCurrentDate(subMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(addDays(currentDate, -7));
        break;
      case 'day':
      case 'agenda':
        setCurrentDate(addDays(currentDate, -1));
        break;
    }
  };
  
  const navigateNext = () => {
    switch (viewMode) {
      case 'month':
        setCurrentDate(addMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(addDays(currentDate, 7));
        break;
      case 'day':
      case 'agenda':
        setCurrentDate(addDays(currentDate, 1));
        break;
    }
  };
  
  const goToToday = () => setCurrentDate(new Date());
  
  // Handle date click
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateClick?.(date);
  };
  
  // Render calendar grid for month view
  const renderMonthView = () => {
    const days: Date[] = [];
    let day = dateRange.start;
    
    while (day <= dateRange.end) {
      days.push(day);
      day = addDays(day, 1);
    }
    
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    
    return (
      <div className="flex-1 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div
              key={day}
              className="px-2 py-2 text-center text-sm font-medium text-gray-500 bg-gray-50"
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b">
              {week.map((day, dayIndex) => {
                const dayEvents = getEventsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                
                return (
                  <div
                    key={dayIndex}
                    className={`min-h-[100px] border-r p-1 cursor-pointer transition-colors ${
                      !isCurrentMonth ? 'bg-gray-50' : 'bg-white'
                    } ${isSelected ? 'ring-2 ring-blue-500 ring-inset' : ''} ${
                      isToday(day) ? 'bg-blue-50' : ''
                    } hover:bg-gray-50`}
                    onClick={() => handleDateClick(day)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 text-sm rounded-full ${
                          isToday(day)
                            ? 'bg-blue-600 text-white font-semibold'
                            : isCurrentMonth
                            ? 'text-gray-900'
                            : 'text-gray-400'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                      
                      {onCreateEvent && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateEvent(day);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200"
                        >
                          <Plus className="h-3 w-3 text-gray-500" />
                        </button>
                      )}
                    </div>
                    
                    <div className="space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((event) => {
                        const colors = eventTypeColors[event.eventType] || eventTypeColors.task;
                        return (
                          <div
                            key={event.id}
                            className={`px-1.5 py-0.5 text-xs truncate rounded ${colors.bg} ${colors.text} cursor-pointer hover:opacity-80`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick?.(event);
                            }}
                          >
                            {format(new Date(event.startTime), 'HH:mm')} {event.title}
                          </div>
                        );
                      })}
                      
                      {dayEvents.length > 3 && (
                        <div className="px-1.5 text-xs text-gray-500">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // Render agenda view
  const renderAgendaView = () => {
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sortedEvents.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No events scheduled</p>
            <p className="text-sm">Events for the next 2 weeks will appear here</p>
          </div>
        ) : (
          sortedEvents.map((event) => {
            const colors = eventTypeColors[event.eventType] || eventTypeColors.task;
            const icon = eventTypeIcons[event.eventType];
            
            return (
              <div
                key={event.id}
                className={`flex items-start gap-4 p-4 rounded-lg border ${colors.border} ${colors.bg} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => onEventClick?.(event)}
              >
                <div className={`p-2 rounded-lg bg-white ${colors.text}`}>
                  {icon}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{event.title}</h3>
                      {event.description && (
                        <p className="text-sm text-gray-600 mt-0.5">{event.description}</p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${colors.bg} ${colors.text} capitalize`}
                    >
                      {event.eventType.replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-4 w-4" />
                      {format(new Date(event.startTime), 'EEE, MMM d')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {format(new Date(event.startTime), 'h:mm a')} -
                      {format(new Date(event.endTime), 'h:mm a')}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {event.location}
                      </span>
                    )}
                  </div>
                  
                  {(event.metadata as Record<string, string | undefined>)?.dealTitle && (
                    <div className="mt-2 text-sm">
                      <span className="text-gray-500">Deal:</span>{' '}
                      <span className="text-gray-900">{String((event.metadata as Record<string, string>)?.dealTitle || '')}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };
  
  return (
    <div className={`flex flex-col bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={navigatePrev}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={navigateNext}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-gray-100"
          >
            Today
          </button>
          <h2 className="text-lg font-semibold text-gray-900 ml-2">
            {format(currentDate, viewMode === 'month' ? 'MMMM yyyy' : 'MMMM d, yyyy')}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View mode selector */}
          <div className="flex rounded-lg border overflow-hidden">
            {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-sm capitalize ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          
          {onCreateEvent && (
            <button
              onClick={() => onCreateEvent(new Date())}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Event
            </button>
          )}
        </div>
      </div>
      
      {/* Calendar content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : viewMode === 'agenda' ? (
        renderAgendaView()
      ) : (
        renderMonthView()
      )}
    </div>
  );
}

/**
 * Upcoming Events Widget for Dashboard
 */
export function UpcomingEventsWidget({ maxItems = 5 }: { maxItems?: number }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await calendarApi.getUpcomingEvents(maxItems);
        setEvents(data);
      } catch (error) {
        console.error('Failed to fetch upcoming events', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvents();
  }, [maxItems]);
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 rounded-lg" />
        ))}
      </div>
    );
  }
  
  if (events.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No upcoming events</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {events.map((event) => {
        const colors = eventTypeColors[event.eventType] || eventTypeColors.task;
        const icon = eventTypeIcons[event.eventType];
        
        return (
          <div
            key={event.id}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {event.title}
              </p>
              <p className="text-xs text-gray-500">
                {format(new Date(event.startTime), 'EEE, MMM d • h:mm a')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CalendarView;
