/**
 * Autopilot Pipeline — Core Executor
 *
 * The 5-step autonomous publication pipeline:
 * 1. Collect data from analytics endpoints
 * 2. Generate content via AI (section-by-section + coherence pass)
 * 3. Select & snapshot charts
 * 4. Run quality gates
 * 5. Auto-approve & publish (or defer)
 *
 * This service is invoked by the scheduler for cron-triggered runs
 * and by the anomaly trigger for event-driven Market Flashes.
 */
import MarkdownIt from 'markdown-it';
import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { config } from '../../../src/config';
import * as publicationsService from '../publicationsService';
import * as geminiService from '../geminiService';

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

/** Convert markdown section content to clean HTML */
function markdownToHtml(text: string): string {
  return md.render(text);
}
import * as qualityGateEngine from './qualityGateEngine';
import * as chartSelectionEngine from './chartSelectionEngine';
import { getTemplate } from './templates';
import { generatePublicationPdf } from '../pdfGenerationService';
import type {
  AutopilotSchedule,
  AutopilotRun,
  AutopilotRunResult,
  AutopilotSettings,
  GeneratedDraft,
  GeneratedSection,
  PreviousEdition,
  QualityGateResults,
  PublishOptions,
  ProductType,
  EditionType,
} from './types';

// ============================================================
// STYLE SYSTEM PROMPT (from insights.md §15.3.1)
// ============================================================

const AUTOPILOT_SYSTEM_PROMPT = `You are a senior real estate research analyst at PROPMETRIK, West Africa's leading property intelligence firm.

ABOUT PROPMETRIK:
PROPMETRIK is pioneering property intelligence infrastructure for Ghana and West Africa. Our platform combines:
- Machine learning models (XGBoost, LightGBM, neural networks) trained on Ghana-specific property transaction data
- The Ghana House Price Index (GHPI) — a proprietary ML-derived index tracking residential price movements nationally and by region
- Construction Cost Index (CCI) — tracking material and labour cost trends using ensemble ML models
- Ghana Housing Affordability Index (HAI) — a composite index measuring mortgage-to-income, rent-to-income, and cash purchase ratios
- Rental market analytics — cap rates, NOI estimates, gross/net yields, vacancy rates, and rent benchmarks by region
- Automated valuation models (AVMs) with RICS-standard comparable evidence weighting
- Natural language processing for market sentiment analysis from local real estate portals
We are actively building Ghana's real estate data ecosystem — aggregating transaction records, rental listings, construction permits, and economic indicators into a unified intelligence layer.

STRICT STYLE RULES — follow every one:

1. LEAD WITH INSIGHT, NOT DATA
   Don't start with "The X was Y." Start with what the data MEANS.
   Example: "Construction costs in Ghana posted their sharpest monthly increase since Q3 2025, with the CCI climbing 3.2% in January — driven primarily by a 7.8% spike in cement prices."

2. EXPLAIN CAUSATION
   Every data point must be accompanied by the "why."
   Example: "Accra's office market tightened further in Q4, with vacancy compressing to 14.2% from 16.1%. The decline reflects sustained absorption in Airport City and East Legon."

3. PROVIDE FORWARD CONTEXT
   After every finding, state what it means going forward.
   Example: "prices rose 6.2% YoY, but the pace is decelerating — down from 8.4% in Q2. We expect growth to moderate to 4-5% over the next two quarters."

4. REFERENCE CHARTS NATURALLY
   When inserting a chart reference, use "As Figure N illustrates..." or "Figure N shows..."
   Never use "See chart below."

5. USE ANALYST VOICE
   Write in first-person plural: "we expect", "our data shows", "in our view".
   This is PROPMETRIK Research speaking. Never use "I" or passive voice like "it is believed."

6. BALANCE BULLISH AND BEARISH
   Every outlook section MUST note at least one upside and one downside risk.

7. RENTAL MARKET COVERAGE
   When rental data is available, always discuss: average rents, cap rates, net operating income (NOI), gross and net yields, vacancy rates, and rent growth. Compare rental yields across regions and property types. Discuss implications for investors.

8. METHODOLOGY AWARENESS
   In the Methodology section and where relevant, reference PROPMETRIK's proprietary, in-house models and indices:
   • CCI (Construction Cost Index) — our proprietary composite index tracking materials, labour, overhead and equipment costs nationally and regionally.
   • GHAI (Ghana Housing Affordability Index) — our in-house composite affordability model comprising MHAI (mortgage), CHAI (cash buyer), and RHAI (rental) sub-indices.
   • Rental Yield & Cap Rate Models — our in-house analytics computing gross/net yields and capitalisation rates from verified transaction and rental listing data.
   • ML Price Forecasting — our ensemble models (XGBoost, LightGBM, neural networks) trained on proprietary transaction data for residential and commercial price predictions.
   Explicitly state that these are PROPMETRIK-developed, proprietary indices — not sourced from third parties. Describe how we compute them, what data feeds into them, and how we validate predictions. Never say "data is unavailable" or "we cannot analyse" — instead describe our methodology for deriving estimates and note where our models are being calibrated with growing data coverage.

9. NEVER COMPLAIN ABOUT DATA
   Never write "I cannot perform the analysis" or "data contains only error messages" or "unable to provide analysis because data is missing." If a particular data source returned no data, simply omit that metric and focus on what IS available. Use PROPMETRIK's methodology to provide estimated ranges or directional commentary based on related indicators. Frame data gaps as areas where our coverage is expanding, not as limitations.

Use Ghana market context. Use GHS for currency. Follow RICS standards for terminology.
Be authoritative but measured. Cite specific numbers from the provided data.
CRITICAL: NEVER mention internal system endpoint paths, API URLs, error messages, HTTP status codes, or phrases like "failed request" or "endpoint returned error". If data for a metric was unavailable, simply do not mention that metric.`;

// ============================================================
// PIPELINE EXECUTOR
// ============================================================

export class AutopilotPipeline {

  /**
   * Execute a full autopilot pipeline run for a schedule.
   */
  async execute(schedule: AutopilotSchedule): Promise<AutopilotRunResult> {
    const run = await this.createRun(schedule);
    const startTime = Date.now();

    logger.info({
      runId: run.id,
      product: schedule.product,
      edition: schedule.edition,
      region: schedule.region,
      template: schedule.template_id,
    }, 'Autopilot pipeline started');

    try {
      // Check rate limits
      const settings = await this.getSettings();
      if (!settings.global_enabled) {
        await this.markRunFailed(run.id, 'Autopilot globally paused');
        return { status: 'failed', error: 'Autopilot globally paused' };
      }

      const todayPublishCount = await this.countTodayPublishes();
      if (todayPublishCount >= settings.max_publishes_per_day) {
        await this.markRunDeferred(run.id, `Daily publish limit reached (${settings.max_publishes_per_day})`);
        return { status: 'deferred', reason: 'Daily publish limit reached' };
      }

      // ─── STEP 1: Collect Data ───────────────────────────
      const dataPayload = await this.collectData(schedule.data_endpoints, schedule.region);
      const macroContext = await this.fetchMacroContext();
      const previousEdition = await this.getLastEdition(schedule.product, schedule.edition, schedule.region);

      // ─── STEP 2: Generate Content ──────────────────────
      const draft = await this.generateContent({
        product: schedule.product,
        edition: schedule.edition,
        publicationType: schedule.publication_type,
        template: schedule.template_id,
        region: schedule.region || undefined,
        data: dataPayload,
        macro: macroContext,
        previousEdition,
        chartRules: schedule.chart_rules,
      });

      // ─── STEP 3: Select & Snapshot Charts ──────────────
      let charts = await chartSelectionEngine.selectCharts(
        dataPayload,
        schedule.data_endpoints,
        schedule.chart_rules,
        schedule.region || undefined,
      );

      // Augment with AI-generated charts if analytics data is sparse
      charts = await chartSelectionEngine.generateAICharts(
        draft,
        charts,
        schedule.chart_rules,
        schedule.region || undefined,
      );
      draft.charts = charts;

      // ─── STEP 4: Quality Gates ─────────────────────────
      const gateResults = await qualityGateEngine.runQualityGates(
        draft,
        schedule.quality_thresholds,
        previousEdition,
        dataPayload,
      );

      // Update run with gate results
      await this.updateRunGates(run.id, gateResults, draft.aiTokensUsed);

      if (!gateResults.allPassed) {
        // Defer to human review queue
        const pub = await this.saveDeferredPublication(draft, gateResults, run.id);
        await this.markRunDeferred(run.id, gateResults.failureReason || 'Quality gate failed', pub.id);

        logger.warn({
          runId: run.id,
          reason: gateResults.failureReason,
          confidence: gateResults.confidence,
        }, 'Publication deferred — quality gate failed');

        return {
          status: 'deferred',
          publicationId: pub.id,
          reason: gateResults.failureReason || 'Quality gate failed',
        };
      }

      // ─── STEP 5: Auto-Approve & Publish ────────────────
      const publication = await this.publishAutonomously(draft, {
        gateResults,
        generatePdf: this.shouldGeneratePdf(schedule.product),
        distributeNewsletter: true,
        postSocial: true,
        updateIndex: false,
      }, run.id);

      const duration = Date.now() - startTime;
      await this.markRunPublished(run.id, publication.id, gateResults.confidence, duration);

      logger.info({
        runId: run.id,
        publicationId: publication.id,
        confidence: gateResults.confidence,
        durationMs: duration,
      }, 'Publication auto-published successfully');

      return { status: 'published', publicationId: publication.id };

    } catch (error) {
      const errMsg = (error as Error).message;
      const duration = Date.now() - startTime;
      await this.markRunFailed(run.id, errMsg, duration);

      logger.error({
        runId: run.id,
        error: errMsg,
        stack: (error as Error).stack,
      }, 'Autopilot pipeline failed');

      return { status: 'failed', error: errMsg };
    }
  }

  // ============================================================
  // STEP 1: DATA COLLECTION
  // ============================================================

  /**
   * Fetch data from all configured analytics endpoints.
   * Makes internal HTTP calls to the local analytics API.
   */
  private async collectData(
    endpoints: string[],
    region: string | null,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};
    const baseUrl = `http://localhost:${config.port || 4000}`;

    for (const endpoint of endpoints) {
      if (endpoint === '*') continue;

      try {
        let url: string;
        if (endpoint.startsWith('http')) {
          url = endpoint;
        } else {
          // Map short endpoint keys to full API paths
          const path = ENDPOINT_API_PATHS[endpoint] || `/api/v1/analytics/${endpoint}`;
          url = `${baseUrl}${path}`;
        }
        // Rental endpoints already aggregate nationally — skip region filter to avoid empty results
        const skipRegion = endpoint.startsWith('rental/');
        const separator = url.includes('?') ? '&' : '?';
        const fullUrl = region && !skipRegion && !url.includes('region=')
          ? `${url}${separator}region=${region}`
          : url;

        const response = await fetch(fullUrl, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const data = await response.json();
          payload[endpoint] = (data as any).data || data;
        } else {
          logger.warn({ endpoint, status: response.status }, 'Analytics endpoint returned non-OK');
          payload[endpoint] = { error: `HTTP ${response.status}`, endpoint };
        }
      } catch (err) {
        logger.warn({ endpoint, error: (err as Error).message }, 'Failed to fetch analytics endpoint');
        payload[endpoint] = { error: (err as Error).message, endpoint };
      }
    }

    return payload;
  }

  /**
   * Fetch macroeconomic context from Data Hub endpoints.
   */
  private async fetchMacroContext(): Promise<Record<string, unknown>> {
    const baseUrl = `http://localhost:${config.port || 4000}`;
    const macroEndpoints = [
      '/api/v1/data-hub/economic/latest',
      '/api/v1/data-hub/fx/latest',
    ];

    const macro: Record<string, unknown> = {};

    for (const endpoint of macroEndpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const data = await response.json();
          macro[endpoint] = (data as any).data || data;
        }
      } catch {
        // Non-critical — proceed without macro if unavailable
      }
    }

    return macro;
  }

  /**
   * Get the most recent published edition of the same product + edition + region.
   */
  private async getLastEdition(
    product: ProductType,
    edition: EditionType,
    region: string | null,
  ): Promise<PreviousEdition | null> {
    try {
      const regionFilter = region ? `AND '${region}' = ANY(regions)` : '';
      const result = await pool.query(
        `SELECT id, title, content_json, content_html, published_at, word_count
         FROM publications
         WHERE product = $1 AND edition = $2 AND status = 'published' ${regionFilter}
         ORDER BY published_at DESC
         LIMIT 1`,
        [product, edition],
      );
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // STEP 2: CONTENT GENERATION
  // ============================================================

  /**
   * Generate a full publication draft using section-by-section AI generation
   * followed by a coherence pass.
   */
  private async generateContent(input: {
    product: ProductType;
    edition: EditionType;
    publicationType?: string;
    template: string;
    region?: string;
    data: Record<string, unknown>;
    macro: Record<string, unknown>;
    previousEdition: PreviousEdition | null;
    chartRules: { count: [number, number] };
  }): Promise<GeneratedDraft> {
    const template = getTemplate(input.template);
    let totalTokens = 0;

    // Generate each section independently
    const sections: GeneratedSection[] = [];
    let figureCounter = 1;

    for (const sectionDef of template.sections) {
      const sectionPrompt = buildSectionPrompt(sectionDef, input, figureCounter);

      const response = await geminiService.generateSection({
        sectionType: sectionDef.sectionType as 'executive_summary' | 'macro_context' | 'sector_analysis' | 'risk_matrix' | 'outlook' | 'methodology' | 'custom',
        dataContext: {
          ...sanitizeDataKeys(input.data),
          macro: input.macro,
          region: input.region,
          previousEdition: input.previousEdition
            ? { title: input.previousEdition.title, published_at: input.previousEdition.published_at }
            : null,
        },
        sector: sectionDef.heading,
        region: input.region,
        customPrompt: sectionPrompt,
      });

      totalTokens += response.tokensUsed || 0;

      sections.push({
        heading: sectionDef.heading,
        content: response.text,
        aiGenerated: true,
        sectionType: sectionDef.sectionType,
      });

      if (sectionDef.chartSlot) {
        figureCounter++;
      }
    }

    // Coherence pass — ask AI to smooth transitions between sections
    const coherentSections = await this.runCoherencePass(sections, input.product, input.edition, input.region);
    totalTokens += 500; // approximate tokens for coherence pass

    // Generate title
    const titleResponse = await geminiService.generateSection({
      sectionType: 'custom',
      dataContext: {
        sections: sections.map(s => ({ heading: s.heading, preview: s.content.substring(0, 200) })),
        product: input.product,
        edition: input.edition,
        region: input.region,
      },
      customPrompt: `Generate a compelling, data-driven title for this ${input.product} ${input.edition} publication${input.region ? ` covering ${input.region}` : ''}. 
      
The title should:
- Be ≤ 65 characters
- Include a specific data point or trend from the content
- Be suitable for institutional investors / policymakers
- NOT be clickbait

Return ONLY the title text, nothing else.`,
    });
    totalTokens += titleResponse.tokensUsed || 0;

    // Generate SEO metadata
    const fullText = coherentSections.map(s => s.content).join(' ');
    const wordCount = fullText.split(/\s+/).length;
    const excerpt = coherentSections[0]?.content.substring(0, 200) || '';

    const seo = await geminiService.generateSeoMetadata(titleResponse.text.trim(), excerpt);
    totalTokens += 100;

    // Build key findings
    const keyFindingsResponse = await geminiService.generateSection({
      sectionType: 'custom',
      dataContext: { sections: coherentSections.map(s => ({ heading: s.heading, content: s.content })) },
      customPrompt: `Extract 3-5 bullet-point key findings from this publication. Each finding should be one sentence with a specific data point. Return as a JSON array of strings. Return valid JSON only.`,
    });
    totalTokens += keyFindingsResponse.tokensUsed || 0;

    let keyFindings: string[] = [];
    try {
      const cleaned = keyFindingsResponse.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      keyFindings = JSON.parse(cleaned);
    } catch {
      keyFindings = ['Key findings will be added during review.'];
    }

    // Determine taxonomy tags based on content
    const taxonomyTags = inferTaxonomyTags(input.product, input.edition, input.region, input.data);

    return {
      title: titleResponse.text.trim().replace(/^["']|["']$/g, '').substring(0, 490),
      subtitle: null,
      product: input.product,
      edition: input.edition,
      type: (input.publicationType || input.product) as any,  // Use schedule's publication_type for legacy column
      templateId: input.template,
      sections: coherentSections,
      keyFindings,
      excerpt,
      seoTitle: (seo.seoTitle || '').substring(0, 190),
      seoDescription: (seo.seoDescription || '').substring(0, 490),
      sectors: taxonomyTags.sectors,
      topics: taxonomyTags.topics,
      regions: taxonomyTags.regions,
      charts: [],   // filled by chart selection in step 3
      wordCount,
      aiModel: 'gemini-2.5-flash',
      aiTokensUsed: totalTokens,
    };
  }

  /**
   * Run coherence pass — smooth transitions between sections.
   */
  private async runCoherencePass(
    sections: GeneratedSection[],
    product: ProductType,
    edition: EditionType,
    region?: string,
  ): Promise<GeneratedSection[]> {
    try {
      const response = await geminiService.generateSection({
        sectionType: 'custom',
        dataContext: {
          sections: sections.map(s => ({ heading: s.heading, content: s.content })),
        },
        customPrompt: `Review these sections of a ${product} ${edition} publication${region ? ` for ${region}` : ''}.

For each section transition, add a 1-sentence bridge if the transition feels abrupt. Do NOT rewrite the content — only add transition sentences at section boundaries.

Also check for:
- Repeated information across sections → remove from the later section
- Inconsistent data references → flag any contradictions

Return the improved sections as a JSON array:
[{ "heading": "...", "content": "..." }, ...]

Return valid JSON only, no markdown code blocks.`,
      });

      const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const improved = JSON.parse(cleaned) as Array<{ heading: string; content: string }>;

      return improved.map((s, i) => ({
        heading: s.heading || sections[i]?.heading || `Section ${i + 1}`,
        content: s.content || sections[i]?.content || '',
        aiGenerated: true,
        sectionType: sections[i]?.sectionType || 'custom',
      }));
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Coherence pass failed — using raw sections');
      return sections;
    }
  }

  // ============================================================
  // STEP 5: PUBLISH / DEFER
  // ============================================================

  /**
   * Build content_json blocks and content_html with chart blocks interleaved
   * between text sections for inline rendering.
   */
  private buildInterleavedContent(draft: GeneratedDraft): {
    contentBlocks: any[];
    contentHtml: string;
  } {
    const blocks: any[] = [];
    const htmlParts: string[] = [];
    const charts = draft.charts || [];

    // Distribute charts evenly among text sections
    // Place a chart after every N text sections (e.g. after section 1, 3, 5...)
    const sectionCount = draft.sections.length;
    const chartInterval = charts.length > 0
      ? Math.max(1, Math.floor(sectionCount / (charts.length + 1)))
      : sectionCount + 1;

    let chartIdx = 0;

    for (let i = 0; i < sectionCount; i++) {
      const s = draft.sections[i];

      // Add text section
      blocks.push({
        id: `section-${i}`,
        type: 'text',
        content: `<h2>${s.heading}</h2>\n${markdownToHtml(s.content)}`,
        metadata: { sectionType: s.sectionType },
        aiGenerated: false,
      });
      htmlParts.push(`<h2>${s.heading}</h2>\n${markdownToHtml(s.content)}`);

      // Interleave a chart after every chartInterval sections
      if (chartIdx < charts.length && (i + 1) % chartInterval === 0) {
        const chart = charts[chartIdx];
        const chartId = `chart-${chartIdx}`;

        blocks.push({
          id: chartId,
          type: 'chart',
          chartType: chart.chartType,
          title: chart.title,
          aiInsight: chart.aiInsight,
          snapshotData: chart.snapshotData,
          endpoint: chart.endpoint,
          significanceRank: chart.significanceRank,
        });

        htmlParts.push(
          `<div class="publication-chart" data-chart-id="${chartId}" data-chart-type="${chart.chartType}" data-chart-title="${(chart.title || '').replace(/"/g, '&quot;')}">` +
          `<noscript><p><strong>${chart.title}</strong>: ${chart.aiInsight || ''}</p></noscript>` +
          `</div>`
        );

        chartIdx++;
      }
    }

    // Append any remaining charts at the end
    while (chartIdx < charts.length) {
      const chart = charts[chartIdx];
      const chartId = `chart-${chartIdx}`;

      blocks.push({
        id: chartId,
        type: 'chart',
        chartType: chart.chartType,
        title: chart.title,
        aiInsight: chart.aiInsight,
        snapshotData: chart.snapshotData,
        endpoint: chart.endpoint,
        significanceRank: chart.significanceRank,
      });

      htmlParts.push(
        `<div class="publication-chart" data-chart-id="${chartId}" data-chart-type="${chart.chartType}" data-chart-title="${(chart.title || '').replace(/"/g, '&quot;')}">` +
        `<noscript><p><strong>${chart.title}</strong>: ${chart.aiInsight || ''}</p></noscript>` +
        `</div>`
      );

      chartIdx++;
    }

    return {
      contentBlocks: blocks,
      contentHtml: htmlParts.join('\n'),
    };
  }

  /**
   * Save a deferred publication (quality gate failed) for human review.
   */
  private async saveDeferredPublication(
    draft: GeneratedDraft,
    gateResults: QualityGateResults,
    runId: string,
  ): Promise<{ id: string }> {
    const { contentBlocks, contentHtml } = this.buildInterleavedContent(draft);

    const publication = await publicationsService.createPublication({
      title: draft.title,
      subtitle: draft.subtitle || undefined,
      type: draft.type,
      product: draft.product,
      edition: draft.edition,
      sectors: draft.sectors,
      topics: draft.topics,
      regions: draft.regions,
      content_json: contentBlocks,
      content_html: contentHtml,
      excerpt: draft.excerpt,
      key_findings: draft.keyFindings,
      access_tier: 'registered',
      ai_generated: false,
      ai_model: draft.aiModel,
    }, 'autopilot-system');

    // Set status to under_review and add automation metadata
    await pool.query(
      `UPDATE publications 
       SET status = 'under_review',
           automation_mode = 'autopilot',
           autopilot_run_id = $2,
           quality_gate_results = $3,
           ai_confidence_score = $4
       WHERE id = $1`,
      [publication.id, runId, JSON.stringify(gateResults), gateResults.confidence],
    );

    // Save charts
    for (const chart of draft.charts) {
      await publicationsService.addChart(publication.id, {
        endpoint: chart.endpoint,
        params: chart.params,
        chart_type: chart.chartType,
        title: chart.title,
        ai_insight: chart.aiInsight,
        snapshot_data: chart.snapshotData,
      });
    }

    return { id: publication.id };
  }

  /**
   * Auto-approve and publish a draft that passed all quality gates.
   */
  private async publishAutonomously(
    draft: GeneratedDraft,
    options: PublishOptions,
    runId: string,
  ): Promise<{ id: string }> {
    const { contentBlocks, contentHtml } = this.buildInterleavedContent(draft);

    // Create publication
    const publication = await publicationsService.createPublication({
      title: draft.title,
      subtitle: draft.subtitle || undefined,
      type: draft.type,
      product: draft.product,
      edition: draft.edition,
      sectors: draft.sectors,
      topics: draft.topics,
      regions: draft.regions,
      content_json: contentBlocks,
      content_html: contentHtml,
      excerpt: draft.excerpt,
      key_findings: draft.keyFindings,
      access_tier: 'registered',
      ai_generated: false,
      ai_model: draft.aiModel,
    }, 'autopilot-system');

    // Save charts
    for (const chart of draft.charts) {
      await publicationsService.addChart(publication.id, {
        endpoint: chart.endpoint,
        params: chart.params,
        chart_type: chart.chartType,
        title: chart.title,
        ai_insight: chart.aiInsight,
        snapshot_data: chart.snapshotData,
      });
    }

    // Publish immediately
    await publicationsService.publishPublication(publication.id);

    // Generate PDF for eligible publication types (async, non-blocking on failure)
    if (this.shouldGeneratePdf(draft.product)) {
      try {
        const pdfResult = await generatePublicationPdf({ publicationId: publication.id });
        logger.info({ publicationId: publication.id, pdfSize: pdfResult.sizeBytes }, 'PDF generated for publication');
      } catch (pdfErr) {
        logger.error({ publicationId: publication.id, error: (pdfErr as Error).message }, 'PDF generation failed — publication still available without PDF');
      }
    }

    // Update with autopilot metadata
    await pool.query(
      `UPDATE publications 
       SET automation_mode = 'autopilot',
           autopilot_run_id = $2,
           quality_gate_results = $3,
           ai_confidence_score = $4,
           auto_approved_at = NOW(),
           seo_title = $5,
           seo_description = $6
       WHERE id = $1`,
      [
        publication.id,
        runId,
        JSON.stringify(options.gateResults),
        options.gateResults.confidence,
        draft.seoTitle,
        draft.seoDescription,
      ],
    );

    return { id: publication.id };
  }

  /**
   * Determine if PDF should be generated for this product.
   */
  private shouldGeneratePdf(product: string): boolean {
    return ['outlook', 'policy_paper'].includes(product);
  }

  // ============================================================
  // RUN LIFECYCLE (DB operations)
  // ============================================================

  private async createRun(schedule: AutopilotSchedule): Promise<{ id: string }> {
    const result = await pool.query(
      `INSERT INTO autopilot_runs (schedule_id, publication_type, product, edition, region, status, data_endpoints_consumed)
       VALUES ($1, $2, $3, $4, $5, 'running', $6)
       RETURNING id`,
      [schedule.id, schedule.publication_type || schedule.product, schedule.product, schedule.edition, schedule.region, schedule.data_endpoints],
    );
    return { id: result.rows[0].id };
  }

  private async updateRunGates(
    runId: string,
    gateResults: QualityGateResults,
    tokensUsed: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE autopilot_runs 
       SET gate_results = $2,
           confidence_score = $3,
           ai_tokens_used = $4,
           ai_model = 'gemini-2.5-flash'
       WHERE id = $1`,
      [runId, JSON.stringify(gateResults), gateResults.confidence, tokensUsed],
    );
  }

  private async markRunPublished(
    runId: string,
    publicationId: string,
    confidence: number,
    durationMs: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE autopilot_runs 
       SET status = 'published',
           publication_id = $2,
           confidence_score = $3,
           duration_ms = $4,
           completed_at = NOW()
       WHERE id = $1`,
      [runId, publicationId, confidence, durationMs],
    );
  }

  private async markRunDeferred(
    runId: string,
    reason: string,
    publicationId?: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE autopilot_runs 
       SET status = 'deferred',
           deferred_reason = $2,
           publication_id = $3,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INT * 1000
       WHERE id = $1`,
      [runId, reason, publicationId || null],
    );
  }

  private async markRunFailed(
    runId: string,
    errorMessage: string,
    durationMs?: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE autopilot_runs 
       SET status = 'failed',
           error_message = $2,
           duration_ms = $3,
           completed_at = NOW()
       WHERE id = $1`,
      [runId, errorMessage, durationMs || null],
    );
  }

  // ============================================================
  // SETTINGS & RATE LIMITS
  // ============================================================

  async getSettings(): Promise<AutopilotSettings> {
    const result = await pool.query('SELECT * FROM autopilot_settings WHERE id = 1');
    return result.rows[0] || {
      id: 1,
      global_enabled: true,
      max_publishes_per_day: 5,
      max_flashes_per_day: 2,
      default_confidence_floor: 0.70,
      review_window_hours: 24,
      updated_at: new Date().toISOString(),
    };
  }

  private async countTodayPublishes(): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) FROM autopilot_runs 
       WHERE status = 'published' 
       AND started_at >= CURRENT_DATE`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countTodayFlashes(): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) FROM autopilot_runs 
       WHERE status = 'published' 
       AND product = 'snapshot'
       AND edition = 'adhoc'
       AND started_at >= CURRENT_DATE`,
    );
    return parseInt(result.rows[0].count, 10);
  }
}

// ============================================================
// HELPERS
// ============================================================

function buildSectionPrompt(
  sectionDef: { sectionType: string; heading: string; maxWords: number; chartSlot?: boolean },
  input: { product: ProductType; edition: EditionType; region?: string; data: Record<string, unknown>; macro: Record<string, unknown> },
  figureCounter: number,
): string {
  const parts: string[] = [];
  const productLabel = input.product === 'outlook'
    ? `Ghana Real Estate Outlook (${input.edition})`
    : input.product === 'snapshot'
      ? 'Ghana Property Snapshot'
      : input.product.replace(/_/g, ' ');

  parts.push(`Write the "${sectionDef.heading}" section for a ${productLabel} publication.`);
  
  if (input.region) {
    parts.push(`Focus region: ${input.region}`);
  }
  
  parts.push(`Maximum ${sectionDef.maxWords} words.`);
  
  if (sectionDef.chartSlot) {
    parts.push(`Reference "Figure ${figureCounter}" naturally in the text — e.g., "As Figure ${figureCounter} illustrates..." This chart will be inserted adjacent to this section.`);
  }

  parts.push(`Write in PROPMETRIK analyst voice (first-person plural). Lead with insight, not plain data.`);
  parts.push(`Include specific numbers from the provided data. If a data point changed, explain why.`);
  parts.push(`End with a forward-looking statement about what this means going forward.`);
  parts.push(`For the Residential Market section, include rental market analysis: cap rates, rental yields, NOI where available. For the Methodology section, explicitly name PROPMETRIK's proprietary in-house indices (CCI, GHAI with MHAI/CHAI/RHAI sub-indices, Rental Yield & Cap Rate models) and ML forecasting models (XGBoost, LightGBM, neural networks). State clearly that these are developed in-house by PROPMETRIK, not sourced externally. Describe data pipeline, index computation methodology, and validation approach.`);
  parts.push(`CRITICAL: NEVER mention internal system endpoint paths, API URLs, HTTP errors, data source identifiers (e.g. "ml/market/price-index", "/construction/regional"), or phrases like "failed request", "endpoint returned error", "data contains only error messages". If a data source was empty, silently omit it — do NOT mention the absence. Refer to data by its human-readable name only (e.g. "Ghana House Price Index", "Construction Cost Index", "Housing Affordability Index").`);

  return parts.join('\n');
}

/**
 * Maps short endpoint keys (stored in DB) → full API path for internal HTTP fetch.
 * collectData() uses this to build the correct localhost URL.
 */
const ENDPOINT_API_PATHS: Record<string, string> = {
  'ml/market/price-index':        '/api/v1/analytics/ml/market/price-index',
  'ml/construction/index':        '/api/v1/analytics/ml/construction/index',
  'ml/construction/regional':     '/api/v1/analytics/ml/construction/regional',
  'ml/construction/materials':    '/api/v1/analytics/ml/construction/materials',
  'ml/construction/labor':        '/api/v1/analytics/ml/construction/labor',
  'ml/construction/forecast':     '/api/v1/analytics/ml/construction/forecast',
  'ml/hai/current':               '/api/v1/analytics/ml/hai/current',
  'ml/hai/history':               '/api/v1/analytics/ml/hai/history',
  'ml/hai/region/greater_accra':  '/api/v1/analytics/ml/hai/region/greater_accra',
  'ml/hai/region/ashanti':        '/api/v1/analytics/ml/hai/region/ashanti',
  'ml/hai/region/western':        '/api/v1/analytics/ml/hai/region/western',
  'ml/market/activity':           '/api/v1/analytics/ml/market/activity',
  'ml/market/investment':         '/api/v1/analytics/ml/market/investment',
  'ml/valuations/volume':         '/api/v1/analytics/ml/valuations/volume',
  'ml/performance':               '/api/v1/analytics/ml/performance',
  'ml/performance/segments':      '/api/v1/analytics/ml/performance/segments',
  'ml/performance/trend':         '/api/v1/analytics/ml/performance/trend',
  'ml/features':                  '/api/v1/analytics/ml/features',
  'ml/predictions':               '/api/v1/analytics/ml/predictions',
  'ml/confidence':                '/api/v1/analytics/ml/confidence',
  'ml/monitoring/drift':          '/api/v1/analytics/ml/monitoring/drift',
  'dashboard':                    '/api/v1/analytics/ml/dashboard',
  'cohorts':                      '/api/v1/analytics/ml/cohorts',
  'velocity':                     '/api/v1/analytics/ml/velocity',
  'agent-performance':            '/api/v1/analytics/ml/agent-performance',
  // ── Rental Market Analytics ──
  'rental/summary':               '/api/v1/analytics/market/rental/summary',
  'rental/yields':                '/api/v1/analytics/market/rental/yields',
  'rental/trends':                '/api/v1/analytics/market/rental/trends',
  'rental/benchmarks':            '/api/v1/analytics/market/rental/benchmarks',
};

const ENDPOINT_LABELS: Record<string, string> = {
  'ml/market/price-index': 'Ghana House Price Index (GHPI)',
  'ml/construction/index': 'Construction Cost Index (CCI)',
  'ml/construction/regional': 'Regional Construction Activity',
  'ml/construction/materials': 'Construction Materials Costs',
  'ml/construction/labor': 'Construction Labour Costs',
  'ml/construction/forecast': 'Construction Forecast',
  'ml/hai/current': 'Housing Affordability Index (HAI)',
  'ml/hai/history': 'HAI Historical Trends',
  'ml/hai/region/greater_accra': 'HAI Greater Accra',
  'ml/hai/region/ashanti': 'HAI Ashanti Region',
  'ml/hai/region/western': 'HAI Western Region',
  'ml/market/activity': 'Market Activity & Transactions',
  'ml/market/investment': 'Investment Flows & Capital Markets',
  'ml/valuations/volume': 'Valuation Volume',
  'ml/performance': 'ML Model Performance',
  'ml/performance/segments': 'Performance by Segment',
  'ml/performance/trend': 'Performance Trends',
  'ml/features': 'Feature Importance',
  'ml/predictions': 'Price Predictions',
  'ml/confidence': 'Prediction Confidence Intervals',
  'ml/monitoring/drift': 'Data Drift Monitoring',
  'dashboard': 'Market Dashboard Summary',
  'cohorts': 'Transaction Cohort Analysis',
  'velocity': 'Market Velocity Indicators',
  'agent-performance': 'Agent Performance Metrics',
  // ── Rental Market Analytics ──
  'rental/summary': 'Rental Market Summary (Avg Rent, Vacancy, Yields)',
  'rental/yields': 'Rental Yield & Cap Rate Analysis',
  'rental/trends': 'Rental Price Trends (Monthly Time-Series)',
  'rental/benchmarks': 'Rental Market Benchmarks by Area',
};

function sanitizeDataKeys(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip entries that are error objects (from failed endpoint fetches)
    if (value && typeof value === 'object' && (value as any).error) continue;
    // Skip empty arrays / null / undefined
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    const label = ENDPOINT_LABELS[key] || key.replace(/^ml\//g, '').replace(/[/_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    sanitized[label] = value;
  }
  return sanitized;
}

/**
 * Infer taxonomy tags based on product, edition, region, and data endpoints.
 */
function inferTaxonomyTags(
  product: ProductType,
  edition: EditionType,
  region: string | null | undefined,
  data: Record<string, unknown>,
): { sectors: string[]; topics: string[]; regions: string[] } {
  const sectors = new Set<string>();
  const topics = new Set<string>();
  const regions = new Set<string>();

  // Region mapping
  if (region) {
    regions.add(region);
  } else {
    regions.add('national');
  }

  // Product-based topic inference
  switch (product) {
    case 'snapshot':
      topics.add('economics_policy');
      sectors.add('residential_sales');
      break;
    case 'outlook':
      topics.add('economics_policy');
      topics.add('investment');
      sectors.add('residential_sales');
      sectors.add('office');
      sectors.add('retail');
      if (edition === 'quarterly' || edition === 'annual') {
        topics.add('construction');
        sectors.add('industrial');
      }
      break;
    case 'policy_paper':
      topics.add('economics_policy');
      topics.add('risk');
      break;
    default:
      topics.add('economics_policy');
      sectors.add('residential_sales');
  }

  // Endpoint-based topic inference
  const endpointKeys = Object.keys(data);
  for (const key of endpointKeys) {
    if (key.includes('construction') || key.includes('cci')) topics.add('construction');
    if (key.includes('hai') || key.includes('affordability')) topics.add('affordability');
    if (key.includes('investment')) topics.add('investment');
    if (key.includes('sentiment')) topics.add('risk');
    if (key.includes('forecast')) topics.add('investment');
    if (key.includes('rental') || key.includes('yield') || key.includes('cap')) {
      topics.add('rental_market');
      sectors.add('residential_rental');
    }
  }

  return {
    sectors: [...sectors],
    topics: [...topics],
    regions: [...regions],
  };
}

// ── Singleton Export ──────────────────────────────────────────
export const autopilotPipeline = new AutopilotPipeline();
