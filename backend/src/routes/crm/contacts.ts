/**
 * CRM Contact Routes
 * 
 * Handles all contact-related CRUD operations, statistics,
 * and contact sub-resources (deals, tasks, activities).
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler, getAgentIdForUser } from './helpers';
import { contactService } from '../../services/crm-deal-management';
import { ContactType, LeadStatus } from '../../services/crm-deal-management/types';
import { contactMergeService } from '../../services/crm-deal-management/contactMergeService';
import { territoryService } from '../../services/crm-deal-management/territoryService';
import { logger } from '../../utils/logger';
import db from '../../database';
import { validate, validateRequest } from '../../middleware/validation';
import { createContactBody, updateContactBody, uuidParam } from '../../middleware/schemas/crm.schemas';

const router = Router();

// ──────────────────────────────────────────────
// Contact CRUD & Listing
// ──────────────────────────────────────────────

router.get('/contacts', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    // Agent role: auto-scope to only their assigned contacts
    const agentId = await getAgentIdForUser(req);

    const filters = {
        contact_type: req.query.type as ContactType | undefined,
        lead_status: req.query.status as LeadStatus | undefined,
        assigned_to: agentId || (req.query.assignedTo as string | undefined),
        region: req.query.region as string | undefined,
        search: req.query.search as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        lead_score_min: req.query.minLeadScore ? parseInt(req.query.minLeadScore as string) : undefined,
        lead_score_max: req.query.maxLeadScore ? parseInt(req.query.maxLeadScore as string) : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await contactService.listContacts(organizationId, filters);
    res.json(result);
}));

router.get('/contacts/statistics', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const statistics = await contactService.getContactStats(organizationId);
    res.json(statistics);
}));

/** GET /contacts/duplicates — Find potential duplicate contact pairs (must be before /:id) */
router.get('/contacts/duplicates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const minConfidence = parseFloat(req.query.min_confidence as string) || 0.5;

    const groups = await contactMergeService.findDuplicates(organizationId, { limit, minConfidence });
    res.json({ groups, total: groups.length });
}));

/**
 * GET /contacts/export — Stream all matching contacts as CSV.
 * Mirrors the /contacts list filters (+ agent auto-scoping) so the export respects the
 * same visibility rules. Columns round-trip with POST /contacts/import. Capped at 10k rows.
 */
router.get('/contacts/export', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const agentId = await getAgentIdForUser(req);

    const baseFilters = {
        contact_type: req.query.type as ContactType | undefined,
        lead_status: req.query.status as LeadStatus | undefined,
        assigned_to: agentId || (req.query.assignedTo as string | undefined),
        region: req.query.region as string | undefined,
        search: req.query.search as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        lead_score_min: req.query.minLeadScore ? parseInt(req.query.minLeadScore as string) : undefined,
        lead_score_max: req.query.maxLeadScore ? parseInt(req.query.maxLeadScore as string) : undefined,
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    // Round-trip columns (import accepts the same field names).
    const COLUMNS = [
        'first_name', 'last_name', 'email', 'primary_phone', 'whatsapp_number',
        'contact_type', 'lead_status', 'lead_source', 'lead_score', 'occupation',
        'employer', 'region', 'city', 'digital_address', 'budget_min', 'budget_max',
        'tags', 'assigned_to', 'created_at',
    ];

    const csvCell = (v: unknown): string => {
        if (v === null || v === undefined) return '';
        let s = Array.isArray(v) ? v.join(';') : String(v);
        if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
        return s;
    };

    // Paginate through all matches (cap 10k rows / 100 pages) reusing service scoping.
    const PAGE = 100;
    const MAX_PAGES = 100;
    const rows: any[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await contactService.listContacts(organizationId, { ...baseFilters, page, limit: PAGE });
        const batch = result.data || [];
        rows.push(...batch);
        const totalPages = result.pagination?.total_pages ?? 1;
        if (page >= totalPages || batch.length < PAGE) break;
    }

    const header = COLUMNS.join(',');
    const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(',')).join('\n');
    const csv = `${header}\n${body}`;

    const stamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contacts_${stamp}.csv"`);
    res.send(csv);
}));

router.post('/contacts', validate(createContactBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const contact = await contactService.createContact(organizationId, req.body, userId);
    // Best-effort geo-routing: if the org runs territories and this lead has no agent yet,
    // assign the owning agent by point-in-polygon. Fire-and-forget so it never delays or
    // blocks contact creation (it geocodes + updates the row asynchronously; it also
    // no-ops when the org has no territories or the contact is already assigned).
    if (contact?.id) {
        territoryService.resolveAndAssignContact(organizationId, contact.id)
            .catch((e: any) => logger.warn('Territory auto-route failed', { contactId: contact.id, error: e?.message }));
    }
    res.status(201).json(contact);
}));

router.get('/contacts/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contact = await contactService.getContactById(req.params.id, organizationId);
    if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(contact);
}));

router.put('/contacts/:id', validateRequest({ body: updateContactBody, params: uuidParam }), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const contact = await contactService.updateContact(req.params.id, organizationId, req.body, userId);
    res.json(contact);
}));

router.delete('/contacts/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await contactService.deleteContact(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        throw error;
    }
}));

// ──────────────────────────────────────────────
// Contact Sub-Resources
// ──────────────────────────────────────────────

router.put('/contacts/:id/lead-score', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { adjustment } = req.body;
    if (typeof adjustment !== 'number') {
        return res.status(400).json({ error: 'adjustment must be a number' });
    }
    try {
        const contact = await contactService.updateLeadScore(req.params.id, organizationId, adjustment);
        res.json(contact);
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        throw error;
    }
}));

router.get('/contacts/:id/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contactId = req.params.id;
    
    const result = await db.query(
        `SELECT d.* FROM deals d
         WHERE d.organization_id = $1 
         AND d.deleted_at IS NULL
         AND (d.primary_contact_id = $2 OR $2 = ANY(d.secondary_contacts))
         ORDER BY d.created_at DESC`,
        [organizationId, contactId]
    );
    
    res.json(result.rows);
}));

router.get('/contacts/:id/tasks', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contactId = req.params.id;
    
    const result = await db.query(
        `SELECT t.* FROM tasks t
         WHERE t.organization_id = $1 
         AND t.deleted_at IS NULL
         AND t.contact_id = $2
         ORDER BY t.due_date ASC`,
        [organizationId, contactId]
    );
    
    res.json(result.rows);
}));

router.get('/contacts/:id/activities', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contactId = req.params.id;
    
    const result = await db.query(
        `SELECT a.* FROM deal_activities a
         JOIN deals d ON d.id = a.deal_id
         WHERE d.organization_id = $1 
         AND d.deleted_at IS NULL
         AND a.contact_id = $2
         ORDER BY a.created_at DESC
         LIMIT 20`,
        [organizationId, contactId]
    );
    
    res.json(result.rows);
}));

// ──────────────────────────────────────────────
// Contact Dedup & Merge
// ──────────────────────────────────────────────

/** POST /contacts/merge — Merge two contacts */
router.post('/contacts/merge', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { survivor_id, duplicate_id, use_duplicate_fields } = req.body;
    if (!survivor_id || !duplicate_id) {
        return res.status(400).json({ error: 'survivor_id and duplicate_id are required' });
    }

    const result = await contactMergeService.mergeContacts(organizationId, {
        survivor_id,
        duplicate_id,
        use_duplicate_fields,
    });

    res.json(result);
}));

// ──────────────────────────────────────────────
// Bulk Import
// ──────────────────────────────────────────────

/** POST /contacts/import — Bulk import contacts from array */
router.post('/contacts/import', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { contacts: contactsArr, skip_duplicates } = req.body;
    if (!Array.isArray(contactsArr) || contactsArr.length === 0) {
        return res.status(400).json({ error: 'contacts array is required and must not be empty' });
    }
    if (contactsArr.length > 500) {
        return res.status(400).json({ error: 'Maximum 500 contacts per import' });
    }

    const results = { created: 0, skipped: 0, errors: [] as Array<{ row: number; error: string }> };

    for (let i = 0; i < contactsArr.length; i++) {
        const c = contactsArr[i];
        try {
            if (!c.first_name || !c.last_name) {
                results.errors.push({ row: i + 1, error: 'first_name and last_name are required' });
                continue;
            }

            // Check for duplicate by email if skip_duplicates
            if (skip_duplicates && c.email) {
                const dup = await db.query(
                    `SELECT id FROM contacts WHERE organization_id = $1 AND email = $2 AND deleted_at IS NULL LIMIT 1`,
                    [organizationId, c.email]
                );
                if (dup.rows.length > 0) {
                    results.skipped++;
                    continue;
                }
            }

            await contactService.createContact(organizationId, c, userId);
            results.created++;
        } catch (err: any) {
            results.errors.push({ row: i + 1, error: err.message || 'Unknown error' });
        }
    }

    res.status(201).json(results);
}));

export default router;
