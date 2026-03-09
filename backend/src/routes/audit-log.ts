/**
 * Global Audit Log Routes (SOC 2 Compliance)
 * Query endpoint for audit_log table
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// Query audit log
router.get('/audit-log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { user_id, action, resource_type, resource_id, date_from, date_to, search, page = '1', limit = '100' } = req.query;
    let query = `SELECT * FROM audit_log WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (user_id) { query += ` AND user_id = $${idx++}`; params.push(user_id); }
    if (action) { query += ` AND action = $${idx++}`; params.push(action); }
    if (resource_type) { query += ` AND resource_type = $${idx++}`; params.push(resource_type); }
    if (resource_id) { query += ` AND resource_id = $${idx++}`; params.push(resource_id); }
    if (date_from) { query += ` AND created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND created_at <= $${idx++}`; params.push(date_to); }
    if (search) { query += ` AND (user_email ILIKE $${idx} OR user_name ILIKE $${idx} OR resource_name ILIKE $${idx} OR request_path ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) });
  } catch (error) { next(error); }
});

// Audit log summary stats
router.get('/audit-log/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { days = '30' } = req.query;
    const since = `NOW() - INTERVAL '${parseInt(days as string, 10)} days'`;
    const [byAction, byResource, byUser, timeline] = await Promise.all([
      pool.query(`SELECT action, COUNT(*) as count FROM audit_log WHERE organization_id = $1 AND created_at > ${since} GROUP BY action ORDER BY count DESC`, [orgId]),
      pool.query(`SELECT resource_type, COUNT(*) as count FROM audit_log WHERE organization_id = $1 AND created_at > ${since} GROUP BY resource_type ORDER BY count DESC`, [orgId]),
      pool.query(`SELECT user_email, user_name, COUNT(*) as count FROM audit_log WHERE organization_id = $1 AND created_at > ${since} GROUP BY user_email, user_name ORDER BY count DESC LIMIT 20`, [orgId]),
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as count FROM audit_log WHERE organization_id = $1 AND created_at > ${since} GROUP BY DATE(created_at) ORDER BY day DESC`, [orgId]),
    ]);
    const totalCount = await pool.query(`SELECT COUNT(*) FROM audit_log WHERE organization_id = $1 AND created_at > ${since}`, [orgId]);
    res.json({
      success: true,
      data: {
        total: parseInt(totalCount.rows[0].count, 10),
        by_action: byAction.rows,
        by_resource: byResource.rows,
        by_user: byUser.rows,
        timeline: timeline.rows,
      },
    });
  } catch (error) { next(error); }
});

// Export audit log (for SOC 2 auditors)
router.get('/audit-log/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { date_from, date_to, format = 'json' } = req.query;
    let query = `SELECT * FROM audit_log WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (date_from) { query += ` AND created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND created_at <= $${idx++}`; params.push(date_to); }
    query += ` ORDER BY created_at DESC LIMIT 10000`;
    const result = await pool.query(query, params);
    if (format === 'csv') {
      const headers = ['id', 'user_email', 'user_name', 'action', 'resource_type', 'resource_id', 'resource_name', 'ip_address', 'request_method', 'request_path', 'response_status', 'created_at'];
      const csv = [headers.join(','), ...result.rows.map((r: any) => headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
      return res.send(csv);
    }
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) { next(error); }
});

// Utility: Log an audit event (used by other routes/middleware)
export async function logAuditEvent(params: {
  organizationId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  responseStatus?: number;
  durationMs?: number;
}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, user_email, user_name, action, resource_type, resource_id, resource_name, details, ip_address, user_agent, request_method, request_path, response_status, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [params.organizationId, params.userId, params.userEmail, params.userName, params.action, params.resourceType, params.resourceId, params.resourceName, params.details ? JSON.stringify(params.details) : null, params.ipAddress, params.userAgent, params.requestMethod, params.requestPath, params.responseStatus, params.durationMs]
    );
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

export default router;
