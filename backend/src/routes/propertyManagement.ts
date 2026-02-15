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
import { keycloakTenantOnboardingService } from '../services/property-management/auth/keycloakTenantOnboardingService';
import { tenantAuthService } from '../services/property-management/auth/tenantAuthService';
import { propertyService } from '../services/property-management/properties/propertyService';
import { notificationService } from '../../shared-services/notifications/unified';
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

/**
 * POST /api/v1/pm/tenants/:id/portal-invite
 * Invite tenant to Keycloak-backed tenant portal access
 */
router.post('/tenants/:id/portal-invite', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);

    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const invite = await keycloakTenantOnboardingService.inviteTenant(
        req.params.id,
        organizationId,
        userId,
        req.body?.redirectUri
    );

    // Fetch tenant info + property context for the personalised invite email
    const tenantResult = await db.query(
        `SELECT t.email, t.full_name,
                p.title AS property_title,
                CONCAT_WS(', ', NULLIF(p.address_street, ''), NULLIF(p.address_city, '')) AS property_address,
                o.name  AS org_name
         FROM tenants t
         LEFT JOIN tenancies tn ON tn.tenant_id = t.id AND tn.organization_id = $2
         LEFT JOIN properties p  ON p.id = tn.property_id
         LEFT JOIN organizations o ON o.id = tn.organization_id
         WHERE t.id = $1 AND t.organization_id = $2
         ORDER BY tn.created_at DESC
         LIMIT 1`,
        [req.params.id, organizationId]
    );

    const row = tenantResult.rows[0];
    const tenantEmail = row?.email as string | undefined;
    const tenantName = (row?.full_name as string) || 'Tenant';
    const propertyTitle = (row?.property_title as string) || 'your rental property';
    const propertyAddress = (row?.property_address as string) || '';
    const orgName = (row?.org_name as string) || 'Your Property Manager';

    let delivery: { sent: boolean; channel: 'email'; error?: string } | undefined;
    let magicLink: string | undefined;

    if (tenantEmail) {
        const baseUrl = process.env.TENANT_PORTAL_URL || 'http://localhost:3001';
        const magicLinkResult = await tenantAuthService.generateMagicLink(tenantEmail, baseUrl);

        if (magicLinkResult.success && magicLinkResult.token) {
            magicLink = magicLinkResult.token;
            const emailResult = await notificationService.sendPortalInvite(
                tenantEmail,
                magicLinkResult.token,
                {
                    tenantName,
                    organizationName: orgName,
                    propertyTitle,
                    propertyAddress,
                }
            );
            delivery = {
                sent: emailResult.success,
                channel: 'email',
                error: emailResult.error
            };
        } else {
            delivery = {
                sent: false,
                channel: 'email',
                error: magicLinkResult.error || 'Failed to generate setup link'
            };
        }
    }

    res.status(200).json({
        success: true,
        message: delivery?.sent
            ? 'Tenant portal invite sent'
            : 'Tenant portal invite created',
        ...invite,
        delivery,
        ...(process.env.NODE_ENV === 'development' && magicLink ? { magicLink } : {})
    });
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
 * GET /api/v1/pm/tenancies/:id/signed-lease
 * Serve the signed lease PDF with actual signatures embedded.
 * 
 * Flow:
 * 1. Find the esign_envelope for this tenancy (via applications link or direct)
 * 2. Retrieve original template PDF + signature field images from esign_fields
 * 3. Generate final signed PDF with pdfSigningService.generateFinalSignedPdf()
 * 4. Stream the result
 * 
 * Falls back to raw lease_signed_url / lease_document_url if no envelope exists.
 */
router.get('/tenancies/:id/signed-lease', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const tenancyId = req.params.id;

    // 1. Get tenancy info
    const tenancyResult = await db.query(
        `SELECT t.id, t.esign_envelope_id, t.lease_signed_url, t.lease_document_url,
                t.esign_status, p.title as property_title
         FROM tenancies t
         LEFT JOIN properties p ON p.id = t.property_id
         WHERE t.id = $1 AND t.organization_id = $2`,
        [tenancyId, organizationId]
    );

    if (tenancyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tenancy not found' });
    }

    const tenancy = tenancyResult.rows[0];
    const propertyTitle = tenancy.property_title || 'Property';
    const filename = `Signed_Lease_${propertyTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // 2. Find the envelope for this tenancy
    let envelopeId: string | null = tenancy.esign_envelope_id || null;

    if (!envelopeId) {
        // Try via applications table: envelope.context_entity_id → applications.id → applications.tenancy_id
        const envResult = await db.query(
            `SELECT ee.id
             FROM esign_envelopes ee
             JOIN applications a ON a.id = ee.context_entity_id
             WHERE a.tenancy_id = $1
               AND ee.context_type = 'lease'
               AND ee.status = 'completed'
               AND ee.organization_id = $2
             ORDER BY ee.completed_at DESC
             LIMIT 1`,
            [tenancyId, organizationId]
        );
        envelopeId = envResult.rows[0]?.id || null;
    }

    if (!envelopeId) {
        // Also try direct context_entity_id = tenancyId
        const envResult2 = await db.query(
            `SELECT id FROM esign_envelopes
             WHERE context_entity_id = $1 AND context_type = 'lease'
               AND status = 'completed' AND organization_id = $2
             ORDER BY completed_at DESC LIMIT 1`,
            [tenancyId, organizationId]
        );
        envelopeId = envResult2.rows[0]?.id || null;
    }

    // 3. If we have an envelope, generate the signed PDF with embedded signatures
    if (envelopeId) {
        try {
            // Import dependencies lazily
            const { pdfSigningService } = await import('../../shared-services/e-sign');
            const { PDFDocument } = await import('pdf-lib');
            const { getFile, buckets } = await import('../database/minio');

            // Get envelope with its original PDF
            const envRow = (await db.query(
                `SELECT document_pdf_url, document_image_url, name FROM esign_envelopes WHERE id = $1`,
                [envelopeId]
            )).rows[0];

            if (!envRow) {
                return res.status(404).json({ error: 'Envelope not found' });
            }

            // Get the original PDF bytes
            let originalPdfBytes: Uint8Array;

            if (envRow.document_pdf_url) {
                if (envRow.document_pdf_url.startsWith('data:')) {
                    // Data URL — decode base64
                    const match = envRow.document_pdf_url.match(/^data:[^;]+;base64,(.+)$/);
                    if (match) {
                        originalPdfBytes = Buffer.from(match[1], 'base64');
                    } else {
                        return res.status(400).json({ error: 'Invalid document PDF data URL' });
                    }
                } else {
                    // MinIO key
                    let bucket = buckets.documents;
                    let key = envRow.document_pdf_url;
                    if (envRow.document_pdf_url.includes('/')) {
                        const parts = envRow.document_pdf_url.split('/');
                        if (parts[0] === buckets.documents || parts[0] === buckets.uploads) {
                            bucket = parts[0];
                            key = parts.slice(1).join('/');
                        }
                    }
                    const { body } = await getFile(bucket, key);
                    originalPdfBytes = body;
                }
            } else if (envRow.document_image_url) {
                // Generate from captured image
                const pdfDoc = await PDFDocument.create();
                const imgBase64 = envRow.document_image_url.replace(/^data:image\/\w+;base64,/, '');
                const imgBytes = Buffer.from(imgBase64, 'base64');
                const image = envRow.document_image_url.includes('image/png')
                    ? await pdfDoc.embedPng(imgBytes)
                    : await pdfDoc.embedJpg(imgBytes);
                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
                originalPdfBytes = await pdfDoc.save();
            } else {
                // No original PDF in envelope — fall through to fallback
                throw new Error('No original PDF in envelope');
            }

            // Get all signature AND date_signed fields for this envelope
            const fieldsResult = await db.query(
                `SELECT ef.id, ef.field_type, ef.value, ef.page, ef.x_position, ef.y_position,
                        ef.width, ef.height, ef.signature_hash, ef.signed_at, ef.signer_id,
                        es.name as signer_name, es.email as signer_email, es.permanent_signer_id
                 FROM esign_fields ef
                 LEFT JOIN esign_signers es ON es.id = ef.signer_id
                 WHERE ef.envelope_id = $1 AND ef.field_type IN ('signature', 'date_signed') AND ef.value IS NOT NULL`,
                [envelopeId]
            );

            const sigFields = fieldsResult.rows.filter((f: any) => f.field_type === 'signature');
            const dateFields = fieldsResult.rows.filter((f: any) => f.field_type === 'date_signed');

            if (sigFields.length > 0) {
                // Resolve PMT signer IDs from users/tenants tables when permanent_signer_id is empty
                const resolveSignerId = async (email: string, existingId: string | null): Promise<string> => {
                    if (existingId) return existingId;
                    if (!email) return '';
                    // Try users table first (landlords/managers)
                    const userResult = await db.query(
                        `SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]
                    ).catch(() => ({ rows: [] }));
                    if (userResult.rows.length > 0) {
                        const raw = userResult.rows[0].id.replace(/-/g, '');
                        return `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
                    }
                    // Try tenants table (tenants)
                    const tenantResult = await db.query(
                        `SELECT id FROM tenants WHERE email = $1 LIMIT 1`, [email]
                    ).catch(() => ({ rows: [] }));
                    if (tenantResult.rows.length > 0) {
                        const raw = tenantResult.rows[0].id.replace(/-/g, '');
                        return `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
                    }
                    return '';
                };

                const signatureFields = await Promise.all(sigFields.map(async (f: any) => ({
                    signatureData: f.value,
                    page: parseInt(f.page) || 1,
                    x: parseFloat(f.x_position),
                    y: parseFloat(f.y_position),
                    width: parseFloat(f.width),
                    height: parseFloat(f.height),
                    signatureId: await resolveSignerId(f.signer_email, f.permanent_signer_id),
                    signatureHash: f.signature_hash,
                    signedAt: f.signed_at ? new Date(f.signed_at) : undefined,
                    signerName: f.signer_name,
                    signerEmail: f.signer_email,
                    usePercentage: true, // Coordinates are percentages (e.g. x=15.9, y=63.7, w=14, h=3)
                })));

                const documentHash = pdfSigningService.calculateDocumentHash(originalPdfBytes);

                // Get all signers for the certificate page
                const signersResult = await db.query(
                    `SELECT es.name, es.email, es.role, es.signed_at, es.permanent_signer_id,
                            es.signed_from_ip, es.signed_user_agent
                     FROM esign_signers es
                     WHERE es.envelope_id = $1 AND es.status = 'signed'
                     ORDER BY es.signing_order`,
                    [envelopeId]
                );

                // Get audit events for the certificate
                const auditResult = await db.query(
                    `SELECT event_type, created_at as timestamp, event_data, ip_address
                     FROM esign_audit_log
                     WHERE envelope_id = $1
                     ORDER BY created_at ASC`,
                    [envelopeId]
                ).catch(() => ({ rows: [] }));

                // Embed signatures into the PDF
                let signedPdfBytes = await pdfSigningService.embedAllSignatures(
                    originalPdfBytes,
                    signatureFields
                );

                // Embed date_signed fields (text or image) at their positions
                if (dateFields.length > 0) {
                    const { PDFDocument: PDFDoc, StandardFonts: StdFonts, rgb: pdfRgb } = await import('pdf-lib');
                    const datePdfDoc = await PDFDoc.load(signedPdfBytes);
                    const dateFont = await datePdfDoc.embedFont(StdFonts.Helvetica);
                    const pages = datePdfDoc.getPages();

                    for (const df of dateFields) {
                        const pageIdx = (parseInt(df.page) || 1) - 1;
                        if (pageIdx < 0 || pageIdx >= pages.length) continue;
                        const pg = pages[pageIdx];
                        const { width: pgW, height: pgH } = pg.getSize();

                        const dx = (parseFloat(df.x_position) / 100) * pgW;
                        const dw = (parseFloat(df.width) / 100) * pgW;
                        const dh = (parseFloat(df.height) / 100) * pgH;
                        const dy = pgH - ((parseFloat(df.y_position) / 100) * pgH) - dh;

                        if (df.value.startsWith('data:image/')) {
                            // Date rendered as image — embed it
                            const b64 = df.value.replace(/^data:image\/\w+;base64,/, '');
                            const imgBytes = Buffer.from(b64, 'base64');
                            try {
                                const img = await datePdfDoc.embedPng(imgBytes);
                                pg.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
                            } catch {
                                try {
                                    const img = await datePdfDoc.embedJpg(imgBytes);
                                    pg.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
                                } catch { /* skip */ }
                            }
                        } else {
                            // Date is plain text — draw it
                            pg.drawText(df.value, {
                                x: dx,
                                y: dy + (dh / 2) - 4,
                                size: 9,
                                font: dateFont,
                                color: pdfRgb(0.1, 0.1, 0.1),
                            });
                        }
                    }
                    signedPdfBytes = await datePdfDoc.save();
                }

                // Append the full Certificate of Completion (with QR code section, audit trail)
                try {
                    const certPdfBytes = await pdfSigningService.generateCertificateOfCompletion({
                        certificateId: `CERT-${envelopeId!.substring(0, 8).toUpperCase()}`,
                        documentTitle: envRow.name || `Lease Agreement - ${propertyTitle}`,
                        documentHash,
                        envelopeId: envelopeId!,
                        organizationName: 'PROPMETRIK Ghana Ltd.',
                        completedAt: new Date(),
                        signers: await Promise.all(signersResult.rows.map(async (s: any) => ({
                            name: s.name,
                            email: s.email,
                            role: s.role || 'signer',
                            signedAt: new Date(s.signed_at),
                            signatureId: await resolveSignerId(s.email, s.permanent_signer_id),
                            ipAddress: s.signed_from_ip,
                            userAgent: s.signed_user_agent,
                        }))),
                        auditEvents: auditResult.rows.map((e: any) => ({
                            eventType: e.event_type,
                            timestamp: new Date(e.timestamp),
                            description: e.event_type,
                            actor: typeof e.event_data === 'object' ? e.event_data?.actor : undefined,
                            ipAddress: e.ip_address,
                        })),
                    });

                    // Merge: append certificate pages to signed document
                    const { PDFDocument: PDFDoc } = await import('pdf-lib');
                    const mainDoc = await PDFDoc.load(signedPdfBytes);
                    const certDoc = await PDFDoc.load(certPdfBytes);
                    const certPages = await mainDoc.copyPages(certDoc, certDoc.getPageIndices());
                    for (const p of certPages) {
                        mainDoc.addPage(p);
                    }
                    signedPdfBytes = await mainDoc.save();
                } catch (certErr: any) {
                    console.error('Failed to generate certificate page:', certErr?.message);
                    // Fall back to simple certificate
                    signedPdfBytes = await pdfSigningService.addSignatureCertificatePage(
                        signedPdfBytes,
                        signatureFields.filter((s: any) => s.signerName && s.signerEmail && s.signedAt)
                            .map((s: any) => ({
                                signerName: s.signerName,
                                signerEmail: s.signerEmail,
                                signedAt: s.signedAt,
                                signatureMethod: 'DRAWN_SIGNATURE',
                            })),
                        documentHash
                    );
                }

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Length', signedPdfBytes.length);
                res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
                return res.send(Buffer.from(signedPdfBytes));
            }

            // No signature fields found — serve original PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Length', originalPdfBytes.length);
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            return res.send(Buffer.from(originalPdfBytes));

        } catch (err: any) {
            // Log but fall through to fallback
            console.error('Failed to generate signed PDF from envelope:', err?.message);
        }
    }

    // 4. Fallback: serve raw lease_signed_url or lease_document_url
    const url = tenancy.lease_signed_url || tenancy.lease_document_url;
    if (!url) {
        return res.status(404).json({ error: 'No lease document available for this tenancy' });
    }

    if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
            return res.status(400).json({ error: 'Invalid data URL format' });
        }
        const buffer = Buffer.from(match[2], 'base64');
        res.setHeader('Content-Type', match[1]);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(buffer);
    }

    if (!url.startsWith('http')) {
        const bucket = url.startsWith('propmetrik-') ? url.split('/')[0] : 'propmetrik-documents';
        const key = url.startsWith('propmetrik-') ? url.substring(bucket.length + 1) : url;
        return res.redirect(`/api/v1/files/${bucket}/${key}`);
    }

    return res.redirect(url);
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
 * GET /api/v1/pm/payments/account
 * Get current payout account status
 */
router.get('/payments/account', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    // Get full details from payment_accounts table
    const { pool } = await import('../database');
    const result = await pool.query(
        `SELECT * FROM payment_accounts
         WHERE entity_id = $1 AND entity_type = 'organization' AND is_active = TRUE
         LIMIT 1`,
        [organizationId]
    );

    if (result.rows.length === 0) {
        // Fallback: check legacy table
        const legacy = await pool.query(
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
 * GET /api/v1/pm/payments/transactions
 * Get transaction ledger for the organization
 */
router.get('/payments/transactions', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { page = '1', limit = '20', status } = req.query;

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    let query = `SELECT * FROM payment_transactions 
                 WHERE recipient_id = $1`;
    const params: any[] = [organizationId];

    if (status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10), offset);

    const { pool } = await import('../database');
    const result = await pool.query(query, params);

    const countResult = await pool.query(
        `SELECT COUNT(*)::int FROM payment_transactions WHERE recipient_id = $1`,
        [organizationId]
    );

    res.json({
        data: result.rows,
        total: countResult.rows[0].count,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10)
    });
}));

// =====================================================
// CRYPTO WALLET CONFIGURATION
// =====================================================

/**
 * GET /api/v1/pm/payments/crypto-wallet
 * Get current crypto wallet configuration for the organization
 * Returns both on-chain EVM wallet and settlement preference (payout coin)
 */
router.get('/payments/crypto-wallet', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const { pool } = await import('../database');
    const result = await pool.query(
        `SELECT crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at,
                crypto_preferred_settlement_coin, crypto_preferred_settlement_chain,
                crypto_settlement_wallet_address, crypto_use_nowpayments_settlement,
                crypto_settlement_configured_at
         FROM payment_accounts
         WHERE entity_id = $1 AND entity_type = 'organization' AND is_active = TRUE
         LIMIT 1`,
        [organizationId]
    );

    if (result.rows.length === 0 || !result.rows[0].crypto_settlement_wallet_address) {
        // Also check legacy setup (EVM-only wallet without settlement pref)
        if (result.rows.length > 0 && result.rows[0].crypto_wallet_address) {
            const row = result.rows[0];
            return res.json({
                configured: true,
                walletAddress: row.crypto_wallet_address,
                isVerified: row.crypto_wallet_verified || false,
                registeredAt: row.crypto_wallet_registered_at,
                // Default: on-chain USDT on Polygon
                payoutCoin: 'usdt',
                payoutChain: 'polygon',
                payoutWalletAddress: row.crypto_wallet_address,
                useNowPayments: false,
            });
        }
        return res.json({ configured: false });
    }

    const row = result.rows[0];
    res.json({
        configured: true,
        walletAddress: row.crypto_wallet_address, // EVM wallet (if set)
        isVerified: row.crypto_wallet_verified || false,
        registeredAt: row.crypto_wallet_registered_at || row.crypto_settlement_configured_at,
        payoutCoin: row.crypto_preferred_settlement_coin,
        payoutChain: row.crypto_preferred_settlement_chain,
        payoutWalletAddress: row.crypto_settlement_wallet_address,
        useNowPayments: row.crypto_use_nowpayments_settlement || false,
    });
}));

/**
 * GET /api/v1/pm/payments/settlement-coins
 * Get all supported payout currencies
 */
router.get('/payments/settlement-coins', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
    const coins = await nowPaymentsService.getSupportedSettlementCoins();
    res.json(coins);
}));

/**
 * POST /api/v1/pm/payments/crypto-wallet
 * Save/update crypto wallet + payout currency for the organization
 * Accepts: { walletAddress, payoutCoin, payoutChain }
 * - If payoutCoin is EVM-native (e.g. USDT on Polygon), walletAddress is used directly on-chain
 * - If payoutCoin is off-chain (e.g. BTC), NOWPayments handles the conversion
 */
router.post('/payments/crypto-wallet', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { walletAddress, payoutCoin, payoutChain } = req.body;

    if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
    }
    if (!payoutCoin || !payoutChain) {
        return res.status(400).json({ error: 'Payout coin and chain are required' });
    }

    // Validate coin+chain and address format via nowPaymentsService
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');

    // Check coin is supported
    const ticker = await nowPaymentsService.getNowPaymentsTicker(payoutCoin, payoutChain);
    if (!ticker) {
        return res.status(400).json({ error: `Unsupported payout currency: ${payoutCoin} on ${payoutChain}` });
    }

    // Validate address format
    const validAddress = await nowPaymentsService.validateSettlementAddress(payoutCoin, payoutChain, walletAddress);
    if (!validAddress) {
        return res.status(400).json({ error: `Invalid ${payoutCoin.toUpperCase()} address format for ${payoutChain}` });
    }

    const isEvmNative = await nowPaymentsService.isEvmNative(payoutCoin, payoutChain);

    const { pool } = await import('../database');

    // Upsert payment_accounts row
    const upsertResult = await pool.query(`
        INSERT INTO payment_accounts (id, entity_type, entity_id, crypto_wallet_address, crypto_wallet_registered_at, updated_at, is_active)
        VALUES (gen_random_uuid(), 'organization', $1, $2, NOW(), NOW(), TRUE)
        ON CONFLICT (entity_type, entity_id) DO UPDATE SET
            updated_at = NOW()
        RETURNING id
    `, [organizationId, isEvmNative ? walletAddress : null]);

    const row = upsertResult.rows[0];

    // Set settlement preference (handles both EVM and off-chain coins)
    const settlementResult = await nowPaymentsService.setClientSettlementPreference({
        entityType: 'organization',
        entityId: organizationId,
        coinSymbol: payoutCoin,
        chain: payoutChain,
        walletAddress,
    });

    // If EVM-native, also register on-chain
    let onChainRegistered = false;
    if (isEvmNative) {
        try {
            const { cryptoPaymentService } = await import('../../shared-services/payments/crypto');
            if (cryptoPaymentService.isConfigured()) {
                await cryptoPaymentService.registerRecipientWallet('organization', organizationId, walletAddress);
                onChainRegistered = true;
                await pool.query(`
                    UPDATE payment_accounts SET 
                        crypto_wallet_address = $1,
                        crypto_wallet_verified = true,
                        crypto_wallet_registered_at = NOW()
                    WHERE id = $2`, [walletAddress, row.id]);
            }
        } catch {
            // On-chain registration is optional — wallet is saved regardless
        }
    }

    res.json({
        success: true,
        walletAddress,
        payoutCoin: payoutCoin.toLowerCase(),
        payoutChain: payoutChain.toLowerCase(),
        useNowPayments: settlementResult.useNowPayments,
        isVerified: onChainRegistered,
        registeredAt: new Date().toISOString(),
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
    if (actualCost === undefined || actualCost === null || !completionNotes) {
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
 * GET /api/v1/pm/documents/vault
 * Unified document vault: property_management_documents + lease_documents + tenancy lease URLs
 */
router.get('/documents/vault', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

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
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await documentService.listVaultDocuments(organizationId, filters, pagination);
    res.json(result);
}));

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
        const result = await paymentProcessor.initializeRentPayment({
            tenancyId,
            organizationId,
            amount,
            email,
            channel,
            callbackUrl
        });
        res.json({
            success: true,
            authorizationUrl: result.authorizationUrl,
            accessCode: result.accessCode,
            reference: result.reference,
            feeBreakdown: result.feeBreakdown
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}));

/**
 * POST /api/v1/pm/payments/webhook
 * Unified Paystack Webhook Handler
 * THIS IS THE ONLY Paystack webhook endpoint. Configure Paystack dashboard to point here.
 */
router.post('/payments/webhook', asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-paystack-signature'] as string;
    if (!signature) {
        return res.status(401).json({ error: 'No signature provided' });
    }

    const { paystackService } = await import('../services/property-management/payment/paystackService');
    const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');

    // Verify signature — cryptographic proof the request is from Paystack
    if (!paystackService.verifyWebhookSignature(signature, req.body)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Always respond 200 immediately — Paystack retries on non-2xx
    res.status(200).send();

    // Process asynchronously after responding
    try {
        await paymentProcessor.handleWebhook(event.event, event.data);
    } catch (error) {
        // Logged inside handleWebhook; don't crash the server
        console.error('Webhook processing error:', error);
    }
}));

/**
 * POST /api/v1/pm/payments/calculate-fee
 * Preview fee breakdown for any payment type (admin use)
 */
router.post('/payments/calculate-fee', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { paymentType, amount, entityId, entityType } = req.body;

    if (!paymentType || !amount) {
        return res.status(400).json({ error: 'paymentType and amount are required' });
    }

    const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');
    const fee = await paymentProcessor.calculateFee(
        paymentType,
        amount,
        entityId || organizationId,
        entityType || 'organization'
    );
    res.json(fee);
}));

/**
 * POST /api/v1/pm/payments/register-account
 * Register or update the organization's bank account for payouts
 */
router.post('/payments/register-account', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { bankCode, accountNumber, businessName, contactEmail, contactPhone } = req.body;

    if (!bankCode || !accountNumber || !businessName) {
        return res.status(400).json({ error: 'bankCode, accountNumber, and businessName are required' });
    }

    const { paystackService } = await import('../services/property-management/payment/paystackService');

    const result = await paystackService.registerPropertyManagerAccount(
        organizationId, bankCode, accountNumber, businessName, contactEmail, contactPhone
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
        `SELECT a.id, a.status, a.envelope_id, a.applicant_full_name, a.applicant_email,
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

    // Get the e-sign envelope with signer info
    const envelopeResult = await db.query(
        `SELECT e.id, e.name, e.status, e.document_html, e.document_image_url,
            e.document_pdf_url, e.created_at
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
        `SELECT id, name, email, role, signing_order, status, access_token, permanent_signer_id
         FROM esign_signers
         WHERE envelope_id = $1
         ORDER BY role`,
        [application.envelope_id]
    );

    // Prefer signer that matches application applicant email/name, then fall back to signing order 2.
    const normalizedApplicantEmail = (application.applicant_email || '').toLowerCase();
    const normalizedApplicantName = (application.applicant_full_name || '').toLowerCase();
    const tenantSigner = signersResult.rows.find((s: any) =>
        normalizedApplicantEmail && (s.email || '').toLowerCase() === normalizedApplicantEmail
    ) || signersResult.rows.find((s: any) =>
        normalizedApplicantName && (s.name || '').toLowerCase() === normalizedApplicantName
    ) || signersResult.rows.find((s: any) => Number(s.signing_order) === 2)
        || signersResult.rows[1]
        || signersResult.rows[0];

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
        documentUrl: envelope.document_image_url || envelope.document_pdf_url,
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
router.get('/lease-templates', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/lease-templates/:id', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/lease-templates', asyncHandler(async (req: Request, res: Response) => {
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
router.patch('/lease-templates/:id', asyncHandler(async (req: Request, res: Response) => {
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
router.delete('/lease-templates/:id', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/lease-templates/:id/preview', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/lease-documents/generate', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/financials/noi/:propertyId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/financials/cap-rate/:propertyId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/financials/irr/:propertyId', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/financials/cash-on-cash/:propertyId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/financials/dscr/:propertyId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/financials/summary/:propertyId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/financials/portfolio-summary', asyncHandler(async (req: Request, res: Response) => {
    const summary = await advancedFinancialService.getPortfolioFinancialSummary(req.organizationId!);
    res.json(summary);
}));

// =====================================================
// TENANT MESSAGING ROUTES (Landlord-side)
// =====================================================

/**
 * GET /api/v1/pm/tenant-messages/conversations
 * Get all tenant conversations for the organization
 */
router.get('/tenant-messages/conversations', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);

    const result = await db.query(
        `SELECT c.*, 
            t.full_name as tenant_name,
            t.email as tenant_email,
            p.title as property_title,
            (SELECT content FROM tenant_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
         FROM tenant_conversations c
         JOIN tenancies tn ON tn.id = c.tenancy_id
         JOIN tenants t ON t.id = tn.tenant_id
         JOIN properties p ON p.id = tn.property_id
         WHERE c.organization_id = $1 AND c.is_archived = FALSE
         ORDER BY c.last_message_at DESC`,
        [orgId]
    );

    res.json({
        conversations: result.rows.map((r: any) => ({
            id: r.id,
            tenancyId: r.tenancy_id,
            tenantName: r.tenant_name,
            tenantEmail: r.tenant_email,
            propertyTitle: r.property_title,
            subject: r.subject,
            lastMessage: r.last_message,
            lastMessageAt: r.last_message_at,
            unreadCount: r.landlord_unread_count,
            createdAt: r.created_at
        }))
    });
}));

/**
 * GET /api/v1/pm/tenant-messages/conversations/:conversationId/messages
 * Get messages for a conversation (landlord view)
 */
router.get('/tenant-messages/conversations/:conversationId/messages', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const { conversationId } = req.params;

    // Verify org access
    const convCheck = await db.query(
        `SELECT * FROM tenant_conversations WHERE id = $1 AND organization_id = $2`,
        [conversationId, orgId]
    );
    if (convCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await db.query(
        `SELECT * FROM tenant_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [conversationId]
    );

    // Mark as read for landlord
    await db.query(`UPDATE tenant_conversations SET landlord_unread_count = 0 WHERE id = $1`, [conversationId]);
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
            isRead: r.is_read,
            createdAt: r.created_at
        }))
    });
}));

/**
 * POST /api/v1/pm/tenant-messages/conversations/:conversationId/messages
 * Send a message to a tenant as landlord
 */
router.post('/tenant-messages/conversations/:conversationId/messages', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
    }

    const convCheck = await db.query(
        `SELECT c.*, tn.tenant_id FROM tenant_conversations c
         JOIN tenancies tn ON tn.id = c.tenancy_id
         WHERE c.id = $1 AND c.organization_id = $2`,
        [conversationId, orgId]
    );
    if (convCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    const userId = await getUserId(req);

    const result = await db.query(
        `INSERT INTO tenant_messages (conversation_id, sender_type, sender_id, content)
         VALUES ($1, 'landlord', $2, $3)
         RETURNING *`,
        [conversationId, userId, content]
    );

    await db.query(
        `UPDATE tenant_conversations SET last_message_at = NOW(), tenant_unread_count = tenant_unread_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [conversationId]
    );

    // Create notification for tenant
    const tenantId = convCheck.rows[0].tenant_id;
    if (tenantId) {
        try {
            await db.query(
                `INSERT INTO tenant_notifications (tenant_id, type, title, message, action_url)
                 VALUES ($1, 'message', 'New Message', $2, '/messages')`,
                [tenantId, `You have a new message from your property manager.`]
            );
        } catch { }
    }

    const msg = result.rows[0];
    res.json({
        success: true,
        message: {
            id: msg.id,
            senderType: msg.sender_type,
            content: msg.content,
            createdAt: msg.created_at
        }
    });
}));

// =====================================================
// UTILITY CHARGES (Landlord billing tenants for utilities)
// =====================================================

/**
 * GET /api/v1/pm/tenancies/:id/utility-charges
 * List utility charges for a tenancy
 */
router.get('/tenancies/:id/utility-charges', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const organizationId = await getOrganizationId(req);
        const { id: tenancyId } = req.params;

        const result = await db.query(
            `SELECT uc.*, 
                    d.title as evidence_title, d.file_url as evidence_file_url, d.file_name as evidence_file_name,
                    rs.period_number as schedule_period_number, rs.period_start_date as schedule_period_start
             FROM utility_charges uc
             LEFT JOIN property_management_documents d ON uc.evidence_document_id = d.id
             LEFT JOIN rent_schedules rs ON uc.applied_to_schedule_id = rs.id
             WHERE uc.tenancy_id = $1 AND uc.organization_id = $2
             ORDER BY uc.billing_period_start DESC, uc.created_at DESC`,
            [tenancyId, organizationId]
        );

        res.json({ charges: result.rows });
    } catch (err) { next(err); }
});

/**
 * POST /api/v1/pm/tenancies/:id/utility-charges
 * Create a utility charge for a tenancy
 */
router.post('/tenancies/:id/utility-charges', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const organizationId = await getOrganizationId(req);
        const { id: tenancyId } = req.params;
        const { utilityType, billingPeriodStart, billingPeriodEnd, amount, currency, description, evidenceDocumentId } = req.body;

        if (!utilityType || !billingPeriodStart || !billingPeriodEnd || !amount) {
            return res.status(400).json({ error: 'utilityType, billingPeriodStart, billingPeriodEnd, and amount are required' });
        }
        if (parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }

        // Verify tenancy belongs to org
        const tenancyCheck = await db.query(
            `SELECT id, lease_terms FROM tenancies WHERE id = $1 AND organization_id = $2`,
            [tenancyId, organizationId]
        );
        if (tenancyCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tenancy not found' });
        }

        const result = await db.query(
            `INSERT INTO utility_charges 
             (tenancy_id, organization_id, utility_type, billing_period_start, billing_period_end, amount, currency, description, evidence_document_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [tenancyId, organizationId, utilityType, billingPeriodStart, billingPeriodEnd, amount, currency || 'GHS', description || null, evidenceDocumentId || null, null]
        );

        res.status(201).json({ success: true, charge: result.rows[0] });
    } catch (err) { next(err); }
});

/**
 * PATCH /api/v1/pm/utility-charges/:id
 * Update a utility charge (edit amount, waive, etc.)
 */
router.patch('/utility-charges/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const organizationId = await getOrganizationId(req);
        const { id } = req.params;
        const { amount, description, status, evidenceDocumentId } = req.body;

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (amount !== undefined) { updates.push(`amount = $${paramIndex++}`); values.push(amount); }
        if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
        if (status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(status); }
        if (evidenceDocumentId !== undefined) { updates.push(`evidence_document_id = $${paramIndex++}`); values.push(evidenceDocumentId); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id, organizationId);
        const result = await db.query(
            `UPDATE utility_charges SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND organization_id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Charge not found' });
        }

        res.json({ success: true, charge: result.rows[0] });
    } catch (err) { next(err); }
});

/**
 * DELETE /api/v1/pm/utility-charges/:id
 * Delete a utility charge (only if pending)
 */
router.delete('/utility-charges/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const organizationId = await getOrganizationId(req);
        const { id } = req.params;

        const result = await db.query(
            `DELETE FROM utility_charges WHERE id = $1 AND organization_id = $2 AND status = 'pending' RETURNING id`,
            [id, organizationId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Charge not found or already applied' });
        }

        res.json({ success: true });
    } catch (err) { next(err); }
});

/**
 * POST /api/v1/pm/utility-charges/:id/apply
 * Apply a utility charge to a rent schedule period
 * This increases the schedule's utility_charges_total
 */
router.post('/utility-charges/:id/apply', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const organizationId = await getOrganizationId(req);
        const { id } = req.params;
        const { scheduleId } = req.body;

        if (!scheduleId) {
            return res.status(400).json({ error: 'scheduleId is required' });
        }

        // Verify charge exists and is pending
        const chargeResult = await db.query(
            `SELECT * FROM utility_charges WHERE id = $1 AND organization_id = $2`,
            [id, organizationId]
        );
        if (chargeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Charge not found' });
        }
        const charge = chargeResult.rows[0];
        if (charge.status !== 'pending') {
            return res.status(400).json({ error: `Charge is already ${charge.status}` });
        }

        // Verify schedule exists for same tenancy
        const scheduleResult = await db.query(
            `SELECT * FROM rent_schedules WHERE id = $1 AND tenancy_id = $2`,
            [scheduleId, charge.tenancy_id]
        );
        if (scheduleResult.rows.length === 0) {
            return res.status(404).json({ error: 'Rent schedule not found for this tenancy' });
        }

        // Apply: update charge status + update schedule utility total + increase expected_amount
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Mark charge as applied
            await client.query(
                `UPDATE utility_charges SET status = 'applied', applied_to_schedule_id = $1, applied_at = NOW() WHERE id = $2`,
                [scheduleId, id]
            );

            // Increase rent schedule expected_amount and utility_charges_total
            await client.query(
                `UPDATE rent_schedules 
                 SET expected_amount = expected_amount + $1,
                     utility_charges_total = COALESCE(utility_charges_total, 0) + $1
                 WHERE id = $2`,
                [charge.amount, scheduleId]
            );

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        // Fetch updated schedule
        const updatedSchedule = await db.query(`SELECT * FROM rent_schedules WHERE id = $1`, [scheduleId]);

        res.json({
            success: true,
            charge: { ...charge, status: 'applied', applied_to_schedule_id: scheduleId },
            schedule: updatedSchedule.rows[0]
        });
    } catch (err) { next(err); }
});

/**
 * GET /api/v1/pm/tenancies/:id/rent-schedules
 * List rent schedules for a tenancy (for the apply dropdown)
 */
router.get('/tenancies/:id/rent-schedules', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const organizationId = await getOrganizationId(req);
        const { id: tenancyId } = req.params;

        const result = await db.query(
            `SELECT id, period_number, period_start_date, period_end_date, due_date, 
                    expected_amount, amount_paid, amount_outstanding, utility_charges_total, currency, status
             FROM rent_schedules 
             WHERE tenancy_id = $1 AND organization_id = $2
             ORDER BY period_number ASC`,
            [tenancyId, organizationId]
        );

        res.json({ schedules: result.rows });
    } catch (err) { next(err); }
});

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
