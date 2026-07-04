/**
 * Meta (Facebook Pages + Instagram) posting adapter.
 *
 * Publishes a property listing as a photo post to the org's connected Facebook Page, or as a
 * single/carousel post to the linked Instagram Business account. Tokens come from the shared
 * connector's storage (a long-lived user token, exchanged at callback); we resolve the Page
 * access token via /me/accounts and (for IG) the linked instagram_business_account.
 *
 * Media reuses the shared pipeline (presigned public https + JPEG) that TikTok already uses.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { getPropertyJpegUrls, loadPropertyForShare, buildPropertyCaption, recordSocialPost } from './socialMedia';

const GRAPH = 'https://graph.facebook.com/v21.0';
export type MetaPlatform = 'facebook' | 'instagram';

async function getUserToken(orgId: string, provider: MetaPlatform): Promise<string> {
  const r = await pool.query(
    `SELECT oauth_access_token FROM integrations
     WHERE organization_id = $1 AND integration_type = $2 AND status != 'inactive'
     ORDER BY created_at DESC LIMIT 1`,
    [orgId, provider]
  );
  const t = r.rows[0]?.oauth_access_token;
  if (!t) throw new Error(`${provider} is not connected`);
  return t;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function graphGet(path: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const res = await fetch(`${GRAPH}${path}?${qs}`);
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Meta GET ${path} failed: ${j.error?.message || res.status}`);
  return j;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function graphPost(path: string, token: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ ...params, access_token: token }).toString();
  const res = await fetch(`${GRAPH}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Meta POST ${path} failed: ${j.error?.message || res.status}`);
  return j;
}

/** Resolve the target Page + its page access token (config.pageId pins a specific one, else the first). */
async function getPage(orgId: string, provider: MetaPlatform): Promise<{ pageId: string; pageToken: string; pageName: string }> {
  const userToken = await getUserToken(orgId, provider);
  const data = await graphGet('/me/accounts', userToken, { fields: 'id,name,access_token' });
  const pages: any[] = data.data || [];
  if (!pages.length) throw new Error('No Facebook Page found — you must be an admin of a Page.');
  const cfgRes = await pool.query(
    `SELECT config FROM integrations WHERE organization_id = $1 AND integration_type = $2 ORDER BY created_at DESC LIMIT 1`,
    [orgId, provider]
  );
  const cfg = cfgRes.rows[0]?.config
    ? (typeof cfgRes.rows[0].config === 'string' ? JSON.parse(cfgRes.rows[0].config) : cfgRes.rows[0].config)
    : {};
  const page = (cfg.pageId && pages.find(p => p.id === cfg.pageId)) || pages[0];
  return { pageId: page.id, pageToken: page.access_token, pageName: page.name };
}

/** Live connection test — returns the Page (or linked IG account) name. */
export async function testConnection(orgId: string, provider: MetaPlatform): Promise<{ ok: boolean; detail: string }> {
  const page = await getPage(orgId, provider);
  if (provider === 'instagram') {
    const ig = await graphGet(`/${page.pageId}`, page.pageToken, { fields: 'instagram_business_account{username}' });
    const username = ig.instagram_business_account?.username;
    if (!username) throw new Error('No Instagram Business account is linked to your Facebook Page.');
    return { ok: true, detail: `Connected to @${username}` };
  }
  return { ok: true, detail: `Connected to Page: ${page.pageName}` };
}

async function postToFacebook(orgId: string, jpegUrls: string[], caption: string): Promise<{ id: string; postUrl: string | null }> {
  const page = await getPage(orgId, 'facebook');
  if (jpegUrls.length === 1) {
    const r = await graphPost(`/${page.pageId}/photos`, page.pageToken, { url: jpegUrls[0], caption });
    const id = r.post_id || r.id;
    return { id, postUrl: r.post_id ? `https://www.facebook.com/${r.post_id}` : null };
  }
  // Multiple photos: upload each unpublished, then attach to a single feed post.
  const attached: Array<{ media_fbid: string }> = [];
  for (const url of jpegUrls.slice(0, 10)) {
    const up = await graphPost(`/${page.pageId}/photos`, page.pageToken, { url, published: 'false' });
    attached.push({ media_fbid: up.id });
  }
  const feed = await graphPost(`/${page.pageId}/feed`, page.pageToken, { message: caption, attached_media: JSON.stringify(attached) });
  return { id: feed.id, postUrl: `https://www.facebook.com/${feed.id}` };
}

async function postToInstagram(orgId: string, jpegUrls: string[], caption: string): Promise<{ id: string; postUrl: string | null }> {
  const page = await getPage(orgId, 'instagram');
  const igRes = await graphGet(`/${page.pageId}`, page.pageToken, { fields: 'instagram_business_account' });
  const igId = igRes.instagram_business_account?.id;
  if (!igId) throw new Error('No Instagram Business account linked to your Facebook Page.');

  let creationId: string;
  if (jpegUrls.length === 1) {
    const c = await graphPost(`/${igId}/media`, page.pageToken, { image_url: jpegUrls[0], caption });
    creationId = c.id;
  } else {
    const children: string[] = [];
    for (const url of jpegUrls.slice(0, 10)) {
      const item = await graphPost(`/${igId}/media`, page.pageToken, { image_url: url, is_carousel_item: 'true' });
      children.push(item.id);
    }
    const carousel = await graphPost(`/${igId}/media`, page.pageToken, { media_type: 'CAROUSEL', caption, children: children.join(',') });
    creationId = carousel.id;
  }
  const pub = await graphPost(`/${igId}/media_publish`, page.pageToken, { creation_id: creationId });
  // Best-effort permalink.
  let postUrl: string | null = null;
  try { const perma = await graphGet(`/${pub.id}`, page.pageToken, { fields: 'permalink' }); postUrl = perma.permalink || null; } catch { /* optional */ }
  return { id: pub.id, postUrl };
}

export interface MetaShareResult { publishId: string; status: string; postUrl: string | null; mediaCount: number; caption: string; socialPostId: string }

/** Publish a property listing to the connected Facebook Page or Instagram account. */
export async function shareProperty(
  orgId: string,
  platform: MetaPlatform,
  propertyId: string,
  opts: { caption?: string; createdBy?: string } = {}
): Promise<MetaShareResult> {
  const property = await loadPropertyForShare(orgId, propertyId);
  const jpegUrls = await getPropertyJpegUrls(orgId, propertyId);
  const caption = (opts.caption && opts.caption.trim()) || buildPropertyCaption(property);

  const res = platform === 'facebook'
    ? await postToFacebook(orgId, jpegUrls, caption)
    : await postToInstagram(orgId, jpegUrls, caption);

  const socialPostId = await recordSocialPost({
    orgId, propertyId, platform, publishId: res.id, status: 'published',
    postUrl: res.postUrl, caption, mediaCount: jpegUrls.length, createdBy: opts.createdBy,
  });
  logger.info('[meta] listing shared', { orgId, platform, propertyId, id: res.id });
  return { publishId: res.id, status: 'published', postUrl: res.postUrl, mediaCount: jpegUrls.length, caption, socialPostId };
}
