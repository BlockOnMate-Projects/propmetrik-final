/**
 * Document Template & Generation Routes
 * 
 * Handles document templates (CRUD, categories, merge fields, seeding),
 * document generation (generate, preview, status updates),
 * deal document checklists, and stage document requirements.
 * 
 * NOTE: GET/DELETE /documents/:id are renamed to /generated-documents/:id
 * and GET /deals/:id/documents is renamed to /deals/:id/generated-documents
 * to avoid route conflicts with documents.ts.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { crmDocumentTemplateService } from '../../services/crm-deal-management/crmDocumentTemplateService';
import { documentGenerationService } from '../../services/crm-deal-management/documentGenerationService';
import { DocumentTemplateCategory, TemplateFilters } from '../../services/crm-deal-management/crmDocumentTemplateService';

const router = Router();

// ============================================================
// DOCUMENT TEMPLATE ROUTES
// ============================================================

router.get('/document-templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters: TemplateFilters = {
        category: req.query.category as DocumentTemplateCategory | undefined,
        status: req.query.status as 'draft' | 'active' | 'archived' | undefined,
        search: req.query.search as string | undefined,
        is_system: req.query.system === 'true' ? true : req.query.system === 'false' ? false : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100)
    };

    const result = await crmDocumentTemplateService.list(organizationId, filters);
    res.json({
        templates: result.templates,
        total: result.total,
        page: filters.page,
        limit: filters.limit
    });
}));

router.get('/document-templates/categories', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const categories = await crmDocumentTemplateService.getCategories(organizationId);
    res.json({ categories });
}));

router.get('/document-templates/merge-fields', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const grouped = req.query.grouped === 'true';
    
    if (grouped) {
        const fields = await crmDocumentTemplateService.getMergeFieldsByCategory(organizationId || undefined);
        res.json({ fields });
    } else {
        const fields = await crmDocumentTemplateService.getMergeFields(organizationId || undefined);
        res.json({ fields });
    }
}));

router.post('/document-templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const template = await crmDocumentTemplateService.create(organizationId, req.body, userId || 'system');
    res.status(201).json({ template });
}));

router.get('/document-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const template = await crmDocumentTemplateService.getById(req.params.id, organizationId || undefined);
    
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
}));

router.put('/document-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const template = await crmDocumentTemplateService.update(
        req.params.id,
        organizationId,
        req.body,
        userId || 'system'
    );
    
    if (!template) {
        return res.status(404).json({ error: 'Template not found or cannot be modified' });
    }
    res.json({ template });
}));

router.delete('/document-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const deleted = await crmDocumentTemplateService.delete(req.params.id, organizationId);
    if (!deleted) {
        return res.status(404).json({ error: 'Template not found or cannot be deleted' });
    }
    res.json({ success: true, message: 'Template archived' });
}));

router.post('/document-templates/:id/duplicate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'New template name is required' });
    }

    const template = await crmDocumentTemplateService.duplicate(
        req.params.id,
        organizationId,
        name,
        userId || 'system'
    );
    
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.status(201).json({ template });
}));

router.post('/document-templates/seed-ghana', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const count = await crmDocumentTemplateService.seedGhanaTemplates(organizationId, userId || 'system');
    res.json({ success: true, message: `Seeded ${count} Ghana document templates` });
}));

// ============================================================
// DOCUMENT GENERATION ROUTES
// ============================================================

router.post('/documents/generate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const document = await documentGenerationService.generate(
        organizationId,
        req.body,
        userId || 'system'
    );
    res.status(201).json({ document });
}));

router.post('/documents/preview', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const preview = await documentGenerationService.preview(organizationId, req.body);
    res.json({ preview });
}));

// FIX DUPLICATE: Previously GET /documents/:id — now /generated-documents/:id to avoid conflict with documents.ts
router.get('/generated-documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const document = await documentGenerationService.getById(req.params.id, organizationId);
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ document });
}));

// FIX DUPLICATE: Previously DELETE /documents/:id — now /generated-documents/:id to avoid conflict with documents.ts
router.delete('/generated-documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const deleted = await documentGenerationService.delete(req.params.id, organizationId);
    if (!deleted) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true, message: 'Document deleted' });
}));

router.put('/documents/:id/status', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { status, ...additionalData } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    const document = await documentGenerationService.updateStatus(
        req.params.id,
        organizationId,
        status,
        additionalData
    );
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ document });
}));

// ============================================================
// DEAL DOCUMENT CHECKLIST ROUTES
// ============================================================

router.get('/deals/:id/document-checklist', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const checklist = await documentGenerationService.getDealChecklist(req.params.id, organizationId);
    res.json({ checklist });
}));

router.post('/deals/:id/document-checklist/initialize', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { stageId } = req.body;
    if (!stageId) {
        return res.status(400).json({ error: 'Stage ID is required' });
    }

    const count = await documentGenerationService.initializeDealChecklist(
        req.params.id,
        stageId,
        organizationId
    );
    res.json({ success: true, initialized: count });
}));

router.put('/deals/document-checklist/:itemId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const updated = await documentGenerationService.updateChecklistItem(
        req.params.itemId,
        organizationId,
        { ...req.body, completedBy: userId }
    );
    if (!updated) {
        return res.status(404).json({ error: 'Checklist item not found' });
    }
    res.json({ success: true });
}));

// FIX DUPLICATE: Previously GET /deals/:id/documents — now /deals/:id/generated-documents to avoid conflict with deals.ts
router.get('/deals/:id/generated-documents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const documents = await documentGenerationService.listByDeal(req.params.id, organizationId);
    res.json({ documents });
}));

// ============================================================
// STAGE DOCUMENT REQUIREMENTS ROUTES
// ============================================================

router.get('/stages/:id/document-requirements', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const requirements = await crmDocumentTemplateService.getStageRequirements(req.params.id, organizationId);
    res.json({ requirements });
}));

router.post('/stages/:id/document-requirements', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { pipelineId, ...input } = req.body;
    if (!pipelineId) {
        return res.status(400).json({ error: 'Pipeline ID is required' });
    }

    const requirement = await crmDocumentTemplateService.addStageRequirement(
        organizationId,
        pipelineId,
        req.params.id,
        input,
        userId || 'system'
    );
    res.status(201).json({ requirement });
}));

router.delete('/document-requirements/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const deleted = await crmDocumentTemplateService.removeStageRequirement(req.params.id, organizationId);
    if (!deleted) {
        return res.status(404).json({ error: 'Requirement not found' });
    }
    res.json({ success: true });
}));

export default router;
