/**
 * E-Signature API Routes
 * Endpoints for e-signature functionality
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { scanUploadedFile } from '../middleware/virusScan';
import { authenticate } from '../middleware/auth';
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
    ExternalSignatureDto,
    CreateEnvelopeDto
} from '../../shared-services/e-sign/types';
import { logger } from '../utils/logger';
import { pool, query as dbQuery } from '../database';
import { getFile, uploadFile, buckets, getPresignedDownloadUrl } from '../database/minio';
import { notify } from '../../shared-services/notifications/notify';
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

// Extract user ID from JWT (set by auth middleware)
// Throws a structured error for proper 401 response via asyncHandler + error handler
const getUserId = (req: Request): string => {
    const jwtUserId = (req as any).userId || (req as any).user?.id;
    if (jwtUserId) return jwtUserId;

    // Fall back to header (for internal/webhook calls)
    const headerUserId = req.headers['x-user-id'] as string;
    if (headerUserId) return headerUserId;

    const err: any = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
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

const maybeProcessPropertyManagementCompletion = async (envelopeId: string): Promise<void> => {
    const envelopeResult = await dbQuery(
        `SELECT id, name, status, completed_at, context_type, context_entity_id, context_entity_name,
                signed_pdf_url, document_pdf_url, document_image_url, organization_id, created_by
         FROM esign_envelopes
         WHERE id = $1`,
        [envelopeId]
    );

    if (envelopeResult.rows.length === 0) {
        return;
    }

    const envelopeRow = envelopeResult.rows[0];
    if (envelopeRow.status !== 'completed') {
        return;
    }

    // --- Generate and store signed PDF if not already done ---
    let signedDocumentUrl = envelopeRow.signed_pdf_url;

    if (!signedDocumentUrl && (envelopeRow.document_pdf_url || envelopeRow.document_image_url)) {
        try {
            // 1. Get the original PDF bytes
            let originalPdfBytes: Uint8Array;

            if (envelopeRow.document_pdf_url && envelopeRow.document_pdf_url.startsWith('data:')) {
                // Stored inline as a base64 data URL (designer-uploaded leases) — decode directly.
                const base64 = envelopeRow.document_pdf_url.replace(/^data:application\/pdf;base64,/, '');
                originalPdfBytes = new Uint8Array(Buffer.from(base64, 'base64'));
            } else if (envelopeRow.document_pdf_url) {
                let bucket = buckets.documents;
                let key = envelopeRow.document_pdf_url;

                if (envelopeRow.document_pdf_url.includes('/')) {
                    const parts = envelopeRow.document_pdf_url.split('/');
                    if (parts[0] === buckets.documents || parts[0] === buckets.uploads) {
                        bucket = parts[0];
                        key = parts.slice(1).join('/');
                    }
                }

                const { body } = await getFile(bucket, key);
                originalPdfBytes = body;
            } else {
                // Generate PDF from document image
                const pdfDoc = await PDFDocument.create();
                const imageBase64 = envelopeRow.document_image_url.replace(/^data:image\/\w+;base64,/, '');
                const imageBytes = Buffer.from(imageBase64, 'base64');

                let image;
                if (envelopeRow.document_image_url.includes('image/png')) {
                    image = await pdfDoc.embedPng(imageBytes);
                } else {
                    image = await pdfDoc.embedJpg(imageBytes);
                }

                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
                originalPdfBytes = await pdfDoc.save();
            }

            // 2. Get signature AND date_signed fields from esign_fields
            const fieldsResult = await dbQuery(
                `SELECT ef.id, ef.field_type, ef.value, ef.page, ef.x_position, ef.y_position,
                        ef.width, ef.height, ef.signed_at, ef.signer_id,
                        es.name as signer_name, es.email as signer_email
                 FROM esign_fields ef
                 LEFT JOIN esign_signers es ON es.id = ef.signer_id
                 WHERE ef.envelope_id = $1 AND ef.field_type IN ('signature', 'date_signed') AND ef.value IS NOT NULL`,
                [envelopeId]
            );

            const sigRows = fieldsResult.rows.filter((f: any) => f.field_type === 'signature');
            const dateRows = fieldsResult.rows.filter((f: any) => f.field_type === 'date_signed');

            if (sigRows.length > 0) {
                // Resolve PMT signer IDs when permanent_signer_id is empty
                const resolveSignerId = async (email: string, existingId: string | null): Promise<string> => {
                    if (existingId) return existingId;
                    if (!email) return '';
                    const userRes = await dbQuery(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]).catch(() => ({ rows: [] }));
                    if (userRes.rows.length > 0) {
                        const raw = userRes.rows[0].id.replace(/-/g, '');
                        return `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
                    }
                    const tenantRes = await dbQuery(`SELECT id FROM tenants WHERE email = $1 LIMIT 1`, [email]).catch(() => ({ rows: [] }));
                    if (tenantRes.rows.length > 0) {
                        const raw = tenantRes.rows[0].id.replace(/-/g, '');
                        return `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
                    }
                    // Last resort: deterministic PMT id from the email (so external signers still get one).
                    const hash = createHash('sha256').update(email.toLowerCase()).digest('hex');
                    return `PMT-${hash.substring(0, 4).toUpperCase()}-${hash.substring(4, 8).toUpperCase()}`;
                };

                const signatureFields = await Promise.all(sigRows.map(async (f: any) => ({
                    signatureData: f.value,
                    page: f.page || 1,
                    x: f.x_position,
                    y: f.y_position,
                    width: f.width,
                    height: f.height,
                    signatureId: await resolveSignerId(f.signer_email, f.permanent_signer_id),
                    signedAt: f.signed_at ? new Date(f.signed_at) : undefined,
                    signerName: f.signer_name,
                    signerEmail: f.signer_email,
                    // Fields are placed by FieldPlacement as percentages (0-100) of the page
                    usePercentage: true,
                })));

                const dateFields = dateRows.map((f: any) => ({
                    value: f.value,
                    page: f.page || 1,
                    x: f.x_position,
                    y: f.y_position,
                    width: f.width,
                    height: f.height,
                    usePercentage: true,
                }));

                // Get signers and audit for full certificate
                const signersRes = await dbQuery(
                    `SELECT name, email, role, signed_at, signed_from_ip, signed_user_agent
                     FROM esign_signers WHERE envelope_id = $1 AND status = 'signed' ORDER BY signing_order`,
                    [envelopeId]
                ).catch(() => ({ rows: [] }));

                const auditRes = await dbQuery(
                    `SELECT event_type, created_at as timestamp, event_data, ip_address
                     FROM esign_audit_log WHERE envelope_id = $1 ORDER BY created_at ASC`,
                    [envelopeId]
                ).catch(() => ({ rows: [] }));

                // 3. Generate the signed PDF with embedded signatures
                const documentHash = pdfSigningService.calculateDocumentHash(originalPdfBytes);
                const signedPdfBytes = await pdfSigningService.generateFinalSignedPdf({
                    originalPdfBytes,
                    signatures: signatureFields,
                    dateFields,
                    appendCertificatePage: true,
                    documentHash,
                    envelopeId,
                    documentTitle: envelopeRow.name,
                    signers: await Promise.all(signersRes.rows.map(async (s: any) => ({
                        name: s.name,
                        email: s.email,
                        role: s.role || 'signer',
                        signedAt: new Date(s.signed_at),
                        signatureId: await resolveSignerId(s.email, s.permanent_signer_id),
                        ipAddress: s.signed_from_ip,
                        userAgent: s.signed_user_agent,
                    }))),
                    auditEvents: auditRes.rows.map((e: any) => ({
                        eventType: e.event_type,
                        timestamp: new Date(e.timestamp),
                        description: e.event_type,
                        actor: typeof e.event_data === 'object' ? e.event_data?.actor : undefined,
                        ipAddress: e.ip_address,
                    })),
                });

                // 4. Upload signed PDF to MinIO
                const signedKey = `esign/signed/${envelopeId}_signed.pdf`;
                await uploadFile(
                    buckets.documents,
                    signedKey,
                    Buffer.from(signedPdfBytes),
                    'application/pdf',
                    { envelopeId, type: 'signed-lease' }
                );

                // 5. Update the envelope with the signed PDF URL
                await dbQuery(
                    `UPDATE esign_envelopes SET signed_pdf_url = $2, updated_at = NOW() WHERE id = $1`,
                    [envelopeId, signedKey]
                );

                signedDocumentUrl = signedKey;
                logger.info('Generated and stored signed PDF for envelope', { envelopeId, signedKey });
            }
        } catch (pdfError: any) {
            logger.error('Failed to generate signed PDF during completion', {
                envelopeId,
                error: pdfError?.message || 'Unknown error'
            });
            // Fall back to unsigned PDF URL
            signedDocumentUrl = envelopeRow.document_pdf_url;
        }
    }

    // If we still don't have a URL, use the document_pdf_url as fallback
    if (!signedDocumentUrl) {
        signedDocumentUrl = envelopeRow.document_pdf_url;
    }

    // --- Email every signer the fully-executed document (the signed PDF ends with the
    // certificate-of-completion page). Best-effort; never blocks completion processing. ---
    try {
        const allSigners = await dbQuery(
            `SELECT name, email FROM esign_signers
             WHERE envelope_id = $1 AND email IS NOT NULL AND email <> ''
             ORDER BY signing_order`,
            [envelopeId]
        );

        // Load the signed PDF bytes once: used both to attach the file and to presign a link.
        let signedPdfBuffer: Buffer | null = null;
        let downloadUrl: string | null = null;
        if (signedDocumentUrl && signedDocumentUrl.startsWith('data:')) {
            const b64 = signedDocumentUrl.replace(/^data:application\/pdf;base64,/, '');
            signedPdfBuffer = Buffer.from(b64, 'base64');
        } else if (signedDocumentUrl) {
            let bucket = buckets.documents;
            let key = signedDocumentUrl;
            const parts = signedDocumentUrl.split('/');
            if (parts.length > 1 && (parts[0] === buckets.documents || parts[0] === buckets.uploads)) {
                bucket = parts[0];
                key = parts.slice(1).join('/');
            }
            // Presign for the in-body link (works even if the attachment is stripped by a mail client).
            downloadUrl = await getPresignedDownloadUrl(bucket, key, 7 * 24 * 60 * 60).catch(() => null);
            // Pull the actual bytes so we can attach the executed PDF directly to the email.
            try {
                const { body } = await getFile(bucket, key);
                signedPdfBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
            } catch (e: any) {
                logger.warn('Could not load signed PDF for email attachment', { envelopeId, error: e?.message });
            }
        }

        const docName = envelopeRow.name || 'Signed Document';
        const attachmentName = `${docName.replace(/[^a-zA-Z0-9_-]+/g, '_')}_signed.pdf`;
        const emailAttachments = signedPdfBuffer
            ? [{ filename: attachmentName, content: signedPdfBuffer, contentType: 'application/pdf' }]
            : undefined;
        const attachNote = emailAttachments
            ? `<p style="color:#111827;">The fully-executed PDF is <strong>attached to this email</strong>.</p>`
            : '';
        const linkBlock = downloadUrl
            ? `${attachNote}<p style="margin:24px 0;"><a href="${downloadUrl}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Download signed document</a></p>
               <p style="color:#6b7280;font-size:13px;">Or paste this link into your browser:<br>${downloadUrl}</p>`
            : (attachNote || `<p style="color:#6b7280;">Your fully-executed copy is available from your PropMetrik account.</p>`);

        for (const s of allSigners.rows) {
            const greeting = s.name ? `Hi ${s.name},` : 'Hello,';
            const html = `
                <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:560px;margin:0 auto;">
                  <h2 style="color:#059669;">Signing complete</h2>
                  <p>${greeting}</p>
                  <p>All parties have signed <strong>"${docName}"</strong>. Your fully-executed copy — including the certificate of completion — is ready.</p>
                  ${linkBlock}
                  <p style="color:#6b7280;font-size:13px;">Completed via PropMetrik e-Sign. The certificate of completion is the final page of the document.</p>
                </div>`;
            await notify({
                recipients: [{ audience: 'staff', userId: '', email: s.email, name: s.name }],
                category: 'esign',
                type: 'esign.completed',
                title: `Completed & signed: ${docName}`,
                body: `All parties have signed "${docName}". Your executed copy is ready to download.`,
                priority: 'normal',
                channels: { email: true },
                sourceUrl: downloadUrl || undefined,
                email: { subject: `Completed & signed: ${docName}`, html, attachments: emailAttachments },
            }).catch((e: any) => logger.warn('Completion email failed for a signer', { envelopeId, email: s.email, error: e?.message }));
        }
        logger.info('Sent completion emails to signers', { envelopeId, recipients: allSigners.rows.length });
    } catch (emailError: any) {
        logger.error('Failed to send completion emails', { envelopeId, error: emailError?.message || 'Unknown error' });
    }

    let tenancyId: string | null = null;

    if (
        envelopeRow.context_type === 'property_management' &&
        envelopeRow.context_entity_name === 'tenancy' &&
        envelopeRow.context_entity_id
    ) {
        tenancyId = envelopeRow.context_entity_id;
    }

    if (!tenancyId && envelopeRow.context_type === 'lease' && envelopeRow.context_entity_id) {
        const cid = envelopeRow.context_entity_id;
        // The e-sign designer stores the TENANCY id directly; older flows stored the APPLICATION
        // id. Accept either: try as a tenancy first, then fall back to an application lookup.
        const tenancyDirect = await dbQuery(`SELECT id FROM tenancies WHERE id = $1`, [cid]).catch(() => ({ rows: [] }));
        if (tenancyDirect.rows.length > 0) {
            tenancyId = cid;
        } else {
            const applicationLinkResult = await dbQuery(`SELECT tenancy_id FROM applications WHERE id = $1`, [cid]);
            tenancyId = applicationLinkResult.rows[0]?.tenancy_id || null;
        }
    }

    if (!tenancyId) {
        return;
    }

    const signerRowsResult = await dbQuery(
        `SELECT id, email, name, signed_at
         FROM esign_signers
         WHERE envelope_id = $1 AND status = 'signed'
         ORDER BY signing_order ASC`,
        [envelopeId]
    );

    const completedAt = envelopeRow.completed_at || new Date();
    const securityHash = createHash('sha256')
        .update([envelopeId, signedDocumentUrl || '', new Date(completedAt).toISOString()].join('|'))
        .digest('hex');

    // storeSignedLeaseDocument (in handleEsignCompletion) only accepts data:/http/s3:// refs.
    // Our generated signed PDF is a bare MinIO key — normalize it to an s3:// object ref.
    let signedLeaseRef = signedDocumentUrl;
    if (signedDocumentUrl
        && !signedDocumentUrl.startsWith('data:')
        && !signedDocumentUrl.startsWith('http')
        && !signedDocumentUrl.startsWith('s3://')) {
        let bucket = buckets.documents;
        let key = signedDocumentUrl;
        const parts = signedDocumentUrl.split('/');
        if (parts.length > 1 && (parts[0] === buckets.documents || parts[0] === buckets.uploads)) {
            bucket = parts[0];
            key = parts.slice(1).join('/');
        }
        signedLeaseRef = `s3://${bucket}/${key}`;
    }

    const completionEvent = {
        event: 'envelope.completed' as const,
        timestamp: new Date(),
        envelope: {
            id: envelopeId,
            subject: envelopeRow.name || 'Signed Document',
            completedAt: new Date(completedAt)
        },
        sourceContext: {
            module: 'property_management' as const,
            entityType: 'tenancy' as const,
            entityId: tenancyId
        },
        documents: [{
            id: envelopeId,
            name: envelopeRow.name || 'Signed Document',
            signedUrl: signedLeaseRef,
            certificateUrl: undefined
        }],
        signers: signerRowsResult.rows.map((row: any) => ({
            email: row.email,
            name: row.name,
            pmtId: row.id,
            signedAt: row.signed_at ? new Date(row.signed_at) : new Date(completedAt)
        })),
        security: {
            hash: securityHash,
            algorithm: 'SHA-256' as const,
            verifyUrl: `/api/v1/esign/envelopes/${envelopeId}/certificate`
        }
    };

    // Make the signed tenancy produce an active tenant automatically (no separate "convert"
    // step that would create a divergent tenancy). Best-effort; runs before activation below.
    if (envelopeRow.organization_id) {
        try {
            const { applicationService } = await import('../services/property-management/applications/applicationService');
            await applicationService.ensureTenantForSignedTenancy(
                tenancyId,
                envelopeRow.organization_id,
                envelopeRow.created_by || null
            );
        } catch (e: any) {
            logger.warn('ensureTenantForSignedTenancy failed (non-fatal)', { envelopeId, tenancyId, error: e?.message });
        }
    }

    try {
        const { tenancyService } = await import('../services/property-management/leases/tenancyService');
        await tenancyService.handleEsignCompletion(completionEvent);
    } catch (e: any) {
        logger.error('handleEsignCompletion failed', { envelopeId, tenancyId, error: e?.message });
    }
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
            evidenceIds.push(evidence.id!);
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
 * Get or create a permanent signer ID (PMT-XXXX-XXXX) for a user
 * POST /api/v1/esign/users/get-or-create-signer-id
 * 
 * PMT IDs are derived from the first section of the user's UUID and persisted
 * in esign_signer_identities. Once assigned, they follow the user forever
 * across all signing contexts (leases, valuation reports, change orders,
 * property purchases, etc.) for consistency and audit trail.
 */
router.post('/users/get-or-create-signer-id', asyncHandler(async (req: Request, res: Response) => {
    const { email, name } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Helper: generate PMT ID from UUID — takes first 8 hex chars of the UUID (first section)
    const pmtFromUuid = (uuid: string) => {
        const raw = uuid.replace(/-/g, '');
        return `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
    };

    // Resolve the user ID — prefer real JWT userId, then lookup by email
    // IMPORTANT: Do NOT use the dev-fallback getUserId() here — only real JWT
    let resolvedUserId: string | null = null;
    const realJwtUserId = (req as any).userId || (req as any).user?.id || (req.headers['x-user-id'] as string) || null;

    // Check if JWT userId corresponds to a real user
    if (realJwtUserId) {
        const userByIdRes = await dbQuery(
            'SELECT id FROM users WHERE id = $1 LIMIT 1', [realJwtUserId]
        ).catch(() => ({ rows: [] }));
        if (userByIdRes.rows.length > 0) {
            resolvedUserId = userByIdRes.rows[0].id;
        }
    }

    // If JWT didn't resolve, try email lookup in users table
    if (!resolvedUserId) {
        const userByEmail = await dbQuery(
            'SELECT id FROM users WHERE email = $1 LIMIT 1', [email]
        ).catch(() => ({ rows: [] }));
        if (userByEmail.rows.length > 0) {
            resolvedUserId = userByEmail.rows[0].id;
        }
    }

    // Try tenants table by email
    if (!resolvedUserId) {
        const tenantByEmail = await dbQuery(
            'SELECT id FROM tenants WHERE email = $1 LIMIT 1', [email]
        ).catch(() => ({ rows: [] }));
        if (tenantByEmail.rows.length > 0) {
            resolvedUserId = tenantByEmail.rows[0].id;
        }
    }

    // ── Step 1: Check if this user/email already has a persisted PMT ID ──
    // Look up by user_id first (handles email changes), then by email
    let existingIdentity: any = null;

    if (resolvedUserId) {
        const byUserId = await dbQuery(
            'SELECT permanent_id FROM esign_signer_identities WHERE user_id = $1 LIMIT 1',
            [resolvedUserId]
        ).catch(() => ({ rows: [] }));
        if (byUserId.rows.length > 0) {
            existingIdentity = byUserId.rows[0];
        }
    }

    if (!existingIdentity) {
        const byEmail = await dbQuery(
            'SELECT permanent_id, user_id FROM esign_signer_identities WHERE email = $1 LIMIT 1',
            [email]
        ).catch(() => ({ rows: [] }));
        if (byEmail.rows.length > 0) {
            existingIdentity = byEmail.rows[0];
            // If we now have a resolved user ID but the record doesn't, backfill it
            if (resolvedUserId && !byEmail.rows[0].user_id) {
                await dbQuery(
                    'UPDATE esign_signer_identities SET user_id = $1 WHERE email = $2',
                    [resolvedUserId, email]
                ).catch(() => {});
            }
        }
    }

    if (existingIdentity?.permanent_id) {
        // PMT ID already persisted — return it (consistent forever)
        return res.json({ success: true, signer_pmt_id: existingIdentity.permanent_id });
    }

    // ── Step 2: Generate new PMT ID and persist it ──
    let pmtId: string;

    if (resolvedUserId) {
        // Derive from UUID first section — stable and deterministic
        pmtId = pmtFromUuid(resolvedUserId);
    } else {
        // External signer with no user/tenant record — hash the email
        const hash = createHash('sha256').update(email.toLowerCase()).digest('hex');
        pmtId = `PMT-${hash.substring(0, 4).toUpperCase()}-${hash.substring(4, 8).toUpperCase()}`;
    }

    // Persist in esign_signer_identities so it follows the user forever
    try {
        await dbQuery(
            `INSERT INTO esign_signer_identities (id, email, user_id, permanent_id, display_name, total_signatures, first_signed_at, last_signed_at, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, NOW(), NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET
               permanent_id = COALESCE(esign_signer_identities.permanent_id, $3),
               user_id = COALESCE(esign_signer_identities.user_id, $2),
               display_name = COALESCE(NULLIF($4, ''), esign_signer_identities.display_name)`,
            [email, resolvedUserId, pmtId, name || email.split('@')[0]]
        );
        logger.info('Persisted PMT signer ID', { email, pmtId, userId: resolvedUserId });
    } catch (persistErr: any) {
        // Log but don't fail — the PMT ID is still valid even if persistence fails
        logger.warn('Could not persist PMT signer ID', { email, pmtId, error: persistErr?.message });
    }

    return res.json({ success: true, signer_pmt_id: pmtId });
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
            organizationName: 'PROPMETRIK Test Organization',
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
 * Create envelope from self-sign flow (SelfSignComplete component)
 * POST /api/v1/esign/envelopes/create
 * 
 * Accepts FormData with:
 *   - envelope_data: JSON string with envelope metadata
 *   - files: The signed PDF file
 * 
 * For self-signed envelopes, generates a Certificate of Completion
 * and appends it to the stored PDF.
 */
router.post('/envelopes/create', esignUpload.single('files'), scanUploadedFile, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);

    try {
        // Parse envelope data from the FormData JSON string
        let envelopeDataRaw: any;
        try {
            envelopeDataRaw = req.body.envelope_data ? JSON.parse(req.body.envelope_data) : req.body;
        } catch {
            envelopeDataRaw = req.body;
        }

        const isSelfSigned = envelopeDataRaw.isSelfSigned === true || envelopeDataRaw.status === 'completed';
        const recipients = envelopeDataRaw.recipients || [];
        const fields = envelopeDataRaw.fields || [];

        // Read the uploaded PDF if provided
        let pdfBuffer: Buffer | null = null;
        let pdfDataUrl: string | null = null;
        if (req.file) {
            pdfBuffer = fs.readFileSync(req.file.path);
            const pdfBase64 = pdfBuffer.toString('base64');
            pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;
            fs.unlinkSync(req.file.path); // Clean up temp file
        }

        // Map fields to the format expected by envelope service
        const mapFieldType = (t: string): string => {
            switch (t) {
                case 'initial': return 'initials';
                case 'name': return 'text';
                default: return t;
            }
        };

        const flatFields = fields.map((f: any) => ({
            signerEmail: f.recipientEmail || recipients[0]?.email || '',
            type: mapFieldType(f.type || 'signature'),
            page: f.page || 1,
            x: f.x ?? 0,
            y: f.y ?? 0,
            width: f.width ?? 200,
            height: f.height ?? 50,
            required: f.required !== false,
            label: f.label || null,
            value: f.value || null,
            signed: isSelfSigned,
        }));

        // Build envelope DTO
        const envelopeData: CreateEnvelopeDto = {
            name: envelopeDataRaw.subject || 'Self-Signed Document',
            message: envelopeDataRaw.message || '',
            documentHtml: pdfDataUrl
                ? `<div class="pdf-document" data-pdf-url="${pdfDataUrl}">PDF Document</div>`
                : undefined,
            documentPdfUrl: pdfDataUrl || undefined,
            contextType: envelopeDataRaw.contextType || (isSelfSigned ? 'self_signed' : 'document'),
            contextEntityId: envelopeDataRaw.contextEntityId || null,
            contextEntityName: envelopeDataRaw.contextEntityName || null,
            autoSend: isSelfSigned ? false : true,
            initialStatus: isSelfSigned ? 'completed' : undefined,
            signers: recipients.map((r: any, i: number) => ({
                name: r.name || 'Signer',
                email: r.email,
                role: r.role || 'signer',
                order: r.order || i + 1,
            })),
            fields: flatFields,
            expiresInDays: envelopeDataRaw.settings?.expiresInDays || 30,
        };

        // Create the envelope in the database
        const envelope = await esignEnvelopeService.createAndSendEnvelope(
            organizationId,
            userId,
            envelopeData
        );

        // For self-signed completed envelopes, generate Certificate of Completion
        // and store the certified PDF
        let certifiedPdfUrl: string | null = null;
        const signerPmtIds: string[] = [];

        if (isSelfSigned && pdfBuffer) {
            try {
                // Generate PMT IDs for signers using the same DB-lookup logic
                // as the /users/get-or-create-signer-id endpoint
                for (const r of recipients) {
                    const email = r.email;
                    if (email) {
                        let pmtId: string | null = null;
                        
                        // 1. Look up in users table first (use user UUID first section)
                        const userRes = await dbQuery(
                            'SELECT id FROM users WHERE email = $1 LIMIT 1',
                            [email]
                        ).catch(() => ({ rows: [] }));
                        
                        if (userRes.rows.length > 0) {
                            const raw = userRes.rows[0].id.replace(/-/g, '');
                            pmtId = `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
                        }
                        
                        // 2. Fall back to tenants table
                        if (!pmtId) {
                            const tenantRes = await dbQuery(
                                'SELECT id FROM tenants WHERE email = $1 LIMIT 1',
                                [email]
                            ).catch(() => ({ rows: [] }));
                            
                            if (tenantRes.rows.length > 0) {
                                const raw = tenantRes.rows[0].id.replace(/-/g, '');
                                pmtId = `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
                            }
                        }
                        
                        // 3. Last resort: deterministic hash from email
                        if (!pmtId) {
                            const hash = createHash('sha256').update(email.toLowerCase()).digest('hex');
                            pmtId = `PMT-${hash.substring(0, 4).toUpperCase()}-${hash.substring(4, 8).toUpperCase()}`;
                        }
                        
                        signerPmtIds.push(pmtId);
                    }
                }

                // Generate Certificate of Completion
                const documentHash = pdfSigningService.calculateDocumentHash(new Uint8Array(pdfBuffer));
                const certPdfBytes = await pdfSigningService.generateCertificateOfCompletion({
                    certificateId: `CERT-${envelope.id.substring(0, 8).toUpperCase()}`,
                    documentTitle: envelopeDataRaw.subject || 'Signed Document',
                    documentHash,
                    envelopeId: envelope.id,
                    organizationName: 'PROPMETRIK Ghana Ltd.',
                    completedAt: new Date(),
                    signers: recipients.map((r: any, i: number) => ({
                        name: r.name,
                        email: r.email,
                        role: r.role || 'signer',
                        signedAt: new Date(envelopeDataRaw.signedAt || Date.now()),
                        signatureId: signerPmtIds[i] || undefined,
                    })),
                });

                // Merge certificate pages into signed PDF
                const mainDoc = await PDFDocument.load(pdfBuffer);
                const certDoc = await PDFDocument.load(certPdfBytes);
                const certPages = await mainDoc.copyPages(certDoc, certDoc.getPageIndices());
                for (const p of certPages) {
                    mainDoc.addPage(p);
                }
                const certifiedPdfBytes = await mainDoc.save();

                // Store certified PDF in MinIO
                const certifiedKey = `esign/certified/${envelope.id}_certified.pdf`;
                await uploadFile(
                    buckets.documents,
                    certifiedKey,
                    Buffer.from(certifiedPdfBytes),
                    'application/pdf',
                    { envelopeId: envelope.id, type: 'certified-self-signed' }
                );

                // Update envelope record with certified PDF URL
                await dbQuery(
                    `UPDATE esign_envelopes SET signed_pdf_url = $2, updated_at = NOW() WHERE id = $1`,
                    [envelope.id, certifiedKey]
                );

                certifiedPdfUrl = certifiedKey;
                logger.info('Generated Certificate of Completion for self-signed envelope', {
                    envelopeId: envelope.id,
                    certifiedKey,
                });
            } catch (certError: any) {
                logger.warn('Failed to generate Certificate of Completion', {
                    envelopeId: envelope.id,
                    error: certError?.message,
                });
                // Continue without certificate — the envelope is still saved
            }
        }

        res.status(201).json({
            success: true,
            envelope_id: envelope.id,
            data: envelope,
            signer_pmt_ids: signerPmtIds,
            certified_pdf_url: certifiedPdfUrl,
        });
    } catch (error: any) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        logger.error('E-Sign Create Envelope Error:', error);
        res.status(400).json({ error: error.message });
    }
}));

/**
 * Create and send a new envelope (supports both JSON body and FormData/file upload)
 * POST /api/v1/esign/envelopes
 */
router.post('/envelopes', esignUpload.single('file'), scanUploadedFile, asyncHandler(async (req: Request, res: Response) => {
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

            // Map frontend field types to DB enum values
            const mapFieldType = (t: string): string => {
                switch (t) {
                    case 'initial': return 'initials';
                    case 'name': return 'text';
                    default: return t;
                }
            };

            // Extract fields from signers payload into a flat array with signerEmail
            const flatFields: any[] = [];
            for (const s of signers) {
                if (Array.isArray(s.fields)) {
                    for (const f of s.fields) {
                        const isSignatureField = f.type === 'signature' || f.type === 'initial';
                        const fieldValue = isSignatureField
                            ? (f.value || f.signatureData?.data || null)
                            : (f.value || null);

                        flatFields.push({
                            signerEmail: s.email,
                            type: mapFieldType(f.type || 'signature'),
                            page: f.page || 1,
                            x: f.x ?? 0,
                            y: f.y ?? 0,
                            width: f.width ?? 200,
                            height: f.height ?? 50,
                            required: f.required !== false,
                            label: f.label || null,
                            value: fieldValue,
                            signed: f.signed === true,
                        });
                    }
                }
            }
            
            envelopeData = {
                name: req.body.name || req.body.title || 'Untitled Document',
                documentHtml: `<div class="pdf-document" data-pdf-url="${pdfDataUrl}">PDF Document: ${req.body.name || req.file.originalname}</div>`,
                documentPdfUrl: pdfDataUrl,
                message: req.body.message || '',
                contextType: req.body.contextType || 'document',
                contextEntityId: req.body.contextEntityId || null,
                contextEntityName: req.body.contextEntityName || req.body.name || req.file.originalname,
                // For self-signed documents, mark as already completed
                autoSend: req.body.contextType === 'self_signed' ? false : true,
                initialStatus: req.body.contextType === 'self_signed' ? 'completed' : undefined,
                signers: signers.length > 0 ? signers : [{
                    name: 'Signer',
                    email: req.body.signerEmail || 'signer@example.com',
                    role: 'signer',
                    order: 1
                }],
                fields: flatFields,
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

    // Build signing URLs for each signer from their access tokens (env-resolved public URL)
    const frontendUrl = process.env.FRONTEND_URL
        || (process.env.NODE_ENV === 'production' ? process.env.PROD_FRONTEND_URL : process.env.DEV_FRONTEND_URL)
        || 'http://localhost:3000';
    if ((envelope as any).signers) {
        (envelope as any).signers = (envelope as any).signers.map((s: any) => ({
            ...s,
            signing_url: s.accessToken ? `${frontendUrl}/sign/${s.accessToken}` : undefined,
        }));
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
 * ─── PUBLIC SIGNING ENDPOINTS ─────────────────────────────────────
 * These endpoints use the esign_envelopes / esign_signers / esign_fields
 * system and are accessed via the signer's access_token (no auth required).
 */

/**
 * Get envelope info for external signing
 * GET /api/v1/esign/sign-envelope/:token
 * Returns { envelope, signer, fields } shaped for the /sign/[token] frontend page
 */
router.get('/sign-envelope/:token', asyncHandler(async (req: Request, res: Response) => {
    const data = await esignEnvelopeService.getEnvelopeByAccessToken(req.params.token);
    if (!data) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    const { envelope, signer } = data;
    const fields = (envelope as any).fields || [];

    // Shape response for the frontend signing page
    res.json({
        envelope: {
            id: envelope.id,
            name: envelope.name,
            message: envelope.message,
            status: envelope.status,
            documentPdfUrl: `/esign/sign-envelope/${req.params.token}/document`,
        },
        signer: {
            id: signer.id,
            name: signer.name,
            email: signer.email,
            status: signer.status,
        },
        fields: fields.map((f: any) => ({
            id: f.id,
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required,
            label: f.label,
            value: f.value,
            signedAt: f.signedAt,
            signerId: f.signerId,
            signerName: f.signerName,
            readOnly: f.signerId !== signer.id,
        })),
    });
}));

/**
 * Serve PDF document for external signing
 * GET /api/v1/esign/sign-envelope/:token/document
 */
router.get('/sign-envelope/:token/document', asyncHandler(async (req: Request, res: Response) => {
    const data = await esignEnvelopeService.getEnvelopeByAccessToken(req.params.token);
    if (!data) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    const { envelope } = data;
    const pdfUrl = envelope.documentPdfUrl;

    if (!pdfUrl) {
        return res.status(404).json({ error: 'No PDF document associated with this envelope' });
    }

    try {
        // Handle base64 data URL
        if (pdfUrl.startsWith('data:')) {
            const matches = pdfUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                return res.status(400).json({ error: 'Invalid document data format' });
            }
            const contentType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(buffer);
        }

        // Handle MinIO path (minio://bucket/path or just path)
        const objectName = pdfUrl.replace('minio://', '');
        const fileBuffer = await getFile(buckets.documents, objectName);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="document.pdf"`);
        res.setHeader('Cache-Control', 'no-cache');
        res.send(fileBuffer);
    } catch (err: any) {
        logger.error('Error serving signing document', { error: err.message, pdfUrlPrefix: pdfUrl.substring(0, 50) });
        return res.status(404).json({ error: 'Document file not found' });
    }
}));

/**
 * Bulk complete signing — signs all fields and marks signer as signed
 * POST /api/v1/esign/sign-envelope/:token/complete
 *
 * Body: { fields: [{ fieldId, value, signatureImage }], consentGiven, consentText }
 */
router.post('/sign-envelope/:token/complete', asyncHandler(async (req: Request, res: Response) => {
    const data = await esignEnvelopeService.getEnvelopeByAccessToken(req.params.token);
    if (!data) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    const { envelope, signer } = data;

    if (signer.status === 'signed') {
        return res.status(400).json({ error: 'You have already signed this document' });
    }
    if (signer.status === 'declined') {
        return res.status(400).json({ error: 'You have declined this signing request' });
    }
    if (envelope.status === 'voided') {
        return res.status(400).json({ error: 'This envelope has been voided' });
    }

    const { fields: fieldValues, consentGiven, consentText } = req.body;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!fieldValues || !Array.isArray(fieldValues)) {
        return res.status(400).json({ error: 'fields array is required' });
    }

    try {
        // Sign each field in a single transaction
        for (const fv of fieldValues) {
            const value = fv.signatureImage || fv.value || '';
            await esignEnvelopeService.signField(
                envelope.id,
                fv.fieldId,
                signer.id,
                value,
                ipAddress,
                userAgent
            );
        }

        // Log the signing event
        await auditLogService.createAuditEvent({
            eventType: 'signer.completed',
            actorType: 'signer',
            actorId: signer.id,
            metadata: {
                envelopeId: envelope.id,
                signerEmail: signer.email,
                fieldCount: fieldValues.length,
                consentGiven,
                consentText,
                ipAddress,
                userAgent,
            },
        });

        try {
            await maybeProcessPropertyManagementCompletion(envelope.id);
        } catch (completionError: any) {
            logger.error('Post-sign completion processing failed', {
                envelopeId: envelope.id,
                signerId: signer.id,
                error: completionError?.message || 'Unknown error'
            });
        }

        // Sequential signing: now that this signer is done, email the next pending
        // signer their link. No-op when this was the last signer. Best-effort.
        try {
            await esignEnvelopeService.notifyNextPendingSigner(envelope.id);
        } catch (advanceError: any) {
            logger.warn('Failed to notify next pending signer after completion', {
                envelopeId: envelope.id,
                error: advanceError?.message || 'Unknown error'
            });
        }

        res.json({ success: true, message: 'Document signed successfully' });
    } catch (error: any) {
        logger.error('Error completing signing', { error: error.message, signerId: signer.id });
        res.status(400).json({ error: error.message });
    }
}));

/**
 * Decline signing
 * POST /api/v1/esign/sign-envelope/:token/decline
 *
 * Body: { reason: string }
 */
router.post('/sign-envelope/:token/decline', asyncHandler(async (req: Request, res: Response) => {
    const data = await esignEnvelopeService.getEnvelopeByAccessToken(req.params.token);
    if (!data) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    const { envelope, signer } = data;
    const reason = req.body.reason || 'Declined by signer';

    if (signer.status === 'signed') {
        return res.status(400).json({ error: 'You have already signed this document' });
    }
    if (signer.status === 'declined') {
        return res.status(400).json({ error: 'You have already declined this signing request' });
    }

    // Update signer status to declined
    await dbQuery(
        `UPDATE esign_signers
         SET status = 'declined', declined_at = NOW(), decline_reason = $1
         WHERE id = $2`,
        [reason, signer.id]
    );

    // Log the decline
    await auditLogService.createAuditEvent({
        eventType: 'signer.declined',
        actorType: 'signer',
        actorId: signer.id,
        metadata: {
            envelopeId: envelope.id,
            signerEmail: signer.email,
            reason,
        },
    });

    res.json({ success: true, message: 'Signature declined' });
}));

/**
 * Sign a specific field (public endpoint)
 * POST /api/v1/esign/sign-envelope/:token/fields/:fieldId
 */
router.post('/sign-envelope/:token/fields/:fieldId', asyncHandler(async (req: Request, res: Response) => {
    const data = await esignEnvelopeService.getEnvelopeByAccessToken(req.params.token);
    if (!data) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    const { envelope, signer } = data;
    const { value } = req.body;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        const field = await esignEnvelopeService.signField(
            envelope.id,
            req.params.fieldId,
            signer.id,
            value,
            ipAddress,
            userAgent
        );

        res.json({ success: true, field });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/v1/esign/envelopes/:id/resend-completed
 * Re-run completion processing for an already-completed envelope: (re)generate + store the
 * signed PDF and email the fully-executed copy + certificate to every signer. Useful when an
 * envelope completed before completion handling worked, or to re-send the signed documents.
 */
router.post('/envelopes/:id/resend-completed', asyncHandler(async (req: Request, res: Response) => {
    await maybeProcessPropertyManagementCompletion(req.params.id);
    res.json({ success: true, message: 'Completion reprocessed; signed documents emailed to all signers.' });
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

        // Allow downloading once an envelope has been sent — so the preparer can preview the
        // document with signatures placed so far (in-progress), not only when fully completed.
        // Only a still-unsent DRAFT (no fields/signatures yet) is disallowed.
        const blockedStatuses: EnvelopeStatus[] = [EnvelopeStatus.DRAFT];
        if (blockedStatuses.includes(envelope.status)) {
            return res.status(400).json({
                error: 'The document is not available for download until the envelope has been sent for signing',
                currentStatus: envelope.status
            });
        }

        // Get the original PDF from storage, or generate from stored image if missing
        let originalPdfBytes: Uint8Array;

        if (envelope.documentPdfUrl && envelope.documentPdfUrl.startsWith('data:')) {
            // The document was stored inline as a base64 data URL (e.g. designer-uploaded leases),
            // not as a storage key — decode it directly instead of treating it as a bucket/key.
            const base64 = envelope.documentPdfUrl.replace(/^data:application\/pdf;base64,/, '');
            originalPdfBytes = new Uint8Array(Buffer.from(base64, 'base64'));
        } else if (envelope.documentPdfUrl) {
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
            signatureFields: envelope.fields?.filter(f => f.type === 'signature').map(f => ({
                id: f.id,
                signerId: f.signerId,
                hasValue: !!f.value,
                x: f.x,
                y: f.y,
                width: f.width,
                height: f.height,
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

        // Collect all signature fields with their data.
        // Field coordinates are placed by FieldPlacement as PERCENTAGES (0-100) of the page,
        // so pdfSigningService converts them to points using the page size (with Y-axis flip).
        const signatureFields = (envelope.fields || [])
            .filter(f => f.type === 'signature' && f.value)
            .map(f => {
                // Find the signer for this field
                const signer = (envelope.signers || []).find(s => s.id === f.signerId);

                // Convert signedAt to Date if it's a string
                const signedAtDate = f.signedAt
                    ? (f.signedAt instanceof Date ? f.signedAt : new Date(f.signedAt))
                    : undefined;

                // EnvelopeField DTO (mapRowToField) exposes type/x/y — NOT fieldType/xPosition/yPosition.
                const signatureField = {
                    signatureData: f.value!,
                    page: f.page || 1,
                    x: f.x,                   // Percentage of page width
                    y: f.y,                   // Percentage of page height (from top; flipped internally)
                    width: f.width,           // Percentage of page width
                    height: f.height,         // Percentage of page height
                    signatureId: undefined as string | undefined,  // resolved below via resolveSignerId
                    signedAt: signedAtDate,
                    signerName: signer?.name,
                    signerEmail: signer?.email,
                    usePercentage: true
                };

                return signatureField;
            });

        // Collect date fields
        const dateFields = (envelope.fields || [])
            .filter(f => f.type === 'date_signed' && f.value)
            .map(f => ({
                value: f.value!,
                page: f.page || 1,
                x: f.x,
                y: f.y,
                width: f.width,
                height: f.height,
                usePercentage: true,
            }));

        // Resolve PMT IDs for signers
        const resolveSignerId = async (email: string, existingId: string | undefined): Promise<string> => {
            if (existingId) return existingId;
            if (!email) return '';
            const userRes = await dbQuery(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]).catch(() => ({ rows: [] }));
            if (userRes.rows.length > 0) {
                const raw = userRes.rows[0].id.replace(/-/g, '');
                return `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
            }
            const tenantRes = await dbQuery(`SELECT id FROM tenants WHERE email = $1 LIMIT 1`, [email]).catch(() => ({ rows: [] }));
            if (tenantRes.rows.length > 0) {
                const raw = tenantRes.rows[0].id.replace(/-/g, '');
                return `PMT-${raw.substring(0, 4).toUpperCase()}-${raw.substring(4, 8).toUpperCase()}`;
            }
            // Last resort: deterministic PMT id from the email (so external signers still get one).
            const hash = createHash('sha256').update(email.toLowerCase()).digest('hex');
            return `PMT-${hash.substring(0, 4).toUpperCase()}-${hash.substring(4, 8).toUpperCase()}`;
        };

        // Resolve PMT IDs in signature fields
        for (const sf of signatureFields) {
            if (!sf.signatureId && sf.signerEmail) {
                sf.signatureId = await resolveSignerId(sf.signerEmail, sf.signatureId);
            }
        }

        // Get signers and audit for full certificate
        const signersForCert = await Promise.all(
            (envelope.signers || [])
                .filter(s => s.status === 'signed')
                .map(async (s) => ({
                    name: s.name,
                    email: s.email,
                    role: s.role || 'signer',
                    signedAt: s.signedAt instanceof Date ? s.signedAt : new Date(s.signedAt!),
                    signatureId: await resolveSignerId(s.email, s.permanentSignerId),
                    ipAddress: (s as any).signedFromIp,
                    userAgent: (s as any).signedUserAgent,
                }))
        );

        const auditRes = await dbQuery(
            `SELECT event_type, created_at as timestamp, event_data, ip_address
             FROM esign_audit_log WHERE envelope_id = $1 ORDER BY created_at ASC`,
            [envelope.id]
        ).catch(() => ({ rows: [] }));

        // Generate the signed PDF with embedded signatures
        const documentHash = pdfSigningService.calculateDocumentHash(originalPdfBytes);

        const signedPdfBytes = await pdfSigningService.generateFinalSignedPdf({
            originalPdfBytes,
            signatures: signatureFields,
            dateFields,
            appendCertificatePage: includeAuditPage,
            documentHash,
            envelopeId: envelope.id,
            documentTitle: envelope.name,
            signers: signersForCert,
            auditEvents: auditRes.rows.map((e: any) => ({
                eventType: e.event_type,
                timestamp: new Date(e.timestamp),
                description: e.event_type,
                actor: typeof e.event_data === 'object' ? e.event_data?.actor : undefined,
                ipAddress: e.ip_address,
            })),
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
        const organizationName = orgResult.rows[0]?.name || 'PROPMETRIK';

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

// =====================================================
// COMPATIBILITY ROUTES (Python FastAPI parity)
// These routes provide backward compatibility for e-sign-ui
// which was originally built for the Python FastAPI backend
// =====================================================

/**
 * Documents upload (creates envelope with document)
 * POST /api/v1/esign/documents/upload
 */
router.post('/documents/upload', esignUpload.single('file'), scanUploadedFile, asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const userId = getUserId(req);
    const userEmail = getUserEmail(req) || 'unknown@propmetrik.com';
    const filename = req.file.originalname;

    // First, ensure we have an esign.users record
    let esignUserResult = await dbQuery(`
        SELECT id FROM esign.users WHERE propmetrik_user_id = $1
    `, [userId]);

    let esignUserId: number;
    if (esignUserResult.rows.length === 0) {
        // Create esign user linked to propmetrik user
        const insertResult = await dbQuery(`
            INSERT INTO esign.users (propmetrik_user_id, organization_id, email, full_name)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [userId, organizationId, userEmail, 'User']);
        esignUserId = insertResult.rows[0].id;
    } else {
        esignUserId = esignUserResult.rows[0].id;
    }

    // Store document in esign.documents
    const docResult = await dbQuery(`
        INSERT INTO esign.documents (
            owner_id, organization_id, title, original_format, 
            file_path, file_size, mime_type, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
    `, [
        esignUserId,
        organizationId,
        filename,
        'pdf',
        req.file.path,
        req.file.size,
        'application/pdf'
    ]);

    const doc = docResult.rows[0];

    res.status(201).json({
        id: doc.id,
        filename: doc.title,
        status: doc.status,
        created_at: doc.created_at,
        message: 'Document uploaded successfully'
    });
}));

/**
 * List documents
 * GET /api/v1/esign/documents/
 */
router.get('/documents/', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();
    const skip = parseInt(req.query.skip as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const result = await dbQuery(`
        SELECT d.*, u.email as owner_email, u.full_name as owner_name
        FROM esign.documents d
        LEFT JOIN esign.users u ON d.owner_id = u.id
        WHERE d.organization_id = $1 
        ORDER BY d.created_at DESC 
        LIMIT $2 OFFSET $3
    `, [organizationId, limit, skip]);

    res.json(result.rows.map((r: any) => ({
        id: r.id,
        filename: r.title,
        status: r.status,
        file_size: r.file_size,
        created_at: r.created_at,
        owner: { email: r.owner_email, name: r.owner_name }
    })));
}));

/**
 * Get document by ID
 * GET /api/v1/esign/documents/:id
 */
router.get('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const result = await dbQuery(`SELECT * FROM esign.documents WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
    }
    const doc = result.rows[0];
    res.json({
        id: doc.id,
        filename: doc.title,
        status: doc.status,
        file_size: doc.file_size,
        created_at: doc.created_at,
        updated_at: doc.updated_at
    });
}));

/**
 * Delete document
 * DELETE /api/v1/esign/documents/:id
 */
router.delete('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const result = await dbQuery(`DELETE FROM esign.documents WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ message: 'Document deleted' });
}));

/**
 * Signature requests alias (maps to /requests)
 * POST /api/v1/esign/signature-requests/
 */
router.post('/signature-requests/', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { document_id, title, message, signers, expires_in_days } = req.body;

    const signingRequest = await signingService.createSigningRequest({
        documentId: document_id?.toString(),
        documentType: 'standalone',
        documentTitle: title || 'Signature Request',
        signees: signers?.map((s: any, idx: number) => ({
            signeeType: 'external',
            externalName: s.full_name || s.name,
            externalEmail: s.email,
            signingOrder: s.order || idx + 1,
            signeeRole: 'signer'
        })) || [],
        message,
        expiresInDays: expires_in_days || 30
    }, userId);

    res.status(201).json({
        id: signingRequest.id,
        status: signingRequest.status,
        created_at: signingRequest.createdAt
    });
}));

/**
 * List signature requests
 * GET /api/v1/esign/signature-requests/
 */
router.get('/signature-requests/', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const requests = await signingService.getSigningRequestsForUser(userId);
    res.json(requests);
}));

/**
 * Get inbox (requests where user is a signer)
 * GET /api/v1/esign/signature-requests/inbox
 */
router.get('/signature-requests/inbox', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const result = await dbQuery(`
        SELECT sr.* FROM signing_requests sr
        INNER JOIN signing_request_signees srs ON sr.id = srs.signing_request_id
        WHERE srs.user_id = $1 AND srs.status = 'pending'
        ORDER BY sr.created_at DESC
    `, [userId]);
    res.json(result.rows);
}));

/**
 * Public signing access (for external signers)
 * GET /api/v1/esign/signing/access/:token
 */
router.get('/signing/access/:token', asyncHandler(async (req: Request, res: Response) => {
    const signee = await magicLinkService.validateMagicLink(req.params.token);
    if (!signee) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    const signingRequest = await signingService.getSigningRequest(signee.signingRequestId);
    if (!signingRequest) {
        return res.status(404).json({ error: 'Signing request not found' });
    }

    res.json({
        signer: {
            id: signee.id,
            name: signee.externalName,
            email: signee.externalEmail,
            role: signee.signeeRole,
            status: signee.status
        },
        document: {
            id: signingRequest.id,
            title: signingRequest.documentTitle,
            status: signingRequest.status
        }
    });
}));

/**
 * Public sign document
 * POST /api/v1/esign/signing/sign/:token
 */
router.post('/signing/sign/:token', asyncHandler(async (req: Request, res: Response) => {
    const { signature_data, signature_type, page, x, y, width, height } = req.body;

    const evidence = await signingService.captureExternalSignature({
        magicToken: req.params.token,
        signatureMethod: signature_type || 'drawn',
        signatureImageBase64: signature_data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    });

    res.json({
        success: true,
        message: 'Document signed successfully',
        evidenceId: evidence.id
    });
}));

/**
 * Decline signature
 * POST /api/v1/esign/signing/decline/:token
 */
router.post('/signing/decline/:token', asyncHandler(async (req: Request, res: Response) => {
    const signee = await magicLinkService.validateMagicLink(req.params.token);
    if (!signee) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    await dbQuery(`
        UPDATE signing_request_signees 
        SET status = 'declined', declined_at = NOW(), decline_reason = $1
        WHERE id = $2
    `, [req.body.decline_reason || 'Declined by signer', signee.id]);

    await magicLinkService.invalidateMagicLink(signee.id);

    res.json({ success: true, message: 'Signature declined' });
}));

/**
 * Get document for signing (PDF)
 * GET /api/v1/esign/signing/signature-request/:token/document
 */
router.get('/signing/signature-request/:token/document', asyncHandler(async (req: Request, res: Response) => {
    const signee = await magicLinkService.validateMagicLink(req.params.token);
    if (!signee) {
        return res.status(404).json({ error: 'Invalid or expired signing link' });
    }

    const signingRequest = await signingService.getSigningRequest(signee.signingRequestId);
    if (!signingRequest || !signingRequest.originalPdfUrl) {
        return res.status(404).json({ error: 'Document not found' });
    }

    // Get document from MinIO
    const objectName = signingRequest.originalPdfUrl.replace('minio://', '');
    const fileBuffer = await getFile(buckets.documents, objectName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="document.pdf"`);
    res.send(fileBuffer);
}));

/**
 * Reports stats
 * GET /api/v1/esign/reports/stats
 */
router.get('/reports/stats', asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const organizationId = getOrganizationId(req) || await getDefaultOrgId();

    const result = await dbQuery(`
        SELECT 
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE status = 'sent') as pending,
            COUNT(*) FILTER (WHERE status = 'voided') as voided,
            COUNT(*) as total
        FROM esign_envelopes
        WHERE organization_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
    `, [organizationId]);

    res.json(result.rows[0] || { completed: 0, pending: 0, voided: 0, total: 0 });
}));

/**
 * Reports activity
 * GET /api/v1/esign/reports/activity
 */
router.get('/reports/activity', asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await dbQuery(`
        SELECT al.*, e.name as envelope_name
        FROM esign_audit_log al
        LEFT JOIN esign_envelopes e ON al.envelope_id = e.id
        ORDER BY al.created_at DESC
        LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json(result.rows);
}));

/**
 * Auth/me - current user info
 * GET /api/v1/esign/auth/me
 */
router.get('/auth/me', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const email = getUserEmail(req);

    const result = await dbQuery(`
        SELECT id, email, first_name, last_name, role, organization_id 
        FROM users WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
        return res.json({
            id: userId,
            email: email || 'unknown',
            name: 'User'
        });
    }

    const user = result.rows[0];
    res.json({
        id: user.id,
        email: user.email,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User',
        role: user.role,
        organizationId: user.organization_id
    });
}));

/**
 * Auth groups
 * GET /api/v1/esign/auth/groups
 */
router.get('/auth/groups', asyncHandler(async (req: Request, res: Response) => {
    res.json(['users', 'esign_users']);
}));

export default router;
