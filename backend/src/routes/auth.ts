/**
 * Authentication Routes
 * 
 * Handles email/password login, signup (Keycloak-integrated), and session management
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../database';
import { logger } from '../utils/logger';
import config from '../config';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'propmetrik-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// Cast JWT_EXPIRES_IN for jsonwebtoken compatibility
const jwtExpiresIn = JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];

// Keycloak Admin helpers
const keycloakUrl = (config.keycloak.url || '').replace(/\/$/, '');
const keycloakRealm = config.keycloak.realm || '';
const keycloakEnabled = !!(keycloakUrl && keycloakRealm);

async function getKeycloakAdminToken(): Promise<string | null> {
  if (!keycloakEnabled) return null;

  const adminClientId = config.keycloak.adminClientId || config.keycloak.clientId;
  const adminSecret = config.keycloak.adminSecret || config.keycloak.clientSecret;
  const adminRealm = config.keycloak.adminRealm || 'master';
  const adminUsername = config.keycloak.adminUsername;
  const adminPassword = config.keycloak.adminPassword;

  const requestToken = async (realm: string, params: Record<string, string>): Promise<string> => {
    const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
    const response = await axios.post(tokenUrl, new URLSearchParams(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });
    return response.data.access_token;
  };

  // Strategy 1: client_credentials on app realm
  try {
    if (adminClientId && adminSecret) {
      return await requestToken(keycloakRealm, {
        grant_type: 'client_credentials',
        client_id: adminClientId,
        client_secret: adminSecret,
      });
    }
  } catch { /* fall through */ }

  // Strategy 2: client_credentials on admin realm
  try {
    if (adminClientId && adminSecret && adminRealm !== keycloakRealm) {
      return await requestToken(adminRealm, {
        grant_type: 'client_credentials',
        client_id: adminClientId,
        client_secret: adminSecret,
      });
    }
  } catch { /* fall through */ }

  // Strategy 3: password grant with admin credentials
  try {
    if (adminUsername && adminPassword) {
      return await requestToken(adminRealm, {
        grant_type: 'password',
        client_id: adminClientId || 'admin-cli',
        username: adminUsername,
        password: adminPassword,
      });
    }
  } catch { /* fall through */ }

  logger.warn('Could not obtain Keycloak admin token — all strategies failed');
  return null;
}

async function createKeycloakUser(
  adminToken: string,
  email: string,
  firstName: string,
  lastName: string,
  password: string
): Promise<string | null> {
  try {
    // Create user
    await axios.post(
      `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
      {
        email,
        username: email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: false,
        credentials: [{
          type: 'password',
          value: password,
          temporary: false,
        }],
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    // Look up the created user to get the Keycloak ID
    const searchRes = await axios.get(
      `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
      {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 10000,
      }
    );

    const kcUser = searchRes.data?.[0];
    if (kcUser?.id) {
      logger.info('Keycloak user created', { email, keycloakId: kcUser.id });
      return kcUser.id;
    }

    return null;
  } catch (err: any) {
    // 409 = user already exists in Keycloak
    if (err?.response?.status === 409) {
      logger.info('User already exists in Keycloak, linking', { email });
      const searchRes = await axios.get(
        `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
        {
          params: { email, exact: true },
          headers: { Authorization: `Bearer ${adminToken}` },
          timeout: 10000,
        }
      );
      return searchRes.data?.[0]?.id || null;
    }
    logger.error('Failed to create Keycloak user', { email, error: err?.message });
    return null;
  }
}

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
      const adminToken = await getKeycloakAdminToken();
      if (adminToken) {
        keycloakUserId = await createKeycloakUser(adminToken, normalizedEmail, firstName.trim(), lastName.trim(), password);
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

    // Find user by email
    const userResult = await pool.query(
      `SELECT 
        id, 
        email, 
        password_hash, 
        first_name, 
        last_name, 
        role, 
        organization_id,
        subscription_tier,
        is_active,
        email_verified
      FROM users 
      WHERE email = $1`,
      [email.toLowerCase()]
    );

    const user = userResult.rows[0];

    if (!user) {
      logger.warn('Login attempt for non-existent user', { email });
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if user is active
    if (!user.is_active) {
      logger.warn('Login attempt for inactive user', { email, userId: user.id });
      return res.status(401).json({ 
        success: false,
        message: 'Account is disabled. Please contact support.' 
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('Invalid password attempt', { email, userId: user.id });
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
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

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
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
      role: user.role 
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
 * Refresh JWT token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided' 
      });
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

      // Only allow refresh within 7 days of expiration
      const now = Math.floor(Date.now() / 1000);
      const sevenDaysInSeconds = 7 * 24 * 60 * 60;
      
      if (decoded.exp && (now - decoded.exp) > sevenDaysInSeconds) {
        return res.status(401).json({ 
          success: false,
          message: 'Token too old to refresh. Please login again.' 
        });
      }

      // Verify user still exists and is active
      const userResult = await pool.query(
        'SELECT id, role, organization_id, subscription_tier, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      const user = userResult.rows[0];

      if (!user || !user.is_active) {
        return res.status(401).json({ 
          success: false,
          message: 'User not found or inactive' 
        });
      }

      // Generate new token with fresh data
      const newToken = jwt.sign(
        {
          userId: user.id,
          email: decoded.email,
          name: user.name,
          role: user.role,
          organizationId: user.organization_id,
          tier: user.subscription_tier,
        },
        JWT_SECRET,
        { expiresIn: jwtExpiresIn }
      );

      res.json({
        success: true,
        token: newToken,
      });
    } catch {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
  } catch (error) {
    logger.error('Token refresh error', { error });
    res.status(500).json({ 
      success: false,
      message: 'An error occurred' 
    });
  }
});

export default router;
