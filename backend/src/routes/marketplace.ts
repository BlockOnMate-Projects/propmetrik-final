/**
 * Marketplace API Routes
 * Public marketplace endpoints for property listing and search
 * 
 * Base path: /api/v1/marketplace
 * 
 * @module routes/marketplace
 */

import { Router, Request, Response } from 'express';
import { marketplaceController } from '../controllers/marketplace/marketplaceController';
import { contactService, dealService, agentService } from '../services/crm-deal-management';
import db from '../database';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { notificationService } from '../../shared-services/notifications/unified';

const router = Router();

// ── Inquiry validation schema ──────────────────────
const inquirySchema = z.object({
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().min(6).max(20),
    message: z.string().max(2000).optional().or(z.literal('')),
    property_id: z.string().uuid(),
    inquiry_type: z.enum(['buy', 'rent', 'viewing', 'info']).default('buy'),
});

/**
 * @route   POST /api/v1/marketplace/search
 * @desc    Search marketplace properties with filters
 * @access  Public
 */
router.post('/search', marketplaceController.searchProperties.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token
 * @desc    Get property by permanent token
 * @access  Public
 */
router.get('/properties/:token', marketplaceController.getPropertyByToken.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token/similar
 * @desc    Get similar properties based on type, price, location
 * @access  Public
 */
router.get('/properties/:token/similar', marketplaceController.getSimilarProperties.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token/application-link
 * @desc    Get or create application link for property (redirects to tenant portal)
 * @access  Public
 */
router.get('/properties/:token/application-link', marketplaceController.getApplicationLink.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/autocomplete
 * @desc    Location autocomplete suggestions
 * @access  Public
 */
router.get('/autocomplete', marketplaceController.autocomplete.bind(marketplaceController));

/**
 * @route   POST /api/v1/marketplace/geocode
 * @desc    Forward geocoding (address to coordinates)
 * @access  Public
 */
router.post('/geocode', marketplaceController.geocode.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/reverse-geocode
 * @desc    Reverse geocoding (coordinates to address)
 * @access  Public
 */
router.get('/reverse-geocode', marketplaceController.reverseGeocode.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/nearby-amenities
 * @desc    Get nearby amenities (schools, hospitals, transit)
 * @access  Public
 */
router.get('/nearby-amenities', marketplaceController.getNearbyAmenities.bind(marketplaceController));

/**
 * @route   POST /api/v1/marketplace/analytics/track
 * @desc    Track marketplace event (view, click, favorite, etc.)
 * @access  Public
 */
router.post('/analytics/track', marketplaceController.trackEvent.bind(marketplaceController));

/**
 * @route   POST /api/v1/marketplace/inquiries
 * @desc    Submit a buyer/renter inquiry for a property.
 *          Auto-creates a CRM contact (lead) and a deal in the default pipeline.
 * @access  Public
 */
router.post('/inquiries', async (req: Request, res: Response) => {
    try {
        const parsed = inquirySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const data = parsed.data;

        // 1. Look up the property to get its price, org, and assigned agent
        const propResult = await db.query(
            `SELECT cp.id::text, cp.title, cp.price, cp.price_currency::text, cp.transaction_type::text,
                    cp.organization_id::text, cp.property_type::text, cp.assigned_agent_id::text,
                    cp.address_street, cp.address_city, cp.region
             FROM crm_properties cp
             WHERE cp.id = $1 AND cp.marketplace_enabled = TRUE
             UNION ALL
             SELECT p.id::text, p.title, p.price::numeric, p.price_currency::text,
                    p.transaction_type::text, p.organization_id::text, p.property_type::text,
                    NULL as assigned_agent_id,
                    NULL as address_street, NULL as address_city, NULL as region
             FROM properties p
             WHERE p.id = $1::uuid AND p.marketplace_enabled = TRUE AND p.organization_id IS NOT NULL
             LIMIT 1`,
            [data.property_id]
        );

        if (propResult.rows.length === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }

        const property = propResult.rows[0];
        const organizationId = property.organization_id;

        if (!organizationId) {
            return res.status(400).json({ error: 'Property is not linked to an organization' });
        }

        // 2. Create a CRM contact (lead)
        const contact = await contactService.createContact(organizationId, {
            first_name: data.first_name,
            last_name: data.last_name,
            primary_phone: data.phone,
            email: data.email || undefined,
            contact_type: 'first_time_buyer',
            lead_source: 'property_listing',
            notes: data.message || undefined,
            tags: ['marketplace-inquiry'],
        });

        // 3. Find default pipeline + first stage
        const pipelineResult = await db.query(
            `SELECT dp.id as pipeline_id, ds.id as stage_id
             FROM deal_pipelines dp
             JOIN deal_stages ds ON ds.pipeline_id = dp.id
             WHERE dp.organization_id = $1 AND dp.is_active = true AND dp.deleted_at IS NULL
             ORDER BY dp.is_default DESC, dp.created_at ASC, ds.stage_order ASC
             LIMIT 1`,
            [organizationId]
        );

        if (pipelineResult.rows.length === 0) {
            return res.status(500).json({ error: 'No active pipeline configured' });
        }

        const { pipeline_id, stage_id } = pipelineResult.rows[0];

        // 4. Use property's assigned agent if set, otherwise round-robin
        let agentId: string;
        let agentEmail: string | null = null;
        let agentName: string | null = null;

        if (property.assigned_agent_id) {
            // Use the agent assigned to this property
            const assignedAgent = await db.query(
                `SELECT id, email, first_name, last_name FROM agents
                 WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
                [property.assigned_agent_id]
            );
            if (assignedAgent.rows.length > 0) {
                agentId = assignedAgent.rows[0].id;
                agentEmail = assignedAgent.rows[0].email;
                agentName = `${assignedAgent.rows[0].first_name} ${assignedAgent.rows[0].last_name}`;
            } else {
                // Assigned agent is inactive/deleted, fall back to round-robin
                const fallback = await db.query(
                    `SELECT id, email, first_name, last_name FROM agents
                     WHERE organization_id = $1 AND status = 'active' AND deleted_at IS NULL
                     ORDER BY (SELECT COUNT(*) FROM deals d WHERE d.assigned_agent = agents.id AND d.deal_status = 'active') ASC, created_at ASC
                     LIMIT 1`,
                    [organizationId]
                );
                if (fallback.rows.length === 0) {
                    return res.status(500).json({ error: 'No active agents available' });
                }
                agentId = fallback.rows[0].id;
                agentEmail = fallback.rows[0].email;
                agentName = `${fallback.rows[0].first_name} ${fallback.rows[0].last_name}`;
            }
        } else {
            // No assigned agent — round-robin from active agents
            const agentsResult = await db.query(
                `SELECT id, email, first_name, last_name FROM agents
                 WHERE organization_id = $1 AND status = 'active' AND deleted_at IS NULL
                 ORDER BY (SELECT COUNT(*) FROM deals d WHERE d.assigned_agent = agents.id AND d.deal_status = 'active') ASC, created_at ASC
                 LIMIT 1`,
                [organizationId]
            );
            if (agentsResult.rows.length === 0) {
                return res.status(500).json({ error: 'No active agents available' });
            }
            agentId = agentsResult.rows[0].id;
            agentEmail = agentsResult.rows[0].email;
            agentName = `${agentsResult.rows[0].first_name} ${agentsResult.rows[0].last_name}`;
        }

        // 5. Determine deal type from property transaction type
        const transactionType = (property.transaction_type || '').toLowerCase();
        const dealType = transactionType === 'rental' || transactionType === 'rent' ? 'rental' : 'sale';
        const propertyPrice = parseFloat(property.price) || 0;

        // 6. Create the deal with property value
        const deal = await dealService.createDeal(organizationId, {
            title: `${data.first_name} ${data.last_name} — ${property.title || 'Property Inquiry'}`,
            description: data.message || `Marketplace inquiry for ${property.title}`,
            primary_contact_id: contact.id,
            assigned_agent: agentId,
            deal_type: dealType as any,
            pipeline_id,
            stage_id,
            deal_value: propertyPrice > 0 ? propertyPrice : undefined,
            property_ids: [data.property_id],
            lead_source: 'property_listing',
            tags: ['marketplace'],
        });

        logger.info('Marketplace inquiry processed', {
            contactId: contact.id,
            dealId: deal.id,
            propertyId: data.property_id,
            dealValue: propertyPrice,
        });

        // 7. Send notification emails (non-blocking)
        const propertyTitle = property.title || 'Property';
        const propertyLocation = [property.address_street, property.address_city, property.region].filter(Boolean).join(', ');
        const inquirerName = `${data.first_name} ${data.last_name}`;
        const inquiryDetails = {
            name: inquirerName,
            phone: data.phone,
            email: data.email || 'Not provided',
            message: data.message || 'No message',
            inquiryType: data.inquiry_type,
            dealNumber: deal.deal_number,
        };

        const emailHtml = (recipientName: string) => `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
                <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">New Property Inquiry</h1>
                </div>
                <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none;">
                    <p style="font-size: 16px; margin-top: 0;">Hi <strong>${recipientName}</strong>,</p>
                    <p style="font-size: 15px; line-height: 1.6;">A new inquiry has been submitted for:</p>
                    <div style="background: #f0fdfa; border-left: 4px solid #0891b2; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                        <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #0e7490;">${propertyTitle}</p>
                        ${propertyLocation ? `<p style="margin: 0; font-size: 14px; color: #475569;">${propertyLocation}</p>` : ''}
                    </div>
                    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                        <tr><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; color: #64748b; width: 120px;">Name</td><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${inquiryDetails.name}</td></tr>
                        <tr><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Phone</td><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9;">${inquiryDetails.phone}</td></tr>
                        <tr><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Email</td><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9;">${inquiryDetails.email}</td></tr>
                        <tr><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Type</td><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; text-transform: capitalize;">${inquiryDetails.inquiryType}</td></tr>
                        <tr><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Deal #</td><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; font-family: monospace;">${inquiryDetails.dealNumber}</td></tr>
                        ${inquiryDetails.message !== 'No message' ? `<tr><td style="padding: 10px 12px; font-size: 14px; color: #64748b; vertical-align: top;">Message</td><td style="padding: 10px 12px; font-size: 14px; line-height: 1.5;">${inquiryDetails.message}</td></tr>` : ''}
                    </table>
                    <p style="font-size: 14px; color: #64748b; margin-top: 20px;">Log in to your PROPMETRIK dashboard to follow up on this inquiry.</p>
                </div>
                <div style="background: #f8fafc; padding: 16px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #94a3b8;">PROPMETRIK &middot; Deal Management</p>
                </div>
            </div>
        `;

        // Send to agent
        if (agentEmail) {
            notificationService.sendEmail({
                to: agentEmail,
                subject: `New Inquiry: ${inquirerName} — ${propertyTitle}`,
                html: emailHtml(agentName || 'Agent'),
                text: `New inquiry from ${inquirerName} (${data.phone}) for ${propertyTitle}. Deal #${deal.deal_number}. Message: ${data.message || 'None'}.`,
            }).catch(err => logger.warn('Failed to send agent inquiry email', { error: err.message, agentEmail }));
        }

        // Send to company (registration email = earliest super_admin or first user)
        const ownerResult = await db.query(
            `SELECT email, full_name FROM users
             WHERE organization_id = $1
             ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END, created_at ASC
             LIMIT 1`,
            [organizationId]
        );
        const owner = ownerResult.rows[0];
        if (owner?.email) {
            notificationService.sendEmail({
                to: owner.email,
                subject: `New Inquiry: ${inquirerName} — ${propertyTitle}`,
                html: emailHtml(owner.full_name || 'Team'),
                text: `New inquiry from ${inquirerName} (${data.phone}) for ${propertyTitle}. Assigned to ${agentName || 'an agent'}. Deal #${deal.deal_number}.`,
            }).catch(err => logger.warn('Failed to send company inquiry email', { error: err.message, ownerEmail: owner.email }));
        }

        res.status(201).json({
            success: true,
            message: 'Your inquiry has been submitted. An agent will contact you shortly.',
            inquiry_id: deal.deal_number,
        });
    } catch (error: any) {
        logger.error('Marketplace inquiry failed', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to process inquiry. Please try again.' });
    }
});

export default router;
