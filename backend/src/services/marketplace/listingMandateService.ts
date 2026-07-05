/**
 * Listing Mandate (right-to-list) — Marketplace Trust & Anti-Fraud, Phase 3 (Gate C).
 *
 * Before a property is served on the public marketplace it must carry a right-to-list:
 *  - OWNER MANDATE: the property owner e-signs an authorization (reuses the e-sign
 *    envelope + magic-link; the linked envelope's `completed` status is authoritative), OR
 *  - SELF-ATTESTED: an owner-operator asserts they own it (Gate D later requires a title doc).
 *
 * Platform-org listings are exempt (demo/seed). Enforced at the marketplace read layer
 * via rightToListSql(), alongside Gate A (org verified) and Gate B (principal KYC).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import db, { pool } from '../../database';
import { logger } from '../../utils/logger';
import { createEnvelopeService } from '../../../shared-services/e-sign/envelopeService';
import * as registry from './propertyRegistryService';

export type PropertySource = 'pm' | 'crm';

export class MandateError extends Error {
  constructor(msg: string, public status = 400) { super(msg); this.name = 'MandateError'; }
}

/**
 * SQL fragment for the marketplace read filter: a property is listable when its org is
 * the platform org OR it has a valid right-to-list (self-attested, or a completed
 * owner-mandate envelope), unexpired. Pass the source literal + the org-id / property-id
 * column expressions in the surrounding query.
 */
export function rightToListSql(source: PropertySource, orgIdColumn: string, propIdColumn: string): string {
  const src = source === 'pm' ? 'pm' : 'crm';
  return `(
    EXISTS (SELECT 1 FROM organizations _mo WHERE _mo.id = ${orgIdColumn} AND _mo.is_platform_org = TRUE)
    OR EXISTS (
      SELECT 1 FROM listing_mandates _lm
      LEFT JOIN esign_envelopes _me ON _me.id = _lm.envelope_id
      WHERE _lm.property_source = '${src}' AND _lm.property_id = ${propIdColumn}
        AND (_lm.expires_at IS NULL OR _lm.expires_at > NOW())
        AND (_lm.kind = 'self_attested' OR _me.status = 'completed')
    )
  )`;
}

/** Fetch the property + owner + org context for a mandate (validates org ownership). */
async function loadProperty(source: PropertySource, propertyId: string, orgId: string): Promise<any> {
  const table = source === 'pm' ? 'properties' : 'crm_properties';
  const r = await db.query(
    `SELECT p.id, p.organization_id, p.title,
            p.address_street, p.address_city, p.region,
            p.price, p.price_currency, p.transaction_type::text AS transaction_type,
            p.owner_name, p.owner_email, p.owner_phone,
            o.name AS org_name
       FROM ${table} p JOIN organizations o ON o.id = p.organization_id
      WHERE p.id = $1 AND p.organization_id = $2 LIMIT 1`,
    [propertyId, orgId]
  );
  if (!r.rows[0]) throw new MandateError('Property not found for this organization', 404);
  return r.rows[0];
}

/** Build a 1-page Listing Authorization Mandate PDF → base64 data URL. */
async function buildMandatePdf(opts: {
  orgName: string; propertyTitle: string; address: string;
  ownerName: string; txnType: string; priceCeiling?: number | null; currency?: string | null;
}): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const left = 55;
  let y = height - 70;

  const wrap = (text: string, size: number, f = font, maxWidth = width - left * 2) => {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth) {
        page.drawText(line, { x: left, y, size, font: f, color: rgb(0.15, 0.15, 0.15) });
        y -= size + 6; line = w;
      } else line = test;
    }
    if (line) { page.drawText(line, { x: left, y, size, font: f, color: rgb(0.15, 0.15, 0.15) }); y -= size + 6; }
  };

  page.drawText('PROPERTY LISTING AUTHORISATION', { x: left, y, size: 17, font: bold, color: rgb(0.12, 0.12, 0.35) });
  y -= 30;
  page.drawText('(Mandate to market and list a property)', { x: left, y, size: 10, font, color: rgb(0.45, 0.45, 0.45) });
  y -= 32;

  const priceLine = opts.priceCeiling
    ? ` at a price of up to ${opts.currency || 'GHS'} ${Number(opts.priceCeiling).toLocaleString()}`
    : '';
  wrap(`I, ${opts.ownerName}, being the lawful owner (or duly authorised representative of the owner) of the property described below, hereby authorise ${opts.orgName} to market, advertise and list the said property for ${opts.txnType}${priceLine} on the PropMetrik marketplace and associated channels.`, 11);
  y -= 8;
  wrap(`Property: ${opts.propertyTitle}`, 11, bold);
  wrap(`Address: ${opts.address}`, 11);
  y -= 8;
  wrap('I confirm that the information I have provided is true, that I have the right to grant this authorisation, and that this property is not the subject of a conflicting sale, mortgage or listing that would render this authorisation false. I understand this mandate may be revoked in writing.', 10, font);
  y -= 6;
  wrap('This document is executed electronically. Your electronic signature below has the same legal effect as a handwritten signature.', 9, font);

  // Signature + date lines near the bottom (the e-sign fields overlay these).
  page.drawText('Owner signature:', { x: left, y: 150, size: 11, font: bold });
  page.drawLine({ start: { x: left + 105, y: 148 }, end: { x: width - left, y: 148 }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Date:', { x: left, y: 110, size: 11, font: bold });
  page.drawLine({ start: { x: left + 105, y: 108 }, end: { x: left + 260, y: 108 }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText(`Name: ${opts.ownerName}`, { x: left, y: 78, size: 10, font });

  const bytes = await doc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Agent action: create + send an owner mandate (owner receives a magic-link to e-sign). */
export async function createOwnerMandate(
  orgId: string, userId: string, source: PropertySource, propertyId: string,
  input: { owner_name?: string; owner_email?: string; owner_phone?: string; txn_type?: string; price_ceiling?: number | null; expires_in_days?: number; land_title_number?: string | null; parcel_id?: string | null }
): Promise<any> {
  const prop = await loadProperty(source, propertyId, orgId);

  const ownerName = (input.owner_name || prop.owner_name || '').trim();
  const ownerEmail = (input.owner_email || prop.owner_email || '').trim();
  if (!ownerName || !ownerEmail) {
    throw new MandateError('Owner name and email are required to send a mandate for signature.');
  }
  const txnType = input.txn_type || prop.transaction_type || 'sale';
  const address = [prop.address_street, prop.address_city, prop.region].filter(Boolean).join(', ');
  const expiresInDays = input.expires_in_days && input.expires_in_days > 0 ? input.expires_in_days : 14;

  const pdfDataUrl = await buildMandatePdf({
    orgName: prop.org_name, propertyTitle: prop.title || 'Property', address, ownerName,
    txnType, priceCeiling: input.price_ceiling ?? prop.price, currency: prop.price_currency,
  });

  // Reuse the e-sign envelope system: owner is the sole external signer; autoSend emails the magic link.
  const svc = createEnvelopeService(pool);
  const envelope: any = await svc.createAndSendEnvelope(orgId, userId, {
    name: `Listing Mandate — ${prop.title || address}`,
    message: 'Please review and authorise the listing of your property.',
    documentPdfUrl: pdfDataUrl,
    contextType: 'property_management',
    contextEntityId: propertyId,
    contextEntityName: 'listing_mandate',
    signers: [{ name: ownerName, email: ownerEmail, role: 'signer', order: 1 }],
    fields: [
      { signerEmail: ownerEmail, type: 'signature', page: 1, x: 28, y: 82, width: 42, height: 7, required: true, label: 'Owner Signature' },
      { signerEmail: ownerEmail, type: 'date_signed', page: 1, x: 28, y: 87, width: 26, height: 4, required: true, label: 'Date' },
    ],
    expiresInDays,
    autoSend: true,
  });

  const expiresAt = new Date(Date.now() + expiresInDays * 86400_000);
  const ins = await db.query(
    `INSERT INTO listing_mandates
       (organization_id, property_source, property_id, kind, envelope_id,
        owner_name, owner_email, owner_phone, authorized_txn_type, price_ceiling, price_currency,
        status, expires_at, created_by)
     VALUES ($1,$2,$3,'owner_mandate',$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12) RETURNING *`,
    [orgId, source, propertyId, envelope.id, ownerName, ownerEmail, input.owner_phone || prop.owner_phone || null,
     txnType, input.price_ceiling ?? prop.price ?? null, prop.price_currency || null, expiresAt, userId]
  );
  // Gate D: register the property's identity + detect double-listing/double-sale conflicts.
  await registry.setIdentifiers(source, propertyId, { land_title_number: input.land_title_number, parcel_id: input.parcel_id });
  const { conflicts } = await registry.claimIdentity(orgId, source, propertyId);

  logger.info('Listing mandate sent', { propertyId, source, envelopeId: envelope.id, conflicts: conflicts.length });
  return { mandate: ins.rows[0], envelope_id: envelope.id, conflicts };
}

/** Owner-operator action: attest that the lister owns the property (Gate D later requires a title doc). */
export async function selfAttestOwnership(
  orgId: string, userId: string, source: PropertySource, propertyId: string,
  input?: { land_title_number?: string | null; parcel_id?: string | null }
): Promise<any> {
  const prop = await loadProperty(source, propertyId, orgId);
  const ins = await db.query(
    `INSERT INTO listing_mandates
       (organization_id, property_source, property_id, kind, status, owner_name, created_by)
     VALUES ($1,$2,$3,'self_attested','self_attested',$4,$5) RETURNING *`,
    [orgId, source, propertyId, prop.owner_name || null, userId]
  );
  // Gate D: register identity + detect conflicts.
  if (input) await registry.setIdentifiers(source, propertyId, { land_title_number: input.land_title_number, parcel_id: input.parcel_id });
  const { conflicts } = await registry.claimIdentity(orgId, source, propertyId);
  return { mandate: ins.rows[0], conflicts };
}

/** Latest mandate for a property, with status derived from the linked envelope. */
export async function getMandateStatus(orgId: string, source: PropertySource, propertyId: string): Promise<any> {
  const r = await db.query(
    `SELECT lm.*, e.status AS envelope_status, e.completed_at
       FROM listing_mandates lm
       LEFT JOIN esign_envelopes e ON e.id = lm.envelope_id
      WHERE lm.organization_id = $1 AND lm.property_source = $2 AND lm.property_id = $3
      ORDER BY lm.created_at DESC LIMIT 1`,
    [orgId, source, propertyId]
  );
  const m = r.rows[0];
  if (!m) return { status: 'none', mandate: null, has_right_to_list: false };

  const expired = m.expires_at && new Date(m.expires_at) < new Date();
  let status: string;
  if (m.kind === 'self_attested') status = 'self_attested';
  else if (m.envelope_status === 'completed') status = 'signed';
  else if (m.envelope_status === 'voided') status = 'voided';
  else if (expired) status = 'expired';
  else status = 'pending';

  const mandateOk = status === 'self_attested' || (status === 'signed' && !expired);

  // Gate D: an open identity conflict blocks the listing regardless of the mandate.
  const conflict = await registry.getListingConflict(source, propertyId);
  const hasRight = mandateOk && !conflict;
  return { status, has_right_to_list: hasRight, mandate: m, conflict: conflict || null };
}
