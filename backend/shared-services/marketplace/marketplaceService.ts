// Marketplace Service - Aggregates PM and CRM properties for public marketplace
import db from '../../src/database';
import { logger } from '../../src/utils/logger';

export interface MarketplaceProperty {
  id: string;
  source: 'pm' | 'crm';
  permanent_link_token: string;
  
  // Basic info
  title: string;
  description: string | null;
  property_type: string;
  transaction_type: 'rental' | 'sale';
  
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
  parking_spaces: number | null;
  
  // Features & Amenities
  amenities: string[];
  features: string[];
  
  // Media
  images: Array<{
    url: string;
    caption: string | null;
  }>;
  
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
  transaction_type?: 'rental' | 'sale' | 'all';
  property_types?: string[];
  min_price?: number;
  max_price?: number;
  bedrooms?: number;
  bathrooms?: number;
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

      // Property types filter
      if (property_types && property_types.length > 0) {
        conditions.push(`property_type = ANY($${paramCounter})`);
        params.push(property_types);
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

      // Location filters
      if (region) {
        conditions.push(`region = $${paramCounter}`);
        params.push(region);
        paramCounter++;
      }
      if (city) {
        conditions.push(`city = $${paramCounter}`);
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
          city ILIKE $${paramCounter}
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

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
      const query_sql = `
        WITH pm_properties AS (
          SELECT 
            id,
            'pm'::text AS source,
            permanent_link_token,
            title,
            description,
            property_type::text,
            'rental'::text AS transaction_type,
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
            CASE WHEN amenities IS NOT NULL AND jsonb_typeof(amenities) = 'array' 
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(properties.amenities))
                 ELSE ARRAY[]::text[] END AS amenities,
            CASE WHEN features IS NOT NULL AND jsonb_typeof(features) = 'array' 
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(properties.features))
                 ELSE ARRAY[]::text[] END AS features,
            marketplace_listed_at AS listed_at,
            marketplace_views AS views,
            marketplace_clicks AS clicks
          FROM properties
          WHERE organization_id IS NOT NULL
            AND marketplace_enabled = TRUE
            AND status IN ('active', 'under_offer')
            AND (digital_address IS NOT NULL OR (latitude IS NOT NULL AND longitude IS NOT NULL))
          ${whereClause}
          ${searchCondition}
          ${geoCondition}
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
            CASE WHEN amenities IS NOT NULL AND jsonb_typeof(amenities) = 'array' 
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(crm_properties.amenities))
                 ELSE ARRAY[]::text[] END AS amenities,
            CASE WHEN features IS NOT NULL AND jsonb_typeof(features) = 'array' 
                 THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(crm_properties.features))
                 ELSE ARRAY[]::text[] END AS features,
            marketplace_listed_at AS listed_at,
            marketplace_views AS views,
            marketplace_clicks AS clicks
          FROM crm_properties
          WHERE organization_id IS NOT NULL
            AND marketplace_enabled = TRUE
            AND status IN ('active', 'pending')
            AND (digital_address IS NOT NULL OR (latitude IS NOT NULL AND longitude IS NOT NULL))
          ${whereClause}
          ${searchCondition}
          ${geoCondition}
        ),
        all_properties AS (
          SELECT * FROM pm_properties
          UNION ALL
          SELECT * FROM crm_props
        )
        SELECT 
          *,
          ${geo_radius ? `
            ST_Distance(
              geom::geography,
              ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}), 4326)::geography
            ) / 1000.0 AS distance_km
          ` : 'NULL AS distance_km'}
        FROM all_properties
        ${orderBy}
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;

      params.push(size, from);

      // Get total count
      const countQuery = `
        WITH pm_properties AS (
          SELECT id FROM properties
          WHERE organization_id IS NOT NULL
            AND marketplace_enabled = TRUE
            AND status IN ('active', 'under_offer')
            AND (digital_address IS NOT NULL OR (latitude IS NOT NULL AND longitude IS NOT NULL))
          ${whereClause}
          ${searchCondition}
          ${geoCondition}
        ),
        crm_props AS (
          SELECT id FROM crm_properties
          WHERE organization_id IS NOT NULL
            AND marketplace_enabled = TRUE
            AND status IN ('active', 'pending')
            AND (digital_address IS NOT NULL OR (latitude IS NOT NULL AND longitude IS NOT NULL))
          ${whereClause}
          ${searchCondition}
          ${geoCondition}
        )
        SELECT COUNT(*) as total FROM (
          SELECT id FROM pm_properties
          UNION ALL
          SELECT id FROM crm_props
        ) AS all_props
      `;

      const [propertiesResult, countResult] = await Promise.all([
        db.query(query_sql, params),
        db.query(countQuery, params.slice(0, -2)) // Exclude LIMIT and OFFSET params
      ]);

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
        parking_spaces: row.parking_spaces,
        amenities: row.amenities || [],
        features: row.features || [],
        images: [], // TODO: Implement image fetching
        listed_at: row.listed_at,
        views: row.views,
        clicks: row.clicks,
        distance_km: row.distance_km ? parseFloat(row.distance_km) : undefined
      }));

      return {
        total: parseInt(countResult.rows[0].total),
        properties
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
          property_type, 'rental' AS transaction_type,
          address_street || ', ' || address_city AS address,
          address_city AS city, region, neighborhood, digital_address,
          latitude, longitude, price, price_currency AS currency,
          FALSE AS price_negotiable, bedrooms, bathrooms, total_area_sqm,
          marketplace_listed_at AS listed_at, marketplace_views AS views,
          marketplace_clicks AS clicks
        FROM properties
        WHERE permanent_link_token = $1
          AND organization_id IS NOT NULL
          AND marketplace_enabled = TRUE
          AND status IN ('active', 'under_offer')
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
          marketplace_listed_at AS listed_at, marketplace_views AS views,
          marketplace_clicks AS clicks
        FROM crm_properties
        WHERE permanent_link_token = $1
          AND organization_id IS NOT NULL
          AND marketplace_enabled = TRUE
          AND status IN ('active', 'pending')
      `;

      const pmResult = await db.query(pmQuery, [token]);
      if (pmResult.rows.length > 0) {
        const row = pmResult.rows[0];
        return this.mapRowToProperty(row);
      }

      const crmResult = await db.query(crmQuery, [token]);
      if (crmResult.rows.length > 0) {
        const row = crmResult.rows[0];
        return this.mapRowToProperty(row);
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
      parking_spaces: row.parking_spaces,
      amenities: [],
      features: [],
      images: [],
      listed_at: row.listed_at,
      views: row.views,
      clicks: row.clicks
    };
  }
}

export const marketplaceService = new MarketplaceService();
