/**
 * E-Sign Shared Services
 * 
 * TypeScript services for PROPMETRIK E-Signature functionality.
 * All services are integrated with the Express backend via routes/eSign.ts
 * 
 * @module shared-services/e-sign
 */

// Core signing workflow
export { SigningService, signingService } from './signingService';

// PDF signing and embedding
export { PdfSigningService, pdfSigningService } from './pdfSigningService';

// Audit logging
export { AuditLogService, auditLogService } from './auditLogService';

// Consent management
export { ConsentService, consentService } from './consentService';

// Magic link generation for external signers
export { MagicLinkService, magicLinkService } from './magicLinkService';

// Key management for cryptographic signatures
export { KeyManagementService, keyManagementService } from './keyManagementService';

// Timestamp service for RFC 3161 compliance
export { TimestampService, timestampService } from './timestampService';

// Signature ID generation for unique identifiers
export { SignatureIdService, signatureIdService } from './signatureIdService';

// Template service for reusable document templates
export { TemplateService, templateService } from './templateService';

// Envelope service factory for DocuSign-style envelopes
export { EnvelopeService, createEnvelopeService } from './envelopeService';

// Re-export all types from local types file
export * from './types';

// Re-export integration types from src/services/e-sign/types
export type {
    ESignSourceModule,
    ESignEntityType,
    ESignDocument,
    ESignSigner,
    ESignField,
    CreateEnvelopeInput,
    EnvelopeResult,
    CompletedSigner,
    CompletionEvent,
    WebhookRegistration,
    WebhookDelivery,
    IESignIntegrationService
} from './integration/types';
