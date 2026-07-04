/**
 * TikTok Content Posting integration.
 *
 * Publishes a property listing to a connected TikTok account via the Content Posting API
 * (Direct Post). Listings are image-led, so we default to a TikTok **photo post** built from the
 * property's images; if the property has a video we post that instead. Tokens are sourced from the
 * shared connector (`integrationConnectorService.getValidOAuthToken(org,'tiktok')`, auto-refresh).
 *
 * Production notes baked in:
 *  - We ALWAYS query creator_info first and only use a privacy level the creator allows (TikTok
 *    requires this; unaudited apps are limited to SELF_ONLY).
 *  - PULL_FROM_URL requires the media host's domain to be verified in the TikTok app's URL
 *    properties. Property media is served from the public media host (S3/MinIO behind Cloudflare).
 *  - Every publish is recorded in `social_posts` (publish_id + status) for polling + a posted state.
 */

import sharp from 'sharp';
import { pool } from '../../database';
import { integrationConnectorService } from './integrationConnectorService';
import { getPresignedDownloadUrl, uploadFile, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';

/**
 * TikTok photo posts only accept JPEG/WebP — a PNG fails TikTok's file_format_check. Fetch each
 * source image, transcode to JPEG (and bound the dimensions), re-upload, and return presigned
 * https URLs TikTok can PULL_FROM_URL.
 */
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
      const key = `tiktok-media/${orgId}/${Date.now()}-${i}.jpg`;
      await uploadFile(bucket, key, jpeg, 'image/jpeg', { tiktok: 'true' });
      out.push(await getPresignedDownloadUrl(bucket, key, 3600));
    } catch (err: any) {
      logger.warn('[tiktok] image transcode failed', { i, message: err?.message });
    }
  }
  return out;
}

const TIKTOK_API = 'https://open.tiktokapis.com';

export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';

async function getToken(orgId: string): Promise<string> {
  const { accessToken } = await integrationConnectorService.getValidOAuthToken(orgId, 'tiktok');
  return accessToken;
}

/** POST a JSON body to a TikTok endpoint and unwrap the {data, error} envelope. */
async function tiktokPost(token: string, path: string, body: unknown): Promise<any> {
  const res = await fetch(`${TIKTOK_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body ?? {}),
  });
  const json: any = await res.json().catch(() => ({}));
  const err = json?.error;
  if (!res.ok || (err && err.code && err.code !== 'ok')) {
    throw new Error(`TikTok ${path} failed: ${err?.code || res.status} — ${err?.message || 'unknown error'}`);
  }
  return json.data;
}

export interface CreatorInfo {
  creatorUsername: string;
  creatorNickname: string;
  privacyOptions: TikTokPrivacy[];
  commentDisabled: boolean;
  maxVideoDurationSec: number;
}

/** Required precheck before any post — returns the account + the privacy levels it permits. */
export async function queryCreatorInfo(orgId: string): Promise<CreatorInfo> {
  const token = await getToken(orgId);
  const d = await tiktokPost(token, '/v2/post/publish/creator_info/query/', {});
  return {
    creatorUsername: d.creator_username,
    creatorNickname: d.creator_nickname,
    privacyOptions: (d.privacy_level_options || []) as TikTokPrivacy[],
    commentDisabled: !!d.comment_disabled,
    maxVideoDurationSec: d.max_video_post_duration_sec || 0,
  };
}

/** Pick a safe privacy level: the requested one if the creator allows it, else the most private allowed. */
function resolvePrivacy(requested: TikTokPrivacy | undefined, allowed: TikTokPrivacy[]): TikTokPrivacy {
  if (requested && allowed.includes(requested)) return requested;
  // Prefer the most private option available (also the only one allowed for unaudited apps).
  const order: TikTokPrivacy[] = ['SELF_ONLY', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'PUBLIC_TO_EVERYONE'];
  for (const p of order) if (allowed.includes(p)) return p;
  if (allowed.length) return allowed[0];
  throw new Error('TikTok returned no allowed privacy levels for this account');
}

async function initPhotoPost(token: string, opts: { title: string; description: string; imageUrls: string[]; privacy: TikTokPrivacy; disableComment: boolean }): Promise<string> {
  const d = await tiktokPost(token, '/v2/post/publish/content/init/', {
    post_info: {
      title: opts.title.slice(0, 90),
      description: opts.description.slice(0, 4000),
      privacy_level: opts.privacy,
      disable_comment: opts.disableComment,
      auto_add_music: true,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_cover_index: 0,
      photo_images: opts.imageUrls.slice(0, 35), // TikTok allows up to 35 photos
    },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO',
  });
  return d.publish_id;
}

async function initVideoPost(token: string, opts: { title: string; videoUrl: string; privacy: TikTokPrivacy; disableComment: boolean }): Promise<string> {
  const d = await tiktokPost(token, '/v2/post/publish/video/init/', {
    post_info: {
      title: opts.title.slice(0, 2200),
      privacy_level: opts.privacy,
      disable_comment: opts.disableComment,
    },
    source_info: { source: 'PULL_FROM_URL', video_url: opts.videoUrl },
  });
  return d.publish_id;
}

/** Poll the publish status. Maps TikTok status → our social_posts status. */
export async function fetchPublishStatus(orgId: string, publishId: string): Promise<{ status: string; postUrl: string | null; failReason?: string }> {
  const token = await getToken(orgId);
  const d = await tiktokPost(token, '/v2/post/publish/status/fetch/', { publish_id: publishId });
  const raw = d.status as string;
  const ids: string[] = d.publicaly_available_post_id || [];
  const status = raw === 'PUBLISH_COMPLETE' ? 'published' : raw === 'FAILED' ? 'failed' : 'processing';
  const postUrl = ids.length ? `https://www.tiktok.com/@_/video/${ids[0]}` : null;
  // Best-effort: persist the latest status.
  await pool.query(
    `UPDATE social_posts SET status = $2, post_url = COALESCE($3, post_url), error = $4, updated_at = NOW()
     WHERE publish_id = $1`,
    [publishId, status, postUrl, d.fail_reason || null]
  ).catch(() => {});
  return { status, postUrl, failReason: d.fail_reason };
}

function buildCaption(p: any): string {
  const cur = 'GH₵';
  const bits: string[] = [];
  bits.push(p.title || 'Property listing');
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

export interface ShareResult { publishId: string; status: string; privacy: TikTokPrivacy; mediaCount: number; caption: string; socialPostId: string }

/**
 * Publish a property to the connected TikTok account. Loads the property + its approved images,
 * builds a caption, respects the creator's allowed privacy, posts, and records a social_posts row.
 */
export async function shareProperty(
  orgId: string,
  propertyId: string,
  opts: { caption?: string; privacy?: TikTokPrivacy; disableComment?: boolean; createdBy?: string } = {}
): Promise<ShareResult> {
  // Load the property (org-scoped) + its images.
  const propRes = await pool.query(
    `SELECT id, title, price, property_type, region, transaction_type, bedrooms, bathrooms, built_area_sqm
     FROM properties WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [propertyId, orgId]
  );
  if (!propRes.rows.length) throw new Error('Property not found for this organisation');
  const property = propRes.rows[0];

  const imageUrls: string[] = [];
  // 1. PM property photos are stored as documents (uploaded on the property page) with an
  //    `s3://bucket/key` reference — presign each into a public https URL TikTok can PULL_FROM_URL.
  const docRes = await pool.query(
    `SELECT file_url FROM property_management_documents
     WHERE property_id = $1 AND document_type = 'property_photos' AND file_url IS NOT NULL
     ORDER BY created_at ASC LIMIT 35`,
    [propertyId]
  );
  for (const d of docRes.rows) {
    const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(d.file_url);
    try {
      if (m) imageUrls.push(await getPresignedDownloadUrl(m[1], m[2], 3600));
      else if (/^https:\/\//i.test(d.file_url)) imageUrls.push(d.file_url);
    } catch { /* skip an object that can't be presigned */ }
  }
  // 2. Fallback: marketplace/scraped listings keep already-public images in property_images.
  if (!imageUrls.length) {
    const imgRes = await pool.query(
      `SELECT COALESCE(large_url, original_url, medium_url) AS url
       FROM property_images
       WHERE property_id = $1 AND is_approved = TRUE AND COALESCE(large_url, original_url, medium_url) IS NOT NULL
       ORDER BY is_primary DESC, sort_order ASC
       LIMIT 35`,
      [propertyId]
    );
    for (const r of imgRes.rows) if (/^https:\/\//i.test(r.url)) imageUrls.push(r.url);
  }
  if (!imageUrls.length) {
    throw new Error('This property has no photos to post. Upload photos on the property page first.');
  }

  // TikTok photo posts accept JPEG/WebP only — transcode to JPEG (PNG fails file_format_check).
  const jpegUrls = await toJpegUrls(orgId, imageUrls);
  if (!jpegUrls.length) throw new Error('Could not prepare the property photos for TikTok.');

  const info = await queryCreatorInfo(orgId);
  const privacy = resolvePrivacy(opts.privacy, info.privacyOptions);
  const caption = (opts.caption && opts.caption.trim()) || buildCaption(property);
  const disableComment = opts.disableComment ?? info.commentDisabled;

  const token = await getToken(orgId);
  const publishId = await initPhotoPost(token, {
    title: caption, description: caption, imageUrls: jpegUrls, privacy, disableComment,
  });

  const row = await pool.query(
    `INSERT INTO social_posts (organization_id, property_id, platform, publish_id, status, caption, media_count, created_by)
     VALUES ($1,$2,'tiktok',$3,'processing',$4,$5,$6) RETURNING id`,
    [orgId, propertyId, publishId, caption, jpegUrls.length, opts.createdBy || null]
  );

  logger.info('[tiktok] listing shared', { orgId, propertyId, publishId, privacy, images: jpegUrls.length });
  return { publishId, status: 'processing', privacy, mediaCount: jpegUrls.length, caption, socialPostId: row.rows[0].id };
}

/** Recent TikTok posts for an org (for the UI history / posted state). */
export async function listRecentPosts(orgId: string, propertyId?: string): Promise<any[]> {
  const params: any[] = [orgId];
  let where = `organization_id = $1 AND platform = 'tiktok'`;
  if (propertyId) { params.push(propertyId); where += ` AND property_id = $2`; }
  const r = await pool.query(
    `SELECT id, property_id, publish_id, status, post_url, caption, media_count, error, created_at
     FROM social_posts WHERE ${where} ORDER BY created_at DESC LIMIT 20`,
    params
  );
  return r.rows;
}
