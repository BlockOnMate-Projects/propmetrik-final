/**
 * Realtime Context Provider
 * 
 * Provides real-time event subscription and distribution throughout the app.
 * Wraps the useRealtime hook and exposes event subscriptions to child components.
 */

'use client';

import React, { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { useRealtime, RealtimeEventType, RealtimeEvent } from '@/hooks/use-realtime';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

interface RealtimeContextValue {
  /** Whether connected to SSE */
  isConnected: boolean;
  /** Client ID assigned by server */
  clientId: string | null;
  /** Last received event */
  lastEvent: RealtimeEvent | null;
  /** Reconnect attempt count */
  reconnectAttempts: number;
  /** Subscribe to event type */
  on: (eventType: RealtimeEventType | string, handler: (event: RealtimeEvent) => void) => () => void;
  /** Unsubscribe from event type */
  off: (eventType: RealtimeEventType | string, handler: (event: RealtimeEvent) => void) => void;
  /** Subscribe to channels */
  subscribe: (channels: string[]) => Promise<void>;
  /** Unsubscribe from channels */
  unsubscribe: (channels: string[]) => Promise<void>;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
  children: ReactNode;
  /** User ID for connection */
  userId?: string;
  /** Organization ID for connection */
  organizationId?: string;
  /** Whether to auto-invalidate React Query caches on events */
  autoInvalidateQueries?: boolean;
  /** Enable connection (can be disabled for SSR) */
  enabled?: boolean;
}

// Query key mappings for auto-invalidation
const EVENT_QUERY_MAPPINGS: Record<string, string[][]> = {
  [RealtimeEventType.PROJECT_CREATED]: [['projects'], ['dashboard', 'metrics']],
  [RealtimeEventType.PROJECT_UPDATED]: [['projects'], ['dashboard', 'metrics']],
  [RealtimeEventType.PROJECT_STATUS_CHANGED]: [['projects'], ['dashboard', 'metrics'], ['dashboard', 'timeline']],
  [RealtimeEventType.PROJECT_DELETED]: [['projects'], ['dashboard', 'metrics']],
  
  [RealtimeEventType.PHASE_UPDATED]: [['phases'], ['gantt'], ['dashboard', 'timeline']],
  [RealtimeEventType.PHASE_RESCHEDULED]: [['phases'], ['gantt'], ['dashboard', 'timeline']],
  [RealtimeEventType.PHASE_PROGRESS_CHANGED]: [['phases'], ['dashboard', 'metrics']],
  
  [RealtimeEventType.MILESTONE_COMPLETED]: [['milestones'], ['dashboard', 'milestones']],
  [RealtimeEventType.MILESTONE_MISSED]: [['milestones'], ['dashboard', 'milestones'], ['dashboard', 'alerts']],
  
  [RealtimeEventType.BUDGET_UPDATED]: [['budget'], ['dashboard', 'budget']],
  [RealtimeEventType.BUDGET_THRESHOLD_EXCEEDED]: [['budget'], ['dashboard', 'budget'], ['dashboard', 'alerts']],
  
  [RealtimeEventType.ALERT_CREATED]: [['dashboard', 'alerts']],
  [RealtimeEventType.ALERT_RESOLVED]: [['dashboard', 'alerts']],
  
  [RealtimeEventType.METRICS_UPDATED]: [['dashboard', 'metrics']],
  [RealtimeEventType.DASHBOARD_REFRESH]: [['dashboard']],
};

export function RealtimeProvider({
  children,
  userId,
  organizationId,
  autoInvalidateQueries = true,
  enabled = true,
}: RealtimeProviderProps) {
  const queryClient = useQueryClient();
  const { status, data: session } = useSession();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const accessToken = (session as any)?.accessToken as string | undefined;

  // Only connect SSE on authenticated dashboard pages — marketing/public pages
  // don't need realtime and the backend requires projects service access.
  // EXCLUDE the tenant portal (/dashboard/tenant/*): tenants authenticate with a
  // tenant session token that has no projects service access, so the SSE handshake
  // 401s and reconnect-loops (console spam). Tenants use their own notifications feed.
  const isAuthenticatedDashboard =
    status === 'authenticated' &&
    pathname?.startsWith('/dashboard') &&
    !pathname.startsWith('/dashboard/tenant');

  // Only enable on client side
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEvent = useCallback((event: RealtimeEvent) => {
    if (!autoInvalidateQueries) return;

    // Get query keys to invalidate based on event type
    const queryKeys = EVENT_QUERY_MAPPINGS[event.type] || [];
    
    // Invalidate each mapped query
    queryKeys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: key });
    });

    // If event has specific entity ID, also invalidate that entity's queries
    if (event.entityId) {
      if (event.entityType === 'project') {
        queryClient.invalidateQueries({ queryKey: ['projects', event.entityId] });
      } else if (event.entityType === 'phase') {
        queryClient.invalidateQueries({ queryKey: ['phases', event.entityId] });
      }
    }
  }, [autoInvalidateQueries, queryClient]);

  const {
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
  } = useRealtime({
    userId,
    organizationId,
    accessToken,
    autoConnect: mounted && enabled && !!isAuthenticatedDashboard && !!accessToken,
    autoReconnect: true,
    onEvent: handleEvent,
    onConnectionChange: (connected) => {
      // Silently handle connection state changes - no console spam
    },
  });

  const value: RealtimeContextValue = {
    isConnected,
    clientId,
    lastEvent,
    reconnectAttempts,
    on,
    off,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Hook to access realtime context
 */
export function useRealtimeContext(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  
  if (!context) {
    throw new Error('useRealtimeContext must be used within a RealtimeProvider');
  }
  
  return context;
}

/**
 * Hook to subscribe to specific event types
 */
export function useRealtimeEvent(
  eventType: RealtimeEventType | string,
  handler: (event: RealtimeEvent) => void,
  deps: React.DependencyList = []
): void {
  const { on, off } = useRealtimeContext();

  useEffect(() => {
    const unsubscribe = on(eventType, handler);
    return () => {
      unsubscribe();
    };
  }, [eventType, on, off, ...deps]);
}

/**
 * Hook to subscribe to multiple event types
 */
export function useRealtimeEvents(
  eventTypes: (RealtimeEventType | string)[],
  handler: (event: RealtimeEvent) => void,
  deps: React.DependencyList = []
): void {
  const { on } = useRealtimeContext();

  useEffect(() => {
    const unsubscribes = eventTypes.map((eventType) => on(eventType, handler));
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [eventTypes.join(','), on, ...deps]);
}

/**
 * Hook to get connection status indicator
 */
export function useRealtimeStatus(): {
  isConnected: boolean;
  reconnectAttempts: number;
  statusText: string;
  statusColor: 'green' | 'yellow' | 'red';
} {
  const { isConnected, reconnectAttempts } = useRealtimeContext();

  let statusText: string;
  let statusColor: 'green' | 'yellow' | 'red';

  if (isConnected) {
    statusText = 'Connected';
    statusColor = 'green';
  } else if (reconnectAttempts > 0) {
    statusText = `Reconnecting (${reconnectAttempts})`;
    statusColor = 'yellow';
  } else {
    statusText = 'Disconnected';
    statusColor = 'red';
  }

  return { isConnected, reconnectAttempts, statusText, statusColor };
}

export { RealtimeEventType };
export type { RealtimeEvent };
