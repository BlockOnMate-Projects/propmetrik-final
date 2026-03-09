/**
 * Transmittal Service
 * 
 * Business logic for formal document distribution management.
 * Handles CRUD, issuance, recipient acknowledgement, and activity logging.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

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

  /** Issue (send) a transmittal — changes status from draft to issued. */
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

    await pool.query(
      `INSERT INTO pm_transmittal_activity (transmittal_id, action, performed_by)
       VALUES ($1, 'issued', $2)`,
      [id, userId],
    );

    return this.getById(id);
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
       (transmittal_id, item_number, document_title, document_ref, revision, copies, format, file_url, file_name, file_size, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        transmittalId, itemNumber, item.document_title,
        item.document_ref || null, item.revision || null,
        item.copies || 1, item.format || 'digital',
        item.file_url || null, item.file_name || null, item.file_size || null,
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

  /** Delete a draft transmittal. */
  async delete(id: string) {
    const result = await pool.query(
      `DELETE FROM pm_transmittals WHERE id = $1 AND status = 'draft' RETURNING id`,
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
