/**
 * Equipment Tracking Routes
 * CRUD for equipment, equipment_assignments, equipment_maintenance
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// EQUIPMENT (org-level)
// ============================================================================

router.get('/equipment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { status, category, search, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM equipment WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (search) { query += ` AND (name ILIKE $${idx} OR equipment_number ILIKE $${idx} OR serial_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY name ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

router.get('/equipment/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM equipment WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });
    // Get assignments and maintenance history
    const [assignments, maintenance] = await Promise.all([
      pool.query('SELECT * FROM equipment_assignments WHERE equipment_id = $1 ORDER BY assigned_date DESC LIMIT 10', [id]),
      pool.query('SELECT * FROM equipment_maintenance WHERE equipment_id = $1 ORDER BY scheduled_date DESC LIMIT 10', [id]),
    ]);
    res.json({ success: true, data: { ...result.rows[0], assignments: assignments.rows, maintenance: maintenance.rows } });
  } catch (error) { next(error); }
});

router.post('/equipment', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { equipment_number, name, category, make, model, serial_number, year, ownership_type, purchase_date, purchase_cost, rental_rate_daily, rental_rate_weekly, rental_rate_monthly, insurance_expiry, fuel_type, notes, photo_url } = req.body;
    const result = await pool.query(
      `INSERT INTO equipment (organization_id, equipment_number, name, category, make, model, serial_number, year, ownership_type, purchase_date, purchase_cost, rental_rate_daily, rental_rate_weekly, rental_rate_monthly, insurance_expiry, fuel_type, notes, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [orgId, equipment_number, name, category || 'heavy', make, model, serial_number, year, ownership_type || 'owned', purchase_date, purchase_cost, rental_rate_daily, rental_rate_weekly, rental_rate_monthly, insurance_expiry, fuel_type, notes, photo_url]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/equipment/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['equipment_number', 'name', 'category', 'make', 'model', 'serial_number', 'year', 'status', 'condition_rating', 'current_project_id', 'current_location', 'ownership_type', 'purchase_date', 'purchase_cost', 'rental_rate_daily', 'rental_rate_weekly', 'rental_rate_monthly', 'insurance_expiry', 'registration_expiry', 'last_inspection_date', 'next_inspection_date', 'hours_meter', 'odometer', 'fuel_type', 'photo_url', 'notes'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE equipment SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/equipment/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM equipment WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// EQUIPMENT ASSIGNMENTS (project-level)
// ============================================================================

router.get('/projects/:projectId/equipment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status } = req.query;
    let query = `SELECT ea.*, e.name as equipment_name, e.equipment_number, e.category, e.make, e.model, e.condition_rating
                 FROM equipment_assignments ea JOIN equipment e ON e.id = ea.equipment_id
                 WHERE ea.project_id = $1 AND ea.organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (status) { query += ` AND ea.status = $${idx++}`; params.push(status); }
    query += ` ORDER BY ea.assigned_date DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/equipment', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { equipment_id, assigned_to, assigned_to_name, assigned_date, return_date, daily_rate, notes } = req.body;
    // Update equipment current project
    await pool.query('UPDATE equipment SET current_project_id = $1, status = $3, updated_at = NOW() WHERE id = $2', [projectId, equipment_id, 'in_use']);
    const result = await pool.query(
      `INSERT INTO equipment_assignments (equipment_id, project_id, organization_id, assigned_to, assigned_to_name, assigned_date, return_date, daily_rate, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [equipment_id, projectId, orgId, assigned_to, assigned_to_name, assigned_date || new Date(), return_date, daily_rate, notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/equipment/:id/return', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const assignment = await pool.query(
      `UPDATE equipment_assignments SET status = 'returned', actual_return_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId]
    );
    if (assignment.rows.length === 0) return res.status(404).json({ success: false, error: 'Assignment not found' });
    // Update equipment status
    await pool.query('UPDATE equipment SET status = $2, current_project_id = NULL, updated_at = NOW() WHERE id = $1', [assignment.rows[0].equipment_id, 'available']);
    res.json({ success: true, data: assignment.rows[0] });
  } catch (error) { next(error); }
});

// ============================================================================
// EQUIPMENT MAINTENANCE
// ============================================================================

router.get('/equipment/:equipmentId/maintenance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { equipmentId } = req.params;
    const result = await pool.query('SELECT * FROM equipment_maintenance WHERE equipment_id = $1 AND organization_id = $2 ORDER BY scheduled_date DESC', [equipmentId, orgId]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/equipment/:equipmentId/maintenance', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { equipmentId } = req.params;
    const { maintenance_type, description, scheduled_date, cost, performed_by, vendor, parts_used, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO equipment_maintenance (equipment_id, organization_id, maintenance_type, description, scheduled_date, cost, performed_by, vendor, parts_used, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [equipmentId, orgId, maintenance_type || 'preventive', description, scheduled_date, cost || 0, performed_by, vendor, parts_used, notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/equipment/:equipmentId/maintenance/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['maintenance_type', 'description', 'status', 'scheduled_date', 'completed_date', 'cost', 'performed_by', 'vendor', 'parts_used', 'hours_at_service', 'next_service_hours', 'notes'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE equipment_maintenance SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Record not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Equipment utilization stats
router.get('/equipment-stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const stats = await pool.query(
      `SELECT status, category, COUNT(*) as count FROM equipment WHERE organization_id = $1 GROUP BY status, category`,
      [orgId]
    );
    const upcomingMaintenance = await pool.query(
      `SELECT em.*, e.name, e.equipment_number FROM equipment_maintenance em JOIN equipment e ON e.id = em.equipment_id
       WHERE em.organization_id = $1 AND em.status = 'scheduled' AND em.scheduled_date <= CURRENT_DATE + INTERVAL '30 days'
       ORDER BY em.scheduled_date ASC LIMIT 20`,
      [orgId]
    );
    const expiringInsurance = await pool.query(
      `SELECT id, name, equipment_number, insurance_expiry FROM equipment
       WHERE organization_id = $1 AND insurance_expiry IS NOT NULL AND insurance_expiry <= CURRENT_DATE + INTERVAL '30 days'
       ORDER BY insurance_expiry ASC LIMIT 20`,
      [orgId]
    );
    res.json({
      success: true,
      data: { by_status_category: stats.rows, upcoming_maintenance: upcomingMaintenance.rows, expiring_insurance: expiringInsurance.rows },
    });
  } catch (error) { next(error); }
});

export default router;
