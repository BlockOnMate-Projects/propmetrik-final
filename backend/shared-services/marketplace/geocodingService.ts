// GeocodingService - Forward and reverse geocoding using Mapbox
import axios from 'axios';
import { logger } from '../../src/utils/logger';

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

      for (const type of types) {
        const amenities = await this.queryOverpass(lat, lng, radius_km, type);
        
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
      const overpassUrl = 'https://overpass-api.de/api/interpreter';
      
      // Map amenity types to OSM tags
      const osmQuery = this.getOSMQuery(amenityType, lat, lng, radius_m);
      
      const response = await axios.post(overpassUrl, `data=${encodeURIComponent(osmQuery)}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });

      const elements = response.data.elements || [];
      
      return elements
        .map((el: any) => {
          const elLat = el.lat || (el.center && el.center.lat);
          const elLon = el.lon || (el.center && el.center.lon);
          
          if (!elLat || !elLon) return null;
          
          return {
            name: el.tags?.name || 'Unknown',
            distance_km: this.calculateDistance(lat, lng, elLat, elLon),
            location: { lat: elLat, lon: elLon }
          };
        })
        .filter((a: any) => a !== null)
        .sort((a: NearbyAmenity, b: NearbyAmenity) => a.distance_km - b.distance_km)
        .slice(0, 10); // Return top 10 closest
    } catch (error: any) {
      logger.error('Overpass query error:', { error: error.message, amenityType });
      return [];
    }
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
