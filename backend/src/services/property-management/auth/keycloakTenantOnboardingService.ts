import axios from 'axios';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { pool } from '../../../database';
import config, { keycloakConfig } from '../../../config';
import { logger } from '../../../utils/logger';
import { tenantAuthService } from './tenantAuthService';
import { keycloakAdminService } from '../../keycloakAdminService';
import { notificationService } from '../../../../shared-services/notifications/unified';

interface KeycloakTenantTokenPayload extends JWTPayload {
    sub: string;
    email?: string;
    preferred_username?: string;
}

export interface TenantInviteResult {
    tenantId: string;
    keycloakUserId: string;
    portalAccessStatus: 'invited' | 'active';
    onboardingUrl: string;
    inviteExpiresAt: Date;
    emailSent: boolean;
    emailError?: string;
}

export interface TenantAuthExchangeResult {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    tenant: any;
}

const keycloakUrl = (config.keycloak.url || '').replace(/\/$/, '');
const keycloakRealm = config.keycloak.realm || '';
const tenantClientId = process.env.KEYCLOAK_TENANT_CLIENT_ID || 'propmetrik-tenant-portal';
const tenantClientSecret = process.env.KEYCLOAK_TENANT_CLIENT_SECRET || '';
const tenantPortalUrl = config.app.tenantPortalUrl.replace(/\/$/, '');
const defaultRedirectUri = `${tenantPortalUrl}/tenant-login`;
// Single source of truth for the tenant set-password page + invite token lifetime.
const SETUP_PASSWORD_PATH = '/tenant/set-password';
const INVITE_EXPIRY_MINUTES = 24 * 60;

const jwks = createRemoteJWKSet(
    new URL(`${keycloakConfig.authServerUrl}/realms/${keycloakRealm}/protocol/openid-connect/certs`)
);

export class KeycloakTenantOnboardingService {
    private isUuid(value?: string): boolean {
        if (!value) {
            return false;
        }

        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }

    private getAuthBaseUrl(): string {
        if (!keycloakUrl || !keycloakRealm || !tenantClientId) {
            throw new Error('Keycloak tenant auth is not configured');
        }

        return `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect`;
    }

    getAuthorizationUrl(
        redirectUri?: string,
        loginHint?: string,
        codeChallenge?: string,
        codeChallengeMethod: 'S256' | 'plain' = 'S256'
    ): string {
        const base = this.getAuthBaseUrl();
        const safeRedirectUri = redirectUri || defaultRedirectUri;
        const params = new URLSearchParams({
            client_id: tenantClientId,
            response_type: 'code',
            scope: 'openid profile email',
            redirect_uri: safeRedirectUri
        });

        if (loginHint) {
            params.append('login_hint', loginHint);
        }

        if (codeChallenge) {
            params.append('code_challenge', codeChallenge);
            params.append('code_challenge_method', codeChallengeMethod);
        }

        return `${base}/auth?${params.toString()}`;
    }

    async inviteTenant(
        tenantId: string,
        organizationId: string,
        invitedBy?: string,
        redirectUri?: string
    ): Promise<TenantInviteResult> {
        const tenant = await this.getTenantForInvite(tenantId, organizationId);

        if (!tenant.email) {
            throw new Error('Tenant email is required for Keycloak onboarding');
        }

        const keycloakUser = await keycloakAdminService.ensureUser(
            tenant.email,
            tenant.full_name?.split(/\s+/)[0] || 'Tenant',
            tenant.full_name?.split(/\s+/).slice(1).join(' ') || 'User',
            { emailVerified: false, requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'] },
        );
        const invitedByUserId = this.isUuid(invitedBy) ? invitedBy : null;

        const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await pool.query(
            `UPDATE tenants
             SET keycloak_user_id = $2,
                 portal_access_status = 'invited',
                 portal_invited_at = NOW(),
                 portal_invited_by = $3,
                 portal_invite_expires_at = $4,
                 updated_at = NOW()
             WHERE id = $1`,
            [tenant.id, keycloakUser.id, invitedByUserId, inviteExpiresAt]
        );

        // Base URL is dynamic: honour the caller's origin (multi-domain deployments)
        // and fall back to the environment-aware tenant portal URL from config.
        let baseUrl = tenantPortalUrl;
        if (redirectUri) {
            try {
                baseUrl = new URL(redirectUri).origin;
            } catch {
                // keep config default
            }
        }

        // Generate a set-password link that points at our own portal page.
        // The token is stored in tenant_auth_tokens; the page consumes it via
        // /tenant-portal/auth/setup-password, which sets the password in Keycloak.
        const linkResult = await tenantAuthService.generateMagicLink(
            tenant.email,
            baseUrl,
            SETUP_PASSWORD_PATH,
            INVITE_EXPIRY_MINUTES
        );
        if (!linkResult.success || !linkResult.token) {
            throw new Error('Failed to generate tenant setup link');
        }
        const onboardingUrl = linkResult.token;

        // Send the branded invite through the unified 3-tier notifier
        // (Microsoft → AWS SES → Google), not Keycloak's own SMTP.
        const emailResult = await notificationService.sendPortalInvite(tenant.email, onboardingUrl, {
            tenantName: tenant.full_name || 'Tenant',
            organizationName: tenant.organization_name || 'Your property manager',
            propertyTitle: tenant.property_title || 'your tenancy',
            propertyAddress: tenant.property_address || ''
        }, organizationId);

        if (!emailResult.success) {
            logger.warn('Tenant portal invite email failed to send', {
                tenantId: tenant.id,
                error: emailResult.error
            });
        }

        logger.info('Tenant invited to tenant portal', {
            tenantId: tenant.id,
            keycloakUserId: keycloakUser.id,
            emailSent: emailResult.success
        });

        return {
            tenantId: tenant.id,
            keycloakUserId: keycloakUser.id,
            portalAccessStatus: 'invited',
            onboardingUrl,
            inviteExpiresAt: linkResult.expiresAt || inviteExpiresAt,
            emailSent: emailResult.success,
            emailError: emailResult.success ? undefined : emailResult.error
        };
    }

    async exchangeAuthorizationCode(
        code: string,
        redirectUri: string,
        codeVerifier?: string
    ): Promise<TenantAuthExchangeResult> {
        const base = this.getAuthBaseUrl();

        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: tenantClientId,
            code,
            redirect_uri: redirectUri,
        });

        if (tenantClientSecret) {
            params.append('client_secret', tenantClientSecret);
        }

        if (codeVerifier) {
            params.append('code_verifier', codeVerifier);
        }

        const tokenResponse = await axios.post(
            `${base}/token`,
            params,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = tokenResponse.data.access_token as string;
        const refreshToken = tokenResponse.data.refresh_token as string | undefined;
        const expiresIn = Number(tokenResponse.data.expires_in || 300);

        const tenantProfile = await this.resolveTenantFromAccessToken(accessToken);

        return {
            accessToken,
            refreshToken,
            expiresIn,
            tenant: tenantProfile
        };
    }

    async loginWithPassword(
        email: string,
        password: string
    ): Promise<TenantAuthExchangeResult> {
        const base = this.getAuthBaseUrl();

        const params = new URLSearchParams({
            grant_type: 'password',
            client_id: tenantClientId,
            username: email,
            password,
            scope: 'openid profile email'
        });

        if (tenantClientSecret) {
            params.append('client_secret', tenantClientSecret);
        }

        const tokenResponse = await axios.post(
            `${base}/token`,
            params,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = tokenResponse.data.access_token as string;
        const refreshToken = tokenResponse.data.refresh_token as string | undefined;
        const expiresIn = Number(tokenResponse.data.expires_in || 300);

        const tenantProfile = await this.resolveTenantFromAccessToken(accessToken);

        return {
            accessToken,
            refreshToken,
            expiresIn,
            tenant: tenantProfile
        };
    }

    async ensureTenantKeycloakAccountByEmail(email: string): Promise<void> {
        const tenantResult = await pool.query(
            `SELECT id, full_name, email
             FROM tenants
             WHERE LOWER(email) = LOWER($1)
             LIMIT 1`,
            [email]
        );

        if (tenantResult.rows.length === 0) {
            throw new Error('Tenant not found for provided email');
        }

        const tenant = tenantResult.rows[0];
        const keycloakUser = await keycloakAdminService.ensureUser(
            tenant.email,
            tenant.full_name?.split(/\s+/)[0] || 'Tenant',
            tenant.full_name?.split(/\s+/).slice(1).join(' ') || 'User',
            { emailVerified: false, requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'] },
        );

        await pool.query(
            `UPDATE tenants
             SET keycloak_user_id = COALESCE(keycloak_user_id, $2),
                 portal_access_status = CASE
                     WHEN portal_access_status = 'not_invited' THEN 'invited'
                     ELSE portal_access_status
                 END,
                 updated_at = NOW()
             WHERE id = $1`,
            [tenant.id, keycloakUser.id]
        );
    }

    async setTenantPasswordByEmail(email: string, password: string): Promise<void> {
        if (!email) {
            throw new Error('Tenant email is required');
        }

        if (!password || password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }

        const keycloakUser = await keycloakAdminService.ensureUser(
            email,
            'Tenant',
            'User',
            { emailVerified: false, requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'] },
        );

        await keycloakAdminService.setPassword(keycloakUser.id, password, {
            clearActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
            markEmailVerified: true,
        });
    }

    getResetPasswordUrl(
        redirectUri?: string,
        loginHint?: string
    ): string {
        const safeRedirectUri = redirectUri || defaultRedirectUri;

        const params = new URLSearchParams({
            client_id: tenantClientId,
            redirect_uri: safeRedirectUri,
            execution: 'UPDATE_PASSWORD'
        });

        if (loginHint) {
            params.append('login_hint', loginHint);
        }

        return `${keycloakUrl}/realms/${keycloakRealm}/login-actions/reset-credentials?${params.toString()}`;
    }

    private async resolveTenantFromAccessToken(accessToken: string): Promise<any> {
        const identity = await this.verifyTenantAccessToken(accessToken);
        const tenant = await this.resolveTenantIdentity(identity.sub, identity.email);

        if (!tenant) {
            throw new Error('No tenant profile is linked to this Keycloak account');
        }

        await pool.query(
            `UPDATE tenants
             SET portal_access_status = 'active',
                 portal_activated_at = COALESCE(portal_activated_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1`,
            [tenant.id]
        );

        const tenantProfile = await tenantAuthService.getTenantProfile(tenant.id);
        if (!tenantProfile) {
            throw new Error('Unable to load tenant profile');
        }

        return tenantProfile;
    }

    async verifyTenantAccessToken(token: string): Promise<{ sub: string; email?: string }> {
        const { payload } = await jwtVerify(token, jwks, {
            issuer: `${keycloakConfig.authServerUrl}/realms/${keycloakRealm}`,
        });

        const keycloakPayload = payload as KeycloakTenantTokenPayload;
        const audiences = Array.isArray(payload.aud)
            ? payload.aud
            : (payload.aud ? [payload.aud] : []);
        const authorizedParty = (payload as any).azp as string | undefined;
        const clientMatches = audiences.includes(tenantClientId) || authorizedParty === tenantClientId;

        if (!clientMatches) {
            throw new Error('Tenant access token is not issued for tenant portal client');
        }

        if (!keycloakPayload.sub) {
            throw new Error('Invalid Keycloak token payload');
        }

        return {
            sub: keycloakPayload.sub,
            email: keycloakPayload.email
        };
    }

    async resolveTenantIdentity(sub: string, email?: string): Promise<{ id: string } | null> {
        const direct = await pool.query(
            `SELECT id FROM tenants WHERE keycloak_user_id = $1 LIMIT 1`,
            [sub]
        );

        if (direct.rows.length > 0) {
            return direct.rows[0];
        }

        if (!email) {
            return null;
        }

        const fallback = await pool.query(
            `SELECT id, keycloak_user_id
             FROM tenants
             WHERE LOWER(email) = LOWER($1)
             LIMIT 1`,
            [email]
        );

        if (fallback.rows.length === 0) {
            return null;
        }

        const tenant = fallback.rows[0];

        if (!tenant.keycloak_user_id) {
            await pool.query(
                `UPDATE tenants
                 SET keycloak_user_id = $2,
                     updated_at = NOW()
                 WHERE id = $1`,
                [tenant.id, sub]
            );
        }

        return { id: tenant.id };
    }

    private async getTenantForInvite(tenantId: string, organizationId: string): Promise<any> {
        const result = await pool.query(
            `SELECT t.id, t.organization_id, t.full_name, t.email,
                    p.title AS property_title,
                    NULLIF(TRIM(BOTH ', ' FROM CONCAT_WS(', ', p.address_street, p.address_city)), '') AS property_address,
                    o.name AS organization_name
             FROM tenants t
             LEFT JOIN tenancies tn ON tn.tenant_id = t.id AND tn.status IN ('active', 'pending')
             LEFT JOIN properties p ON tn.property_id = p.id
             LEFT JOIN organizations o ON o.id = t.organization_id
             WHERE t.id = $1 AND t.organization_id = $2
             ORDER BY tn.lease_start_date DESC NULLS LAST
             LIMIT 1`,
            [tenantId, organizationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Tenant not found');
        }

        return result.rows[0];
    }
}

export const keycloakTenantOnboardingService = new KeycloakTenantOnboardingService();
