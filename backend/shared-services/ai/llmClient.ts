/**
 * Multi-Provider LLM Client
 * 
 * Unified client supporting DeepSeek (primary) and Claude (fallback).
 * Provides automatic fallback, retry logic, and cost optimization.
 * 
 * @module services/ai/llmClient
 * @version 1.0.0
 * @since 2026-01-14
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { logger } from '../../src/utils/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

export type LLMProvider = 'deepseek' | 'anthropic';

export interface LLMConfig {
  primaryProvider: LLMProvider;
  fallbackEnabled: boolean;
  deepseek: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
  };
  maxRetries: number;
  timeout: number;
}

const defaultConfig: LLMConfig = {
  primaryProvider: 'deepseek',
  fallbackEnabled: true,
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  },
  maxRetries: 3,
  timeout: 60000,
};

// ============================================================================
// TYPES
// ============================================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  requestId?: string;
}

export interface LLMResponse {
  id: string;
  provider: LLMProvider;
  model: string;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  fallbackUsed: boolean;
}

export interface LLMUsageMetrics {
  requestId: string;
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
  fallbackUsed: boolean;
  error?: string;
  timestamp: Date;
  estimatedCostUsd?: number;
}

// Cost per million tokens (approximate)
const COST_PER_MILLION = {
  deepseek: { input: 0.14, output: 0.28 },
  anthropic: { input: 3.0, output: 15.0 },
};

// ============================================================================
// LLM CLIENT
// ============================================================================

export class LLMClient extends EventEmitter {
  private config: LLMConfig;
  private deepseekClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private metricsHistory: LLMUsageMetrics[] = [];
  private static instance: LLMClient | null = null;

  constructor(config: Partial<LLMConfig> = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
    this.initializeClients();
  }

  /**
   * Initialize API clients based on available credentials
   */
  private initializeClients(): void {
    // Initialize DeepSeek (OpenAI-compatible)
    if (this.config.deepseek.apiKey) {
      this.deepseekClient = new OpenAI({
        apiKey: this.config.deepseek.apiKey,
        baseURL: this.config.deepseek.baseUrl,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
      });
      logger.info('LLMClient: DeepSeek client initialized');
    } else {
      logger.warn('LLMClient: DEEPSEEK_API_KEY not set. DeepSeek calls will fail.');
    }

    // Initialize Anthropic
    if (this.config.anthropic.apiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: this.config.anthropic.apiKey,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
      });
      logger.info('LLMClient: Anthropic client initialized');
    } else {
      logger.warn('LLMClient: ANTHROPIC_API_KEY not set. Claude fallback will fail.');
    }

    // Log provider status
    const providers = [];
    if (this.deepseekClient) providers.push('deepseek');
    if (this.anthropicClient) providers.push('anthropic');
    
    if (providers.length === 0) {
      logger.error('LLMClient: No LLM providers configured! Set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY.');
    } else {
      logger.info(`LLMClient: Available providers: ${providers.join(', ')}`);
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<LLMConfig>): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient(config);
    }
    return LLMClient.instance;
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: LLMProvider): boolean {
    if (provider === 'deepseek') {
      return !!this.deepseekClient;
    }
    return !!this.anthropicClient;
  }

  /**
   * Get the current primary provider
   */
  getPrimaryProvider(): LLMProvider {
    // If primary isn't available, check fallback
    if (!this.isProviderAvailable(this.config.primaryProvider)) {
      const fallback = this.config.primaryProvider === 'deepseek' ? 'anthropic' : 'deepseek';
      if (this.isProviderAvailable(fallback)) {
        return fallback;
      }
    }
    return this.config.primaryProvider;
  }

  /**
   * Create a completion using DeepSeek
   */
  private async createDeepSeekCompletion(request: LLMRequest): Promise<LLMResponse> {
    if (!this.deepseekClient) {
      throw new Error('DeepSeek client not initialized');
    }

    const startTime = Date.now();

    // Convert messages - separate system from conversation
    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // If system message exists, prepend as first user message for DeepSeek
    const messages = systemMessage
      ? [{ role: 'system' as const, content: systemMessage.content }, ...conversationMessages]
      : conversationMessages;

    const response = await this.deepseekClient.chat.completions.create({
      model: this.config.deepseek.model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      ...(request.responseFormat === 'json' && {
        response_format: { type: 'json_object' },
      }),
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    return {
      id: response.id,
      provider: 'deepseek',
      model: response.model,
      content,
      usage: {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      latencyMs,
      fallbackUsed: false,
    };
  }

  /**
   * Create a completion using Anthropic Claude
   */
  private async createAnthropicCompletion(request: LLMRequest): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    const startTime = Date.now();

    // Separate system message
    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.anthropicClient.messages.create({
      model: this.config.anthropic.model,
      max_tokens: request.maxTokens || 4096,
      system: systemMessage?.content,
      messages: conversationMessages,
      temperature: request.temperature ?? 0.7,
    });

    const latencyMs = Date.now() - startTime;
    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';

    return {
      id: response.id,
      provider: 'anthropic',
      model: response.model,
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      latencyMs,
      fallbackUsed: false,
    };
  }

  /**
   * Calculate estimated cost
   */
  private calculateCost(provider: LLMProvider, inputTokens: number, outputTokens: number): number {
    const costs = COST_PER_MILLION[provider];
    return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
  }

  /**
   * Record usage metrics
   */
  private recordMetrics(
    requestId: string,
    response: LLMResponse | null,
    fallbackUsed: boolean,
    error?: string
  ): LLMUsageMetrics {
    const metrics: LLMUsageMetrics = {
      requestId,
      provider: response?.provider || this.config.primaryProvider,
      model: response?.model || 'unknown',
      inputTokens: response?.usage.inputTokens || 0,
      outputTokens: response?.usage.outputTokens || 0,
      totalTokens: response?.usage.totalTokens || 0,
      latencyMs: response?.latencyMs || 0,
      success: !!response && !error,
      fallbackUsed,
      error,
      timestamp: new Date(),
      estimatedCostUsd: response
        ? this.calculateCost(response.provider, response.usage.inputTokens, response.usage.outputTokens)
        : undefined,
    };

    this.metricsHistory.push(metrics);
    
    // Keep only last 1000 entries
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory = this.metricsHistory.slice(-1000);
    }

    return metrics;
  }

  /**
   * Create a completion with automatic fallback
   */
  async createCompletion(request: LLMRequest): Promise<LLMResponse> {
    const requestId = request.requestId || crypto.randomUUID();
    const primaryProvider = this.getPrimaryProvider();
    const fallbackProvider: LLMProvider = primaryProvider === 'deepseek' ? 'anthropic' : 'deepseek';

    let lastError: Error | null = null;
    let fallbackUsed = false;

    // Try primary provider
    try {
      this.emit('request:start', { requestId, provider: primaryProvider });

      const response = primaryProvider === 'deepseek'
        ? await this.createDeepSeekCompletion(request)
        : await this.createAnthropicCompletion(request);

      const metrics = this.recordMetrics(requestId, response, false);
      this.emit('request:complete', { requestId, metrics });

      logger.debug(`LLMClient: ${primaryProvider} completed`, {
        requestId,
        tokens: response.usage.totalTokens,
        latencyMs: response.latencyMs,
        cost: metrics.estimatedCostUsd?.toFixed(6),
      });

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`LLMClient: ${primaryProvider} failed, ${this.config.fallbackEnabled ? 'trying fallback' : 'no fallback enabled'}`, {
        requestId,
        error: lastError.message,
      });
      this.emit('request:fallback', { requestId, primaryProvider, error: lastError.message });
    }

    // Try fallback provider if enabled
    if (this.config.fallbackEnabled && this.isProviderAvailable(fallbackProvider)) {
      try {
        fallbackUsed = true;
        this.emit('fallback:start', { requestId, provider: fallbackProvider });

        const response = fallbackProvider === 'deepseek'
          ? await this.createDeepSeekCompletion(request)
          : await this.createAnthropicCompletion(request);

        response.fallbackUsed = true;
        const metrics = this.recordMetrics(requestId, response, true);
        this.emit('fallback:complete', { requestId, metrics });

        logger.info(`LLMClient: Fallback to ${fallbackProvider} succeeded`, {
          requestId,
          tokens: response.usage.totalTokens,
          latencyMs: response.latencyMs,
        });

        return response;
      } catch (fallbackError) {
        const error = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
        logger.error(`LLMClient: Fallback to ${fallbackProvider} also failed`, {
          requestId,
          error: error.message,
        });
        this.emit('fallback:error', { requestId, provider: fallbackProvider, error: error.message });
        lastError = error;
      }
    }

    // Both failed
    this.recordMetrics(requestId, null, fallbackUsed, lastError?.message);
    throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Create a JSON completion (convenience method)
   */
  async createJsonCompletion<T = unknown>(request: Omit<LLMRequest, 'responseFormat'>): Promise<{
    data: T | null;
    response: LLMResponse;
    parseError?: string;
  }> {
    const response = await this.createCompletion({
      ...request,
      responseFormat: 'json',
    });

    try {
      // Try to extract JSON from the response
      let jsonText = response.content.trim();
      
      // Handle markdown code blocks
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      const data = JSON.parse(jsonText) as T;
      return { data, response };
    } catch (error) {
      const parseError = error instanceof Error ? error.message : 'JSON parse failed';
      logger.warn('LLMClient: Failed to parse JSON response', { parseError });
      return { data: null, response, parseError };
    }
  }

  /**
   * Get usage metrics summary
   */
  getMetricsSummary(): {
    totalRequests: number;
    successRate: number;
    fallbackRate: number;
    averageLatencyMs: number;
    totalCostUsd: number;
    byProvider: Record<LLMProvider, {
      requests: number;
      tokens: number;
      costUsd: number;
    }>;
  } {
    const total = this.metricsHistory.length;
    const successful = this.metricsHistory.filter(m => m.success).length;
    const fallbacks = this.metricsHistory.filter(m => m.fallbackUsed).length;
    const avgLatency = total > 0
      ? this.metricsHistory.reduce((sum, m) => sum + m.latencyMs, 0) / total
      : 0;
    const totalCost = this.metricsHistory.reduce((sum, m) => sum + (m.estimatedCostUsd || 0), 0);

    const byProvider: Record<LLMProvider, { requests: number; tokens: number; costUsd: number }> = {
      deepseek: { requests: 0, tokens: 0, costUsd: 0 },
      anthropic: { requests: 0, tokens: 0, costUsd: 0 },
    };

    for (const m of this.metricsHistory) {
      if (m.provider in byProvider) {
        byProvider[m.provider].requests++;
        byProvider[m.provider].tokens += m.totalTokens;
        byProvider[m.provider].costUsd += m.estimatedCostUsd || 0;
      }
    }

    return {
      totalRequests: total,
      successRate: total > 0 ? successful / total : 0,
      fallbackRate: total > 0 ? fallbacks / total : 0,
      averageLatencyMs: avgLatency,
      totalCostUsd: totalCost,
      byProvider,
    };
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metricsHistory = [];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const llmClient = LLMClient.getInstance();

export function getLLMClient(config?: Partial<LLMConfig>): LLMClient {
  if (config) {
    return new LLMClient(config);
  }
  return LLMClient.getInstance();
}
