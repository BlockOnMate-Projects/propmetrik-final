'use client';

import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Bot, ChevronDown, ChevronUp, ExternalLink, Zap } from 'lucide-react';
import type { KobbyResponse } from './hooks/useKobbyAI';

// ============================================================================
// KOBBY AI BUBBLE
// Renders a full Kobby AI response with data points, sources, and follow-ups
// ============================================================================

interface KobbyAIBubbleProps {
    query?: string;
    response: KobbyResponse;
    timestamp?: string;
    onFollowUp?: (suggestion: string) => void;
}

function formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ConfidencePill({ confidence }: { confidence: number }) {
    const pct = Math.round(confidence * 100);
    const color =
        pct >= 80 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-700/40'
            : pct >= 60 ? 'bg-amber-500/20 text-amber-300 border-amber-700/40'
                : 'bg-red-500/20 text-red-300 border-red-700/40';

    return (
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', color)}>
            <Zap className="w-2.5 h-2.5" />
            {pct}% confidence
        </span>
    );
}

export const KobbyAIBubble = memo(function KobbyAIBubble({
    query,
    response,
    timestamp,
    onFollowUp,
}: KobbyAIBubbleProps) {
    const [showDataPoints, setShowDataPoints] = useState(false);
    const [showSources, setShowSources] = useState(false);

    return (
        <div className="flex gap-3 mb-4 items-start group">
            {/* Kobby Avatar */}
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 ring-1 ring-violet-400/20">
                <Bot className="w-4 h-4 text-white" />
            </div>

            <div className="flex-1 min-w-0 max-w-[90%]">
                {/* Header */}
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-violet-300">Kobby AI</span>
                    <ConfidencePill confidence={response.confidence} />
                </div>

                {/* Original query (if provided) */}
                {query && (
                    <div className="mb-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-xs text-zinc-400 italic">
                        "{query}"
                    </div>
                )}

                {/* Main answer — render as markdown-safe HTML via white-space: pre-wrap */}
                <div className="rounded-2xl rounded-tl-sm px-4 py-3.5 bg-violet-950/40 border border-violet-800/30 text-zinc-100 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {response.answer}
                </div>

                {/* Data Points (collapsible) */}
                {response.dataPoints && response.dataPoints.length > 0 && (
                    <div className="mt-2">
                        <button
                            onClick={() => setShowDataPoints((p) => !p)}
                            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                        >
                            {showDataPoints ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {response.dataPoints.length} data point{response.dataPoints.length !== 1 ? 's' : ''}
                        </button>
                        {showDataPoints && (
                            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                {response.dataPoints.map((dp, i) => (
                                    <div key={i} className="px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800/60">
                                        <p className="text-xs text-zinc-400 font-medium truncate">{dp.metric}</p>
                                        <p className="text-sm text-zinc-100 font-semibold mt-0.5 truncate">
                                            {typeof dp.value === 'number' ? dp.value.toLocaleString() : String(dp.value)}
                                        </p>
                                        {dp.source && <p className="text-xs text-zinc-600 mt-0.5 truncate">{dp.source}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Sources (collapsible) */}
                {response.sources && response.sources.length > 0 && (
                    <div className="mt-2">
                        <button
                            onClick={() => setShowSources((p) => !p)}
                            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {response.sources.length} source{response.sources.length !== 1 ? 's' : ''}
                        </button>
                        {showSources && (
                            <div className="mt-1.5 space-y-1">
                                {response.sources.map((src, i) => (
                                    <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-500">
                                        <ExternalLink className="w-3 h-3 flex-shrink-0 text-violet-500" />
                                        <span className="truncate">{src}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Follow-up suggestions */}
                {response.followUpSuggestions && response.followUpSuggestions.length > 0 && onFollowUp && (
                    <div className="mt-3">
                        <p className="text-xs text-zinc-500 mb-1.5">Ask me next →</p>
                        <div className="flex flex-wrap gap-1.5">
                            {response.followUpSuggestions.slice(0, 3).map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => onFollowUp(s)}
                                    className={cn(
                                        'px-2.5 py-1.5 rounded-lg text-xs',
                                        'bg-violet-950/60 border border-violet-800/40 text-violet-300',
                                        'hover:bg-violet-900/50 hover:text-violet-100 hover:border-violet-700/60',
                                        'transition-all duration-150 text-left'
                                    )}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Timestamp */}
                {timestamp && (
                    <p className="text-xs text-zinc-600 mt-1.5 ml-1">{formatTime(timestamp)}</p>
                )}
            </div>
        </div>
    );
});

// ============================================================================
// KOBBY THINKING INDICATOR
// Shown while Kobby is processing a query
// ============================================================================

export function KobbyThinkingIndicator({ query }: { query?: string }) {
    return (
        <div className="flex gap-3 mb-4 items-start">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 ring-1 ring-violet-400/20 animate-pulse">
                <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-violet-300">Kobby AI</span>
                    <span className="text-xs text-zinc-500 animate-pulse">thinking...</span>
                </div>
                {query && (
                    <div className="mb-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-xs text-zinc-400 italic">
                        "{query}"
                    </div>
                )}
                <div className="rounded-2xl rounded-tl-sm px-4 py-3.5 bg-violet-950/40 border border-violet-800/30">
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
                        </div>
                        <span className="text-xs text-violet-400">Analyzing entity data...</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// KOBBY SUGGESTION CHIPS
// Shown at the top of an empty/new workspace to prompt users
// ============================================================================

interface KobbySuggestionsProps {
    suggestions: string[];
    onSelect: (s: string) => void;
}

export function KobbySuggestionChips({ suggestions, onSelect }: KobbySuggestionsProps) {
    if (suggestions.length === 0) return null;

    return (
        <div className="px-4 py-3 border-b border-zinc-800/60">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs font-medium text-zinc-400">Ask Kobby AI</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 4).map((s, i) => (
                    <button
                        key={i}
                        onClick={() => onSelect(`@kobby ${s}`)}
                        className={cn(
                            'px-2.5 py-1.5 rounded-lg text-xs text-left',
                            'bg-violet-950/40 border border-violet-800/30 text-violet-300',
                            'hover:bg-violet-900/50 hover:text-violet-100 hover:border-violet-700/50',
                            'transition-all duration-150'
                        )}
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
    );
}
