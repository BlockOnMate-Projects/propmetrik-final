/**
 * Magic Link Service
 * Handles generation and validation of external signee magic links
 */

import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';
import { config } from '../../src/config';
import { SigningRequestSignee } from './types';

// Magic link configuration
const MAGIC_LINK_EXPIRY_DAYS = 7;
// Base for external signing links. Falls back to the central, env-aware config
// (prod → https://propmetrik.com) — never a hardcoded localhost.
const MAGIC_LINK_BASE_URL = process.env.ESIGN_MAGIC_LINK_BASE_URL || `${config.app.frontendUrl}/sign`;
const OTP_EXPIRY_MINUTES = 10;

// In-memory OTP store (in production, use Redis)
const otpStore = new Map<string, { code: string; email: string; expiresAt: Date }>();

export interface MagicLinkResult {
    token: string;
    url: string;
    expiresAt: Date;
}

export class MagicLinkService {
    /**
     * Generate a magic link for an external signee
     */
    async generateMagicLink(signeeId: string): Promise<MagicLinkResult> {
        // Generate a secure random token
        const token = this.generateSecureToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + MAGIC_LINK_EXPIRY_DAYS);

        // Store the token
        await db.query(
            `UPDATE signing_request_signees 
       SET magic_token = $1, magic_token_expires_at = $2 
       WHERE id = $3`,
            [token, expiresAt, signeeId]
        );

        const url = `${MAGIC_LINK_BASE_URL}/${token}`;

        logger.info('Magic link generated for signee', { signeeId, expiresAt });

        return {
            token,
            url,
            expiresAt
        };
    }

    /**
     * Validate a magic link token and return the signee info
     */
    async validateMagicLink(token: string): Promise<SigningRequestSignee | null> {
        const result = await db.query(
            `SELECT srs.*, sr.status as request_status, sr.document_title, sr.original_pdf_url
       FROM signing_request_signees srs
       JOIN signing_requests sr ON srs.signing_request_id = sr.id
       WHERE srs.magic_token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            logger.warn('Invalid magic link token', { token: token.substring(0, 8) + '...' });
            return null;
        }

        const row = result.rows[0];

        // Check expiration
        if (new Date() > new Date(row.magic_token_expires_at)) {
            logger.warn('Expired magic link', { signeeId: row.id });
            return null;
        }

        // Check if request is still signable
        if (!['pending_sign', 'partially_signed'].includes(row.request_status)) {
            logger.warn('Signing request no longer active', { signeeId: row.id, status: row.request_status });
            return null;
        }

        // Check if signee hasn't already signed
        if (row.status === 'signed') {
            logger.warn('Signee has already signed', { signeeId: row.id });
            return null;
        }

        return this.mapToSignee(row);
    }

    /**
     * Get signing request details via magic link
     */
    async getSigningDetailsFromToken(token: string): Promise<{
        signee: SigningRequestSignee;
        documentTitle: string;
        documentUrl: string;
    } | null> {
        const result = await db.query(
            `SELECT srs.*, sr.status as request_status, sr.document_title, sr.original_pdf_url
       FROM signing_request_signees srs
       JOIN signing_requests sr ON srs.signing_request_id = sr.id
       WHERE srs.magic_token = $1 AND srs.magic_token_expires_at > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];

        return {
            signee: this.mapToSignee(row),
            documentTitle: row.document_title,
            documentUrl: row.original_pdf_url
        };
    }

    /**
     * Send OTP to external signer's email
     */
    async sendOtp(token: string, email: string): Promise<void> {
        // Generate 6-digit OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        // Store OTP
        otpStore.set(token, { code, email, expiresAt });

        // In production, send email with OTP
        // For now, log it for testing
        logger.info('OTP generated for signing', { 
            email, 
            code, // Remove in production!
            expiresAt 
        });

        // TODO: Send email using notification service
        // await notificationService.sendEmail({
        //     to: email,
        //     subject: 'Your verification code',
        //     template: 'otp-verification',
        //     data: { code, expiresMinutes: OTP_EXPIRY_MINUTES }
        // });
    }

    /**
     * Verify OTP code
     */
    async verifyOtp(token: string, code: string): Promise<boolean> {
        const stored = otpStore.get(token);

        if (!stored) {
            logger.warn('OTP not found for token', { token: token.substring(0, 8) + '...' });
            return false;
        }

        if (new Date() > stored.expiresAt) {
            logger.warn('OTP expired', { token: token.substring(0, 8) + '...' });
            otpStore.delete(token);
            return false;
        }

        if (stored.code !== code) {
            logger.warn('Invalid OTP code', { token: token.substring(0, 8) + '...' });
            return false;
        }

        // OTP verified, remove from store
        otpStore.delete(token);
        logger.info('OTP verified successfully', { token: token.substring(0, 8) + '...' });
        
        return true;
    }

    /**
     * Invalidate a magic link after use
     */
    async invalidateMagicLink(signeeId: string): Promise<void> {
        await db.query(
            `UPDATE signing_request_signees 
       SET magic_token = NULL, magic_token_expires_at = NULL 
       WHERE id = $1`,
            [signeeId]
        );

        logger.info('Magic link invalidated', { signeeId });
    }

    /**
     * Generate a cryptographically secure random token
     */
    private generateSecureToken(): string {
        const bytes = randomBytes(32);
        return bytes.toString('base64url');
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
}

export const magicLinkService = new MagicLinkService();
