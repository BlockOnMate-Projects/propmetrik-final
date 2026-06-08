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
import multer from 'multer';
import { scanUploadedFile, scanUploadedFiles } from '../middleware/virusScan';
import { tenantAuthService, AuthMethod } from '../services/property-management/auth/tenantAuthService';
import { keycloakTenantOnboardingService } from '../services/property-management/auth/keycloakTenantOnboardingService';
import { rentScheduleService } from '../services/property-management/rent-collection/rentScheduleService';
import { paymentProcessor } from '../services/property-management/payment/paymentProcessor';
import { paystackService } from '../services/property-management/payment/paystackService';
import { WorkOrderService } from '../services/property-management/maintenance/workOrderService';
import { notificationService } from '../../shared-services/notifications/unified';
import { notify, resolveOrgStaff } from '../../shared-services/notifications/in-mail';
import { uploadFile } from '../database/minio';
import { logger } from '../utils/logger';
import { config } from '../config';
import db from '../database';

const router = Router();
const workOrderService = new WorkOrderService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Tenant session authentication middleware
 */
async function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace('Bearer ', '');

    if (!accessToken) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const sessionResult = await tenantAuthService.validateSession(accessToken);

    if (sessionResult.success && sessionResult.tenant) {
        (req as any).tenant = sessionResult.tenant;
        (req as any).session = sessionResult.session;
        (req as any).authType = 'legacy-session';
        return next();
    }

    try {
        const identity = await keycloakTenantOnboardingService.verifyTenantAccessToken(accessToken);
        const tenantRef = await keycloakTenantOnboardingService.resolveTenantIdentity(identity.sub, identity.email);

        if (!tenantRef) {
            return res.status(401).json({ error: 'Tenant account not linked to this Keycloak user' });
        }

        const tenantProfile = await tenantAuthService.getTenantProfile(tenantRef.id);
        if (!tenantProfile) {
            return res.status(401).json({ error: 'Tenant profile not found' });
        }

        (req as any).tenant = tenantProfile;
        (req as any).session = { sessionToken: accessToken, authMethod: 'keycloak' };
        (req as any).authType = 'keycloak';
        return next();
    } catch (error: any) {
        return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
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
 * GET /api/v1/tenant-portal/auth/keycloak/config
 * Returns authorization URL for tenant Keycloak login
 */
router.get('/auth/keycloak/config', asyncHandler(async (req: Request, res: Response) => {
    const redirectUri = (req.query.redirectUri as string) || `${config.app.tenantPortalUrl}/login`;
    const loginHint = req.query.loginHint as string | undefined;
    const codeChallenge = req.query.codeChallenge as string | undefined;
    const codeChallengeMethod = (req.query.codeChallengeMethod as 'S256' | 'plain' | undefined) || 'S256';
    const authUrl = keycloakTenantOnboardingService.getAuthorizationUrl(
        redirectUri,
        loginHint,
        codeChallenge,
        codeChallengeMethod
    );

    res.json({
        success: true,
        authUrl
    });
}));

/**
 * POST /api/v1/tenant-portal/auth/keycloak/exchange
 * Exchange authorization code for access token and tenant profile, then create a 30-day DB session
 */
router.post('/auth/keycloak/exchange', asyncHandler(async (req: Request, res: Response) => {
    const { code, redirectUri, codeVerifier } = req.body || {};

    if (!code || !redirectUri) {
        return res.status(400).json({ error: 'code and redirectUri are required' });
    }

    const result = await keycloakTenantOnboardingService.exchangeAuthorizationCode(code, redirectUri, codeVerifier);

    // Create a long-lived DB session (30 days)
    let sessionToken: string | undefined;
    if (result.tenant?.id) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
        const sessionResult = await tenantAuthService.createSession(
            result.tenant.id,
            AuthMethod.KEYCLOAK,
            userAgent,
            ipAddress
        );
        if (sessionResult.success && sessionResult.session) {
            sessionToken = sessionResult.session.sessionToken;
        }
    }

    res.json({
        success: true,
        accessToken: sessionToken || result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: sessionToken ? 2592000 : result.expiresIn,
        tenant: result.tenant
    });
}));

/**
 * POST /api/v1/tenant-portal/auth/keycloak/password-login
 * Authenticate tenant with email/password against Keycloak, then create a 30-day DB session
 */
router.post('/auth/keycloak/password-login', asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    try {
        const result = await keycloakTenantOnboardingService.loginWithPassword(email, password);

        // Create a long-lived DB session (30 days) so the tenant stays logged in
        let sessionToken: string | undefined;
        if (result.tenant?.id) {
            const userAgent = req.headers['user-agent'];
            const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
            const sessionResult = await tenantAuthService.createSession(
                result.tenant.id,
                AuthMethod.KEYCLOAK,
                userAgent,
                ipAddress
            );
            if (sessionResult.success && sessionResult.session) {
                sessionToken = sessionResult.session.sessionToken;
            }
        }

        return res.json({
            success: true,
            accessToken: sessionToken || result.accessToken,
            refreshToken: result.refreshToken,
            expiresIn: sessionToken ? 2592000 : result.expiresIn, // 30 days if DB session
            tenant: result.tenant
        });
    } catch (error: any) {
        console.error('=== TENANT LOGIN ERROR ===');
        console.error('Message:', error?.message);
        console.error('Response status:', error?.response?.status);
        console.error('Response data:', JSON.stringify(error?.response?.data));
        console.error('Stack:', error?.stack?.split('\n').slice(0, 5).join('\n'));
        console.error('=== END TENANT LOGIN ERROR ===');
        const detail = error?.response?.data;
        const invalidGrant = detail?.error === 'invalid_grant';
        const msg = invalidGrant
            ? 'Invalid email or password'
            : 'Authentication failed. Please try again.';
        return res.status(invalidGrant ? 401 : 500).json({
            success: false,
            error: msg
        });
    }
}));

/**
 * GET /api/v1/tenant-portal/auth/keycloak/reset-password-url
 * Returns Keycloak reset password URL for invited tenants
 */
router.get('/auth/keycloak/reset-password-url', asyncHandler(async (req: Request, res: Response) => {
    const redirectUri = (req.query.redirectUri as string) || `${config.app.tenantPortalUrl}/login`;
    const loginHint = req.query.loginHint as string | undefined;

    const url = keycloakTenantOnboardingService.getResetPasswordUrl(redirectUri, loginHint);

    res.json({
        success: true,
        url
    });
}));

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
    const baseUrl = config.app.tenantPortalUrl;

    const result = await tenantAuthService.generateMagicLink(identifier, baseUrl);

    if (!result.success) {
        return res.status(500).json({
            success: false,
            error: result.error || 'Failed to generate magic link'
        });
    }

    let delivery: { sent: boolean; channel: 'email' | 'sms' | 'none'; error?: string } = {
        sent: false,
        channel: 'none'
    };

    if (result.token) {
        const isEmail = typeof identifier === 'string' && identifier.includes('@');

        if (isEmail) {
            const emailResult = await notificationService.sendMagicLink(identifier, result.token);
            delivery = {
                sent: emailResult.success,
                channel: 'email',
                error: emailResult.error
            };
        } else {
            const smsResult = await notificationService.sendSMS(
                identifier,
                `Login to PROPMETRIK Tenant Portal: ${result.token}. This link expires in 15 minutes.`
            );
            delivery = {
                sent: smsResult.success,
                channel: 'sms',
                error: smsResult.error
            };
        }

        if (!delivery.sent) {
            logger.warn('Magic link delivery failed', {
                channel: delivery.channel,
                error: delivery.error
            });
        }
    }

    if (result.success && result.token) {
        if (process.env.NODE_ENV === 'development') {
            return res.json({
                success: true,
                message: delivery.sent
                    ? 'Magic link sent.'
                    : 'Magic link generated, but delivery service is not configured. Use the link below.',
                magicLink: result.token,
                expiresAt: result.expiresAt,
                delivery
            });
        }

        return res.json({
            success: true,
            message: 'If an account exists, a login link has been sent.',
            expiresAt: result.expiresAt,
            delivery: {
                sent: delivery.sent,
                channel: delivery.channel
            }
        });
    }

    // Don't reveal if tenant exists
    res.json({
        success: true,
        message: 'If an account exists, a login link has been sent.',
        delivery
    });
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
 * Validate magic link for setup flow (without consuming token)
 */
router.get('/auth/verify', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token is required' });
    }

    const result = await tenantAuthService.validateMagicLink(token);

    if (!result.success) {
        return res.status(401).json({ error: result.error });
    }

    const tenantEmail = result.tenant?.email;
    if (!tenantEmail) {
        return res.status(400).json({ error: 'Tenant email is required for password setup' });
    }

    try {
        await keycloakTenantOnboardingService.ensureTenantKeycloakAccountByEmail(tenantEmail);
    } catch (error: any) {
        logger.warn('Unable to pre-provision tenant Keycloak account during magic-link consume', {
            tenantEmail,
            error: error?.message
        });
    }

    res.json({
        success: true,
        setupRequired: true,
        tenantEmail
    });
}));

/**
 * POST /api/v1/tenant-portal/auth/setup-password
 * Complete invite setup by consuming magic link, setting password in Keycloak, and logging in
 */
router.post('/auth/setup-password', asyncHandler(async (req: Request, res: Response) => {
    const { token, password, confirmPassword } = req.body || {};

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Valid setup token is required' });
    }

    if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Password is required' });
    }

    if (typeof confirmPassword === 'string' && password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const consumeResult = await tenantAuthService.consumeMagicLink(token);
    if (!consumeResult.success) {
        return res.status(401).json({ error: consumeResult.error || 'Invalid or expired setup link' });
    }

    const tenantEmail = consumeResult.tenant?.email;
    if (!tenantEmail) {
        return res.status(400).json({ error: 'Tenant email is required for password setup' });
    }

    try {
        await keycloakTenantOnboardingService.ensureTenantKeycloakAccountByEmail(tenantEmail);
        await keycloakTenantOnboardingService.setTenantPasswordByEmail(tenantEmail, password);

        const loginResult = await keycloakTenantOnboardingService.loginWithPassword(tenantEmail, password);

        // Create a long-lived DB session (30 days)
        let sessionToken: string | undefined;
        if (loginResult.tenant?.id) {
            const userAgent = req.headers['user-agent'];
            const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
            const sessionResult = await tenantAuthService.createSession(
                loginResult.tenant.id,
                AuthMethod.KEYCLOAK,
                userAgent,
                ipAddress
            );
            if (sessionResult.success && sessionResult.session) {
                sessionToken = sessionResult.session.sessionToken;
            }
        }

        return res.json({
            success: true,
            accessToken: sessionToken || loginResult.accessToken,
            refreshToken: loginResult.refreshToken,
            expiresIn: sessionToken ? 2592000 : loginResult.expiresIn,
            tenant: loginResult.tenant
        });
    } catch (error: any) {
        const detail = error?.response?.data;
        const description = detail?.error_description || detail?.error || error?.message || 'Failed to set password';
        return res.status(400).json({
            success: false,
            error: description
        });
    }
}));

/**
 * POST /api/v1/tenant-portal/auth/logout
 * Logout (revoke session)
 */
router.post('/auth/logout', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const session = (req as any).session;

    if ((req as any).authType === 'legacy-session') {
        await tenantAuthService.revokeSession(session.sessionToken);
    }

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
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = (parseInt(page as string, 10) - 1) * limitNum;

    // UNION rent_payments (legacy) with any crypto payments in payment_transactions
    // that may not yet have a rent_payments record (safety net).
    // De-duplicate: exclude payment_transactions entries whose reference already appears
    // as bank_reference in rent_payments.
    const result = await db.query(
        `SELECT * FROM (
            SELECT
                id,
                payment_date,
                payment_amount,
                payment_method::text as payment_method,
                COALESCE(mobile_money_reference, bank_reference) as reference,
                receipt_number,
                status::text as status
            FROM rent_payments
            WHERE tenancy_id = $1

            UNION ALL

            SELECT
                pt.id,
                pt.created_at as payment_date,
                pt.principal_amount / 100.0 as payment_amount,
                'crypto' as payment_method,
                pt.reference,
                pt.reference as receipt_number,
                pt.status::text as status
            FROM payment_transactions pt
            WHERE (pt.domain_record_id = $1 OR pt.metadata->>'tenancy_id' = $1::text)
              AND pt.payment_type = 'rent'
              AND pt.status = 'success'
              AND pt.channel = 'crypto_nowpayments'
              AND NOT EXISTS (
                  SELECT 1 FROM rent_payments rp
                  WHERE rp.bank_reference = pt.reference AND rp.tenancy_id = $1
              )
        ) combined
        ORDER BY payment_date DESC
        LIMIT $2 OFFSET $3`,
        [tenancyId, limitNum, offsetNum]
    );

    const countResult = await db.query(
        `SELECT (
            (SELECT COUNT(*) FROM rent_payments WHERE tenancy_id = $1)
            +
            (SELECT COUNT(*) FROM payment_transactions pt
             WHERE (pt.domain_record_id = $1 OR pt.metadata->>'tenancy_id' = $1::text)
               AND pt.payment_type = 'rent'
               AND pt.status = 'success'
               AND pt.channel = 'crypto_nowpayments'
               AND NOT EXISTS (
                   SELECT 1 FROM rent_payments rp
                   WHERE rp.bank_reference = pt.reference AND rp.tenancy_id = $1
               ))
        ) as count`,
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
 * POST /api/v1/tenant-portal/payments/calculate-fee
 * Preview fee breakdown before initiating payment.
 * Returns { principalAmount, serviceFee, totalCharge, feeDescription, ... }
 */
router.post('/payments/calculate-fee', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId, amount } = req.body;

    if (!tenancyId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'tenancyId and a positive amount are required' });
    }

    // Verify tenant access
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

    try {
        const fee = await paymentProcessor.calculateFee('rent', amount, organizationId, 'organization');
        res.json(fee);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
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
    const callbackUrl = `${config.app.tenantPortalUrl}/payments/callback`;

    try {
        const result = await paymentProcessor.initializeRentPayment({
            tenancyId,
            organizationId,
            amount,
            email: tenant.email || `${tenant.phonePrimary}@tenant.propmetrik.com`,
            channel,
            callbackUrl,
            scheduleIds
        });

        res.json({
            success: true,
            authorizationUrl: result.authorizationUrl,
            accessCode: result.accessCode,
            reference: result.reference,
            feeBreakdown: result.feeBreakdown
        });
    } catch (error: any) {
        logger.error('Payment initiation failed', { error: error.message, tenancyId });
        res.status(400).json({ error: error.message });
    }
}));

/**
 * GET /api/v1/tenant-portal/payments/verify/:reference
 * Verify a payment (called after Paystack redirect)
 * No auth required — user arrives from external Paystack redirect and JWT may have expired.
 * The reference is cryptographically random and single-use.
 */
router.get('/payments/verify/:reference', asyncHandler(async (req: Request, res: Response) => {
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
// CRYPTO (USDT/Polygon) PAYMENT ROUTES
// =====================================================

/**
 * GET /api/v1/tenant-portal/payments/crypto/status
 * Check if crypto payment rail is configured and available
 */
router.get('/payments/crypto/status', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    res.json({
        available: paymentProcessor.isCryptoConfigured(),
        network: process.env.PROPMETRIK_CONTRACT_CHAIN_ID === '80002' ? 'amoy-testnet' : 'polygon-mainnet',
        contractAddress: process.env.PROPMETRIK_CONTRACT_ADDRESS || null,
    });
}));

/**
 * POST /api/v1/tenant-portal/payments/crypto/initiate
 * Initialize a USDT rent payment — returns pre-flight data for wallet signing
 * Body: { tenancyId, amount, payerWalletAddress, scheduleIds? }
 */
router.post('/payments/crypto/initiate', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId, amount, payerWalletAddress, tokenAddress, scheduleIds } = req.body;

    if (!tenancyId || !amount || !payerWalletAddress || !tokenAddress) {
        return res.status(400).json({ error: 'tenancyId, amount, payerWalletAddress, and tokenAddress are required' });
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(payerWalletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    // Validate token address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return res.status(400).json({ error: 'Invalid token address format' });
    }

    // Verify tenant has access to this tenancy
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const result = await paymentProcessor.initializeCryptoRentPayment({
        tenancyId,
        organizationId: tenancy.organizationId,
        amount: parseFloat(amount),
        payerWalletAddress,
        tokenAddress,
        scheduleIds,
    });

    res.json(result);
}));

/**
 * POST /api/v1/tenant-portal/payments/crypto/verify
 * Verify an on-chain crypto payment after user submits transaction
 * Body: { txHash }
 */
router.post('/payments/crypto/verify', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const { txHash } = req.body;

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return res.status(400).json({ error: 'Valid transaction hash (txHash) is required' });
    }

    const result = await paymentProcessor.verifyCryptoPayment(txHash);
    res.json(result);
}));

// =====================================================
// UNIFIED CRYPTO PAYMENT — ANY COIN → ANY COIN
// =====================================================

/**
 * GET /api/v1/tenant-portal/payments/crypto/settlement-coins
 * Get the list of supported settlement/payment coins.
 * Returns on-chain (Polygon) coins from DB + all available NOWPayments currencies.
 */
router.get('/payments/crypto/settlement-coins', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');

    // Get on-chain (Polygon) coins from DB
    const dbCoins = await nowPaymentsService.getSupportedSettlementCoins();
    // Add display_name alias (DB has coin_name, frontend expects display_name)
    const dbCoinsNormalized = dbCoins.map((c: any) => ({
        ...c,
        display_name: c.display_name || c.coin_name || c.coin_symbol.toUpperCase(),
    }));
    const onChainCoins = dbCoinsNormalized.filter((c: any) => c.is_evm_native);

    // Get all available NOWPayments currencies dynamically
    let nowPaymentsCoins: any[] = [];
    try {
        if (nowPaymentsService.isConfigured()) {
            const allCurrencies = await nowPaymentsService.getAvailableCurrencies();
            // Only include coins available for payment, exclude on-chain coins
            const onChainSymbols = new Set(onChainCoins.map((c: any) => c.coin_symbol));
            const NP_LOGO_BASE = 'https://nowpayments.io';
            nowPaymentsCoins = allCurrencies
                .filter((c: any) => c.available_for_payment !== false && !onChainSymbols.has((c.code || c.currency || '').toLowerCase()))
                .map((c: any) => {
                    const symbol = (c.code || c.currency || '').toLowerCase();
                    const ticker = c.ticker || symbol;
                    return {
                        id: `np-${symbol}-${c.network || 'default'}`,
                        coin_symbol: ticker,
                        coin_name: c.name || symbol.toUpperCase(),
                        display_name: c.name || symbol.toUpperCase(),
                        chain: c.network || ticker,
                        nowpayments_ticker: symbol,
                        is_evm_native: false,
                        is_enabled: true,
                        logo_url: c.logo_url ? `${NP_LOGO_BASE}${c.logo_url}` : null,
                        is_popular: c.is_popular || false,
                        is_stable: c.is_stable || false,
                    };
                });
            // Sort: popular first, then stablecoins, then alphabetical
            nowPaymentsCoins.sort((a: any, b: any) => {
                if (a.is_popular !== b.is_popular) return a.is_popular ? -1 : 1;
                if (a.is_stable !== b.is_stable) return a.is_stable ? -1 : 1;
                return a.coin_name.localeCompare(b.coin_name);
            });
        }
    } catch (err: any) {
        logger.warn('Failed to fetch NOWPayments currencies, using DB coins only:', err.message);
    }

    res.json({ coins: [...onChainCoins, ...nowPaymentsCoins] });
}));

/**
 * GET /api/v1/tenant-portal/payments/crypto/estimate
 * Get estimated conversion amount before initiating payment.
 * Query: amount (in GHS), payCurrency, payChain, tenancyId (optional, for fee calc)
 */
router.get('/payments/crypto/estimate', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { amount, payCurrency, payChain, tenancyId } = req.query;

    if (!amount || !payCurrency) {
        return res.status(400).json({ error: 'amount and payCurrency are required' });
    }

    const { exchangeRateService } = await import('../../shared-services/payments/crypto');
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
    const { feeEngine } = await import('../../shared-services/payments/feeEngine');

    const amountGhs = parseFloat(amount as string);

    // Calculate platform fee
    let platformFeeGhs = 0;
    let feeDescription = '';
    try {
        let orgId: string | undefined;
        if (tenancyId) {
            const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
            orgId = tenancy?.organizationId;
        }
        if (!orgId && tenant.activeTenancies?.length > 0) {
            orgId = tenant.activeTenancies[0].organizationId;
        }
        const fee = await feeEngine.calculate('rent', amountGhs, orgId, 'organization');
        platformFeeGhs = fee.serviceFee;
        feeDescription = fee.feeDescription;
    } catch (feeErr: any) {
        console.warn('Fee calculation failed for crypto estimate:', feeErr.message);
    }

    const totalChargeGhs = amountGhs + platformFeeGhs;
    const usdAmount = await exchangeRateService.convertGhsToUsd(totalChargeGhs);
    const rentOnlyUsd = await exchangeRateService.convertGhsToUsd(amountGhs);
    const platformFeeUsd = usdAmount - rentOnlyUsd;

    // Resolve to NOWPayments ticker
    const ticker = (payCurrency as string).toLowerCase();

    try {
        const estimate = await nowPaymentsService.getEstimate(usdAmount, 'usd', ticker);
        const minAmount = await nowPaymentsService.getMinimumAmount(ticker, 'usd');

        res.json({
            amountGhs,
            amountUsd: rentOnlyUsd,
            platformFeeGhs,
            platformFeeUsd,
            totalChargeGhs,
            totalChargeUsd: usdAmount,
            feeDescription,
            payCurrency: ticker,
            estimatedPayAmount: estimate.estimated_amount,
            minimumPayAmount: minAmount.min_amount,
            isBelowMinimum: estimate.estimated_amount < minAmount.min_amount,
        });
    } catch (err: any) {
        res.json({
            amountGhs,
            amountUsd: rentOnlyUsd,
            platformFeeGhs,
            platformFeeUsd,
            totalChargeGhs,
            totalChargeUsd: usdAmount,
            feeDescription,
            payCurrency: ticker,
            error: err.message,
        });
    }
}));

/**
 * POST /api/v1/tenant-portal/payments/crypto/unified-initiate
 * Initialize a unified crypto payment — supports ANY payer coin.
 * Routes to either on-chain (Polygon ERC-20) or NOWPayments (cross-chain).
 *
 * Body: {
 *   tenancyId: string,
 *   amount: number (GHS),
 *   payerCurrency: string (e.g. 'btc', 'eth', 'usdt', or '0x...' for ERC-20),
 *   payerChain: string (e.g. 'bitcoin', 'ethereum', 'polygon'),
 *   payerWalletAddress?: string (required for on-chain, optional for NOWPayments),
 *   scheduleIds?: string[],
 *   requiresEscrow?: boolean
 * }
 */
router.post('/payments/crypto/unified-initiate', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId, amount, payerCurrency, payerChain, payerWalletAddress, scheduleIds, requiresEscrow } = req.body;

    if (!tenancyId || !amount || !payerCurrency || !payerChain) {
        return res.status(400).json({
            error: 'tenancyId, amount, payerCurrency, and payerChain are required'
        });
    }

    // Validate wallet address if provided
    if (payerWalletAddress && /^0x/.test(payerWalletAddress) && !/^0x[a-fA-F0-9]{40}$/.test(payerWalletAddress)) {
        return res.status(400).json({ error: 'Invalid EVM wallet address format' });
    }

    // Verify tenant has access to this tenancy
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const result = await paymentProcessor.initializeUnifiedCryptoPayment({
        paymentType: 'rent',
        entityId: tenancyId,
        entityType: 'tenancy',
        recipientId: tenancy.organizationId,
        recipientType: 'organization',
        amount: parseFloat(amount),
        payerCurrency,
        payerChain,
        payerWalletAddress,
        requiresEscrow: requiresEscrow ?? false,
        scheduleIds,
        metadata: {
            tenancy_id: tenancyId,
            organization_id: tenancy.organizationId,
            tenant_id: tenant.id,
        },
    });

    res.json(result);
}));

/**
 * GET /api/v1/tenant-portal/payments/crypto/nowpayments-status/:paymentId
 * Check the status of a NOWPayments payment (polling endpoint for UI).
 * Also syncs the status back to our DB when it changes.
 */
router.get('/payments/crypto/nowpayments-status/:paymentId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
    const paymentId = parseInt(req.params.paymentId, 10);

    if (isNaN(paymentId)) {
        return res.status(400).json({ error: 'Invalid paymentId' });
    }

    const status = await nowPaymentsService.getPaymentStatus(paymentId);

    // Sync status back to our DB
    try {
        // Update nowpayments_payments table
        await db.query(`
            UPDATE nowpayments_payments SET
                status = $1,
                actually_paid = COALESCE($2, actually_paid),
                outcome_amount = COALESCE($3, outcome_amount),
                outcome_currency = COALESCE($4, outcome_currency),
                updated_at = NOW()
            WHERE nowpayments_id = $5
        `, [
            status.payment_status,
            status.actually_paid || null,
            status.outcome_amount || null,
            status.outcome_currency || null,
            paymentId,
        ]);

        // If finished/confirmed, also update payment_transactions ledger
        if (status.payment_status === 'finished' || status.payment_status === 'confirmed') {
            // Find the payment reference from nowpayments_payments
            const npRow = await db.query(
                `SELECT payment_reference, settlement_mode FROM nowpayments_payments WHERE nowpayments_id = $1`,
                [paymentId]
            );
            if (npRow.rows.length > 0) {
                const paymentRef = npRow.rows[0].payment_reference;
                const settlementMode = npRow.rows[0].settlement_mode;

                await db.query(
                    `UPDATE payment_transactions SET status = 'success', verified_at = NOW() WHERE reference = $1 AND status = 'pending'`,
                    [paymentRef]
                );

                // Mark as settled in nowpayments_payments
                await db.query(
                    `UPDATE nowpayments_payments SET settled_at = COALESCE(settled_at, NOW()) WHERE nowpayments_id = $1`,
                    [paymentId]
                );

                // Trigger fee collection for direct-mode payments
                if (settlementMode === 'direct') {
                    try {
                        const { feeCollectionService } = await import('../../shared-services/payments/crypto/feeCollectionService');
                        const feeResult = await feeCollectionService.collectFeeForPayment(paymentRef);
                        console.log(`Fee collection (polling): ${feeResult.status} - GHS ${feeResult.feeAmountGhs} for ${paymentRef}`);
                    } catch (feeErr: any) {
                        console.error('Fee collection via polling failed (non-blocking):', feeErr.message);
                    }
                }

                // Record in rent_payments + apply to schedules (idempotent)
                try {
                    const rentResult = await paymentProcessor.recordCryptoRentCompletion(paymentRef);
                    if (rentResult.recorded) {
                        console.log(`Crypto rent recorded (polling): ${paymentRef}, schedules updated: ${rentResult.schedulesUpdated}`);
                    }
                } catch (rentErr: any) {
                    console.error('Crypto rent completion via polling failed (non-blocking):', rentErr.message);
                }
            }
        } else if (status.payment_status === 'failed' || status.payment_status === 'expired' || status.payment_status === 'refunded') {
            const npRow = await db.query(
                `SELECT payment_reference FROM nowpayments_payments WHERE nowpayments_id = $1`,
                [paymentId]
            );
            if (npRow.rows.length > 0) {
                const txStatus = status.payment_status === 'refunded' ? 'refunded' : 'failed';
                await db.query(
                    `UPDATE payment_transactions SET status = $1 WHERE reference = $2 AND status = 'pending'`,
                    [txStatus, npRow.rows[0].payment_reference]
                );
            }
        }
    } catch (syncErr: any) {
        console.error('Failed to sync NOWPayments status to DB:', syncErr.message);
    }

    res.json({
        paymentId: status.payment_id,
        status: status.payment_status,
        actuallyPaid: status.actually_paid,
        payAmount: status.pay_amount,
        payCurrency: status.pay_currency,
        outcomeAmount: status.outcome_amount,
        outcomeCurrency: status.outcome_currency,
        updatedAt: status.updated_at,
    });
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
         WHERE wo.tenancy_id = $1
         ORDER BY wo.created_at DESC`,
        [tenancyId]
    );

    // Map snake_case DB columns to camelCase for frontend
    const workOrders = result.rows.map((row: any) => ({
        id: row.id,
        propertyId: row.property_id,
        tenancyId: row.tenancy_id,
        title: row.title,
        description: row.description,
        category: row.category,
        priority: row.priority || 'medium',
        status: row.work_order_status || row.status || 'open',
        assignedTo: row.assigned_to,
        estimatedCost: row.estimated_cost ? parseFloat(row.estimated_cost) : null,
        actualCost: row.actual_cost ? parseFloat(row.actual_cost) : null,
        scheduledDate: row.scheduled_date,
        completedAt: row.completed_date,
        photos: row.photos || [],
        completionNotes: row.completion_notes,
        createdAt: row.created_at || row.reported_date,
        updatedAt: row.updated_at,
    }));

    res.json({ workOrders });
}));

/**
 * POST /api/v1/tenant-portal/maintenance
 * Submit a maintenance request
 */
router.post('/maintenance', requireTenantAuth, upload.array('images', 5), scanUploadedFiles, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId, title, category, description, priority = 'medium', photos } = req.body;

    if (!tenancyId || !title || !category || !description) {
        return res.status(400).json({ error: 'tenancyId, title, category, and description are required' });
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
        tenancyId,
        title,
        category,
        description,
        priority,
        photosBefore: photos || []
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

    // Get work order and verify tenant has access via tenancy link
    const result = await db.query(
        `SELECT wo.*,
                v.business_name  AS vendor_name,
                v.contact_person AS vendor_contact,
                v.phone_primary  AS vendor_phone,
                p.title          AS property_title
         FROM maintenance_work_orders wo
         JOIN tenancies t ON wo.tenancy_id = t.id
         LEFT JOIN vendors v ON wo.assigned_vendor_id = v.id
         LEFT JOIN properties p ON wo.property_id = p.id
         WHERE wo.id = $1 AND t.tenant_id = $2`,
        [workOrderId, tenant.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Work order not found' });
    }

    const row = result.rows[0];
    const request = {
        id: row.id,
        propertyId: row.property_id,
        propertyTitle: row.property_title,
        tenancyId: row.tenancy_id,
        title: row.title,
        description: row.description,
        category: row.category,
        priority: row.priority || 'medium',
        status: row.status || 'open',
        location: row.specific_location,
        scheduledDate: row.scheduled_date,
        scheduledTimeStart: row.scheduled_time_start,
        scheduledTimeEnd: row.scheduled_time_end,
        completedAt: row.completed_at,
        vendorName: row.vendor_name,
        vendorContact: row.vendor_contact,
        vendorPhone: row.vendor_phone,
        estimatedCost: row.estimated_cost ? parseFloat(row.estimated_cost) : null,
        actualCost: row.actual_cost ? parseFloat(row.actual_cost) : null,
        completionNotes: row.completion_notes,
        photos: row.photos_before || [],
        createdAt: row.created_at || row.reported_at,
        updatedAt: row.updated_at,
    };

    res.json({ request });
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

    // Get uploaded documents
    const result = await db.query(
        `SELECT * FROM property_management_documents
         WHERE tenancy_id = $1
         ORDER BY created_at DESC`,
        [tenancyId]
    );

    const documents = result.rows.map((r: any) => ({
        id: r.id,
        documentType: r.document_type,
        title: r.title,
        description: r.description,
        fileUrl: r.file_url,
        fileName: r.file_name,
        fileSizeBytes: r.file_size_bytes,
        mimeType: r.mime_type,
        isVerified: r.is_verified,
        uploadedBy: r.uploaded_by,
        createdAt: r.created_at
    }));

    // Also include signed lease from tenancy itself
    const tenancyResult = await db.query(
        `SELECT id, lease_signed_url, lease_document_url, lease_status, reference_number, lease_start_date
         FROM tenancies WHERE id = $1`,
        [tenancyId]
    );

    if (tenancyResult.rows[0]) {
        const t = tenancyResult.rows[0];
        if (t.lease_signed_url) {
            documents.unshift({
                id: `lease-signed-${t.id}`,
                documentType: 'lease',
                title: 'Signed Lease Agreement',
                description: `Lease ${t.reference_number} - Fully executed`,
                fileUrl: t.lease_signed_url,
                fileName: `Lease_Agreement_${t.reference_number}.pdf`,
                fileSizeBytes: null,
                mimeType: 'application/pdf',
                isVerified: true,
                uploadedBy: null,
                createdAt: t.lease_start_date
            });
        } else if (t.lease_document_url) {
            documents.unshift({
                id: `lease-draft-${t.id}`,
                documentType: 'lease',
                title: 'Lease Agreement (Draft)',
                description: `Lease ${t.reference_number} - Pending signature`,
                fileUrl: t.lease_document_url,
                fileName: `Lease_Draft_${t.reference_number}.pdf`,
                fileSizeBytes: null,
                mimeType: 'application/pdf',
                isVerified: false,
                uploadedBy: null,
                createdAt: t.lease_start_date
            });
        }
    }

    res.json({ documents });
}));

// =====================================================
// SESSIONS ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/sessions
 * Get active sessions for the current tenant
 */
router.get('/sessions', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const currentSession = (req as any).session;

    const result = await db.query(
        `SELECT id, auth_method, user_agent, ip_address, created_at, last_used_at, is_active
         FROM tenant_sessions
         WHERE tenant_id = $1 AND is_active = TRUE AND expires_at > NOW()
         ORDER BY last_used_at DESC`,
        [tenant.id]
    );

    const sessions = result.rows.map((row: any) => ({
        id: row.id,
        authMethod: row.auth_method,
        userAgent: row.user_agent,
        ipAddress: row.ip_address ? String(row.ip_address) : null,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        isCurrent: currentSession?.id === row.id || currentSession?.sessionToken === row.session_token
    }));

    res.json({ sessions });
}));

/**
 * DELETE /api/v1/tenant-portal/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { sessionId } = req.params;

    const result = await db.query(
        `UPDATE tenant_sessions SET is_active = FALSE, revoked_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
         RETURNING id`,
        [sessionId, tenant.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, message: 'Session revoked' });
}));

// =====================================================
// PASSWORD CHANGE (Authenticated)
// =====================================================

/**
 * POST /api/v1/tenant-portal/change-password
 * Change tenant password via Keycloak Admin API
 */
router.post('/change-password', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Verify current password by attempting login
    try {
        await keycloakTenantOnboardingService.loginWithPassword(tenant.email, currentPassword);
    } catch {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Change password via Keycloak Admin API
    try {
        const adminToken = await (keycloakTenantOnboardingService as any).getAdminAccessToken();
        const keycloakUser = await (keycloakTenantOnboardingService as any).findKeycloakUserByEmail(adminToken, tenant.email);
        
        if (!keycloakUser) {
            return res.status(400).json({ error: 'Keycloak account not found' });
        }

        const axios = require('axios');
        const keycloakUrl = config.keycloak.url;
        const realm = config.keycloak.realm;
        
        await axios.put(
            `${keycloakUrl}/admin/realms/${realm}/users/${keycloakUser.id}/reset-password`,
            { type: 'password', value: newPassword, temporary: false },
            { headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' } }
        );

        // Create notification
        await db.query(
            `INSERT INTO tenant_notifications (tenant_id, type, title, message)
             VALUES ($1, 'security', 'Password Changed', 'Your password was successfully changed.')`,
            [tenant.id]
        );

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
        logger.error('Password change failed', { error: error.message });
        return res.status(500).json({ error: 'Failed to change password' });
    }
}));

// =====================================================
// 2FA ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/2fa/status
 * Get 2FA status
 */
router.get('/2fa/status', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;

    const result = await db.query(
        `SELECT two_factor_enabled, two_factor_method FROM tenants WHERE id = $1`,
        [tenant.id]
    );

    res.json({
        enabled: result.rows[0]?.two_factor_enabled || false,
        method: result.rows[0]?.two_factor_method || 'email'
    });
}));

/**
 * POST /api/v1/tenant-portal/2fa/enable
 * Enable 2FA - sends verification OTP, then confirms
 */
router.post('/2fa/enable', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { method } = req.body; // 'email' or 'sms'
    const twoFaMethod = method === 'sms' ? 'sms' : 'email';

    // Generate OTP and send
    const otpResult = await tenantAuthService.generateOTP(
        tenant.email || tenant.phonePrimary,
        twoFaMethod === 'sms' ? AuthMethod.OTP_SMS : AuthMethod.OTP_EMAIL
    );

    if (!otpResult.success) {
        return res.status(500).json({ error: 'Failed to send verification code' });
    }

    res.json({ success: true, message: `Verification code sent via ${twoFaMethod}` });
}));

/**
 * POST /api/v1/tenant-portal/2fa/verify
 * Verify OTP and enable 2FA
 */
router.post('/2fa/verify', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { otp, method } = req.body;

    if (!otp) {
        return res.status(400).json({ error: 'Verification code is required' });
    }

    const twoFaMethod = method === 'sms' ? 'sms' : 'email';
    const identifier = twoFaMethod === 'sms' ? tenant.phonePrimary : tenant.email;

    const verifyResult = await tenantAuthService.verifyOTP(identifier, otp, twoFaMethod === 'sms' ? AuthMethod.OTP_SMS : AuthMethod.OTP_EMAIL);
    if (!verifyResult.success) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    await db.query(
        `UPDATE tenants SET two_factor_enabled = TRUE, two_factor_method = $2, updated_at = NOW() WHERE id = $1`,
        [tenant.id, twoFaMethod]
    );

    await db.query(
        `INSERT INTO tenant_notifications (tenant_id, type, title, message)
         VALUES ($1, 'security', 'Two-Factor Authentication Enabled', 'Your account now requires a verification code on login.')`,
        [tenant.id]
    );

    res.json({ success: true, message: 'Two-factor authentication enabled' });
}));

/**
 * POST /api/v1/tenant-portal/2fa/disable
 * Disable 2FA
 */
router.post('/2fa/disable', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required to disable 2FA' });
    }

    // Verify password
    try {
        await keycloakTenantOnboardingService.loginWithPassword(tenant.email, password);
    } catch {
        return res.status(400).json({ error: 'Password is incorrect' });
    }

    await db.query(
        `UPDATE tenants SET two_factor_enabled = FALSE, updated_at = NOW() WHERE id = $1`,
        [tenant.id]
    );

    res.json({ success: true, message: 'Two-factor authentication disabled' });
}));

// =====================================================
// NOTIFICATIONS ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/notifications
 * Get notifications for the current tenant
 */
router.get('/notifications', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await db.query(
        `SELECT * FROM tenant_notifications
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenant.id, limit]
    );

    const unreadResult = await db.query(
        `SELECT COUNT(*) as count FROM tenant_notifications WHERE tenant_id = $1 AND is_read = FALSE`,
        [tenant.id]
    );

    res.json({
        notifications: result.rows.map((r: any) => ({
            id: r.id,
            type: r.type,
            title: r.title,
            message: r.message,
            actionUrl: r.action_url,
            isRead: r.is_read,
            createdAt: r.created_at
        })),
        unreadCount: parseInt(unreadResult.rows[0]?.count || '0')
    });
}));

/**
 * PATCH /api/v1/tenant-portal/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/notifications/:id/read', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { id } = req.params;

    await db.query(
        `UPDATE tenant_notifications SET is_read = TRUE WHERE id = $1 AND tenant_id = $2`,
        [id, tenant.id]
    );

    res.json({ success: true });
}));

/**
 * POST /api/v1/tenant-portal/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/notifications/mark-all-read', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;

    await db.query(
        `UPDATE tenant_notifications SET is_read = TRUE WHERE tenant_id = $1 AND is_read = FALSE`,
        [tenant.id]
    );

    res.json({ success: true });
}));

// =====================================================
// DOCUMENT UPLOAD ROUTES (Authenticated)
// =====================================================

/**
 * POST /api/v1/tenant-portal/documents/upload
 * Upload a document (ID card, passport, etc.)
 */
router.post('/documents/upload', requireTenantAuth, upload.single('file'), scanUploadedFile, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const file = (req as any).file;
    const { tenancyId, documentType, title, description } = req.body;

    if (!file) {
        return res.status(400).json({ error: 'File is required' });
    }

    if (!tenancyId || !documentType) {
        return res.status(400).json({ error: 'tenancyId and documentType are required' });
    }

    // Map frontend document types to the DB enum values
    const docTypeMap: Record<string, string> = {
        identification: 'other',
        receipt: 'property_tax_receipts',
        lease: 'lease_agreement',
        invoice: 'other',
        other: 'other',
    };
    const dbDocumentType = docTypeMap[documentType.toLowerCase()] || 'other';

    // Verify tenant has access to this tenancy
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Get property_id and organization_id from the tenancies table
    const tenancyLookup = await db.query(
        `SELECT property_id, organization_id FROM tenancies WHERE id = $1`,
        [tenancyId]
    );
    if (tenancyLookup.rows.length === 0) {
        return res.status(404).json({ error: 'Tenancy not found in database' });
    }
    const { property_id, organization_id } = tenancyLookup.rows[0];

    // Upload file to MinIO
    const ext = file.originalname.split('.').pop() || 'pdf';
    const key = `tenant-documents/${tenant.id}/${Date.now()}_${file.originalname}`;
    const bucket = process.env.MINIO_BUCKET_UPLOADS || 'propmetrik-uploads';

    try {
        await uploadFile(bucket, key, file.buffer, file.mimetype);
    } catch (uploadErr: any) {
        logger.error('MinIO upload failed', { error: uploadErr.message });
        return res.status(500).json({ error: 'Failed to upload file. Please try again.' });
    }

    const fileUrl = `/api/v1/files/${bucket}/${key}`;

    // Insert into property_management_documents
    const result = await db.query(
        `INSERT INTO property_management_documents
         (property_id, tenancy_id, organization_id, document_type, title, description, file_url, file_name, file_size_bytes, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
            property_id,
            tenancyId,
            organization_id,
            dbDocumentType,
            title || file.originalname,
            description || null,
            fileUrl,
            file.originalname,
            file.size,
            file.mimetype,
            tenant.id
        ]
    );

    // Create notification for landlord (in the staff notifications table)
    try {
        await db.query(
            `INSERT INTO tenant_notifications (tenant_id, type, title, message, action_url)
             VALUES ($1, 'document', 'Document Uploaded', $2, '/documents')`,
            [tenant.id, `Your document "${title || file.originalname}" has been uploaded successfully.`]
        );
    } catch {}

    res.json({ success: true, document: result.rows[0] });
}));

// =====================================================
// MESSAGING ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/v1/tenant-portal/conversations
 * Get all conversations for the tenant
 */
router.get('/conversations', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;

    // Get tenancy IDs for this tenant
    const tenancyIds = (tenant.activeTenancies || []).map((t: any) => t.id);
    if (tenancyIds.length === 0) {
        return res.json({ conversations: [] });
    }

    const result = await db.query(
        `SELECT c.*, 
            o.name as organization_name,
            (SELECT content FROM tenant_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
         FROM tenant_conversations c
         JOIN organizations o ON o.id = c.organization_id
         WHERE c.tenancy_id = ANY($1) AND c.is_archived = FALSE
         ORDER BY c.last_message_at DESC`,
        [tenancyIds]
    );

    res.json({
        conversations: result.rows.map((r: any) => ({
            id: r.id,
            tenancyId: r.tenancy_id,
            organizationName: r.organization_name,
            subject: r.subject,
            lastMessage: r.last_message,
            lastMessageAt: r.last_message_at,
            unreadCount: r.tenant_unread_count,
            createdAt: r.created_at
        }))
    });
}));

/**
 * POST /api/v1/tenant-portal/conversations
 * Create a new conversation
 */
router.post('/conversations', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId, subject, message } = req.body;

    if (!tenancyId || !message) {
        return res.status(400).json({ error: 'tenancyId and message are required' });
    }

    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Create conversation
    const convResult = await db.query(
        `INSERT INTO tenant_conversations (tenancy_id, organization_id, subject, landlord_unread_count)
         VALUES ($1, $2, $3, 1)
         RETURNING *`,
        [tenancyId, tenancy.organizationId, subject || 'General']
    );

    const conversationId = convResult.rows[0].id;

    // Create first message
    await db.query(
        `INSERT INTO tenant_messages (conversation_id, sender_type, sender_id, content)
         VALUES ($1, 'tenant', $2, $3)`,
        [conversationId, tenant.id, message]
    );

    // Notify the landlord's staff that a tenant opened a new conversation.
    try {
        const tenantName = tenant.fullName || tenant.full_name
            || [tenant.firstName, tenant.lastName].filter(Boolean).join(' ') || 'A tenant';
        const staff = await resolveOrgStaff(tenancy.organizationId);
        if (staff.length) {
            await notify({
                recipients: staff,
                category: 'property',
                type: 'message.received',
                title: `New message from ${tenantName}`,
                body: message,
                summary: `${tenantName}: ${message.slice(0, 120)}`,
                priority: 'normal',
                sourceType: 'tenant_conversation',
                sourceId: conversationId,
                sourceUrl: '/dashboard/property-management/messages',
                organizationId: tenancy.organizationId,
                channels: { inApp: true, email: true },
            });
        }
    } catch (err: any) {
        logger.warn('notify(message.received/new-conversation) failed', { error: err.message });
    }

    res.json({
        success: true,
        conversation: {
            id: conversationId,
            tenancyId,
            subject: subject || 'General',
            lastMessage: message,
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            createdAt: convResult.rows[0].created_at
        }
    });
}));

/**
 * GET /api/v1/tenant-portal/conversations/:conversationId/messages
 * Get messages for a conversation
 */
router.get('/conversations/:conversationId/messages', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { conversationId } = req.params;

    // Verify access
    const tenancyIds = (tenant.activeTenancies || []).map((t: any) => t.id);
    const convCheck = await db.query(
        `SELECT * FROM tenant_conversations WHERE id = $1 AND tenancy_id = ANY($2)`,
        [conversationId, tenancyIds]
    );
    if (convCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const result = await db.query(
        `SELECT * FROM tenant_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [conversationId]
    );

    // Mark as read for tenant
    await db.query(
        `UPDATE tenant_conversations SET tenant_unread_count = 0 WHERE id = $1`,
        [conversationId]
    );
    await db.query(
        `UPDATE tenant_messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_type != 'tenant'`,
        [conversationId]
    );

    res.json({
        messages: result.rows.map((r: any) => ({
            id: r.id,
            senderType: r.sender_type,
            senderId: r.sender_id,
            content: r.content,
            attachmentUrl: r.attachment_url,
            attachmentName: r.attachment_name,
            attachmentType: r.attachment_type,
            isRead: r.is_read,
            createdAt: r.created_at
        }))
    });
}));

/**
 * POST /api/v1/tenant-portal/conversations/:conversationId/messages
 * Send a message in a conversation
 */
router.post('/conversations/:conversationId/messages', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
    }

    // Verify access
    const tenancyIds = (tenant.activeTenancies || []).map((t: any) => t.id);
    const convCheck = await db.query(
        `SELECT * FROM tenant_conversations WHERE id = $1 AND tenancy_id = ANY($2)`,
        [conversationId, tenancyIds]
    );
    if (convCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    // Insert message
    const result = await db.query(
        `INSERT INTO tenant_messages (conversation_id, sender_type, sender_id, content)
         VALUES ($1, 'tenant', $2, $3)
         RETURNING *`,
        [conversationId, tenant.id, content]
    );

    // Update conversation
    await db.query(
        `UPDATE tenant_conversations
         SET last_message_at = NOW(), landlord_unread_count = landlord_unread_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [conversationId]
    );

    // Notify the landlord's staff of the new tenant reply.
    try {
        const conv = convCheck.rows[0];
        const tenantName = tenant.fullName || tenant.full_name
            || [tenant.firstName, tenant.lastName].filter(Boolean).join(' ') || 'A tenant';
        const staff = await resolveOrgStaff(conv.organization_id);
        if (staff.length) {
            await notify({
                recipients: staff,
                category: 'property',
                type: 'message.received',
                title: `New message from ${tenantName}`,
                body: content,
                summary: `${tenantName}: ${content.slice(0, 120)}`,
                priority: 'normal',
                sourceType: 'tenant_conversation',
                sourceId: conversationId,
                sourceUrl: '/dashboard/property-management/messages',
                organizationId: conv.organization_id,
                channels: { inApp: true, email: true },
            });
        }
    } catch (err: any) {
        logger.warn('notify(message.received) failed', { error: err.message });
    }

    const msg = result.rows[0];
    res.json({
        success: true,
        message: {
            id: msg.id,
            senderType: msg.sender_type,
            senderId: msg.sender_id,
            content: msg.content,
            createdAt: msg.created_at
        }
    });
}));

// =====================================================
// UTILITY CHARGES (Tenant view)
// =====================================================

/**
 * GET /api/v1/tenant-portal/utility-charges/:tenancyId
 * Tenant views utility charges for their tenancy
 */
router.get('/utility-charges/:tenancyId', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { tenancyId } = req.params;

    // Verify tenant has access
    const tenancy = tenant.activeTenancies?.find((t: any) => t.id === tenancyId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const result = await db.query(
        `SELECT uc.id, uc.utility_type, uc.billing_period_start, uc.billing_period_end,
                uc.amount, uc.currency, uc.description, uc.status, uc.applied_at,
                uc.dispute_reason, uc.dispute_resolved_at, uc.dispute_resolution,
                uc.created_at,
                d.title as evidence_title, d.file_url as evidence_file_url,
                rs.period_number as schedule_period_number, rs.period_start_date as schedule_period_start
         FROM utility_charges uc
         LEFT JOIN property_management_documents d ON uc.evidence_document_id = d.id
         LEFT JOIN rent_schedules rs ON uc.applied_to_schedule_id = rs.id
         WHERE uc.tenancy_id = $1
         ORDER BY uc.billing_period_start DESC`,
        [tenancyId]
    );

    res.json({ charges: result.rows });
}));

/**
 * POST /api/v1/tenant-portal/utility-charges/:id/dispute
 * Tenant disputes a utility charge
 */
router.post('/utility-charges/:id/dispute', requireTenantAuth, asyncHandler(async (req: Request, res: Response) => {
    const tenant = (req as any).tenant;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
        return res.status(400).json({ error: 'Dispute reason is required' });
    }

    // Verify charge belongs to tenant's tenancy
    const tenancyIds = (tenant.activeTenancies || []).map((t: any) => t.id);
    const chargeCheck = await db.query(
        `SELECT * FROM utility_charges WHERE id = $1 AND tenancy_id = ANY($2) AND status IN ('pending', 'applied')`,
        [id, tenancyIds]
    );
    if (chargeCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Charge not found or cannot be disputed' });
    }

    const result = await db.query(
        `UPDATE utility_charges SET status = 'disputed', dispute_reason = $1 WHERE id = $2 RETURNING *`,
        [reason, id]
    );

    res.json({ success: true, charge: result.rows[0] });
}));

// =====================================================
// ERROR HANDLER
// =====================================================

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Tenant Portal API Error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});

export default router;
