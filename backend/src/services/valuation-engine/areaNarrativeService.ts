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
    /** The city the valuer typed (may differ from where the coordinates resolved). */
    inputCity: string | null;
    /** True when the typed city does not match the reverse-geocoded place. */
    cityMismatch: boolean;
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
    inputCity: string | null;
  } | null> {
    const inputCity = input.city ?? null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    let locality: string | null = null;
    let district: string | null = null;
    let region: string | null = input.region ?? null;
    let source = '';

    // 1. Explicit coordinates (most accurate — use as-is).
    if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
      latitude = input.latitude;
      longitude = input.longitude;
      source = 'coordinates';
    }
    // 2. Ghana Post GPS digital address. NOTE: a valid-looking code is decoded
    //    mathematically — even a fabricated one yields coordinates. We therefore
    //    do NOT trust its area name; the reverse-geocode pass below names the point.
    else if (input.digitalAddress) {
      const gp = await ghanaPostService.geocodeDigitalAddress(input.digitalAddress).catch(() => null);
      if (gp) {
        latitude = gp.latitude;
        longitude = gp.longitude;
        locality = gp.area || null;
        district = gp.district || null;
        region = gp.region || region;
        source = `ghana_post:${gp.source}`;
      }
    }

    // 3. Free-text address (Mapbox → Google) — only if nothing above resolved.
    if (latitude === null && (input.address || input.city)) {
      const addrParts = [input.address, input.city, input.region, 'Ghana'].filter(Boolean).join(', ');
      const geo = await geocodingService.geocode(addrParts).catch(() => null);
      if (geo) {
        latitude = geo.latitude;
        longitude = geo.longitude;
        locality = geo.neighborhood || null;
        district = geo.district || null;
        region = geo.region || region;
        source = `geocode:${geo.provider}`;
      }
    }

    if (latitude === null || longitude === null) return null;

    // Authoritative naming: reverse-geocode the RESOLVED coordinates so the report
    // describes where the point ACTUALLY is — never the typed city. This is what
    // catches a wrong/decoded digital address silently mislabelling the location.
    if (!locality || !district || !region) {
      const rev = await geocodingService.reverseGeocode(latitude, longitude).catch(() => null);
      if (rev) {
        locality = locality || rev.neighborhood || null;
        district = district || rev.district || null;
        region = region || rev.region || null;
      }
    }

    return { latitude, longitude, locality, district, region, source, inputCity };
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

    // Flag when the valuer's typed city disagrees with where the coordinates resolved
    // (e.g. a wrong/placeholder digital address points somewhere the typed city isn't).
    const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    const typedCity = norm(loc.inputCity);
    const resolvedNames = [loc.locality, loc.district].map(norm).filter(Boolean);
    const cityMismatch =
      !!typedCity &&
      resolvedNames.length > 0 &&
      !resolvedNames.some((n) => n.includes(typedCity) || typedCity.includes(n));

    // Real amenities + landmarks from Google Places — the grounding for "services" and
    // for the named landmarks in the neighbourhood narrative. Wider radius + more per
    // category gives the AI enough real institutions (banks, schools, churches, hospitals,
    // hotels, government offices) to write a richer, reference-grade neighbourhood section.
    const places = await geocodingService.searchNearbyPlaces(loc.latitude, loc.longitude, {
      radiusMeters: 3000,
      maxPerCategory: 5,
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

    // Prefer the reverse-geocoded place for the write-up so the narrative matches the
    // coordinates. Fall back to the typed city ONLY when geocoding yielded no name
    // (that path also never flags a mismatch), then to region as a last resort.
    const localityName = loc.locality || loc.district || loc.inputCity || 'the locality';
    const cityName = loc.district || loc.locality || loc.inputCity || loc.region || 'the city';

    const system =
      'You are a chartered valuation surveyor in Ghana drafting the location section of a formal valuation report (RICS style). ' +
      'You have Google Search available — USE IT to find VERIFIABLE, current facts about the named city and neighbourhood: ' +
      'neighbouring towns/suburbs, notable estates and housing developments (e.g. State Housing, SSNIT estates), principal ' +
      'industries and major employers, transport and infrastructure (ports, rail, roads, airports), and prevailing housing-market ' +
      'conditions. Weave these real facts in to write with the depth of a senior valuer’s report. ' +
      'Do NOT invent or guess — state ONLY what your search results, widely-known facts about that place, or the data below support. ' +
      'For specific nearby amenities, use the items in "Nearby amenities". Never fabricate figures, distances, or named places. ' +
      'Write in a measured, professional third-person register. Return STRICT JSON (a single JSON object, no prose or citations ' +
      'outside it) with exactly these keys: ' +
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
      'Write substantive, report-grade prose for each field — the depth of a professional',
      'Ghanaian valuation report. Be specific where the data allows, but NEVER invent facts.',
      '',
      '- city_description: the city/town — its identity, geographic setting (e.g. distance/direction from regional or national reference points if widely known), administrative role and significance (4-6 sentences).',
      '- city_details: the city economic character — principal economic activities, key infrastructure (port/harbour, roads, rail, airport where applicable), housing-market dynamics and development trends, drawing only on widely-known, verifiable context about THIS named city/region. Do not invent statistics (4-6 sentences).',
      '- neighbourhood_description: the immediate neighbourhood — its class/character, predominant uses, income profile and built form. Where the Nearby amenities list contains notable institutions (banks, schools, churches, hospitals, hotels, government/public offices, media stations), NAME them explicitly as landmarks of the neighbourhood (e.g. "Notable landmarks include …") (4-6 sentences).',
      '- neighborhood_details: further detail — predominant land use mix, building types and heights, road network and town-planning quality (street naming, tarred access, Ghana Post addressing) (3-5 sentences).',
      '- location_description: the subject’s precise situation, principal access routes, and proximity/relationship to the named nearby amenities and arterial roads (3-5 sentences).',
      '- services_description: utilities (water, electricity, telecommunications, sewerage/sanitation) and the services/amenities available in the vicinity, grounded in the amenities list (3-5 sentences).',
    ]
      .filter((l) => l !== null)
      .join('\n');

    let fields: AreaNarrativeFields;
    try {
      const { data } = await aiService.generateJson<Partial<AreaNarrativeFields>>({
        system,
        prompt,
        temperature: 0.45, // factual register, slight lift for richer prose
        maxOutputTokens: 2400, // allow the longer, report-grade narratives
        searchGrounding: true, // pull real, citable local facts (estates, industries, nearby towns, market)
        timeoutMs: 60_000, // web-search grounding is slower than a plain completion
        feature: 'valuation.area-narrative',
      });
      // Search grounding makes the model leave inline citation markers like "[3, 5]" or "[2]"
      // in the prose. Strip them (and any space before) so the report reads cleanly.
      const clean = (s?: string) =>
        (s || '').replace(/\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '').replace(/\s{2,}/g, ' ').trim();
      fields = {
        city_description: clean(data.city_description),
        city_details: clean(data.city_details),
        neighbourhood_description: clean(data.neighbourhood_description),
        neighborhood_details: clean(data.neighborhood_details),
        location_description: clean(data.location_description),
        services_description: clean(data.services_description),
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
        inputCity: loc.inputCity,
        cityMismatch,
        places,
        provider: 'gemini/deepseek',
      },
    };
  }
}

export const areaNarrativeService = new AreaNarrativeService();
export default areaNarrativeService;
