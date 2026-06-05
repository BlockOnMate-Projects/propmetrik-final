/**
 * Property Management API Routes
 * Phase 4.4: API endpoints for Property Management module
 * 
 * Base path: /api/v1/pm
 * 
 * @module routes/propertyManagement
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { TenantService } from '../services/property-management/tenants/tenantService';
import { TenancyService } from '../services/property-management/leases/tenancyService';
import { RentCollectionService } from '../services/property-management/rent-collection/rentCollectionService';

import { WorkOrderService } from '../services/property-management/maintenance/workOrderService';
import { VendorService } from '../services/property-management/maintenance/vendorService';
import { DocumentService } from '../services/property-management/documents/documentService';
import { FinancialService } from '../services/property-management/financial-reporting/financialService';
import { advancedFinancialService } from '../services/property-management/financial-reporting/advancedFinancialService';
import { PortfolioService } from '../services/property-management/portfolios/portfolioService';
import { propertyService } from '../services/property-management/properties/propertyService';
import {
    validate,
    clampPagination,
    pmCreatePropertySchema,
    pmCreateTenantSchema,
    pmCreateTenancySchema,
    pmTerminateTenancySchema,
    pmRenewTenancySchema,
    pmRecordPaymentSchema,
    pmInitializePaymentSchema,
    pmCreateWorkOrderSchema,
    pmAssignWorkOrderSchema,
    pmCompleteWorkOrderSchema,
    pmCreateVendorSchema,
    pmCreateDocumentSchema,
    pmCreateFinancialSchema,
    pmBulkRentIncreaseSchema,
    pmBulkStatusUpdateSchema,
    pmBulkImportSchema,
    pmCreateApplicationSchema,
    pmRejectApplicationSchema,
    pmCreateApplicationLinkSchema,
    pmSignLeaseSchema,
    pmSendMessageSchema,
    pmRegisterAccountSchema,
} from '../middleware/validation';
import db from '../database';
import config from '../config';
import {
    TenantStatus,
    TenancyStatus,
    WorkOrderStatus,
    MaintenanceCategory,
    Priority,

    PaymentMethod,
    VendorStatus,
    PropertyDocumentType,
    FinancialFilters
} from '../types/property-management.types';
import { createCustomRateLimiter } from '../middleware/rateLimiter';
import { getSignedLeaseDownloadUrl, isS3ObjectRef, storeSignedLeaseDocument } from '../services/property-management/leases/signedLeaseStorage';
import { buckets, uploadFile } from '../database/minio';

const router = Router();

const propertyPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Only JPG, PNG, and WebP images are supported'));
    },
});

function isSupportedImageBuffer(file: Express.Multer.File): boolean {
    const buffer = file.buffer;
    if (file.mimetype === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (file.mimetype === 'image/png') return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (file.mimetype === 'image/webp') return buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    return false;
}

function safeStorageFilename(filename: string): string {
    const fallback = `photo.${filename.split('.').pop() || 'jpg'}`;
    return (filename || fallback).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

// =====================================================
// SENSITIVE ENDPOINT RATE LIMITERS
// =====================================================
const paymentRateLimit = createCustomRateLimiter('pm-payment', {
    points: 10,      // 10 payment initializations
    duration: 60,    // per minute
    blockDuration: 120,
});

const bulkOpRateLimit = createCustomRateLimiter('pm-bulk', {
    points: 5,       // 5 bulk operations
    duration: 60,    // per minute
    blockDuration: 120,
});

const cryptoRateLimit = createCustomRateLimiter('pm-crypto', {
    points: 10,      // 10 crypto operations
    duration: 60,    // per minute
    blockDuration: 60,
});

// Service instances
const tenantService = new TenantService();
const tenancyService = new TenancyService();
const rentCollectionService = new RentCollectionService();

const workOrderService = new WorkOrderService();
const vendorService = new VendorService();
const documentService = new DocumentService();
const financialService = new FinancialService();
const portfolioService = new PortfolioService();

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Extract organization ID from authenticated user or header
 */
async function getOrganizationId(req: Request): Promise<string> {
    // 1. Try to get from authenticated user (JWT/Keycloak)
    let id = (req as any).user?.organizationId;

    // 2. Try to get from header
    if (!id) {
        id = req.headers['x-organization-id'] as string;
    }

    // 3. Fallback for development mode
    if (!id && config.app.env === 'development') {
        const result = await db.query('SELECT id FROM organizations LIMIT 1');
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
    }

    // Fallback to nil UUID to prevent Postgres errors with empty string
    return id || '00000000-0000-0000-0000-000000000000';
}

/**
 * Extract user ID from authenticated user or header
 */
async function getUserId(req: Request): Promise<string | undefined> {
    // 1. Try to get from authenticated user
    let id = (req as any).user?.id;

    // 2. Try to get from header
    if (!id) {
        id = req.headers['x-user-id'] as string;
    }

    // 3. Fallback for development mode
    if (!id && config.app.env === 'development') {
        const result = await db.query('SELECT id FROM users LIMIT 1');
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
    }

    return id;
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
// PROPERTY ROUTES
// =====================================================

/**
 * GET /api/v1/pm/properties
 * List properties for organization
 */
router.get('/properties', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const properties = await propertyService.listProperties(organizationId);
    res.json(properties);
}));

/**
 * POST /api/v1/pm/properties
 * Create a new property
 */
router.post('/properties', validate(pmCreatePropertySchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const property = await propertyService.createProperty(organizationId, req.body, userId || '');
    res.status(201).json(property);
}));

/**
 * GET /api/v1/pm/properties/:id
 * Get property by ID
 */
router.get('/properties/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const property = await propertyService.getPropertyById(req.params.id, organizationId);
    if (!property) {
        return res.status(404).json({ error: 'Property not found' });
    }
    res.json(property);
}));

// =====================================================
// TENANT ROUTES
// =====================================================

/**
 * GET /api/v1/pm/tenants
 * List tenants with pagination and filtering
 */
router.get('/tenants', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        status: req.query.status as TenantStatus | undefined,
        search: req.query.search as string | undefined,
        hasActiveTenancy: req.query.hasActiveTenancy === 'true' ? true :
            req.query.hasActiveTenancy === 'false' ? false : undefined
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await tenantService.getTenants(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * POST /api/v1/pm/tenants
 * Create a new tenant
 */
router.post('/tenants', validate(pmCreateTenantSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const tenantData = {
        ...req.body,
        phonePrimary: req.body.phonePrimary ?? req.body.phone ?? null,
    };
    const tenant = await tenantService.createTenant(organizationId, tenantData, userId);
    res.status(201).json(tenant);
}));

/**
 * GET /api/v1/pm/tenants/:id
 * Get tenant by ID
 */
router.get('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const tenant = await tenantService.getTenantById(req.params.id, organizationId);
    if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(tenant);
}));

/**
 * PATCH /api/v1/pm/tenants/:id
 * Update tenant
 */
router.patch('/tenants/:id', validate(pmCreateTenantSchema.partial()), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const tenant = await tenantService.updateTenant(req.params.id, organizationId, req.body);
    if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(tenant);
}));

/**
 * DELETE /api/v1/pm/tenants/:id
 * Delete (soft) tenant
 */
router.delete('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    try {
        const success = await tenantService.deleteTenant(req.params.id, organizationId);
        if (!success) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        res.status(204).send();
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

/**
 * POST /api/v1/pm/tenants/:id/screen
 * Screen a tenant
 */
router.post('/tenants/:id/screen', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    try {
        const result = await tenantService.screenTenant(req.params.id, organizationId);
        res.json(result);
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
}));

/**
 * POST /api/v1/pm/tenants/:id/verify
 * Verify a tenant
 */
router.post('/tenants/:id/verify', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const tenant = await tenantService.verifyTenant(req.params.id, organizationId);
    if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(tenant);
}));

// =====================================================
// TENANCY ROUTES
// =====================================================

/**
 * GET /api/v1/pm/tenancies
 * List tenancies with pagination and filtering
 */
router.get('/tenancies', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const filters = {
        status: req.query.status as TenancyStatus | undefined,
        propertyId: req.query.propertyId as string | undefined,
        tenantId: req.query.tenantId as string | undefined,
        leaseExpiringWithinDays: req.query.expiringDays ?
            parseInt(req.query.expiringDays as string) : undefined
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await tenancyService.getTenancies(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * POST /api/v1/pm/tenancies
 * Create a new tenancy
 */
router.post('/tenancies', validate(pmCreateTenancySchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    try {
        const tenancy = await tenancyService.createTenancy(organizationId, req.body, userId);
        res.status(201).json(tenancy);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

/**
 * GET /api/v1/pm/tenancies/:id
 * Get tenancy by ID
 */
router.get('/tenancies/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const tenancy = await tenancyService.getTenancyById(req.params.id, organizationId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }
    res.json(tenancy);
}));

/**
 * PATCH /api/v1/pm/tenancies/:id
 * Update tenancy
 */
router.patch('/tenancies/:id', validate(pmCreateTenancySchema.partial()), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const tenancy = await tenancyService.updateTenancy(req.params.id, organizationId, req.body);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }
    res.json(tenancy);
}));

/**
 * POST /api/v1/pm/tenancies/:id/activate
 * Activate a pending tenancy
 */
router.post('/tenancies/:id/activate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const tenancy = await tenancyService.activateTenancy(req.params.id, organizationId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }
    res.json(tenancy);
}));

/**
 * POST /api/v1/pm/tenancies/:id/terminate
 * Terminate a tenancy
 */
router.post('/tenancies/:id/terminate', validate(pmTerminateTenancySchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    try {
        const tenancy = await tenancyService.terminateTenancy(
            req.params.id,
            organizationId,
            req.body.reason || 'Terminated by landlord'
        );
        if (!tenancy) {
            return res.status(404).json({ error: 'Tenancy not found' });
        }
        res.json(tenancy);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

/**
 * POST /api/v1/pm/tenancies/:id/renew
 * Renew a tenancy
 */
router.post('/tenancies/:id/renew', validate(pmRenewTenancySchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    try {
        const tenancy = await tenancyService.renewTenancy(req.params.id, organizationId, {
            newEndDate: req.body.newEndDate,
            newMonthlyRent: req.body.newMonthlyRent,
            advancePaymentAmount: req.body.advancePaymentAmount
        });
        if (!tenancy) {
            return res.status(404).json({ error: 'Tenancy not found' });
        }
        res.json(tenancy);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

/**
 * GET /api/v1/pm/tenancies/:id/payment-summary
 * Get payment summary for a tenancy
 */
router.get('/tenancies/:id/payment-summary', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    try {
        const summary = await tenancyService.getTenancyPaymentSummary(req.params.id, organizationId);
        res.json(summary);
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
}));

/**
 * GET /api/v1/pm/tenancies/:id/signed-lease
 * Serve a signed lease stored on the tenancy record.
 */
router.get('/tenancies/:id/signed-lease', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const result = await db.query(
        `SELECT id, reference_number, lease_signed_url
         FROM tenancies
         WHERE id = $1 AND organization_id = $2`,
        [req.params.id, organizationId]
    );

    const tenancy = result.rows[0];
    if (!tenancy?.lease_signed_url) {
        return res.status(404).json({ error: 'Signed lease not found' });
    }

    const signedUrl = tenancy.lease_signed_url as string;
    if (isS3ObjectRef(signedUrl)) {
        const downloadUrl = await getSignedLeaseDownloadUrl(signedUrl);
        if (!downloadUrl) return res.status(422).json({ error: 'Signed lease storage reference is invalid' });
        return res.redirect(downloadUrl);
    }

    if (signedUrl.startsWith('http')) {
        return res.redirect(signedUrl);
    }

    const dataUrlMatch = signedUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
        const objectRef = await storeSignedLeaseDocument({
            tenancyId: tenancy.id,
            sourceUrl: signedUrl,
        });
        await db.query(
            `UPDATE tenancies SET lease_signed_url = $1, updated_at = NOW() WHERE id = $2`,
            [objectRef, tenancy.id]
        );
        const downloadUrl = await getSignedLeaseDownloadUrl(objectRef);
        if (!downloadUrl) return res.status(422).json({ error: 'Signed lease storage reference is invalid' });
        return res.redirect(downloadUrl);
    }

    return res.status(422).json({ error: 'Signed lease URL format is not supported' });
}));

/**
 * GET /api/v1/pm/tenancies/expiring
 * Get tenancies expiring soon
 */
router.get('/tenancies-expiring', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const days = parseInt(req.query.days as string) || 30;

    const tenancies = await tenancyService.getExpiringTenancies(organizationId, days);
    res.json(tenancies);
}));

// =====================================================
// PAYMENT ROUTES
// =====================================================

/**
 * POST /api/v1/pm/payments
 * Record a rent payment
 */
router.post('/payments', validate(pmRecordPaymentSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    try {
        const payment = await rentCollectionService.recordPayment(organizationId, req.body, userId);
        res.status(201).json(payment);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

// =====================================================
// PAYMENT CONFIGURATION (Payout Account Setup)
// These routes power the "Payment Settings" tab in
// the Property Management Financial Center.
// IMPORTANT: Must be registered BEFORE /payments/:id
// to avoid the param route catching static paths.
// =====================================================

/**
 * GET /api/v1/pm/payments/account
 * Get current payout account config for the organization
 */
router.get('/payments/account', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const result = await db.query(
        `SELECT * FROM payment_accounts
         WHERE entity_id = $1 AND entity_type = 'organization' AND service_type = 'property_management' AND is_active = TRUE
         LIMIT 1`,
        [organizationId]
    );

    if (result.rows.length === 0) {
        const legacy = await db.query(
            `SELECT * FROM pm_payment_accounts
             WHERE organization_id = $1 AND is_active = TRUE
             LIMIT 1`,
            [organizationId]
        );

        if (legacy.rows.length === 0) {
            return res.json({ configured: false });
        }

        const row = legacy.rows[0];
        return res.json({
            configured: true,
            settlementMethod: 'bank',
            bankName: row.paystack_bank_name,
            bankCode: row.paystack_bank_code,
            accountNumber: row.paystack_account_number,
            accountName: row.paystack_account_name,
            subaccountCode: row.paystack_subaccount_code,
            platformFeePercentage: parseFloat(row.platform_fee_percentage || 1),
            platformFeeFlat: parseFloat(row.platform_fee_flat || 25),
            isVerified: !!row.verified_at,
            verifiedAt: row.verified_at,
            createdAt: row.created_at
        });
    }

    const row = result.rows[0];
    res.json({
        configured: true,
        settlementMethod: row.settlement_method || 'bank',
        bankName: row.bank_name,
        bankCode: row.bank_code,
        accountNumber: row.account_number,
        accountName: row.account_name,
        momoProvider: row.momo_provider,
        momoNumber: row.momo_number,
        subaccountCode: row.paystack_subaccount_code,
        platformFeePercentage: parseFloat(row.platform_fee_percentage || 0.01) * 100,
        platformFeeFlat: parseFloat(row.platform_fee_flat || 25),
        isVerified: row.is_verified,
        verifiedAt: row.verified_at,
        createdAt: row.created_at
    });
}));

/**
 * GET /api/v1/pm/payments/banks
 * Get list of supported banks for payout setup
 */
router.get('/payments/banks', asyncHandler(async (req: Request, res: Response) => {
    const { paystackService } = await import('../services/property-management/payment/paystackService');
    const banks = await paystackService.getBanks('ghana');
    res.json(banks);
}));

/**
 * POST /api/v1/pm/payments/register-account
 * Register or update the organization's bank account for payouts
 */
router.post('/payments/register-account', paymentRateLimit, validate(pmRegisterAccountSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { bankCode, accountNumber, businessName, contactEmail, contactPhone } = req.body;

    if (!bankCode || !accountNumber || !businessName) {
        return res.status(400).json({ error: 'bankCode, accountNumber, and businessName are required' });
    }

    const { paystackService } = await import('../services/property-management/payment/paystackService');
    const result = await paystackService.registerPropertyManagerAccount(
        organizationId, bankCode, accountNumber, businessName, contactEmail, contactPhone, 'property_management'
    );

    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, subaccountCode: result.subaccountCode });
}));

/**
 * POST /api/v1/pm/payments/resolve-account
 * Verify a bank account number (name enquiry)
 */
router.post('/payments/resolve-account', asyncHandler(async (req: Request, res: Response) => {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
        return res.status(400).json({ error: 'accountNumber and bankCode are required' });
    }

    try {
        const { paystackService } = await import('../services/property-management/payment/paystackService');
        const result = await paystackService.resolveAccount(accountNumber, bankCode);
        res.json(result);
    } catch (err: any) {
        const status = err.status || 422;
        res.status(status).json({
            status: false,
            error: err.paystackMessage || err.message || 'Account verification failed',
            meta: err.paystackMeta || undefined
        });
    }
}));

// =====================================================
// CRYPTO WALLET CONFIGURATION
// =====================================================

/**
 * GET /api/v1/pm/payments/crypto-wallet
 * Get current crypto wallet configuration for the PM org
 */
router.get('/payments/crypto-wallet', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const result = await db.query(
        `SELECT crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at
         FROM payment_accounts
         WHERE entity_id = $1 AND entity_type = 'organization' AND service_type = 'property_management' AND is_active = TRUE
         LIMIT 1`,
        [organizationId]
    );

    if (result.rows.length === 0 || !result.rows[0].crypto_wallet_address) {
        return res.json({ configured: false });
    }

    const row = result.rows[0];
    res.json({
        configured: true,
        walletAddress: row.crypto_wallet_address,
        isVerified: row.crypto_wallet_verified || false,
        registeredAt: row.crypto_wallet_registered_at,
    });
}));

/**
 * POST /api/v1/pm/payments/crypto-wallet
 * Save/update crypto wallet address for the PM org
 */
router.post('/payments/crypto-wallet', cryptoRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { walletAddress } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address. Must be a valid Polygon address (0x + 40 hex chars)' });
    }

    const upsertResult = await db.query(`
        INSERT INTO payment_accounts (id, entity_type, entity_id, service_type, crypto_wallet_address, crypto_wallet_registered_at, updated_at, is_active)
        VALUES (gen_random_uuid(), 'organization', $1, 'property_management', $2, NOW(), NOW(), TRUE)
        ON CONFLICT (entity_id, entity_type, service_type) DO UPDATE SET
            crypto_wallet_address = $2,
            crypto_wallet_registered_at = NOW(),
            updated_at = NOW()
        RETURNING id, crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at
    `, [organizationId, walletAddress]);

    const row = upsertResult.rows[0];

    let onChainRegistered = false;
    try {
        const { cryptoPaymentService } = await import('../../shared-services/payments/crypto');
        if (cryptoPaymentService.isConfigured()) {
            await cryptoPaymentService.registerRecipientWallet('organization', organizationId, walletAddress, 'property_management');
            onChainRegistered = true;
            await db.query(`UPDATE payment_accounts SET crypto_wallet_verified = true WHERE id = $1`, [row.id]);
        }
    } catch {
        // On-chain registration is optional
    }

    res.json({
        success: true,
        walletAddress: row.crypto_wallet_address,
        isVerified: onChainRegistered || row.crypto_wallet_verified || false,
        registeredAt: row.crypto_wallet_registered_at,
    });
}));

/**
 * GET /api/v1/pm/payments/settlement-coins
 * Get supported settlement coins for the crypto wallet UI dropdown
 */
router.get('/payments/settlement-coins', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
    const coins = await nowPaymentsService.getSupportedSettlementCoins();
    res.json(coins);
}));

// =====================================================
// CRYPTO REVENUE SUMMARY
// =====================================================

/**
 * GET /api/v1/pm/payments/crypto-revenue
 * Get crypto payment and fee revenue summary for the organization.
 * Shows: total crypto rent received, fees collected, payment breakdown.
 */
router.get('/payments/crypto-revenue', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    // Get all crypto rent payments for this org's tenancies
    const cryptoPayments = await db.query(`
        SELECT
            pt.reference,
            pt.principal_amount,
            pt.service_fee,
            pt.gross_amount,
            pt.created_at,
            pt.metadata->>'tenancy_id' as tenancy_id,
            np.pay_currency,
            np.actually_paid as crypto_amount_paid,
            np.outcome_currency,
            np.outcome_amount
        FROM payment_transactions pt
        LEFT JOIN nowpayments_payments np ON np.payment_reference = pt.reference
        JOIN tenancies t ON t.id = (pt.metadata->>'tenancy_id')::uuid
        WHERE t.organization_id = $1
          AND pt.payment_type = 'rent'
          AND pt.status = 'success'
          AND pt.channel = 'crypto_nowpayments'
        ORDER BY pt.created_at DESC
    `, [organizationId]);

    // Get fee payouts for these payments
    const feePayouts = await db.query(`
        SELECT
            fp.payment_reference,
            fp.fee_amount_ghs,
            fp.status as payout_status,
            fp.payout_address,
            fp.created_at
        FROM nowpayments_fee_payouts fp
        JOIN payment_transactions pt ON pt.reference = fp.payment_reference
        JOIN tenancies t ON t.id = (pt.metadata->>'tenancy_id')::uuid
        WHERE t.organization_id = $1
          AND pt.payment_type = 'rent'
        ORDER BY fp.created_at DESC
    `, [organizationId]);

    // Aggregate stats
    const totalCryptoRentPesewas = cryptoPayments.rows.reduce(
        (sum: number, r: any) => sum + Number(r.principal_amount || 0), 0
    );
    const totalCryptoFeesPesewas = cryptoPayments.rows.reduce(
        (sum: number, r: any) => sum + Number(r.service_fee || 0), 0
    );

    // Fee payout summary
    const totalFeesCollectedGhs = feePayouts.rows.reduce(
        (sum: number, r: any) => sum + Number(r.fee_amount_ghs || 0), 0
    );

    // Settlement currencies (what the PM actually receives, e.g. USDT)
    const currenciesUsed = [...new Set(
        cryptoPayments.rows
            .map((r: any) => r.outcome_currency?.toUpperCase())
            .filter(Boolean)
    )];

    res.json({
        totalCryptoPayments: cryptoPayments.rows.length,
        totalCryptoRentGhs: totalCryptoRentPesewas / 100,
        totalCryptoFeesGhs: totalCryptoFeesPesewas / 100,
        totalFeesCollectedGhs,
        currenciesAccepted: currenciesUsed,
        platformFeeWallet: feePayouts.rows[0]?.payout_address || null,
        payments: cryptoPayments.rows.map((r: any) => ({
            reference: r.reference,
            principalGhs: Number(r.principal_amount || 0) / 100,
            feeGhs: Number(r.service_fee || 0) / 100,
            grossGhs: Number(r.gross_amount || 0) / 100,
            cryptoCurrency: r.pay_currency?.toUpperCase() || null,
            cryptoAmountPaid: r.crypto_amount_paid ? Number(r.crypto_amount_paid) : null,
            settlementCurrency: r.outcome_currency?.toUpperCase() || null,
            settlementAmount: r.outcome_amount ? Number(r.outcome_amount) : null,
            date: r.created_at,
        })),
        feePayouts: feePayouts.rows.map((r: any) => ({
            paymentReference: r.payment_reference,
            feeAmountGhs: Number(r.fee_amount_ghs),
            status: r.payout_status,
            payoutAddress: r.payout_address,
            date: r.created_at,
        })),
    });
}));

/**
 * GET /api/v1/pm/payments/:id
 * Get payment by ID
 */
router.get('/payments/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const payment = await rentCollectionService.getPaymentById(req.params.id, organizationId);
    if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment);
}));

/**
 * GET /api/v1/pm/tenancies/:id/payments
 * Get payment history for a tenancy
 */
router.get('/tenancies/:id/payments', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'payment_date',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    try {
        const result = await rentCollectionService.getPaymentHistory(
            req.params.id,
            organizationId,
            pagination
        );
        res.json(result);
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
}));

/**
 * GET /api/v1/pm/reports/defaulting-tenants
 * Get defaulting tenants
 */
router.get('/reports/defaulting-tenants', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const threshold = parseInt(req.query.threshold as string) || 30;

    const result = await rentCollectionService.getDefaultingTenants(organizationId, threshold);
    res.json(result);
}));

/**
 * GET /api/v1/pm/reports/collection
 * Get rent collection report
 */
router.get('/reports/collection', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const report = await rentCollectionService.getCollectionReport(organizationId, startDate, endDate);
    res.json(report);
}));

/**
 * POST /api/v1/pm/tenancies/:id/invoice
 * Generate rent invoice
 */
router.post('/tenancies/:id/invoice', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) {
        return res.status(400).json({ error: 'periodStart and periodEnd are required' });
    }

    try {
        const invoice = await rentCollectionService.generateInvoice(
            req.params.id,
            organizationId,
            periodStart,
            periodEnd
        );
        res.json(invoice);
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
}));

/**
 * POST /api/v1/pm/tenancies/:id/regenerate-lease
 * Regenerate lease document for an existing tenancy
 */
router.post('/tenancies/:id/regenerate-lease', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    try {
        const { leaseTemplateService } = await import('../services/property-management/leases/leaseTemplateService');
        
        const leaseDoc = await leaseTemplateService.generateLease(organizationId, {
            tenancyId: req.params.id,
            templateId: req.body.templateId,
            format: 'pdf'
        });

        res.json({
            success: true,
            documentId: leaseDoc.documentId,
            documentKey: leaseDoc.documentKey,
            documentUrl: leaseDoc.downloadUrl,
            filename: leaseDoc.filename,
            generatedAt: leaseDoc.generatedAt
        });
    } catch (error: any) {
        if (error.message === 'Tenancy not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

// =====================================================
// WORK ORDER ROUTES
// =====================================================

/**
 * GET /api/v1/pm/work-orders
 * List work orders with pagination and filtering
 */
router.get('/work-orders', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const filters = {
        status: req.query.status as WorkOrderStatus | undefined,
        category: req.query.category as MaintenanceCategory | undefined,
        priority: req.query.priority as Priority | undefined,
        propertyId: req.query.propertyId as string | undefined,
        vendorId: req.query.vendorId as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await workOrderService.getWorkOrders(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * POST /api/v1/pm/work-orders
 * Create a new work order
 */
router.post('/work-orders', validate(pmCreateWorkOrderSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    const workOrder = await workOrderService.createWorkOrder(organizationId, req.body, userId);
    res.status(201).json(workOrder);
}));

/**
 * GET /api/v1/pm/work-orders/:id
 * Get work order by ID
 */
router.get('/work-orders/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const workOrder = await workOrderService.getWorkOrderById(req.params.id, organizationId);
    if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
    }
    res.json(workOrder);
}));

/**
 * PATCH /api/v1/pm/work-orders/:id
 * Update work order
 */
router.patch('/work-orders/:id', validate(pmCreateWorkOrderSchema.partial()), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const workOrder = await workOrderService.updateWorkOrder(req.params.id, organizationId, req.body);
    if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
    }
    res.json(workOrder);
}));

/**
 * POST /api/v1/pm/work-orders/:id/assign
 * Assign work order to vendor
 */
router.post('/work-orders/:id/assign', validate(pmAssignWorkOrderSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const { vendorId } = req.body;
    if (!vendorId) {
        return res.status(400).json({ error: 'vendorId is required' });
    }

    try {
        const workOrder = await workOrderService.assignWorkOrder(
            req.params.id,
            vendorId,
            organizationId
        );
        if (!workOrder) {
            return res.status(404).json({ error: 'Work order not found' });
        }
        res.json(workOrder);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

/**
 * POST /api/v1/pm/work-orders/:id/complete
 * Complete work order
 */
router.post('/work-orders/:id/complete', validate(pmCompleteWorkOrderSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const { actualCost, completionNotes, photosAfter } = req.body;
    if (!actualCost || !completionNotes) {
        return res.status(400).json({ error: 'actualCost and completionNotes are required' });
    }

    const workOrder = await workOrderService.completeWorkOrder(req.params.id, organizationId, {
        actualCost,
        completionNotes,
        photosAfter
    });
    if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
    }
    res.json(workOrder);
}));

/**
 * POST /api/v1/pm/work-orders/:id/approve-budget
 * Approve work order budget
 */
router.post('/work-orders/:id/approve-budget', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    const workOrder = await workOrderService.approveWorkOrderBudget(
        req.params.id,
        organizationId,
        userId
    );
    if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
    }
    res.json(workOrder);
}));

/**
 * GET /api/v1/pm/work-orders/stats
 * Get work order statistics
 */
router.get('/work-orders-stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const stats = await workOrderService.getWorkOrderStats(organizationId);
    res.json(stats);
}));

// =====================================================
// VENDOR ROUTES
// =====================================================

/**
 * GET /api/v1/pm/vendors
 * List vendors
 */
router.get('/vendors', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const filters = {
        category: req.query.category as MaintenanceCategory | undefined,
        status: req.query.status as VendorStatus | undefined,
        search: req.query.search as string | undefined
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await vendorService.listVendors(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * POST /api/v1/pm/vendors
 * Create vendor
 */
router.post('/vendors', validate(pmCreateVendorSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
    }

    const vendorData = {
        ...req.body,
        businessName: req.body.businessName ?? req.body.name,
        contactPerson: req.body.contactPerson ?? req.body.name ?? null,
        phonePrimary: req.body.phonePrimary ?? req.body.phone ?? null,
        serviceCategories: req.body.serviceCategories ?? (req.body.category ? [req.body.category] : []),
    };
    const vendor = await vendorService.createVendor(organizationId, vendorData, userId);
    res.status(201).json(vendor);
}));

/**
 * GET /api/v1/pm/vendors/:id
 * Get vendor by ID
 */
router.get('/vendors/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const vendor = await vendorService.getVendorById(req.params.id, organizationId);
    res.json(vendor);
}));

/**
 * PATCH /api/v1/pm/vendors/:id
 * Update vendor
 */
router.patch('/vendors/:id', validate(pmCreateVendorSchema.partial()), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const vendor = await vendorService.updateVendor(req.params.id, organizationId, req.body);
    res.json(vendor);
}));

/**
 * DELETE /api/v1/pm/vendors/:id
 * Delete vendor
 */
router.delete('/vendors/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    await vendorService.deleteVendor(req.params.id, organizationId);
    res.status(204).send();
}));

// =====================================================
// DOCUMENT ROUTES
// =====================================================

/**
 * POST /api/v1/pm/documents
 * Upload/Record document
 */
router.post('/documents', validate(pmCreateDocumentSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) return res.status(401).json({ error: 'User ID required' });

    // Assuming body contains file metadata. In real app, middleware handles file upload first.
    const doc = await documentService.createDocument(organizationId, req.body, userId);
    res.status(201).json(doc);
}));

/**
 * GET /api/v1/pm/documents/vault
 * Unified document vault — merges uploads, lease docs, and signed leases
 */
router.get('/documents/vault', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        search: req.query.search as string,
        source: (req.query.source as 'upload' | 'lease' | 'signed_lease' | 'all') || 'all',
        category: (req.query.category as 'legal' | 'financial' | 'tenant' | 'all') || 'all',
        propertyId: req.query.propertyId as string,
        tenancyId: req.query.tenancyId as string,
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const result = await documentService.listVaultDocuments(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * GET /api/v1/pm/documents
 * List documents
 */
router.get('/documents', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const filters = {
        propertyId: req.query.propertyId as string,
        tenancyId: req.query.tenancyId as string,
        type: req.query.type as PropertyDocumentType,
        search: req.query.search as string,
        isVerified: req.query.isVerified ? req.query.isVerified === 'true' : undefined
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await documentService.listDocuments(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * POST /api/v1/pm/properties/:id/photos
 * Upload a property photo and record it as a property_photos document
 */
router.post('/properties/:id/photos', propertyPhotoUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const file = req.file;

    if (!userId) return res.status(401).json({ error: 'User ID required' });
    if (!file) return res.status(400).json({ error: 'Image file is required' });
    if (!isSupportedImageBuffer(file)) return res.status(422).json({ error: 'Uploaded file does not match a supported image format' });

    const property = await propertyService.getPropertyById(req.params.id, organizationId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const bucket = buckets.documents || 'propmetrik-documents';
    const fileName = safeStorageFilename(file.originalname);
    const objectKey = `property-management/${organizationId}/properties/${req.params.id}/photos/${Date.now()}_${fileName}`;

    await uploadFile(bucket, objectKey, file.buffer, file.mimetype, {
        propertyId: req.params.id,
        documentType: 'property_photos',
    });

    const doc = await documentService.createDocument(organizationId, {
        propertyId: req.params.id,
        documentType: 'property_photos' as PropertyDocumentType,
        title: req.body.title || fileName,
        fileUrl: `s3://${bucket}/${objectKey}`,
        fileName,
        fileSizeBytes: file.size,
        mimeType: file.mimetype,
    }, userId);

    res.status(201).json(doc);
}));

/**
 * POST /api/v1/pm/documents/:id/verify
 * Verify document
 */
router.post('/documents/:id/verify', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) return res.status(401).json({ error: 'User ID required' });

    const doc = await documentService.verifyDocument(req.params.id, organizationId, userId);
    res.json(doc);
}));

/**
 * DELETE /api/v1/pm/documents/:id
 * Delete document
 */
router.delete('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    await documentService.deleteDocument(req.params.id, organizationId);
    res.status(204).send();
}));

// =====================================================
// FINANCIAL ROUTES
// =====================================================

/**
 * POST /api/v1/pm/financials
 * Record financial transaction
 */
router.post('/financials', validate(pmCreateFinancialSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) return res.status(401).json({ error: 'User ID required' });

    const record = await financialService.createRecord(organizationId, req.body, userId);
    res.status(201).json(record);
}));

/**
 * GET /api/v1/pm/financials
 * List financial records
 */
router.get('/financials', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const filters: FinancialFilters = {
        propertyId: req.query.propertyId as string,
        recordType: req.query.recordType as 'income' | 'expense',
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'transaction_date',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await financialService.listRecords(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * GET /api/v1/pm/financials/cash-flow
 * Get Cash Flow (P&L) Analysis
 */
router.get('/financials/cash-flow', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { propertyId, startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const analysis = await financialService.getCashFlowAnalysis(
        organizationId,
        propertyId as string,
        startDate as string,
        endDate as string
    );
    res.json(analysis);
}));

/**
 * GET /api/v1/pm/financials/roi/:propertyId
 * Get ROI Analysis
 */
router.get('/financials/roi/:propertyId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const analysis = await financialService.calculateROI(organizationId, req.params.propertyId);
    res.json(analysis);
}));

// =====================================================
// PORTFOLIO ROUTES
// =====================================================

/**
 * GET /api/v1/pm/portfolio/overview
 * Get Portfolio Overview Metrics
 */
router.get('/portfolio/overview', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const metrics = await portfolioService.getOverview(organizationId);
    res.json(metrics);
}));

/**
 * GET /api/v1/pm/portfolio/value
 * Get Portfolio Value
 */
router.get('/portfolio/value', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const value = await portfolioService.getPortfolioValue(organizationId);
    res.json(value);
}));

/**
 * GET /api/v1/pm/portfolio/composition
 * Get Portfolio Composition (Type, Region, Status)
 */
router.get('/portfolio/composition', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const composition = await portfolioService.getPortfolioComposition(organizationId);
    res.json(composition);
}));

/**
 * GET /api/v1/pm/portfolio/leases
 * Get Portfolio Lease Summary
 */
router.get('/portfolio/leases', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const summary = await portfolioService.getLeasePortfolioSummary(organizationId);
    res.json(summary);
}));

/**
 * POST /api/v1/pm/payments/initialize
 * Initialize a Paystack transaction
 */
router.post('/payments/initialize', paymentRateLimit, validate(pmInitializePaymentSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const { tenancyId, amount, email, channel, callbackUrl } = req.body;
    if (!tenancyId || !amount || !email) {
        return res.status(400).json({ error: 'tenancyId, amount, and email are required' });
    }

    // Import dynamically to avoid circular dependency issues if any
    const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');

    try {
        const result = await paymentProcessor.initializeRentPayment({
            tenancyId,
            organizationId,
            amount,
            email,
            channel,
            callbackUrl
        });
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

/**
 * POST /api/v1/pm/payments/webhook
 * Paystack Webhook Handler
 */
router.post('/payments/webhook', asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-paystack-signature'] as string;
    if (!signature) {
        return res.status(401).json({ error: 'No signature provided' });
    }

    // Import dynamically
    const { paystackService } = await import('../services/property-management/payment/paystackService');
    const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');

    // Verify signature
    if (!paystackService.verifyWebhookSignature(signature, req.body)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Handle event
    const event = req.body;
    if (event.event === 'charge.success') {
        try {
            await paymentProcessor.verifyAndRecordPayment(event.data.reference);
            // Respond 200 OK to Paystack
            res.status(200).send();
        } catch (error) {
            console.error('Webhook processing failed:', error);
            // Still return 200 to acknowledge receipt, otherwise Paystack retries
            res.status(200).send();
        }
    } else {
        // Ignore other events for now
        res.status(200).send();
    }
}));

// =====================================================
// ENTERPRISE FEATURES: PROPERTY CRUD EXTENSIONS
// =====================================================

const updatePropertyHandler = asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const property = await propertyService.updateProperty(
        req.params.id,
        organizationId,
        req.body,
        userId
    );

    if (!property) {
        return res.status(404).json({ error: 'Property not found' });
    }

    res.json(property);
});

/**
 * PATCH /api/v1/pm/properties/:id
 * Update an existing property
 */
router.patch('/properties/:id', validate(pmCreatePropertySchema.partial()), updatePropertyHandler);

/**
 * PUT /api/v1/pm/properties/:id
 * Compatibility alias for older frontend bundles
 */
router.put('/properties/:id', validate(pmCreatePropertySchema.partial()), updatePropertyHandler);

/**
 * DELETE /api/v1/pm/properties/:id
 * Soft delete a property
 */
router.delete('/properties/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const result = await propertyService.deleteProperty(
        req.params.id,
        organizationId,
        userId
    );

    res.json(result);
}));

// =====================================================
// ENTERPRISE FEATURES: AUDIT TRAIL
// =====================================================

/**
 * GET /api/v1/pm/audit
 * Get audit logs with filtering
 */
router.get('/audit', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { auditTrailService } = await import('../services/property-management/audit/auditTrailService');

    const filters = {
        action: req.query.action as any,
        resource: req.query.resource as any,
        resourceId: req.query.resourceId as string,
        userId: req.query.userId as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        search: req.query.search as string
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50
    };

    const result = await auditTrailService.getLogs(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * GET /api/v1/pm/audit/resource/:resource/:id
 * Get audit history for a specific resource
 */
router.get('/audit/resource/:resource/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { auditTrailService, AuditResource } = await import('../services/property-management/audit/auditTrailService');

    const resource = req.params.resource as keyof typeof AuditResource;
    const result = await auditTrailService.getResourceHistory(
        organizationId,
        AuditResource[resource.toUpperCase() as keyof typeof AuditResource],
        req.params.id
    );

    res.json(result);
}));

/**
 * GET /api/v1/pm/audit/summary
 * Get activity summary for dashboard
 */
router.get('/audit/summary', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { auditTrailService } = await import('../services/property-management/audit/auditTrailService');

    const days = parseInt(req.query.days as string) || 7;
    const result = await auditTrailService.getActivitySummary(organizationId, days);
    res.json(result);
}));

// =====================================================
// ENTERPRISE FEATURES: REPORTING
// =====================================================

/**
 * GET /api/v1/pm/reports/aged-receivables
 * Get aged receivables report
 */
router.get('/reports/aged-receivables', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { reportingService } = await import('../services/property-management/reporting/reportingService');

    const result = await reportingService.getAgedReceivablesReport(organizationId);
    res.json(result);
}));

/**
 * GET /api/v1/pm/reports/vacancy
 * Get vacancy report
 */
router.get('/reports/vacancy', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { reportingService } = await import('../services/property-management/reporting/reportingService');

    const result = await reportingService.getVacancyReport(organizationId);
    res.json(result);
}));

/**
 * GET /api/v1/pm/reports/property-performance
 * Get property performance report
 */
router.get('/reports/property-performance', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { reportingService } = await import('../services/property-management/reporting/reportingService');

    const startDate = req.query.startDate as string || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    const result = await reportingService.getPropertyPerformanceReport(organizationId, startDate, endDate);
    res.json(result);
}));

/**
 * GET /api/v1/pm/reports/tenant-turnover
 * Get tenant turnover report
 */
router.get('/reports/tenant-turnover', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { reportingService } = await import('../services/property-management/reporting/reportingService');

    const startDate = req.query.startDate as string || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    const result = await reportingService.getTenantTurnoverReport(organizationId, startDate, endDate);
    res.json(result);
}));

/**
 * GET /api/v1/pm/reports/maintenance-analytics
 * Get maintenance analytics report
 */
router.get('/reports/maintenance-analytics', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { reportingService } = await import('../services/property-management/reporting/reportingService');

    const startDate = req.query.startDate as string || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    const result = await reportingService.getMaintenanceAnalytics(organizationId, startDate, endDate);
    res.json(result);
}));

// =====================================================
// ENTERPRISE FEATURES: NOTIFICATIONS
// =====================================================

/**
 * POST /api/v1/pm/notifications/rent-reminders
 * Schedule rent reminder notifications
 */
router.post('/notifications/rent-reminders', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { notificationService } = await import('../services/property-management/notifications/notificationService');

    const daysBeforeDue = parseInt(req.body.daysBeforeDue as string) || 3;
    const result = await notificationService.scheduleRentReminders(organizationId, daysBeforeDue);
    res.json({ success: true, scheduled: result });
}));

/**
 * POST /api/v1/pm/notifications/lease-warnings
 * Send lease expiry warnings
 */
router.post('/notifications/lease-warnings', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { notificationService } = await import('../services/property-management/notifications/notificationService');

    const daysUntilExpiry = parseInt(req.body.daysUntilExpiry as string) || 30;
    const result = await notificationService.sendLeaseExpiryWarnings(organizationId, daysUntilExpiry);
    res.json({ success: true, sent: result });
}));

// =====================================================
// ENTERPRISE FEATURES: BULK OPERATIONS
// =====================================================

/**
 * POST /api/v1/pm/bulk/rent-increase
 * Bulk rent increase operation
 */
router.post('/bulk/rent-increase', bulkOpRateLimit, validate(pmBulkRentIncreaseSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { bulkOperationsService } = await import('../services/property-management/bulk/bulkOperationsService');

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const result = await bulkOperationsService.bulkRentIncrease(organizationId, userId, {
        tenancyIds: req.body.tenancyIds,
        propertyIds: req.body.propertyIds,
        increaseType: req.body.increaseType,
        increaseValue: req.body.increaseValue,
        effectiveDate: req.body.effectiveDate,
        notifyTenants: req.body.notifyTenants || false,
        reason: req.body.reason
    });

    res.json(result);
}));

/**
 * POST /api/v1/pm/bulk/work-orders
 * Bulk create work orders
 */
router.post('/bulk/work-orders', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { bulkOperationsService } = await import('../services/property-management/bulk/bulkOperationsService');

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const result = await bulkOperationsService.bulkCreateWorkOrders(organizationId, userId, {
        propertyId: req.body.propertyId,
        unitIds: req.body.unitIds,
        category: req.body.category,
        priority: req.body.priority,
        title: req.body.title,
        description: req.body.description,
        vendorId: req.body.vendorId,
        scheduledDate: req.body.scheduledDate
    });

    res.json(result);
}));

/**
 * POST /api/v1/pm/bulk/status-update
 * Bulk status update for resources
 */
router.post('/bulk/status-update', bulkOpRateLimit, validate(pmBulkStatusUpdateSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { bulkOperationsService } = await import('../services/property-management/bulk/bulkOperationsService');

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const result = await bulkOperationsService.bulkStatusUpdate(organizationId, userId, {
        resource: req.body.resource,
        ids: req.body.ids,
        status: req.body.status
    });

    res.json(result);
}));

/**
 * POST /api/v1/pm/bulk/import
 * Bulk import data from CSV/JSON
 */
router.post('/bulk/import', bulkOpRateLimit, validate(pmBulkImportSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { bulkOperationsService } = await import('../services/property-management/bulk/bulkOperationsService');

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const result = await bulkOperationsService.importData(organizationId, userId, {
        type: req.body.type,
        data: req.body.data,
        validateOnly: req.body.validateOnly || false
    });

    res.json(result);
}));

/**
 * GET /api/v1/pm/bulk/export/:type
 * Export data to CSV format
 */
router.get('/bulk/export/:type', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { bulkOperationsService } = await import('../services/property-management/bulk/bulkOperationsService');

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const type = req.params.type as 'properties' | 'tenants' | 'tenancies' | 'payments' | 'work-orders';
    const result = await bulkOperationsService.exportData(organizationId, userId, type);

    // Set response headers for CSV download if requested
    if (req.query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${type}-export.csv`);

        // Convert to CSV
        const header = result.columns.join(',');
        const rows = result.data.map(row =>
            result.columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
                return val;
            }).join(',')
        );
        
        res.send([header, ...rows].join('\n'));
    } else {
        res.json(result);
    }
}));

// =====================================================
// LEASE SIGNING (E-Sign Integration)
// =====================================================

/**
 * POST /api/v1/pm/leases/:tenancyId/generate-document
 * Generate a lease PDF document from tenancy data
 */
router.post('/leases/:tenancyId/generate-document', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { tenancyId } = req.params;
    const { landlordInfo } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    // Get tenancy with property and tenant details
    const tenancy = await tenancyService.getTenancyById(tenancyId, organizationId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // For now, return the data needed to generate the lease on frontend
    // In production, we'd generate PDF server-side using a template engine
    res.json({
        success: true,
        data: {
            tenancy,
            landlordInfo,
            generatedAt: new Date().toISOString()
        }
    });
}));

/**
 * POST /api/v1/pm/leases/:tenancyId/request-signatures
 * Create a signing request for the lease document
 */
router.post('/leases/:tenancyId/request-signatures', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { tenancyId } = req.params;
    const { pdfUrl, signatureFields, landlordInfo } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    // Get tenancy with tenant details
    const tenancy = await tenancyService.getTenancyById(tenancyId, organizationId);
    if (!tenancy) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Import e-sign service
    const { signingService } = await import('../../shared-services/e-sign');

    // Create signing request
    const signingRequest = await signingService.createSigningRequest(
        {
            documentId: tenancyId,
            documentType: 'tenancy_agreement',
            documentTitle: `Tenancy Agreement - ${tenancy.property?.title || 'Property'}`,
            originalPdfUrl: pdfUrl,
            signees: [
                // Landlord (internal user)
                {
                    signeeType: 'internal',
                    userId: userId,
                    signingOrder: 1,
                    signeeRole: 'Landlord'
                },
                // Tenant (external signee)
                {
                    signeeType: 'external',
                    externalName: tenancy.tenant?.fullName || 'Tenant',
                    externalEmail: tenancy.tenant?.email || undefined,
                    externalPhone: tenancy.tenant?.phonePrimary || undefined,
                    signingOrder: 2,
                    signeeRole: 'Tenant'
                }
            ]
        },
        userId,
        organizationId
    );

    res.status(201).json({
        success: true,
        data: signingRequest
    });
}));

/**
 * GET /api/v1/pm/leases/:tenancyId/signing-status
 * Get the signing status for a lease
 */
router.get('/leases/:tenancyId/signing-status', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { tenancyId } = req.params;

    // Import e-sign service
    const { signingService } = await import('../../shared-services/e-sign');

    // Get signing requests for this tenancy
    // Note: signing_requests table may not exist if legacy e-sign schema was dropped (migration 126)
    let requests: any[] = [];
    try {
        requests = await signingService.getSigningRequestsByDocument(tenancyId, 'tenancy_agreement');
    } catch (err: any) {
        // Legacy table may have been removed — return empty list gracefully
        console.warn('signing_requests table unavailable, returning empty list', { tenancyId, error: err.message });
    }

    res.json({
        success: true,
        data: requests
    });
}));

/**
 * POST /api/v1/pm/leases/:id/sign
 * Submit a signature for a lease document
 * This endpoint handles both legacy lease IDs and application-based lease IDs
 */
router.post('/leases/:id/sign', validate(pmSignLeaseSchema), asyncHandler(async (req: Request, res: Response) => {
    const leaseId = req.params.id;
    const { signatureDataUrl, signerToken, fieldId } = req.body;

    if (!signatureDataUrl) {
        return res.status(400).json({ error: 'Signature data is required' });
    }

    // Extract application ID if the leaseId is in format "lease-{applicationId}"
    let applicationId = leaseId;
    if (leaseId.startsWith('lease-')) {
        applicationId = leaseId.replace('lease-', '');
    }

    // Find the envelope for this application
    const appResult = await db.query(
        `SELECT envelope_id FROM applications WHERE id = $1`,
        [applicationId]
    );

    if (appResult.rows.length === 0 || !appResult.rows[0].envelope_id) {
        return res.status(404).json({ 
            error: 'No e-sign envelope found for this lease. Please use the signing link from your email.' 
        });
    }

    const envelopeId = appResult.rows[0].envelope_id;

    // If we have a signerToken and fieldId, use e-sign service directly
    if (signerToken && fieldId) {
        // Import e-sign routes handler
        // For now, redirect to the e-sign endpoint
        return res.status(400).json({
            error: 'Please use the e-sign service directly',
            redirectTo: `/api/v1/esign/sign/${signerToken}`,
            envelopeId
        });
    }

    // Otherwise, try to find the tenant's signer and signature field
    const signerResult = await db.query(
        `SELECT s.id, s.access_token, f.id as field_id
         FROM esign_signers s
         JOIN esign_fields f ON f.signer_id = s.id AND f.field_type = 'signature'
         WHERE s.envelope_id = $1
         AND s.name != 'Property Owner'
         AND f.value IS NULL
         LIMIT 1`,
        [envelopeId]
    );

    if (signerResult.rows.length === 0) {
        return res.status(400).json({ 
            error: 'No pending signature field found. The lease may already be signed.' 
        });
    }

    const signer = signerResult.rows[0];

    // Generate signature hash
    let signatureHash;
    try {
        const { createHash } = require('crypto');
        signatureHash = createHash('sha256')
            .update(signatureDataUrl)
            .digest('hex')
            .substring(0, 16);
    } catch (hashError) {
        console.error('Error generating hash:', hashError);
        // Fallback or rethrow
        signatureHash = 'hash-gen-failed-' + Date.now();
    }

    // Update the signature field
    await db.query(
        `UPDATE esign_fields
         SET value = $1, signed_at = NOW(), signature_hash = $2, updated_at = NOW()
         WHERE id = $3`,
        [signatureDataUrl, signatureHash, signer.field_id]
    );

    // Update signer status
    await db.query(
        `UPDATE esign_signers
         SET status = 'signed', signed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [signer.id]
    );

    // Check if all signers have signed
    const pendingResult = await db.query(
        `SELECT COUNT(*) as pending FROM esign_signers
         WHERE envelope_id = $1 AND status != 'signed'`,
        [envelopeId]
    );

    if (parseInt(pendingResult.rows[0].pending) === 0) {
        // All signed - update envelope status
        await db.query(
            `UPDATE esign_envelopes
             SET status = 'completed', completed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [envelopeId]
        );
    }

    res.json({
        success: true,
        signatureHash,
        signerId: signer.id,
        message: 'Signature submitted successfully'
    });
}));

// =====================================================
// APPLICATION ROUTES
// =====================================================

import { applicationService, ApplicationStatus, StateMachineError } from '../services/property-management/applications/applicationService';

/**
 * GET /api/v1/pm/applications
 * List applications with pagination and filtering
 */
router.get('/applications', clampPagination, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        status: req.query.status as ApplicationStatus | undefined,
        propertyId: req.query.propertyId as string | undefined,
        applicantEmail: req.query.applicantEmail as string | undefined,
        search: req.query.search as string | undefined,
        submittedAfter: req.query.submittedAfter as string | undefined,
        submittedBefore: req.query.submittedBefore as string | undefined
    };

    const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await applicationService.getApplications(organizationId, filters, pagination);
    res.json(result);
}));

/**
 * GET /api/v1/pm/applications/stats
 * Get application statistics
 */
router.get('/applications/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const stats = await applicationService.getApplicationStats(organizationId);
    res.json(stats);
}));

/**
 * POST /api/v1/pm/applications
 * Create a new application (internal)
 */
router.post('/applications', validate(pmCreateApplicationSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const application = await applicationService.createApplication(organizationId, req.body, userId);
    res.status(201).json(application);
}));

/**
 * GET /api/v1/pm/applications/:id
 * Get application by ID
 */
router.get('/applications/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const application = await applicationService.getApplicationById(req.params.id, organizationId);
    if (!application) {
        return res.status(404).json({ error: 'Application not found' });
    }
    res.json(application);
}));

/**
 * PATCH /api/v1/pm/applications/:id
 * Update application (only in draft status)
 */
router.patch('/applications/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    try {
        const application = await applicationService.updateApplication(req.params.id, organizationId, req.body);
        res.json(application);
    } catch (error: any) {
        if (error.message.includes('draft status')) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * DELETE /api/v1/pm/applications/:id
 * Soft delete application
 */
router.delete('/applications/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    await applicationService.deleteApplication(req.params.id, organizationId);
    res.status(204).send();
}));

/**
 * GET /api/v1/pm/applications/:id/history
 * Get application status history
 */
router.get('/applications/:id/history', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    try {
        const history = await applicationService.getApplicationHistory(req.params.id, organizationId);
        res.json(history);
    } catch (error: any) {
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/submit
 * Submit an application
 */
router.post('/applications/:id/submit', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    try {
        const application = await applicationService.submitApplication(req.params.id, organizationId);
        res.json(application);
    } catch (error: any) {
        if (error instanceof StateMachineError) {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/start-review
 * Start reviewing an application
 */
router.post('/applications/:id/start-review', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const application = await applicationService.startReview(req.params.id, organizationId, userId);
        res.json(application);
    } catch (error: any) {
        if (error instanceof StateMachineError) {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/approve
 * Approve an application
 */
router.post('/applications/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const { notes } = req.body;
        const application = await applicationService.approveApplication(req.params.id, organizationId, userId, notes);
        res.json(application);
    } catch (error: any) {
        if (error instanceof StateMachineError) {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/reject
 * Reject an application
 */
router.post('/applications/:id/reject', validate(pmRejectApplicationSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    const { reason } = req.body;
    if (!reason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
    }

    try {
        const application = await applicationService.rejectApplication(req.params.id, organizationId, userId, reason);
        res.json(application);
    } catch (error: any) {
        if (error instanceof StateMachineError) {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * GET /api/v1/pm/applications/:id/lease
 * Get lease details for tenant portal - returns e-sign envelope data if available
 * Requires either: authenticated session OR valid ?token query param matching a signer access_token
 */
router.get('/applications/:id/lease', asyncHandler(async (req: Request, res: Response) => {
    const applicationId = req.params.id;
    const queryToken = req.query.token as string | undefined;
    const isAuthenticated = !!(req as any).user?.sub;
    const isDevMode = config.app.env === 'development';

    // Fast-reject: no auth AND no token → 401 immediately (no DB queries)
    // In dev mode, allow access without auth (consistent with other PM endpoints)
    if (!isAuthenticated && !queryToken && !isDevMode) {
        return res.status(401).json({ error: 'Authentication required. Pass ?token=<signerToken> or sign in.' });
    }

    // First, try to find the application
    const appResult = await db.query(
        `SELECT a.id, a.status,
                a.applicant_full_name, a.applicant_email,
                p.title as property_title, p.address_street
         FROM applications a
         LEFT JOIN properties p ON p.id = a.property_id
         WHERE a.id = $1`,
        [applicationId]
    );

    if (appResult.rows.length === 0) {
        return res.status(404).json({ error: 'Application not found' });
    }

    const application = appResult.rows[0];
    
    // If no envelope, return basic info
    if (!application.envelope_id) {
        return res.status(404).json({ 
            error: 'No lease envelope found for this application',
            hasLease: false
        });
    }

    // Token-based access control: require auth or valid signer token (skip in dev mode)
    if (!isAuthenticated && !isDevMode) {
        if (!queryToken) {
            return res.status(401).json({ error: 'Authentication required. Pass ?token=<signerToken> or sign in.' });
        }
        // Verify the token matches a signer on this envelope
        const tokenCheck = await db.query(
            `SELECT id FROM esign_signers WHERE envelope_id = $1 AND access_token = $2`,
            [application.envelope_id, queryToken]
        );
        if (tokenCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Invalid or expired access token' });
        }
    }

    // Get the e-sign envelope with signer info
    const envelopeResult = await db.query(
        `SELECT e.id, e.name, e.status, e.document_html, e.document_image_url,
                e.created_at
         FROM esign_envelopes e
         WHERE e.id = $1`,
        [application.envelope_id]
    );

    if (envelopeResult.rows.length === 0) {
        return res.status(404).json({ error: 'Lease envelope not found' });
    }

    const envelope = envelopeResult.rows[0];

    // Get the tenant signer (usually SIGNER_2 for tenant)
    const signersResult = await db.query(
        `SELECT id, name, email, role, status, access_token, permanent_signer_id
         FROM esign_signers
         WHERE envelope_id = $1
         ORDER BY role`,
        [application.envelope_id]
    );

    // Find tenant signer (not Property Owner)
    const tenantSigner = signersResult.rows.find((s: any) => 
        s.name?.toLowerCase() !== 'property owner' && s.role !== 'SIGNER_1'
    ) || signersResult.rows[1] || signersResult.rows[0];

    // Get signature fields for this signer
    const fieldsResult = await db.query(
        `SELECT id, field_type, signer_id, page, x_position, y_position,
                width, height, value, signed_at, signature_hash
         FROM esign_fields
         WHERE envelope_id = $1 AND signer_id = $2`,
        [application.envelope_id, tenantSigner?.id]
    );

    // Build the response
    res.json({
        id: envelope.id,
        applicationId,
        envelopeId: envelope.id,
        content: envelope.document_html || '',
        documentUrl: envelope.document_image_url,
        status: envelope.status,
        terms: {},
        hasSigned: fieldsResult.rows.some((f: any) => f.value != null),
        tenantName: tenantSigner?.name || application.applicant_full_name,
        signerToken: tenantSigner?.access_token,
        signerId: tenantSigner?.id,
        fields: fieldsResult.rows.map((f: any) => ({
            id: f.id,
            fieldType: f.field_type,
            type: f.field_type,
            signerId: f.signer_id,
            page: f.page,
            x: f.x_position,
            y: f.y_position,
            width: f.width,
            height: f.height,
            value: f.value,
            signedAt: f.signed_at,
            signatureHash: f.signature_hash
        }))
    });
}));

/**
 * POST /api/v1/pm/applications/:id/send-lease
 * Mark lease as sent to applicant for signature
 */
router.post('/applications/:id/send-lease', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const application = await applicationService.sendLease(
            req.params.id, 
            organizationId, 
            userId,
            req.body.leaseData
        );
        res.json(application);
    } catch (error: any) {
        if (error instanceof StateMachineError) {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/generate-lease-document
 * Generate lease document (PDF) without sending to e-sign
 * Returns document URL and signer info for frontend to redirect to e-sign wizard
 */
router.post('/applications/:id/generate-lease-document', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const result = await applicationService.generateLeaseDocument(
            req.params.id, 
            organizationId, 
            userId,
            req.body
        );
        res.json(result);
    } catch (error: any) {
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('must be approved') || 
            error.message.includes('required') || 
            error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/withdraw
 * Withdraw an application
 */
router.post('/applications/:id/withdraw', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    try {
        const application = await applicationService.withdrawApplication(req.params.id, organizationId);
        res.json(application);
    } catch (error: any) {
        if (error instanceof StateMachineError) {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/convert-to-tenant
 * Convert approved application to tenant and tenancy
 */
router.post('/applications/:id/convert-to-tenant', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const result = await applicationService.convertToTenant(req.params.id, organizationId, userId);
        res.json(result);
    } catch (error: any) {
        if (error.message.includes('approved applications')) {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * POST /api/v1/pm/applications/:id/documents
 * Add a document to an application
 */
router.post('/applications/:id/documents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { type, url, filename } = req.body;
    if (!type || !url) {
        return res.status(400).json({ error: 'Document type and url are required' });
    }

    try {
        const application = await applicationService.addDocument(req.params.id, organizationId, {
            type,
            url,
            filename,
            uploadedAt: new Date().toISOString()
        });
        res.json(application);
    } catch (error: any) {
        if (error.message === 'Application not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

// =====================================================
// APPLICATION LINKS ROUTES
// =====================================================

/**
 * GET /api/v1/pm/application-links
 * List application links for organization
 */
router.get('/application-links', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const propertyId = req.query.propertyId as string | undefined;
    const links = await applicationService.getApplicationLinks(organizationId, propertyId);
    res.json(links);
}));

/**
 * POST /api/v1/pm/application-links
 * Create a new application link
 */
router.post('/application-links', validate(pmCreateApplicationLinkSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    const { propertyId, applicationType, maxUses, expiresInDays } = req.body;
    if (!propertyId) {
        return res.status(400).json({ error: 'Property ID is required' });
    }

    const link = await applicationService.createApplicationLink(
        organizationId,
        { propertyId, applicationType, maxUses, expiresInDays },
        userId
    );
    res.status(201).json(link);
}));

/**
 * DELETE /api/v1/pm/application-links/:id
 * Deactivate an application link
 */
router.delete('/application-links/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const link = await applicationService.deactivateApplicationLink(req.params.id, organizationId, userId);
        res.json(link);
    } catch (error: any) {
        if (error.message === 'Application link not found') {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * GET /api/v1/pm/application-links/:token/validate
 * Validate an application link token (public)
 */
router.get('/application-links/:token/validate', asyncHandler(async (req: Request, res: Response) => {
    const result = await applicationService.validateApplicationLink(req.params.token);
    res.json(result);
}));

/**
 * POST /api/v1/pm/application-links/:token/apply
 * Submit an application via application link token (public - no auth required)
 * This is the endpoint tenants use when submitting from the Tenant Portal
 */
router.post('/application-links/:token/apply', asyncHandler(async (req: Request, res: Response) => {
    try {
        const application = await applicationService.createApplicationFromLink(req.params.token, req.body);
        res.status(201).json(application);
    } catch (error: any) {
        if (error.message === 'Invalid or expired application link') {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}));

/**
 * GET /api/v1/pm/applications/public/:token
 * Get application status by application token (public - for tenant status tracking)
 */
router.get('/applications/public/:token', asyncHandler(async (req: Request, res: Response) => {
    const application = await applicationService.getApplicationByToken(req.params.token);
    if (!application) {
        return res.status(404).json({ error: 'Application not found or token expired' });
    }
    res.json(application);
}));

// =====================================================
// LEASE TEMPLATES
// =====================================================

import { leaseTemplateService } from '../services/property-management/leases/leaseTemplateService';

/**
 * GET /api/v1/pm/lease-templates
 * List all lease templates for organization
 */
router.get('/lease-templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const { category, activeOnly, limit, offset } = req.query;
    const result = await leaseTemplateService.listTemplates(organizationId, {
        category: category as string,
        activeOnly: activeOnly !== 'false',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
    });
    res.json(result);
}));

/**
 * GET /api/v1/pm/lease-templates/:id
 * Get a specific lease template
 */
router.get('/lease-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const template = await leaseTemplateService.getTemplate(req.params.id, organizationId);
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
}));

/**
 * POST /api/v1/pm/lease-templates
 * Create a new lease template
 */
router.post('/lease-templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || !userId) return res.status(401).json({ error: 'Auth required' });
    const template = await leaseTemplateService.createTemplate(
        organizationId,
        req.body,
        userId
    );
    res.status(201).json(template);
}));

/**
 * PATCH /api/v1/pm/lease-templates/:id
 * Update a lease template
 */
router.patch('/lease-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const template = await leaseTemplateService.updateTemplate(
        req.params.id,
        organizationId,
        req.body
    );
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
}));

/**
 * DELETE /api/v1/pm/lease-templates/:id
 * Delete (soft) a lease template
 */
router.delete('/lease-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const deleted = await leaseTemplateService.deleteTemplate(req.params.id, organizationId);
    if (!deleted) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.status(204).send();
}));

/**
 * POST /api/v1/pm/lease-templates/:id/preview
 * Preview a template with sample data
 */
router.post('/lease-templates/:id/preview', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const html = await leaseTemplateService.previewTemplate(
        req.params.id,
        organizationId,
        req.body.sampleData
    );
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}));

/**
 * POST /api/v1/pm/lease-documents/generate
 * Generate a lease document for a tenancy
 */
router.post('/lease-documents/generate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const { tenancyId, templateId, additionalData, format } = req.body;
    
    if (!tenancyId) {
        return res.status(400).json({ error: 'tenancyId is required' });
    }

    const result = await leaseTemplateService.generateLease(organizationId, {
        tenancyId,
        templateId,
        additionalData,
        format
    });
    
    res.status(201).json(result);
}));

// =====================================================
// ADVANCED FINANCIAL REPORTS
// =====================================================

/**
 * GET /api/v1/pm/financials/noi/:propertyId
 * Calculate Net Operating Income for a property
 */
router.get('/financials/noi/:propertyId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const { startDate, endDate } = req.query;
    
    // Default to last 12 months
    const end = endDate as string || new Date().toISOString().split('T')[0];
    const start = startDate as string || (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0];
    })();
    
    const noi = await advancedFinancialService.calculateNOI(
        organizationId,
        req.params.propertyId,
        start,
        end
    );
    
    res.json(noi);
}));

/**
 * GET /api/v1/pm/financials/cap-rate/:propertyId
 * Calculate Cap Rate for a property
 */
router.get('/financials/cap-rate/:propertyId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const marketValue = req.query.marketValue ? parseFloat(req.query.marketValue as string) : undefined;
    
    const capRate = await advancedFinancialService.calculateCapRate(
        organizationId,
        req.params.propertyId,
        marketValue
    );
    
    res.json(capRate);
}));

/**
 * GET /api/v1/pm/financials/irr/:propertyId
 * Calculate Internal Rate of Return for a property
 */
router.get('/financials/irr/:propertyId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const holdingPeriod = req.query.holdingPeriod ? parseInt(req.query.holdingPeriod as string) : 5;
    const discountRate = req.query.discountRate ? parseFloat(req.query.discountRate as string) : 10;
    
    const irr = await advancedFinancialService.calculateIRR(
        organizationId,
        req.params.propertyId,
        holdingPeriod,
        discountRate
    );
    
    res.json(irr);
}));

/**
 * POST /api/v1/pm/financials/cash-on-cash/:propertyId
 * Calculate Cash-on-Cash Return with investment details
 */
router.post('/financials/cash-on-cash/:propertyId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const { downPayment, closingCosts, renovationCosts, annualDebtService, year } = req.body;
    
    if (downPayment === undefined) {
        return res.status(400).json({ error: 'downPayment is required' });
    }
    
    const cashOnCash = await advancedFinancialService.calculateCashOnCash(
        organizationId,
        req.params.propertyId,
        {
            downPayment,
            closingCosts: closingCosts || 0,
            renovationCosts: renovationCosts || 0,
            annualDebtService: annualDebtService || 0
        },
        year
    );
    
    res.json(cashOnCash);
}));

/**
 * GET /api/v1/pm/financials/dscr/:propertyId
 * Calculate Debt Service Coverage Ratio
 */
router.get('/financials/dscr/:propertyId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const annualDebtService = req.query.annualDebtService 
        ? parseFloat(req.query.annualDebtService as string) 
        : 0;
    
    if (req.query.annualDebtService !== undefined && isNaN(annualDebtService)) {
        return res.status(400).json({ error: 'annualDebtService must be a valid number' });
    }
    
    if (annualDebtService === 0) {
        // No debt service means infinite coverage — return a clear response
        const now = new Date();
        const yearStart = `${now.getFullYear()}-01-01`;
        const yearEnd = `${now.getFullYear()}-12-31`;
        const noi = await advancedFinancialService.calculateNOI(
            organizationId,
            req.params.propertyId,
            yearStart,
            yearEnd
        );
        return res.json({
            dscr: null,
            dscrFormatted: 'N/A (No Debt)',
            noi: noi?.netOperatingIncome ?? 0,
            annualDebtService: 0,
            interpretation: 'No debt service — property is debt-free',
            riskLevel: 'low'
        });
    }
    
    const dscr = await advancedFinancialService.calculateDSCR(
        organizationId,
        req.params.propertyId,
        annualDebtService
    );
    
    res.json(dscr);
}));

/**
 * GET /api/v1/pm/financials/summary/:propertyId
 * Get comprehensive financial summary for a property
 */
router.get('/financials/summary/:propertyId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const investmentDetails = req.query.downPayment ? {
        downPayment: parseFloat(req.query.downPayment as string),
        closingCosts: parseFloat(req.query.closingCosts as string || '0'),
        renovationCosts: parseFloat(req.query.renovationCosts as string || '0'),
        annualDebtService: parseFloat(req.query.annualDebtService as string || '0')
    } : undefined;
    
    const summary = await advancedFinancialService.getPropertyFinancialSummary(
        organizationId,
        req.params.propertyId,
        investmentDetails
    );
    
    res.json(summary);
}));

/**
 * GET /api/v1/pm/financials/portfolio-summary
 * Get portfolio-level financial summary
 */
router.get('/financials/portfolio-summary', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization not found' });
    const summary = await advancedFinancialService.getPortfolioFinancialSummary(organizationId);
    res.json(summary);
}));

// =====================================================
// ERROR HANDLER
// =====================================================
// TENANT MESSAGES — LANDLORD SIDE
// =====================================================

/**
 * GET /api/v1/pm/tenant-messages/conversations
 * List all tenant conversations for the landlord's organization
 */
router.get('/tenant-messages/conversations', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const result = await db.query(
        `SELECT c.*,
            t.full_name AS tenant_name,
            t.email AS tenant_email,
            tn.tenant_id,
            p.title AS property_title,
            (SELECT content FROM tenant_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
         FROM tenant_conversations c
         LEFT JOIN tenancies tn ON tn.id = c.tenancy_id
         LEFT JOIN tenants t ON t.id = tn.tenant_id
         LEFT JOIN properties p ON p.id = tn.property_id
         WHERE c.organization_id = $1 AND c.is_archived = FALSE
         ORDER BY c.last_message_at DESC NULLS LAST`,
        [organizationId]
    );

    res.json({
        conversations: result.rows.map((r: any) => ({
            id: r.id,
            tenancyId: r.tenancy_id,
            tenantId: r.tenant_id,
            tenantName: r.tenant_name,
            tenantEmail: r.tenant_email,
            propertyTitle: r.property_title,
            subject: r.subject,
            status: 'active',
            lastMessage: r.last_message,
            lastMessageAt: r.last_message_at,
            unreadCount: r.landlord_unread_count || 0,
            createdAt: r.created_at,
        }))
    });
}));

/**
 * GET /api/v1/pm/tenant-messages/conversations/:conversationId/messages
 * Get messages in a conversation (landlord view)
 */
router.get('/tenant-messages/conversations/:conversationId/messages', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { conversationId } = req.params;

    // Verify conversation belongs to this organization
    const convCheck = await db.query(
        `SELECT * FROM tenant_conversations WHERE id = $1 AND organization_id = $2`,
        [conversationId, organizationId]
    );
    if (convCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await db.query(
        `SELECT * FROM tenant_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [conversationId]
    );

    // Mark landlord-side as read
    await db.query(
        `UPDATE tenant_conversations SET landlord_unread_count = 0 WHERE id = $1`,
        [conversationId]
    );
    await db.query(
        `UPDATE tenant_messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_type = 'tenant'`,
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
            createdAt: r.created_at,
        }))
    });
}));

/**
 * POST /api/v1/pm/tenant-messages/conversations/:conversationId/messages
 * Send a message as landlord
 */
router.post('/tenant-messages/conversations/:conversationId/messages', validate(pmSendMessageSchema), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = (req as any).user?.id || req.headers['x-user-id'] as string || 'system';
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
    }

    // Verify conversation belongs to this organization
    const convCheck = await db.query(
        `SELECT * FROM tenant_conversations WHERE id = $1 AND organization_id = $2`,
        [conversationId, organizationId]
    );
    if (convCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await db.query(
        `INSERT INTO tenant_messages (conversation_id, sender_type, sender_id, content)
         VALUES ($1, 'landlord', $2, $3)
         RETURNING *`,
        [conversationId, userId, content]
    );

    // Update conversation timestamps and tenant unread count
    await db.query(
        `UPDATE tenant_conversations
         SET last_message_at = NOW(), tenant_unread_count = tenant_unread_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [conversationId]
    );

    const msg = result.rows[0];
    res.json({
        success: true,
        message: {
            id: msg.id,
            senderType: msg.sender_type,
            senderId: msg.sender_id,
            content: msg.content,
            isRead: msg.is_read,
            createdAt: msg.created_at,
        }
    });
}));

// =====================================================

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Delegate to the global error handler which properly handles
    // ValidationError (400), AppError subclasses, ZodError, etc.
    next(err);
});

export default router;
