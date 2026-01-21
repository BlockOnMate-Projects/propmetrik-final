/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from:
 * - WhatsApp Business API (message delivery, incoming messages)
 * - Google Calendar (event updates - future)
 * - Paystack (payment notifications - future)
 */

import { Router, Request, Response } from 'express';
import { whatsappService, WebhookPayload } from '../../shared-services/messaging/whatsappService';
import { logger } from '../utils/logger';

const router = Router();

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
// Paystack Webhooks (Future)
// ============================================================================

/**
 * Paystack Webhook Handler
 * Receives payment notifications
 */
router.post('/paystack', async (req: Request, res: Response) => {
  try {
    // TODO: Verify Paystack signature
    // TODO: Process payment events
    
    logger.info('Paystack webhook received', { event: req.body.event });
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Paystack webhook error', { error });
    res.status(200).send('OK');
  }
});

export default router;
