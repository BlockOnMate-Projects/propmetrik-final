/**
 * PROPMETRIK — PM ↔ CRM Bridge Service
 *
 * Connects the Property Management service to the (standalone, separately-paid)
 * CRM / Deal Management service WITHOUT merging their data models.
 *
 * When a customer who owns BOTH services lists a PM property "for sale" (or
 * "for lease"), we mirror that property into a `crm_properties` row so it shows
 * up in their CRM dashboard and can be worked as a deal. The mirror is linked
 * back to the PM property by `crm_properties.source_pm_property_id` (one mirror
 * per PM property, enforced by a unique partial index).
 *
 * IMPORTANT design choices:
 *  - The mirror is `marketplace_enabled = FALSE`. The public marketplace listing
 *    stays the PM property; the mirror is internal CRM inventory only. This
 *    prevents the same home appearing twice on the marketplace.
 *  - On re-sync we update asset facts (price, beds, address) but DO NOT touch the
 *    CRM-managed `status` / deal linkage — the CRM pipeline owns those.
 *  - crm_properties remains the CRM service's own table; deals.property_ids still
 *    reference crm_properties. This is a bridge, not a merge.
 *
 * Entitlement gating ("does this org have CRM?") is the CALLER's responsibility
 * via orgHasService(orgId, 'crm') — this service just performs the mirror.
 */

import crypto from 'crypto';
import db from '../../database';
import { logger } from '../../utils/logger';

export interface BridgeSyncResult {
  crmPropertyId: string;
  created: boolean;
}

const BRIDGEABLE_TRANSACTION_TYPES = new Set(['sale', 'lease']);

/**
 * Mirror a PM property into crm_properties (upsert by source_pm_property_id).
 *
 * Returns the crm_property id, or null when the PM property is not bridgeable
 * (not found, rental, or not org-scoped). Safe to call repeatedly.
 */
export async function syncPmPropertyToCrm(pmPropertyId: string): Promise<BridgeSyncResult | null> {
  // 1. Load the PM property.
  const pmRes = await db.query(
    `SELECT id::text, region::text AS region, organization_id::text AS organization_id,
            title, description, property_type::text AS property_type,
            transaction_type::text AS transaction_type,
            address_street, address_city, digital_address,
            price, price_currency::text AS price_currency,
            bedrooms, bathrooms, total_area_sqm, land_area_sqm, year_built,
            latitude, longitude, image_urls, amenities, features
       FROM properties
      WHERE id = $1::uuid
      LIMIT 1`,
    [pmPropertyId],
  );

  if (pmRes.rows.length === 0) {
    return null;
  }
  const p = pmRes.rows[0];

  const transactionType = (p.transaction_type || '').toLowerCase();
  if (!BRIDGEABLE_TRANSACTION_TYPES.has(transactionType)) {
    // Rentals are handled by the tenant-application flow, not CRM deals.
    return null;
  }
  if (!p.organization_id) {
    return null;
  }

  // 2. Is there already a mirror?
  const existing = await db.query(
    `SELECT id::text FROM crm_properties WHERE source_pm_property_id = $1::uuid LIMIT 1`,
    [pmPropertyId],
  );

  // 3. Generate identifiers only needed on first creation.
  const referenceNumber = await nextCrmReferenceNumber();
  const permanentLinkToken = crypto.randomBytes(32).toString('hex');
  const images = p.image_urls ?? [];

  // Upsert against the partial unique index uq_crm_properties_source_pm.
  // On conflict we refresh asset facts but preserve CRM-owned status & links.
  const upsert = await db.query(
    `INSERT INTO crm_properties (
        organization_id, reference_number, title, description, property_type, transaction_type,
        address_street, address_city, region, digital_address,
        price, price_currency, bedrooms, bathrooms, total_area_sqm, land_area_sqm, year_built,
        latitude, longitude,
        status, lead_source, source_pm_property_id,
        permanent_link_token, marketplace_enabled,
        images, features, amenities,
        created_at, updated_at
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17,
        $18, $19,
        'active', 'pm_bridge', $20::uuid,
        $21, FALSE,
        $22::jsonb, $23::jsonb, $24::jsonb,
        NOW(), NOW()
     )
     ON CONFLICT (source_pm_property_id) WHERE source_pm_property_id IS NOT NULL
     DO UPDATE SET
        title          = EXCLUDED.title,
        description    = EXCLUDED.description,
        property_type  = EXCLUDED.property_type,
        transaction_type = EXCLUDED.transaction_type,
        address_street = EXCLUDED.address_street,
        address_city   = EXCLUDED.address_city,
        region         = EXCLUDED.region,
        digital_address = EXCLUDED.digital_address,
        price          = EXCLUDED.price,
        price_currency = EXCLUDED.price_currency,
        bedrooms       = EXCLUDED.bedrooms,
        bathrooms      = EXCLUDED.bathrooms,
        total_area_sqm = EXCLUDED.total_area_sqm,
        land_area_sqm  = EXCLUDED.land_area_sqm,
        year_built     = EXCLUDED.year_built,
        latitude       = EXCLUDED.latitude,
        longitude      = EXCLUDED.longitude,
        updated_at     = NOW()
     RETURNING id::text`,
    [
      p.organization_id, referenceNumber, p.title || 'Untitled Property', p.description, p.property_type, transactionType,
      p.address_street, p.address_city, p.region, p.digital_address,
      p.price, p.price_currency || 'GHS', p.bedrooms, p.bathrooms, p.total_area_sqm, p.land_area_sqm, p.year_built,
      p.latitude, p.longitude,
      pmPropertyId,
      permanentLinkToken,
      JSON.stringify(images),
      JSON.stringify(p.features ?? []),
      JSON.stringify(p.amenities ?? []),
    ],
  );

  const crmPropertyId = upsert.rows[0].id;
  const created = existing.rows.length === 0;

  logger.info('PM→CRM bridge sync', { pmPropertyId, crmPropertyId, created, transactionType });
  return { crmPropertyId, created };
}

/**
 * Resolve the bridge mirror for a PM property, creating it on demand.
 * Returns the crm_property id (or null if not bridgeable).
 */
export async function ensureCrmMirror(pmPropertyId: string): Promise<string | null> {
  const existing = await db.query(
    `SELECT id::text FROM crm_properties WHERE source_pm_property_id = $1::uuid LIMIT 1`,
    [pmPropertyId],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const synced = await syncPmPropertyToCrm(pmPropertyId);
  return synced?.crmPropertyId ?? null;
}

/**
 * Generate the next CRM reference number (CRM-YYYY-NNNN), matching the format
 * used by the native CRM property create route.
 */
async function nextCrmReferenceNumber(): Promise<string> {
  try {
    const r = await db.query(
      `SELECT 'CRM-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
              LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING(reference_number FROM 10) AS INTEGER)), 0) + 1
                      FROM crm_properties
                     WHERE reference_number LIKE 'CRM-' || TO_CHAR(NOW(), 'YYYY') || '-%')::TEXT, 4, '0') AS ref_num`,
    );
    return r.rows[0]?.ref_num || `CRM-${Date.now()}`;
  } catch {
    return `CRM-${Date.now()}`;
  }
}
