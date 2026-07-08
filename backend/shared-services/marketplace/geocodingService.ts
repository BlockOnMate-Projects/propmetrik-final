// GeocodingService - Forward and reverse geocoding using Mapbox
import axios from 'axios';
import { logger } from '../../src/utils/logger';

// Overpass (OpenStreetMap) endpoints tried in order. The main instance returns HTTP
// 406 for library/bot User-Agents and is frequently overloaded (504/429), so we send
// an identifying User-Agent (as its usage policy requires) and fall back to mirrors.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'PropMetrik/1.0 (+https://propmetrik.com; marketplace neighbourhood insights)',
  Accept: 'application/json',
};

interface GeocodeResult {
  address: string;
  location: {
    lat: number;
    lon: number;
  };
  formatted_address: string;
  accuracy: 'rooftop' | 'street' | 'locality' | 'city';
  components: {
    street?: string;
    neighborhood?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
}

interface AutocompleteResult {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  place_type: string[];
  relevance: number;
  context?: Array<{ id: string; text: string }>;
}

interface NearbyAmenity {
  name: string;
  distance_km: number;
  location: { lat: number; lon: number };
  /** Human descriptor from OSM tags, e.g. "Public school · Primary", "Clinic", "Bus stop". */
  kind?: string;
}

export class GeocodingService {
  private mapboxToken: string;
  private mapboxBaseUrl = 'https://api.mapbox.com';

  constructor() {
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || '';
    if (!this.mapboxToken) {
      logger.warn('MAPBOX_ACCESS_TOKEN not set. Geocoding features will not work.');
    }
  }

  /**
   * Forward geocoding: Convert address to coordinates
   */
  async geocode(address: string, country: string = 'GH'): Promise<GeocodeResult | null> {
    try {
      const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
      
      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          country,
          limit: 1
        }
      });

      if (response.data.features && response.data.features.length > 0) {
        const feature = response.data.features[0];
        
        return {
          address,
          location: {
            lat: feature.center[1],
            lon: feature.center[0]
          },
          formatted_address: feature.place_name,
          accuracy: this.determineAccuracy(feature.place_type),
          components: this.extractComponents(feature)
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Geocoding error:', { error: error.message, address });
      return null;
    }
  }

  /**
   * Reverse geocoding: Convert coordinates to address
   */
  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    try {
      const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${lng},${lat}.json`;
      
      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          limit: 1
        }
      });

      if (response.data.features && response.data.features.length > 0) {
        const feature = response.data.features[0];
        
        return {
          address: feature.place_name,
          location: { lat, lon: lng },
          formatted_address: feature.place_name,
          accuracy: this.determineAccuracy(feature.place_type),
          components: this.extractComponents(feature)
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Reverse geocoding error:', { error: error.message, lat, lng });
      return null;
    }
  }

  /**
   * Autocomplete suggestions for location search
   */
  async autocomplete(
    query: string,
    country: string = 'GH',
    types: string = 'place,locality,neighborhood',
    proximity?: { lat: number; lng: number },
    limit: number = 5
  ): Promise<AutocompleteResult[]> {
    try {
      const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
      
      const params: any = {
        access_token: this.mapboxToken,
        country,
        types,
        limit,
        autocomplete: true
      };

      if (proximity) {
        params.proximity = `${proximity.lng},${proximity.lat}`;
      }

      const response = await axios.get(url, { params });

      return response.data.features.map((feature: any) => ({
        id: feature.id,
        place_name: feature.place_name,
        center: feature.center,
        place_type: feature.place_type,
        relevance: feature.relevance,
        context: feature.context
      }));
    } catch (error: any) {
      logger.error('Autocomplete error:', { error: error.message, query });
      return [];
    }
  }

  /**
   * Get nearby amenities using OpenStreetMap Overpass API
   */
  async getNearbyAmenities(
    lat: number,
    lng: number,
    radius_km: number = 2,
    types: string[] = ['school', 'hospital', 'transit']
  ): Promise<{
    schools?: NearbyAmenity[];
    hospitals?: NearbyAmenity[];
    transit_stops?: NearbyAmenity[];
  }> {
    try {
      const result: any = {};

      // Query each amenity type in PARALLEL — Overpass calls are ~seconds each, so a
      // sequential loop over 3 types tripled the latency for the marketplace page.
      const pairs = await Promise.all(
        types.map(async (type) => [type, await this.queryOverpass(lat, lng, radius_km, type)] as const)
      );

      for (const [type, amenities] of pairs) {
        if (type === 'school') {
          result.schools = amenities;
        } else if (type === 'hospital') {
          result.hospitals = amenities;
        } else if (type === 'transit') {
          result.transit_stops = amenities;
        }
      }

      return result;
    } catch (error: any) {
      logger.error('Get nearby amenities error:', { error: error.message, lat, lng });
      return {};
    }
  }

  /**
   * Run a raw OpenStreetMap Overpass QL query and return its elements. Shared by
   * queryOverpass() and the getting-around (walk/transit/bike) scorer so the HTTP
   * call + error handling live in exactly one place. Returns [] on any failure.
   */
  async overpass(overpassQL: string, timeoutMs: number = 25000): Promise<any[]> {
    const body = `data=${encodeURIComponent(overpassQL)}`;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await axios.post(endpoint, body, { headers: OVERPASS_HEADERS, timeout: timeoutMs });
        return response.data?.elements || [];
      } catch (error: any) {
        // Try the next mirror on 406/429/504/timeout etc. — don't fail the whole section.
        logger.warn('Overpass endpoint failed, trying next', {
          endpoint,
          status: error?.response?.status,
          error: error.message,
        });
      }
    }
    logger.error('All Overpass endpoints failed');
    return [];
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lng2 - lng1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private determineAccuracy(placeTypes: string[]): 'rooftop' | 'street' | 'locality' | 'city' {
    if (placeTypes.includes('address')) return 'rooftop';
    if (placeTypes.includes('neighborhood')) return 'street';
    if (placeTypes.includes('locality')) return 'locality';
    return 'city';
  }

  private extractComponents(feature: any): GeocodeResult['components'] {
    const components: GeocodeResult['components'] = {};
    
    if (feature.address) components.street = feature.address;
    if (feature.text) components.neighborhood = feature.text;
    
    if (feature.context) {
      for (const ctx of feature.context) {
        if (ctx.id.startsWith('place')) {
          components.city = ctx.text;
        } else if (ctx.id.startsWith('region')) {
          components.region = ctx.text;
        } else if (ctx.id.startsWith('postcode')) {
          components.postal_code = ctx.text;
        } else if (ctx.id.startsWith('country')) {
          components.country = ctx.text;
        }
      }
    }
    
    return components;
  }

  private async queryOverpass(
    lat: number,
    lng: number,
    radius_km: number,
    amenityType: string
  ): Promise<NearbyAmenity[]> {
    try {
      const radius_m = radius_km * 1000;

      // Map amenity types to OSM tags, then run via the shared Overpass helper.
      const osmQuery = this.getOSMQuery(amenityType, lat, lng, radius_m);
      const elements = await this.overpass(osmQuery, 15000);

      return elements
        .map((el: any): NearbyAmenity | null => {
          const elLat = el.lat || (el.center && el.center.lat);
          const elLon = el.lon || (el.center && el.center.lon);

          if (!elLat || !elLon) return null;

          return {
            name: el.tags?.name || 'Unknown',
            distance_km: this.calculateDistance(lat, lng, elLat, elLon),
            location: { lat: elLat, lon: elLon },
            kind: this.describeKind(amenityType, el.tags)
          };
        })
        .filter((a: NearbyAmenity | null): a is NearbyAmenity => a !== null)
        .sort((a: NearbyAmenity, b: NearbyAmenity) => a.distance_km - b.distance_km)
        .slice(0, 10); // Return top 10 closest
    } catch (error: any) {
      logger.error('Overpass query error:', { error: error.message, amenityType });
      return [];
    }
  }

  /** Human descriptor for an amenity from its OSM tags (Ghana-oriented). */
  private describeKind(amenityType: string, tags: Record<string, string> | undefined): string | undefined {
    const t = tags || {};
    if (amenityType === 'school') {
      const op = (t['operator:type'] || '').toLowerCase();
      let base = 'School';
      if (op.includes('gov') || op === 'public') base = 'Public school';
      else if (op === 'private') base = 'Private school';
      else if (op.includes('relig') || t.religion) base = 'Faith school';
      // Grade band from grades / isced:level (0 pre, 1 primary, 2 JHS, 3 SHS).
      if (t.grades) return `${base} · ${t.grades}`;
      if (t['isced:level']) {
        const map: Record<string, string> = { '0': 'Preschool', '1': 'Primary', '2': 'JHS', '3': 'SHS' };
        const levels = t['isced:level'].split(/[;,-]/).map((s) => map[s.trim()]).filter(Boolean);
        if (levels.length) return `${base} · ${levels.join('–')}`;
      }
      return base;
    }
    if (amenityType === 'hospital') {
      if (t.amenity === 'clinic') return 'Clinic';
      if (t.amenity === 'pharmacy') return 'Pharmacy';
      if (t.amenity === 'doctors') return "Doctor's office";
      return 'Hospital';
    }
    if (amenityType === 'transit') {
      if (t.railway === 'station') return 'Train station';
      if (t.amenity === 'bus_station') return 'Bus station';
      return 'Bus stop';
    }
    return undefined;
  }

  private getOSMQuery(type: string, lat: number, lng: number, radius: number): string {
    const baseQuery = `[out:json];`;
    
    if (type === 'school') {
      return `${baseQuery}(node["amenity"="school"](around:${radius},${lat},${lng});way["amenity"="school"](around:${radius},${lat},${lng}););out center;`;
    } else if (type === 'hospital') {
      return `${baseQuery}(node["amenity"="hospital"](around:${radius},${lat},${lng});way["amenity"="hospital"](around:${radius},${lat},${lng});node["amenity"="clinic"](around:${radius},${lat},${lng}););out center;`;
    } else if (type === 'transit') {
      return `${baseQuery}(node["highway"="bus_stop"](around:${radius},${lat},${lng});node["railway"="station"](around:${radius},${lat},${lng}););out center;`;
    }
    
    return `${baseQuery}(node(around:${radius},${lat},${lng}););out center;`;
  }
}

export const geocodingService = new GeocodingService();
