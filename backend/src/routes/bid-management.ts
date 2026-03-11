/**
 * Bid Management Routes
 * Full bid request lifecycle: create, publish, invite vendors, receive submissions,
 * evaluate, Q&A, and award — with tokenized public vendor portal.
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { pool } from '../database';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../database/minio';
import { authenticate } from '../middleware/auth';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { notificationService } from '../../shared-services/notifications/unified';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();
registerPMParamValidation(router);

const bidUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── helpers ──────────────────────────────────────────────────────
const TRADE_CATEGORIES = [
  'electrical', 'plumbing', 'hvac', 'structural', 'civil',
  'roofing', 'landscaping', 'mechanical', 'finishing',
  'consultancy', 'other',
] as const;

const BID_REQUEST_STATUSES = [
  'draft', 'published', 'closed', 'under_evaluation', 'awarded', 'cancelled', 'archived',
] as const;

function generateToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

async function logActivity(
  bidRequestId: string,
  action: string,
  actorId: string | null,
  actorName: string | null,
  details: Record<string, unknown> = {},
) {
  await pool.query(
    `INSERT INTO bid_activity_log (bid_request_id, action, actor_id, actor_name, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [bidRequestId, action, actorId, actorName, JSON.stringify(details)],
  );
}

// ── Zod schemas ──────────────────────────────────────────────────
const createBidRequestSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  project_id: z.string().uuid(),
  trade_category: z.string().optional().default('other'),
  estimated_budget: z.number().positive().optional().nullable(),
  currency: z.string().max(10).optional().default('GHS'),
  disclose_budget: z.boolean().optional().default(false),
  submission_deadline: z.string().min(1),
  site_visit_date: z.string().optional().nullable(),
  qa_deadline: z.string().optional().nullable(),
  vendor_eligibility_notes: z.string().optional().nullable(),
});

const updateBidRequestSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  trade_category: z.string().optional(),
  estimated_budget: z.number().positive().optional().nullable(),
  currency: z.string().max(10).optional(),
  disclose_budget: z.boolean().optional(),
  submission_deadline: z.string().optional(),
  site_visit_date: z.string().optional().nullable(),
  qa_deadline: z.string().optional().nullable(),
  vendor_eligibility_notes: z.string().optional().nullable(),
});

const invitationSchema = z.object({
  vendors: z.array(z.object({
    vendor_email: z.string().email(),
    vendor_name: z.string().optional().default(''),
    vendor_company: z.string().optional().default(''),
  })).min(1),
});

const vendorSubmissionSchema = z.object({
  total_bid_price: z.number().positive(),
  currency: z.string().max(10).optional().default('GHS'),
  proposed_timeline: z.string().optional(),
  timeline_weeks: z.number().int().positive().optional().nullable(),
  line_items: z.array(z.object({
    description: z.string(),
    qty: z.number(),
    unit: z.string(),
    unit_rate: z.number(),
    total: z.number(),
  })).min(1),
  materials_specification: z.string().optional(),
  notes: z.string().optional(),
  value_engineering_suggestions: z.string().optional(),
});

const vendorQuestionSchema = z.object({
  question: z.string().min(1).max(2000),
});

const answerSchema = z.object({
  answer: z.string().min(1),
  is_public: z.boolean().optional().default(true),
});

const awardSchema = z.object({
  submission_id: z.string().uuid(),
  notes: z.string().optional(),
  contract_generated: z.boolean().optional().default(false),
});


// ════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ════════════════════════════════════════════════════════════════════

function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.container{max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:8px;overflow:hidden}
.header{background:#18181b;padding:24px 32px;border-bottom:1px solid #27272a}
.header h1{color:#f59e0b;font-size:16px;margin:0;letter-spacing:1px;font-family:monospace}
.body{padding:32px;color:#d4d4d8}
.body h2{color:#ffffff;font-size:18px;margin:0 0 16px}
.body p{margin:0 0 12px;font-size:14px;line-height:1.6;color:#a1a1aa}
.body .highlight{color:#ffffff;font-weight:600}
.detail-row{display:flex;padding:8px 0;border-bottom:1px solid #27272a}
.detail-label{color:#71717a;font-size:12px;font-family:monospace;text-transform:uppercase;min-width:140px}
.detail-value{color:#e4e4e7;font-size:14px}
.cta{display:inline-block;background:#f59e0b;color:#000;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:20px 0}
.cta:hover{background:#d97706}
.footer{background:#18181b;padding:20px 32px;border-top:1px solid #27272a;text-align:center}
.footer p{color:#52525b;font-size:11px;margin:0;font-family:monospace}
table.items{width:100%;border-collapse:collapse;margin:16px 0}
table.items th{text-align:left;padding:8px;color:#71717a;font-size:11px;font-family:monospace;text-transform:uppercase;border-bottom:1px solid #27272a}
table.items td{padding:8px;color:#d4d4d8;font-size:13px;border-bottom:1px solid #27272a22}
</style></head><body>
<div class="container">
  <div class="header"><h1>PROPMETRIK</h1></div>
  <div class="body">${bodyHtml}</div>
  <div class="footer"><p>Sent via PropMetrik — Construction Intelligence Platform</p></div>
</div>
</body></html>`;
}

function vendorInvitationEmail(data: {
  bidTitle: string; projectName: string; tradeCategory: string;
  deadline: string; budget: string | null; description: string;
  portalUrl: string; vendorName?: string; companyName?: string; clientName?: string;
}): string {
  return emailWrapper(`
    <h2>You've Been Invited to Bid</h2>
    ${data.vendorName ? `<p>Dear <span class="highlight">${data.vendorName}</span>,</p>` : ''}
    <p>${data.companyName ? `<span class="highlight">${data.companyName}</span> has` : 'You have been'} invited you to submit a bid proposal${data.clientName ? ` (contact: <span class="highlight">${data.clientName}</span>)` : ''}:</p>
    <div style="margin:20px 0;padding:16px;background:#27272a;border-radius:6px;border-left:3px solid #f59e0b">
      <div class="detail-row"><span class="detail-label">Project</span><span class="detail-value">${data.projectName}</span></div>
      <div class="detail-row"><span class="detail-label">Bid Title</span><span class="detail-value">${data.bidTitle}</span></div>
      <div class="detail-row"><span class="detail-label">Trade / Category</span><span class="detail-value" style="text-transform:capitalize">${data.tradeCategory}</span></div>
      <div class="detail-row"><span class="detail-label">Deadline</span><span class="detail-value">${data.deadline}</span></div>
      ${data.budget ? `<div class="detail-row"><span class="detail-label">Est. Budget</span><span class="detail-value">${data.budget}</span></div>` : ''}
    </div>
    ${data.description ? `<p>${data.description.substring(0, 300)}${data.description.length > 300 ? '...' : ''}</p>` : ''}
    <div style="text-align:center">
      <a href="${data.portalUrl}" class="cta">View Bid &amp; Submit Proposal</a>
    </div>
    <p style="color:#52525b;font-size:12px;margin-top:24px">This invitation was sent via PropMetrik. You do not need an account to submit your bid.</p>
  `);
}

function submissionConfirmationEmail(data: {
  bidTitle: string; vendorName: string; totalBid: string; refId: string;
}): string {
  return emailWrapper(`
    <h2>Bid Received</h2>
    <p>Dear <span class="highlight">${data.vendorName}</span>,</p>
    <p>Your bid submission has been received successfully.</p>
    <div style="margin:20px 0;padding:16px;background:#27272a;border-radius:6px">
      <div class="detail-row"><span class="detail-label">Bid</span><span class="detail-value">${data.bidTitle}</span></div>
      <div class="detail-row"><span class="detail-label">Your Total</span><span class="detail-value">${data.totalBid}</span></div>
      <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${data.refId}</span></div>
    </div>
    <p>The project team will review all submissions after the deadline. You will be notified of the outcome.</p>
  `);
}

function newSubmissionAlertEmail(data: {
  bidTitle: string; vendorName: string; vendorCompany: string;
  totalBid: string; dashboardUrl: string;
}): string {
  return emailWrapper(`
    <h2>New Bid Submission Received</h2>
    <p>A new bid has been submitted for <span class="highlight">${data.bidTitle}</span>.</p>
    <div style="margin:20px 0;padding:16px;background:#27272a;border-radius:6px">
      <div class="detail-row"><span class="detail-label">Vendor</span><span class="detail-value">${data.vendorName}</span></div>
      <div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">${data.vendorCompany || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Bid Amount</span><span class="detail-value">${data.totalBid}</span></div>
    </div>
    <div style="text-align:center">
      <a href="${data.dashboardUrl}" class="cta">View Submissions</a>
    </div>
  `);
}

function qaAnswerEmail(data: {
  bidTitle: string; question: string; answer: string; portalUrl: string;
}): string {
  return emailWrapper(`
    <h2>Your Question Has Been Answered</h2>
    <p>The project manager has responded to your question on <span class="highlight">${data.bidTitle}</span>.</p>
    <div style="margin:20px 0;padding:16px;background:#27272a;border-radius:6px">
      <div style="margin-bottom:12px"><span class="detail-label">Your Question</span><p style="color:#e4e4e7;margin:4px 0">${data.question}</p></div>
      <div><span class="detail-label">Answer</span><p style="color:#f59e0b;margin:4px 0">${data.answer}</p></div>
    </div>
    <p style="color:#71717a;font-size:12px">Note: Public answers are visible to all invited vendors.</p>
    <div style="text-align:center">
      <a href="${data.portalUrl}" class="cta">View Bid Portal</a>
    </div>
  `);
}

function awardNotificationEmail(data: {
  bidTitle: string; projectName: string; awardedAmount: string;
  managerName: string; managerEmail: string;
}): string {
  return emailWrapper(`
    <h2>🎉 Congratulations — You've Been Awarded!</h2>
    <p>We are pleased to inform you that your bid for <span class="highlight">${data.bidTitle}</span> has been selected.</p>
    <div style="margin:20px 0;padding:16px;background:#27272a;border-radius:6px;border-left:3px solid #22c55e">
      <div class="detail-row"><span class="detail-label">Project</span><span class="detail-value">${data.projectName}</span></div>
      <div class="detail-row"><span class="detail-label">Awarded Amount</span><span class="detail-value">${data.awardedAmount}</span></div>
    </div>
    <p>Next steps will be communicated by the project manager.</p>
    <p>Contact: <span class="highlight">${data.managerName}</span> — <a href="mailto:${data.managerEmail}" style="color:#f59e0b">${data.managerEmail}</a></p>
  `);
}

function notAwardedEmail(data: { bidTitle: string; vendorName: string }): string {
  return emailWrapper(`
    <h2>Bid Outcome — ${data.bidTitle}</h2>
    <p>Dear <span class="highlight">${data.vendorName}</span>,</p>
    <p>Thank you for submitting your bid for <span class="highlight">${data.bidTitle}</span>.</p>
    <p>After careful evaluation of all proposals, the project team has decided to award this bid to another vendor.</p>
    <p>We appreciate the time and effort you invested in your submission and encourage you to participate in future bidding opportunities.</p>
    <p style="color:#71717a;font-size:12px;margin-top:20px">This is an automated notification from PropMetrik.</p>
  `);
}


// ════════════════════════════════════════════════════════════════════
//  AUTHENTICATED BID REQUEST ROUTES
// ════════════════════════════════════════════════════════════════════

// POST /bid-requests — create bid request
router.post('/bid-requests', requirePMWrite, validate(createBidRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { title, description, project_id, trade_category, estimated_budget, currency,
            disclose_budget, submission_deadline, site_visit_date, qa_deadline,
            vendor_eligibility_notes } = req.body;

    const result = await pool.query(
      `INSERT INTO bid_requests
        (organization_id, project_id, created_by, title, description, trade_category,
         estimated_budget, currency, disclose_budget, submission_deadline,
         site_visit_date, qa_deadline, vendor_eligibility_notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
       RETURNING *`,
      [orgId, project_id, userId, title, description, trade_category,
       estimated_budget || null, currency, disclose_budget, submission_deadline,
       site_visit_date || null, qa_deadline || null, vendor_eligibility_notes || null],
    );

    const bidRequest = result.rows[0];
    await logActivity(bidRequest.id, 'created', userId, (req as any).user?.name || null, { title });
    res.status(201).json({ success: true, data: bidRequest });
  } catch (error) { next(error); }
});

// GET /bid-requests — list all bid requests
router.get('/bid-requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { project_id, status, trade_category, search, page = '1', limit = '50' } = req.query;

    let query = `SELECT br.*,
      dp.name AS project_name,
      (SELECT COUNT(*) FROM bid_invitations bi WHERE bi.bid_request_id = br.id) AS invitation_count,
      (SELECT COUNT(*) FROM bid_submissions bs WHERE bs.bid_request_id = br.id) AS submission_count
      FROM bid_requests br
      LEFT JOIN development_projects dp ON dp.id = br.project_id
      WHERE br.organization_id = $1`;
    const params: unknown[] = [orgId];
    let idx = 2;

    if (project_id) { query += ` AND br.project_id = $${idx++}`; params.push(project_id); }
    if (status) { query += ` AND br.status = $${idx++}`; params.push(status); }
    if (trade_category) { query += ` AND br.trade_category = $${idx++}`; params.push(trade_category); }
    if (search) {
      query += ` AND (br.title ILIKE $${idx} OR br.description ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    const countQ = `SELECT COUNT(*) FROM bid_requests WHERE organization_id = $1${project_id ? ` AND project_id = '${project_id}'` : ''}`;
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    query += ` ORDER BY br.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
});

// GET /bid-requests/:id — single bid request with details
router.get('/bid-requests/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;

    const result = await pool.query(
      `SELECT br.*, dp.name AS project_name
       FROM bid_requests br
       LEFT JOIN development_projects dp ON dp.id = br.project_id
       WHERE br.id = $1 AND br.organization_id = $2`,
      [id, orgId],
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    const invitations = await pool.query(
      `SELECT * FROM bid_invitations WHERE bid_request_id = $1 ORDER BY invited_at DESC`, [id]);
    const submissions = await pool.query(
      `SELECT * FROM bid_submissions WHERE bid_request_id = $1 ORDER BY submitted_at DESC`, [id]);
    const qaThreads = await pool.query(
      `SELECT * FROM bid_qa_threads WHERE bid_request_id = $1 ORDER BY asked_at DESC`, [id]);
    const awards = await pool.query(
      `SELECT * FROM bid_awards WHERE bid_request_id = $1`, [id]);
    const activity = await pool.query(
      `SELECT * FROM bid_activity_log WHERE bid_request_id = $1 ORDER BY created_at DESC`, [id]);

    // Resolve presigned URLs for bid request attachments
    const bidAttachments = result.rows[0].attachments || [];
    const bidAttachmentsWithUrls = [];
    for (const att of bidAttachments) {
      try {
        const parts = att.file_key.split('/');
        const bucket = parts.shift();
        const key = parts.join('/');
        const url = await getPresignedDownloadUrl(bucket, key, 3600);
        bidAttachmentsWithUrls.push({ ...att, download_url: url });
      } catch { bidAttachmentsWithUrls.push(att); }
    }

    // Resolve presigned URLs for submission attachments
    const subsWithUrls = [];
    for (const sub of submissions.rows) {
      const subAttachments = sub.attachments || [];
      const resolved = [];
      for (const att of subAttachments) {
        try {
          const parts = att.file_key.split('/');
          const bucket = parts.shift();
          const key = parts.join('/');
          const url = await getPresignedDownloadUrl(bucket, key, 3600);
          resolved.push({ ...att, download_url: url });
        } catch { resolved.push(att); }
      }
      subsWithUrls.push({ ...sub, attachments: resolved });
    }

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        attachments: bidAttachmentsWithUrls,
        invitations: invitations.rows,
        submissions: subsWithUrls,
        qa_threads: qaThreads.rows,
        awards: awards.rows,
        activity: activity.rows,
      },
    });
  } catch (error) { next(error); }
});

// PATCH /bid-requests/:id — update bid request (draft only)
router.patch('/bid-requests/:id', requirePMWrite, validate(updateBidRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;

    // verify draft
    const existing = await pool.query(
      'SELECT status FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });
    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Can only edit bid requests in DRAFT status' });
    }

    const fields = ['title', 'description', 'trade_category', 'estimated_budget', 'currency',
                     'disclose_budget', 'submission_deadline', 'site_visit_date', 'qa_deadline',
                     'vendor_eligibility_notes'];
    const updates: string[] = [];
    const params: unknown[] = [id, orgId];
    let pIdx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${pIdx++}`);
        params.push(req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE bid_requests SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      params,
    );
    await logActivity(id, 'updated', userId, (req as any).user?.name || null, { fields: Object.keys(req.body) });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// POST /bid-requests/:id/publish — publish bid request
router.post('/bid-requests/:id/publish', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;

    const existing = await pool.query(
      `SELECT br.*, dp.name AS project_name FROM bid_requests br
       LEFT JOIN development_projects dp ON dp.id = br.project_id
       WHERE br.id = $1 AND br.organization_id = $2`, [id, orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });
    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft bid requests can be published' });
    }

    // Check for at least one invitation
    const invCount = await pool.query('SELECT COUNT(*) FROM bid_invitations WHERE bid_request_id = $1', [id]);
    if (parseInt(invCount.rows[0].count, 10) === 0) {
      return res.status(400).json({ success: false, error: 'Add at least one vendor invitation before publishing' });
    }

    const result = await pool.query(
      `UPDATE bid_requests SET status = 'published', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    const bidRequest = { ...existing.rows[0], ...result.rows[0] };
    await logActivity(id, 'published', userId, (req as any).user?.name || null);

    // Send invitation emails to all pending invitations
    const invitations = await pool.query(
      `SELECT * FROM bid_invitations WHERE bid_request_id = $1 AND status = 'pending'`, [id]);
    const frontendUrl = config.app.frontendUrl;
    const deadlineStr = new Date(bidRequest.submission_deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Fetch inviting company & PM name for personalised email
    const [orgRow, userRow] = await Promise.all([
      pool.query('SELECT name FROM organizations WHERE id = $1', [orgId]),
      pool.query('SELECT first_name, last_name, display_name FROM users WHERE id = $1', [userId]),
    ]);
    const companyName = orgRow.rows[0]?.name || '';
    const pmUser = userRow.rows[0];
    const clientName = pmUser?.display_name || [pmUser?.first_name, pmUser?.last_name].filter(Boolean).join(' ') || '';

    for (const inv of invitations.rows) {
      const portalUrl = `${frontendUrl}/vendor/bid/${inv.token}`;
      try {
        await notificationService.sendEmail({
          to: inv.vendor_email,
          subject: `You've been invited to bid — ${bidRequest.title} | PropMetrik`,
          html: vendorInvitationEmail({
            bidTitle: bidRequest.title,
            projectName: bidRequest.project_name || 'Project',
            tradeCategory: (bidRequest.trade_category || 'other').replace(/_/g, ' '),
            deadline: deadlineStr,
            budget: bidRequest.disclose_budget && bidRequest.estimated_budget
              ? `${bidRequest.currency} ${Number(bidRequest.estimated_budget).toLocaleString()}`
              : null,
            description: bidRequest.description || '',
            portalUrl,
            vendorName: inv.vendor_name || '',
            companyName,
            clientName,
          }),
        });
        logger.info('Bid invitation email sent', { bidRequestId: id, to: inv.vendor_email });
      } catch (err: any) {
        logger.error('Failed to send bid invitation email', { to: inv.vendor_email, error: err.message });
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// POST /bid-requests/:id/close — close submissions
router.post('/bid-requests/:id/close', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT status FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });
    if (existing.rows[0].status !== 'published') {
      return res.status(400).json({ success: false, error: 'Only published bids can be closed' });
    }

    const result = await pool.query(
      `UPDATE bid_requests SET status = 'closed', updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
    await logActivity(id, 'closed', userId, (req as any).user?.name || null);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// DELETE /bid-requests/:id — cancel
router.delete('/bid-requests/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT status FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });
    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft bid requests can be deleted' });
    }

    await pool.query('DELETE FROM bid_requests WHERE id = $1', [id]);
    await logActivity(id, 'cancelled', userId, (req as any).user?.name || null);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// POST /bid-requests/:id/attachments — upload attachments
router.post('/bid-requests/:id/attachments', requirePMWrite, bidUpload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const files = (req as any).files as Express.Multer.File[] | undefined;

    const existing = await pool.query(
      'SELECT attachments FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    const currentAttachments = existing.rows[0].attachments || [];
    const newAttachments: { file_name: string; file_key: string; mime_type: string; file_size: number }[] = [];

    if (files && files.length > 0) {
      const bucket = buckets.documents || 'propmetrik-documents';
      for (const file of files) {
        const ext = file.originalname.split('.').pop() || 'bin';
        const key = `bids/${id}/attachments/${uuidv4()}.${ext}`;
        await uploadFile(bucket, key, file.buffer, file.mimetype);
        newAttachments.push({
          file_name: file.originalname,
          file_key: `${bucket}/${key}`,
          mime_type: file.mimetype,
          file_size: file.size,
        });
      }
    }

    const allAttachments = [...currentAttachments, ...newAttachments];
    await pool.query(
      `UPDATE bid_requests SET attachments = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(allAttachments), id],
    );

    res.json({ success: true, data: allAttachments });
  } catch (error) { next(error); }
});


// ════════════════════════════════════════════════════════════════════
//  INVITATION ROUTES
// ════════════════════════════════════════════════════════════════════

// POST /bid-requests/:id/invitations — add invitations
router.post('/bid-requests/:id/invitations', requirePMWrite, validate(invitationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;
    const { vendors } = req.body;

    const existing = await pool.query(
      'SELECT id, status FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    const created: unknown[] = [];
    for (const v of vendors) {
      // check for duplicate invitation
      const dup = await pool.query(
        'SELECT id FROM bid_invitations WHERE bid_request_id = $1 AND vendor_email = $2',
        [id, v.vendor_email.toLowerCase()],
      );
      if (dup.rows.length > 0) continue;

      const token = generateToken();
      const result = await pool.query(
        `INSERT INTO bid_invitations (bid_request_id, vendor_email, vendor_name, vendor_company, token, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, v.vendor_email.toLowerCase(), v.vendor_name || '', v.vendor_company || '', token, userId],
      );
      created.push(result.rows[0]);
    }

    await logActivity(id, 'invitations_added', userId, (req as any).user?.name || null,
      { count: created.length, emails: vendors.map((v: any) => v.vendor_email) });

    res.status(201).json({ success: true, data: created });
  } catch (error) { next(error); }
});

// GET /bid-requests/:id/invitations
router.get('/bid-requests/:id/invitations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;

    // verify ownership
    const br = await pool.query('SELECT id FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    const result = await pool.query(
      `SELECT bi.*, (SELECT COUNT(*) FROM bid_submissions bs WHERE bs.invitation_id = bi.id) AS has_submission
       FROM bid_invitations bi WHERE bi.bid_request_id = $1 ORDER BY bi.invited_at DESC`, [id]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

// DELETE /bid-requests/:id/invitations/:invitationId
router.delete('/bid-requests/:id/invitations/:invitationId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id, invitationId } = req.params;

    const br = await pool.query('SELECT id FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    // can't remove if already submitted
    const sub = await pool.query('SELECT id FROM bid_submissions WHERE invitation_id = $1', [invitationId]);
    if (sub.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Cannot remove invitation that has an active submission' });
    }

    const result = await pool.query(
      'DELETE FROM bid_invitations WHERE id = $1 AND bid_request_id = $2 RETURNING id', [invitationId, id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Invitation not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// POST /bid-requests/:id/invitations/resend — resend invitation email
router.post('/bid-requests/:id/invitations/resend', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const { invitation_id } = req.body;

    const br = await pool.query(
      `SELECT br.*, dp.name AS project_name FROM bid_requests br
       LEFT JOIN development_projects dp ON dp.id = br.project_id
       WHERE br.id = $1 AND br.organization_id = $2`, [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });
    const bidRequest = br.rows[0];

    const inv = await pool.query('SELECT * FROM bid_invitations WHERE id = $1 AND bid_request_id = $2', [invitation_id, id]);
    if (inv.rows.length === 0) return res.status(404).json({ success: false, error: 'Invitation not found' });
    const invitation = inv.rows[0];

    const frontendUrl = config.app.frontendUrl;
    const portalUrl = `${frontendUrl}/vendor/bid/${invitation.token}`;
    const deadlineStr = new Date(bidRequest.submission_deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const [orgRow, userRow] = await Promise.all([
      pool.query('SELECT name FROM organizations WHERE id = $1', [orgId]),
      pool.query('SELECT first_name, last_name, display_name FROM users WHERE id = $1', [getAuthUserId(req)]),
    ]);
    const companyName = orgRow.rows[0]?.name || '';
    const pmUser = userRow.rows[0];
    const clientName = pmUser?.display_name || [pmUser?.first_name, pmUser?.last_name].filter(Boolean).join(' ') || '';

    await notificationService.sendEmail({
      to: invitation.vendor_email,
      subject: `Reminder: You've been invited to bid — ${bidRequest.title} | PropMetrik`,
      html: vendorInvitationEmail({
        bidTitle: bidRequest.title,
        projectName: bidRequest.project_name || 'Project',
        tradeCategory: (bidRequest.trade_category || 'other').replace(/_/g, ' '),
        deadline: deadlineStr,
        budget: bidRequest.disclose_budget && bidRequest.estimated_budget
          ? `${bidRequest.currency} ${Number(bidRequest.estimated_budget).toLocaleString()}`
          : null,
        description: bidRequest.description || '',
        portalUrl,
        vendorName: invitation.vendor_name || '',
        companyName,
        clientName,
      }),
    });

    res.json({ success: true, message: 'Invitation resent' });
  } catch (error) { next(error); }
});


// ════════════════════════════════════════════════════════════════════
//  EVALUATION ROUTES
// ════════════════════════════════════════════════════════════════════

// GET /bid-requests/:id/submissions — comparison view
router.get('/bid-requests/:id/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;

    const br = await pool.query('SELECT * FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    const submissions = await pool.query(
      `SELECT * FROM bid_submissions WHERE bid_request_id = $1 ORDER BY total_bid_price ASC`, [id]);

    const rows = submissions.rows;
    const analysis = {
      total_submissions: rows.length,
      average_bid: rows.length > 0 ? rows.reduce((s: number, r: any) => s + parseFloat(r.total_bid_price), 0) / rows.length : 0,
      lowest_bid: rows.length > 0 ? parseFloat(rows[0].total_bid_price) : 0,
      highest_bid: rows.length > 0 ? parseFloat(rows[rows.length - 1].total_bid_price) : 0,
      shortlisted: rows.filter((r: any) => r.status === 'shortlisted').length,
    };

    res.json({ success: true, data: { submissions: rows, analysis } });
  } catch (error) { next(error); }
});

// PATCH /bid-requests/:id/submissions/:submissionId/status — shortlist/reject
router.patch('/bid-requests/:id/submissions/:submissionId/status', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id, submissionId } = req.params;
    const { status, score } = req.body;

    if (!['under_review', 'shortlisted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const br = await pool.query('SELECT id FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    const updates: string[] = [`status = $3`];
    const params: unknown[] = [submissionId, id, status];
    let pIdx = 4;

    if (score !== undefined) {
      updates.push(`score = $${pIdx++}`);
      params.push(score);
    }
    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE bid_submissions SET ${updates.join(', ')}
       WHERE id = $1 AND bid_request_id = $2 RETURNING *`,
      params,
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Submission not found' });

    await logActivity(id, `submission_${status}`, userId, (req as any).user?.name || null,
      { submissionId, vendorName: result.rows[0].vendor_name });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// POST /bid-requests/:id/award — award bid
router.post('/bid-requests/:id/award', requirePMWrite, validate(awardSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id } = req.params;
    const { submission_id, notes, contract_generated } = req.body;

    const br = await pool.query(
      `SELECT br.*, dp.name AS project_name
       FROM bid_requests br
       LEFT JOIN development_projects dp ON dp.id = br.project_id
       WHERE br.id = $1 AND br.organization_id = $2`, [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });
    const bidRequest = br.rows[0];

    if (!['published', 'closed', 'under_evaluation'].includes(bidRequest.status)) {
      return res.status(400).json({ success: false, error: 'Bid must be published, closed, or under evaluation to award' });
    }

    // check submission exists
    const sub = await pool.query(
      'SELECT * FROM bid_submissions WHERE id = $1 AND bid_request_id = $2', [submission_id, id]);
    if (sub.rows.length === 0) return res.status(404).json({ success: false, error: 'Submission not found' });
    const winner = sub.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // create award
      const award = await client.query(
        `INSERT INTO bid_awards (bid_request_id, submission_id, awarded_by, notes, contract_generated)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, submission_id, userId, notes || null, contract_generated || false],
      );

      // update winning submission
      await client.query(
        `UPDATE bid_submissions SET status = 'awarded', updated_at = NOW() WHERE id = $1`, [submission_id]);

      // reject all other submissions
      await client.query(
        `UPDATE bid_submissions SET status = 'rejected', updated_at = NOW()
         WHERE bid_request_id = $1 AND id != $2 AND status != 'rejected'`, [id, submission_id]);

      // update bid request status
      await client.query(
        `UPDATE bid_requests SET status = 'awarded', updated_at = NOW() WHERE id = $1`, [id]);

      await client.query('COMMIT');

      // Get manager info
      const managerRes = await pool.query(
        'SELECT email, first_name, last_name, display_name FROM users WHERE id = $1', [userId]);
      const manager = managerRes.rows[0] || {};
      const managerName = manager.display_name || `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || 'Project Manager';
      const managerEmail = manager.email || '';

      // Send award email to winner
      try {
        await notificationService.sendEmail({
          to: winner.vendor_email,
          subject: `Congratulations — You've been awarded ${bidRequest.title} | PropMetrik`,
          html: awardNotificationEmail({
            bidTitle: bidRequest.title,
            projectName: bidRequest.project_name || 'Project',
            awardedAmount: `${winner.currency} ${Number(winner.total_bid_price).toLocaleString()}`,
            managerName,
            managerEmail,
          }),
        });
      } catch (err: any) {
        logger.error('Failed to send award email', { error: err.message });
      }

      // Send "not awarded" emails to other vendors who submitted
      const others = await pool.query(
        `SELECT vendor_email, vendor_name FROM bid_submissions
         WHERE bid_request_id = $1 AND id != $2`, [id, submission_id]);
      for (const other of others.rows) {
        try {
          await notificationService.sendEmail({
            to: other.vendor_email,
            subject: `Bid outcome — ${bidRequest.title} | PropMetrik`,
            html: notAwardedEmail({
              bidTitle: bidRequest.title,
              vendorName: other.vendor_name || 'Vendor',
            }),
          });
        } catch (err: any) {
          logger.error('Failed to send not-awarded email', { to: other.vendor_email, error: err.message });
        }
      }

      await logActivity(id, 'awarded', userId, managerName,
        { submissionId: submission_id, vendorName: winner.vendor_name, amount: winner.total_bid_price });

      res.json({ success: true, data: award.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});


// ════════════════════════════════════════════════════════════════════
//  Q&A ROUTES (authenticated)
// ════════════════════════════════════════════════════════════════════

// GET /bid-requests/:id/qa
router.get('/bid-requests/:id/qa', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;

    const br = await pool.query('SELECT id FROM bid_requests WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });

    const result = await pool.query(
      `SELECT * FROM bid_qa_threads WHERE bid_request_id = $1 ORDER BY asked_at DESC`, [id]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

// POST /bid-requests/:id/qa/:threadId/answer
router.post('/bid-requests/:id/qa/:threadId/answer', requirePMWrite, validate(answerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { id, threadId } = req.params;
    const { answer, is_public } = req.body;

    const br = await pool.query(
      `SELECT br.*, dp.name AS project_name FROM bid_requests br
       LEFT JOIN development_projects dp ON dp.id = br.project_id
       WHERE br.id = $1 AND br.organization_id = $2`, [id, orgId]);
    if (br.rows.length === 0) return res.status(404).json({ success: false, error: 'Bid request not found' });
    const bidRequest = br.rows[0];

    const thread = await pool.query(
      'SELECT * FROM bid_qa_threads WHERE id = $1 AND bid_request_id = $2', [threadId, id]);
    if (thread.rows.length === 0) return res.status(404).json({ success: false, error: 'Q&A thread not found' });
    const qa = thread.rows[0];

    const result = await pool.query(
      `UPDATE bid_qa_threads SET answer = $1, answered_by = $2, is_public = $3, answered_at = NOW()
       WHERE id = $4 RETURNING *`,
      [answer, userId, is_public, threadId],
    );

    // Send email to the asking vendor
    if (qa.invitation_id) {
      const inv = await pool.query('SELECT token FROM bid_invitations WHERE id = $1', [qa.invitation_id]);
      if (inv.rows.length > 0) {
        const frontendUrl = config.app.frontendUrl;
        const portalUrl = `${frontendUrl}/vendor/bid/${inv.rows[0].token}`;
        try {
          await notificationService.sendEmail({
            to: qa.asked_by_email,
            subject: `Your question has been answered — ${bidRequest.title}`,
            html: qaAnswerEmail({
              bidTitle: bidRequest.title,
              question: qa.question,
              answer,
              portalUrl,
            }),
          });
        } catch (err: any) {
          logger.error('Failed to send Q&A answer email', { error: err.message });
        }
      }
    }

    await logActivity(id, 'qa_answered', userId, (req as any).user?.name || null, { threadId, isPublic: is_public });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});


// ════════════════════════════════════════════════════════════════════
//  PUBLIC VENDOR ROUTES (token-only authentication)
// ════════════════════════════════════════════════════════════════════

const vendorRouter = Router();

// GET /vendor/bid/:token — view bid details
vendorRouter.get('/vendor/bid/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    const inv = await pool.query(
      `SELECT bi.*, br.title, br.description, br.trade_category, br.estimated_budget,
              br.currency, br.disclose_budget, br.submission_deadline, br.site_visit_date,
              br.qa_deadline, br.vendor_eligibility_notes, br.status AS bid_status,
              br.attachments AS bid_attachments, br.id AS bid_request_id,
              dp.name AS project_name
       FROM bid_invitations bi
       JOIN bid_requests br ON br.id = bi.bid_request_id
       LEFT JOIN development_projects dp ON dp.id = br.project_id
       WHERE bi.token = $1`,
      [token],
    );

    if (inv.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid or expired invitation token' });
    }

    const invitation = inv.rows[0];

    // Mark as viewed if first view
    if (invitation.status === 'pending') {
      await pool.query(
        `UPDATE bid_invitations SET status = 'viewed', viewed_at = NOW() WHERE id = $1`, [invitation.id]);
      await logActivity(invitation.bid_request_id, 'invitation_viewed', null, invitation.vendor_name || invitation.vendor_email,
        { invitationId: invitation.id });
    }

    // Get existing submission if any
    const sub = await pool.query(
      'SELECT * FROM bid_submissions WHERE invitation_id = $1', [invitation.id]);

    // Get public Q&A threads
    const qa = await pool.query(
      `SELECT * FROM bid_qa_threads WHERE bid_request_id = $1
       AND (is_public = true OR invitation_id = $2)
       ORDER BY asked_at DESC`,
      [invitation.bid_request_id, invitation.id],
    );

    // Build attachment download URLs
    const attachments = invitation.bid_attachments || [];
    const attachmentsWithUrls = [];
    for (const att of attachments) {
      try {
        const parts = att.file_key.split('/');
        const bucket = parts.shift();
        const key = parts.join('/');
        const url = await getPresignedDownloadUrl(bucket, key, 3600);
        attachmentsWithUrls.push({ ...att, download_url: url });
      } catch {
        attachmentsWithUrls.push(att);
      }
    }

    res.json({
      success: true,
      data: {
        invitation: {
          id: invitation.id,
          vendor_email: invitation.vendor_email,
          vendor_name: invitation.vendor_name,
          vendor_company: invitation.vendor_company,
          status: invitation.status === 'pending' ? 'viewed' : invitation.status,
        },
        bid_request: {
          id: invitation.bid_request_id,
          title: invitation.title,
          description: invitation.description,
          trade_category: invitation.trade_category,
          estimated_budget: invitation.disclose_budget ? invitation.estimated_budget : null,
          currency: invitation.currency,
          submission_deadline: invitation.submission_deadline,
          site_visit_date: invitation.site_visit_date,
          qa_deadline: invitation.qa_deadline,
          vendor_eligibility_notes: invitation.vendor_eligibility_notes,
          status: invitation.bid_status,
          project_name: invitation.project_name,
          attachments: attachmentsWithUrls,
        },
        submission: sub.rows.length > 0 ? sub.rows[0] : null,
        qa_threads: qa.rows,
      },
    });
  } catch (error) { next(error); }
});

// POST /vendor/bid/:token/submit — submit bid
vendorRouter.post('/vendor/bid/:token/submit', bidUpload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    const inv = await pool.query(
      `SELECT bi.*, br.submission_deadline, br.status AS bid_status, br.title,
              br.id AS bid_request_id, br.currency AS bid_currency
       FROM bid_invitations bi
       JOIN bid_requests br ON br.id = bi.bid_request_id
       WHERE bi.token = $1`,
      [token],
    );

    if (inv.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid or expired invitation token' });
    }

    const invitation = inv.rows[0];

    if (invitation.bid_status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'This bid has been cancelled' });
    }

    if (invitation.status === 'declined') {
      return res.status(400).json({ success: false, error: 'You have declined this invitation' });
    }

    if (invitation.bid_status !== 'published') {
      return res.status(400).json({ success: false, error: 'This bid is no longer accepting submissions' });
    }

    if (new Date(invitation.submission_deadline) < new Date()) {
      return res.status(400).json({ success: false, error: 'The submission deadline has passed' });
    }

    // Check duplicate submission
    const existingSub = await pool.query(
      'SELECT * FROM bid_submissions WHERE invitation_id = $1', [invitation.id]);
    if (existingSub.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'You have already submitted a bid',
        data: existingSub.rows[0],
      });
    }

    // Parse body (might come as form data with files)
    let body = req.body;
    if (typeof body.data === 'string') {
      body = JSON.parse(body.data);
    }
    if (typeof body.line_items === 'string') {
      body.line_items = JSON.parse(body.line_items);
    }

    const validated = vendorSubmissionSchema.parse(body);
    const files = (req as any).files as Express.Multer.File[] | undefined;

    // Upload attachments
    const attachments: { file_name: string; file_key: string; mime_type: string; file_size: number }[] = [];
    if (files && files.length > 0) {
      const bucket = buckets.documents || 'propmetrik-documents';
      for (const file of files) {
        const ext = file.originalname.split('.').pop() || 'bin';
        const key = `bids/${invitation.bid_request_id}/submissions/${uuidv4()}.${ext}`;
        await uploadFile(bucket, key, file.buffer, file.mimetype);
        attachments.push({
          file_name: file.originalname,
          file_key: `${bucket}/${key}`,
          mime_type: file.mimetype,
          file_size: file.size,
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO bid_submissions
        (bid_request_id, invitation_id, vendor_name, vendor_company, vendor_email,
         total_bid_price, currency, proposed_timeline, timeline_weeks,
         line_items, materials_specification, notes, value_engineering_suggestions,
         attachments, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'submitted')
       RETURNING *`,
      [invitation.bid_request_id, invitation.id,
       invitation.vendor_name || '', invitation.vendor_company || '', invitation.vendor_email,
       validated.total_bid_price, validated.currency || invitation.bid_currency,
       validated.proposed_timeline || null, validated.timeline_weeks || null,
       JSON.stringify(validated.line_items), validated.materials_specification || null,
       validated.notes || null, validated.value_engineering_suggestions || null,
       JSON.stringify(attachments)],
    );

    const submission = result.rows[0];

    // Update invitation status
    await pool.query(
      `UPDATE bid_invitations SET status = 'submitted', responded_at = NOW() WHERE id = $1`,
      [invitation.id],
    );

    await logActivity(invitation.bid_request_id, 'submission_received', null,
      invitation.vendor_name || invitation.vendor_email,
      { submissionId: submission.id, totalBid: validated.total_bid_price });

    // Send confirmation to vendor
    try {
      await notificationService.sendEmail({
        to: invitation.vendor_email,
        subject: `Bid received — ${invitation.title} | PropMetrik`,
        html: submissionConfirmationEmail({
          bidTitle: invitation.title,
          vendorName: invitation.vendor_name || 'Vendor',
          totalBid: `${validated.currency || invitation.bid_currency} ${validated.total_bid_price.toLocaleString()}`,
          refId: submission.id.substring(0, 8).toUpperCase(),
        }),
      });
    } catch (err: any) {
      logger.error('Failed to send submission confirmation', { error: err.message });
    }

    // Alert project manager — resolve created_by via id or keycloak_id
    const managerRes = await pool.query(
      `SELECT u.email, u.first_name FROM users u
       JOIN bid_requests br ON (br.created_by = u.id OR br.created_by = u.keycloak_id)
       WHERE br.id = $1
       LIMIT 1`, [invitation.bid_request_id]);
    if (managerRes.rows.length > 0) {
      const frontendUrl = config.app.frontendUrl;
      try {
        await notificationService.sendEmail({
          to: managerRes.rows[0].email,
          subject: `New bid submission — ${invitation.vendor_name || 'Vendor'} on ${invitation.title}`,
          html: newSubmissionAlertEmail({
            bidTitle: invitation.title,
            vendorName: invitation.vendor_name || 'Vendor',
            vendorCompany: invitation.vendor_company || '',
            totalBid: `${validated.currency || invitation.bid_currency} ${Number(validated.total_bid_price).toLocaleString()}`,
            dashboardUrl: `${frontendUrl}/dashboard/projects/bids?id=${invitation.bid_request_id}`,
          }),
        });
        logger.info('Submission alert sent to PM', { to: managerRes.rows[0].email, bidRequestId: invitation.bid_request_id });
      } catch (err: any) {
        logger.error('Failed to send new submission alert', { to: managerRes.rows[0].email, error: err.message });
      }
    } else {
      logger.warn('No PM user found for bid submission alert', { bidRequestId: invitation.bid_request_id });
    }

    res.status(201).json({ success: true, data: submission });
  } catch (error) { next(error); }
});

// POST /vendor/bid/:token/question — submit Q&A question
vendorRouter.post('/vendor/bid/:token/question', validate(vendorQuestionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    const inv = await pool.query(
      `SELECT bi.*, br.status AS bid_status, br.qa_deadline, br.id AS bid_request_id
       FROM bid_invitations bi
       JOIN bid_requests br ON br.id = bi.bid_request_id
       WHERE bi.token = $1`,
      [token],
    );

    if (inv.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid invitation token' });
    }

    const invitation = inv.rows[0];

    if (invitation.bid_status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'This bid has been cancelled' });
    }

    if (invitation.qa_deadline && new Date(invitation.qa_deadline) < new Date()) {
      return res.status(400).json({ success: false, error: 'The Q&A deadline has passed' });
    }

    const { question } = req.body;

    const result = await pool.query(
      `INSERT INTO bid_qa_threads (bid_request_id, invitation_id, question, asked_by_name, asked_by_email, is_public)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [invitation.bid_request_id, invitation.id,
       question, invitation.vendor_name || 'Vendor', invitation.vendor_email],
    );

    await logActivity(invitation.bid_request_id, 'question_asked', null,
      invitation.vendor_name || invitation.vendor_email, { questionId: result.rows[0].id });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// POST /vendor/bid/:token/decline — decline invitation
vendorRouter.post('/vendor/bid/:token/decline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    const inv = await pool.query(
      `SELECT bi.*, br.id AS bid_request_id
       FROM bid_invitations bi
       JOIN bid_requests br ON br.id = bi.bid_request_id
       WHERE bi.token = $1`,
      [token],
    );

    if (inv.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid invitation token' });
    }

    const invitation = inv.rows[0];

    if (invitation.status === 'submitted') {
      return res.status(400).json({ success: false, error: 'Cannot decline after submitting a bid' });
    }

    await pool.query(
      `UPDATE bid_invitations SET status = 'declined', responded_at = NOW() WHERE id = $1`,
      [invitation.id],
    );

    await logActivity(invitation.bid_request_id, 'invitation_declined', null,
      invitation.vendor_name || invitation.vendor_email, { invitationId: invitation.id });

    res.json({ success: true, message: 'Invitation declined' });
  } catch (error) { next(error); }
});

// GET /vendor/bid/:token/attachment/:index — download bid attachment
vendorRouter.get('/vendor/bid/:token/attachment/:index', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, index } = req.params;
    const idx = parseInt(index, 10);

    const inv = await pool.query(
      `SELECT br.attachments FROM bid_invitations bi
       JOIN bid_requests br ON br.id = bi.bid_request_id
       WHERE bi.token = $1`, [token]);
    if (inv.rows.length === 0) return res.status(404).json({ success: false, error: 'Invalid token' });

    const attachments = inv.rows[0].attachments || [];
    if (idx < 0 || idx >= attachments.length) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const att = attachments[idx];
    const parts = att.file_key.split('/');
    const bucket = parts.shift();
    const key = parts.join('/');
    const url = await getPresignedDownloadUrl(bucket, key, 3600);
    res.json({ success: true, data: { url, file_name: att.file_name } });
  } catch (error) { next(error); }
});


export { vendorRouter };
export default router;
