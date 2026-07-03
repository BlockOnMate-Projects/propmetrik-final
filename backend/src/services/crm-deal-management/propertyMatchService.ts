/**
 * Property Auto-Match Engine
 *
 * Matches CRM contacts with CRM properties by comparing:
 *   - Budget range vs. price
 *   - Preferred property types vs. property_type
 *   - Preferred locations vs. region / address_city
 *   - Bedrooms / bathrooms preferences (via property_interests JSONB)
 *
 * Scoring formula produces a 0-100 match percentage per property.
 *
 * @module services/crm-deal-management/propertyMatchService
 */

import db from '../../database';
import { logger } from '../../utils/logger';

export interface MatchResult {
    property_id: string;
    title: string;
    reference_number: string;
    property_type: string;
    transaction_type: string;
    price: number;
    price_currency: string;
    region: string;
    address_city: string;
    bedrooms: number | null;
    bathrooms: number | null;
    total_area_sqm: number | null;
    status: string;
    images: any;
    match_score: number;
    match_factors: MatchFactor[];
}

interface MatchFactor {
    factor: string;
    weight: number;
    score: number;
    detail: string;
}

interface ContactPreferences {
    budget_min: number | null;
    budget_max: number | null;
    preferred_locations: string[];
    preferred_property_types: string[];
    property_interests: Record<string, any> | null;
}

const WEIGHTS = {
    budget: 0.35,
    property_type: 0.25,
    location: 0.25,
    specifications: 0.15,
};

export class PropertyMatchService {

    /**
     * Find matching properties for a contact
     */
    async matchProperties(
        contactId: string,
        organizationId: string,
        options: { limit?: number; minScore?: number; excludeSold?: boolean } = {}
    ): Promise<MatchResult[]> {
        const { limit = 20, minScore = 20, excludeSold = true } = options;

        // 1. Get contact preferences
        const contactResult = await db.query(
            `SELECT budget_min, budget_max, preferred_locations, preferred_property_types,
                    property_interests
             FROM contacts
             WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [contactId, organizationId]
        );

        if (contactResult.rows.length === 0) {
            throw new Error('Contact not found');
        }

        const prefs: ContactPreferences = contactResult.rows[0] as any;

        // 2. Fetch candidate properties (crm_properties has no soft-delete column)
        let propertyWhere = 'p.organization_id = $1';
        const params: any[] = [organizationId];

        if (excludeSold) {
            propertyWhere += ` AND p.status NOT IN ('sold', 'rented', 'withdrawn', 'expired')`;
        }

        // Pre-filter by budget range (generous: ±30%)
        if (prefs.budget_min || prefs.budget_max) {
            const filterMin = (prefs.budget_min || 0) * 0.7;
            const filterMax = (prefs.budget_max || Number.MAX_SAFE_INTEGER) * 1.3;
            params.push(filterMin, filterMax);
            propertyWhere += ` AND p.price >= $${params.length - 1} AND p.price <= $${params.length}`;
        }

        const propertiesResult = await db.query(
            `SELECT p.id as property_id, p.title, p.reference_number, p.property_type,
                    p.transaction_type, p.price, p.price_currency, p.region,
                    p.address_city, p.bedrooms, p.bathrooms, p.total_area_sqm,
                    p.status, p.images
             FROM crm_properties p
             WHERE ${propertyWhere}
             ORDER BY p.created_at DESC
             LIMIT 200`,
            params
        );

        // 3. Score each property
        const scored: MatchResult[] = [];

        for (const prop of propertiesResult.rows) {
            const factors: MatchFactor[] = [];

            // Budget match
            const budgetScore = this.scoreBudget(prefs, prop.price);
            factors.push({
                factor: 'Budget',
                weight: WEIGHTS.budget,
                score: budgetScore,
                detail: prefs.budget_min || prefs.budget_max
                    ? `GHS ${(prefs.budget_min || 0).toLocaleString()}-${(prefs.budget_max || '∞').toLocaleString()} vs. GHS ${parseFloat(prop.price || 0).toLocaleString()}`
                    : 'No budget set',
            });

            // Property type match
            const typeScore = this.scorePropertyType(prefs, prop.property_type);
            factors.push({
                factor: 'Property Type',
                weight: WEIGHTS.property_type,
                score: typeScore,
                detail: prefs.preferred_property_types?.length
                    ? `Wants: ${prefs.preferred_property_types.join(', ')} | Is: ${prop.property_type}`
                    : 'No type preference',
            });

            // Location match
            const locationScore = this.scoreLocation(prefs, prop.region, prop.address_city);
            factors.push({
                factor: 'Location',
                weight: WEIGHTS.location,
                score: locationScore,
                detail: prefs.preferred_locations?.length
                    ? `Wants: ${prefs.preferred_locations.join(', ')} | Is: ${prop.region}, ${prop.address_city}`
                    : 'No location preference',
            });

            // Specifications match (bedrooms, bathrooms, area)
            const specScore = this.scoreSpecifications(prefs, prop);
            factors.push({
                factor: 'Specifications',
                weight: WEIGHTS.specifications,
                score: specScore,
                detail: this.getSpecDetail(prefs, prop),
            });

            // Weighted total score
            const totalScore = Math.round(
                factors.reduce((sum, f) => sum + f.weight * f.score, 0)
            );

            if (totalScore >= minScore) {
                scored.push({
                    ...prop,
                    price: parseFloat(prop.price || '0'),
                    match_score: totalScore,
                    match_factors: factors,
                } as MatchResult);
            }
        }

        // 4. Sort by score descending and limit
        scored.sort((a, b) => b.match_score - a.match_score);
        return scored.slice(0, limit);
    }

    /**
     * Reverse match: find contacts that match a given property
     */
    async matchContacts(
        propertyId: string,
        organizationId: string,
        options: { limit?: number; minScore?: number } = {}
    ): Promise<Array<{
        contact_id: string;
        name: string;
        email: string;
        phone: string;
        lead_status: string;
        lead_score: number;
        match_score: number;
    }>> {
        const { limit = 20, minScore = 20 } = options;

        const propResult = await db.query(
            `SELECT price, property_type, region, address_city, bedrooms, bathrooms, total_area_sqm
             FROM crm_properties WHERE id = $1 AND organization_id = $2`,
            [propertyId, organizationId]
        );
        if (propResult.rows.length === 0) throw new Error('Property not found');
        const prop = propResult.rows[0];

        // Fetch contacts with budget overlap
        const contactsResult = await db.query(
            `SELECT id as contact_id,
                    first_name || ' ' || last_name as name,
                    email, primary_phone as phone,
                    lead_status, lead_score,
                    budget_min, budget_max,
                    preferred_locations, preferred_property_types,
                    property_interests
             FROM contacts
             WHERE organization_id = $1 AND deleted_at IS NULL
               AND (budget_max IS NULL OR budget_max >= $2 * 0.7)
               AND (budget_min IS NULL OR budget_min <= $2 * 1.3)
             ORDER BY lead_score DESC NULLS LAST
             LIMIT 200`,
            [organizationId, prop.price || 0]
        );

        const results: Array<any> = [];

        for (const contact of contactsResult.rows) {
            const prefs: ContactPreferences = {
                budget_min: contact.budget_min ? parseFloat(contact.budget_min) : null,
                budget_max: contact.budget_max ? parseFloat(contact.budget_max) : null,
                preferred_locations: contact.preferred_locations || [],
                preferred_property_types: contact.preferred_property_types || [],
                property_interests: contact.property_interests,
            };

            const budgetScore = this.scoreBudget(prefs, prop.price);
            const typeScore = this.scorePropertyType(prefs, prop.property_type);
            const locationScore = this.scoreLocation(prefs, prop.region, prop.address_city);
            const specScore = this.scoreSpecifications(prefs, prop);

            const totalScore = Math.round(
                WEIGHTS.budget * budgetScore +
                WEIGHTS.property_type * typeScore +
                WEIGHTS.location * locationScore +
                WEIGHTS.specifications * specScore
            );

            if (totalScore >= minScore) {
                results.push({
                    contact_id: contact.contact_id,
                    name: contact.name,
                    email: contact.email,
                    phone: contact.phone,
                    lead_status: contact.lead_status,
                    lead_score: contact.lead_score,
                    match_score: totalScore,
                });
            }
        }

        results.sort((a, b) => b.match_score - a.match_score);
        return results.slice(0, limit);
    }

    // ─── Scoring helpers ───────────────────────────────

    private scoreBudget(prefs: ContactPreferences, price: string | number): number {
        if (!prefs.budget_min && !prefs.budget_max) return 50; // neutral
        const p = parseFloat(String(price || '0'));
        if (p === 0) return 30;

        const min = prefs.budget_min || 0;
        const max = prefs.budget_max || Infinity;

        if (p >= min && p <= max) return 100; // perfect
        if (p < min) {
            const diff = (min - p) / min;
            return Math.max(0, Math.round(100 - diff * 150)); // penalize below budget less
        }
        // p > max
        const diff = (p - max) / max;
        return Math.max(0, Math.round(100 - diff * 200)); // penalize over budget more
    }

    private scorePropertyType(prefs: ContactPreferences, propertyType: string): number {
        if (!prefs.preferred_property_types || prefs.preferred_property_types.length === 0) return 50;
        const normalized = propertyType?.toLowerCase().replace(/[_-]/g, '') || '';
        for (const pref of prefs.preferred_property_types) {
            const normalizedPref = pref.toLowerCase().replace(/[_-]/g, '');
            if (normalizedPref === normalized) return 100;
            // Partial match (e.g., "residential" matches "residential_apartment")
            if (normalized.includes(normalizedPref) || normalizedPref.includes(normalized)) return 70;
        }
        return 0;
    }

    private scoreLocation(prefs: ContactPreferences, region: string, city: string): number {
        if (!prefs.preferred_locations || prefs.preferred_locations.length === 0) return 50;
        const normalizedRegion = region?.toLowerCase().replace(/[_-]/g, ' ') || '';
        const normalizedCity = city?.toLowerCase() || '';
        for (const pref of prefs.preferred_locations) {
            const normalizedPref = pref.toLowerCase().replace(/[_-]/g, ' ');
            // Exact region match
            if (normalizedPref === normalizedRegion || normalizedPref === normalizedCity) return 100;
            // Partial / contains
            if (normalizedRegion.includes(normalizedPref) || normalizedPref.includes(normalizedRegion)) return 80;
            if (normalizedCity.includes(normalizedPref) || normalizedPref.includes(normalizedCity)) return 80;
        }
        return 0;
    }

    private scoreSpecifications(prefs: ContactPreferences, prop: any): number {
        if (!prefs.property_interests) return 50;
        const interests = prefs.property_interests;
        let score = 50;
        let factors = 0;

        if (interests.min_bedrooms && prop.bedrooms) {
            factors++;
            score += prop.bedrooms >= interests.min_bedrooms ? 50 : -20;
        }
        if (interests.min_bathrooms && prop.bathrooms) {
            factors++;
            score += prop.bathrooms >= interests.min_bathrooms ? 50 : -20;
        }
        if (interests.min_area && prop.total_area_sqm) {
            factors++;
            score += parseFloat(prop.total_area_sqm) >= interests.min_area ? 50 : -20;
        }

        if (factors === 0) return 50;
        return Math.max(0, Math.min(100, Math.round(score / factors)));
    }

    private getSpecDetail(prefs: ContactPreferences, prop: any): string {
        if (!prefs.property_interests) return 'No spec preferences';
        const interests = prefs.property_interests;
        const parts: string[] = [];
        if (interests.min_bedrooms) parts.push(`Beds: wants ≥${interests.min_bedrooms}, has ${prop.bedrooms || '?'}`);
        if (interests.min_bathrooms) parts.push(`Baths: wants ≥${interests.min_bathrooms}, has ${prop.bathrooms || '?'}`);
        if (interests.min_area) parts.push(`Area: wants ≥${interests.min_area}sqm, has ${prop.total_area_sqm || '?'}sqm`);
        return parts.length ? parts.join(' | ') : 'No spec preferences';
    }
}

export const propertyMatchService = new PropertyMatchService();
