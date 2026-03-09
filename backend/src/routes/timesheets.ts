/**
 * Time Tracking & Timesheets Routes
 * CRUD for time_entries, timesheets, crew_schedules
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// TIME ENTRIES
// ============================================================================

router.get('/projects/:projectId/time-entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { user_id, status, entry_date, date_from, date_to, activity_type, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM time_entries WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (user_id) { query += ` AND user_id = $${idx++}`; params.push(user_id); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (entry_date) { query += ` AND entry_date = $${idx++}`; params.push(entry_date); }
    if (date_from) { query += ` AND entry_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND entry_date <= $${idx++}`; params.push(date_to); }
    if (activity_type) { query += ` AND activity_type = $${idx++}`; params.push(activity_type); }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY entry_date DESC, clock_in DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/time-entries', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { entry_date, clock_in, clock_out, hours_worked, overtime_hours, break_minutes, cost_code, activity_type, description, location, latitude, longitude, clock_in_latitude, clock_in_longitude, hourly_rate, user_name } = req.body;
    const totalCost = hourly_rate && hours_worked ? parseFloat(hourly_rate) * parseFloat(hours_worked) : null;
    const result = await pool.query(
      `INSERT INTO time_entries (project_id, organization_id, user_id, user_name, entry_date, clock_in, clock_out, hours_worked, overtime_hours, break_minutes, cost_code, activity_type, description, location, latitude, longitude, clock_in_latitude, clock_in_longitude, hourly_rate, total_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [projectId, orgId, userId, user_name, entry_date || new Date(), clock_in, clock_out, hours_worked, overtime_hours || 0, break_minutes || 0, cost_code, activity_type || 'labor', description, location, latitude, longitude, clock_in_latitude, clock_in_longitude, hourly_rate, totalCost]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Clock in
router.post('/projects/:projectId/time-entries/clock-in', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { latitude, longitude, user_name } = req.body;
    const result = await pool.query(
      `INSERT INTO time_entries (project_id, organization_id, user_id, user_name, entry_date, clock_in, clock_in_latitude, clock_in_longitude, status)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,NOW(),$5,$6,'draft') RETURNING *`,
      [projectId, orgId, userId, user_name, latitude, longitude]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Clock out
router.put('/projects/:projectId/time-entries/:id/clock-out', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    const result = await pool.query(
      `UPDATE time_entries SET clock_out = NOW(), clock_out_latitude = $3, clock_out_longitude = $4,
       hours_worked = EXTRACT(EPOCH FROM (NOW() - clock_in)) / 3600,
       updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId, latitude, longitude]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Time entry not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/time-entries/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['entry_date', 'clock_in', 'clock_out', 'hours_worked', 'overtime_hours', 'break_minutes', 'cost_code', 'activity_type', 'description', 'location', 'latitude', 'longitude', 'hourly_rate', 'total_cost', 'status'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE time_entries SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Time entry not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Approve/reject time entries
router.put('/projects/:projectId/time-entries/:id/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE time_entries SET status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Time entry not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/time-entries/:id/reject', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const result = await pool.query(
      `UPDATE time_entries SET status = 'rejected', rejection_reason = $3, updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId, rejection_reason]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Time entry not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/projects/:projectId/time-entries/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM time_entries WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Time entry not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// TIMESHEETS (weekly summaries)
// ============================================================================

router.get('/projects/:projectId/timesheets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { user_id, status, week_start, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM timesheets WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (user_id) { query += ` AND user_id = $${idx++}`; params.push(user_id); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (week_start) { query += ` AND week_start = $${idx++}`; params.push(week_start); }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY week_start DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/timesheets', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { week_start, week_end, user_name, notes } = req.body;
    // Aggregate time entries for the week
    const entries = await pool.query(
      `SELECT COALESCE(SUM(hours_worked),0) as regular, COALESCE(SUM(overtime_hours),0) as overtime, COALESCE(SUM(total_cost),0) as cost
       FROM time_entries WHERE project_id = $1 AND user_id = $2 AND entry_date BETWEEN $3 AND $4`,
      [projectId, userId, week_start, week_end]
    );
    const { regular, overtime, cost } = entries.rows[0];
    const result = await pool.query(
      `INSERT INTO timesheets (project_id, organization_id, user_id, user_name, week_start, week_end, total_regular_hours, total_overtime_hours, total_cost, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [projectId, orgId, userId, user_name, week_start, week_end, regular, overtime, cost, notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/timesheets/:id/submit', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE timesheets SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Timesheet not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/timesheets/:id/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE timesheets SET status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Timesheet not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// ============================================================================
// CREW SCHEDULES
// ============================================================================

router.get('/projects/:projectId/crews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { schedule_date, status, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM crew_schedules WHERE project_id = $1 AND organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (schedule_date) { query += ` AND schedule_date = $${idx++}`; params.push(schedule_date); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY schedule_date DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/crews', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { crew_name, foreman_id, foreman_name, schedule_date, start_time, end_time, headcount, trade, area, task_description } = req.body;
    const result = await pool.query(
      `INSERT INTO crew_schedules (project_id, organization_id, crew_name, foreman_id, foreman_name, schedule_date, start_time, end_time, headcount, trade, area, task_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [projectId, orgId, crew_name, foreman_id, foreman_name, schedule_date, start_time, end_time, headcount || 0, trade, area, task_description]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Time tracking summary/stats
router.get('/projects/:projectId/time-stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { date_from, date_to } = req.query;
    let dateFilter = '';
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (date_from) { dateFilter += ` AND entry_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND entry_date <= $${idx++}`; params.push(date_to); }
    const stats = await pool.query(
      `SELECT COUNT(*) as total_entries, COALESCE(SUM(hours_worked),0) as total_hours, COALESCE(SUM(overtime_hours),0) as total_overtime,
       COALESCE(SUM(total_cost),0) as total_cost, COUNT(DISTINCT user_id) as unique_workers, COUNT(DISTINCT entry_date) as days_worked
       FROM time_entries WHERE project_id = $1 AND organization_id = $2 ${dateFilter}`, params
    );
    const byActivity = await pool.query(
      `SELECT activity_type, SUM(hours_worked) as hours, COUNT(*) as entries FROM time_entries WHERE project_id = $1 AND organization_id = $2 ${dateFilter} GROUP BY activity_type`, params
    );
    res.json({ success: true, data: { summary: stats.rows[0], by_activity: byActivity.rows } });
  } catch (error) { next(error); }
});

export default router;
