/**
 * WorkspaceWebSocketServer
 *
 * Manages WebSocket connections for real-time workspace collaboration.
 * - JWT authentication on connection
 * - Channel membership validation
 * - Message persistence before broadcast
 * - Redis pub/sub for horizontal scaling
 * - Heartbeat / ping-pong system
 * - Per-client rate limiting
 * - Per-user connection limits
 * - Content sanitization
 * - Online presence tracking
 *
 * @module services/workspace/WorkspaceWebSocketServer
 */

import { WebSocket, WebSocketServer, RawData } from 'ws';
import { IncomingMessage, Server } from 'http';
import { URL } from 'url';
import config from '../../src/config';
import jwt from 'jsonwebtoken';
import { logger } from '../../src/utils/logger';
import { workspaceService } from './WorkspaceService';
import { kobbyAIService, EntityType as KobbyEntityType } from './KobbyAIService';
import { redisPubSub } from '../../src/database/redis';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_CONNECTIONS_PER_USER = 5;
const RATE_LIMIT_WINDOW_MS = 1_000; // 1 second
const RATE_LIMIT_MAX_MESSAGES = 10; // max 10 messages per window

// ============================================================================
// TYPES
// ============================================================================

interface AuthenticatedClient {
    ws: WebSocket;
    userId: string;
    organizationId: string;
    workspaceId: string;
    isAlive: boolean;
    // Rate limiting
    messageTimestamps: number[];
}

interface WSMessage {
    type: 'join' | 'message' | 'ping' | 'mark_read' | 'typing' | 'kobby_query' | 'edit_message';
    workspaceId?: string;
    content?: string;
    messageId?: string;
    threadId?: string;
    metadata?: Record<string, any>;
    // Kobby AI specific fields
    entityType?: string;
    entityId?: string;
    sessionId?: string;
}

// ============================================================================
// CONTENT SANITIZATION
// ============================================================================

/**
 * Sanitize message content to prevent XSS.
 * Escapes HTML entities while preserving whitespace and markdown-like formatting.
 */
function sanitizeContent(content: string): string {
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// ============================================================================
// SERVER
// ============================================================================

class WorkspaceWebSocketServerImpl {
    private wss: WebSocketServer | null = null;
    // Map of workspaceId -> Set of connected clients
    private channels: Map<string, Set<AuthenticatedClient>> = new Map();
    // Map of userId -> Set of clients (supports multiple connections per user)
    private userClients: Map<string, Set<AuthenticatedClient>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    // Redis subscriber (one persistent connection for all channels)
    private subscriber: ReturnType<typeof redisPubSub.duplicate> | null = null;
    // Track online user presence per workspace: workspaceId -> Set<userId>
    private presenceMap: Map<string, Set<string>> = new Map();

    /**
     * Attach the WebSocket server to an existing HTTP server.
     * Called from backend/src/index.ts after Express is set up.
     */
    attach(httpServer: Server): void {
        this.wss = new WebSocketServer({
            server: httpServer,
            path: '/ws/workspace',
        });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
        this.startHeartbeat();
        this.startRedisSubscriber();

        logger.info('WorkspaceWebSocketServer attached to HTTP server at /ws/workspace');
    }

    // --------------------------------------------------------------------------
    // Connection Handling
    // --------------------------------------------------------------------------

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        // Extract JWT from query string: ?token=...
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
            ws.close(4001, 'Missing authentication token');
            return;
        }

        let userId: string;
        let organizationId: string;

        try {
            const secret = config.jwt.secret;
            const decoded = jwt.verify(token, secret) as any;
            userId = decoded.id || decoded.sub;
            organizationId = decoded.organizationId || decoded.organization_id;

            if (!userId) throw new Error('Invalid token payload');
        } catch {
            ws.close(4001, 'Invalid or expired token');
            return;
        }

        // --- Per-user connection limit ---
        const existingConns = this.userClients.get(userId);
        if (existingConns && existingConns.size >= MAX_CONNECTIONS_PER_USER) {
            ws.close(4008, 'Too many connections');
            return;
        }

        // Client not yet assigned to a workspace — wait for "join" message
        const client: AuthenticatedClient = {
            ws,
            userId,
            organizationId,
            workspaceId: '',
            isAlive: true,
            messageTimestamps: [],
        };

        // Track user connections
        if (!this.userClients.has(userId)) {
            this.userClients.set(userId, new Set());
        }
        this.userClients.get(userId)!.add(client);

        ws.on('message', (data) => this.handleMessage(client, data));
        ws.on('pong', () => { client.isAlive = true; });
        ws.on('close', () => this.handleDisconnect(client));
        ws.on('error', (err) => logger.error('WS client error', { userId, error: err.message }));

        this.send(ws, { type: 'connected', userId });
    }

    private async handleMessage(client: AuthenticatedClient, raw: RawData): Promise<void> {
        let msg: WSMessage;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            this.send(client.ws, { type: 'error', error: 'Invalid JSON' });
            return;
        }

        switch (msg.type) {
            case 'join':
                await this.handleJoin(client, msg.workspaceId!);
                break;
            case 'message':
                await this.handleSendMessage(client, msg);
                break;
            case 'ping':
                this.send(client.ws, { type: 'pong' });
                break;
            case 'mark_read':
                if (msg.messageId) {
                    await workspaceService.markRead(msg.messageId, client.userId);
                }
                break;
            case 'typing':
                // Broadcast typing indicator to other members
                if (client.workspaceId) {
                    this.broadcastToWorkspace(client.workspaceId, {
                        type: 'typing',
                        userId: client.userId,
                    }, client.userId);
                }
                break;
            case 'kobby_query':
                await this.handleKobbyQuery(client, msg);
                break;
            case 'edit_message':
                await this.handleEditMessage(client, msg);
                break;
            default:
                this.send(client.ws, { type: 'error', error: `Unknown message type: ${msg.type}` });
        }
    }

    private async handleJoin(client: AuthenticatedClient, workspaceId: string): Promise<void> {
        // --- Validate workspace belongs to the same organization ---
        const workspace = await workspaceService.getById(workspaceId, client.organizationId);
        if (!workspace) {
            this.send(client.ws, { type: 'error', error: 'Workspace not found or access denied' });
            return;
        }

        // Validate membership
        const isMember = await workspaceService.isMember(workspaceId, client.userId);
        if (!isMember) {
            // Auto-add as member only if workspace belongs to user's org (validated above)
            await workspaceService.addMember(workspaceId, client.userId, 'member');
        }

        // Remove from previous workspace channel if any
        if (client.workspaceId && client.workspaceId !== workspaceId) {
            this.removeFromChannel(client.workspaceId, client);
            this.removePresence(client.workspaceId, client.userId);
        }

        // Add to new channel
        client.workspaceId = workspaceId;
        if (!this.channels.has(workspaceId)) {
            this.channels.set(workspaceId, new Set());
        }
        this.channels.get(workspaceId)!.add(client);

        // --- Presence tracking ---
        this.addPresence(workspaceId, client.userId);

        // Send acknowledgment + last 50 messages
        const { messages } = await workspaceService.getMessages(workspaceId, undefined, 50);
        const unreadCount = await workspaceService.getUnreadCount(workspaceId, client.userId);
        const onlineUsers = Array.from(this.presenceMap.get(workspaceId) || []);

        this.send(client.ws, {
            type: 'joined',
            workspaceId,
            messages,
            unreadCount,
            onlineUsers,
        });

        // Subscribe to Redis channel for this workspace (if not already)
        this.subscribeToWorkspace(workspaceId);

        logger.debug(`User ${client.userId} joined workspace ${workspaceId}`);
    }

    private async handleSendMessage(client: AuthenticatedClient, msg: WSMessage): Promise<void> {
        if (!client.workspaceId) {
            this.send(client.ws, { type: 'error', error: 'Not joined to a workspace' });
            return;
        }

        if (!msg.content?.trim()) {
            this.send(client.ws, { type: 'error', error: 'Empty message content' });
            return;
        }

        // --- Rate limiting (sliding window) ---
        const now = Date.now();
        client.messageTimestamps = client.messageTimestamps.filter(
            (t) => now - t < RATE_LIMIT_WINDOW_MS
        );
        if (client.messageTimestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
            this.send(client.ws, { type: 'error', error: 'Rate limit exceeded. Please slow down.' });
            return;
        }
        client.messageTimestamps.push(now);

        // --- Message length check ---
        if (msg.content.length > MAX_MESSAGE_LENGTH) {
            this.send(client.ws, {
                type: 'error',
                error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`,
            });
            return;
        }

        const canWrite = await workspaceService.canWrite(client.workspaceId, client.userId);
        if (!canWrite) {
            this.send(client.ws, { type: 'error', error: 'Insufficient permissions to send messages' });
            return;
        }

        // --- Sanitize content before persist ---
        const sanitized = sanitizeContent(msg.content.trim());

        // Persist message (also publishes to Redis)
        const message = await workspaceService.persistMessage({
            workspaceId: client.workspaceId,
            senderId: client.userId,
            senderType: 'user',
            messageType: 'text',
            content: sanitized,
            metadata: msg.metadata,
            threadId: msg.threadId,
        });

        // Acknowledge to sender
        this.send(client.ws, { type: 'message_ack', messageId: message.id });
    }

    private async handleKobbyQuery(client: AuthenticatedClient, msg: WSMessage): Promise<void> {
        if (!client.workspaceId) {
            this.send(client.ws, { type: 'error', error: 'Not joined to a workspace' });
            return;
        }

        const query = msg.content?.trim();
        const entityType = msg.entityType as KobbyEntityType;
        const entityId = msg.entityId;

        if (!query) {
            this.send(client.ws, { type: 'error', error: 'Query content is required for kobby_query' });
            return;
        }

        if (!entityType || !entityId) {
            this.send(client.ws, { type: 'error', error: 'entityType and entityId are required for kobby_query' });
            return;
        }

        const validTypes: KobbyEntityType[] = ['project', 'valuation', 'deal', 'property', 'platform'];
        if (!validTypes.includes(entityType)) {
            this.send(client.ws, { type: 'kobby_error', error: 'Invalid entity type' });
            return;
        }

        // Notify the requesting client that Kobby is thinking
        this.send(client.ws, { type: 'kobby_thinking', query });

        try {
            // Build context from live entity data + recent chat
            const context = await kobbyAIService.buildContext(
                entityType,
                entityId,
                client.workspaceId
            );

            // Query Kobby AI
            const response = await kobbyAIService.query(
                query,
                context,
                msg.sessionId
            );

            // Persist AI response as a workspace message (broadcasts via Redis pub/sub)
            await workspaceService.persistMessage({
                workspaceId: client.workspaceId,
                senderId: null,
                senderType: 'kobby_ai',
                messageType: 'ai_response',
                content: response.answer,
                metadata: {
                    query,
                    confidence: response.confidence,
                    sources: response.sources,
                    followUpSuggestions: response.followUpSuggestions,
                    dataPoints: response.dataPoints,
                    entityType,
                    entityId,
                },
            });

            // Also send direct response to requesting client
            this.send(client.ws, {
                type: 'kobby_response',
                query,
                response,
            });

            logger.debug(`Kobby AI responded to workspace ${client.workspaceId}`);
        } catch (err) {
            logger.error('Kobby AI query failed', { error: (err as Error).message, workspaceId: client.workspaceId });
            this.send(client.ws, {
                type: 'kobby_error',
                error: 'Kobby AI is temporarily unavailable. Please try again in a moment.',
            });
        }
    }

    private handleDisconnect(client: AuthenticatedClient): void {
        if (client.workspaceId) {
            this.removeFromChannel(client.workspaceId, client);
            this.removePresence(client.workspaceId, client.userId);
        }
        // Remove from userClients set
        const conns = this.userClients.get(client.userId);
        if (conns) {
            conns.delete(client);
            if (conns.size === 0) {
                this.userClients.delete(client.userId);
            }
        }
        logger.debug(`User ${client.userId} disconnected from workspace`);
    }

    // --------------------------------------------------------------------------
    // Channel Management
    // --------------------------------------------------------------------------

    private removeFromChannel(workspaceId: string, client: AuthenticatedClient): void {
        const channel = this.channels.get(workspaceId);
        if (channel) {
            channel.delete(client);
            if (channel.size === 0) {
                this.channels.delete(workspaceId);
            }
        }
    }

    /**
     * Broadcast a message to all connected clients in a workspace.
     */
    broadcastToWorkspace(workspaceId: string, payload: any, excludeUserId?: string): void {
        const channel = this.channels.get(workspaceId);
        if (!channel) return;

        const data = JSON.stringify(payload);
        for (const client of channel) {
            if (excludeUserId && client.userId === excludeUserId) continue;
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(data);
            }
        }
    }

    /**
     * Send a message to all connected clients of a specific user.
     */
    sendToUser(userId: string, payload: any): void {
        const clients = this.userClients.get(userId);
        if (!clients) return;
        for (const client of clients) {
            if (client.ws.readyState === WebSocket.OPEN) {
                this.send(client.ws, payload);
            }
        }
    }

    // --------------------------------------------------------------------------
    // Redis Pub/Sub Integration
    // --------------------------------------------------------------------------

    private subscribedWorkspaces = new Set<string>();

    private subscribeToWorkspace(workspaceId: string): void {
        if (this.subscribedWorkspaces.has(workspaceId)) return;
        if (!this.subscriber) return;

        const channel = `workspace:${workspaceId}`;
        this.subscriber.subscribe(channel);
        this.subscribedWorkspaces.add(workspaceId);
    }

    private startRedisSubscriber(): void {
        try {
            this.subscriber = redisPubSub.duplicate();
        } catch (err) {
            logger.error('Failed to create Redis subscriber for workspace WS', { error: (err as Error).message });
            return;
        }

        this.subscriber.on('message', (channel: string, message: string) => {
            try {
                const workspaceId = channel.replace('workspace:', '');
                const payload = JSON.parse(message);
                // Broadcast to all local WS clients in this workspace
                this.broadcastToWorkspace(workspaceId, { type: 'message', payload: payload.payload });
            } catch (err) {
                logger.error('Failed to parse Redis workspace message', { error: (err as Error).message });
            }
        });

        this.subscriber.on('error', (err: Error) => {
            logger.error('Redis workspace subscriber error', { error: err.message });
        });

        this.subscriber.on('close', () => {
            logger.warn('Redis workspace subscriber connection closed — will reconnect automatically via ioredis');
        });
    }

    // --------------------------------------------------------------------------
    // Heartbeat
    // --------------------------------------------------------------------------

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            for (const clients of this.channels.values()) {
                for (const client of clients) {
                    if (!client.isAlive) {
                        client.ws.terminate();
                        continue;
                    }
                    client.isAlive = false;
                    client.ws.ping();
                }
            }
        }, 30000); // 30 second ping interval
    }

    // --------------------------------------------------------------------------
    // Message Editing
    // --------------------------------------------------------------------------

    private async handleEditMessage(client: AuthenticatedClient, msg: WSMessage): Promise<void> {
        if (!client.workspaceId) {
            this.send(client.ws, { type: 'error', error: 'Not joined to a workspace' });
            return;
        }
        if (!msg.messageId || !msg.content?.trim()) {
            this.send(client.ws, { type: 'error', error: 'messageId and content are required' });
            return;
        }
        if (msg.content.length > MAX_MESSAGE_LENGTH) {
            this.send(client.ws, {
                type: 'error',
                error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`,
            });
            return;
        }

        const sanitized = sanitizeContent(msg.content.trim());

        const updated = await workspaceService.editMessage(
            msg.messageId,
            client.userId,
            sanitized
        );

        if (!updated) {
            this.send(client.ws, { type: 'error', error: 'Message not found or you are not the author' });
            return;
        }

        // Broadcast edited message to all workspace members
        this.broadcastToWorkspace(client.workspaceId, {
            type: 'message_edited',
            messageId: msg.messageId,
            content: sanitized,
            editedAt: updated.edited_at,
        });
    }

    // --------------------------------------------------------------------------
    // Presence Tracking
    // --------------------------------------------------------------------------

    private addPresence(workspaceId: string, userId: string): void {
        if (!this.presenceMap.has(workspaceId)) {
            this.presenceMap.set(workspaceId, new Set());
        }
        const wasPresent = this.presenceMap.get(workspaceId)!.has(userId);
        this.presenceMap.get(workspaceId)!.add(userId);

        if (!wasPresent) {
            this.broadcastToWorkspace(workspaceId, {
                type: 'presence',
                userId,
                status: 'online',
                onlineUsers: Array.from(this.presenceMap.get(workspaceId)!),
            });
        }
    }

    private removePresence(workspaceId: string, userId: string): void {
        const set = this.presenceMap.get(workspaceId);
        if (!set) return;

        // Only remove presence if user has no other connections in this workspace
        const channel = this.channels.get(workspaceId);
        const remainingInChannel = channel
            ? Array.from(channel).some((c) => c.userId === userId)
            : false;

        if (!remainingInChannel) {
            set.delete(userId);
            if (set.size === 0) {
                this.presenceMap.delete(workspaceId);
            }

            this.broadcastToWorkspace(workspaceId, {
                type: 'presence',
                userId,
                status: 'offline',
                onlineUsers: Array.from(set),
            });
        }
    }

    // --------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------

    private send(ws: WebSocket, payload: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }

    getStats(): { totalConnections: number; activeWorkspaces: number } {
        let totalConnections = 0;
        for (const clients of this.channels.values()) {
            totalConnections += clients.size;
        }
        return {
            totalConnections,
            activeWorkspaces: this.channels.size,
        };
    }
}

export const workspaceWebSocketServer = new WorkspaceWebSocketServerImpl();
