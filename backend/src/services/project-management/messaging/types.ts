/**
 * WhatsApp Bot Types
 * 
 * Phase 3.2: Split whatsappBotService
 * 
 * Shared types for WhatsApp PM Bot integration.
 * 
 * @module services/project-management/messaging/types
 */

// =============================================================================
// NOTIFICATION TYPES
// =============================================================================

export enum PMNotificationType {
  // Project Updates
  PROJECT_STARTED = 'project_started',
  PROJECT_MILESTONE = 'project_milestone',
  PROJECT_DELAYED = 'project_delayed',
  PROJECT_COMPLETED = 'project_completed',
  
  // RFI Notifications
  RFI_CREATED = 'rfi_created',
  RFI_ASSIGNED = 'rfi_assigned',
  RFI_RESPONSE_NEEDED = 'rfi_response_needed',
  RFI_ANSWERED = 'rfi_answered',
  
  // Submittal Notifications
  SUBMITTAL_SUBMITTED = 'submittal_submitted',
  SUBMITTAL_ASSIGNED = 'submittal_assigned',
  SUBMITTAL_APPROVED = 'submittal_approved',
  SUBMITTAL_REJECTED = 'submittal_rejected',
  SUBMITTAL_REVISION_NEEDED = 'submittal_revision_needed',
  
  // Change Order Notifications
  CHANGE_ORDER_CREATED = 'change_order_created',
  CHANGE_ORDER_APPROVED = 'change_order_approved',
  CHANGE_ORDER_REJECTED = 'change_order_rejected',
  
  // Daily Operations
  DAILY_LOG_REMINDER = 'daily_log_reminder',
  DAILY_LOG_SUBMITTED = 'daily_log_submitted',
  
  // Delivery & Materials
  DELIVERY_SCHEDULED = 'delivery_scheduled',
  DELIVERY_ARRIVED = 'delivery_arrived',
  DELIVERY_CONFIRMATION_NEEDED = 'delivery_confirmation_needed',
  
  // Safety & Inspections
  SAFETY_INCIDENT = 'safety_incident',
  INSPECTION_SCHEDULED = 'inspection_scheduled',
  INSPECTION_PASSED = 'inspection_passed',
  INSPECTION_FAILED = 'inspection_failed',
  
  // Budget & Payments
  BUDGET_THRESHOLD_WARNING = 'budget_threshold_warning',
  PAYMENT_DUE = 'payment_due',
  PAYMENT_RECEIVED = 'payment_received',
  
  // General
  TASK_ASSIGNED = 'task_assigned',
  TASK_DUE_SOON = 'task_due_soon',
  PHOTO_UPLOADED = 'photo_uploaded',
  PUNCH_LIST_ITEM = 'punch_list_item'
}

// =============================================================================
// NOTIFICATION INTERFACE
// =============================================================================

export interface PMWhatsAppNotification {
  recipientPhone: string;
  recipientName: string;
  notificationType: PMNotificationType;
  projectId: string;
  projectName: string;
  data: Record<string, any>;
  requiresResponse?: boolean;
  responseOptions?: ResponseOption[];
}

export interface ResponseOption {
  key: string;
  label: string;
  action: string;
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

export interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string };
        messages?: Array<WhatsAppIncomingMessage>;
        statuses?: Array<any>;
      };
    }>;
  }>;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'interactive' | 'button' | 'image' | 'document' | 'location';
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  button?: { text: string; payload: string };
  image?: { id: string; mime_type: string; sha256: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

// =============================================================================
// CONVERSATION SESSION
// =============================================================================

export interface ConversationSession {
  phone: string;
  userId?: string;
  projectId?: string;
  currentFlow?: string;
  flowStep?: number;
  data: Record<string, any>;
  createdAt: Date;
  lastActivityAt: Date;
}

export type ConversationFlowType = 
  | 'daily_log'
  | 'rfi_response'
  | 'submittal_review'
  | 'delivery_confirmation'
  | 'photo_upload'
  | 'issue_report';

// =============================================================================
// COMMAND TYPES
// =============================================================================

export interface CommandContext {
  phone: string;
  userId?: string;
  projectId?: string;
  session?: ConversationSession;
}

export interface CommandResult {
  success: boolean;
  message: string;
  responseOptions?: ResponseOption[];
  continueFlow?: boolean;
}

// =============================================================================
// TEMPLATE CONTEXT
// =============================================================================

export interface NotificationTemplateContext {
  recipientName: string;
  projectName: string;
  projectId: string;
  [key: string]: any;
}
