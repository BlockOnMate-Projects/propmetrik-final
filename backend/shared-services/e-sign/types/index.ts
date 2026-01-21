/**
 * E-Signature Types
 * Core type definitions for the in-house E-Sign system
 */

// =====================================================
// SIGNING REQUEST TYPES
// =====================================================

export type SigningRequestStatus =
    | 'draft'
    | 'pending_sign'
    | 'partially_signed'
    | 'signed'
    | 'voided';

export type SigneeType = 'internal' | 'external';
export type SigneeStatus = 'pending' | 'viewed' | 'signed' | 'declined';
export type SignatureMethod = 'click_to_sign' | 'typed_name' | 'drawn_signature';
export type StepUpMethod = 'otp' | 'pin' | 'password';

export interface SigningRequest {
    id: string;
    documentId: string;
    documentType: string;
    documentTitle: string;
    documentHashOriginal: string;
    originalPdfUrl: string;
    signedPdfUrl?: string;
    createdBy: string;
    organizationId?: string;
    status: SigningRequestStatus;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    voidedAt?: Date;
    voidReason?: string;
    signees?: SigningRequestSignee[];
}

export interface CreateSigningRequestDto {
    documentId: string;
    documentType: string;
    documentTitle: string;
    originalPdfUrl: string;
    signees: CreateSigneeDto[];
}

export interface CreateSigneeDto {
    signeeType: SigneeType;
    userId?: string; // For internal signees
    externalName?: string;
    externalEmail?: string;
    externalPhone?: string;
    signingOrder?: number;
    signeeRole?: string;
}

export interface SigningRequestSignee {
    id: string;
    signingRequestId: string;
    signeeType: SigneeType;
    userId?: string;
    externalName?: string;
    externalEmail?: string;
    externalPhone?: string;
    magicToken?: string;
    magicTokenExpiresAt?: Date;
    signingOrder: number;
    signeeRole?: string;
    status: SigneeStatus;
    signedAt?: Date;
    declinedAt?: Date;
    declineReason?: string;
    createdAt: Date;
}

// =====================================================
// SIGNATURE EVIDENCE TYPES
// =====================================================

export interface SignerIdentity {
    name: string;
    email: string;
    role?: string;
    userId?: string;
}

export interface SignatureEvidence {
    id: string;
    signingRequestId: string;
    signeeId: string;
    documentHashBefore: string;
    documentHashAfter: string;
    signerIdentity: SignerIdentity;
    signatureMethod: SignatureMethod;
    signatureImageBase64?: string;
    cryptographicSignature: string;
    publicKey: string;
    timestampUtc: Date;
    timestampAuthorityResponse?: string;
    consentStatementVersion: string;
    consentAcceptedAt: Date;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    stepUpMethod?: StepUpMethod;
    stepUpVerifiedAt?: Date;
    createdAt: Date;
}

export interface CaptureSignatureDto {
    signingRequestId: string;
    signeeId: string;
    signatureMethod: SignatureMethod;
    signatureImageBase64?: string; // Required for typed_name and drawn_signature
    stepUpMethod: StepUpMethod;
    stepUpCode: string; // OTP, PIN, or password
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface ExternalSignatureDto {
    magicToken: string;
    signatureMethod: SignatureMethod;
    signatureImageBase64?: string;
    otpCode?: string;
    fieldId?: string;
    ipAddress?: string;
    userAgent?: string;
}

// =====================================================
// AUDIT EVENT TYPES
// =====================================================

export type AuditEventType =
    | 'request_created'
    | 'signee_added'
    | 'document_viewed'
    | 'consent_given'
    | 'step_up_verified'
    | 'signature_captured'
    | 'document_sealed'
    | 'request_voided'
    | 'magic_link_sent'
    | 'magic_link_accessed';

export type AuditActorType = 'user' | 'system' | 'external_signee';

export interface AuditEvent {
    id: number;
    eventId: string;
    signingRequestId?: string;
    signeeId?: string;
    actorId?: string;
    actorType: AuditActorType;
    eventType: AuditEventType;
    timestampUtc: Date;
    ipAddress?: string;
    sessionId?: string;
    documentHash?: string;
    metadata: Record<string, any>;
    previousHash?: string;
    rowHash: string;
    createdAt: Date;
}

export interface CreateAuditEventDto {
    signingRequestId?: string;
    signeeId?: string;
    actorId?: string;
    actorType: AuditActorType;
    eventType: AuditEventType;
    ipAddress?: string;
    sessionId?: string;
    documentHash?: string;
    metadata?: Record<string, any>;
}

// =====================================================
// KEY MANAGEMENT TYPES
// =====================================================

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

// =====================================================
// CONSENT TYPES
// =====================================================

export interface ConsentStatementVersion {
    id: string;
    version: string;
    statementText: string;
    effectiveFrom: Date;
    effectiveUntil?: Date;
    isCurrent: boolean;
    createdAt: Date;
}
