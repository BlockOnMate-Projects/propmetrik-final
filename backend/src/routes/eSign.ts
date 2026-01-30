/**
 * E-Signature API Routes
 * Endpoints for e-signature functionality
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
    signingService,
    auditLogService,
    consentService,
    magicLinkService,
    pdfSigningService,
    templateService,
    createEnvelopeService,
    EnvelopeStatus
} from '../../shared-services/e-sign';
import {
    CreateSigningRequestDto,
    CaptureSignatureDto,
    ExternalSignatureDto
} from '../../shared-services/e-sign/types';
import { logger } from '../utils/logger';
import { pool, query as dbQuery } from '../database';
import { getFile, buckets } from '../database/minio';
import { PDFDocument } from 'pdf-lib';

// Multer configuration for PDF uploads
const UPLOAD_DIR = path.join(__dirname, '../../uploads/esign');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const esignUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const ext = path.extname(file.originalname);
            cb(null, `envelope-${uniqueSuffix}${ext}`);
        },
    }),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = Router();
const esignEnvelopeService = createEnvelopeService(pool);

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Extract user ID from JWT or header
const getUserId = (req: Request): string => {
    // Try to get from JWT token first (added by auth middleware)
    const jwtUserId = (req as any).userId || (req as any).user?.id;
    if (jwtUserId) return jwtUserId;

    // Fall back to header
    const headerUserId = req.headers['x-user-id'] as string;
    if (headerUserId) return headerUserId;

    // Default to admin user for development (this user exists in the database)
    return '00000000-0000-0000-0000-000000000002';
};

// Extract user email from JWT or header
const getUserEmail = (req: Request): string | undefined => {
    // Try to get from JWT token first
    const jwtEmail = (req as any).user?.email;
    if (jwtEmail) return jwtEmail;

    // Fall back to header
    const headerEmail = req.headers['x-user-email'] as string;
    if (headerEmail) return headerEmail;

    return undefined;
};

const getOrganizationId = (req: Request): string | undefined => {
    return req.headers['x-organization-id'] as string || undefined;
};

// =====================================================
// SIGNING REQUESTS
// =====================================================

/**
 * Create a new signing request
 * POST /api/v1/esign/requests
 */
router.post('/requests', asyncHandler(async (req: Request, res: Response) => {
    const dto: CreateSigningRequestDto = req.body;
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    const signingRequest = await signingService.createSigningRequest(dto, userId, organizationId);

    res.status(201).json({
        success: true,
        data: signingRequest
    });
}));

/**
 * Get all signing requests for the current user
 * GET /api/v1/esign/requests
 */
router.get('/requests', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const requests = await signingService.getSigningRequestsForUser(userId);

    res.json({
        success: true,
        data: requests
    });
}));

/**
 * Get a specific signing request
 * GET /api/v1/esign/requests/:id
 */
router.get('/requests/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const request = await signingService.getSigningRequest(id);

    if (!request) {
        return res.status(404).json({
            success: false,
            error: 'Signing request not found'
        });
    }

    res.json({
        success: true,
        data: request
    });
}));

/**
 * Void a signing request
 * POST /api/v1/esign/requests/:id/void
 */
router.post('/requests/:id/void', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = getUserId(req);

    await signingService.voidSigningRequest(id, reason || 'Voided by user', userId);

    res.json({
        success: true,
        message: 'Signing request voided'
    });
}));

// =====================================================
// INTERNAL SIGNING
// =====================================================

/**
 * Capture signature from internal (logged-in) user
 * POST /api/v1/esign/sign
 */
router.post('/sign', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const dto: CaptureSignatureDto = {
        ...req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    };

    const evidence = await signingService.captureInternalSignature(dto, userId);

    res.status(201).json({
        success: true,
        data: evidence
    });
}));

// =====================================================
// EXTERNAL SIGNING (Magic Link)
// =====================================================

/**
 * Get signing details from magic link token
 * GET /api/v1/esign/external/:token
 */
router.get('/external/:token', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const details = await magicLinkService.getSigningDetailsFromToken(token);

    if (!details) {
        return res.status(404).json({
            success: false,
            error: 'Invalid or expired signing link'
        });
    }

    // Get consent statement
    const consent = await consentService.getCurrentConsentStatement();

    res.json({
        success: true,
        data: {
            signee: {
                id: details.signee.id,
                name: details.signee.externalName,
                email: details.signee.externalEmail,
                role: details.signee.signeeRole,
                status: details.signee.status
            },
            documentTitle: details.documentTitle,
            documentUrl: details.documentUrl,
            consentStatement: consent
        }
    });
}));

/**
 * Capture signature from external signee via magic link
 * POST /api/v1/esign/external/:token/sign
 */
router.post('/external/:token/sign', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const dto: ExternalSignatureDto = {
        magicToken: token,
        signatureMethod: req.body.signatureMethod,
        signatureImageBase64: req.body.signatureImageBase64,
        otpCode: req.body.otpCode,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    };

    const evidence = await signingService.captureExternalSignature(dto);

    res.status(201).json({
        success: true,
        data: evidence.id,
        message: 'Document signed successfully'
    });
}));

// =====================================================
// TOKEN AND OTP VERIFICATION (for External Signing UI)
// =====================================================

/**
 * Verify magic link token and send OTP
 * POST /api/v1/esign/verify-token
 */
router.post('/verify-token', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            error: 'Token is required'
        });
    }

    const details = await magicLinkService.getSigningDetailsFromToken(token);

    if (!details) {
        return res.status(404).json({
            success: false,
            error: 'Invalid or expired signing link'
        });
    }

    // Send OTP to the signer's email
    try {
        await magicLinkService.sendOtp(token, details.signee.externalEmail!);
    } catch (err) {
        logger.warn('Failed to send OTP, continuing without', { error: err });
    }

    // Get document pages (in production, would render from PDF service)
    // For now, return placeholder that will be rendered client-side
    const documentPages = [
        { pageNumber: 1, imageUrl: details.documentUrl || '/api/placeholder/612/792' }
    ];

    // Get signature fields for this signer - safely access optional properties
    const signingRequest = (details as any).signingRequest;
    const fields = signingRequest?.signatureFields?.filter(
        (f: { signeeId: string }) => f.signeeId === details.signee.id
    ) || [];

    res.json({
        success: true,
        document: {
            id: signingRequest?.id || token,
            title: details.documentTitle,
            pages: documentPages,
            fields: fields.map((f: { id: string; fieldType: string; pageNumber: number; x: number; y: number; width: number; height: number; required: boolean; signeeId: string }) => ({
                id: f.id,
                type: f.fieldType,
                page: f.pageNumber,
                x: f.x,
                y: f.y,
                width: f.width,
                height: f.height,
                required: f.required,
                signerId: f.signeeId
            })),
            signer: {
                id: details.signee.id,
                name: details.signee.externalName || 'Signer',
                email: details.signee.externalEmail || '',
                role: details.signee.signeeRole
            },
            status: details.signee.status
        },
        otpSent: true
    });
}));

/**
 * Verify OTP code
 * POST /api/v1/esign/verify-otp
 */
router.post('/verify-otp', asyncHandler(async (req: Request, res: Response) => {
    const { token, code } = req.body;

    if (!token || !code) {
        return res.status(400).json({
            success: false,
            error: 'Token and code are required'
        });
    }

    const isValid = await magicLinkService.verifyOtp(token, code);

    if (!isValid) {
        return res.status(401).json({
            success: false,
            error: 'Invalid verification code'
        });
    }

    res.json({
        success: true,
        message: 'Code verified successfully'
    });
}));

/**
 * Resend OTP code
 * POST /api/v1/esign/resend-otp
 */
router.post('/resend-otp', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            error: 'Token is required'
        });
    }

    const details = await magicLinkService.getSigningDetailsFromToken(token);

    if (!details) {
        return res.status(404).json({
            success: false,
            error: 'Invalid or expired signing link'
        });
    }

    await magicLinkService.sendOtp(token, details.signee.externalEmail!);

    res.json({
        success: true,
        message: 'Verification code resent'
    });
}));

/**
 * Submit all signatures for a signing request
 * POST /api/v1/esign/submit
 */
router.post('/submit', asyncHandler(async (req: Request, res: Response) => {
    const { token, signatures } = req.body;

    if (!token || !signatures) {
        return res.status(400).json({
            success: false,
            error: 'Token and signatures are required'
        });
    }

    const details = await magicLinkService.getSigningDetailsFromToken(token);

    if (!details) {
        return res.status(404).json({
            success: false,
            error: 'Invalid or expired signing link'
        });
    }

    // Capture each signature
    const evidenceIds: string[] = [];
    for (const [fieldId, signatureData] of Object.entries(signatures)) {
        const sigData = signatureData as { type: string; data: string };

        // Map signature type to valid SignatureMethod
        let signatureMethod: 'click_to_sign' | 'typed_name' | 'drawn_signature' = 'drawn_signature';
        if (sigData.type === 'typed' || sigData.type === 'type') {
            signatureMethod = 'typed_name';
        } else if (sigData.type === 'click') {
            signatureMethod = 'click_to_sign';
        }

        const dto: ExternalSignatureDto = {
            magicToken: token,
            signatureMethod,
            signatureImageBase64: sigData.data,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            fieldId
        };

        try {
            const evidence = await signingService.captureExternalSignature(dto);
            evidenceIds.push(evidence.id);
        } catch (err) {
            logger.error('Failed to capture signature', { fieldId, error: err });
        }
    }

    // Mark signee as completed
    await signingService.markSigneeComplete(details.signee.id);

    // Log audit event - use createAuditEvent method
    const signingRequestForAudit = (details as any).signingRequest;
    await auditLogService.createAuditEvent({
        signingRequestId: signingRequestForAudit?.id || null,
        eventType: 'signature_captured',
        actorId: details.signee.id,
        actorType: 'external_signee',
        ipAddress: req.ip
    });

    res.json({
        success: true,
        evidenceIds,
        message: 'Signatures submitted successfully'
    });
}));

// =====================================================
// AUDIT TRAIL
// =====================================================

/**
 * Get audit trail for a signing request
 * GET /api/v1/esign/audit/:signingRequestId
 */
router.get('/audit/:signingRequestId', asyncHandler(async (req: Request, res: Response) => {
    const { signingRequestId } = req.params;

    const trail = await auditLogService.getAuditTrailForRequest(signingRequestId);
    const integrity = await auditLogService.verifyChainIntegrity(signingRequestId);

    res.json({
        success: true,
        data: {
            events: trail,
            integrity
        }
    });
}));

// =====================================================
// CONSENT STATEMENTS
// =====================================================

/**
 * Get current consent statement
 * GET /api/v1/esign/consent
 */
router.get('/consent', asyncHandler(async (_req: Request, res: Response) => {
    const consent = await consentService.getCurrentConsentStatement();

    res.json({
        success: true,
        data: consent
    });
}));

// =====================================================
// TEST UTILITIES
// =====================================================

/**
 * Create a test PDF document
 * POST /api/v1/esign/test/create-pdf
 */
router.post('/test/create-pdf', asyncHandler(async (req: Request, res: Response) => {
    const { content } = req.body;
    const pdfBytes = await pdfSigningService.createTestPdf(content || 'Test Document');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="test-document.pdf"');
    res.send(Buffer.from(pdfBytes));
}));

/**
 * Health check
 * GET /api/v1/esign/health
 */
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        success: true,
        service: 'e-sign',
        timestamp: new Date().toISOString()
    });
});

/**
 * Test PDF generation with signatures and certificate
 * POST /api/v1/esign/test/full-pdf
 * 
 * Creates a test PDF, embeds sample signatures, and generates a certificate.
 * Useful for testing the complete PDF generation pipeline.
 */
router.post('/test/full-pdf', asyncHandler(async (req: Request, res: Response) => {
    const {
        documentTitle = 'Test Document',
        includeSignatures = true,
        includeCertificate = true
    } = req.body;

    try {
        // Step 1: Create a test PDF
        const originalPdfBytes = await pdfSigningService.createTestPdf(
            `${documentTitle}\n\nThis is a test document for PDF signing demonstration.\n\nGenerated at: ${new Date().toISOString()}`
        );
        const documentHash = pdfSigningService.calculateDocumentHash(originalPdfBytes);

        // Step 2: Create sample signature data (simple SVG-like canvas signature)
        const sampleSignatureBase64 = createSampleSignature();

        // Step 3: Build signatures array
        const signatures = includeSignatures ? [
            {
                signatureData: sampleSignatureBase64,
                page: 1,
                x: 50,
                y: 100,
                width: 150,
                height: 50,
                signatureId: 'test-sig-1',
                signedAt: new Date(),
                signerName: 'John Doe',
                signerEmail: 'john.doe@example.com'
            },
            {
                signatureData: sampleSignatureBase64,
                page: 1,
                x: 350,
                y: 100,
                width: 150,
                height: 50,
                signatureId: 'test-sig-2',
                signedAt: new Date(),
                signerName: 'Jane Smith',
                signerEmail: 'jane.smith@example.com'
            }
        ] : [];

        // Step 4: Generate signed PDF
        const signedPdfBytes = await pdfSigningService.generateFinalSignedPdf({
            originalPdfBytes,
            signatures,
            appendCertificatePage: includeCertificate,
            documentHash
        });

        // Return test results
        res.json({
            success: true,
            stats: {
                originalSize: originalPdfBytes.length,
                signedSize: signedPdfBytes.length,
                documentHash,
                signaturesEmbedded: signatures.length,
                includedCertificatePage: includeCertificate
            },
            // Return as base64 for easy testing
            signedPdfBase64: Buffer.from(signedPdfBytes).toString('base64')
        });

    } catch (error: any) {
        logger.error('Test PDF generation failed:', error);
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Test Certificate of Completion generation
 * POST /api/v1/esign/test/certificate
 * 
 * Generates a sample Certificate of Completion with mock data.
 */
router.post('/test/certificate', asyncHandler(async (req: Request, res: Response) => {
    const { returnPdf = false } = req.body;

    try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        const certificateBytes = await pdfSigningService.generateCertificateOfCompletion({
            certificateId: `CERT-${new Date().getFullYear()}-PM-000001-TEST`,
            documentTitle: 'Test Lease Agreement - Unit 101',
            documentHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
            envelopeId: '12345678-1234-1234-1234-123456789abc',
            organizationName: 'PropMetrik Test Organization',
            completedAt: now,
            signers: [
                {
                    name: 'John Tenant',
                    email: 'john.tenant@example.com',
                    role: 'Tenant',
                    signedAt: twoHoursAgo,
                    signatureId: 'sig-tenant-001',
                    ipAddress: '192.168.1.100'
                },
                {
                    name: 'Sarah Landlord',
                    email: 'sarah.landlord@property.com',
                    role: 'Landlord',
                    signedAt: now,
                    signatureId: 'sig-landlord-001',
                    ipAddress: '10.0.0.50'
                }
            ],
            auditEvents: [
                {
                    eventType: 'envelope_created',
                    timestamp: yesterday,
                    description: 'Envelope was created',
                    actor: 'System',
                    ipAddress: '10.0.0.1'
                },
                {
                    eventType: 'envelope_sent',
                    timestamp: yesterday,
                    description: 'Envelope sent to John Tenant',
                    actor: 'Sarah Landlord',
                    ipAddress: '10.0.0.50'
                },
                {
                    eventType: 'envelope_viewed',
                    timestamp: twoHoursAgo,
                    description: 'John Tenant viewed the document',
                    actor: 'John Tenant',
                    ipAddress: '192.168.1.100'
                },
                {
                    eventType: 'field_signed',
                    timestamp: twoHoursAgo,
                    description: 'John Tenant signed a field',
                    actor: 'John Tenant',
                    ipAddress: '192.168.1.100'
                },
                {
                    eventType: 'signer_completed',
                    timestamp: twoHoursAgo,
                    description: 'John Tenant completed signing',
                    actor: 'John Tenant',
                    ipAddress: '192.168.1.100'
                },
                {
                    eventType: 'field_signed',
                    timestamp: now,
                    description: 'Sarah Landlord signed a field',
                    actor: 'Sarah Landlord',
                    ipAddress: '10.0.0.50'
                },
                {
                    eventType: 'envelope_completed',
                    timestamp: now,
                    description: 'All signatures collected, envelope completed',
                    actor: 'System',
                    ipAddress: '10.0.0.1'
                }
            ]
        });

        if (returnPdf) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="test-certificate.pdf"');
            res.send(Buffer.from(certificateBytes));
        } else {
            res.json({
                success: true,
                stats: {
                    pdfSize: certificateBytes.length,
                    pages: 2 // Certificate is 2 pages
                },
                certificatePdfBase64: Buffer.from(certificateBytes).toString('base64')
            });
        }

    } catch (error: any) {
        logger.error('Test certificate generation failed:', error);
        res.status(500).json({ error: error.message });
    }
}));

/**
 * Helper: Create a sample signature image for testing
 * Returns a simple PNG-like signature image as base64
 */
function createSampleSignature(): string {
    // This creates a minimal valid 1x1 transparent PNG as a placeholder
    // In real usage, this would be a drawn signature from the canvas
    const minimalPng = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x06, 0x00, 0x00, 0x00, // 8-bit RGBA
        0x1F, 0x15, 0xC4, 0x89, // CRC
        0x00, 0x00, 0x00, 0x0A, // IDAT length
        0x49, 0x44, 0x41, 0x54, // IDAT
        0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
        0x0D, 0x0A, 0x2D, 0xB4, // CRC
        0x00, 0x00, 0x00, 0x00, // IEND length
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // CRC
    ]);
    return `data:image/png;base64,${minimalPng.toString('base64')}`;
}

// =====================================================
// TEMPLATES
// =====================================================

/**
 * Create a new template
 * POST /api/v1/esign/templates
 */
router.post('/templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    try {
        const template = await templateService.createTemplate(organizationId, userId, req.body);
        res.status(201).json({
            success: true,
            data: template
        });
    } catch (error: any) {
        logger.error('Template creation error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
}));

/**
 * List templates for organization
 * GET /api/v1/esign/templates
 */
router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    const { templates, total } = await templateService.listTemplates(organizationId, {
        category: req.query.category as string | undefined,
        search: req.query.search as string | undefined,
        isActive: req.query.isActive === 'false' ? false : true,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    });

    res.json({
        success: true,
        data: templates,
        total
    });
}));

/**
 * Get template categories
 * GET /api/v1/esign/templates/categories
 */
router.get('/templates/categories', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    const categories = await templateService.getCategories(organizationId);
    res.json({
        success: true,
        data: categories
    });
}));

/**
 * Get popular templates
 * GET /api/v1/esign/templates/popular
 */
router.get('/templates/popular', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const templates = await templateService.getPopularTemplates(organizationId, limit);
    res.json({
        success: true,
        data: templates
    });
}));

/**
 * Get template by ID
 * GET /api/v1/esign/templates/:id
 */
router.get('/templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    const template = await templateService.getTemplateById(req.params.id, organizationId);
    if (!template) {
        return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({
        success: true,
        data: template
    });
}));

/**
 * Update a template
 * PUT /api/v1/esign/templates/:id
 */
router.put('/templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    try {
        const template = await templateService.updateTemplate(
            req.params.id,
            organizationId,
            userId,
            req.body
        );
        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }
        res.json({
            success: true,
            data: template
        });
    } catch (error: any) {
        if (error.message.includes('Not authorized')) {
            return res.status(403).json({ success: false, error: error.message });
        }
        res.status(400).json({ success: false, error: error.message });
    }
}));

/**
 * Use a template (increments counter)
 * POST /api/v1/esign/templates/:id/use
 */
router.post('/templates/:id/use', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    const template = await templateService.useTemplate(req.params.id, organizationId);
    if (!template) {
        return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({
        success: true,
        data: template
    });
}));

/**
 * Clone a template
 * POST /api/v1/esign/templates/:id/clone
 */
router.post('/templates/:id/clone', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    const template = await templateService.cloneTemplate(
        req.params.id,
        organizationId,
        userId,
        req.body.name
    );
    if (!template) {
        return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.status(201).json({
        success: true,
        data: template
    });
}));

/**
 * Delete a template (soft delete)
 * DELETE /api/v1/esign/templates/:id
 */
router.delete('/templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    const deleted = await templateService.deleteTemplate(req.params.id, organizationId, userId);
    if (!deleted) {
        return res.status(404).json({ success: false, error: 'Template not found or not authorized' });
    }

    res.json({
        success: true,
        message: 'Template deleted'
    });
}));

// =====================================================
// ENVELOPE-BASED E-SIGN (DocuSign-like)
// =====================================================

/**
 * Create envelope from template
 * POST /api/v1/esign/envelopes/from-template
 */
router.post('/envelopes/from-template', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    const { templateId, ...data } = req.body;

    if (!templateId) {
        return res.status(400).json({ error: 'templateId is required' });
    }

    try {
        const envelope = await esignEnvelopeService.createEnvelopeFromTemplate(
            organizationId,
            userId,
            templateId,
            data
        );
        res.status(201).json({
            success: true,
            data: envelope
        });
    } catch (error: any) {
        logger.error('E-Sign Envelope from Template Error:', error);
        if (error.message === 'Template not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
}));

/**
 * Create and send a new envelope (supports both JSON body and FormData/file upload)
 * POST /api/v1/esign/envelopes
 */
router.post('/envelopes', esignUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    try {
        let envelopeData: any;
        
        // Check if this is a FormData upload (file upload from frontend)
        if (req.file) {
            // Parse signers from FormData string
            let signers = [];
            try {
                signers = req.body.signers ? JSON.parse(req.body.signers) : [];
            } catch {
                signers = [];
            }
            
            // Read the PDF file and convert to base64 for storage
            const pdfBuffer = fs.readFileSync(req.file.path);
            const pdfBase64 = pdfBuffer.toString('base64');
            const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;
            
            envelopeData = {
                name: req.body.name || req.body.title || 'Untitled Document',
                documentHtml: `<div class="pdf-document" data-pdf-url="${pdfDataUrl}">PDF Document: ${req.body.name || req.file.originalname}</div>`,
                documentPdfUrl: pdfDataUrl,
                message: req.body.message || '',
                contextType: req.body.contextType || 'document',
                contextEntityId: req.body.contextEntityId || null,
                contextEntityName: req.body.contextEntityName || req.body.name || req.file.originalname,
                signers: signers.length > 0 ? signers : [{
                    name: 'Signer',
                    email: req.body.signerEmail || 'signer@example.com',
                    role: 'signer',
                    order: 1
                }],
                fields: [], // No predefined fields for uploaded PDFs
                expiresInDays: 30
            };
            
            // Clean up the uploaded file
            fs.unlinkSync(req.file.path);
        } else {
            // Regular JSON body (from lease generation, etc.)
            envelopeData = req.body;
        }
        
        const envelope = await esignEnvelopeService.createAndSendEnvelope(
            organizationId,
            userId,
            envelopeData
        );
        res.status(201).json({
            success: true,
            data: envelope
        });
    } catch (error: any) {
        // Clean up file if it exists and there was an error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        logger.error('E-Sign Envelope Error:', error);
        res.status(400).json({ error: error.message });
    }
}));

/**
 * List envelopes for the organization
 * GET /api/v1/esign/envelopes
 * Query params:
 *   - inbox=true: Filter to show only envelopes where current user has pending signature
 *   - signerEmail: Email to filter by (used with inbox)
 */
router.get('/envelopes', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    
    // Handle inbox filter - get user's email to find pending signatures
    let signerEmail: string | undefined;
    if (req.query.inbox === 'true') {
        signerEmail = req.query.signerEmail as string || getUserEmail(req);
    }

    const { envelopes, total } = await esignEnvelopeService.listEnvelopes(organizationId, {
        status: req.query.status as EnvelopeStatus | undefined,
        contextType: req.query.contextType as string | undefined,
        contextEntityId: req.query.contextEntityId as string | undefined,
        signerEmail,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    });

    res.json({ envelopes, total });
}));

/**
 * Get envelope by ID
 * GET /api/v1/esign/envelopes/:id
 */
router.get('/envelopes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    const envelope = await esignEnvelopeService.getEnvelopeById(req.params.id, organizationId);
    if (!envelope) {
        return res.status(404).json({ error: 'Envelope not found' });
    }

    res.json(envelope);
}));

/**
 * Void an envelope
 * POST /api/v1/esign/envelopes/:id/void
 */
router.post('/envelopes/:id/void', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    try {
        const envelope = await esignEnvelopeService.voidEnvelope(
            req.params.id,
            organizationId,
            userId,
            req.body.reason || 'Voided by sender'
        );
        res.json(envelope);
    } catch (error: any) {
        if (error.message === 'Envelope not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
}));

/**
 * Delete an envelope
 * DELETE /api/v1/esign/envelopes/:id
 */
router.delete('/envelopes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    try {
        await esignEnvelopeService.deleteEnvelope(req.params.id, organizationId);
        res.json({ success: true, message: 'Envelope deleted successfully' });
    } catch (error: any) {
        if (error.message === 'Envelope not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
}));

/**
 * Resend envelope to pending signers
 * POST /api/v1/esign/envelopes/:id/resend
 */
router.post('/envelopes/:id/resend', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    try {
        const envelope = await esignEnvelopeService.resendEnvelope(req.params.id, organizationId, userId);
        res.json(envelope);
    } catch (error: any) {
        if (error.message === 'Envelope not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
}));

/**
 * Get audit log for an envelope
 * GET /api/v1/esign/envelopes/:id/audit
 */
router.get('/envelopes/:id/audit', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    try {
        const auditLog = await esignEnvelopeService.getAuditLog(req.params.id, organizationId);
        res.json(auditLog);
    } catch (error: any) {
        if (error.message === 'Envelope not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
}));

/**
 * Get envelope for external signing (public endpoint)
 * GET /api/v1/esign/sign/:token
 */
router.get('/sign-envelope/:token', asyncHandler(async (req: Request, res: Response) => {
    const data = await esignEnvelopeService.getEnvelopeByAccessToken(req.params.token);
    if (!data) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    res.json(data);
}));

/**
 * Sign a specific field (public endpoint)
 * POST /api/v1/esign/sign/:token/fields/:fieldId
 */
router.post('/sign-envelope/:token/fields/:fieldId', asyncHandler(async (req: Request, res: Response) => {
    const { value, fontFamily } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
    const userAgent = req.headers['user-agent'];

    try {
        const field = await esignEnvelopeService.signField(
            req.params.token,
            req.params.fieldId,
            value,
            fontFamily,
            ipAddress,
            userAgent
        );
        
        // Return field with signature details
        res.json({
            success: true,
            ...field,
            signatureHash: field.signatureHash,
            signerIdentityId: field.signerIdentityId,
        });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
}));

/**
 * Download signed PDF for an envelope
 * GET /api/v1/esign/envelopes/:id/download
 * 
 * Returns the original PDF with all signatures embedded at their field positions.
 * Only available for completed or voided envelopes.
 */
router.get('/envelopes/:id/download', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const includeAuditPage = req.query.includeAuditPage !== 'false'; // Default to true

    try {
        // Get envelope with signers and fields
        const envelope = await esignEnvelopeService.getEnvelopeById(req.params.id, organizationId);
        if (!envelope) {
            return res.status(404).json({ error: 'Envelope not found' });
        }

        // Check envelope status - only allow download for completed/voided envelopes or if admin
        const allowedStatuses: EnvelopeStatus[] = [EnvelopeStatus.COMPLETED, EnvelopeStatus.VOIDED];
        if (!allowedStatuses.includes(envelope.status)) {
            return res.status(400).json({
                error: 'Signed PDF is only available for completed or voided envelopes',
                currentStatus: envelope.status
            });
        }

        // Get the original PDF from storage, or generate from stored image if missing
        let originalPdfBytes: Uint8Array;

        if (envelope.documentPdfUrl) {
            // Parse the storage URL to get bucket and key
            // Format: "bucket/path/to/file.pdf" or just "path/to/file.pdf"
            let bucket = buckets.documents;
            let key = envelope.documentPdfUrl;

            if (envelope.documentPdfUrl.includes('/')) {
                const parts = envelope.documentPdfUrl.split('/');
                if (parts[0] === buckets.documents || parts[0] === buckets.uploads) {
                    bucket = parts[0];
                    key = parts.slice(1).join('/');
                }
            }

            const { body } = await getFile(bucket, key);
            originalPdfBytes = body;
        } else if (envelope.documentImageUrl) {
            // Generate a single-page PDF from the captured document image
            const pdfDoc = await PDFDocument.create();
            const imageBase64 = envelope.documentImageUrl.replace(/^data:image\/\w+;base64,/, '');
            const imageBytes = Buffer.from(imageBase64, 'base64');

            let image;
            if (envelope.documentImageUrl.includes('image/png')) {
                image = await pdfDoc.embedPng(imageBytes);
            } else {
                image = await pdfDoc.embedJpg(imageBytes);
            }

            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height,
            });

            originalPdfBytes = await pdfDoc.save();
        } else {
            return res.status(404).json({ error: 'Original document not found' });
        }

        // Load PDF to get page dimensions
        // When the PDF is generated from the same captured document image,
        // the PDF page size equals the captured image size - NO SCALING NEEDED
        const pdfDoc = await PDFDocument.load(originalPdfBytes);
        const pdfPages = pdfDoc.getPages();

        // Log all fields for debugging
        logger.info('Envelope fields for PDF download:', {
            envelopeId: envelope.id,
            totalFields: envelope.fields?.length || 0,
            signatureFields: envelope.fields?.filter(f => f.fieldType === 'signature').map(f => ({
                id: f.id,
                signerId: f.signerId,
                hasValue: !!f.value,
                x: f.xPosition,
                y: f.yPosition,
                width: f.width,
                height: f.height,
                signatureHash: f.signatureHash,
                signedAt: f.signedAt
            })),
            signers: envelope.signers?.map(s => ({
                id: s.id,
                name: s.name,
                status: s.status,
                permanentSignerId: s.permanentSignerId
            })),
            pdfPageSize: pdfPages[0]?.getSize()
        });

        // Collect all signature fields with their data
        // INVARIANT: Field coordinates are absolute pixels relative to the captured document image
        // The PDF is generated from the same image, so coordinates are used AS-IS
        // Only Y-axis flip is needed (handled by pdfSigningService with usePercentage: false)
        const signatureFields = (envelope.fields || [])
            .filter(f => f.fieldType === 'signature' && f.value)
            .map(f => {
                // Find the signer for this field
                const signer = (envelope.signers || []).find(s => s.id === f.signerId);

                // Convert signedAt to Date if it's a string
                const signedAtDate = f.signedAt 
                    ? (f.signedAt instanceof Date ? f.signedAt : new Date(f.signedAt))
                    : undefined;

                // Pass coordinates AS-IS to pdfSigningService
                // usePercentage: false tells pdfSigningService to:
                //   - Use x,y as absolute pixels (not percentages)
                //   - Do the Y-axis flip internally (browser origin = top-left, PDF origin = bottom-left)
                const signatureField = {
                    signatureData: f.value!,
                    page: f.page || 1,
                    x: f.xPosition,           // Absolute pixels from left
                    y: f.yPosition,           // Absolute pixels from top (pdfSigningService will flip)
                    width: f.width,           // Absolute pixels
                    height: f.height,         // Absolute pixels
                    signatureId: signer?.permanentSignerId,
                    signatureHash: f.signatureHash,
                    signedAt: signedAtDate,
                    signerName: signer?.name,
                    signerEmail: signer?.email,
                    usePercentage: false      // Tells pdfSigningService these are absolute pixels
                };

                logger.info('Prepared signature field for embedding:', {
                    fieldId: f.id,
                    signerName: signer?.name,
                    permanentSignerId: signer?.permanentSignerId,
                    signatureHash: f.signatureHash,
                    coords: { x: f.xPosition, y: f.yPosition },
                    dimensions: { width: f.width, height: f.height }
                });

                return signatureField;
            });

        // Generate the signed PDF with embedded signatures
        const documentHash = pdfSigningService.calculateDocumentHash(originalPdfBytes);

        const signedPdfBytes = await pdfSigningService.generateFinalSignedPdf({
            originalPdfBytes,
            signatures: signatureFields,
            appendCertificatePage: includeAuditPage,
            documentHash
        });

        // Set response headers for PDF download
        const filename = `${envelope.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_signed.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', signedPdfBytes.length);

        // Send the PDF
        res.send(Buffer.from(signedPdfBytes));

    } catch (error: any) {
        logger.error('Error downloading signed PDF:', error);
        if (error.message === 'Envelope not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to generate signed PDF' });
    }
}));

/**
 * Download Certificate of Completion for an envelope
 * GET /api/v1/esign/envelopes/:id/certificate
 * 
 * Returns a standalone Certificate of Completion PDF with full audit trail.
 * Only available for completed envelopes.
 */
router.get('/envelopes/:id/certificate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    try {
        // Get envelope with signers and fields
        const envelope = await esignEnvelopeService.getEnvelopeById(req.params.id, organizationId);
        if (!envelope) {
            return res.status(404).json({ error: 'Envelope not found' });
        }

        // Certificate only available for completed envelopes
        if (envelope.status !== 'completed') {
            return res.status(400).json({
                error: 'Certificate of Completion is only available for completed envelopes',
                currentStatus: envelope.status
            });
        }

        // Get audit log for the envelope
        const auditLog = await esignEnvelopeService.getAuditLog(req.params.id, organizationId);

        // Get organization name
        const orgResult = await dbQuery('SELECT name FROM organizations WHERE id = $1', [organizationId]);
        const organizationName = orgResult.rows[0]?.name || 'PropMetrik';

        // Check for existing certificate or generate a new ID
        const certResult = await dbQuery(
            'SELECT certificate_id FROM esign_certificates WHERE envelope_id = $1',
            [req.params.id]
        );

        let certificateId: string;
        if (certResult.rows.length > 0) {
            certificateId = certResult.rows[0].certificate_id;
        } else {
            // Generate certificate ID: CERT-YYYY-PM-NNNNNN-XXXX
            const year = new Date().getFullYear();
            const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
            const sequenceResult = await dbQuery('SELECT COUNT(*) FROM esign_certificates');
            const sequence = (parseInt(sequenceResult.rows[0].count) + 1).toString().padStart(6, '0');
            certificateId = `CERT-${year}-PM-${sequence}-${randomPart}`;
        }

        // Calculate document hash if we have the PDF
        let documentHash = '';
        if (envelope.documentPdfUrl) {
            try {
                let bucket = buckets.documents;
                let key = envelope.documentPdfUrl;
                if (envelope.documentPdfUrl.includes('/')) {
                    const parts = envelope.documentPdfUrl.split('/');
                    if (parts[0] === buckets.documents || parts[0] === buckets.uploads) {
                        bucket = parts[0];
                        key = parts.slice(1).join('/');
                    }
                }
                const { body: pdfBytes } = await getFile(bucket, key);
                documentHash = pdfSigningService.calculateDocumentHash(pdfBytes);
            } catch (e) {
                logger.warn('Could not calculate document hash for certificate:', e);
            }
        }

        // Build signers summary
        const signers = (envelope.signers || [])
            .filter(s => s.signedAt)
            .map(s => ({
                name: s.name,
                email: s.email,
                role: s.role,
                signedAt: s.signedAt!,
                signatureId: s.id,
                ipAddress: s.signedFromIp,
                userAgent: s.signedUserAgent
            }));

        // Build audit events
        const auditEvents = auditLog.map(log => ({
            eventType: log.eventType,
            timestamp: log.createdAt,
            description: getAuditEventDescription(log.eventType, log.signerName),
            actor: log.signerName || log.signerEmail,
            ipAddress: log.ipAddress
        }));

        // Generate the Certificate PDF
        const certificatePdfBytes = await pdfSigningService.generateCertificateOfCompletion({
            certificateId,
            documentTitle: envelope.name,
            documentHash,
            envelopeId: envelope.id,
            organizationName,
            completedAt: envelope.completedAt!,
            signers,
            auditEvents
        });

        // Save or update certificate record
        if (certResult.rows.length === 0) {
            await dbQuery(`
                INSERT INTO esign_certificates (
                    certificate_id, envelope_id, document_hash, signers_summary
                ) VALUES ($1, $2, $3, $4)
            `, [certificateId, envelope.id, documentHash, JSON.stringify(signers)]);
        }

        // Set response headers for PDF download
        const filename = `Certificate_${certificateId}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', certificatePdfBytes.length);

        // Send the PDF
        res.send(Buffer.from(certificatePdfBytes));

    } catch (error: any) {
        logger.error('Error generating certificate:', error);
        if (error.message === 'Envelope not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to generate certificate' });
    }
}));

/**
 * Helper: Convert audit event type to human-readable description
 */
function getAuditEventDescription(eventType: string, signerName?: string): string {
    const actor = signerName || 'User';
    const descriptions: Record<string, string> = {
        'envelope_created': 'Envelope was created',
        'envelope_sent': 'Envelope was sent for signing',
        'envelope_viewed': `${actor} viewed the document`,
        'field_signed': `${actor} signed a field`,
        'signer_completed': `${actor} completed signing`,
        'envelope_completed': 'All signatures collected, envelope completed',
        'envelope_voided': 'Envelope was voided',
        'envelope_declined': `${actor} declined to sign`,
        'reminder_sent': `Reminder sent to ${actor}`,
        'access_token_generated': `Signing link generated for ${actor}`,
        'signature_captured': `${actor} captured signature`
    };
    return descriptions[eventType] || eventType.replace(/_/g, ' ');
}

// Helper to get default org ID
async function getDefaultOrgId(): Promise<string> {
    const result = await dbQuery('SELECT id FROM organizations LIMIT 1');
    return result.rows[0]?.id || '00000000-0000-0000-0000-000000000000';
}

export default router;
