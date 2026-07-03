/**
 * KeycloakAdminService - Centralized Keycloak Admin API Client
 *
 * Consolidates the 3 duplicate admin-token + user-CRUD implementations from:
 *   - routes/auth.ts            (getKeycloakAdminToken + createKeycloakUser)
 *   - services/valuation-engine/orgTeamService.ts  (getKeycloakAdminToken + ensureKeycloakUser + setKeycloakPassword + sendKeycloakActionsEmail)
 *   - services/property-management/auth/keycloakTenantOnboardingService.ts  (getAdminAccessToken + ensureKeycloakUser + setTenantPasswordByEmail + sendExecuteActionsEmail)
 *
 * Features:
 *   - Single admin-token acquisition with 3-strategy fallback
 *   - Token caching (avoids fetching a new token on every call)
 *   - Idempotent ensureUser (search first, create if missing)
 *   - setPassword / sendActionsEmail helpers
 *
 * @module services/keycloakAdminService
 */

import axios from 'axios';
import config from '../config';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// This service is ALL server-to-server admin traffic, so it targets the admin URL
// (KEYCLOAK_ADMIN_URL if set, else KEYCLOAK_URL). Point KEYCLOAK_ADMIN_URL at the
// Keycloak origin to bypass a Cloudflare bot-challenge on the public sso host —
// the browser-facing issuer (KEYCLOAK_URL) is unaffected.
const keycloakUrl = (config.keycloak.adminUrl || config.keycloak.url || '').replace(/\/$/, '');
const keycloakRealm = config.keycloak.realm || '';
const keycloakEnabled = !!(keycloakUrl && keycloakRealm);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnsureUserOptions {
  /** Whether to mark the user email as verified on creation.  Default: false */
  emailVerified?: boolean;
  /** Keycloak required-actions to set on a newly created user.  Default: [] */
  requiredActions?: string[];
  /** If provided, set this password on the newly-created user (temporary=false). */
  password?: string;
}

export interface EnsureUserResult {
  /** Keycloak user ID */
  id: string;
  /** true if the user was just created, false if it already existed */
  created: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class KeycloakAdminService {
  /** Cached admin token + approximate expiry (token_lifetime − 30 s buffer) */
  private cachedToken: { token: string; expiresAt: number } | null = null;

  // -----------------------------------------------------------------------
  // Public: check if Keycloak is configured
  // -----------------------------------------------------------------------

  get enabled(): boolean {
    return keycloakEnabled;
  }

  // -----------------------------------------------------------------------
  // Admin Token
  // -----------------------------------------------------------------------

  /**
   * Obtain an admin-level access token using a 3-strategy cascade:
   *   1. client_credentials on application realm
   *   2. client_credentials on admin realm (usually `master`)
   *   3. password grant with admin username/password
   *
   * Results are cached until ~30 s before claimed expiry.
   */
  async getAdminToken(): Promise<string> {
    if (!keycloakEnabled) {
      throw new Error('Keycloak is not configured (missing KEYCLOAK_URL or KEYCLOAK_REALM)');
    }

    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    const adminClientId = config.keycloak.adminClientId || config.keycloak.clientId;
    const adminSecret = config.keycloak.adminSecret || config.keycloak.clientSecret;
    const adminRealm = config.keycloak.adminRealm || 'master';
    const adminUsername = config.keycloak.adminUsername;
    const adminPassword = config.keycloak.adminPassword;

    const requestToken = async (
      realm: string,
      params: Record<string, string>,
    ): Promise<{ token: string; expiresIn: number }> => {
      const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
      const response = await axios.post(tokenUrl, new URLSearchParams(params), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      });
      return {
        token: response.data.access_token,
        expiresIn: Number(response.data.expires_in || 300),
      };
    };

    const attempts: Array<() => Promise<{ token: string; expiresIn: number; method: string }>> = [];

    if (adminClientId && adminSecret) {
      // Strategy 1 – client_credentials on app realm
      attempts.push(async () => {
        const r = await requestToken(keycloakRealm, {
          grant_type: 'client_credentials',
          client_id: adminClientId,
          client_secret: adminSecret,
        });
        return { ...r, method: `client_credentials@${keycloakRealm}` };
      });

      // Strategy 2 – client_credentials on admin realm
      if (adminRealm !== keycloakRealm) {
        attempts.push(async () => {
          const r = await requestToken(adminRealm, {
            grant_type: 'client_credentials',
            client_id: adminClientId,
            client_secret: adminSecret,
          });
          return { ...r, method: `client_credentials@${adminRealm}` };
        });
      }
    }

    // Strategy 3 – password grant
    if (adminUsername && adminPassword) {
      attempts.push(async () => {
        const r = await requestToken(adminRealm, {
          grant_type: 'password',
          client_id: adminClientId || 'admin-cli',
          username: adminUsername,
          password: adminPassword,
        });
        return { ...r, method: `password@${adminRealm}` };
      });
    }

    if (attempts.length === 0) {
      throw new Error('Keycloak admin credentials are not configured');
    }

    const errors: string[] = [];
    for (const attempt of attempts) {
      try {
        const result = await attempt();
        // Cache with 30 s safety buffer
        this.cachedToken = {
          token: result.token,
          expiresAt: Date.now() + (result.expiresIn - 30) * 1000,
        };
        logger.info('Keycloak admin token acquired', { method: result.method });
        return result.token;
      } catch (error: any) {
        const msg = error?.response?.data
          ? JSON.stringify(error.response.data)
          : error?.message || 'unknown';
        errors.push(msg);
      }
    }

    throw new Error(`Unable to obtain Keycloak admin token: ${errors.join(' | ')}`);
  }

  // -----------------------------------------------------------------------
  // User Operations
  // -----------------------------------------------------------------------

  /**
   * Find a Keycloak user by email (exact match).
   * Returns `null` if not found.
   */
  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    const adminToken = await this.getAdminToken();
    const response = await axios.get(
      `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
      {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 10_000,
      },
    );

    const user = response.data?.[0];
    return user?.id ? { id: user.id } : null;
  }

  /**
   * Permanently delete a Keycloak user by its Keycloak id.
   * Idempotent: a 404 (already gone) resolves successfully.
   */
  async deleteUser(keycloakId: string): Promise<void> {
    if (!keycloakEnabled) {
      throw new Error('Keycloak is not configured (missing KEYCLOAK_URL or KEYCLOAK_REALM)');
    }
    const adminToken = await this.getAdminToken();
    try {
      await axios.delete(
        `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${encodeURIComponent(keycloakId)}`,
        { headers: { Authorization: `Bearer ${adminToken}` }, timeout: 10_000 },
      );
    } catch (err: any) {
      if (err?.response?.status === 404) return; // already deleted — treat as success
      throw err;
    }
  }

  /**
   * Permanently delete a Keycloak user by email. Returns true if a user was
   * found and deleted, false if no Keycloak identity existed for that email.
   */
  async deleteUserByEmail(email: string): Promise<boolean> {
    const found = await this.findUserByEmail(email);
    if (!found) return false;
    await this.deleteUser(found.id);
    return true;
  }

  /**
   * Find or create a Keycloak user by email (idempotent).
   *
   * Options allow callers to control:
   *   - emailVerified:    true for staff invites, false for tenants / signup
   *   - requiredActions:  e.g. ['UPDATE_PASSWORD'], ['VERIFY_EMAIL','UPDATE_PASSWORD']
   *   - password:         set on creation (for signup flow)
   */
  async ensureUser(
    email: string,
    firstName: string,
    lastName: string,
    options: EnsureUserOptions = {},
  ): Promise<EnsureUserResult> {
    const adminToken = await this.getAdminToken();
    const {
      emailVerified = false,
      requiredActions = [],
      password,
    } = options;

    // 1) Check if user already exists
    const searchRes = await axios.get(
      `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
      {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 10_000,
      },
    );

    const existing = searchRes.data?.[0];
    if (existing?.id) {
      return { id: existing.id, created: false };
    }

    // 2) Create user
    const userPayload: Record<string, unknown> = {
      email,
      username: email,
      firstName: firstName || email.split('@')[0],
      lastName: lastName || 'User',
      enabled: true,
      emailVerified,
      requiredActions,
    };

    if (password) {
      userPayload.credentials = [
        { type: 'password', value: password, temporary: false },
      ];
    }

    try {
      await axios.post(
        `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
        userPayload,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
    } catch (err: any) {
      // 409 = user already exists (race condition — search again)
      if (err?.response?.status === 409) {
        const retry = await axios.get(
          `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
          {
            params: { email, exact: true },
            headers: { Authorization: `Bearer ${adminToken}` },
            timeout: 10_000,
          },
        );
        const raceUser = retry.data?.[0];
        if (raceUser?.id) {
          return { id: raceUser.id, created: false };
        }
      }
      throw err;
    }

    // 3) Fetch the newly created user ID
    const created = await axios.get(
      `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
      {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 10_000,
      },
    );

    const newUser = created.data?.[0];
    if (!newUser?.id) {
      throw new Error(`Failed to create Keycloak user for ${email}`);
    }

    logger.info('Keycloak user created', { email, keycloakId: newUser.id });
    return { id: newUser.id, created: true };
  }

  /**
   * Set (or reset) a user's password and optionally clear required-actions.
   */
  async setPassword(
    keycloakUserId: string,
    password: string,
    options?: {
      /** Clear these specific required actions.  Default: clear ALL. */
      clearActions?: string[];
      /** Set emailVerified to true after password set.  Default: false */
      markEmailVerified?: boolean;
    },
  ): Promise<void> {
    const adminToken = await this.getAdminToken();

    // Reset password
    await axios.put(
      `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUserId}/reset-password`,
      { type: 'password', temporary: false, value: password },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );

    // Update user to clear actions / verify email
    const updatePayload: Record<string, unknown> = {};

    if (options?.clearActions) {
      // Selectively remove specific required actions
      const userRes = await axios.get(
        `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUserId}`,
        { headers: { Authorization: `Bearer ${adminToken}` }, timeout: 10_000 },
      );
      const existing: string[] = Array.isArray(userRes.data?.requiredActions)
        ? userRes.data.requiredActions
        : [];
      updatePayload.requiredActions = existing.filter(
        (a: string) => !options.clearActions!.includes(a),
      );
    } else {
      // Clear ALL
      updatePayload.requiredActions = [];
    }

    if (options?.markEmailVerified) {
      updatePayload.emailVerified = true;
    }

    await axios.put(
      `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUserId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );
  }

  /**
   * Trigger Keycloak's built-in "execute actions email" for a given user.
   * Falls back gracefully on failure (logs a warning, does not throw).
   */
  async sendActionsEmail(
    keycloakUserId: string,
    actions: string[],
    options?: {
      /** Keycloak client_id to use in the redirect. */
      clientId?: string;
      /** Where Keycloak redirects back after the user completes the actions. */
      redirectUri?: string;
      /** Link lifespan in seconds.  Default: 604800 (7 days). */
      lifespan?: number;
    },
  ): Promise<void> {
    try {
      const adminToken = await this.getAdminToken();
      const clientId = options?.clientId || config.keycloak.clientId || 'propmetrik-web';

      await axios.put(
        `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUserId}/execute-actions-email`,
        actions,
        {
          params: {
            client_id: clientId,
            redirect_uri: options?.redirectUri,
            lifespan: options?.lifespan ?? 604_800,
          },
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );

      logger.info('Keycloak execute-actions email sent', { keycloakUserId, actions });
    } catch (error: any) {
      logger.warn('Failed to send Keycloak execute-actions email', {
        keycloakUserId,
        actions,
        error: error?.message,
      });
    }
  }

  /**
   * Invalidate the cached admin token (e.g. on 401 from Keycloak).
   */
  clearTokenCache(): void {
    this.cachedToken = null;
  }
}

/** Singleton instance */
export const keycloakAdminService = new KeycloakAdminService();
export default keycloakAdminService;
