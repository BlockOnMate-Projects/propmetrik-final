/**
 * AI Services
 * 
 * Exports for AI-powered services including LLM integrations.
 * 
 * @module services/ai
 * @version 2.0.0
 * @since 2026-01-14
 */

// Multi-Provider LLM Client (DeepSeek + Claude)
export {
  LLMClient,
  llmClient,
  getLLMClient,
  type LLMConfig,
  type LLMProvider,
  type LLMMessage,
  type LLMRequest,
  type LLMResponse,
  type LLMUsageMetrics,
} from './llmClient';

// Anthropic Client (legacy, for direct Claude access)
export {
  AnthropicClient,
  anthropicClient,
  getAnthropicClient,
  type AnthropicConfig,
  type MessageRequest,
  type MessageResponse,
  type StreamEvent,
  type UsageMetrics,
} from './anthropicClient';

// NOTE: FloorPlanDesignIntentService removed - floor plans now use pure Fabric.js on frontend
