/**
 * Deal Invoices (CRM billing → AR) routes.
 * Mounted under /api/v1/crm. Standalone /invoices is finance-gated in index.ts;
 * the deal-scoped /deals/:id/invoices ride along with normal deal access.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { dealInvoiceService } from '../../services/crm-deal-management/dealInvoiceService';

const router = Router();

// ── Collection-level (order: static paths before :id) ──

router.get('/invoices/summary', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    res.json({ summary: await dealInvoiceService.summary(organizationId) });
}));

router.get('/invoices/ar-aging', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    res.json({ aging: await dealInvoiceService.arAging(organizationId) });
}));

router.get('/invoices', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const invoices = await dealInvoiceService.list(organizationId, {
        status: req.query.status as string | undefined,
        overdue: req.query.overdue === 'true',
    });
    res.json({ invoices });
}));

router.post('/invoices', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'A positive amount is required' });
    }
    const invoice = await dealInvoiceService.create(organizationId, {
        deal_id: req.body.deal_id,
        client_name: req.body.client_name,
        contact_id: req.body.contact_id,
        description: req.body.description,
        amount,
        currency: req.body.currency,
        due_date: req.body.due_date,
        issue_date: req.body.issue_date,
        notes: req.body.notes,
        created_by: userId || undefined,
    });
    res.status(201).json({ invoice });
}));

router.get('/invoices/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const invoice = await dealInvoiceService.getById(req.params.id, organizationId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ invoice });
}));

router.post('/invoices/:id/send', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const invoice = await dealInvoiceService.send(req.params.id, organizationId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found or not sendable' });
    res.json({ invoice });
}));

router.post('/invoices/:id/record-payment', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'A positive payment amount is required' });
    }
    const invoice = await dealInvoiceService.recordPayment(req.params.id, organizationId, {
        amount,
        payment_method: req.body.payment_method,
        payment_reference: req.body.payment_reference,
        recorded_by: userId || undefined,
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found or cancelled' });
    res.json({ invoice });
}));

router.post('/invoices/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const invoice = await dealInvoiceService.cancel(req.params.id, organizationId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found or already paid' });
    res.json({ invoice });
}));

// ── Deal-scoped ──

router.get('/deals/:id/invoices', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const invoices = await dealInvoiceService.list(organizationId, { deal_id: req.params.id });
    res.json({ invoices });
}));

router.post('/deals/:id/invoices', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'A positive amount is required' });
    }
    const invoice = await dealInvoiceService.create(organizationId, {
        deal_id: req.params.id,
        client_name: req.body.client_name,
        description: req.body.description,
        amount,
        due_date: req.body.due_date,
        notes: req.body.notes,
        created_by: userId || undefined,
    });
    res.status(201).json({ invoice });
}));

export default router;
