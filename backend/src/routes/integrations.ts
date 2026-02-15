/**
 * Integration Routes
 * Phase 4 Sprint 8 - External Integrations API
 * 
 * Endpoints for:
 * - Mobile money payments (MTN MoMo, Vodafone Cash, AirtelTigo)
 * - Bank transfers
 * - Vendor verification (TIN, SSNIT)
 * - Webhooks
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate as authenticateToken } from '../middleware/auth';
import { 
  integrationService,
  mobileMoneyService,
  bankTransferService,
  vendorVerificationService,
  type MobileMoneyPaymentRequest,
  type BankTransferRequest,
} from '../services/project-management/integrationService';

const router = Router();

// Express-validator middleware handler
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// =====================================================
// MOBILE MONEY ENDPOINTS
// =====================================================

/**
 * Get supported mobile money providers
 */
router.get('/mobile-money/providers', (req: Request, res: Response) => {
  try {
    const providers = integrationService.getMobileMoneyProviders();
    res.json(providers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Initiate mobile money payment
 */
router.post(
  '/mobile-money/pay',
  authenticateToken,
  [
    body('provider').isIn(['mtn_momo', 'vodafone_cash', 'airteltigo_money']),
    body('phoneNumber').isMobilePhone('any'),
    body('amount').isFloat({ min: 0.01 }),
    body('reference').notEmpty().isString(),
    body('description').notEmpty().isString(),
    body('callbackUrl').optional().isURL(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const request: MobileMoneyPaymentRequest = req.body;
      const payment = await mobileMoneyService.requestPayment(request);
      res.status(201).json(payment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get mobile money payment status
 */
router.get(
  '/mobile-money/payments/:paymentId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;
      const payment = await mobileMoneyService.getPaymentStatus(paymentId);
      
      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      
      res.json(payment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Mobile money webhook callback (unauthenticated - uses signature verification)
 */
router.post(
  '/mobile-money/webhooks/:provider',
  async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const payload = req.body;
      
      // Log webhook
      // TODO: Verify webhook signature based on provider
      
      await mobileMoneyService.handleCallback(
        provider as 'mtn_momo' | 'vodafone_cash' | 'airteltigo_money',
        payload
      );
      
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// =====================================================
// BANK TRANSFER ENDPOINTS
// =====================================================

/**
 * Get list of Ghana banks
 */
router.get('/banks', (req: Request, res: Response) => {
  try {
    const banks = integrationService.getGhanaBanks();
    res.json(banks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Verify bank account
 */
router.post(
  '/banks/verify',
  authenticateToken,
  [
    body('accountNumber').notEmpty().isString(),
    body('bankCode').notEmpty().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { accountNumber, bankCode } = req.body;
      const result = await bankTransferService.verifyAccount(accountNumber, bankCode);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Initiate bank transfer
 */
router.post(
  '/banks/transfer',
  authenticateToken,
  [
    body('bankCode').notEmpty().isString(),
    body('accountNumber').notEmpty().isString(),
    body('accountName').notEmpty().isString(),
    body('amount').isFloat({ min: 0.01 }),
    body('reference').notEmpty().isString(),
    body('narration').notEmpty().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const request: BankTransferRequest = req.body;
      const result = await bankTransferService.initiateTransfer(request);
      
      if (result.status === 'failed') {
        return res.status(400).json(result);
      }
      
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =====================================================
// VENDOR VERIFICATION ENDPOINTS
// =====================================================

/**
 * Verify TIN number
 */
router.post(
  '/vendors/verify-tin',
  authenticateToken,
  [
    body('tinNumber').notEmpty().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { tinNumber } = req.body;
      const result = await vendorVerificationService.verifyTIN(tinNumber);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Verify SSNIT number
 */
router.post(
  '/vendors/verify-ssnit',
  authenticateToken,
  [
    body('ssnitNumber').notEmpty().isString(),
    body('employerName').optional().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { ssnitNumber, employerName } = req.body;
      const result = await vendorVerificationService.verifySSNIT(ssnitNumber, employerName);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Run comprehensive vendor compliance check
 */
router.post(
  '/vendors/:vendorId/compliance-check',
  authenticateToken,
  [
    param('vendorId').isUUID(),
    body('tinNumber').optional().isString(),
    body('ssnitNumber').optional().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { vendorId } = req.params;
      const { tinNumber, ssnitNumber } = req.body;
      
      const result = await vendorVerificationService.checkVendorCompliance(
        vendorId,
        tinNumber,
        ssnitNumber
      );
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =====================================================
// PAYSTACK WEBHOOK — handled by /api/v1/pm/payments/webhook (propertyManagement.ts)
// Do NOT add Paystack webhook routes here. The canonical handler verifies
// signatures and processes events. See propertyManagement.ts.
// =====================================================

export default router;
