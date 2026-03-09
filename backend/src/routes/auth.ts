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

const router = Router();

const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;
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
      const orgSlug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const orgResult = await client.query(
        `INSERT INTO organizations (id, name, slug, type, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'valuation_firm', true, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
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

    await client.query(
      `INSERT INTO users (
        id, email, password_hash, first_name, last_name,
        role, organization_id, subscription_tier,
        is_active, email_verified,
        created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'free', true, false, NOW(), NOW())`,
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
        tier: 'free',
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

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: defaultRole,
        tier: 'free',
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

    // Find user in local DB
    const userResult = await pool.query(
      `SELECT 
        id, email, password_hash, first_name, last_name, role,
        organization_id, subscription_tier, is_active, email_verified, keycloak_id
      FROM users WHERE email = $1`,
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

    // Generate JWT token (always a local JWT for consistency)
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        role: user.role,
        organizationId: user.organization_id,
        tier: user.subscription_tier,
      },
      JWT_SECRET,
      { expiresIn: jwtExpiresIn }
    );

    // Update last login timestamp
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
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
 * POST /api/v1/auth/logout
 * Invalidate user session
 */
router.post('/logout', async (req: Request, res: Response) => {
  // In a stateless JWT setup, logout is handled client-side
  // For additional security, you could maintain a token blacklist in Redis
  
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

      // Get fresh user data
      const userResult = await pool.query(
        `SELECT 
          id, 
          email, 
          first_name, 
          last_name, 
          role, 
          organization_id,
          subscription_tier,
          is_active,
          email_verified,
          avatar_url
        FROM users 
        WHERE id = $1`,
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

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          tier: user.subscription_tier,
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
              `SELECT id, email, first_name, last_name, role, organization_id, subscription_tier, is_active
               FROM users WHERE keycloak_id = $1`,
              [keycloakSub]
            );
            if (userResult.rows.length > 0 && userResult.rows[0].is_active) {
              const u = userResult.rows[0];
              const newToken = jwt.sign(
                { userId: u.id, email: u.email, name: `${u.first_name || ''} ${u.last_name || ''}`.trim(), role: u.role, organizationId: u.organization_id, tier: u.subscription_tier },
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
        'SELECT id, email, first_name, last_name, role, organization_id, subscription_tier, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      const user = userResult.rows[0];
      if (!user || !user.is_active) {
        return res.status(401).json({ success: false, message: 'User not found or inactive' });
      }

      const newToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          role: user.role,
          organizationId: user.organization_id,
          tier: user.subscription_tier,
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
