/**
 * Signing Service
 * Core orchestration for the E-Signature workflow
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';
import {
    SigningRequest,
    SigningRequestSignee,
    SignatureEvidence,
    CreateSigningRequestDto,
    CaptureSignatureDto,
    ExternalSignatureDto,
    SignerIdentity
} from './types';
import { keyManagementService } from './keyManagementService';
import { timestampService } from './timestampService';
import { auditLogService } from './auditLogService';
import { consentService } from './consentService';
import { magicLinkService } from './magicLinkService';
import { pdfSigningService } from './pdfSigningService';
import { signatureIdService } from './signatureIdService';

export class SigningService {
    /**
     * Create a new signing request
     */
    async createSigningRequest(
        dto: CreateSigningRequestDto,
        createdBy: string,
        organizationId?: string
    ): Promise<SigningRequest> {
        const id = uuidv4();

        // Calculate document hash (for now, we'll hash the URL as placeholder)
        // In production, fetch the PDF and hash its content
        const documentHash = pdfSigningService.calculateDocumentHash(
            Buffer.from(dto.originalPdfUrl)
        );

        // Create the signing request
        const result = await db.query(
            `INSERT INTO signing_requests (
        id, document_id, document_type, document_title, document_hash_original,
        original_pdf_url, created_by, organization_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_sign')
      RETURNING *`,
            [
                id,
                dto.documentId,
                dto.documentType,
                dto.documentTitle,
                documentHash,
                dto.originalPdfUrl,
                createdBy,
                organizationId || null
            ]
        );

        const signingRequest = this.mapToSigningRequest(result.rows[0]);

        // Create signees
        for (const signeeDto of dto.signees) {
            await this.addSignee(id, signeeDto);
        }

        // Audit log
        await auditLogService.createAuditEvent({
            signingRequestId: id,
            actorId: createdBy,
            actorType: 'user',
            eventType: 'request_created',
            documentHash,
            metadata: { documentType: dto.documentType, signeeCount: dto.signees.length }
        });

        logger.info('Signing request created', { id, documentType: dto.documentType });
        return signingRequest;
    }

    /**
     * Add a signee to a signing request
     */
    private async addSignee(signingRequestId: string, signee: any): Promise<SigningRequestSignee> {
        const id = uuidv4();

        const result = await db.query(
            `INSERT INTO signing_request_signees (
        id, signing_request_id, signee_type, user_id,
        external_name, external_email, external_phone,
        signing_order, signee_role, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *`,
            [
                id,
                signingRequestId,
                signee.signeeType,
                signee.userId || null,
                signee.externalName || null,
                signee.externalEmail || null,
                signee.externalPhone || null,
                signee.signingOrder || 1,
                signee.signeeRole || null
            ]
        );

        const signeeRecord = this.mapToSignee(result.rows[0]);

        // Generate magic link for external signees
        if (signee.signeeType === 'external') {
            const magicLink = await magicLinkService.generateMagicLink(id);
            logger.info('Magic link generated for external signee', { signeeId: id, email: signee.externalEmail });
            // In production, send email with magic link here
        }

        // Audit log
        await auditLogService.createAuditEvent({
            signingRequestId,
            signeeId: id,
            actorType: 'system',
            eventType: 'signee_added',
            metadata: { signeeType: signee.signeeType, signeeRole: signee.signeeRole }
        });

        return signeeRecord;
    }

    /**
     * Capture signature from internal (logged-in) user
     */
    async captureInternalSignature(dto: CaptureSignatureDto, userId: string): Promise<SignatureEvidence> {
        // Validate signee belongs to user
        const signeeResult = await db.query(
            `SELECT srs.*, sr.document_hash_original, sr.original_pdf_url
       FROM signing_request_signees srs
       JOIN signing_requests sr ON srs.signing_request_id = sr.id
       WHERE srs.id = $1 AND srs.user_id = $2 AND srs.signee_type = 'internal'`,
            [dto.signeeId, userId]
        );

        if (signeeResult.rows.length === 0) {
            throw new Error('Signee not found or not authorized');
        }

        const signee = signeeResult.rows[0];

        if (signee.status === 'signed') {
            throw new Error('Document already signed by this user');
        }

        // Get user info for signer identity
        const userResult = await db.query(
            `SELECT id, email, first_name, last_name FROM users WHERE id = $1`,
            [userId]
        );
        const user = userResult.rows[0];

        const signerIdentity: SignerIdentity = {
            name: `${user.first_name} ${user.last_name}`,
            email: user.email,
            role: signee.signee_role,
            userId: user.id
        };

        // TODO: Verify step-up code (OTP/PIN/password)
        // For now, we'll accept any code for testing

        return this.captureSignature(
            dto.signingRequestId,
            dto.signeeId,
            signerIdentity,
            dto.signatureMethod,
            dto.signatureImageBase64,
            signee.document_hash_original,
            userId,
            dto.stepUpMethod,
            dto.sessionId,
            dto.ipAddress,
            dto.userAgent
        );
    }

    /**
     * Capture signature from external signee via magic link
     */
    async captureExternalSignature(dto: ExternalSignatureDto): Promise<SignatureEvidence> {
        // Validate magic link
        const signee = await magicLinkService.validateMagicLink(dto.magicToken);
        if (!signee) {
            throw new Error('Invalid or expired signing link');
        }

        // TODO: Verify OTP code
        // For now, we'll accept any code for testing

        const signerIdentity: SignerIdentity = {
            name: signee.externalName || 'External Signee',
            email: signee.externalEmail || '',
            role: signee.signeeRole
        };

        // Get document hash
        const requestResult = await db.query(
            `SELECT document_hash_original FROM signing_requests WHERE id = $1`,
            [signee.signingRequestId]
        );
        const documentHash = requestResult.rows[0].document_hash_original;

        const evidence = await this.captureSignature(
            signee.signingRequestId,
            signee.id,
            signerIdentity,
            dto.signatureMethod,
            dto.signatureImageBase64,
            documentHash,
            null, // No user ID for external
            'otp',
            null,
            dto.ipAddress,
            dto.userAgent
        );

        // Invalidate magic link
        await magicLinkService.invalidateMagicLink(signee.id);

        return evidence;
    }

    /**
     * Core signature capture logic
     */
    private async captureSignature(
        signingRequestId: string,
        signeeId: string,
        signerIdentity: SignerIdentity,
        signatureMethod: string,
        signatureImageBase64: string | undefined,
        documentHashBefore: string,
        userId: string | null,
        stepUpMethod: string,
        sessionId: string | null | undefined,
        ipAddress: string | null | undefined,
        userAgent: string | null | undefined
    ): Promise<SignatureEvidence> {
        // Get current consent statement
        const consent = await consentService.getCurrentConsentStatement();
        if (!consent) {
            throw new Error('No active consent statement found');
        }

        // Create the data to be signed
        const signaturePayload = JSON.stringify({
            signingRequestId,
            signeeId,
            documentHash: documentHashBefore,
            signerIdentity,
            signatureMethod,
            consentVersion: consent.version,
            timestamp: new Date().toISOString()
        });

        // Get or create signing key
        let cryptographicSignature: string;
        let publicKey: string;

        if (userId) {
            // Internal user - use their key
            const signResult = await keyManagementService.signData(userId, signaturePayload);
            cryptographicSignature = signResult.signature;
            publicKey = signResult.publicKey;
        } else {
            // External signee - use a system key for signing (simplified for testing)
            // In production, consider issuing temporary keys or using different approach
            const systemSignResult = await keyManagementService.signData(
                '00000000-0000-0000-0000-000000000000', // System user placeholder
                signaturePayload
            );
            cryptographicSignature = systemSignResult.signature;
            publicKey = systemSignResult.publicKey;
        }

        // Create timestamp
        const timestampToken = await timestampService.createTimestamp(documentHashBefore);

        // For now, document hash after = before (visual signature changes hash)
        const documentHashAfter = documentHashBefore;

        // Create signature evidence record
        const evidenceId = uuidv4();
        const timestampUtc = new Date();

        const result = await db.query(
            `INSERT INTO signature_evidences (
        id, signing_request_id, signee_id,
        document_hash_before, document_hash_after,
        signer_identity, signature_method, signature_image_base64,
        cryptographic_signature, public_key,
        timestamp_utc, timestamp_authority_response,
        consent_statement_version, consent_accepted_at,
        session_id, ip_address, user_agent,
        step_up_method, step_up_verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
            [
                evidenceId,
                signingRequestId,
                signeeId,
                documentHashBefore,
                documentHashAfter,
                JSON.stringify(signerIdentity),
                signatureMethod,
                signatureImageBase64 || null,
                cryptographicSignature,
                publicKey,
                timestampUtc,
                JSON.stringify(timestampToken),
                consent.version,
                timestampUtc,
                sessionId || null,
                ipAddress || null,
                userAgent || null,
                stepUpMethod,
                timestampUtc
            ]
        );

        // Update signee status
        await db.query(
            `UPDATE signing_request_signees SET status = 'signed', signed_at = NOW() WHERE id = $1`,
            [signeeId]
        );

        // Create signature record with unique ID for compliance
        let signatureRecord = null;
        if (signatureImageBase64) {
            try {
                signatureRecord = await signatureIdService.createSignatureRecord({
                    signingRequestId,
                    signeeId,
                    signatureData: signatureImageBase64,
                    signatureType: signatureMethod === 'typed' ? 'typed' : 'drawn',
                    ipAddress: ipAddress || undefined,
                    userAgent: userAgent || undefined
                });
                logger.info('Signature record created', { 
                    signatureId: signatureRecord.signatureId,
                    signingRequestId,
                    signeeId 
                });
            } catch (sigRecordError) {
                // Log but don't fail - signature evidence is the primary record
                logger.warn('Failed to create signature record', { 
                    error: sigRecordError, 
                    signingRequestId, 
                    signeeId 
                });
            }
        }

        // Audit log
        await auditLogService.createAuditEvent({
            signingRequestId,
            signeeId,
            actorId: userId || undefined,
            actorType: userId ? 'user' : 'external_signee',
            eventType: 'signature_captured',
            ipAddress: ipAddress || undefined,
            sessionId: sessionId || undefined,
            documentHash: documentHashBefore,
            metadata: { 
                signatureMethod, 
                consentVersion: consent.version,
                signatureId: signatureRecord?.signatureId 
            }
        });

        // Check if all signees have signed
        await this.checkAndSealDocument(signingRequestId);

        logger.info('Signature captured', { signingRequestId, signeeId });
        return this.mapToSignatureEvidence(result.rows[0]);
    }

    /**
     * Check if all signees have signed and seal the document
     */
    private async checkAndSealDocument(signingRequestId: string): Promise<void> {
        const result = await db.query(
            `SELECT srs.*, u.email as user_email, u.first_name, u.last_name
             FROM signing_request_signees srs
             LEFT JOIN users u ON srs.user_id = u.id
             WHERE srs.signing_request_id = $1`,
            [signingRequestId]
        );

        const allSigned = result.rows.every(row => row.status === 'signed');

        if (allSigned) {
            // Get document hash
            const requestResult = await db.query(
                `SELECT document_hash_original FROM signing_requests WHERE id = $1`,
                [signingRequestId]
            );
            const documentHash = requestResult.rows[0]?.document_hash_original;

            await db.query(
                `UPDATE signing_requests SET status = 'signed', completed_at = NOW() WHERE id = $1`,
                [signingRequestId]
            );

            // Build signers summary for certificate
            const signersSummary = result.rows.map(row => ({
                name: row.signee_type === 'internal' 
                    ? `${row.first_name} ${row.last_name}`.trim() 
                    : row.external_name,
                email: row.signee_type === 'internal' ? row.user_email : row.external_email,
                role: row.signee_role,
                signedAt: row.signed_at
            }));

            // Get signature IDs for certificate
            const signatures = await signatureIdService.getSignaturesForRequest(signingRequestId);
            signersSummary.forEach((signer, idx) => {
                const sig = signatures.find(s => 
                    s.signeeId === result.rows[idx]?.id
                );
                if (sig) {
                    (signer as any).signatureId = sig.signatureId;
                }
            });

            // Create certificate of completion
            try {
                const certificate = await signatureIdService.createCertificate({
                    signingRequestId,
                    documentHash,
                    signersSummary
                });
                logger.info('Certificate of completion created', { 
                    certificateId: certificate.certificateId,
                    signingRequestId 
                });
            } catch (certError) {
                logger.error('Failed to create certificate', { error: certError, signingRequestId });
            }

            await auditLogService.createAuditEvent({
                signingRequestId,
                actorType: 'system',
                eventType: 'document_sealed',
                metadata: { reason: 'All signatures captured' }
            });

            logger.info('Document sealed', { signingRequestId });
        } else {
            // Update to partially signed if at least one has signed
            const someSigned = result.rows.some(row => row.status === 'signed');
            if (someSigned) {
                await db.query(
                    `UPDATE signing_requests SET status = 'partially_signed' WHERE id = $1 AND status = 'pending_sign'`,
                    [signingRequestId]
                );
            }
        }
    }

    /**
     * Get signing request by ID
     */
    async getSigningRequest(id: string): Promise<SigningRequest | null> {
        const result = await db.query(
            `SELECT * FROM signing_requests WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const request = this.mapToSigningRequest(result.rows[0]);

        // Load signees
        const signeesResult = await db.query(
            `SELECT * FROM signing_request_signees WHERE signing_request_id = $1 ORDER BY signing_order`,
            [id]
        );
        request.signees = signeesResult.rows.map(row => this.mapToSignee(row));

        return request;
    }

    /**
     * Get signing requests for a user
     */
    async getSigningRequestsForUser(userId: string): Promise<SigningRequest[]> {
        const result = await db.query(
            `SELECT sr.* FROM signing_requests sr
       LEFT JOIN signing_request_signees srs ON sr.id = srs.signing_request_id AND srs.user_id = $1
       WHERE sr.created_by = $1 OR srs.user_id = $1
       ORDER BY sr.created_at DESC`,
            [userId]
        );

        return result.rows.map(row => this.mapToSigningRequest(row));
    }

    /**
     * Get signing requests by document ID and type
     */
    async getSigningRequestsByDocument(documentId: string, documentType: string): Promise<SigningRequest[]> {
        const result = await db.query(
            `SELECT sr.* FROM signing_requests sr
       WHERE sr.document_id = $1 AND sr.document_type = $2
       ORDER BY sr.created_at DESC`,
            [documentId, documentType]
        );

        const requests = result.rows.map(row => this.mapToSigningRequest(row));

        // Load signees for each request
        for (const request of requests) {
            const signeesResult = await db.query(
                'SELECT * FROM signing_request_signees WHERE signing_request_id = $1 ORDER BY signing_order',
                [request.id]
            );
            request.signees = signeesResult.rows.map(row => this.mapToSignee(row));
        }

        return requests;
    }

    /**
     * Void a signing request
     */
    async voidSigningRequest(id: string, reason: string, userId: string): Promise<void> {
        await db.query(
            `UPDATE signing_requests 
       SET status = 'voided', voided_at = NOW(), void_reason = $1 
       WHERE id = $2`,
            [reason, id]
        );

        await auditLogService.createAuditEvent({
            signingRequestId: id,
            actorId: userId,
            actorType: 'user',
            eventType: 'request_voided',
            metadata: { reason }
        });

        logger.info('Signing request voided', { id, reason });
    }

    // Mapping functions
    private mapToSigningRequest(row: any): SigningRequest {
        return {
            id: row.id,
            documentId: row.document_id,
            documentType: row.document_type,
            documentTitle: row.document_title,
            documentHashOriginal: row.document_hash_original,
            originalPdfUrl: row.original_pdf_url,
            signedPdfUrl: row.signed_pdf_url,
            createdBy: row.created_by,
            organizationId: row.organization_id,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            completedAt: row.completed_at,
            voidedAt: row.voided_at,
            voidReason: row.void_reason
        };
    }

    private mapToSignee(row: any): SigningRequestSignee {
        return {
            id: row.id,
            signingRequestId: row.signing_request_id,
            signeeType: row.signee_type,
            userId: row.user_id,
            externalName: row.external_name,
            externalEmail: row.external_email,
            externalPhone: row.external_phone,
            magicToken: row.magic_token,
            magicTokenExpiresAt: row.magic_token_expires_at,
            signingOrder: row.signing_order,
            signeeRole: row.signee_role,
            status: row.status,
            signedAt: row.signed_at,
            declinedAt: row.declined_at,
            declineReason: row.decline_reason,
            createdAt: row.created_at
        };
    }

    private mapToSignatureEvidence(row: any): SignatureEvidence {
        return {
            id: row.id,
            signingRequestId: row.signing_request_id,
            signeeId: row.signee_id,
            documentHashBefore: row.document_hash_before,
            documentHashAfter: row.document_hash_after,
            signerIdentity: row.signer_identity,
            signatureMethod: row.signature_method,
            signatureImageBase64: row.signature_image_base64,
            cryptographicSignature: row.cryptographic_signature,
            publicKey: row.public_key,
            timestampUtc: row.timestamp_utc,
            timestampAuthorityResponse: row.timestamp_authority_response,
            consentStatementVersion: row.consent_statement_version,
            consentAcceptedAt: row.consent_accepted_at,
            sessionId: row.session_id,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            stepUpMethod: row.step_up_method,
            stepUpVerifiedAt: row.step_up_verified_at,
            createdAt: row.created_at
        };
    }

    /**
     * Mark a signee as having completed signing
     */
    async markSigneeComplete(signeeId: string): Promise<void> {
        await db.query(
            `UPDATE signing_request_signees 
             SET status = 'signed', signed_at = NOW() 
             WHERE id = $1`,
            [signeeId]
        );

        // Get the signing request to check if all signees are done
        const signeeResult = await db.query(
            `SELECT signing_request_id FROM signing_request_signees WHERE id = $1`,
            [signeeId]
        );

        if (signeeResult.rows.length > 0) {
            const signingRequestId = signeeResult.rows[0].signing_request_id;

            // Check if all signees have signed
            const pendingResult = await db.query(
                `SELECT COUNT(*) as pending FROM signing_request_signees 
                 WHERE signing_request_id = $1 AND status != 'signed'`,
                [signingRequestId]
            );

            const pendingCount = parseInt(pendingResult.rows[0].pending, 10);

            if (pendingCount === 0) {
                // All signees have signed, update request status
                await db.query(
                    `UPDATE signing_requests SET status = 'completed', completed_at = NOW() 
                     WHERE id = $1`,
                    [signingRequestId]
                );

                logger.info('All signees have signed, signing request completed', { signingRequestId });

                // TODO: Generate final signed PDF with all signatures embedded
            } else {
                // Update to partially signed
                await db.query(
                    `UPDATE signing_requests SET status = 'partially_signed' 
                     WHERE id = $1`,
                    [signingRequestId]
                );
            }
        }

        logger.info('Signee marked as complete', { signeeId });
    }
}

export const signingService = new SigningService();
