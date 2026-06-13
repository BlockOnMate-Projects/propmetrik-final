'use client';

/**
 * CRM AI Assistant Panel
 *
 * A floating or inline panel that lets users chat with Kobby AI
 * about their CRM data — pipeline, deals, contacts, agents.
 *
 * Uses the new /api/v1/crm/ai endpoints (Gemini primary, rule-based fallback).
 */

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { cn } from '@/lib/utils';
import {
    Bot, Send, X, Sparkles, ChevronDown, ChevronUp,
    TrendingUp, AlertTriangle, CheckCircle, Loader2, Zap,
} from 'lucide-react';
import { aiApi, type CrmAIResponse, type CrmAISuggestionCategory } from '@/lib/crm-api';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    response?: CrmAIResponse;
    timestamp: Date;
}

// ─────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────

function ConfidencePill({ confidence }: { confidence: number }) {
    const pct = Math.round(confidence * 100);
    const color =
        pct >= 80
            ? 'bg-success/20 text-success border-success/40'
            : pct >= 60
                ? 'bg-warning/20 text-warning border-warning/40'
                : 'bg-destructive/20 text-destructive border-destructive/40';
    return (
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium', color)}>
            <Zap className="w-2.5 h-2.5" /> {pct}%
        </span>
    );
}

function DataPointRow({ metric, value }: { metric: string; value: string }) {
    return (
        <div className="flex justify-between items-center py-1 px-2 rounded bg-muted/40 text-xs">
            <span className="text-muted-foreground">{metric}</span>
            <span className="font-mono text-foreground">{value}</span>
        </div>
    );
}

const AIMsgBubble = memo(function AIMsgBubble({
    msg,
    onFollowUp,
}: {
    msg: Message;
    onFollowUp: (q: string) => void;
}) {
    const [showData, setShowData] = useState(false);

    if (msg.role === 'user') {
        return (
            <div className="flex justify-end mb-2">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary/50 border border-primary/30 text-sm text-primary-foreground">
                    {msg.content}
                </div>
            </div>
        );
    }

    const r = msg.response;
    return (
        <div className="flex gap-2 mb-3 items-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
                {r && <ConfidencePill confidence={r.confidence} />}
                <div className="mt-1 rounded-2xl rounded-tl-sm px-3 py-2.5 bg-primary/10 border border-primary/30 text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {r?.answer || msg.content}
                </div>

                {/* Data points */}
                {r?.data_points && r.data_points.length > 0 && (
                    <div className="mt-1.5">
                        <button
                            onClick={() => setShowData(!showData)}
                            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
                        >
                            {showData ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {r.data_points.length} data point{r.data_points.length !== 1 ? 's' : ''}
                        </button>
                        {showData && (
                            <div className="mt-1 space-y-0.5">
                                {r.data_points.map((dp, i) => (
                                    <DataPointRow key={i} metric={dp.metric} value={dp.value} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Follow-up suggestions */}
                {r?.suggestions && r.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {r.suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => onFollowUp(s)}
                                className="px-2 py-1 rounded-full bg-muted/60 border border-border/40 text-[10px] text-muted-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

// ─────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────

interface CrmAIAssistantProps {
    /** Show as a panel instead of floating overlay */
    inline?: boolean;
    /** Optional entity context */
    entityType?: string;
    entityId?: string;
    className?: string;
}

export function CrmAIAssistant({ inline, entityType, entityId, className }: CrmAIAssistantProps) {
    const [open, setOpen] = useState(inline ?? false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const [suggestionCategories, setSuggestionCategories] = useState<CrmAISuggestionCategory[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Fetch suggestion categories on mount
    useEffect(() => {
        aiApi.getSuggestions().then(data => setSuggestionCategories(data.categories)).catch(() => { });
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, thinking]);

    const handleSend = useCallback(
        async (query: string) => {
            if (!query.trim() || thinking) return;

            const userMsg: Message = {
                id: `u-${Date.now()}`,
                role: 'user',
                content: query.trim(),
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setInput('');
            setThinking(true);

            try {
                const response = await aiApi.ask(query.trim(), entityType, entityId);
                const aiMsg: Message = {
                    id: `a-${Date.now()}`,
                    role: 'assistant',
                    content: response.answer,
                    response,
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, aiMsg]);
            } catch {
                const errMsg: Message = {
                    id: `e-${Date.now()}`,
                    role: 'assistant',
                    content: 'Sorry, I couldn\'t process that query. Please try again.',
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, errMsg]);
            } finally {
                setThinking(false);
            }
        },
        [thinking, entityType, entityId],
    );

    // ─── Floating Bubble (when not inline) ───
    if (!inline && !open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className={cn(
                    'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full',
                    'bg-gradient-to-br from-primary to-primary/80 shadow-xl shadow-primary/30',
                    'flex items-center justify-center group transition-transform hover:scale-105',
                    className,
                )}
            >
                <Sparkles className="w-6 h-6 text-foreground group-hover:animate-pulse" />
            </button>
        );
    }

    const showWelcome = messages.length === 0;

    const panel = (
        <div
            className={cn(
                'flex flex-col bg-background/95 backdrop-blur-xl border border-border text-foreground',
                inline
                    ? 'rounded-xl h-full'
                    : 'fixed bottom-6 right-6 z-50 w-[400px] h-[560px] rounded-2xl shadow-2xl shadow-black/40',
                className,
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold">Kobby AI</p>
                        <p className="text-[10px] text-muted-foreground">CRM Intelligence</p>
                    </div>
                </div>
                {!inline && (
                    <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
                {showWelcome && (
                    <div className="text-center py-6">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mb-3">
                            <Sparkles className="w-6 h-6 text-foreground" />
                        </div>
                        <p className="text-sm font-medium">Ask me anything about your CRM</p>
                        <p className="text-xs text-muted-foreground mt-1">Pipeline, deals, contacts, performance — I have the data.</p>

                        {/* Suggestions grid */}
                        {suggestionCategories.length > 0 && (
                            <div className="mt-4 text-left space-y-3">
                                {suggestionCategories.map(cat => (
                                    <div key={cat.label}>
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{cat.label}</p>
                                        <div className="flex flex-wrap gap-1">
                                            {cat.prompts.slice(0, 2).map((p, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleSend(p)}
                                                    className="px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40 text-xs text-muted-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors text-left"
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {messages.map(msg => (
                    <AIMsgBubble key={msg.id} msg={msg} onFollowUp={handleSend} />
                ))}

                {thinking && (
                    <div className="flex gap-2 items-center text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Analyzing CRM data…</span>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="px-3 py-2.5 border-t border-border">
                <div className="flex items-center gap-2 bg-muted/60 rounded-xl px-3 py-2 border border-border/40 focus-within:border-primary/50">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                        placeholder="Ask about your pipeline, deals, contacts…"
                        className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none"
                        disabled={thinking}
                    />
                    <button
                        onClick={() => handleSend(input)}
                        disabled={!input.trim() || thinking}
                        className="p-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    >
                        <Send className="w-3.5 h-3.5 text-foreground" />
                    </button>
                </div>
            </div>
        </div>
    );

    return panel;
}

// ─────────────────────────────────────────────────────
// Deal Score Card (reusable in deal detail)
// ─────────────────────────────────────────────────────

interface DealScoreCardProps {
    dealId: string;
    className?: string;
}

export function DealScoreCard({ dealId, className }: DealScoreCardProps) {
    const [score, setScore] = useState<{
        score: number;
        health: 'healthy' | 'at_risk' | 'critical';
        factors: Array<{ factor: string; weight: number; score: number; detail: string }>;
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        aiApi.getDealScore(dealId)
            .then(setScore)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [dealId]);

    if (loading) return <div className={cn('animate-pulse bg-muted/40 rounded-xl h-20', className)} />;
    if (!score) return null;

    const healthConfig = {
        healthy: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Healthy' },
        at_risk: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'At Risk' },
        critical: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Critical' },
    };
    const cfg = healthConfig[score.health];
    const Icon = cfg.icon;

    return (
        <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">AI Deal Score</span>
                </div>
                <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                </div>
            </div>

            {/* Score circle */}
            <div className="flex items-center gap-4 mb-3">
                <div className="relative w-14 h-14">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                        <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke={score.score >= 70 ? '#10b981' : score.score >= 40 ? '#f59e0b' : '#ef4444'}
                            strokeWidth="3"
                            strokeDasharray={`${score.score}, 100`}
                            strokeLinecap="round"
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-foreground">{score.score}</span>
                </div>
                <div className="flex-1 space-y-1">
                    {score.factors.map(f => (
                        <div key={f.factor} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-24 truncate">{f.factor}</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={cn('h-full rounded-full', f.score >= 70 ? 'bg-success' : f.score >= 40 ? 'bg-warning' : 'bg-destructive')}
                                    style={{ width: `${f.score}%` }}
                                />
                            </div>
                            <span className="text-muted-foreground w-8 text-right">{f.score}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────
// Next Actions Widget
// ─────────────────────────────────────────────────────

interface NextActionsWidgetProps {
    dealId: string;
    className?: string;
}

export function NextActionsWidget({ dealId, className }: NextActionsWidgetProps) {
    const [actions, setActions] = useState<Array<{ type: string; priority: string; title: string; description: string }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        aiApi.getNextActions(dealId)
            .then(data => setActions(data.actions))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [dealId]);

    if (loading) return <div className={cn('animate-pulse bg-muted/40 rounded-xl h-16', className)} />;
    if (actions.length === 0) return null;

    const priorityStyles: Record<string, string> = {
        high: 'border-l-destructive bg-destructive/5',
        medium: 'border-l-warning bg-warning/5',
        low: 'border-l-muted-foreground bg-muted',
    };

    return (
        <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Suggested Actions</span>
                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{actions.length}</span>
            </div>
            <div className="space-y-2">
                {actions.map((action, i) => (
                    <div key={i} className={cn('border-l-2 rounded-r-lg px-3 py-2', priorityStyles[action.priority] || priorityStyles.low)}>
                        <p className="text-xs font-medium text-foreground">{action.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{action.description}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default CrmAIAssistant;
