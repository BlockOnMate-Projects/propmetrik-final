/**
 * In-Mail Notification System
 * 
 * Provides a unified inbox for all PROPMETRIK notifications:
 * - E-Sign documents
 * - Property updates
 * - Valuation reports
 * - CRM activities
 * - Project tasks
 * - System alerts
 */

export { default as notificationService } from './notificationService';
export { default as notificationRoutes } from './routes';
export * from './notificationService';

// Centralized notification core (single entry point for all services)
export {
  notify,
  resolveOrgStaff,
  resolveStaffUser,
  resolveTenant,
  resolveTenantByTenancy,
} from '../notify';
export type { NotifyInput, NotifyRecipient, NotifyResult, NotifyAudience } from '../notify';
