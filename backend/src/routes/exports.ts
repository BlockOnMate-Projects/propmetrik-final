/**
 * Data Export Routes
 * CSV and PDF export for project data (issues, risks, drawings, meetings, budget, team)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// Utility: convert rows to CSV
function toCSV(rows: any[], columns?: string[]): string {
  if (rows.length === 0) return '';
  const keys = columns || Object.keys(rows[0]);
  const header = keys.join(',');
  const lines = rows.map(row =>
    keys.map(k => {
      const val = row[k];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

// ============================================================================
// GENERIC PROJECT DATA EXPORT
// ============================================================================

// Export project issues as CSV
router.get('/projects/:projectId/export/issues', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const format = (req.query.format as string) || 'csv';

    const result = await pool.query(
      `SELECT issue_number, title, description, category, severity, status, priority, location, due_date, created_at, updated_at, resolved_at, resolution_notes
       FROM project_issues WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
      [projectId, orgId]
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=issues-${projectId}.csv`);
      return res.send(toCSV(result.rows));
    }

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error) { next(error); }
});

// Export project risks as CSV
router.get('/projects/:projectId/export/risks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const format = (req.query.format as string) || 'csv';

    const result = await pool.query(
      `SELECT risk_number, title, description, category, risk_level, probability, impact, status, response_strategy, mitigation_plan, contingency_plan, cost_impact, schedule_impact_days, created_at
       FROM project_risks WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
      [projectId, orgId]
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=risks-${projectId}.csv`);
      return res.send(toCSV(result.rows));
    }

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error) { next(error); }
});

// Export project drawings as CSV
router.get('/projects/:projectId/export/drawings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT d.drawing_number, d.title, d.discipline, d.current_revision, d.status, d.sheet_size, d.scale, d.created_at,
              (SELECT COUNT(*) FROM drawing_revisions WHERE drawing_id = d.id) as revision_count
       FROM project_drawings d WHERE d.project_id = $1 AND d.organization_id = $2 ORDER BY d.drawing_number`,
      [projectId, orgId]
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=drawings-${projectId}.csv`);
    res.send(toCSV(result.rows));
  } catch (error) { next(error); }
});

// Export project meetings as CSV
router.get('/projects/:projectId/export/meetings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT m.meeting_number, m.title, m.meeting_type, m.meeting_date, m.start_time, m.end_time, m.location, m.status, m.summary,
              (SELECT COUNT(*) FROM meeting_attendees WHERE meeting_id = m.id) as attendee_count,
              (SELECT COUNT(*) FROM meeting_action_items WHERE meeting_id = m.id) as action_items,
              (SELECT COUNT(*) FROM meeting_action_items WHERE meeting_id = m.id AND status = 'completed') as completed_actions
       FROM project_meetings m WHERE m.project_id = $1 AND m.organization_id = $2 ORDER BY m.meeting_date DESC`,
      [projectId, orgId]
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=meetings-${projectId}.csv`);
    res.send(toCSV(result.rows));
  } catch (error) { next(error); }
});

// Export RFIs as CSV
router.get('/projects/:projectId/export/rfis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT rfi_number, subject, status, priority, discipline, submitted_by_name, assigned_to_name, due_date, closed_date, created_at
       FROM rfis WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
      [projectId, orgId]
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=rfis-${projectId}.csv`);
    res.send(toCSV(result.rows));
  } catch (error) { next(error); }
});

// Export Change Orders as CSV
router.get('/projects/:projectId/export/change-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT co_number, title, status, change_type, reason, amount, schedule_impact_days, submitted_by_name, approved_by_name, created_at
       FROM change_orders WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
      [projectId, orgId]
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=change-orders-${projectId}.csv`);
    res.send(toCSV(result.rows));
  } catch (error) { next(error); }
});

// Export project budget/costs as CSV
router.get('/projects/:projectId/export/budget', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT category, description, vendor, amount, currency, cost_type, status, date, created_at
       FROM project_costs WHERE project_id = $1 AND organization_id = $2 ORDER BY date DESC`,
      [projectId, orgId]
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=budget-${projectId}.csv`);
    res.send(toCSV(result.rows));
  } catch (error) { next(error); }
});

// Master export — all project data in one ZIP-like JSON bundle
router.get('/projects/:projectId/export/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;

    const [project, issues, risks, drawings, meetings, costs] = await Promise.all([
      pool.query('SELECT * FROM development_projects WHERE id = $1 AND organization_id = $2', [projectId, orgId]),
      pool.query('SELECT * FROM project_issues WHERE project_id = $1 AND organization_id = $2', [projectId, orgId]),
      pool.query('SELECT * FROM project_risks WHERE project_id = $1 AND organization_id = $2', [projectId, orgId]),
      pool.query('SELECT * FROM project_drawings WHERE project_id = $1 AND organization_id = $2', [projectId, orgId]),
      pool.query('SELECT * FROM project_meetings WHERE project_id = $1 AND organization_id = $2', [projectId, orgId]),
      pool.query('SELECT * FROM project_costs WHERE project_id = $1 AND organization_id = $2', [projectId, orgId]),
    ]);

    res.json({
      success: true,
      data: {
        project: project.rows[0] || null,
        issues: issues.rows,
        risks: risks.rows,
        drawings: drawings.rows,
        meetings: meetings.rows,
        costs: costs.rows,
        exported_at: new Date().toISOString(),
      }
    });
  } catch (error) { next(error); }
});

export default router;
