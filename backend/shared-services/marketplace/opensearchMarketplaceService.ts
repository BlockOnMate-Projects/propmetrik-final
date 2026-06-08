// OpenSearch-based Marketplace Search Service
// Falls through to PostgreSQL (marketplaceService) on any error
import { opensearchClient, indices } from '../../src/database/opensearch';
import { SearchFilters, MarketplaceProperty } from './marketplaceService';
import { logger } from '../../src/utils/logger';

interface OpenSearchHit {
  _id: string;
  _score: number;
  _source: Record<string, any>;
  sort?: any[];
}

interface OpenSearchSearchResponse {
  body: {
    hits: {
      total: { value: number };
      hits: OpenSearchHit[];
    };
    aggregations?: Record<string, any>;
  };
}

interface SearchResult {
  total: number;
  properties: MarketplaceProperty[];
  aggregations?: {
    property_types: Array<{ key: string; doc_count: number }>;
    regions: Array<{ key: string; doc_count: number }>;
  };
}

class OpenSearchMarketplaceService {
  private readonly indexName = indices.properties;

  /**
   * Search marketplace properties via OpenSearch.
   * Throws on any error so the controller can fall back to PostgreSQL.
   */
  async search(filters: SearchFilters): Promise<SearchResult> {
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
      geo_radius,
      geo_bbox,
      sort_by = 'created_at',
      sort_order = 'desc',
      from = 0,
      size = 20,
    } = filters;

    // --- Build bool query ---
    const must: Record<string, any>[] = [];
    const filter: Record<string, any>[] = [];

    // Full-text search across key fields
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: [
            'title^3',
            'description',
            'address_raw^2',
            'neighborhood^2',
            'district',
            'region',
            'ghana_post_gps',
          ],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Transaction type
    if (transaction_type && transaction_type !== 'all') {
      filter.push({ term: { transaction_type } });
    }

    // Property types
    if (property_types && property_types.length > 0) {
      filter.push({ terms: { property_type: property_types } });
    }

    // Price range
    const priceRange: Record<string, number> = {};
    if (min_price !== undefined) priceRange.gte = min_price;
    if (max_price !== undefined) priceRange.lte = max_price;
    if (Object.keys(priceRange).length > 0) {
      filter.push({ range: { price_ghs: priceRange } });
    }

    // Bedrooms (gte)
    if (bedrooms !== undefined && bedrooms > 0) {
      filter.push({ range: { bedrooms: { gte: bedrooms } } });
    }

    // Bathrooms (gte)
    if (bathrooms !== undefined && bathrooms > 0) {
      filter.push({ range: { bathrooms: { gte: bathrooms } } });
    }

    // Parking spaces (gte) - check for filter property even though not in interface yet
    const parkingSpaces = (filters as any).parking_spaces;
    if (parkingSpaces !== undefined && parkingSpaces > 0) {
      filter.push({ range: { parking_spaces: { gte: parkingSpaces } } });
    }

    // Amenities
    if (amenities && amenities.length > 0) {
      filter.push({ terms: { amenities } });
    }

    // Region
    if (region) {
      filter.push({ term: { region } });
    }

    // Geo-distance radius search
    if (geo_radius) {
      filter.push({
        geo_distance: {
          distance: `${geo_radius.radius_km}km`,
          location: {
            lat: geo_radius.latitude,
            lon: geo_radius.longitude,
          },
        },
      });
    }

    // Geo bounding box
    if (geo_bbox) {
      filter.push({
        geo_bounding_box: {
          location: {
            top_left: geo_bbox.top_left,
            bottom_right: geo_bbox.bottom_right,
          },
        },
      });
    }

    // Listed within days
    const listedWithinDays = (filters as any).listed_within_days;
    if (listedWithinDays !== undefined && listedWithinDays > 0) {
      filter.push({
        range: {
          listed_date: {
            gte: `now-${listedWithinDays}d/d`,
          },
        },
      });
    }

    // If no must clauses, use match_all
    if (must.length === 0) {
      must.push({ match_all: {} });
    }

    const boolQuery: Record<string, any> = { must, filter };

    // --- Sorting ---
    const sort = this.buildSort(sort_by, sort_order, geo_radius);

    // --- Aggregations ---
    const aggs = {
      property_types: {
        terms: { field: 'property_type', size: 50 },
      },
      regions: {
        terms: { field: 'region', size: 50 },
      },
    };

    // --- Execute search ---
    logger.debug('OpenSearch marketplace query', {
      index: this.indexName,
      from,
      size,
      query: JSON.stringify(boolQuery),
    });

    const response: OpenSearchSearchResponse = await opensearchClient.search({
      index: this.indexName,
      body: {
        query: { bool: boolQuery },
        from,
        size,
        sort,
        aggs,
      },
    });

    const total = response.body.hits.total.value;
    const hits = response.body.hits.hits;

    const properties: MarketplaceProperty[] = hits.map((hit) =>
      this.mapHitToProperty(hit, geo_radius)
    );

    // Extract aggregations
    const rawAggs = response.body.aggregations;
    const aggregations = rawAggs
      ? {
          property_types: (rawAggs.property_types?.buckets || []).map(
            (b: any) => ({ key: b.key, doc_count: b.doc_count })
          ),
          regions: (rawAggs.regions?.buckets || []).map((b: any) => ({
            key: b.key,
            doc_count: b.doc_count,
          })),
        }
      : undefined;

    return { total, properties, aggregations };
  }

  /**
   * Look up a single property by its permanent_link_token.
   * Returns null if not found; throws on connection/query errors.
   */
  async getPropertyByToken(token: string): Promise<MarketplaceProperty | null> {
    const response: OpenSearchSearchResponse = await opensearchClient.search({
      index: this.indexName,
      body: {
        query: {
          term: { permanent_link_token: token },
        },
        size: 1,
      },
    });

    const hits = response.body.hits.hits;
    if (hits.length === 0) {
      return null;
    }

    return this.mapHitToProperty(hits[0]);
  }

  // ─── Private helpers ────────────────────────────────────────────

  private buildSort(
    sortBy: string | undefined,
    sortOrder: 'asc' | 'desc' = 'desc',
    geoRadius?: SearchFilters['geo_radius']
  ): Array<Record<string, any>> {
    const order = sortOrder;

    switch (sortBy) {
      case 'price':
        return [{ price_ghs: { order } }, { _score: 'desc' }];

      case 'created_at':
        return [{ listed_date: { order } }, { _score: 'desc' }];

      case 'views':
        // No dedicated views field in the index; fall back to relevance score
        return [{ _score: order }];

      case 'distance':
        if (geoRadius) {
          return [
            {
              _geo_distance: {
                location: {
                  lat: geoRadius.latitude,
                  lon: geoRadius.longitude,
                },
                order,
                unit: 'km',
              },
            },
            { _score: 'desc' },
          ];
        }
        return [{ _score: 'desc' }];

      default:
        return [{ _score: 'desc' }, { listed_date: 'desc' }];
    }
  }

  /**
   * Map an OpenSearch hit back into a MarketplaceProperty.
   */
  private mapHitToProperty(
    hit: OpenSearchHit,
    geoRadius?: SearchFilters['geo_radius']
  ): MarketplaceProperty {
    const src = hit._source;

    // Distance is present in sort values when geo_distance sort is used
    let distanceKm: number | undefined;
    if (geoRadius && hit.sort && typeof hit.sort[0] === 'number') {
      distanceKm = hit.sort[0];
    }

    // Normalise location
    let location: { lat: number; lon: number } | null = null;
    if (src.location) {
      if (typeof src.location === 'object' && src.location.lat != null) {
        location = { lat: src.location.lat, lon: src.location.lon };
      } else if (typeof src.location === 'string') {
        // "lat,lon" format
        const [lat, lon] = src.location.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lon)) {
          location = { lat, lon };
        }
      }
    }

    return {
      id: hit._id,
      source: src.source || 'pm',
      permanent_link_token: src.permanent_link_token || '',
      title: src.title || '',
      description: src.description || null,
      property_type: src.property_type || '',
      transaction_type: src.transaction_type || 'sale',
      address: src.address_raw || src.address_standardized?.full || '',
      city: src.district || '',
      region: src.region || '',
      neighborhood: src.neighborhood || null,
      digital_address: src.ghana_post_gps || null,
      location,
      price: src.price_ghs || 0,
      currency: src.currency || 'GHS',
      price_negotiable: src.price_negotiable ?? null,
      bedrooms: src.bedrooms || 0,
      bathrooms: src.bathrooms || 0,
      total_area_sqm: src.land_area_sqm || src.built_area_sqm || null,
      total_units: src.total_units ?? null,
      parking_spaces: src.parking_spaces ?? null,
      year_built: src.year_built ?? null,
      land_area_sqm: src.land_area_sqm ?? null,
      property_condition: src.property_condition ?? null,
      amenities: src.amenities || [],
      features: src.features || [],
      images: (src.images || []).map((img: any) => {
        if (typeof img === 'string') {
          return { url: img, caption: null };
        }
        return { url: img.url || '', caption: img.caption || null };
      }),
      listed_at: src.listed_date || src.created_at || '',
      views: src.views || 0,
      clicks: src.clicks || 0,
      distance_km: distanceKm,
      relevance_score: hit._score ?? undefined,
    };
  }
}

export const opensearchMarketplaceService = new OpenSearchMarketplaceService();
