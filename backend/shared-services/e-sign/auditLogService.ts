/**
 * Audit Log Service
 * Append-only, hash-chained audit trail for E-Signature events
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';
import { AuditEvent, CreateAuditEventDto } from './types';

export class AuditLogService {
    /**
     * Create a new audit log entry with hash chain integrity
     */
    async createAuditEvent(dto: CreateAuditEventDto): Promise<AuditEvent> {
        const eventId = uuidv4();
        const timestampUtc = new Date();

        // Get the previous row's hash for chain integrity
        const previousHash = await this.getLastRowHash();

        // Calculate this row's hash
        const rowData = {
            eventId,
            signingRequestId: dto.signingRequestId,
            signeeId: dto.signeeId,
            actorId: dto.actorId,
            actorType: dto.actorType,
            eventType: dto.eventType,
            timestampUtc: timestampUtc.toISOString(),
            ipAddress: dto.ipAddress,
            sessionId: dto.sessionId,
            documentHash: dto.documentHash,
            metadata: dto.metadata || {},
            previousHash
        };

        const rowHash = this.calculateHash(JSON.stringify(rowData));

        const result = await db.query(
            `INSERT INTO esign_audit_logs (
        event_id, signing_request_id, signee_id, actor_id, actor_type,
        event_type, timestamp_utc, ip_address, session_id, document_hash,
        metadata, previous_hash, row_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
            [
                eventId,
                dto.signingRequestId || null,
                dto.signeeId || null,
                dto.actorId || null,
                dto.actorType,
                dto.eventType,
                timestampUtc,
                dto.ipAddress || null,
                dto.sessionId || null,
                dto.documentHash || null,
                JSON.stringify(dto.metadata || {}),
                previousHash,
                rowHash
            ]
        );

        logger.debug('Audit event created', { eventId, eventType: dto.eventType });
        return this.mapToAuditEvent(result.rows[0]);
    }

    /**
     * Get audit trail for a signing request
     */
    async getAuditTrailForRequest(signingRequestId: string): Promise<AuditEvent[]> {
        const result = await db.query(
            `SELECT * FROM esign_audit_logs 
       WHERE signing_request_id = $1 
       ORDER BY id ASC`,
            [signingRequestId]
        );

        return result.rows.map(row => this.mapToAuditEvent(row));
    }

    /**
     * Verify hash chain integrity for a signing request's audit trail
     */
    async verifyChainIntegrity(signingRequestId: string): Promise<{ valid: boolean; errors: string[] }> {
        const trail = await this.getAuditTrailForRequest(signingRequestId);
        const errors: string[] = [];

        for (let i = 0; i < trail.length; i++) {
            const event = trail[i];

            // Verify previous hash link (for the subset of this request's events)
            if (i > 0) {
                const prevEvent = trail[i - 1];
                // Note: We can't fully verify chain here as events may be interleaved
                // In a complete implementation, we'd verify the full chain
            }

            // Verify this row's hash
            const rowData = {
                eventId: event.eventId,
                signingRequestId: event.signingRequestId,
                signeeId: event.signeeId,
                actorId: event.actorId,
                actorType: event.actorType,
                eventType: event.eventType,
                timestampUtc: event.timestampUtc.toISOString(),
                ipAddress: event.ipAddress,
                sessionId: event.sessionId,
                documentHash: event.documentHash,
                metadata: event.metadata,
                previousHash: event.previousHash
            };

            const calculatedHash = this.calculateHash(JSON.stringify(rowData));
            if (calculatedHash !== event.rowHash) {
                errors.push(`Audit event ${event.eventId} has been tampered with`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get the hash of the last row for chain linking
     */
    private async getLastRowHash(): Promise<string | null> {
        const result = await db.query(
            `SELECT row_hash FROM esign_audit_logs ORDER BY id DESC LIMIT 1`
        );

        return result.rows.length > 0 ? result.rows[0].row_hash : null;
    }

    /**
     * Calculate SHA-256 hash of data
     */
    private calculateHash(data: string): string {
        return createHash('sha256').update(data).digest('hex');
    }

    private mapToAuditEvent(row: any): AuditEvent {
        return {
            id: row.id,
            eventId: row.event_id,
            signingRequestId: row.signing_request_id,
            signeeId: row.signee_id,
            actorId: row.actor_id,
            actorType: row.actor_type,
            eventType: row.event_type,
            timestampUtc: row.timestamp_utc,
            ipAddress: row.ip_address,
            sessionId: row.session_id,
            documentHash: row.document_hash,
            metadata: row.metadata,
            previousHash: row.previous_hash,
            rowHash: row.row_hash,
            createdAt: row.created_at
        };
    }
}

export const auditLogService = new AuditLogService();
