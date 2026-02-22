/**
 * CRM Document Routes
 * 
 * Handles all document-related operations including CRUD,
 * download URL generation, and version history.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { crmDocumentService, DocumentType } from '../../services/crm-deal-management';

const router = Router();

// ──────────────────────────────────────────────
// Document CRUD & Listing
// ──────────────────────────────────────────────

router.get('/documents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        deal_id: req.query.dealId as string | undefined,
        contact_id: req.query.contactId as string | undefined,
        property_id: req.query.propertyId as string | undefined,
        document_type: req.query.type as DocumentType | undefined,
        uploaded_by: req.query.uploadedBy as string | undefined,
        search: req.query.search as string | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await crmDocumentService.listDocuments(organizationId, filters);
    res.json(result);
}));

router.get('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const document = await crmDocumentService.getDocumentById(req.params.id, organizationId);
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
}));

router.get('/documents/:id/download', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600;
    const downloadUrl = await crmDocumentService.getDownloadUrl(req.params.id, organizationId, expiresIn);
    if (!downloadUrl) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ url: downloadUrl, expiresIn });
}));

router.put('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const document = await crmDocumentService.updateDocument(req.params.id, organizationId, req.body, userId);
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
}));

router.delete('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await crmDocumentService.deleteDocument(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Document not found' });
        }
        throw error;
    }
}));

// ──────────────────────────────────────────────
// Document Versions
// ──────────────────────────────────────────────

router.get('/documents/:id/versions', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const versions = await crmDocumentService.getDocumentVersions(req.params.id, organizationId);
    if (!versions) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json(versions);
}));

export default router;
