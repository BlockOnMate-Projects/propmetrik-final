/**
 * Authentication Routes
 * 
 * Handles email/password login (Keycloak-primary with local fallback),
 * signup (Keycloak-integrated), session management, and token refresh.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../database';
import { logger } from '../utils/logger';
import config from '../config';
import { keycloakAdminService } from '../services/keycloakAdminService';
import { sendWelcomeEmail } from '../services/email/welcomeEmail';
import { OAuth2Client } from 'google-auth-library';

const router = Router();

const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

// Verifies Google ID tokens for POST /auth/google (audience checked per-request).
const googleOAuthClient = new OAuth2Client();

/**
 * Query the active service subscriptions for a user.
 * Returns an array of service_key strings (e.g. ['projects', 'valuations']).
 * Staff users get all active services by default.
 */
async function getUserSubscribedServices(userId: string, userType?: string): Promise<string[]> {
  // Staff bypass — they get access to everything
  if (!userType || userType === 'staff') {
    const allServices = await pool.query(
      `SELECT service_key FROM platform_services WHERE is_active = true ORDER BY service_key`
    );
    return allServices.rows.map((r: any) => r.service_key);
  }
  // Customer users — only services they're subscribed to + shared services
  const result = await pool.query(
    `SELECT ps.service_key
     FROM user_service_subscriptions uss
     JOIN platform_services ps ON ps.id = uss.service_id
     WHERE uss.user_id = $1 AND uss.status = 'active' AND ps.is_active = true
     UNION
     SELECT ps.service_key
     FROM platform_services ps
     WHERE ps.category = 'shared' AND ps.is_active = true
     ORDER BY service_key`,
    [userId]
  );
  return result.rows.map((r: any) => r.service_key);
}
// Cast JWT_EXPIRES_IN for jsonwebtoken compatibility
const jwtExpiresIn = JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];

// Keycloak Admin — delegated to centralized KeycloakAdminService

// ============================================================================
// Signup (Keycloak + Local DB)
// ============================================================================

/**
 * POST /api/v1/auth/signup
 * Register a new user — creates in Keycloak (if configured) and local DB
 */
router.post('/signup', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { firstName, lastName, email, password, companyName } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, email, and password are required',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    await client.query('BEGIN');

    // ---- Create or link Organization if company name provided ----
    let organizationId: string | null = null;
    if (companyName && companyName.trim()) {
      const baseSlug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org';
      // SECURITY: never join a self-service signup into an EXISTING org (the old
      // `ON CONFLICT (slug) DO UPDATE ... RETURNING id` made the new user
      // firm_principal of whoever already owned that slug). Always create a fresh
      // org; on slug collision, disambiguate with a short random suffix.
      const slugTaken = await client.query('SELECT 1 FROM organizations WHERE slug = $1', [baseSlug]);
      const orgSlug = slugTaken.rows.length > 0 ? `${baseSlug}-${uuidv4().slice(0, 8)}` : baseSlug;
      const orgResult = await client.query(
        `INSERT INTO organizations (id, name, slug, type, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'valuation_firm', true, NOW(), NOW())
         RETURNING id`,
        [uuidv4(), companyName.trim(), orgSlug]
      );
      organizationId = orgResult.rows[0].id;
    }

    // ---- Hash password ----
    const passwordHash = await bcrypt.hash(password, 12);

    // ---- Create local DB user ----
    const userId = uuidv4();
    const defaultRole = organizationId ? 'firm_principal' : 'viewer';

    // Public signup is always a CUSTOMER (a new org owner subscribing to the
    // platform). 'staff' (PropMetrik employee) is only granted by provisioning a
    // user into the platform org — never via self-service signup.
    await client.query(
      `INSERT INTO users (
        id, email, password_hash, first_name, last_name,
        role, organization_id, subscription_tier, user_type,
        is_active, email_verified,
        created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'starter', 'customer', true, false, NOW(), NOW())`,
      [userId, normalizedEmail, passwordHash, firstName.trim(), lastName.trim(), defaultRole, organizationId]
    );

    // ---- Create user in Keycloak (best-effort) ----
    let keycloakUserId: string | null = null;
    try {
      if (keycloakAdminService.enabled) {
        const kcResult = await keycloakAdminService.ensureUser(
          normalizedEmail,
          firstName.trim(),
          lastName.trim(),
          { emailVerified: false, password },
        );
        keycloakUserId = kcResult.id;
        if (keycloakUserId) {
          await client.query(
            'UPDATE users SET keycloak_id = $1 WHERE id = $2',
            [keycloakUserId, userId]
          );
        }
      } else {
        logger.warn('Keycloak not available — user created locally only', { email: normalizedEmail });
      }
    } catch (kcErr) {
      logger.error('Keycloak user creation failed (non-blocking)', { email: normalizedEmail, error: kcErr });
      // Continue — the local account is still valid
    }

    await client.query('COMMIT');

    // ---- Generate JWT ----
    const token = jwt.sign(
      {
        userId,
        email: normalizedEmail,
        role: defaultRole,
        organizationId,
        tier: 'starter',
        userType: 'customer',
      },
      JWT_SECRET,
      { expiresIn: jwtExpiresIn }
    );

    logger.info('User registered', {
      userId,
      email: normalizedEmail,
      keycloakUserId: keycloakUserId || 'none',
      hasOrganization: !!organizationId,
    });

    // Welcome email (best-effort — never blocks signup)
    sendWelcomeEmail({ userId, email: normalizedEmail, firstName, organizationId }).catch((mailErr: any) =>
      logger.warn('Welcome email failed (non-blocking)', { email: normalizedEmail, error: mailErr?.message })
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: defaultRole,
        tier: 'starter',
        emailVerified: false,
        organization: organizationId ? { id: organizationId, name: companyName?.trim() } : null,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Signup error', { error: error?.message });

    if (error?.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred during signup. Please try again.',
    });
  } finally {
    client.release();
  }
});

// ============================================================================
// Email verification
// ============================================================================

/**
 * GET /api/v1/auth/verify-email?token=...
 * Confirm a user's email from the link in the welcome email. Idempotent.
 */
router.get('/verify-email', async (req: Request, res: Response) => {
  const token = (req.query.token as string) || '';
  if (!token) {
    return res.status(400).json({ success: false, message: 'Missing verification token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload?.purpose !== 'email_verify' || !payload?.userId) {
      return res.status(400).json({ success: false, message: 'Invalid verification link' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET email_verified = true, updated_at = NOW()
       WHERE id = $1 RETURNING email, keycloak_id`,
      [payload.userId]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Best-effort: mirror to Keycloak so the IdP also shows the email verified.
    if (rows[0].keycloak_id && keycloakAdminService.enabled) {
      try {
        const adminToken = await keycloakAdminService.getAdminToken();
        const axios = (await import('axios')).default;
        const kcUrl = (config.keycloak?.url || '').replace(/\/$/, '');
        await axios.put(
          `${kcUrl}/admin/realms/${config.keycloak.realm}/users/${rows[0].keycloak_id}`,
          { emailVerified: true },
          { headers: { Authorization: `Bearer ${adminToken}` }, timeout: 10000 }
        );
      } catch (kcErr: any) {
        logger.warn('verify-email: Keycloak sync failed (non-blocking)', { error: kcErr?.message });
      }
    }

    logger.info('Email verified', { userId: payload.userId, email: rows[0].email });
    return res.json({ success: true, message: 'Email verified' });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: 'This verification link is invalid or has expired. Please request a new one.',
    });
  }
});

/**
 * POST /api/v1/auth/resend-verification  { email }
 * Re-send the verification email. Always returns 200 (no account enumeration).
 */
router.post('/resend-verification', async (req: Request, res: Response) => {
  const email = ((req.body?.email as string) || '').toLowerCase().trim();
  const generic = { success: true, message: 'If that account exists and is unverified, a new link is on its way.' };
  if (!email) return res.json(generic);
  try {
    const { rows } = await pool.query(
      'SELECT id, first_name, email_verified FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    if (user && !user.email_verified) {
      const appUrl = config.app?.frontendUrl || 'https://propmetrik.com';
      const verifyToken = jwt.sign(
        { purpose: 'email_verify', userId: user.id, email },
        JWT_SECRET,
        { expiresIn: '3d' }
      );
      const verifyUrl = `${appUrl}/verify-email?token=${verifyToken}`;
      const { notify } = await import('../../shared-services/notifications/notify');
      await notify({
        recipients: { audience: 'staff', userId: user.id, email, name: user.first_name },
        category: 'system',
        type: 'account.verify_email',
        title: 'Confirm your email — PROPMETRIK',
        body: 'Please confirm your email address to secure your account.',
        channels: { inApp: false, email: true },
        email: {
          subject: 'Confirm your email — PROPMETRIK',
          html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#18181b">
            <p>Confirm your email address to secure your PROPMETRIK account.</p>
            <p style="margin:24px 0"><a href="${verifyUrl}" style="background:#f59e0b;color:#0a0a0a;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">Verify email</a></p>
            <p style="color:#71717a;font-size:13px">This link expires in 3 days. If you didn't request it, you can ignore this email.</p></div>`,
          text: `Confirm your email: ${verifyUrl}`,
        },
      }).catch(() => {});
    }
  } catch (err: any) {
    logger.warn('resend-verification failed (non-blocking)', { error: err?.message });
  }
  return res.json(generic);
});

// ============================================================================
// Login
// ============================================================================

/**
 * POST /api/v1/auth/login
 * Authenticate user with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user in local DB (join org for canonical subscription tier)
    const userResult = await pool.query(
      `SELECT 
        u.id, u.email, u.password_hash, u.first_name, u.last_name, u.role,
        u.organization_id, COALESCE(o.subscription_tier, u.subscription_tier, 'starter') AS subscription_tier,
        u.is_active, u.email_verified, u.keycloak_id, u.user_type
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = $1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      logger.warn('Login attempt for non-existent user', { email: normalizedEmail });
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    if (!user.is_active) {
      logger.warn('Login attempt for inactive user', { email: normalizedEmail, userId: user.id });
      return res.status(401).json({ 
        success: false,
        message: 'Account is disabled. Please contact support.' 
      });
    }

    // ── Strategy 1: Authenticate via Keycloak (primary) ─────────────────────
    let keycloakToken: string | null = null;
    let authMethod: 'keycloak' | 'local' = 'local';

    if (keycloakAdminService.enabled && config.keycloak.clientId) {
      try {
        const tokenUrl = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/token`;
        const kcResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: config.keycloak.clientId,
            ...(config.keycloak.clientSecret ? { client_secret: config.keycloak.clientSecret } : {}),
            username: normalizedEmail,
            password,
          }),
        });

        if (kcResponse.ok) {
          const kcData = await kcResponse.json() as { access_token: string };
          keycloakToken = kcData.access_token;
          authMethod = 'keycloak';
          logger.info('Keycloak authentication succeeded', { email: normalizedEmail });
        } else {
          logger.debug('Keycloak auth failed — falling back to local DB', { email: normalizedEmail, status: kcResponse.status });
        }
      } catch (kcErr) {
        logger.debug('Keycloak auth unavailable — falling back to local DB', { error: (kcErr as Error).message });
      }
    }

    // ── Strategy 2: Local bcrypt verification (fallback) ────────────────────
    if (!keycloakToken) {
      if (!user.password_hash) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        logger.warn('Invalid password attempt', { email: normalizedEmail, userId: user.id });
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      // Sync password to Keycloak (best-effort) if user has a keycloak_id
      if (keycloakAdminService.enabled && user.keycloak_id) {
        keycloakAdminService.setPassword(user.keycloak_id, password).catch((err) => {
          logger.debug('Failed to sync password to Keycloak', { error: (err as Error).message });
        });
      }
    }

    // Get organization info
    let organization = null;
    if (user.organization_id) {
      const orgResult = await pool.query(
        'SELECT id, name, type, slug FROM organizations WHERE id = $1',
        [user.organization_id]
      );
      organization = orgResult.rows[0] || null;
    }

    // Fetch user's subscribed services
    const subscribedServices = await getUserSubscribedServices(user.id, user.user_type);

    // Generate JWT token (always a local JWT for consistency)
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        role: user.role,
        organizationId: user.organization_id,
        tier: user.subscription_tier,
        userType: user.user_type || 'customer',
        subscribedServices,
      },
      JWT_SECRET,
      { expiresIn: jwtExpiresIn }
    );

    // Update login tracking. A successful password login proves the user owns the
    // account, so promote a 'pending_verification' account to 'active' (email
    // verification remains tracked separately via email_verified).
    await pool.query(
      `UPDATE users
          SET last_login_at = NOW(),
              login_count = COALESCE(login_count, 0) + 1,
              status = CASE WHEN status = 'pending_verification' THEN 'active'::user_status_enum ELSE status END
        WHERE id = $1`,
      [user.id]
    );

    logger.info('User logged in successfully', { 
      userId: user.id, 
      email: user.email,
      role: user.role,
      authMethod,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        tier: user.subscription_tier,
        userType: user.user_type || 'customer',
        subscribedServices,
        emailVerified: user.email_verified,
        organization,
      },
    });
  } catch (error) {
    logger.error('Login error', { error });
    res.status(500).json({ 
      success: false,
      message: 'An error occurred during login. Please try again.' 
    });
  }
});

// ============================================================================
// Logout
// ============================================================================

/**
 * POST /api/v1/auth/google
 * Handle Google OAuth sign-in/sign-up (called from NextAuth signIn callback).
 * Creates user if not exists, returns JWT + user for session.
 */
router.post('/google', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { idToken } = req.body;

    // SECURITY: verify the Google ID token server-side. Previously this endpoint
    // trusted client-supplied {email, googleId} and minted a JWT for ANY email —
    // a full account-takeover. We now accept only a Google-signed id_token and
    // derive identity from its verified claims.
    const audiences = [config.google.clientId, process.env.AUTH_GOOGLE_ID].filter(Boolean) as string[];
    if (!idToken || audiences.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'A verifiable Google ID token is required',
      });
    }

    let normalizedEmail: string;
    let googleId: string;
    let firstName = '';
    let lastName = '';
    try {
      const ticket = await googleOAuthClient.verifyIdToken({ idToken, audience: audiences });
      const p = ticket.getPayload();
      if (!p || !p.sub || !p.email || !p.email_verified) {
        throw new Error('Google token missing verified email');
      }
      normalizedEmail = p.email.toLowerCase().trim();
      googleId = p.sub;
      firstName = (p.given_name || '').trim();
      lastName = (p.family_name || '').trim();
    } catch (verr: any) {
      logger.warn('Google ID token verification failed', { error: verr?.message });
      return res.status(401).json({ success: false, message: 'Invalid Google credentials' });
    }

    // Check if user already exists
    const existing = await client.query(
      `SELECT 
        u.id, u.email, u.first_name, u.last_name, u.role,
        u.organization_id, COALESCE(o.subscription_tier, u.subscription_tier, 'starter') AS subscription_tier,
        u.is_active, u.email_verified, u.user_type, u.google_id,
        u.onboarding_completed
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = $1`,
      [normalizedEmail]
    );

    let user = existing.rows[0];
    let isNewUser = false;

    if (user) {
      // Existing user — update Google ID if not set, update last login
      if (!user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Account is disabled. Please contact support.',
        });
      }

      if (!user.google_id) {
        await client.query(
          'UPDATE users SET google_id = $1, email_verified = true, updated_at = NOW() WHERE id = $2',
          [googleId, user.id]
        );
      }

      await client.query(
        `UPDATE users
            SET last_login_at = NOW(),
                login_count = COALESCE(login_count, 0) + 1,
                status = CASE WHEN status = 'pending_verification' THEN 'active'::user_status_enum ELSE status END
          WHERE id = $1`,
        [user.id]
      );
    } else {
      // New user — create account
      isNewUser = true;
      const userId = uuidv4();

      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (
          id, email, first_name, last_name, role,
          subscription_tier, is_active, email_verified,
          google_id, onboarding_completed,
          created_at, updated_at, last_login_at
        ) VALUES ($1, $2, $3, $4, 'viewer', 'starter', true, true, $5, false, NOW(), NOW(), NOW())`,
        [userId, normalizedEmail, (firstName || '').trim(), (lastName || '').trim(), googleId]
      );
      await client.query('COMMIT');

      // Re-fetch to get canonical fields
      const refetch = await client.query(
        `SELECT 
          u.id, u.email, u.first_name, u.last_name, u.role,
          u.organization_id, COALESCE(o.subscription_tier, u.subscription_tier, 'starter') AS subscription_tier,
          u.is_active, u.email_verified, u.user_type, u.google_id,
          u.onboarding_completed
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE u.id = $1`,
        [userId]
      );
      user = refetch.rows[0];

      logger.info('Google OAuth user registered', {
        userId,
        email: normalizedEmail,
        isNewUser: true,
      });
    }

    // Get organization info
    let organization = null;
    if (user.organization_id) {
      const orgResult = await client.query(
        'SELECT id, name, type, slug FROM organizations WHERE id = $1',
        [user.organization_id]
      );
      organization = orgResult.rows[0] || null;
    }

    // Fetch subscribed services
    const subscribedServices = await getUserSubscribedServices(user.id, user.user_type);

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        role: user.role,
        organizationId: user.organization_id,
        tier: user.subscription_tier,
        userType: user.user_type || 'customer',
        subscribedServices,
      },
      JWT_SECRET,
      { expiresIn: jwtExpiresIn }
    );

    res.json({
      success: true,
      isNewUser,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        tier: user.subscription_tier,
        userType: user.user_type || 'customer',
        subscribedServices,
        emailVerified: true,
        onboardingCompleted: user.onboarding_completed ?? !isNewUser,
        organization,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Google OAuth error', { error: error?.message });
    res.status(500).json({
      success: false,
      message: 'Google authentication failed. Please try again.',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/auth/logout
 * Invalidate user session
 */
router.post('/logout', async (req: Request, res: Response) => {
  // Revoke the presented token by adding its jti to the Redis blacklist that the
  // authenticate middleware already checks (auth.ts isTokenBlacklisted). Best-effort:
  // a decode failure or missing jti/exp just falls through to a successful response.
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = jwt.decode(token) as { jti?: string; exp?: number } | null;
      if (decoded?.jti && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          const { blacklistToken } = await import('../middleware/auth');
          await blacklistToken(decoded.jti, ttl);
        }
      }
    }
  } catch (error) {
    logger.warn('Logout token blacklist failed (non-fatal)', { error });
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// ============================================================================
// Get Current User
// ============================================================================

/**
 * GET /api/v1/auth/me
 * Get current authenticated user info
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        email: string;
        role: string;
        organizationId: string;
        tier: string;
      };

      // Get fresh user data (join org for canonical tier)
      const userResult = await pool.query(
        `SELECT 
          u.id, 
          u.email, 
          u.first_name, 
          u.last_name, 
          u.role, 
          u.organization_id,
          COALESCE(o.subscription_tier, u.subscription_tier, 'starter') AS subscription_tier,
          u.is_active,
          u.email_verified,
          u.avatar_url,
          u.user_type
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE u.id = $1`,
        [decoded.userId]
      );

      const user = userResult.rows[0];

      if (!user || !user.is_active) {
        return res.status(401).json({ 
          success: false,
          message: 'User not found or inactive' 
        });
      }

      // Get organization info
      let organization = null;
      if (user.organization_id) {
        const orgResult = await pool.query(
          'SELECT id, name, type, slug FROM organizations WHERE id = $1',
          [user.organization_id]
        );
        organization = orgResult.rows[0] || null;
      }

      // Fetch subscribed services
      const subscribedServices = await getUserSubscribedServices(user.id, user.user_type);

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          tier: user.subscription_tier,
          userType: user.user_type || 'customer',
          subscribedServices,
          emailVerified: user.email_verified,
          avatarUrl: user.avatar_url,
          organization,
        },
      });
    } catch {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }
  } catch (error) {
    logger.error('Get current user error', { error });
    res.status(500).json({ 
      success: false,
      message: 'An error occurred' 
    });
  }
});

// ============================================================================
// Refresh Token
// ============================================================================

/**
 * POST /api/v1/auth/refresh
 * Refresh JWT token.
 *
 * Accepts either:
 * - Authorization: Bearer <localJwt>  (refreshes the local JWT)
 * - Body: { refresh_token }           (exchanges Keycloak refresh token)
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // ── Strategy 1: Keycloak refresh_token in request body ────────────────
    const { refresh_token: refreshToken } = req.body || {};
    if (refreshToken && keycloakAdminService.enabled && config.keycloak.clientId) {
      try {
        const tokenUrl = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/token`;
        const kcResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: config.keycloak.clientId,
            ...(config.keycloak.clientSecret ? { client_secret: config.keycloak.clientSecret } : {}),
            refresh_token: refreshToken,
          }),
        });

        if (kcResponse.ok) {
          const kcData = await kcResponse.json() as { access_token: string; refresh_token: string; expires_in: number };

          // Decode the new access_token to get the user ID
          let keycloakSub: string | null = null;
          try {
            const payload = JSON.parse(Buffer.from(kcData.access_token.split('.')[1], 'base64').toString());
            keycloakSub = payload.sub;
          } catch { /* ignore */ }

          // Look up local user by keycloak_id to issue a synced local JWT
          if (keycloakSub) {
            const userResult = await pool.query(
              `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.organization_id,
                      COALESCE(o.subscription_tier, u.subscription_tier, 'starter') AS subscription_tier,
                      u.is_active, u.user_type
               FROM users u
               LEFT JOIN organizations o ON o.id = u.organization_id
               WHERE u.keycloak_id = $1`,
              [keycloakSub]
            );
            if (userResult.rows.length > 0 && userResult.rows[0].is_active) {
              const u = userResult.rows[0];
              const kcSubscribedServices = await getUserSubscribedServices(u.id, u.user_type);
              const newToken = jwt.sign(
                { userId: u.id, email: u.email, name: `${u.first_name || ''} ${u.last_name || ''}`.trim(), role: u.role, organizationId: u.organization_id, tier: u.subscription_tier, userType: u.user_type || 'staff', subscribedServices: kcSubscribedServices },
                JWT_SECRET,
                { expiresIn: jwtExpiresIn }
              );
              logger.info('Token refreshed via Keycloak', { userId: u.id, email: u.email });
              return res.json({
                success: true,
                token: newToken,
                keycloak_access_token: kcData.access_token,
                keycloak_refresh_token: kcData.refresh_token,
                keycloak_expires_in: kcData.expires_in,
              });
            }
          }

          // If we can't map to a local user, return the refreshed Keycloak tokens directly
          return res.json({
            success: true,
            keycloak_access_token: kcData.access_token,
            keycloak_refresh_token: kcData.refresh_token,
            keycloak_expires_in: kcData.expires_in,
          });
        } else {
          const errBody = await kcResponse.text();
          logger.debug('Keycloak refresh failed', { status: kcResponse.status, body: errBody });
          return res.status(401).json({ success: false, message: 'Refresh token expired or invalid. Please login again.' });
        }
      } catch (kcErr) {
        logger.error('Keycloak refresh error', { error: (kcErr as Error).message });
        return res.status(401).json({ success: false, message: 'Token refresh failed' });
      }
    }

    // ── Strategy 2: Local JWT refresh via Authorization header ────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const oldToken = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(oldToken, JWT_SECRET, { ignoreExpiration: true }) as {
        userId: string;
        email: string;
        role: string;
        organizationId: string;
        tier: string;
        exp: number;
      };

      // Use the configurable refresh window (default: 30 days)
      const refreshMaxAgeSec = parseExpiry(config.jwt.refreshExpiresIn);
      const now = Math.floor(Date.now() / 1000);

      if (decoded.exp && (now - decoded.exp) > refreshMaxAgeSec) {
        return res.status(401).json({
          success: false,
          message: 'Token too old to refresh. Please login again.',
        });
      }

      // Verify user still exists and is active
      const userResult = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.organization_id,
                COALESCE(o.subscription_tier, u.subscription_tier, 'starter') AS subscription_tier,
                u.is_active, u.user_type
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.id = $1`,
        [decoded.userId]
      );

      const user = userResult.rows[0];
      if (!user || !user.is_active) {
        return res.status(401).json({ success: false, message: 'User not found or inactive' });
      }

      const localSubscribedServices = await getUserSubscribedServices(user.id, user.user_type);

      const newToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          role: user.role,
          organizationId: user.organization_id,
          tier: user.subscription_tier,
          userType: user.user_type || 'customer',
          subscribedServices: localSubscribedServices,
        },
        JWT_SECRET,
        { expiresIn: jwtExpiresIn }
      );

      res.json({ success: true, token: newToken });
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  } catch (error) {
    logger.error('Token refresh error', { error });
    res.status(500).json({ success: false, message: 'An error occurred' });
  }
});

/** Parse a duration string like '30d', '7d', '24h' into seconds */
function parseExpiry(value: string): number {
  const match = value.match(/^(\d+)([dhms])$/);
  if (!match) return 30 * 24 * 3600; // default 30 days
  const num = parseInt(match[1]);
  switch (match[2]) {
    case 'd': return num * 86400;
    case 'h': return num * 3600;
    case 'm': return num * 60;
    case 's': return num;
    default: return 30 * 86400;
  }
}

export default router;
