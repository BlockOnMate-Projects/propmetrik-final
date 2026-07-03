'use client';

/**
 * Enhanced Revenue Forecasting
 *
 * Weighted pipeline projection with probability-adjusted values,
 * monthly forecast chart, best/worst/expected scenarios, and stage breakdown.
 */

import { useState, useEffect, useMemo } from 'react';
import { cn, formatCurrency, formatCurrencyCompact } from '@/lib/utils';

// pg NUMERIC / API money comes back as strings or may be absent — coerce safely.
const n = (v: unknown): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(x) ? x : 0;
};
import {
    TrendingUp, TrendingDown, DollarSign, Target,
    BarChart3, ArrowUpRight, ArrowDownRight, Minus,
    Calendar, Layers,
} from 'lucide-react';
import { analyticsApi, dealsApi, pipelinesApi } from '@/lib/crm-api';

// ─── Types ──────────────────────────────────────────

// Raw shape from GET /crm/analytics/revenue-forecast → by_stage[]
interface StageValue {
    stage_name: string;
    value: number | string;
    probability: number | string;
    deal_count?: number | string;
}

interface ForecastRow {
    stage_name: string;
    deal_count: number;
    total_value: number;
    probability: number;
    weighted_value: number;
}

interface ScenarioData {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string;
}

interface RevenueForecasterProps {
    className?: string;
}

// ─── Component ──────────────────────────────────────

export function RevenueForecaster({ className }: RevenueForecasterProps) {
    const [forecast, setForecast] = useState<{
        current_month: number;
        next_month: number;
        quarter: number;
        by_stage: StageValue[];
    } | null>(null);
    const [trend, setTrend] = useState<{
        data: Array<{ period: string; period_label: string; won_value: number; new_pipeline: number; won_count: number }>;
        total_won: number;
        avg_monthly_won: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState<'month' | 'quarter' | 'year'>('quarter');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [forecastRes, trendRes] = await Promise.all([
                    analyticsApi.getRevenueForecast(),
                    analyticsApi.getRevenueTrend(12),
                ]);
                if (!cancelled) {
                    setForecast(forecastRes as any);
                    setTrend(trendRes as any);
                }
            } catch (err) {
                console.error('Forecast fetch error:', err);
            }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    // Compute weighted projections from forecast data
    const stageRows = useMemo<ForecastRow[]>(() => {
        if (!forecast?.by_stage) return [];
        return forecast.by_stage.map(s => {
            const total_value = n(s.value);
            const probability = n(s.probability);
            return {
                stage_name: s.stage_name,
                deal_count: n(s.deal_count),
                total_value,
                probability,
                weighted_value: total_value * (probability / 100),
            };
        }).sort((a, b) => b.weighted_value - a.weighted_value);
    }, [forecast]);

    const totalWeighted = useMemo(() =>
        stageRows.reduce((sum, r) => sum + r.weighted_value, 0), [stageRows]);
    const totalPipeline = useMemo(() =>
        stageRows.reduce((sum, r) => sum + r.total_value, 0), [stageRows]);
    const totalDeals = useMemo(() =>
        stageRows.reduce((sum, r) => sum + r.deal_count, 0), [stageRows]);

    // Scenario band derived from each stage's REAL close probability (not a flat multiplier):
    //   expected = Σ value·p  (linear, the honest weighted number)
    //   best     = Σ value·√p (optimistic — credits lower-probability deals more)
    //   worst    = Σ value·p² (conservative — discounts them harder)
    // A p=100% deal counts fully in all three; uncertainty only widens the band for open deals.
    const scenarios: ScenarioData[] = useMemo(() => {
        const clamp = (p: number) => Math.min(1, Math.max(0, p / 100));
        const best = stageRows.reduce((s, r) => s + r.total_value * Math.sqrt(clamp(r.probability)), 0);
        const worst = stageRows.reduce((s, r) => s + r.total_value * Math.pow(clamp(r.probability), 2), 0);
        return [
            { label: 'Best Case', value: best, icon: <TrendingUp className="w-4 h-4" />, color: 'text-success' },
            { label: 'Expected', value: totalWeighted, icon: <Minus className="w-4 h-4" />, color: 'text-primary' },
            { label: 'Worst Case', value: worst, icon: <TrendingDown className="w-4 h-4" />, color: 'text-destructive' },
        ];
    }, [stageRows, totalWeighted]);

    // Monthly trend bars
    const trendData = useMemo(() => {
        if (!trend?.data) return [];
        return trend.data.slice(-6).map(d => ({
            label: d.period_label,
            won: d.won_value || 0,
            pipeline: d.new_pipeline || 0,
        }));
    }, [trend]);

    const maxTrend = useMemo(() =>
        Math.max(1, ...trendData.map(d => Math.max(d.won, d.pipeline))), [trendData]);

    // Timeframe value
    const forecastValue = useMemo(() => {
        if (!forecast) return 0;
        switch (timeframe) {
            case 'month': return forecast.current_month || totalWeighted;
            case 'quarter': return forecast.quarter || totalWeighted * 3;
            case 'year': return (forecast.quarter || totalWeighted * 3) * 4;
        }
    }, [forecast, timeframe, totalWeighted]);

    // Monthly average
    const monthlyAvg = trend?.avg_monthly_won || 0;
    const momChange = useMemo(() => {
        if (!trendData.length || trendData.length < 2) return 0;
        const prev = trendData[trendData.length - 2].won;
        const curr = trendData[trendData.length - 1].won;
        if (prev === 0) return 0;
        return ((curr - prev) / prev) * 100;
    }, [trendData]);

    if (loading) {
        return (
            <div className={cn('flex items-center justify-center py-12', className)}>
                <div className="animate-spin w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full" />
            </div>
        );
    }

    return (
        <div className={cn('space-y-6', className)}>
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">Revenue Forecast</h2>
                </div>
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                    {(['month', 'quarter', 'year'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={cn(
                                'px-3 py-1 text-xs rounded-md capitalize transition-colors',
                                timeframe === t
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard
                    label="Weighted Forecast"
                    value={formatCurrency(forecastValue)}
                    sub={`${timeframe} projection`}
                    icon={<DollarSign className="w-4 h-4" />}
                    accent="primary"
                />
                <KPICard
                    label="Total Pipeline"
                    value={formatCurrency(totalPipeline)}
                    sub={`${stageRows.length} stage${stageRows.length !== 1 ? 's' : ''}`}
                    icon={<Target className="w-4 h-4" />}
                    accent="info"
                />
                <KPICard
                    label="Monthly Avg"
                    value={formatCurrency(monthlyAvg)}
                    sub={momChange !== 0 ? (
                        <span className={cn('flex items-center gap-0.5', momChange > 0 ? 'text-success' : 'text-destructive')}>
                            {momChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(momChange).toFixed(1)}% MoM
                        </span>
                    ) : 'No change'}
                    icon={<Calendar className="w-4 h-4" />}
                    accent="success"
                />
                <KPICard
                    label="Avg Probability"
                    value={totalPipeline > 0 ? `${Math.round(stageRows.reduce((s, r) => s + r.probability * r.total_value, 0) / totalPipeline)}%` : '0%'}
                    sub="Value-weighted"
                    icon={<Layers className="w-4 h-4" />}
                    accent="warning"
                />
            </div>

            {/* Scenarios */}
            <div className="grid grid-cols-3 gap-3">
                {scenarios.map(s => (
                    <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
                        <div className={cn('flex items-center justify-center gap-1.5 mb-1', s.color)}>
                            {s.icon}
                            <span className="text-xs font-medium">{s.label}</span>
                        </div>
                        <p className="text-lg font-bold">{formatCurrency(s.value)}</p>
                    </div>
                ))}
            </div>

            {/* Revenue Trend */}
            {trendData.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium">Revenue Trend (Last 6 Months)</h3>
                        <span className="text-[10px] text-muted-foreground">peak {formatCurrencyCompact(maxTrend)}</span>
                    </div>
                    <div className="flex items-end gap-2 h-40">
                        {trendData.map((d, i) => {
                            // Floor non-zero bars to a visible minimum so one outlier month can't
                            // squash every other month to an invisible sliver.
                            const barH = (v: number) => (v <= 0 ? 0 : Math.max(6, (v / maxTrend) * 100));
                            const top = Math.max(d.won, d.pipeline);
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[9px] text-muted-foreground h-3 leading-3">
                                        {top > 0 ? formatCurrencyCompact(top) : ''}
                                    </span>
                                    <div className="w-full flex gap-0.5 items-end" style={{ height: '110px' }}>
                                        <div
                                            className="flex-1 bg-primary/30 rounded-t"
                                            style={{ height: `${barH(d.pipeline)}%` }}
                                            title={`Pipeline: ${formatCurrency(d.pipeline)}`}
                                        />
                                        <div
                                            className="flex-1 bg-success rounded-t"
                                            style={{ height: `${barH(d.won)}%` }}
                                            title={`Won: ${formatCurrency(d.won)}`}
                                        />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">{d.label}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-4 mt-3 justify-center">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="w-3 h-2 rounded bg-primary/30" /> Pipeline
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="w-3 h-2 rounded bg-success" /> Won
                        </div>
                    </div>
                </div>
            )}

            {/* Stage Breakdown */}
            {stageRows.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                        <h3 className="text-sm font-medium">Pipeline by Stage</h3>
                    </div>
                    <div className="divide-y divide-border">
                        {stageRows.map(row => (
                            <div key={row.stage_name} className="px-4 py-3 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{row.stage_name}</p>
                                    <p className="text-xs text-muted-foreground">{row.probability}% close probability</p>
                                </div>
                                <div className="w-24">
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full"
                                            style={{ width: `${row.probability}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{row.probability}%</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium">{formatCurrency(row.weighted_value)}</p>
                                    <p className="text-[10px] text-muted-foreground">of {formatCurrency(row.total_value)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between">
                        <span className="text-sm font-medium">Total Weighted</span>
                        <span className="text-sm font-bold text-primary">{formatCurrency(totalWeighted)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── KPI Card ───────────────────────────────────────

function KPICard({
    label,
    value,
    sub,
    icon,
    accent = 'primary',
}: {
    label: string;
    value: string;
    sub: React.ReactNode;
    icon: React.ReactNode;
    accent?: string;
}) {
    const accentMap: Record<string, string> = {
        primary: 'text-primary',
        success: 'text-success',
        warning: 'text-warning',
        info: 'text-info',
        destructive: 'text-destructive',
    };
    return (
        <div className="rounded-xl border border-border bg-card p-3.5">
            <div className={cn('flex items-center gap-1.5 mb-1', accentMap[accent] || 'text-primary')}>
                {icon}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-lg font-bold">{value}</p>
            <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
        </div>
    );
}

export default RevenueForecaster;
