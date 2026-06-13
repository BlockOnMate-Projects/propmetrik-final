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
import { scheduleEventSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';

const toLocalDateTimeInput = (date: Date) => {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

export default function PMSchedulePage() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
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
    const validation = validateForm(scheduleEventSchema, formData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);
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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Schedule</h1>
          <p className="text-muted-foreground text-sm mt-1">Cross-project calendar view.</p>
        </div>
        <Button className="bg-amber-600 hover:bg-amber-700 text-foreground" onClick={() => handleCreateEvent(new Date())}>
          <Plus className="h-4 w-4 mr-2" /> Add Event
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Calendar</CardTitle>
        </CardHeader>
        <CardContent className="bg-background rounded-xl">
          <CalendarView
            onEventClick={handleEventClick}
            onCreateEvent={handleCreateEvent}
            className="h-[700px]"
          />
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Create Schedule Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Title</Label>
              <Input
                className="bg-muted border-border"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Event title"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Type</Label>
              <Select
                value={formData.eventType}
                onValueChange={(value) =>
                  setFormData({ ...formData, eventType: value as CalendarEvent['eventType'] })
                }
              >
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
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
                <Label className="text-muted-foreground">Start</Label>
                <Input
                  type="datetime-local"
                  className="bg-muted border-border"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-muted-foreground">End</Label>
                <Input
                  type="datetime-local"
                  className="bg-muted border-border"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Location</Label>
              <Input
                className="bg-muted border-border"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Site, meeting room, or call link"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea
                className="bg-muted border-border"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Agenda or notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-border" onClick={() => setShowCreateDialog(false)}>
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" disabled={loading} onClick={handleSubmit}>
              <Plus className="h-4 w-4 mr-2" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-foreground">{selectedEvent.title}</span>
              </div>
              {selectedEvent.description && <p>{selectedEvent.description}</p>}
              <div>
                <span className="text-muted-foreground">Type:</span> {selectedEvent.eventType}
              </div>
              <div>
                <span className="text-muted-foreground">Start:</span>{' '}
                {new Date(selectedEvent.startTime).toLocaleString()}
              </div>
              <div>
                <span className="text-muted-foreground">End:</span>{' '}
                {new Date(selectedEvent.endTime).toLocaleString()}
              </div>
              {selectedEvent.location && (
                <div>
                  <span className="text-muted-foreground">Location:</span> {selectedEvent.location}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-border"
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
