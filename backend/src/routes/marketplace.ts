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
import { ensureCrmMirror } from '../services/crm-deal-management/crmBridgeService';
import { orgHasService } from '../middleware/serviceAccess';
import db from '../database';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { notificationService } from '../../shared-services/notifications/unified';
import * as moderation from '../services/marketplace/listingModerationService';

const router = Router();

// ── Inquiry validation schema ──────────────────────
const inquirySchema = z.object({
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().min(6).max(20),
    message: z.string().max(2000).optional().or(z.literal('')),
    property_id: z.string().uuid(),
    inquiry_type: z.enum(['buy', 'rent', 'viewing', 'info', 'offer', 'lease']).default('buy'),
    offer_amount: z.number().positive().optional(),
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
 * @route   GET /api/v1/marketplace/properties/:token/nearby
 * @desc    Nearby homes — the closest public listings by distance (any type/price).
 * @access  Public
 */
router.get('/properties/:token/nearby', marketplaceController.getNearbyHomes.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token/neighborhood
 * @desc    Neighbourhood insights — nearby schools/hospitals/transit, walk/transit/bike
 *          scores, flood risk, and area demographics (reuses existing PropMetrik data).
 * @access  Public
 */
router.get('/properties/:token/neighborhood', marketplaceController.getNeighborhood.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token/neighborhood/narrative
 * @desc    AI-generated neighbourhood summary, grounded strictly on the facts above.
 * @access  Public
 */
router.get('/properties/:token/neighborhood/narrative', marketplaceController.getNeighborhoodNarrative.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token/application-link
 * @desc    Get or create application link for property (redirects to tenant portal)
 * @access  Public
 */
router.get('/properties/:token/application-link', marketplaceController.getApplicationLink.bind(marketplaceController));

/**
 * @route   POST /api/v1/marketplace/properties/:token/report
 * @desc    Publicly report a listing for abuse/fraud (Gate E). Auto-suspends on threshold.
 * @access  Public
 */
router.post('/properties/:token/report', async (req: Request, res: Response) => {
  try {
    const { reason, details, reporter_email } = req.body || {};
    if (!reason) { res.status(400).json({ error: 'A reason is required' }); return; }
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || undefined;
    const result = await moderation.submitReport(req.params.token, { reason, details, reporter_email, reporter_ip: ip });
    res.json({ data: result });
  } catch (e: any) {
    if (e?.name === 'ModerationError') { res.status(e.status || 400).json({ error: e.message }); return; }
    logger.error('Listing report error', { error: e?.message });
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

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
 * @desc    Submit a buyer / renter / lessee enquiry for a property.
 *
 *          Capture-first, deal-gated:
 *            • The enquiry is ALWAYS captured (for PM listings, into property_inquiries;
 *              the property owner is always notified). This works for PM-only customers
 *              who do NOT have the CRM/Deals service.
 *            • A CRM deal is created ONLY when the org has the CRM service. For a PM
 *              listing we first ensure a bridge mirror in crm_properties and use the
 *              MIRROR's id (deals.property_ids reference crm_properties). For native CRM
 *              listings the deal flow is unchanged.
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

        // 1. Resolve the property and its SOURCE (PM-managed vs native CRM listing).
        let property: any;
        let source: 'pm' | 'crm';

        const pmRes = await db.query(
            `SELECT p.id::text, p.region::text AS region, p.title, p.price::numeric AS price,
                    p.price_currency::text AS currency, p.transaction_type::text AS transaction_type,
                    p.organization_id::text AS organization_id, p.property_type::text AS property_type,
                    p.address_street, p.address_city
             FROM properties p
             WHERE p.id = $1::uuid AND p.marketplace_enabled = TRUE AND p.organization_id IS NOT NULL
             LIMIT 1`,
            [data.property_id]
        );

        if (pmRes.rows.length > 0) {
            property = pmRes.rows[0];
            source = 'pm';
        } else {
            const crmRes = await db.query(
                `SELECT cp.id::text, cp.region::text AS region, cp.title, cp.price,
                        cp.price_currency::text AS currency, cp.transaction_type::text AS transaction_type,
                        cp.organization_id::text AS organization_id, cp.property_type::text AS property_type,
                        cp.assigned_agent_id::text AS assigned_agent_id,
                        cp.address_street, cp.address_city
                 FROM crm_properties cp
                 WHERE cp.id = $1::uuid AND cp.marketplace_enabled = TRUE
                 LIMIT 1`,
                [data.property_id]
            );
            if (crmRes.rows.length === 0) {
                return res.status(404).json({ error: 'Property not found' });
            }
            property = crmRes.rows[0];
            source = 'crm';
        }

        const organizationId = property.organization_id;
        if (!organizationId) {
            return res.status(400).json({ error: 'Property is not linked to an organization' });
        }

        const transactionType = (property.transaction_type || '').toLowerCase();
        const isRental = transactionType === 'rental' || transactionType === 'rent';
        const isLease = transactionType === 'lease';
        const propertyPrice = parseFloat(property.price) || 0;
        const inquirerName = `${data.first_name} ${data.last_name}`;
        const propertyTitle = property.title || 'Property';
        const propertyLocation = [property.address_street, property.address_city, property.region].filter(Boolean).join(', ');
        const message = (data.message && data.message.trim())
            ? data.message.trim()
            : `Marketplace ${isRental ? 'rental' : transactionType || 'sale'} enquiry for ${propertyTitle}`;

        // 2. ALWAYS capture the enquiry for PM listings (PM-side lead inbox). No CRM required.
        let inquiryId: string | null = null;
        if (source === 'pm') {
            const ins = await db.query(
                `INSERT INTO property_inquiries
                   (property_id, property_region, organization_id, name, email, phone, message,
                    inquiry_type, transaction_type, offer_amount, offer_currency, status, source)
                 VALUES ($1, $2::region_code_enum, $3, $4, $5, $6, $7,
                         $8, $9::transaction_type_enum, $10, $11, 'new', 'marketplace')
                 RETURNING id::text`,
                [property.id, property.region, organizationId, inquirerName, data.email || null,
                 data.phone, message, data.inquiry_type,
                 ['sale', 'rental', 'lease'].includes(transactionType) ? transactionType : null,
                 data.offer_amount ?? null, property.currency || 'GHS']
            );
            inquiryId = ins.rows[0].id;
            logger.info('PM property enquiry captured', { inquiryId, propertyId: property.id, organizationId, transactionType });
        }

        // 3. Create a CRM deal ONLY when the org has CRM/Deals.
        //    - native CRM listing → org has CRM by definition.
        //    - PM listing → gated by orgHasService; sale only (deal_type_enum has no 'lease' yet),
        //      and routed through the bridge mirror so deals.property_ids stays a crm_properties id.
        let deal: any = null;
        let agentName: string | null = null;
        let agentEmail: string | null = null;

        const orgHasCrm = source === 'crm' ? true : await orgHasService(organizationId, 'crm');
        const dealEligible = source === 'crm'
            ? true                                  // native CRM: rental & sale both create deals (unchanged)
            : (orgHasCrm && (transactionType === 'sale' || transactionType === 'lease'));

        if (dealEligible) {
            try {
                // 3a. Resolve the crm_properties id the deal will reference.
                let crmPropertyIdForDeal: string | null = property.id;
                let assignedAgentId: string | null = property.assigned_agent_id || null;
                if (source === 'pm') {
                    crmPropertyIdForDeal = await ensureCrmMirror(property.id);
                    assignedAgentId = null; // PM mirror has no pre-assigned agent
                }

                if (!crmPropertyIdForDeal) {
                    throw new Error('Could not resolve a CRM property for the deal');
                }

                // 3b. Pipeline + first stage.
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
                    throw new Error('No active pipeline configured');
                }
                const { pipeline_id, stage_id } = pipelineResult.rows[0];

                // 3c. Agent: property's assigned agent if any, otherwise least-loaded active agent.
                let agentId: string | null = null;
                if (assignedAgentId) {
                    const a = await db.query(
                        `SELECT id, email, first_name, last_name FROM agents
                         WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
                        [assignedAgentId]
                    );
                    if (a.rows.length > 0) {
                        agentId = a.rows[0].id;
                        agentEmail = a.rows[0].email;
                        agentName = `${a.rows[0].first_name} ${a.rows[0].last_name}`;
                    }
                }
                if (!agentId) {
                    const rr = await db.query(
                        `SELECT id, email, first_name, last_name FROM agents
                         WHERE organization_id = $1 AND status = 'active' AND deleted_at IS NULL
                         ORDER BY (SELECT COUNT(*) FROM deals d WHERE d.assigned_agent = agents.id AND d.deal_status = 'active') ASC, created_at ASC
                         LIMIT 1`,
                        [organizationId]
                    );
                    if (rr.rows.length === 0) {
                        throw new Error('No active agents available');
                    }
                    agentId = rr.rows[0].id;
                    agentEmail = rr.rows[0].email;
                    agentName = `${rr.rows[0].first_name} ${rr.rows[0].last_name}`;
                }

                // 3d. Contact (lead) + deal.
                const contact = await contactService.createContact(organizationId, {
                    first_name: data.first_name,
                    last_name: data.last_name,
                    primary_phone: data.phone,
                    email: data.email || undefined,
                    contact_type: 'first_time_buyer',
                    lead_source: 'property_listing',
                    notes: message,
                    tags: ['marketplace-inquiry'],
                });

                // deal_type_enum has no 'lease' (and the app role can't ALTER the type),
                // so a lease is modelled as a tenancy-style 'rental' deal. The property
                // and the captured enquiry keep transaction_type='lease' as source of truth.
                const dealType = (isRental || isLease) ? 'rental' : 'sale';
                deal = await dealService.createDeal(organizationId, {
                    title: `${inquirerName} — ${propertyTitle}`,
                    description: message,
                    primary_contact_id: contact.id,
                    assigned_agent: agentId as string,
                    deal_type: dealType as any,
                    pipeline_id,
                    stage_id,
                    deal_value: data.offer_amount || (propertyPrice > 0 ? propertyPrice : undefined),
                    property_ids: [crmPropertyIdForDeal],
                    lead_source: 'property_listing',
                    tags: ['marketplace'],
                });

                // 3e. Link the captured PM enquiry to the deal.
                if (inquiryId && deal?.id) {
                    await db.query(
                        `UPDATE property_inquiries SET deal_id = $1, status = 'qualified', updated_at = NOW() WHERE id = $2`,
                        [deal.id, inquiryId]
                    );
                }

                logger.info('Marketplace inquiry → deal created', {
                    dealId: deal?.id, contactId: contact.id, source, propertyId: data.property_id,
                    crmPropertyId: crmPropertyIdForDeal, dealValue: data.offer_amount || propertyPrice,
                });
            } catch (dealErr: any) {
                // Deal creation is best-effort — the enquiry is already captured as a lead.
                logger.warn('Inquiry deal creation skipped (kept as lead)', {
                    error: dealErr.message, source, organizationId, propertyId: data.property_id,
                });
            }
        }

        // 4. Notification emails (non-blocking).
        const inquiryDetails = {
            name: inquirerName,
            phone: data.phone,
            email: data.email || 'Not provided',
            message: (data.message && data.message.trim()) ? data.message.trim() : 'No message',
            inquiryType: data.inquiry_type,
            dealNumber: deal?.deal_number || null,
            offer: data.offer_amount ? `${property.currency || 'GHS'} ${data.offer_amount.toLocaleString()}` : null,
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
                        ${inquiryDetails.offer ? `<tr><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Offer</td><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${inquiryDetails.offer}</td></tr>` : ''}
                        ${inquiryDetails.dealNumber ? `<tr><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Deal #</td><td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; font-family: monospace;">${inquiryDetails.dealNumber}</td></tr>` : ''}
                        ${inquiryDetails.message !== 'No message' ? `<tr><td style="padding: 10px 12px; font-size: 14px; color: #64748b; vertical-align: top;">Message</td><td style="padding: 10px 12px; font-size: 14px; line-height: 1.5;">${inquiryDetails.message}</td></tr>` : ''}
                    </table>
                    <p style="font-size: 14px; color: #64748b; margin-top: 20px;">Log in to your PROPMETRIK dashboard to follow up on this inquiry.</p>
                </div>
                <div style="background: #f8fafc; padding: 16px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #94a3b8;">PROPMETRIK &middot; Deal Management</p>
                </div>
            </div>
        `;

        // Send to agent (only when a deal/agent exists)
        if (agentEmail) {
            notificationService.sendEmail({
                to: agentEmail,
                subject: `New Inquiry: ${inquirerName} — ${propertyTitle}`,
                html: emailHtml(agentName || 'Agent'),
                text: `New inquiry from ${inquirerName} (${data.phone}) for ${propertyTitle}.${deal?.deal_number ? ` Deal #${deal.deal_number}.` : ''} Message: ${data.message || 'None'}.`,
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
                text: `New inquiry from ${inquirerName} (${data.phone}) for ${propertyTitle}.${deal?.deal_number ? ` Assigned to ${agentName || 'an agent'}. Deal #${deal.deal_number}.` : ''}`,
            }).catch(err => logger.warn('Failed to send company inquiry email', { error: err.message, ownerEmail: owner.email }));
        }

        res.status(201).json({
            success: true,
            message: 'Your enquiry has been submitted. The team will be in touch shortly.',
            inquiry_id: deal?.deal_number || inquiryId,
        });
    } catch (error: any) {
        logger.error('Marketplace inquiry failed', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to process inquiry. Please try again.' });
    }
});

export default router;
