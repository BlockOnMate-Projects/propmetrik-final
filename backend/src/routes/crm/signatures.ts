/**
 * CRM Signature Routes
 * 
 * Handles all e-signature operations including creating envelopes,
 * sending signature requests, cancelling, and reminding signers.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { signatureService, SignatureStatus } from '../../services/crm-deal-management';

const router = Router();

// ──────────────────────────────────────────────
// Signature Envelopes
// ──────────────────────────────────────────────

router.get('/signatures', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        deal_id: req.query.dealId as string | undefined,
        document_id: req.query.documentId as string | undefined,
        status: req.query.status as SignatureStatus | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100)
    };

    const result = await signatureService.listEnvelopes(organizationId, filters);
    res.json(result);
}));

router.post('/signatures', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const envelope = await signatureService.createSignatureEnvelope(organizationId, req.body, userId);
    res.status(201).json(envelope);
}));

router.get('/signatures/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const envelope = await signatureService.getEnvelopeById(req.params.id, organizationId);
    if (!envelope) {
        return res.status(404).json({ error: 'Signature envelope not found' });
    }
    res.json(envelope);
}));

router.post('/signatures/:id/send', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const envelope = await signatureService.sendSignatureRequest(req.params.id, organizationId, userId);
    if (!envelope) {
        return res.status(404).json({ error: 'Signature envelope not found' });
    }
    res.json(envelope);
}));

router.post('/signatures/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { reason } = req.body;
    const envelope = await signatureService.cancelEnvelope(req.params.id, organizationId, reason, userId);
    if (!envelope) {
        return res.status(404).json({ error: 'Signature envelope not found' });
    }
    res.json(envelope);
}));

router.post('/signatures/:id/remind', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    await signatureService.resendRequest(req.params.id, organizationId);
    res.json({ success: true });
}));

// Void an envelope (alias for cancel)
router.post('/signatures/:id/void', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { reason } = req.body;
    const envelope = await signatureService.cancelEnvelope(req.params.id, organizationId, reason || 'Voided', userId);
    if (!envelope) {
        return res.status(404).json({ error: 'Signature envelope not found' });
    }
    res.json(envelope);
}));

// Resend to a specific signer (delegates to resendRequest)
router.post('/signatures/:id/resend', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await signatureService.resendRequest(req.params.id, organizationId);
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Could not resend' });
    }
}));

export default router;
