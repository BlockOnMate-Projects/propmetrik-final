/**
 * Closeout & Warranty Management Routes
 * CRUD for project_closeout, closeout_items, warranties, warranty_claims
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// PROJECT CLOSEOUT
// ============================================================================

router.get('/projects/:projectId/closeout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    let closeout = await pool.query('SELECT * FROM project_closeout WHERE project_id = $1 AND organization_id = $2', [projectId, orgId]);
    if (closeout.rows.length === 0) {
      // Auto-create closeout record for the project
      closeout = await pool.query(
        `INSERT INTO project_closeout (project_id, organization_id, created_by) VALUES ($1, $2, $3) RETURNING *`,
        [projectId, orgId, getAuthUserId(req)]
      );
    }
    const items = await pool.query('SELECT * FROM closeout_items WHERE closeout_id = $1 ORDER BY category, created_at', [closeout.rows[0].id]);
    res.json({ success: true, data: { ...closeout.rows[0], items: items.rows } });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/closeout', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const fields = ['status', 'substantial_completion_date', 'final_completion_date', 'certificate_of_occupancy', 'co_date', 'final_inspection_passed', 'final_inspection_date', 'as_built_drawings_received', 'om_manuals_received', 'training_completed', 'spare_parts_delivered', 'final_lien_waivers_received', 'consent_of_surety', 'final_payment_processed', 'retainage_released', 'retainage_amount', 'punch_list_complete', 'notes'];
    const updates: string[] = [];
    const params: any[] = [projectId, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE project_closeout SET ${updates.join(', ')} WHERE project_id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Closeout not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// ============================================================================
// CLOSEOUT ITEMS
// ============================================================================

router.post('/projects/:projectId/closeout/items', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const closeout = await pool.query('SELECT id FROM project_closeout WHERE project_id = $1 AND organization_id = $2', [projectId, orgId]);
    if (closeout.rows.length === 0) return res.status(404).json({ success: false, error: 'Closeout not found' });
    const { category, title, description, responsible_party, due_date } = req.body;
    const result = await pool.query(
      `INSERT INTO closeout_items (closeout_id, organization_id, category, title, description, responsible_party, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [closeout.rows[0].id, orgId, category || 'document', title, description, responsible_party, due_date]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/closeout/items/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['category', 'title', 'description', 'responsible_party', 'status', 'due_date', 'document_url', 'notes'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (req.body.status === 'completed') { updates.push('completed_date = CURRENT_DATE'); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE closeout_items SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/projects/:projectId/closeout/items/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM closeout_items WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// WARRANTIES
// ============================================================================

router.get('/projects/:projectId/warranties', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, category, page = '1', limit = '50' } = req.query;
    let query = `SELECT w.*, (SELECT COUNT(*) FROM warranty_claims wc WHERE wc.warranty_id = w.id) as claim_count
                 FROM warranties w WHERE w.project_id = $1 AND w.organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (status) { query += ` AND w.status = $${idx++}`; params.push(status); }
    if (category) { query += ` AND w.category = $${idx++}`; params.push(category); }
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY w.end_date ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/warranties', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { title, category, contractor_name, contractor_id, start_date, end_date, duration_months, scope, terms, exclusions, contact_name, contact_phone, contact_email, document_url, max_claim_amount } = req.body;
    const numRes = await pool.query('SELECT COUNT(*) FROM warranties WHERE project_id = $1', [projectId]);
    const num = `WAR-${String(parseInt(numRes.rows[0].count, 10) + 1).padStart(3, '0')}`;
    const result = await pool.query(
      `INSERT INTO warranties (project_id, organization_id, warranty_number, title, category, contractor_name, contractor_id, start_date, end_date, duration_months, scope, terms, exclusions, contact_name, contact_phone, contact_email, document_url, max_claim_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [projectId, orgId, num, title, category || 'standard', contractor_name, contractor_id, start_date, end_date, duration_months, scope, terms, exclusions, contact_name, contact_phone, contact_email, document_url, max_claim_amount]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/warranties/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['title', 'category', 'contractor_name', 'start_date', 'end_date', 'duration_months', 'status', 'scope', 'terms', 'exclusions', 'contact_name', 'contact_phone', 'contact_email', 'document_url', 'max_claim_amount'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE warranties SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Warranty not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/projects/:projectId/warranties/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM warranties WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Warranty not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// WARRANTY CLAIMS
// ============================================================================

router.get('/projects/:projectId/warranties/:warrantyId/claims', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { warrantyId } = req.params;
    const result = await pool.query('SELECT * FROM warranty_claims WHERE warranty_id = $1 AND organization_id = $2 ORDER BY reported_date DESC', [warrantyId, orgId]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/warranties/:warrantyId/claims', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { warrantyId } = req.params;
    const { title, description, reported_by, photos } = req.body;
    const numRes = await pool.query('SELECT COUNT(*) FROM warranty_claims WHERE warranty_id = $1', [warrantyId]);
    const num = `CLM-${String(parseInt(numRes.rows[0].count, 10) + 1).padStart(3, '0')}`;
    const result = await pool.query(
      `INSERT INTO warranty_claims (warranty_id, organization_id, claim_number, title, description, reported_by, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [warrantyId, orgId, num, title, description, reported_by, JSON.stringify(photos || [])]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/warranty-claims/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['status', 'resolution_description', 'resolution_cost', 'resolved_date', 'photos'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE warranty_claims SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Claim not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Warranty expiration dashboard
router.get('/projects/:projectId/warranty-dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const [active, expiringSoon, expired, claims] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM warranties WHERE project_id = $1 AND organization_id = $2 AND end_date > CURRENT_DATE`, [projectId, orgId]),
      pool.query(`SELECT * FROM warranties WHERE project_id = $1 AND organization_id = $2 AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days' ORDER BY end_date ASC`, [projectId, orgId]),
      pool.query(`SELECT COUNT(*) FROM warranties WHERE project_id = $1 AND organization_id = $2 AND end_date < CURRENT_DATE`, [projectId, orgId]),
      pool.query(`SELECT wc.*, w.title as warranty_title FROM warranty_claims wc JOIN warranties w ON w.id = wc.warranty_id WHERE w.project_id = $1 AND wc.organization_id = $2 AND wc.status NOT IN ('resolved','denied') ORDER BY wc.reported_date DESC`, [projectId, orgId]),
    ]);
    res.json({
      success: true,
      data: { active_count: parseInt(active.rows[0].count), expiring_soon: expiringSoon.rows, expired_count: parseInt(expired.rows[0].count), open_claims: claims.rows },
    });
  } catch (error) { next(error); }
});

export default router;
