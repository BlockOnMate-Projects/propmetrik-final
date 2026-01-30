/**
 * In-Mail Notification System
 * 
 * Provides a unified inbox for all PropMetrik notifications:
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
