/**
 * Calendar Integration Service
 * 
 * Integrates with Google Calendar for:
 * - Maintenance scheduling
 * - Property viewings
 * - Lease events (start, end, renewal)
 * - Payment reminders
 * 
 * Uses Google Calendar API v3
 */

import { google, calendar_v3 } from 'googleapis';
import db from '../../../database';
import { AppError } from '../../../middleware/errorHandler';

// ============================================
// Types
// ============================================

export interface CalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface CalendarConnection {
  id: string;
  organizationId: string;
  userId?: string;
  calendarId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  isActive: boolean;
}

export interface CalendarEvent {
  id?: string;
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  timeZone?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'accepted' | 'declined' | 'tentative';
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup' | 'sms';
      minutes: number;
    }>;
  };
  colorId?: string;
  recurrence?: string[];
  metadata?: Record<string, any>;
}

export interface ScheduledMaintenance {
  workOrderId: string;
  eventId?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  vendorName?: string;
  vendorEmail?: string;
  propertyAddress: string;
  tenantEmail?: string;
  description: string;
}

export interface PropertyViewing {
  propertyId: string;
  eventId?: string;
  viewingTime: Date;
  duration: number; // minutes
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  agentEmail: string;
  propertyAddress: string;
  notes?: string;
}

export interface LeaseEvent {
  type: 'start' | 'end' | 'renewal_reminder';
  tenancyId: string;
  eventId?: string;
  eventDate: Date;
  tenantName: string;
  tenantEmail: string;
  propertyAddress: string;
  unitNumber: string;
  managerEmail: string;
}

// Color IDs for Google Calendar
const CALENDAR_COLORS = {
  maintenance: '11', // Red - urgent
  maintenance_routine: '6', // Orange
  viewing: '7', // Cyan
  lease_start: '10', // Green
  lease_end: '4', // Pink
  lease_renewal: '5', // Yellow
  payment: '9', // Blue
};

// ============================================
// Calendar Service
// ============================================

export class CalendarService {
  private oauth2Client: any;
  private config: CalendarConfig;

  constructor() {
    this.config = {
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:4000/api/v1/calendar/oauth/callback'
    };

    if (this.config.clientId && this.config.clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(
        this.config.clientId,
        this.config.clientSecret,
        this.config.redirectUri
      );
    }
  }

  /**
   * Check if calendar integration is configured
   */
  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.clientSecret);
  }

  /**
   * Generate OAuth2 authorization URL
   */
  getAuthUrl(state: string): string {
    if (!this.oauth2Client) {
      throw new AppError('Calendar integration not configured', 500);
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      prompt: 'consent' // Force consent to always get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async handleOAuthCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    if (!this.oauth2Client) {
      throw new AppError('Calendar integration not configured', 500);
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600));

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt
    };
  }

  /**
   * Store calendar connection
   */
  async storeConnection(
    organizationId: string,
    tokens: { accessToken: string; refreshToken: string; expiresAt: Date },
    calendarId: string = 'primary',
    userId?: string
  ): Promise<CalendarConnection> {
    const id = require('uuid').v4();

    await db.query(`
      INSERT INTO calendar_connections (
        id, organization_id, user_id, calendar_id,
        access_token, refresh_token, expires_at, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      ON CONFLICT (organization_id, calendar_id) 
      DO UPDATE SET 
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
    `, [id, organizationId, userId, calendarId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt]);

    return {
      id,
      organizationId,
      userId,
      calendarId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      isActive: true
    };
  }

  /**
   * Get active connection for organization
   */
  async getConnection(organizationId: string): Promise<CalendarConnection | null> {
    const result = await db.query(`
      SELECT id, organization_id, user_id, calendar_id,
             access_token, refresh_token, expires_at, is_active
      FROM calendar_connections
      WHERE organization_id = $1 AND is_active = true
      LIMIT 1
    `, [organizationId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      calendarId: row.calendar_id,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: new Date(row.expires_at),
      isActive: row.is_active
    };
  }

  /**
   * Get authenticated calendar client
   */
  private async getCalendarClient(connection: CalendarConnection): Promise<calendar_v3.Calendar> {
    if (!this.oauth2Client) {
      throw new AppError('Calendar integration not configured', 500);
    }

    // Check if token needs refresh
    if (new Date() >= connection.expiresAt) {
      this.oauth2Client.setCredentials({
        refresh_token: connection.refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // Update stored tokens
      await db.query(`
        UPDATE calendar_connections 
        SET access_token = $1, expires_at = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [credentials.access_token, new Date(credentials.expiry_date), connection.id]);

      connection.accessToken = credentials.access_token;
    }

    this.oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken
    });

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Create a calendar event
   */
  async createEvent(organizationId: string, event: CalendarEvent): Promise<CalendarEvent> {
    const connection = await this.getConnection(organizationId);
    if (!connection) {
      throw new AppError('No calendar connected. Please connect Google Calendar first.', 400);
    }

    const calendar = await this.getCalendarClient(connection);

    const googleEvent: calendar_v3.Schema$Event = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: event.timeZone || 'Africa/Accra'
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: event.timeZone || 'Africa/Accra'
      },
      attendees: event.attendees?.map(a => ({
        email: a.email,
        displayName: a.displayName
      })),
      reminders: event.reminders || {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 60 } // 1 hour before
        ]
      },
      colorId: event.colorId,
      recurrence: event.recurrence
    };

    const response = await calendar.events.insert({
      calendarId: event.calendarId || connection.calendarId,
      requestBody: googleEvent,
      sendUpdates: 'all' // Send invites to attendees
    });

    return {
      ...event,
      id: response.data.id || undefined,
      calendarId: event.calendarId || connection.calendarId
    };
  }

  /**
   * Update a calendar event
   */
  async updateEvent(organizationId: string, eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const connection = await this.getConnection(organizationId);
    if (!connection) {
      throw new AppError('No calendar connected', 400);
    }

    const calendar = await this.getCalendarClient(connection);

    const googleEvent: calendar_v3.Schema$Event = {};
    
    if (updates.summary) googleEvent.summary = updates.summary;
    if (updates.description) googleEvent.description = updates.description;
    if (updates.location) googleEvent.location = updates.location;
    if (updates.startTime) {
      googleEvent.start = {
        dateTime: updates.startTime.toISOString(),
        timeZone: updates.timeZone || 'Africa/Accra'
      };
    }
    if (updates.endTime) {
      googleEvent.end = {
        dateTime: updates.endTime.toISOString(),
        timeZone: updates.timeZone || 'Africa/Accra'
      };
    }
    if (updates.attendees) {
      googleEvent.attendees = updates.attendees.map(a => ({
        email: a.email,
        displayName: a.displayName
      }));
    }

    const response = await calendar.events.patch({
      calendarId: updates.calendarId || connection.calendarId,
      eventId,
      requestBody: googleEvent,
      sendUpdates: 'all'
    });

    return {
      id: response.data.id || eventId,
      summary: response.data.summary || '',
      startTime: new Date(response.data.start?.dateTime || ''),
      endTime: new Date(response.data.end?.dateTime || ''),
      ...updates
    };
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(organizationId: string, eventId: string, calendarId?: string): Promise<void> {
    const connection = await this.getConnection(organizationId);
    if (!connection) {
      throw new AppError('No calendar connected', 400);
    }

    const calendar = await this.getCalendarClient(connection);

    await calendar.events.delete({
      calendarId: calendarId || connection.calendarId,
      eventId,
      sendUpdates: 'all'
    });
  }

  /**
   * Get events in a date range
   */
  async getEvents(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    calendarId?: string
  ): Promise<CalendarEvent[]> {
    const connection = await this.getConnection(organizationId);
    if (!connection) {
      throw new AppError('No calendar connected', 400);
    }

    const calendar = await this.getCalendarClient(connection);

    const response = await calendar.events.list({
      calendarId: calendarId || connection.calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    return (response.data.items || []).map(item => ({
      id: item.id || undefined,
      calendarId: calendarId || connection.calendarId,
      summary: item.summary || '',
      description: item.description || undefined,
      location: item.location || undefined,
      startTime: new Date(item.start?.dateTime || item.start?.date || ''),
      endTime: new Date(item.end?.dateTime || item.end?.date || ''),
      attendees: item.attendees?.map(a => ({
        email: a.email || '',
        displayName: a.displayName || undefined,
        responseStatus: a.responseStatus as any
      })),
      colorId: item.colorId || undefined
    }));
  }

  // =====================================================
  // MAINTENANCE SCHEDULING
  // =====================================================

  /**
   * Schedule a maintenance visit
   */
  async scheduleMaintenance(
    organizationId: string,
    maintenance: ScheduledMaintenance
  ): Promise<CalendarEvent> {
    const event: CalendarEvent = {
      summary: `🔧 Maintenance: ${maintenance.description.substring(0, 50)}`,
      description: `
Work Order ID: ${maintenance.workOrderId}
Property: ${maintenance.propertyAddress}

${maintenance.description}

Vendor: ${maintenance.vendorName || 'TBD'}
      `.trim(),
      location: maintenance.propertyAddress,
      startTime: maintenance.scheduledStart,
      endTime: maintenance.scheduledEnd,
      attendees: [
        ...(maintenance.vendorEmail ? [{ email: maintenance.vendorEmail, displayName: maintenance.vendorName }] : []),
        ...(maintenance.tenantEmail ? [{ email: maintenance.tenantEmail, displayName: 'Tenant' }] : [])
      ],
      colorId: CALENDAR_COLORS.maintenance,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 60 }, // 1 hour before
          { method: 'popup', minutes: 15 } // 15 min before
        ]
      },
      metadata: {
        type: 'maintenance',
        workOrderId: maintenance.workOrderId
      }
    };

    const created = await this.createEvent(organizationId, event);

    // Store event ID with work order
    if (created.id) {
      await db.query(`
        UPDATE maintenance_work_orders
        SET calendar_event_id = $1, scheduled_date = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [created.id, maintenance.scheduledStart, maintenance.workOrderId]);
    }

    return created;
  }

  /**
   * Reschedule maintenance
   */
  async rescheduleMaintenance(
    organizationId: string,
    workOrderId: string,
    newStart: Date,
    newEnd: Date
  ): Promise<CalendarEvent | null> {
    // Get existing event ID
    const result = await db.query(
      `SELECT calendar_event_id FROM maintenance_work_orders WHERE id = $1`,
      [workOrderId]
    );

    const eventId = result.rows[0]?.calendar_event_id;
    if (!eventId) return null;

    const updated = await this.updateEvent(organizationId, eventId, {
      startTime: newStart,
      endTime: newEnd
    });

    // Update work order
    await db.query(`
      UPDATE maintenance_work_orders
      SET scheduled_date = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newStart, workOrderId]);

    return updated;
  }

  /**
   * Cancel maintenance calendar event
   */
  async cancelMaintenanceEvent(organizationId: string, workOrderId: string): Promise<void> {
    const result = await db.query(
      `SELECT calendar_event_id FROM maintenance_work_orders WHERE id = $1`,
      [workOrderId]
    );

    const eventId = result.rows[0]?.calendar_event_id;
    if (!eventId) return;

    try {
      await this.deleteEvent(organizationId, eventId);
    } catch (err) {
      console.error('Failed to delete calendar event:', err);
    }

    await db.query(`
      UPDATE maintenance_work_orders
      SET calendar_event_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [workOrderId]);
  }

  // =====================================================
  // PROPERTY VIEWINGS
  // =====================================================

  /**
   * Schedule a property viewing
   */
  async scheduleViewing(
    organizationId: string,
    viewing: PropertyViewing
  ): Promise<CalendarEvent> {
    const endTime = new Date(viewing.viewingTime);
    endTime.setMinutes(endTime.getMinutes() + viewing.duration);

    const event: CalendarEvent = {
      summary: `🏠 Property Viewing: ${viewing.propertyAddress.substring(0, 40)}`,
      description: `
Property Viewing

Prospect: ${viewing.prospectName}
Phone: ${viewing.prospectPhone}
Email: ${viewing.prospectEmail}

${viewing.notes || ''}
      `.trim(),
      location: viewing.propertyAddress,
      startTime: viewing.viewingTime,
      endTime,
      attendees: [
        { email: viewing.agentEmail, displayName: 'Property Agent' },
        { email: viewing.prospectEmail, displayName: viewing.prospectName }
      ],
      colorId: CALENDAR_COLORS.viewing,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 * 4 }, // 4 hours before
          { method: 'popup', minutes: 30 }
        ]
      },
      metadata: {
        type: 'viewing',
        propertyId: viewing.propertyId
      }
    };

    return this.createEvent(organizationId, event);
  }

  // =====================================================
  // LEASE EVENTS
  // =====================================================

  /**
   * Create lease lifecycle events (start, end, renewal reminder)
   */
  async createLeaseEvents(
    organizationId: string,
    tenancyId: string
  ): Promise<CalendarEvent[]> {
    // Get tenancy details
    const result = await db.query(`
      SELECT 
        t.id, t.start_date, t.end_date,
        ten.full_name as tenant_name, ten.email as tenant_email,
        p.address_street, p.address_city,
        u.unit_number
      FROM tenancies t
      JOIN tenants ten ON t.tenant_id = ten.id
      JOIN units u ON t.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      WHERE t.id = $1
    `, [tenancyId]);

    if (result.rows.length === 0) {
      throw new AppError('Tenancy not found', 404);
    }

    const tenancy = result.rows[0];
    const address = `${tenancy.address_street}, ${tenancy.address_city}`;
    const events: CalendarEvent[] = [];

    // Get manager email (organization owner)
    const orgResult = await db.query(
      `SELECT u.email FROM users u JOIN organizations o ON o.owner_id = u.id WHERE o.id = $1`,
      [organizationId]
    );
    const managerEmail = orgResult.rows[0]?.email || '';

    // Lease Start Event
    const startEvent: CalendarEvent = {
      summary: `🔑 Lease Start: ${tenancy.tenant_name} - ${tenancy.unit_number}`,
      description: `
Lease starts for ${tenancy.tenant_name}
Property: ${address}
Unit: ${tenancy.unit_number}
      `.trim(),
      location: address,
      startTime: new Date(tenancy.start_date),
      endTime: new Date(new Date(tenancy.start_date).getTime() + 60 * 60 * 1000), // 1 hour
      attendees: [
        { email: tenancy.tenant_email, displayName: tenancy.tenant_name },
        ...(managerEmail ? [{ email: managerEmail, displayName: 'Property Manager' }] : [])
      ],
      colorId: CALENDAR_COLORS.lease_start,
      metadata: { type: 'lease_start', tenancyId }
    };
    events.push(await this.createEvent(organizationId, startEvent));

    // Lease End Event
    const endEvent: CalendarEvent = {
      summary: `📋 Lease End: ${tenancy.tenant_name} - ${tenancy.unit_number}`,
      description: `
Lease ends for ${tenancy.tenant_name}
Property: ${address}
Unit: ${tenancy.unit_number}

Action Required: Discuss renewal or move-out
      `.trim(),
      location: address,
      startTime: new Date(tenancy.end_date),
      endTime: new Date(new Date(tenancy.end_date).getTime() + 60 * 60 * 1000),
      attendees: [
        { email: tenancy.tenant_email, displayName: tenancy.tenant_name },
        ...(managerEmail ? [{ email: managerEmail, displayName: 'Property Manager' }] : [])
      ],
      colorId: CALENDAR_COLORS.lease_end,
      metadata: { type: 'lease_end', tenancyId }
    };
    events.push(await this.createEvent(organizationId, endEvent));

    // Renewal Reminder (60 days before end)
    const renewalDate = new Date(tenancy.end_date);
    renewalDate.setDate(renewalDate.getDate() - 60);

    if (renewalDate > new Date()) {
      const renewalEvent: CalendarEvent = {
        summary: `⏰ Renewal Reminder: ${tenancy.tenant_name}`,
        description: `
Lease renewal reminder for ${tenancy.tenant_name}
Lease expires: ${new Date(tenancy.end_date).toLocaleDateString()}

Contact tenant to discuss renewal options.
        `.trim(),
        startTime: renewalDate,
        endTime: new Date(renewalDate.getTime() + 30 * 60 * 1000), // 30 min
        attendees: managerEmail ? [{ email: managerEmail, displayName: 'Property Manager' }] : [],
        colorId: CALENDAR_COLORS.lease_renewal,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 0 }
          ]
        },
        metadata: { type: 'lease_renewal', tenancyId }
      };
      events.push(await this.createEvent(organizationId, renewalEvent));
    }

    return events;
  }

  // =====================================================
  // PAYMENT REMINDERS
  // =====================================================

  /**
   * Create recurring rent payment reminders
   */
  async createPaymentReminders(
    organizationId: string,
    tenancyId: string,
    rentDueDay: number = 1
  ): Promise<CalendarEvent> {
    const result = await db.query(`
      SELECT 
        t.id, t.start_date, t.end_date, t.rent_amount, t.rent_currency,
        ten.full_name, ten.email
      FROM tenancies t
      JOIN tenants ten ON t.tenant_id = ten.id
      WHERE t.id = $1
    `, [tenancyId]);

    if (result.rows.length === 0) {
      throw new AppError('Tenancy not found', 404);
    }

    const tenancy = result.rows[0];

    // Create recurring event on rent due day
    const startDate = new Date(tenancy.start_date);
    startDate.setDate(rentDueDay);
    if (startDate < new Date(tenancy.start_date)) {
      startDate.setMonth(startDate.getMonth() + 1);
    }

    const endDate = new Date(tenancy.end_date);

    const event: CalendarEvent = {
      summary: `💰 Rent Due: ${tenancy.rent_currency} ${tenancy.rent_amount.toLocaleString()}`,
      description: `
Monthly rent payment reminder for ${tenancy.full_name}
Amount: ${tenancy.rent_currency} ${tenancy.rent_amount.toLocaleString()}
      `.trim(),
      startTime: startDate,
      endTime: new Date(startDate.getTime() + 30 * 60 * 1000),
      attendees: [{ email: tenancy.email, displayName: tenancy.full_name }],
      colorId: CALENDAR_COLORS.payment,
      recurrence: [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${rentDueDay};UNTIL=${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 3 * 24 * 60 }, // 3 days before
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 0 } // On the day
        ]
      },
      metadata: { type: 'payment_reminder', tenancyId }
    };

    return this.createEvent(organizationId, event);
  }

  /**
   * Disconnect calendar
   */
  async disconnectCalendar(organizationId: string): Promise<void> {
    await db.query(`
      UPDATE calendar_connections
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
    `, [organizationId]);
  }
}

export const calendarService = new CalendarService();
