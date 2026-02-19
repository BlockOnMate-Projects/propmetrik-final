/**
 * Subscription Middleware
 * 
 * Feature gating based on active subscriptions.
 * super_admin always bypasses subscription checks.
 * 
 * Usage:
 *   router.get('/crm/leads', authenticate, requireModule('crm'), handler)
 *   router.post('/valuations', authenticate, requireActiveSubscription, handler)
 *   router.get('/api/data', authenticate, requireUsage('api_calls'), handler)
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import {
  canAccessModule,
  getSubscription,
  checkUsageLimit,
  trackUsage,
} from '../services/billing/subscriptionService';

/**
 * Require an active subscription (any plan)
 * super_admin always passes
 */
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  // super_admin bypasses subscription checks
  const roles = user.realmRoles || user.clientRoles || [];
  if (roles.includes('super_admin')) return next();

  (async () => {
    try {
      const subscription = await getSubscription(user.organizationId, user.id);
      if (!subscription) {
        return res.status(403).json({
          error: 'Subscription required',
          code: 'NO_SUBSCRIPTION',
          message: 'An active subscription is required to access this feature. Please subscribe to a plan.',
        });
      }

      if (!['active', 'trialing'].includes(subscription.status)) {
        return res.status(403).json({
          error: 'Subscription inactive',
          code: 'SUBSCRIPTION_INACTIVE',
          status: subscription.status,
          message: `Your subscription is ${subscription.status}. Please renew or reactivate.`,
        });
      }

      // Attach subscription to request for downstream use
      (req as any).subscription = subscription;
      next();
    } catch (err: any) {
      logger.error('Subscription check failed', { error: err.message });
      // Fail open in case of DB errors to avoid blocking production
      next();
    }
  })();
}

/**
 * Require access to a specific module
 * Checks base plan + à la carte add-ons
 * super_admin always passes
 */
export function requireModule(moduleSlug: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    // super_admin bypasses
    const roles = user.realmRoles || user.clientRoles || [];
    if (roles.includes('super_admin')) return next();

    (async () => {
      try {
        const hasAccess = await canAccessModule(user.organizationId, user.id, moduleSlug);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Module not included',
            code: 'MODULE_NOT_AVAILABLE',
            module: moduleSlug,
            message: `Your subscription does not include the ${moduleSlug.replace(/_/g, ' ')} module. Upgrade your plan or add it as an add-on.`,
          });
        }

        next();
      } catch (err: any) {
        logger.error(`Module check failed for ${moduleSlug}`, { error: err.message });
        // Fail open
        next();
      }
    })();
  };
}

/**
 * Check and track usage for a metric
 * Returns 429 if usage limit exceeded
 * super_admin always passes
 */
export function requireUsage(metric: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    // super_admin bypasses
    const roles = user.realmRoles || user.clientRoles || [];
    if (roles.includes('super_admin')) return next();

    (async () => {
      try {
        const subscription = (req as any).subscription || await getSubscription(user.organizationId, user.id);
        if (!subscription) {
          return res.status(403).json({
            error: 'Subscription required',
            code: 'NO_SUBSCRIPTION',
          });
        }

        const usage = await checkUsageLimit(subscription.id, metric);
        if (!usage.allowed) {
          return res.status(429).json({
            error: 'Usage limit exceeded',
            code: 'USAGE_LIMIT_EXCEEDED',
            metric,
            used: usage.used,
            limit: usage.limit,
            message: `You have reached the ${metric.replace(/_/g, ' ')} limit for your plan. Please upgrade to continue.`,
          });
        }

        // Track the usage (increment by 1)
        await trackUsage(subscription.id, metric, 1);
        next();
      } catch (err: any) {
        logger.error(`Usage check failed for ${metric}`, { error: err.message });
        // Fail open
        next();
      }
    })();
  };
}

/**
 * Combined subscription + module + usage check
 * Convenience middleware for routes that need all three
 */
export function requireSubscriptionAccess(moduleSlug: string, usageMetric?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    // super_admin bypasses everything
    const roles = user.realmRoles || user.clientRoles || [];
    if (roles.includes('super_admin')) return next();

    (async () => {
      try {
        // 1. Check active subscription
        const subscription = await getSubscription(user.organizationId, user.id);
        if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
          return res.status(403).json({
            error: 'Subscription required',
            code: 'NO_SUBSCRIPTION',
            message: 'An active subscription is required.',
          });
        }

        (req as any).subscription = subscription;

        // 2. Check module access
        const hasModule = await canAccessModule(user.organizationId, user.id, moduleSlug);
        if (!hasModule) {
          return res.status(403).json({
            error: 'Module not included',
            code: 'MODULE_NOT_AVAILABLE',
            module: moduleSlug,
          });
        }

        // 3. Check usage (optional)
        if (usageMetric) {
          const usage = await checkUsageLimit(subscription.id, usageMetric);
          if (!usage.allowed) {
            return res.status(429).json({
              error: 'Usage limit exceeded',
              code: 'USAGE_LIMIT_EXCEEDED',
              metric: usageMetric,
              used: usage.used,
              limit: usage.limit,
            });
          }
          await trackUsage(subscription.id, usageMetric, 1);
        }

        next();
      } catch (err: any) {
        logger.error('Subscription access check failed', { error: err.message });
        next(); // Fail open
      }
    })();
  };
}
