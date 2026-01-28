'use client';

import React, { useMemo, useState } from 'react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { CalendarEvent, calendarApi } from '@/lib/realtime-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Plus, Trash2, CheckCircle, X } from 'lucide-react';

const toLocalDateTimeInput = (date: Date) => {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

export default function PMSchedulePage() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    eventType: 'meeting' as CalendarEvent['eventType'],
    startTime: '',
    endTime: '',
    location: '',
  });

  const eventTypeOptions = useMemo(
    () => [
      { value: 'meeting', label: 'Meeting' },
      { value: 'task', label: 'Task' },
      { value: 'deadline', label: 'Deadline' },
      { value: 'follow_up', label: 'Follow-up' },
      { value: 'reminder', label: 'Reminder' },
      { value: 'viewing', label: 'Viewing' },
    ],
    []
  );

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleCreateEvent = (date: Date) => {
    const start = date;
    const end = new Date(date.getTime() + 60 * 60 * 1000);
    setFormData((prev) => ({
      ...prev,
      startTime: toLocalDateTimeInput(start),
      endTime: toLocalDateTimeInput(end),
    }));
    setShowCreateDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.startTime || !formData.endTime) return;
    setLoading(true);
    try {
      await calendarApi.createEvent({
        title: formData.title,
        description: formData.description || undefined,
        eventType: formData.eventType,
        location: formData.location || undefined,
        startTime: new Date(formData.startTime),
        endTime: new Date(formData.endTime),
        status: 'scheduled',
      });
      setShowCreateDialog(false);
      setFormData({
        title: '',
        description: '',
        eventType: 'meeting',
        startTime: '',
        endTime: '',
        location: '',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent?.id) return;
    setLoading(true);
    try {
      await calendarApi.deleteEvent(selectedEvent.id);
      setSelectedEvent(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteEvent = async () => {
    if (!selectedEvent?.id) return;
    setLoading(true);
    try {
      await calendarApi.updateEvent(selectedEvent.id, { status: 'completed' });
      setSelectedEvent({ ...selectedEvent, status: 'completed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Schedule</h1>
          <p className="text-zinc-400 text-sm mt-1">Cross-project calendar view.</p>
        </div>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleCreateEvent(new Date())}>
          <Plus className="h-4 w-4 mr-2" /> Add Event
        </Button>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Calendar</CardTitle>
        </CardHeader>
        <CardContent className="bg-zinc-950 rounded-xl">
          <CalendarView
            onEventClick={handleEventClick}
            onCreateEvent={handleCreateEvent}
            className="h-[700px]"
          />
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Create Schedule Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-400">Title</Label>
              <Input
                className="bg-zinc-800 border-zinc-700"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Event title"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Type</Label>
              <Select
                value={formData.eventType}
                onValueChange={(value) =>
                  setFormData({ ...formData, eventType: value as CalendarEvent['eventType'] })
                }
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {eventTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400">Start</Label>
                <Input
                  type="datetime-local"
                  className="bg-zinc-800 border-zinc-700"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-zinc-400">End</Label>
                <Input
                  type="datetime-local"
                  className="bg-zinc-800 border-zinc-700"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400">Location</Label>
              <Input
                className="bg-zinc-800 border-zinc-700"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Site, meeting room, or call link"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Notes</Label>
              <Textarea
                className="bg-zinc-800 border-zinc-700"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Agenda or notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowCreateDialog(false)}>
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" disabled={loading} onClick={handleSubmit}>
              <Plus className="h-4 w-4 mr-2" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3 text-sm text-zinc-300">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-400" />
                <span className="font-semibold text-white">{selectedEvent.title}</span>
              </div>
              {selectedEvent.description && <p>{selectedEvent.description}</p>}
              <div>
                <span className="text-zinc-400">Type:</span> {selectedEvent.eventType}
              </div>
              <div>
                <span className="text-zinc-400">Start:</span>{' '}
                {new Date(selectedEvent.startTime).toLocaleString()}
              </div>
              <div>
                <span className="text-zinc-400">End:</span>{' '}
                {new Date(selectedEvent.endTime).toLocaleString()}
              </div>
              {selectedEvent.location && (
                <div>
                  <span className="text-zinc-400">Location:</span> {selectedEvent.location}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={handleCompleteEvent}
              disabled={loading || selectedEvent?.status === 'completed'}
            >
              <CheckCircle className="h-4 w-4 mr-2" /> Mark Complete
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteEvent}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
