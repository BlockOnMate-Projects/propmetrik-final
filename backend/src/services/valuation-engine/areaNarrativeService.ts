/**
 * Area-narrative generator for valuation reports.
 *
 * Produces DRAFT city / neighbourhood / location / services descriptions for the
 * valuation subject step. It is grounded in REAL data only:
 *   1. Resolve coordinates from (in order) explicit lat/lng → Ghana Post GPS digital
 *      address → free-text address (Mapbox/Google geocoding).
 *   2. Pull the actual locality/district/region (reverse geocode if needed).
 *   3. Fetch REAL nearby amenities from Google Places Nearby Search.
 *   4. Ask the shared aiService to write the narrative using ONLY that evidence.
 *
 * The output is always a DRAFT — the valuer reviews and edits it on the subject
 * step and again at report approval. The `evidence` block is returned so the
 * valuer can see exactly what the text is based on.
 */

import { geocodingService, NearbyPlace } from '../data-hub/geocodingService';
import { ghanaPostService } from '../data-hub/ghanaPostGeocodingService';
import { aiService } from '../ai/aiService';
import { logger } from '../../utils/logger';

export interface AreaNarrativeInput {
  latitude?: number | null;
  longitude?: number | null;
  digitalAddress?: string | null; // Ghana Post GPS, e.g. GA-123-4567
  address?: string | null;        // free-text address
  city?: string | null;
  region?: string | null;
  neighborhoodClass?: string | null; // e.g. 'prime', 'secondary'
  propertyType?: string | null;
}

export interface AreaNarrativeFields {
  city_description: string;
  city_details: string;
  neighbourhood_description: string;
  neighborhood_details: string;
  location_description: string;
  services_description: string;
}

export interface AreaNarrativeResult {
  fields: AreaNarrativeFields;
  evidence: {
    latitude: number;
    longitude: number;
    locality: string | null;
    district: string | null;
    region: string | null;
    coordinateSource: string;
    places: NearbyPlace[];
    provider: string;
  };
}

class AreaNarrativeService {
  /** Resolve coordinates + locality from the best available input. */
  private async resolveLocation(input: AreaNarrativeInput): Promise<{
    latitude: number;
    longitude: number;
    locality: string | null;
    district: string | null;
    region: string | null;
    source: string;
  } | null> {
    // 1. Explicit coordinates.
    if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
      let locality: string | null = input.city ?? null;
      let district: string | null = null;
      let region: string | null = input.region ?? null;
      // Reverse geocode to fill in names we don't already have.
      if (!locality || !region) {
        const rev = await geocodingService.reverseGeocode(input.latitude, input.longitude).catch(() => null);
        if (rev) {
          locality = locality || rev.neighborhood || null;
          district = rev.district || null;
          region = region || rev.region || null;
        }
      }
      return { latitude: input.latitude, longitude: input.longitude, locality, district, region, source: 'coordinates' };
    }

    // 2. Ghana Post GPS digital address.
    if (input.digitalAddress) {
      const gp = await ghanaPostService.geocodeDigitalAddress(input.digitalAddress).catch(() => null);
      if (gp) {
        return {
          latitude: gp.latitude,
          longitude: gp.longitude,
          locality: gp.area || input.city || null,
          district: gp.district || null,
          region: gp.region || input.region || null,
          source: `ghana_post:${gp.source}`,
        };
      }
    }

    // 3. Free-text address (Mapbox → Google).
    const addrParts = [input.address, input.city, input.region, 'Ghana'].filter(Boolean).join(', ');
    if (input.address || input.city) {
      const geo = await geocodingService.geocode(addrParts).catch(() => null);
      if (geo) {
        return {
          latitude: geo.latitude,
          longitude: geo.longitude,
          locality: geo.neighborhood || input.city || null,
          district: geo.district || null,
          region: geo.region || input.region || null,
          source: `geocode:${geo.provider}`,
        };
      }
    }

    return null;
  }

  async generate(input: AreaNarrativeInput): Promise<AreaNarrativeResult> {
    if (!aiService.isAvailable()) {
      throw new Error('AI text generation is not configured');
    }

    const loc = await this.resolveLocation(input);
    if (!loc) {
      throw new Error(
        'Could not determine the property location. Provide GPS coordinates, a Ghana Post digital address, or an address with a city.'
      );
    }

    // Real amenities from Google Places — this is the grounding for "services".
    const places = await geocodingService.searchNearbyPlaces(loc.latitude, loc.longitude, {
      radiusMeters: 2000,
      maxPerCategory: 3,
    });

    const placeLines =
      places.length > 0
        ? places
            .map(
              (p) =>
                `- ${p.name} (${p.category.replace(/_/g, ' ')}${
                  p.distanceMeters != null ? `, ~${p.distanceMeters} m` : ''
                })`
            )
            .join('\n')
        : '(no amenities were returned by Google Places for this location)';

    const localityName = loc.locality || loc.district || 'the locality';
    const cityName = input.city || loc.district || loc.region || 'the city';

    const system =
      'You are a chartered valuation surveyor in Ghana drafting the location section of a formal valuation report (RICS style). ' +
      'You MUST use ONLY the facts provided below. Do NOT invent landmarks, distances, schools, roads, statistics, or amenities ' +
      'that are not in the data. For named amenities, refer ONLY to the items in "Nearby amenities". ' +
      'You may state widely-known, non-specific geographic context about the named city/region, but never fabricate specifics. ' +
      'Write in a measured, professional third-person register. Return STRICT JSON with exactly these keys: ' +
      'city_description, city_details, neighbourhood_description, neighborhood_details, location_description, ' +
      'services_description. Each value is plain prose (no markdown).';

    const prompt = [
      `Region: ${loc.region || 'Unknown'}`,
      `District: ${loc.district || 'Unknown'}`,
      `City/Town: ${cityName}`,
      `Neighbourhood/Locality: ${localityName}`,
      input.neighborhoodClass ? `Neighbourhood class (assessor input): ${input.neighborhoodClass}` : null,
      input.propertyType ? `Property type: ${String(input.propertyType).replace(/_/g, ' ')}` : null,
      `Coordinates: ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`,
      '',
      'Nearby amenities (real, from Google Places — use these and only these for specific amenity claims):',
      placeLines,
      '',
      'Write these fields:',
      '- city_description: the city/town in general terms (2-3 sentences).',
      '- city_details: additional city context — economic character and role in the region (2-3 sentences). Stay non-specific; do not invent statistics.',
      '- neighbourhood_description: the immediate neighbourhood/locality (2-3 sentences).',
      '- neighborhood_details: further neighbourhood detail — predominant land use and development character (2-3 sentences).',
      '- location_description: the subject’s situation and accessibility (2-3 sentences).',
      '- services_description: utilities and services/amenities available nearby (ground this in the amenities list; 2-4 sentences).',
    ]
      .filter((l) => l !== null)
      .join('\n');

    let fields: AreaNarrativeFields;
    try {
      const { data } = await aiService.generateJson<Partial<AreaNarrativeFields>>({
        system,
        prompt,
        temperature: 0.4, // factual register
        maxOutputTokens: 1400,
        feature: 'valuation.area-narrative',
      });
      fields = {
        city_description: (data.city_description || '').trim(),
        city_details: (data.city_details || '').trim(),
        neighbourhood_description: (data.neighbourhood_description || '').trim(),
        neighborhood_details: (data.neighborhood_details || '').trim(),
        location_description: (data.location_description || '').trim(),
        services_description: (data.services_description || '').trim(),
      };
    } catch (err) {
      logger.error('areaNarrativeService: generation failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }

    return {
      fields,
      evidence: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        locality: loc.locality,
        district: loc.district,
        region: loc.region,
        coordinateSource: loc.source,
        places,
        provider: 'gemini/deepseek',
      },
    };
  }
}

export const areaNarrativeService = new AreaNarrativeService();
export default areaNarrativeService;
