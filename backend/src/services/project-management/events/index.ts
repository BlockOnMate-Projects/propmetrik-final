/**
 * Events Module - Barrel Export
 * 
 * @module services/project-management/events
 */

export {
  // Event bus singleton
  eventBus,
  
  // Event bus class (for testing)
  ProjectEventBus,
  
  // Event types enum
  ProjectEventType,
  
  // Payload types
  type BaseEventPayload,
  type EntityChangePayload,
  type StatusChangePayload,
  type AssignmentPayload,
  type ApprovalPayload,
  type FinancialPayload,
  type EventPayload,
  
  // Handler types
  type EventHandler,
  type SubscriptionOptions,
  type Subscription,
  
  // Helper functions
  createEntityChangeEvent,
  createStatusChangeEvent,
} from './EventBus';
