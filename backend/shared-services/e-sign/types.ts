/**
 * E-Sign Shared Services Types
 * 
 * Type definitions for the low-level E-Signature services.
 * Used by signingService, pdfSigningService, etc.
 * 
 * @module shared-services/e-sign/types
 */

// =============================================================================
// SIGNING REQUEST TYPES
// =============================================================================

/**
 * Status of a signing request
 */
export type SigningRequestStatus = 'pending_sign' | 'in_progress' | 'completed' | 'cancelled' | 'expired';

/**
 * Signee status
 */
export type SigneeStatus = 'pending' | 'signed' | 'declined';

/**
 * A signing request created by the system
 */
export interface SigningRequest {
    id: string;
    documentId: string;
    documentType: string;
    documentTitle: string;
    documentHashOriginal: string;
    documentHashSigned?: string;
    originalPdfUrl: string;
    signedPdfUrl?: string;
    createdBy: string;
    organizationId?: string;
    status: SigningRequestStatus;
    completedAt?: Date;
    signedDocumentUrl?: string;
    signees?: SigningRequestSignee[];
    voidedAt?: Date;
    voidReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * A signee (signer) on a signing request
 */
export interface SigningRequestSignee {
    id: string;
    signingRequestId: string;
    name?: string;
    email?: string;
    role?: 'signer' | 'cc' | 'viewer';
    order?: number;
    signeeType?: string;
    userId?: string;
    externalName?: string;
    externalEmail?: string;
    externalPhone?: string;
    magicToken?: string;
    magicTokenExpiresAt?: Date;
    signingOrder?: number;
    signeeRole?: string;
    status: SigneeStatus;
    signedAt?: Date;
    declinedAt?: Date;
    declineReason?: string;
    magicLinkToken?: string;
    magicLinkExpiresAt?: Date;
    consentRecordedAt?: Date;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt?: Date;
}

/**
 * Signature evidence for audit and verification
 */
export interface SignatureEvidence {
    id?: string;
    signatureId?: string;
    signingRequestId: string;
    signeeId: string;
    documentHashBefore?: string;
    documentHashAfter?: string;
    signerIdentity?: Record<string, any>;
    signatureMethod?: string;
    signatureImageBase64?: string;
    signatureTypedName?: string;
    signatureType?: 'drawn' | 'typed' | 'uploaded';
    signatureHash?: string;
    cryptographicSignature?: string;
    publicKey?: string;
    certificateChain?: string;
    timestamp?: Date;
    timestampUtc?: Date;
    timestampToken?: string;
    timestampAuthorityResponse?: string;
    consentStatementVersion?: string;
    consentAcceptedAt?: Date;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    stepUpMethod?: string;
    stepUpVerifiedAt?: Date;
    geoLocation?: {
        lat: number;
        lng: number;
        accuracy: number;
    };
    deviceFingerprint?: string;
    consentGiven?: boolean;
    consentText?: string;
    consentTimestamp?: Date;
    createdAt?: Date;
}

/**
 * Signer identity information
 */
export interface SignerIdentity {
    userId?: string;
    email: string;
    name: string;
    role?: string;
    ipAddress?: string;
    userAgent?: string;
    isAuthenticated?: boolean;
    authMethod?: 'internal' | 'magic_link' | 'sso';
}

// =============================================================================
// INPUT DTOS
// =============================================================================

/**
 * DTO for creating a signing request
 */
export interface CreateSigningRequestDto {
    documentId: string;
    documentType: string;
    documentTitle: string;
    originalPdfUrl?: string;
    signees: Array<{
        name?: string;
        email?: string;
        role?: 'signer' | 'cc' | 'viewer';
        order?: number;
        signeeType?: string;
        externalName?: string;
        externalEmail?: string;
        externalPhone?: string;
        userId?: string;
        signingOrder?: number;
        signeeRole?: string;
    }>;
    organizationId?: string;
    expiresAt?: Date;
    expiresInDays?: number;
    message?: string;
    requiresSequentialSigning?: boolean;
}

/**
 * DTO for capturing internal user signature
 */
export interface CaptureSignatureDto {
    signingRequestId: string;
    signeeId: string;
    signatureImageBase64?: string;
    signatureTypedName?: string;
    signatureType?: 'drawn' | 'typed' | 'uploaded';
    signatureMethod?: string;
    stepUpMethod?: string;
    sessionId?: string;
    consentGiven?: boolean;
    consentText?: string;
    ipAddress?: string;
    userAgent?: string;
    geoLocation?: {
        lat: number;
        lng: number;
        accuracy: number;
    };
}

/**
 * DTO for external signer signature capture
 */
export interface ExternalSignatureDto {
    token?: string;
    magicToken?: string;
    signatureImageBase64?: string;
    signatureTypedName?: string;
    signatureType?: 'drawn' | 'typed' | 'uploaded';
    signatureMethod?: string;
    consentGiven?: boolean;
    consentText?: string;
    ipAddress?: string;
    userAgent?: string;
    geoLocation?: {
        lat: number;
        lng: number;
        accuracy: number;
    };
    otpCode?: string;
    fieldId?: string;
}

// =============================================================================
// ENVELOPE TYPES (DocuSign-style)
// =============================================================================

/**
 * Envelope status enumeration
 */
export enum EnvelopeStatus {
    DRAFT = 'draft',
    SENT = 'sent',
    DELIVERED = 'delivered',
    SIGNED = 'signed',
    COMPLETED = 'completed',
    DECLINED = 'declined',
    VOIDED = 'voided',
    EXPIRED = 'expired'
}

/**
 * An envelope containing documents for signing
 */
export interface Envelope {
    id: string;
    organizationId: string;
    createdBy: string;
    name: string;
    message?: string;
    status: EnvelopeStatus;
    contextType?: string;
    contextEntityId?: string;
    contextEntityName?: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    documentImageUrl?: string;
    signedPdfUrl?: string;
    expiresAt?: Date;
    completedAt?: Date;
    voidedAt?: Date;
    voidReason?: string;
    fields?: any[];
    signers?: any[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * A signer on an envelope
 */
export interface EnvelopeSigner {
    id: string;
    envelopeId: string;
    name: string;
    email: string;
    role: 'signer' | 'cc' | 'viewer';
    order: number;
    status: SigneeStatus;
    accessToken?: string;
    signedAt?: Date;
    declinedAt?: Date;
    declineReason?: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * A signature field on an envelope
 */
export interface EnvelopeField {
    id: string;
    envelopeId: string;
    signerId: string;
    type: 'signature' | 'initials' | 'date' | 'date_signed' | 'text';
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
    label?: string;
    value?: string;
    signedAt?: Date;
}

// =============================================================================
// TEMPLATE TYPES
// =============================================================================

/**
 * A reusable template for envelopes
 */
export interface Template {
    id: string;
    organizationId: string;
    createdBy: string;
    name: string;
    description?: string;
    category?: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    isActive: boolean;
    usageCount: number;
    lastUsedAt?: Date;
    defaultSigners?: Array<{
        name?: string;
        email?: string;
        role: 'signer' | 'cc' | 'viewer';
        order: number;
    }>;
    defaultFields?: EnvelopeField[];
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * DTO for creating a template
 */
export interface CreateTemplateDto {
    name: string;
    description?: string;
    category?: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    defaultSigners?: Array<{
        name?: string;
        email?: string;
        role: 'signer' | 'cc' | 'viewer';
        order: number;
    }>;
    defaultFields?: Array<{
        type: 'signature' | 'initials' | 'date' | 'date_signed' | 'text';
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        required: boolean;
        label?: string;
    }>;
    metadata?: Record<string, any>;
}

/**
 * DTO for updating a template
 */
export interface UpdateTemplateDto extends Partial<CreateTemplateDto> {
    isActive?: boolean;
}

// =============================================================================
// CONSENT TYPES
// =============================================================================

/**
 * A versioned consent statement
 */
export interface ConsentStatementVersion {
    id: string;
    version: string;
    statementText: string;
    effectiveFrom?: Date;
    effectiveUntil?: Date;
    isCurrent: boolean;
    createdAt: Date;
}

// =============================================================================
// KEY MANAGEMENT TYPES
// =============================================================================

/**
 * A user's signing key pair
 */
export interface UserSigningKey {
    id: string;
    userId: string;
    publicKey: string;
    privateKeyEncrypted: string;
    keyAlgorithm: string;
    createdAt: Date;
    lastUsedAt?: Date;
    isActive: boolean;
}

// =============================================================================
// QUERY OPTIONS
// =============================================================================

/**
 * Options for listing templates
 */
export interface ListTemplatesOptions {
    category?: string;
    search?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
}

/**
 * Options for listing envelopes
 */
export interface ListEnvelopesOptions {
    status?: EnvelopeStatus | string;
    contextType?: string;
    contextEntityId?: string;
    signerEmail?: string;
    limit?: number;
    offset?: number;
}

/**
 * DTO for creating an envelope
 */
export interface CreateEnvelopeDto {
    name: string;
    message?: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    contextType?: string;
    contextEntityId?: string;
    contextEntityName?: string;
    signers: Array<{
        name: string;
        email: string;
        role: 'signer' | 'cc' | 'viewer';
        order: number;
    }>;
    fields?: Array<{
        signerEmail: string;
        type: 'signature' | 'initials' | 'date' | 'date_signed' | 'text';
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        required: boolean;
        label?: string;
        value?: string;
        signed?: boolean;
    }>;
    expiresInDays?: number;
    autoSend?: boolean;
    initialStatus?: EnvelopeStatus | 'completed';
}

// =============================================================================
// AUDIT LOG TYPES
// =============================================================================

/**
 * Actor types for audit events
 */
export type ActorType = 'user' | 'system' | 'signee' | 'signer' | 'external_signee';

/**
 * An audit log event
 */
export interface AuditEvent {
    id?: string;
    eventId: string;
    signingRequestId?: string;
    signeeId?: string;
    actorId?: string;
    actorType: ActorType;
    eventType: string;
    timestampUtc: Date;
    ipAddress?: string;
    sessionId?: string;
    documentHash?: string;
    metadata?: Record<string, any>;
    previousHash?: string;
    rowHash: string;
    createdAt?: Date | string;
}

/**
 * DTO for creating an audit event
 */
export interface CreateAuditEventDto {
    signingRequestId?: string;
    signeeId?: string;
    actorId?: string;
    actorType: ActorType;
    eventType: string;
    ipAddress?: string;
    sessionId?: string;
    documentHash?: string;
    metadata?: Record<string, any>;
}
