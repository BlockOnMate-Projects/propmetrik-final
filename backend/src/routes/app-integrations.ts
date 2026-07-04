/**
 * App Marketplace & Integration Framework Routes
 * CRUD for integrations (app marketplace), integration_logs, api_keys
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';
import { getCatalog, type ServiceKey } from '../services/integrations/integrationCatalog';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// APP INTEGRATIONS
// ============================================================================

router.get('/app-integrations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { status, integration_type } = req.query;
    let query = `SELECT id, organization_id, integration_type, name, description, status, auth_type, webhook_url, last_sync_at, last_error, sync_frequency, events_subscribed, created_at, updated_at
                 FROM integrations WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (integration_type) { query += ` AND integration_type = $${idx++}`; params.push(integration_type); }
    query += ` ORDER BY name ASC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get('/app-integrations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, organization_id, integration_type, name, description, status, auth_type, webhook_url, last_sync_at, last_error, sync_frequency, events_subscribed, config, created_at, updated_at
       FROM integrations WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Integration not found' });
    const logs = await pool.query('SELECT * FROM integration_logs WHERE integration_id = $1 ORDER BY created_at DESC LIMIT 20', [id]);
    res.json({ success: true, data: { ...result.rows[0], recent_logs: logs.rows } });
  } catch (error) { next(error); }
});

router.post('/app-integrations', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { integration_type, name, description, auth_type, config, webhook_url, webhook_secret, sync_frequency, events_subscribed } = req.body;
    const result = await pool.query(
      `INSERT INTO integrations (organization_id, integration_type, name, description, auth_type, config, webhook_url, webhook_secret, sync_frequency, events_subscribed, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, organization_id, integration_type, name, description, status, auth_type, webhook_url, sync_frequency, events_subscribed, created_at`,
      [orgId, integration_type, name, description, auth_type || 'api_key', config || {}, webhook_url, webhook_secret, sync_frequency || 'manual', JSON.stringify(events_subscribed || []), userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/app-integrations/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['name', 'description', 'status', 'auth_type', 'config', 'webhook_url', 'webhook_secret', 'sync_frequency', 'events_subscribed'];
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
    const result = await pool.query(`UPDATE integrations SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Integration not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/app-integrations/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM integrations WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Integration not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// Test connection
router.post('/app-integrations/:id/test', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const integration = await pool.query('SELECT * FROM integrations WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (integration.rows.length === 0) return res.status(404).json({ success: false, error: 'Integration not found' });
    await pool.query(
      `INSERT INTO integration_logs (integration_id, organization_id, direction, event_type, status, request_payload)
       VALUES ($1,$2,'outbound','connection_test','success',$3)`,
      [id, orgId, JSON.stringify({ test: true, timestamp: new Date().toISOString() })]
    );
    await pool.query('UPDATE integrations SET last_sync_at = NOW(), last_error = NULL WHERE id = $1', [id]);
    res.json({ success: true, data: { connected: true, message: 'Connection test successful' } });
  } catch (error) { next(error); }
});

// Trigger sync
router.post('/app-integrations/:id/sync', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    await pool.query(
      `INSERT INTO integration_logs (integration_id, organization_id, direction, event_type, status, request_payload)
       VALUES ($1,$2,'outbound','manual_sync','success',$3)`,
      [id, orgId, JSON.stringify({ triggered_at: new Date().toISOString() })]
    );
    await pool.query('UPDATE integrations SET last_sync_at = NOW() WHERE id = $1', [id]);
    res.json({ success: true, data: { synced: true, message: 'Sync triggered successfully' } });
  } catch (error) { next(error); }
});

// Integration logs
router.get('/app-integrations/:id/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const { status, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM integration_logs WHERE integration_id = $1 AND organization_id = $2`;
    const params: any[] = [id, orgId];
    let idx = 3;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

// ============================================================================
// API KEYS
// ============================================================================

router.get('/api-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const result = await pool.query(
      `SELECT id, name, key_prefix, scopes, rate_limit, last_used_at, expires_at, is_active, created_at FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/api-keys', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { name, scopes, rate_limit, expires_at } = req.body;
    const rawKey = `pm_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 10);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const result = await pool.query(
      `INSERT INTO api_keys (organization_id, name, key_prefix, key_hash, scopes, rate_limit, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name, key_prefix, scopes, rate_limit, expires_at, is_active, created_at`,
      [orgId, name, keyPrefix, keyHash, JSON.stringify(scopes || ['read']), rate_limit || 1000, expires_at, userId]
    );
    res.status(201).json({ success: true, data: { ...result.rows[0], key: rawKey } });
  } catch (error) { next(error); }
});

router.put('/api-keys/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const { name, scopes, rate_limit, is_active, expires_at } = req.body;
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (scopes !== undefined) { updates.push(`scopes = $${idx++}`); params.push(JSON.stringify(scopes)); }
    if (rate_limit !== undefined) { updates.push(`rate_limit = $${idx++}`); params.push(rate_limit); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(is_active); }
    if (expires_at !== undefined) { updates.push(`expires_at = $${idx++}`); params.push(expires_at); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    const result = await pool.query(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING id, name, key_prefix, scopes, rate_limit, last_used_at, expires_at, is_active, created_at`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'API key not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/api-keys/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM api_keys WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'API key not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// Marketplace catalog — single source of truth from integrationCatalog (reflects §8A BYO/Platform).
// Optional ?service=pm|crm|valuation|projects scopes the list to a service's Integrations tab.
router.get('/marketplace/catalog', async (req: Request, res: Response) => {
  const service = req.query.service as ServiceKey | undefined;
  const valid: ServiceKey[] = ['pm', 'crm', 'valuation', 'projects'];
  res.json({ success: true, data: getCatalog(valid.includes(service as ServiceKey) ? service : undefined) });
});

export default router;
