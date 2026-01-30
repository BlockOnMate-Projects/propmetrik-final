/**
 * useRealtime Hook
 * 
 * Provides real-time event subscription via Server-Sent Events (SSE).
 * Connects to the backend realtime service for live dashboard updates.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

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

// Use empty string for relative URLs - Next.js proxy will rewrite /api/* to http://localhost:4000/api/v1/*
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const {
    baseUrl = DEFAULT_BASE_URL,
    userId = '',
    organizationId = '',
    autoConnect = true,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 3,
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

    // Call global handler
    onEvent?.(event);

    // Call specific handlers
    const typeHandlers = handlersRef.current.get(event.type);
    typeHandlers?.forEach((handler) => handler(event));

    // Also call wildcard handlers
    const wildcardHandlers = handlersRef.current.get('*');
    wildcardHandlers?.forEach((handler) => handler(event));
  }, [onEvent]);

  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (eventSourceRef.current) {
      return;
    }

    try {
      // Build URL - baseUrl (from NEXT_PUBLIC_API_URL) already contains /api/v1
      // So we just append /realtime/events
      const url = new URL(`${baseUrl}/realtime/events`, window.location.origin);
      
      // Create EventSource
      const eventSource = new EventSource(url.toString(), {
        withCredentials: true,
      });
      
      eventSourceRef.current = eventSource;

      // Handle open
      eventSource.onopen = () => {
        setIsConnected(true);
        setReconnectAttempts(0);
        onConnectionChange?.(true);
        handleEvent({
          type: RealtimeEventType.CONNECTED,
          payload: { timestamp: new Date().toISOString() },
        });
      };

      // Handle error
      eventSource.onerror = (error) => {
        // Only log warning once to avoid console spam
        if (!hasLoggedWarningRef.current) {
          console.warn('SSE connection unavailable - realtime features disabled');
          hasLoggedWarningRef.current = true;
        }
        
        setIsConnected(false);
        onConnectionChange?.(false);
        
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnect (limited to avoid spam)
        if (autoReconnect && reconnectAttempts < maxReconnectAttempts) {
          handleEvent({
            type: RealtimeEventType.RECONNECTING,
            payload: { attempt: reconnectAttempts + 1 },
          });
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connect();
          }, reconnectDelay);
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
    userId,
    organizationId,
    autoReconnect,
    reconnectDelay,
    maxReconnectAttempts,
    reconnectAttempts,
    handleEvent,
    onConnectionChange,
  ]);

  const disconnect = useCallback(() => {
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
    setReconnectAttempts(0);
    onConnectionChange?.(false);
  }, [onConnectionChange]);

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

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // Only re-run if autoConnect changes

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
