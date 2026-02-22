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
import templateRoutes from './templates';
import paymentRoutes from './payments';
import emailRoutes from './emails';
import aiRoutes from './ai';
import stackingPlanRoutes from './stacking-plan';
import savedViewRoutes from './saved-views';
import globalSearchRoutes from './global-search';
import dripCampaignRoutes from './drip-campaigns';
import notificationRoutes from './notifications';

const router = Router();

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
router.use('/', templateRoutes);
router.use('/', paymentRoutes);
router.use('/', emailRoutes);
router.use('/', aiRoutes);
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
