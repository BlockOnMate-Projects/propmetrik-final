/**
 * Shared Geocoding Helper
 * Automatically geocodes addresses and digital addresses for properties
 */

import axios from 'axios';
import { logger } from '../../src/utils/logger';

interface GeocodingResult {
  latitude: number;
  longitude: number;
  accuracy: string;
  source: 'mapbox' | 'ghana_post' | 'fallback';
}

/**
 * Geocode a property address automatically
 * Tries multiple strategies in order of preference:
 * 1. Ghana Digital Address (if provided)
 * 2. Full address string via Mapbox
 * 3. City + Region fallback
 */
export async function geocodePropertyAddress(params: {
  digitalAddress?: string | null;
  addressStreet?: string | null;
  city?: string | null;
  region?: string | null;
  landmark?: string | null;
}): Promise<GeocodingResult | null> {
  const { digitalAddress, addressStreet, city, region, landmark } = params;

  // Strategy 1: Try Ghana Digital Address first
  if (digitalAddress) {
    try {
      const result = await geocodeGhanaDigitalAddress(digitalAddress, city, region);
      if (result) {
        logger.info(`Geocoded via digital address: ${digitalAddress}`, {
          lat: result.latitude,
          lng: result.longitude
        });
        return result;
      }
    } catch (error: any) {
      logger.warn(`Failed to geocode digital address ${digitalAddress}:`, error.message);
    }
  }

  // Strategy 2: Try full address via Mapbox
  if (addressStreet || landmark) {
    const addressParts = [
      addressStreet,
      landmark,
      city,
      region,
      'Ghana'
    ].filter(Boolean);
    
    const fullAddress = addressParts.join(', ');
    
    try {
      const result = await geocodeViaMapbox(fullAddress);
      if (result) {
        logger.info(`Geocoded via full address: ${fullAddress}`, {
          lat: result.latitude,
          lng: result.longitude
        });
        return result;
      }
    } catch (error: any) {
      logger.warn(`Failed to geocode full address ${fullAddress}:`, error.message);
    }
  }

  // Strategy 3: Try city + region as fallback
  if (city && region) {
    const fallbackAddress = `${city}, ${region}, Ghana`;
    try {
      const result = await geocodeViaMapbox(fallbackAddress);
      if (result) {
        logger.info(`Geocoded via city fallback: ${fallbackAddress}`, {
          lat: result.latitude,
          lng: result.longitude
        });
        return {
          ...result,
          accuracy: 'city_level',
          source: 'fallback'
        };
      }
    } catch (error: any) {
      logger.warn(`Failed to geocode fallback address ${fallbackAddress}:`, error.message);
    }
  }

  logger.warn('Unable to geocode property - no valid address components');
  return null;
}

/**
 * Geocode Ghana Digital Address (GA-123-4567)
 */
async function geocodeGhanaDigitalAddress(
  digitalAddress: string,
  city?: string | null,
  region?: string | null
): Promise<GeocodingResult | null> {
  const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
  
  if (!MAPBOX_TOKEN) {
    throw new Error('MAPBOX_ACCESS_TOKEN not configured');
  }

  const context = [digitalAddress, city, region, 'Ghana'].filter(Boolean).join(', ');
  
  const response = await axios.get(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(context)}.json`,
    {
      params: {
        access_token: MAPBOX_TOKEN,
        country: 'GH',
        limit: 1,
      },
      timeout: 5000
    }
  );

  if (response.data.features && response.data.features.length > 0) {
    const [lng, lat] = response.data.features[0].center;
    return {
      latitude: lat,
      longitude: lng,
      accuracy: 'digital_address',
      source: 'mapbox'
    };
  }

  return null;
}

/**
 * Geocode any address string via Mapbox
 */
async function geocodeViaMapbox(address: string): Promise<GeocodingResult | null> {
  const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
  
  if (!MAPBOX_TOKEN) {
    throw new Error('MAPBOX_ACCESS_TOKEN not configured');
  }

  const response = await axios.get(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
    {
      params: {
        access_token: MAPBOX_TOKEN,
        country: 'GH',
        limit: 1,
      },
      timeout: 5000
    }
  );

  if (response.data.features && response.data.features.length > 0) {
    const feature = response.data.features[0];
    const [lng, lat] = feature.center;
    
    // Determine accuracy based on place type
    let accuracy = 'approximate';
    if (feature.place_type?.includes('address')) {
      accuracy = 'rooftop';
    } else if (feature.place_type?.includes('poi')) {
      accuracy = 'landmark';
    } else if (feature.place_type?.includes('place')) {
      accuracy = 'city';
    }
    
    return {
      latitude: lat,
      longitude: lng,
      accuracy,
      source: 'mapbox'
    };
  }

  return null;
}
