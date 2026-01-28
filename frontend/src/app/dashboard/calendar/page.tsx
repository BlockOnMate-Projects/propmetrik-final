'use client';

/**
 * Calendar Dashboard Page
 * Unified calendar view for all CRM activities
 * Phase 5.11: Real-time & Calendar Features
 */

import { useState } from 'react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { ViewingSchedulerDialog } from '@/components/calendar/ViewingScheduler';
import { CalendarEvent, calendarApi } from '@/lib/realtime-api';
import { format } from 'date-fns';
import {
  Calendar,
  Plus,
  Clock,
  MapPin,
  User,
  X,
  Trash2,
  Edit,
  Video,
  Phone,
  Eye,
  CheckCircle,
} from 'lucide-react';

export default function CalendarPage() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  
  const eventTypes = [
    { value: '', label: 'All Events' },
    { value: 'viewing', label: 'Viewings' },
    { value: 'meeting', label: 'Meetings' },
    { value: 'task', label: 'Tasks' },
    { value: 'follow_up', label: 'Follow-ups' },
    { value: 'deadline', label: 'Deadlines' },
  ];
  
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };
  
  const handleCreateEvent = (date: Date) => {
    setCreateDate(date);
    setShowCreateDialog(true);
  };
  
  const handleDeleteEvent = async () => {
    if (!selectedEvent?.id) return;
    
    if (confirm('Are you sure you want to delete this event?')) {
      try {
        await calendarApi.deleteEvent(selectedEvent.id);
        setSelectedEvent(null);
      } catch (error) {
        console.error('Failed to delete event', error);
      }
    }
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500">
            Manage your viewings, meetings, and tasks
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Filter by type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {eventTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          
          <button
            onClick={() => handleCreateEvent(new Date())}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Event
          </button>
        </div>
      </div>
      
      {/* Calendar View */}
      <div className="flex-1 p-6 bg-gray-50">
        <CalendarView
          onEventClick={handleEventClick}
          onCreateEvent={handleCreateEvent}
          className="h-full"
        />
      </div>
      
      {/* Event Detail Sidebar */}
      {selectedEvent && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold text-gray-900">Event Details</h2>
            <button
              onClick={() => setSelectedEvent(null)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Event Type Badge */}
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 text-sm rounded-full capitalize ${
                selectedEvent.eventType === 'viewing' ? 'bg-blue-100 text-blue-700' :
                selectedEvent.eventType === 'meeting' ? 'bg-purple-100 text-purple-700' :
                selectedEvent.eventType === 'task' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {selectedEvent.eventType.replace('_', ' ')}
              </span>
              {selectedEvent.status && (
                <span className={`px-2 py-1 text-sm rounded-full ${
                  selectedEvent.status === 'completed' ? 'bg-green-100 text-green-700' :
                  selectedEvent.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {selectedEvent.status}
                </span>
              )}
            </div>
            
            {/* Title */}
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                {selectedEvent.title}
              </h3>
              {selectedEvent.description && (
                <p className="mt-2 text-gray-600">{selectedEvent.description}</p>
              )}
            </div>
            
            {/* Date & Time */}
            <div className="flex items-start gap-3 text-gray-600">
              <Calendar className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  {format(new Date(selectedEvent.startTime), 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-sm">
                  {format(new Date(selectedEvent.startTime), 'h:mm a')} -{' '}
                  {format(new Date(selectedEvent.endTime), 'h:mm a')}
                </p>
                {selectedEvent.allDay && (
                  <span className="text-xs text-gray-500">All day</span>
                )}
              </div>
            </div>
            
            {/* Location */}
            {selectedEvent.location && (
              <div className="flex items-start gap-3 text-gray-600">
                <MapPin className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p>{selectedEvent.location}</p>
                  {selectedEvent.locationType && (
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      {selectedEvent.locationType === 'virtual' && <Video className="h-3 w-3" />}
                      {selectedEvent.locationType === 'phone' && <Phone className="h-3 w-3" />}
                      {selectedEvent.locationType === 'in_person' && <Eye className="h-3 w-3" />}
                      {selectedEvent.locationType.replace('_', ' ')}
                    </p>
                  )}
                </div>
              </div>
            )}
            
            {/* Attendees */}
            {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
              <div className="flex items-start gap-3 text-gray-600">
                <User className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-1">Attendees</p>
                  <div className="space-y-1">
                    {selectedEvent.attendees.map((attendee, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span>{attendee.name}</span>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${
                          attendee.status === 'accepted' ? 'bg-green-100 text-green-700' :
                          attendee.status === 'declined' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {attendee.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Related Deal */}
            {(selectedEvent.metadata as Record<string, string | undefined>)?.dealTitle && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Related Deal</p>
                <p className="font-medium text-gray-900">
                  {String((selectedEvent.metadata as Record<string, string>)?.dealTitle || '')}
                </p>
              </div>
            )}
            
            {/* Related Contact */}
            {(selectedEvent.metadata as Record<string, string | undefined>)?.contactName && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Contact</p>
                <p className="font-medium text-gray-900">
                  {String((selectedEvent.metadata as Record<string, string>)?.contactName || '')}
                </p>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="p-4 border-t space-y-2">
            {selectedEvent.status === 'scheduled' && (
              <button
                onClick={async () => {
                  if (selectedEvent.id) {
                    await calendarApi.updateEvent(selectedEvent.id, { status: 'completed' });
                    setSelectedEvent({ ...selectedEvent, status: 'completed' });
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                Mark Complete
              </button>
            )}
            
            <div className="flex gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Edit className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={handleDeleteEvent}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Create Event Dialog */}
      <CreateEventDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        defaultDate={createDate}
      />
    </div>
  );
}

// Create Event Dialog Component
function CreateEventDialog({
  isOpen,
  onClose,
  defaultDate,
}: {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: Date | null;
}) {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<CalendarEvent['eventType']>('meeting');
  const [date, setDate] = useState(format(defaultDate || new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    
    setLoading(true);
    try {
      const startDateTime = new Date(`${date}T${startTime}`);
      const endDateTime = new Date(`${date}T${endTime}`);
      
      await calendarApi.createEvent({
        title,
        eventType,
        startTime: startDateTime,
        endTime: endDateTime,
        location: location || undefined,
        description: description || undefined,
      });
      
      onClose();
      // Reset form
      setTitle('');
      setLocation('');
      setDescription('');
    } catch (error) {
      console.error('Failed to create event', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Create Event</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Event Type
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as CalendarEvent['eventType'])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="viewing">Viewing</option>
              <option value="meeting">Meeting</option>
              <option value="task">Task</option>
              <option value="reminder">Reminder</option>
              <option value="follow_up">Follow-up</option>
              <option value="deadline">Deadline</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location (optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Add description"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
