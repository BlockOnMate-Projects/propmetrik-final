/**
 * Drawing Management Routes
 * CRUD for project_drawings and drawing_revisions tables
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// DRAWINGS
// ============================================================================

// List drawings for a project
router.get('/projects/:projectId/drawings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, discipline, search, page = '1', limit = '50' } = req.query;

    let query = `SELECT d.*, 
      (SELECT COUNT(*) FROM drawing_revisions WHERE drawing_id = d.id) as revision_count,
      (SELECT json_agg(json_build_object('id', dr.id, 'revision_number', dr.revision_number, 'status', dr.status, 'created_at', dr.created_at) ORDER BY dr.created_at DESC) 
       FROM drawing_revisions dr WHERE dr.drawing_id = d.id LIMIT 5) as recent_revisions
      FROM project_drawings d WHERE d.project_id = $1 AND d.organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;

    if (status) { query += ` AND d.status = $${idx++}`; params.push(status); }
    if (discipline) { query += ` AND d.discipline = $${idx++}`; params.push(discipline); }
    if (search) { query += ` AND (d.title ILIKE $${idx} OR d.drawing_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countQuery = `SELECT COUNT(*) FROM project_drawings d WHERE d.project_id = $1 AND d.organization_id = $2${status ? ` AND d.status = $3` : ''}`;
    const countParams = status ? [projectId, orgId, status] : [projectId, orgId];
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY d.drawing_number ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) });
  } catch (error) { next(error); }
});

// Get single drawing with all revisions
router.get('/projects/:projectId/drawings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const drawingResult = await pool.query('SELECT * FROM project_drawings WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (drawingResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Drawing not found' });

    const revisionsResult = await pool.query('SELECT * FROM drawing_revisions WHERE drawing_id = $1 ORDER BY created_at DESC', [id]);
    const drawing = { ...drawingResult.rows[0], revisions: revisionsResult.rows };
    res.json({ success: true, data: drawing });
  } catch (error) { next(error); }
});

// Create drawing
router.post('/projects/:projectId/drawings', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { drawing_number, title, discipline, description, sheet_size, scale } = req.body;

    const result = await pool.query(
      `INSERT INTO project_drawings (project_id, organization_id, drawing_number, title, discipline, description, sheet_size, scale, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [projectId, orgId, drawing_number, title, discipline || 'architectural', description, sheet_size || 'A1', scale, userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Update drawing
router.put('/projects/:projectId/drawings/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = req.body;
    const allowedFields = ['drawing_number', 'title', 'discipline', 'status', 'description', 'sheet_size', 'scale', 'current_revision'];
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (fields[field] !== undefined) { updates.push(`${field} = $${idx++}`); params.push(fields[field]); }
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, orgId);

    const result = await pool.query(
      `UPDATE project_drawings SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Drawing not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Delete drawing
router.delete('/projects/:projectId/drawings/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM project_drawings WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Drawing not found' });
    res.json({ success: true, message: 'Drawing deleted' });
  } catch (error) { next(error); }
});

// ============================================================================
// REVISIONS
// ============================================================================

// Add revision to a drawing
router.post('/projects/:projectId/drawings/:id/revisions', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req);
    const { id: drawingId } = req.params;
    const { revision_number, file_name, file_url, file_size, mime_type, change_description } = req.body;

    const result = await pool.query(
      `INSERT INTO drawing_revisions (drawing_id, revision_number, file_name, file_url, file_size, mime_type, change_description, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [drawingId, revision_number, file_name, file_url, file_size, mime_type, change_description, userId]
    );

    // Update current_revision on the drawing
    await pool.query('UPDATE project_drawings SET current_revision = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [revision_number, drawingId]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Get revision details
router.get('/projects/:projectId/drawings/:id/revisions/:revisionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { revisionId } = req.params;
    const result = await pool.query('SELECT * FROM drawing_revisions WHERE id = $1', [revisionId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Revision not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Compare two revisions (metadata comparison)
router.get('/projects/:projectId/drawings/:id/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: drawingId } = req.params;
    const { rev_a, rev_b } = req.query;

    if (!rev_a || !rev_b) return res.status(400).json({ success: false, error: 'rev_a and rev_b query params required' });

    const result = await pool.query(
      `SELECT * FROM drawing_revisions WHERE drawing_id = $1 AND id IN ($2, $3) ORDER BY created_at ASC`,
      [drawingId, rev_a, rev_b]
    );

    if (result.rows.length < 2) return res.status(404).json({ success: false, error: 'One or both revisions not found' });

    res.json({
      success: true,
      data: {
        revision_a: result.rows[0],
        revision_b: result.rows[1],
        changes: {
          file_changed: result.rows[0].file_url !== result.rows[1].file_url,
          description_a: result.rows[0].change_description,
          description_b: result.rows[1].change_description,
        }
      }
    });
  } catch (error) { next(error); }
});

// Approve/review a revision
router.put('/projects/:projectId/drawings/:id/revisions/:revisionId/review', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req);
    const { revisionId } = req.params;
    const { action } = req.body; // 'approve' or 'review'

    let updates: string;
    if (action === 'approve') {
      updates = `approved_by = $1, approved_at = CURRENT_TIMESTAMP, status = 'approved'`;
    } else {
      updates = `reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, status = 'reviewed'`;
    }

    const result = await pool.query(
      `UPDATE drawing_revisions SET ${updates} WHERE id = $2 RETURNING *`,
      [userId, revisionId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Revision not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

export default router;
