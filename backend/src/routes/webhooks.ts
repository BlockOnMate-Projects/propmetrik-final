/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from:
 * - WhatsApp Business API (message delivery, incoming messages)
 * - E-Sign Service (envelope completion, voided, expired)
 * - Google Calendar (event updates - future)
 * - Paystack (payment notifications - future)
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { whatsappService, WebhookPayload } from '../../shared-services/messaging/whatsappService';
import { logger } from '../utils/logger';
import { CompletionEvent, ESignSourceModule } from '../../shared-services/e-sign/integration/types';

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
    logger.warn('ESIGN_WEBHOOK_SECRET not set - skipping signature verification');
    return true; // Skip verification in development
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
      const { dealService } = await import('../services/crm-deal-management/dealService');
      if (sourceContext.entityType === 'deal') {
        await dealService.handleEsignCompletion(event);
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
// Paystack Webhooks — handled by /api/v1/pm/payments/webhook (propertyManagement.ts)
// Do NOT add Paystack webhook routes here. The canonical handler verifies
// signatures and processes events. See propertyManagement.ts.
// ============================================================================

// ============================================================================
// NOWPayments IPN (Instant Payment Notification) Webhook
// ============================================================================

/**
 * POST /api/v1/webhooks/nowpayments/ipn
 *
 * Receives payment status updates from NOWPayments.
 * Verifies HMAC-SHA512 signature, updates payment records,
 * and triggers downstream actions (escrow deposit, completion, etc.)
 *
 * IPN statuses: waiting → confirming → confirmed → sending → finished
 * Error statuses: failed, expired, refunded, partially_paid
 */
router.post('/nowpayments/ipn', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-nowpayments-sig'] as string;
    if (!signature) {
      logger.warn('NOWPayments IPN: missing signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');

    // Verify HMAC signature
    if (!nowPaymentsService.verifyIpnSignature(req.body, signature)) {
      logger.warn('NOWPayments IPN: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the callback
    const result = await nowPaymentsService.processIpnCallback(req.body);

    logger.info('NOWPayments IPN processed', {
      action: result.action,
      paymentReference: result.paymentReference,
      status: req.body.payment_status,
    });

    // If escrow deposit is needed, trigger it asynchronously
    if (result.action === 'escrow_deposit') {
      setImmediate(async () => {
        try {
          const { escrowPayoutService } = await import('../../shared-services/payments/crypto/escrowPayoutService');
          await escrowPayoutService.handleEscrowDeposit(result.paymentReference);
        } catch (err: any) {
          logger.error('Failed to handle escrow deposit', {
            reference: result.paymentReference,
            error: err.message,
          });
        }
      });
    }

    // For direct (non-escrow) completed payments, attest on-chain for audit trail.
    // Escrow payments already go through the smart contract, so they have on-chain records.
    if (result.action === 'completed') {
      setImmediate(async () => {
        try {
          const { attestationService } = await import('../../shared-services/payments/crypto/attestationService');
          const attestResult = await attestationService.attestOffChainPayment(result.paymentReference);
          if (!attestResult.success) {
            logger.warn('Off-chain payment attestation failed (non-blocking)', {
              reference: result.paymentReference,
              error: attestResult.error,
            });
          }
        } catch (err: any) {
          logger.error('Failed to attest off-chain payment (non-blocking)', {
            reference: result.paymentReference,
            error: err.message,
          });
        }
      });
    }

    // Always respond 200 to prevent retries
    res.status(200).json({ status: 'ok', action: result.action });
  } catch (error: any) {
    logger.error('NOWPayments IPN error', { error: error.message });
    // Still respond 200 to prevent infinite retries
    res.status(200).json({ status: 'error', message: error.message });
  }
});

export default router;
