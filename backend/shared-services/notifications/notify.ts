/**
 * Centralized Notification Core
 * =============================================================================
 * ONE entry point (`notify`) that every service calls to reach a user across
 * every channel. It fans a single logical event out to:
 *   - in-app inbox  (staff  -> user_notifications via in-mail createNotification)
 *                   (tenant -> tenant_notifications)
 *   - email         (3-tier Graph -> SES -> SMTP failover via unified service)
 *   - SMS           (Twilio via unified service)
 *   - SSE realtime  (so the bell / portal update live)
 *
 * Audience routing is the only legitimate split: staff and tenants live in
 * different tables and authenticate differently, so a recipient declares its
 * `audience` and the core writes to the correct inbox. Per-service scoping is
 * handled by `category` (esign/property/valuation/crm/project/finance/...).
 *
 * Recipient *resolution* (who is the landlord? which staff?) lives here too as
 * small reusable resolvers so call sites stay one-liners.
 */

import { pool, query } from '../../src/database';
import { logger } from '../../src/utils/logger';
import realtimeEmitter from '../realtime/realtimeService';
import {
  createNotification,
  NotificationCategory,
  NotificationPriority,
  NotificationAction,
} from './in-mail/notificationService';
import { emailService, smsService, EmailAttachment } from './unified';

export type NotifyAudience = 'staff' | 'tenant';

export interface NotifyRecipient {
  audience: NotifyAudience;
  /** staff: users.id (== Keycloak sub the bell queries by); tenant: tenants.id */
  userId: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

export interface NotifyChannels {
  inApp?: boolean;
  email?: boolean;
  sms?: boolean;
}

export interface NotifyEmailBody {
  subject: string;
  html?: string;
  text?: string;
  /** Optional file attachments (e.g. a signed PDF). Forwarded to the email transport. */
  attachments?: EmailAttachment[];
}

export interface NotifyInput {
  recipients: NotifyRecipient[] | NotifyRecipient;
  category: NotificationCategory;
  /** Event key, e.g. 'message.received', 'payment.received'. Stored as source_type / tenant type. */
  type: string;
  title: string;
  body: string;
  summary?: string;
  priority?: NotificationPriority;
  sourceType?: string;
  sourceId?: string;
  /** Deep link for staff (dashboard). */
  sourceUrl?: string;
  /** Deep link for tenants (tenant portal). Falls back to sourceUrl. */
  tenantActionUrl?: string;
  actions?: NotificationAction[];
  organizationId?: string;
  metadata?: Record<string, any>;
  /** Defaults to { inApp: true }. Email/SMS opt-in per event. */
  channels?: NotifyChannels;
  /** Optional email content. If channels.email is true and this is omitted, a
   *  plain email is synthesised from title/body. */
  email?: NotifyEmailBody;
  /** Optional SMS body. Defaults to title + summary/body. */
  smsBody?: string;
}

export interface NotifyResult {
  inApp: number;
  email: number;
  sms: number;
  errors: string[];
}

// =============================================================================
// CORE
// =============================================================================

/**
 * Fan a single logical notification out to all requested channels for all
 * recipients. Never throws — channel failures are collected and logged so a
 * notification problem can never break the business action that triggered it.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const recipients = Array.isArray(input.recipients) ? input.recipients : [input.recipients];
  const channels: NotifyChannels = input.channels ?? { inApp: true };
  const result: NotifyResult = { inApp: 0, email: 0, sms: 0, errors: [] };

  // De-duplicate recipients. A recipient is valid if it has an inbox target
  // (userId) OR an email — the latter supports notifying non-platform people
  // (e.g. rental applicants who don't have a tenant/user record yet).
  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    if (!r) return false;
    const id = r.userId || r.email;
    if (!id) return false;
    const key = `${r.audience}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await Promise.all(
    unique.map(async (recipient) => {
      // ---- In-app inbox -----------------------------------------------------
      if (channels.inApp && recipient.userId) {
        try {
          if (recipient.audience === 'staff') {
            await createNotification({
              userId: recipient.userId,
              organizationId: input.organizationId,
              title: input.title,
              body: input.body,
              summary: input.summary,
              category: input.category,
              priority: input.priority,
              sourceType: input.sourceType || input.type,
              sourceId: input.sourceId,
              sourceUrl: input.sourceUrl,
              actions: input.actions,
              metadata: input.metadata,
            });
          } else {
            // Tenant inbox lives in tenant_notifications (tenant portal polls it).
            await query(
              `INSERT INTO tenant_notifications (tenant_id, type, title, message, action_url)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                recipient.userId,
                input.type,
                input.title,
                input.summary || input.body,
                input.tenantActionUrl || input.sourceUrl || null,
              ],
            );
            // Live-push to the tenant too (portal can consume the same SSE stream).
            try {
              realtimeEmitter.sendToUser(recipient.userId, {
                type: 'notification:new',
                payload: {
                  title: input.title,
                  message: input.summary || input.body,
                  category: input.category,
                  actionUrl: input.tenantActionUrl || input.sourceUrl,
                },
                organizationId: input.organizationId || '',
              });
            } catch { /* SSE is best-effort */ }
          }
          result.inApp += 1;
        } catch (err: any) {
          result.errors.push(`inApp(${recipient.userId}): ${err.message}`);
        }
      }

      // ---- Email ------------------------------------------------------------
      if (channels.email && recipient.email) {
        try {
          const html =
            input.email?.html ||
            defaultEmailHtml(input.title, input.body, input.sourceUrl || input.tenantActionUrl);
          const r = await emailService.send({
            to: recipient.email,
            subject: input.email?.subject || input.title,
            html,
            text: input.email?.text || `${input.title}\n\n${input.body}`,
            attachments: input.email?.attachments,
          });
          if (r.success) result.email += 1;
          else result.errors.push(`email(${recipient.email}): ${r.error}`);
        } catch (err: any) {
          result.errors.push(`email(${recipient.email}): ${err.message}`);
        }
      }

      // ---- SMS --------------------------------------------------------------
      if (channels.sms && recipient.phone) {
        try {
          const body = input.smsBody || `${input.title}: ${input.summary || input.body}`;
          const r = await smsService.send({ to: recipient.phone, body });
          if (r.success) result.sms += 1;
          else result.errors.push(`sms(${recipient.phone}): ${r.error}`);
        } catch (err: any) {
          result.errors.push(`sms(${recipient.phone}): ${err.message}`);
        }
      }
    }),
  );

  if (result.errors.length) {
    logger.warn('notify(): some channels failed', {
      type: input.type,
      category: input.category,
      errors: result.errors,
    });
  }

  return result;
}

function defaultEmailHtml(title: string, body: string, url?: string): string {
  const cta = url
    ? `<p style="margin:24px 0;"><a href="${url}" style="background:#f59e0b;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">View Details</a></p>`
    : '';
  return `<div style="font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#18181b;">
    <h2 style="font-size:18px;margin:0 0 12px;">${title}</h2>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0;">${body}</p>
    ${cta}
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 12px;" />
    <p style="font-size:11px;color:#a1a1aa;margin:0;">PropMetrik — sent automatically, please do not reply.</p>
  </div>`;
}

// =============================================================================
// RECIPIENT RESOLVERS
// =============================================================================

/**
 * Resolve the active staff of an organization (the people who should receive
 * landlord/manager-facing notifications). Staff orgs are small; tenants are the
 * 4000+ external users and are excluded by user_type.
 */
export async function resolveOrgStaff(organizationId: string): Promise<NotifyRecipient[]> {
  if (!organizationId) return [];
  try {
    const res = await query(
      `SELECT id, email, phone
         FROM users
        WHERE organization_id = $1
          AND is_active = TRUE
          AND COALESCE(user_type, 'staff') = 'staff'`,
      [organizationId],
    );
    return res.rows.map((r: any) => ({
      audience: 'staff' as const,
      userId: r.id,
      email: r.email,
      phone: r.phone,
    }));
  } catch (err: any) {
    logger.warn('resolveOrgStaff failed', { organizationId, error: err.message });
    return [];
  }
}

/** Resolve a single staff user by users.id. */
export async function resolveStaffUser(userId: string): Promise<NotifyRecipient | null> {
  if (!userId) return null;
  try {
    const res = await query(`SELECT id, email, phone FROM users WHERE id = $1`, [userId]);
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return { audience: 'staff', userId: r.id, email: r.email, phone: r.phone };
  } catch (err: any) {
    logger.warn('resolveStaffUser failed', { userId, error: err.message });
    return null;
  }
}

/** Resolve a tenant recipient (tenants.id). */
export async function resolveTenant(tenantId: string): Promise<NotifyRecipient | null> {
  if (!tenantId) return null;
  try {
    const res = await query(
      `SELECT id, email, phone_primary, full_name FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return {
      audience: 'tenant',
      userId: r.id,
      email: r.email,
      phone: r.phone_primary,
      name: r.full_name,
    };
  } catch (err: any) {
    logger.warn('resolveTenant failed', { tenantId, error: err.message });
    return null;
  }
}

/** Resolve the tenant attached to a tenancy. */
export async function resolveTenantByTenancy(tenancyId: string): Promise<NotifyRecipient | null> {
  if (!tenancyId) return null;
  try {
    const res = await query(
      `SELECT t.id, t.email, t.phone_primary, t.full_name
         FROM tenancies tn
         JOIN tenants t ON t.id = tn.tenant_id
        WHERE tn.id = $1`,
      [tenancyId],
    );
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return {
      audience: 'tenant',
      userId: r.id,
      email: r.email,
      phone: r.phone_primary,
      name: r.full_name,
    };
  } catch (err: any) {
    logger.warn('resolveTenantByTenancy failed', { tenancyId, error: err.message });
    return null;
  }
}

export default notify;
