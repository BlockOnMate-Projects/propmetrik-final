/**
 * Tenant Authentication Service
 * Phase 4.x: Tenant Portal Authentication
 * 
 * Handles magic link and OTP-based authentication for tenants
 * Separate from Keycloak (used for staff/admin)
 * 
 * @module services/property-management/auth
 */

import { Pool } from 'pg';
import { pool } from '../../../database';
import crypto from 'crypto';
import { logger } from '../../../utils/logger';

// Auth Types
export enum AuthMethod {
    MAGIC_LINK = 'magic_link',
    OTP_SMS = 'otp_sms',
    OTP_EMAIL = 'otp_email',
    KEYCLOAK = 'keycloak'
}

// Interfaces
export interface TenantSession {
    id: string;
    tenantId: string;
    sessionToken: string;
    authMethod: AuthMethod;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
    isActive: boolean;
    createdAt: Date;
    lastUsedAt: Date;
}

export interface TenantProfile {
    id: string;
    fullName: string;
    email?: string;
    phonePrimary: string;
    phoneSecondary?: string;
    currentAddress?: string;
    digitalAddress?: string;
    occupation?: string;
    status: string;
    activeTenancies: TenancySummary[];
}

export interface TenancySummary {
    id: string;
    propertyId: string;
    propertyTitle: string;
    propertyAddress: string;
    unitNumber?: string;
    organizationId: string;
    leaseStartDate: Date;
    leaseEndDate: Date;
    monthlyRent: number;
    currency: string;
    status: string;
}

export interface AuthTokenResult {
    success: boolean;
    token?: string;
    expiresAt?: Date;
    error?: string;
}

export interface SessionResult {
    success: boolean;
    session?: TenantSession;
    tenant?: TenantProfile;
    error?: string;
}

export interface MagicLinkConsumeResult {
    success: boolean;
    tenant?: TenantProfile;
    error?: string;
}

export interface MagicLinkValidationResult {
    success: boolean;
    tenant?: TenantProfile;
    error?: string;
}

// Configuration
const TOKEN_EXPIRY_MINUTES = 1440; // Magic links expire in 24 hours (portal invites)
const OTP_EXPIRY_MINUTES = 5; // OTPs expire in 5 minutes
const SESSION_EXPIRY_DAYS = 30; // Sessions last 30 days
const OTP_LENGTH = 6;
const MAX_OTP_ATTEMPTS = 3;

export class TenantAuthService {
    private db: Pool;

    constructor(database?: Pool) {
        this.db = database || pool;
    }

    /**
     * Generate a magic link token for a tenant
     */
    async generateMagicLink(
        identifier: string, // Phone or email
        baseUrl: string,
        linkPath: string = '/login',
        expiryMinutes: number = TOKEN_EXPIRY_MINUTES
    ): Promise<AuthTokenResult> {
        try {
            // Find tenant by phone or email
            const tenant = await this.findTenantByIdentifier(identifier);
            if (!tenant) {
                // Don't reveal if tenant exists
                logger.warn('Magic link requested for unknown identifier', { identifier });
                return { success: true }; // Return success to prevent enumeration
            }

            // Generate secure token
            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = this.hashToken(token);
            const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

            // Store token
            await this.db.query(
                `INSERT INTO tenant_auth_tokens (tenant_id, phone, email, token_type, token_hash, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    tenant.id,
                    tenant.phone_primary,
                    tenant.email,
                    AuthMethod.MAGIC_LINK,
                    tokenHash,
                    expiresAt
                ]
            );

            const normalizedBase = baseUrl.replace(/\/+$/, '');
            const normalizedPath = linkPath.startsWith('/') ? linkPath : `/${linkPath}`;
            const magicLink = `${normalizedBase}${normalizedPath}?token=${token}`;

            logger.info('Generated magic link for tenant', { tenantId: tenant.id });

            return {
                success: true,
                token: magicLink, // Full magic link URL
                expiresAt
            };
        } catch (error: any) {
            logger.error('Error generating magic link', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate OTP for SMS or email
     */
    async generateOTP(
        identifier: string,
        method: AuthMethod.OTP_SMS | AuthMethod.OTP_EMAIL
    ): Promise<AuthTokenResult> {
        try {
            // Find tenant by phone (for SMS) or email
            const tenant = await this.findTenantByIdentifier(identifier);
            if (!tenant) {
                logger.warn('OTP requested for unknown identifier', { identifier });
                return { success: true }; // Prevent enumeration
            }

            // Generate numeric OTP
            const otp = this.generateNumericOTP(OTP_LENGTH);
            const otpHash = this.hashToken(otp);
            const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

            // Invalidate previous OTPs for this tenant
            await this.db.query(
                `UPDATE tenant_auth_tokens
                 SET used_at = NOW()
                 WHERE tenant_id = $1 AND token_type = $2 AND used_at IS NULL`,
                [tenant.id, method]
            );

            // Store new OTP
            await this.db.query(
                `INSERT INTO tenant_auth_tokens (tenant_id, phone, email, token_type, token_hash, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    tenant.id,
                    tenant.phone_primary,
                    tenant.email,
                    method,
                    otpHash,
                    expiresAt
                ]
            );

            logger.info('Generated OTP for tenant', { tenantId: tenant.id, method });

            return {
                success: true,
                token: otp, // Raw OTP to send via SMS/email
                expiresAt
            };
        } catch (error: any) {
            logger.error('Error generating OTP', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify magic link token and create session
     */
    async verifyMagicLink(
        token: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<SessionResult> {
        try {
            const tokenHash = this.hashToken(token);

            // Find and validate token
            const result = await this.db.query(
                `SELECT * FROM tenant_auth_tokens
                 WHERE token_hash = $1 
                 AND token_type = $2
                 AND expires_at > NOW()
                 AND used_at IS NULL`,
                [tokenHash, AuthMethod.MAGIC_LINK]
            );

            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid or expired token' };
            }

            const authToken = result.rows[0];

            // Mark token as used
            await this.db.query(
                `UPDATE tenant_auth_tokens SET used_at = NOW() WHERE id = $1`,
                [authToken.id]
            );

            // Create session
            return this.createSession(authToken.tenant_id, AuthMethod.MAGIC_LINK, userAgent, ipAddress);
        } catch (error: any) {
            logger.error('Error verifying magic link', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Consume magic link token for invite/setup flow (no session creation)
     */
    async consumeMagicLink(token: string): Promise<MagicLinkConsumeResult> {
        try {
            const tokenHash = this.hashToken(token);

            const result = await this.db.query(
                `SELECT * FROM tenant_auth_tokens
                 WHERE token_hash = $1
                 AND token_type = $2
                 AND expires_at > NOW()
                 AND used_at IS NULL`,
                [tokenHash, AuthMethod.MAGIC_LINK]
            );

            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid or expired token' };
            }

            const authToken = result.rows[0];

            await this.db.query(
                `UPDATE tenant_auth_tokens SET used_at = NOW() WHERE id = $1`,
                [authToken.id]
            );

            const tenant = await this.getTenantProfile(authToken.tenant_id);
            if (!tenant) {
                return { success: false, error: 'Tenant profile not found' };
            }

            return { success: true, tenant };
        } catch (error: any) {
            logger.error('Error consuming magic link', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate magic link token for setup flow (without consuming token)
     */
    async validateMagicLink(token: string): Promise<MagicLinkValidationResult> {
        try {
            const tokenHash = this.hashToken(token);

            const result = await this.db.query(
                `SELECT * FROM tenant_auth_tokens
                 WHERE token_hash = $1
                 AND token_type = $2
                 AND expires_at > NOW()
                 AND used_at IS NULL`,
                [tokenHash, AuthMethod.MAGIC_LINK]
            );

            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid or expired token' };
            }

            const authToken = result.rows[0];
            const tenant = await this.getTenantProfile(authToken.tenant_id);
            if (!tenant) {
                return { success: false, error: 'Tenant profile not found' };
            }

            return { success: true, tenant };
        } catch (error: any) {
            logger.error('Error validating magic link', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify OTP and create session
     */
    async verifyOTP(
        identifier: string,
        otp: string,
        method: AuthMethod.OTP_SMS | AuthMethod.OTP_EMAIL,
        userAgent?: string,
        ipAddress?: string
    ): Promise<SessionResult> {
        try {
            const otpHash = this.hashToken(otp);

            // Find tenant
            const tenant = await this.findTenantByIdentifier(identifier);
            if (!tenant) {
                return { success: false, error: 'Invalid credentials' };
            }

            // Find and validate OTP
            const result = await this.db.query(
                `SELECT * FROM tenant_auth_tokens
                 WHERE tenant_id = $1
                 AND token_type = $2
                 AND expires_at > NOW()
                 AND used_at IS NULL
                 AND attempts < max_attempts
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [tenant.id, method]
            );

            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid or expired OTP' };
            }

            const authToken = result.rows[0];

            // Check OTP
            if (authToken.token_hash !== otpHash) {
                // Increment attempts
                await this.db.query(
                    `UPDATE tenant_auth_tokens SET attempts = attempts + 1 WHERE id = $1`,
                    [authToken.id]
                );

                const remainingAttempts = MAX_OTP_ATTEMPTS - authToken.attempts - 1;
                return {
                    success: false,
                    error: remainingAttempts > 0
                        ? `Invalid OTP. ${remainingAttempts} attempts remaining.`
                        : 'Too many failed attempts. Please request a new OTP.'
                };
            }

            // Mark OTP as used
            await this.db.query(
                `UPDATE tenant_auth_tokens SET used_at = NOW() WHERE id = $1`,
                [authToken.id]
            );

            // Create session
            return this.createSession(tenant.id, method, userAgent, ipAddress);
        } catch (error: any) {
            logger.error('Error verifying OTP', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a new session for a tenant (30-day DB session)
     */
    async createSession(
        tenantId: string,
        authMethod: AuthMethod,
        userAgent?: string,
        ipAddress?: string
    ): Promise<SessionResult> {
        try {
            const sessionToken = crypto.randomBytes(48).toString('hex');
            const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

            const result = await this.db.query(
                `INSERT INTO tenant_sessions (tenant_id, session_token, auth_method, user_agent, ip_address, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [tenantId, sessionToken, authMethod, userAgent, ipAddress, expiresAt]
            );

            const session = this.mapRowToSession(result.rows[0]);

            // Get tenant profile
            const tenant = await this.getTenantProfile(tenantId);

            logger.info('Created session for tenant', { tenantId, sessionId: session.id });

            return {
                success: true,
                session,
                tenant: tenant || undefined
            };
        } catch (error: any) {
            logger.error('Error creating session', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate a session token.
     *
     * PERF: tenant requests previously paid 3 remote round-trips EACH (session
     * SELECT + last_used_at UPDATE + full profile). Now:
     *   - successful validations are cached for a short TTL (skips all 3 on repeat),
     *   - the last_used_at write is fire-and-forget (never blocks the request).
     */
    async validateSession(sessionToken: string): Promise<SessionResult> {
        const now = Date.now();
        const cached = TenantAuthService._sessionCache.get(sessionToken);
        if (cached && cached.expires > now) {
            return cached.value;
        }
        try {
            const result = await this.db.query(
                `SELECT * FROM tenant_sessions
                 WHERE session_token = $1
                 AND expires_at > NOW()
                 AND is_active = TRUE`,
                [sessionToken]
            );

            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid or expired session' };
            }

            const session = this.mapRowToSession(result.rows[0]);

            // Fire-and-forget: never block the request on the last_used_at write.
            void this.db.query(
                `UPDATE tenant_sessions SET last_used_at = NOW() WHERE id = $1`,
                [session.id]
            ).catch(() => { /* best-effort */ });

            // Get tenant profile
            const tenant = await this.getTenantProfile(session.tenantId);

            const value: SessionResult = {
                success: true,
                session,
                tenant: tenant || undefined
            };
            // Cache only successful validations (short TTL bounds staleness).
            if (TenantAuthService._sessionCache.size >= 5000) {
                const oldest = TenantAuthService._sessionCache.keys().next().value;
                if (oldest !== undefined) TenantAuthService._sessionCache.delete(oldest);
            }
            TenantAuthService._sessionCache.set(sessionToken, { value, expires: now + TenantAuthService._SESSION_TTL_MS });
            return value;
        } catch (error: any) {
            logger.error('Error validating session', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /** Short-TTL cache of successful session validations (see validateSession). */
    private static _sessionCache = new Map<string, { value: SessionResult; expires: number }>();
    private static _SESSION_TTL_MS = Number(process.env.TENANT_SESSION_CACHE_TTL_MS || 10_000);
    /** Drop a token from the session cache (on logout/revoke). */
    static invalidateSessionCache(sessionToken: string): void {
        TenantAuthService._sessionCache.delete(sessionToken);
    }

    /**
     * Revoke a session (logout)
     */
    async revokeSession(sessionToken: string): Promise<boolean> {
        try {
            await this.db.query(
                `UPDATE tenant_sessions
                 SET is_active = FALSE, revoked_at = NOW()
                 WHERE session_token = $1`,
                [sessionToken]
            );

            // Drop from the short-TTL cache so logout takes effect immediately.
            TenantAuthService.invalidateSessionCache(sessionToken);

            logger.info('Revoked tenant session');
            return true;
        } catch (error: any) {
            logger.error('Error revoking session', { error: error.message });
            return false;
        }
    }

    /**
     * Revoke all sessions for a tenant
     */
    async revokeAllSessions(tenantId: string): Promise<number> {
        try {
            const result = await this.db.query(
                `UPDATE tenant_sessions
                 SET is_active = FALSE, revoked_at = NOW()
                 WHERE tenant_id = $1 AND is_active = TRUE`,
                [tenantId]
            );

            logger.info('Revoked all sessions for tenant', { tenantId, count: result.rowCount });
            return result.rowCount || 0;
        } catch (error: any) {
            logger.error('Error revoking all sessions', { error: error.message });
            return 0;
        }
    }

    /**
     * Get tenant profile with active tenancies
     */
    async getTenantProfile(tenantId: string): Promise<TenantProfile | null> {
        try {
            // Get tenant info
            const tenantResult = await this.db.query(
                `SELECT * FROM tenants WHERE id = $1`,
                [tenantId]
            );

            if (tenantResult.rows.length === 0) {
                return null;
            }

            let tenant = tenantResult.rows[0];

            const hasMissingCoreProfile = !tenant.full_name || !tenant.email || !tenant.phone_primary || !tenant.current_address || !tenant.occupation;
            if (hasMissingCoreProfile) {
                const appResult = await this.db.query(
                    `SELECT applicant_full_name,
                            applicant_email,
                            applicant_phone,
                            applicant_phone_secondary,
                            applicant_current_address,
                            occupation
                     FROM applications
                     WHERE tenant_id = $1
                        OR (applicant_email IS NOT NULL AND LOWER(applicant_email) = LOWER($2))
                     ORDER BY updated_at DESC NULLS LAST, created_at DESC
                     LIMIT 1`,
                    [tenantId, tenant.email || '']
                );

                const application = appResult.rows[0];
                if (application) {
                    const merged = {
                        full_name: tenant.full_name || application.applicant_full_name,
                        email: tenant.email || application.applicant_email,
                        phone_primary: tenant.phone_primary || application.applicant_phone,
                        phone_secondary: tenant.phone_secondary || application.applicant_phone_secondary,
                        current_address: tenant.current_address || application.applicant_current_address,
                        occupation: tenant.occupation || application.occupation,
                    };

                    await this.db.query(
                        `UPDATE tenants
                         SET full_name = COALESCE(NULLIF(full_name, ''), $2),
                             email = COALESCE(NULLIF(email, ''), $3),
                             phone_primary = COALESCE(NULLIF(phone_primary, ''), $4),
                             phone_secondary = COALESCE(NULLIF(phone_secondary, ''), $5),
                             current_address = COALESCE(NULLIF(current_address, ''), $6),
                             occupation = COALESCE(NULLIF(occupation, ''), $7),
                             updated_at = NOW()
                         WHERE id = $1`,
                        [
                            tenantId,
                            merged.full_name || null,
                            merged.email || null,
                            merged.phone_primary || null,
                            merged.phone_secondary || null,
                            merged.current_address || null,
                            merged.occupation || null,
                        ]
                    );

                    tenant = {
                        ...tenant,
                        ...merged,
                    };
                }
            }

            // Get active tenancies
            const tenanciesResult = await this.db.query(
                `SELECT t.*, p.title as property_title, p.address_street, p.address_city
                 FROM tenancies t
                 JOIN properties p ON t.property_id = p.id
                 WHERE t.tenant_id = $1 AND t.status IN ('active', 'pending')
                 ORDER BY t.lease_start_date DESC`,
                [tenantId]
            );

            const activeTenancies: TenancySummary[] = tenanciesResult.rows.map(row => ({
                id: row.id,
                propertyId: row.property_id,
                propertyTitle: row.property_title,
                propertyAddress: `${row.address_street || ''}, ${row.address_city || ''}`.trim(),
                unitNumber: row.unit_number || undefined,
                organizationId: row.organization_id,
                leaseStartDate: new Date(row.lease_start_date),
                leaseEndDate: new Date(row.lease_end_date),
                monthlyRent: parseFloat(row.monthly_rent),
                currency: row.rent_currency || 'GHS',
                status: row.status
            }));

            return {
                id: tenant.id,
                fullName: tenant.full_name,
                email: tenant.email,
                phonePrimary: tenant.phone_primary,
                phoneSecondary: tenant.phone_secondary,
                currentAddress: tenant.current_address,
                digitalAddress: tenant.digital_address,
                occupation: tenant.occupation,
                status: tenant.status,
                activeTenancies
            };
        } catch (error: any) {
            logger.error('Error getting tenant profile', { error: error.message });
            return null;
        }
    }

    /**
     * Update tenant contact information
     */
    async updateTenantContact(
        tenantId: string,
        data: {
            email?: string;
            phoneSecondary?: string;
            currentAddress?: string;
        }
    ): Promise<TenantProfile | null> {
        try {
            const updates: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (data.email !== undefined) {
                updates.push(`email = $${paramIndex++}`);
                values.push(data.email);
            }
            if (data.phoneSecondary !== undefined) {
                updates.push(`phone_secondary = $${paramIndex++}`);
                values.push(data.phoneSecondary);
            }
            if (data.currentAddress !== undefined) {
                updates.push(`current_address = $${paramIndex++}`);
                values.push(data.currentAddress);
            }

            if (updates.length === 0) {
                return this.getTenantProfile(tenantId);
            }

            updates.push(`updated_at = NOW()`);
            values.push(tenantId);

            await this.db.query(
                `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                values
            );

            return this.getTenantProfile(tenantId);
        } catch (error: any) {
            logger.error('Error updating tenant contact', { error: error.message });
            return null;
        }
    }

    // Helper methods

    private async findTenantByIdentifier(identifier: string): Promise<any | null> {
        // Check if identifier looks like email or phone
        const isEmail = identifier.includes('@');

        const query = isEmail
            ? `SELECT * FROM tenants WHERE email = $1 AND status != 'blacklisted'`
            : `SELECT * FROM tenants WHERE phone_primary = $1 AND status != 'blacklisted'`;

        const result = await this.db.query(query, [identifier]);
        return result.rows.length > 0 ? result.rows[0] : null;
    }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private generateNumericOTP(length: number): string {
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += Math.floor(Math.random() * 10).toString();
        }
        return otp;
    }

    private mapRowToSession(row: any): TenantSession {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            sessionToken: row.session_token,
            authMethod: row.auth_method as AuthMethod,
            userAgent: row.user_agent,
            ipAddress: row.ip_address,
            expiresAt: new Date(row.expires_at),
            isActive: row.is_active,
            createdAt: new Date(row.created_at),
            lastUsedAt: new Date(row.last_used_at)
        };
    }
}

// Singleton export
export const tenantAuthService = new TenantAuthService();
