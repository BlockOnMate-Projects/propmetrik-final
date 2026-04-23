/**
 * Calendar Routes
 * Handles calendar events, viewing scheduling, and availability
 * Phase 5.11: Real-time & Calendar Features
 */

import { Router, Request, Response } from 'express';
import { calendarService } from '../../shared-services/calendar';
import { realtimeEmitter, RealtimeEventType } from '../../shared-services/realtime';
import { logger } from '../utils/logger';
import { registerPMParamValidation, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { createCalendarEventSchema, updateCalendarEventSchema } from '../middleware/pmProjectValidation';

const router = Router();

// Register UUID parameter validation
registerPMParamValidation(router);

// Middleware to get user context from authenticated request (no header fallback)
const getUserContext = (req: Request) => {
  const user = (req as any).user;
  const userId = user?.id || user?.sub;
  const organizationId = user?.organizationId || user?.organization_id;
  if (!userId) throw new Error('User ID required — authentication missing');
  if (!organizationId) throw new Error('Organization ID required — authentication missing');
  return { userId, organizationId };
};

// =============================================================================
// CALENDAR EVENTS
// =============================================================================

/**
 * @route GET /api/v1/calendar/events
 * @desc Get calendar events for a date range
 * @access Private
 */
router.get('/events', async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const {
      start,
      end,
      user,
      eventType,
      dealId,
      contactId,
      propertyId,
      service,
    } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'start and end dates are required',
      });
    }
    
    const events = await calendarService.getEvents(
      organizationId,
      new Date(start as string),
      new Date(end as string),
      {
        userId: user as string || undefined,
        eventType: eventType as string || undefined,
        dealId: dealId as string || undefined,
        contactId: contactId as string || undefined,
        propertyId: propertyId as string || undefined,
        service: service as string || undefined,
      }
    );
    
    res.json({
      success: true,
      data: events,
      meta: { count: events.length },
    });
  } catch (error) {
    logger.error('Failed to get calendar events', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get calendar events' });
  }
});

/**
 * @route GET /api/v1/calendar/events/upcoming
 * @desc Get upcoming events for the current user
 * @access Private
 */
router.get('/events/upcoming', async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const limit = parseInt(req.query.limit as string) || 10;
    
    const events = await calendarService.getUpcomingEvents(userId, organizationId, limit);
    
    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    logger.error('Failed to get upcoming events', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get upcoming events' });
  }
});

/**
 * @route GET /api/v1/calendar/events/:eventId
 * @desc Get a single calendar event
 * @access Private
 */
router.get('/events/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const event = await calendarService.getEventById(eventId);
    
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    
    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Failed to get calendar event', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get calendar event' });
  }
});

/**
 * @route POST /api/v1/calendar/events
 * @desc Create a calendar event
 * @access Private
 */
router.post('/events', requirePMWrite, validate(createCalendarEventSchema), async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const eventData = {
      ...req.body,
      organizationId,
      userId: req.body.userId || userId,
      // Map snake_case schema fields to camelCase service fields
      startTime: req.body.startTime || req.body.start,
      endTime: req.body.endTime || req.body.end,
      eventType: req.body.eventType || req.body.event_type,
    };
    
    const event = await calendarService.createEvent(eventData);
    
    // Broadcast real-time event
    await realtimeEmitter.broadcast({
      type: RealtimeEventType.CALENDAR_EVENT_CREATED,
      entityType: 'calendar_event',
      entityId: event.id,
      payload: event as unknown as Record<string, unknown>,
      organizationId,
      userId,
    });
    
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    logger.error('Failed to create calendar event', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to create calendar event' });
  }
});

/**
 * @route PATCH /api/v1/calendar/events/:eventId
 * @desc Update a calendar event
 * @access Private
 */
router.patch('/events/:eventId', requirePMWrite, validate(updateCalendarEventSchema), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { organizationId, userId } = getUserContext(req);
    
    const event = await calendarService.updateEvent(eventId, req.body);
    
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    
    // Broadcast real-time event
    await realtimeEmitter.broadcast({
      type: RealtimeEventType.CALENDAR_EVENT_UPDATED,
      entityType: 'calendar_event',
      entityId: eventId,
      payload: event as unknown as Record<string, unknown>,
      organizationId,
      userId,
    });
    
    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Failed to update calendar event', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to update calendar event' });
  }
});

/**
 * @route DELETE /api/v1/calendar/events/:eventId
 * @desc Delete a calendar event
 * @access Private
 */
router.delete('/events/:eventId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { organizationId, userId } = getUserContext(req);
    
    const deleted = await calendarService.deleteEvent(eventId);
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    
    // Broadcast real-time event
    await realtimeEmitter.broadcast({
      type: RealtimeEventType.CALENDAR_EVENT_DELETED,
      entityType: 'calendar_event',
      entityId: eventId,
      payload: { id: eventId },
      organizationId,
      userId,
    });
    
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    logger.error('Failed to delete calendar event', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to delete calendar event' });
  }
});

/**
 * @route POST /api/v1/calendar/events/from-task/:taskId
 * @desc Create a calendar event from a CRM task
 * @access Private
 */
router.post('/events/from-task/:taskId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { organizationId, userId } = getUserContext(req);
    
    const event = await calendarService.createEventFromTask(taskId, organizationId, userId);
    
    if (!event) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    logger.error('Failed to create event from task', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to create event from task' });
  }
});

// =============================================================================
// VIEWING AVAILABILITY
// =============================================================================

/**
 * @route GET /api/v1/calendar/availability/:propertyId
 * @desc Get viewing availability for a property
 * @access Private
 */
router.get('/availability/:propertyId', async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const availability = await calendarService.getViewingAvailability(propertyId);
    
    res.json({ success: true, data: availability });
  } catch (error) {
    logger.error('Failed to get viewing availability', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get viewing availability' });
  }
});

/**
 * @route POST /api/v1/calendar/availability
 * @desc Set viewing availability for a property
 * @access Private
 */
router.post('/availability', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const availabilityData = {
      ...req.body,
      organizationId,
      agentId: req.body.agentId || userId,
    };
    
    const availability = await calendarService.setViewingAvailability(availabilityData);
    
    res.status(201).json({ success: true, data: availability });
  } catch (error) {
    logger.error('Failed to set viewing availability', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to set viewing availability' });
  }
});

/**
 * @route DELETE /api/v1/calendar/availability/:availabilityId
 * @desc Delete viewing availability
 * @access Private
 */
router.delete('/availability/:availabilityId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { availabilityId } = req.params;
    const deleted = await calendarService.deleteViewingAvailability(availabilityId);
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Availability not found' });
    }
    
    res.json({ success: true, message: 'Availability deleted' });
  } catch (error) {
    logger.error('Failed to delete viewing availability', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to delete viewing availability' });
  }
});

/**
 * @route GET /api/v1/calendar/slots/:propertyId
 * @desc Get available viewing slots for a property on a given date
 * @access Private
 */
router.get('/slots/:propertyId', async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date query parameter is required',
      });
    }
    
    const slots = await calendarService.getAvailableSlots(propertyId, new Date(date as string));
    
    res.json({ success: true, data: slots });
  } catch (error) {
    logger.error('Failed to get available slots', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get available slots' });
  }
});

// =============================================================================
// VIEWING BOOKINGS
// =============================================================================

/**
 * @route GET /api/v1/calendar/viewings
 * @desc Get viewing bookings with filters
 * @access Private
 */
router.get('/viewings', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const {
      propertyId,
      agentId,
      contactId,
      dealId,
      status,
      startDate,
      endDate,
    } = req.query;
    
    const bookings = await calendarService.getViewingBookings(organizationId, {
      propertyId: propertyId as string || undefined,
      agentId: agentId as string || undefined,
      contactId: contactId as string || undefined,
      dealId: dealId as string || undefined,
      status: status as string || undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });
    
    res.json({
      success: true,
      data: bookings,
      meta: { count: bookings.length },
    });
  } catch (error) {
    logger.error('Failed to get viewing bookings', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get viewing bookings' });
  }
});

/**
 * @route POST /api/v1/calendar/viewings
 * @desc Book a property viewing
 * @access Private
 */
router.post('/viewings', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const bookingData = {
      ...req.body,
      organizationId,
      agentId: req.body.agentId || userId,
    };
    
    const booking = await calendarService.bookViewing(bookingData);
    
    // Broadcast real-time event
    await realtimeEmitter.broadcast({
      type: RealtimeEventType.VIEWING_BOOKED,
      entityType: 'viewing',
      entityId: booking.id,
      payload: booking as unknown as Record<string, unknown>,
      organizationId,
      userId,
    });
    
    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    logger.error('Failed to book viewing', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to book viewing' });
  }
});

/**
 * @route PATCH /api/v1/calendar/viewings/:bookingId/status
 * @desc Update viewing booking status
 * @access Private
 */
router.patch('/viewings/:bookingId/status', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { status, agentNotes, cancellationReason } = req.body;
    const { organizationId, userId } = getUserContext(req);
    
    const booking = await calendarService.updateBookingStatus(
      bookingId,
      status,
      agentNotes,
      status === 'cancelled' ? userId : undefined,
      cancellationReason
    );
    
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    
    // Broadcast appropriate event
    const eventType = status === 'confirmed' ? RealtimeEventType.VIEWING_CONFIRMED :
                      status === 'cancelled' ? RealtimeEventType.VIEWING_CANCELLED :
                      'viewing.updated';
    
    await realtimeEmitter.broadcast({
      type: eventType,
      entityType: 'viewing',
      entityId: bookingId,
      payload: booking as unknown as Record<string, unknown>,
      organizationId,
      userId,
    });
    
    res.json({ success: true, data: booking });
  } catch (error) {
    logger.error('Failed to update viewing status', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to update viewing status' });
  }
});

// =============================================================================
// MAINTENANCE SCHEDULING
// =============================================================================

/**
 * @route POST /api/v1/calendar/maintenance/:workOrderId/schedule
 * @desc Schedule a maintenance work order
 * @access Private
 */
router.post('/maintenance/:workOrderId/schedule', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const { workOrderId } = req.params;
    const { scheduledStart, scheduledEnd, vendorName, vendorEmail, vendorId } = req.body;
    
    if (!scheduledStart || !scheduledEnd) {
      return res.status(400).json({
        success: false,
        error: 'scheduledStart and scheduledEnd are required',
      });
    }
    
    const event = await calendarService.scheduleMaintenanceWork(organizationId, {
      workOrderId,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      vendorId,
      vendorName,
      vendorEmail,
    });
    
    // Broadcast real-time event
    await realtimeEmitter.broadcast({
      type: RealtimeEventType.WORK_ORDER_UPDATED,
      entityType: 'work_order',
      entityId: workOrderId,
      payload: { 
        id: workOrderId, 
        calendarEventId: event.id,
        scheduledStart,
        scheduledEnd 
      },
      organizationId,
      userId,
    });
    
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    logger.error('Failed to schedule maintenance', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to schedule maintenance' });
  }
});

/**
 * @route PUT /api/v1/calendar/maintenance/:workOrderId/reschedule
 * @desc Reschedule a maintenance work order
 * @access Private
 */
router.put('/maintenance/:workOrderId/reschedule', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const { workOrderId } = req.params;
    const { newStart, newEnd, reason } = req.body;
    
    if (!newStart || !newEnd) {
      return res.status(400).json({
        success: false,
        error: 'newStart and newEnd are required',
      });
    }
    
    const event = await calendarService.rescheduleMaintenanceWork(
      organizationId,
      workOrderId,
      new Date(newStart),
      new Date(newEnd),
      reason
    );
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'No scheduled event found for this work order',
      });
    }
    
    // Broadcast real-time event
    await realtimeEmitter.broadcast({
      type: RealtimeEventType.WORK_ORDER_UPDATED,
      entityType: 'work_order',
      entityId: workOrderId,
      payload: { 
        id: workOrderId, 
        rescheduled: true,
        newStart,
        newEnd,
        reason 
      },
      organizationId,
      userId,
    });
    
    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Failed to reschedule maintenance', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to reschedule maintenance' });
  }
});

/**
 * @route DELETE /api/v1/calendar/maintenance/:workOrderId
 * @desc Cancel a maintenance calendar event
 * @access Private
 */
router.delete('/maintenance/:workOrderId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const { workOrderId } = req.params;
    
    await calendarService.cancelMaintenanceEvent(organizationId, workOrderId);
    
    // Broadcast real-time event
    await realtimeEmitter.broadcast({
      type: RealtimeEventType.WORK_ORDER_UPDATED,
      entityType: 'work_order',
      entityId: workOrderId,
      payload: { id: workOrderId, scheduleCancelled: true },
      organizationId,
      userId,
    });
    
    res.json({ success: true, message: 'Maintenance event cancelled' });
  } catch (error) {
    logger.error('Failed to cancel maintenance event', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to cancel maintenance event' });
  }
});

/**
 * @route GET /api/v1/calendar/maintenance/schedule
 * @desc Get scheduled maintenance work for a date range
 * @access Private
 */
router.get('/maintenance/schedule', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { startDate, endDate, propertyId, vendorId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }
    
    const events = await calendarService.getMaintenanceSchedule(organizationId, {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      propertyId: propertyId as string | undefined,
      vendorId: vendorId as string | undefined,
    });
    
    res.json({
      success: true,
      data: events,
      meta: { count: events.length },
    });
  } catch (error) {
    logger.error('Failed to get maintenance schedule', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get maintenance schedule' });
  }
});

/**
 * @route GET /api/v1/calendar/vendor/:vendorId/availability
 * @desc Get vendor availability for maintenance scheduling
 * @access Private
 */
router.get('/vendor/:vendorId/availability', async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    const { date, duration } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date is required',
      });
    }
    
    const slots = await calendarService.getVendorAvailability(
      vendorId,
      new Date(date as string),
      parseInt(duration as string) || 60
    );
    
    res.json({ success: true, data: slots });
  } catch (error) {
    logger.error('Failed to get vendor availability', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get vendor availability' });
  }
});

// =============================================================================
// LEASE CALENDAR EVENTS
// =============================================================================

/**
 * @route POST /api/v1/calendar/lease/:tenancyId/events
 * @desc Create lease lifecycle events (start, end, renewal reminder)
 * @access Private
 */
router.post('/lease/:tenancyId/events', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const { tenancyId } = req.params;
    
    const events = await calendarService.createLeaseEvents(organizationId, tenancyId);
    
    res.status(201).json({
      success: true,
      data: events,
      message: `Created ${events.length} lease calendar events`,
    });
  } catch (error) {
    logger.error('Failed to create lease events', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to create lease events' });
  }
});

/**
 * @route POST /api/v1/calendar/lease/:tenancyId/payment-reminders
 * @desc Create recurring rent payment reminders
 * @access Private
 */
router.post('/lease/:tenancyId/payment-reminders', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getUserContext(req);
    const { tenancyId } = req.params;
    const { rentDueDay } = req.body;
    
    const event = await calendarService.createPaymentReminders(
      organizationId,
      tenancyId,
      rentDueDay || 1
    );
    
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    logger.error('Failed to create payment reminders', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to create payment reminders' });
  }
});

export default router;
