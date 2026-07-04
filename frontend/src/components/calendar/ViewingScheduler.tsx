'use client';

/**
 * Viewing Scheduler Component
 * Book property viewings with available time slots
 * Phase 5.11: Real-time & Calendar Features
 */

import { useState, useEffect } from 'react';
import { format, addDays, isSameDay, isAfter } from 'date-fns';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { calendarApi, ViewingSlot, ViewingBooking } from '@/lib/realtime-api';
import { AddToCalendarButton } from '@/components/integrations/CloudActions';

interface ViewingSchedulerProps {
  propertyId: string;
  propertyAddress?: string;
  contactId?: string;
  dealId?: string;
  onBookingComplete?: (booking: ViewingBooking) => void;
  onCancel?: () => void;
}

export function ViewingScheduler({
  propertyId,
  propertyAddress,
  contactId,
  dealId,
  onBookingComplete,
  onCancel,
}: ViewingSchedulerProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<ViewingSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ViewingSlot | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  
  // Generate date options (next 14 days)
  const dateOptions = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));
  
  // Fetch available slots when date changes
  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      setError(null);
      setSelectedSlot(null);
      
      try {
        const availableSlots = await calendarApi.getAvailableSlots(propertyId, selectedDate);
        setSlots(availableSlots);
      } catch (err) {
        console.error('Failed to fetch slots', err);
        setError('Failed to load available time slots');
        setSlots([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSlots();
  }, [propertyId, selectedDate]);
  
  const handleBooking = async () => {
    if (!selectedSlot || !contactName || !contactPhone) {
      setError('Please fill in required fields');
      return;
    }
    
    setBooking(true);
    setError(null);
    
    try {
      const booking = await calendarApi.bookViewing({
        propertyId,
        contactId: contactId || '',
        agentId: selectedSlot.agentId,
        dealId,
        scheduledAt: selectedSlot.startTime,
        durationMinutes: Math.round(
          (selectedSlot.endTime.getTime() - selectedSlot.startTime.getTime()) / 60000
        ),
        contactName,
        contactPhone,
        contactEmail,
        notes,
      });
      
      setSuccess(true);
      onBookingComplete?.(booking);
    } catch (err) {
      console.error('Booking failed', err);
      setError('Failed to book viewing. Please try again.');
    } finally {
      setBooking(false);
    }
  };
  
  if (success) {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Viewing Booked!
        </h3>
        <p className="text-muted-foreground mb-4">
          Your viewing has been scheduled for{' '}
          <span className="font-medium">
            {format(selectedSlot!.startTime, 'EEEE, MMMM d')} at{' '}
            {format(selectedSlot!.startTime, 'h:mm a')}
          </span>
        </p>
        {selectedSlot?.agentName && (
          <p className="text-sm text-muted-foreground mb-4">
            Agent: {selectedSlot.agentName}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          {selectedSlot && (
            <AddToCalendarButton
              event={{
                title: `Property Viewing${propertyAddress ? ` — ${propertyAddress}` : ''}`,
                start: selectedSlot.startTime.toISOString(),
                end: selectedSlot.endTime.toISOString(),
                location: propertyAddress,
                description: [
                  contactName && `Viewing with ${contactName}`,
                  contactPhone && `Phone: ${contactPhone}`,
                  selectedSlot.agentName && `Agent: ${selectedSlot.agentName}`,
                  notes,
                ].filter(Boolean).join('\n') || undefined,
                attendees: contactEmail ? [contactEmail] : undefined,
              }}
              variant="outline"
              size="default"
            />
          )}
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-blue-600 text-foreground rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Schedule a Viewing</h3>
        {propertyAddress && (
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-4 w-4" />
            {propertyAddress}
          </p>
        )}
      </div>
      
      {/* Date Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select a Date
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {dateOptions.map((date) => {
            const isSelected = isSameDay(date, selectedDate);
            const hasSlots = true; // Could be optimized with prefetched data
            
            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                disabled={!hasSlots}
                className={`flex-shrink-0 w-16 py-2 rounded-lg border text-center transition-colors ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : hasSlots
                    ? 'border-border hover:border-gray-300'
                    : 'border-gray-100 text-muted-foreground cursor-not-allowed'
                }`}
              >
                <div className="text-xs font-medium">
                  {format(date, 'EEE')}
                </div>
                <div className="text-lg font-semibold">
                  {format(date, 'd')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(date, 'MMM')}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Time Slots */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Available Times for {format(selectedDate, 'EEEE, MMMM d')}
        </label>
        
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-12 bg-muted rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-8 bg-muted rounded-lg">
            <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">No available slots for this date</p>
            <p className="text-sm text-muted-foreground">Try selecting another date</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot, index) => {
              const isSelected = selectedSlot === slot;
              
              return (
                <button
                  key={index}
                  onClick={() => setSelectedSlot(slot)}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-border hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <div className="font-medium">
                    {format(slot.startTime, 'h:mm a')}
                  </div>
                  {slot.agentName && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {slot.agentName}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Contact Details */}
      {selectedSlot && (
        <div className="space-y-4 pt-4 border-t">
          <h4 className="font-medium text-gray-900">Your Details</h4>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+233 XX XXX XXXX"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any specific requirements or questions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-muted"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleBooking}
          disabled={!selectedSlot || !contactName || !contactPhone || booking}
          className="flex-1 px-4 py-2 bg-blue-600 text-foreground rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {booking ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              Booking...
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4" />
              Book Viewing
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Compact Viewing Scheduler Dialog
 */
export function ViewingSchedulerDialog({
  isOpen,
  onClose,
  ...props
}: ViewingSchedulerProps & { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/50"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-card rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <ViewingScheduler
          {...props}
          onCancel={onClose}
          onBookingComplete={(booking) => {
            props.onBookingComplete?.(booking);
          }}
        />
      </div>
    </div>
  );
}

export default ViewingScheduler;
