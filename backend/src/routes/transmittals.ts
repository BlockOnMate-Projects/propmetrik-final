/**
 * Transmittal Routes
 * 
 * Formal document distribution management with acknowledgement tracking.
 * 
 * Endpoints:
 *   GET    /transmittals                   - List transmittals (with filters)
 *   GET    /transmittals/stats             - Transmittal statistics for a project
 *   GET    /transmittals/:id               - Get transmittal detail
 *   POST   /transmittals                   - Create a new transmittal (draft)
 *   PUT    /transmittals/:id               - Update a draft transmittal
 *   POST   /transmittals/:id/issue         - Issue (send) a transmittal
 *   POST   /transmittals/:id/acknowledge   - Acknowledge a transmittal
 *   POST   /transmittals/:id/close         - Close a transmittal
 *   POST   /transmittals/:id/void          - Void a transmittal
 *   POST   /transmittals/:id/items         - Add item to transmittal
 *   DELETE /transmittals/:id/items/:itemId - Remove item from transmittal
 *   DELETE /transmittals/:id               - Delete draft transmittal
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import transmittalService from '../services/project-management/transmittalService';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../database/minio';
import { z } from 'zod';

const router = Router();
registerPMParamValidation(router);

const transmittalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// ── Validation Schemas ──────────────────────────────────────────────────────

const createTransmittalSchema = z.object({
  project_id: z.string().uuid(),
  subject: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  to_company: z.string().max(255).optional(),
  to_contact: z.string().max(255).optional(),
  to_email: z.string().email().optional(),
  cc_emails: z.array(z.string().email()).max(20).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  purpose: z.enum(['for_review', 'for_approval', 'for_information', 'for_construction', 'for_record', 'as_requested', 'resubmitted_for_approval']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  response_required: z.boolean().optional(),
  items: z.array(z.object({
    document_title: z.string().min(1).max(500),
    document_ref: z.string().max(100).optional(),
    revision: z.string().max(20).optional(),
    copies: z.number().int().min(1).max(100).optional(),
    format: z.enum(['digital', 'hardcopy', 'both']).optional(),
    file_url: z.string().url().optional(),
    file_name: z.string().max(255).optional(),
    file_size: z.number().int().min(0).optional(),
    notes: z.string().max(1000).optional(),
  })).max(100).optional(),
  recipients: z.array(z.object({
    email: z.string().email(),
    name: z.string().max(255).optional(),
  })).max(50).optional(),
});

const updateTransmittalSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  to_company: z.string().max(255).optional(),
  to_contact: z.string().max(255).optional(),
  to_email: z.string().email().optional(),
  cc_emails: z.array(z.string().email()).max(20).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  purpose: z.enum(['for_review', 'for_approval', 'for_information', 'for_construction', 'for_record', 'as_requested', 'resubmitted_for_approval']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  response_required: z.boolean().optional(),
});

const addItemSchema = z.object({
  document_title: z.string().min(1).max(500),
  document_ref: z.string().max(100).optional(),
  revision: z.string().max(20).optional(),
  copies: z.number().int().min(1).max(100).optional(),
  format: z.enum(['digital', 'hardcopy', 'both']).optional(),
  file_url: z.string().url().optional(),
  file_name: z.string().max(255).optional(),
  file_size: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

// ── Routes ──────────────────────────────────────────────────────────────────

/** List transmittals */
router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getAuthOrgId(req);
    const result = await transmittalService.getAll({
      project_id: req.query.project_id as string,
      organization_id: orgId,
      status: req.query.status as string,
      purpose: req.query.purpose as string,
      priority: req.query.priority as string,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      sort_by: req.query.sort_by as string,
      sort_order: req.query.sort_order as 'asc' | 'desc',
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch transmittals', message: err.message });
  }
});

/** Transmittal stats for a project */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) return res.status(400).json({ error: 'project_id is required' });
    const stats = await transmittalService.getStats(projectId);
    res.json({ data: stats });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch stats', message: err.message });
  }
});

/** Get transmittal detail */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const transmittal = await transmittalService.getById(req.params.id);
    if (!transmittal) return res.status(404).json({ error: 'Transmittal not found' });
    res.json({ data: transmittal });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch transmittal', message: err.message });
  }
});

/** Create draft transmittal */
router.post('/', requirePMWrite, validate(createTransmittalSchema), async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const orgId = getAuthOrgId(req);
    const transmittal = await transmittalService.create(
      { ...req.body, organization_id: orgId },
      userId,
    );
    res.status(201).json({ data: transmittal });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create transmittal', message: err.message });
  }
});

/** Update draft transmittal */
router.put('/:id', requirePMWrite, validate(updateTransmittalSchema), async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const transmittal = await transmittalService.update(req.params.id, req.body, userId);
    res.json({ data: transmittal });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update transmittal', message: err.message });
  }
});

/** Issue (send) transmittal */
router.post('/:id/issue', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const transmittal = await transmittalService.issue(req.params.id, userId);
    res.json({ data: transmittal });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to issue transmittal', message: err.message });
  }
});

/** Acknowledge transmittal */
router.post('/:id/acknowledge', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { recipient_id, notes } = req.body;
    if (!recipient_id) return res.status(400).json({ error: 'recipient_id is required' });
    const transmittal = await transmittalService.acknowledge(req.params.id, recipient_id, userId, notes);
    res.json({ data: transmittal });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to acknowledge transmittal', message: err.message });
  }
});

/** Close transmittal */
router.post('/:id/close', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const transmittal = await transmittalService.close(req.params.id, userId, req.body.notes);
    res.json({ data: transmittal });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to close transmittal', message: err.message });
  }
});

/** Void transmittal */
router.post('/:id/void', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const transmittal = await transmittalService.void(req.params.id, userId);
    res.json({ data: transmittal });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to void transmittal', message: err.message });
  }
});

/** Add item to transmittal */
router.post('/:id/items', requirePMWrite, validate(addItemSchema), async (req: Request, res: Response) => {
  try {
    const item = await transmittalService.addItem(req.params.id, req.body);
    res.status(201).json({ data: item });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add item', message: err.message });
  }
});

/** Add item with file upload to transmittal */
router.post('/:id/items/upload', requirePMWrite, transmittalUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const transmittalId = req.params.id;
    const ext = file.originalname.split('.').pop() || 'bin';
    const key = `transmittals/${transmittalId}/${uuidv4()}.${ext}`;
    const bucket = buckets.documents || 'propmetrik-documents';
    await uploadFile(bucket, key, file.buffer, file.mimetype);
    const fileUrl = await getPresignedDownloadUrl(bucket, key);

    const item = await transmittalService.addItem(transmittalId, {
      document_title: req.body.document_title || file.originalname,
      document_ref: req.body.document_ref || undefined,
      revision: req.body.revision || undefined,
      copies: req.body.copies ? parseInt(req.body.copies) : 1,
      format: req.body.format || 'digital',
      file_url: fileUrl,
      file_key: key,
      file_name: file.originalname,
      file_size: file.size,
      notes: req.body.notes || undefined,
    });

    res.status(201).json({ data: item });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to upload item', message: err.message });
  }
});

/** Remove item from transmittal */
router.delete('/:id/items/:itemId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    await transmittalService.removeItem(req.params.id, req.params.itemId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove item', message: err.message });
  }
});

/** Delete draft transmittal */
router.delete('/:id', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const deleted = await transmittalService.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Transmittal not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete transmittal', message: err.message });
  }
});

export default router;
