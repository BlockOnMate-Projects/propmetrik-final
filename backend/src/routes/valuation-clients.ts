import { Router } from 'express';
import { ValuationClientService } from '../services/valuation-engine/valuationClientService';
import { authenticate, requireOrganization } from '../middleware/auth';
import { requireServiceAccess } from '../middleware/serviceAccess';
import { notificationService } from '../../shared-services/notifications/unified';

const router = Router();
const clientService = new ValuationClientService();

// Middleware
router.use(authenticate);
router.use(requireServiceAccess('valuations'));
router.use(requireOrganization());

// List clients
router.get('/', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);

        console.log(`[GET /valuation-clients] UserOrg: ${req.user?.organizationId}, HeaderOrg: ${req.headers['x-organization-id']}`);

        // Validate UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!orgId || !uuidRegex.test(orgId)) {
            return res.status(400).json({ success: false, error: 'Invalid or missing Organization ID' });
        }

        const { limit, offset, search } = req.query;

        const clients = await clientService.listClients(
            orgId,
            limit ? parseInt(limit as string) : 50,
            offset ? parseInt(offset as string) : 0,
            search as string
        );

        res.json({ success: true, count: clients.length, clients });
    } catch (error: any) {
        console.error('CRITICAL ERROR in GET /valuation-clients:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});

// Get client details
router.get('/:id', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);
        if (!orgId || orgId === 'default') {
            if (process.env.NODE_ENV === 'development') {
                // Dev fallback
            } else {
                return res.status(400).json({ success: false, error: 'Invalid Org ID' });
            }
        }
        const client = await clientService.getClientById(req.params.id, orgId);
        res.json({ success: true, client });
    } catch (error: any) {
        res.status(404).json({ success: false, error: error.message });
    }
});

// Get client invoices
router.get('/:id/invoices', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);
        if (!orgId || orgId === 'default') {
            if (process.env.NODE_ENV !== 'development') {
                return res.status(400).json({ success: false, error: 'Invalid Org ID' });
            }
        }
        const invoices = await clientService.getClientInvoices(req.params.id, orgId);
        res.json({ success: true, invoices });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get client valuations
router.get('/:id/valuations', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);
        if (!orgId || orgId === 'default') {
            if (process.env.NODE_ENV !== 'development') {
                return res.status(400).json({ success: false, error: 'Invalid Org ID' });
            }
        }
        const valuations = await clientService.getClientValuations(req.params.id, orgId || '');
        res.json({ success: true, valuations });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create client
router.post('/', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);
        if (!orgId || orgId === 'default') {
            if (process.env.NODE_ENV === 'development') {
                // Dev fallback
            } else {
                return res.status(400).json({ success: false, error: 'Invalid Org ID' });
            }
        }
        const client = await clientService.createClient({
            organizationId: orgId,
            ...req.body
        });
        res.status(201).json({ success: true, client });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Update client
router.put('/:id', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);
        if (!orgId || orgId === 'default') {
            if (process.env.NODE_ENV === 'development') {
                // Dev fallback
            } else {
                return res.status(400).json({ success: false, error: 'Invalid Org ID' });
            }
        }
        const client = await clientService.updateClient(req.params.id, orgId, req.body);
        res.json({ success: true, client });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Delete client
router.delete('/:id', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);
        if (!orgId || orgId === 'default') {
            if (process.env.NODE_ENV === 'development') {
                // Dev fallback
            } else {
                return res.status(400).json({ success: false, error: 'Invalid Org ID' });
            }
        }
        await clientService.deleteClient(req.params.id, orgId);
        res.json({ success: true, message: 'Client deleted' });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Send email to a client
router.post('/:id/send-email', async (req, res) => {
    try {
        const orgId = req.user?.organizationId || (req.headers['x-organization-id'] as string);
        if (!orgId || orgId === 'default') {
            if (process.env.NODE_ENV !== 'development') {
                return res.status(400).json({ success: false, error: 'Invalid Org ID' });
            }
        }

        const client = await clientService.getClientById(req.params.id, orgId || '');
        const { subject, body: messageBody, to } = req.body;

        if (!subject || !messageBody) {
            return res.status(400).json({ success: false, error: 'Subject and body are required' });
        }

        const recipientEmail = to || client.email;
        if (!recipientEmail) {
            return res.status(400).json({ success: false, error: 'Client has no email address' });
        }

        const result = await notificationService.sendEmail({
            to: recipientEmail,
            subject,
            html: `
                <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #e5e5e5; padding: 32px;">
                    <div style="border-bottom: 1px solid #333; padding-bottom: 16px; margin-bottom: 24px;">
                        <h2 style="margin: 0; color: #f59e0b; font-size: 14px; letter-spacing: 2px;">PROPMETRIK</h2>
                    </div>
                    <div style="white-space: pre-wrap; line-height: 1.6; font-size: 14px;">
${messageBody}
                    </div>
                    <div style="border-top: 1px solid #333; padding-top: 16px; margin-top: 32px;">
                        <p style="color: #666; font-size: 11px; margin: 0;">PROPMETRIK Valuation Services</p>
                    </div>
                </div>
            `,
            text: messageBody,
        });

        if (result.success) {
            res.json({ success: true, message: 'Email sent successfully', messageId: result.messageId });
        } else {
            res.status(500).json({ success: false, error: result.error || 'Failed to send email' });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
