/**
 * Google Calendar API Service
 * 
 * Provides calendar integration for CRM Deal Management:
 * - Create/update/delete calendar events
 * - Sync with deal activities and tasks
 * - Property viewing appointments
 * - Team meeting scheduling
 * - OAuth2 user authentication
 * 
 * API Documentation: https://developers.google.com/calendar/api/v3/reference
 * 
 * FREE TIER: 1,000,000 queries/day
 */

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { config } from '../../src/config';
import { logger } from '../../src/utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  attendees?: CalendarAttendee[];
  reminders?: EventReminder[];
  conferenceData?: boolean; // Add Google Meet link
  colorId?: string; // Event color (1-11)
  visibility?: 'default' | 'public' | 'private' | 'confidential';
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  optional?: boolean;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
}

export interface EventReminder {
  method: 'email' | 'popup';
  minutes: number;
}

export interface CalendarEventResponse {
  id: string;
  htmlLink: string;
  hangoutLink?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  created: string;
  updated: string;
}

export interface FreeBusySlot {
  start: Date;
  end: Date;
}

export interface UserCalendarAuth {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  calendarId?: string; // User's primary calendar
}

// ============================================================================
// Service Class
// ============================================================================

export class GoogleCalendarService {
  private enabled: boolean;
  private oauth2Client: OAuth2Client;

  constructor() {
    this.enabled = config.google.enabled;
    
    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  /**
   * Check if Google Calendar is configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ==========================================================================
  // OAuth2 Authentication Flow
  // ==========================================================================

  /**
   * Generate OAuth2 authorization URL for user consent
   */
  getAuthUrl(state?: string): string {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: [...config.google.scopes], // Convert readonly to mutable array
      prompt: 'consent', // Force consent screen
      state: state, // Pass user context
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<Credentials> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      logger.info('Google OAuth tokens obtained', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date,
      });

      return tokens;
    } catch (error: any) {
      logger.error('Failed to exchange Google auth code', { error: error.message });
      throw new Error('Failed to authenticate with Google Calendar');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<Credentials> {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      logger.info('Google access token refreshed', {
        expiryDate: credentials.expiry_date,
      });

      return credentials;
    } catch (error: any) {
      logger.error('Failed to refresh Google access token', { error: error.message });
      throw new Error('Failed to refresh Google Calendar access');
    }
  }

  /**
   * Create authenticated calendar client for a user
   */
  private getCalendarClient(userAuth: UserCalendarAuth): calendar_v3.Calendar {
    const oauth2 = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    oauth2.setCredentials({
      access_token: userAuth.accessToken,
      refresh_token: userAuth.refreshToken,
      expiry_date: userAuth.expiryDate,
    });

    return google.calendar({ version: 'v3', auth: oauth2 });
  }

  // ==========================================================================
  // Calendar Operations
  // ==========================================================================

  /**
   * List user's calendars
   */
  async listCalendars(userAuth: UserCalendarAuth): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    const calendar = this.getCalendarClient(userAuth);

    try {
      const response = await calendar.calendarList.list();
      return response.data.items || [];
    } catch (error: any) {
      logger.error('Failed to list calendars', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a calendar event
   */
  async createEvent(
    userAuth: UserCalendarAuth,
    event: CalendarEvent,
    calendarId: string = 'primary'
  ): Promise<CalendarEventResponse> {
    const calendar = this.getCalendarClient(userAuth);

    const eventResource: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: 'Africa/Accra',
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: 'Africa/Accra',
      },
      attendees: event.attendees?.map(a => ({
        email: a.email,
        displayName: a.displayName,
        optional: a.optional,
      })),
      reminders: {
        useDefault: !event.reminders,
        overrides: event.reminders?.map(r => ({
          method: r.method,
          minutes: r.minutes,
        })),
      },
      colorId: event.colorId,
      visibility: event.visibility,
    };

    // Add Google Meet if requested
    if (event.conferenceData) {
      eventResource.conferenceData = {
        createRequest: {
          requestId: `propmetrik-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    try {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: eventResource,
        conferenceDataVersion: event.conferenceData ? 1 : 0,
        sendUpdates: 'all', // Send invitations to attendees
      });

      logger.info('Calendar event created', {
        eventId: response.data.id,
        summary: event.title,
      });

      return {
        id: response.data.id!,
        htmlLink: response.data.htmlLink!,
        hangoutLink: response.data.hangoutLink ?? undefined,
        status: response.data.status as any,
        created: response.data.created!,
        updated: response.data.updated!,
      };
    } catch (error: any) {
      logger.error('Failed to create calendar event', {
        error: error.message,
        summary: event.title,
      });
      throw error;
    }
  }

  /**
   * Update a calendar event
   */
  async updateEvent(
    userAuth: UserCalendarAuth,
    eventId: string,
    updates: Partial<CalendarEvent>,
    calendarId: string = 'primary'
  ): Promise<CalendarEventResponse> {
    const calendar = this.getCalendarClient(userAuth);

    const eventResource: calendar_v3.Schema$Event = {};

    if (updates.title) eventResource.summary = updates.title;
    if (updates.description) eventResource.description = updates.description;
    if (updates.location) eventResource.location = updates.location;
    if (updates.startTime) {
      eventResource.start = {
        dateTime: updates.startTime.toISOString(),
        timeZone: 'Africa/Accra',
      };
    }
    if (updates.endTime) {
      eventResource.end = {
        dateTime: updates.endTime.toISOString(),
        timeZone: 'Africa/Accra',
      };
    }
    if (updates.attendees) {
      eventResource.attendees = updates.attendees.map(a => ({
        email: a.email,
        displayName: a.displayName,
        optional: a.optional,
      }));
    }

    try {
      const response = await calendar.events.patch({
        calendarId,
        eventId,
        requestBody: eventResource,
        sendUpdates: 'all',
      });

      logger.info('Calendar event updated', { eventId });

      return {
        id: response.data.id!,
        htmlLink: response.data.htmlLink!,
        hangoutLink: response.data.hangoutLink ?? undefined,
        status: response.data.status as any,
        created: response.data.created!,
        updated: response.data.updated!,
      };
    } catch (error: any) {
      logger.error('Failed to update calendar event', { eventId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(
    userAuth: UserCalendarAuth,
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<void> {
    const calendar = this.getCalendarClient(userAuth);

    try {
      await calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: 'all',
      });

      logger.info('Calendar event deleted', { eventId });
    } catch (error: any) {
      logger.error('Failed to delete calendar event', { eventId, error: error.message });
      throw error;
    }
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(
    userAuth: UserCalendarAuth,
    maxResults: number = 10,
    calendarId: string = 'primary'
  ): Promise<calendar_v3.Schema$Event[]> {
    const calendar = this.getCalendarClient(userAuth);

    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error: any) {
      logger.error('Failed to get upcoming events', { error: error.message });
      throw error;
    }
  }

  /**
   * Check free/busy slots
   */
  async getFreeBusy(
    userAuth: UserCalendarAuth,
    startTime: Date,
    endTime: Date,
    calendarIds: string[] = ['primary']
  ): Promise<Map<string, FreeBusySlot[]>> {
    const calendar = this.getCalendarClient(userAuth);

    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          items: calendarIds.map(id => ({ id })),
        },
      });

      const result = new Map<string, FreeBusySlot[]>();
      
      for (const [calendarId, info] of Object.entries(response.data.calendars || {})) {
        const busy = (info as any).busy?.map((slot: any) => ({
          start: new Date(slot.start),
          end: new Date(slot.end),
        })) || [];
        result.set(calendarId, busy);
      }

      return result;
    } catch (error: any) {
      logger.error('Failed to get free/busy', { error: error.message });
      throw error;
    }
  }

  // ==========================================================================
  // CRM-Specific Event Templates
  // ==========================================================================

  /**
   * Create property viewing event
   */
  async createPropertyViewing(
    userAuth: UserCalendarAuth,
    options: {
      propertyAddress: string;
      propertyId: string;
      clientName: string;
      clientEmail: string;
      agentName: string;
      agentEmail: string;
      viewingTime: Date;
      durationMinutes?: number;
      notes?: string;
    }
  ): Promise<CalendarEventResponse> {
    const duration = options.durationMinutes || 30;
    const endTime = new Date(options.viewingTime.getTime() + duration * 60 * 1000);

    return this.createEvent(userAuth, {
      title: `🏠 Property Viewing - ${options.clientName}`,
      description: `Property Viewing Appointment

📍 Property: ${options.propertyAddress}
👤 Client: ${options.clientName}
📧 Email: ${options.clientEmail}

${options.notes ? `Notes:\n${options.notes}` : ''}

Property ID: ${options.propertyId}
Scheduled by PROPMETRIK CRM`,
      location: options.propertyAddress,
      startTime: options.viewingTime,
      endTime: endTime,
      attendees: [
        { email: options.clientEmail, displayName: options.clientName },
        { email: options.agentEmail, displayName: options.agentName },
      ],
      reminders: [
        { method: 'email', minutes: 1440 }, // 1 day before
        { method: 'popup', minutes: 60 },   // 1 hour before
        { method: 'popup', minutes: 15 },   // 15 minutes before
      ],
      colorId: '2', // Sage green
    });
  }

  /**
   * Create deal meeting event
   */
  async createDealMeeting(
    userAuth: UserCalendarAuth,
    options: {
      dealTitle: string;
      dealId: string;
      meetingType: 'negotiation' | 'contract_review' | 'closing' | 'other';
      attendees: CalendarAttendee[];
      meetingTime: Date;
      durationMinutes?: number;
      location?: string;
      addGoogleMeet?: boolean;
      agenda?: string;
    }
  ): Promise<CalendarEventResponse> {
    const duration = options.durationMinutes || 60;
    const endTime = new Date(options.meetingTime.getTime() + duration * 60 * 1000);

    const meetingTypeEmoji = {
      negotiation: '🤝',
      contract_review: '📝',
      closing: '🎉',
      other: '📅',
    };

    const meetingTypeLabel = {
      negotiation: 'Negotiation Meeting',
      contract_review: 'Contract Review',
      closing: 'Closing Meeting',
      other: 'Deal Meeting',
    };

    return this.createEvent(userAuth, {
      title: `${meetingTypeEmoji[options.meetingType]} ${meetingTypeLabel[options.meetingType]} - ${options.dealTitle}`,
      description: `${meetingTypeLabel[options.meetingType]}

📋 Deal: ${options.dealTitle}
📅 Type: ${meetingTypeLabel[options.meetingType]}

${options.agenda ? `📝 Agenda:\n${options.agenda}` : ''}

Deal ID: ${options.dealId}
Scheduled by PROPMETRIK CRM`,
      location: options.location,
      startTime: options.meetingTime,
      endTime: endTime,
      attendees: options.attendees,
      conferenceData: options.addGoogleMeet,
      reminders: [
        { method: 'email', minutes: 1440 },
        { method: 'popup', minutes: 30 },
      ],
      colorId: options.meetingType === 'closing' ? '10' : '1', // Green for closing, blue for others
    });
  }

  /**
   * Create task deadline event
   */
  async createTaskDeadline(
    userAuth: UserCalendarAuth,
    options: {
      taskTitle: string;
      taskId: string;
      dealTitle?: string;
      deadline: Date;
      assigneeEmail: string;
      assigneeName: string;
      description?: string;
    }
  ): Promise<CalendarEventResponse> {
    // Create a 30-minute reminder event before deadline
    const reminderTime = new Date(options.deadline.getTime() - 30 * 60 * 1000);

    return this.createEvent(userAuth, {
      title: `⏰ Task Due: ${options.taskTitle}`,
      description: `Task Deadline Reminder

📋 Task: ${options.taskTitle}
${options.dealTitle ? `🏠 Deal: ${options.dealTitle}` : ''}
⏰ Due: ${options.deadline.toLocaleString('en-GB', { timeZone: 'Africa/Accra' })}

${options.description ? `Description:\n${options.description}` : ''}

Task ID: ${options.taskId}
Created by PROPMETRIK CRM`,
      startTime: reminderTime,
      endTime: options.deadline,
      attendees: [
        { email: options.assigneeEmail, displayName: options.assigneeName },
      ],
      reminders: [
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 0 },
      ],
      colorId: '11', // Red for deadline
    });
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();
export default googleCalendarService;
