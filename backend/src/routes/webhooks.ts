/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from:
 * - NOWPayments (IPN - Instant Payment Notifications for crypto payments)
 * - WhatsApp Business API (message delivery, incoming messages)
 * - E-Sign Service (envelope completion, voided, expired)
 * - Google Calendar (event updates - future)
 * - Paystack (payment notifications - future)
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { whatsappService, WebhookPayload } from '../../shared-services/messaging/whatsappService';
import { paystackService } from '../services/property-management/payment/paystackService';
import { paymentProcessor } from '../services/property-management/payment/paymentProcessor';
import {
  isSubscriptionReference,
  reconcileSubscriptionPayment,
} from '../../shared-services/payments/subscriptions/subscriptionBillingService';
import { logger } from '../utils/logger';
import { CompletionEvent, ESignSourceModule } from '../../shared-services/e-sign/integration/types';
import * as identityVerificationService from '../services/identity/identityVerificationService';

const router = Router();

// E-Sign webhook secret for HMAC verification
const ESIGN_WEBHOOK_SECRET = process.env.ESIGN_WEBHOOK_SECRET || '';

// ============================================================================
// E-Sign Webhooks
// ============================================================================

/**
 * Verify E-Sign webhook signature using HMAC-SHA256
 */
function verifyESignWebhookSignature(req: Request): boolean {
  if (!ESIGN_WEBHOOK_SECRET) {
    // SECURITY: fail CLOSED in production. An unset secret must never allow an
    // unverified webhook to mutate signing state; only skip outside production.
    if (process.env.NODE_ENV === 'production') {
      logger.error('ESIGN_WEBHOOK_SECRET not set — rejecting webhook in production');
      return false;
    }
    logger.warn('ESIGN_WEBHOOK_SECRET not set - skipping signature verification (non-production only)');
    return true;
  }

  const signature = req.headers['x-esign-signature'] as string;
  const timestamp = req.headers['x-esign-timestamp'] as string;

  if (!signature || !timestamp) {
    logger.warn('Missing e-sign webhook signature headers');
    return false;
  }

  // Check timestamp is within 5 minutes to prevent replay attacks
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > 300) {
    logger.warn('E-Sign webhook timestamp too old', { timestamp, now });
    return false;
  }

  // Compute expected signature
  const payload = JSON.stringify(req.body);
  const signatureData = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', ESIGN_WEBHOOK_SECRET)
    .update(signatureData)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    logger.warn('E-Sign webhook signature mismatch');
  }

  return isValid;
}

/**
 * Route completion event to appropriate service handler
 */
async function routeESignCompletion(event: CompletionEvent): Promise<void> {
  const { sourceContext } = event;
  
  logger.info('Routing e-sign completion event', {
    module: sourceContext.module,
    entityType: sourceContext.entityType,
    entityId: sourceContext.entityId,
    envelopeId: event.envelope.id,
  });

  // Import handlers dynamically to avoid circular dependencies
  switch (sourceContext.module as ESignSourceModule) {
    case 'property_management': {
      const { tenancyService } = await import('../services/property-management/leases/tenancyService');
      if (sourceContext.entityType === 'tenancy') {
        await tenancyService.handleEsignCompletion(event);
      }
      logger.info('Property management e-sign completion processed', {
        entityType: sourceContext.entityType,
        entityId: sourceContext.entityId,
      });
      break;
    }
    case 'valuation': {
      const { approvalService } = await import('../services/valuation-engine/approvalService');
      if (sourceContext.entityType === 'valuation_report') {
        await approvalService.handleEsignCompletion(event);
      }
      logger.info('Valuation e-sign completion processed', {
        entityType: sourceContext.entityType,
        entityId: sourceContext.entityId,
      });
      break;
    }
    case 'crm': {
      if (sourceContext.entityType === 'deal') {
        const { dealService } = await import('../services/crm-deal-management/dealService');
        await dealService.handleEsignCompletion(event);
      } else if (sourceContext.entityType === 'signature_envelope') {
        const { signatureService } = await import('../services/crm-deal-management/signatureService');
        await signatureService.handleEsignCompletion(event);
      }
      logger.info('CRM e-sign completion processed', {
        entityType: sourceContext.entityType,
        entityId: sourceContext.entityId,
      });
      break;
    }
    case 'project_management': {
      const { changeOrderService } = await import('../services/project-management/changeOrderService');
      const { contractorService } = await import('../services/project-management/contractorService');
      const { drawService } = await import('../services/project-management/drawService');
      
      switch (sourceContext.entityType) {
        case 'change_order':
          await changeOrderService.handleEsignCompletion(event);
          break;
        case 'contractor_contract':
          await contractorService.handleEsignCompletion(event);
          break;
        case 'draw_request':
          await drawService.handleEsignCompletion(event);
          break;
        default:
          logger.warn('Unknown project management entity type for e-sign', {
            entityType: sourceContext.entityType,
          });
      }
      
      logger.info('Project management e-sign completion processed', {
        entityType: sourceContext.entityType,
        entityId: sourceContext.entityId,
      });
      break;
    }
    default:
      logger.warn('Unknown source module for e-sign completion', {
        module: sourceContext.module,
      });
  }
}

/**
 * E-Sign Webhook Handler (POST)
 * Receives envelope completion, voided, and expired events from e-sign service
 */
router.post('/esign/completion', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    if (!verifyESignWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body as CompletionEvent;
    
    logger.info('E-Sign webhook received', {
      event: event.event,
      envelopeId: event.envelope?.id,
      sourceModule: event.sourceContext?.module,
    });

    // Acknowledge receipt immediately
    res.status(200).json({ received: true });

    // Process event asynchronously
    try {
      await routeESignCompletion(event);
    } catch (error) {
      logger.error('E-Sign completion processing failed', {
        error,
        envelopeId: event.envelope?.id,
        sourceModule: event.sourceContext?.module,
      });
      // Event will be retried by e-sign service
    }
  } catch (error) {
    logger.error('E-Sign webhook error', { error });
    res.status(200).json({ received: true }); // Acknowledge to prevent infinite retries
  }
});

// ============================================================================
// WhatsApp Webhooks
// ============================================================================

/**
 * WhatsApp Webhook Verification (GET)
 * Called by Meta when setting up the webhook
 */
router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  const result = whatsappService.verifyWebhook(mode, token, challenge);

  if (result) {
    res.status(200).send(result);
  } else {
    res.status(403).send('Verification failed');
  }
});

/**
 * WhatsApp Webhook Handler (POST)
 * Receives incoming messages and delivery status updates
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const payload = req.body as WebhookPayload;

    // Always respond 200 immediately to acknowledge receipt
    res.status(200).send('EVENT_RECEIVED');

    // Process webhook asynchronously
    await whatsappService.processWebhook(payload);
  } catch (error) {
    logger.error('WhatsApp webhook processing error', { error });
    // Still respond 200 to prevent retries
    res.status(200).send('EVENT_RECEIVED');
  }
});

// ============================================================================
// NOWPayments IPN (Instant Payment Notification) Webhook
// ============================================================================

/**
 * POST /api/v1/webhooks/nowpayments/ipn
 * 
 * Receives payment status change notifications from NOWPayments.
 * NOWPayments sends IPNs when a payment status changes:
 *   waiting → confirming → confirmed → sending → finished
 *   waiting → failed / expired / refunded
 *
 * IPN payloads are signed with HMAC-SHA512 using the IPN secret.
 * We verify the signature before processing.
 *
 * On 'finished':
 *   - Direct mode: marks payment_transactions as 'success', triggers fee collection
 *   - Escrow mode: triggers escrow deposit into the smart contract
 */
router.post('/nowpayments/ipn', async (req: Request, res: Response) => {
  try {
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');

    // 1. Verify IPN signature
    const signature = req.headers['x-nowpayments-sig'] as string;
    if (!signature) {
      logger.warn('NOWPayments IPN: missing x-nowpayments-sig header');
      // SECURITY: the unsigned-sandbox bypass is only permitted OUTSIDE production.
      // In production a missing signature is always rejected, even if the sandbox
      // flag is somehow set.
      const isSandbox = process.env.NOWPAYMENTS_SANDBOX === 'true' && process.env.NODE_ENV !== 'production';
      if (!isSandbox) {
        return res.status(400).json({ error: 'Missing IPN signature' });
      }
      logger.warn('NOWPayments IPN: proceeding without signature (sandbox mode)');
    } else {
      const isValid = nowPaymentsService.verifyIpnSignature(req.body, signature);
      if (!isValid) {
        logger.error('NOWPayments IPN: INVALID signature — potential replay/forgery attack', {
          paymentId: req.body?.payment_id,
          orderId: req.body?.order_id,
        });
        return res.status(403).json({ error: 'Invalid IPN signature' });
      }
    }

    // 2. Extract payload
    const payload = req.body;
    logger.info('NOWPayments IPN received', {
      paymentId: payload.payment_id,
      status: payload.payment_status,
      orderId: payload.order_id,
      actuallyPaid: payload.actually_paid,
      outcomeAmount: payload.outcome_amount,
      outcomeCurrency: payload.outcome_currency,
    });

    // 3. Process the callback (updates DB, triggers downstream actions)
    const result = await nowPaymentsService.processIpnCallback(payload);

    logger.info('NOWPayments IPN processed', {
      action: result.action,
      paymentReference: result.paymentReference,
    });

    // 4. Handle downstream actions
    if (result.action === 'escrow_deposit') {
      // Trigger escrow deposit into the smart contract
      try {
        const { escrowPayoutService } = await import('../../shared-services/payments/crypto/escrowPayoutService');
        await escrowPayoutService.handleEscrowDeposit(result.paymentReference);
        logger.info('Escrow deposit triggered', { paymentReference: result.paymentReference });
      } catch (escrowErr: any) {
        logger.error('Escrow deposit failed (will retry via polling)', {
          paymentReference: result.paymentReference,
          error: escrowErr.message,
          stack: escrowErr.stack,
        });
      }
    }

    // 5. For completed rent payments, record in rent_payments + apply to schedules
    if (result.action === 'completed' || result.action === 'escrow_deposit') {
      try {
        const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');
        const rentResult = await paymentProcessor.recordCryptoRentCompletion(result.paymentReference);
        logger.info('Crypto rent completion (IPN)', {
          paymentReference: result.paymentReference,
          recorded: rentResult.recorded,
          schedulesUpdated: rentResult.schedulesUpdated,
        });
      } catch (rentErr: any) {
        logger.error('Crypto rent completion failed (IPN, non-blocking)', {
          paymentReference: result.paymentReference,
          error: rentErr.message,
        });
      }
    }

    // 6. For completed PM invoice crypto payments, mark the invoice paid + link
    //    the ledger. The IPN is the source of truth (the client confirm-crypto
    //    call only mirrors this).
    if (result.action === 'completed' || result.action === 'escrow_deposit') {
      try {
        const { pool } = await import('../database');
        const link = await pool.query(
          `SELECT domain_record_id FROM nowpayments_payments
             WHERE payment_reference = $1 AND domain_record_type = 'project_invoice'`,
          [result.paymentReference]
        );
        const invoiceId = link.rows[0]?.domain_record_id;
        if (invoiceId) {
          const { invoiceService } = await import('../services/project-management/invoiceService');
          const { alreadyPaid } = await invoiceService.confirmPayment(invoiceId, result.paymentReference, {
            method: 'crypto', channel: 'crypto', provider: 'nowpayments',
          });
          logger.info('PM invoice reconciled via NOWPayments IPN', {
            paymentReference: result.paymentReference, invoiceId, alreadyPaid,
          });
        }
      } catch (invErr: any) {
        logger.error('PM invoice crypto reconciliation failed (IPN, non-blocking)', {
          paymentReference: result.paymentReference, error: invErr.message,
        });
      }
    }

    // Always return 200 to NOWPayments (they retry on non-200)
    res.status(200).json({ status: 'ok', action: result.action });
  } catch (error: any) {
    logger.error('NOWPayments IPN webhook error', {
      error: error.message,
      stack: error.stack,
      body: JSON.stringify(req.body).substring(0, 500),
    });
    console.error('NOWPayments IPN ERROR:', error.message, error.stack);
    // Still return 200 to prevent NOWPayments from retrying on our app errors
    res.status(200).json({ status: 'error', message: error.message });
  }
});

// ============================================================================
// Paystack Webhooks (Future)
// ============================================================================

/**
 * Paystack Webhook Handler
 * Receives payment notifications
 */
router.post('/paystack', async (req: Request, res: Response) => {
  try {
    // 1. Verify the request genuinely came from Paystack (HMAC-SHA512 of the body)
    const signature = req.headers['x-paystack-signature'] as string;
    if (!signature || !paystackService.verifyWebhookSignature(signature, req.body)) {
      logger.warn('Paystack webhook rejected: invalid or missing signature');
      return res.status(401).send('Invalid signature');
    }

    const event = req.body?.event as string;
    const reference = req.body?.data?.reference as string | undefined;
    logger.info('Paystack webhook received', { event, reference });

    // 2. On a successful charge, record + reconcile via the idempotent verify path.
    //    verifyAndRecordPayment re-verifies with Paystack, is safe to call twice
    //    (ledger/rent_payment idempotency), and carries the locked FX through metadata.
    if (event === 'charge.success' && reference) {
      if (isSubscriptionReference(reference)) {
        // SaaS subscription charge (signup or renewal) → capture authorization,
        // mark invoice paid, activate. Idempotent with the verify endpoint.
        reconcileSubscriptionPayment(reference).catch((err) =>
          logger.error('Paystack webhook: reconcileSubscriptionPayment failed', {
            reference,
            error: (err as Error).message,
          })
        );
      } else {
        // Rent / PM invoice payment.
        paymentProcessor
          .verifyAndRecordPayment(reference)
          .catch((err) =>
            logger.error('Paystack webhook: verifyAndRecordPayment failed', {
              reference,
              error: (err as Error).message,
            })
          );
      }
    }

    // Acknowledge immediately so Paystack does not retry; processing is async above.
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Paystack webhook error', { error });
    res.status(200).send('OK');
  }
});

// ============================================================================
// Didit Identity Verification (KYC) webhook — Marketplace Trust, Gate B
// HMAC-SHA256 over the RAW body (x-signature) + x-timestamp replay window.
// ============================================================================
router.post('/didit', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody instanceof Buffer
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body);
    const signature = req.headers['x-signature'] as string | undefined;
    const timestamp = req.headers['x-timestamp'] as string | undefined;

    if (!identityVerificationService.verifySignature(rawBody, signature, timestamp)) {
      logger.warn('Didit webhook: invalid signature or stale timestamp');
      res.status(401).json({ error: 'invalid signature' });
      return;
    }

    await identityVerificationService.handleWebhook(req.body);
    res.status(200).json({ ok: true });
  } catch (error: any) {
    // 200 to avoid a retry storm; the failure is logged for follow-up.
    logger.error('Didit webhook error', { error: error?.message });
    res.status(200).json({ ok: false });
  }
});

export default router;
