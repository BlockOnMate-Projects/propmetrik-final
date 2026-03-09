/**
 * Safety & Incident Management Routes
 * CRUD for safety_incidents, safety_observations, safety_inspections
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// INCIDENTS
// ============================================================================

router.get('/projects/:projectId/safety/incidents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, incident_type, severity, search, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM safety_incidents WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (incident_type) { query += ` AND incident_type = $${idx++}`; params.push(incident_type); }
    if (severity) { query += ` AND severity = $${idx++}`; params.push(severity); }
    if (search) { query += ` AND (title ILIKE $${idx} OR description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY incident_date DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) });
  } catch (error) { next(error); }
});

router.get('/projects/:projectId/safety/incidents/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM safety_incidents WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/safety/incidents', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { title, incident_type, severity, description, location, incident_date, assigned_investigator, investigator_name, witnesses, injuries_count, property_damage_cost, lost_work_days, osha_recordable } = req.body;
    const numRes = await pool.query('SELECT COUNT(*) FROM safety_incidents WHERE project_id = $1', [projectId]);
    const num = `INC-${String(parseInt(numRes.rows[0].count, 10) + 1).padStart(4, '0')}`;
    const result = await pool.query(
      `INSERT INTO safety_incidents (project_id, organization_id, incident_number, title, incident_type, severity, description, location, incident_date, reported_by, assigned_investigator, investigator_name, witnesses, injuries_count, property_damage_cost, lost_work_days, osha_recordable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [projectId, orgId, num, title, incident_type || 'near_miss', severity || 'low', description, location, incident_date || new Date(), userId, assigned_investigator, investigator_name, JSON.stringify(witnesses || []), injuries_count || 0, property_damage_cost || 0, lost_work_days || 0, osha_recordable || false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/safety/incidents/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['title', 'incident_type', 'severity', 'status', 'description', 'location', 'incident_date', 'assigned_investigator', 'investigator_name', 'root_cause', 'corrective_actions', 'preventive_actions', 'witnesses', 'injuries_count', 'property_damage_cost', 'lost_work_days', 'osha_recordable', 'photos', 'attachments'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (req.body.status === 'resolved') { updates.push(`resolved_at = NOW()`); }
    if (req.body.status === 'closed') { updates.push(`closed_at = NOW()`); updates.push(`closed_by = $${idx++}`); params.push(getAuthUserId(req)); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE safety_incidents SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/projects/:projectId/safety/incidents/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM safety_incidents WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// OBSERVATIONS
// ============================================================================

router.get('/projects/:projectId/safety/observations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, category, severity, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM safety_observations WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (severity) { query += ` AND severity = $${idx++}`; params.push(severity); }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/safety/observations', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { category, severity, description, location, corrective_action, due_date } = req.body;
    const numRes = await pool.query('SELECT COUNT(*) FROM safety_observations WHERE project_id = $1', [projectId]);
    const num = `OBS-${String(parseInt(numRes.rows[0].count, 10) + 1).padStart(4, '0')}`;
    const result = await pool.query(
      `INSERT INTO safety_observations (project_id, organization_id, observation_number, category, severity, description, location, observed_by, corrective_action, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [projectId, orgId, num, category || 'unsafe_condition', severity || 'low', description, location, userId, corrective_action, due_date]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/safety/observations/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['category', 'severity', 'status', 'description', 'location', 'corrective_action', 'due_date', 'photos'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (req.body.status === 'resolved') { updates.push(`resolved_at = NOW()`); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE safety_observations SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Observation not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/projects/:projectId/safety/observations/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM safety_observations WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Observation not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// INSPECTIONS
// ============================================================================

router.get('/projects/:projectId/safety/inspections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, inspection_type, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM safety_inspections WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (inspection_type) { query += ` AND inspection_type = $${idx++}`; params.push(inspection_type); }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY inspection_date DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/safety/inspections', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { inspection_type, inspection_date, notes } = req.body;
    const numRes = await pool.query('SELECT COUNT(*) FROM safety_inspections WHERE project_id = $1', [projectId]);
    const num = `INS-${String(parseInt(numRes.rows[0].count, 10) + 1).padStart(4, '0')}`;
    const result = await pool.query(
      `INSERT INTO safety_inspections (project_id, organization_id, inspection_number, inspection_type, inspector_id, inspection_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [projectId, orgId, num, inspection_type || 'routine', userId, inspection_date || new Date(), notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/safety/inspections/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['inspection_type', 'status', 'inspection_date', 'score', 'total_items', 'passed_items', 'failed_items', 'findings', 'notes'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]); }
    }
    if (req.body.status === 'completed') { updates.push(`completed_at = NOW()`); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE safety_inspections SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Inspection not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/projects/:projectId/safety/inspections/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM safety_inspections WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Inspection not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// Safety dashboard stats
router.get('/projects/:projectId/safety/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const [incidents, observations, inspections] = await Promise.all([
      pool.query(`SELECT incident_type, severity, status, COUNT(*) as count FROM safety_incidents WHERE project_id = $1 AND organization_id = $2 GROUP BY incident_type, severity, status`, [projectId, orgId]),
      pool.query(`SELECT category, status, COUNT(*) as count FROM safety_observations WHERE project_id = $1 AND organization_id = $2 GROUP BY category, status`, [projectId, orgId]),
      pool.query(`SELECT inspection_type, status, AVG(score) as avg_score, COUNT(*) as count FROM safety_inspections WHERE project_id = $1 AND organization_id = $2 GROUP BY inspection_type, status`, [projectId, orgId]),
    ]);
    const totalIncidents = await pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN osha_recordable THEN 1 ELSE 0 END) as osha_recordable, SUM(lost_work_days) as total_lost_days, SUM(injuries_count) as total_injuries FROM safety_incidents WHERE project_id = $1 AND organization_id = $2`, [projectId, orgId]);
    res.json({
      success: true,
      data: {
        incidents: incidents.rows,
        observations: observations.rows,
        inspections: inspections.rows,
        summary: totalIncidents.rows[0],
      },
    });
  } catch (error) { next(error); }
});

export default router;
