/**
 * Shared AI text-generation service.
 *
 * One place that every AI feature calls (PM property descriptions, valuation
 * neighborhood/city narratives, CRM assist, Kobby AI, etc.). Centralizing this
 * matters because the model name was previously baked into each route's URL —
 * when Google retired `gemini-2.0-flash` the prod `GEMINI_API_URL` started 404ing
 * and every AI feature broke silently. Here the model lives in config in ONE place
 * and a retirement is a one-line change.
 *
 * Providers:
 *   - Gemini (Google generativelanguage) — primary.
 *   - DeepSeek (OpenAI-compatible) — automatic fallback when Gemini is down/unset.
 *
 * Design goals: typed, resilient (timeout + bounded retry with backoff on transient
 * failures), provider-agnostic for callers, and never throws an unhelpful error —
 * it surfaces which provider failed and why.
 */

import axios, { AxiosError } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type AIProvider = 'gemini' | 'deepseek';

export interface GenerateTextOptions {
  /** The main user/content prompt. */
  prompt: string;
  /** Optional system instruction (persona, rules, output contract). */
  system?: string;
  /** 0 = deterministic, higher = more creative. Default 0.7. */
  temperature?: number;
  /** Cap on output length (tokens). Provider default when omitted. */
  maxOutputTokens?: number;
  /**
   * Ask the model for strict JSON (sets the provider's JSON mode and strips any
   * ```json fences). Use generateJson() for parsing.
   */
  json?: boolean;
  /**
   * Enable Google Search grounding (Gemini only). The model retrieves real,
   * citable web facts before answering — used to enrich location/area narratives
   * with verifiable local context. NOTE: grounding is incompatible with Gemini's
   * strict-JSON mode, so when set we skip response_mime_type; ask for JSON in the
   * prompt and rely on generateJson()'s tolerant parse. Ignored by DeepSeek.
   */
  searchGrounding?: boolean;
  /** Per-attempt network timeout (ms). Default 30_000. */
  timeoutMs?: number;
  /** Number of RETRIES per provider on transient errors (total attempts = retries + 1). Default 1. */
  retries?: number;
  /**
   * Force a provider or let the service choose. 'auto' (default) tries Gemini
   * then falls back to DeepSeek.
   */
  provider?: 'auto' | AIProvider;
  /** Free-form tag for logs/metrics (e.g. 'pm.property-description'). */
  feature?: string;
}

export interface AIResult {
  text: string;
  provider: AIProvider;
  model: string;
  /** Provider-reported stop reason when available (e.g. 'STOP', 'MAX_TOKENS', 'length'). */
  finishReason?: string;
}

export class AIServiceError extends Error {
  readonly code: string;
  /** Per-provider failure detail, in attempt order. */
  readonly attempts: Array<{ provider: AIProvider; error: string; status?: number }>;
  constructor(
    message: string,
    code: string,
    attempts: Array<{ provider: AIProvider; error: string; status?: number }> = []
  ) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.attempts = attempts;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_RETRIES = 1;
const BACKOFF_BASE_MS = 400;

function sleep(ms: number): Promise<void> {
  // Math.random is unavailable in some sandboxes but fine in the running app;
  // jitter is best-effort. Guard so a missing RNG can't crash a retry.
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Transient = worth retrying: network error, 429, or any 5xx. */
function isTransient(err: AxiosError): boolean {
  if (!err.response) return true; // network/timeout, no HTTP response
  const s = err.response.status;
  return s === 429 || (s >= 500 && s <= 599);
}

function axiosStatus(err: unknown): number | undefined {
  return (err as AxiosError)?.response?.status;
}

function axiosMessage(err: unknown): string {
  const ax = err as AxiosError<any>;
  return (
    ax?.response?.data?.error?.message ||
    ax?.response?.data?.message ||
    ax?.message ||
    String(err)
  );
}

/** Strip ```json … ``` (or bare ```) fences a model sometimes wraps JSON in. */
function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

class AIService {
  /** True when at least one provider is configured. */
  isAvailable(): boolean {
    return !!config.gemini?.enabled || !!config.deepseek?.enabled;
  }

  /** Which providers are configured, in preference order. */
  private resolveOrder(requested: GenerateTextOptions['provider']): AIProvider[] {
    const available: AIProvider[] = [];
    if (config.gemini?.enabled) available.push('gemini');
    if (config.deepseek?.enabled) available.push('deepseek');

    if (requested && requested !== 'auto') {
      return available.includes(requested) ? [requested] : [];
    }
    return available; // gemini first, then deepseek
  }

  /**
   * Generate text. Tries providers in order; within each, retries transient
   * failures with backoff. Throws AIServiceError only when every provider fails.
   */
  async generateText(options: GenerateTextOptions): Promise<AIResult> {
    if (!options.prompt || !options.prompt.trim()) {
      throw new AIServiceError('prompt is required', 'INVALID_INPUT');
    }

    const order = this.resolveOrder(options.provider);
    if (order.length === 0) {
      throw new AIServiceError(
        'No AI provider is configured (set GEMINI_API_KEY and/or DEEPSEEK_API_KEY)',
        'NOT_CONFIGURED'
      );
    }

    const retries = options.retries ?? DEFAULT_RETRIES;
    const attempts: AIServiceError['attempts'] = [];

    for (const provider of order) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result =
            provider === 'gemini'
              ? await this.callGemini(options)
              : await this.callDeepSeek(options);
          if (attempt > 0 || provider !== order[0]) {
            logger.info('aiService: recovered', { provider, attempt, feature: options.feature });
          }
          return result;
        } catch (err) {
          const status = axiosStatus(err);
          const message = axiosMessage(err);
          attempts.push({ provider, error: message, status });
          logger.warn('aiService: provider attempt failed', {
            provider,
            attempt,
            status,
            feature: options.feature,
            error: message,
          });

          const transient = err instanceof AIServiceError ? false : isTransient(err as AxiosError);
          // Retry only transient errors and only if we have attempts left.
          if (transient && attempt < retries) {
            await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
            continue;
          }
          // Non-transient (or out of retries) → stop retrying this provider,
          // fall through to the next provider in `order`.
          break;
        }
      }
    }

    throw new AIServiceError(
      'All AI providers failed',
      'ALL_PROVIDERS_FAILED',
      attempts
    );
  }

  /**
   * Generate and parse JSON. Forces JSON mode and parses the result.
   * Throws AIServiceError('INVALID_JSON') if the model returns unparseable output.
   */
  async generateJson<T = unknown>(options: GenerateTextOptions): Promise<{ data: T; meta: AIResult }> {
    const meta = await this.generateText({ ...options, json: true });
    const cleaned = stripCodeFences(meta.text);
    try {
      return { data: JSON.parse(cleaned) as T, meta };
    } catch {
      // Grounded responses (searchGrounding) aren't in strict-JSON mode and may wrap
      // the object in prose/citations — extract the outermost { … } and retry.
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          return { data: JSON.parse(cleaned.slice(start, end + 1)) as T, meta };
        } catch { /* fall through to error */ }
      }
      throw new AIServiceError(
        'Model did not return valid JSON',
        'INVALID_JSON',
        [{ provider: meta.provider, error: meta.text.slice(0, 200) }]
      );
    }
  }

  // ── Gemini ────────────────────────────────────────────────────────────────

  private async callGemini(options: GenerateTextOptions): Promise<AIResult> {
    const { apiKey, apiBaseUrl, model } = config.gemini;
    // Build the URL from the centralized model — deliberately NOT config.gemini.apiUrl,
    // which in prod points at a retired model.
    const url = `${apiBaseUrl.replace(/\/$/, '')}/models/${model}:generateContent`;

    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      // gemini-2.5-* are "thinking" models — reasoning tokens are billed against
      // maxOutputTokens and silently truncated our JSON. These are generation
      // tasks, not reasoning tasks, so disable the thinking budget. (Ignored by
      // non-2.5 models.)
      thinkingConfig: { thinkingBudget: 0 },
    };
    if (options.maxOutputTokens) generationConfig.maxOutputTokens = options.maxOutputTokens;
    // Grounding is incompatible with strict-JSON mode — skip the mime-type when grounding.
    if (options.json && !options.searchGrounding) generationConfig.response_mime_type = 'application/json';

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
      generationConfig,
    };
    if (options.system) {
      body.system_instruction = { parts: [{ text: options.system }] };
    }
    // Google Search grounding (gemini-2.5+) — model retrieves real web facts first.
    if (options.searchGrounding) {
      body.tools = [{ google_search: {} }];
    }

    const resp = await axios.post(`${url}?key=${apiKey}`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    const candidate = resp.data?.candidates?.[0];
    const finishReason: string | undefined = candidate?.finishReason;

    // A prompt blocked by safety filters returns no candidate / a block reason.
    const blockReason = resp.data?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new AIServiceError(`Gemini blocked the prompt: ${blockReason}`, 'CONTENT_BLOCKED');
    }
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new AIServiceError(`Gemini stopped early: ${finishReason}`, 'GENERATION_INCOMPLETE');
    }

    const parts = candidate?.content?.parts;
    const text: string = Array.isArray(parts)
      ? parts.map((p: any) => p?.text || '').join('').trim()
      : '';
    if (!text) {
      throw new AIServiceError('Gemini returned empty text', 'EMPTY_RESPONSE');
    }

    return {
      text: options.json ? stripCodeFences(text) : text,
      provider: 'gemini',
      model,
      finishReason,
    };
  }

  // ── DeepSeek (OpenAI-compatible) ────────────────────────────────────────────

  private async callDeepSeek(options: GenerateTextOptions): Promise<AIResult> {
    const { apiKey, apiBaseUrl, model } = config.deepseek;
    const url = `${apiBaseUrl.replace(/\/$/, '')}/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.system) messages.push({ role: 'system', content: options.system });
    messages.push({ role: 'user', content: options.prompt });

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    };
    if (options.maxOutputTokens) body.max_tokens = options.maxOutputTokens;
    if (options.json) body.response_format = { type: 'json_object' };

    const resp = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    const choice = resp.data?.choices?.[0];
    const text: string = (choice?.message?.content || '').trim();
    if (!text) {
      throw new AIServiceError('DeepSeek returned empty text', 'EMPTY_RESPONSE');
    }

    return {
      text: options.json ? stripCodeFences(text) : text,
      provider: 'deepseek',
      model,
      finishReason: choice?.finish_reason,
    };
  }

  /**
   * Lightweight liveness probe for each configured provider. Use for an admin
   * health endpoint — this is what would have caught the retired-model 404.
   */
  async healthCheck(): Promise<{
    available: boolean;
    providers: Array<{ provider: AIProvider; configured: boolean; ok: boolean; detail: string }>;
  }> {
    const providers: Array<{ provider: AIProvider; configured: boolean; ok: boolean; detail: string }> = [];

    for (const provider of ['gemini', 'deepseek'] as AIProvider[]) {
      const configured = provider === 'gemini' ? !!config.gemini?.enabled : !!config.deepseek?.enabled;
      if (!configured) {
        providers.push({ provider, configured: false, ok: false, detail: 'not configured' });
        continue;
      }
      try {
        const res = await this.generateText({
          prompt: 'Reply with the single word: OK',
          provider,
          retries: 0,
          timeoutMs: 15_000,
          maxOutputTokens: 8,
          feature: 'healthcheck',
        });
        providers.push({ provider, configured: true, ok: true, detail: `${res.model}: ${res.text.slice(0, 40)}` });
      } catch (err) {
        providers.push({
          provider,
          configured: true,
          ok: false,
          detail: `${axiosStatus(err) ?? ''} ${axiosMessage(err)}`.trim(),
        });
      }
    }

    return { available: providers.some((p) => p.ok), providers };
  }
}

export const aiService = new AIService();
export default aiService;
