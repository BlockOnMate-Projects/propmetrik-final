/**
 * Authentication Routes
 * 
 * Handles email/password login and session management
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../database';
import { logger } from '../utils/logger';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'propmetrik-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// Cast JWT_EXPIRES_IN for jsonwebtoken compatibility
const jwtExpiresIn = JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];

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
