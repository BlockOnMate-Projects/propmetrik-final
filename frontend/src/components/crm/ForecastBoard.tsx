'use client';

/**
 * Forecast Board — Salesforce-style forecast categories + quota attainment.
 *
 * Categories (Commit / Best Case / Pipeline / Closed) come from
 * /crm/analytics/forecast-categories; per-rep quota vs actual from
 * /crm/analytics/quota-attainment. Both are live (derived from real deals),
 * no stored snapshots.
 */

import { useEffect, useState } from 'react';
import { Target, TrendingUp, CircleDot, Lock, CheckCircle2, Trophy } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils';

const n = (v: unknown): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(x) ? x : 0;
};

interface Category { category: string; deal_count: number; amount: number; weighted: number; }
interface QuotaRow {
    id: string; agent_name: string; quota: number; attained: number;
    attainment_pct: number; gap: number; target_period?: string;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; accent: string; hint: string }> = {
    commit: { label: 'Commit', icon: <Lock className="w-4 h-4" />, accent: 'text-blue-500', hint: 'High confidence' },
    best_case: { label: 'Best Case', icon: <TrendingUp className="w-4 h-4" />, accent: 'text-amber-500', hint: 'Upside' },
    pipeline: { label: 'Pipeline', icon: <CircleDot className="w-4 h-4" />, accent: 'text-muted-foreground', hint: 'Early stage' },
    closed: { label: 'Closed Won', icon: <CheckCircle2 className="w-4 h-4" />, accent: 'text-success', hint: 'Booked YTD' },
};

export function ForecastBoard({ className }: { className?: string }) {
    const [cats, setCats] = useState<Category[]>([]);
    const [committed, setCommitted] = useState(0);
    const [bestCase, setBestCase] = useState(0);
    const [quota, setQuota] = useState<QuotaRow[]>([]);
    const [quotaTotal, setQuotaTotal] = useState<{ attained: number; quota: number; pct: number }>({ attained: 0, quota: 0, pct: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [fc, qa] = await Promise.all([
                    authedFetch('/api/crm/analytics/forecast-categories', { credentials: 'include' }),
                    authedFetch('/api/crm/analytics/quota-attainment', { credentials: 'include' }),
                ]);
                if (fc.ok) {
                    const d = await fc.json();
                    if (!cancelled) {
                        setCats(d.categories || []);
                        setCommitted(n(d.committed));
                        setBestCase(n(d.best_case_total));
                    }
                }
                if (qa.ok) {
                    const d = await qa.json();
                    if (!cancelled) {
                        setQuota(d.rows || []);
                        setQuotaTotal({ attained: n(d.total_attained), quota: n(d.total_quota), pct: n(d.total_pct) });
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full" />
            </div>
        );
    }

    return (
        <div className={className}>
            {/* Committed / best-case headline */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-2 text-primary mb-1">
                        <Lock className="w-4 h-4" />
                        <span className="text-sm font-medium">Committed forecast</span>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(committed)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Closed Won + Commit</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-amber-500 mb-1">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-sm font-medium">Best case</span>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(bestCase)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Committed + Best Case pipeline</p>
                </div>
            </div>

            {/* Category columns */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {cats.map((c) => {
                    const meta = CATEGORY_META[c.category] || { label: c.category, icon: null, accent: 'text-muted-foreground', hint: '' };
                    return (
                        <div key={c.category} className="rounded-xl border border-border bg-card p-4">
                            <div className={`flex items-center gap-1.5 ${meta.accent} mb-2`}>
                                {meta.icon}
                                <span className="text-sm font-medium">{meta.label}</span>
                            </div>
                            <p className="text-lg font-bold">{formatCurrency(c.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                                {c.deal_count} deal{c.deal_count !== 1 ? 's' : ''}
                                {c.category !== 'closed' && <> · weighted {formatCurrencyCompact(c.weighted)}</>}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* Quota attainment */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-medium">Quota Attainment</h3>
                    </div>
                    {quotaTotal.quota > 0 && (
                        <span className="text-xs text-muted-foreground">
                            Team {formatCurrencyCompact(quotaTotal.attained)} / {formatCurrencyCompact(quotaTotal.quota)}
                            {' '}({Math.round(quotaTotal.pct)}%)
                        </span>
                    )}
                </div>
                {quota.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No revenue quotas set. Create sales targets to track attainment here.
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {quota.map((r) => {
                            const pct = Math.min(r.attainment_pct, 100);
                            const hit = r.attainment_pct >= 100;
                            return (
                                <div key={r.id} className="px-4 py-3 flex items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                            {hit && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                                            {r.agent_name}
                                        </p>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5 max-w-[220px]">
                                            <div
                                                className={`h-full rounded-full ${hit ? 'bg-success' : r.attainment_pct >= 60 ? 'bg-primary' : 'bg-amber-500'}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-medium">{formatCurrency(r.attained)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            of {formatCurrency(r.quota)} · {Math.round(r.attainment_pct)}%
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
