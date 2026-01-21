/**
 * Messaging API Routes
 * Phase 5.7 Week 3 - WhatsApp Business API Integration
 * 
 * Base path: /api/v1/messaging
 * 
 * Provides endpoints for:
 * - Sending WhatsApp messages (text, templates, documents)
 * - Viewing message history
 * - Managing templates
 * - Getting delivery status
 */

import { Router, Request, Response, NextFunction } from 'express';
import { whatsappService, WhatsAppMessage } from '../../shared-services/messaging/whatsappService';
import db from '../database';
import config from '../config';
import { logger } from '../utils/logger';

const router = Router();

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function getOrganizationId(req: Request): Promise<string> {
    let id = (req as any).user?.organizationId;
    if (!id) {
        id = req.headers['x-organization-id'] as string;
    }
    if (!id && config.app.env === 'development') {
        const result = await db.query('SELECT id FROM organizations LIMIT 1');
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
    }
    return id || '00000000-0000-0000-0000-000000000000';
}

async function getUserId(req: Request): Promise<string | undefined> {
    return (req as any).user?.id;
}

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// =====================================================
// MESSAGE LOG TABLE (if not exists)
// =====================================================
// This should ideally be in a migration, but including here for completeness
const ensureMessageLogTable = async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Message details
                wa_message_id VARCHAR(100) UNIQUE,
                direction VARCHAR(20) NOT NULL, -- inbound, outbound
                
                -- Participants
                from_phone VARCHAR(20),
                to_phone VARCHAR(20) NOT NULL,
                contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
                
                -- Content
                message_type VARCHAR(50) NOT NULL, -- text, template, document, image
                content TEXT,
                template_name VARCHAR(100),
                media_url TEXT,
                
                -- Status
                status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, read, failed
                error_message TEXT,
                
                -- Related entities
                deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
                
                -- Timestamps
                sent_at TIMESTAMPTZ,
                delivered_at TIMESTAMPTZ,
                read_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by UUID REFERENCES users(id)
            )
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org ON whatsapp_messages(organization_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact ON whatsapp_messages(contact_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_deal ON whatsapp_messages(deal_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(to_phone)');
    } catch (error) {
        logger.error('Failed to ensure whatsapp_messages table', { error });
    }
};
ensureMessageLogTable();

// =====================================================
// SEND MESSAGES
// =====================================================

/**
 * POST /send
 * Send a text message via WhatsApp
 */
router.post('/send', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { phone_number, message, contact_id, deal_id } = req.body;

    if (!phone_number || !message) {
        return res.status(400).json({ error: 'phone_number and message are required' });
    }

    // Format phone number (remove any non-digits, ensure country code)
    const formattedPhone = phone_number.replace(/\D/g, '');
    
    try {
        // Send via WhatsApp
        const response = await whatsappService.sendText(formattedPhone, message);

        // Log the message
        await db.query(`
            INSERT INTO whatsapp_messages (
                organization_id, wa_message_id, direction, to_phone,
                contact_id, deal_id, message_type, content, status, 
                sent_at, created_by
            ) VALUES ($1, $2, 'outbound', $3, $4, $5, 'text', $6, 'sent', NOW(), $7)
        `, [
            organizationId,
            response.messages[0]?.id,
            formattedPhone,
            contact_id || null,
            deal_id || null,
            message,
            userId,
        ]);

        res.json({
            success: true,
            message_id: response.messages[0]?.id,
            wa_id: response.contacts[0]?.wa_id,
        });
    } catch (error: any) {
        logger.error('Failed to send WhatsApp message', { error, phone_number });
        
        // Log failed attempt
        await db.query(`
            INSERT INTO whatsapp_messages (
                organization_id, direction, to_phone, contact_id, deal_id,
                message_type, content, status, error_message, created_by
            ) VALUES ($1, 'outbound', $2, $3, $4, 'text', $5, 'failed', $6, $7)
        `, [
            organizationId,
            formattedPhone,
            contact_id || null,
            deal_id || null,
            message,
            error.message,
            userId,
        ]);

        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.message,
        });
    }
}));

/**
 * POST /send-template
 * Send a template message via WhatsApp
 */
router.post('/send-template', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { phone_number, template_name, language, parameters, contact_id, deal_id } = req.body;

    if (!phone_number || !template_name) {
        return res.status(400).json({ error: 'phone_number and template_name are required' });
    }

    const formattedPhone = phone_number.replace(/\D/g, '');

    try {
        const response = await whatsappService.sendTemplate(
            formattedPhone,
            template_name,
            language || 'en',
            parameters || []
        );

        await db.query(`
            INSERT INTO whatsapp_messages (
                organization_id, wa_message_id, direction, to_phone,
                contact_id, deal_id, message_type, template_name, 
                content, status, sent_at, created_by
            ) VALUES ($1, $2, 'outbound', $3, $4, $5, 'template', $6, $7, 'sent', NOW(), $8)
        `, [
            organizationId,
            response.messages[0]?.id,
            formattedPhone,
            contact_id || null,
            deal_id || null,
            template_name,
            JSON.stringify(parameters),
            userId,
        ]);

        res.json({
            success: true,
            message_id: response.messages[0]?.id,
        });
    } catch (error: any) {
        logger.error('Failed to send WhatsApp template', { error, template_name });
        res.status(500).json({ error: 'Failed to send template', details: error.message });
    }
}));

/**
 * POST /send-document
 * Send a document via WhatsApp
 */
router.post('/send-document', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { phone_number, document_url, filename, caption, contact_id, deal_id } = req.body;

    if (!phone_number || !document_url || !filename) {
        return res.status(400).json({ error: 'phone_number, document_url, and filename are required' });
    }

    const formattedPhone = phone_number.replace(/\D/g, '');

    try {
        const response = await whatsappService.sendDocument(
            formattedPhone,
            document_url,
            filename,
            caption
        );

        await db.query(`
            INSERT INTO whatsapp_messages (
                organization_id, wa_message_id, direction, to_phone,
                contact_id, deal_id, message_type, content, media_url,
                status, sent_at, created_by
            ) VALUES ($1, $2, 'outbound', $3, $4, $5, 'document', $6, $7, 'sent', NOW(), $8)
        `, [
            organizationId,
            response.messages[0]?.id,
            formattedPhone,
            contact_id || null,
            deal_id || null,
            caption || filename,
            document_url,
            userId,
        ]);

        res.json({
            success: true,
            message_id: response.messages[0]?.id,
        });
    } catch (error: any) {
        logger.error('Failed to send WhatsApp document', { error });
        res.status(500).json({ error: 'Failed to send document', details: error.message });
    }
}));

// =====================================================
// MESSAGE HISTORY
// =====================================================

/**
 * GET /messages
 * Get message history
 */
router.get('/messages', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    
    const contactId = req.query.contact_id as string;
    const dealId = req.query.deal_id as string;
    const phone = req.query.phone as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let whereClause = 'WHERE wm.organization_id = $1';
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (contactId) {
        whereClause += ` AND wm.contact_id = $${paramIndex++}`;
        params.push(contactId);
    }
    if (dealId) {
        whereClause += ` AND wm.deal_id = $${paramIndex++}`;
        params.push(dealId);
    }
    if (phone) {
        whereClause += ` AND (wm.to_phone = $${paramIndex} OR wm.from_phone = $${paramIndex})`;
        params.push(phone.replace(/\D/g, ''));
        paramIndex++;
    }

    const countResult = await db.query(
        `SELECT COUNT(*) FROM whatsapp_messages wm ${whereClause}`,
        params
    );

    params.push(limit, offset);
    const result = await db.query(`
        SELECT 
            wm.*,
            c.first_name || ' ' || c.last_name AS contact_name,
            u.display_name AS sent_by_name
        FROM whatsapp_messages wm
        LEFT JOIN contacts c ON wm.contact_id = c.id
        LEFT JOIN users u ON wm.created_by = u.id
        ${whereClause}
        ORDER BY wm.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, params);

    res.json({
        messages: result.rows,
        total: parseInt(countResult.rows[0].count),
    });
}));

/**
 * GET /messages/:id
 * Get a specific message
 */
router.get('/messages/:id', asyncHandler(async (req: Request, res: Response) => {
    const result = await db.query(`
        SELECT 
            wm.*,
            c.first_name || ' ' || c.last_name AS contact_name,
            u.display_name AS sent_by_name
        FROM whatsapp_messages wm
        LEFT JOIN contacts c ON wm.contact_id = c.id
        LEFT JOIN users u ON wm.created_by = u.id
        WHERE wm.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: result.rows[0] });
}));

/**
 * GET /conversations
 * Get conversation list (grouped by contact/phone)
 */
router.get('/conversations', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await db.query(`
        SELECT 
            COALESCE(wm.contact_id::text, wm.to_phone) AS conversation_id,
            wm.contact_id,
            wm.to_phone AS phone_number,
            c.first_name || ' ' || c.last_name AS contact_name,
            c.avatar_url,
            COUNT(*) AS message_count,
            MAX(wm.created_at) AS last_message_at,
            (
                SELECT content 
                FROM whatsapp_messages 
                WHERE COALESCE(contact_id::text, to_phone) = COALESCE(wm.contact_id::text, wm.to_phone)
                ORDER BY created_at DESC 
                LIMIT 1
            ) AS last_message,
            COUNT(CASE WHEN wm.direction = 'inbound' AND wm.status != 'read' THEN 1 END) AS unread_count
        FROM whatsapp_messages wm
        LEFT JOIN contacts c ON wm.contact_id = c.id
        WHERE wm.organization_id = $1
        GROUP BY wm.contact_id, wm.to_phone, c.first_name, c.last_name, c.avatar_url
        ORDER BY MAX(wm.created_at) DESC
        LIMIT $2
    `, [organizationId, limit]);

    res.json({ conversations: result.rows });
}));

// =====================================================
// TEMPLATES
// =====================================================

/**
 * GET /templates
 * Get available WhatsApp templates
 */
router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
    try {
        // In production, this would fetch from WhatsApp Business API
        // For now, return predefined CRM templates
        const templates = [
            {
                name: 'property_viewing_reminder',
                language: 'en',
                category: 'UTILITY',
                description: 'Remind contacts about upcoming property viewings',
                components: [
                    { type: 'BODY', text: 'Hi {{1}}, just a reminder about your property viewing at {{2}} scheduled for {{3}}. Please confirm your attendance.' }
                ],
            },
            {
                name: 'deal_update',
                language: 'en',
                category: 'UTILITY',
                description: 'Update contacts about deal progress',
                components: [
                    { type: 'BODY', text: 'Hi {{1}}, we have an update on your property deal. {{2}}. Please contact us if you have any questions.' }
                ],
            },
            {
                name: 'document_shared',
                language: 'en',
                category: 'UTILITY',
                description: 'Notify contacts about shared documents',
                components: [
                    { type: 'BODY', text: 'Hi {{1}}, a new document "{{2}}" has been shared with you. Please review it at your earliest convenience.' }
                ],
            },
            {
                name: 'welcome_message',
                language: 'en',
                category: 'MARKETING',
                description: 'Welcome new leads/contacts',
                components: [
                    { type: 'BODY', text: 'Welcome to {{1}}! We\'re excited to help you find your perfect property. Reply to this message if you have any questions.' }
                ],
            },
        ];

        res.json({ templates });
    } catch (error: any) {
        logger.error('Failed to fetch templates', { error });
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
}));

// =====================================================
// STATUS & HEALTH
// =====================================================

/**
 * GET /status
 * Check WhatsApp API status
 */
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
    const isConfigured = whatsappService.isConfigured();
    
    res.json({
        configured: isConfigured,
        status: isConfigured ? 'ready' : 'not_configured',
        message: isConfigured 
            ? 'WhatsApp Business API is configured and ready'
            : 'WhatsApp Business API credentials are not configured',
    });
}));

/**
 * GET /stats
 * Get messaging statistics
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    
    const result = await db.query(`
        SELECT 
            COUNT(*) AS total_messages,
            COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS sent,
            COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS received,
            COUNT(CASE WHEN status = 'delivered' THEN 1 END) AS delivered,
            COUNT(CASE WHEN status = 'read' THEN 1 END) AS read,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed,
            COUNT(DISTINCT contact_id) AS unique_contacts,
            COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h,
            COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS last_7d
        FROM whatsapp_messages
        WHERE organization_id = $1
    `, [organizationId]);

    res.json({ stats: result.rows[0] });
}));

// =====================================================
// QUICK ACTIONS FOR CONTACTS/DEALS
// =====================================================

/**
 * POST /contacts/:id/send-quick
 * Send a quick message to a contact
 */
router.post('/contacts/:id/send-quick', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const contactId = req.params.id;
    const { message, template } = req.body;

    // Get contact phone
    const contactResult = await db.query(
        'SELECT phone, first_name, last_name FROM contacts WHERE id = $1 AND organization_id = $2',
        [contactId, organizationId]
    );

    if (contactResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];
    if (!contact.phone) {
        return res.status(400).json({ error: 'Contact has no phone number' });
    }

    const phone = contact.phone.replace(/\D/g, '');

    try {
        let response;
        if (template) {
            response = await whatsappService.sendTemplate(
                phone,
                template.name,
                template.language || 'en',
                template.parameters || []
            );
        } else {
            response = await whatsappService.sendText(phone, message);
        }

        // Log message
        await db.query(`
            INSERT INTO whatsapp_messages (
                organization_id, wa_message_id, direction, to_phone,
                contact_id, message_type, content, status, sent_at, created_by
            ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, 'sent', NOW(), $7)
        `, [
            organizationId,
            response.messages[0]?.id,
            phone,
            contactId,
            template ? 'template' : 'text',
            template ? template.name : message,
            userId,
        ]);

        res.json({
            success: true,
            message_id: response.messages[0]?.id,
        });
    } catch (error: any) {
        logger.error('Failed to send quick message', { error, contactId });
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
}));

/**
 * GET /contacts/:id/messages
 * Get all messages for a contact
 */
router.get('/contacts/:id/messages', asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    
    const result = await db.query(`
        SELECT 
            wm.*,
            u.display_name AS sent_by_name
        FROM whatsapp_messages wm
        LEFT JOIN users u ON wm.created_by = u.id
        WHERE wm.contact_id = $1
        ORDER BY wm.created_at DESC
        LIMIT $2
    `, [req.params.id, limit]);

    res.json({ messages: result.rows });
}));

// =====================================================
// ERROR HANDLING
// =====================================================

router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Messaging Route Error:', err);

    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(config.app.env === 'development' && { stack: err.stack })
    });
});

export default router;
