/**
 * Reminder Service for E-Sign
 * Manages scheduled reminders for pending signers
 * 
 * Features:
 * - Schedule reminders based on envelope settings
 * - Escalating reminder types (initial → follow_up → final_warning)
 * - Process pending reminders on schedule
 * - Cancel reminders when signer completes
 */

import db from '../../src/database';
import { logger } from '../../src/utils/logger';
import { emailService } from './emailService';

export interface Reminder {
  id: string;
  envelopeId: string;
  signerId: string;
  reminderType: 'initial' | 'follow_up' | 'final_warning';
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  errorMessage?: string;
  createdAt: Date;
}

export interface CreateReminderDto {
  envelopeId: string;
  signerId: string;
  reminderType: 'initial' | 'follow_up' | 'final_warning';
  scheduledFor: Date;
}

export interface ScheduleRemindersOptions {
  initialDelayDays?: number;      // Days before first reminder (default: 1)
  followUpIntervalDays?: number;  // Days between follow-ups (default: 3)
  finalWarningDays?: number;      // Days before expiry for final warning (default: 2)
}

export class ReminderService {
  /**
   * Schedule reminders for all signers in an envelope
   */
  async scheduleRemindersForEnvelope(
    envelopeId: string,
    expiresAt: Date,
    options: ScheduleRemindersOptions = {}
  ): Promise<Reminder[]> {
    const {
      initialDelayDays = 1,
      followUpIntervalDays = 3,
      finalWarningDays = 2,
    } = options;

    // Get envelope and signers
    const envelopeResult = await db.query(
      `SELECT e.*, e.reminder_enabled, e.reminder_frequency_days 
       FROM esign_envelopes e WHERE e.id = $1`,
      [envelopeId]
    );

    if (envelopeResult.rows.length === 0) {
      throw new Error('Envelope not found');
    }

    const envelope = envelopeResult.rows[0];
    
    // Check if reminders are enabled
    if (envelope.reminder_enabled === false) {
      logger.info('Reminders disabled for envelope', { envelopeId });
      return [];
    }

    // Get pending signers
    const signersResult = await db.query(
      `SELECT * FROM esign_signers 
       WHERE envelope_id = $1 AND status NOT IN ('signed', 'declined')
       ORDER BY signing_order`,
      [envelopeId]
    );

    const reminders: Reminder[] = [];
    const now = new Date();

    for (const signer of signersResult.rows) {
      // Calculate reminder dates
      const initialDate = new Date(now);
      initialDate.setDate(initialDate.getDate() + initialDelayDays);

      const followUpDate = new Date(initialDate);
      followUpDate.setDate(followUpDate.getDate() + followUpIntervalDays);

      const finalWarningDate = new Date(expiresAt);
      finalWarningDate.setDate(finalWarningDate.getDate() - finalWarningDays);

      // Schedule initial reminder
      if (initialDate < expiresAt) {
        const reminder = await this.createReminder({
          envelopeId,
          signerId: signer.id,
          reminderType: 'initial',
          scheduledFor: initialDate,
        });
        reminders.push(reminder);
      }

      // Schedule follow-up reminder
      if (followUpDate < finalWarningDate && followUpDate < expiresAt) {
        const reminder = await this.createReminder({
          envelopeId,
          signerId: signer.id,
          reminderType: 'follow_up',
          scheduledFor: followUpDate,
        });
        reminders.push(reminder);
      }

      // Schedule final warning
      if (finalWarningDate > now) {
        const reminder = await this.createReminder({
          envelopeId,
          signerId: signer.id,
          reminderType: 'final_warning',
          scheduledFor: finalWarningDate,
        });
        reminders.push(reminder);
      }
    }

    logger.info('Reminders scheduled for envelope', {
      envelopeId,
      reminderCount: reminders.length,
      signerCount: signersResult.rows.length,
    });

    return reminders;
  }

  /**
   * Create a single reminder
   */
  async createReminder(dto: CreateReminderDto): Promise<Reminder> {
    const result = await db.query(
      `INSERT INTO esign_reminders (envelope_id, signer_id, reminder_type, scheduled_for)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [dto.envelopeId, dto.signerId, dto.reminderType, dto.scheduledFor]
    );

    return this.mapToReminder(result.rows[0]);
  }

  /**
   * Process all pending reminders that are due
   */
  async processPendingReminders(): Promise<{ sent: number; failed: number }> {
    const result = await db.query(
      `SELECT r.*, 
              s.name as signer_name, s.email as signer_email, s.access_token,
              e.name as document_title, e.expires_at,
              u.full_name as creator_name
       FROM esign_reminders r
       JOIN esign_signers s ON s.id = r.signer_id
       JOIN esign_envelopes e ON e.id = r.envelope_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE r.status = 'pending' 
         AND r.scheduled_for <= NOW()
         AND s.status NOT IN ('signed', 'declined')
         AND e.status NOT IN ('completed', 'voided', 'expired')
       ORDER BY r.scheduled_for
       LIMIT 100`
    );

    let sent = 0;
    let failed = 0;

    for (const row of result.rows) {
      try {
        // Calculate days remaining
        const daysRemaining = row.expires_at
          ? Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : undefined;

        // Build signing URL
        const signingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sign/${row.access_token}`;

        // Send reminder email
        const success = await emailService.sendReminderEmail({
          signerEmail: row.signer_email,
          signerName: row.signer_name,
          documentTitle: row.document_title,
          signingUrl,
          daysRemaining,
          reminderType: row.reminder_type,
          creatorName: row.creator_name,
        });

        if (success) {
          await db.query(
            `UPDATE esign_reminders SET status = 'sent', sent_at = NOW() WHERE id = $1`,
            [row.id]
          );
          sent++;
        } else {
          await db.query(
            `UPDATE esign_reminders SET status = 'failed', error_message = 'Email send failed' WHERE id = $1`,
            [row.id]
          );
          failed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await db.query(
          `UPDATE esign_reminders SET status = 'failed', error_message = $2 WHERE id = $1`,
          [row.id, errorMessage]
        );
        failed++;
        logger.error('Failed to process reminder', { reminderId: row.id, error });
      }
    }

    if (sent > 0 || failed > 0) {
      logger.info('Processed pending reminders', { sent, failed });
    }

    return { sent, failed };
  }

  /**
   * Cancel all pending reminders for a signer (when they complete signing)
   */
  async cancelRemindersForSigner(signerId: string): Promise<number> {
    const result = await db.query(
      `UPDATE esign_reminders 
       SET status = 'cancelled'
       WHERE signer_id = $1 AND status = 'pending'
       RETURNING id`,
      [signerId]
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info('Cancelled reminders for signer', { signerId, count });
    }

    return count;
  }

  /**
   * Cancel all pending reminders for an envelope (when voided or completed)
   */
  async cancelRemindersForEnvelope(envelopeId: string): Promise<number> {
    const result = await db.query(
      `UPDATE esign_reminders 
       SET status = 'cancelled'
       WHERE envelope_id = $1 AND status = 'pending'
       RETURNING id`,
      [envelopeId]
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info('Cancelled reminders for envelope', { envelopeId, count });
    }

    return count;
  }

  /**
   * Get pending reminders for an envelope
   */
  async getRemindersForEnvelope(envelopeId: string): Promise<Reminder[]> {
    const result = await db.query(
      `SELECT * FROM esign_reminders 
       WHERE envelope_id = $1 
       ORDER BY scheduled_for`,
      [envelopeId]
    );

    return result.rows.map(this.mapToReminder);
  }

  /**
   * Get reminder statistics
   */
  async getReminderStats(organizationId: string): Promise<{
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  }> {
    const result = await db.query(
      `SELECT r.status, COUNT(*)::int as count
       FROM esign_reminders r
       JOIN esign_envelopes e ON e.id = r.envelope_id
       WHERE e.organization_id = $1
       GROUP BY r.status`,
      [organizationId]
    );

    const stats = {
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of result.rows) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = row.count;
      }
    }

    return stats;
  }

  /**
   * Reschedule a failed reminder
   */
  async rescheduleReminder(reminderId: string, newScheduledFor: Date): Promise<Reminder> {
    const result = await db.query(
      `UPDATE esign_reminders 
       SET status = 'pending', scheduled_for = $2, error_message = NULL
       WHERE id = $1
       RETURNING *`,
      [reminderId, newScheduledFor]
    );

    if (result.rows.length === 0) {
      throw new Error('Reminder not found');
    }

    return this.mapToReminder(result.rows[0]);
  }

  /**
   * Update reminder frequency for an envelope
   */
  async updateReminderSettings(
    envelopeId: string,
    settings: { enabled?: boolean; frequencyDays?: number }
  ): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (settings.enabled !== undefined) {
      updates.push(`reminder_enabled = $${paramIndex++}`);
      params.push(settings.enabled);
    }

    if (settings.frequencyDays !== undefined) {
      updates.push(`reminder_frequency_days = $${paramIndex++}`);
      params.push(settings.frequencyDays);
    }

    if (updates.length === 0) return;

    params.push(envelopeId);
    await db.query(
      `UPDATE esign_envelopes SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // If disabling, cancel pending reminders
    if (settings.enabled === false) {
      await this.cancelRemindersForEnvelope(envelopeId);
    }
  }

  private mapToReminder(row: any): Reminder {
    return {
      id: row.id,
      envelopeId: row.envelope_id,
      signerId: row.signer_id,
      reminderType: row.reminder_type,
      scheduledFor: row.scheduled_for,
      sentAt: row.sent_at,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }
}

export const reminderService = new ReminderService();
