/**
 * useRealtime Hook
 * 
 * Provides real-time event subscription via Server-Sent Events (SSE).
 * Connects to the backend realtime service for live dashboard updates.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getCachedSession } from '@/lib/session-cache';

// Event types matching backend
export enum RealtimeEventType {
  // Project events
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_STATUS_CHANGED = 'project.status_changed',
  PROJECT_DELETED = 'project.deleted',
  
  // Phase events
  PHASE_CREATED = 'phase.created',
  PHASE_UPDATED = 'phase.updated',
  PHASE_PROGRESS_CHANGED = 'phase.progress_changed',
  PHASE_STATUS_CHANGED = 'phase.status_changed',
  PHASE_RESCHEDULED = 'phase.rescheduled',
  
  // Milestone events
  MILESTONE_CREATED = 'milestone.created',
  MILESTONE_COMPLETED = 'milestone.completed',
  MILESTONE_MISSED = 'milestone.missed',
  
  // Budget events
  BUDGET_UPDATED = 'budget.updated',
  BUDGET_THRESHOLD_EXCEEDED = 'budget.threshold_exceeded',
  COST_RECORDED = 'cost.recorded',
  
  // Unit events
  UNIT_CREATED = 'unit.created',
  UNIT_UPDATED = 'unit.updated',
  UNIT_SOLD = 'unit.sold',
  UNIT_RESERVED = 'unit.reserved',
  
  // Alert events
  ALERT_CREATED = 'alert.created',
  ALERT_RESOLVED = 'alert.resolved',
  
  // Dashboard events
  METRICS_UPDATED = 'metrics.updated',
  DASHBOARD_REFRESH = 'dashboard.refresh',
  
  // Connection events
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  
  // Document events (from existing backend)
  DOCUMENT_SIGNED = 'document.signed',
  DOCUMENT_UPLOADED = 'document.uploaded',
  
  // Viewing events (from existing backend)
  VIEWING_BOOKED = 'viewing.booked',
  VIEWING_CONFIRMED = 'viewing.confirmed',
  VIEWING_CANCELLED = 'viewing.cancelled',
  
  // Deal events (from existing backend)
  DEAL_CREATED = 'deal.created',
  DEAL_UPDATED = 'deal.updated',
  DEAL_STAGE_CHANGED = 'deal.stage_changed',
  
  // Contact events (from existing backend)
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  
  // Activity events (from existing backend)
  ACTIVITY_CREATED = 'activity.created',
  ACTIVITY_UPDATED = 'activity.updated',
  
  // Task events (from existing backend)
  TASK_CREATED = 'task.created',
  TASK_COMPLETED = 'task.completed',

  // In-app notification (emitted by the notification core for the bell/portal)
  NOTIFICATION_NEW = 'notification:new',
}

export interface RealtimeEvent {
  type: RealtimeEventType | string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  userId?: string;
  organizationId?: string;
  timestamp?: string;
}

type EventHandler = (event: RealtimeEvent) => void;

interface UseRealtimeOptions {
  /** API base URL */
  baseUrl?: string;
  /** User ID for headers */
  userId?: string;
  /** Organization ID for headers */
  organizationId?: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Event handlers by type */
  handlers?: Partial<Record<RealtimeEventType | string, EventHandler>>;
  /** Global event handler */
  onEvent?: EventHandler;
  /** Pre-resolved access token — avoids getSession() on every SSE reconnect */
  accessToken?: string;
  /** Connection state change handler */
  onConnectionChange?: (connected: boolean) => void;
}

interface UseRealtimeReturn {
  /** Whether connected to SSE */
  isConnected: boolean;
  /** Client ID assigned by server */
  clientId: string | null;
  /** Last received event */
  lastEvent: RealtimeEvent | null;
  /** Reconnect attempt count */
  reconnectAttempts: number;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Subscribe to additional channels */
  subscribe: (channels: string[]) => Promise<void>;
  /** Unsubscribe from channels */
  unsubscribe: (channels: string[]) => Promise<void>;
  /** Add event handler */
  on: (eventType: RealtimeEventType | string, handler: EventHandler) => () => void;
  /** Remove event handler */
  off: (eventType: RealtimeEventType | string, handler: EventHandler) => void;
}

// Use the Next.js proxy path instead of direct backend URL to avoid cross-origin
// connection issues and browser connection limit exhaustion
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const {
    baseUrl = DEFAULT_BASE_URL,
    userId = '',
    organizationId = '',
    autoConnect = true,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
    accessToken: accessTokenProp,
    handlers = {},
    onEvent,
    onConnectionChange,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoggedWarningRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);
  /** Prevent unstable callback refs from causing reconnect loops */
  const onEventRef = useRef(onEvent);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const isDisconnectingRef = useRef(false);

  // Keep refs in sync without triggering re-renders
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onConnectionChangeRef.current = onConnectionChange; }, [onConnectionChange]);

  // Initialize handlers from options
  useEffect(() => {
    Object.entries(handlers).forEach(([eventType, handler]) => {
      if (handler) {
        addHandler(eventType, handler);
      }
    });
  }, []);

  const addHandler = useCallback((eventType: string, handler: EventHandler) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);
  }, []);

  const removeHandler = useCallback((eventType: string, handler: EventHandler) => {
    handlersRef.current.get(eventType)?.delete(handler);
  }, []);

  const handleEvent = useCallback((event: RealtimeEvent) => {
    setLastEvent(event);

    // Call global handler via ref (stable)
    onEventRef.current?.(event);

    // Call specific handlers
    const typeHandlers = handlersRef.current.get(event.type);
    typeHandlers?.forEach((handler) => handler(event));

    // Also call wildcard handlers
    const wildcardHandlers = handlersRef.current.get('*');
    wildcardHandlers?.forEach((handler) => handler(event));
  }, []); // No dependencies — uses refs for stability

  const connect = useCallback(async () => {
    // Don't connect if already connected, connecting, or intentionally disconnecting
    if (eventSourceRef.current || isDisconnectingRef.current) {
      return;
    }

    try {
      // Build URL - baseUrl (from NEXT_PUBLIC_API_URL) already contains /api
      // So we just append /realtime/events
      const url = new URL(`${baseUrl}/realtime/events`, window.location.origin);

      // EventSource cannot send Authorization headers, so pass token as query param
      let token: string | undefined = accessTokenProp;
      if (!token) {
        try {
          const session = await getCachedSession();
          token = (session as any)?.accessToken;
        } catch {
          // No session available
        }
      }

      if (!token) {
        // Session not ready — do not reconnect-loop; RealtimeProvider will connect when authenticated
        return;
      }

      url.searchParams.set('token', token);

      // Create EventSource
      const eventSource = new EventSource(url.toString(), {
        withCredentials: true,
      });

      eventSourceRef.current = eventSource;

      // Handle open
      eventSource.onopen = () => {
        setIsConnected(true);
        setReconnectAttempts(0);
        reconnectAttemptsRef.current = 0;
        onConnectionChangeRef.current?.(true);
        handleEvent({
          type: RealtimeEventType.CONNECTED,
          payload: { timestamp: new Date().toISOString() },
        });
      };

      // Handle error
      eventSource.onerror = () => {
        setIsConnected(false);
        onConnectionChangeRef.current?.(false);

        eventSource.close();
        eventSourceRef.current = null;

        // Tab is backgrounded → the browser suspends the long-lived connection
        // (net::ERR_NETWORK_IO_SUSPENDED). Don't log or reconnect-loop here; the
        // visibilitychange handler reconnects cleanly when the tab is visible again.
        if (typeof document !== 'undefined' && document.hidden) {
          return;
        }

        // Only log warning once to avoid console spam
        if (!hasLoggedWarningRef.current) {
          console.warn('SSE connection error — will retry');
          hasLoggedWarningRef.current = true;
        }

        // Attempt reconnect with exponential backoff (capped)
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          setReconnectAttempts(reconnectAttemptsRef.current);
          handleEvent({
            type: RealtimeEventType.RECONNECTING,
            payload: { attempt: reconnectAttemptsRef.current },
          });

          // Exponential backoff: 3s, 6s, 12s, 24s … capped at 30s
          const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current?.();
          }, delay);
        } else {
          handleEvent({
            type: RealtimeEventType.DISCONNECTED,
            payload: { reason: 'max_reconnect_attempts' },
          });
        }
      };

      // Handle connection event
      eventSource.addEventListener('connected', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          setClientId(data.payload?.clientId || null);
        } catch {
          // Ignore parse errors
        }
      });

      // Handle all event types
      const eventTypes = Object.values(RealtimeEventType);
      eventTypes.forEach((eventType) => {
        eventSource.addEventListener(eventType, (e) => {
          try {
            const data = JSON.parse((e as MessageEvent).data);
            handleEvent(data);
          } catch (error) {
            console.error('Failed to parse SSE event:', error);
          }
        });
      });

      // Also handle generic message events
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handleEvent(data);
        } catch {
          // Ignore parse errors
        }
      };

    } catch (error) {
      // Silently handle EventSource creation failures
    }
  }, [
    baseUrl,
    autoReconnect,
    reconnectDelay,
    maxReconnectAttempts,
    accessTokenProp,
    handleEvent,
  ]);

  // Keep connectRef in sync so reconnect setTimeout always calls latest version
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    isDisconnectingRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
    setClientId(null);
    // Don't reset reconnectAttemptsRef here — that caused infinite loops
    // when useEffect cleanup → disconnect → connect → retry cycle
    setReconnectAttempts(0);
    onConnectionChangeRef.current?.(false);

    // Allow future manual connect calls
    setTimeout(() => { isDisconnectingRef.current = false; }, 100);
  }, []);

  const subscribe = useCallback(async (channels: string[]) => {
    if (!clientId) return;

    try {
      await fetch(`${baseUrl}/realtime/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({ clientId, channels }),
      });
    } catch (error) {
      console.error('Failed to subscribe to channels:', error);
    }
  }, [baseUrl, clientId, userId, organizationId]);

  const unsubscribe = useCallback(async (channels: string[]) => {
    if (!clientId) return;

    try {
      await fetch(`${baseUrl}/realtime/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({ clientId, channels }),
      });
    } catch (error) {
      console.error('Failed to unsubscribe from channels:', error);
    }
  }, [baseUrl, clientId, userId, organizationId]);

  const on = useCallback((eventType: RealtimeEventType | string, handler: EventHandler) => {
    addHandler(eventType, handler);
    return () => removeHandler(eventType, handler);
  }, [addHandler, removeHandler]);

  const off = useCallback((eventType: RealtimeEventType | string, handler: EventHandler) => {
    removeHandler(eventType, handler);
  }, [removeHandler]);

  // Auto-connect on mount (stable — runs once, not on every callback change)
  useEffect(() => {
    if (autoConnect) {
      // Reset attempts for a fresh mount
      reconnectAttemptsRef.current = 0;
      hasLoggedWarningRef.current = false;
      isDisconnectingRef.current = false;
      connectRef.current?.();
    }

    // Pause the SSE connection while the tab is hidden so the browser doesn't suspend it
    // (net::ERR_NETWORK_IO_SUSPENDED) and trigger reconnect noise; resume on focus.
    const handleVisibility = () => {
      if (document.hidden) {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
          setIsConnected(false);
        }
      } else if (autoConnect && !eventSourceRef.current) {
        // Reconnect fresh when the tab becomes visible again.
        reconnectAttemptsRef.current = 0;
        hasLoggedWarningRef.current = false;
        connectRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  return {
    isConnected,
    clientId,
    lastEvent,
    reconnectAttempts,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    on,
    off,
  };
}

export default useRealtime;
