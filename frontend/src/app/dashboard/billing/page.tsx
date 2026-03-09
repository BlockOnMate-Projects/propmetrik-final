'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { authedFetch } from '@/lib/authed-fetch';

// ============================================================
// Types
// ============================================================

interface Subscription {
    id: string;
    organization_id?: string;
    user_id?: string;
    plan_id: string;
    status: string;
    billing_interval: string;
    current_period_start: string;
    current_period_end: string;
    trial_ends_at?: string;
    cancelled_at?: string;
    cancel_reason?: string;
    payment_provider?: string;
    quantity: number;
    plan?: Plan;
    addons?: Addon[];
}

interface Plan {
    id: string;
    slug: string;
    name: string;
    description?: string;
    category: string;
    tier: string;
    segment: string;
    price_monthly_ghs: number;
    price_annual_ghs?: number;
    max_users?: number;
    features: string[];
    cta_text: string;
    is_featured: boolean;
}

interface Addon {
    id: string;
    plan_id: string;
    quantity: number;
    status: string;
    plan?: Plan;
}

interface UsageMetric {
    metric: string;
    used: number;
    limit_value?: number;
    percentage_used?: number;
    period_start: string;
    period_end: string;
}

interface Module {
    module_slug: string;
    access_level: string;
    usage_limit?: number;
}

interface Invoice {
    id: string;
    invoice_number: string;
    status: string;
    total: number;
    currency: string;
    due_date: string;
    paid_at?: string;
    billing_period_start?: string;
    billing_period_end?: string;
    created_at: string;
}

interface HistoryEvent {
    id: string;
    event_type: string;
    from_plan_name?: string;
    to_plan_name?: string;
    from_status?: string;
    to_status?: string;
    actor_email?: string;
    created_at: string;
}

// ============================================================
// API Helpers
// ============================================================

const API = '/api/subscriptions';

async function fetchJSON<T>(url: string): Promise<T | null> {
    try {
        const res = await authedFetch(url);
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

// ============================================================
// Sub-components
// ============================================================

type TabId = 'overview' | 'usage' | 'invoices' | 'history';

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    trialing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    past_due: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
    expired: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    suspended: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    none: 'bg-zinc-800 text-zinc-500 border-zinc-700',
};

const INVOICE_COLORS: Record<string, string> = {
    paid: 'text-green-400',
    pending: 'text-yellow-400',
    overdue: 'text-red-400',
    draft: 'text-zinc-500',
    cancelled: 'text-zinc-600',
};

const EVENT_LABELS: Record<string, string> = {
    created: 'Subscription Created',
    activated: 'Subscription Activated',
    trial_started: 'Trial Started',
    trial_ended: 'Trial Ended',
    upgraded: 'Plan Upgraded',
    downgraded: 'Plan Downgraded',
    cancelled: 'Subscription Cancelled',
    reactivated: 'Subscription Reactivated',
    payment_succeeded: 'Payment Received',
    payment_failed: 'Payment Failed',
    renewed: 'Subscription Renewed',
    addon_added: 'Add-on Added',
    addon_removed: 'Add-on Removed',
};

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysRemaining(end: string) {
    const diff = new Date(end).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
}

// ============================================================
// Main Page Component
// ============================================================

export default function BillingPage() {
    const [tab, setTab] = useState<TabId>('overview');
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<UsageMetric[]>([]);
    const [modules, setModules] = useState<Module[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [history, setHistory] = useState<HistoryEvent[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    // Fetch subscription data
    const loadData = useCallback(async () => {
        setLoading(true);
        const [subData, invoiceData, historyData, plansData] = await Promise.all([
            fetchJSON<{ subscription: Subscription; usage: UsageMetric[]; modules: Module[] }>(`${API}/subscription`),
            fetchJSON<{ invoices: Invoice[]; total: number }>(`${API}/invoices`),
            fetchJSON<{ events: HistoryEvent[] }>(`${API}/subscription/history`),
            fetchJSON<{ plans: Plan[] }>(`${API}/plans`),
        ]);

        if (subData) {
            setSubscription(subData.subscription);
            setUsage(subData.usage || []);
            setModules(subData.modules || []);
        }
        if (invoiceData) setInvoices(invoiceData.invoices || []);
        if (historyData) setHistory(historyData.events || []);
        if (plansData) setPlans(plansData.plans || []);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Actions
    const handleCancel = async () => {
        if (!subscription) return;
        setActionLoading(true);
        try {
            await authedFetch(`${API}/subscription`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: cancelReason, immediate: false }),
            });
            setShowCancelModal(false);
            setCancelReason('');
            await loadData();
        } finally {
            setActionLoading(false);
        }
    };

    const handleReactivate = async () => {
        setActionLoading(true);
        try {
            await authedFetch(`${API}/subscription/reactivate`, { method: 'POST' });
            await loadData();
        } finally {
            setActionLoading(false);
        }
    };

    const handleChangePlan = async (planSlug: string) => {
        setActionLoading(true);
        try {
            await authedFetch(`${API}/subscription/change-plan`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan_slug: planSlug }),
            });
            setShowUpgradeModal(false);
            await loadData();
        } finally {
            setActionLoading(false);
        }
    };

    const handleRemoveAddon = async (addonId: string) => {
        setActionLoading(true);
        try {
            await authedFetch(`${API}/subscription/addons/${addonId}`, { method: 'DELETE' });
            await loadData();
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-pulse text-zinc-500 font-mono">Loading billing...</div>
            </div>
        );
    }

    const plan = subscription?.plan;
    const statusColor = STATUS_COLORS[subscription?.status || 'none'] || STATUS_COLORS.none;
    const daysLeft = subscription ? daysRemaining(subscription.current_period_end) : 0;
    const trialDaysLeft = subscription?.trial_ends_at ? daysRemaining(subscription.trial_ends_at) : 0;

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold font-mono">Billing & Subscription</h1>
                        <p className="text-zinc-500 text-sm mt-1">Manage your plan, usage, and invoices</p>
                    </div>
                    {!subscription && (
                        <Link
                            href="/pricing"
                            className="bg-amber-500 text-black px-5 py-2.5 rounded-xl font-mono font-bold text-sm hover:bg-amber-400 transition-colors"
                        >
                            Choose a Plan
                        </Link>
                    )}
                </div>

                {/* Current Plan Summary */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-xl font-bold font-mono">
                                    {plan ? plan.name : 'No Active Plan'}
                                </h2>
                                <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                                    {subscription?.status?.toUpperCase() || 'NONE'}
                                </span>
                            </div>
                            {plan && (
                                <p className="text-zinc-500 text-sm">
                                    {plan.category.replace(/_/g, ' ')} • {plan.tier} tier • {subscription?.billing_interval} billing
                                </p>
                            )}
                            {subscription?.status === 'trialing' && trialDaysLeft > 0 && (
                                <p className="text-blue-400 text-xs mt-1 font-mono">
                                    Trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} ({formatDate(subscription.trial_ends_at)})
                                </p>
                            )}
                            {subscription?.cancelled_at && (
                                <p className="text-red-400 text-xs mt-1 font-mono">
                                    Cancels at end of period ({formatDate(subscription.current_period_end)})
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {plan && (
                                <div className="text-right">
                                    <p className="text-2xl font-bold font-mono text-amber-500">
                                        GHS {subscription?.billing_interval === 'annual'
                                            ? ((plan.price_annual_ghs || plan.price_monthly_ghs * 12) / 12).toLocaleString()
                                            : plan.price_monthly_ghs.toLocaleString()}
                                    </p>
                                    <p className="text-zinc-600 text-xs">/month • {daysLeft} days remaining</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick actions */}
                    {subscription && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-zinc-800">
                            {subscription.status !== 'cancelled' && (
                                <>
                                    <button
                                        onClick={() => setShowUpgradeModal(true)}
                                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-mono transition-colors"
                                    >
                                        Change Plan
                                    </button>
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="px-4 py-2 bg-zinc-800 hover:bg-red-900/30 text-zinc-400 hover:text-red-400 rounded-lg text-sm font-mono transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </>
                            )}
                            {subscription.status === 'cancelled' && (
                                <button
                                    onClick={handleReactivate}
                                    disabled={actionLoading}
                                    className="px-4 py-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-lg text-sm font-mono transition-colors"
                                >
                                    {actionLoading ? 'Reactivating...' : 'Reactivate'}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Tab navigation */}
                <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 w-fit">
                    {([
                        { id: 'overview' as TabId, label: 'Overview' },
                        { id: 'usage' as TabId, label: 'Usage' },
                        { id: 'invoices' as TabId, label: 'Invoices' },
                        { id: 'history' as TabId, label: 'History' },
                    ]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${
                                tab === t.id
                                    ? 'bg-zinc-800 text-white'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    {tab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-6"
                        >
                            {/* Active Modules */}
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                <h3 className="text-sm font-mono font-bold text-zinc-400 mb-4">ACTIVE MODULES</h3>
                                {modules.length === 0 ? (
                                    <p className="text-zinc-600 text-sm">No modules active. Subscribe to a plan to unlock features.</p>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {modules.map(mod => (
                                            <div key={mod.module_slug} className="bg-zinc-800 rounded-lg p-3">
                                                <p className="text-sm font-mono text-white capitalize">
                                                    {mod.module_slug.replace(/_/g, ' ')}
                                                </p>
                                                <p className="text-xs text-zinc-500 mt-0.5">{mod.access_level} access</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Add-ons */}
                            {subscription?.addons && subscription.addons.length > 0 && (
                                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                    <h3 className="text-sm font-mono font-bold text-zinc-400 mb-4">ADD-ONS</h3>
                                    <div className="space-y-2">
                                        {subscription.addons.map(addon => (
                                            <div key={addon.id} className="flex items-center justify-between bg-zinc-800 rounded-lg p-3">
                                                <div>
                                                    <p className="text-sm font-mono text-white">{addon.plan?.name || 'Add-on'}</p>
                                                    <p className="text-xs text-zinc-500">{addon.plan?.category?.replace(/_/g, ' ')}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-amber-500 font-mono text-sm">
                                                        GHS {addon.plan?.price_monthly_ghs?.toLocaleString()}
                                                    </span>
                                                    <button
                                                        onClick={() => handleRemoveAddon(addon.id)}
                                                        className="text-zinc-600 hover:text-red-400 text-xs font-mono transition-colors"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Plan features */}
                            {plan && (
                                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                    <h3 className="text-sm font-mono font-bold text-zinc-400 mb-4">PLAN FEATURES</h3>
                                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {plan.features.map((f, i) => (
                                            <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                                                <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {tab === 'usage' && (
                        <motion.div
                            key="usage"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                <h3 className="text-sm font-mono font-bold text-zinc-400 mb-4">USAGE THIS PERIOD</h3>
                                {usage.length === 0 ? (
                                    <p className="text-zinc-600 text-sm">No usage limits to track for your current plan.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {usage.map(u => (
                                            <div key={u.metric}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-sm font-mono text-zinc-300 capitalize">
                                                        {u.metric.replace(/_/g, ' ')}
                                                    </span>
                                                    <span className="text-xs font-mono text-zinc-500">
                                                        {u.used.toLocaleString()} / {u.limit_value?.toLocaleString() || '∞'}
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${
                                                            (u.percentage_used || 0) > 90
                                                                ? 'bg-red-500'
                                                                : (u.percentage_used || 0) > 70
                                                                ? 'bg-yellow-500'
                                                                : 'bg-amber-500'
                                                        }`}
                                                        style={{ width: `${Math.min(100, u.percentage_used || 0)}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                                                    Period: {formatDate(u.period_start)} → {formatDate(u.period_end)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {tab === 'invoices' && (
                        <motion.div
                            key="invoices"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-zinc-800 text-zinc-500 font-mono text-xs">
                                            <th className="text-left py-3 px-4">Invoice #</th>
                                            <th className="text-left py-3 px-4">Period</th>
                                            <th className="text-right py-3 px-4">Amount</th>
                                            <th className="text-center py-3 px-4">Status</th>
                                            <th className="text-right py-3 px-4">Due</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="text-center py-8 text-zinc-600">
                                                    No invoices yet
                                                </td>
                                            </tr>
                                        ) : (
                                            invoices.map(inv => (
                                                <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                                    <td className="py-3 px-4 font-mono text-zinc-300">{inv.invoice_number}</td>
                                                    <td className="py-3 px-4 text-zinc-500">
                                                        {formatDate(inv.billing_period_start)} — {formatDate(inv.billing_period_end)}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono text-white">
                                                        {inv.currency} {inv.total.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`font-mono text-xs ${INVOICE_COLORS[inv.status] || 'text-zinc-500'}`}>
                                                            {inv.status.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                                                        {inv.paid_at ? `Paid ${formatDate(inv.paid_at)}` : formatDate(inv.due_date)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}

                    {tab === 'history' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                <h3 className="text-sm font-mono font-bold text-zinc-400 mb-4">SUBSCRIPTION HISTORY</h3>
                                {history.length === 0 ? (
                                    <p className="text-zinc-600 text-sm">No events to display.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {history.map(evt => (
                                            <div key={evt.id} className="flex items-start gap-3 border-l-2 border-zinc-800 pl-4 py-2">
                                                <div className="flex-1">
                                                    <p className="text-sm font-mono text-zinc-300">
                                                        {EVENT_LABELS[evt.event_type] || evt.event_type}
                                                    </p>
                                                    {(evt.from_plan_name || evt.to_plan_name) && (
                                                        <p className="text-xs text-zinc-500 mt-0.5">
                                                            {evt.from_plan_name && `From: ${evt.from_plan_name}`}
                                                            {evt.from_plan_name && evt.to_plan_name && ' → '}
                                                            {evt.to_plan_name && `To: ${evt.to_plan_name}`}
                                                        </p>
                                                    )}
                                                    {evt.actor_email && (
                                                        <p className="text-[10px] text-zinc-600 mt-0.5">by {evt.actor_email}</p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-zinc-600 font-mono whitespace-nowrap">
                                                    {formatDate(evt.created_at)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Cancel Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-bold font-mono mb-2">Cancel Subscription</h3>
                        <p className="text-zinc-400 text-sm mb-4">
                            Your subscription will remain active until the end of the current billing period
                            ({formatDate(subscription?.current_period_end)}).
                        </p>
                        <textarea
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                            placeholder="Reason for cancelling (optional)"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white placeholder-zinc-600 mb-4 resize-none h-20"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                className="flex-1 px-4 py-2 bg-zinc-800 rounded-lg text-sm font-mono hover:bg-zinc-700 transition-colors"
                            >
                                Keep Plan
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={actionLoading}
                                className="flex-1 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm font-mono hover:bg-red-500/20 transition-colors"
                            >
                                {actionLoading ? 'Cancelling...' : 'Cancel Subscription'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upgrade/Change Plan Modal */}
            {showUpgradeModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold font-mono">Change Plan</h3>
                            <button
                                onClick={() => setShowUpgradeModal(false)}
                                className="text-zinc-500 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            {plans
                                .filter(p => p.is_active !== false && p.slug !== plan?.slug)
                                .slice(0, 8)
                                .map(p => (
                                    <button
                                        key={p.slug}
                                        onClick={() => handleChangePlan(p.slug)}
                                        disabled={actionLoading}
                                        className="bg-zinc-800 border border-zinc-700 hover:border-amber-500/30 rounded-xl p-4 text-left transition-all"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-mono font-bold text-sm">{p.name}</span>
                                            <span className="text-amber-500 font-mono text-sm">
                                                GHS {p.price_monthly_ghs.toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-zinc-500 text-xs capitalize">
                                            {p.category.replace(/_/g, ' ')} • {p.tier}
                                        </p>
                                    </button>
                                ))}
                        </div>
                        <p className="text-zinc-600 text-xs mt-4 text-center">
                            <Link href="/pricing" className="text-amber-500 hover:underline">View all plans →</Link>
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
