/**
 * Transmittal Service
 * 
 * Business logic for formal document distribution management.
 * Handles CRUD, issuance, recipient acknowledgement, and activity logging.
 */

import crypto from 'crypto';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { notificationService } from '../../../shared-services/notifications/unified';
import { config } from '../../config';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CreateTransmittalInput {
  project_id: string;
  organization_id?: string;
  subject: string;
  description?: string;
  to_company?: string;
  to_contact?: string;
  to_email?: string;
  cc_emails?: string[];
  due_date?: string;
  purpose?: string;
  priority?: string;
  response_required?: boolean;
  items?: CreateTransmittalItemInput[];
  recipients?: { email: string; name?: string }[];
}

export interface UpdateTransmittalInput {
  subject?: string;
  description?: string;
  to_company?: string;
  to_contact?: string;
  to_email?: string;
  cc_emails?: string[];
  due_date?: string;
  purpose?: string;
  priority?: string;
  response_required?: boolean;
}

export interface CreateTransmittalItemInput {
  document_title: string;
  document_ref?: string;
  revision?: string;
  copies?: number;
  format?: string;
  file_url?: string;
  file_key?: string;
  file_name?: string;
  file_size?: number;
  notes?: string;
}

export interface TransmittalFilters {
  project_id?: string;
  organization_id?: string;
  status?: string;
  purpose?: string;
  priority?: string;
  from_user_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ── Service ─────────────────────────────────────────────────────────────────

class TransmittalService {

  /** List transmittals with filtering and pagination. */
  async getAll(filters: TransmittalFilters) {
    const {
      project_id, organization_id, status, purpose, priority, from_user_id,
      search, page = 1, limit = 20, sort_by = 'created_at', sort_order = 'desc',
    } = filters;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (project_id) { conditions.push(`t.project_id = $${paramIdx++}`); params.push(project_id); }
    if (organization_id) { conditions.push(`t.organization_id = $${paramIdx++}`); params.push(organization_id); }
    if (status) { conditions.push(`t.status = $${paramIdx++}`); params.push(status); }
    if (purpose) { conditions.push(`t.purpose = $${paramIdx++}`); params.push(purpose); }
    if (priority) { conditions.push(`t.priority = $${paramIdx++}`); params.push(priority); }
    if (from_user_id) { conditions.push(`t.from_user_id = $${paramIdx++}`); params.push(from_user_id); }
    if (search) {
      conditions.push(`(t.subject ILIKE $${paramIdx} OR t.transmittal_number ILIKE $${paramIdx} OR t.to_company ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSort = ['created_at', 'issued_at', 'transmittal_number', 'subject', 'status', 'due_date'];
    const orderCol = allowedSort.includes(sort_by) ? sort_by : 'created_at';
    const orderDir = sort_order === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const countResult = await pool.query(`SELECT COUNT(*) FROM pm_transmittals t ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const rows = await pool.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM pm_transmittal_items ti WHERE ti.transmittal_id = t.id) AS item_count,
              (SELECT COUNT(*) FROM pm_transmittal_recipients tr WHERE tr.transmittal_id = t.id) AS recipient_count,
              (SELECT COUNT(*) FROM pm_transmittal_recipients tr WHERE tr.transmittal_id = t.id AND tr.acknowledged = true) AS acknowledged_count
       FROM pm_transmittals t
       ${where}
       ORDER BY t.${orderCol} ${orderDir}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    return {
      data: rows.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Get a single transmittal with items, recipients, and activity. */
  async getById(id: string) {
    const tx = await pool.query('SELECT * FROM pm_transmittals WHERE id = $1', [id]);
    if (tx.rows.length === 0) return null;

    const [items, recipients, activity] = await Promise.all([
      pool.query('SELECT * FROM pm_transmittal_items WHERE transmittal_id = $1 ORDER BY item_number', [id]),
      pool.query('SELECT * FROM pm_transmittal_recipients WHERE transmittal_id = $1 ORDER BY created_at', [id]),
      pool.query('SELECT * FROM pm_transmittal_activity WHERE transmittal_id = $1 ORDER BY created_at DESC LIMIT 50', [id]),
    ]);

    return {
      ...tx.rows[0],
      items: items.rows,
      recipients: recipients.rows,
      activity: activity.rows,
    };
  }

  /** Create a new transmittal (draft). */
  async create(input: CreateTransmittalInput, userId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate transmittal number
      const numResult = await client.query(
        `SELECT COUNT(*) + 1 AS next_num FROM pm_transmittals WHERE project_id = $1`,
        [input.project_id],
      );
      const num = String(numResult.rows[0].next_num).padStart(3, '0');
      const transmittalNumber = `T-${num}`;

      const result = await client.query(
        `INSERT INTO pm_transmittals
         (project_id, organization_id, transmittal_number, subject, description,
          to_company, to_contact, to_email, cc_emails, due_date, purpose, priority,
          response_required, from_user_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
         RETURNING *`,
        [
          input.project_id, input.organization_id, transmittalNumber,
          input.subject, input.description || null,
          input.to_company || null, input.to_contact || null, input.to_email || null,
          input.cc_emails || null, input.due_date || null,
          input.purpose || 'for_review', input.priority || 'normal',
          input.response_required !== false, userId,
        ],
      );
      const transmittal = result.rows[0];

      // Insert items
      if (input.items?.length) {
        for (let i = 0; i < input.items.length; i++) {
          const item = input.items[i];
          await client.query(
            `INSERT INTO pm_transmittal_items
             (transmittal_id, item_number, document_title, document_ref, revision,
              copies, format, file_url, file_name, file_size, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              transmittal.id, i + 1, item.document_title,
              item.document_ref || null, item.revision || null,
              item.copies || 1, item.format || 'digital',
              item.file_url || null, item.file_name || null, item.file_size || null,
              item.notes || null,
            ],
          );
        }
      }

      // Insert recipients
      if (input.recipients?.length) {
        for (const r of input.recipients) {
          await client.query(
            `INSERT INTO pm_transmittal_recipients (transmittal_id, recipient_email, recipient_name)
             VALUES ($1, $2, $3)`,
            [transmittal.id, r.email, r.name || null],
          );
        }
      }

      // Log activity
      await client.query(
        `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by, details)
         VALUES ($1, 'created', $2, $3)`,
        [transmittal.id, userId, JSON.stringify({ transmittal_number: transmittalNumber })],
      );

      await client.query('COMMIT');
      return this.getById(transmittal.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Update a draft transmittal. */
  async update(id: string, input: UpdateTransmittalInput, userId: string) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(value);
      }
    }
    sets.push(`updated_at = NOW()`);
    params.push(id);

    if (sets.length <= 1) return this.getById(id);

    await pool.query(
      `UPDATE pm_transmittals SET ${sets.join(', ')} WHERE id = $${idx} AND status = 'draft'`,
      params,
    );

    await pool.query(
      `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by, details)
       VALUES ($1, 'updated', $2, $3)`,
      [id, userId, JSON.stringify({ fields: Object.keys(input) })],
    );

    return this.getById(id);
  }

  /** Issue (send) a transmittal — changes status from draft to issued, generates tokens, and sends email notifications. */
  async issue(id: string, userId: string) {
    const result = await pool.query(
      `UPDATE pm_transmittals
       SET status = 'issued', issued_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new Error('Transmittal not found or not in draft status');
    }
    const transmittal = result.rows[0];

    // Generate unique acknowledge tokens for each recipient
    const recipients = await pool.query(
      `SELECT * FROM pm_transmittal_recipients WHERE transmittal_id = $1`,
      [id],
    );
    for (const r of recipients.rows) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `UPDATE pm_transmittal_recipients SET acknowledge_token = $1 WHERE id = $2`,
        [token, r.id],
      );
      r.acknowledge_token = token;
    }

    // Fetch items for the email
    const items = await pool.query(
      `SELECT * FROM pm_transmittal_items WHERE transmittal_id = $1 ORDER BY item_number`,
      [id],
    );

    await pool.query(
      `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by)
       VALUES ($1, 'issued', $2)`,
      [id, userId],
    );

    // Send email notifications (fire-and-forget to not block the response)
    this.sendTransmittalEmails(transmittal, recipients.rows, items.rows).catch(err => {
      logger.error('Failed to send transmittal emails', { transmittalId: id, error: err.message });
    });

    return this.getById(id);
  }

  /** Send transmittal notification emails to all recipients and CC emails. */
  private async sendTransmittalEmails(
    transmittal: any,
    recipients: any[],
    items: any[],
  ) {
    const frontendUrl = (config.app.frontendUrl || 'https://propmetrik.com').replace(/\/$/, '');
    const appUrl = (config.app.url || 'http://localhost:4000').replace(/\/$/, '');

    const purposeLabels: Record<string, string> = {
      for_review: 'For Review', for_approval: 'For Approval',
      for_information: 'For Information', for_construction: 'For Construction',
      for_record: 'For Record', as_requested: 'As Requested',
      resubmitted_for_approval: 'Resubmitted for Approval',
    };
    const priorityColors: Record<string, string> = {
      low: '#6b7280', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444',
    };

    const itemsHtml = items.map((item, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${item.item_number}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${item.document_title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${item.document_ref || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${item.revision || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${item.format || 'digital'}</td>
      </tr>
    `).join('');

    // Send to each recipient with their unique acknowledge link
    for (const recipient of recipients) {
      const ackUrl = `${appUrl}/api/v1/transmittals/public/acknowledge/${recipient.acknowledge_token}`;

      // Build items HTML with download links scoped to this recipient's token
      const recipientItemsHtml = items.map((item) => {
        const downloadLink = item.file_key
          ? `<a href="${appUrl}/api/v1/transmittals/public/download/${recipient.acknowledge_token}/${item.id}" style="color:#f59e0b;text-decoration:none;font-size:12px;font-weight:600;">&#x2B07; Download</a>`
          : '';
        return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${item.item_number}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${item.document_title}${downloadLink ? '<br>' + downloadLink : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${item.document_ref || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${item.revision || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${item.format || 'digital'}</td>
      </tr>`;
      }).join('');

      const html = this.buildTransmittalEmailHtml({
        transmittal,
        recipientName: recipient.recipient_name || recipient.recipient_email,
        itemsHtml: recipientItemsHtml,
        ackUrl,
        purpose: purposeLabels[transmittal.purpose] || transmittal.purpose,
        priorityColor: priorityColors[transmittal.priority] || '#3b82f6',
        dueDate: transmittal.due_date ? new Date(transmittal.due_date).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : null,
      });

      try {
        await notificationService.sendEmail({
          to: recipient.recipient_email,
          subject: `[TRANSMITTAL ${transmittal.transmittal_number}] ${transmittal.subject}`,
          html,
        });
        logger.info('Transmittal email sent', {
          transmittalId: transmittal.id,
          recipient: recipient.recipient_email,
        });
      } catch (err: any) {
        logger.error('Failed to send transmittal email to recipient', {
          transmittalId: transmittal.id,
          recipient: recipient.recipient_email,
          error: err.message,
        });
      }
    }

    // Send CC notifications (no acknowledge link)
    if (transmittal.cc_emails?.length) {
      const ccHtml = this.buildTransmittalEmailHtml({
        transmittal,
        recipientName: 'CC Recipient',
        itemsHtml,
        ackUrl: null,
        purpose: purposeLabels[transmittal.purpose] || transmittal.purpose,
        priorityColor: priorityColors[transmittal.priority] || '#3b82f6',
        dueDate: transmittal.due_date ? new Date(transmittal.due_date).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : null,
      });

      for (const ccEmail of transmittal.cc_emails) {
        try {
          await notificationService.sendEmail({
            to: ccEmail,
            subject: `[CC] [TRANSMITTAL ${transmittal.transmittal_number}] ${transmittal.subject}`,
            html: ccHtml,
          });
        } catch (err: any) {
          logger.error('Failed to send CC transmittal email', {
            transmittalId: transmittal.id,
            ccEmail,
            error: err.message,
          });
        }
      }
    }

    // Send to primary to_email if set and not already a recipient
    if (transmittal.to_email) {
      const alreadyRecipient = recipients.some(r => r.recipient_email === transmittal.to_email);
      if (!alreadyRecipient) {
        const toHtml = this.buildTransmittalEmailHtml({
          transmittal,
          recipientName: transmittal.to_contact || transmittal.to_email,
          itemsHtml,
          ackUrl: null,
          purpose: purposeLabels[transmittal.purpose] || transmittal.purpose,
          priorityColor: priorityColors[transmittal.priority] || '#3b82f6',
          dueDate: transmittal.due_date ? new Date(transmittal.due_date).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : null,
        });
        try {
          await notificationService.sendEmail({
            to: transmittal.to_email,
            subject: `[TRANSMITTAL ${transmittal.transmittal_number}] ${transmittal.subject}`,
            html: toHtml,
          });
        } catch (err: any) {
          logger.error('Failed to send transmittal email to primary contact', {
            transmittalId: transmittal.id,
            toEmail: transmittal.to_email,
            error: err.message,
          });
        }
      }
    }
  }

  /** Build the HTML email template for a transmittal notification. */
  private buildTransmittalEmailHtml(opts: {
    transmittal: any;
    recipientName: string;
    itemsHtml: string;
    ackUrl: string | null;
    purpose: string;
    priorityColor: string;
    dueDate: string | null;
  }): string {
    const { transmittal, recipientName, itemsHtml, ackUrl, purpose, priorityColor, dueDate } = opts;

    return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#18181b;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td><span style="font-size:20px;font-weight:700;color:#f59e0b;font-family:monospace;letter-spacing:1px;">PROPMETRIK</span></td>
                <td align="right"><span style="color:#a1a1aa;font-size:12px;font-family:monospace;">TRANSMITTAL</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Transmittal ID bar -->
        <tr>
          <td style="background:#27272a;padding:12px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td><span style="color:#f59e0b;font-weight:700;font-family:monospace;font-size:16px;">${transmittal.transmittal_number}</span></td>
                <td align="right">
                  <span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${priorityColor}22;color:${priorityColor};font-size:11px;font-weight:600;text-transform:uppercase;">${transmittal.priority}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">Dear ${recipientName},</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">You have received a transmittal from <strong>${transmittal.to_company ? transmittal.to_company + ' via ' : ''}PROPMETRIK</strong>. Please review the documents listed below.</p>

            <!-- Details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td width="50%" style="padding:8px 0;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:600;">Subject</span><br><span style="color:#111827;font-size:14px;">${transmittal.subject}</span></td>
                <td width="50%" style="padding:8px 0;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:600;">Purpose</span><br><span style="color:#111827;font-size:14px;">${purpose}</span></td>
              </tr>
              <tr>
                <td style="padding:8px 0;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:600;">From</span><br><span style="color:#111827;font-size:14px;">${transmittal.to_company || '—'}</span></td>
                <td style="padding:8px 0;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:600;">Due Date</span><br><span style="color:${dueDate ? '#111827' : '#9ca3af'};font-size:14px;">${dueDate || 'No due date'}</span></td>
              </tr>
              ${transmittal.description ? `<tr><td colspan="2" style="padding:8px 0;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:600;">Description</span><br><span style="color:#374151;font-size:14px;">${transmittal.description}</span></td></tr>` : ''}
            </table>

            <!-- Document Items Table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#f9fafb;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">#</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Document</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Ref</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Rev</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Format</th>
              </tr>
              ${itemsHtml}
            </table>

            ${ackUrl ? `
            <!-- Acknowledge Button -->
            <div style="text-align:center;margin:32px 0;">
              <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Please acknowledge receipt of this transmittal by clicking the button below:</p>
              <a href="${ackUrl}" style="display:inline-block;padding:14px 40px;background:#f59e0b;color:#18181b;font-weight:700;font-size:14px;text-decoration:none;border-radius:6px;font-family:monospace;letter-spacing:0.5px;">ACKNOWLEDGE RECEIPT</a>
            </div>
            ${transmittal.response_required ? '<p style="color:#ef4444;font-size:12px;text-align:center;margin-top:8px;">* A response is required for this transmittal</p>' : ''}
            ` : `
            <div style="text-align:center;margin:24px 0;padding:16px;background:#f3f4f6;border-radius:6px;">
              <p style="color:#6b7280;font-size:13px;margin:0;">You are receiving this as a CC recipient — no acknowledgement is required.</p>
            </div>
            `}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">This transmittal was generated by PROPMETRIK &mdash; Project Management Platform</p>
            <p style="color:#9ca3af;font-size:11px;margin:4px 0 0;text-align:center;">If you did not expect this, please contact the sender directly.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  /** Acknowledge receipt (by a recipient). */
  async acknowledge(id: string, recipientId: string, userId: string, notes?: string) {
    await pool.query(
      `UPDATE pm_transmittal_recipients
       SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $3, notes = COALESCE($4, notes)
       WHERE id = $2 AND transmittal_id = $1`,
      [id, recipientId, userId, notes || null],
    );

    // Check if all recipients have acknowledged
    const counts = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE acknowledged = true) AS acked
       FROM pm_transmittal_recipients WHERE transmittal_id = $1`,
      [id],
    );
    const { total, acked } = counts.rows[0];
    const newStatus = parseInt(acked) >= parseInt(total) ? 'fully_acknowledged' : 'partially_acknowledged';

    await pool.query(
      `UPDATE pm_transmittals SET status = $2, updated_at = NOW() WHERE id = $1`,
      [id, newStatus],
    );

    await pool.query(
      `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by, details)
       VALUES ($1, 'acknowledged', $2, $3)`,
      [id, userId, JSON.stringify({ recipient_id: recipientId, notes })],
    );

    return this.getById(id);
  }

  /** Add items to an existing (draft) transmittal. */
  async addItem(transmittalId: string, item: CreateTransmittalItemInput) {
    const maxNum = await pool.query(
      `SELECT COALESCE(MAX(item_number), 0) + 1 AS next FROM pm_transmittal_items WHERE transmittal_id = $1`,
      [transmittalId],
    );
    const itemNumber = maxNum.rows[0].next;

    const result = await pool.query(
      `INSERT INTO pm_transmittal_items
       (transmittal_id, item_number, document_title, document_ref, revision, copies, format, file_url, file_key, file_name, file_size, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        transmittalId, itemNumber, item.document_title,
        item.document_ref || null, item.revision || null,
        item.copies || 1, item.format || 'digital',
        item.file_url || null, item.file_key || null, item.file_name || null, item.file_size || null,
        item.notes || null,
      ],
    );
    return result.rows[0];
  }

  /** Remove an item from a draft transmittal. */
  async removeItem(transmittalId: string, itemId: string) {
    await pool.query(
      `DELETE FROM pm_transmittal_items WHERE id = $1 AND transmittal_id = $2`,
      [itemId, transmittalId],
    );
  }

  /** Close a transmittal. */
  async close(id: string, userId: string, responseNotes?: string) {
    await pool.query(
      `UPDATE pm_transmittals
       SET status = 'closed', responded_at = NOW(), response_notes = COALESCE($3, response_notes), updated_at = NOW()
       WHERE id = $1`,
      [id, userId, responseNotes || null],
    );

    await pool.query(
      `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by)
       VALUES ($1, 'closed', $2)`,
      [id, userId],
    );

    return this.getById(id);
  }

  /** Void a transmittal. */
  async void(id: string, userId: string) {
    await pool.query(
      `UPDATE pm_transmittals SET status = 'void', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await pool.query(
      `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by)
       VALUES ($1, 'void', $2)`,
      [id, userId],
    );

    return this.getById(id);
  }

  /** Acknowledge a transmittal via public token (no auth required). */
  async acknowledgeByToken(token: string, notes?: string) {
    // Find recipient by token
    const recipientResult = await pool.query(
      `SELECT r.*, t.id AS transmittal_id, t.status AS transmittal_status
       FROM pm_transmittal_recipients r
       JOIN pm_transmittals t ON t.id = r.transmittal_id
       WHERE r.acknowledge_token = $1`,
      [token],
    );
    if (recipientResult.rows.length === 0) {
      return { success: false, error: 'Invalid or expired acknowledgement link' };
    }

    const recipient = recipientResult.rows[0];

    if (recipient.acknowledged) {
      return { success: true, already: true, transmittal_number: null };
    }

    // Mark as acknowledged
    await pool.query(
      `UPDATE pm_transmittal_recipients
       SET acknowledged = true, acknowledged_at = NOW(), notes = COALESCE($2, notes)
       WHERE id = $1`,
      [recipient.id, notes || null],
    );

    // Check if all recipients have acknowledged
    const counts = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE acknowledged = true) AS acked
       FROM pm_transmittal_recipients WHERE transmittal_id = $1`,
      [recipient.transmittal_id],
    );
    const { total, acked } = counts.rows[0];
    const newStatus = parseInt(acked) >= parseInt(total) ? 'fully_acknowledged' : 'partially_acknowledged';

    await pool.query(
      `UPDATE pm_transmittals SET status = $2, updated_at = NOW() WHERE id = $1`,
      [recipient.transmittal_id, newStatus],
    );

    // Log activity
    await pool.query(
      `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by, details)
       VALUES ($1, 'acknowledged_via_link', NULL, $2)`,
      [recipient.transmittal_id, JSON.stringify({
        recipient_id: recipient.id,
        recipient_email: recipient.recipient_email,
        notes,
      })],
    );

    // Fetch transmittal number and items for the confirmation page
    const tx = await pool.query('SELECT transmittal_number, subject FROM pm_transmittals WHERE id = $1', [recipient.transmittal_id]);
    const transmittalItems = await pool.query(
      'SELECT id, item_number, document_title, file_key, file_name FROM pm_transmittal_items WHERE transmittal_id = $1 ORDER BY item_number',
      [recipient.transmittal_id],
    );

    return {
      success: true,
      already: false,
      transmittal_number: tx.rows[0]?.transmittal_number,
      subject: tx.rows[0]?.subject,
      recipient_name: recipient.recipient_name,
      items: transmittalItems.rows,
      token,
    };
  }

  /** Delete a transmittal (CASCADE handles related data). */
  async delete(id: string) {
    const result = await pool.query(
      `DELETE FROM pm_transmittals WHERE id = $1 RETURNING id`,
      [id],
    );
    return result.rows.length > 0;
  }

  /** Get transmittal stats for a project. */
  async getStats(projectId: string) {
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'draft') AS draft,
         COUNT(*) FILTER (WHERE status = 'issued') AS issued,
         COUNT(*) FILTER (WHERE status = 'partially_acknowledged') AS partial,
         COUNT(*) FILTER (WHERE status = 'fully_acknowledged') AS acknowledged,
         COUNT(*) FILTER (WHERE status = 'closed') AS closed,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status IN ('issued','partially_acknowledged')) AS overdue
       FROM pm_transmittals WHERE project_id = $1`,
      [projectId],
    );
    return result.rows[0];
  }
}

export default new TransmittalService();
