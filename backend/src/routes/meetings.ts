/**
 * Meeting Minutes Routes
 * CRUD for project_meetings, meeting_attendees, and meeting_action_items tables
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// MEETINGS
// ============================================================================

// List meetings for a project
router.get('/projects/:projectId/meetings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, meeting_type, search, page = '1', limit = '50' } = req.query;

    let query = `SELECT m.*, 
      (SELECT COUNT(*) FROM meeting_attendees WHERE meeting_id = m.id) as attendee_count,
      (SELECT COUNT(*) FROM meeting_action_items WHERE meeting_id = m.id) as action_item_count,
      (SELECT COUNT(*) FROM meeting_action_items WHERE meeting_id = m.id AND status = 'completed') as completed_actions
      FROM project_meetings m WHERE m.project_id = $1 AND m.organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;

    if (status) { query += ` AND m.status = $${idx++}`; params.push(status); }
    if (meeting_type) { query += ` AND m.meeting_type = $${idx++}`; params.push(meeting_type); }
    if (search) { query += ` AND (m.title ILIKE $${idx} OR m.summary ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countResult = await pool.query(`SELECT COUNT(*) FROM project_meetings m WHERE m.project_id = $1 AND m.organization_id = $2`, [projectId, orgId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY m.meeting_date DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) });
  } catch (error) { next(error); }
});

// Get single meeting with attendees and action items
router.get('/projects/:projectId/meetings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;

    const meetingResult = await pool.query('SELECT * FROM project_meetings WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (meetingResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Meeting not found' });

    const [attendeesResult, actionsResult] = await Promise.all([
      pool.query('SELECT * FROM meeting_attendees WHERE meeting_id = $1 ORDER BY name', [id]),
      pool.query('SELECT * FROM meeting_action_items WHERE meeting_id = $1 ORDER BY priority DESC, due_date ASC', [id]),
    ]);

    const meeting = {
      ...meetingResult.rows[0],
      attendees: attendeesResult.rows,
      action_items: actionsResult.rows,
    };
    res.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

// Create meeting
router.post('/projects/:projectId/meetings', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { title, meeting_type, meeting_date, start_time, end_time, location, summary, notes, attendees, action_items } = req.body;

    const countResult = await pool.query('SELECT COUNT(*) FROM project_meetings WHERE project_id = $1', [projectId]);
    const meetingNumber = `MTG-${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(4, '0')}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const meetingResult = await client.query(
        `INSERT INTO project_meetings (project_id, organization_id, meeting_number, title, meeting_type, meeting_date, start_time, end_time, location, summary, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [projectId, orgId, meetingNumber, title, meeting_type || 'general', meeting_date, start_time, end_time, location, summary, notes, userId]
      );
      const meeting = meetingResult.rows[0];

      // Insert attendees
      if (attendees && attendees.length > 0) {
        for (const attendee of attendees) {
          await client.query(
            'INSERT INTO meeting_attendees (meeting_id, user_id, name, email, role) VALUES ($1, $2, $3, $4, $5)',
            [meeting.id, attendee.user_id, attendee.name, attendee.email, attendee.role]
          );
        }
      }

      // Insert action items
      if (action_items && action_items.length > 0) {
        for (const item of action_items) {
          await client.query(
            'INSERT INTO meeting_action_items (meeting_id, description, assigned_to, assigned_to_name, due_date, priority) VALUES ($1, $2, $3, $4, $5, $6)',
            [meeting.id, item.description, item.assigned_to, item.assigned_to_name, item.due_date, item.priority || 'normal']
          );
        }
      }

      await client.query('COMMIT');

      // Return full meeting with attendees and action items
      const [attendeesRes, actionsRes] = await Promise.all([
        pool.query('SELECT * FROM meeting_attendees WHERE meeting_id = $1', [meeting.id]),
        pool.query('SELECT * FROM meeting_action_items WHERE meeting_id = $1', [meeting.id]),
      ]);

      res.status(201).json({
        success: true,
        data: { ...meeting, attendees: attendeesRes.rows, action_items: actionsRes.rows }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

// Update meeting
router.put('/projects/:projectId/meetings/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = req.body;
    const allowedFields = ['title', 'meeting_type', 'meeting_date', 'start_time', 'end_time', 'location', 'status', 'summary', 'notes'];
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (fields[field] !== undefined) { updates.push(`${field} = $${idx++}`); params.push(fields[field]); }
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, orgId);

    const result = await pool.query(
      `UPDATE project_meetings SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Meeting not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Delete meeting
router.delete('/projects/:projectId/meetings/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM project_meetings WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Meeting not found' });
    res.json({ success: true, message: 'Meeting deleted' });
  } catch (error) { next(error); }
});

// ============================================================================
// ATTENDEES
// ============================================================================

// Add attendee
router.post('/projects/:projectId/meetings/:id/attendees', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: meetingId } = req.params;
    const { user_id, name, email, role } = req.body;
    const result = await pool.query(
      'INSERT INTO meeting_attendees (meeting_id, user_id, name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [meetingId, user_id, name, email, role]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Update attendee attendance
router.put('/projects/:projectId/meetings/:id/attendees/:attendeeId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attendeeId } = req.params;
    const { attended, role } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (attended !== undefined) { updates.push(`attended = $${idx++}`); params.push(attended); }
    if (role !== undefined) { updates.push(`role = $${idx++}`); params.push(role); }
    params.push(attendeeId);
    const result = await pool.query(`UPDATE meeting_attendees SET ${updates.join(', ')} WHERE id = $${idx++} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Attendee not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Remove attendee
router.delete('/projects/:projectId/meetings/:id/attendees/:attendeeId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attendeeId } = req.params;
    await pool.query('DELETE FROM meeting_attendees WHERE id = $1', [attendeeId]);
    res.json({ success: true, message: 'Attendee removed' });
  } catch (error) { next(error); }
});

// ============================================================================
// ACTION ITEMS
// ============================================================================

// Add action item
router.post('/projects/:projectId/meetings/:id/actions', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: meetingId } = req.params;
    const { description, assigned_to, assigned_to_name, due_date, priority } = req.body;
    const result = await pool.query(
      'INSERT INTO meeting_action_items (meeting_id, description, assigned_to, assigned_to_name, due_date, priority) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [meetingId, description, assigned_to, assigned_to_name, due_date, priority || 'normal']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Update action item
router.put('/projects/:projectId/meetings/:id/actions/:actionId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actionId } = req.params;
    const fields = req.body;
    const allowedFields = ['description', 'assigned_to', 'assigned_to_name', 'due_date', 'status', 'priority'];
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (fields[field] !== undefined) { updates.push(`${field} = $${idx++}`); params.push(fields[field]); }
    }
    if (fields.status === 'completed') { updates.push('completed_at = CURRENT_TIMESTAMP'); }
    params.push(actionId);

    const result = await pool.query(
      `UPDATE meeting_action_items SET ${updates.join(', ')} WHERE id = $${idx++} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Action item not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Delete action item
router.delete('/projects/:projectId/meetings/:id/actions/:actionId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actionId } = req.params;
    await pool.query('DELETE FROM meeting_action_items WHERE id = $1', [actionId]);
    res.json({ success: true, message: 'Action item deleted' });
  } catch (error) { next(error); }
});

export default router;
