/**
 * CRM Company Routes
 * 
 * Handles all company-related CRUD operations, statistics,
 * and company sub-resources (contacts, deals).
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { companyService } from '../../services/crm-deal-management';
import { validate } from '../../middleware/validation';
import { createCompanyBody } from '../../middleware/schemas/crm.schemas';

const router = Router();

// ──────────────────────────────────────────────
// Company CRUD & Listing
// ──────────────────────────────────────────────

router.get('/companies', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        company_type: req.query.type as string | undefined,
        industry: req.query.industry as string | undefined,
        region: req.query.region as string | undefined,
        search: req.query.search as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await companyService.listCompanies(organizationId, filters);
    res.json(result);
}));

router.post('/companies', validate(createCompanyBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const company = await companyService.createCompany(organizationId, req.body, userId);
    res.status(201).json(company);
}));

router.get('/companies/statistics', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const statistics = await companyService.getCompanyStats(organizationId);
    res.json(statistics);
}));

router.get('/companies/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const company = await companyService.getCompanyById(req.params.id, organizationId);
    if (!company) {
        return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company);
}));

router.put('/companies/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const company = await companyService.updateCompany(req.params.id, organizationId, req.body, userId);
    res.json(company);
}));

router.delete('/companies/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await companyService.deleteCompany(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Company not found' });
        }
        throw error;
    }
}));

// ──────────────────────────────────────────────
// Company Sub-Resources
// ──────────────────────────────────────────────

router.get('/companies/:id/contacts', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contacts = await companyService.getCompanyContacts(req.params.id, organizationId);
    res.json(contacts);
}));

router.get('/companies/:id/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const deals = await companyService.getCompanyDeals(req.params.id, organizationId);
    res.json(deals);
}));

export default router;
