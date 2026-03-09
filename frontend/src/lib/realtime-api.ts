/**
 * Real-time SSE Hook and API Client
 * Phase 5.11: Real-time & Calendar Features
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSession } from 'next-auth/react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const session = await getSession();
    const token = (session as any)?.accessToken;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Event types matching backend
export enum RealtimeEventType {
  // Deal events
  DEAL_CREATED = 'deal.created',
  DEAL_UPDATED = 'deal.updated',
  DEAL_STAGE_CHANGED = 'deal.stage_changed',
  DEAL_DELETED = 'deal.deleted',
  DEAL_ASSIGNED = 'deal.assigned',
  
  // Activity events
  ACTIVITY_CREATED = 'activity.created',
  ACTIVITY_UPDATED = 'activity.updated',
  ACTIVITY_DELETED = 'activity.deleted',
  
  // Task events
  TASK_CREATED = 'task.created',
  TASK_UPDATED = 'task.updated',
  TASK_COMPLETED = 'task.completed',
  TASK_DELETED = 'task.deleted',
  
  // Presence events
  PRESENCE_JOINED = 'presence.joined',
  PRESENCE_LEFT = 'presence.left',
  PRESENCE_UPDATE = 'presence.update',
  
  // Calendar events
  CALENDAR_EVENT_CREATED = 'calendar.event_created',
  CALENDAR_EVENT_UPDATED = 'calendar.event_updated',
  CALENDAR_EVENT_DELETED = 'calendar.event_deleted',
  
  // Viewing events
  VIEWING_BOOKED = 'viewing.booked',
  VIEWING_CONFIRMED = 'viewing.confirmed',
  VIEWING_CANCELLED = 'viewing.cancelled',
  
  // Document events
  DOCUMENT_SIGNED = 'document.signed',
  DOCUMENT_UPLOADED = 'document.uploaded',
  
  // Project events
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_STATUS_CHANGED = 'project.status_changed',
  PROJECT_DELETED = 'project.deleted',
  
  // Phase events
  PHASE_UPDATED = 'phase.updated',
  PHASE_RESCHEDULED = 'phase.rescheduled',
  
  // Budget events
  BUDGET_UPDATED = 'budget.updated',
  BUDGET_THRESHOLD_EXCEEDED = 'budget.threshold_exceeded',
  
  // Dashboard events
  METRICS_UPDATED = 'metrics.updated',
  DASHBOARD_REFRESH = 'dashboard.refresh',
}

export interface RealtimeEvent {
  type: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  userId?: string;
  organizationId?: string;
  timestamp?: string;
}

export interface PresenceUser {
  userId: string;
  action: string;
  userInfo: {
    name?: string;
    avatar?: string;
    email?: string;
  };
  lastActivity?: Date;
}

type EventHandler = (event: RealtimeEvent) => void;

class RealtimeClient {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private clientId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private sessionId: string;
  
  constructor() {
    this.sessionId = this.generateSessionId();
  }
  
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getSessionId(): string {
    return this.sessionId;
  }
  
  connect(userId: string, organizationId: string): void {
    if (this.eventSource) {
      this.disconnect();
    }
    
    const url = `${API_BASE}/realtime/events`;
    this.eventSource = new EventSource(url, {
      withCredentials: true,
    });
    
    // Override headers via fetch and reconnect with proper headers
    // Note: EventSource doesn't support custom headers natively
    // We'll use a workaround with query params or rely on cookies
    
    this.eventSource.onopen = () => {
      console.log('[Realtime] Connected');
      this.reconnectAttempts = 0;
    };
    
    this.eventSource.onerror = (error) => {
      console.error('[Realtime] Connection error', error);
      this.handleReconnect(userId, organizationId);
    };
    
    // Handle connected event to get client ID
    this.eventSource.addEventListener('connected', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      this.clientId = data.payload.clientId;
      console.log('[Realtime] Client ID:', this.clientId);
    });
    
    // Handle all event types
    Object.values(RealtimeEventType).forEach(eventType => {
      this.eventSource?.addEventListener(eventType, (event: MessageEvent) => {
        this.dispatchEvent(eventType, JSON.parse(event.data));
      });
    });
    
    // Handle generic message events
    this.eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.dispatchEvent(data.type || 'message', data);
      } catch {
        // Ignore parse errors (could be heartbeat)
      }
    };
  }
  
  private handleReconnect(userId: string, organizationId: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Realtime] Max reconnect attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(userId, organizationId), delay);
  }
  
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.clientId = null;
      console.log('[Realtime] Disconnected');
    }
  }
  
  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }
  
  private dispatchEvent(eventType: string, event: RealtimeEvent): void {
    // Dispatch to specific handlers
    this.handlers.get(eventType)?.forEach(handler => handler(event));
    
    // Dispatch to wildcard handlers
    this.handlers.get('*')?.forEach(handler => handler(event));
  }
  
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Singleton instance
export const realtimeClient = new RealtimeClient();

/**
 * Hook to use real-time events
 */
export function useRealtime(
  eventTypes: string | string[],
  handler: EventHandler,
  deps: React.DependencyList = []
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  
  useEffect(() => {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const unsubscribes = types.map(type =>
      realtimeClient.subscribe(type, (event) => handlerRef.current(event))
    );
    
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [eventTypes, ...deps]);
}

/**
 * Hook to track presence on a resource
 */
export function usePresence(
  resourceType: string,
  resourceId: string | undefined,
  userInfo: { name?: string; avatar?: string; email?: string } = {}
): PresenceUser[] {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const sessionId = realtimeClient.getSessionId();
  
  // Update presence periodically
  useEffect(() => {
    if (!resourceId) return;
    
    const updatePresence = async () => {
      try {
        const authHeaders = await getAuthHeaders();
        await fetch(`${API_BASE}/realtime/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            sessionId,
            resourceType,
            resourceId,
            action: 'viewing',
            userInfo,
          }),
        });
      } catch (error) {
        console.error('[Presence] Update failed', error);
      }
    };
    
    // Initial update
    updatePresence();
    
    // Update every 2 minutes (before the 5 minute expiry)
    const interval = setInterval(updatePresence, 2 * 60 * 1000);
    
    // Fetch current presence
    const fetchPresence = async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const response = await fetch(
          `${API_BASE}/realtime/presence/${resourceType}/${resourceId}`,
          { headers: authHeaders }
        );
        const data = await response.json();
        if (data.success) {
          setPresence(data.data);
        }
      } catch (error) {
        console.error('[Presence] Fetch failed', error);
      }
    };
    
    fetchPresence();
    
    // Cleanup on unmount
    return () => {
      clearInterval(interval);
      // Remove presence
      getAuthHeaders().then(authHeaders => {
        fetch(`${API_BASE}/realtime/presence`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ sessionId, resourceType, resourceId }),
        }).catch(() => {});
      });
    };
  }, [resourceType, resourceId, sessionId]);
  
  // Listen for presence updates
  useRealtime([RealtimeEventType.PRESENCE_UPDATE, RealtimeEventType.PRESENCE_LEFT], (event) => {
    if (event.entityType === resourceType && event.entityId === resourceId) {
      // Refetch presence
      getAuthHeaders().then(authHeaders => {
        fetch(`${API_BASE}/realtime/presence/${resourceType}/${resourceId}`, { headers: authHeaders })
          .then(res => res.json())
          .then(data => {
            if (data.success) setPresence(data.data);
          })
          .catch(() => {});
      });
    }
  }, [resourceType, resourceId]);
  
  return presence;
}

/**
 * Hook to connect/disconnect realtime on mount
 */
export function useRealtimeConnection(
  userId: string | undefined,
  organizationId: string | undefined
): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    if (!userId || !organizationId) return;
    
    realtimeClient.connect(userId, organizationId);
    
    // Check connection status periodically
    const interval = setInterval(() => {
      setIsConnected(realtimeClient.isConnected());
    }, 1000);
    
    return () => {
      clearInterval(interval);
      realtimeClient.disconnect();
    };
  }, [userId, organizationId]);
  
  return { isConnected };
}

// =============================================================================
// CALENDAR API
// =============================================================================

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  eventType: 'viewing' | 'meeting' | 'task' | 'reminder' | 'follow_up' | 'deadline';
  location?: string;
  locationType?: 'in_person' | 'virtual' | 'phone';
  startTime: Date | string;
  endTime: Date | string;
  allDay?: boolean;
  dealId?: string;
  contactId?: string;
  propertyId?: string;
  attendees?: Array<{ userId?: string; email: string; name: string; status: string }>;
  reminders?: Array<{ minutesBefore: number; type: string }>;
  status?: 'scheduled' | 'completed' | 'cancelled';
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface ViewingSlot {
  startTime: Date;
  endTime: Date;
  agentId: string;
  agentName?: string;
}

export interface ViewingBooking {
  id?: string;
  propertyId: string;
  contactId: string;
  agentId?: string;
  dealId?: string;
  scheduledAt: Date | string;
  durationMinutes?: number;
  status?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

export const calendarApi = {
  // Calendar Events
  async getEvents(
    startDate: Date,
    endDate: Date,
    filters?: { userId?: string; eventType?: string; dealId?: string; service?: string }
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      ...(filters?.userId && { user: filters.userId }),
      ...(filters?.eventType && { eventType: filters.eventType }),
      ...(filters?.dealId && { dealId: filters.dealId }),
      ...(filters?.service && { service: filters.service }),
    });
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/events?${params}`, { credentials: 'include', headers: authHeaders });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  
  async getUpcomingEvents(limit = 10): Promise<CalendarEvent[]> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/events/upcoming?limit=${limit}`, { credentials: 'include', headers: authHeaders });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  
  async createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      credentials: 'include',
      body: JSON.stringify(event),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  
  async updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  
  async deleteEvent(eventId: string): Promise<void> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/events/${eventId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders,
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
  },
  
  // Viewing Slots & Bookings
  async getAvailableSlots(propertyId: string, date: Date): Promise<ViewingSlot[]> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(
      `${API_BASE}/calendar/slots/${propertyId}?date=${date.toISOString()}`,
      { credentials: 'include', headers: authHeaders }
    );
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data.map((slot: ViewingSlot) => ({
      ...slot,
      startTime: new Date(slot.startTime),
      endTime: new Date(slot.endTime),
    }));
  },
  
  async bookViewing(booking: ViewingBooking): Promise<ViewingBooking> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/viewings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      credentials: 'include',
      body: JSON.stringify(booking),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  
  async updateViewingStatus(
    bookingId: string,
    status: string,
    agentNotes?: string
  ): Promise<ViewingBooking> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/viewings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      credentials: 'include',
      body: JSON.stringify({ status, agentNotes }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  
  async getViewings(filters?: {
    propertyId?: string;
    agentId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ViewingBooking[]> {
    const params = new URLSearchParams();
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    if (filters?.agentId) params.append('agentId', filters.agentId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate.toISOString());
    if (filters?.endDate) params.append('endDate', filters.endDate.toISOString());
    
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/calendar/viewings?${params}`, { credentials: 'include', headers: authHeaders });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
