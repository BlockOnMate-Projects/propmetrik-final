/**
 * Subscription & Billing Routes
 * 
 * Public endpoints: plan catalog
 * Authenticated endpoints: subscription management, invoices, usage
 * Super-admin endpoints: plan CRUD, platform metrics, all-subscriptions view
 */

import { Router, Request, Response } from 'express';
import { authenticate, optionalAuth, requireSuperAdmin } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { logger } from '../utils/logger';
import {
  // Plans
  listPlans, getPlan, createPlan, updatePlan, deactivatePlan,
  // Subscriptions
  getSubscription, getSubscriptionById, createSubscription,
  changeSubscriptionPlan, cancelSubscription, reactivateSubscription,
  // Add-ons
  addSubscriptionAddon, removeSubscriptionAddon,
  // Access checking
  canAccessModule, getActiveModules,
  // Usage
  getUsageMetrics, checkUsageLimit, trackUsage,
  // Invoices
  createInvoice, getInvoice, listInvoices, markInvoicePaid,
  // History
  getSubscriptionHistory,
  // Admin
  getSubscriptionMetrics, listAllSubscriptions,
  // Types
  PlanCategory, PlanSegment, PlanTier,
} from '../../shared-services/payments/subscriptions/subscriptionService';

const router = Router();

// ============================================================
// PUBLIC ENDPOINTS — No auth required
// ============================================================

/**
 * GET /plans
 * List all active public plans (for pricing page)
 * Query: ?category=full_platform&segment=b2b&tier=enterprise
 */
router.get('/plans', optionalAuth, async (req: Request, res: Response) => {
  try {
    const plans = await listPlans({
      category: req.query.category as PlanCategory | undefined,
      segment: req.query.segment as PlanSegment | undefined,
      tier: req.query.tier as PlanTier | undefined,
    });

    // Group by category for frontend convenience
    const grouped: Record<string, any[]> = {};
    for (const plan of plans) {
      if (!grouped[plan.category]) grouped[plan.category] = [];
      grouped[plan.category].push(plan);
    }

    res.json({ plans, grouped, total: plans.length });
  } catch (err: any) {
    logger.error('Failed to list plans', err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * GET /plans/:slug
 * Get single plan details
 */
router.get('/plans/:slug', optionalAuth, async (req: Request, res: Response) => {
  try {
    const plan = await getPlan(req.params.slug);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (err: any) {
    logger.error('Failed to get plan', err);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

// ============================================================
// AUTHENTICATED ENDPOINTS — Subscription management
// ============================================================

/**
 * GET /subscription
 * Get current subscription for the authenticated user/org
 */
router.get('/subscription', authenticate, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const subscription = await getSubscription(orgId, userId);
    if (!subscription) {
      return res.json({ subscription: null, status: 'none' });
    }

    // Get usage metrics
    const usage = await getUsageMetrics(subscription.id);
    // Get active modules
    const modules = await getActiveModules(orgId, userId);

    res.json({ subscription, usage, modules });
  } catch (err: any) {
    logger.error('Failed to get subscription', err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * POST /subscription
 * Create a new subscription
 */
router.post('/subscription', authenticate, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { plan_slug, billing_interval, payment_provider, start_trial, metadata } = req.body;

    if (!plan_slug) {
      return res.status(400).json({ error: 'plan_slug is required' });
    }

    const subscription = await createSubscription({
      organization_id: orgId || undefined,
      user_id: userId,
      plan_slug,
      billing_interval,
      payment_provider,
      start_trial,
      metadata,
      actor_id: userId,
    });

    res.status(201).json(subscription);
  } catch (err: any) {
    logger.error('Failed to create subscription', err);
    if (err.message.includes('already exists') || err.message.includes('not found') || err.message.includes('not active')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * PUT /subscription/change-plan
 * Upgrade or downgrade the current subscription
 */
router.put('/subscription/change-plan', authenticate, authorize('subscription', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { plan_slug } = req.body;

    if (!plan_slug) {
      return res.status(400).json({ error: 'plan_slug is required' });
    }

    const current = await getSubscription(orgId, userId);
    if (!current) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const subscription = await changeSubscriptionPlan(current.id, plan_slug, userId);
    res.json(subscription);
  } catch (err: any) {
    logger.error('Failed to change plan', err);
    if (err.message.includes('not found') || err.message.includes('not active')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

/**
 * DELETE /subscription
 * Cancel the current subscription
 */
router.delete('/subscription', authenticate, authorize('subscription', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { reason, immediate } = req.body || {};

    const current = await getSubscription(orgId, userId);
    if (!current) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const subscription = await cancelSubscription(current.id, reason, immediate === true, userId);
    res.json(subscription);
  } catch (err: any) {
    logger.error('Failed to cancel subscription', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /subscription/reactivate
 * Reactivate a cancelled subscription
 */
router.post('/subscription/reactivate', authenticate, authorize('subscription', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    // Find cancelled subscription
    const { rows } = await (await import('../database')).pool.query(`
      SELECT id FROM subscriptions
      WHERE (organization_id = $1 OR user_id = $2)
        AND status = 'cancelled'
      ORDER BY cancelled_at DESC LIMIT 1
    `, [orgId, userId]);

    if (!rows[0]) {
      return res.status(404).json({ error: 'No cancelled subscription found' });
    }

    const subscription = await reactivateSubscription(rows[0].id, userId);
    res.json(subscription);
  } catch (err: any) {
    logger.error('Failed to reactivate subscription', err);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// ============================================================
// ADD-ONS (à la carte)
// ============================================================

/**
 * POST /subscription/addons
 * Add an à la carte module
 */
router.post('/subscription/addons', authenticate, authorize('subscription', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { plan_slug, quantity } = req.body;

    if (!plan_slug) {
      return res.status(400).json({ error: 'plan_slug is required' });
    }

    const current = await getSubscription(orgId, userId);
    if (!current) {
      return res.status(404).json({ error: 'No active subscription. Subscribe to a plan first.' });
    }

    const addon = await addSubscriptionAddon(current.id, plan_slug, quantity || 1, userId);
    res.status(201).json(addon);
  } catch (err: any) {
    logger.error('Failed to add addon', err);
    if (err.message.includes('not found') || err.message.includes('must be')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to add add-on' });
  }
});

/**
 * DELETE /subscription/addons/:id
 * Remove an à la carte module
 */
router.delete('/subscription/addons/:id', authenticate, authorize('subscription', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const current = await getSubscription(orgId, userId);
    if (!current) {
      return res.status(404).json({ error: 'No active subscription' });
    }

    await removeSubscriptionAddon(current.id, req.params.id, userId);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Failed to remove addon', err);
    res.status(500).json({ error: 'Failed to remove add-on' });
  }
});

// ============================================================
// USAGE & MODULE ACCESS
// ============================================================

/**
 * GET /subscription/usage
 * Get usage metrics for current subscription
 */
router.get('/subscription/usage', authenticate, authorize('subscription_usage', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const current = await getSubscription(orgId, userId);
    if (!current) {
      return res.json({ usage: [], subscription: null });
    }

    const usage = await getUsageMetrics(current.id);
    res.json({ usage, subscription_id: current.id });
  } catch (err: any) {
    logger.error('Failed to get usage', err);
    res.status(500).json({ error: 'Failed to fetch usage metrics' });
  }
});

/**
 * GET /subscription/modules
 * Get active modules for current subscription
 */
router.get('/subscription/modules', authenticate, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const modules = await getActiveModules(orgId, userId);
    res.json({ modules });
  } catch (err: any) {
    logger.error('Failed to get modules', err);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

/**
 * GET /subscription/check-module/:moduleSlug
 * Check if specific module is accessible
 */
router.get('/subscription/check-module/:moduleSlug', authenticate, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const hasAccess = await canAccessModule(orgId, userId, req.params.moduleSlug);
    res.json({ module: req.params.moduleSlug, has_access: hasAccess });
  } catch (err: any) {
    logger.error('Failed to check module access', err);
    res.status(500).json({ error: 'Failed to check module access' });
  }
});

/**
 * GET /subscription/check-usage/:metric
 * Check remaining usage for a metric
 */
router.get('/subscription/check-usage/:metric', authenticate, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const current = await getSubscription(orgId, userId);
    if (!current) {
      return res.json({ allowed: false, reason: 'No active subscription' });
    }

    const result = await checkUsageLimit(current.id, req.params.metric);
    res.json(result);
  } catch (err: any) {
    logger.error('Failed to check usage', err);
    res.status(500).json({ error: 'Failed to check usage limit' });
  }
});

// ============================================================
// INVOICES
// ============================================================

/**
 * GET /invoices
 * List invoices for current org/user
 */
router.get('/invoices', authenticate, authorize('invoice', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { status, limit, offset } = req.query;

    const result = await listInvoices(orgId, userId, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (err: any) {
    logger.error('Failed to list invoices', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * GET /invoices/:id
 * Get invoice detail with line items
 */
router.get('/invoices/:id', authenticate, authorize('invoice', 'read'), async (req: Request, res: Response) => {
  try {
    const invoice = await getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Verify access (must belong to user's org or user)
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const roles = (req as any).user?.realmRoles || [];

    if (!roles.includes('super_admin') &&
        invoice.organization_id !== orgId &&
        invoice.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(invoice);
  } catch (err: any) {
    logger.error('Failed to get invoice', err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

/**
 * GET /subscription/history
 * Get subscription event history
 */
router.get('/subscription/history', authenticate, authorize('subscription', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const current = await getSubscription(orgId, userId);
    if (!current) {
      return res.json({ events: [] });
    }

    const events = await getSubscriptionHistory(current.id);
    res.json({ events });
  } catch (err: any) {
    logger.error('Failed to get history', err);
    res.status(500).json({ error: 'Failed to fetch subscription history' });
  }
});

// ============================================================
// SUPER-ADMIN ENDPOINTS — Platform management
// ============================================================

/**
 * GET /admin/plans
 * List all plans including inactive (super_admin only)
 */
router.get('/admin/plans', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const plans = await listPlans({
      includeInactive: true,
      category: req.query.category as PlanCategory | undefined,
    });
    res.json({ plans, total: plans.length });
  } catch (err: any) {
    logger.error('Failed to list admin plans', err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * POST /admin/plans
 * Create a new plan
 */
router.post('/admin/plans', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const plan = await createPlan(req.body);
    res.status(201).json(plan);
  } catch (err: any) {
    logger.error('Failed to create plan', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Plan slug already exists' });
    }
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

/**
 * PUT /admin/plans/:id
 * Update a plan
 */
router.put('/admin/plans/:id', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const plan = await updatePlan(req.params.id, req.body);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (err: any) {
    logger.error('Failed to update plan', err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

/**
 * DELETE /admin/plans/:id
 * Deactivate a plan (soft delete)
 */
router.delete('/admin/plans/:id', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await deactivatePlan(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Failed to deactivate plan', err);
    res.status(500).json({ error: 'Failed to deactivate plan' });
  }
});

/**
 * GET /admin/subscriptions
 * List all subscriptions platform-wide
 */
router.get('/admin/subscriptions', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { status, category, limit, offset } = req.query;
    const result = await listAllSubscriptions({
      status: status as string | undefined,
      category: category as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    logger.error('Failed to list all subscriptions', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * GET /admin/subscriptions/:id
 * Get subscription detail (admin)
 */
router.get('/admin/subscriptions/:id', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const subscription = await getSubscriptionById(req.params.id);
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });

    const history = await getSubscriptionHistory(subscription.id);
    const usage = await getUsageMetrics(subscription.id);

    res.json({ subscription, history, usage });
  } catch (err: any) {
    logger.error('Failed to get subscription', err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * PUT /admin/subscriptions/:id
 * Admin update of a subscription (change status, etc.)
 */
router.put('/admin/subscriptions/:id', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { plan_slug, status } = req.body;
    const adminId = (req as any).user?.id;

    if (plan_slug) {
      const subscription = await changeSubscriptionPlan(req.params.id, plan_slug, adminId);
      return res.json(subscription);
    }

    if (status) {
      const { pool: dbPool } = await import('../database');
      await dbPool.query(
        `UPDATE subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [status, req.params.id]
      );
      const subscription = await getSubscriptionById(req.params.id);
      return res.json(subscription);
    }

    res.status(400).json({ error: 'Provide plan_slug or status to update' });
  } catch (err: any) {
    logger.error('Failed to admin-update subscription', err);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

/**
 * GET /admin/metrics
 * Platform subscription metrics (MRR, ARR, churn, breakdowns)
 */
router.get('/admin/metrics', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const metrics = await getSubscriptionMetrics();
    res.json(metrics);
  } catch (err: any) {
    logger.error('Failed to get metrics', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * GET /admin/invoices
 * List all invoices platform-wide
 */
router.get('/admin/invoices', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { status, limit, offset } = req.query;
    const result = await listInvoices(undefined, undefined, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    logger.error('Failed to list all invoices', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * POST /admin/invoices/:id/mark-paid
 * Manually mark an invoice as paid
 */
router.post('/admin/invoices/:id/mark-paid', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { payment_reference, payment_method } = req.body;
    if (!payment_reference || !payment_method) {
      return res.status(400).json({ error: 'payment_reference and payment_method are required' });
    }

    const invoice = await markInvoicePaid(req.params.id, payment_reference, payment_method);
    res.json(invoice);
  } catch (err: any) {
    logger.error('Failed to mark invoice paid', err);
    res.status(500).json({ error: 'Failed to mark invoice as paid' });
  }
});

/**
 * POST /admin/invoices/generate
 * Manually generate an invoice for a subscription
 */
router.post('/admin/invoices/generate', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { subscription_id, tax_rate, discount_amount, notes, due_days } = req.body;
    if (!subscription_id) {
      return res.status(400).json({ error: 'subscription_id is required' });
    }

    const invoice = await createInvoice(subscription_id, { tax_rate, discount_amount, notes, due_days });
    res.status(201).json(invoice);
  } catch (err: any) {
    logger.error('Failed to generate invoice', err);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

export default router;
