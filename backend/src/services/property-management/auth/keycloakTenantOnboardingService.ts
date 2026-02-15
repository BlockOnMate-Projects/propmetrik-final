import axios from 'axios';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { pool } from '../../../database';
import config, { keycloakConfig } from '../../../config';
import { logger } from '../../../utils/logger';
import { tenantAuthService } from './tenantAuthService';

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
const tenantPortalUrl = (process.env.TENANT_PORTAL_URL || 'http://localhost:3001').replace(/\/$/, '');
const defaultRedirectUri = `${tenantPortalUrl}/login`;

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

        const adminToken = await this.getAdminAccessToken();
        const keycloakUser = await this.ensureKeycloakUser(adminToken, tenant.email, tenant.full_name);
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

        const safeRedirectUri = redirectUri || defaultRedirectUri;
        if (process.env.KEYCLOAK_SEND_EXECUTE_ACTIONS_EMAIL === 'true') {
            await this.sendExecuteActionsEmail(adminToken, keycloakUser.id, safeRedirectUri);
        }

        logger.info('Tenant invited to Keycloak tenant portal', {
            tenantId: tenant.id,
            keycloakUserId: keycloakUser.id
        });

        return {
            tenantId: tenant.id,
            keycloakUserId: keycloakUser.id,
            portalAccessStatus: 'invited',
            onboardingUrl: `${safeRedirectUri}${safeRedirectUri.includes('?') ? '&' : '?'}loginHint=${encodeURIComponent(tenant.email)}`,
            inviteExpiresAt
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
        const adminToken = await this.getAdminAccessToken();
        const keycloakUser = await this.ensureKeycloakUser(adminToken, tenant.email, tenant.full_name);

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

        const adminToken = await this.getAdminAccessToken();
        const keycloakUser = await this.ensureKeycloakUser(adminToken, email, 'Tenant User');

        await axios.put(
            `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUser.id}/reset-password`,
            {
                type: 'password',
                temporary: false,
                value: password
            },
            {
                headers: {
                    Authorization: `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const userResponse = await axios.get(
            `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUser.id}`,
            {
                headers: {
                    Authorization: `Bearer ${adminToken}`
                }
            }
        );

        const existingRequiredActions: string[] = Array.isArray(userResponse.data?.requiredActions)
            ? userResponse.data.requiredActions
            : [];

        const requiredActions = existingRequiredActions.filter(
            (action) => action !== 'UPDATE_PASSWORD' && action !== 'VERIFY_EMAIL'
        );

        await axios.put(
            `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUser.id}`,
            {
                username: userResponse.data?.username || email,
                email,
                firstName: userResponse.data?.firstName,
                lastName: userResponse.data?.lastName,
                enabled: true,
                emailVerified: true,
                requiredActions
            },
            {
                headers: {
                    Authorization: `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
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
            `SELECT id, organization_id, full_name, email
             FROM tenants
             WHERE id = $1 AND organization_id = $2`,
            [tenantId, organizationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Tenant not found');
        }

        return result.rows[0];
    }

    private async getAdminAccessToken(): Promise<string> {
        const adminClientId = config.keycloak.adminClientId || config.keycloak.clientId;
        const adminSecret = config.keycloak.adminSecret || config.keycloak.clientSecret;
        const adminRealm = config.keycloak.adminRealm || 'master';
        const adminUsername = config.keycloak.adminUsername;
        const adminPassword = config.keycloak.adminPassword;

        const requestToken = async (realm: string, params: Record<string, string>) => {
            const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
            const response = await axios.post(tokenUrl, new URLSearchParams(params), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            return response.data.access_token;
        };

        const attempts: Array<() => Promise<{ token: string; method: string }>> = [];

        if (adminClientId && adminSecret) {
            attempts.push(async () => ({
                token: await requestToken(keycloakRealm, {
                    grant_type: 'client_credentials',
                    client_id: adminClientId,
                    client_secret: adminSecret,
                }),
                method: `client_credentials@${keycloakRealm}`
            }));

            if (adminRealm !== keycloakRealm) {
                attempts.push(async () => ({
                    token: await requestToken(adminRealm, {
                        grant_type: 'client_credentials',
                        client_id: adminClientId,
                        client_secret: adminSecret,
                    }),
                    method: `client_credentials@${adminRealm}`
                }));
            }
        }

        if (adminUsername && adminPassword) {
            attempts.push(async () => ({
                token: await requestToken(adminRealm, {
                    grant_type: 'password',
                    client_id: adminClientId || 'admin-cli',
                    username: adminUsername,
                    password: adminPassword,
                }),
                method: `password@${adminRealm}`
            }));
        }

        if (attempts.length === 0) {
            throw new Error('Keycloak admin credentials are missing (client secret or username/password)');
        }

        const errors: string[] = [];
        for (const attempt of attempts) {
            try {
                const result = await attempt();
                logger.info('Keycloak admin auth resolved', { method: result.method });
                return result.token;
            } catch (error: any) {
                const message = error?.response?.data
                    ? JSON.stringify(error.response.data)
                    : error?.message || 'unknown';
                errors.push(message);
            }
        }

        throw new Error(`Unable to authenticate Keycloak admin token: ${errors.join(' | ')}`);
    }

    private async ensureKeycloakUser(
        adminToken: string,
        email: string,
        fullName: string
    ): Promise<{ id: string }> {
        const existing = await this.findKeycloakUserByEmail(adminToken, email);
        if (existing) {
            return existing;
        }

        const { firstName, lastName } = this.splitName(fullName);

        await axios.post(
            `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
            {
                email,
                username: email,
                firstName,
                lastName,
                enabled: true,
                emailVerified: false,
                requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD']
            },
            {
                headers: {
                    Authorization: `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const created = await this.findKeycloakUserByEmail(adminToken, email);
        if (!created) {
            throw new Error('Failed to create Keycloak tenant user');
        }

        return created;
    }

    private async findKeycloakUserByEmail(adminToken: string, email: string): Promise<{ id: string } | null> {
        const response = await axios.get(
            `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
            {
                params: { email, exact: true },
                headers: { Authorization: `Bearer ${adminToken}` }
            }
        );

        const user = response.data?.[0];
        return user?.id ? { id: user.id } : null;
    }

    private async sendExecuteActionsEmail(adminToken: string, keycloakUserId: string, redirectUri: string): Promise<void> {
        try {
            await axios.put(
                `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUserId}/execute-actions-email`,
                ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
                {
                    params: {
                        client_id: tenantClientId,
                        redirect_uri: redirectUri,
                        lifespan: 604800,
                    },
                    headers: {
                        Authorization: `Bearer ${adminToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error: any) {
            logger.warn('Failed to send Keycloak execute actions email', {
                keycloakUserId,
                error: error?.message
            });
        }
    }

    private splitName(fullName: string): { firstName: string; lastName: string } {
        const normalized = (fullName || '').trim();
        if (!normalized) {
            return { firstName: 'Tenant', lastName: 'User' };
        }

        const parts = normalized.split(/\s+/);
        const firstName = parts.shift() || 'Tenant';
        const lastName = parts.join(' ') || 'User';
        return { firstName, lastName };
    }
}

export const keycloakTenantOnboardingService = new KeycloakTenantOnboardingService();
