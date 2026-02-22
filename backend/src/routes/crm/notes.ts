/**
 * CRM Note Routes
 * 
 * Handles all note-related operations including CRUD,
 * filtering by entity, and pin/unpin toggling.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { noteService } from '../../services/crm-deal-management';
import { validate } from '../../middleware/validation';
import { createNoteBody } from '../../middleware/schemas/crm.schemas';

const router = Router();

// ──────────────────────────────────────────────
// Note CRUD & Listing
// ──────────────────────────────────────────────

router.get('/notes', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        deal_id: req.query.dealId as string | undefined,
        contact_id: req.query.contactId as string | undefined,
        property_id: req.query.propertyId as string | undefined,
        company_id: req.query.companyId as string | undefined,
        created_by: req.query.createdBy as string | undefined,
        is_pinned: req.query.pinnedOnly === 'true' ? true : undefined,
        search: req.query.search as string | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await noteService.listNotes(organizationId, filters, userId);
    res.json(result);
}));

router.post('/notes', validate(createNoteBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const note = await noteService.createNote(organizationId, req.body, userId);
    res.status(201).json(note);
}));

router.get('/notes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const note = await noteService.getNoteById(req.params.id, organizationId, userId);
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
}));

router.put('/notes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const note = await noteService.updateNote(req.params.id, organizationId, req.body, userId);
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
}));

router.delete('/notes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    try {
        await noteService.deleteNote(req.params.id, organizationId, userId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found') || error.message?.includes('permission')) {
            return res.status(404).json({ error: 'Note not found' });
        }
        throw error;
    }
}));

// ──────────────────────────────────────────────
// Pin / Unpin
// ──────────────────────────────────────────────

router.post('/notes/:id/pin', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const note = await noteService.togglePin(req.params.id, organizationId, userId);
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
}));

// PUT alias for frontend compatibility
router.put('/notes/:id/pin', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const note = await noteService.togglePin(req.params.id, organizationId, userId);
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
}));

export default router;
