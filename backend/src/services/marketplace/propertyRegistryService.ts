/**
 * Property Registry — Marketplace Trust & Anti-Fraud, Phase 4 (Gate D).
 *
 * Fingerprints a property's identity (land title / parcel id / Ghana-Post-GPS digital
 * address). The first listing to register an identity is the incumbent; a later listing
 * of the same identity (or of a SOLD identity) is recorded as a CONFLICT and hidden from
 * the marketplace via the Gate-D read filter until an admin resolves it. This structurally
 * blocks double-listing and double-sale. Properties with no identifier are not de-duplicated.
 */
import db from '../../database';
import { logger } from '../../utils/logger';

export type PropertySource = 'pm' | 'crm';
type Fingerprint = { kind: 'land_title' | 'parcel' | 'digital_address'; fingerprint: string };

/** Normalise an identifier for matching (uppercase, strip non-alphanumerics). */
function norm(v?: string | null): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Upsert the title/parcel identifiers for a property (digital_address lives on the base table). */
export async function setIdentifiers(
  source: PropertySource, propertyId: string, input: { land_title_number?: string | null; parcel_id?: string | null }
): Promise<void> {
  if (input.land_title_number == null && input.parcel_id == null) return;
  await db.query(
    `INSERT INTO property_identifiers (property_source, property_id, land_title_number, parcel_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (property_source, property_id) DO UPDATE
       SET land_title_number = COALESCE(EXCLUDED.land_title_number, property_identifiers.land_title_number),
           parcel_id         = COALESCE(EXCLUDED.parcel_id, property_identifiers.parcel_id),
           updated_at = NOW()`,
    [source, propertyId, input.land_title_number ?? null, input.parcel_id ?? null]
  );
}

/** The identity fingerprints a property currently has (title / parcel / GPS). */
export async function computeFingerprints(source: PropertySource, propertyId: string): Promise<Fingerprint[]> {
  const table = source === 'pm' ? 'properties' : 'crm_properties';
  const r = await db.query(
    `SELECT p.digital_address, pi.land_title_number, pi.parcel_id
       FROM ${table} p
       LEFT JOIN property_identifiers pi ON pi.property_source = $2 AND pi.property_id = p.id
      WHERE p.id = $1`,
    [propertyId, source]
  );
  const row = r.rows[0];
  if (!row) return [];
  const out: Fingerprint[] = [];
  if (norm(row.land_title_number)) out.push({ kind: 'land_title', fingerprint: `title:${norm(row.land_title_number)}` });
  if (norm(row.parcel_id)) out.push({ kind: 'parcel', fingerprint: `parcel:${norm(row.parcel_id)}` });
  if (norm(row.digital_address)) out.push({ kind: 'digital_address', fingerprint: `gps:${norm(row.digital_address)}` });
  return out;
}

async function recordConflict(fp: Fingerprint, reason: 'duplicate_claim' | 'sold_elsewhere', incumbent: any, challengerOrg: string, source: PropertySource, propertyId: string): Promise<any | null> {
  const dup = await db.query(
    `SELECT id FROM property_listing_conflicts
      WHERE fingerprint = $1 AND challenger_source = $2 AND challenger_property_id = $3 AND status = 'open' LIMIT 1`,
    [fp.fingerprint, source, propertyId]
  );
  if (dup.rows[0]) return null;
  const ins = await db.query(
    `INSERT INTO property_listing_conflicts
       (fingerprint, fingerprint_kind, reason, incumbent_org_id, incumbent_source, incumbent_property_id,
        challenger_org_id, challenger_source, challenger_property_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [fp.fingerprint, fp.kind, reason, incumbent?.organization_id ?? null, incumbent?.property_source ?? null,
     incumbent?.property_id ?? null, challengerOrg, source, propertyId]
  );
  logger.warn('Listing conflict recorded', { fingerprint: fp.fingerprint, reason, source, propertyId });
  return ins.rows[0];
}

/**
 * Register a property's identity at right-to-list time. Returns any conflicts detected
 * (the listing is then hidden by Gate D until resolved).
 */
export async function claimIdentity(orgId: string, source: PropertySource, propertyId: string): Promise<{ conflicts: any[] }> {
  const fps = await computeFingerprints(source, propertyId);
  const conflicts: any[] = [];
  for (const fp of fps) {
    const existingRes = await db.query(`SELECT * FROM property_registry WHERE fingerprint = $1`, [fp.fingerprint]);
    const existing = existingRes.rows[0];
    if (!existing) {
      await db.query(
        `INSERT INTO property_registry (fingerprint, fingerprint_kind, organization_id, property_source, property_id)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (fingerprint) DO NOTHING`,
        [fp.fingerprint, fp.kind, orgId, source, propertyId]
      );
      continue;
    }
    const sameListing = existing.property_source === source && existing.property_id === propertyId;
    if (existing.disposition === 'sold') {
      const c = await recordConflict(fp, 'sold_elsewhere', existing, orgId, source, propertyId);
      if (c) conflicts.push(c);
    } else if (!sameListing) {
      const c = await recordConflict(fp, 'duplicate_claim', existing, orgId, source, propertyId);
      if (c) conflicts.push(c);
    }
  }
  return { conflicts };
}

/** Mark a property's identity SOLD → future listings of the same identity are blocked. */
export async function markSold(source: PropertySource, propertyId: string, orgId: string): Promise<{ fingerprints: number }> {
  const fps = await computeFingerprints(source, propertyId);
  for (const fp of fps) {
    await db.query(
      `INSERT INTO property_registry (fingerprint, fingerprint_kind, organization_id, property_source, property_id, disposition, disposition_at)
       VALUES ($1,$2,$3,$4,$5,'sold',NOW())
       ON CONFLICT (fingerprint) DO UPDATE SET disposition='sold', disposition_at=NOW(), updated_at=NOW()`,
      [fp.fingerprint, fp.kind, orgId, source, propertyId]
    );
  }
  logger.info('Property identity marked sold', { source, propertyId, fingerprints: fps.length });
  return { fingerprints: fps.length };
}

/** The open conflict blocking a listing, if any (for status surfacing). */
export async function getListingConflict(source: PropertySource, propertyId: string): Promise<any | null> {
  const r = await db.query(
    `SELECT id, reason, fingerprint_kind, incumbent_org_id, created_at
       FROM property_listing_conflicts
      WHERE challenger_source = $1 AND challenger_property_id = $2 AND status = 'open'
      ORDER BY created_at DESC LIMIT 1`,
    [source, propertyId]
  );
  return r.rows[0] || null;
}

/**
 * Gate D read-filter fragment: hide any listing that is an OPEN conflict challenger.
 * propIdColumn must be table-qualified (conflicts table also has `id`).
 */
export function conflictGateSql(source: PropertySource, propIdColumn: string): string {
  const src = source === 'pm' ? 'pm' : 'crm';
  return `NOT EXISTS (
    SELECT 1 FROM property_listing_conflicts _c
    WHERE _c.challenger_source = '${src}' AND _c.challenger_property_id = ${propIdColumn} AND _c.status = 'open'
  )`;
}
