/**
 * Publications Service — CRUD + business logic for the publications CMS
 */
import { pool } from '../../database';
import { logger } from '../../utils/logger';

// ============================================================
// TYPES
// ============================================================

export interface Publication {
  id: string;
  organization_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  type: string;                    // @deprecated — use product + edition
  product: string;                 // 'outlook' | 'snapshot' | 'policy_paper' | 'press_release' | 'podcast'
  edition: string;                 // 'monthly' | 'quarterly' | 'annual' | 'weekly' | 'adhoc'
  status: string;
  content_json: ContentBlock[];
  content_html: string | null;
  excerpt: string | null;
  key_findings: string[];
  cover_image_url: string | null;
  pdf_url: string | null;
  sectors: string[];
  topics: string[];
  regions: string[];
  author_id: string | null;
  author_name: string | null;
  author_title: string | null;
  reviewer_id: string | null;
  reading_time_minutes: number;
  word_count: number;
  ai_generated: boolean;
  ai_model: string | null;
  ai_prompt_template: string | null;
  ai_confidence_score: number | null;
  human_edit_percentage: number | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  canonical_url: string | null;
  access_tier: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  scheduled_publish_at: string | null;
}

export interface ContentBlock {
  id: string;
  type: 'text' | 'heading' | 'chart' | 'callout' | 'quote' | 'table' | 'image';
  content: string;
  metadata?: Record<string, unknown>;
  aiGenerated?: boolean;
}

export interface PublicationChart {
  id: string;
  publication_id: string;
  position: number;
  endpoint: string;
  params: Record<string, unknown>;
  chart_type: string;
  component_name: string | null;
  title: string | null;
  ai_insight: string | null;
  snapshot_data: Record<string, unknown> | null;
  snapshot_at: string | null;
  snapshot_png_url: string | null;
  live_enabled: boolean;
  created_at: string;
}

export interface IndexValue {
  id: string;
  index_type: string;
  region: string;
  period_start: string;
  period_end: string;
  value: number;
  change_mom: number | null;
  change_yoy: number | null;
  ai_commentary: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PublicationFilters {
  type?: string;                   // @deprecated — use product + edition
  product?: string;
  edition?: string;
  status?: string;
  sector?: string;
  topic?: string;
  region?: string;
  access_tier?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreatePublicationInput {
  title: string;
  subtitle?: string;
  type: string;                    // @deprecated — use product + edition
  product?: string;
  edition?: string;
  sectors?: string[];
  topics?: string[];
  regions?: string[];
  content_json?: ContentBlock[];
  content_html?: string;
  excerpt?: string;
  key_findings?: string[];
  cover_image_url?: string;
  access_tier?: string;
  author_name?: string;
  author_title?: string;
  ai_generated?: boolean;
  ai_model?: string;
}

// ============================================================
// HELPER: Slug generation
// ============================================================

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 200)
    + '-' + Date.now().toString(36);
}

function calculateReadingTime(content: string): number {
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ============================================================
// PUBLICATIONS CRUD
// ============================================================

/**
 * List publications with filters and pagination
 */
export async function listPublications(filters: PublicationFilters = {}): Promise<{ data: Publication[]; total: number; page: number; limit: number }> {
  const { type, product, edition, status, sector, topic, region, access_tier, search, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // New product/edition filters (preferred)
  if (product) {
    conditions.push(`product = $${paramIdx++}`);
    params.push(product);
  }
  if (edition) {
    conditions.push(`edition = $${paramIdx++}`);
    params.push(edition);
  }
  // Legacy type filter — also applies when used alongside product for sub-type filtering
  if (type) {
    conditions.push(`type = $${paramIdx++}`);
    params.push(type);
  }
  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (sector) {
    conditions.push(`$${paramIdx++} = ANY(sectors)`);
    params.push(sector);
  }
  if (topic) {
    conditions.push(`$${paramIdx++} = ANY(topics)`);
    params.push(topic);
  }
  if (region) {
    conditions.push(`$${paramIdx++} = ANY(regions)`);
    params.push(region);
  }
  if (access_tier) {
    conditions.push(`access_tier = $${paramIdx++}`);
    params.push(access_tier);
  }
  if (search) {
    conditions.push(`(title ILIKE $${paramIdx} OR excerpt ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM publications ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT * FROM publications ${where}
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  return { data: result.rows, total, page, limit };
}

/**
 * Get published publications (public-facing)
 */
export async function listPublishedPublications(filters: PublicationFilters = {}): Promise<{ data: Publication[]; total: number; page: number; limit: number }> {
  return listPublications({ ...filters, status: 'published' });
}

/**
 * Get a single publication by slug
 */
export async function getBySlug(slug: string): Promise<Publication | null> {
  const result = await pool.query(
    `SELECT * FROM publications WHERE slug = $1`,
    [slug]
  );
  return result.rows[0] || null;
}

/**
 * Get a single publication by ID
 */
export async function getById(id: string): Promise<Publication | null> {
  const result = await pool.query(
    `SELECT * FROM publications WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create a new publication
 */
export async function createPublication(input: CreatePublicationInput, authorId?: string): Promise<Publication> {
  const slug = generateSlug(input.title);
  const contentText = input.content_html || JSON.stringify(input.content_json || []);
  const wordCount = contentText.split(/\s+/).length;
  const readingTime = calculateReadingTime(contentText);

  // Validate UUID format for author_id (must be full UUID or null)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validAuthorId = authorId && uuidRegex.test(authorId) ? authorId : null;

  const result = await pool.query(
    `INSERT INTO publications (
      slug, title, subtitle, type, product, edition, status,
      content_json, content_html, excerpt, key_findings,
      cover_image_url, sectors, topics, regions,
      author_id, author_name, author_title,
      reading_time_minutes, word_count,
      ai_generated, ai_model, access_tier
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, $18,
      $19, $20,
      $21, $22, $23
    ) RETURNING *`,
    [
      slug, input.title, input.subtitle || null, input.type,
      input.product || input.type, input.edition || 'adhoc',
      input.ai_generated ? 'ai_draft' : 'draft',
      JSON.stringify(input.content_json || []),
      input.content_html || null,
      input.excerpt || null,
      JSON.stringify(input.key_findings || []),
      input.cover_image_url || null,
      input.sectors || [],
      input.topics || [],
      input.regions || [],
      validAuthorId,
      input.author_name || null,
      input.author_title || null,
      readingTime, wordCount,
      input.ai_generated || false,
      input.ai_model || null,
      input.access_tier || 'public',
    ]
  );

  logger.info({ id: result.rows[0].id, slug, type: input.type }, 'Publication created');
  return result.rows[0];
}

/**
 * Update a publication
 */
export async function updatePublication(id: string, updates: Partial<CreatePublicationInput & { status?: string; seo_title?: string; seo_description?: string }>): Promise<Publication | null> {
  const existing = await getById(id);
  if (!existing) return null;

  // Build dynamic update
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, unknown> = {
    title: updates.title,
    subtitle: updates.subtitle,
    type: updates.type,
    product: (updates as any).product,
    edition: (updates as any).edition,
    status: updates.status,
    content_json: updates.content_json ? JSON.stringify(updates.content_json) : undefined,
    content_html: updates.content_html,
    excerpt: updates.excerpt,
    key_findings: updates.key_findings ? JSON.stringify(updates.key_findings) : undefined,
    cover_image_url: updates.cover_image_url,
    sectors: updates.sectors,
    topics: updates.topics,
    regions: updates.regions,
    access_tier: updates.access_tier,
    author_name: updates.author_name,
    author_title: updates.author_title,
    ai_generated: updates.ai_generated,
    ai_model: updates.ai_model,
    seo_title: updates.seo_title,
    seo_description: updates.seo_description,
  };

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) return existing;

  // Recalculate word count and reading time if content changed
  if (updates.content_html || updates.content_json) {
    const contentText = updates.content_html || JSON.stringify(updates.content_json || []);
    fields.push(`word_count = $${idx++}`);
    values.push(contentText.split(/\s+/).length);
    fields.push(`reading_time_minutes = $${idx++}`);
    values.push(calculateReadingTime(contentText));
  }

  fields.push(`updated_at = NOW()`);

  const result = await pool.query(
    `UPDATE publications SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    [...values, id]
  );

  logger.info({ id }, 'Publication updated');
  return result.rows[0];
}

/**
 * Publish a publication
 */
export async function publishPublication(id: string): Promise<Publication | null> {
  const result = await pool.query(
    `UPDATE publications
     SET status = 'published', published_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rows[0]) {
    logger.info({ id, slug: result.rows[0].slug }, 'Publication published');
  }
  return result.rows[0] || null;
}

/**
 * Archive a publication
 */
export async function archivePublication(id: string): Promise<Publication | null> {
  const result = await pool.query(
    `UPDATE publications
     SET status = 'archived', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Delete a publication (hard delete — use archive for soft delete)
 */
export async function deletePublication(id: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM publications WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// PUBLICATION CHARTS
// ============================================================

/**
 * Add a chart to a publication
 */
export async function addChart(publicationId: string, chart: {
  endpoint: string;
  params?: Record<string, unknown>;
  chart_type?: string;
  component_name?: string;
  title?: string;
  ai_insight?: string;
  snapshot_data?: Record<string, unknown>;
  live_enabled?: boolean;
}): Promise<PublicationChart> {
  // Get next position
  const posResult = await pool.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM publication_charts WHERE publication_id = $1`,
    [publicationId]
  );

  const result = await pool.query(
    `INSERT INTO publication_charts (
      publication_id, position, endpoint, params, chart_type,
      component_name, title, ai_insight, snapshot_data,
      snapshot_at, live_enabled
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      publicationId,
      posResult.rows[0].next_pos,
      chart.endpoint,
      JSON.stringify(chart.params || {}),
      chart.chart_type || 'line',
      chart.component_name || null,
      chart.title || null,
      chart.ai_insight || null,
      chart.snapshot_data ? JSON.stringify(chart.snapshot_data) : null,
      chart.snapshot_data ? new Date().toISOString() : null,
      chart.live_enabled || false,
    ]
  );

  return result.rows[0];
}

/**
 * Get charts for a publication
 */
export async function getCharts(publicationId: string): Promise<PublicationChart[]> {
  const result = await pool.query(
    `SELECT * FROM publication_charts WHERE publication_id = $1 ORDER BY position`,
    [publicationId]
  );
  return result.rows;
}

/**
 * Remove a chart from a publication
 */
export async function removeChart(chartId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM publication_charts WHERE id = $1`,
    [chartId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// INDEX VALUES
// ============================================================

/**
 * List all latest index values
 */
export async function listLatestIndices(): Promise<IndexValue[]> {
  const result = await pool.query(
    `SELECT DISTINCT ON (index_type, region) *
     FROM index_values
     WHERE published_at IS NOT NULL
     ORDER BY index_type, region, period_end DESC`
  );
  return result.rows;
}

/**
 * Get index history
 */
export async function getIndexHistory(indexType: string, region?: string, limit = 24): Promise<IndexValue[]> {
  const conditions = ['index_type = $1'];
  const params: unknown[] = [indexType];
  let idx = 2;

  if (region) {
    conditions.push(`region = $${idx++}`);
    params.push(region);
  }

  const result = await pool.query(
    `SELECT * FROM index_values
     WHERE ${conditions.join(' AND ')}
     ORDER BY period_end DESC
     LIMIT $${idx}`,
    [...params, limit]
  );
  return result.rows;
}

/**
 * Get latest index value
 */
export async function getLatestIndex(indexType: string, region = 'national'): Promise<IndexValue | null> {
  const result = await pool.query(
    `SELECT * FROM index_values
     WHERE index_type = $1 AND region = $2
     ORDER BY period_end DESC
     LIMIT 1`,
    [indexType, region]
  );
  return result.rows[0] || null;
}

/**
 * Publish a new index value
 */
export async function publishIndexValue(input: {
  index_type: string;
  region?: string;
  period_start: string;
  period_end: string;
  value: number;
  change_mom?: number;
  change_yoy?: number;
  ai_commentary?: string;
  metadata?: Record<string, unknown>;
}): Promise<IndexValue> {
  const result = await pool.query(
    `INSERT INTO index_values (
      index_type, region, period_start, period_end,
      value, change_mom, change_yoy, ai_commentary,
      published_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
    ON CONFLICT (index_type, region, period_end) DO UPDATE SET
      value = EXCLUDED.value,
      change_mom = EXCLUDED.change_mom,
      change_yoy = EXCLUDED.change_yoy,
      ai_commentary = EXCLUDED.ai_commentary,
      published_at = NOW(),
      metadata = EXCLUDED.metadata
    RETURNING *`,
    [
      input.index_type,
      input.region || 'national',
      input.period_start,
      input.period_end,
      input.value,
      input.change_mom || null,
      input.change_yoy || null,
      input.ai_commentary || null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  logger.info({ indexType: input.index_type, region: input.region, value: input.value }, 'Index value published');
  return result.rows[0];
}

// ============================================================
// NEWSLETTER SUBSCRIBERS
// ============================================================

export async function subscribeNewsletter(input: {
  email: string;
  name?: string;
  organization?: string;
  role?: string;
  segments?: string[];
}): Promise<{ id: string; email: string }> {
  const result = await pool.query(
    `INSERT INTO newsletter_subscribers (email, name, organization, role, segments, confirmed)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, newsletter_subscribers.name),
       organization = COALESCE(EXCLUDED.organization, newsletter_subscribers.organization),
       unsubscribed_at = NULL
     RETURNING id, email`,
    [input.email, input.name || null, input.organization || null, input.role || null, JSON.stringify(input.segments || [])]
  );
  return result.rows[0];
}

export async function listSubscribers(page = 1, limit = 50): Promise<{ data: unknown[]; total: number }> {
  const offset = (page - 1) * limit;
  const countResult = await pool.query(`SELECT COUNT(*) FROM newsletter_subscribers WHERE unsubscribed_at IS NULL`);
  const result = await pool.query(
    `SELECT * FROM newsletter_subscribers WHERE unsubscribed_at IS NULL ORDER BY subscribed_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { data: result.rows, total: parseInt(countResult.rows[0].count, 10) };
}

// ============================================================
// PUBLICATION VIEWS (Analytics)
// ============================================================

export async function recordView(publicationId: string, userId?: string, sessionId?: string, source = 'direct'): Promise<void> {
  await pool.query(
    `INSERT INTO publication_views (publication_id, user_id, session_id, source)
     VALUES ($1, $2, $3, $4)`,
    [publicationId, userId || null, sessionId || null, source]
  );
}

export async function getPublicationStats(publicationId: string): Promise<{ views: number; unique_views: number; pdf_downloads: number; avg_time: number }> {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS views,
       COUNT(DISTINCT COALESCE(user_id::text, session_id)) AS unique_views,
       COUNT(*) FILTER (WHERE pdf_downloaded) AS pdf_downloads,
       COALESCE(AVG(time_on_page_seconds), 0) AS avg_time
     FROM publication_views
     WHERE publication_id = $1`,
    [publicationId]
  );
  return result.rows[0];
}

/**
 * Get aggregate CMS analytics
 */
export async function getCmsAnalytics(): Promise<{
  total_publications: number;
  published: number;
  drafts: number;
  total_views: number;
  total_subscribers: number;
  publications_by_type: Record<string, number>[];
}> {
  const [pubCount, viewCount, subCount, byType] = await Promise.all([
    pool.query(`SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'published') AS published,
      COUNT(*) FILTER (WHERE status IN ('draft', 'ai_draft')) AS drafts
    FROM publications`),
    pool.query(`SELECT COUNT(*) FROM publication_views`),
    pool.query(`SELECT COUNT(*) FROM newsletter_subscribers WHERE unsubscribed_at IS NULL`),
    pool.query(`SELECT product, edition, COUNT(*) AS count FROM publications GROUP BY product, edition ORDER BY count DESC`),
  ]);

  return {
    total_publications: parseInt(pubCount.rows[0].total, 10),
    published: parseInt(pubCount.rows[0].published, 10),
    drafts: parseInt(pubCount.rows[0].drafts, 10),
    total_views: parseInt(viewCount.rows[0].count, 10),
    total_subscribers: parseInt(subCount.rows[0].count, 10),
    publications_by_type: byType.rows,
  };
}
