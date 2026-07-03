/**
 * CRM & Deal Management API Routes — Barrel
 * Mounts all CRM sub-routers and exports a single combined router.
 *
 * Base path: /api/v1/crm
 *
 * @module routes/crm
 */

import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { decideCrmAccess } from '../../middleware/authorize';
import logger from '../../utils/logger';

import contactRoutes from './contacts';
import companyRoutes from './companies';
import agentRoutes from './agents';
import dealRoutes from './deals';
import pipelineRoutes from './pipelines';
import taskRoutes from './tasks';
import noteRoutes from './notes';
import documentRoutes from './documents';
import signatureRoutes from './signatures';
import analyticsRoutes from './analytics';
import targetRoutes from './targets';
import propertyRoutes from './properties';
import commissionRoutes from './commissions';
import invoiceRoutes from './invoices';
import templateRoutes from './templates';
import paymentRoutes from './payments';
import emailRoutes from './emails';
import stackingPlanRoutes from './stacking-plan';
import savedViewRoutes from './saved-views';
import globalSearchRoutes from './global-search';
import dripCampaignRoutes from './drip-campaigns';
import notificationRoutes from './notifications';

const router = Router();

// ── CRM RBAC: central policy dispatcher ──────────────────────────────────────
// Maps (HTTP method + path) → (resource, action) and runs the SAME policy engine
// used by every other service (decideCrmAccess → customer_authorization_policies
// for customers, authorization_policies for staff, with super_admin bypass,
// ownership checks, and audit logging). This REPLACES the old hardcoded
// prefix→realm-role check with real, DB-driven, per-action authorization across
// EVERY CRM route.
//
// Fail-safe by design: any UNMAPPED mutating verb (POST/PUT/PATCH/DELETE) is
// denied by default — a new write route added without a mapping is secure until
// explicitly classified. Unmapped reads are allowed (org-scoping still isolates).
// Set CRM_RBAC_ENFORCE=false for shadow mode (log would-be denials, allow).

/** Ordered path-prefix → CRM policy resource. First match wins. */
const CRM_RESOURCE_MAP: Array<{ prefix: string; resource: string }> = [
    { prefix: '/deals',          resource: 'crm_deal' },
    { prefix: '/contacts',       resource: 'crm_contact' },
    { prefix: '/companies',      resource: 'crm_company' },
    { prefix: '/leads',          resource: 'crm_lead' },
    { prefix: '/pipelines',      resource: 'crm_pipeline' },
    { prefix: '/stages',         resource: 'crm_pipeline' },
    { prefix: '/tasks',          resource: 'crm_activity' },
    { prefix: '/notes',          resource: 'crm_activity' },
    { prefix: '/activities',     resource: 'crm_activity' },
    { prefix: '/documents',      resource: 'crm_document' },
    { prefix: '/templates',      resource: 'crm_document' },
    { prefix: '/signatures',     resource: 'crm_document' },
    { prefix: '/commissions',    resource: 'crm_commission' },
    { prefix: '/payments',       resource: 'crm_commission' },
    { prefix: '/invoices',       resource: 'crm_invoice' },
    { prefix: '/targets',        resource: 'crm_analytics' },
    { prefix: '/analytics',      resource: 'crm_analytics' },
    { prefix: '/saved-views',    resource: 'crm_analytics' },
    { prefix: '/global-search',  resource: 'crm_analytics' },
    { prefix: '/stacking-plan',  resource: 'crm_analytics' },
    { prefix: '/agents',         resource: 'crm_agent' },
    { prefix: '/team',           resource: 'crm_agent' },
    { prefix: '/drip-campaigns', resource: 'crm_campaign' },
    { prefix: '/emails',         resource: 'crm_campaign' },
    { prefix: '/properties',     resource: 'crm_contact' },
];

/** Per-user endpoints that ride with normal auth (no per-resource policy). */
const CRM_UNGATED_PREFIXES = ['/notifications'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function crmMethodToAction(method: string): string | null {
    switch (method) {
        case 'GET': return 'read';
        case 'POST': return 'create';
        case 'PUT':
        case 'PATCH': return 'update';
        case 'DELETE': return 'delete';
        default: return null; // OPTIONS/HEAD → allow
    }
}

/** Pull the first UUID segment out of the path for ownership checks. */
function extractResourceId(path: string): string | undefined {
    for (const seg of path.split('/')) {
        if (UUID_RE.test(seg)) return seg;
    }
    return undefined;
}

router.use(async (req: Request, res: Response, next: NextFunction) => {
    const enforce = process.env.CRM_RBAC_ENFORCE !== 'false';

    if (CRM_UNGATED_PREFIXES.some(p => req.path.startsWith(p))) return next();
    const action = crmMethodToAction(req.method);
    if (!action) return next(); // OPTIONS/HEAD

    // In dev, unauthenticated requests (no mock user) bypass — mirrors the
    // platform-wide dev bypass. In prod, `authenticate` guarantees req.user
    // upstream, so this never fires there.
    if (!req.user && config.app.env === 'development') return next();

    const mapped = CRM_RESOURCE_MAP.find(m => req.path.startsWith(m.prefix));

    // Unmapped route → allow reads (org-scoped), deny writes (fail-safe default).
    if (!mapped) {
        if (action === 'read') return next();
        if (!enforce) {
            logger.warn('CRM RBAC shadow: would deny unmapped write', { method: req.method, path: req.path });
            return next();
        }
        return res.status(403).json({ error: 'This action is not permitted' });
    }

    try {
        const decision = await decideCrmAccess(req, mapped.resource, action, extractResourceId(req.path));
        if (decision.ok) return next();
        if (!enforce) {
            logger.warn('CRM RBAC shadow: would deny', {
                method: req.method, path: req.path, resource: mapped.resource, action, role: decision.role, reason: decision.message,
            });
            return next();
        }
        return res.status(decision.status).json({ error: decision.message });
    } catch (err: any) {
        logger.error('CRM RBAC dispatcher error', { error: err?.message, path: req.path });
        // Fail-open in dev, fail-closed in prod (mirrors authorize()).
        if (config.app.env === 'development') return next();
        return res.status(403).json({ error: 'Authorization check failed' });
    }
});

// Mount sub-routers (all share the /api/v1/crm base path)
router.use('/', contactRoutes);
router.use('/', companyRoutes);
router.use('/', agentRoutes);
router.use('/', dealRoutes);
router.use('/', pipelineRoutes);
router.use('/', taskRoutes);
router.use('/', noteRoutes);
router.use('/', documentRoutes);
router.use('/', signatureRoutes);
router.use('/', analyticsRoutes);
router.use('/', targetRoutes);
router.use('/', propertyRoutes);
router.use('/', commissionRoutes);
router.use('/', invoiceRoutes);
router.use('/', templateRoutes);
router.use('/', paymentRoutes);
router.use('/', emailRoutes);
router.use('/', stackingPlanRoutes);
router.use('/', savedViewRoutes);
router.use('/', globalSearchRoutes);
router.use('/', dripCampaignRoutes);
router.use('/', notificationRoutes);

// =====================================================
// ERROR HANDLING
// =====================================================

router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('CRM Route Error:', err);

    if (err.code === '23505') {
        return res.status(409).json({ error: 'Duplicate entry', details: err.detail });
    }
    if (err.code === '23503') {
        return res.status(400).json({ error: 'Invalid reference', details: err.detail });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(config.app.env === 'development' && { stack: err.stack })
    });
});

export default router;
