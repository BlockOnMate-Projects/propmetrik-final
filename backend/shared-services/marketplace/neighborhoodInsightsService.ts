/**
 * Neighborhood Insights Service — Marketplace Phase 1 orchestrator.
 *
 * Surfaces Zillow-style neighbourhood context on a public listing by REUSING data
 * PropMetrik already collects — nothing here fetches a new primary source:
 *   • Nearby schools / hospitals / transit  → geocodingService (OpenStreetMap Overpass)
 *   • Getting around (walk/transit/bike)     → gettingAroundService (OSM heuristic)
 *   • Flood risk                             → floodRiskService (NADMO incidents + PostGIS)
 *   • Neighbourhood demographics             → GSS income + PHC population/household size
 *   • AI narrative                           → aiService (summarises ONLY the facts above)
 *
 * Every section is independent (Promise.allSettled) so one slow/failed source never
 * blanks the others. Results are cached in-process (Overpass + GSS are expensive and
 * change slowly). The AI narrative is strictly grounded: it may only restate the
 * numbers we pass it — it must never invent a rating, school, statistic or risk.
 */

import { marketplaceService } from './marketplaceService';
import { geocodingService } from './geocodingService';
import { gettingAroundService, type GettingAroundResult } from './gettingAroundService';
import { floodRiskService } from '../risk/floodRiskService';
import { gssIncomeService } from '../../src/services/data-hub/gssIncomeService';
import { gssPhcPopulationService } from '../../src/services/data-hub/scrapers/gssPhcPopulationService';
import { aiService } from '../../src/services/ai/aiService';
import { logger } from '../../src/utils/logger';

interface Amenity { name: string; distance_km: number; kind?: string; lat?: number | null; lng?: number | null }

interface Demographics {
  region_label: string;
  currency: 'GHS';
  median_income_monthly: number | null;
  median_income_annual: number | null;
  avg_household_size: number | null;
  population_2021: number | null;
  population_2030: number | null;
}

export interface NeighborhoodInsights {
  location: { lat: number; lng: number } | null;
  region: string | null;
  region_label: string | null;
  city: string | null;
  amenities: { schools: Amenity[]; hospitals: Amenity[]; transit_stops: Amenity[] } | null;
  floodRisk: {
    score: number;
    level: 'low' | 'moderate' | 'high' | 'critical';
    nearby_incidents: number;
    nearest_incident_distance_m: number | null;
    risk_factors: string[];
  } | null;
  gettingAround: GettingAroundResult | null;
  demographics: Demographics | null;
}

interface CacheEntry<T> { data: T; expires: number }

const INSIGHTS_TTL_MS = 6 * 60 * 60 * 1000;   // 6h — Overpass/NADMO/GSS change slowly
const NARRATIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Canonical region key: "Greater Accra" and "greater_accra" both → "greateraccra". */
function normRegion(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Prettify a region code for display: "greater_accra" → "Greater Accra". */
function regionLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a region → value map keyed by the normalised region for tolerant lookup. */
function byNormRegion<T>(rec: Record<string, T>): Map<string, T> {
  const m = new Map<string, T>();
  for (const [k, v] of Object.entries(rec)) m.set(normRegion(k), v);
  return m;
}

function trimAmenities(
  list: Array<{ name: string; distance_km: number; kind?: string; location?: { lat: number; lon: number } }> | undefined,
  n = 6
): Amenity[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && a.name && a.name !== 'Unknown')
    .slice(0, n)
    .map((a) => ({
      name: a.name,
      distance_km: Math.round(a.distance_km * 10) / 10,
      kind: a.kind,
      lat: a.location?.lat ?? null,
      lng: a.location?.lon ?? null,
    }));
}

class NeighborhoodInsightsService {
  private insightsCache = new Map<string, CacheEntry<NeighborhoodInsights>>();
  private narrativeCache = new Map<string, CacheEntry<{ summary: string | null; provider?: string }>>();

  /** Resolve the listing's coordinates + region by its public token (PM or CRM). */
  private async resolveGeo(token: string) {
    const p = await marketplaceService.getPropertyByToken(token);
    if (!p) return null;
    const loc = p.location && typeof p.location.lat === 'number' && typeof p.location.lon === 'number'
      ? { lat: p.location.lat, lng: p.location.lon }
      : null;
    return { location: loc, region: p.region || null, city: (p as any).city || null };
  }

  private async buildDemographics(region: string | null): Promise<Demographics | null> {
    if (!region) return null;
    try {
      const [income, projections, household] = await Promise.all([
        gssIncomeService.getLatestIncomeByRegion().catch(() => ({} as Record<string, { monthly: number; annual: number }>)),
        gssPhcPopulationService.getProjectionsByRegion().catch(() => ({} as Record<string, any>)),
        gssPhcPopulationService.getAvgHouseholdSizeByRegion().catch(() => ({} as Record<string, number | null>)),
      ]);
      const key = normRegion(region);
      const inc = byNormRegion(income).get(key);
      const proj = byNormRegion(projections).get(key);
      const hh = byNormRegion(household).get(key);

      // Nothing matched this region → no panel (rather than an empty shell).
      if (!inc && !proj && (hh === undefined || hh === null)) return null;

      return {
        region_label: regionLabel(region) || region,
        currency: 'GHS',
        median_income_monthly: inc ? Math.round(inc.monthly) : null,
        median_income_annual: inc ? Math.round(inc.annual) : null,
        avg_household_size: (hh ?? null) as number | null,
        population_2021: proj?.base_total ?? null,
        population_2030: proj?.horizon_total ?? null,
      };
    } catch (err: any) {
      logger.warn('Demographics build failed', { region, error: err?.message });
      return null;
    }
  }

  /** Full neighbourhood insight bundle for a listing token (cached, resilient). */
  async getInsights(token: string): Promise<NeighborhoodInsights | null> {
    const cached = this.insightsCache.get(token);
    if (cached && cached.expires > this.now()) return cached.data;

    const geo = await this.resolveGeo(token);
    if (!geo) return null;

    const { location, region, city } = geo;

    // Geo-based sections need coordinates; demographics only needs the region.
    const [amenitiesR, floodR, aroundR, demoR] = await Promise.allSettled([
      location
        ? geocodingService.getNearbyAmenities(location.lat, location.lng, 2, ['school', 'hospital', 'transit'])
        : Promise.resolve(null),
      location
        ? floodRiskService.assessPropertyRisk({ latitude: location.lat, longitude: location.lng })
        : Promise.resolve(null),
      location
        ? gettingAroundService.getScores(location.lat, location.lng)
        : Promise.resolve(null),
      this.buildDemographics(region),
    ]);

    const amenitiesRaw = amenitiesR.status === 'fulfilled' ? amenitiesR.value : null;
    const flood = floodR.status === 'fulfilled' ? floodR.value : null;
    const around = aroundR.status === 'fulfilled' ? aroundR.value : null;
    const demographics = demoR.status === 'fulfilled' ? demoR.value : null;

    const amenities = amenitiesRaw
      ? {
          schools: trimAmenities(amenitiesRaw.schools),
          hospitals: trimAmenities(amenitiesRaw.hospitals),
          transit_stops: trimAmenities(amenitiesRaw.transit_stops),
        }
      : null;

    const insights: NeighborhoodInsights = {
      location,
      region,
      region_label: regionLabel(region),
      city,
      amenities: amenities && (amenities.schools.length || amenities.hospitals.length || amenities.transit_stops.length)
        ? amenities
        : null,
      floodRisk: flood
        ? {
            score: flood.score,
            level: flood.level,
            nearby_incidents: flood.nearby_incidents,
            nearest_incident_distance_m: flood.nearest_incident_distance_m,
            risk_factors: flood.risk_factors,
          }
        : null,
      gettingAround: around,
      demographics,
    };

    this.insightsCache.set(token, { data: insights, expires: this.now() + INSIGHTS_TTL_MS });
    return insights;
  }

  /**
   * AI neighbourhood narrative. Strictly grounded — the model may ONLY restate the
   * numbers we pass; it must not invent ratings, schools, statistics or risks.
   */
  async getNarrative(token: string): Promise<{ summary: string | null; provider?: string }> {
    const cached = this.narrativeCache.get(token);
    if (cached && cached.expires > this.now()) return cached.data;

    if (!aiService.isAvailable()) {
      const out = { summary: null };
      this.narrativeCache.set(token, { data: out, expires: this.now() + NARRATIVE_TTL_MS });
      return out;
    }

    const insights = await this.getInsights(token);
    if (!insights) return { summary: null };

    // Only run the model if we have real facts to summarise.
    const hasFacts = !!(insights.amenities || insights.floodRisk || insights.gettingAround || insights.demographics);
    if (!hasFacts) {
      const out = { summary: null };
      this.narrativeCache.set(token, { data: out, expires: this.now() + NARRATIVE_TTL_MS });
      return out;
    }

    const facts = this.factSheet(insights);
    try {
      const result = await aiService.generateText({
        system:
          'You are a neighbourhood analyst writing for a Ghanaian property marketplace. ' +
          'Write 2–3 short, plain sentences summarising ONLY the facts provided. ' +
          'Do NOT invent or estimate anything not in the facts — no school names, ratings, prices, crime, or risks that are not listed. ' +
          'If flood data shows low/no risk, say so plainly. Use Ghanaian context and British spelling. No headings, no bullet points, no markdown.',
        prompt: `Neighbourhood facts (JSON):\n${facts}\n\nWrite the summary.`,
        temperature: 0.3,
        maxOutputTokens: 220,
        feature: 'marketplace.neighborhood-narrative',
      });
      const summary = (result.text || '').trim() || null;
      const out = { summary, provider: result.provider };
      this.narrativeCache.set(token, { data: out, expires: this.now() + NARRATIVE_TTL_MS });
      return out;
    } catch (err: any) {
      logger.warn('Neighborhood narrative generation failed', { token, error: err?.message });
      return { summary: null };
    }
  }

  /** Compact, factual JSON the model is allowed to restate (nothing else). */
  private factSheet(i: NeighborhoodInsights): string {
    const facts: Record<string, unknown> = {
      area: [i.city, i.region_label].filter(Boolean).join(', ') || i.region_label,
    };
    if (i.gettingAround) {
      facts.getting_around = {
        walk: `${i.gettingAround.walk.score}/100 (${i.gettingAround.walk.label})`,
        transit: `${i.gettingAround.transit.score}/100 (${i.gettingAround.transit.label})`,
        bike: `${i.gettingAround.bike.score}/100 (${i.gettingAround.bike.label})`,
      };
    }
    if (i.amenities) {
      facts.nearby = {
        schools_within_2km: i.amenities.schools.length,
        hospitals_within_2km: i.amenities.hospitals.length,
        transit_stops_within_2km: i.amenities.transit_stops.length,
        nearest_school_km: i.amenities.schools[0]?.distance_km ?? null,
      };
    }
    if (i.floodRisk) {
      facts.flood_risk = {
        level: i.floodRisk.level,
        historical_incidents_nearby: i.floodRisk.nearby_incidents,
      };
    }
    if (i.demographics) {
      facts.demographics = {
        median_household_income_monthly_ghs: i.demographics.median_income_monthly,
        avg_household_size: i.demographics.avg_household_size,
      };
    }
    return JSON.stringify(facts);
  }

  // new Date()/Date.now() are fine in the running app (only workflow scripts forbid them).
  private now(): number {
    return Date.now();
  }
}

export const neighborhoodInsightsService = new NeighborhoodInsightsService();
