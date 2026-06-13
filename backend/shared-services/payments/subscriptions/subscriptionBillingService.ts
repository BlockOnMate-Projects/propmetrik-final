/**
 * Subscription Recurring Billing
 * =============================================================================
 * Merchant-managed recurring billing on top of Paystack. We do NOT use
 * Paystack's native Plans/Subscriptions API (it can't do MoMo recurring and
 * would fight our DB-managed billing periods). Instead:
 *
 *   1. The FIRST charge (at signup) is a normal Paystack transaction. When it
 *      succeeds we capture the reusable `authorization_code` onto the
 *      subscription (reconcileSubscriptionPayment, driven by webhook + a verify
 *      endpoint).
 *   2. A daily cron (processDueRenewals) finds subscriptions whose period has
 *      ended and auto-charges the saved authorization via charge_authorization
 *      (chargeRenewal), advancing the period on success.
 *   3. On failure we run dunning (past_due → retries → suspended) with
 *      notifications at each step.
 *
 * Everything here is idempotent: reconciliation no-ops on an already-paid
 * invoice, and each charge uses a unique reference.
 */

import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { config } from '../../../src/config';
import { paystackService } from '../../../src/services/property-management/payment/paystackService';
import {
  getSubscriptionById,
  createInvoice,
  markInvoicePaid,
  getInvoice,
  Subscription,
  Invoice,
} from './subscriptionService';
import { notify } from '../../notifications/notify';

// Dunning policy
const MAX_RENEWAL_ATTEMPTS = 4;
// Days to wait before the Nth retry (attempt 1 fails → wait 1 day, etc.)
const RETRY_BACKOFF_DAYS = [1, 3, 5, 7];

// Paystack intermediate statuses that mean "the customer has been prompted to
// approve" (mobile-money / OTP flows) — the charge isn't done yet but isn't a
// failure either; it finalizes asynchronously via the charge.success webhook.
const PROMPT_PENDING_STATUSES = ['pending', 'send_otp', 'send_phone', 'send_birthday', 'pay_offline', 'ongoing'];

export interface ReconcileResult {
  status: 'success' | 'already_paid' | 'failed' | 'not_found';
  subscriptionId?: string;
  invoiceId?: string;
  message?: string;
}

// =============================================================================
// Reference helpers
// =============================================================================

/** Signup:   sub_<subId>_inv_<invId>
 *  Renewal:  subr_<subId>_inv_<invId>_<ts>
 *  Both start with "sub" so the webhook can route them here. */
export function isSubscriptionReference(reference: string): boolean {
  return /^subr?_/.test(reference);
}

function parseSubscriptionReference(reference: string): { subscriptionId: string; invoiceId: string } | null {
  const m = reference.match(/^subr?_([0-9a-f-]{36})_inv_([0-9a-f-]{36})/i);
  if (!m) return null;
  return { subscriptionId: m[1], invoiceId: m[2] };
}

/** Convert an invoice total (in its own currency) to GHS pesewas for Paystack. */
async function invoiceTotalToGhsPesewas(invoice: Invoice): Promise<{ pesewas: number; fx: any | null }> {
  const currency = (invoice.currency || 'GHS').toUpperCase();
  const { exchangeRateService } = await import('../crypto/exchangeRateService');
  const conv = await exchangeRateService.normalizeToGhs(invoice.total, currency);
  return {
    pesewas: Math.round(conv.ghsAmount * 100),
    fx: currency === 'GHS' ? null : {
      obligation_currency: currency,
      obligation_amount: invoice.total,
      fx_rate: conv.rate,
      fx_source: conv.source,
      fx_locked_at: conv.fetchedAt.toISOString(),
    },
  };
}

// =============================================================================
// Authorization capture
// =============================================================================

/**
 * Store the reusable card token + card metadata from a successful charge so
 * future renewals can auto-charge. MoMo authorizations are generally NOT
 * reusable; only a card auth lets us bill unattended. We store whatever Paystack
 * returns and let chargeRenewal degrade to an emailed invoice link if the auth
 * turns out to be unusable.
 */
async function captureAuthorization(subscriptionId: string, verifyData: any): Promise<void> {
  const auth = verifyData?.authorization || {};
  const reusable = auth.reusable !== false; // Paystack omits → treat as reusable (card)
  await pool.query(
    `UPDATE subscriptions SET
        payment_provider = 'paystack',
        payment_authorization_code = CASE WHEN $2 <> '' AND $5 THEN $2 ELSE payment_authorization_code END,
        payment_card_last4 = COALESCE(NULLIF($3, ''), payment_card_last4),
        payment_card_brand = COALESCE(NULLIF($4, ''), payment_card_brand),
        payment_channel = COALESCE(NULLIF($6, ''), payment_channel),
        payment_email = COALESCE(NULLIF($7, ''), payment_email),
        payment_provider_customer_id = COALESCE(NULLIF($8, ''), payment_provider_customer_id),
        last_payment_at = NOW(),
        renewal_attempts = 0,
        next_retry_at = NULL,
        updated_at = NOW()
      WHERE id = $1`,
    [
      subscriptionId,
      auth.authorization_code || '',
      auth.last4 || '',
      auth.card_type || auth.brand || '',
      reusable,
      verifyData?.channel || '',
      verifyData?.customer?.email || '',
      verifyData?.customer?.customer_code || '',
    ]
  );
}

/**
 * Record a settled subscription payment in the unified `payment_transactions`
 * ledger so subscriptions sit alongside rent/deal/project/valuation payments for
 * platform revenue reporting. recipient = 'platform', service_fee = 0 (the whole
 * subscription amount IS platform revenue). Idempotent on `reference`.
 */
async function recordSubscriptionTransaction(opts: {
  reference: string;
  subscription: Subscription;
  invoiceId: string;
  amountPesewas: number;
  channel?: string | null;
  paystackStatus?: string;
}): Promise<void> {
  try {
    const sub = opts.subscription;
    const recipient = await resolveBillingRecipient(sub);
    const gross = Math.round(opts.amountPesewas) || 0;
    await pool.query(
      `INSERT INTO payment_transactions (
         reference, paystack_reference, payment_type, payer_type, payer_id, payer_email,
         recipient_type, gross_amount, principal_amount, service_fee, currency,
         status, paystack_status, channel, domain_record_type, domain_record_id, metadata, verified_at
       ) VALUES ($1, $1, 'subscription', 'subscriber', $2, $3, 'platform',
                 $4, $4, 0, 'GHS', 'success', $5, $6, 'subscription_invoice', $7, $8, NOW())
       ON CONFLICT (reference) DO UPDATE
         SET status = 'success', verified_at = NOW(), paystack_status = EXCLUDED.paystack_status`,
      [
        opts.reference,
        sub.user_id || null,
        recipient?.email || sub.payment_email || null,
        gross,
        opts.paystackStatus || 'success',
        opts.channel || sub.payment_channel || null,
        opts.invoiceId,
        JSON.stringify({
          subscription_id: sub.id,
          invoice_id: opts.invoiceId,
          plan_slug: sub.plan?.slug,
          plan_name: sub.plan?.name,
          billing_interval: sub.billing_interval,
          organization_id: sub.organization_id || null,
        }),
      ]
    );
  } catch (err: any) {
    logger.warn('Failed to record subscription in payment ledger (non-blocking)', {
      reference: opts.reference, error: err?.message,
    });
  }
}

// =============================================================================
// Reconciliation (first charge + any charge.success webhook)
// =============================================================================

/**
 * Reconcile a subscription payment by reference. Verifies with Paystack, marks
 * the invoice paid, captures the card authorization, and activates the sub.
 * Idempotent — safe to call from both the webhook and the verify endpoint.
 */
export async function reconcileSubscriptionPayment(reference: string): Promise<ReconcileResult> {
  const parsed = parseSubscriptionReference(reference);
  if (!parsed) {
    logger.warn('Subscription reconcile: unparseable reference', { reference });
    return { status: 'not_found', message: 'Unrecognized reference' };
  }
  const { subscriptionId, invoiceId } = parsed;

  // Idempotency: if the invoice is already paid, nothing to do.
  const existing = await getInvoice(invoiceId);
  if (existing && existing.status === 'paid') {
    return { status: 'already_paid', subscriptionId, invoiceId };
  }

  const verify = await paystackService.verifyTransaction(reference);
  if (!verify?.data || verify.data.status !== 'success') {
    logger.warn('Subscription reconcile: charge not successful', {
      reference, status: verify?.data?.status,
    });
    return { status: 'failed', subscriptionId, invoiceId, message: verify?.data?.status || 'unverified' };
  }

  const channel = verify.data.channel || 'paystack';
  await markInvoicePaid(invoiceId, reference, channel);
  await captureAuthorization(subscriptionId, verify.data);

  const sub = await getSubscriptionById(subscriptionId);

  // If this settles a RENEWAL whose period already lapsed (e.g. a mobile-money
  // prompt the customer approved minutes/hours later), roll the period forward.
  // No-op for the signup case (period is still in the future). Atomic, so it
  // can't race the synchronous renewal path into a double advance.
  await advancePeriodIfLapsed(subscriptionId, sub?.billing_interval);

  // Unified ledger entry (platform revenue reporting).
  if (sub) {
    const invoice = existing || await getInvoice(invoiceId);
    await recordSubscriptionTransaction({
      reference, subscription: sub, invoiceId,
      amountPesewas: Number(verify.data.amount) || Math.round(Number(invoice?.total || 0) * 100),
      channel, paystackStatus: verify.data.status,
    });
  }

  logger.info('Subscription payment reconciled', { subscriptionId, invoiceId, reference, channel });
  await notifyBilling(subscriptionId, 'payment_succeeded').catch(() => {});

  return { status: 'success', subscriptionId, invoiceId };
}

// =============================================================================
// Period advancement
// =============================================================================

/**
 * Advance the billing period by one interval — ATOMICALLY and ONLY if the period
 * has actually lapsed (current_period_end <= now). Returns true if it advanced.
 *
 * The `WHERE current_period_end <= NOW()` guard, with the new end computed in SQL
 * from the existing value, makes this safe under concurrency: when a synchronous
 * renewal charge and the charge.success webhook (or the verify endpoint) both try
 * to settle the same invoice, only the first advances — the rest no-op. That's
 * what prevents a double-charge window on the async (mobile-money prompt) path.
 * No-ops for the signup case (period is still in the future).
 */
async function advancePeriodIfLapsed(subscriptionId: string, interval?: string): Promise<boolean> {
  const step = interval === 'annual' ? "INTERVAL '1 year'" : "INTERVAL '1 month'"; // fixed whitelist
  const r = await pool.query(
    `UPDATE subscriptions
        SET current_period_start = current_period_end,
            current_period_end = current_period_end + ${step},
            updated_at = NOW()
      WHERE id = $1 AND current_period_end <= NOW()
      RETURNING current_period_start, current_period_end`,
    [subscriptionId]
  );
  if (r.rowCount === 0) return false;
  const { current_period_start, current_period_end } = r.rows[0];
  await pool.query(
    `UPDATE subscription_usage SET used = 0, period_start = $1, period_end = $2, updated_at = NOW()
      WHERE subscription_id = $3`,
    [current_period_start, current_period_end, subscriptionId]
  );
  return true;
}

// =============================================================================
// Renewal charge
// =============================================================================

/**
 * Charge one subscription for its current period. Creates the invoice, charges
 * the saved authorization (or activates free if payment is bypassed), advances
 * the period on success, and runs dunning on failure.
 */
export async function chargeRenewal(subscriptionId: string): Promise<{ ok: boolean; reason?: string }> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) return { ok: false, reason: 'not_found' };
  if (!subscription.plan) return { ok: false, reason: 'no_plan' };

  // Local / demo: PAYMENT_BYPASS short-circuits the gateway — just renew.
  if (config.app.paymentBypass) {
    const invoice = await createInvoice(subscriptionId);
    await markInvoicePaid(invoice.id, `bypass_${invoice.id}`, 'manual');
    await advancePeriodIfLapsed(subscriptionId, subscription.billing_interval);
    await pool.query(`UPDATE subscriptions SET renewal_attempts = 0, next_retry_at = NULL, last_payment_at = NOW() WHERE id = $1`, [subscriptionId]);
    logger.info('Subscription renewed (payment bypassed)', { subscriptionId });
    return { ok: true };
  }

  // No reusable authorization on file (e.g. a one-off mobile-money charge before
  // the direct-debit mandate is enabled) → we can't auto-charge. Invoice + link.
  if (!subscription.payment_authorization_code) {
    const invoice = await createInvoice(subscriptionId);
    await markPastDueOrSuspend(subscription, invoice, 'no_authorization');
    return { ok: false, reason: 'no_authorization' };
  }

  const invoice = await createInvoice(subscriptionId);
  const email = subscription.payment_email
    || (await lookupSubscriptionEmail(subscription))
    || '';
  if (!email) {
    await markPastDueOrSuspend(subscription, invoice, 'no_email');
    return { ok: false, reason: 'no_email' };
  }

  const reference = `subr_${subscription.id}_inv_${invoice.id}_${Date.now()}`;
  try {
    const { pesewas, fx } = await invoiceTotalToGhsPesewas(invoice);
    const res = await paystackService.chargeAuthorization({
      email,
      amount: pesewas,
      authorization_code: subscription.payment_authorization_code,
      reference,
      currency: 'GHS',
      metadata: {
        payment_type: 'subscription',
        subscription_id: subscription.id,
        invoice_id: invoice.id,
        plan_slug: subscription.plan.slug,
        ...(fx || {}),
      },
    });

    const chargeStatus = res?.data?.status;

    // 1) SILENT success — card, or mobile money once the direct-debit mandate is
    //    enabled. No customer interaction; the priority path.
    if (chargeStatus === 'success') {
      await markInvoicePaid(invoice.id, reference, res.data.channel || subscription.payment_channel || 'card');
      await captureAuthorization(subscription.id, res.data); // refresh token if rotated
      await advancePeriodIfLapsed(subscription.id, subscription.billing_interval);
      await pool.query(`UPDATE subscriptions SET renewal_attempts = 0, next_retry_at = NULL WHERE id = $1`, [subscription.id]);
      await recordSubscriptionTransaction({
        reference, subscription, invoiceId: invoice.id,
        amountPesewas: Number(res.data.amount) || Math.round(Number(invoice.total) * 100),
        channel: res.data.channel || subscription.payment_channel, paystackStatus: 'success',
      });
      logger.info('Subscription renewed (silent)', { subscriptionId, invoiceId: invoice.id, reference });
      await notifyBilling(subscription.id, 'payment_succeeded').catch(() => {});
      return { ok: true };
    }

    // 2) CHARGE-WITH-PROMPT — mobile money before the mandate is live. Paystack
    //    has pushed an approval prompt to the customer's phone; it finalizes via
    //    the charge.success webhook when they approve (→ reconcile advances the
    //    period). Hold in past_due with a short retry; nudge them. NOT a dunning
    //    failure, so we don't bump renewal_attempts.
    if (PROMPT_PENDING_STATUSES.includes(chargeStatus)) {
      const nextRetry = new Date();
      nextRetry.setDate(nextRetry.getDate() + 1);
      await pool.query(
        `UPDATE subscriptions SET status = 'past_due', next_retry_at = $2, updated_at = NOW() WHERE id = $1`,
        [subscription.id, nextRetry.toISOString()]
      );
      await pool.query(
        `INSERT INTO subscription_events (subscription_id, event_type, from_status, to_status, details)
         VALUES ($1, 'renewal_prompt_sent', $2, 'past_due', $3)`,
        [subscription.id, subscription.status, JSON.stringify({ reference, invoice_id: invoice.id, channel: subscription.payment_channel, status: chargeStatus })]
      );
      logger.info('Subscription renewal prompt sent (awaiting customer approval)', { subscriptionId, reference, status: chargeStatus });
      await notifyBilling(subscription.id, 'payment_prompt', { invoice, nextRetry }).catch(() => {});
      return { ok: false, reason: 'prompt_pending' };
    }

    // 3) DECLINE / error → dunning (invoice + payment link).
    logger.warn('Subscription renewal charge declined', { subscriptionId, status: chargeStatus });
    await markPastDueOrSuspend(subscription, invoice, res?.data?.gateway_response || chargeStatus || 'declined');
    return { ok: false, reason: 'declined' };
  } catch (err: any) {
    logger.error('Subscription renewal charge error', { subscriptionId, error: err?.message });
    await markPastDueOrSuspend(subscription, invoice, err?.message || 'charge_error');
    return { ok: false, reason: 'error' };
  }
}

/** Apply dunning: bump attempt count, go past_due with a retry date, or suspend. */
async function markPastDueOrSuspend(subscription: Subscription, invoice: Invoice, reason: string): Promise<void> {
  const attempts = (subscription.renewal_attempts || 0) + 1;

  if (attempts >= MAX_RENEWAL_ATTEMPTS) {
    await pool.query(
      `UPDATE subscriptions SET status = 'suspended', renewal_attempts = $2, next_retry_at = NULL, updated_at = NOW() WHERE id = $1`,
      [subscription.id, attempts]
    );
    if (subscription.organization_id) {
      await pool.query(`UPDATE organizations SET subscription_status = 'suspended' WHERE id = $1`, [subscription.organization_id]);
    }
    await pool.query(
      `INSERT INTO subscription_events (subscription_id, event_type, from_status, to_status, details)
       VALUES ($1, 'payment_failed', $2, 'suspended', $3)`,
      [subscription.id, subscription.status, JSON.stringify({ reason, attempts, invoice_id: invoice.id, final: true })]
    );
    logger.warn('Subscription suspended after repeated payment failure', { subscriptionId: subscription.id, attempts });
    await notifyBilling(subscription.id, 'suspended', { invoice }).catch(() => {});
    return;
  }

  const backoff = RETRY_BACKOFF_DAYS[Math.min(attempts - 1, RETRY_BACKOFF_DAYS.length - 1)];
  const nextRetry = new Date();
  nextRetry.setDate(nextRetry.getDate() + backoff);

  await pool.query(
    `UPDATE subscriptions SET status = 'past_due', renewal_attempts = $2, next_retry_at = $3, updated_at = NOW() WHERE id = $1`,
    [subscription.id, attempts, nextRetry.toISOString()]
  );
  if (subscription.organization_id) {
    await pool.query(`UPDATE organizations SET subscription_status = 'past_due' WHERE id = $1`, [subscription.organization_id]);
  }
  await pool.query(
    `INSERT INTO subscription_events (subscription_id, event_type, from_status, to_status, details)
     VALUES ($1, 'payment_failed', $2, 'past_due', $3)`,
    [subscription.id, subscription.status, JSON.stringify({ reason, attempts, invoice_id: invoice.id, next_retry_at: nextRetry.toISOString() })]
  );
  logger.warn('Subscription payment failed — past_due, will retry', { subscriptionId: subscription.id, attempts, nextRetry });
  await notifyBilling(subscription.id, 'payment_failed', { invoice, nextRetry }).catch(() => {});
}

// =============================================================================
// Cron entry point
// =============================================================================

/**
 * Daily job: charge subscriptions whose period has ended, retry past_due ones
 * whose retry time has arrived, and expire those cancelled-at-period-end.
 */
export async function processDueRenewals(): Promise<{ renewed: number; failed: number; expired: number; scanned: number }> {
  const summary = { renewed: 0, failed: 0, expired: 0, scanned: 0 };

  // 1. Expire subscriptions that were cancelled-at-period-end and have now ended.
  const { rows: toExpire } = await pool.query(
    `SELECT id, organization_id FROM subscriptions
      WHERE cancelled_at IS NOT NULL
        AND status NOT IN ('expired', 'cancelled')
        AND current_period_end <= NOW()`
  );
  for (const row of toExpire) {
    await pool.query(`UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE id = $1`, [row.id]);
    if (row.organization_id) {
      await pool.query(`UPDATE organizations SET subscription_status = 'expired' WHERE id = $1`, [row.organization_id]);
    }
    await pool.query(
      `INSERT INTO subscription_events (subscription_id, event_type, to_status, details)
       VALUES ($1, 'expired', 'expired', '{"reason":"cancelled_period_ended"}')`,
      [row.id]
    );
    summary.expired++;
  }

  // 2. Active subs due for renewal + past_due subs due for a retry.
  const { rows: due } = await pool.query(
    `SELECT id FROM subscriptions
      WHERE cancelled_at IS NULL
        AND (
          (status = 'active'   AND current_period_end <= NOW())
          OR
          (status = 'past_due' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
        )
      ORDER BY current_period_end ASC
      LIMIT 500`
  );

  for (const row of due) {
    summary.scanned++;
    try {
      const result = await chargeRenewal(row.id);
      if (result.ok) summary.renewed++;
      else summary.failed++;
    } catch (err: any) {
      summary.failed++;
      logger.error('processDueRenewals: chargeRenewal threw', { subscriptionId: row.id, error: err?.message });
    }
  }

  logger.info('Subscription renewals processed', summary);
  return summary;
}

// =============================================================================
// Notifications + recipient resolution
// =============================================================================

async function lookupSubscriptionEmail(subscription: Subscription): Promise<string | null> {
  const r = await resolveBillingRecipient(subscription);
  return r?.email || null;
}

async function resolveBillingRecipient(
  subscription: Subscription
): Promise<{ userId: string; email: string | null; name: string | null; organizationId?: string } | null> {
  if (subscription.user_id) {
    const { rows } = await pool.query(
      `SELECT id, email, first_name, last_name FROM users WHERE id = $1`,
      [subscription.user_id]
    );
    if (rows[0]) {
      return {
        userId: rows[0].id,
        email: rows[0].email,
        name: [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || null,
        organizationId: subscription.organization_id,
      };
    }
  }
  if (subscription.organization_id) {
    const { rows } = await pool.query(
      `SELECT id, email, first_name, last_name FROM users
        WHERE organization_id = $1 AND is_active = TRUE
        ORDER BY CASE role WHEN 'firm_principal' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
        LIMIT 1`,
      [subscription.organization_id]
    );
    if (rows[0]) {
      return {
        userId: rows[0].id,
        email: rows[0].email,
        name: [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || null,
        organizationId: subscription.organization_id,
      };
    }
  }
  return null;
}

type BillingEvent = 'payment_succeeded' | 'payment_failed' | 'suspended' | 'payment_prompt';

async function notifyBilling(
  subscriptionId: string,
  event: BillingEvent,
  extra?: { invoice?: Invoice; nextRetry?: Date }
): Promise<void> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) return;
  const recipient = await resolveBillingRecipient(subscription);
  if (!recipient?.email && !recipient?.userId) return;

  const planName = subscription.plan?.name || 'your plan';
  const billingUrl = `${config.app.frontendUrl}/dashboard/billing`;

  let title = '';
  let body = '';
  let priority: 'low' | 'normal' | 'high' = 'normal';

  if (event === 'payment_succeeded') {
    title = `Payment received — ${planName}`;
    body = `Your ${planName} subscription has been renewed. Thank you!`;
  } else if (event === 'payment_failed') {
    const when = extra?.nextRetry ? ` We'll retry on ${extra.nextRetry.toDateString()}.` : '';
    title = `Payment failed — ${planName}`;
    body = `We couldn't charge your card for ${planName}.${when} Please update your payment method to avoid interruption.`;
    priority = 'high';
  } else if (event === 'suspended') {
    title = `Subscription suspended — ${planName}`;
    body = `After several failed payment attempts, your ${planName} subscription has been suspended. Pay the outstanding invoice to restore access.`;
    priority = 'high';
  } else if (event === 'payment_prompt') {
    title = `Approve your renewal — ${planName}`;
    body = `We've sent a mobile money approval request to your phone to renew ${planName}. Please approve it to keep your access uninterrupted — or pay securely via the link.`;
    priority = 'high';
  }

  await notify({
    recipients: {
      audience: 'staff',
      userId: recipient.userId,
      email: recipient.email,
      name: recipient.name,
    },
    category: 'finance',
    type: `subscription.${event}`,
    title,
    body,
    priority,
    sourceType: 'subscription',
    sourceId: subscriptionId,
    sourceUrl: billingUrl,
    organizationId: recipient.organizationId,
    channels: { inApp: true, email: event !== 'payment_succeeded' ? true : true },
    email: { subject: title, text: `${body}\n\nManage your subscription: ${billingUrl}` },
  });
}
