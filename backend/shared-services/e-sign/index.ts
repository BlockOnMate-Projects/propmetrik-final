/**
 * E-Signature Service Exports
 * Centralized e-sign services for PropMetrik
 */

export * from './types';

// Core signing services
export { signingService, SigningService } from './signingService';
export { keyManagementService, KeyManagementService } from './keyManagementService';
export { timestampService, TimestampService } from './timestampService';
export { auditLogService, AuditLogService } from './auditLogService';
export { consentService, ConsentService } from './consentService';
export { magicLinkService, MagicLinkService } from './magicLinkService';
export { pdfSigningService, PdfSigningService } from './pdfSigningService';

// Unique signature IDs, certificates, and templates
export { signatureIdService, SignatureIdService } from './signatureIdService';
export { templateService, TemplateService } from './templateService';

// Email notifications and reminders
export { emailService, EmailService } from './emailService';
export { reminderService, ReminderService } from './reminderService';

// Envelope management (DocuSign-like functionality)
export {
  EnvelopeService,
  createEnvelopeService,
  EnvelopeStatus,
  SignerStatus,
  FieldType,
  type ESignEnvelope,
  type ESignSigner,
  type ESignField,
  type CreateEnvelopeDto,
} from './envelopeService';

// Scheduler for automated reminder processing
export { SchedulerService, schedulerService, type SchedulerConfig } from './schedulerService';
