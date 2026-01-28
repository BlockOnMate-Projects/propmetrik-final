/**
 * Calendar Services Index
 * SHARED SERVICE: Used across all domains
 * 
 * Includes:
 * - calendarService: Internal calendar management
 * - googleCalendarService: Google Calendar API integration
 */

export { calendarService } from './calendarService';
export type {
  CalendarEvent,
  Attendee,
  Reminder,
  ViewingAvailability,
  ViewingBooking,
  AvailableSlot
} from './calendarService';

export { googleCalendarService } from './googleCalendarService';
export type {
  CalendarEvent as GoogleCalendarEvent,
  CalendarAttendee,
  EventReminder
} from './googleCalendarService';
