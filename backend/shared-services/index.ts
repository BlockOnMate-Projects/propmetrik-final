/**
 * Shared Services Index
 * 
 * Cross-cutting services used across all PropMetrik domains:
 * - CRM, Projects, Properties, Valuation, etc.
 * 
 * These services are domain-agnostic infrastructure components.
 */

// Real-time SSE & Presence
export * from './realtime';

// Calendar & Scheduling
export * from './calendar';

// Workflow Automation
export * from './workflow';

// E-Sign Services
export * from './e-sign';

// Payment Services
export * from './payments/paystack';

// Document Services
export * from './document-service';
