// Marketplace Controller - Handles marketplace API requests
// Uses OpenSearch as primary search engine with PostgreSQL fallback
import { Request, Response } from 'express';
import { marketplaceService } from '../../../shared-services/marketplace/marketplaceService';
import { opensearchMarketplaceService } from '../../../shared-services/marketplace/opensearchMarketplaceService';
import { geocodingService } from '../../../shared-services/marketplace/geocodingService';
import { neighborhoodInsightsService } from '../../../shared-services/marketplace/neighborhoodInsightsService';
import { applicationService } from '../../services/property-management/applications/applicationService';
import db from '../../database';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getServiceBranding, type ServiceType } from '../../services/branding/serviceBrandingService';

/**
 * Resolve the "Listed by" company branding for a public marketplace listing.
 * PM listings surface the org's Property Management branding; CRM listings surface the
 * CRM branding — the same per-org branding a firm configures in its service Settings.
 * Best-effort: never throws (a listing must still render if branding lookup fails).
 */
async function resolveListingBranding(
  source: 'pm' | 'crm',
  token: string
): Promise<Record<string, any> | null> {
  try {
    const service: ServiceType = source === 'pm' ? 'property_management' : 'crm';
    const table = source === 'pm' ? 'properties' : 'crm_properties';
    const orgRes = await db.query(
      `SELECT p.organization_id, o.name AS organization_name,
              o.is_verified, o.is_platform_org, o.is_active, o.verified_at,
              EXISTS (SELECT 1 FROM listing_mandates lm LEFT JOIN esign_envelopes e ON e.id = lm.envelope_id
                       WHERE lm.property_source = $2 AND lm.property_id = p.id
                         AND (lm.expires_at IS NULL OR lm.expires_at > NOW())
                         AND (lm.kind = 'self_attested' OR e.status = 'completed')) AS has_mandate
         FROM ${table} p
         JOIN organizations o ON o.id = p.organization_id
        WHERE p.permanent_link_token = $1
        LIMIT 1`,
      [token, source]
    );
    const orgRow = orgRes.rows[0];
    if (!orgRow?.organization_id) return null;

    // A listing only reaches the public marketplace when its org is verified (Gate A),
    // so `verified` is effectively always true here — but compute it explicitly so the
    // badge is driven by the real flag, not a cosmetic default.
    const verified = !!(orgRow.is_active && (orgRow.is_verified || orgRow.is_platform_org));

    const b = (await getServiceBranding(orgRow.organization_id, service)) || ({} as Record<string, any>);
    return {
      organization_id: orgRow.organization_id,
      service,
      // Prefer the service branding name; fall back to the organization's real name.
      company_name: b.name || orgRow.organization_name || null,
      tagline: b.tagline || null,
      phone: b.phone || null,
      email: b.email || null,
      website: b.website || null,
      city: b.city || null,
      region: b.region || null,
      professional_body: b.professional_body || null,
      license_number: b.license_number || null,
      primary_color: b.primary_color || null,
      logo_url: b.logo_key ? `/api/branding/logo/${orgRow.organization_id}/${service}` : null,
      configured: !!b.configured,
      verified,
      verified_at: orgRow.verified_at || null,
      owner_authorized: !!(orgRow.is_platform_org || orgRow.has_mandate),
    };
  } catch (err: any) {
    logger.warn('Listing branding resolve failed', { token, source, error: err?.message });
    return null;
  }
}

export class MarketplaceController {
  /**
   * Search properties - Main marketplace search endpoint
   * POST /api/v1/marketplace/search
   *
   * Uses OpenSearch as primary search engine for better full-text search,
   * geospatial queries, and aggregations. Falls back to PostgreSQL on error.
   */
  async searchProperties(req: Request, res: Response) {
    try {
      const filters = req.body;
      let result: { total: number; properties: any[]; aggregations?: any };
      let searchEngine = 'opensearch';

      try {
        // OpenSearch holds scraped external listings; PM-managed listings live only in
        // Postgres. Run both and merge so dashboard-created properties (incl. multi-unit
        // buildings — child units are filtered out in marketplaceService) appear in search.
        const osResult = await opensearchMarketplaceService.search(filters);

        let pmResult: { total: number; properties: any[]; aggregations?: any } = { total: 0, properties: [] };
        try {
          pmResult = await marketplaceService.searchProperties(filters);
        } catch (pmError: any) {
          logger.warn('PM (PostgreSQL) marketplace search failed during merge:', { error: pmError.message });
        }

        // PM listings first, then OpenSearch results, deduped by id
        const seen = new Set<string>();
        const mergedProperties: any[] = [];
        for (const p of [...pmResult.properties, ...osResult.properties]) {
          if (p?.id && seen.has(p.id)) continue;
          if (p?.id) seen.add(p.id);
          mergedProperties.push(p);
        }

        result = {
          total: osResult.total + pmResult.total,
          properties: mergedProperties,
          aggregations: osResult.aggregations,
        };
        searchEngine = pmResult.total > 0 ? 'opensearch+postgresql' : 'opensearch';
      } catch (osError: any) {
        // Fallback: PostgreSQL only (e.g. OpenSearch unavailable)
        logger.warn('OpenSearch search failed, falling back to PostgreSQL:', {
          error: osError.message
        });
        searchEngine = 'postgresql';
        result = await marketplaceService.searchProperties(filters);
      }

      result.properties = await marketplaceService.enrichPmPropertyImages(result.properties);

      return res.json({
        total: result.total,
        properties: result.properties,
        aggregations: result.aggregations || null,
        search_metadata: {
          from: filters.from || 0,
          size: filters.size || 20,
          engine: searchEngine
        }
      });
    } catch (error: any) {
      logger.error('Search properties error:', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Failed to search properties',
        message: error.message
      });
    }
  }

  /**
   * Get property by permanent token
   * GET /api/v1/marketplace/properties/:token
   *
   * Tries OpenSearch first, falls back to PostgreSQL.
   */
  async getPropertyByToken(req: Request, res: Response) {
    try {
      const { token } = req.params;
      let property;

      try {
        // Primary: OpenSearch
        property = await opensearchMarketplaceService.getPropertyByToken(token);
      } catch (osError: any) {
        logger.warn('OpenSearch getPropertyByToken failed, falling back to PostgreSQL:', {
          error: osError.message
        });
        property = null;
      }

      // Fallback: PostgreSQL (also used if OpenSearch returns null)
      if (!property) {
        property = await marketplaceService.getPropertyByToken(token);
      }

      if (!property) {
        return res.status(404).json({
          error: 'Property not found'
        });
      }

      // Track view event
      const session_id = req.headers['x-session-id'] as string || 'anonymous';
      await marketplaceService.trackEvent({
        property_source: property.source,
        property_id: property.id,
        event_type: 'view',
        session_id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Attach the listing company's public branding ("Listed by …").
      (property as any).listing = await resolveListingBranding(property.source, token);

      return res.json(property);
    } catch (error: any) {
      logger.error('Get property by token error:', {
        error: error.message,
        token: req.params.token
      });
      return res.status(500).json({
        error: 'Failed to fetch property',
        message: error.message
      });
    }
  }

  /**
   * Get similar properties
   * GET /api/v1/marketplace/properties/:token/similar
   *
   * Returns properties similar to the given one based on type, price range,
   * location, and bedrooms. Uses OpenSearch with PostgreSQL fallback.
   */
  async getSimilarProperties(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const limit = parseInt(req.query.limit as string) || 6;

      // First get the reference property
      let property;
      try {
        property = await opensearchMarketplaceService.getPropertyByToken(token);
      } catch {
        property = null;
      }
      // Fall back to the DB when OpenSearch has no hit (returns null without throwing,
      // e.g. a newly created property that hasn't been indexed yet).
      if (!property) {
        property = await marketplaceService.getPropertyByToken(token);
      }

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Search for similar properties
      const priceVariance = property.price * 0.3; // ±30% price range
      const similarFilters = {
        transaction_type: property.transaction_type as 'rental' | 'sale' | 'lease',
        property_types: [property.property_type],
        min_price: Math.max(0, property.price - priceVariance),
        max_price: property.price + priceVariance,
        bedrooms: property.bedrooms > 0 ? Math.max(1, property.bedrooms - 1) : undefined,
        region: property.region || undefined,
        geo_radius: property.location ? {
          latitude: property.location.lat,
          longitude: property.location.lon,
          radius_km: 15
        } : undefined,
        sort_by: property.location ? 'distance' as const : 'created_at' as const,
        sort_order: property.location ? 'asc' as const : 'desc' as const,
        from: 0,
        size: limit + 1 // Fetch one extra to filter out the current property
      };

      let result;
      try {
        result = await opensearchMarketplaceService.search(similarFilters);
      } catch {
        result = await marketplaceService.searchProperties(similarFilters);
      }

      // Filter out the current property and limit
      const similar = result.properties
        .filter(p => p.permanent_link_token !== token)
        .slice(0, limit);

      return res.json({
        total: similar.length,
        properties: similar
      });
    } catch (error: any) {
      logger.error('Get similar properties error:', {
        error: error.message,
        token: req.params.token
      });
      return res.status(500).json({
        error: 'Failed to fetch similar properties',
        message: error.message
      });
    }
  }

  /**
   * Get nearby homes — the geographically CLOSEST public listings, regardless of
   * type or price (distinct from /similar, which matches property type + price band).
   * GET /api/v1/marketplace/properties/:token/nearby
   *
   * Reuses the gated marketplace search (so only already-public listings surface —
   * never private data-hub properties), filtered by radius only + distance-sorted.
   */
  async getNearbyHomes(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const limit = parseInt(req.query.limit as string) || 6;

      let property;
      try { property = await opensearchMarketplaceService.getPropertyByToken(token); } catch { property = null; }
      if (!property) property = await marketplaceService.getPropertyByToken(token);
      if (!property) return res.status(404).json({ error: 'Property not found' });

      // Needs coordinates to rank by distance; nothing to show otherwise.
      if (!property.location) return res.json({ total: 0, properties: [] });

      const nearbyFilters = {
        geo_radius: {
          latitude: property.location.lat,
          longitude: property.location.lon,
          // Wide radius: the verified-org listing pool is sparse, so "nearby" means the
          // closest AVAILABLE public listings (distance-sorted, capped) — the distance
          // badge on each card keeps it honest.
          radius_km: 25,
        },
        sort_by: 'distance' as const,
        sort_order: 'asc' as const,
        from: 0,
        size: limit + 1, // one extra to drop the current property
      };

      // Query the gated marketplace (Postgres) search DIRECTLY — it holds the verified
      // public listings. The old copy queried OpenSearch first (which only has scraped
      // external listings, not PM/CRM ones) and only fell back to Postgres on a thrown
      // error, so it returned empty for real listings. Postgres already returns them
      // distance-sorted; scraped/ungated externals are intentionally not shown here.
      const result = await marketplaceService
        .searchProperties(nearbyFilters)
        .catch(() => ({ total: 0, properties: [] as any[] }));
      const nearby = result.properties
        .filter((p) => p.permanent_link_token !== token)
        .slice(0, limit);

      return res.json({ total: nearby.length, properties: nearby });
    } catch (error: any) {
      logger.error('Get nearby homes error:', { error: error.message, token: req.params.token });
      return res.status(500).json({ error: 'Failed to fetch nearby homes', message: error.message });
    }
  }

  /**
   * Location autocomplete
   * GET /api/v1/marketplace/autocomplete
   */
  async autocomplete(req: Request, res: Response) {
    try {
      const { q, country = 'GH', types = 'place,locality,neighborhood', limit = 5 } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }
      
      const suggestions = await geocodingService.autocomplete(
        q as string,
        country as string,
        types as string,
        undefined,
        parseInt(limit as string)
      );
      
      return res.json({ suggestions });
    } catch (error: any) {
      logger.error('Autocomplete error:', { error: error.message });
      return res.status(500).json({
        error: 'Autocomplete failed',
        message: error.message
      });
    }
  }

  /**
   * Forward geocoding
   * POST /api/v1/marketplace/geocode
   */
  async geocode(req: Request, res: Response) {
    try {
      const { address, country = 'GH' } = req.body;
      
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      
      const result = await geocodingService.geocode(address, country);
      
      if (!result) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      return res.json(result);
    } catch (error: any) {
      logger.error('Geocode error:', { error: error.message });
      return res.status(500).json({
        error: 'Geocoding failed',
        message: error.message
      });
    }
  }

  /**
   * Reverse geocoding
   * GET /api/v1/marketplace/reverse-geocode
   */
  async reverseGeocode(req: Request, res: Response) {
    try {
      const { lat, lng } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
      }
      
      const result = await geocodingService.reverseGeocode(
        parseFloat(lat as string),
        parseFloat(lng as string)
      );
      
      if (!result) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      return res.json(result);
    } catch (error: any) {
      logger.error('Reverse geocode error:', { error: error.message });
      return res.status(500).json({
        error: 'Reverse geocoding failed',
        message: error.message
      });
    }
  }

  /**
   * Get nearby amenities
   * GET /api/v1/marketplace/nearby-amenities
   */
  async getNearbyAmenities(req: Request, res: Response) {
    try {
      const { lat, lng, radius_km = 2, types = 'school,hospital,transit' } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
      }
      
      const amenities = await geocodingService.getNearbyAmenities(
        parseFloat(lat as string),
        parseFloat(lng as string),
        parseFloat(radius_km as string),
        (types as string).split(',')
      );
      
      return res.json({ amenities });
    } catch (error: any) {
      logger.error('Get nearby amenities error:', { error: error.message });
      return res.status(500).json({
        error: 'Failed to fetch nearby amenities',
        message: error.message
      });
    }
  }

  /**
   * Neighbourhood insights for a listing (Zillow-style): nearby schools/hospitals/
   * transit, walk/transit/bike scores, flood risk, and area demographics.
   * GET /api/v1/marketplace/properties/:token/neighborhood
   */
  async getNeighborhood(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const data = await neighborhoodInsightsService.getInsights(token);
      if (!data) {
        return res.status(404).json({ error: 'Property not found' });
      }
      return res.json({ data });
    } catch (error: any) {
      logger.error('Get neighborhood insights error:', { error: error.message, token: req.params.token });
      return res.status(500).json({ error: 'Failed to fetch neighborhood insights', message: error.message });
    }
  }

  /**
   * AI-generated neighbourhood narrative (strictly grounded on the facts above).
   * GET /api/v1/marketplace/properties/:token/neighborhood/narrative
   */
  async getNeighborhoodNarrative(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const data = await neighborhoodInsightsService.getNarrative(token);
      return res.json({ data });
    } catch (error: any) {
      logger.error('Get neighborhood narrative error:', { error: error.message, token: req.params.token });
      // A missing narrative must never break the page — degrade gracefully.
      return res.json({ data: { summary: null } });
    }
  }

  /**
   * Track marketplace event
   * POST /api/v1/marketplace/analytics/track
   */
  async trackEvent(req: Request, res: Response) {
    try {
      const {
        property_source,
        property_id,
        event_type,
        session_id,
        search_query,
        search_filters,
        user_latitude,
        user_longitude
      } = req.body;
      
      if (!property_source || !property_id || !event_type || !session_id) {
        return res.status(400).json({
          error: 'Missing required fields: property_source, property_id, event_type, session_id'
        });
      }
      
      await marketplaceService.trackEvent({
        property_source,
        property_id,
        event_type,
        session_id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        search_query,
        search_filters,
        user_latitude,
        user_longitude
      });
      
      return res.json({ success: true });
    } catch (error: any) {
      logger.error('Track event error:', { error: error.message });
      // Don't fail the request - analytics shouldn't break user experience
      return res.json({ success: false, error: error.message });
    }
  }

  /**
   * Get or create application link for marketplace property
   * GET /api/v1/marketplace/properties/:token/application-link
   * 
   * This creates an application link that redirects to the tenant portal
   */
  async getApplicationLink(req: Request, res: Response) {
    try {
      const { token } = req.params;
      
      // Get the marketplace property
      const property = await marketplaceService.getPropertyByToken(token);
      
      if (!property) {
        return res.status(404).json({
          error: 'Property not found'
        });
      }
      
      // Only PM properties can have applications (CRM properties are leads, not managed properties)
      if (property.source !== 'pm') {
        return res.status(400).json({
          error: 'Applications are only available for property management listings'
        });
      }
      
      // Get the organization_id for this property
      const propertyQuery = `
        SELECT organization_id 
        FROM properties 
        WHERE id = $1 AND organization_id IS NOT NULL
      `;
      const propertyResult = await db.query(propertyQuery, [property.id]);
      
      if (propertyResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Property organization not found'
        });
      }
      
      const organizationId = propertyResult.rows[0].organization_id;
      
      // Check if there's an active application link for this property
      const existingLinkQuery = `
        SELECT token 
        FROM application_links 
        WHERE property_id = $1 
          AND organization_id = $2 
          AND is_active = true 
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      const existingResult = await db.query(existingLinkQuery, [property.id, organizationId]);
      
      let applicationToken: string;
      
      if (existingResult.rows.length > 0) {
        // Reuse existing active link
        applicationToken = existingResult.rows[0].token;
        logger.info('Reusing existing application link', {
          property_id: property.id,
          token: applicationToken
        });
      } else {
        // Create new application link (30 days expiry, unlimited uses)
        const link = await applicationService.createApplicationLink(
          organizationId,
          {
            propertyId: property.id,
            applicationType: 'standard',
            expiresInDays: 30,
            maxUses: undefined // Unlimited uses
          },
          // created_by is a NOT NULL uuid column with no FK; use the nil UUID as the
          // "system / marketplace-generated" sentinel (a non-uuid string throws 22P02).
          '00000000-0000-0000-0000-000000000000'
        );
        
        applicationToken = link.token;
        logger.info('Created new application link', {
          property_id: property.id,
          token: applicationToken
        });
      }
      
      // Track that user clicked apply
      const session_id = req.headers['x-session-id'] as string || 'anonymous';
      await marketplaceService.trackEvent({
        property_source: property.source,
        property_id: property.id,
        event_type: 'apply',
        session_id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });
      
      return res.json({
        success: true,
        application_token: applicationToken,
        tenant_portal_url: `${config.app.frontendUrl}/tenant/apply/${applicationToken}`
      });
    } catch (error: any) {
      logger.error('Get application link error:', {
        error: error.message,
        stack: error.stack,
        token: req.params.token
      });
      return res.status(500).json({
        error: 'Failed to get application link',
        message: error.message
      });
    }
  }
}

export const marketplaceController = new MarketplaceController();
