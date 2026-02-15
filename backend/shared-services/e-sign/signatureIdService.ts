/**
 * Signature ID Service
 * Generates unique, verifiable signature and certificate IDs for compliance
 * 
 * Format: SIG-YYYY-ORG-NNNNNN-CCCC (Signature ID)
 *         CERT-YYYY-ORG-NNNNNN-CCCC (Certificate ID)
 * 
 * Where:
 *   YYYY = Year (e.g., 2026)
 *   ORG = Organization code (e.g., PM for PROPMETRIK)
 *   NNNNNN = 6-digit sequence number
 *   CCCC = 4-character HMAC checksum for verification
 */

import crypto from 'crypto';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';

const SIGNATURE_SECRET = process.env.ESIGN_SIGNATURE_SECRET || 'propmetrik-esign-secret-2026';

export interface SignatureIdComponents {
    prefix: 'SIG' | 'CERT';
    year: string;
    organizationCode: string;
    sequenceNumber: string;
    checksum: string;
}

export interface SignatureRecord {
    id: string;
    signatureId: string;
    envelopeId?: string;
    signerId?: string;
    fieldId?: string;
    signingRequestId?: string;
    signeeId?: string;
    signatureData: string;
    signatureType: 'drawn' | 'typed' | 'uploaded';
    signatureHash: string;
    ipAddress?: string;
    userAgent?: string;
    geolocation?: Record<string, any>;
    deviceFingerprint?: string;
    signedAt: Date;
}

export interface CreateSignatureRecordDto {
    // Context (one of these pairs required)
    envelopeId?: string;
    signerId?: string;
    fieldId?: string;
    signingRequestId?: string;
    signeeId?: string;
    
    // Signature data
    signatureData: string;
    signatureType?: 'drawn' | 'typed' | 'uploaded';
    
    // Legal metadata
    ipAddress?: string;
    userAgent?: string;
    geolocation?: Record<string, any>;
    deviceFingerprint?: string;
}

export interface CertificateRecord {
    id: string;
    certificateId: string;
    envelopeId?: string;
    signingRequestId?: string;
    certificatePdfUrl?: string;
    certificateHtml?: string;
    documentHash?: string;
    signersSummary: any[];
    generatedAt: Date;
}

export class SignatureIdService {
    /**
     * Generate a unique, verifiable signature ID
     * Format: SIG-2026-PM-000001-A7F3
     */
    async generateSignatureId(organizationCode: string = 'PM'): Promise<string> {
        const year = new Date().getFullYear().toString();
        const pattern = `SIG-${year}-${organizationCode}-%`;
        
        // Get next sequence number from database
        const result = await db.query(
            `SELECT COALESCE(
                MAX(
                    CAST(
                        SPLIT_PART(signature_id, '-', 4) AS INTEGER
                    )
                ), 
                0
            ) + 1 as next_seq
             FROM esign_signatures 
             WHERE signature_id LIKE $1`,
            [pattern]
        );
        
        const sequenceNumber = result.rows[0]?.next_seq || 1;
        const seqStr = sequenceNumber.toString().padStart(6, '0');
        
        // Create base ID
        const baseId = `SIG-${year}-${organizationCode}-${seqStr}`;
        
        // Generate 4-char HMAC checksum
        const hash = crypto
            .createHmac('sha256', SIGNATURE_SECRET)
            .update(baseId)
            .digest('hex');
        const checksum = hash.substring(0, 4).toUpperCase();
        
        return `${baseId}-${checksum}`;
    }

    /**
     * Verify a signature ID's checksum is valid
     */
    verifySignatureId(signatureId: string): boolean {
        const parts = signatureId.split('-');
        if (parts.length !== 5) return false;
        
        const [prefix, year, orgCode, seq, providedChecksum] = parts;
        if (prefix !== 'SIG') return false;
        
        const baseId = `${prefix}-${year}-${orgCode}-${seq}`;
        const hash = crypto
            .createHmac('sha256', SIGNATURE_SECRET)
            .update(baseId)
            .digest('hex');
        const expectedChecksum = hash.substring(0, 4).toUpperCase();
        
        return providedChecksum === expectedChecksum;
    }

    /**
     * Parse a signature ID into its components
     */
    parseSignatureId(signatureId: string): SignatureIdComponents | null {
        const parts = signatureId.split('-');
        if (parts.length !== 5) return null;
        
        const [prefix, year, orgCode, seq, checksum] = parts;
        if (prefix !== 'SIG' && prefix !== 'CERT') return null;
        
        return {
            prefix: prefix as 'SIG' | 'CERT',
            year,
            organizationCode: orgCode,
            sequenceNumber: seq,
            checksum
        };
    }

    /**
     * Generate SHA-256 hash of signature data for tamper detection
     */
    generateSignatureHash(signatureData: string): string {
        return crypto.createHash('sha256').update(signatureData).digest('hex');
    }

    /**
     * Generate a unique certificate ID
     * Format: CERT-2026-PM-000001-B2C4
     */
    async generateCertificateId(organizationCode: string = 'PM'): Promise<string> {
        const year = new Date().getFullYear().toString();
        const pattern = `CERT-${year}-${organizationCode}-%`;
        
        const result = await db.query(
            `SELECT COALESCE(
                MAX(
                    CAST(
                        SPLIT_PART(certificate_id, '-', 4) AS INTEGER
                    )
                ), 
                0
            ) + 1 as next_seq
             FROM esign_certificates 
             WHERE certificate_id LIKE $1`,
            [pattern]
        );
        
        const sequenceNumber = result.rows[0]?.next_seq || 1;
        const seqStr = sequenceNumber.toString().padStart(6, '0');
        
        const baseId = `CERT-${year}-${organizationCode}-${seqStr}`;
        const hash = crypto
            .createHmac('sha256', SIGNATURE_SECRET)
            .update(baseId)
            .digest('hex');
        const checksum = hash.substring(0, 4).toUpperCase();
        
        return `${baseId}-${checksum}`;
    }

    /**
     * Verify a certificate ID's checksum
     */
    verifyCertificateId(certificateId: string): boolean {
        const parts = certificateId.split('-');
        if (parts.length !== 5) return false;
        
        const [prefix, year, orgCode, seq, providedChecksum] = parts;
        if (prefix !== 'CERT') return false;
        
        const baseId = `${prefix}-${year}-${orgCode}-${seq}`;
        const hash = crypto
            .createHmac('sha256', SIGNATURE_SECRET)
            .update(baseId)
            .digest('hex');
        const expectedChecksum = hash.substring(0, 4).toUpperCase();
        
        return providedChecksum === expectedChecksum;
    }

    /**
     * Create a signature record in the database
     */
    async createSignatureRecord(dto: CreateSignatureRecordDto): Promise<SignatureRecord> {
        // Validate context
        const hasEnvelopeContext = dto.envelopeId && dto.signerId;
        const hasRequestContext = dto.signingRequestId && dto.signeeId;
        
        if (!hasEnvelopeContext && !hasRequestContext) {
            throw new Error('Either envelope/signer or signingRequest/signee context is required');
        }

        // Generate unique signature ID
        const signatureId = await this.generateSignatureId();
        
        // Generate signature hash for tamper detection
        const signatureHash = this.generateSignatureHash(dto.signatureData);

        const result = await db.query(
            `INSERT INTO esign_signatures (
                signature_id,
                envelope_id, signer_id, field_id,
                signing_request_id, signee_id,
                signature_data, signature_type, signature_hash,
                ip_address, user_agent, geolocation, device_fingerprint
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                signatureId,
                dto.envelopeId || null,
                dto.signerId || null,
                dto.fieldId || null,
                dto.signingRequestId || null,
                dto.signeeId || null,
                dto.signatureData,
                dto.signatureType || 'drawn',
                signatureHash,
                dto.ipAddress || null,
                dto.userAgent || null,
                dto.geolocation ? JSON.stringify(dto.geolocation) : null,
                dto.deviceFingerprint || null
            ]
        );

        const record = this.mapToSignatureRecord(result.rows[0]);
        
        logger.info('Signature record created', { 
            signatureId, 
            envelopeId: dto.envelopeId,
            signingRequestId: dto.signingRequestId 
        });
        
        return record;
    }

    /**
     * Get signature record by signature ID
     */
    async getSignatureById(signatureId: string): Promise<SignatureRecord | null> {
        const result = await db.query(
            `SELECT * FROM esign_signatures WHERE signature_id = $1`,
            [signatureId]
        );
        
        if (result.rows.length === 0) return null;
        return this.mapToSignatureRecord(result.rows[0]);
    }

    /**
     * Get all signatures for an envelope
     */
    async getSignaturesForEnvelope(envelopeId: string): Promise<SignatureRecord[]> {
        const result = await db.query(
            `SELECT * FROM esign_signatures WHERE envelope_id = $1 ORDER BY signed_at ASC`,
            [envelopeId]
        );
        
        return result.rows.map(row => this.mapToSignatureRecord(row));
    }

    /**
     * Get all signatures for a signing request
     */
    async getSignaturesForRequest(signingRequestId: string): Promise<SignatureRecord[]> {
        const result = await db.query(
            `SELECT * FROM esign_signatures WHERE signing_request_id = $1 ORDER BY signed_at ASC`,
            [signingRequestId]
        );
        
        return result.rows.map(row => this.mapToSignatureRecord(row));
    }

    /**
     * Create a certificate of completion
     */
    async createCertificate(params: {
        envelopeId?: string;
        signingRequestId?: string;
        documentHash: string;
        signersSummary: any[];
        certificatePdfUrl?: string;
        certificateHtml?: string;
    }): Promise<CertificateRecord> {
        if (!params.envelopeId && !params.signingRequestId) {
            throw new Error('Either envelopeId or signingRequestId is required');
        }

        const certificateId = await this.generateCertificateId();

        const result = await db.query(
            `INSERT INTO esign_certificates (
                certificate_id,
                envelope_id, signing_request_id,
                document_hash, signers_summary,
                certificate_pdf_url, certificate_html
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                certificateId,
                params.envelopeId || null,
                params.signingRequestId || null,
                params.documentHash,
                JSON.stringify(params.signersSummary),
                params.certificatePdfUrl || null,
                params.certificateHtml || null
            ]
        );

        const record = this.mapToCertificateRecord(result.rows[0]);
        
        logger.info('Certificate of completion created', { 
            certificateId, 
            envelopeId: params.envelopeId,
            signingRequestId: params.signingRequestId 
        });
        
        return record;
    }

    /**
     * Get certificate by envelope ID
     */
    async getCertificateForEnvelope(envelopeId: string): Promise<CertificateRecord | null> {
        const result = await db.query(
            `SELECT * FROM esign_certificates WHERE envelope_id = $1`,
            [envelopeId]
        );
        
        if (result.rows.length === 0) return null;
        return this.mapToCertificateRecord(result.rows[0]);
    }

    /**
     * Get certificate by signing request ID
     */
    async getCertificateForRequest(signingRequestId: string): Promise<CertificateRecord | null> {
        const result = await db.query(
            `SELECT * FROM esign_certificates WHERE signing_request_id = $1`,
            [signingRequestId]
        );
        
        if (result.rows.length === 0) return null;
        return this.mapToCertificateRecord(result.rows[0]);
    }

    /**
     * Verify signature integrity
     */
    async verifySignatureIntegrity(signatureId: string): Promise<{
        valid: boolean;
        checks: {
            idChecksumValid: boolean;
            dataHashMatches: boolean;
            recordExists: boolean;
        };
    }> {
        const checks = {
            idChecksumValid: this.verifySignatureId(signatureId),
            dataHashMatches: false,
            recordExists: false
        };

        if (!checks.idChecksumValid) {
            return { valid: false, checks };
        }

        const record = await this.getSignatureById(signatureId);
        if (!record) {
            return { valid: false, checks };
        }
        
        checks.recordExists = true;
        
        // Verify signature data hasn't been tampered with
        const currentHash = this.generateSignatureHash(record.signatureData);
        checks.dataHashMatches = currentHash === record.signatureHash;

        return {
            valid: checks.idChecksumValid && checks.recordExists && checks.dataHashMatches,
            checks
        };
    }

    private mapToSignatureRecord(row: any): SignatureRecord {
        return {
            id: row.id,
            signatureId: row.signature_id,
            envelopeId: row.envelope_id,
            signerId: row.signer_id,
            fieldId: row.field_id,
            signingRequestId: row.signing_request_id,
            signeeId: row.signee_id,
            signatureData: row.signature_data,
            signatureType: row.signature_type,
            signatureHash: row.signature_hash,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            geolocation: row.geolocation,
            deviceFingerprint: row.device_fingerprint,
            signedAt: row.signed_at
        };
    }

    private mapToCertificateRecord(row: any): CertificateRecord {
        return {
            id: row.id,
            certificateId: row.certificate_id,
            envelopeId: row.envelope_id,
            signingRequestId: row.signing_request_id,
            certificatePdfUrl: row.certificate_pdf_url,
            certificateHtml: row.certificate_html,
            documentHash: row.document_hash,
            signersSummary: typeof row.signers_summary === 'string' 
                ? JSON.parse(row.signers_summary) 
                : row.signers_summary || [],
            generatedAt: row.generated_at
        };
    }
}

export const signatureIdService = new SignatureIdService();
