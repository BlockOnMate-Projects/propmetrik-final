/**
 * Anthropic Claude Client
 * 
 * Centralized client for Claude API interactions with streaming support,
 * retry logic, and metrics tracking.
 * 
 * @module services/ai/anthropicClient
 * @version 1.0.0
 * @since 2026-01-14
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AnthropicConfig {
  apiKey: string;
  defaultModel: string;
  maxRetries: number;
  timeout: number;
  baseUrl?: string;
}

const defaultConfig: AnthropicConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  defaultModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  maxRetries: 3,
  timeout: 60000,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
};

// ============================================================================
// TYPES
// ============================================================================

export interface MessageRequest {
  model?: string;
  max_tokens: number;
  system?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  stop_sequences?: string[];
  metadata?: {
    user_id?: string;
    request_id?: string;
  };
}

export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface MessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface StreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: MessageResponse;
  index?: number;
  content_block?: {
    type: 'text';
    text: string;
  };
  delta?: {
    type: 'text_delta';
    text: string;
  } | {
    stop_reason: string;
    stop_sequence: string | null;
  };
  usage?: {
    output_tokens: number;
  };
}

export interface UsageMetrics {
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

export class AnthropicClient extends EventEmitter {
  private client: Anthropic;
  private config: AnthropicConfig;
  private metricsHistory: UsageMetrics[] = [];
  private static instance: AnthropicClient | null = null;

  constructor(config: Partial<AnthropicConfig> = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
    
    if (!this.config.apiKey) {
      console.warn('AnthropicClient: ANTHROPIC_API_KEY not set. API calls will fail.');
    }

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      ...(this.config.baseUrl && { baseURL: this.config.baseUrl }),
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<AnthropicConfig>): AnthropicClient {
    if (!AnthropicClient.instance) {
      AnthropicClient.instance = new AnthropicClient(config);
    }
    return AnthropicClient.instance;
  }

  /**
   * Create a message (non-streaming)
   */
  async createMessage(request: MessageRequest): Promise<MessageResponse> {
    const startTime = Date.now();
    const requestId = request.metadata?.request_id || crypto.randomUUID();

    try {
      this.emit('request:start', { requestId, model: request.model || this.config.defaultModel });

      const response = await this.client.messages.create({
        model: request.model || this.config.defaultModel,
        max_tokens: request.max_tokens,
        system: request.system,
        messages: request.messages,
        temperature: request.temperature,
        stop_sequences: request.stop_sequences,
      });

      const latencyMs = Date.now() - startTime;
      const metrics = this.recordMetrics(requestId, response as MessageResponse, latencyMs, true);
      
      this.emit('request:complete', { requestId, metrics });

      return response as MessageResponse;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const metrics = this.recordMetrics(requestId, null, latencyMs, false, errorMessage);
      this.emit('request:error', { requestId, error: errorMessage, metrics });

      throw error;
    }
  }

  /**
   * Create a streaming message
   */
  async *createMessageStream(request: MessageRequest): AsyncGenerator<StreamEvent> {
    const startTime = Date.now();
    const requestId = request.metadata?.request_id || crypto.randomUUID();

    try {
      this.emit('stream:start', { requestId, model: request.model || this.config.defaultModel });

      const stream = this.client.messages.stream({
        model: request.model || this.config.defaultModel,
        max_tokens: request.max_tokens,
        system: request.system,
        messages: request.messages,
        temperature: request.temperature,
        stop_sequences: request.stop_sequences,
      });

      for await (const event of stream) {
        this.emit('stream:event', { requestId, event });
        yield event as StreamEvent;
      }

      // Get final message for metrics
      const finalMessage = await stream.finalMessage();
      const latencyMs = Date.now() - startTime;
      const metrics = this.recordMetrics(requestId, finalMessage as MessageResponse, latencyMs, true);
      
      this.emit('stream:complete', { requestId, metrics });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.recordMetrics(requestId, null, latencyMs, false, errorMessage);
      this.emit('stream:error', { requestId, error: errorMessage });

      throw error;
    }
  }

  /**
   * Collect streaming text into a single string
   */
  async collectStreamText(request: MessageRequest): Promise<{
    text: string;
    metrics: UsageMetrics;
  }> {
    const textChunks: string[] = [];
    let lastEvent: StreamEvent | null = null;

    for await (const event of this.createMessageStream(request)) {
      lastEvent = event;
      if (event.type === 'content_block_delta' && event.delta && 'text' in event.delta) {
        textChunks.push(event.delta.text);
      }
    }

    const text = textChunks.join('');
    const metrics = this.metricsHistory[this.metricsHistory.length - 1];

    return { text, metrics };
  }

  /**
   * Record usage metrics
   */
  private recordMetrics(
    requestId: string,
    response: MessageResponse | null,
    latencyMs: number,
    success: boolean,
    error?: string
  ): UsageMetrics {
    const metrics: UsageMetrics = {
      requestId,
      model: response?.model || this.config.defaultModel,
      inputTokens: response?.usage?.input_tokens || 0,
      outputTokens: response?.usage?.output_tokens || 0,
      totalTokens: (response?.usage?.input_tokens || 0) + (response?.usage?.output_tokens || 0),
      latencyMs,
      success,
      error,
      timestamp: new Date(),
    };

    this.metricsHistory.push(metrics);

    // Keep only last 1000 metrics
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory.shift();
    }

    return metrics;
  }

  /**
   * Get usage metrics summary
   */
  getMetricsSummary(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    averageLatencyMs: number;
    successRate: number;
  } {
    const total = this.metricsHistory.length;
    const successful = this.metricsHistory.filter(m => m.success).length;
    const failed = total - successful;
    const totalTokens = this.metricsHistory.reduce((sum, m) => sum + m.totalTokens, 0);
    const avgLatency = total > 0
      ? this.metricsHistory.reduce((sum, m) => sum + m.latencyMs, 0) / total
      : 0;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      totalTokens,
      averageLatencyMs: Math.round(avgLatency),
      successRate: total > 0 ? successful / total : 0,
    };
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metricsHistory = [];
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; model: string; error?: string }> {
    try {
      // Simple test request
      await this.createMessage({
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      return { healthy: true, model: this.config.defaultModel };
    } catch (error) {
      return {
        healthy: false,
        model: this.config.defaultModel,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const anthropicClient = AnthropicClient.getInstance();

// Export for testing
export const getAnthropicClient = (config?: Partial<AnthropicConfig>): AnthropicClient => {
  return AnthropicClient.getInstance(config);
};

export default anthropicClient;
