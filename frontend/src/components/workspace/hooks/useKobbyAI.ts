'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { EntityType } from '@/lib/workspace-api';
import { getSession } from 'next-auth/react';
import { authedFetch } from '@/lib/authed-fetch';

const KOBBY_API_BASE = '/api/ai/kobby';

async function getAuthHeaders(): Promise<Record<string, string>> {
    if (typeof window === 'undefined') return {};
    const session = await getSession();
    const token = (session as any)?.accessToken as string | undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface KobbyResponse {
    answer: string;
    confidence: number;
    sources: string[];
    followUpSuggestions: string[];
    dataPoints: Array<{ metric: string; value: any; source?: string }>;
}

interface UseKobbyAIOptions {
    entityType: EntityType;
    entityId: string;
    workspaceId: string;
    /**
     * WS-based sender — called when we have a live WS connection (preferred path)
     */
    sendViaWS?: (msg: {
        type: 'kobby_query';
        content: string;
        entityType: string;
        entityId: string;
        sessionId?: string;
    }) => void;
}

export function useKobbyAI({ entityType, entityId, workspaceId, sendViaWS }: UseKobbyAIOptions) {
    const [isThinking, setIsThinking] = useState(false);
    const [lastResponse, setLastResponse] = useState<KobbyResponse | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const sessionIdRef = useRef(`kobby-${Date.now()}`);

    // Fetch suggestion prompts for this entity type
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const headers = await getAuthHeaders();
                const response = await authedFetch(`${KOBBY_API_BASE}/suggestions/${entityType}`, { headers });
                const data = await response.json();
                if (!cancelled) {
                    setSuggestions(data.suggestions || []);
                }
            } catch {
                // ignore suggestion fetch failures
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [entityType]);

    /**
     * Submit a query to Kobby AI.
     * Prefers WS path; falls back to REST if WS is unavailable.
     */
    const submitQuery = useCallback(
        async (query: string) => {
            if (!query.trim()) return;
            setIsThinking(true);
            setError(null);

            // WS path (preferred for real-time response broadcasting to all members)
            if (sendViaWS) {
                sendViaWS({
                    type: 'kobby_query',
                    content: query,
                    entityType,
                    entityId,
                    sessionId: sessionIdRef.current,
                });
                // isThinking will be cleared when we receive kobby_response from WS
                return;
            }

            // REST fallback
            try {
                const authHeaders = await getAuthHeaders();
                const res = await authedFetch(`${KOBBY_API_BASE}/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                    body: JSON.stringify({
                        workspaceId,
                        query,
                        entityType,
                        entityId,
                        sessionId: sessionIdRef.current,
                    }),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Kobby AI request failed');
                }

                const data = await res.json();
                setLastResponse(data.response);
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setIsThinking(false);
            }
        },
        [entityType, entityId, workspaceId, sendViaWS]
    );

    /**
     * Called when a kobby_response WS event arrives (from useWorkspaceSocket).
     * Clears the thinking state and stores the response.
     */
    const onWSResponse = useCallback((response: KobbyResponse) => {
        setLastResponse(response);
        setIsThinking(false);
        setError(null);
    }, []);

    /**
     * Called when a kobby_error WS event arrives.
     */
    const onWSError = useCallback((errorMsg: string) => {
        setError(errorMsg);
        setIsThinking(false);
    }, []);

    return {
        isThinking,
        lastResponse,
        suggestions,
        error,
        submitQuery,
        onWSResponse,
        onWSError,
    };
}
