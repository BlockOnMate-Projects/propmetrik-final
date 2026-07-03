import type { ComprehensivePropertyData } from '@/types/comprehensiveProperty'

/**
 * Canonical property-update payload for the valuation Subject form.
 *
 * Used by BOTH the /new draft auto-save and the [id]/subject save so the two write the
 * IDENTICAL shape — same top-level property columns AND the same `metadata.*` report
 * writeups (grounds, construction, condition, services, land value, risk assessment).
 * Keeping this in one place prevents the field-mapping drift that would make a value
 * saved on one screen fail to reload on the other.
 */
export function buildPropertyUpdatePayload(d: Partial<ComprehensivePropertyData>) {
  const a = d as any
  return {
    address_street: d.address,
    address_city: d.city,
    region: d.region,
    digital_address: d.digital_address,
    property_type: d.property_type,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    total_floors: a.total_floors,
    year_built: d.year_built,
    building_area_sqm: a.gfa,
    land_area_sqm: a.land_area || a.plot_size,
    quality_rating: a.quality_rating,
    condition: d.condition,
    tenure_type: a.tenure_type,
    owner_name: d.owner_name,
    owner_email: d.owner_email,
    owner_phone: d.owner_phone,
    owner_address: d.owner_address,
    description: a.brief_description,
    // Persist the ENTIRE subject form into metadata so EVERY field round-trips between the
    // /new draft, the [id]/subject editor, and the report — not just the Chapter-3 writeups.
    // Anything without a dedicated column (amenities has_*, tenure_type, lease_years_remaining,
    // client_*, valuation dates, owner prefs, the risk-assessment object) is preserved here and
    // read back on load. The explicit keys below are kept for clarity and to guard against type
    // drift; the spread makes the store complete. (The backend merges metadata, so nothing is lost.)
    metadata: {
      ...a,
      city_description: a.city_description,
      city_details: a.city_details,
      neighbourhood_description: a.neighbourhood_description,
      neighborhood_class: a.neighborhood_class,
      resident_income_level: a.resident_income_level,
      primary_use: a.primary_use,
      neighborhood_details: a.neighborhood_details,
      location_description: a.location_description,
      brief_description: a.brief_description,
      grounds_external_works: a.grounds_external_works,
      floor_finish: a.floor_finish,
      wall_construction: a.wall_construction,
      doors: a.doors,
      windows: a.windows,
      ceiling: a.ceiling,
      roofing: a.roofing,
      fixtures_fittings: a.fixtures_fittings,
      drainage_sanitation: a.drainage_sanitation,
      condition_state: a.condition_state,
      services_description: a.services_description,
      land_value_evidence: a.land_value_evidence,
      risk_assessment: a.risk_assessment,
    },
  }
}
