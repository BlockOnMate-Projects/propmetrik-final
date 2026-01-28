/**
 * Real-time Event Emitter Service
 * Manages SSE connections and broadcasts events to connected clients
 * 
 * SHARED SERVICE: Used across all domains (CRM, Projects, Property, etc.)
 */

import { EventEmitter } from 'events';
import { Response } from 'express';
import { pool } from '../../src/database';
import { logger } from '../../src/utils/logger';

// Increase max listeners for high concurrency
EventEmitter.defaultMaxListeners = 100;

// Event types
export enum RealtimeEventType {
  // Connection events
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',

  // Deal events (CRM)
  DEAL_CREATED = 'deal.created',
  DEAL_UPDATED = 'deal.updated',
  DEAL_STAGE_CHANGED = 'deal.stage_changed',
  DEAL_DELETED = 'deal.deleted',
  DEAL_ASSIGNED = 'deal.assigned',
  
  // Activity events (CRM)
  ACTIVITY_CREATED = 'activity.created',
  ACTIVITY_UPDATED = 'activity.updated',
  ACTIVITY_DELETED = 'activity.deleted',
  
  // Task events (CRM/Projects)
  TASK_CREATED = 'task.created',
  TASK_UPDATED = 'task.updated',
  TASK_COMPLETED = 'task.completed',
  TASK_DELETED = 'task.deleted',
  
  // Contact events (CRM)
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  
  // Property events
  PROPERTY_CREATED = 'property.created',
  PROPERTY_UPDATED = 'property.updated',
  
  // Project events (Project Management)
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_DELETED = 'project.deleted',
  PROJECT_STATUS_CHANGED = 'project.status_changed',
  PHASE_UPDATED = 'phase.updated',
  PHASE_RESCHEDULED = 'phase.rescheduled',
  PHASE_PROGRESS_CHANGED = 'phase.progress_changed',
  UNIT_UPDATED = 'unit.updated',
  
  // Milestone events
  MILESTONE_COMPLETED = 'milestone.completed',
  MILESTONE_MISSED = 'milestone.missed',
  
  // Budget events
  BUDGET_UPDATED = 'budget.updated',
  BUDGET_THRESHOLD_EXCEEDED = 'budget.threshold_exceeded',
  
  // Alert events
  ALERT_CREATED = 'alert.created',
  ALERT_RESOLVED = 'alert.resolved',
  
  // Dashboard events
  METRICS_UPDATED = 'metrics.updated',
  DASHBOARD_REFRESH = 'dashboard.refresh',
  
  // Presence events
  PRESENCE_JOINED = 'presence.joined',
  PRESENCE_LEFT = 'presence.left',
  PRESENCE_UPDATE = 'presence.update',
  
  // Document events
  DOCUMENT_SIGNED = 'document.signed',
  DOCUMENT_UPLOADED = 'document.uploaded',
  
  // Notification events
  NOTIFICATION = 'notification',
  
  // Calendar events
  CALENDAR_EVENT_CREATED = 'calendar.event_created',
  CALENDAR_EVENT_UPDATED = 'calendar.event_updated',
  CALENDAR_EVENT_DELETED = 'calendar.event_deleted',
  
  // Viewing events
  VIEWING_BOOKED = 'viewing.booked',
  VIEWING_CONFIRMED = 'viewing.confirmed',
  VIEWING_CANCELLED = 'viewing.cancelled',
  
  // Maintenance/Work Order events
  WORK_ORDER_CREATED = 'work_order.created',
  WORK_ORDER_UPDATED = 'work_order.updated',
  WORK_ORDER_COMPLETED = 'work_order.completed',
  MAINTENANCE_REQUEST_CREATED = 'maintenance.request_created',
  MAINTENANCE_REQUEST_UPDATED = 'maintenance.request_updated',
}

// Client connection interface
interface SSEClient {
  id: string;
  userId: string;
  organizationId: string;
  response: Response;
  subscribedChannels: Set<string>;
  connectedAt: Date;
  lastPing: Date;
}

// Event payload interface
export interface RealtimeEvent {
  type: RealtimeEventType | string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  userId?: string;
  organizationId: string;
  timestamp?: Date;
}

class RealtimeEventEmitter extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.startHeartbeat();
    this.startCleanup();
  }
  
  /**
   * Add a new SSE client connection
   */
  addClient(
    clientId: string,
    userId: string,
    organizationId: string,
    response: Response
  ): void {
    // Set SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    response.flushHeaders();
    
    const client: SSEClient = {
      id: clientId,
      userId,
      organizationId,
      response,
      subscribedChannels: new Set(['global', `org:${organizationId}`, `user:${userId}`]),
      connectedAt: new Date(),
      lastPing: new Date(),
    };
    
    this.clients.set(clientId, client);
    
    // Send initial connection event
    this.sendToClient(client, {
      type: 'connected',
      payload: { clientId, timestamp: new Date().toISOString() },
      organizationId,
    });
    
    logger.info('SSE client connected', {
      clientId,
      userId,
      organizationId,
      totalClients: this.clients.size,
    });
    
    // Handle client disconnect
    response.on('close', () => {
      this.removeClient(clientId);
    });
  }
  
  /**
   * Remove a client connection
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info('SSE client disconnected', {
        clientId,
        userId: client.userId,
        totalClients: this.clients.size,
      });
    }
  }
  
  /**
   * Subscribe client to a specific channel
   */
  subscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscribedChannels.add(channel);
      logger.debug('Client subscribed to channel', { clientId, channel });
    }
  }
  
  /**
   * Unsubscribe client from a channel
   */
  unsubscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscribedChannels.delete(channel);
      logger.debug('Client unsubscribed from channel', { clientId, channel });
    }
  }
  
  /**
   * Broadcast event to all clients in an organization
   */
  async broadcast(event: RealtimeEvent): Promise<void> {
    const timestamp = event.timestamp || new Date();
    const eventWithTimestamp = { ...event, timestamp: timestamp.toISOString() };
    
    // Log event to database for replay
    await this.logEvent(event);
    
    // Determine which channels to broadcast to
    const channels = new Set<string>();
    channels.add(`org:${event.organizationId}`);
    
    if (event.entityType && event.entityId) {
      channels.add(`${event.entityType}:${event.entityId}`);
    }
    
    // Send to all matching clients
    let sentCount = 0;
    for (const client of this.clients.values()) {
      if (client.organizationId !== event.organizationId) continue;
      
      // Check if client is subscribed to any of the channels
      const hasSubscription = Array.from(channels).some(ch => 
        client.subscribedChannels.has(ch)
      );
      
      if (hasSubscription || client.subscribedChannels.has(`org:${event.organizationId}`)) {
        this.sendToClient(client, eventWithTimestamp);
        sentCount++;
      }
    }
    
    logger.debug('Broadcast event sent', {
      eventType: event.type,
      organizationId: event.organizationId,
      clientsSent: sentCount,
    });
  }
  
  /**
   * Send event to specific user(s)
   */
  sendToUser(userId: string, event: RealtimeEvent): void {
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        this.sendToClient(client, { ...event, timestamp: new Date().toISOString() });
      }
    }
  }
  
  /**
   * Send event to a specific client
   */
  private sendToClient(client: SSEClient, event: RealtimeEvent | Record<string, unknown>): void {
    try {
      const data = JSON.stringify(event);
      client.response.write(`event: ${(event as RealtimeEvent).type || 'message'}\n`);
      client.response.write(`data: ${data}\n\n`);
    } catch (error) {
      logger.error('Failed to send SSE event', {
        clientId: client.id,
        error: (error as Error).message,
      });
      this.removeClient(client.id);
    }
  }
  
  /**
   * Log event to database
   */
  private async logEvent(event: RealtimeEvent): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO realtime_events (organization_id, event_type, entity_type, entity_id, payload, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.organizationId,
          event.type,
          event.entityType || null,
          event.entityId || null,
          JSON.stringify(event.payload),
          event.userId || null,
        ]
      );
    } catch (error) {
      logger.error('Failed to log realtime event', {
        error: (error as Error).message,
        eventType: event.type,
      });
    }
  }
  
  /**
   * Get recent events for replay (when client reconnects)
   */
  async getRecentEvents(
    organizationId: string,
    since: Date,
    limit = 100
  ): Promise<RealtimeEvent[]> {
    const result = await pool.query(
      `SELECT id, event_type, entity_type, entity_id, payload, user_id, created_at
       FROM realtime_events
       WHERE organization_id = $1 AND created_at > $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [organizationId, since, limit]
    );
    
    return result.rows.map(row => ({
      type: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: row.payload,
      userId: row.user_id,
      organizationId,
      timestamp: row.created_at,
    }));
  }
  
  /**
   * Get current presence for a resource
   */
  async getPresence(
    resourceType: string,
    resourceId: string
  ): Promise<Array<{ userId: string; action: string; userInfo: Record<string, unknown> }>> {
    const result = await pool.query(
      `SELECT user_id, action, user_info, last_activity_at
       FROM user_presence
       WHERE resource_type = $1 AND resource_id = $2 AND expires_at > NOW()
       ORDER BY last_activity_at DESC`,
      [resourceType, resourceId]
    );
    
    return result.rows.map(row => ({
      userId: row.user_id,
      action: row.action,
      userInfo: row.user_info,
      lastActivity: row.last_activity_at,
    }));
  }
  
  /**
   * Update user presence
   */
  async updatePresence(
    userId: string,
    organizationId: string,
    sessionId: string,
    resourceType: string,
    resourceId: string,
    action: string = 'viewing',
    userInfo: Record<string, unknown> = {}
  ): Promise<void> {
    await pool.query(
      `INSERT INTO user_presence (user_id, organization_id, session_id, resource_type, resource_id, action, user_info, last_activity_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_id, session_id, resource_type, resource_id)
       DO UPDATE SET action = EXCLUDED.action, user_info = EXCLUDED.user_info, last_activity_at = NOW(), expires_at = NOW() + INTERVAL '5 minutes'`,
      [userId, organizationId, sessionId, resourceType, resourceId, action, JSON.stringify(userInfo)]
    );
    
    // Broadcast presence update
    await this.broadcast({
      type: RealtimeEventType.PRESENCE_UPDATE,
      entityType: resourceType,
      entityId: resourceId,
      payload: { userId, action, userInfo },
      organizationId,
    });
  }
  
  /**
   * Remove user presence
   */
  async removePresence(
    userId: string,
    sessionId: string,
    resourceType: string,
    resourceId: string
  ): Promise<string | null> {
    const result = await pool.query(
      `DELETE FROM user_presence
       WHERE user_id = $1 AND session_id = $2 AND resource_type = $3 AND resource_id = $4
       RETURNING organization_id`,
      [userId, sessionId, resourceType, resourceId]
    );
    
    if (result.rows.length > 0) {
      // Broadcast presence left
      await this.broadcast({
        type: RealtimeEventType.PRESENCE_LEFT,
        entityType: resourceType,
        entityId: resourceId,
        payload: { userId },
        organizationId: result.rows[0].organization_id,
      });
    }
    
    return result.rows[0]?.organization_id || null;
  }
  
  /**
   * Heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      for (const client of this.clients.values()) {
        try {
          client.response.write(`: heartbeat ${now.toISOString()}\n\n`);
          client.lastPing = now;
        } catch {
          this.removeClient(client.id);
        }
      }
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Cleanup expired presence and old events
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await pool.query('SELECT cleanup_expired_presence()');
        await pool.query('SELECT cleanup_old_realtime_events()');
      } catch (error) {
        logger.error('Cleanup failed', { error: (error as Error).message });
      }
    }, 60000); // Every minute
  }
  
  /**
   * Get connection stats
   */
  getStats(): { totalClients: number; clientsByOrg: Record<string, number> } {
    const clientsByOrg: Record<string, number> = {};
    
    for (const client of this.clients.values()) {
      clientsByOrg[client.organizationId] = (clientsByOrg[client.organizationId] || 0) + 1;
    }
    
    return {
      totalClients: this.clients.size,
      clientsByOrg,
    };
  }
  
  /**
   * Shutdown gracefully
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Close all client connections
    for (const client of this.clients.values()) {
      try {
        client.response.end();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.clients.clear();
    
    logger.info('Realtime event emitter shutdown complete');
  }
}

// Export singleton instance
export const realtimeEmitter = new RealtimeEventEmitter();

// Helper function to emit deal events
export function emitDealEvent(
  eventType: RealtimeEventType,
  dealId: string,
  organizationId: string,
  payload: Record<string, unknown>,
  userId?: string
): void {
  realtimeEmitter.broadcast({
    type: eventType,
    entityType: 'deal',
    entityId: dealId,
    payload,
    organizationId,
    userId,
  });
}

// Helper function to emit activity events
export function emitActivityEvent(
  eventType: RealtimeEventType,
  activityId: string,
  organizationId: string,
  payload: Record<string, unknown>,
  userId?: string
): void {
  realtimeEmitter.broadcast({
    type: eventType,
    entityType: 'activity',
    entityId: activityId,
    payload,
    organizationId,
    userId,
  });
}

// Helper function to emit task events
export function emitTaskEvent(
  eventType: RealtimeEventType,
  taskId: string,
  organizationId: string,
  payload: Record<string, unknown>,
  userId?: string
): void {
  realtimeEmitter.broadcast({
    type: eventType,
    entityType: 'task',
    entityId: taskId,
    payload,
    organizationId,
    userId,
  });
}

// Helper function to emit project events
export function emitProjectEvent(
  eventType: RealtimeEventType,
  projectId: string,
  organizationId: string,
  payload: Record<string, unknown>,
  userId?: string
): void {
  realtimeEmitter.broadcast({
    type: eventType,
    entityType: 'project',
    entityId: projectId,
    payload,
    organizationId,
    userId,
  });
}

export default realtimeEmitter;
