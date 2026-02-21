/**
 * Gemini AI Service — Publications AI Content Generation
 * Uses Google Gemini 2.5 Flash for generating research content
 */
import { config } from '../../config';
import { logger } from '../../utils/logger';

// ============================================================
// TYPES
// ============================================================

export interface GeminiGenerateRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GeminiResponse {
  text: string;
  model: string;
  tokensUsed?: number;
}

export interface SectionGenerateRequest {
  sectionType: 'executive_summary' | 'macro_context' | 'sector_analysis' | 'risk_matrix' | 'outlook' | 'methodology' | 'custom';
  dataContext: Record<string, unknown>;
  sector?: string;
  region?: string;
  customPrompt?: string;
}

export interface ChartInsightRequest {
  chartData: Record<string, unknown>;
  chartType: string;
  title: string;
  sector?: string;
  region?: string;
}

export interface QuoteRequest {
  topic: string;
  dataPoints?: Record<string, unknown>;
  region?: string;
}

export interface SummaryRequest {
  title: string;
  sections: Array<{ heading: string; content: string }>;
  publicationType: string;  // @deprecated — kept for backward compat
  product?: string;
  edition?: string;
}

// ============================================================
// SYSTEM PROMPTS
// ============================================================

const SYSTEM_PROMPT = `You are a senior real estate research analyst at PROPMETRIK, West Africa's leading property intelligence firm. Write in a professional, data-driven style suitable for institutional investors, government policymakers, and economists. Always cite specific numbers from the provided data. Be authoritative but measured — note risks alongside opportunities. Use Ghana market context and GHS currency. Follow RICS standards for terminology.`;

const SECTION_PROMPTS: Record<string, string> = {
  executive_summary: `Synthesize the key findings from this data into a 3-paragraph executive summary. Lead with the most significant trend. Include 3-5 bullet key findings. Target audience: C-suite executives and fund managers.`,
  macro_context: `Using the provided data, write a macroeconomic overview covering: GDP growth, inflation, GHS/USD movement, and BoG policy rate. Explain implications for real estate. Max 400 words.`,
  sector_analysis: `Write a detailed sector analysis based on the data provided. Cover supply-demand dynamics, pricing trends, and investment outlook. Reference specific numbers and percentage changes. Max 600 words.`,
  risk_matrix: `Based on the data trends, generate a Best Case / Base Case / Worst Case scenario matrix for the sector in Ghana over the next 12 months. Include specific price/yield/vacancy projections for each scenario. Format as a clear table with narrative explanations.`,
  outlook: `Write a forward-looking outlook (6-12 months) based on the data trends, macroeconomic context, and available projections. Be balanced — note both upside and downside risks. Max 400 words.`,
  methodology: `Write a methodology section describing the data sources, sample sizes, and analytical methods used. Mention confidence intervals where applicable. Max 300 words.`,
};

// ============================================================
// GEMINI API CLIENT
// ============================================================

async function callGemini(request: GeminiGenerateRequest): Promise<GeminiResponse> {
  const { apiKey, apiUrl } = config.gemini;

  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const url = `${apiUrl}?key=${apiKey}`;

  const body = {
    contents: [
      ...(request.systemPrompt ? [{
        role: 'user',
        parts: [{ text: `System instructions: ${request.systemPrompt}` }],
      }, {
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions for all my responses.' }],
      }] : []),
      {
        role: 'user',
        parts: [{ text: request.prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: request.maxTokens || 2048,
      temperature: request.temperature ?? 0.7,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error({ status: response.status, body: errorBody }, 'Gemini API error');
    throw new Error(`Gemini API error: ${response.status} — ${errorBody}`);
  }

  const data: any = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokensUsed = data.usageMetadata?.totalTokenCount;

  return {
    text,
    model: 'gemini-2.5-flash',
    tokensUsed,
  };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Generate a section for a publication
 */
export async function generateSection(request: SectionGenerateRequest): Promise<GeminiResponse> {
  const templatePrompt = request.sectionType === 'custom'
    ? request.customPrompt || 'Write a professional analytical section based on the data.'
    : SECTION_PROMPTS[request.sectionType] || SECTION_PROMPTS.sector_analysis;

  const contextInfo = [
    request.sector && `Sector: ${request.sector}`,
    request.region && `Region: ${request.region}`,
  ].filter(Boolean).join('\n');

  const prompt = `${templatePrompt}

${contextInfo ? `Context:\n${contextInfo}\n` : ''}
Data:
${JSON.stringify(request.dataContext, null, 2)}`;

  logger.info({ sectionType: request.sectionType, sector: request.sector, region: request.region }, 'Generating publication section');

  return callGemini({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: request.sectionType === 'executive_summary' ? 1500 : 2048,
    temperature: 0.7,
  });
}

/**
 * Generate an AI insight for a chart
 */
export async function generateChartInsight(request: ChartInsightRequest): Promise<GeminiResponse> {
  const prompt = `Given this chart data for "${request.title}" (${request.chartType} chart):

${JSON.stringify(request.chartData, null, 2)}

Write a 2-3 sentence insight explaining the key trend, what's driving it, and what it means for ${request.sector || 'the market'} in ${request.region || 'Ghana'}. Be specific with numbers.`;

  logger.info({ title: request.title, chartType: request.chartType }, 'Generating chart insight');

  return callGemini({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 300,
    temperature: 0.6,
  });
}

/**
 * Generate an instant market quote for journalists/press
 */
export async function generateQuote(request: QuoteRequest): Promise<GeminiResponse> {
  const prompt = `Generate a publication-ready market quote suitable for media use on the topic: "${request.topic}"

${request.region ? `Focus region: ${request.region}` : 'Focus: Ghana national market'}

${request.dataPoints ? `Latest data points:\n${JSON.stringify(request.dataPoints, null, 2)}` : ''}

The quote should be 2-3 sentences, authoritative, data-driven, and suitable for newspaper or broadcast attribution. End with a forward-looking statement.`;

  logger.info({ topic: request.topic }, 'Generating press quote');

  return callGemini({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 300,
    temperature: 0.6,
  });
}

/**
 * Generate an executive summary from publication content
 */
export async function generateSummary(request: SummaryRequest): Promise<GeminiResponse> {
  const sectionsText = request.sections
    .map(s => `## ${s.heading}\n${s.content}`)
    .join('\n\n');

  const productLabel = request.product
    ? `${request.product} ${request.edition || ''}`.trim()
    : request.publicationType;

  const prompt = `Summarize this ${productLabel} titled "${request.title}" into a concise executive summary of 3-5 bullet points followed by a 2-paragraph overview. Focus on actionable insights and key data points.

Content:
${sectionsText}`;

  logger.info({ title: request.title, product: request.product || request.publicationType }, 'Generating summary');

  return callGemini({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 1000,
    temperature: 0.5,
  });
}

/**
 * Generate SEO metadata for a publication
 */
export async function generateSeoMetadata(title: string, excerpt: string): Promise<{ seoTitle: string; seoDescription: string }> {
  const prompt = `Generate SEO metadata for this research publication:
Title: ${title}
Excerpt: ${excerpt}

Return ONLY a JSON object with:
- "seoTitle": max 70 characters, compelling for search
- "seoDescription": max 160 characters, includes key data points

Return valid JSON only, no markdown.`;

  const response = await callGemini({
    prompt,
    maxTokens: 200,
    temperature: 0.3,
  });

  try {
    const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      seoTitle: title.substring(0, 70),
      seoDescription: excerpt.substring(0, 160),
    };
  }
}

/**
 * Generate a full AI draft for a publication
 */
export async function generateFullDraft(params: {
  type: string;
  title: string;
  sectors: string[];
  topics: string[];
  regions: string[];
  dataContext: Record<string, unknown>;
}): Promise<{ sections: Array<{ heading: string; content: string; aiGenerated: boolean }>; keyFindings: string[]; excerpt: string }> {
  const prompt = `Create a comprehensive draft for a ${params.type.replace(/_/g, ' ')} titled "${params.title}".

Context:
- Sectors: ${params.sectors.join(', ')}
- Topics: ${params.topics.join(', ')}
- Regions: ${params.regions.join(', ')}

Data:
${JSON.stringify(params.dataContext, null, 2)}

Return ONLY a JSON object with this structure:
{
  "sections": [
    { "heading": "Executive Summary", "content": "..." },
    { "heading": "Market Overview", "content": "..." },
    { "heading": "Key Findings", "content": "..." },
    { "heading": "Outlook", "content": "..." }
  ],
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
  "excerpt": "200-character summary of the publication"
}

Write institutional-quality content with specific numbers. Each section should be 200-400 words.
Return valid JSON only, no markdown code blocks.`;

  logger.info({ type: params.type, title: params.title }, 'Generating full AI draft');

  const response = await callGemini({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 4096,
    temperature: 0.7,
  });

  try {
    const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      sections: (parsed.sections || []).map((s: { heading: string; content: string }) => ({
        ...s,
        aiGenerated: true,
      })),
      keyFindings: parsed.keyFindings || [],
      excerpt: parsed.excerpt || '',
    };
  } catch (e) {
    logger.error({ error: e, raw: response.text }, 'Failed to parse AI draft response');
    // Fallback: return the raw text as a single section
    return {
      sections: [{ heading: 'AI Draft', content: response.text, aiGenerated: true }],
      keyFindings: [],
      excerpt: '',
    };
  }
}
