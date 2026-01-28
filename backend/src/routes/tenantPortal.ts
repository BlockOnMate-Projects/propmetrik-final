/**
 * Tenant Portal API Routes
 * Phase 4.x: API endpoints for Tenant self-service portal
 * 
 * Base path: /api/v1/tenant-portal
 * 
 * These endpoints are PUBLIC (unauthenticated) or use tenant session tokens
 * (separate from Keycloak staff/admin auth)
 * 
 * @module routes/tenantPortal
 */

import { Router, Request, Response, NextFunction } from 'express';
import { tenantAuthService, AuthMethod } from '../services/property-management/auth/tenantAuthService';
import { rentScheduleService } from '../services/property-management/rent-collection/rentScheduleService';
import { paymentProcessor } from '../services/property-management/payment/paymentProcessor';
import { paystackService } from '../services/property-management/payment/paystackService';
import { WorkOrderService } from '../services/property-management/maintenance/workOrderService';
import { logger } from '../utils/logger';
import db from '../database';

const router = Router();
const workOrderService = new WorkOrderService();

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Tenant session authentication middleware
 */
async function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.replace('Bearer ', '');

    if (!sessionToken) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await tenantAuthService.validateSession(sessionToken);

    if (!result.success || !result.tenant) {
        return res.status(401).json({ error: result.error || 'Invalid session' });
    }

    // Attach tenant to request
    (req as any).tenant = result.tenant;
    (req as any).session = result.session;
    next();
}

/**
 * Async handler wrapper
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// =====================================================
// AUTHENTICATION ROUTES (Public)
// =====================================================

/**
 * POST /api/v1/tenant-portal/auth/magic-link
 * Request a magic link for login
 */
router.post('/auth/magic-link', asyncHandler(async (req: Request, res: Response) => {
    const { identifier } = req.body; // Phone number or email

    if (!identifier) {
        return res.status(400).json({ error: 'Phone number or email is required' });
    }

    // Get base URL for magic link
    const baseUrl = process.env.TENANT_PORTAL_URL || 'http://localhost:3001';

    const result = await tenantAuthService.generateMagicLink(identifier, baseUrl);

    if (result.success && result.token) {
        // In production, send via email/SMS
        // For development, return the link
        if (process.env.NODE_ENV === 'development') {
            return res.json({
                message: 'Magic link generated (development mode)',
                magicLink: result.token,
                expiresAt: result.expiresAt
            });
        }

        // TODO: Send magic link via email or SMS
        // await notificationService.sendMagicLink(identifier, result.token);

        return res.json({
            message: 'If an account exists, a login link has been sent.',
            expiresAt: result.expiresAt
        });
    }

    // Don't reveal if tenant exists
    res.json({ message: 'If an account exists, a login link has been sent.' });
}));

/**
 * POST /api/v1/tenant-portal/auth/otp/request
 * Request an OTP for login
 */
router.post('/auth/otp/request', asyncHandler(async (req: Request, res: Response) => {
    const { phone, email } = req.body;
    const identifier = phone || email;
    const method = phone ? AuthMethod.OTP_SMS : AuthMethod.OTP_EMAIL;

    if (!identifier) {
        return res.status(400).json({ error: 'Phone number or email is required' });
    }

    const result = await tenantAuthService.generateOTP(identifier, method);

    if (result.success && result.token) {
        // In production, send via SMS/email
        if (process.env.NODE_ENV === 'development') {
            return res.json({
                message: 'OTP generated (development mode)',
                otp: result.token,
                expiresAt: result.expiresAt
            });
        }

        // TODO: Send OTP via SMS or email
        // if (method === AuthMethod.OTP_SMS) {
        //     await smsService.sendOTP(phone, result.token);
        // } else {
        //     await emailService.sendOTP(email, result.token);
        // }

        return res.json({
            message: 'If an account exists, an OTP has been sent.',
            expiresAt: result.expiresAt
        });
    }

    res.json({ message: 'If an account exists, an OTP has been sent.' });
}));

/**
 * POST /api/v1/tenant-portal/auth/otp/verify
 * Verify OTP and create session
 */
router.post('/auth/otp/verify', asyncHandler(async (req: Request, res: Response) => {
    const { phone, email, otp } = req.body;
    const identifier = phone || email;
    const method = phone ? AuthMethod.OTP_SMS : AuthMethod.OTP_EMAIL;

    if (!identifier || !otp) {
        return res.status(400).json({ error: 'Phone/email and OTP are required' });
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await tenantAuthService.verifyOTP(identifier, otp, method, userAgent, ipAddress);

    if (!result.success) {
        return res.status(401).json({ error: result.error });
    }

    res.json({
        success: true,
        sessionToken: result.session?.sessionToken,
        expiresAt: result.session?.expiresAt,
        tenant: result.tenant
    });
}));

/**
 * GET /api/v1/tenant-portal/auth/verify
 * Verify magic link and create session
 */
router.get('/auth/verify', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token is required' });
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await tenantAuthService.verifyMagicLink(token, userAgent, ipAddress);

    if (!result.success) {
        return res.status(401).json({ error: result.error });
    }

    // For web, could redirect to portal with session token
    // For API, return session token
    res.json({
        success: true,
        sessionToken: result.session?.sessionToken,
        expiresAt: result.session?.expiresAt,
        tenant: result.tenant
    });
}));

/**
 * POST /api/v1/tenant-portal/auth/logout
 * Logout (revoke session)
 */
router.post('/auth/logout', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const session = (req as any).session;
    await tenantAuthService.revokeSession(session.sessionToken);
    res.json({ success: true, message: 'Logged out successfully' });
}));

// =====================================================
// PROFILE ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/profile
 * Get tenant profile
 */
router.get('/profile', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    res.json(tenant);
}));

/**
 * PATCH /api/v1/tenant-portal/profile
 * Update tenant contact information
 */
router.patch('/profile', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { email, phoneSecondary, currentAddress } = req.body;

    const updatedProfile = await tenantAuthService.updateTenantContact(tenant.id, {
        email,
        phoneSecondary,
        currentAddress
    });

    if (!updatedProfile) {
        return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json(updatedProfile);
}));

// =====================================================
// TENANCY/LEASE ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/tenancies
 * Get tenant's active tenancies
 */
router.get('/tenancies', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    res.json(tenant.activeTenancies || []);
}));

/**
 * GET /api/v1/tenant-portal/tenancies/:id
 * Get specific tenancy details
 */
router.get('/tenancies/:id', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const tenancyId = req.params.id;

    // Verify tenant has access to this tenancy
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);

    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Get full tenancy details including rent schedules
    const result = await db.query(
        `SELECT t.*, p.title as property_title, p.address_street, p.address_city, p.region
         FROM tenancies t
         JOIN properties p ON t.property_id = p.id
         WHERE t.id = $1 AND t.tenant_id = $2`,
        [tenancyId, tenant.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    res.json(result.rows[0]);
}));

// =====================================================
// PAYMENT ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/payments/summary/:tenancyId
 * Get payment summary for a tenancy
 */
router.get('/payments/summary/:tenancyId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId } = req.params;

    // Verify tenant has access to this tenancy
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Get organization ID from tenancy
    const tenancyResult = await db.query(
        `SELECT organization_id FROM tenancies WHERE id = $1`,
        [tenancyId]
    );

    if (tenancyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const organizationId = tenancyResult.rows[0].organization_id;
    const summary = await paymentProcessor.getPaymentSummary(tenancyId, organizationId);

    res.json(summary);
}));

/**
 * GET /api/v1/tenant-portal/payments/schedules/:tenancyId
 * Get rent schedules for a tenancy
 */
router.get('/payments/schedules/:tenancyId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId } = req.params;

    // Verify tenant has access
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const tenancyResult = await db.query(
        `SELECT organization_id FROM tenancies WHERE id = $1`,
        [tenancyId]
    );

    if (tenancyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const organizationId = tenancyResult.rows[0].organization_id;
    const schedules = await rentScheduleService.getByTenancy(tenancyId, organizationId);

    res.json(schedules);
}));

/**
 * GET /api/v1/tenant-portal/payments/history/:tenancyId
 * Get payment history for a tenancy
 */
router.get('/payments/history/:tenancyId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId } = req.params;

    // Verify tenant has access
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const { page = '1', limit = '20' } = req.query;

    const result = await db.query(
        `SELECT * FROM rent_payments
         WHERE tenancy_id = $1
         ORDER BY payment_date DESC
         LIMIT $2 OFFSET $3`,
        [tenancyId, parseInt(limit as string, 10), (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10)]
    );

    const countResult = await db.query(
        `SELECT COUNT(*) FROM rent_payments WHERE tenancy_id = $1`,
        [tenancyId]
    );

    res.json({
        data: result.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10)
    });
}));

/**
 * POST /api/v1/tenant-portal/payments/initiate
 * Initiate a rent payment
 */
router.post('/payments/initiate', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId, amount, channel = 'mobile_money', scheduleIds } = req.body;

    if (!tenancyId || !amount) {
        return res.status(400).json({ error: 'tenancyId and amount are required' });
    }

    // Verify tenant has access
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Get organization ID and callback URL
    const tenancyResult = await db.query(
        `SELECT organization_id FROM tenancies WHERE id = $1`,
        [tenancyId]
    );

    if (tenancyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const organizationId = tenancyResult.rows[0].organization_id;
    const callbackUrl = `${process.env.TENANT_PORTAL_URL || 'http://localhost:3001'}/payments/callback`;

    try {
        const result = await paymentProcessor.initializeRentPayment({
            tenancyId,
            organizationId,
            amount,
            email: tenant.email || `${tenant.phonePrimary}@tenant.propmetrik.com`, // Fallback email
            channel,
            callbackUrl,
            scheduleIds
        });

        res.json({
            success: true,
            authorizationUrl: result.data.authorization_url,
            accessCode: result.data.access_code,
            reference: result.data.reference
        });
    } catch (error: any) {
        logger.error('Payment initiation failed', { error: error.message, tenancyId });
        res.status(400).json({ error: error.message });
    }
}));

/**
 * GET /api/v1/tenant-portal/payments/verify/:reference
 * Verify a payment (called after Paystack redirect)
 */
router.get('/payments/verify/:reference', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const { reference } = req.params;

    try {
        const result = await paymentProcessor.verifyAndRecordPayment(reference);
        res.json(result);
    } catch (error: any) {
        logger.error('Payment verification failed', { error: error.message, reference });
        res.status(400).json({ error: error.message });
    }
}));

// =====================================================
// MAINTENANCE ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/maintenance/:tenancyId
 * Get maintenance requests for a tenancy
 */
router.get('/maintenance/:tenancyId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId } = req.params;

    // Verify tenant has access
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Get work orders for the property
    const result = await db.query(
        `SELECT wo.* FROM maintenance_work_orders wo
         JOIN tenancies t ON wo.property_id = t.property_id
         WHERE t.id = $1 AND wo.reported_by_tenant_id = $2
         ORDER BY wo.created_at DESC`,
        [tenancyId, tenant.id]
    );

    res.json(result.rows);
}));

/**
 * POST /api/v1/tenant-portal/maintenance
 * Submit a maintenance request
 */
router.post('/maintenance', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId, category, description, priority = 'medium', photos } = req.body;

    if (!tenancyId || !category || !description) {
        return res.status(400).json({ error: 'tenancyId, category, and description are required' });
    }

    // Verify tenant has access
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Get property ID and organization ID
    const tenancyResult = await db.query(
        `SELECT property_id, organization_id FROM tenancies WHERE id = $1`,
        [tenancyId]
    );

    if (tenancyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const { property_id, organization_id } = tenancyResult.rows[0];

    // Create work order
    const workOrder = await workOrderService.createWorkOrder(organization_id, {
        propertyId: property_id,
        unitNumber: tenancy.unitNumber,
        category,
        description,
        priority,
        reportedByTenantId: tenant.id,
        photos: photos || []
    });

    res.status(201).json(workOrder);
}));

/**
 * GET /api/v1/tenant-portal/maintenance/status/:workOrderId
 * Get status of a maintenance request
 */
router.get('/maintenance/status/:workOrderId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { workOrderId } = req.params;

    // Get work order and verify tenant submitted it
    const result = await db.query(
        `SELECT * FROM maintenance_work_orders
         WHERE id = $1 AND reported_by_tenant_id = $2`,
        [workOrderId, tenant.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Work order not found' });
    }

    res.json(result.rows[0]);
}));

// =====================================================
// DOCUMENTS ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/documents/:tenancyId
 * Get documents for a tenancy (lease, receipts, etc.)
 */
router.get('/documents/:tenancyId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId } = req.params;

    // Verify tenant has access
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Get documents
    const result = await db.query(
        `SELECT * FROM property_management_documents
         WHERE tenancy_id = $1
         ORDER BY created_at DESC`,
        [tenancyId]
    );

    res.json(result.rows);
}));

// =====================================================
// ERROR HANDLER
// =====================================================

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Tenant Portal API Error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});

export default router;
