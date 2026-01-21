/**
 * Consent Service
 * Manages versioned consent statements for e-signatures
 */

import db from '../../src/database';
import { ConsentStatementVersion } from './types';

export class ConsentService {
    /**
     * Get the current active consent statement
     */
    async getCurrentConsentStatement(): Promise<ConsentStatementVersion | null> {
        const result = await db.query(
            `SELECT * FROM consent_statement_versions WHERE is_current = TRUE LIMIT 1`
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapToConsentStatement(result.rows[0]);
    }

    /**
     * Get a specific consent statement by version
     */
    async getConsentStatementByVersion(version: string): Promise<ConsentStatementVersion | null> {
        const result = await db.query(
            `SELECT * FROM consent_statement_versions WHERE version = $1`,
            [version]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapToConsentStatement(result.rows[0]);
    }

    /**
     * Create a new consent statement version
     */
    async createConsentStatement(version: string, statementText: string, makeCurrent: boolean = false): Promise<ConsentStatementVersion> {
        // If making this the current version, deactivate existing
        if (makeCurrent) {
            await db.query(
                `UPDATE consent_statement_versions SET is_current = FALSE, effective_until = NOW() WHERE is_current = TRUE`
            );
        }

        const result = await db.query(
            `INSERT INTO consent_statement_versions (version, statement_text, is_current)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [version, statementText, makeCurrent]
        );

        return this.mapToConsentStatement(result.rows[0]);
    }

    /**
     * Get all consent statement versions
     */
    async getAllConsentStatements(): Promise<ConsentStatementVersion[]> {
        const result = await db.query(
            `SELECT * FROM consent_statement_versions ORDER BY effective_from DESC`
        );

        return result.rows.map(row => this.mapToConsentStatement(row));
    }

    private mapToConsentStatement(row: any): ConsentStatementVersion {
        return {
            id: row.id,
            version: row.version,
            statementText: row.statement_text,
            effectiveFrom: row.effective_from,
            effectiveUntil: row.effective_until,
            isCurrent: row.is_current,
            createdAt: row.created_at
        };
    }
}

export const consentService = new ConsentService();
