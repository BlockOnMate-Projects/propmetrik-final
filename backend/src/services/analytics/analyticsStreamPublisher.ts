/**
 * Analytics stream — channel model + publisher.
 *
 * Shared between the WebSocket gateway (analyticsStreamServer) and the analytics
 * refresh jobs that produce updates.
 *
 * Fan-out transport: an in-process EventEmitter bus. The analytics refresh jobs
 * and the WS gateway run in the same backend process, and the shared Redis user
 * is ACL-restricted from pub/sub (SUBSCRIBE/PUBLISH return NOPERM) — the same
 * reason the workspace messenger broadcasts in-process. If the Redis ACL is ever
 * opened for an `analytics:stream:*` namespace, this bus can be bridged to Redis
 * for cross-instance fan-out without touching callers.
 *
 * Channel grammar:  <product>.<metric>[.<scope>]
 *   market.price-index.greater_accra   → market_intelligence
 *   macro.mieg                         → analytics
 *   shortstay.metrics.osu              → short_stay
 * Each channel is entitlement-gated per its product (same products the REST API
 * sells — see platform_services / migration 212).
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

/** In-process fan-out bus. Gateway subscribes; jobs publish. */
export const streamBus = new EventEmitter();
streamBus.setMaxListeners(50);

/** Map a channel to the billable product that gates it, or null if unknown. */
export function productForChannel(channel: string): string | null {
  const top = (channel.split('.')[0] || '').toLowerCase();
  switch (top) {
    case 'market':
      return 'market_intelligence';
    case 'macro':
    case 'analytics':
      return 'analytics';
    case 'shortstay':
    case 'short-stay':
      return 'short_stay';
    default:
      return null;
  }
}

/** Published channel catalog (for the console + docs). */
export const STREAM_CHANNELS: { channel: string; product: string; description: string; scoped?: string }[] = [
  { channel: 'market.price-index', product: 'market_intelligence', description: 'Property price index across all regions; pushed on each analytics refresh.', scoped: 'market.price-index.<region>' },
  { channel: 'macro.mieg', product: 'analytics', description: 'Monthly Indicator of Economic Growth (Total) — index + YoY.' },
  { channel: 'macro.alerts', product: 'analytics', description: 'Macro alert triggers (NPL / PPI / lending-rate breaches) as they fire.' },
];

export interface StreamEnvelope {
  channel: string;
  event: 'update' | 'snapshot';
  data: unknown;
  ts: number;
}

/**
 * Publish an update for a channel to the in-process gateway. Best-effort — a
 * publish failure must never break the job that produced the data.
 *
 * `ts` is supplied by the caller (jobs stamp real timestamps); this module never
 * calls Date.now() itself so it stays deterministic/testable.
 */
export async function publishAnalyticsUpdate(
  channel: string,
  data: unknown,
  ts: number,
  event: 'update' | 'snapshot' = 'update',
): Promise<void> {
  if (!productForChannel(channel)) {
    logger.warn('publishAnalyticsUpdate: unknown channel product — skipping', { channel });
    return;
  }
  const envelope: StreamEnvelope = { channel, event, data, ts };
  try {
    streamBus.emit('publish', envelope);
  } catch (err: any) {
    logger.warn('publishAnalyticsUpdate failed', { channel, error: err?.message });
  }
}
