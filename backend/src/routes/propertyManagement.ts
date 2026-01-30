/**
 * Property Management API Routes
 * Phase 4.4: API endpoints for Property Management module
 * 
 * Base path: /api/v1/pm
 * 
 * @module routes/propertyManagement
 */

import { Router, Request, Response, NextFunction } from 'express';
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

const router = Router();

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
router.post('/properties', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/tenants', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/tenants', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const tenant = await tenantService.createTenant(organizationId, req.body, userId);
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
router.patch('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/tenancies', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/tenancies', asyncHandler(async (req: Request, res: Response) => {
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
router.patch('/tenancies/:id', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/tenancies/:id/terminate', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/tenancies/:id/renew', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/payments', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    try {
        const payment = await rentCollectionService.recordPayment(organizationId, req.body, userId);
        res.status(201).json(payment);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
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
router.get('/tenancies/:id/payments', asyncHandler(async (req: Request, res: Response) => {
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

// =====================================================
// WORK ORDER ROUTES
// =====================================================

/**
 * GET /api/v1/pm/work-orders
 * List work orders with pagination and filtering
 */
router.get('/work-orders', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/work-orders', asyncHandler(async (req: Request, res: Response) => {
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
router.patch('/work-orders/:id', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/work-orders/:id/assign', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/work-orders/:id/complete', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/vendors', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/vendors', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
    }

    const vendor = await vendorService.createVendor(organizationId, req.body, userId);
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
router.patch('/vendors/:id', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/documents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!userId) return res.status(401).json({ error: 'User ID required' });

    // Assuming body contains file metadata. In real app, middleware handles file upload first.
    const doc = await documentService.createDocument(organizationId, req.body, userId);
    res.status(201).json(doc);
}));

/**
 * GET /api/v1/pm/documents
 * List documents
 */
router.get('/documents', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/financials', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/financials', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/payments/initialize', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const { tenancyId, amount, email, channel, callbackUrl } = req.body;
    if (!tenancyId || !amount || !email) {
        return res.status(400).json({ error: 'tenancyId, amount, and email are required' });
    }

    // Import dynamically to avoid circular dependency issues if any
    const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');

    try {
        const result = await paymentProcessor.initializeRentPayment(
            tenancyId,
            organizationId,
            amount,
            email,
            channel,
            callbackUrl
        );
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

/**
 * PATCH /api/v1/pm/properties/:id
 * Update an existing property
 */
router.patch('/properties/:id', asyncHandler(async (req: Request, res: Response) => {
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
}));

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
router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/bulk/rent-increase', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/bulk/status-update', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/bulk/import', asyncHandler(async (req: Request, res: Response) => {
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
    const requests = await signingService.getSigningRequestsByDocument(tenancyId, 'tenancy_agreement');

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
router.post('/leases/:id/sign', asyncHandler(async (req: Request, res: Response) => {
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
        `SELECT envelope_id FROM pm_rental_applications WHERE id = $1`,
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
router.get('/applications', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/applications', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/applications/:id/reject', asyncHandler(async (req: Request, res: Response) => {
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
 */
router.get('/applications/:id/lease', asyncHandler(async (req: Request, res: Response) => {
    const applicationId = req.params.id;

    // First, try to find the application (public access for tenants)
    const appResult = await db.query(
        `SELECT a.id, a.status, a.envelope_id, a.applicant_data,
                p.title as property_title, p.address_street
         FROM pm_rental_applications a
         LEFT JOIN pm_properties p ON p.id = a.property_id
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

    // Get the e-sign envelope with signer info
    const envelopeResult = await db.query(
        `SELECT e.id, e.name, e.status, e.document_html, e.document_image,
                e.metadata, e.created_at
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
        documentUrl: envelope.document_image,
        status: envelope.status,
        terms: envelope.metadata || {},
        hasSigned: fieldsResult.rows.some((f: any) => f.value != null),
        tenantName: tenantSigner?.name || application.applicant_data?.fullName,
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
router.post('/application-links', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/lease-templates', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { category, activeOnly, limit, offset } = req.query;
    const result = await leaseTemplateService.listTemplates(req.organizationId!, {
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
router.get('/lease-templates/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const template = await leaseTemplateService.getTemplate(req.params.id, req.organizationId!);
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
}));

/**
 * POST /api/v1/pm/lease-templates
 * Create a new lease template
 */
router.post('/lease-templates', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const template = await leaseTemplateService.createTemplate(
        req.organizationId!,
        req.body,
        req.userId!
    );
    res.status(201).json(template);
}));

/**
 * PATCH /api/v1/pm/lease-templates/:id
 * Update a lease template
 */
router.patch('/lease-templates/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const template = await leaseTemplateService.updateTemplate(
        req.params.id,
        req.organizationId!,
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
router.delete('/lease-templates/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const deleted = await leaseTemplateService.deleteTemplate(req.params.id, req.organizationId!);
    if (!deleted) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.status(204).send();
}));

/**
 * POST /api/v1/pm/lease-templates/:id/preview
 * Preview a template with sample data
 */
router.post('/lease-templates/:id/preview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const html = await leaseTemplateService.previewTemplate(
        req.params.id,
        req.organizationId!,
        req.body.sampleData
    );
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}));

/**
 * POST /api/v1/pm/lease-documents/generate
 * Generate a lease document for a tenancy
 */
router.post('/lease-documents/generate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenancyId, templateId, additionalData, format } = req.body;
    
    if (!tenancyId) {
        return res.status(400).json({ error: 'tenancyId is required' });
    }

    const result = await leaseTemplateService.generateLease(req.organizationId!, {
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
router.get('/financials/noi/:propertyId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate } = req.query;
    
    // Default to last 12 months
    const end = endDate as string || new Date().toISOString().split('T')[0];
    const start = startDate as string || (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0];
    })();
    
    const noi = await advancedFinancialService.calculateNOI(
        req.organizationId!,
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
router.get('/financials/cap-rate/:propertyId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const marketValue = req.query.marketValue ? parseFloat(req.query.marketValue as string) : undefined;
    
    const capRate = await advancedFinancialService.calculateCapRate(
        req.organizationId!,
        req.params.propertyId,
        marketValue
    );
    
    res.json(capRate);
}));

/**
 * GET /api/v1/pm/financials/irr/:propertyId
 * Calculate Internal Rate of Return for a property
 */
router.get('/financials/irr/:propertyId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const holdingPeriod = req.query.holdingPeriod ? parseInt(req.query.holdingPeriod as string) : 5;
    const discountRate = req.query.discountRate ? parseFloat(req.query.discountRate as string) : 10;
    
    const irr = await advancedFinancialService.calculateIRR(
        req.organizationId!,
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
router.post('/financials/cash-on-cash/:propertyId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { downPayment, closingCosts, renovationCosts, annualDebtService, year } = req.body;
    
    if (downPayment === undefined) {
        return res.status(400).json({ error: 'downPayment is required' });
    }
    
    const cashOnCash = await advancedFinancialService.calculateCashOnCash(
        req.organizationId!,
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
router.get('/financials/dscr/:propertyId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const annualDebtService = req.query.annualDebtService 
        ? parseFloat(req.query.annualDebtService as string) 
        : 0;
    
    if (!annualDebtService) {
        return res.status(400).json({ error: 'annualDebtService query parameter is required' });
    }
    
    const dscr = await advancedFinancialService.calculateDSCR(
        req.organizationId!,
        req.params.propertyId,
        annualDebtService
    );
    
    res.json(dscr);
}));

/**
 * GET /api/v1/pm/financials/summary/:propertyId
 * Get comprehensive financial summary for a property
 */
router.get('/financials/summary/:propertyId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const investmentDetails = req.query.downPayment ? {
        downPayment: parseFloat(req.query.downPayment as string),
        closingCosts: parseFloat(req.query.closingCosts as string || '0'),
        renovationCosts: parseFloat(req.query.renovationCosts as string || '0'),
        annualDebtService: parseFloat(req.query.annualDebtService as string || '0')
    } : undefined;
    
    const summary = await advancedFinancialService.getPropertyFinancialSummary(
        req.organizationId!,
        req.params.propertyId,
        investmentDetails
    );
    
    res.json(summary);
}));

/**
 * GET /api/v1/pm/financials/portfolio-summary
 * Get portfolio-level financial summary
 */
router.get('/financials/portfolio-summary', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const summary = await advancedFinancialService.getPortfolioFinancialSummary(req.organizationId!);
    res.json(summary);
}));

// =====================================================
// ERROR HANDLER
// =====================================================

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Property Management Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

export default router;
