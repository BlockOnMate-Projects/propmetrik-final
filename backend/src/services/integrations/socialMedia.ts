/**
 * Shared helpers for publishing a property listing to social platforms (TikTok, Facebook,
 * Instagram). Sources the property's photos, presigns them to public https URLs, transcodes to
 * JPEG (the format all three accept), and builds a caption. Kept provider-agnostic so every
 * social adapter uses the identical, proven media pipeline.
 */

import sharp from 'sharp';
import { pool } from '../../database';
import { getPresignedDownloadUrl, uploadFile, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';

/** Load a property (org-scoped) with the fields used to build a caption. */
export async function loadPropertyForShare(orgId: string, propertyId: string): Promise<any> {
  const r = await pool.query(
    `SELECT id, title, price, property_type, region, transaction_type, bedrooms, bathrooms, built_area_sqm
     FROM properties WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [propertyId, orgId]
  );
  if (!r.rows.length) throw new Error('Property not found for this organisation');
  return r.rows[0];
}

export function buildPropertyCaption(p: any): string {
  const cur = 'GH₵';
  const bits: string[] = [p.title || 'Property listing'];
  const facts: string[] = [];
  if (p.transaction_type) facts.push(p.transaction_type === 'rent' || p.transaction_type === 'lease' ? 'For Rent' : 'For Sale');
  if (p.bedrooms) facts.push(`${p.bedrooms} bed`);
  if (p.bathrooms) facts.push(`${p.bathrooms} bath`);
  if (p.built_area_sqm) facts.push(`${Math.round(Number(p.built_area_sqm))} sqm`);
  if (facts.length) bits.push(facts.join(' · '));
  if (p.price) bits.push(`${cur}${Number(p.price).toLocaleString()}`);
  if (p.region) bits.push(String(p.region).replace(/_/g, ' '));
  return bits.filter(Boolean).join('\n');
}

/** Public https source URLs for a property's photos: PM documents (presigned) → property_images. */
async function sourcePhotoUrls(propertyId: string): Promise<string[]> {
  const urls: string[] = [];
  const docRes = await pool.query(
    `SELECT file_url FROM property_management_documents
     WHERE property_id = $1 AND document_type = 'property_photos' AND file_url IS NOT NULL
     ORDER BY created_at ASC LIMIT 35`,
    [propertyId]
  );
  for (const d of docRes.rows) {
    const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(d.file_url);
    try {
      if (m) urls.push(await getPresignedDownloadUrl(m[1], m[2], 3600));
      else if (/^https:\/\//i.test(d.file_url)) urls.push(d.file_url);
    } catch { /* skip unpresignable object */ }
  }
  if (!urls.length) {
    const imgRes = await pool.query(
      `SELECT COALESCE(large_url, original_url, medium_url) AS url
       FROM property_images
       WHERE property_id = $1 AND is_approved = TRUE AND COALESCE(large_url, original_url, medium_url) IS NOT NULL
       ORDER BY is_primary DESC, sort_order ASC LIMIT 35`,
      [propertyId]
    );
    for (const r of imgRes.rows) if (/^https:\/\//i.test(r.url)) urls.push(r.url);
  }
  return urls;
}

/** Fetch each source image, transcode to bounded JPEG, re-upload, and presign — the format every platform accepts. */
async function toJpegUrls(orgId: string, sourceUrls: string[]): Promise<string[]> {
  const bucket = buckets.documents || 'propmetrik-documents';
  const out: string[] = [];
  for (let i = 0; i < sourceUrls.length; i++) {
    try {
      const resp = await fetch(sourceUrls[i]);
      if (!resp.ok) continue;
      const jpeg = await sharp(Buffer.from(await resp.arrayBuffer()))
        .rotate()
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      const key = `social-media/${orgId}/${Date.now()}-${i}.jpg`;
      await uploadFile(bucket, key, jpeg, 'image/jpeg', { social: 'true' });
      out.push(await getPresignedDownloadUrl(bucket, key, 3600));
    } catch (err: any) {
      logger.warn('[socialMedia] image transcode failed', { i, message: err?.message });
    }
  }
  return out;
}

/** Public https JPEG URLs for a property's photos, ready to hand to a social API. Throws if none. */
export async function getPropertyJpegUrls(orgId: string, propertyId: string): Promise<string[]> {
  const src = await sourcePhotoUrls(propertyId);
  if (!src.length) throw new Error('This property has no photos to post. Upload photos on the property page first.');
  const jpeg = await toJpegUrls(orgId, src);
  if (!jpeg.length) throw new Error('Could not prepare the property photos for posting.');
  return jpeg;
}

/** Record a social post for polling / posted-state UI. Returns the row id. */
export async function recordSocialPost(row: {
  orgId: string; propertyId: string; platform: string; publishId?: string | null; status: string;
  postUrl?: string | null; caption: string; mediaCount: number; error?: string | null; createdBy?: string | null;
}): Promise<string> {
  const r = await pool.query(
    `INSERT INTO social_posts (organization_id, property_id, platform, publish_id, status, post_url, caption, media_count, error, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [row.orgId, row.propertyId, row.platform, row.publishId || null, row.status, row.postUrl || null,
     row.caption, row.mediaCount, row.error || null, row.createdBy || null]
  );
  return r.rows[0].id;
}

/**
 * Recent posts published to a platform for this org (optionally scoped to one property).
 * Provider-agnostic — every share adapter records into `social_posts`, so this backs the
 * post-history feed for TikTok, Facebook and Instagram alike. Joins the property title so the
 * central Social hub (no property in context) can label each row.
 */
export async function listRecentPosts(orgId: string, platform: string, propertyId?: string): Promise<any[]> {
  const params: any[] = [orgId, platform];
  let where = `sp.organization_id = $1 AND sp.platform = $2`;
  if (propertyId) { params.push(propertyId); where += ` AND sp.property_id = $3`; }
  const r = await pool.query(
    `SELECT sp.id, sp.property_id, sp.publish_id, sp.status, sp.post_url, sp.caption,
            sp.media_count, sp.error, sp.created_at, p.title AS property_title
       FROM social_posts sp
       LEFT JOIN properties p ON p.id = sp.property_id
      WHERE ${where}
      ORDER BY sp.created_at DESC LIMIT 20`,
    params
  );
  return r.rows;
}
