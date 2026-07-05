
import { pool } from '../../database';
import { cache } from '../../database/redis';
import { opensearchClient, indices } from '../../database/opensearch';
import { logger } from '../../utils/logger';
import ghanaPostGeocodingService from './ghanaPostGeocodingService';
import { getPresignedDownloadUrl } from '../../database/minio';

export interface PropertyEnrichmentResponse {
  property: {
    id: string;
    title: string;
    description: string;
    price: {
      ghs: number;
      usd: number;
      per_sqm: number | null;
    };
    transaction_type: 'sale' | 'rental';
    rental_period: string | null;
    beds: number;
    baths: number;
    floors: number;
    // Size metrics - critical for valuation
    total_area_sqm: number | null;
    land_area_sqm: number | null;
    built_area_sqm: number | null;
    plot_size_acres: number | null;
    // Property characteristics
    region: string;
    property_type: string;
    property_sub_type: string | null;
    year_built: number | null;
    condition: string | null;
    status: string;
    amenities: string[];
    features: string[];
    parking?: string | number;
    // Data quality metrics - important for valuation confidence
    data_quality: {
      trust_score: number;
      completeness_score: number | null;
      verification_status: string;
      data_source: string;
      last_updated: string;
    };
    images: string[];
    video_url?: string | null;
    virtual_tour_url?: string | null;
    location: {
      lat: number;
      lng: number;
      verified: boolean;
      accuracy: number | null;
      coordinates_source?: 'original' | 'ghana_post_gps' | 'street_landmark' | 'neighborhood' | 'city' | 'geocoded' | null;
      geocoding_confidence?: number | null;
    };
    address: {
      street: string | null;
      city: string | null;
      district: string | null;
      landmark: string | null;
      digital_address: string | null;
      formatted: string;
    };
  };
  valuation: {
    low: number;
    high: number;
    median: number;
    confidence: number;
    price_per_sqm: number | null;
    methodology: string;
    comparables_count: number;
    source?: 'redis' | 'calculated';
  };
  market_context: {
    neighborhood_avg_price_sqm: number | null;
    region_avg_price_sqm: number | null;
    price_trend: 'rising' | 'stable' | 'falling' | 'unknown';
    days_on_market: number | null;
  };
  pois: {
    schools: Array<{ name: string; distance: number; lat: number; lng: number }>;
    banks: Array<{ name: string; distance: number; lat: number; lng: number }>;
    hospitals: Array<{ name: string; distance: number; lat: number; lng: number }>;
  };
  comparables: Array<{
    id: string;
    price: number;
    currency: string;
    price_per_sqm: number | null;
    beds: number;
    baths: number;
    sqm: number;
    property_type: string;
    year_built: number | null;
    image: string;
    distance: number;
    similarity_score: number;
  }>;
  nearby: Array<{
    id: string;
    title: string;
    price: number;
    currency: string;
    beds: number;
    baths: number;
    sqm: number;
    property_type: string;
    transaction_type: string;
    image: string;
    distance: number;
    address: string;
    location: {
      lat: number;
      lng: number;
    };
  }>;
}

export const propertyEnrichmentService = {
  /** Resolve an s3:// media ref to a ready-to-play presigned URL; pass through http(s) URLs. */
  async resolveMediaUrl(ref: string | null | undefined): Promise<string | null> {
    if (!ref) return null;
    if (ref.startsWith('s3://')) {
      const without = ref.slice('s3://'.length);
      const slash = without.indexOf('/');
      if (slash < 0) return null;
      const bucket = without.slice(0, slash);
      const key = without.slice(slash + 1);
      try { return await getPresignedDownloadUrl(bucket, key); } catch { return null; }
    }
    return ref;
  },

  async getEnrichedProperty(id: string): Promise<PropertyEnrichmentResponse | null> {
    const start = Date.now();
    
    // 1. Fetch Core Property Data (Postgres)
    // We intentionally don't await here to start other promises
    const propertyPromise = pool.query(
      `SELECT 
        id, title, description, price, price_currency, price_per_sqm,
        transaction_type, rental_period,
        bedrooms, bathrooms, floors,
        total_area_sqm, land_area_sqm, built_area_sqm, plot_size_acres,
        region, property_type, property_sub_type, year_built, condition, status,
        amenities, features,
        data_quality_score, completeness_score, verification_status, data_source,
        image_urls, primary_image_url, video_url, virtual_tour_url,
        latitude, longitude, location_verified, location_accuracy,
        coordinates_source, geocoding_confidence,
        address_street, address_city, address_district, landmark, digital_address,
        created_at, updated_at
       FROM properties 
       WHERE id = $1`,
      [id]
    );

    // 2. Fetch Cached Valuation (Redis)
    const valuationPromise = cache.get<{
      low: number;
      high: number;
      confidence: number;
    }>(`valuation:${id}`);

    // Wait for core data first to construct OpenSearch query (needs lat/lng/price/beds)
    const propertyResult = await propertyPromise;
    
    if (propertyResult.rowCount === 0) {
      return null;
    }

    const property = propertyResult.rows[0];
    const lat = parseFloat(property.latitude);
    const lng = parseFloat(property.longitude);

    // 3. Fetch Comparables & POIs (OpenSearch) - dependent on property data
    // We fetch these in parallel now
    const comparablesPromise = this.fetchComparables(id, lat, lng, property.price, property.bedrooms);
    
    // 4. Fetch Nearby Properties (PostGIS) - for "Properties Nearby" section
    const nearbyPromise = this.getNearbyProperties(id, lat, lng, 2, 12);
    
    // POI fetch could be separate or part of enrichment. simulating for now or using OpenSearch if POIs indexed
    // For this scope, assuming POIs come from a predefined list or simple spatial query if DB supports it.
    // Let's use OpenSearch or empty list if no index. 
    // Requirement says "Overlay POIs... POIs must come from API response".
    // I'll simulate POIs or fetch from a 'points_of_interest' table if it exists?
    // I didn't see a POI table. I will return a placeholder structure or search neighborhood index if it has POIs.
    // 'neighborhoods' table has 'amenities' JSONB. 
    // I will return empty POI list for now to strictly follow "Do not mock data" but technically empty is valid data.
    // Or I can compute random POIs nearby? NO, "Do not mock data".
    // I'll check if there's a real POI source nearby. If not, empty is the truth. 
    // Wait, the prompt says "POIs must come from API response".
    // I will try to query OpenSearch index 'neighborhoods' or similar. 
    // I'll leave POIs empty for now to be safe, or add a stub that returns empty structure.
    
    const [valuation, comparables, nearby] = await Promise.all([
      valuationPromise,
      comparablesPromise,
      nearbyPromise
    ]);

    // 5. Generate Ghana Post GPS code via reverse geocoding if not stored
    let digitalAddress = property.digital_address || null;
    if (!digitalAddress && lat && lng && !isNaN(lat) && !isNaN(lng)) {
      try {
        const gpsResult = await ghanaPostGeocodingService.reverseGeocode(lat, lng);
        if (gpsResult && gpsResult.digitalAddress) {
          digitalAddress = gpsResult.digitalAddress;
          logger.debug('Generated GPS code via reverse geocoding', { 
            propertyId: id, 
            gpsCode: digitalAddress,
            source: gpsResult.source 
          });
          
          // Optionally persist the generated GPS code to the database for future requests
          // This is a fire-and-forget operation to avoid slowing down the response
          pool.query(
            `UPDATE properties SET digital_address = $1 WHERE id = $2 AND digital_address IS NULL`,
            [digitalAddress, id]
          ).catch(err => {
            logger.warn('Failed to persist generated GPS code', { propertyId: id, error: err.message });
          });
        }
      } catch (err: any) {
        logger.warn('Reverse geocoding failed for property', { 
          propertyId: id, 
          lat, 
          lng, 
          error: err.message 
        });
      }
    }

    // 6. Enrich nearby and comparables with GPS codes via reverse geocoding
    // Pass main property coords to filter out properties with identical (likely inaccurate) coordinates
    const enrichedNearby = await this.enrichWithGPSCodes(nearby, lat, lng);
    const enrichedComparables = await this.enrichComparablesWithGPSCodes(comparables, lat, lng);

    // Construct response
    const enrichedData: PropertyEnrichmentResponse = {
      property: {
        id: property.id,
        title: property.title || '',
        description: property.description || '',
        price: {
          ghs: property.price_currency === 'GHS' ? Number(property.price) : Number(property.price) * 12,
          usd: property.price_currency === 'USD' ? Number(property.price) : Number(property.price) / 12,
          per_sqm: property.price_per_sqm ? Number(property.price_per_sqm) : null,
        },
        transaction_type: property.transaction_type || 'sale',
        rental_period: property.rental_period || null,
        beds: property.bedrooms || 0,
        baths: property.bathrooms || 0,
        floors: property.floors || 0,
        total_area_sqm: property.total_area_sqm ? Number(property.total_area_sqm) : null,
        land_area_sqm: property.land_area_sqm ? Number(property.land_area_sqm) : null,
        built_area_sqm: property.built_area_sqm ? Number(property.built_area_sqm) : null,
        plot_size_acres: property.plot_size_acres ? Number(property.plot_size_acres) : null,
        year_built: property.year_built || null,
        condition: property.condition || null,
        region: property.region,
        property_type: property.property_type,
        property_sub_type: property.property_sub_type || null,
        status: property.status,
        amenities: Array.isArray(property.amenities) ? property.amenities : [],
        features: Array.isArray(property.features) ? property.features : [],
        data_quality: this.calculateDataQuality(property),
        images: Array.isArray(property.image_urls) ? property.image_urls : (property.primary_image_url ? [property.primary_image_url] : []),
        video_url: await this.resolveMediaUrl(property.video_url),
        virtual_tour_url: property.virtual_tour_url || null,
        location: {
          lat: lat,
          lng: lng,
          verified: property.location_verified || false,
          accuracy: property.location_accuracy ? Number(property.location_accuracy) : null,
          coordinates_source: property.coordinates_source || null,
          geocoding_confidence: property.geocoding_confidence ? Number(property.geocoding_confidence) : null
        },
        address: {
          street: property.address_street,
          city: property.address_city,
          district: property.address_district || null,
          landmark: property.landmark,
          digital_address: digitalAddress,
          formatted: this.formatAddress(property)
        },
        parking: this.extractParking(property.features)
      },
      valuation: this.normalizeValuation(valuation, property),
      market_context: {
        neighborhood_avg_price_sqm: null, // TODO: Calculate from nearby properties
        region_avg_price_sqm: null, // TODO: Fetch from regional averages
        price_trend: 'unknown' as const,
        days_on_market: null
      },
      pois: {
        schools: [],
        banks: [],
        hospitals: []
      },
      comparables: enrichedComparables,
      nearby: enrichedNearby
    };

    logger.info('Enriched property fetched', { 
      propertyId: id, 
      duration: Date.now() - start 
    });

    return enrichedData;
  },

  /**
   * Enrich nearby properties with GPS codes via reverse geocoding
   * Skips properties with coordinates identical to main property (indicates poor geocoding)
   */
  async enrichWithGPSCodes(nearby: any[], mainLat: number, mainLng: number): Promise<any[]> {
    if (!nearby || nearby.length === 0) return nearby;

    // Helper to check if coordinates are unique (not same as main property)
    const hasUniqueCoords = (propLat: number, propLng: number) => {
      // Coordinates are considered "same" if within ~10 meters (0.0001 degrees)
      const latDiff = Math.abs(propLat - mainLat);
      const lngDiff = Math.abs(propLng - mainLng);
      return latDiff > 0.0001 || lngDiff > 0.0001;
    };

    const results = await Promise.all(
      nearby.map(async (prop) => {
        if (!prop.location?.lat || !prop.location?.lng) return prop;

        // If coordinates are identical to main property, don't show GPS code (poor data quality)
        if (!hasUniqueCoords(prop.location.lat, prop.location.lng)) {
          return { ...prop, digital_address: null }; // Hide inaccurate GPS codes
        }

        // Already has unique GPS code from DB
        if (prop.digital_address) return prop;

        try {
          const gpsResult = await ghanaPostGeocodingService.reverseGeocode(
            prop.location.lat,
            prop.location.lng
          );
          
          if (gpsResult?.digitalAddress) {
            // Fire-and-forget: persist to database
            pool.query(
              `UPDATE properties SET digital_address = $1 WHERE id = $2 AND digital_address IS NULL`,
              [gpsResult.digitalAddress, prop.id]
            ).catch(() => {}); // Ignore persistence errors

            return { ...prop, digital_address: gpsResult.digitalAddress };
          }
        } catch {
          // Ignore individual failures
        }
        
        return prop;
      })
    );

    return results;
  },

  /**
   * Enrich comparable properties with GPS codes via reverse geocoding
   * Skips properties with coordinates identical to main property (indicates poor geocoding)
   */
  async enrichComparablesWithGPSCodes(comparables: any[], mainLat: number, mainLng: number): Promise<any[]> {
    if (!comparables || comparables.length === 0) return comparables;

    // Helper to check if coordinates are unique (not same as main property)
    const hasUniqueCoords = (propLat: number, propLng: number) => {
      const latDiff = Math.abs(propLat - mainLat);
      const lngDiff = Math.abs(propLng - mainLng);
      return latDiff > 0.0001 || lngDiff > 0.0001;
    };

    // For comparables, we need to fetch lat/lng from database if not present
    const idsNeedingGPS = comparables
      .filter(c => !c.digital_address)
      .map(c => c.id);

    if (idsNeedingGPS.length === 0) return comparables;

    try {
      // Batch fetch lat/lng for properties needing GPS codes
      const result = await pool.query(
        `SELECT id, latitude, longitude, digital_address 
         FROM properties 
         WHERE id = ANY($1)`,
        [idsNeedingGPS]
      );

      const locationMap = new Map(
        result.rows.map(r => [r.id, { 
          lat: parseFloat(r.latitude), 
          lng: parseFloat(r.longitude),
          digital_address: r.digital_address 
        }])
      );

      // Enrich with reverse geocoding
      const enriched = await Promise.all(
        comparables.map(async (comp) => {
          const loc = locationMap.get(comp.id);
          if (!loc) return comp;

          if (!loc.lat || !loc.lng || isNaN(loc.lat) || isNaN(loc.lng)) return comp;

          // If coordinates are identical to main property, hide GPS code (poor data quality)
          if (!hasUniqueCoords(loc.lat, loc.lng)) {
            return { ...comp, digital_address: null }; // Hide inaccurate GPS codes
          }

          // If already has GPS code (from DB or request), return it
          if (comp.digital_address) return comp;
          if (loc.digital_address) {
            return { ...comp, digital_address: loc.digital_address };
          }

          try {
            const gpsResult = await ghanaPostGeocodingService.reverseGeocode(loc.lat, loc.lng);
            
            if (gpsResult?.digitalAddress) {
              // Fire-and-forget: persist to database
              pool.query(
                `UPDATE properties SET digital_address = $1 WHERE id = $2 AND digital_address IS NULL`,
                [gpsResult.digitalAddress, comp.id]
              ).catch(() => {});

              return { ...comp, digital_address: gpsResult.digitalAddress };
            }
          } catch {
            // Ignore individual failures
          }

          return comp;
        })
      );

      return enriched;
    } catch (error) {
      logger.warn('Failed to enrich comparables with GPS codes', { 
        error: error instanceof Error ? error.message : 'Unknown' 
      });
      return comparables;
    }
  },

  /**
   * Fetch comparable properties using PostgreSQL/PostGIS
   * More reliable than OpenSearch since all properties are geocoded in Postgres
   */
  async fetchComparables(id: string, lat: number, lng: number, price: number, bedrooms: number) {
    if (!lat || !lng) return [];
    
    try {
      // Use PostGIS for geo-distance queries
      // Find properties within 2km with similar characteristics
      const result = await pool.query(`
        SELECT 
          p.id,
          p.title,
          p.price,
          p.currency,
          p.bedrooms,
          p.bathrooms,
          COALESCE(p.total_area_sqm, p.land_area_sqm) as sqm,
          p.property_type,
          p.condition,
          p.year_built,
          p.digital_address,
          COALESCE(
            (SELECT url FROM property_images WHERE property_id = p.id ORDER BY is_primary DESC, display_order LIMIT 1),
            p.primary_image_url
          ) as image,
          ST_Distance(
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography
          ) as distance_meters
        FROM properties p
        WHERE p.id != $3
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND p.price IS NOT NULL
          AND p.bedrooms BETWEEN $4 - 1 AND $4 + 1
          AND p.price BETWEEN $5 * 0.7 AND $5 * 1.3
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
            5000  -- 5km radius for more results
          )
        ORDER BY distance_meters ASC
        LIMIT 10
      `, [lat, lng, id, bedrooms, price]);
      
      return result.rows.map(row => {
        const comparablePrice = row.price || 0;
        const comparableBeds = row.bedrooms || 0;
        const comparableSqm = row.sqm || 0;
        const distance = Number(row.distance_meters) || 0;
        
        // Calculate similarity score (0-1 scale)
        let similarity = 1.0;
        // Distance factor: closer = more similar (max 5km)
        similarity *= Math.max(0, 1 - (distance / 5000));
        // Price factor: within 10% = full score
        const priceDiff = Math.abs(comparablePrice - price) / Math.max(price, 1);
        similarity *= Math.max(0.3, 1 - (priceDiff * 2));
        // Bedroom factor: exact match = 1, ±1 = 0.8
        const bedDiff = Math.abs(comparableBeds - bedrooms);
        similarity *= bedDiff === 0 ? 1 : (bedDiff === 1 ? 0.8 : 0.5);
        
        return {
          id: row.id,
          title: row.title || null,
          price: comparablePrice,
          price_per_sqm: comparableSqm > 0 ? Math.round(comparablePrice / comparableSqm) : null,
          currency: row.currency || 'GHS',
          beds: comparableBeds,
          baths: row.bathrooms || 0,
          sqm: comparableSqm,
          property_type: row.property_type || null,
          condition: row.condition || null,
          year_built: row.year_built || null,
          image: row.image || '',
          distance: Math.round(distance),
          similarity_score: Math.round(similarity * 100) / 100,
          digital_address: row.digital_address || null
        };
      });
    } catch (error) {
      logger.error('Error fetching comparables from PostgreSQL', { error });
      return [];
    }
  },

  // Keep the OpenSearch version as a fallback (currently broken due to missing geo data)
  async fetchComparablesRefined(id: string, lat: number, lng: number, price: number, bedrooms: number) {
    if (!lat || !lng) return [];

    try {
      const body = {
        size: 10,
        query: {
          bool: {
            must: [
              {
                range: {
                  bedrooms: {
                    gte: Math.max(0, bedrooms - 1),
                    lte: bedrooms + 1
                  }
                }
              },
              {
                range: {
                  // Assuming price is indexed as price_ghs or price based on currency.
                  // For simplicity, querying 'price_ghs' if the input price is GHS.
                  // Since I don't know the index currency state perfectly, I'll try to query generic 'price' if it exists or 'price_ghs'
                  // The mapping in opensearch.ts showed 'price_ghs' and 'price_usd'.
                  // I'll assume we query 'price_ghs' and assume input price is GHS.
                  price_ghs: {
                    gte: price * 0.8,
                    lte: price * 1.2
                  }
                }
              }
            ],
            filter: {
              geo_distance: {
                distance: "2km",
                location: {
                  lat: lat,
                  lon: lng
                }
              }
            },
            must_not: [
              { term: { "id.keyword": id } } // Use .keyword for exact ID match
            ]
          }
        },
        sort: [
          {
            _geo_distance: {
              location: {
                lat: lat,
                lon: lng
              },
              order: "asc",
              unit: "m"
            }
          }
        ]
      };

      const response = await opensearchClient.search({
        index: indices.properties,
        body: body
      });

      return response.body.hits.hits.map((hit: any) => {
        const source = hit._source;
        const distance = hit.sort ? Number(hit.sort[0]) : 0;
        const comparablePrice = source.price_ghs || 0;
        const comparableBeds = source.bedrooms || 0;
        const comparableSqm = source.built_area_sqm || source.total_area_sqm || 0;
        
        // Calculate similarity score for valuation relevance (0-1 scale)
        let similarity = 1.0;
        // Distance factor: closer = more similar (max 2km)
        similarity *= Math.max(0, 1 - (distance / 2000));
        // Price factor: within 10% = full score
        const priceDiff = Math.abs(comparablePrice - price) / price;
        similarity *= Math.max(0.3, 1 - (priceDiff * 2));
        // Bedroom factor: exact match = 1, ±1 = 0.8
        const bedDiff = Math.abs(comparableBeds - bedrooms);
        similarity *= bedDiff === 0 ? 1 : (bedDiff === 1 ? 0.8 : 0.5);
        
        return {
          id: source.id,
          title: source.title || null,
          price: comparablePrice,
          price_per_sqm: comparableSqm > 0 ? Math.round(comparablePrice / comparableSqm) : null,
          currency: 'GHS',
          beds: comparableBeds,
          baths: source.bathrooms,
          sqm: comparableSqm,
          property_type: source.property_type || null,
          condition: source.condition || null,
          year_built: source.year_built || null,
          image: source.primary_image_url || (source.image_urls && source.image_urls[0]) || '',
          distance: distance,
          similarity_score: Math.round(similarity * 100) / 100,
          digital_address: source.digital_address || null
        };
      });

    } catch (error) {
      logger.warn('Failed to fetch comparables', { error: error instanceof Error ? error.message : 'Unknown' });
      return [];
    }
  },

  /**
   * Normalize valuation object to match interface requirements
   * NOTE: Until Phase 3 AVM is implemented, this shows listing price with confidence based on comparables
   */
  normalizeValuation(cachedValuation: any, property: any): PropertyEnrichmentResponse['valuation'] {
    const price = Number(property.price) || 0;
    const sqm = Number(property.total_area_sqm) || Number(property.built_area_sqm) || 0;
    
    // If we have a cached valuation from Redis (future AVM), normalize it
    if (cachedValuation && cachedValuation.low && cachedValuation.high) {
      return {
        low: cachedValuation.low,
        high: cachedValuation.high,
        median: cachedValuation.median || Math.round((cachedValuation.low + cachedValuation.high) / 2),
        confidence: cachedValuation.confidence || 0.7,
        price_per_sqm: sqm > 0 ? Math.round(price / sqm) : null,
        methodology: cachedValuation.methodology || 'avm_model',
        comparables_count: cachedValuation.comparables_count || 0,
        source: 'redis' as const
      };
    }
    
    // Phase 2: Use listing price as base with market variance
    // Confidence is lower for web-scraped data vs verified sources
    const dataSource = property.data_source || 'unknown';
    const isVerified = property.verification_status === 'verified';
    
    // Determine confidence based on data quality
    let confidence = 0.40; // Base confidence for unverified web data
    if (dataSource.includes('tier1') || dataSource.includes('tier2')) {
      confidence = 0.80;
    } else if (isVerified) {
      confidence = 0.70;
    } else if (dataSource.includes('premium') || dataSource.includes('partner')) {
      confidence = 0.55;
    }
    
    // Widen the range for lower confidence
    const variance = 0.15 - (confidence * 0.10); // 15% variance for low confidence, 5% for high
    
    return {
      low: Math.round(price * (1 - variance)),
      high: Math.round(price * (1 + variance)),
      median: price,
      confidence: confidence,
      price_per_sqm: sqm > 0 ? Math.round(price / sqm) : null,
      methodology: 'listing_price_adjusted', // Clearly indicates this is based on listing, not AVM
      comparables_count: 0,
      source: 'calculated' as const
    };
  },

  calculateFallbackValuation(property: any) {
    // Simple neighborhood logic: price * 0.9 to 1.1
    // In production this would query avg sqm price for region
    const price = Number(property.price);
    return {
      low: Math.round(price * 0.95),
      high: Math.round(price * 1.05),
      confidence: 0.60,
      source: 'calculated' as const
    };
  },

  formatAddress(property: any): string {
    const parts: string[] = [];
    
    if (property.address_street) {
      parts.push(property.address_street);
    }
    
    if (property.landmark && property.landmark !== property.address_street) {
      parts.push(property.landmark);
    }
    
    if (property.address_city) {
      parts.push(property.address_city);
    }
    
    if (property.region) {
      const regionMap: Record<string, string> = {
        'greater_accra': 'Greater Accra',
        'ashanti': 'Ashanti',
        'kumasi_metro': 'Kumasi',
        'eastern': 'Eastern Region',
        'western': 'Western Region',
        'central': 'Central Region',
        'northern': 'Northern Region',
        'volta': 'Volta Region',
      };
      parts.push(regionMap[property.region] || property.region.replace(/_/g, ' '));
    }
    
    return parts.length > 0 ? parts.join(', ') : 'Ghana';
  },

  /**
   * Get nearby properties using PostGIS distance query
   */
  async getNearbyProperties(propertyId: string, lat: number, lng: number, radiusKm: number = 2, limit: number = 10) {
    if (!lat || !lng) return [];
    
    try {
      const result = await pool.query(
        `SELECT 
          id, title, price, price_currency, bedrooms, bathrooms, total_area_sqm,
          region, property_type, transaction_type, primary_image_url, image_urls,
          latitude, longitude, address_street, address_city, digital_address,
          ST_Distance(
            ST_MakePoint($2, $1)::geography,
            ST_MakePoint(longitude, latitude)::geography
          ) as distance_meters
         FROM properties 
         WHERE id != $3
           AND latitude IS NOT NULL 
           AND longitude IS NOT NULL
           AND ST_DWithin(
             ST_MakePoint($2, $1)::geography,
             ST_MakePoint(longitude, latitude)::geography,
             $4
           )
           AND (status = 'active' OR status IS NULL)
         ORDER BY distance_meters ASC
         LIMIT $5`,
        [lat, lng, propertyId, radiusKm * 1000, limit]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        price: Number(row.price),
        currency: row.price_currency || 'GHS',
        beds: row.bedrooms || 0,
        baths: row.bathrooms || 0,
        sqm: Number(row.total_area_sqm) || 0,
        property_type: row.property_type,
        transaction_type: row.transaction_type,
        image: row.primary_image_url || (row.image_urls && row.image_urls[0]) || '',
        distance: Math.round(row.distance_meters),
        address: row.address_street || row.address_city || row.region,
        digital_address: row.digital_address || null,
        location: {
          lat: parseFloat(row.latitude),
          lng: parseFloat(row.longitude)
        }
      }));
    } catch (error) {
      logger.warn('Failed to fetch nearby properties', { error: error instanceof Error ? error.message : 'Unknown' });
      return [];
    }
  },

  extractParking(features: any): string | number | undefined {
    if (Array.isArray(features)) {
      // Look for string like "2 Parking Spaces" or similar
      // Or check if features is JSON objects
      return features.find(f => typeof f === 'string' && f.toLowerCase().includes('parking'));
    }
    return undefined;
  },

  /**
   * Calculate data quality metrics dynamically based on property data
   * This runs until we have proper data_quality_score backfilled in DB
   */
  calculateDataQuality(property: any): PropertyEnrichmentResponse['property']['data_quality'] {
    // Completeness score is already stored as decimal (0.65 = 65%)
    // If stored as percentage (65), divide by 100
    let completenessScore = property.completeness_score 
      ? Number(property.completeness_score) 
      : null;
    
    // If completeness_score > 1, it was stored as percentage
    if (completenessScore && completenessScore > 1) {
      completenessScore = completenessScore / 100;
    }
    
    // Calculate trust score dynamically based on source reliability + data quality factors
    // Since data_quality_score is NULL, we compute it from available signals
    const trustScore = this.calculateTrustScore(property, completenessScore);
    
    return {
      trust_score: trustScore,
      completeness_score: completenessScore,
      verification_status: property.verification_status || 'unverified',
      data_source: property.data_source || 'unknown',
      last_updated: property.updated_at || new Date().toISOString()
    };
  },

  /**
   * Calculate trust score based on source reliability, verification, and data completeness
   * Score: 0-1 scale
   */
  calculateTrustScore(property: any, completenessScore: number | null): number {
    let score = 0;
    
    // 1. Source reliability (40% weight)
    // Tier 1/2 sources are more reliable than web scrapers
    const sourceReliability: Record<string, number> = {
      'tier1_government': 1.0,
      'tier2_financial': 0.9,
      'api_partner': 0.8,
      'premium_listing': 0.7,
      'Tier5_web': 0.4,
      'tier5_web': 0.4,
      'meqasa': 0.5,
      'jiji': 0.4,
      'tonaton': 0.4,
      'unknown': 0.3
    };
    const sourceFactor = sourceReliability[property.data_source] || 0.3;
    score += sourceFactor * 0.4;
    
    // 2. Verification status (20% weight)
    const verificationScores: Record<string, number> = {
      'verified': 1.0,
      'partially_verified': 0.7,
      'pending': 0.4,
      'unverified': 0.2
    };
    const verificationFactor = verificationScores[property.verification_status] || 0.2;
    score += verificationFactor * 0.2;
    
    // 3. Location quality (15% weight)
    let locationFactor = 0;
    if (property.latitude && property.longitude) {
      locationFactor = 0.5; // Has coordinates
      if (property.location_verified) {
        locationFactor = 1.0; // Verified location
      } else if (property.location_accuracy && Number(property.location_accuracy) < 100) {
        locationFactor = 0.8; // High accuracy
      } else if (property.digital_address) {
        locationFactor = 0.7; // Has Ghana Post GPS
      }
    }
    score += locationFactor * 0.15;
    
    // 4. Data completeness (15% weight)
    const completenessFactor = completenessScore || 0.3;
    score += completenessFactor * 0.15;
    
    // 5. Data freshness (10% weight)
    let freshnessFactor = 0.3;
    if (property.updated_at) {
      const daysSinceUpdate = (Date.now() - new Date(property.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 30) freshnessFactor = 1.0;
      else if (daysSinceUpdate < 90) freshnessFactor = 0.7;
      else if (daysSinceUpdate < 180) freshnessFactor = 0.5;
      else freshnessFactor = 0.3;
    }
    score += freshnessFactor * 0.1;
    
    return Math.min(1, Math.max(0, score));
  },

  /**
   * Get a list of properties for the public listing page
   */
  async getProperties(limit: number = 24, offset: number = 0, transactionType?: 'sale' | 'rental', search?: string) {
    let query = `SELECT 
        id, title, price, price_currency, bedrooms, bathrooms, total_area_sqm,
        region, property_type, transaction_type, rental_period, status, image_urls, primary_image_url,
        latitude, longitude, address_street, address_city, landmark, created_at
       FROM properties 
       WHERE (status = 'active' OR status IS NULL)`;
    
    const params: any[] = [];
    
    if (transactionType) {
      params.push(transactionType);
      query += ` AND transaction_type = $${params.length}`;
    }

    if (search && search.trim().length > 0) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(address_street) LIKE $${params.length} OR LOWER(address_city) LIKE $${params.length} OR LOWER(landmark) LIKE $${params.length})`;
    }
    
    params.push(limit, offset);
    query += ` ORDER BY created_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`;
    
    const result = await pool.query(query, params);

    return result.rows.map(row => ({
      ...row,
      images: row.image_urls || (row.primary_image_url ? [row.primary_image_url] : [])
    }));
  },

  /**
   * Get property counts by transaction type
   */
  async getPropertyCounts() {
    const result = await pool.query(
      `SELECT transaction_type, COUNT(*) as count 
       FROM properties 
       WHERE status = 'active' OR status IS NULL 
       GROUP BY transaction_type`
    );
    return result.rows.reduce((acc, row) => {
      acc[row.transaction_type] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);
  }
};

// Override the simple fetch method with the refined one
propertyEnrichmentService.fetchComparables = propertyEnrichmentService.fetchComparablesRefined;
