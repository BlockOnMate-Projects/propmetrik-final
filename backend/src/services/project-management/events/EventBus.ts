/**
 * Event Bus for Project Management Services
 * 
 * Phase 0.4: Foundation & Standards
 * 
 * Provides a centralized, typed event system for:
 * - Real-time updates across the application
 * - Decoupled communication between services
 * - Audit logging integration
 * - WebSocket event broadcasting
 * 
 * @module services/project-management/events
 */

import { EventEmitter } from 'events';
import { UUID, Timestamp, AuditAction } from '../types';

// =============================================================================
// EVENT TYPE DEFINITIONS
// =============================================================================

/**
 * All supported event types in the project management domain
 */
export enum ProjectEventType {
  // Project lifecycle
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_DELETED = 'project.deleted',
  PROJECT_STATUS_CHANGED = 'project.status_changed',
  PROJECT_ARCHIVED = 'project.archived',
  
  // Phase lifecycle
  PHASE_CREATED = 'phase.created',
  PHASE_UPDATED = 'phase.updated',
  PHASE_DELETED = 'phase.deleted',
  PHASE_STARTED = 'phase.started',
  PHASE_COMPLETED = 'phase.completed',
  PHASE_LOCKED = 'phase.locked',
  PHASE_UNLOCKED = 'phase.unlocked',
  
  // Milestone lifecycle
  MILESTONE_CREATED = 'milestone.created',
  MILESTONE_UPDATED = 'milestone.updated',
  MILESTONE_DELETED = 'milestone.deleted',
  MILESTONE_STARTED = 'milestone.started',
  MILESTONE_COMPLETED = 'milestone.completed',
  MILESTONE_APPROVED = 'milestone.approved',
  MILESTONE_REJECTED = 'milestone.rejected',
  
  // Task lifecycle
  TASK_CREATED = 'task.created',
  TASK_UPDATED = 'task.updated',
  TASK_DELETED = 'task.deleted',
  TASK_ASSIGNED = 'task.assigned',
  TASK_COMPLETED = 'task.completed',
  
  // Unit/property events
  UNIT_CREATED = 'unit.created',
  UNIT_UPDATED = 'unit.updated',
  UNIT_DELETED = 'unit.deleted',
  UNIT_STATUS_CHANGED = 'unit.status_changed',
  
  // Financial events
  BUDGET_UPDATED = 'budget.updated',
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_FAILED = 'payment.failed',
  INVOICE_CREATED = 'invoice.created',
  INVOICE_SENT = 'invoice.sent',
  INVOICE_PAID = 'invoice.paid',
  DRAW_SUBMITTED = 'draw.submitted',
  DRAW_APPROVED = 'draw.approved',
  DRAW_REJECTED = 'draw.rejected',
  EXPENSE_LOGGED = 'expense.logged',
  
  // Contractor events
  CONTRACTOR_ADDED = 'contractor.added',
  CONTRACTOR_REMOVED = 'contractor.removed',
  CONTRACTOR_PAYMENT = 'contractor.payment',
  
  // Document events
  DOCUMENT_UPLOADED = 'document.uploaded',
  DOCUMENT_DELETED = 'document.deleted',
  RFI_SUBMITTED = 'rfi.submitted',
  RFI_ANSWERED = 'rfi.answered',
  SUBMITTAL_SUBMITTED = 'submittal.submitted',
  SUBMITTAL_REVIEWED = 'submittal.reviewed',
  CHANGE_ORDER_CREATED = 'change_order.created',
  CHANGE_ORDER_APPROVED = 'change_order.approved',
  
  // Quality & compliance events
  INSPECTION_SCHEDULED = 'inspection.scheduled',
  INSPECTION_COMPLETED = 'inspection.completed',
  PUNCH_ITEM_CREATED = 'punch_item.created',
  PUNCH_ITEM_RESOLVED = 'punch_item.resolved',
  COMPLIANCE_UPDATED = 'compliance.updated',
  
  // Daily operations events
  DAILY_LOG_CREATED = 'daily_log.created',
  PHOTO_UPLOADED = 'photo.uploaded',
  INCIDENT_REPORTED = 'incident.reported',
  
  // Team events
  TEAM_MEMBER_ADDED = 'team.member_added',
  TEAM_MEMBER_REMOVED = 'team.member_removed',
  TEAM_ROLE_CHANGED = 'team.role_changed',
  
  // Governance events
  APPROVAL_REQUESTED = 'approval.requested',
  APPROVAL_GRANTED = 'approval.granted',
  APPROVAL_DENIED = 'approval.denied',
  FRAMEWORK_APPLIED = 'framework.applied',
  FRAMEWORK_MODIFIED = 'framework.modified',
  
  // System events
  SYSTEM_ERROR = 'system.error',
  SYNC_REQUIRED = 'sync.required'
}

// =============================================================================
// EVENT PAYLOAD INTERFACES
// =============================================================================

/**
 * Base event payload that all events extend
 */
export interface BaseEventPayload {
  eventId: string;
  eventType: ProjectEventType;
  timestamp: Timestamp;
  userId?: UUID;
  organizationId?: UUID;
  projectId?: UUID;
  metadata?: Record<string, any>;
}

/**
 * Entity change event payload
 */
export interface EntityChangePayload extends BaseEventPayload {
  entityType: string;
  entityId: UUID;
  action: AuditAction;
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  changedFields?: string[];
}

/**
 * Status change event payload
 */
export interface StatusChangePayload extends BaseEventPayload {
  entityType: string;
  entityId: UUID;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

/**
 * Assignment event payload
 */
export interface AssignmentPayload extends BaseEventPayload {
  entityType: string;
  entityId: UUID;
  assigneeId: UUID;
  assignerId: UUID;
  role?: string;
}

/**
 * Approval event payload
 */
export interface ApprovalPayload extends BaseEventPayload {
  entityType: string;
  entityId: UUID;
  approverId: UUID;
  approved: boolean;
  comments?: string;
}

/**
 * Financial event payload
 */
export interface FinancialPayload extends BaseEventPayload {
  entityType: string;
  entityId: UUID;
  amount: number;
  currency: string;
  paymentMethod?: string;
  reference?: string;
}

/**
 * Union type for all event payloads
 */
export type EventPayload = 
  | BaseEventPayload 
  | EntityChangePayload 
  | StatusChangePayload 
  | AssignmentPayload
  | ApprovalPayload
  | FinancialPayload;

// =============================================================================
// EVENT HANDLER TYPES
// =============================================================================

/**
 * Event handler function type
 */
export type EventHandler<T extends EventPayload = EventPayload> = (event: T) => void | Promise<void>;

/**
 * Event subscription options
 */
export interface SubscriptionOptions {
  /** Only receive events for this project */
  projectId?: UUID;
  /** Only receive events for this organization */
  organizationId?: UUID;
  /** Only receive events matching these entity types */
  entityTypes?: string[];
  /** Execute handler asynchronously */
  async?: boolean;
}

/**
 * Subscription handle for cleanup
 */
export interface Subscription {
  unsubscribe: () => void;
}

// =============================================================================
// EVENT BUS IMPLEMENTATION
// =============================================================================

/**
 * Centralized event bus for project management services.
 * Singleton pattern ensures all services share the same event bus.
 */
class ProjectEventBus {
  private static instance: ProjectEventBus;
  private emitter: EventEmitter;
  private handlers: Map<ProjectEventType, Set<{ handler: EventHandler; options: SubscriptionOptions }>>;
  private middlewares: Array<(event: EventPayload) => EventPayload | null>;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100); // Increase for large applications
    this.handlers = new Map();
    this.middlewares = [];
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ProjectEventBus {
    if (!ProjectEventBus.instance) {
      ProjectEventBus.instance = new ProjectEventBus();
    }
    return ProjectEventBus.instance;
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Add middleware to process events before handlers
   */
  addMiddleware(middleware: (event: EventPayload) => EventPayload | null): void {
    this.middlewares.push(middleware);
  }

  /**
   * Emit an event to all subscribed handlers
   */
  emit<T extends EventPayload>(eventType: ProjectEventType, payload: Omit<T, 'eventId' | 'eventType' | 'timestamp'>): void {
    const fullPayload: EventPayload = {
      eventId: this.generateEventId(),
      eventType,
      timestamp: new Date(),
      ...payload,
    } as EventPayload;

    // Run through middlewares
    let processedPayload: EventPayload | null = fullPayload;
    for (const middleware of this.middlewares) {
      processedPayload = middleware(processedPayload);
      if (!processedPayload) {
        // Middleware blocked the event
        return;
      }
    }

    // Emit to native EventEmitter for simple subscriptions
    this.emitter.emit(eventType, processedPayload);
    
    // Emit to filtered handlers
    const handlerSet = this.handlers.get(eventType);
    if (handlerSet) {
      for (const { handler, options } of handlerSet) {
        // Apply filters
        if (options.projectId && processedPayload.projectId !== options.projectId) {
          continue;
        }
        if (options.organizationId && processedPayload.organizationId !== options.organizationId) {
          continue;
        }
        if (options.entityTypes && 'entityType' in processedPayload) {
          if (!options.entityTypes.includes((processedPayload as EntityChangePayload).entityType)) {
            continue;
          }
        }

        // Execute handler
        if (options.async) {
          Promise.resolve(handler(processedPayload)).catch(error => {
            console.error(`[EventBus] Async handler error for ${eventType}:`, error);
          });
        } else {
          try {
            handler(processedPayload);
          } catch (error) {
            console.error(`[EventBus] Handler error for ${eventType}:`, error);
          }
        }
      }
    }

    // Also emit a wildcard event for catch-all subscribers
    this.emitter.emit('*', processedPayload);
  }

  /**
   * Subscribe to a specific event type
   */
  on<T extends EventPayload>(
    eventType: ProjectEventType,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): Subscription {
    // Store in filtered handlers map
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    
    const handlerEntry = { handler: handler as EventHandler, options };
    this.handlers.get(eventType)!.add(handlerEntry);

    return {
      unsubscribe: () => {
        this.handlers.get(eventType)?.delete(handlerEntry);
      }
    };
  }

  /**
   * Subscribe to all events (catch-all)
   */
  onAll(handler: EventHandler): Subscription {
    const wrappedHandler = (event: EventPayload) => handler(event);
    this.emitter.on('*', wrappedHandler);

    return {
      unsubscribe: () => {
        this.emitter.off('*', wrappedHandler);
      }
    };
  }

  /**
   * Subscribe to multiple event types
   */
  onMany(
    eventTypes: ProjectEventType[],
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): Subscription {
    const subscriptions = eventTypes.map(type => this.on(type, handler, options));

    return {
      unsubscribe: () => {
        subscriptions.forEach(sub => sub.unsubscribe());
      }
    };
  }

  /**
   * Subscribe to an event type once
   */
  once<T extends EventPayload>(
    eventType: ProjectEventType,
    handler: EventHandler<T>
  ): Subscription {
    const subscription = this.on<T>(eventType, (event) => {
      subscription.unsubscribe();
      handler(event);
    });

    return subscription;
  }

  /**
   * Wait for an event (Promise-based)
   */
  waitFor<T extends EventPayload>(
    eventType: ProjectEventType,
    timeout?: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      const subscription = this.once<T>(eventType, (event) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(event);
      });

      if (timeout) {
        timeoutId = setTimeout(() => {
          subscription.unsubscribe();
          reject(new Error(`Timeout waiting for event: ${eventType}`));
        }, timeout);
      }
    });
  }

  /**
   * Remove all handlers for an event type
   */
  removeAllListeners(eventType?: ProjectEventType): void {
    if (eventType) {
      this.handlers.delete(eventType);
      this.emitter.removeAllListeners(eventType);
    } else {
      this.handlers.clear();
      this.emitter.removeAllListeners();
    }
  }

  /**
   * Get count of handlers for an event type
   */
  listenerCount(eventType: ProjectEventType): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Singleton event bus instance
 */
export const eventBus = ProjectEventBus.getInstance();

/**
 * Helper function to create entity change events
 */
export function createEntityChangeEvent(
  eventType: ProjectEventType,
  entityType: string,
  entityId: UUID,
  action: AuditAction,
  options: {
    userId?: UUID;
    projectId?: UUID;
    organizationId?: UUID;
    previousData?: Record<string, any>;
    newData?: Record<string, any>;
    changedFields?: string[];
  } = {}
): void {
  eventBus.emit<EntityChangePayload>(eventType, {
    entityType,
    entityId,
    action,
    ...options,
  });
}

/**
 * Helper function to create status change events
 */
export function createStatusChangeEvent(
  eventType: ProjectEventType,
  entityType: string,
  entityId: UUID,
  previousStatus: string,
  newStatus: string,
  options: {
    userId?: UUID;
    projectId?: UUID;
    organizationId?: UUID;
    reason?: string;
  } = {}
): void {
  eventBus.emit<StatusChangePayload>(eventType, {
    entityType,
    entityId,
    previousStatus,
    newStatus,
    ...options,
  });
}

/**
 * Re-export the class for testing
 */
export { ProjectEventBus };
