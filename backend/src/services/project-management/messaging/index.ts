/**
 * Messaging Module - Barrel Export
 * 
 * Phase 3.2: Split whatsappBotService into focused services
 * 
 * Services:
 * - WhatsAppTemplates: Message template generation
 * - WhatsAppCommandHandler: Text command processing  
 * - WhatsAppNotificationService: Notification dispatch
 * - WhatsAppBotFacade: Unified facade for backward compatibility
 * 
 * @module services/project-management/messaging
 */

// Types
export * from './types';

// Template generation
export { whatsAppTemplates } from './WhatsAppTemplates';

// Command handling
export { whatsAppCommandHandler } from './WhatsAppCommandHandler';

// Notification service
export { 
  whatsAppNotificationService,
  type NotificationResult,
  type BulkNotificationResult,
} from './WhatsAppNotificationService';

// Backward compatibility facade
export { whatsAppBotFacade } from './WhatsAppBotFacade';
