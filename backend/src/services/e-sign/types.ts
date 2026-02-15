/**
 * E-Sign Integration Types
 * 
 * Type definitions for the E-Sign Integration Service.
 * Used by all business services when invoking e-sign capabilities.
 * 
 * @module services/e-sign/types
 */

// =============================================================================
// SOURCE MODULES
// =============================================================================

/**
 * Supported source modules that can trigger e-sign workflows
 */
export type ESignSourceModule = 
  | 'property_management'
  | 'valuation'
  | 'crm'
  | 'project_management';

/**
 * Entity types for each module
 */
export type PropertyManagementEntityType = 'tenancy' | 'lease_renewal' | 'property_document';
export type ValuationEntityType = 'valuation_report' | 'engagement_letter';
export type CRMEntityType = 'deal' | 'contract' | 'offer' | 'signature_envelope';
export type ProjectManagementEntityType = 'change_order' | 'contractor_contract' | 'draw_request';

export type ESignEntityType = 
  | PropertyManagementEntityType 
  | ValuationEntityType 
  | CRMEntityType 
  | ProjectManagementEntityType;

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Document to be signed
 */
export interface ESignDocument {
  /** Display name for the document */
  name: string;
  /** Document content as Buffer (PDF) */
  content: Buffer;
  /** MIME type - currently only PDF supported */
  mimeType: 'application/pdf';
  /** How the document was created */
  source: 'system_generated' | 'uploaded';
}

/**
 * Signer/recipient for the envelope
 */
export interface ESignSigner {
  /** Full name of the signer */
  name: string;
  /** Email address for signing invitation */
  email: string;
  /** Role in the signing workflow */
  role: 'signer' | 'cc' | 'viewer';
  /** Signing order (1 = first, 2 = second, etc.) */
  order: number;
}

/**
 * Field placement for signatures/initials/dates
 */
export interface ESignField {
  /** Type of field */
  type: 'signature' | 'initials' | 'date' | 'text';
  /** Email of the recipient who should fill this field */
  recipientEmail: string;
  /** Which document (0-indexed) */
  documentIndex: number;
  /** Page number (1-indexed) */
  page: number;
  /** X position as percentage (0-1) or absolute pixels */
  x: number;
  /** Y position as percentage (0-1) or absolute pixels */
  y: number;
  /** Width as percentage or absolute */
  width: number;
  /** Height as percentage or absolute */
  height: number;
  /** Whether the field is required for completion */
  required: boolean;
  /** Optional label for text fields */
  label?: string;
}

/**
 * Input for creating an envelope
 */
export interface CreateEnvelopeInput {
  /** Subject line for the envelope */
  subject: string;
  /** Optional message to signers */
  message?: string;
  /** Documents to be signed */
  documents: ESignDocument[];
  /** Signers and recipients */
  signers: ESignSigner[];
  /** Field placements */
  fields: ESignField[];
  /** Source module triggering the e-sign */
  sourceModule: ESignSourceModule;
  /** Type of entity in the source module */
  sourceEntityType: ESignEntityType;
  /** UUID of the source entity */
  sourceEntityId: string;
  /** Webhook URL for completion notification (optional - uses registered URL if not provided) */
  callbackUrl?: string;
  /** Number of days until expiration (default 30) */
  expiresInDays?: number;
  /** Automatically send for signing on creation (default true) */
  autoSend?: boolean;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Envelope status
 */
export type EnvelopeStatus = 'draft' | 'pending' | 'in_progress' | 'completed' | 'voided' | 'expired';

/**
 * Result from envelope creation
 */
export interface EnvelopeResult {
  /** UUID of the created envelope */
  envelopeId: string;
  /** Current status */
  status: EnvelopeStatus;
  /** Signing URLs keyed by email */
  signingUrls: Record<string, string>;
  /** Embedded signing URLs (for iframe) keyed by email */
  embeddedSigningUrls?: Record<string, string>;
  /** When the envelope expires */
  expiresAt?: Date;
  /** When the envelope was created */
  createdAt: Date;
}

/**
 * Signer information in completion event
 */
export interface CompletedSigner {
  email: string;
  name: string;
  pmtId: string;
  signedAt: Date;
  ipAddress?: string;
}

/**
 * Completion event sent via webhook
 */
export interface CompletionEvent {
  /** Event type */
  event: 'envelope.completed' | 'envelope.voided' | 'envelope.expired';
  /** Timestamp of the event */
  timestamp: Date;
  /** Envelope information */
  envelope: {
    id: string;
    subject: string;
    completedAt?: Date;
    voidedAt?: Date;
    voidReason?: string;
  };
  /** Source context linking back to business entity */
  sourceContext: {
    module: ESignSourceModule;
    entityType: ESignEntityType;
    entityId: string;
  };
  /** Signed documents */
  documents: Array<{
    id: string;
    name: string;
    signedUrl: string;
    certificateUrl?: string;
  }>;
  /** Signer information */
  signers: CompletedSigner[];
  /** Security/audit information */
  security: {
    hash: string;
    algorithm: 'SHA-256';
    verifyUrl: string;
  };
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

/**
 * Webhook registration input
 */
export interface WebhookRegistration {
  /** Module registering the webhook */
  sourceModule: ESignSourceModule;
  /** URL to receive webhook events */
  callbackUrl: string;
  /** Events to subscribe to */
  events: ('envelope.completed' | 'envelope.voided' | 'envelope.expired' | 'signer.completed')[];
  /** Secret for HMAC signature verification */
  secret?: string;
}

/**
 * Webhook delivery status
 */
export interface WebhookDelivery {
  id: string;
  envelopeId: string;
  event: string;
  deliveredAt?: Date;
  attempts: number;
  lastAttemptAt: Date;
  statusCode?: number;
  success: boolean;
  error?: string;
}

// =============================================================================
// SERVICE INTERFACE
// =============================================================================

/**
 * E-Sign Integration Service Interface
 * 
 * This is the ONLY interface business services should use to trigger e-sign workflows.
 */
export interface IESignIntegrationService {
  /**
   * Create an envelope and optionally send for signing
   */
  createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeResult>;
  
  /**
   * Send an existing envelope for signing (if not auto-sent on creation)
   */
  sendForSigning(envelopeId: string): Promise<void>;
  
  /**
   * Get signing URL for a specific recipient
   */
  getSigningUrl(envelopeId: string, recipientEmail: string): Promise<string>;
  
  /**
   * Get embedded signing URL (for iframe integration)
   */
  getEmbeddedSigningUrl(envelopeId: string, recipientEmail: string): Promise<string>;
  
  /**
   * Get envelope status and details
   */
  getEnvelopeStatus(envelopeId: string): Promise<EnvelopeResult>;
  
  /**
   * Download signed document
   */
  downloadSignedDocument(envelopeId: string): Promise<Buffer>;
  
  /**
   * Download certificate of completion
   */
  downloadCertificate(envelopeId: string): Promise<Buffer>;
  
  /**
   * Void an envelope
   */
  voidEnvelope(envelopeId: string, reason: string): Promise<void>;
  
  /**
   * Register a webhook for a module
   */
  registerWebhook(registration: WebhookRegistration): Promise<void>;
  
  /**
   * Unregister webhook for a module
   */
  unregisterWebhook(sourceModule: ESignSourceModule): Promise<void>;
}
