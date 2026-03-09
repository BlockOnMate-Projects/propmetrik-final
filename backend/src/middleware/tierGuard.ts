/**
 * PROPMETRIK — Subscription Tier Guard Middleware
 *
 * Gates features by subscription tier. Staff bypass tier checks;
 * customers are checked against their organization's service tier.
 *
 * Usage:
 *   router.get('/ai-forecasting', authenticate, requireTier('enterprise'), handler);
 *   router.post('/bulk-valuations', authenticate, requireTier('professional'), handler);
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

const TIER_LEVELS: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

/**
 * Look up the organization's subscription tier from the database.
 */
async function getOrganizationTier(organizationId: string): Promise<string> {
  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT subscription_tier FROM organizations WHERE id = $1`,
      [organizationId]
    );
    if (result.rows.length > 0 && result.rows[0].subscription_tier) {
      return result.rows[0].subscription_tier;
    }
  } catch (error) {
    logger.error('Failed to fetch organization tier', { organizationId, error });
  }
  return 'starter'; // Default to starter if unknown
}

/**
 * Middleware factory that requires a minimum subscription tier.
 *
 * - super_admin always passes
 * - Staff with user_type='staff': tier comes from their organization's plan
 * - Customers: tier comes from their organization's plan
 */
export function requireTier(minTier: 'starter' | 'professional' | 'enterprise') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // super_admin bypasses tier checks
    const userRoles = [...(req.user.realmRoles || []), ...(req.user.clientRoles || [])];
    if (userRoles.includes('super_admin')) {
      return next();
    }

    const organizationId = req.user.organizationId;
    if (!organizationId) {
      // No org = free tier
      if (TIER_LEVELS['free'] >= TIER_LEVELS[minTier]) {
        return next();
      }
      res.status(403).json({
        error: 'Subscription upgrade required',
        requiredTier: minTier,
      });
      return;
    }

    const orgTier = await getOrganizationTier(organizationId);
    if ((TIER_LEVELS[orgTier] ?? 0) >= TIER_LEVELS[minTier]) {
      return next();
    }

    logger.info('Tier gate blocked request', {
      userId: req.user.id,
      organizationId,
      currentTier: orgTier,
      requiredTier: minTier,
    });

    res.status(403).json({
      error: 'Subscription upgrade required',
      requiredTier: minTier,
      currentTier: orgTier,
    });
  };
}
