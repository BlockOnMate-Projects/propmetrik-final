/**
 * Calendar Service
 * Manages calendar events, viewing scheduling, and calendar sync
 * 
 * SHARED SERVICE: Used across CRM, Projects, and Property Management domains
 */

import { pool } from '../../src/database';
import { logger } from '../../src/utils/logger';

// Types
export interface CalendarEvent {
  id?: string;
  organizationId: string;
  userId: string;
  title: string;
  description?: string;
  eventType: 'viewing' | 'meeting' | 'task' | 'reminder' | 'follow_up' | 'deadline' | 'milestone' | 'inspection';
  location?: string;
  locationType?: 'in_person' | 'virtual' | 'phone';
  startTime: Date;
  endTime: Date;
  allDay?: boolean;
  timezone?: string;
  isRecurring?: boolean;
  recurrenceRule?: string;
  recurrenceEndDate?: Date;
  parentEventId?: string;
  dealId?: string;
  contactId?: string;
  propertyId?: string;
  projectId?: string;
  taskId?: string;
  attendees?: Attendee[];
  googleEventId?: string;
  outlookEventId?: string;
  reminders?: Reminder[];
  status?: 'scheduled' | 'completed' | 'cancelled';
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface Attendee {
  userId?: string;
  email: string;
  name: string;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
}

export interface Reminder {
  minutesBefore: number;
  type: 'email' | 'push' | 'whatsapp' | 'sms';
}

export interface ViewingAvailability {
  id?: string;
  organizationId: string;
  propertyId: string;
  agentId: string;
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes?: number;
  maxSlots?: number;
  specificDate?: Date;
  isActive?: boolean;
}

export interface ViewingBooking {
  id?: string;
  organizationId: string;
  propertyId: string;
  contactId: string;
  agentId: string;
  dealId?: string;
  scheduledAt: Date;
  durationMinutes?: number;
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  agentNotes?: string;
}

export interface AvailableSlot {
  startTime: Date;
  endTime: Date;
  agentId: string;
  agentName?: string;
}

class CalendarService {
  // ==========================================================================
  // CALENDAR EVENTS
  // ==========================================================================
  
  /**
   * Create a calendar event
   */
  async createEvent(event: CalendarEvent): Promise<CalendarEvent> {
    const result = await pool.query(
      `INSERT INTO calendar_events (
        organization_id, user_id, title, description, event_type,
        location, location_type, start_time, end_time, all_day, timezone,
        is_recurring, recurrence_rule, recurrence_end_date, parent_event_id,
        deal_id, contact_id, property_id, task_id,
        attendees, google_event_id, outlook_event_id, reminders, status, color, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        event.organizationId,
        event.userId,
        event.title,
        event.description || null,
        event.eventType,
        event.location || null,
        event.locationType || null,
        event.startTime,
        event.endTime,
        event.allDay || false,
        event.timezone || 'Africa/Accra',
        event.isRecurring || false,
        event.recurrenceRule || null,
        event.recurrenceEndDate || null,
        event.parentEventId || null,
        event.dealId || null,
        event.contactId || null,
        event.propertyId || null,
        event.taskId || null,
        JSON.stringify(event.attendees || []),
        event.googleEventId || null,
        event.outlookEventId || null,
        JSON.stringify(event.reminders || [{ minutesBefore: 30, type: 'push' }]),
        event.status || 'scheduled',
        event.color || null,
        JSON.stringify(event.metadata || {}),
      ]
    );
    
    logger.info('Calendar event created', { eventId: result.rows[0].id, eventType: event.eventType });
    return this.mapRowToEvent(result.rows[0]);
  }
  
  /**
   * Update a calendar event
   */
  async updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    
    const fieldMappings: Record<string, string> = {
      title: 'title',
      description: 'description',
      eventType: 'event_type',
      location: 'location',
      locationType: 'location_type',
      startTime: 'start_time',
      endTime: 'end_time',
      allDay: 'all_day',
      isRecurring: 'is_recurring',
      recurrenceRule: 'recurrence_rule',
      status: 'status',
      color: 'color',
    };
    
    for (const [key, dbField] of Object.entries(fieldMappings)) {
      if (key in updates) {
        setClauses.push(`${dbField} = $${paramIndex}`);
        values.push((updates as Record<string, unknown>)[key]);
        paramIndex++;
      }
    }
    
    if (updates.attendees) {
      setClauses.push(`attendees = $${paramIndex}`);
      values.push(JSON.stringify(updates.attendees));
      paramIndex++;
    }
    
    if (updates.reminders) {
      setClauses.push(`reminders = $${paramIndex}`);
      values.push(JSON.stringify(updates.reminders));
      paramIndex++;
    }
    
    if (setClauses.length === 0) return null;
    
    values.push(eventId);
    const result = await pool.query(
      `UPDATE calendar_events SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    return result.rows.length > 0 ? this.mapRowToEvent(result.rows[0]) : null;
  }
  
  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM calendar_events WHERE id = $1 RETURNING id',
      [eventId]
    );
    return result.rowCount! > 0;
  }
  
  /**
   * Get calendar events for a date range
   */
  async getEvents(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    filters?: {
      userId?: string;
      eventType?: string;
      dealId?: string;
      contactId?: string;
      propertyId?: string;
      projectId?: string;
    }
  ): Promise<CalendarEvent[]> {
    let query = `
      SELECT ce.*
      FROM calendar_events ce
      WHERE ce.organization_id = $1
        AND ce.start_time >= $2
        AND ce.end_time <= $3
        AND ce.status != 'cancelled'
    `;
    const params: unknown[] = [organizationId, startDate, endDate];
    let paramIndex = 4;
    
    if (filters?.userId) {
      query += ` AND ce.user_id = $${paramIndex++}`;
      params.push(filters.userId);
    }
    if (filters?.eventType) {
      query += ` AND ce.event_type = $${paramIndex++}`;
      params.push(filters.eventType);
    }
    if (filters?.dealId) {
      query += ` AND ce.deal_id = $${paramIndex++}`;
      params.push(filters.dealId);
    }
    if (filters?.contactId) {
      query += ` AND ce.contact_id = $${paramIndex++}`;
      params.push(filters.contactId);
    }
    if (filters?.propertyId) {
      query += ` AND ce.property_id = $${paramIndex++}`;
      params.push(filters.propertyId);
    }
    if (filters?.projectId) {
      query += ` AND (ce.metadata->>'projectId' = $${paramIndex++})`;
      params.push(filters.projectId);
    }
    
    query += ' ORDER BY ce.start_time ASC';
    
    const result = await pool.query(query, params);
    return result.rows.map(row => this.mapRowToEvent(row));
  }
  
  /**
   * Get a single calendar event
   */
  async getEventById(eventId: string): Promise<CalendarEvent | null> {
    const result = await pool.query(
      `SELECT ce.*
       FROM calendar_events ce
       WHERE ce.id = $1`,
      [eventId]
    );
    return result.rows.length > 0 ? this.mapRowToEvent(result.rows[0]) : null;
  }
  
  /**
   * Get upcoming events for a user
   */
  async getUpcomingEvents(
    userId: string,
    organizationId: string,
    limit = 10
  ): Promise<CalendarEvent[]> {
    const result = await pool.query(
      `SELECT ce.*
       FROM calendar_events ce
       WHERE ce.organization_id = $1
         AND ce.user_id = $2
         AND ce.start_time >= NOW()
         AND ce.status = 'scheduled'
       ORDER BY ce.start_time ASC
       LIMIT $3`,
      [organizationId, userId, limit]
    );
    return result.rows.map(row => this.mapRowToEvent(row));
  }
  
  // ==========================================================================
  // VIEWING AVAILABILITY
  // ==========================================================================
  
  /**
   * Set viewing availability for a property
   */
  async setViewingAvailability(availability: ViewingAvailability): Promise<ViewingAvailability> {
    const result = await pool.query(
      `INSERT INTO viewing_availability (
        organization_id, property_id, agent_id,
        day_of_week, start_time, end_time,
        slot_duration_minutes, max_slots, specific_date, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        availability.organizationId,
        availability.propertyId,
        availability.agentId,
        availability.dayOfWeek ?? null,
        availability.startTime,
        availability.endTime,
        availability.slotDurationMinutes || 30,
        availability.maxSlots || 4,
        availability.specificDate || null,
        availability.isActive !== false,
      ]
    );
    
    return this.mapRowToAvailability(result.rows[0]);
  }
  
  /**
   * Get viewing availability for a property
   */
  async getViewingAvailability(propertyId: string): Promise<ViewingAvailability[]> {
    const result = await pool.query(
      `SELECT va.*, u.first_name || ' ' || u.last_name as agent_name
       FROM viewing_availability va
       LEFT JOIN users u ON va.agent_id = u.id
       WHERE va.property_id = $1 AND va.is_active = TRUE
       ORDER BY va.day_of_week, va.specific_date, va.start_time`,
      [propertyId]
    );
    return result.rows.map(row => this.mapRowToAvailability(row));
  }
  
  /**
   * Delete viewing availability
   */
  async deleteViewingAvailability(availabilityId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM viewing_availability WHERE id = $1 RETURNING id',
      [availabilityId]
    );
    return result.rowCount! > 0;
  }
  
  /**
   * Get available viewing slots for a property on a given date
   */
  async getAvailableSlots(
    propertyId: string,
    date: Date
  ): Promise<AvailableSlot[]> {
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split('T')[0];
    
    // Get availability for this day
    const availabilityResult = await pool.query(
      `SELECT va.*, u.first_name || ' ' || u.last_name as agent_name
       FROM viewing_availability va
       LEFT JOIN users u ON va.agent_id = u.id
       WHERE va.property_id = $1
         AND va.is_active = TRUE
         AND (va.day_of_week = $2 OR va.specific_date = $3)`,
      [propertyId, dayOfWeek, dateStr]
    );
    
    if (availabilityResult.rows.length === 0) return [];
    
    // Get existing bookings for this date
    const bookingsResult = await pool.query(
      `SELECT scheduled_at, duration_minutes, agent_id
       FROM viewing_bookings
       WHERE property_id = $1
         AND DATE(scheduled_at) = $2
         AND status NOT IN ('cancelled')`,
      [propertyId, dateStr]
    );
    
    const bookedTimes = bookingsResult.rows.map(b => ({
      start: new Date(b.scheduled_at),
      end: new Date(new Date(b.scheduled_at).getTime() + b.duration_minutes * 60000),
      agentId: b.agent_id,
    }));
    
    // Generate available slots
    const slots: AvailableSlot[] = [];
    
    for (const avail of availabilityResult.rows) {
      const [startHour, startMin] = avail.start_time.split(':').map(Number);
      const [endHour, endMin] = avail.end_time.split(':').map(Number);
      const slotDuration = avail.slot_duration_minutes || 30;
      
      // Generate slots
      const startDate = new Date(date);
      startDate.setHours(startHour, startMin, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(endHour, endMin, 0, 0);
      
      let currentSlot = new Date(startDate);
      let slotsForAgent = 0;
      
      while (currentSlot < endDate && slotsForAgent < (avail.max_slots || 4)) {
        const slotEnd = new Date(currentSlot.getTime() + slotDuration * 60000);
        
        // Check if slot conflicts with existing bookings
        const isBooked = bookedTimes.some(booking => 
          booking.agentId === avail.agent_id &&
          currentSlot < booking.end &&
          slotEnd > booking.start
        );
        
        // Only add future slots
        if (!isBooked && currentSlot > new Date()) {
          slots.push({
            startTime: new Date(currentSlot),
            endTime: slotEnd,
            agentId: avail.agent_id,
            agentName: avail.agent_name,
          });
          slotsForAgent++;
        }
        
        currentSlot = new Date(currentSlot.getTime() + slotDuration * 60000);
      }
    }
    
    return slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }
  
  // ==========================================================================
  // VIEWING BOOKINGS
  // ==========================================================================
  
  /**
   * Book a viewing
   */
  async bookViewing(booking: ViewingBooking): Promise<ViewingBooking> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create the booking
      const bookingResult = await client.query(
        `INSERT INTO viewing_bookings (
          organization_id, property_id, contact_id, agent_id, deal_id,
          scheduled_at, duration_minutes, status,
          contact_name, contact_phone, contact_email, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          booking.organizationId,
          booking.propertyId,
          booking.contactId,
          booking.agentId,
          booking.dealId || null,
          booking.scheduledAt,
          booking.durationMinutes || 30,
          booking.status || 'pending',
          booking.contactName || null,
          booking.contactPhone || null,
          booking.contactEmail || null,
          booking.notes || null,
        ]
      );
      
      const newBooking = bookingResult.rows[0];
      
      // Create corresponding calendar event
      const endTime = new Date(newBooking.scheduled_at);
      endTime.setMinutes(endTime.getMinutes() + (newBooking.duration_minutes || 30));
      
      const calendarResult = await client.query(
        `INSERT INTO calendar_events (
          organization_id, user_id, title, description, event_type,
          location_type, start_time, end_time, deal_id, contact_id, property_id,
          reminders
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          booking.organizationId,
          booking.agentId,
          `Property Viewing - ${booking.contactName || 'Contact'}`,
          booking.notes || null,
          'viewing',
          'in_person',
          newBooking.scheduled_at,
          endTime,
          booking.dealId || null,
          booking.contactId,
          booking.propertyId,
          JSON.stringify([
            { minutesBefore: 60, type: 'push' },
            { minutesBefore: 30, type: 'push' },
          ]),
        ]
      );
      
      // Link calendar event to booking
      await client.query(
        'UPDATE viewing_bookings SET calendar_event_id = $1 WHERE id = $2',
        [calendarResult.rows[0].id, newBooking.id]
      );
      
      await client.query('COMMIT');
      
      logger.info('Viewing booked', { bookingId: newBooking.id, propertyId: booking.propertyId });
      return this.mapRowToBooking({ ...newBooking, calendar_event_id: calendarResult.rows[0].id });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Update viewing booking status
   */
  async updateBookingStatus(
    bookingId: string,
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show',
    agentNotes?: string,
    cancelledBy?: string,
    cancellationReason?: string
  ): Promise<ViewingBooking | null> {
    let query = `
      UPDATE viewing_bookings
      SET status = $1, agent_notes = COALESCE($2, agent_notes)
    `;
    const params: unknown[] = [status, agentNotes];
    let paramIndex = 3;
    
    if (status === 'cancelled') {
      query += `, cancelled_at = NOW(), cancelled_by = $${paramIndex++}, cancellation_reason = $${paramIndex++}`;
      params.push(cancelledBy, cancellationReason);
    }
    
    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(bookingId);
    
    const result = await pool.query(query, params);
    
    if (result.rows.length > 0) {
      // Update calendar event status too
      if (result.rows[0].calendar_event_id) {
        const calendarStatus = status === 'cancelled' ? 'cancelled' : 
                               status === 'completed' ? 'completed' : 'scheduled';
        await pool.query(
          'UPDATE calendar_events SET status = $1 WHERE id = $2',
          [calendarStatus, result.rows[0].calendar_event_id]
        );
      }
      return this.mapRowToBooking(result.rows[0]);
    }
    return null;
  }
  
  /**
   * Get viewing bookings
   */
  async getViewingBookings(
    organizationId: string,
    filters?: {
      propertyId?: string;
      agentId?: string;
      contactId?: string;
      dealId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<ViewingBooking[]> {
    let query = `
      SELECT vb.*,
             p.address as property_address,
             c.first_name || ' ' || c.last_name as contact_full_name,
             u.first_name || ' ' || u.last_name as agent_name
      FROM viewing_bookings vb
      LEFT JOIN crm_properties p ON vb.property_id = p.id
      LEFT JOIN crm_contacts c ON vb.contact_id = c.id
      LEFT JOIN users u ON vb.agent_id = u.id
      WHERE vb.organization_id = $1
    `;
    const params: unknown[] = [organizationId];
    let paramIndex = 2;
    
    if (filters?.propertyId) {
      query += ` AND vb.property_id = $${paramIndex++}`;
      params.push(filters.propertyId);
    }
    if (filters?.agentId) {
      query += ` AND vb.agent_id = $${paramIndex++}`;
      params.push(filters.agentId);
    }
    if (filters?.contactId) {
      query += ` AND vb.contact_id = $${paramIndex++}`;
      params.push(filters.contactId);
    }
    if (filters?.dealId) {
      query += ` AND vb.deal_id = $${paramIndex++}`;
      params.push(filters.dealId);
    }
    if (filters?.status) {
      query += ` AND vb.status = $${paramIndex++}`;
      params.push(filters.status);
    }
    if (filters?.startDate) {
      query += ` AND vb.scheduled_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ` AND vb.scheduled_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }
    
    query += ' ORDER BY vb.scheduled_at ASC';
    
    const result = await pool.query(query, params);
    return result.rows.map(row => this.mapRowToBooking(row));
  }
  
  // ==========================================================================
  // CREATE EVENT FROM TASK
  // ==========================================================================
  
  /**
   * Create calendar event from a CRM task
   */
  async createEventFromTask(
    taskId: string,
    organizationId: string,
    userId: string
  ): Promise<CalendarEvent | null> {
    // Get task details
    const taskResult = await pool.query(
      `SELECT t.*, d.id as deal_id, d.title as deal_title
       FROM crm_tasks t
       LEFT JOIN crm_deals d ON t.deal_id = d.id
       WHERE t.id = $1`,
      [taskId]
    );
    
    if (taskResult.rows.length === 0) return null;
    
    const task = taskResult.rows[0];
    
    // Create calendar event for the due date
    const startTime = new Date(task.due_date);
    startTime.setHours(9, 0, 0, 0); // Default to 9 AM if no time specified
    
    const endTime = new Date(startTime);
    endTime.setHours(10, 0, 0, 0); // 1 hour duration
    
    return this.createEvent({
      organizationId,
      userId,
      title: task.title,
      description: task.description,
      eventType: 'task',
      startTime,
      endTime,
      dealId: task.deal_id,
      taskId,
      reminders: [
        { minutesBefore: 60, type: 'push' },
        { minutesBefore: 1440, type: 'email' }, // 24 hours before
      ],
    });
  }
  
  // ==========================================================================
  // MAINTENANCE SCHEDULING
  // ==========================================================================
  
  /**
   * Schedule maintenance work order on calendar
   */
  async scheduleMaintenanceWork(
    organizationId: string,
    params: {
      workOrderId: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      vendorId?: string;
      vendorName?: string;
      vendorEmail?: string;
    }
  ): Promise<CalendarEvent> {
    // Get work order details
    const woResult = await pool.query(
      `SELECT 
        wo.id, wo.description, wo.priority,
        mr.id as request_id,
        t.email as tenant_email, t.full_name as tenant_name,
        p.address_street, p.address_city,
        u.unit_number
      FROM maintenance_work_orders wo
      JOIN maintenance_requests mr ON wo.request_id = mr.id
      JOIN tenancies ten ON mr.tenancy_id = ten.id
      JOIN tenants t ON ten.tenant_id = t.id
      JOIN units u ON ten.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      WHERE wo.id = $1`,
      [params.workOrderId]
    );
    
    if (woResult.rows.length === 0) {
      throw new Error('Work order not found');
    }
    
    const wo = woResult.rows[0];
    const address = `${wo.address_street}, ${wo.address_city}`;
    const isUrgent = wo.priority === 'urgent' || wo.priority === 'emergency';
    
    // Create calendar event
    const attendees: Attendee[] = [];
    if (params.vendorEmail) {
      attendees.push({
        email: params.vendorEmail,
        name: params.vendorName || 'Vendor',
        status: 'pending'
      });
    }
    if (wo.tenant_email) {
      attendees.push({
        email: wo.tenant_email,
        name: wo.tenant_name,
        status: 'pending'
      });
    }
    
    const event = await this.createEvent({
      organizationId,
      userId: 'system',
      title: `🔧 ${isUrgent ? '⚠️ URGENT: ' : ''}Maintenance - ${wo.unit_number || address.substring(0, 30)}`,
      description: `
Work Order ID: ${params.workOrderId}
Property: ${address}
Unit: ${wo.unit_number || 'N/A'}
Priority: ${wo.priority}

Description:
${wo.description}

${params.vendorName ? `Assigned Vendor: ${params.vendorName}` : 'Vendor: TBD'}
Tenant Contact: ${wo.tenant_name} (${wo.tenant_email || 'No email'})
      `.trim(),
      eventType: 'inspection', // Using inspection for maintenance visits
      location: address,
      locationType: 'in_person',
      startTime: params.scheduledStart,
      endTime: params.scheduledEnd,
      attendees,
      reminders: isUrgent
        ? [
            { minutesBefore: 60, type: 'push' },
            { minutesBefore: 30, type: 'sms' },
          ]
        : [
            { minutesBefore: 1440, type: 'email' }, // 24 hours before
            { minutesBefore: 60, type: 'push' },
          ],
      color: isUrgent ? '#dc2626' : '#f97316', // Red for urgent, orange for normal
      metadata: {
        type: 'maintenance',
        workOrderId: params.workOrderId,
        requestId: wo.request_id,
        vendorId: params.vendorId,
        priority: wo.priority,
      },
    });
    
    // Update work order with calendar event ID and scheduled date
    await pool.query(
      `UPDATE maintenance_work_orders 
       SET calendar_event_id = $1, scheduled_date = $2, updated_at = NOW()
       WHERE id = $3`,
      [event.id, params.scheduledStart, params.workOrderId]
    );
    
    logger.info('Maintenance work order scheduled', {
      workOrderId: params.workOrderId,
      eventId: event.id,
      scheduledStart: params.scheduledStart,
    });
    
    return event;
  }
  
  /**
   * Reschedule maintenance work order
   */
  async rescheduleMaintenanceWork(
    organizationId: string,
    workOrderId: string,
    newStart: Date,
    newEnd: Date,
    reason?: string
  ): Promise<CalendarEvent | null> {
    // Get existing calendar event ID
    const result = await pool.query(
      `SELECT calendar_event_id FROM maintenance_work_orders WHERE id = $1`,
      [workOrderId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].calendar_event_id) {
      return null;
    }
    
    const eventId = result.rows[0].calendar_event_id;
    
    // Get current event to append reschedule note
    const eventResult = await pool.query(
      `SELECT description FROM calendar_events WHERE id = $1`,
      [eventId]
    );
    
    let newDescription = eventResult.rows[0]?.description || '';
    if (reason) {
      newDescription += `\n\n📅 Rescheduled: ${reason}`;
    }
    
    // Update calendar event
    const updated = await this.updateEvent(eventId, {
      startTime: newStart,
      endTime: newEnd,
      description: newDescription,
    });
    
    // Update work order scheduled date
    await pool.query(
      `UPDATE maintenance_work_orders 
       SET scheduled_date = $1, updated_at = NOW()
       WHERE id = $2`,
      [newStart, workOrderId]
    );
    
    logger.info('Maintenance work order rescheduled', {
      workOrderId,
      eventId,
      newStart,
      reason,
    });
    
    return updated;
  }
  
  /**
   * Cancel maintenance calendar event
   */
  async cancelMaintenanceEvent(organizationId: string, workOrderId: string): Promise<boolean> {
    // Get and delete calendar event
    const result = await pool.query(
      `SELECT calendar_event_id FROM maintenance_work_orders WHERE id = $1`,
      [workOrderId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].calendar_event_id) {
      return false;
    }
    
    const eventId = result.rows[0].calendar_event_id;
    
    // Update event status to cancelled
    await this.updateEvent(eventId, { status: 'cancelled' });
    
    // Clear calendar event reference from work order
    await pool.query(
      `UPDATE maintenance_work_orders 
       SET calendar_event_id = NULL, updated_at = NOW()
       WHERE id = $1`,
      [workOrderId]
    );
    
    logger.info('Maintenance calendar event cancelled', { workOrderId, eventId });
    
    return true;
  }
  
  /**
   * Get maintenance schedule for a date range
   */
  async getMaintenanceSchedule(
    organizationId: string,
    filters: {
      startDate: Date;
      endDate: Date;
      propertyId?: string;
      vendorId?: string;
    }
  ): Promise<CalendarEvent[]> {
    let query = `
      SELECT ce.*, wo.id as work_order_id, wo.priority, wo.status as work_order_status
      FROM calendar_events ce
      JOIN maintenance_work_orders wo ON ce.metadata->>'workOrderId' = wo.id::text
      WHERE ce.organization_id = $1
        AND ce.start_time >= $2
        AND ce.end_time <= $3
        AND ce.status != 'cancelled'
        AND ce.metadata->>'type' = 'maintenance'
    `;
    
    const params: unknown[] = [organizationId, filters.startDate, filters.endDate];
    let paramIndex = 4;
    
    if (filters.propertyId) {
      query += ` AND ce.property_id = $${paramIndex}`;
      params.push(filters.propertyId);
      paramIndex++;
    }
    
    if (filters.vendorId) {
      query += ` AND ce.metadata->>'vendorId' = $${paramIndex}`;
      params.push(filters.vendorId);
      paramIndex++;
    }
    
    query += ` ORDER BY ce.start_time ASC`;
    
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      ...this.mapRowToEvent(row),
      metadata: {
        ...this.mapRowToEvent(row).metadata,
        workOrderId: row.work_order_id,
        priority: row.priority,
        workOrderStatus: row.work_order_status,
      },
    }));
  }
  
  /**
   * Get vendor availability for a specific date
   */
  async getVendorAvailability(
    vendorId: string,
    date: Date,
    durationMinutes: number = 60
  ): Promise<AvailableSlot[]> {
    // Get vendor's existing appointments for the date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const busyResult = await pool.query(
      `SELECT start_time, end_time
       FROM calendar_events ce
       JOIN maintenance_work_orders wo ON ce.metadata->>'workOrderId' = wo.id::text
       WHERE ce.metadata->>'vendorId' = $1
         AND ce.start_time >= $2
         AND ce.end_time <= $3
         AND ce.status != 'cancelled'
       ORDER BY start_time`,
      [vendorId, startOfDay, endOfDay]
    );
    
    const busySlots = busyResult.rows.map(row => ({
      start: new Date(row.start_time),
      end: new Date(row.end_time),
    }));
    
    // Generate available slots (8 AM to 6 PM, excluding busy periods)
    const availableSlots: AvailableSlot[] = [];
    const workdayStart = new Date(date);
    workdayStart.setHours(8, 0, 0, 0);
    const workdayEnd = new Date(date);
    workdayEnd.setHours(18, 0, 0, 0);
    
    let currentSlotStart = new Date(workdayStart);
    
    while (currentSlotStart < workdayEnd) {
      const slotEnd = new Date(currentSlotStart.getTime() + durationMinutes * 60 * 1000);
      
      // Check if slot overlaps with any busy period
      const isAvailable = !busySlots.some(busy => 
        (currentSlotStart < busy.end && slotEnd > busy.start)
      );
      
      if (isAvailable && slotEnd <= workdayEnd) {
        availableSlots.push({
          startTime: new Date(currentSlotStart),
          endTime: new Date(slotEnd),
          agentId: vendorId,
        });
      }
      
      // Move to next slot (30-minute intervals)
      currentSlotStart = new Date(currentSlotStart.getTime() + 30 * 60 * 1000);
    }
    
    return availableSlots;
  }
  
  // ==========================================================================
  // LEASE CALENDAR EVENTS
  // ==========================================================================
  
  /**
   * Create lease lifecycle events (start, end, renewal reminder)
   */
  async createLeaseEvents(organizationId: string, tenancyId: string): Promise<CalendarEvent[]> {
    // Get tenancy details
    const result = await pool.query(`
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
      throw new Error('Tenancy not found');
    }
    
    const tenancy = result.rows[0];
    const address = `${tenancy.address_street}, ${tenancy.address_city}`;
    const events: CalendarEvent[] = [];
    
    // Lease Start Event
    const startTime = new Date(tenancy.start_date);
    startTime.setHours(9, 0, 0, 0);
    const startEndTime = new Date(startTime);
    startEndTime.setHours(10, 0, 0, 0);
    
    events.push(await this.createEvent({
      organizationId,
      userId: 'system',
      title: `🔑 Lease Start: ${tenancy.tenant_name} - ${tenancy.unit_number}`,
      description: `
Lease begins for ${tenancy.tenant_name}
Property: ${address}
Unit: ${tenancy.unit_number}
      `.trim(),
      eventType: 'milestone',
      location: address,
      startTime,
      endTime: startEndTime,
      attendees: tenancy.tenant_email ? [{
        email: tenancy.tenant_email,
        name: tenancy.tenant_name,
        status: 'pending'
      }] : [],
      color: '#22c55e', // Green
      metadata: { type: 'lease_start', tenancyId },
    }));
    
    // Lease End Event
    const endTime = new Date(tenancy.end_date);
    endTime.setHours(9, 0, 0, 0);
    const endEndTime = new Date(endTime);
    endEndTime.setHours(10, 0, 0, 0);
    
    events.push(await this.createEvent({
      organizationId,
      userId: 'system',
      title: `📋 Lease End: ${tenancy.tenant_name} - ${tenancy.unit_number}`,
      description: `
Lease ends for ${tenancy.tenant_name}
Property: ${address}
Unit: ${tenancy.unit_number}

Action Required: Discuss renewal or coordinate move-out
      `.trim(),
      eventType: 'deadline',
      location: address,
      startTime: endTime,
      endTime: endEndTime,
      attendees: tenancy.tenant_email ? [{
        email: tenancy.tenant_email,
        name: tenancy.tenant_name,
        status: 'pending'
      }] : [],
      reminders: [
        { minutesBefore: 7 * 24 * 60, type: 'email' }, // 7 days before
        { minutesBefore: 24 * 60, type: 'push' },
      ],
      color: '#ef4444', // Red
      metadata: { type: 'lease_end', tenancyId },
    }));
    
    // Renewal Reminder (60 days before end)
    const renewalDate = new Date(tenancy.end_date);
    renewalDate.setDate(renewalDate.getDate() - 60);
    renewalDate.setHours(9, 0, 0, 0);
    const renewalEndTime = new Date(renewalDate);
    renewalEndTime.setHours(9, 30, 0, 0);
    
    if (renewalDate > new Date()) {
      events.push(await this.createEvent({
        organizationId,
        userId: 'system',
        title: `⏰ Renewal Reminder: ${tenancy.tenant_name}`,
        description: `
Lease renewal reminder for ${tenancy.tenant_name}
Lease expires: ${new Date(tenancy.end_date).toLocaleDateString()}
Unit: ${tenancy.unit_number}

Contact tenant to discuss renewal options.
        `.trim(),
        eventType: 'reminder',
        startTime: renewalDate,
        endTime: renewalEndTime,
        reminders: [
          { minutesBefore: 0, type: 'email' },
        ],
        color: '#eab308', // Yellow
        metadata: { type: 'lease_renewal', tenancyId },
      }));
    }
    
    logger.info('Lease calendar events created', { tenancyId, eventCount: events.length });
    
    return events;
  }
  
  /**
   * Create recurring rent payment reminders
   */
  async createPaymentReminders(
    organizationId: string,
    tenancyId: string,
    rentDueDay: number = 1
  ): Promise<CalendarEvent> {
    const result = await pool.query(`
      SELECT 
        t.id, t.start_date, t.end_date, t.rent_amount, t.rent_currency,
        ten.full_name, ten.email
      FROM tenancies t
      JOIN tenants ten ON t.tenant_id = ten.id
      WHERE t.id = $1
    `, [tenancyId]);
    
    if (result.rows.length === 0) {
      throw new Error('Tenancy not found');
    }
    
    const tenancy = result.rows[0];
    
    // Set start date to first rent due day
    const startDate = new Date(tenancy.start_date);
    startDate.setDate(rentDueDay);
    if (startDate < new Date(tenancy.start_date)) {
      startDate.setMonth(startDate.getMonth() + 1);
    }
    startDate.setHours(9, 0, 0, 0);
    
    const startEndTime = new Date(startDate);
    startEndTime.setHours(9, 30, 0, 0);
    
    const endDate = new Date(tenancy.end_date);
    
    // Create recurring event
    const event = await this.createEvent({
      organizationId,
      userId: 'system',
      title: `💰 Rent Due: ${tenancy.rent_currency} ${Number(tenancy.rent_amount).toLocaleString()}`,
      description: `
Monthly rent payment reminder for ${tenancy.full_name}
Amount: ${tenancy.rent_currency} ${Number(tenancy.rent_amount).toLocaleString()}
      `.trim(),
      eventType: 'reminder',
      startTime: startDate,
      endTime: startEndTime,
      isRecurring: true,
      recurrenceRule: `FREQ=MONTHLY;BYMONTHDAY=${rentDueDay}`,
      recurrenceEndDate: endDate,
      attendees: tenancy.email ? [{
        email: tenancy.email,
        name: tenancy.full_name,
        status: 'pending'
      }] : [],
      reminders: [
        { minutesBefore: 3 * 24 * 60, type: 'email' }, // 3 days before
        { minutesBefore: 24 * 60, type: 'push' }, // 1 day before
        { minutesBefore: 0, type: 'push' }, // On the day
      ],
      color: '#3b82f6', // Blue
      metadata: { type: 'payment_reminder', tenancyId },
    });
    
    logger.info('Payment reminder created', { tenancyId, rentDueDay });
    
    return event;
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private mapRowToEvent(row: Record<string, unknown>): CalendarEvent {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      userId: row.user_id as string,
      title: row.title as string,
      description: row.description as string | undefined,
      eventType: row.event_type as CalendarEvent['eventType'],
      location: row.location as string | undefined,
      locationType: row.location_type as CalendarEvent['locationType'],
      startTime: new Date(row.start_time as string),
      endTime: new Date(row.end_time as string),
      allDay: row.all_day as boolean,
      timezone: row.timezone as string,
      isRecurring: row.is_recurring as boolean,
      recurrenceRule: row.recurrence_rule as string | undefined,
      dealId: row.deal_id as string | undefined,
      contactId: row.contact_id as string | undefined,
      propertyId: row.property_id as string | undefined,
      taskId: row.task_id as string | undefined,
      attendees: row.attendees as Attendee[],
      googleEventId: row.google_event_id as string | undefined,
      outlookEventId: row.outlook_event_id as string | undefined,
      reminders: row.reminders as Reminder[],
      status: row.status as CalendarEvent['status'],
      color: row.color as string | undefined,
      metadata: {
        ...(row.metadata as Record<string, unknown> || {}),
        dealTitle: row.deal_title,
        contactName: row.contact_name,
      },
    };
  }
  
  private mapRowToAvailability(row: Record<string, unknown>): ViewingAvailability {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      propertyId: row.property_id as string,
      agentId: row.agent_id as string,
      dayOfWeek: row.day_of_week as number | undefined,
      startTime: row.start_time as string,
      endTime: row.end_time as string,
      slotDurationMinutes: row.slot_duration_minutes as number,
      maxSlots: row.max_slots as number,
      specificDate: row.specific_date ? new Date(row.specific_date as string) : undefined,
      isActive: row.is_active as boolean,
    };
  }
  
  private mapRowToBooking(row: Record<string, unknown>): ViewingBooking {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      propertyId: row.property_id as string,
      contactId: row.contact_id as string,
      agentId: row.agent_id as string,
      dealId: row.deal_id as string | undefined,
      scheduledAt: new Date(row.scheduled_at as string),
      durationMinutes: row.duration_minutes as number,
      status: row.status as ViewingBooking['status'],
      contactName: row.contact_name as string | undefined,
      contactPhone: row.contact_phone as string | undefined,
      contactEmail: row.contact_email as string | undefined,
      notes: row.notes as string | undefined,
      agentNotes: row.agent_notes as string | undefined,
    };
  }
}

export const calendarService = new CalendarService();
export default calendarService;
