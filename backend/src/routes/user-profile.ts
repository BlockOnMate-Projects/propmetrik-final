/**
 * User Profile Routes
 * Profile management, password change, notification preferences, user stats
 *
 * Endpoints:
 *   GET    /profile                    - Get current user's full profile
 *   PUT    /profile                    - Update profile (name, phone, avatar)
 *   PUT    /password                   - Change password
 *   GET    /notification-preferences   - Get notification preferences
 *   PUT    /notification-preferences   - Update notification preferences
 *   GET    /stats                      - User quick stats (valuations, deals, properties)
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool } from '../database';
import * as bcrypt from 'bcryptjs';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Helper to get user ID from request
function getUserId(req: Request): string {
  return (req.user as any)?.sub || (req.user as any)?.id || '';
}

// ════════════════════════════════════════════════════════════════════
//  GET /profile — Full user profile with org info
// ════════════════════════════════════════════════════════════════════
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const result = await pool.query(
      `SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.display_name,
        u.phone,
        u.avatar_url,
        u.role,
        u.status,
        u.email_verified,
        u.phone_verified,
        u.preferred_region,
        u.subscription_tier,
        u.subscription_expires_at,
        u.last_login_at,
        u.login_count,
        u.created_at,
        u.updated_at,
        o.id as org_id,
        o.name as org_name,
        o.type as org_type,
        o.slug as org_slug
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const u = result.rows[0];
    res.json({
      success: true,
      profile: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        displayName: u.display_name,
        phone: u.phone,
        avatarUrl: u.avatar_url,
        role: u.role,
        status: u.status,
        emailVerified: u.email_verified,
        phoneVerified: u.phone_verified,
        preferredRegion: u.preferred_region,
        subscriptionTier: u.subscription_tier,
        subscriptionExpiresAt: u.subscription_expires_at,
        lastLoginAt: u.last_login_at,
        loginCount: u.login_count,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        organization: u.org_id ? {
          id: u.org_id,
          name: u.org_name,
          type: u.org_type,
          slug: u.org_slug,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  PUT /profile — Update profile fields
// ════════════════════════════════════════════════════════════════════
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { firstName, lastName, displayName, phone } = req.body;

    // Build dynamic SET clause
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIdx++}`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIdx++}`);
      values.push(lastName);
    }
    if (displayName !== undefined) {
      updates.push(`display_name = $${paramIdx++}`);
      values.push(displayName);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIdx++}`);
      values.push(phone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING 
        first_name, last_name, display_name, phone, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const u = result.rows[0];
    res.json({
      success: true,
      message: 'Profile updated',
      profile: {
        firstName: u.first_name,
        lastName: u.last_name,
        displayName: u.display_name,
        phone: u.phone,
        updatedAt: u.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  PUT /password — Change password
// ════════════════════════════════════════════════════════════════════
router.put('/password', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    // Get current hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify current password
    if (user.password_hash) {
      const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validPassword) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
    }

    // Hash new password & save
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, userId]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  GET /notification-preferences — Get user notification preferences
// ════════════════════════════════════════════════════════════════════
router.get('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // Try dedicated notification_preferences table first
    const prefResult = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    if (prefResult.rows.length > 0) {
      const p = prefResult.rows[0];
      return res.json({
        success: true,
        preferences: {
          email: p.email_enabled ?? true,
          push: p.push_enabled ?? true,
          sms: p.sms_enabled ?? false,
          whatsapp: p.whatsapp_enabled ?? false,
          inboxEnabled: p.inbox_enabled ?? true,
          emailDigest: p.email_digest_enabled ?? true,
          emailDigestFrequency: p.email_digest_frequency ?? 'daily',
          categories: p.category_settings ?? {},
          quietHoursStart: p.quiet_hours_start,
          quietHoursEnd: p.quiet_hours_end,
          quietHoursTimezone: p.quiet_hours_timezone,
        },
      });
    }

    // Fall back to users.notification_settings JSONB column
    const userResult = await pool.query(
      'SELECT notification_settings FROM users WHERE id = $1',
      [userId]
    );

    const settings = userResult.rows[0]?.notification_settings || { email: true, sms: true, push: true };

    res.json({
      success: true,
      preferences: {
        email: settings.email ?? true,
        push: settings.push ?? true,
        sms: settings.sms ?? false,
        whatsapp: false,
        inboxEnabled: true,
        emailDigest: true,
        emailDigestFrequency: 'daily',
        categories: {},
      },
    });
  } catch (error: any) {
    console.error('Get notification prefs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notification preferences' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  PUT /notification-preferences — Update notification preferences
// ════════════════════════════════════════════════════════════════════
router.put('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const prefs = req.body;

    // Try upsert on dedicated notification_preferences table
    const upResult = await pool.query(
      `INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, sms_enabled, whatsapp_enabled, 
        inbox_enabled, email_digest_enabled, email_digest_frequency, category_settings,
        quiet_hours_start, quiet_hours_end, quiet_hours_timezone, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET
        email_enabled = EXCLUDED.email_enabled,
        push_enabled = EXCLUDED.push_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        whatsapp_enabled = EXCLUDED.whatsapp_enabled,
        inbox_enabled = EXCLUDED.inbox_enabled,
        email_digest_enabled = EXCLUDED.email_digest_enabled,
        email_digest_frequency = EXCLUDED.email_digest_frequency,
        category_settings = EXCLUDED.category_settings,
        quiet_hours_start = EXCLUDED.quiet_hours_start,
        quiet_hours_end = EXCLUDED.quiet_hours_end,
        quiet_hours_timezone = EXCLUDED.quiet_hours_timezone,
        updated_at = NOW()
      RETURNING *`,
      [
        userId,
        prefs.email ?? true,
        prefs.push ?? true,
        prefs.sms ?? false,
        prefs.whatsapp ?? false,
        prefs.inboxEnabled ?? true,
        prefs.emailDigest ?? true,
        prefs.emailDigestFrequency ?? 'daily',
        JSON.stringify(prefs.categories ?? {}),
        prefs.quietHoursStart ?? null,
        prefs.quietHoursEnd ?? null,
        prefs.quietHoursTimezone ?? null,
      ]
    ).catch(() => ({ rows: [] }));

    if (upResult.rows.length === 0) {
      // Fall back: update the users.notification_settings JSONB
      await pool.query(
        `UPDATE users SET notification_settings = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ email: prefs.email, sms: prefs.sms, push: prefs.push }), userId]
      );
    }

    res.json({ success: true, message: 'Notification preferences updated' });
  } catch (error: any) {
    console.error('Update notification prefs error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification preferences' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  GET /stats — User quick stats
// ════════════════════════════════════════════════════════════════════
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // Get org_id for the user
    const userRow = await pool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
    const orgId = userRow.rows[0]?.organization_id;

    // Parallel queries for stats
    const [valuationsRes, dealsRes, propertiesRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count FROM valuations 
         WHERE organization_id = $1 OR requested_by = $2`,
        [orgId, userId]
      ).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(
        `SELECT COUNT(*) as count FROM deals 
         WHERE organization_id = $1 AND status = 'closed_won'`,
        [orgId]
      ).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(
        `SELECT COUNT(*) as count FROM properties 
         WHERE organization_id = $1`,
        [orgId]
      ).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    res.json({
      success: true,
      stats: {
        valuations: parseInt(valuationsRes.rows[0]?.count || '0'),
        dealsClosed: parseInt(dealsRes.rows[0]?.count || '0'),
        properties: parseInt(propertiesRes.rows[0]?.count || '0'),
      },
    });
  } catch (error: any) {
    console.error('Get user stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  GET /overview — Dashboard overview aggregated stats
// ════════════════════════════════════════════════════════════════════
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const userRow = await pool.query('SELECT organization_id, role, subscription_tier FROM users WHERE id = $1', [userId]);
    const orgId = userRow.rows[0]?.organization_id;
    const userRole = userRow.rows[0]?.role || 'viewer';
    const userTier = userRow.rows[0]?.subscription_tier || 'starter';

    // Parallel queries — each with fallback on missing tables
    const [
      totalValuations,
      monthValuations,
      activeDeals,
      pipelineValue,
      totalProperties,
      recentValuations,
      dealStages,
      recentTransactions,
      marketIndicators,
      teamMembers,
    ] = await Promise.all([
      // 1. Total valuations all time
      pool.query(
        `SELECT COUNT(*) as count FROM valuations WHERE organization_id = $1`,
        [orgId]
      ).catch(() => ({ rows: [{ count: '0' }] })),

      // 2. Valuations this month
      pool.query(
        `SELECT COUNT(*) as count FROM valuations 
         WHERE organization_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
        [orgId]
      ).catch(() => ({ rows: [{ count: '0' }] })),

      // 3. Active deals count
      pool.query(
        `SELECT COUNT(*) as count FROM deals 
         WHERE organization_id = $1 AND status NOT IN ('closed_won', 'closed_lost', 'cancelled')`,
        [orgId]
      ).catch(() => ({ rows: [{ count: '0' }] })),

      // 4. Pipeline value (sum of active deals)
      pool.query(
        `SELECT COALESCE(SUM(value), 0) as total FROM deals 
         WHERE organization_id = $1 AND status NOT IN ('closed_won', 'closed_lost', 'cancelled')`,
        [orgId]
      ).catch(() => ({ rows: [{ total: '0' }] })),

      // 5. Total properties
      pool.query(
        `SELECT COUNT(*) as count FROM properties WHERE organization_id = $1`,
        [orgId]
      ).catch(() => ({ rows: [{ count: '0' }] })),

      // 6. Recent valuation queue (5 most recent)
      pool.query(
        `SELECT id, reference_number, property_type, 
                COALESCE(location->>'address', location->>'area', 'N/A') as location_text,
                status, priority, created_at
         FROM valuations 
         WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [orgId]
      ).catch(() => ({ rows: [] })),

      // 7. Deal pipeline stages
      pool.query(
        `SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
         FROM deals 
         WHERE organization_id = $1 AND status NOT IN ('closed_won', 'closed_lost', 'cancelled')
         GROUP BY stage ORDER BY 
           CASE stage 
             WHEN 'lead' THEN 1 WHEN 'qualified' THEN 2 WHEN 'viewing' THEN 3 
             WHEN 'offer' THEN 4 WHEN 'closing' THEN 5 ELSE 6 
           END`,
        [orgId]
      ).catch(() => ({ rows: [] })),

      // 8. Recent transactions (completed deals)
      pool.query(
        `SELECT d.id, d.deal_type, d.property_type, 
                COALESCE(d.location, 'N/A') as location, 
                d.value, d.closed_at, d.updated_at
         FROM deals d
         WHERE d.organization_id = $1 AND d.status = 'closed_won'
         ORDER BY COALESCE(d.closed_at, d.updated_at) DESC LIMIT 5`,
        [orgId]
      ).catch(() => ({ rows: [] })),

      // 9. Market indicators (avg price by area from properties)
      pool.query(
        `SELECT 
           COALESCE(location->>'area', location->>'city', 'Unknown') as area,
           AVG(CASE WHEN market_value > 0 THEN market_value ELSE estimated_value END) as avg_price,
           COUNT(*) as volume
         FROM properties 
         WHERE organization_id = $1
         GROUP BY COALESCE(location->>'area', location->>'city', 'Unknown')
         HAVING COUNT(*) >= 1
         ORDER BY avg_price DESC NULLS LAST
         LIMIT 6`,
        [orgId]
      ).catch(() => ({ rows: [] })),

      // 10. Team member count
      pool.query(
        `SELECT COUNT(*) as count FROM users WHERE organization_id = $1 AND is_active = true`,
        [orgId]
      ).catch(() => ({ rows: [{ count: '0' }] })),
    ]);

    // Format the valuation queue
    const valuationQueue = recentValuations.rows.map((v: any) => ({
      id: v.reference_number || `VAL-${String(v.id).slice(-4)}`,
      property: v.location_text || v.property_type || 'Unknown',
      propertyType: v.property_type,
      status: (v.status || 'pending').toUpperCase(),
      priority: (v.priority || 'medium').toUpperCase(),
      createdAt: v.created_at,
    }));

    // Format deal pipeline
    const pipeline = dealStages.rows.map((s: any) => ({
      stage: (s.stage || 'lead').toUpperCase(),
      count: parseInt(s.count || '0'),
      value: parseFloat(s.total_value || '0'),
    }));

    // Format recent transactions
    const transactions = recentTransactions.rows.map((t: any) => ({
      id: `TXN-${String(t.id).slice(-4)}`,
      type: (t.deal_type || 'sale').toUpperCase(),
      property: t.property_type || 'Property',
      location: t.location || 'N/A',
      value: parseFloat(t.value || '0'),
      date: t.closed_at || t.updated_at,
    }));

    // Format market indicators
    const markets = marketIndicators.rows.map((m: any) => ({
      area: m.area || 'Unknown',
      avgPrice: parseFloat(m.avg_price || '0'),
      volume: parseInt(m.volume || '0'),
      change: 0, // Would need historical data to calculate
    }));

    // Compute pipeline total
    const pipelineTotal = parseFloat(pipelineValue.rows[0]?.total || '0');

    res.json({
      success: true,
      overview: {
        role: userRole,
        tier: userTier,
        stats: {
          totalValuations: parseInt(totalValuations.rows[0]?.count || '0'),
          monthValuations: parseInt(monthValuations.rows[0]?.count || '0'),
          activeDeals: parseInt(activeDeals.rows[0]?.count || '0'),
          pipelineValue: pipelineTotal,
          totalProperties: parseInt(totalProperties.rows[0]?.count || '0'),
          teamMembers: parseInt(teamMembers.rows[0]?.count || '0'),
        },
        valuationQueue,
        dealPipeline: pipeline,
        recentTransactions: transactions,
        marketIndicators: markets,
      },
    });
  } catch (error: any) {
    console.error('Get overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch overview' });
  }
});

export default router;
