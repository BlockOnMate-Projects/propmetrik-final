/**
 * Getting-Around Service — Walk / Transit / Bike scores (Marketplace Phase 2).
 *
 * Zillow surfaces Walk Score®, Transit Score® and Bike Score® — all licensed from
 * Walk Score (a Redfin company) whose coverage is US/Canada only. There is no Ghana
 * equivalent to license, so we COMPUTE our own transparent 0–100 scores from
 * OpenStreetMap data via the shared Overpass helper (geocodingService.overpass) —
 * no new dependency, no paid API.
 *
 * These are HONEST heuristics (method = 'osm-heuristic'), not the trademarked Walk
 * Score®: walkability from the density + proximity of everyday destinations, transit
 * from nearby stops, bike from cycling infrastructure + destination access. Data
 * completeness depends on OSM coverage (good in Accra/Kumasi, sparse rurally), so a
 * low score can mean "few mapped amenities" as much as "car-dependent".
 */

import { geocodingService } from './geocodingService';
import { logger } from '../../src/utils/logger';

export interface GettingAroundScore {
  score: number;         // 0–100
  label: string;         // human band, e.g. "Somewhat Walkable"
  count: number;         // supporting POIs / stops / bike segments found
}

export interface GettingAroundResult {
  walk: GettingAroundScore;
  transit: GettingAroundScore;
  bike: GettingAroundScore;
  method: 'osm-heuristic';
  radius_km: number;
}

type Category =
  | 'grocery' | 'food' | 'retail' | 'school' | 'health'
  | 'bank' | 'park' | 'worship' | 'transit' | 'bike_infra';

// Everyday-destination categories that make an area walkable, with weights.
const WALK_WEIGHTS: Partial<Record<Category, number>> = {
  grocery: 3,   // supermarkets + Ghana markets — the anchor of daily errands
  food: 2,
  retail: 2,
  school: 1.5,
  health: 1.5,
  bank: 1,
  park: 1,
  worship: 0.5,
};
const WALK_MAX = Object.values(WALK_WEIGHTS).reduce((a, b) => a + (b || 0), 0);

const WALK_RADIUS_KM = 1.6;    // ≈ 1 mile, the standard walk-shed
const TRANSIT_RADIUS_KM = 1.0;

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

function walkBand(s: number): string {
  if (s >= 90) return "Walker's Paradise";
  if (s >= 70) return 'Very Walkable';
  if (s >= 50) return 'Somewhat Walkable';
  if (s >= 25) return 'Car-Dependent';
  return 'Very Car-Dependent';
}
function transitBand(s: number): string {
  if (s >= 90) return "Rider's Paradise";
  if (s >= 70) return 'Excellent Transit';
  if (s >= 50) return 'Good Transit';
  if (s >= 25) return 'Some Transit';
  return 'Minimal Transit';
}
function bikeBand(s: number): string {
  if (s >= 90) return "Biker's Paradise";
  if (s >= 70) return 'Very Bikeable';
  if (s >= 50) return 'Bikeable';
  if (s >= 25) return 'Somewhat Bikeable';
  return 'Minimal Bike Infrastructure';
}

class GettingAroundService {
  /** Classify an OSM element into one or more of our destination categories. */
  private classify(tags: Record<string, string> | undefined): Category[] {
    if (!tags) return [];
    const cats: Category[] = [];
    const shop = tags.shop;
    const amenity = tags.amenity;
    const leisure = tags.leisure;

    if (shop) {
      cats.push('retail');
      if (['supermarket', 'convenience', 'grocery', 'greengrocer', 'general'].includes(shop)) cats.push('grocery');
    }
    if (amenity === 'marketplace') cats.push('grocery');
    if (amenity && ['restaurant', 'cafe', 'fast_food', 'food_court'].includes(amenity)) cats.push('food');
    if (amenity && ['bank', 'atm'].includes(amenity)) cats.push('bank');
    if (amenity && ['pharmacy', 'clinic', 'hospital', 'doctors'].includes(amenity)) cats.push('health');
    if (amenity === 'school') cats.push('school');
    if (amenity === 'place_of_worship') cats.push('worship');
    if (leisure && ['park', 'garden', 'pitch', 'playground'].includes(leisure)) cats.push('park');

    if (
      tags.highway === 'bus_stop' ||
      tags.railway === 'station' ||
      amenity === 'bus_station' ||
      tags.public_transport === 'platform' ||
      tags.public_transport === 'station' ||
      tags.public_transport === 'stop_position'
    ) {
      cats.push('transit');
    }
    if (tags.highway === 'cycleway' || (tags.cycleway && tags.cycleway !== 'no') || tags.bicycle === 'designated') {
      cats.push('bike_infra');
    }
    return cats;
  }

  private buildQuery(lat: number, lng: number): string {
    const w = Math.round(WALK_RADIUS_KM * 1000);
    const t = Math.round(TRANSIT_RADIUS_KM * 1000);
    return `[out:json][timeout:25];(` +
      `node["shop"](around:${w},${lat},${lng});way["shop"](around:${w},${lat},${lng});` +
      `node["amenity"~"^(restaurant|cafe|fast_food|food_court|bank|atm|pharmacy|clinic|hospital|doctors|school|marketplace|place_of_worship|bus_station)$"](around:${w},${lat},${lng});` +
      `way["amenity"~"^(school|hospital|marketplace)$"](around:${w},${lat},${lng});` +
      `node["leisure"~"^(park|garden|pitch|playground)$"](around:${w},${lat},${lng});` +
      `way["leisure"~"^(park|garden|pitch|playground)$"](around:${w},${lat},${lng});` +
      `node["highway"="bus_stop"](around:${t},${lat},${lng});` +
      `node["railway"="station"](around:${t},${lat},${lng});` +
      `node["public_transport"](around:${t},${lat},${lng});` +
      `way["highway"="cycleway"](around:${w},${lat},${lng});` +
      `way["cycleway"](around:${w},${lat},${lng});` +
      `);out center;`;
  }

  /**
   * Compute Walk / Transit / Bike scores for a point. Never throws — returns all-zero
   * scores when OSM has nothing (which is itself meaningful: an unmapped/rural area).
   */
  async getScores(lat: number, lng: number): Promise<GettingAroundResult> {
    try {
      const elements = await geocodingService.overpass(this.buildQuery(lat, lng));

      // nearest distance (km) + count per category
      const nearest: Partial<Record<Category, number>> = {};
      const counts: Partial<Record<Category, number>> = {};

      for (const el of elements) {
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        if (typeof elLat !== 'number' || typeof elLon !== 'number') continue;
        const dist = geocodingService.calculateDistance(lat, lng, elLat, elLon);
        for (const cat of this.classify(el.tags)) {
          counts[cat] = (counts[cat] || 0) + 1;
          if (nearest[cat] === undefined || dist < (nearest[cat] as number)) nearest[cat] = dist;
        }
      }

      // ── Walk: weighted blend of proximity (60%) + density (40%) per category ──
      let walkPoints = 0;
      let walkSupport = 0;
      for (const [cat, weight] of Object.entries(WALK_WEIGHTS) as [Category, number][]) {
        const c = counts[cat] || 0;
        if (c === 0) continue;
        walkSupport += c;
        const near = nearest[cat] ?? WALK_RADIUS_KM;
        // proximity: 1.0 at ≤0.4km → 0 at 1.6km
        const proximity = clamp((WALK_RADIUS_KM - near) / (WALK_RADIUS_KM - 0.4));
        const density = clamp(c / 3); // 3+ of a category counts as "full"
        walkPoints += weight * (0.6 * proximity + 0.4 * density);
      }
      const walkScore = Math.round(100 * clamp(walkPoints / WALK_MAX));

      // ── Transit: stop density + proximity within 1km ──
      const transitCount = counts.transit || 0;
      let transitScore = 0;
      if (transitCount > 0) {
        const near = nearest.transit ?? TRANSIT_RADIUS_KM;
        const proximity = clamp((TRANSIT_RADIUS_KM - near) / (TRANSIT_RADIUS_KM - 0.2));
        const density = clamp(transitCount / 8);
        transitScore = Math.round(100 * (0.5 * proximity + 0.5 * density));
      }

      // ── Bike: cycling infrastructure (50%) + walkable-destination access (50%) ──
      const bikeInfra = counts.bike_infra || 0;
      const infraFactor = clamp(bikeInfra / 5);
      const bikeScore = Math.round(100 * (0.5 * infraFactor + 0.5 * (walkScore / 100)));

      return {
        walk: { score: walkScore, label: walkBand(walkScore), count: walkSupport },
        transit: { score: transitScore, label: transitBand(transitScore), count: transitCount },
        bike: { score: bikeScore, label: bikeBand(bikeScore), count: bikeInfra },
        method: 'osm-heuristic',
        radius_km: WALK_RADIUS_KM,
      };
    } catch (error: any) {
      logger.error('Getting-around score error', { error: error.message, lat, lng });
      return {
        walk: { score: 0, label: walkBand(0), count: 0 },
        transit: { score: 0, label: transitBand(0), count: 0 },
        bike: { score: 0, label: bikeBand(0), count: 0 },
        method: 'osm-heuristic',
        radius_km: WALK_RADIUS_KM,
      };
    }
  }
}

export const gettingAroundService = new GettingAroundService();
