/**
 * Bidding & Prequalification Routes
 * CRUD for bid_packages, bids, vendor_prequalifications
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// BID PACKAGES
// ============================================================================

router.get('/projects/:projectId/bid-packages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId } = req.params;
    const { status, trade, search, page = '1', limit = '50' } = req.query;
    let query = `SELECT bp.*, (SELECT COUNT(*) FROM bids b WHERE b.bid_package_id = bp.id) as bid_count
                 FROM bid_packages bp WHERE bp.project_id = $1 AND bp.organization_id = $2`;
    const params: any[] = [projectId, orgId];
    let idx = 3;
    if (status) { query += ` AND bp.status = $${idx++}`; params.push(status); }
    if (trade) { query += ` AND bp.trade = $${idx++}`; params.push(trade); }
    if (search) { query += ` AND (bp.title ILIKE $${idx} OR bp.description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const countResult = await pool.query(`SELECT COUNT(*) FROM bid_packages WHERE project_id = $1 AND organization_id = $2`, [projectId, orgId]);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY bp.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

router.get('/projects/:projectId/bid-packages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM bid_packages WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid package not found' });
    const bids = await pool.query('SELECT * FROM bids WHERE bid_package_id = $1 ORDER BY bid_amount ASC', [id]);
    res.json({ success: true, data: { ...result.rows[0], bids: bids.rows } });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/bid-packages', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { projectId } = req.params;
    const { title, description, trade, scope_of_work, budget_estimate, bid_due_date, pre_bid_meeting_date, pre_bid_meeting_location, documents, requirements } = req.body;
    const numRes = await pool.query('SELECT COUNT(*) FROM bid_packages WHERE project_id = $1', [projectId]);
    const num = `BP-${String(parseInt(numRes.rows[0].count, 10) + 1).padStart(3, '0')}`;
    const result = await pool.query(
      `INSERT INTO bid_packages (project_id, organization_id, package_number, title, description, trade, scope_of_work, budget_estimate, bid_due_date, pre_bid_meeting_date, pre_bid_meeting_location, documents, requirements, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [projectId, orgId, num, title, description, trade, scope_of_work, budget_estimate, bid_due_date, pre_bid_meeting_date, pre_bid_meeting_location, JSON.stringify(documents || []), JSON.stringify(requirements || []), userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/bid-packages/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['title', 'description', 'trade', 'scope_of_work', 'budget_estimate', 'status', 'bid_due_date', 'pre_bid_meeting_date', 'pre_bid_meeting_location', 'documents', 'requirements', 'awarded_to', 'awarded_to_name', 'awarded_amount'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (req.body.status === 'published') { updates.push(`published_at = NOW()`); }
    if (req.body.status === 'awarded') { updates.push(`awarded_at = NOW()`); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE bid_packages SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid package not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/projects/:projectId/bid-packages/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM bid_packages WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid package not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// BIDS (responses to bid packages)
// ============================================================================

router.post('/projects/:projectId/bid-packages/:packageId/bids', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { packageId } = req.params;
    const { vendor_id, vendor_name, vendor_email, vendor_phone, bid_amount, alternate_amounts, unit_prices, exclusions, inclusions, proposed_schedule_days, bond_included, insurance_verified, documents } = req.body;
    const result = await pool.query(
      `INSERT INTO bids (bid_package_id, organization_id, vendor_id, vendor_name, vendor_email, vendor_phone, bid_amount, alternate_amounts, unit_prices, exclusions, inclusions, proposed_schedule_days, bond_included, insurance_verified, documents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [packageId, orgId, vendor_id, vendor_name, vendor_email, vendor_phone, bid_amount, JSON.stringify(alternate_amounts || []), JSON.stringify(unit_prices || []), exclusions, inclusions, proposed_schedule_days, bond_included || false, insurance_verified || false, JSON.stringify(documents || [])]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/bids/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['status', 'score', 'evaluation_notes', 'bid_amount'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE bids SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Bid comparison matrix
router.get('/projects/:projectId/bid-packages/:packageId/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { packageId } = req.params;
    const pkg = await pool.query('SELECT * FROM bid_packages WHERE id = $1 AND organization_id = $2', [packageId, orgId]);
    if (pkg.rows.length === 0) return res.status(404).json({ success: false, error: 'Package not found' });
    const bids = await pool.query('SELECT * FROM bids WHERE bid_package_id = $1 ORDER BY bid_amount ASC', [packageId]);
    const lowest = bids.rows.length > 0 ? bids.rows[0].bid_amount : null;
    const avg = bids.rows.length > 0 ? bids.rows.reduce((sum: number, b: any) => sum + parseFloat(b.bid_amount), 0) / bids.rows.length : null;
    res.json({
      success: true,
      data: {
        package: pkg.rows[0],
        bids: bids.rows,
        analysis: { bid_count: bids.rows.length, lowest_bid: lowest, average_bid: avg, budget_estimate: pkg.rows[0].budget_estimate },
      },
    });
  } catch (error) { next(error); }
});

// ============================================================================
// VENDOR PREQUALIFICATION
// ============================================================================

router.get('/vendors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { status, search, page = '1', limit = '50' } = req.query;
    let query = `SELECT * FROM vendor_prequalifications WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (search) { query += ` AND (company_name ILIKE $${idx} OR contact_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY company_name ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

router.post('/vendors', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { company_name, contact_name, email, phone, address, trades, years_in_business, annual_revenue, employee_count, bonding_capacity, insurance_general_liability, insurance_workers_comp, insurance_auto, insurance_umbrella, safety_emr, safety_trir, osha_violations, vendor_references, certifications } = req.body;
    const result = await pool.query(
      `INSERT INTO vendor_prequalifications (organization_id, company_name, contact_name, email, phone, address, trades, years_in_business, annual_revenue, employee_count, bonding_capacity, insurance_general_liability, insurance_workers_comp, insurance_auto, insurance_umbrella, safety_emr, safety_trir, osha_violations, vendor_references, certifications)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [orgId, company_name, contact_name, email, phone, address, JSON.stringify(trades || []), years_in_business, annual_revenue, employee_count, bonding_capacity, insurance_general_liability || false, insurance_workers_comp || false, insurance_auto || false, insurance_umbrella || false, safety_emr, safety_trir, osha_violations || 0, JSON.stringify(vendor_references || []), JSON.stringify(certifications || [])]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/vendors/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;
    const fields = ['company_name', 'contact_name', 'email', 'phone', 'address', 'trades', 'years_in_business', 'annual_revenue', 'employee_count', 'bonding_capacity', 'insurance_general_liability', 'insurance_workers_comp', 'insurance_auto', 'insurance_umbrella', 'safety_emr', 'safety_trir', 'osha_violations', 'vendor_references', 'certifications', 'status', 'qualification_score', 'valid_until', 'notes'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (['approved', 'conditional', 'rejected'].includes(req.body.status)) {
      updates.push(`reviewed_by = $${idx++}`); params.push(userId);
      updates.push(`reviewed_at = NOW()`);
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE vendor_prequalifications SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Vendor not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/vendors/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM vendor_prequalifications WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Vendor not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

export default router;
