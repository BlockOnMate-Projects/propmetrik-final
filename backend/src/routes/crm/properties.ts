import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { crmPropertySyncService } from '../../services/crm-deal-management/crmPropertySyncService';
import { dataHubQueueManager, DataHubQueueManager, CrmPropertySyncJobData } from '../../services/data-hub/jobQueue';
import db from '../../database';
import { uploadFile, deleteFile, getPresignedDownloadUrl, generatePropertyImageKey, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WebP, HEIC are allowed.`));
        }
    }
});

const router = Router();

// GET /properties — List CRM properties with filters, deals, and stats
router.get('/properties', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const {
        search,
        listing_type,
        property_type,
        status,
        region,
        include_deals,
        limit = 50,
        offset = 0
    } = req.query;

    let whereClause = 'p.organization_id = $1';
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (p.title ILIKE $${paramIndex} OR p.address_street ILIKE $${paramIndex} OR p.address_city ILIKE $${paramIndex})`;
        paramIndex++;
    }

    if (listing_type && listing_type !== 'all') {
        params.push(listing_type);
        whereClause += ` AND p.transaction_type = $${paramIndex}`;
        paramIndex++;
    }

    if (property_type && property_type !== 'all') {
        params.push(property_type);
        whereClause += ` AND p.property_type = $${paramIndex}`;
        paramIndex++;
    }

    if (status && status !== 'all') {
        params.push(status);
        whereClause += ` AND p.status = $${paramIndex}`;
        paramIndex++;
    }

    if (region && region !== 'all') {
        params.push(region);
        whereClause += ` AND p.region = $${paramIndex}`;
        paramIndex++;
    }

    params.push(parseInt(limit as string) || 50);
    const limitParam = paramIndex++;
    params.push(parseInt(offset as string) || 0);
    const offsetParam = paramIndex++;

    const query = `
        WITH property_deals AS (
            SELECT 
                pid as property_id,
                COUNT(*) as deal_count,
                COUNT(CASE WHEN d.deal_status = 'active' THEN 1 END) as active_deals
            FROM deals d, LATERAL unnest(d.property_ids) as pid
            WHERE d.organization_id = $1 AND d.deleted_at IS NULL
            GROUP BY pid
        ),
        stage_counts AS (
            SELECT pipeline_id, COUNT(*) as total_stages
            FROM deal_stages
            GROUP BY pipeline_id
        )
        SELECT 
            p.id,
            p.reference_number,
            p.title as property_name,
            p.property_type,
            p.transaction_type as listing_type,
            p.address_street as address,
            p.address_city as city,
            p.region,
            p.digital_address,
            p.price,
            p.price_currency as currency,
            p.bedrooms,
            p.bathrooms,
            p.total_area_sqm as area_sqm,
            p.land_area_sqm as land_size_sqm,
            p.status,
            p.owner_name,
            p.owner_phone,
            p.features,
            p.images,
            p.pipeline_id,
            p.current_stage_id,
            p.stage_entered_at,
            p.days_in_stage,
            dp.pipeline_name,
            ds.stage_name as current_stage_name,
            ds.stage_color as current_stage_color,
            ds.stage_order as current_stage_order,
            COALESCE(sc.total_stages, 0) as total_stages,
            p.created_at,
            COALESCE(pd.deal_count, 0) as deal_count,
            COALESCE(pd.active_deals, 0) as active_deals
        FROM crm_properties p
        LEFT JOIN property_deals pd ON pd.property_id = p.id
        LEFT JOIN deal_pipelines dp ON dp.id = p.pipeline_id
        LEFT JOIN deal_stages ds ON ds.id = p.current_stage_id
        LEFT JOIN stage_counts sc ON sc.pipeline_id = p.pipeline_id
        WHERE ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    try {
        const [propertiesResult, countResult, statsResult, withDealsResult] = await Promise.all([
            db.query(query, params),
            db.query(`SELECT COUNT(*) as total FROM crm_properties p WHERE p.organization_id = $1`, [organizationId]),
            db.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as available,
                    COUNT(CASE WHEN status = 'under_offer' THEN 1 END) as under_offer
                FROM crm_properties 
                WHERE organization_id = $1
            `, [organizationId]),
            db.query(`
                SELECT COUNT(DISTINCT pid) as count
                FROM deals d, LATERAL unnest(d.property_ids) as pid
                WHERE d.organization_id = $1 AND d.deal_status = 'active' AND d.deleted_at IS NULL
            `, [organizationId])
        ]);

        res.json({
            properties: propertiesResult.rows,
            total: parseInt(countResult.rows[0]?.total || '0'),
            stats: {
                total: parseInt(statsResult.rows[0]?.total || '0'),
                available: parseInt(statsResult.rows[0]?.available || '0'),
                under_offer: parseInt(statsResult.rows[0]?.under_offer || '0'),
                with_active_deals: parseInt(withDealsResult.rows[0]?.count || '0')
            }
        });
    } catch (err: any) {
        console.error('CRM Properties query error:', err.message);
        res.status(500).json({ error: 'Failed to fetch properties', details: err.message });
    }
}));

// GET /properties/:id — Get single CRM property with deals
router.get('/properties/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;

    const query = `
        SELECT 
            p.id,
            p.reference_number,
            p.title as property_name,
            p.property_type,
            p.transaction_type as listing_type,
            p.description,
            p.address_street as address,
            p.address_city as city,
            p.region,
            p.digital_address,
            p.landmark,
            p.latitude,
            p.longitude,
            p.price,
            p.price_currency as currency,
            p.price_negotiable,
            p.bedrooms,
            p.bathrooms,
            p.total_area_sqm as area_sqm,
            p.land_area_sqm as land_size_sqm,
            p.floors,
            p.year_built,
            p.status,
            p.features,
            p.amenities,
            p.owner_name,
            p.owner_phone,
            p.owner_email,
            p.owner_type,
            p.images,
            p.documents,
            p.virtual_tour_url,
            p.active_deal_id,
            p.total_deals,
            p.created_at,
            p.updated_at
        FROM crm_properties p
        WHERE p.id = $1 AND p.organization_id = $2
    `;

    const result = await db.query(query, [id, organizationId]);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    const dealsResult = await db.query(`
        SELECT id, title as deal_title, deal_type, deal_status, deal_value, currency, created_at
        FROM deals 
        WHERE organization_id = $1 AND $2 = ANY(property_ids) AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10
    `, [organizationId, id]);

    res.json({
        ...result.rows[0],
        deals: dealsResult.rows
    });
}));

// POST /properties/submit — Submit new CRM property with geocoding
router.post('/properties/submit', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id || (req as any).user?.sub;
    const {
        property_name,
        property_type = 'residential',
        listing_type = 'sale',
        address,
        city,
        region = 'greater_accra',
        digital_address,
        landmark,
        price,
        currency = 'GHS',
        bedrooms,
        bathrooms,
        area_sqm,
        land_size_sqm,
        floors,
        year_built,
        description,
        features,
        amenities,
        owner_name,
        owner_phone,
        owner_email,
        owner_type
    } = req.body;

    const refResult = await db.query("SELECT 'CRM-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING(reference_number FROM 10) AS INTEGER)), 0) + 1 FROM crm_properties WHERE reference_number LIKE 'CRM-' || TO_CHAR(NOW(), 'YYYY') || '-%')::TEXT, 4, '0') as ref_num");
    const referenceNumber = refResult.rows[0]?.ref_num || `CRM-${Date.now()}`;

    const permanentLinkToken = crypto.randomBytes(32).toString('hex');

    let latitude: number | null = null;
    let longitude: number | null = null;
    let locationAccuracy: string | null = null;

    try {
        const { geocodePropertyAddress } = await import('../../../shared-services/shared/geocodingHelper');
        const geocodeResult = await geocodePropertyAddress({
            digitalAddress: digital_address,
            addressStreet: address,
            city: city,
            region: region,
            landmark: landmark
        });
        
        if (geocodeResult) {
            latitude = geocodeResult.latitude;
            longitude = geocodeResult.longitude;
            locationAccuracy = geocodeResult.accuracy;
            logger.info('CRM property geocoded successfully', {
                propertyName: property_name,
                lat: latitude,
                lng: longitude,
                accuracy: locationAccuracy,
                source: geocodeResult.source
            });
        }
    } catch (err: any) {
        logger.warn('Failed to geocode CRM property on creation', { 
            error: err.message,
            propertyName: property_name 
        });
    }

    const query = `
        INSERT INTO crm_properties (
            organization_id, reference_number, title, property_type, transaction_type,
            address_street, address_city, region, digital_address, landmark,
            price, price_currency, bedrooms, bathrooms,
            total_area_sqm, land_area_sqm, floors, year_built, description, 
            features, amenities, owner_name, owner_phone, owner_email, owner_type,
            status, created_by, created_at, permanent_link_token,
            marketplace_enabled, marketplace_listed_at,
            latitude, longitude, location_accuracy, geom
        ) VALUES (
            $1, $2, $3, $4, $5, 
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25,
            'pending', $26, NOW(), $27,
            true, NOW(),
            $28::decimal, $29::decimal, $30::varchar,
            CASE WHEN $28 IS NOT NULL AND $29 IS NOT NULL 
                THEN ST_SetSRID(ST_MakePoint($29::decimal, $28::decimal), 4326)
                ELSE NULL END
        )
        RETURNING *
    `;

    const result = await db.query(query, [
        organizationId,
        referenceNumber,
        property_name,
        property_type,
        listing_type,
        address,
        city,
        region,
        digital_address,
        landmark,
        price,
        currency,
        bedrooms,
        bathrooms,
        area_sqm,
        land_size_sqm,
        floors,
        year_built,
        description,
        features ? JSON.stringify(features) : null,
        amenities ? JSON.stringify(amenities) : null,
        owner_name,
        owner_phone,
        owner_email,
        owner_type,
        userId,
        permanentLinkToken,
        latitude,
        longitude,
        locationAccuracy
    ]);

    res.status(201).json(result.rows[0]);
}));

// PATCH /properties/:id — Update CRM property with re-geocoding
router.patch('/properties/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.id || (req as any).user?.sub;

    const addressFieldsChanged = !!(
        updates.digital_address !== undefined ||
        updates.address_street !== undefined ||
        updates.address_city !== undefined ||
        updates.region !== undefined ||
        updates.landmark !== undefined
    );

    if (addressFieldsChanged) {
        try {
            const currentResult = await db.query(
                'SELECT digital_address, address_street, address_city, region, landmark FROM crm_properties WHERE id = $1 AND organization_id = $2',
                [id, organizationId]
            );
            
            if (currentResult.rows.length > 0) {
                const current = currentResult.rows[0];
                
                const digital_address = updates.digital_address !== undefined ? updates.digital_address : current.digital_address;
                const address_street = updates.address_street !== undefined ? updates.address_street : current.address_street;
                const address_city = updates.address_city !== undefined ? updates.address_city : current.address_city;
                const region = updates.region !== undefined ? updates.region : current.region;
                const landmark = updates.landmark !== undefined ? updates.landmark : current.landmark;
                
                const { geocodePropertyAddress } = await import('../../../shared-services/shared/geocodingHelper');
                const geocodeResult = await geocodePropertyAddress({
                    digitalAddress: digital_address,
                    addressStreet: address_street,
                    city: address_city,
                    region: region,
                    landmark: landmark
                });
                
                if (geocodeResult) {
                    updates.latitude = geocodeResult.latitude;
                    updates.longitude = geocodeResult.longitude;
                    updates.location_accuracy = geocodeResult.accuracy;
                    logger.info('CRM property re-geocoded on update', {
                        propertyId: id,
                        lat: geocodeResult.latitude,
                        lng: geocodeResult.longitude,
                        accuracy: geocodeResult.accuracy
                    });
                }
            }
        } catch (err: any) {
            logger.warn('Failed to re-geocode CRM property on update', { 
                error: err.message,
                propertyId: id 
            });
        }
    }

    const allowedFields = [
        'title', 'description', 'property_type', 'transaction_type',
        'address_street', 'address_city', 'region', 'digital_address', 'landmark',
        'price', 'price_currency', 'bedrooms', 'bathrooms',
        'total_area_sqm', 'land_area_sqm', 'floors', 'year_built',
        'features', 'amenities', 'owner_name', 'owner_phone', 'owner_email', 'owner_type',
        'status', 'priority', 'current_stage_id', 'pipeline_id',
        'latitude', 'longitude', 'location_accuracy',
        'images'
    ];

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            if (field === 'features' || field === 'amenities' || field === 'images') {
                setClauses.push(`${field} = $${paramIndex}`);
                values.push(JSON.stringify(updates[field]));
            } else {
                setClauses.push(`${field} = $${paramIndex}`);
                values.push(updates[field]);
            }
            paramIndex++;
        }
    }

    if (updates.current_stage_id) {
        setClauses.push(`stage_entered_at = NOW()`);
        setClauses.push(`days_in_stage = 0`);
    }

    if (updates.latitude !== undefined && updates.longitude !== undefined) {
        setClauses.push(`geom = ST_SetSRID(ST_MakePoint($${values.indexOf(updates.longitude) + 1}, $${values.indexOf(updates.latitude) + 1}), 4326)`);
    }

    if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    setClauses.push(`updated_by = $${paramIndex}`);
    values.push(userId);
    paramIndex++;

    values.push(id);
    values.push(organizationId);

    const query = `
        UPDATE crm_properties 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex - 1} AND organization_id = $${paramIndex}
        RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    res.json(result.rows[0]);
}));

// Update property stage (quick action)
router.patch('/properties/:id/stage', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const { stage_id } = req.body;

    if (!stage_id) {
        return res.status(400).json({ error: 'stage_id is required' });
    }

    const query = `
        UPDATE crm_properties 
        SET 
            current_stage_id = $1,
            stage_entered_at = NOW(),
            days_in_stage = 0,
            updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
        RETURNING 
            id,
            title as property_name,
            current_stage_id,
            stage_entered_at,
            days_in_stage,
            (SELECT stage_name FROM deal_stages WHERE id = $1) as new_stage_name,
            (SELECT stage_color FROM deal_stages WHERE id = $1) as new_stage_color,
            (SELECT stage_order FROM deal_stages WHERE id = $1) as new_stage_order
    `;

    const result = await db.query(query, [stage_id, id, organizationId]);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    res.json(result.rows[0]);
}));

// Get pipeline stages for a property
router.get('/properties/:id/stages', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;

    const query = `
        SELECT 
            ds.id,
            ds.stage_name,
            ds.stage_order,
            ds.stage_color,
            ds.probability,
            ds.id = p.current_stage_id as is_current
        FROM crm_properties p
        JOIN deal_stages ds ON ds.pipeline_id = p.pipeline_id
        WHERE p.id = $1 AND p.organization_id = $2
        ORDER BY ds.stage_order
    `;

    const result = await db.query(query, [id, organizationId]);

    res.json({ stages: result.rows });
}));

// PROPERTY SYNC ROUTES

// Trigger manual sync for a property
router.post('/properties/:id/sync', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const { async: useAsync } = req.query;

    const propCheck = await db.query(
        `SELECT id, sync_status FROM crm_properties WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [id, organizationId]
    );

    if (propCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    if (useAsync === 'true') {
        const jobData: CrmPropertySyncJobData = {
            crmPropertyId: id,
            organizationId,
            triggerSource: 'manual',
            triggeredBy: userId,
        };

        const job = await dataHubQueueManager.addJob(
            DataHubQueueManager.QUEUES.CRM_PROPERTY_SYNC,
            jobData,
            { priority: 1 }
        );

        return res.json({
            message: 'Sync queued',
            jobId: job.id,
            propertyId: id,
        });
    }

    const result = await crmPropertySyncService.syncToDataHub(id, userId, 'manual');

    if (result.success) {
        res.json({
            message: 'Property synced successfully',
            action: result.action,
            datahub_property_id: result.datahub_property_id,
            contribution_id: result.contribution_id,
        });
    } else {
        res.status(400).json({
            error: 'Sync failed',
            action: result.action,
            details: result.error,
            error_code: result.error_code,
        });
    }
}));

// Get sync status for a property
router.get('/properties/:id/sync-status', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;

    const propCheck = await db.query(
        `SELECT id FROM crm_properties WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [id, organizationId]
    );

    if (propCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    const status = await crmPropertySyncService.getSyncStatus(id);
    res.json(status);
}));

// Get sync statistics for organization
router.get('/properties/sync/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const stats = await crmPropertySyncService.getSyncStats(organizationId);
    res.json(stats);
}));

// Retry failed syncs for organization
router.post('/properties/sync/retry-failed', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const result = await crmPropertySyncService.retryFailedSyncs(organizationId);
    res.json({
        message: `Retried ${result.retried} properties, ${result.successful} successful`,
        ...result,
    });
}));

// Get pending sync properties
router.get('/properties/sync/pending', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const pendingIds = await crmPropertySyncService.getPendingSyncProperties(organizationId, limit);

    res.json({
        count: pendingIds.length,
        property_ids: pendingIds,
    });
}));

// Bulk sync all pending properties
router.post('/properties/sync/bulk', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id || (req as any).user?.sub;
    const limit = parseInt(req.query.limit as string) || 100;

    const pendingIds = await crmPropertySyncService.getPendingSyncProperties(organizationId, limit);

    if (pendingIds.length === 0) {
        return res.json({ message: 'No pending properties to sync', queued: 0 });
    }

    let queued = 0;
    for (const propertyId of pendingIds) {
        const jobData: CrmPropertySyncJobData = {
            crmPropertyId: propertyId,
            organizationId,
            triggerSource: 'auto',
            triggeredBy: userId,
        };

        await dataHubQueueManager.addJob(
            DataHubQueueManager.QUEUES.CRM_PROPERTY_SYNC,
            jobData,
            { priority: 5 }
        );
        queued++;
    }

    res.json({
        message: `Queued ${queued} properties for sync`,
        queued,
    });
}));

// Get sync history/log for a property
router.get('/properties/:id/sync-log', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await db.query(
        `SELECT * FROM crm_property_sync_log 
         WHERE crm_property_id = $1 AND organization_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [id, organizationId, limit]
    );

    res.json({
        property_id: id,
        logs: result.rows,
    });
}));

// =====================================================
// PROPERTY AUTO-MATCH
// =====================================================

import { propertyMatchService } from '../../services/crm-deal-management/propertyMatchService';

// GET /properties/:id/match-contacts — Find contacts that match this property
router.get('/properties/:id/match-contacts', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization required' });

    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const minScore = parseInt(req.query.min_score as string) || 20;

    const matches = await propertyMatchService.matchContacts(id, organizationId, { limit, minScore });
    res.json({ property_id: id, matches, total: matches.length });
}));

// GET /contacts/:id/match-properties — Find properties that match this contact
router.get('/contacts/:id/match-properties', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Organization required' });

    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const minScore = parseInt(req.query.min_score as string) || 20;
    const excludeSold = req.query.exclude_sold !== 'false';

    const matches = await propertyMatchService.matchProperties(id, organizationId, { limit, minScore, excludeSold });
    res.json({ contact_id: id, matches, total: matches.length });
}));

// =====================================================
// PROPERTY IMAGE UPLOAD
// =====================================================

// POST /properties/:id/images — Upload images to a property
router.post('/properties/:id/images', upload.array('images', 20), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
    }

    // Verify property exists and belongs to org
    const propResult = await db.query(
        'SELECT id, images FROM crm_properties WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
    );

    if (propResult.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    const existingImages: any[] = propResult.rows[0].images || [];
    const uploadedImages: any[] = [];

    for (const file of files) {
        try {
            const key = generatePropertyImageKey(id, file.originalname);
            const bucket = buckets.properties;

            await uploadFile(bucket, key, file.buffer, file.mimetype, {
                'property-id': id,
                'original-name': file.originalname,
            });

            // Generate a download URL (long-lived for display)
            const url = await getPresignedDownloadUrl(bucket, key, 86400 * 7); // 7 days

            const imageRecord = {
                id: crypto.randomUUID(),
                key,
                bucket,
                url,
                original_name: file.originalname,
                content_type: file.mimetype,
                size: file.size,
                category: (req.body as any)?.category || 'exterior',
                caption: '',
                uploaded_at: new Date().toISOString(),
            };

            uploadedImages.push(imageRecord);
        } catch (err: any) {
            logger.error('Failed to upload property image', {
                propertyId: id,
                fileName: file.originalname,
                error: err.message,
            });
        }
    }

    if (uploadedImages.length === 0) {
        return res.status(500).json({ error: 'All image uploads failed' });
    }

    // Append new images to existing array
    const allImages = [...existingImages, ...uploadedImages];

    await db.query(
        'UPDATE crm_properties SET images = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
        [JSON.stringify(allImages), id, organizationId]
    );

    logger.info('Property images uploaded', {
        propertyId: id,
        count: uploadedImages.length,
        total: allImages.length,
    });

    res.json({
        uploaded: uploadedImages,
        total: allImages.length,
        images: allImages,
    });
}));

// DELETE /properties/:id/images/:imageId — Remove a single image from a property
router.delete('/properties/:id/images/:imageId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id, imageId } = req.params;

    const propResult = await db.query(
        'SELECT id, images FROM crm_properties WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
    );

    if (propResult.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    const existingImages: any[] = propResult.rows[0].images || [];
    const imageToDelete = existingImages.find((img: any) => img.id === imageId);

    if (!imageToDelete) {
        return res.status(404).json({ error: 'Image not found' });
    }

    // Delete from MinIO
    try {
        await deleteFile(imageToDelete.bucket, imageToDelete.key);
    } catch (err: any) {
        logger.warn('Failed to delete image from MinIO', {
            propertyId: id,
            imageId,
            error: err.message,
        });
    }

    // Remove from JSONB array
    const updatedImages = existingImages.filter((img: any) => img.id !== imageId);

    await db.query(
        'UPDATE crm_properties SET images = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
        [JSON.stringify(updatedImages), id, organizationId]
    );

    res.json({ deleted: imageId, remaining: updatedImages.length, images: updatedImages });
}));

// PATCH /properties/:id/images/reorder — Reorder images
router.patch('/properties/:id/images/reorder', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const { image_ids } = req.body;

    if (!Array.isArray(image_ids)) {
        return res.status(400).json({ error: 'image_ids array required' });
    }

    const propResult = await db.query(
        'SELECT id, images FROM crm_properties WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
    );

    if (propResult.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    const existingImages: any[] = propResult.rows[0].images || [];

    // Reorder based on provided order
    const reordered = image_ids
        .map((imgId: string) => existingImages.find((img: any) => img.id === imgId))
        .filter(Boolean);

    // Add any images not in the reorder list at the end
    const reorderedIds = new Set(image_ids);
    const remaining = existingImages.filter((img: any) => !reorderedIds.has(img.id));
    const finalImages = [...reordered, ...remaining];

    await db.query(
        'UPDATE crm_properties SET images = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
        [JSON.stringify(finalImages), id, organizationId]
    );

    res.json({ images: finalImages });
}));

// GET /properties/:id/images — Get fresh presigned URLs for property images
router.get('/properties/:id/images', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;

    const propResult = await db.query(
        'SELECT id, images FROM crm_properties WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
    );

    if (propResult.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    const images: any[] = propResult.rows[0].images || [];

    // Refresh presigned URLs
    const refreshed = await Promise.all(
        images.map(async (img: any) => {
            try {
                const url = await getPresignedDownloadUrl(img.bucket, img.key, 86400); // 24h
                return { ...img, url };
            } catch {
                return img; // Keep existing URL if refresh fails
            }
        })
    );

    res.json({ property_id: id, images: refreshed, total: refreshed.length });
}));

export default router;
