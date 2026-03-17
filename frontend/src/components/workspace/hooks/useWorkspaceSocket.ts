'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WorkspaceMessage } from '@/lib/workspace-api';
import type { KobbyResponse } from './useKobbyAI';

/**
 * Compute WebSocket base URL lazily (not at module scope to avoid SSR issues).
 * In production, uses the explicit WS URL env var, or falls back to same-origin.
 * In dev, maps Next.js port 3000 → Express port 4000.
 */
const getWsBase = (): string => {
    if (typeof window === 'undefined') return '';

    // Explicit WebSocket URL takes highest priority (e.g. wss://api.propmetrik.com)
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (wsUrl) return wsUrl.replace(/\/$/, '');

    const hostname = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    // Dev: Next.js 3000 → Express 4000
    if (isLocal) {
        return `${protocol}://${hostname}:4000`;
    }

    // Production: WebSocket on same host (Traefik/reverse proxy routes /ws/*)
    return `${protocol}://${window.location.host}`;
};

type WSEvent =
    | { type: 'connected'; userId: string }
    | { type: 'joined'; workspaceId: string; messages: WorkspaceMessage[]; unreadCount: number; onlineUsers?: string[] }
    | { type: 'message'; payload: WorkspaceMessage }
    | { type: 'message_ack'; messageId: string }
    | { type: 'message_edited'; messageId: string; content: string; editedAt: string }
    | { type: 'typing'; userId: string; conversationId?: string }
    | { type: 'pong' }
    | { type: 'presence'; userId: string; status: 'online' | 'offline'; onlineUsers: string[] }
    | { type: 'kobby_thinking'; query: string }
    | { type: 'kobby_response'; query: string; response: KobbyResponse; conversationId?: string }
    | { type: 'kobby_error'; error: string }
    | { type: 'message_deleted'; messageId: string }
    | { type: 'error'; error: string };

interface UseWorkspaceSocketOptions {
    workspaceId: string;
    token: string | null;
    onMessage?: (msg: WorkspaceMessage) => void;
    onMessageEdited?: (messageId: string, content: string, editedAt: string) => void;
    onMessageDeleted?: (messageId: string) => void;
    onPresenceChange?: (onlineUsers: string[]) => void;
    onKobbyResponse?: (query: string, response: KobbyResponse, conversationId?: string) => void;
    onKobbyError?: (error: string) => void;
    onKobbyThinking?: (query: string) => void;
}

export function useWorkspaceSocket({
    workspaceId,
    token,
    onMessage,
    onMessageEdited,
    onMessageDeleted,
    onPresenceChange,
    onKobbyResponse,
    onKobbyError,
    onKobbyThinking,
}: UseWorkspaceSocketOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef(0);
    const pingRef = useRef<NodeJS.Timeout | null>(null);

    const [connected, setConnected] = useState(false);
    const [initialMessages, setInitialMessages] = useState<WorkspaceMessage[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [isKobbyThinking, setIsKobbyThinking] = useState(false);
    const [kobbyPendingQuery, setKobbyPendingQuery] = useState<string | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const connect = useCallback(() => {
        if (!workspaceId || !token) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const wsBase = getWsBase();
        const url = `${wsBase}/ws/workspace?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            setError(null);
            retryRef.current = 0;
            ws.send(JSON.stringify({ type: 'join', workspaceId }));
            pingRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 25000);
        };

        ws.onmessage = (event) => {
            try {
                const data: WSEvent = JSON.parse(event.data);
                switch (data.type) {
                    case 'joined':
                        setInitialMessages(data.messages);
                        setUnreadCount(data.unreadCount);
                        if (data.onlineUsers) {
                            setOnlineUsers(data.onlineUsers);
                            onPresenceChange?.(data.onlineUsers);
                        }
                        break;
                    case 'message':
                        onMessage?.(data.payload);
                        break;
                    case 'message_edited':
                        onMessageEdited?.(data.messageId, data.content, data.editedAt);
                        break;
                    case 'message_deleted':
                        onMessageDeleted?.(data.messageId);
                        break;
                    case 'presence':
                        setOnlineUsers(data.onlineUsers);
                        onPresenceChange?.(data.onlineUsers);
                        break;
                    case 'typing':
                        setTypingUsers((prev) => {
                            const next = new Set(prev).add(data.userId);
                            setTimeout(() => {
                                setTypingUsers((p) => {
                                    const n = new Set(p);
                                    n.delete(data.userId);
                                    return n;
                                });
                            }, 3000);
                            return next;
                        });
                        break;
                    case 'kobby_thinking':
                        setIsKobbyThinking(true);
                        setKobbyPendingQuery(data.query);
                        onKobbyThinking?.(data.query);
                        break;
                    case 'kobby_response':
                        setIsKobbyThinking(false);
                        setKobbyPendingQuery(null);
                        onKobbyResponse?.(data.query, data.response, data.conversationId);
                        break;
                    case 'kobby_error':
                        setIsKobbyThinking(false);
                        setKobbyPendingQuery(null);
                        onKobbyError?.(data.error);
                        break;
                    case 'error':
                        setError(data.error);
                        break;
                }
            } catch {
                // ignore parse errors
            }
        };

        ws.onclose = () => {
            setConnected(false);
            if (pingRef.current) clearInterval(pingRef.current);
            const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
            retryRef.current++;
            setTimeout(connect, delay);
        };

        ws.onerror = () => {
            setError('WebSocket connection error');
        };
    }, [workspaceId, token, onMessage, onMessageEdited, onMessageDeleted, onPresenceChange, onKobbyResponse, onKobbyError, onKobbyThinking]);

    useEffect(() => {
        connect();
        return () => {
            if (pingRef.current) clearInterval(pingRef.current);
            wsRef.current?.close();
        };
    }, [connect]);

    const sendMessage = useCallback((content: string, conversationId?: string, threadId?: string, metadata?: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'message', content, conversationId, threadId, metadata }));
        }
    }, []);

    const sendTyping = useCallback((conversationId?: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'typing', conversationId }));
        }
    }, []);

    const markRead = useCallback((messageId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'mark_read', messageId }));
        }
    }, []);

    const editMessage = useCallback((messageId: string, content: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'edit_message', messageId, content }));
        }
    }, []);

    const deleteMessage = useCallback((messageId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'delete_message', messageId }));
        }
    }, []);

    const sendKobbyQuery = useCallback(
        (query: string, entityType: string, entityId: string, sessionId?: string, conversationId?: string) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        type: 'kobby_query',
                        content: query,
                        entityType,
                        entityId,
                        sessionId,
                        conversationId,
                    })
                );
            }
        },
        []
    );

    return {
        connected,
        initialMessages,
        unreadCount,
        typingUsers,
        isKobbyThinking,
        kobbyPendingQuery,
        onlineUsers,
        error,
        sendMessage,
        sendTyping,
        markRead,
        editMessage,
        deleteMessage,
        sendKobbyQuery,
    };
}
