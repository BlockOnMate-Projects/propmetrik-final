'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// =====================================================
// CALENDAR HELPERS
// =====================================================
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

// Mock events - in production, fetch from API
const mockEvents = [
  { id: '1', title: 'Foundation Inspection', date: '2026-01-23', time: '09:00', project: 'Cantonments Heights', type: 'inspection' },
  { id: '2', title: 'Team Meeting', date: '2026-01-24', time: '14:00', project: 'All Projects', type: 'meeting' },
  { id: '3', title: 'Milestone Review', date: '2026-01-25', time: '10:00', project: 'East Legon Villas', type: 'milestone' },
  { id: '4', title: 'Site Visit', date: '2026-01-28', time: '08:00', project: 'Airport City Tower', type: 'site_visit' },
  { id: '5', title: 'Contractor Meeting', date: '2026-01-30', time: '11:00', project: 'Cantonments Heights', type: 'meeting' },
]

// =====================================================
// EVENT CARD
// =====================================================
function EventCard({ event }: { event: typeof mockEvents[0] }) {
  const typeColors: Record<string, string> = {
    inspection: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    meeting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    milestone: 'bg-green-500/20 text-green-400 border-green-500/30',
    site_visit: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  }
  
  return (
    <div className="flex items-start gap-3 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
      <div className="shrink-0">
        <div className="h-10 w-10 bg-zinc-700 rounded flex flex-col items-center justify-center">
          <span className="font-mono text-[10px] text-zinc-400">
            {new Date(event.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
          </span>
          <span className="font-mono text-sm text-white font-bold">
            {new Date(event.date).getDate()}
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-mono text-xs text-white font-medium">{event.title}</h4>
        <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{event.project}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
            <Clock className="h-3 w-3" />
            {event.time}
          </span>
          <Badge className={cn("font-mono text-[9px] border", typeColors[event.type])}>
            {event.type.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// MAIN CALENDAR PAGE
// =====================================================
export default function PMCalendarPage() {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(today)
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  
  // Navigation
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }
  
  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }
  
  const goToToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }
  
  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return mockEvents.filter(e => e.date === dateStr)
  }
  
  // Selected date events
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : []
  
  // Build calendar grid
  const calendarDays: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i)
  }
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-mono text-xl font-bold text-white">Calendar</h1>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            View scheduled events and milestones
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={goToToday}
          className="font-mono text-xs"
        >
          Today
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-mono text-lg text-white">
                  {MONTHS[month]} {year}
                </h2>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Days Header */}
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map((day) => (
                  <div key={day} className="text-center font-mono text-[10px] text-zinc-500 py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} className="aspect-square" />
                  }
                  
                  const date = new Date(year, month, day)
                  const isToday = date.toDateString() === today.toDateString()
                  const isSelected = selectedDate?.toDateString() === date.toDateString()
                  const events = getEventsForDate(date)
                  const hasEvents = events.length > 0
                  
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(date)}
                      className={cn(
                        "aspect-square flex flex-col items-center justify-center rounded transition-colors relative",
                        isSelected && "bg-amber-500 text-black",
                        isToday && !isSelected && "border border-amber-500",
                        !isSelected && !isToday && "hover:bg-zinc-800",
                      )}
                    >
                      <span className={cn(
                        "font-mono text-sm",
                        isSelected ? "text-black font-bold" : "text-white"
                      )}>
                        {day}
                      </span>
                      {hasEvents && (
                        <div className="flex gap-0.5 mt-0.5">
                          {events.slice(0, 3).map((_, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "h-1 w-1 rounded-full",
                                isSelected ? "bg-black/50" : "bg-amber-500"
                              )} 
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Selected Date Events */}
        <div>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-mono text-sm text-white mb-4">
                {selectedDate 
                  ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                  : 'Select a date'
                }
              </h3>
              
              {selectedDateEvents.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarIcon className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                  <p className="font-mono text-[10px] text-zinc-500">No events scheduled</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Upcoming Events */}
          <Card className="bg-zinc-900 border-zinc-800 mt-4">
            <CardContent className="p-4">
              <h3 className="font-mono text-sm text-white mb-4">Upcoming Events</h3>
              <div className="space-y-2">
                {mockEvents.slice(0, 4).map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
