/**
 * AnalyticsStreamServer — the subscriber WebSocket gateway (`/ws/analytics`).
 *
 * Real-time push for the analytics API. Coexists with the workspace messenger WS
 * on the same HTTP server (distinct path). Authenticated by the SAME `pmk_` API
 * keys as the REST API and gated by the SAME per-product entitlement — one auth
 * model across REST + WS.
 *
 * Wire protocol (JSON text frames)
 *   client → server:
 *     { "action": "subscribe",   "channels": ["market.price-index.greater_accra"] }
 *     { "action": "unsubscribe", "channels": ["market.price-index.greater_accra"] }
 *     { "action": "ping" }
 *   server → client:
 *     { "type": "connected",    "tier": "...", "max_connections": N, "ts": … }
 *     { "type": "subscribed",   "channels": [...], "rejected": [{channel,reason}], "ts": … }
 *     { "type": "unsubscribed", "channels": [...], "ts": … }
 *     { "type": "snapshot"|"update", "channel": "...", "data": {…}, "ts": … }
 *     { "type": "error",        "message": "...", "ts": … }
 *     { "type": "pong",         "ts": … }
 *
 * Auth (no secret in the URL — browsers can't set headers on WS):
 *   - Bearer header  `Authorization: Bearer pmk_…`  (Node/server clients), OR
 *   - Subprotocol    `['propmetrik-api-key', 'pmk_…']` (browsers) — the gateway
 *     accepts the `propmetrik-api-key` subprotocol and reads the key from the
 *     second offered protocol.
 *
 * Fan-out: one Redis PSUBSCRIBE on `analytics:stream:*`; messages are filtered to
 * the clients that subscribed to each channel.
 */

import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { logger } from '../../utils/logger';
import { resolveApiKey, recordWsSession } from '../valuation-engine/orgSettingsService';
import { orgHasService } from '../../middleware/serviceAccess';
import { productForChannel, streamBus, type StreamEnvelope } from './analyticsStreamPublisher';
import { resolveSnapshot } from './analyticsStreamSnapshots';
import { resolveOrgApiTier, wsConnectionLimitForTier } from './developerPortalService';

const MAX_MESSAGE_BYTES = 8 * 1024;      // control frames are tiny
const MAX_CHANNELS_PER_CONN = 200;
const HEARTBEAT_MS = 30_000;
const CONTROL_RATE_WINDOW_MS = 1_000;
const CONTROL_RATE_MAX = 20;              // max control messages/sec/conn

interface StreamClient {
  ws: WebSocket;
  keyId: string;
  orgId: string;
  tier: string;
  scopes: string[];
  channels: Set<string>;
  isAlive: boolean;
  controlTimestamps: number[];
  connectedAt: number;
  messagesOut: number;
}

/** WS close codes (4000-4999 = application defined). */
const CLOSE = {
  UNAUTHORIZED: 4001,
  SUBSCRIPTION_LIMIT: 4008,
  TOO_MANY_CONNECTIONS: 4009,
} as const;

class AnalyticsStreamServerImpl {
  private wss: WebSocketServer | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private busHandler: ((env: StreamEnvelope) => void) | null = null;

  /** channel → set of clients subscribed to it (local fan-out index). */
  private byChannel = new Map<string, Set<StreamClient>>();
  /** all live clients (heartbeat + shutdown). */
  private clients = new Set<StreamClient>();
  /** orgId → live connection count (per-tier cap). */
  private orgConns = new Map<string, number>();

  attach(httpServer: Server): void {
    // `noServer` mode + a single path-routing upgrade dispatcher. Two ws servers
    // using the `server` option cannot coexist: whichever registers its `upgrade`
    // listener first calls abortHandshake(400) for paths it doesn't own, killing
    // the other server's connections. The workspace WS attaches first (with the
    // `server` option), so we take over the `upgrade` event: route `/ws/analytics`
    // to this server and delegate every other path back to the pre-existing
    // listener(s) so the messenger keeps working unchanged.
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_MESSAGE_BYTES,
      // Browsers pass the key via subprotocol `['propmetrik-api-key', 'pmk_…']`;
      // we echo only `propmetrik-api-key`, never the secret. Header-auth clients
      // offer no subprotocol. Auth happens in onConnection regardless.
      handleProtocols: (protocols: Set<string>) =>
        protocols.has('propmetrik-api-key') ? 'propmetrik-api-key' : false,
    });

    const priorUpgradeListeners = httpServer.listeners('upgrade').slice() as Array<
      (req: IncomingMessage, socket: any, head: any) => void
    >;
    httpServer.removeAllListeners('upgrade');
    httpServer.on('upgrade', (req, socket, head) => {
      const pathname = (req.url || '').split('?')[0];
      if (pathname === '/ws/analytics') {
        this.wss!.handleUpgrade(req, socket as any, head, (ws) => {
          this.wss!.emit('connection', ws, req);
        });
        return;
      }
      // Not ours — hand back to the workspace (and any other) upgrade handler(s).
      for (const listener of priorUpgradeListeners) listener.call(httpServer, req, socket, head);
    });

    this.wss.on('connection', (ws, req) => { void this.onConnection(ws, req as IncomingMessage); });
    this.startHeartbeat();
    this.startBus();
    logger.info('AnalyticsStreamServer attached at /ws/analytics (noServer dispatcher)');
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private extractKey(req: IncomingMessage): string | null {
    const authz = (req.headers['authorization'] as string) || '';
    if (authz.startsWith('Bearer ')) {
      const t = authz.slice(7).trim();
      if (t.startsWith('pmk_')) return t;
    }
    const proto = (req.headers['sec-websocket-protocol'] as string) || '';
    const key = proto.split(',').map((s) => s.trim()).find((p) => p.startsWith('pmk_'));
    return key || null;
  }

  private async onConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const token = this.extractKey(req);
    if (!token) {
      ws.close(CLOSE.UNAUTHORIZED, 'Missing API key');
      return;
    }

    // Buffer any frames that arrive during async auth (a client that sends on
    // `open` rather than waiting for the `connected` frame would otherwise have
    // those frames dropped before the real handler is attached).
    const earlyQueue: string[] = [];
    const earlyHandler = (raw: any) => earlyQueue.push(raw.toString());
    ws.on('message', earlyHandler);

    let key;
    try {
      key = await resolveApiKey(token);
    } catch (err: any) {
      logger.error('AnalyticsStream resolveApiKey error', { error: err?.message });
      ws.close(CLOSE.UNAUTHORIZED, 'Authentication error');
      return;
    }
    if (!key) {
      ws.close(CLOSE.UNAUTHORIZED, 'Invalid or revoked API key');
      return;
    }

    // Per-tier connection cap (org-level budget).
    const tier = await resolveOrgApiTier(key.orgId);
    const max = wsConnectionLimitForTier(tier);
    if ((this.orgConns.get(key.orgId) ?? 0) >= max) {
      ws.close(CLOSE.TOO_MANY_CONNECTIONS, `Connection limit reached (${max})`);
      return;
    }

    const client: StreamClient = {
      ws,
      keyId: key.keyId,
      orgId: key.orgId,
      tier,
      scopes: key.scopes,
      channels: new Set(),
      isAlive: true,
      controlTimestamps: [],
      connectedAt: Date.now(),
      messagesOut: 0,
    };
    this.clients.add(client);
    this.orgConns.set(key.orgId, (this.orgConns.get(key.orgId) ?? 0) + 1);

    // Swap the early buffer for the real handler, then drain what was buffered.
    ws.off('message', earlyHandler);
    ws.on('message', (raw) => { void this.onMessage(client, raw.toString()); });
    ws.on('pong', () => { client.isAlive = true; });
    ws.on('close', () => this.onClose(client));
    ws.on('error', (err) => logger.warn('AnalyticsStream client error', { keyId: client.keyId, error: err.message }));

    this.send(client, { type: 'connected', tier, max_connections: max, ts: Date.now() });

    for (const buffered of earlyQueue) void this.onMessage(client, buffered);
  }

  // ── Inbound control messages ─────────────────────────────────────────────────

  private async onMessage(client: StreamClient, text: string): Promise<void> {
    // Simple per-connection control-message rate limit.
    const now = Date.now();
    client.controlTimestamps = client.controlTimestamps.filter((t) => now - t < CONTROL_RATE_WINDOW_MS);
    if (client.controlTimestamps.length >= CONTROL_RATE_MAX) {
      this.send(client, { type: 'error', message: 'Rate limit exceeded', ts: now });
      return;
    }
    client.controlTimestamps.push(now);

    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      this.send(client, { type: 'error', message: 'Invalid JSON', ts: now });
      return;
    }

    switch (msg?.action) {
      case 'ping':
        this.send(client, { type: 'pong', ts: now });
        return;
      case 'subscribe':
        await this.handleSubscribe(client, Array.isArray(msg.channels) ? msg.channels : []);
        return;
      case 'unsubscribe':
        this.handleUnsubscribe(client, Array.isArray(msg.channels) ? msg.channels : []);
        return;
      default:
        this.send(client, { type: 'error', message: `Unknown action: ${msg?.action}`, ts: now });
    }
  }

  private async handleSubscribe(client: StreamClient, channels: string[]): Promise<void> {
    const accepted: string[] = [];
    const rejected: { channel: string; reason: string }[] = [];

    for (const channel of channels) {
      if (typeof channel !== 'string' || !channel) {
        rejected.push({ channel: String(channel), reason: 'invalid channel' });
        continue;
      }
      if (client.channels.size >= MAX_CHANNELS_PER_CONN) {
        rejected.push({ channel, reason: 'subscription limit reached' });
        continue;
      }
      const product = productForChannel(channel);
      if (!product) {
        rejected.push({ channel, reason: 'unknown channel' });
        continue;
      }
      // Same per-product entitlement as REST.
      let entitled = false;
      try { entitled = await orgHasService(client.orgId, product); } catch { entitled = false; }
      if (!entitled) {
        rejected.push({ channel, reason: `subscription required (${product})` });
        continue;
      }
      this.indexSubscribe(client, channel);
      accepted.push(channel);
    }

    this.send(client, { type: 'subscribed', channels: accepted, rejected, ts: Date.now() });

    // Send the current value for each newly-accepted channel so a subscriber
    // gets real data immediately instead of waiting for the next push.
    for (const channel of accepted) {
      resolveSnapshot(channel)
        .then((data) => {
          if (data != null && client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
            this.send(client, { type: 'snapshot', channel, data, ts: Date.now() });
          }
        })
        .catch((err) => logger.warn('snapshot resolve failed', { channel, error: err?.message }));
    }
  }

  private handleUnsubscribe(client: StreamClient, channels: string[]): void {
    const removed: string[] = [];
    for (const channel of channels) {
      if (client.channels.has(channel)) {
        this.indexUnsubscribe(client, channel);
        removed.push(channel);
      }
    }
    this.send(client, { type: 'unsubscribed', channels: removed, ts: Date.now() });
  }

  private indexSubscribe(client: StreamClient, channel: string): void {
    client.channels.add(channel);
    let set = this.byChannel.get(channel);
    if (!set) { set = new Set(); this.byChannel.set(channel, set); }
    set.add(client);
  }

  private indexUnsubscribe(client: StreamClient, channel: string): void {
    client.channels.delete(channel);
    const set = this.byChannel.get(channel);
    if (set) { set.delete(client); if (set.size === 0) this.byChannel.delete(channel); }
  }

  private onClose(client: StreamClient): void {
    for (const channel of client.channels) this.indexUnsubscribe(client, channel);
    this.clients.delete(client);
    const n = (this.orgConns.get(client.orgId) ?? 1) - 1;
    if (n <= 0) this.orgConns.delete(client.orgId); else this.orgConns.set(client.orgId, n);
    // Meter the completed session (one DB write per connection close).
    const seconds = Math.max(0, (Date.now() - client.connectedAt) / 1000);
    void recordWsSession(client.keyId, client.messagesOut, seconds);
  }

  // ── Fan-out (in-process bus) ─────────────────────────────────────────────────

  private startBus(): void {
    this.busHandler = (env: StreamEnvelope) => this.fanOut(env);
    streamBus.on('publish', this.busHandler);
  }

  /** Deliver an envelope to every client subscribed to its channel. */
  private fanOut(env: StreamEnvelope): void {
    const set = this.byChannel.get(env.channel);
    if (!set || set.size === 0) return;
    const frame = JSON.stringify({
      type: env.event === 'snapshot' ? 'snapshot' : 'update',
      channel: env.channel,
      data: env.data,
      ts: env.ts,
    });
    for (const client of set) {
      if (client.ws.readyState === WebSocket.OPEN) client.ws.send(frame);
    }
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) { client.ws.terminate(); continue; }
        client.isAlive = false;
        try { client.ws.ping(); } catch { /* terminated next tick */ }
      }
    }, HEARTBEAT_MS);
  }

  private send(client: StreamClient, obj: unknown): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(obj));
      client.messagesOut++;
    }
  }

  /** Live connection count for one org (drives the console + connection cap). */
  activeConnectionsForOrg(orgId: string): number {
    return this.orgConns.get(orgId) ?? 0;
  }

  /** Global observability for platform health checks. */
  stats() {
    return {
      connections: this.clients.size,
      orgs: this.orgConns.size,
      channels: this.byChannel.size,
    };
  }

  async shutdown(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.busHandler) { streamBus.off('publish', this.busHandler); this.busHandler = null; }
    for (const client of this.clients) {
      try { client.ws.close(1001, 'Server shutting down'); } catch { /* noop */ }
    }
    this.clients.clear();
    this.byChannel.clear();
    this.orgConns.clear();
    this.wss?.close();
  }
}

export const analyticsStreamServer = new AnalyticsStreamServerImpl();
