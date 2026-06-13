/**
 * Issues & Risks Routes
 * CRUD for project_issues and project_risks tables
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, registerProjectAccessParams, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);
// All routes are /projects/:projectId/... — gate by project membership.
registerProjectAccessParams(router, ['projectId']);

// ============================================================================
// ISSUES
// ============================================================================

// List issues for a project
router.get('/projects/:projectId/issues', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, priority, severity, category, assigned_to, search, page = '1', limit = '50' } = req.query;
    
    let query = `SELECT * FROM project_issues WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (priority) { query += ` AND priority = $${idx++}`; params.push(priority); }
    if (severity) { query += ` AND severity = $${idx++}`; params.push(severity); }
    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (assigned_to) { query += ` AND assigned_to = $${idx++}`; params.push(assigned_to); }
    if (search) { query += ` AND (title ILIKE $${idx} OR description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) });
  } catch (error) { next(error); }
});

// Get single issue
router.get('/projects/:projectId/issues/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM project_issues WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Issue not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Create issue
router.post('/projects/:projectId/issues', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { title, description, category, severity, priority, assigned_to, due_date, location, tags } = req.body;

    // Auto-generate issue number
    const countResult = await pool.query('SELECT COUNT(*) FROM project_issues WHERE project_id = $1', [projectId]);
    const issueNumber = `ISS-${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(4, '0')}`;

    const result = await pool.query(
      `INSERT INTO project_issues (project_id, organization_id, issue_number, title, description, category, severity, priority, assigned_to, due_date, location, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [projectId, orgId, issueNumber, title, description, category || 'general', severity || 'medium', priority || 'medium', assigned_to, due_date, location, tags || [], userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Update issue
router.put('/projects/:projectId/issues/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const { title, description, category, severity, status, priority, assigned_to, due_date, location, tags, resolution_notes } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (category !== undefined) { updates.push(`category = $${idx++}`); params.push(category); }
    if (severity !== undefined) { updates.push(`severity = $${idx++}`); params.push(severity); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
    if (priority !== undefined) { updates.push(`priority = $${idx++}`); params.push(priority); }
    if (assigned_to !== undefined) { updates.push(`assigned_to = $${idx++}`); params.push(assigned_to); }
    if (due_date !== undefined) { updates.push(`due_date = $${idx++}`); params.push(due_date); }
    if (location !== undefined) { updates.push(`location = $${idx++}`); params.push(location); }
    if (tags !== undefined) { updates.push(`tags = $${idx++}`); params.push(tags); }
    if (resolution_notes !== undefined) { updates.push(`resolution_notes = $${idx++}`); params.push(resolution_notes); }

    // Auto-set resolved_at when status changes to resolved/closed
    if (status === 'resolved' || status === 'closed') {
      updates.push(`resolved_at = CURRENT_TIMESTAMP`);
      updates.push(`resolved_by = $${idx++}`);
      params.push(getAuthUserId(req));
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, orgId);

    const result = await pool.query(
      `UPDATE project_issues SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Issue not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Delete issue
router.delete('/projects/:projectId/issues/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM project_issues WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Issue not found' });
    res.json({ success: true, message: 'Issue deleted' });
  } catch (error) { next(error); }
});

// ============================================================================
// RISKS
// ============================================================================

// List risks for a project
router.get('/projects/:projectId/risks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, risk_level, probability, impact, category, search, page = '1', limit = '50' } = req.query;

    let query = `SELECT * FROM project_risks WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (risk_level) { query += ` AND risk_level = $${idx++}`; params.push(risk_level); }
    if (probability) { query += ` AND probability = $${idx++}`; params.push(probability); }
    if (impact) { query += ` AND impact = $${idx++}`; params.push(impact); }
    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (search) { query += ` AND (title ILIKE $${idx} OR description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) });
  } catch (error) { next(error); }
});

// Get single risk
router.get('/projects/:projectId/risks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM project_risks WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Risk not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Create risk
router.post('/projects/:projectId/risks', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { title, description, category, risk_level, probability, impact, mitigation_plan, contingency_plan, owner_id, trigger_conditions, response_strategy, cost_impact, schedule_impact_days } = req.body;

    const countResult = await pool.query('SELECT COUNT(*) FROM project_risks WHERE project_id = $1', [projectId]);
    const riskNumber = `RSK-${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(4, '0')}`;

    const result = await pool.query(
      `INSERT INTO project_risks (project_id, organization_id, risk_number, title, description, category, risk_level, probability, impact, mitigation_plan, contingency_plan, owner_id, trigger_conditions, response_strategy, cost_impact, schedule_impact_days, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [projectId, orgId, riskNumber, title, description, category || 'general', risk_level || 'medium', probability || 'possible', impact || 'moderate', mitigation_plan, contingency_plan, owner_id, trigger_conditions, response_strategy || 'mitigate', cost_impact, schedule_impact_days, userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Update risk
router.put('/projects/:projectId/risks/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = req.body;

    const allowedFields = ['title', 'description', 'category', 'risk_level', 'probability', 'impact', 'status', 'mitigation_plan', 'contingency_plan', 'owner_id', 'trigger_conditions', 'response_strategy', 'cost_impact', 'schedule_impact_days', 'residual_risk_level'];
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(fields[field]);
      }
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, orgId);

    const result = await pool.query(
      `UPDATE project_risks SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Risk not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Delete risk
router.delete('/projects/:projectId/risks/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM project_risks WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Risk not found' });
    res.json({ success: true, message: 'Risk deleted' });
  } catch (error) { next(error); }
});

export default router;
