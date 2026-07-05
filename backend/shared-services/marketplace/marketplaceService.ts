// Marketplace Service - Aggregates PM and CRM properties for public marketplace
import db from '../../src/database';
import { logger } from '../../src/utils/logger';
import { getSignedLeaseDownloadUrl, isS3ObjectRef } from '../../src/services/property-management/leases/signedLeaseStorage';
import { listableOrgExistsSql } from '../../src/services/marketplace/listingGuardService';
import { rightToListSql } from '../../src/services/marketplace/listingMandateService';
import { conflictGateSql } from '../../src/services/marketplace/propertyRegistryService';
import { moderationGateSql } from '../../src/services/marketplace/listingModerationService';

// Gate A (KYB): only serve listings from verified (or platform) organizations.
const LISTABLE_ORG_FILTER = listableOrgExistsSql('organization_id');
// Gate C (mandate): only serve listings with a valid right-to-list (platform org exempt).
// Columns are table-qualified because the EXISTS subqueries join listing_mandates +
// esign_envelopes, which also have `id` — unqualified would be ambiguous.
const PM_RIGHT_TO_LIST = rightToListSql('pm', 'properties.organization_id', 'properties.id');
const CRM_RIGHT_TO_LIST = rightToListSql('crm', 'crm_properties.organization_id', 'crm_properties.id');
// Gate D (double-sale): hide any listing that is an open identity-conflict challenger.
const PM_CONFLICT_GATE = conflictGateSql('pm', 'properties.id');
const CRM_CONFLICT_GATE = conflictGateSql('crm', 'crm_properties.id');
// Gate E (moderation): hide any listing suspended by community reports / admin.
const PM_MODERATION_GATE = moderationGateSql('pm', 'properties.id');
const CRM_MODERATION_GATE = moderationGateSql('crm', 'crm_properties.id');

export interface MarketplaceProperty {
  id: string;
  source: 'pm' | 'crm';
  permanent_link_token: string;
  
  // Basic info
  title: string;
  description: string | null;
  property_type: string;
  transaction_type: 'rental' | 'sale' | 'lease';

  // Location
  address: string;
  city: string;
  region: string;
  neighborhood: string | null;
  digital_address: string | null;
  location: {
    lat: number;
    lon: number;
  } | null;
  
  // Pricing
  price: number;
  currency: string;
  price_negotiable: boolean | null;
  
  // Specifications
  bedrooms: number;
  bathrooms: number;
  total_area_sqm: number | null;
  total_units?: number | null;
  parking_spaces: number | null;

  // Additional details
  year_built: number | null;
  land_area_sqm: number | null;
  property_condition: string | null;

  // Features & Amenities
  amenities: string[];
  features: string[];
  
  // Media
  images: Array<{
    url: string;
    caption: string | null;
  }>;
  /** Optional marketing/walkthrough video (ready-to-play URL), null when none. */
  video_url: string | null;

  // Metadata
  listed_at: string;
  views: number;
  clicks: number;
  
  // Distance (when geo search is used)
  distance_km?: number;
  relevance_score?: number;
}

export interface SearchFilters {
  query?: string;
  transaction_type?: 'rental' | 'sale' | 'lease' | 'all';
  property_types?: string[];
  min_price?: number;
  max_price?: number;
  bedrooms?: number;
  bathrooms?: number;
  parking_spaces?: number;
  listed_within_days?: number;
  amenities?: string[];
  region?: string;
  city?: string;
  neighborhood?: string;
  
  // Geospatial filters
  geo_radius?: {
    latitude: number;
    longitude: number;
    radius_km: number;
  };
  geo_bbox?: {
    top_left: { lat: number; lon: number };
    bottom_right: { lat: number; lon: number };
  };
  
  // Sorting
  sort_by?: 'price' | 'distance' | 'created_at' | 'views';
  sort_order?: 'asc' | 'desc';
  
  // Pagination
  from?: number;
  size?: number;
}

export class MarketplaceService {
  async enrichPmPropertyImages(properties: MarketplaceProperty[]): Promise<MarketplaceProperty[]> {
    const pmPropertyIds = properties
      .filter(property => property.source === 'pm')
      .map(property => property.id);

    if (pmPropertyIds.length === 0) return properties;

    const result = await db.query(`
      SELECT DISTINCT ON (property_id, id)
        id,
        property_id,
        title,
        file_url,
        file_name
      FROM property_management_documents
      WHERE property_id = ANY($1)
        AND document_type = 'property_photos'
      ORDER BY property_id, id, created_at DESC
    `, [pmPropertyIds]);

    const imagesByPropertyId = new Map<string, Array<{ id: string; url: string; caption: string | null; original_name?: string }>>();

    for (const row of result.rows) {
      const url = await this.resolveImageUrl(row.file_url);
      if (!url) continue;

      const images = imagesByPropertyId.get(row.property_id) || [];
      images.push({
        id: row.id,
        url,
        caption: row.title || null,
        original_name: row.file_name || '',
      });
      imagesByPropertyId.set(row.property_id, images);
    }

    return properties.map(property => {
      if (property.source !== 'pm') return property;

      const documentImages = imagesByPropertyId.get(property.id) || [];
      if (documentImages.length === 0) return property;

      const seenUrls = new Set<string>();
      const images = [...documentImages, ...(property.images || [])].filter(image => {
        if (!image.url || seenUrls.has(image.url)) return false;
        seenUrls.add(image.url);
        return true;
      });

      return { ...property, images };
    });
  }

  private async resolveImageUrl(fileUrl: string | null): Promise<string | null> {
    if (!fileUrl) return null;
    if (isS3ObjectRef(fileUrl)) return await getSignedLeaseDownloadUrl(fileUrl) || null;
    return fileUrl;
  }

  /**
   * Search properties for marketplace using PostgreSQL
   * Note: This is a fallback. Production should use OpenSearch for better performance
   */
  async searchProperties(filters: SearchFilters): Promise<{
    total: number;
    properties: MarketplaceProperty[];
  }> {
    try {
      const {
        query,
        transaction_type = 'all',
        property_types,
        min_price,
        max_price,
        bedrooms,
        bathrooms,
        amenities,
        region,
        city,
        neighborhood,
        geo_radius,
        geo_bbox,
        sort_by = 'created_at',
        sort_order = 'desc',
        from = 0,
        size = 20
      } = filters;

      // Build WHERE conditions
      const conditions: string[] = [];
      const params: any[] = [];
      let paramCounter = 1;

      // Transaction type filter
      if (transaction_type !== 'all') {
        conditions.push(`transaction_type = $${paramCounter}`);
        params.push(transaction_type);
        paramCounter++;
      }

      // Property types filter (case-insensitive)
      if (property_types && property_types.length > 0) {
        conditions.push(`LOWER(property_type) = ANY($${paramCounter})`);
        params.push(property_types.map((t: string) => t.toLowerCase()));
        paramCounter++;
      }

      // Price range
      if (min_price !== undefined) {
        conditions.push(`price >= $${paramCounter}`);
        params.push(min_price);
        paramCounter++;
      }
      if (max_price !== undefined) {
        conditions.push(`price <= $${paramCounter}`);
        params.push(max_price);
        paramCounter++;
      }

      // Bedrooms filter
      if (bedrooms) {
        conditions.push(`bedrooms >= $${paramCounter}`);
        params.push(bedrooms);
        paramCounter++;
      }

      // Bathrooms filter
      if (bathrooms) {
        conditions.push(`bathrooms >= $${paramCounter}`);
        params.push(bathrooms);
        paramCounter++;
      }

      // Parking spaces filter
      if (filters.parking_spaces) {
        conditions.push(`parking_spaces >= $${paramCounter}`);
        params.push(filters.parking_spaces);
        paramCounter++;
      }

      // Listed within days filter
      if (filters.listed_within_days) {
        conditions.push(`listed_at >= NOW() - INTERVAL '${parseInt(String(filters.listed_within_days))} days'`);
      }

      // Location filters (normalize spaces/underscores/case for PM enums vs CRM text)
      if (region) {
        conditions.push(`LOWER(REPLACE(region, ' ', '_')) = LOWER(REPLACE($${paramCounter}, ' ', '_'))`);
        params.push(region);
        paramCounter++;
      }
      if (city) {
        conditions.push(`LOWER(city) = LOWER($${paramCounter})`);
        params.push(city);
        paramCounter++;
      }
      if (neighborhood) {
        conditions.push(`neighborhood = $${paramCounter}`);
        params.push(neighborhood);
        paramCounter++;
      }

      // Full-text search
      let searchCondition = '';
      if (query) {
        searchCondition = `AND (
          title ILIKE $${paramCounter} OR
          description ILIKE $${paramCounter} OR
          address ILIKE $${paramCounter} OR
          city ILIKE $${paramCounter} OR
          digital_address ILIKE $${paramCounter}
        )`;
        params.push(`%${query}%`);
        paramCounter++;
      }

      // Geospatial filter - radius search
      let geoCondition = '';
      let geoOrderBy = '';
      if (geo_radius) {
        geoCondition = `AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($${paramCounter}, $${paramCounter + 1}), 4326)::geography,
          $${paramCounter + 2}
        )`;
        params.push(geo_radius.longitude, geo_radius.latitude, geo_radius.radius_km * 1000); // Convert km to meters
        paramCounter += 3;
        
        if (sort_by === 'distance') {
          geoOrderBy = `ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}), 4326)::geography)`;
        }
      }

      // Geospatial filter - bounding box
      if (geo_bbox && !geo_radius) {
        geoCondition = `AND geom && ST_MakeEnvelope($${paramCounter}, $${paramCounter + 1}, $${paramCounter + 2}, $${paramCounter + 3}, 4326)`;
        params.push(
          geo_bbox.top_left.lon,
          geo_bbox.top_left.lat,
          geo_bbox.bottom_right.lon,
          geo_bbox.bottom_right.lat
        );
        paramCounter += 4;
      }

      const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

      // Determine ORDER BY
      let orderBy = '';
      if (geoOrderBy) {
        orderBy = `ORDER BY ${geoOrderBy} ${sort_order.toUpperCase()}`;
      } else {
        const sortColumn = sort_by === 'views' ? 'views' : 
                          sort_by === 'created_at' ? 'listed_at' : 
                          'price';
        orderBy = `ORDER BY ${sortColumn} ${sort_order.toUpperCase()} NULLS LAST`;
      }

      // Combined query for PM and CRM properties
      // Dynamic filters are applied on the unified all_properties CTE
      // to avoid type mismatches between PM enums and CRM text columns
      const query_sql = `
        WITH pm_properties AS (
          SELECT 
            id,
            'pm'::text AS source,
            permanent_link_token,
            title,
            description,
            CASE property_type::text
              WHEN 'residential_house' THEN 'house'
              WHEN 'apartment_flat' THEN 'apartment'
              WHEN 'commercial_shop' THEN 'commercial'
              ELSE property_type::text
            END AS property_type,
            transaction_type::text AS transaction_type,
            address_street || ', ' || address_city AS address,
            address_city AS city,
            region::text,
            neighborhood,
            digital_address,
            latitude,
            longitude,
            geom,
            price AS price,
            price_currency::text AS currency,
            FALSE AS price_negotiable,
            bedrooms,
            bathrooms,
            total_area_sqm,
            total_units,
            NULL::integer AS parking_spaces,
            year_built,
            land_area_sqm,
            condition::text AS property_condition,
            CASE WHEN amenities IS NOT NULL AND jsonb_typeof(amenities) = 'array'
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(properties.amenities))
                 ELSE ARRAY[]::text[] END AS amenities,
            CASE WHEN features IS NOT NULL AND jsonb_typeof(features) = 'array'
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(properties.features))
                 ELSE ARRAY[]::text[] END AS features,
            marketplace_listed_at AS listed_at,
            marketplace_views AS views,
            marketplace_clicks AS clicks,
            image_urls AS images,
            video_url
          FROM properties
          WHERE organization_id IS NOT NULL
            AND marketplace_enabled = TRUE
            AND status IN ('active', 'under_offer')
            AND parent_property_id IS NULL
            AND ${LISTABLE_ORG_FILTER}
            AND ${PM_RIGHT_TO_LIST}
            AND ${PM_CONFLICT_GATE}
            AND ${PM_MODERATION_GATE}
        ),
        crm_props AS (
          SELECT 
            id,
            'crm'::text AS source,
            permanent_link_token,
            title,
            description,
            property_type,
            CASE 
              WHEN transaction_type = 'rental' THEN 'rental'::text
              ELSE 'sale'::text
            END AS transaction_type,
            address_street AS address,
            address_city AS city,
            region,
            neighborhood,
            NULL AS digital_address,
            latitude,
            longitude,
            geom,
            price,
            price_currency AS currency,
            price_negotiable,
            bedrooms,
            bathrooms,
            total_area_sqm,
            NULL::integer AS total_units,
            NULL::integer AS parking_spaces,
            year_built,
            land_area_sqm,
            NULL::text AS property_condition,
            CASE WHEN amenities IS NOT NULL AND jsonb_typeof(amenities) = 'array'
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(crm_properties.amenities))
                 ELSE ARRAY[]::text[] END AS amenities,
            CASE WHEN features IS NOT NULL AND jsonb_typeof(features) = 'array'
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(crm_properties.features))
                 ELSE ARRAY[]::text[] END AS features,
            marketplace_listed_at AS listed_at,
            marketplace_views AS views,
            marketplace_clicks AS clicks,
            images,
            video_url
          FROM crm_properties
          WHERE organization_id IS NOT NULL
            AND marketplace_enabled = TRUE
            AND status IN ('active', 'pending')
            AND ${LISTABLE_ORG_FILTER}
            AND ${CRM_RIGHT_TO_LIST}
            AND ${CRM_CONFLICT_GATE}
            AND ${CRM_MODERATION_GATE}
        ),
        all_properties AS (
          SELECT * FROM pm_properties
          UNION ALL
          SELECT * FROM crm_props
        )
        SELECT 
          *,
          COUNT(*) OVER() AS total_count,
          ${geo_radius ? `
            ST_Distance(
              geom::geography,
              ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}), 4326)::geography
            ) / 1000.0 AS distance_km
          ` : 'NULL AS distance_km'}
        FROM all_properties
        WHERE 1=1
        ${whereClause}
        ${searchCondition}
        ${geoCondition}
        ${orderBy}
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;

      params.push(size, from);

      const propertiesResult = await db.query(query_sql, params);

      const properties: MarketplaceProperty[] = propertiesResult.rows.map(row => ({
        id: row.id,
        source: row.source,
        permanent_link_token: row.permanent_link_token,
        title: row.title,
        description: row.description,
        property_type: row.property_type,
        transaction_type: row.transaction_type,
        address: row.address,
        city: row.city,
        region: row.region,
        neighborhood: row.neighborhood,
        digital_address: row.digital_address,
        location: row.latitude && row.longitude ? {
          lat: parseFloat(row.latitude),
          lon: parseFloat(row.longitude)
        } : null,
        price: parseFloat(row.price),
        currency: row.currency,
        price_negotiable: row.price_negotiable,
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        total_area_sqm: row.total_area_sqm,
        total_units: row.total_units || null,
        parking_spaces: row.parking_spaces || null,
        year_built: row.year_built || null,
        land_area_sqm: row.land_area_sqm ? parseFloat(row.land_area_sqm) : null,
        property_condition: row.property_condition || null,
        amenities: row.amenities || [],
        features: row.features || [],
        images: (row.images || []).map((img: any) => {
          if (typeof img === 'string') {
            return { url: img, id: img };
          }
          return { id: img.id || '', url: img.url || '', original_name: img.original_name || '' };
        }),
        video_url: row.video_url || null,
        listed_at: row.listed_at,
        views: row.views,
        clicks: row.clicks,
        distance_km: row.distance_km ? parseFloat(row.distance_km) : undefined
      }));

      // Resolve any s3:// video refs to ready-to-play (presigned) URLs, same as images.
      await Promise.all(properties.map(async (p) => {
        if (p.video_url) p.video_url = await this.resolveImageUrl(p.video_url);
      }));

      return {
        total: propertiesResult.rows.length > 0 ? parseInt(propertiesResult.rows[0].total_count) : 0,
        properties: await this.enrichPmPropertyImages(properties)
      };

    } catch (error: any) {
      logger.error('Error searching marketplace properties:', {
        error: error.message,
        stack: error.stack,
        filters
      });
      throw error;
    }
  }

  /**
   * Get a single property by permanent token
   */
  async getPropertyByToken(token: string): Promise<MarketplaceProperty | null> {
    try {
      // Try PM properties first
      const pmQuery = `
        SELECT 
          id, 'pm' AS source, permanent_link_token, title, description,
          property_type, transaction_type::text AS transaction_type,
          address_street || ', ' || address_city AS address,
          address_city AS city, region, neighborhood, digital_address,
          latitude, longitude, price, price_currency AS currency,
          FALSE AS price_negotiable, bedrooms, bathrooms, total_area_sqm,
          total_units,
          NULL::integer AS parking_spaces, year_built, land_area_sqm,
          condition::text AS property_condition,
          marketplace_listed_at AS listed_at, marketplace_views AS views,
          marketplace_clicks AS clicks,
          image_urls AS images,
          video_url
        FROM properties
        WHERE permanent_link_token = $1
          AND organization_id IS NOT NULL
          AND marketplace_enabled = TRUE
          AND status IN ('active', 'under_offer')
          AND ${LISTABLE_ORG_FILTER}
          AND ${PM_RIGHT_TO_LIST}
            AND ${PM_CONFLICT_GATE}
            AND ${PM_MODERATION_GATE}
      `;

      const crmQuery = `
        SELECT 
          id, 'crm' AS source, permanent_link_token, title, description,
          property_type,
          CASE WHEN transaction_type = 'rental' THEN 'rental' ELSE 'sale' END AS transaction_type,
          address_street AS address, address_city AS city, region, neighborhood,
          NULL AS digital_address, latitude, longitude, price,
          price_currency AS currency, price_negotiable, bedrooms, bathrooms,
          total_area_sqm,
          NULL::integer AS total_units,
          NULL::integer AS parking_spaces, year_built, land_area_sqm,
          NULL::text AS property_condition,
          marketplace_listed_at AS listed_at, marketplace_views AS views,
          marketplace_clicks AS clicks,
          images,
          video_url
        FROM crm_properties
        WHERE permanent_link_token = $1
          AND organization_id IS NOT NULL
          AND marketplace_enabled = TRUE
          AND status IN ('active', 'pending')
          AND ${LISTABLE_ORG_FILTER}
          AND ${CRM_RIGHT_TO_LIST}
            AND ${CRM_CONFLICT_GATE}
            AND ${CRM_MODERATION_GATE}
      `;

      const pmResult = await db.query(pmQuery, [token]);
      if (pmResult.rows.length > 0) {
        const row = pmResult.rows[0];
        const [property] = await this.enrichPmPropertyImages([this.mapRowToProperty(row)]);
        if (property?.video_url) property.video_url = await this.resolveImageUrl(property.video_url);
        return property;
      }

      const crmResult = await db.query(crmQuery, [token]);
      if (crmResult.rows.length > 0) {
        const row = crmResult.rows[0];
        const property = this.mapRowToProperty(row);
        if (property.video_url) property.video_url = await this.resolveImageUrl(property.video_url);
        return property;
      }

      return null;
    } catch (error: any) {
      logger.error('Error getting property by token:', {
        error: error.message,
        token
      });
      throw error;
    }
  }

  /**
   * Track marketplace analytics event
   */
  async trackEvent(event: {
    property_source: 'pm' | 'crm';
    property_id: string;
    event_type: 'view' | 'click' | 'apply' | 'inquiry' | 'favorite' | 'share';
    session_id: string;
    user_id?: string;
    ip_address?: string;
    user_agent?: string;
    search_query?: string;
    search_filters?: any;
    user_latitude?: number;
    user_longitude?: number;
  }): Promise<void> {
    try {
      const query = `
        INSERT INTO marketplace_analytics (
          property_source, property_id, event_type, session_id,
          user_id, ip_address, user_agent, search_query, search_filters,
          user_latitude, user_longitude
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      await db.query(query, [
        event.property_source,
        event.property_id,
        event.event_type,
        event.session_id,
        event.user_id || null,
        event.ip_address || null,
        event.user_agent || null,
        event.search_query || null,
        event.search_filters ? JSON.stringify(event.search_filters) : null,
        event.user_latitude || null,
        event.user_longitude || null
      ]);

      // Also increment counter on property table
      if (event.event_type === 'view') {
        await this.incrementViews(event.property_source, event.property_id);
      } else if (event.event_type === 'click') {
        await this.incrementClicks(event.property_source, event.property_id);
      }

    } catch (error: any) {
      logger.error('Error tracking marketplace event:', {
        error: error.message,
        event
      });
      // Don't throw - analytics shouldn't break the user experience
    }
  }

  private async incrementViews(source: 'pm' | 'crm', propertyId: string): Promise<void> {
    const table = source === 'pm' ? 'properties' : 'crm_properties';
    await db.query(`UPDATE ${table} SET marketplace_views = marketplace_views + 1 WHERE id = $1`, [propertyId]);
  }

  private async incrementClicks(source: 'pm' | 'crm', propertyId: string): Promise<void> {
    const table = source === 'pm' ? 'properties' : 'crm_properties';
    await db.query(`UPDATE ${table} SET marketplace_clicks = marketplace_clicks + 1 WHERE id = $1`, [propertyId]);
  }

  private mapRowToProperty(row: any): MarketplaceProperty {
    return {
      id: row.id,
      source: row.source,
      permanent_link_token: row.permanent_link_token,
      title: row.title,
      description: row.description,
      property_type: row.property_type,
      transaction_type: row.transaction_type,
      address: row.address,
      city: row.city,
      region: row.region,
      neighborhood: row.neighborhood,
      digital_address: row.digital_address,
      location: row.latitude && row.longitude ? {
        lat: parseFloat(row.latitude),
        lon: parseFloat(row.longitude)
      } : null,
      price: parseFloat(row.price),
      currency: row.currency,
      price_negotiable: row.price_negotiable,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      total_area_sqm: row.total_area_sqm,
      total_units: row.total_units ?? null,
      parking_spaces: row.parking_spaces || null,
      year_built: row.year_built || null,
      land_area_sqm: row.land_area_sqm ? parseFloat(row.land_area_sqm) : null,
      property_condition: row.property_condition || null,
      amenities: [],
      features: [],
      images: (row.images || []).map((img: any) => {
        if (typeof img === 'string') {
          return { url: img, id: img };
        }
        return { id: img.id || '', url: img.url || '', original_name: img.original_name || '' };
      }),
      video_url: row.video_url || null,
      listed_at: row.listed_at,
      views: row.views,
      clicks: row.clicks
    };
  }
}

export const marketplaceService = new MarketplaceService();
