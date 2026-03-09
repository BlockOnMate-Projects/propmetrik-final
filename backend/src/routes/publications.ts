/**
 * Publications Routes
 * CRUD + publish workflow + public read endpoints
 * AI-assisted content creation via Gemini 2.5 Flash
 */
import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import * as publicationsService from '../../shared-services/publications/publicationsService';
import * as geminiService from '../../shared-services/publications/geminiService';
import { generatePublicationPdf } from '../../shared-services/publications/pdfGenerationService';
import { getPresignedDownloadUrl, buckets } from '../database/minio';

const router = Router();

// Helper to extract user context from authenticated request
const getUserContext = (req: Request) => {
  const user = (req as any).user;
  const userId = user?.id || user?.sub || (req.headers['x-user-id'] as string);
  const organizationId = user?.organizationId || user?.organization_id || (req.headers['x-organization-id'] as string);
  if (!organizationId) throw new Error('Organization ID required');
  return { userId: userId || 'unknown', organizationId };
};

// ============================================================
// TAXONOMY REFERENCE DATA
// ============================================================

const TAXONOMY = {
  products: [
    {
      value: 'outlook',
      label: 'Ghana Real Estate Outlook',
      description: 'Comprehensive real estate report',
      editions: ['monthly', 'quarterly', 'annual'],
      autopilot: true,
      website_path: '/insights/outlook',
    },
    {
      value: 'snapshot',
      label: 'Ghana Property Snapshot',
      description: 'Weekly market brief (400-600 words)',
      editions: ['weekly', 'adhoc'],
      autopilot: true,
      website_path: '/insights/snapshot',
    },
    {
      value: 'policy_paper',
      label: 'Policy Paper',
      description: 'Government-focused analysis (8-15 pages)',
      editions: ['adhoc'],
      autopilot: false,
      website_path: '/insights/policy-papers',
    },
    {
      value: 'press_release',
      label: 'Press Release',
      description: 'Official announcement',
      editions: ['adhoc'],
      autopilot: false,
      website_path: '/press/releases',
    },
    {
      value: 'podcast',
      label: 'PROPMETRIK Perspectives Podcast',
      description: 'Weekly audio',
      editions: ['weekly'],
      autopilot: false,
      website_path: '/insights/podcast',
    },
  ],
  editions: [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'adhoc', label: 'Ad-hoc' },
  ],
  /** @deprecated — kept for backward compatibility */
  categories: [
    { value: 'insights', label: 'Insights', description: 'Research & thought leadership content', path: '/insights' },
    { value: 'press', label: 'Press', description: 'Corporate communications & media', path: '/press' },
  ],
  /** @deprecated — use products instead */
  types: [
    { value: 'outlook', label: 'Ghana Real Estate Outlook', description: 'Comprehensive real estate report', category: 'insights', website_path: '/insights/outlook' },
    { value: 'snapshot', label: 'Ghana Property Snapshot', description: 'Weekly market brief', category: 'insights', website_path: '/insights/snapshot' },
    { value: 'policy_paper', label: 'Policy Paper', description: '8-15 page government-focused', category: 'insights', website_path: '/insights/policy-papers' },
    { value: 'podcast', label: 'Podcast Episode', description: 'Audio + transcript', category: 'insights', website_path: '/insights/podcast' },
    { value: 'press_release', label: 'Press Release', description: 'Official announcement', category: 'press', website_path: '/press/releases' },
  ],
  sectors: [
    { value: 'residential_sales', label: 'Residential — Sales' },
    { value: 'residential_lettings', label: 'Residential — Lettings' },
    { value: 'office', label: 'Commercial — Office' },
    { value: 'retail', label: 'Commercial — Retail' },
    { value: 'industrial', label: 'Industrial & Logistics' },
    { value: 'hospitality', label: 'Hospitality' },
    { value: 'land', label: 'Land' },
    { value: 'infrastructure', label: 'Infrastructure & Mixed-Use' },
    { value: 'healthcare_education', label: 'Healthcare & Education' },
  ],
  topics: [
    { value: 'economics_policy', label: 'Economics & Policy' },
    { value: 'investment', label: 'Investment & Capital Markets' },
    { value: 'affordability', label: 'Affordability & Housing' },
    { value: 'construction', label: 'Construction & Development' },
    { value: 'sustainability', label: 'Sustainability & ESG' },
    { value: 'proptech', label: 'Technology & PropTech' },
    { value: 'urbanization', label: 'Urbanization & Cities' },
    { value: 'diaspora', label: 'Diaspora & Cross-Border' },
    { value: 'risk', label: 'Risk & Resilience' },
    { value: 'wealth_luxury', label: 'Wealth & Luxury' },
  ],
  regions: [
    { value: 'greater_accra', label: 'Greater Accra' },
    { value: 'ashanti', label: 'Ashanti' },
    { value: 'western', label: 'Western' },
    { value: 'central', label: 'Central' },
    { value: 'eastern', label: 'Eastern' },
    { value: 'northern', label: 'Northern Zones' },
    { value: 'national', label: 'National' },
    { value: 'west_africa', label: 'West Africa' },
  ],
  access_tiers: [
    { value: 'public', label: 'Public' },
    { value: 'registered', label: 'Registered' },
    { value: 'professional', label: 'Professional' },
    { value: 'enterprise', label: 'Enterprise' },
  ],
  statuses: [
    { value: 'draft', label: 'Draft' },
    { value: 'ai_draft', label: 'AI Draft' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'published', label: 'Published' },
    { value: 'archived', label: 'Archived' },
  ],
};

// ============================================================
// PUBLIC ROUTES (no auth required)
// ============================================================

/**
 * GET /api/v1/publications/taxonomy
 * Returns all taxonomy reference data for filters/forms
 */
router.get('/taxonomy', (_req: Request, res: Response) => {
  res.json({ success: true, data: TAXONOMY });
});

/**
 * GET /api/v1/publications/public
 * Public listing of published publications
 */
router.get('/public', async (req: Request, res: Response) => {
  try {
    const filters: publicationsService.PublicationFilters = {
      type: req.query.type as string,
      product: req.query.product as string,
      edition: req.query.edition as string,
      sector: req.query.sector as string,
      topic: req.query.topic as string,
      region: req.query.region as string,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    };

    const result = await publicationsService.listPublishedPublications(filters);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Failed to list public publications', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch publications' });
  }
});

/**
 * GET /api/v1/publications/public/:slug
 * Get a single published publication by slug
 */
router.get('/public/:slug', async (req: Request, res: Response) => {
  try {
    const publication = await publicationsService.getBySlug(req.params.slug);
    if (!publication || publication.status !== 'published') {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }

    // Record view
    const sessionId = req.headers['x-session-id'] as string;
    const userId = req.headers['x-user-id'] as string;
    publicationsService.recordView(publication.id, userId, sessionId, req.query.source as string || 'direct').catch(() => {});

    // Get charts
    const charts = await publicationsService.getCharts(publication.id);

    res.json({ success: true, data: { ...publication, charts } });
  } catch (error) {
    logger.error('Failed to get publication', { error: (error as Error).message, slug: req.params.slug });
    res.status(500).json({ success: false, error: 'Failed to fetch publication' });
  }
});

// ============================================================
// INDEX VALUES (public)
// ============================================================

/**
 * GET /api/v1/publications/indices
 * List all latest index values
 */
router.get('/indices', async (_req: Request, res: Response) => {
  try {
    const indices = await publicationsService.listLatestIndices();
    res.json({ success: true, data: indices });
  } catch (error) {
    logger.error('Failed to list indices', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch indices' });
  }
});

/**
 * GET /api/v1/publications/indices/:type
 * Get index history
 */
router.get('/indices/:type', async (req: Request, res: Response) => {
  try {
    const region = req.query.region as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;
    const history = await publicationsService.getIndexHistory(req.params.type, region, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('Failed to get index history', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch index history' });
  }
});

/**
 * GET /api/v1/publications/indices/:type/latest
 * Get latest index value
 */
router.get('/indices/:type/latest', async (req: Request, res: Response) => {
  try {
    const region = (req.query.region as string) || 'national';
    const latest = await publicationsService.getLatestIndex(req.params.type, region);
    if (!latest) {
      return res.status(404).json({ success: false, error: 'Index value not found' });
    }
    res.json({ success: true, data: latest });
  } catch (error) {
    logger.error('Failed to get latest index', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch latest index' });
  }
});

// ============================================================
// NEWSLETTER
// ============================================================

/**
 * POST /api/v1/publications/newsletter/subscribe
 */
router.post('/newsletter/subscribe', async (req: Request, res: Response) => {
  try {
    const { email, name, organization, role, segments } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    const result = await publicationsService.subscribeNewsletter({ email, name, organization, role, segments });
    res.json({ success: true, data: result, message: 'Successfully subscribed' });
  } catch (error) {
    logger.error('Newsletter subscribe failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Subscription failed' });
  }
});

// ============================================================
// ADMIN ROUTES (auth expected via headers)
// ============================================================

/**
 * GET /api/v1/publications
 * Admin: List all publications with filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: publicationsService.PublicationFilters = {
      type: req.query.type as string,
      product: req.query.product as string,
      edition: req.query.edition as string,
      status: req.query.status as string,
      sector: req.query.sector as string,
      topic: req.query.topic as string,
      region: req.query.region as string,
      access_tier: req.query.access_tier as string,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    };

    const result = await publicationsService.listPublications(filters);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Failed to list publications', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch publications' });
  }
});

/**
 * GET /api/v1/publications/analytics
 * Admin: CMS aggregate analytics
 */
router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const analytics = await publicationsService.getCmsAnalytics();
    res.json({ success: true, data: analytics });
  } catch (error) {
    logger.error('Failed to get CMS analytics', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/v1/publications/:id
 * Admin: Get full publication by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const publication = await publicationsService.getById(req.params.id);
    if (!publication) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }
    const charts = await publicationsService.getCharts(publication.id);
    res.json({ success: true, data: { ...publication, charts } });
  } catch (error) {
    logger.error('Failed to get publication', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch publication' });
  }
});

/**
 * GET /api/v1/publications/:id/stats
 * Admin: Get publication view stats
 */
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await publicationsService.getPublicationStats(req.params.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Failed to get publication stats', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

/**
 * POST /api/v1/publications
 * Admin: Create a new publication
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId } = getUserContext(req);
    const publication = await publicationsService.createPublication(req.body, userId);
    res.status(201).json({ success: true, data: publication });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create publication', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: 'Failed to create publication', detail: err.message });
  }
});

/**
 * PUT /api/v1/publications/:id
 * Admin: Update a publication
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const publication = await publicationsService.updatePublication(req.params.id, req.body);
    if (!publication) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }
    res.json({ success: true, data: publication });
  } catch (error) {
    logger.error('Failed to update publication', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to update publication' });
  }
});

/**
 * POST /api/v1/publications/:id/publish
 * Admin: Publish a publication
 */
router.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const publication = await publicationsService.publishPublication(req.params.id);
    if (!publication) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }
    res.json({ success: true, data: publication });
  } catch (error) {
    logger.error('Failed to publish publication', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to publish' });
  }
});

/**
 * POST /api/v1/publications/:id/archive
 * Admin: Archive a publication
 */
router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const publication = await publicationsService.archivePublication(req.params.id);
    if (!publication) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }
    res.json({ success: true, data: publication });
  } catch (error) {
    logger.error('Failed to archive publication', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to archive' });
  }
});

/**
 * DELETE /api/v1/publications/:id
 * Admin: Delete a publication
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await publicationsService.deletePublication(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }
    res.json({ success: true, message: 'Publication deleted' });
  } catch (error) {
    logger.error('Failed to delete publication', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

// ============================================================
// CHARTS (within publications)
// ============================================================

/**
 * POST /api/v1/publications/:id/charts
 * Add a chart to a publication
 */
router.post('/:id/charts', async (req: Request, res: Response) => {
  try {
    const chart = await publicationsService.addChart(req.params.id, req.body);
    res.status(201).json({ success: true, data: chart });
  } catch (error) {
    logger.error('Failed to add chart', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to add chart' });
  }
});

/**
 * DELETE /api/v1/publications/charts/:chartId
 * Remove a chart
 */
router.delete('/charts/:chartId', async (req: Request, res: Response) => {
  try {
    await publicationsService.removeChart(req.params.chartId);
    res.json({ success: true, message: 'Chart removed' });
  } catch (error) {
    logger.error('Failed to remove chart', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to remove chart' });
  }
});

// ============================================================
// PDF GENERATION & DOWNLOAD
// ============================================================

/**
 * POST /api/v1/publications/:id/pdf
 * Generate (or regenerate) a PDF for a publication
 */
router.post('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const result = await generatePublicationPdf({ publicationId: req.params.id });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('PDF generation failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'PDF generation failed: ' + (error as Error).message });
  }
});

/**
 * GET /api/v1/publications/:id/pdf
 * Download the PDF for a publication (redirects to presigned MinIO URL)
 */
router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const publication = await publicationsService.getById(req.params.id);
    if (!publication) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }
    if (!publication.pdf_url) {
      return res.status(404).json({ success: false, error: 'PDF not available for this publication' });
    }
    // Redirect to the presigned URL
    res.redirect(publication.pdf_url);
  } catch (error) {
    logger.error('PDF download failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'PDF download failed' });
  }
});

// ============================================================
// AI CONTENT GENERATION
// ============================================================

/**
 * POST /api/v1/publications/ai/generate-section
 * Generate a section using Gemini AI
 */
router.post('/ai/generate-section', async (req: Request, res: Response) => {
  try {
    const { sectionType, dataContext, sector, region, customPrompt } = req.body;
    if (!sectionType) {
      return res.status(400).json({ success: false, error: 'sectionType is required' });
    }
    const result = await geminiService.generateSection({
      sectionType, dataContext: dataContext || {}, sector, region, customPrompt,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('AI section generation failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'AI generation failed: ' + (error as Error).message });
  }
});

/**
 * POST /api/v1/publications/ai/generate-insight
 * Generate a chart insight using Gemini AI
 */
router.post('/ai/generate-insight', async (req: Request, res: Response) => {
  try {
    const { chartData, chartType, title, sector, region } = req.body;
    if (!chartData || !title) {
      return res.status(400).json({ success: false, error: 'chartData and title are required' });
    }
    const result = await geminiService.generateChartInsight({
      chartData, chartType: chartType || 'line', title, sector, region,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('AI insight generation failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'AI generation failed: ' + (error as Error).message });
  }
});

/**
 * POST /api/v1/publications/ai/generate-quote
 * Generate a market quote for press/media
 */
router.post('/ai/generate-quote', async (req: Request, res: Response) => {
  try {
    const { topic, dataPoints, region } = req.body;
    if (!topic) {
      return res.status(400).json({ success: false, error: 'topic is required' });
    }
    const result = await geminiService.generateQuote({ topic, dataPoints, region });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('AI quote generation failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'AI generation failed: ' + (error as Error).message });
  }
});

/**
 * POST /api/v1/publications/ai/generate-summary
 * Generate executive summary from content
 */
router.post('/ai/generate-summary', async (req: Request, res: Response) => {
  try {
    const { title, sections, publicationType } = req.body;
    if (!title || !sections) {
      return res.status(400).json({ success: false, error: 'title and sections are required' });
    }
    const result = await geminiService.generateSummary({ title, sections, publicationType: publicationType || 'report' });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('AI summary generation failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'AI generation failed: ' + (error as Error).message });
  }
});

/**
 * POST /api/v1/publications/ai/generate-draft
 * Generate a full AI draft for a publication
 */
router.post('/ai/generate-draft', async (req: Request, res: Response) => {
  try {
    const { type, title, sectors, topics, regions, dataContext } = req.body;
    if (!type || !title) {
      return res.status(400).json({ success: false, error: 'type and title are required' });
    }
    const result = await geminiService.generateFullDraft({
      type,
      title,
      sectors: sectors || [],
      topics: topics || [],
      regions: regions || [],
      dataContext: dataContext || {},
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('AI draft generation failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'AI generation failed: ' + (error as Error).message });
  }
});

/**
 * POST /api/v1/publications/ai/generate-seo
 * Generate SEO metadata
 */
router.post('/ai/generate-seo', async (req: Request, res: Response) => {
  try {
    const { title, excerpt } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    const result = await geminiService.generateSeoMetadata(title, excerpt || '');
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('AI SEO generation failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'AI generation failed: ' + (error as Error).message });
  }
});

// ============================================================
// INDEX MANAGEMENT (Admin)
// ============================================================

/**
 * POST /api/v1/publications/indices
 * Publish a new index value
 */
router.post('/indices', async (req: Request, res: Response) => {
  try {
    const result = await publicationsService.publishIndexValue(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to publish index value', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to publish index value' });
  }
});

// ============================================================
// NEWSLETTER ADMIN
// ============================================================

/**
 * GET /api/v1/publications/newsletter/subscribers
 * Admin: List newsletter subscribers
 */
router.get('/newsletter/subscribers', async (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const result = await publicationsService.listSubscribers(page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Failed to list subscribers', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to fetch subscribers' });
  }
});

export default router;
